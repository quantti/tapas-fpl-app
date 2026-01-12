#!/usr/bin/env python
"""
One-time script to backfill league_ownership from historical manager_pick data.

This script computes ownership statistics for all historical gameweeks where
manager_pick data exists. Run this once after deploying the league_ownership
feature to populate historical data.

Usage:
    python -m scripts.backfill_league_ownership
    python -m scripts.backfill_league_ownership --league 242017 --season 2
    python -m scripts.backfill_league_ownership --dry-run
    python -m scripts.backfill_league_ownership --gameweek 20  # Single GW

The script is idempotent - safe to run multiple times. Existing records
will be updated with fresh calculations.
"""

import argparse
import asyncio
import logging
import os
import sys
import time

import asyncpg
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.collect_points_against import get_or_create_season
from scripts.compute_league_ownership import (
    compute_league_ownership,
    get_gameweeks_with_picks,
    verify_league_ownership_data,
)
from scripts.scheduled_update import create_pool

# Load environment
load_dotenv(".env.local")
load_dotenv(".env")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Default league (Tapas and Tackles)
DEFAULT_LEAGUE_ID = 242017


async def backfill_league_ownership(
    league_id: int,
    season_id: int | None = None,
    gameweek: int | None = None,
    dry_run: bool = False,
) -> None:
    """Backfill ownership for all historical gameweeks.

    Args:
        league_id: League to backfill
        season_id: Season ID (auto-detected if not provided)
        gameweek: Specific gameweek to backfill (all if not provided)
        dry_run: If True, show what would be done without making changes
    """
    pool = None
    mode = "DRY RUN" if dry_run else "LIVE"
    logger.info(f"Starting league ownership backfill ({mode})")

    try:
        pool = await create_pool()
        async with pool.acquire() as conn:
            # Get or detect season
            if season_id is None:
                season_id = await get_or_create_season(conn)
            logger.info(f"Season ID: {season_id}")

            # Get gameweeks to process
            if gameweek is not None:
                gameweeks = [gameweek]
                logger.info(f"Processing single gameweek: GW{gameweek}")
            else:
                gameweeks = await get_gameweeks_with_picks(conn, league_id, season_id)
                logger.info(f"Found {len(gameweeks)} gameweeks with pick data")

            if not gameweeks:
                logger.warning("No gameweeks found with manager_pick data")
                return

            if dry_run:
                logger.info(f"[DRY RUN] Would process gameweeks: {gameweeks}")
                logger.info(f"[DRY RUN] League: {league_id}, Season: {season_id}")
                return

            # Process each gameweek
            total_records = 0
            failed_gameweeks: list[int] = []
            start_time = time.monotonic()

            for gw in gameweeks:
                gw_start = time.monotonic()

                # Compute ownership (returns record count and manager count)
                records, manager_count = await compute_league_ownership(
                    conn, league_id, season_id, gw
                )
                total_records += records

                # Verify
                if not await verify_league_ownership_data(
                    conn, league_id, season_id, gw, manager_count
                ):
                    logger.error(f"Verification failed for GW{gw}")
                    failed_gameweeks.append(gw)
                    # Continue with other gameweeks, don't abort entirely

                gw_elapsed = time.monotonic() - gw_start
                logger.debug(f"GW{gw} completed in {gw_elapsed:.2f}s")

            elapsed = time.monotonic() - start_time

            # Report failed gameweeks prominently
            if failed_gameweeks:
                logger.error(
                    f"VERIFICATION FAILED for {len(failed_gameweeks)} gameweeks: "
                    f"{failed_gameweeks}"
                )

            logger.info(
                f"Backfill complete: {len(gameweeks)} gameweeks, "
                f"{total_records} total records in {elapsed:.1f}s"
                + (f" ({len(failed_gameweeks)} failed)" if failed_gameweeks else "")
            )

            # Final summary
            await show_summary(conn, league_id, season_id)

            # Exit with error code if any verification failed
            if failed_gameweeks:
                raise RuntimeError(
                    f"Verification failed for gameweeks: {failed_gameweeks}"
                )

    except Exception as e:
        logger.error(f"Backfill failed: {e}", exc_info=True)
        raise
    finally:
        if pool:
            await pool.close()


async def show_summary(
    conn: asyncpg.Connection,
    league_id: int,
    season_id: int,
) -> None:
    """Show summary of league_ownership data after backfill."""
    row = await conn.fetchrow(
        """
        SELECT
            COUNT(*) as total_records,
            COUNT(DISTINCT gameweek) as gameweeks,
            COUNT(DISTINCT player_id) as unique_players,
            MIN(gameweek) as first_gw,
            MAX(gameweek) as last_gw
        FROM league_ownership
        WHERE league_id = $1 AND season_id = $2
        """,
        league_id,
        season_id,
    )

    logger.info(
        f"\n{'=' * 50}\n"
        f"League Ownership Backfill Summary\n"
        f"{'=' * 50}\n"
        f"League ID:       {league_id}\n"
        f"Season ID:       {season_id}\n"
        f"Total Records:   {row['total_records']}\n"
        f"Gameweeks:       {row['gameweeks']} (GW{row['first_gw']} - GW{row['last_gw']})\n"
        f"Unique Players:  {row['unique_players']}\n"
        f"{'=' * 50}"
    )


async def main() -> None:
    """Main entry point with argument parsing."""
    parser = argparse.ArgumentParser(
        description="Backfill league_ownership from historical manager_pick data"
    )
    parser.add_argument(
        "--league",
        type=int,
        default=DEFAULT_LEAGUE_ID,
        help=f"League ID to backfill (default: {DEFAULT_LEAGUE_ID})",
    )
    parser.add_argument(
        "--season",
        type=int,
        default=None,
        help="Season ID (auto-detected if not provided)",
    )
    parser.add_argument(
        "--gameweek",
        type=int,
        default=None,
        help="Specific gameweek to backfill (all if not provided)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without making changes",
    )

    args = parser.parse_args()

    await backfill_league_ownership(
        league_id=args.league,
        season_id=args.season,
        gameweek=args.gameweek,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    asyncio.run(main())
