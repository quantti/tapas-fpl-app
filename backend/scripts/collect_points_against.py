#!/usr/bin/env python
"""
Collect Points Against data from FPL API.

This script fetches player history for all players and aggregates
the points scored against each team per fixture.

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

from app.services.fpl_client import FplApiClient
from app.services.points_against import PointsAgainstService

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

    # Create a new season (2024-25)
    row = await conn.fetchrow(
        """
        INSERT INTO season (code, start_year, is_active)
        VALUES ('2024-25', 2024, true)
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
        errors = 0

        for i, player in enumerate(players):
            player_id = player["id"]
            team_id = player["team"]

            try:
                history = await fpl_client.get_player_history(player_id)

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
            if fetch_failure_rate > 0.10:  # More than 10% failures
                error_msg = f"Fetch aborted: {errors}/{len(players)} players failed ({fetch_failure_rate:.1%})"
                logger.error(error_msg)
                await pa_service.update_collection_status(
                    conn, season_id, current_gw, total_processed, "failed", error_msg, False
                )
                raise RuntimeError(error_msg)

        logger.info(f"Collected data for {len(fixture_points)} fixture-team combinations")

        # Save all fixture data
        logger.info("Saving to database...")
        saved = 0

        save_errors = 0
        for (fixture_id, team_id), data in fixture_points.items():
            try:
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
            except Exception as e:
                save_errors += 1
                logger.warning(f"Failed to save fixture {fixture_id}: {e}")

        logger.info(f"Saved {saved} fixture records")

        # Check failure threshold for save phase
        if fixture_points:
            save_failure_rate = save_errors / len(fixture_points)
            if save_failure_rate > 0.10:  # More than 10% failures
                error_msg = f"Save aborted: {save_errors}/{len(fixture_points)} fixtures failed ({save_failure_rate:.1%})"
                logger.error(error_msg)
                await pa_service.update_collection_status(
                    conn, season_id, current_gw, total_processed, "failed", error_msg, False
                )
                raise RuntimeError(error_msg)

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
            f"Processed {total_processed} players, {errors} errors, {saved} fixtures saved"
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
