#!/usr/bin/env python
"""Test Points Against collection with a small sample (5 players)."""

import asyncio
import os
from datetime import datetime

import asyncpg
import httpx


def parse_kickoff_time(kickoff_str: str | None) -> datetime | None:
    """Parse kickoff time string to datetime."""
    if not kickoff_str:
        return None
    # Format: 2025-08-17T15:30:00Z
    return datetime.fromisoformat(kickoff_str.replace("Z", "+00:00"))


async def test_small_sample():
    db_url = os.environ.get("DATABASE_URL")
    conn = await asyncpg.connect(db_url)

    print("=== Testing small sample collection ===")

    # Get season
    row = await conn.fetchrow("SELECT id, code FROM season WHERE is_current = true")
    season_id = row["id"]
    print(f"Season: {row['code']} (id={season_id})")

    # Fetch bootstrap
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://fantasy.premierleague.com/api/bootstrap-static/"
        )
        data = resp.json()

    players = data["elements"][:5]  # Just 5 players
    current_gw = next((e["id"] for e in data["events"] if e["is_current"]), 0)
    print(f"Testing with {len(players)} players, current GW: {current_gw}")

    # Update collection status to running
    await conn.execute(
        """
        INSERT INTO points_against_collection_status
            (id, season_id, latest_gameweek, total_players_processed, status)
        VALUES ($1, $2, 0, 0, $3)
        ON CONFLICT (id) DO UPDATE SET status = $3
    """,
        "points_against",
        season_id,
        "running",
    )
    print("Status set to running")

    # Process each player
    player_stats_saved = 0

    async with httpx.AsyncClient() as client:
        for p in players:
            player_id = p["id"]
            team_id = p["team"]
            print(f"  Processing player {player_id} ({p['web_name']})...")

            # Fetch player history
            resp = await client.get(
                f"https://fantasy.premierleague.com/api/element-summary/{player_id}/"
            )
            history_data = resp.json()
            history = history_data.get("history", [])

            for h in history:
                # Save to player_fixture_stats
                await conn.execute(
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
                        value, selected, transfers_in, transfers_out, starts
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8,
                        $9, $10, $11, $12, $13, $14, $15, $16, $17,
                        $18, $19, $20, $21, $22, $23, $24, $25, $26,
                        $27, $28, $29, $30, $31, $32, $33, $34, $35
                    )
                    ON CONFLICT (fixture_id, player_id, season_id) DO NOTHING
                """,
                    h["fixture"],
                    player_id,
                    season_id,
                    h["round"],
                    team_id,
                    h["opponent_team"],
                    h["was_home"],
                    parse_kickoff_time(h.get("kickoff_time")),
                    h["minutes"],
                    h["total_points"],
                    h["bonus"],
                    h["bps"],
                    h["goals_scored"],
                    h["assists"],
                    float(h.get("expected_goals", 0) or 0),
                    float(h.get("expected_assists", 0) or 0),
                    float(h.get("expected_goal_involvements", 0) or 0),
                    h["clean_sheets"],
                    h["goals_conceded"],
                    h["own_goals"],
                    h["penalties_saved"],
                    h["penalties_missed"],
                    h["saves"],
                    float(h.get("expected_goals_conceded", 0) or 0),
                    h["yellow_cards"],
                    h["red_cards"],
                    float(h.get("influence", 0) or 0),
                    float(h.get("creativity", 0) or 0),
                    float(h.get("threat", 0) or 0),
                    float(h.get("ict_index", 0) or 0),
                    h["value"],
                    h["selected"],
                    h["transfers_in"],
                    h["transfers_out"],
                    h.get("starts", 0),
                )
                player_stats_saved += 1

                # Save to points_against_by_fixture
                await conn.execute(
                    """
                    INSERT INTO points_against_by_fixture
                        (fixture_id, team_id, season_id, gameweek, home_points, away_points, is_home, opponent_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    ON CONFLICT (fixture_id, team_id) DO UPDATE SET
                        home_points = points_against_by_fixture.home_points + EXCLUDED.home_points,
                        away_points = points_against_by_fixture.away_points + EXCLUDED.away_points,
                        updated_at = NOW()
                """,
                    h["fixture"],
                    h["opponent_team"],
                    season_id,
                    h["round"],
                    h["total_points"] if h["was_home"] else 0,
                    h["total_points"] if not h["was_home"] else 0,
                    not h["was_home"],
                    team_id,
                )

            print(f"    -> {len(history)} fixtures")

    # Update collection status to idle
    await conn.execute(
        """
        UPDATE points_against_collection_status
        SET status = $1, latest_gameweek = $2, total_players_processed = $3,
            last_full_collection = NOW()
        WHERE id = $4
    """,
        "idle",
        current_gw,
        len(players),
        "points_against",
    )

    print()
    print("=== Verification ===")
    pfs_count = await conn.fetchval("SELECT COUNT(*) FROM player_fixture_stats")
    pa_count = await conn.fetchval("SELECT COUNT(*) FROM points_against_by_fixture")
    status = await conn.fetchrow(
        "SELECT status, latest_gameweek, total_players_processed FROM points_against_collection_status WHERE id = $1",
        "points_against",
    )

    print(f"player_fixture_stats rows: {pfs_count}")
    print(f"points_against_by_fixture rows: {pa_count}")
    print(f"Collection status: {status['status']}")
    print(f"Latest GW: {status['latest_gameweek']}")
    print(f"Players processed: {status['total_players_processed']}")

    await conn.close()
    print()
    print("Test complete!")


if __name__ == "__main__":
    asyncio.run(test_small_sample())
