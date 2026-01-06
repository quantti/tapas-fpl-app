#!/usr/bin/env python
"""
Seed database with realistic test data for local development.

This creates fake but realistic-looking Points Against data so you can
develop and test the frontend without running the actual FPL data collection.

Usage:
    python -m scripts.seed_test_data           # Seed default data
    python -m scripts.seed_test_data --reset   # Clear and re-seed
"""
import argparse
import asyncio
import os
import random
from datetime import datetime

import asyncpg
from dotenv import load_dotenv

# Load local environment
load_dotenv(".env.local")
load_dotenv(".env")

# Premier League teams (FPL IDs and names for 2024-25)
TEAMS = [
    (1, "Arsenal", "ARS"),
    (2, "Aston Villa", "AVL"),
    (3, "Bournemouth", "BOU"),
    (4, "Brentford", "BRE"),
    (5, "Brighton", "BHA"),
    (6, "Chelsea", "CHE"),
    (7, "Crystal Palace", "CRY"),
    (8, "Everton", "EVE"),
    (9, "Fulham", "FUL"),
    (10, "Ipswich", "IPS"),
    (11, "Leicester", "LEI"),
    (12, "Liverpool", "LIV"),
    (13, "Man City", "MCI"),
    (14, "Man Utd", "MUN"),
    (15, "Newcastle", "NEW"),
    (16, "Nottm Forest", "NFO"),
    (17, "Southampton", "SOU"),
    (18, "Spurs", "TOT"),
    (19, "West Ham", "WHU"),
    (20, "Wolves", "WOL"),
]

# Approximate defensive strength (lower = better defense, concedes fewer points)
# Based on real FPL trends: Arsenal/Liverpool strong, Wolves/Southampton weak
TEAM_DEFENSIVE_FACTOR = {
    1: 0.7,   # Arsenal - strong defense
    2: 0.9,   # Aston Villa
    3: 1.1,   # Bournemouth
    4: 1.0,   # Brentford
    5: 0.85,  # Brighton
    6: 0.95,  # Chelsea
    7: 1.0,   # Crystal Palace
    8: 1.15,  # Everton
    9: 1.0,   # Fulham
    10: 1.2,  # Ipswich - promoted, weaker
    11: 1.15, # Leicester - promoted
    12: 0.7,  # Liverpool - strong defense
    13: 0.75, # Man City
    14: 1.1,  # Man Utd
    15: 0.85, # Newcastle
    16: 0.9,  # Nottm Forest
    17: 1.25, # Southampton - promoted, weakest
    18: 1.0,  # Spurs
    19: 1.05, # West Ham
    20: 1.2,  # Wolves - historically weak
}


async def get_connection() -> asyncpg.Connection:
    """Get database connection from environment."""
    db_url = os.getenv(
        "DATABASE_URL", "postgresql://tapas:localdev@localhost:5432/tapas_fpl"
    )
    return await asyncpg.connect(db_url)


async def get_season_id(conn: asyncpg.Connection) -> int:
    """Get the current season ID, creating one if needed."""
    row = await conn.fetchrow(
        "SELECT id FROM season WHERE code = '2024-25'"
    )
    if row:
        return row["id"]

    # Create season if it doesn't exist
    row = await conn.fetchrow("""
        INSERT INTO season (code, name, start_date, is_current)
        VALUES ('2024-25', 'Season 2024/25', '2024-08-16', true)
        RETURNING id
    """)
    return row["id"]


async def seed_teams(conn: asyncpg.Connection, season_id: int) -> None:
    """Seed team data."""
    print("Seeding teams...")
    for team_id, name, short_name in TEAMS:
        await conn.execute("""
            INSERT INTO team (id, season_id, code, name, short_name)
            VALUES ($1, $2, $1, $3, $4)
            ON CONFLICT (id, season_id) DO UPDATE SET
                name = EXCLUDED.name,
                short_name = EXCLUDED.short_name
        """, team_id, season_id, name, short_name)
    print(f"  \u2713 Seeded {len(TEAMS)} teams")


async def seed_points_against(
    conn: asyncpg.Connection, season_id: int, num_gameweeks: int = 20
) -> int:
    """
    Seed points_against_by_fixture with realistic fake data.

    Returns the number of fixture records created.
    """
    print(f"Seeding points against data for {num_gameweeks} gameweeks...")

    # Clear existing data for this season
    await conn.execute("""
        DELETE FROM points_against_by_fixture WHERE season_id = $1
    """, season_id)

    fixture_id = 1
    base_points = 45  # Average points against per match

    for gw in range(1, num_gameweeks + 1):
        # Shuffle teams for random matchups
        teams_this_gw = list(range(1, 21))
        random.shuffle(teams_this_gw)

        # 10 matches per gameweek (20 teams, everyone plays once)
        for i in range(0, 20, 2):
            home_team_id = teams_this_gw[i]
            away_team_id = teams_this_gw[i + 1]

            # Calculate points with defensive factor and randomness
            # Weaker defenses concede more points
            home_factor = TEAM_DEFENSIVE_FACTOR.get(home_team_id, 1.0)
            away_factor = TEAM_DEFENSIVE_FACTOR.get(away_team_id, 1.0)

            # Add some randomness (+/- 20 points)
            home_points_conceded = int(
                base_points * home_factor + random.randint(-20, 20)
            )
            away_points_conceded = int(
                base_points * away_factor + random.randint(-20, 20)
            )

            # Ensure non-negative
            home_points_conceded = max(15, home_points_conceded)
            away_points_conceded = max(15, away_points_conceded)

            # Record from home team's perspective
            await conn.execute("""
                INSERT INTO points_against_by_fixture
                    (fixture_id, team_id, season_id, gameweek,
                     home_points, away_points, is_home, opponent_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (fixture_id, team_id) DO NOTHING
            """, fixture_id, home_team_id, season_id, gw,
                home_points_conceded, 0, True, away_team_id)

            # Record from away team's perspective (same fixture_id)
            await conn.execute("""
                INSERT INTO points_against_by_fixture
                    (fixture_id, team_id, season_id, gameweek,
                     home_points, away_points, is_home, opponent_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (fixture_id, team_id) DO NOTHING
            """, fixture_id, away_team_id, season_id, gw,
                0, away_points_conceded, False, home_team_id)
            fixture_id += 1  # Increment once per match, not per team

    total_matches = fixture_id - 1
    print(f"  \u2713 Seeded {total_matches * 2} fixture records ({total_matches} matches)")
    return total_matches * 2


async def seed_collection_status(
    conn: asyncpg.Connection, season_id: int, latest_gw: int
) -> None:
    """Update collection status to indicate seeded data."""
    print("Updating collection status...")
    await conn.execute("""
        INSERT INTO points_against_collection_status
            (id, season_id, latest_gameweek, total_players_processed, status)
        VALUES ('points_against', $1, $2, 0, 'seeded')
        ON CONFLICT (id) DO UPDATE SET
            season_id = EXCLUDED.season_id,
            latest_gameweek = EXCLUDED.latest_gameweek,
            status = 'seeded',
            updated_at = NOW()
    """, season_id, latest_gw)
    print("  \u2713 Collection status updated")


async def clear_all(conn: asyncpg.Connection, season_id: int) -> None:
    """Clear all seeded data for this season."""
    print("Clearing existing data...")
    await conn.execute(
        "DELETE FROM points_against_by_fixture WHERE season_id = $1", season_id
    )
    await conn.execute(
        "DELETE FROM points_against_collection_status WHERE season_id = $1", season_id
    )
    print("  \u2713 Cleared")


async def verify_data(conn: asyncpg.Connection, season_id: int) -> None:
    """Verify seeded data with a summary query."""
    print("\nVerifying seeded data...")

    # Check if view exists
    view_exists = await conn.fetchval("""
        SELECT EXISTS (
            SELECT 1 FROM information_schema.views
            WHERE table_name = 'points_against_season_totals'
        )
    """)

    if view_exists:
        rows = await conn.fetch("""
            SELECT team_name, short_name, total_points, matches_played, avg_per_match
            FROM points_against_season_totals
            WHERE season_id = $1
            ORDER BY total_points DESC
            LIMIT 5
        """, season_id)
    else:
        # Fallback if view doesn't exist yet
        rows = await conn.fetch("""
            SELECT
                t.name as team_name,
                t.short_name,
                SUM(paf.home_points + paf.away_points) as total_points,
                COUNT(*) as matches_played
            FROM points_against_by_fixture paf
            JOIN team t ON t.id = paf.team_id AND t.season_id = paf.season_id
            WHERE paf.season_id = $1
            GROUP BY t.name, t.short_name
            ORDER BY total_points DESC
            LIMIT 5
        """, season_id)

    if rows:
        print("\nTop 5 worst defenses (most points against):")
        print("-" * 50)
        for row in rows:
            print(
                f"  {row['short_name']:3} - {row['team_name']:20} "
                f"| {row['total_points']:4} pts | {row['matches_played']} matches"
            )
        print("-" * 50)
    else:
        print("  No data found - migrations may not have run yet")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed test data for Points Against")
    parser.add_argument(
        "--reset", action="store_true", help="Clear existing data before seeding"
    )
    parser.add_argument(
        "--gameweeks", type=int, default=20, help="Number of gameweeks to seed (default: 20)"
    )
    args = parser.parse_args()

    try:
        conn = await get_connection()
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        print("Make sure PostgreSQL is running: docker compose up -d")
        print("And migrations have been run: python -m scripts.migrate")
        return

    try:
        season_id = await get_season_id(conn)
        print(f"Using season ID: {season_id}")

        if args.reset:
            await clear_all(conn, season_id)

        await seed_teams(conn, season_id)
        await seed_points_against(conn, season_id, args.gameweeks)
        await seed_collection_status(conn, season_id, args.gameweeks)
        await verify_data(conn, season_id)

        print("\n\u2713 Seeding complete! Ready for local development.")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
