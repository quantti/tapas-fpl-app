#!/usr/bin/env python
"""
Test collection script - runs with just 5 players to verify everything works.

Usage:
    DATABASE_URL="postgresql://..." python -m scripts.test_collection
"""

import asyncio
import logging
import os
import sys

import asyncpg
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.fpl_client import FplApiClient

# Load environment
load_dotenv(".env.local")
load_dotenv(".env")

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

TEST_PLAYER_LIMIT = 5  # Only process 5 players for testing


async def main() -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        logger.error("DATABASE_URL not set! Set it as environment variable.")
        sys.exit(1)

    # Mask password in log
    masked_url = db_url.split("@")[1] if "@" in db_url else "***"
    logger.info(f"Connecting to database: ...@{masked_url}")

    try:
        conn = await asyncpg.connect(db_url)
        logger.info("✓ Database connection successful")
    except Exception as e:
        logger.error(f"✗ Database connection failed: {e}")
        sys.exit(1)

    try:
        # Check existing data
        row = await conn.fetchrow("SELECT COUNT(*) as cnt FROM points_against_by_fixture")
        logger.info(f"Current points_against_by_fixture rows: {row['cnt']}")

        # Check season
        row = await conn.fetchrow("SELECT id, code FROM season ORDER BY id DESC LIMIT 1")
        if row:
            season_id = row["id"]
            logger.info(f"Using season: {row['code']} (id={season_id})")
        else:
            # Create season
            row = await conn.fetchrow("""
                INSERT INTO season (code, start_year, is_active)
                VALUES ('2024-25', 2024, true)
                RETURNING id
            """)
            season_id = row["id"]
            logger.info(f"Created new season (id={season_id})")

        # Test FPL API client
        logger.info("Testing FPL API client...")
        async with FplApiClient(requests_per_second=0.5, max_concurrent=1) as client:
            # Get bootstrap
            bootstrap = await client.get_bootstrap()
            logger.info(f"✓ Bootstrap: {len(bootstrap.players)} players, {len(bootstrap.teams)} teams, GW {bootstrap.current_gameweek}")

            # Test with limited players
            test_players = bootstrap.players[:TEST_PLAYER_LIMIT]
            logger.info(f"Testing with {len(test_players)} players...")

            for i, player in enumerate(test_players):
                player_id = player["id"]
                player_name = player["web_name"]
                logger.info(f"  [{i+1}/{len(test_players)}] Fetching {player_name} (id={player_id})...")

                try:
                    history = await client.get_player_history(player_id)
                    logger.info(f"    ✓ Got {len(history)} history entries")

                    # Show sample
                    if history:
                        h = history[0]
                        logger.info(f"    Sample: fixture={h.fixture_id}, opp={h.opponent_team}, pts={h.total_points}, gw={h.gameweek}")

                        # Try to save one entry
                        await conn.execute("""
                            INSERT INTO points_against_by_fixture (fixture_id, team_id, season_id, gameweek, home_points, away_points, is_home, opponent_id)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                            ON CONFLICT (fixture_id, team_id) DO UPDATE SET
                                home_points = points_against_by_fixture.home_points + EXCLUDED.home_points,
                                away_points = points_against_by_fixture.away_points + EXCLUDED.away_points,
                                updated_at = NOW()
                        """,
                            h.fixture_id,
                            h.opponent_team,
                            season_id,
                            h.gameweek,
                            h.total_points if h.was_home else 0,
                            0 if h.was_home else h.total_points,
                            not h.was_home,  # opponent was home if player was away
                            player["team"],
                        )
                        logger.info(f"    ✓ Saved to database")
                except Exception as e:
                    logger.error(f"    ✗ Failed: {e}")

            # Verify data saved
            row = await conn.fetchrow("SELECT COUNT(*) as cnt FROM points_against_by_fixture")
            logger.info(f"Final points_against_by_fixture rows: {row['cnt']}")

            # Show sample from DB
            rows = await conn.fetch("""
                SELECT pa.team_id, t.short_name, pa.gameweek, pa.home_points, pa.away_points
                FROM points_against_by_fixture pa
                JOIN team t ON t.id = pa.team_id AND t.season_id = pa.season_id
                ORDER BY pa.fixture_id DESC
                LIMIT 5
            """)
            if rows:
                logger.info("Sample data from database:")
                for r in rows:
                    logger.info(f"  {r['short_name']}: GW{r['gameweek']} home={r['home_points']} away={r['away_points']}")

        logger.info("✓ Test complete!")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
