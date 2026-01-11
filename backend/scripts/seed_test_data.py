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
    """Get or create season with ID=1 (matches frontend CURRENT_SEASON_ID)."""
    row = await conn.fetchrow("SELECT id FROM season WHERE id = 1")
    if row:
        return row["id"]

    # Create season with id=1 if it doesn't exist (use unique code)
    await conn.execute("""
        INSERT INTO season (id, code, name, start_date, is_current)
        VALUES (1, 'test-2025-26', 'Test Season 2025/26', '2025-08-16', true)
        ON CONFLICT (id) DO NOTHING
    """)
    return 1


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
    # Clear in correct order for FK constraints
    await conn.execute("DELETE FROM manager_pick WHERE snapshot_id IN (SELECT id FROM manager_gw_snapshot WHERE season_id = $1)", season_id)
    await conn.execute("DELETE FROM manager_gw_snapshot WHERE season_id = $1", season_id)
    await conn.execute("DELETE FROM chip_usage WHERE season_id = $1", season_id)
    await conn.execute("DELETE FROM league_manager WHERE season_id = $1", season_id)
    await conn.execute("DELETE FROM manager WHERE season_id = $1", season_id)
    await conn.execute("DELETE FROM league WHERE season_id = $1", season_id)
    await conn.execute("DELETE FROM player WHERE season_id = $1", season_id)
    await conn.execute("DELETE FROM gameweek WHERE season_id = $1", season_id)
    await conn.execute("DELETE FROM points_against_by_fixture WHERE season_id = $1", season_id)
    await conn.execute("DELETE FROM points_against_collection_status WHERE season_id = $1", season_id)
    print("  \u2713 Cleared")


# =============================================================================
# MANAGER DATA SEEDING (for Head-to-Head comparison)
# =============================================================================

# Test league ID (same as frontend config)
TEST_LEAGUE_ID = 242017

# Actual managers from league 242017 (fetched from FPL API)
# Format: (manager_id, team_name, first_name, last_name)
TEST_MANAGERS = [
    (1763747, "Not Last?", "Erick", "Venegas Quijada"),
    (2724410, "Del río al mar", "Matt", "Miles"),
    (2346868, "Fochez Athletic", "William", "Forrest"),
    (10519805, "Soccerballers", "Kevin", "Jeffery"),
    (91555, "FC Overthink", "Kari", "Vänttinen"),
    (577243, "The Fogging Standard", "Adam", "Samuel"),
    (3557067, "Carlos", "Carlos", "Bennetts"),
    (1744062, "Bensby Babes", "Ben", "Johnson"),
    (4300139, "Jerez H", "NiRo", "Roe"),
    (1653529, "San Miguel Deportivo", "Christopher", "Bennetts"),
]

# Sample players (id, name, team_id, position 1=GK, 2=DEF, 3=MID, 4=FWD)
SAMPLE_PLAYERS = [
    # Goalkeepers
    (1, "Raya", 1, 1), (2, "Alisson", 12, 1), (3, "Pickford", 8, 1),
    # Defenders
    (10, "Gabriel", 1, 2), (11, "Saliba", 1, 2), (12, "Alexander-Arnold", 12, 2),
    (13, "Van Dijk", 12, 2), (14, "Trippier", 15, 2), (15, "Gvardiol", 13, 2),
    (16, "Estupinan", 5, 2), (17, "Cucurella", 6, 2),
    # Midfielders
    (100, "Salah", 12, 3), (101, "Palmer", 6, 3), (102, "Saka", 1, 3),
    (103, "Gordon", 15, 3), (104, "Son", 18, 3), (105, "Foden", 13, 3),
    (106, "Bruno Fernandes", 14, 3), (107, "Eze", 7, 3), (108, "Mbeumo", 4, 3),
    # Forwards
    (200, "Haaland", 13, 4), (201, "Isak", 15, 4), (202, "Watkins", 2, 4),
    (203, "Solanke", 18, 4), (204, "Cunha", 20, 4), (205, "Wood", 16, 4),
]


async def seed_gameweeks(conn: asyncpg.Connection, season_id: int, num_gw: int) -> None:
    """Seed gameweek records."""
    print(f"Seeding {num_gw} gameweeks...")
    for gw in range(1, num_gw + 1):
        await conn.execute("""
            INSERT INTO gameweek (id, season_id, name, deadline_time, finished, is_current)
            VALUES ($1, $2, $3, NOW() - INTERVAL '1 day' * $4, $5, $6)
            ON CONFLICT (id, season_id) DO NOTHING
        """, gw, season_id, f"Gameweek {gw}", (num_gw - gw) * 7, gw < num_gw, gw == num_gw)
    print(f"  \u2713 Seeded {num_gw} gameweeks")


async def seed_players(conn: asyncpg.Connection, season_id: int) -> None:
    """Seed player data."""
    print(f"Seeding {len(SAMPLE_PLAYERS)} players...")
    for player_id, name, team_id, pos in SAMPLE_PLAYERS:
        # now_cost in 0.1m units: 100 = £10.0m
        base_cost = {1: 50, 2: 50, 3: 80, 4: 80}  # GK/DEF cheaper than MID/FWD
        now_cost = base_cost.get(pos, 60) + (player_id % 50)
        await conn.execute("""
            INSERT INTO player (id, season_id, team_id, web_name, element_type, now_cost)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id, season_id) DO NOTHING
        """, player_id, season_id, team_id, name, pos, now_cost)
    print(f"  \u2713 Seeded {len(SAMPLE_PLAYERS)} players")


async def seed_league(conn: asyncpg.Connection, season_id: int) -> None:
    """Seed league data."""
    print(f"Seeding league {TEST_LEAGUE_ID}...")
    await conn.execute("""
        INSERT INTO league (id, season_id, name, league_type, scoring, start_event)
        VALUES ($1, $2, 'Tapas & Tackles', 'x', 'c', 1)
        ON CONFLICT (id, season_id) DO NOTHING
    """, TEST_LEAGUE_ID, season_id)
    print(f"  \u2713 Seeded league")


async def seed_managers(conn: asyncpg.Connection, season_id: int) -> None:
    """Seed managers and league membership."""
    print(f"Seeding {len(TEST_MANAGERS)} managers...")
    for idx, (manager_id, team_name, first, last) in enumerate(TEST_MANAGERS):
        await conn.execute("""
            INSERT INTO manager (id, season_id, player_first_name, player_last_name, name)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id, season_id) DO NOTHING
        """, manager_id, season_id, first, last, team_name)

        # Add to league_manager (the join table)
        await conn.execute("""
            INSERT INTO league_manager (league_id, manager_id, season_id, rank, last_rank, total, event_total)
            VALUES ($1, $2, $3, $4, $4, 0, 0)
            ON CONFLICT (league_id, manager_id, season_id) DO NOTHING
        """, TEST_LEAGUE_ID, manager_id, season_id, idx + 1)
    print(f"  \u2713 Seeded {len(TEST_MANAGERS)} managers")


async def seed_manager_snapshots(
    conn: asyncpg.Connection, season_id: int, num_gw: int
) -> None:
    """Seed manager gameweek snapshots and picks."""
    print(f"Seeding manager snapshots for {num_gw} gameweeks...")

    # Player pool for picks
    gk_ids = [p[0] for p in SAMPLE_PLAYERS if p[3] == 1]
    def_ids = [p[0] for p in SAMPLE_PLAYERS if p[3] == 2]
    mid_ids = [p[0] for p in SAMPLE_PLAYERS if p[3] == 3]
    fwd_ids = [p[0] for p in SAMPLE_PLAYERS if p[3] == 4]

    total_snapshots = 0
    total_picks = 0

    for manager_id, team_name, _, _ in TEST_MANAGERS:
        cumulative_points = 0

        for gw in range(1, num_gw + 1):
            # Random GW points between 30 and 90
            gw_points = random.randint(30, 90)
            cumulative_points += gw_points
            bench_points = random.randint(0, 15)

            # Possible chip use
            chip_used = None
            if gw == 1 and random.random() < 0.1:
                chip_used = "wildcard"

            # Insert snapshot
            row = await conn.fetchrow("""
                INSERT INTO manager_gw_snapshot
                    (manager_id, season_id, gameweek, points, total_points,
                     points_on_bench, transfers_made, transfers_cost,
                     bank, value, overall_rank, chip_used, formation)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                ON CONFLICT (manager_id, season_id, gameweek) DO UPDATE SET
                    points = EXCLUDED.points,
                    total_points = EXCLUDED.total_points
                RETURNING id
            """, manager_id, season_id, gw, gw_points, cumulative_points,
                bench_points, random.randint(0, 2), -4 if random.random() < 0.15 else 0,
                random.randint(0, 30), 1000, 100000 + random.randint(-50000, 50000),
                chip_used, "3-4-3")

            snapshot_id = row["id"]
            total_snapshots += 1

            # Create picks (2 GK, 5 DEF, 5 MID, 3 FWD)
            picks = []
            picks.extend(random.sample(gk_ids, min(2, len(gk_ids))))
            picks.extend(random.sample(def_ids, min(5, len(def_ids))))
            picks.extend(random.sample(mid_ids, min(5, len(mid_ids))))
            picks.extend(random.sample(fwd_ids, min(3, len(fwd_ids))))

            # Pick captain from starting XI (positions 1-11)
            captain_idx = random.randint(0, 10)

            for pos, player_id in enumerate(picks, start=1):
                multiplier = 0 if pos > 11 else (2 if pos - 1 == captain_idx else 1)
                is_captain = (pos - 1 == captain_idx)
                points = random.randint(1, 15) * multiplier

                await conn.execute("""
                    INSERT INTO manager_pick
                        (snapshot_id, player_id, position, multiplier, is_captain, points)
                    VALUES ($1, $2, $3, $4, $5, $6)
                """, snapshot_id, player_id, pos, multiplier, is_captain, points)
                total_picks += 1

    print(f"  \u2713 Seeded {total_snapshots} snapshots, {total_picks} picks")


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
        else:
            # Check if data already exists - skip seeding if so
            existing = await conn.fetchval(
                "SELECT COUNT(*) FROM manager WHERE season_id = $1", season_id
            )
            if existing and existing > 0:
                print(f"✓ Data already exists ({existing} managers). Skipping seed.")
                print("  Use --reset to clear and re-seed.")
                return

        await seed_teams(conn, season_id)
        await seed_points_against(conn, season_id, args.gameweeks)
        await seed_collection_status(conn, season_id, args.gameweeks)

        # Seed manager data for H2H comparison
        await seed_gameweeks(conn, season_id, args.gameweeks)
        await seed_players(conn, season_id)
        await seed_league(conn, season_id)
        await seed_managers(conn, season_id)
        await seed_manager_snapshots(conn, season_id, args.gameweeks)

        await verify_data(conn, season_id)

        print("\n\u2713 Seeding complete! Ready for local development.")
        print(f"  Test league ID: {TEST_LEAGUE_ID}")
        print(f"  Test managers: {[m[0] for m in TEST_MANAGERS]}")

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
