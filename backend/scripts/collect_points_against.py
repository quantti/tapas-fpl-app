#!/usr/bin/env python
"""
Collect Points Against data and Player Fixture Stats from FPL API.

This script fetches player history for all players and:
1. Aggregates points scored against each team per fixture (Points Against)
2. Saves detailed per-player per-fixture stats (Player Fixture Stats)

Usage:
    python -m scripts.collect_points_against           # Run collection
    python -m scripts.collect_points_against --status  # Show collection status
    python -m scripts.collect_points_against --reset   # Clear and re-collect
"""

import argparse
import asyncio
import logging
import os
import sys
import time
from collections import defaultdict

import asyncpg
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.fpl_client import FplApiClient, PlayerHistory
from app.services.points_against import PointsAgainstService

# Configuration constants
MAX_FAILURE_RATE = 0.10  # Abort collection if >10% of requests fail

# Load environment
load_dotenv(".env.local")
load_dotenv(".env")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


async def get_connection() -> asyncpg.Connection:
    """Get database connection from environment."""
    db_url = os.getenv(
        "DATABASE_URL", "postgresql://tapas:localdev@localhost:5432/tapas_fpl"
    )
    return await asyncpg.connect(db_url)


async def get_or_create_season(conn: asyncpg.Connection) -> int:
    """Get the current season ID, creating it if needed."""
    # Try to find an existing season
    row = await conn.fetchrow("SELECT id FROM season ORDER BY id DESC LIMIT 1")
    if row:
        return row["id"]

    # Create a new season (2025-26)
    # Note: This app supports multi-season data. If you need to add a new season,
    # consider creating a proper migration or updating this default.
    row = await conn.fetchrow(
        """
        INSERT INTO season (code, start_year, is_active)
        VALUES ('2025-26', 2025, true)
        RETURNING id
        """
    )
    return row["id"]


async def sync_teams(
    conn: asyncpg.Connection, teams: list[dict], season_id: int
) -> None:
    """Sync team data from bootstrap to database."""
    for team in teams:
        await conn.execute(
            """
            INSERT INTO team (id, season_id, name, short_name, code, strength)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id, season_id) DO UPDATE SET
                name = EXCLUDED.name,
                short_name = EXCLUDED.short_name,
                code = EXCLUDED.code,
                strength = EXCLUDED.strength
            """,
            team["id"],
            season_id,
            team["name"],
            team["short_name"],
            team.get("code"),
            team.get("strength"),
        )
    logger.info(f"Synced {len(teams)} teams")


async def save_player_fixture_stats(
    conn: asyncpg.Connection,
    player_id: int,
    player_team_id: int,
    season_id: int,
    history: list[PlayerHistory],
) -> int:
    """
    Save a player's fixture stats to database using batch insert.

    Returns the number of records saved.
    """
    if not history:
        return 0

    # Build parameter tuples for batch insert
    params = [
        (
            h.fixture_id,
            player_id,
            season_id,
            h.gameweek,
            player_team_id,
            h.opponent_team,
            h.was_home,
            h.kickoff_time,
            h.minutes,
            h.total_points,
            h.bonus,
            h.bps,
            h.goals_scored,
            h.assists,
            h.expected_goals,
            h.expected_assists,
            h.expected_goal_involvements,
            h.clean_sheets,
            h.goals_conceded,
            h.own_goals,
            h.penalties_saved,
            h.penalties_missed,
            h.saves,
            h.expected_goals_conceded,
            h.yellow_cards,
            h.red_cards,
            h.influence,
            h.creativity,
            h.threat,
            h.ict_index,
            h.value,
            h.selected,
            h.transfers_in,
            h.transfers_out,
            h.starts,
        )
        for h in history
    ]

    await conn.executemany(
        """
        INSERT INTO player_fixture_stats (
            fixture_id, player_id, season_id, gameweek,
            player_team_id, opponent_team_id, was_home, kickoff_time,
            minutes, total_points, bonus, bps,
            goals_scored, assists, expected_goals, expected_assists,
            expected_goal_involvements,
            clean_sheets, goals_conceded, own_goals, penalties_saved,
            penalties_missed, saves, expected_goals_conceded,
            yellow_cards, red_cards,
            influence, creativity, threat, ict_index,
            value, selected, transfers_in, transfers_out,
            starts
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11, $12,
            $13, $14, $15, $16,
            $17,
            $18, $19, $20, $21,
            $22, $23, $24,
            $25, $26,
            $27, $28, $29, $30,
            $31, $32, $33, $34,
            $35
        )
        ON CONFLICT (fixture_id, player_id, season_id) DO UPDATE SET
            minutes = EXCLUDED.minutes,
            total_points = EXCLUDED.total_points,
            bonus = EXCLUDED.bonus,
            bps = EXCLUDED.bps,
            goals_scored = EXCLUDED.goals_scored,
            assists = EXCLUDED.assists,
            expected_goals = EXCLUDED.expected_goals,
            expected_assists = EXCLUDED.expected_assists,
            expected_goal_involvements = EXCLUDED.expected_goal_involvements,
            clean_sheets = EXCLUDED.clean_sheets,
            goals_conceded = EXCLUDED.goals_conceded,
            own_goals = EXCLUDED.own_goals,
            penalties_saved = EXCLUDED.penalties_saved,
            penalties_missed = EXCLUDED.penalties_missed,
            saves = EXCLUDED.saves,
            expected_goals_conceded = EXCLUDED.expected_goals_conceded,
            yellow_cards = EXCLUDED.yellow_cards,
            red_cards = EXCLUDED.red_cards,
            influence = EXCLUDED.influence,
            creativity = EXCLUDED.creativity,
            threat = EXCLUDED.threat,
            ict_index = EXCLUDED.ict_index,
            value = EXCLUDED.value,
            selected = EXCLUDED.selected,
            transfers_in = EXCLUDED.transfers_in,
            transfers_out = EXCLUDED.transfers_out,
            starts = EXCLUDED.starts
        """,
        params,
    )

    return len(history)


async def collect_points_against(
    conn: asyncpg.Connection,
    fpl_client: FplApiClient,
    season_id: int,
    batch_size: int = 50,
) -> None:
    """
    Collect points against data by iterating through all players.

    Algorithm:
    1. Fetch all players from bootstrap
    2. For each player, fetch their history
    3. For each fixture in history, add points to the opponent's total
    4. Save to database in batches
    """
    pa_service = PointsAgainstService()
    start_time = time.monotonic()

    # Update status to running
    await pa_service.update_collection_status(
        conn, season_id, 0, 0, "running", None, False
    )

    try:
        # Get bootstrap data
        logger.info("Fetching bootstrap data...")
        bootstrap = await fpl_client.get_bootstrap()
        players = bootstrap.players
        current_gw = bootstrap.current_gameweek or 0

        logger.info(f"Found {len(players)} players, current GW: {current_gw}")

        # Sync teams first
        await sync_teams(conn, bootstrap.teams, season_id)

        # Build fixture -> points against mapping
        # Key: (fixture_id, team_id) -> {home_points, away_points, is_home, opponent_id, gameweek}
        fixture_points: dict[tuple[int, int], dict] = defaultdict(
            lambda: {
                "home_points": 0,
                "away_points": 0,
                "is_home": False,
                "opponent_id": 0,
                "gameweek": 0,
            }
        )

        # Process players in batches
        total_processed = 0
        player_stats_saved = 0
        errors = 0

        for i, player in enumerate(players):
            player_id = player["id"]
            team_id = player["team"]

            try:
                history = await fpl_client.get_player_history(player_id)

                # Aggregate for Points Against
                for h in history:
                    # Points are scored AGAINST the opponent
                    key = (h.fixture_id, h.opponent_team)

                    if h.was_home:
                        fixture_points[key]["home_points"] += h.total_points
                    else:
                        fixture_points[key]["away_points"] += h.total_points

                    # Set metadata (same for all players in this fixture)
                    fixture_points[key]["opponent_id"] = team_id
                    fixture_points[key]["gameweek"] = h.gameweek
                    fixture_points[key]["is_home"] = not h.was_home  # Opponent was away

                # Save individual player fixture stats
                stats_count = await save_player_fixture_stats(
                    conn, player_id, team_id, season_id, history
                )
                player_stats_saved += stats_count

                total_processed += 1

                # Log progress with estimated time remaining
                if (i + 1) % batch_size == 0:
                    elapsed = time.monotonic() - start_time
                    rate = (i + 1) / elapsed
                    remaining = (len(players) - i - 1) / rate if rate > 0 else 0
                    logger.info(
                        f"Progress: {i + 1}/{len(players)} players "
                        f"({total_processed} success, {errors} errors) "
                        f"- ETA: {remaining:.0f}s"
                    )

            except Exception as e:
                errors += 1
                logger.warning(f"Failed to fetch player {player_id}: {e}")
                continue

        # Check failure threshold for fetch phase
        if players:
            fetch_failure_rate = errors / len(players)
            if fetch_failure_rate > MAX_FAILURE_RATE:
                error_msg = f"Fetch aborted: {errors}/{len(players)} players failed ({fetch_failure_rate:.1%})"
                logger.error(error_msg)
                await pa_service.update_collection_status(
                    conn, season_id, current_gw, total_processed, "failed", error_msg, False
                )
                raise RuntimeError(error_msg)

        logger.info(f"Collected data for {len(fixture_points)} fixture-team combinations")

        # Save all fixture data in a single transaction for atomicity
        logger.info("Saving to database...")
        saved = 0

        async with conn.transaction():
            for (fixture_id, team_id), data in fixture_points.items():
                await pa_service.save_fixture_points(
                    conn,
                    fixture_id=fixture_id,
                    team_id=team_id,
                    season_id=season_id,
                    gameweek=data["gameweek"],
                    home_points=data["home_points"],
                    away_points=data["away_points"],
                    is_home=data["is_home"],
                    opponent_id=data["opponent_id"],
                )
                saved += 1

        logger.info(f"Saved {saved} fixture records")

        # Update status to idle on success
        elapsed_total = time.monotonic() - start_time
        await pa_service.update_collection_status(
            conn,
            season_id,
            current_gw,
            total_processed,
            "idle",
            None,
            is_full_collection=True,
        )

        logger.info(
            f"Collection complete in {elapsed_total:.1f}s! "
            f"Processed {total_processed} players, {errors} errors, "
            f"{saved} fixtures saved, {player_stats_saved} player stats saved"
        )

    except Exception as e:
        # Update status to failed on error
        logger.error(f"Collection failed: {e}")
        await pa_service.update_collection_status(
            conn,
            season_id,
            0,
            0,
            "failed",
            str(e)[:500],  # Truncate error message
            is_full_collection=False,
        )
        raise


async def show_status(conn: asyncpg.Connection) -> None:
    """Show current collection status."""
    pa_service = PointsAgainstService()
    status = await pa_service.get_collection_status()

    if not status:
        print("No collection status found (collection never run)")
        return

    print("\nPoints Against Collection Status")
    print("-" * 40)
    print(f"Season ID:           {status.season_id}")
    print(f"Latest Gameweek:     {status.latest_gameweek}")
    print(f"Players Processed:   {status.total_players_processed}")
    print(f"Status:              {status.status}")
    print(f"Last Full Run:       {status.last_full_collection or 'Never'}")
    print(f"Last Incremental:    {status.last_incremental_update or 'Never'}")
    if status.error_message:
        print(f"Error:               {status.error_message}")
    print("-" * 40)

    # Show team totals
    totals = await pa_service.get_season_totals(status.season_id)
    if totals:
        print(f"\nTeam Points Against ({len(totals)} teams):")
        print(f"{'Team':<20} {'Matches':>8} {'Total':>8} {'Avg':>8}")
        print("-" * 46)
        for t in totals[:10]:  # Top 10
            print(f"{t.team_name:<20} {t.matches_played:>8} {t.total_points:>8} {t.avg_per_match:>8.1f}")


async def reset_data(conn: asyncpg.Connection, season_id: int) -> None:
    """Clear all data and re-run collection."""
    print("WARNING: This will delete all Points Against data!")
    confirm = input("Type 'yes' to confirm: ")
    if confirm.lower() != "yes":
        print("Aborted.")
        return

    pa_service = PointsAgainstService()
    await pa_service.clear_season_data(season_id)

    # Re-run collection
    # 0.2 req/s = 12 req/min (5x slower than default to avoid rate limits)
    async with FplApiClient(requests_per_second=0.2, max_concurrent=1) as fpl_client:
        await collect_points_against(conn, fpl_client, season_id)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Points Against data")
    parser.add_argument("--status", action="store_true", help="Show collection status")
    parser.add_argument("--reset", action="store_true", help="Clear and re-collect")
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
            await show_status(conn)
        elif args.reset:
            await reset_data(conn, season_id)
        else:
            # 0.2 req/s = 12 req/min (5x slower than default to avoid rate limits)
            async with FplApiClient(requests_per_second=0.2, max_concurrent=1) as fpl_client:
                await collect_points_against(conn, fpl_client, season_id)
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
