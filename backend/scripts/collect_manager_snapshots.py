#!/usr/bin/env python
"""
Collect Manager GW Snapshots and Picks data from FPL API.

This script populates the manager_gw_snapshot and manager_pick tables
which are required for the Head-to-Head comparison feature.

Usage:
    python -m scripts.collect_manager_snapshots                    # Run collection for league 979420
    python -m scripts.collect_manager_snapshots --league 123456    # Run for specific league
    python -m scripts.collect_manager_snapshots --manager 2724410  # Run for single manager
    python -m scripts.collect_manager_snapshots --status           # Show collection status
    python -m scripts.collect_manager_snapshots --reset            # Clear and re-collect
"""

import argparse
import asyncio
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import asyncpg
import httpx
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.fpl_client import FplApiClient

# Configuration constants
DEFAULT_LEAGUE_ID = 979420  # Tapas and Tackles league
MAX_FAILURE_RATE = 0.10  # Abort if >10% of requests fail
RATE_LIMIT_DELAY = 0.3  # 0.3s between requests = ~3.3 req/s

# Load environment
load_dotenv(".env.local")
load_dotenv(".env")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@dataclass
class ManagerGwHistory:
    """Manager's gameweek history data from FPL API."""

    gameweek: int
    points: int
    total_points: int
    rank: int | None
    rank_sort: int | None
    overall_rank: int | None
    bank: int
    value: int
    event_transfers: int
    event_transfers_cost: int
    points_on_bench: int


@dataclass
class ManagerPick:
    """Manager's pick data from FPL API."""

    element: int  # player_id
    position: int
    multiplier: int
    is_captain: bool
    is_vice_captain: bool


async def get_connection() -> asyncpg.Connection:
    """Get database connection from environment."""
    db_url = os.getenv(
        "DATABASE_URL", "postgresql://tapas:localdev@localhost:5432/tapas_fpl"
    )
    return await asyncpg.connect(db_url)


async def get_or_create_season(conn: asyncpg.Connection) -> int:
    """Get the current season ID, creating it if needed."""
    # Use is_current flag, not just latest ID
    row = await conn.fetchrow("SELECT id FROM season WHERE is_current = true LIMIT 1")
    if row:
        return row["id"]

    # Fallback: get latest by ID if no current flag set
    row = await conn.fetchrow("SELECT id FROM season ORDER BY id DESC LIMIT 1")
    if row:
        return row["id"]

    # Create a new season (2025-26)
    row = await conn.fetchrow(
        """
        INSERT INTO season (code, name, start_date, is_current)
        VALUES ('2025-26', 'Season 2025/26', '2025-08-15', true)
        RETURNING id
        """
    )
    return row["id"]


async def ensure_manager_exists(
    conn: asyncpg.Connection,
    manager_id: int,
    season_id: int,
    manager_info: dict[str, Any],
) -> None:
    """Ensure manager record exists in database with full info."""
    await conn.execute(
        """
        INSERT INTO manager (
            id, season_id, name, player_first_name, player_last_name,
            player_region_name, player_region_iso_code, favourite_team,
            started_event, summary_overall_points, summary_overall_rank,
            last_deadline_bank, last_deadline_value, last_deadline_total_transfers
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (id, season_id) DO UPDATE SET
            name = EXCLUDED.name,
            player_first_name = EXCLUDED.player_first_name,
            player_last_name = EXCLUDED.player_last_name,
            player_region_name = EXCLUDED.player_region_name,
            player_region_iso_code = EXCLUDED.player_region_iso_code,
            favourite_team = EXCLUDED.favourite_team,
            started_event = EXCLUDED.started_event,
            summary_overall_points = EXCLUDED.summary_overall_points,
            summary_overall_rank = EXCLUDED.summary_overall_rank,
            last_deadline_bank = EXCLUDED.last_deadline_bank,
            last_deadline_value = EXCLUDED.last_deadline_value,
            last_deadline_total_transfers = EXCLUDED.last_deadline_total_transfers,
            updated_at = NOW()
        """,
        manager_id,
        season_id,
        manager_info.get("team_name", f"Team {manager_id}"),
        manager_info.get("player_first_name", ""),
        manager_info.get("player_last_name", ""),
        manager_info.get("player_region_name"),
        manager_info.get("player_region_iso_code"),
        manager_info.get("favourite_team"),
        manager_info.get("started_event", 1),
        manager_info.get("summary_overall_points", 0),
        manager_info.get("summary_overall_rank"),
        manager_info.get("last_deadline_bank", 0),
        manager_info.get("last_deadline_value", 0),
        manager_info.get("last_deadline_total_transfers", 0),
    )


async def ensure_gameweek_exists(
    conn: asyncpg.Connection, gameweek: int, season_id: int
) -> None:
    """Ensure gameweek record exists in database."""
    await conn.execute(
        """
        INSERT INTO gameweek (id, season_id, name, deadline_time)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (id, season_id) DO NOTHING
        """,
        gameweek,
        season_id,
        f"Gameweek {gameweek}",
    )


async def sync_gameweeks_from_bootstrap(
    conn: asyncpg.Connection,
    http_client: httpx.AsyncClient,
    season_id: int,
) -> int:
    """
    Sync gameweek data from FPL bootstrap API.

    Only syncs FINISHED gameweeks to avoid storing unreliable future data
    (deadline times and stats can change for upcoming gameweeks).

    Returns:
        Number of gameweeks synced
    """
    url = "https://fantasy.premierleague.com/api/bootstrap-static/"
    response = await http_client.get(url)
    response.raise_for_status()
    data = response.json()

    events = data.get("events", [])
    synced = 0

    for event in events:
        # Only sync finished gameweeks - future GW data is unreliable
        if not event.get("finished", False):
            continue
        gw_id = event.get("id")
        if not gw_id:
            continue

        # Parse deadline time
        deadline_str = event.get("deadline_time")
        deadline_time = None
        if deadline_str:
            deadline_time = datetime.fromisoformat(deadline_str.replace("Z", "+00:00"))

        await conn.execute(
            """
            INSERT INTO gameweek (
                id, season_id, name, deadline_time, finished, data_checked,
                is_current, is_next, average_entry_score, highest_score,
                most_selected, most_transferred_in, most_captained,
                most_vice_captained, top_element
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (id, season_id) DO UPDATE SET
                name = EXCLUDED.name,
                deadline_time = EXCLUDED.deadline_time,
                finished = EXCLUDED.finished,
                data_checked = EXCLUDED.data_checked,
                is_current = EXCLUDED.is_current,
                is_next = EXCLUDED.is_next,
                average_entry_score = EXCLUDED.average_entry_score,
                highest_score = EXCLUDED.highest_score,
                most_selected = EXCLUDED.most_selected,
                most_transferred_in = EXCLUDED.most_transferred_in,
                most_captained = EXCLUDED.most_captained,
                most_vice_captained = EXCLUDED.most_vice_captained,
                top_element = EXCLUDED.top_element,
                updated_at = NOW()
            """,
            gw_id,
            season_id,
            event.get("name", f"Gameweek {gw_id}"),
            deadline_time,
            event.get("finished", False),
            event.get("data_checked", False),
            event.get("is_current", False),
            event.get("is_next", False),
            event.get("average_entry_score"),
            event.get("highest_score"),
            event.get("most_selected"),
            event.get("most_transferred_in"),
            event.get("most_captained"),
            event.get("most_vice_captained"),
            event.get("top_element"),
        )
        synced += 1

    logger.info(f"Synced {synced} finished gameweeks from bootstrap")
    return synced


async def fetch_manager_info(
    http_client: httpx.AsyncClient, manager_id: int
) -> dict[str, Any]:
    """
    Fetch manager info from FPL API.

    Returns:
        Dict with team_name, player details, region, started_event, etc.
    """
    url = f"https://fantasy.premierleague.com/api/entry/{manager_id}/"
    response = await http_client.get(url)
    response.raise_for_status()
    data = response.json()

    return {
        "team_name": data.get("name", f"Team {manager_id}"),
        "player_first_name": data.get("player_first_name", ""),
        "player_last_name": data.get("player_last_name", ""),
        "player_region_name": data.get("player_region_name"),
        "player_region_iso_code": data.get("player_region_iso_code_short"),
        "favourite_team": data.get("favourite_team"),
        "started_event": data.get("started_event", 1),
        "summary_overall_points": data.get("summary_overall_points", 0),
        "summary_overall_rank": data.get("summary_overall_rank"),
        "last_deadline_bank": data.get("last_deadline_bank", 0),
        "last_deadline_value": data.get("last_deadline_value", 0),
        "last_deadline_total_transfers": data.get("last_deadline_total_transfers", 0),
    }


async def fetch_manager_history(
    http_client: httpx.AsyncClient, manager_id: int
) -> tuple[list[ManagerGwHistory], dict[str, Any]]:
    """
    Fetch manager's full season history from FPL API.

    Returns:
        Tuple of (list of GW history, manager info dict)
    """
    url = f"https://fantasy.premierleague.com/api/entry/{manager_id}/history/"
    response = await http_client.get(url)
    response.raise_for_status()
    data = response.json()

    history = []
    for h in data.get("current", []):
        history.append(
            ManagerGwHistory(
                gameweek=h.get("event", 0),
                points=h.get("points", 0),
                total_points=h.get("total_points", 0),
                rank=h.get("rank"),
                rank_sort=h.get("rank_sort"),
                overall_rank=h.get("overall_rank"),
                bank=h.get("bank", 0),
                value=h.get("value", 0),
                event_transfers=h.get("event_transfers", 0),
                event_transfers_cost=h.get("event_transfers_cost", 0),
                points_on_bench=h.get("points_on_bench", 0),
            )
        )

    return history, data


async def fetch_manager_picks(
    http_client: httpx.AsyncClient, manager_id: int, gameweek: int
) -> tuple[list[ManagerPick], str | None]:
    """
    Fetch manager's picks for a specific gameweek.

    Returns:
        Tuple of (list of picks, chip_used or None)
    """
    url = f"https://fantasy.premierleague.com/api/entry/{manager_id}/event/{gameweek}/picks/"
    response = await http_client.get(url)
    response.raise_for_status()
    data = response.json()

    picks = []
    for p in data.get("picks", []):
        picks.append(
            ManagerPick(
                element=p.get("element", 0),
                position=p.get("position", 0),
                multiplier=p.get("multiplier", 1),
                is_captain=p.get("is_captain", False),
                is_vice_captain=p.get("is_vice_captain", False),
            )
        )

    # Get chip used if any
    chip_used = None
    active_chip = data.get("active_chip")
    if active_chip:
        chip_used = active_chip

    return picks, chip_used


async def save_snapshot_and_picks(
    conn: asyncpg.Connection,
    manager_id: int,
    season_id: int,
    gw: ManagerGwHistory,
    picks: list[ManagerPick],
    chip_used: str | None,
) -> int:
    """
    Save a single gameweek snapshot and its picks to database.

    Uses upsert pattern for idempotency. Delete+insert for picks is
    wrapped in a transaction to ensure atomicity.

    Returns:
        The snapshot_id
    """
    # Ensure gameweek exists
    await ensure_gameweek_exists(conn, gw.gameweek, season_id)

    # Upsert snapshot
    row = await conn.fetchrow(
        """
        INSERT INTO manager_gw_snapshot (
            manager_id, season_id, gameweek, points, total_points,
            points_on_bench, transfers_made, transfers_cost,
            bank, value, overall_rank, gameweek_rank, chip_used, formation
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (manager_id, season_id, gameweek) DO UPDATE SET
            points = EXCLUDED.points,
            total_points = EXCLUDED.total_points,
            points_on_bench = EXCLUDED.points_on_bench,
            transfers_made = EXCLUDED.transfers_made,
            transfers_cost = EXCLUDED.transfers_cost,
            bank = EXCLUDED.bank,
            value = EXCLUDED.value,
            overall_rank = EXCLUDED.overall_rank,
            gameweek_rank = EXCLUDED.gameweek_rank,
            chip_used = EXCLUDED.chip_used,
            formation = EXCLUDED.formation
        RETURNING id
        """,
        manager_id,
        season_id,
        gw.gameweek,
        gw.points,
        gw.total_points,
        gw.points_on_bench,
        gw.event_transfers,
        gw.event_transfers_cost,
        gw.bank,
        gw.value,
        gw.overall_rank,
        gw.rank,  # gameweek_rank
        chip_used,
        None,  # formation - not critical for H2H
    )

    if row is None:
        raise RuntimeError(f"Failed to upsert snapshot for manager {manager_id} GW{gw.gameweek}")

    snapshot_id = row["id"]

    # Delete and insert picks in a transaction for atomicity
    async with conn.transaction():
        await conn.execute("DELETE FROM manager_pick WHERE snapshot_id = $1", snapshot_id)

        # Batch insert all picks using executemany
        if picks:
            await conn.executemany(
                """
                INSERT INTO manager_pick (
                    snapshot_id, player_id, position, multiplier,
                    is_captain, is_vice_captain, points
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                """,
                [
                    (
                        snapshot_id,
                        pick.element,
                        pick.position,
                        pick.multiplier,
                        pick.is_captain,
                        pick.is_vice_captain,
                        0,  # points
                    )
                    for pick in picks
                ],
            )

    return snapshot_id


async def collect_for_manager(
    conn: asyncpg.Connection,
    http_client: httpx.AsyncClient,
    manager_id: int,
    season_id: int,
    manager_info: dict[str, str] | None = None,
) -> tuple[int, int]:
    """
    Collect all GW snapshots and picks for a single manager.

    Returns:
        Tuple of (snapshots_saved, picks_saved)
    """
    # Fetch manager info if not provided (needed for FK constraint)
    if not manager_info:
        manager_info = await fetch_manager_info(http_client, manager_id)

    # Ensure manager exists first (FK constraint requires this)
    await ensure_manager_exists(conn, manager_id, season_id, manager_info)

    # Fetch history
    history, data = await fetch_manager_history(http_client, manager_id)

    if not history:
        logger.warning(f"No history found for manager {manager_id}")
        return 0, 0

    snapshots_saved = 0
    picks_saved = 0

    # Process each gameweek
    for gw in history:
        # Rate limiting
        await asyncio.sleep(RATE_LIMIT_DELAY)

        try:
            # Fetch picks for this GW
            picks, chip_used = await fetch_manager_picks(
                http_client, manager_id, gw.gameweek
            )

            # Save snapshot and picks
            await save_snapshot_and_picks(
                conn, manager_id, season_id, gw, picks, chip_used
            )

            snapshots_saved += 1
            picks_saved += len(picks)

        except httpx.HTTPError as e:
            logger.warning(
                f"Failed to fetch picks for manager {manager_id} GW{gw.gameweek}: {e}"
            )
            continue

    return snapshots_saved, picks_saved


async def collect_for_league(
    conn: asyncpg.Connection,
    fpl_client: FplApiClient,
    league_id: int,
    season_id: int,
) -> tuple[int, int, int]:
    """
    Collect snapshots and picks for all managers in a league.

    Returns:
        Tuple of (managers_processed, total_snapshots, total_picks)
    """
    start_time = time.monotonic()

    # Get league members
    logger.info(f"Fetching league {league_id} members...")
    standings = await fpl_client.get_league_standings(league_id)
    members = standings.members
    logger.info(f"Found {len(members)} members in {standings.league_name}")

    # Use a single HTTP client for all requests
    async with httpx.AsyncClient(timeout=30.0) as http_client:
        # Sync gameweeks first (needed for captain differential calculations)
        logger.info("Syncing gameweeks from bootstrap...")
        await sync_gameweeks_from_bootstrap(conn, http_client, season_id)

        total_snapshots = 0
        total_picks = 0
        errors = 0

        for i, member in enumerate(members):
            manager_id = member.manager_id
            logger.info(
                f"Processing manager {i + 1}/{len(members)}: "
                f"{member.team_name} ({manager_id})"
            )

            try:
                # Don't pass partial info - let collect_for_manager fetch full info
                # League standings don't have started_event, favourite_team, region, etc.
                snapshots, picks = await collect_for_manager(
                    conn, http_client, manager_id, season_id
                )
                total_snapshots += snapshots
                total_picks += picks

                # Progress logging
                elapsed = time.monotonic() - start_time
                rate = (i + 1) / elapsed if elapsed > 0 else 0
                remaining = (len(members) - i - 1) / rate if rate > 0 else 0
                logger.info(
                    f"  Saved {snapshots} snapshots, {picks} picks - "
                    f"ETA: {remaining:.0f}s"
                )

            except httpx.HTTPError as e:
                errors += 1
                logger.warning(f"Failed to process manager {manager_id}: {e}")
                continue
            except asyncpg.PostgresError as e:
                logger.error(f"Database error for manager {manager_id}: {e}")
                raise

        # Check failure threshold
        if members:
            failure_rate = errors / len(members)
            if failure_rate > MAX_FAILURE_RATE:
                logger.error(
                    f"Collection aborted: {errors}/{len(members)} managers failed "
                    f"({failure_rate:.1%})"
                )

        elapsed_total = time.monotonic() - start_time
        logger.info(
            f"Collection complete in {elapsed_total:.1f}s! "
            f"Processed {len(members)} managers, {errors} errors, "
            f"{total_snapshots} snapshots, {total_picks} picks saved"
        )

    return len(members) - errors, total_snapshots, total_picks


async def show_status(conn: asyncpg.Connection, season_id: int) -> None:
    """Show current data status."""
    # Count snapshots
    snapshot_count = await conn.fetchval(
        "SELECT COUNT(*) FROM manager_gw_snapshot WHERE season_id = $1", season_id
    )

    # Count picks
    pick_count = await conn.fetchval(
        """
        SELECT COUNT(*) FROM manager_pick mp
        JOIN manager_gw_snapshot mgs ON mp.snapshot_id = mgs.id
        WHERE mgs.season_id = $1
        """,
        season_id,
    )

    # Count unique managers
    manager_count = await conn.fetchval(
        "SELECT COUNT(DISTINCT manager_id) FROM manager_gw_snapshot WHERE season_id = $1",
        season_id,
    )

    # Get GW range
    gw_range = await conn.fetchrow(
        """
        SELECT MIN(gameweek) as min_gw, MAX(gameweek) as max_gw
        FROM manager_gw_snapshot WHERE season_id = $1
        """,
        season_id,
    )

    print("\nManager Snapshots Collection Status")
    print("-" * 40)
    print(f"Season ID:           {season_id}")
    print(f"Unique Managers:     {manager_count}")
    print(f"Total Snapshots:     {snapshot_count}")
    print(f"Total Picks:         {pick_count}")
    if gw_range and gw_range["min_gw"]:
        print(f"Gameweek Range:      GW{gw_range['min_gw']} - GW{gw_range['max_gw']}")
    else:
        print("Gameweek Range:      No data")
    print("-" * 40)

    # Show sample managers
    if manager_count > 0:
        managers = await conn.fetch(
            """
            SELECT DISTINCT mgs.manager_id, m.name
            FROM manager_gw_snapshot mgs
            LEFT JOIN manager m ON m.id = mgs.manager_id AND m.season_id = mgs.season_id
            WHERE mgs.season_id = $1
            ORDER BY mgs.manager_id
            LIMIT 10
            """,
            season_id,
        )
        print("\nSample Managers:")
        for m in managers:
            name = m["name"] or f"Manager {m['manager_id']}"
            print(f"  - {name} ({m['manager_id']})")


async def reset_data(conn: asyncpg.Connection, season_id: int) -> None:
    """Clear all snapshot data for the season."""
    print("WARNING: This will delete all manager snapshots and picks!")
    confirm = input("Type 'yes' to confirm: ")
    if confirm.lower() != "yes":
        print("Aborted.")
        return

    # Delete picks first (FK constraint)
    result = await conn.execute(
        """
        DELETE FROM manager_pick
        WHERE snapshot_id IN (
            SELECT id FROM manager_gw_snapshot WHERE season_id = $1
        )
        """,
        season_id,
    )
    pick_count = int(result.split()[-1]) if result else 0

    # Delete snapshots
    result = await conn.execute(
        "DELETE FROM manager_gw_snapshot WHERE season_id = $1", season_id
    )
    snapshot_count = int(result.split()[-1]) if result else 0

    logger.info(
        f"Cleared {snapshot_count} snapshots and {pick_count} picks for season {season_id}"
    )


async def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Manager Snapshots data")
    parser.add_argument("--status", action="store_true", help="Show collection status")
    parser.add_argument("--reset", action="store_true", help="Clear and re-collect")
    parser.add_argument(
        "--league", type=int, default=DEFAULT_LEAGUE_ID, help="League ID to collect"
    )
    parser.add_argument(
        "--manager", type=int, help="Single manager ID to collect (for testing)"
    )
    args = parser.parse_args()

    try:
        conn = await get_connection()
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        logger.error("Make sure DATABASE_URL is set correctly")
        sys.exit(1)

    try:
        season_id = await get_or_create_season(conn)
        logger.info(f"Using season ID: {season_id}")

        if args.status:
            await show_status(conn, season_id)
        elif args.reset:
            await reset_data(conn, season_id)
        elif args.manager:
            # Single manager mode (for testing)
            async with httpx.AsyncClient(timeout=30.0) as http_client:
                # Also sync gameweeks for single manager mode
                logger.info("Syncing gameweeks from bootstrap...")
                await sync_gameweeks_from_bootstrap(conn, http_client, season_id)

                snapshots, picks = await collect_for_manager(
                    conn, http_client, args.manager, season_id
                )
                logger.info(f"Saved {snapshots} snapshots, {picks} picks")
        else:
            # Full league collection
            async with FplApiClient(
                requests_per_second=3.0, max_concurrent=1
            ) as fpl_client:
                await collect_for_league(conn, fpl_client, args.league, season_id)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
