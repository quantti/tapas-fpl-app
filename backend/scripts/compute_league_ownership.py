"""
Compute league ownership statistics from manager_pick data.

This module provides reusable functions for computing per-gameweek player
ownership statistics for a league. Used by both:
- backfill_league_ownership.py (one-time historical backfill)
- scheduled_update.py (incremental updates after each gameweek)

The ownership data is computed from the manager_pick table, which is populated
by the Manager Snapshots collection step in scheduled_update.py.
"""

import logging

import asyncpg

logger = logging.getLogger(__name__)

__all__ = [
    "compute_league_ownership",
    "verify_league_ownership_data",
    "get_gameweeks_with_picks",
]


async def compute_league_ownership(
    conn: asyncpg.Connection,
    league_id: int,
    season_id: int,
    gameweek: int,
) -> tuple[int, int]:
    """Compute and store ownership stats for a league and gameweek.

    Aggregates player ownership from the manager_pick table and stores
    results in league_ownership. Uses upsert to handle re-runs safely.

    Args:
        conn: Database connection
        league_id: League to compute ownership for
        season_id: Season ID
        gameweek: Gameweek to compute

    Returns:
        Tuple of (player_records_count, manager_count)

    Raises:
        asyncpg.PostgresError: On database query errors
        asyncpg.InterfaceError: On connection errors
    """
    try:
        # First, get the total number of managers for this league/gameweek
        # This is needed for percentage calculation
        manager_count = await conn.fetchval(
            """
            SELECT COUNT(DISTINCT mgs.manager_id)
            FROM manager_gw_snapshot mgs
            JOIN league_manager lm ON lm.manager_id = mgs.manager_id
                AND lm.season_id = mgs.season_id
            WHERE lm.league_id = $1
              AND lm.season_id = $2
              AND mgs.gameweek = $3
            """,
            league_id,
            season_id,
            gameweek,
        )

        if not manager_count or manager_count == 0:
            logger.warning(
                f"No managers found for league {league_id}, season {season_id}, GW{gameweek}"
            )
            return 0, 0

        # Compute and upsert ownership data
        # Uses FILTER clause for captain/vice_captain counts
        result = await conn.execute(
            """
            INSERT INTO league_ownership (
                league_id, player_id, season_id, gameweek,
                ownership_count, ownership_percent, captain_count, vice_captain_count
            )
            SELECT
                $1 AS league_id,
                mp.player_id,
                mgs.season_id,
                mgs.gameweek,
                COUNT(*) AS ownership_count,
                ROUND(100.0 * COUNT(*) / $4, 2) AS ownership_percent,
                COUNT(*) FILTER (WHERE mp.is_captain = true) AS captain_count,
                COUNT(*) FILTER (WHERE mp.is_vice_captain = true) AS vice_captain_count
            FROM manager_pick mp
            JOIN manager_gw_snapshot mgs ON mp.snapshot_id = mgs.id
            JOIN league_manager lm ON lm.manager_id = mgs.manager_id
                AND lm.season_id = mgs.season_id
            WHERE lm.league_id = $1
              AND lm.season_id = $2
              AND mgs.gameweek = $3
            GROUP BY mp.player_id, mgs.season_id, mgs.gameweek
            ON CONFLICT (league_id, player_id, season_id, gameweek) DO UPDATE SET
                ownership_count = EXCLUDED.ownership_count,
                ownership_percent = EXCLUDED.ownership_percent,
                captain_count = EXCLUDED.captain_count,
                vice_captain_count = EXCLUDED.vice_captain_count,
                calculated_at = NOW()
            """,
            league_id,
            season_id,
            gameweek,
            manager_count,
        )

        # Parse the result to get row count (format: "INSERT 0 N")
        # asyncpg returns status like "INSERT 0 123"
        row_count: int = 0
        parse_failed = False
        if result:
            try:
                row_count = int(result.split()[-1])
            except (ValueError, IndexError):
                parse_failed = True
        else:
            parse_failed = True

        if parse_failed:
            logger.warning(
                f"Could not parse execute result: {result!r}. Re-querying for actual count."
            )
            # Re-query to get the actual count since parsing failed
            row_count = await conn.fetchval(
                """
                SELECT COUNT(*)
                FROM league_ownership
                WHERE league_id = $1 AND season_id = $2 AND gameweek = $3
                """,
                league_id,
                season_id,
                gameweek,
            )
            row_count = row_count or 0

        logger.info(
            f"Computed ownership for league {league_id}, GW{gameweek}: "
            f"{row_count} players, {manager_count} managers"
        )

        return row_count, manager_count

    except (asyncpg.PostgresError, asyncpg.InterfaceError) as e:
        logger.error(
            f"Database error computing ownership for league {league_id}, "
            f"season {season_id}, GW{gameweek}: {type(e).__name__}: {e}"
        )
        raise


async def verify_league_ownership_data(
    conn: asyncpg.Connection,
    league_id: int,
    season_id: int,
    gameweek: int,
    expected_members: int,
) -> bool:
    """Verify league ownership was computed correctly.

    Checks:
    - At least some ownership records exist for the gameweek
    - ownership_percent values are within valid range (0-100)
    - Captain count total equals number of managers (each picks one captain)

    Args:
        conn: Database connection
        league_id: League ID (matches compute_league_ownership order)
        season_id: Season ID
        gameweek: Gameweek that was computed
        expected_members: Number of managers expected in the league

    Returns:
        True if verification passes, False otherwise

    Raises:
        asyncpg.PostgresError: On database query errors
        asyncpg.InterfaceError: On connection errors
    """
    try:
        # Check ownership records exist
        row = await conn.fetchrow(
            """
            SELECT
                COUNT(*) as player_count,
                SUM(captain_count) as total_captains,
                MIN(ownership_percent) as min_percent,
                MAX(ownership_percent) as max_percent
            FROM league_ownership
            WHERE league_id = $1 AND season_id = $2 AND gameweek = $3
            """,
            league_id,
            season_id,
            gameweek,
        )

        if not row or row["player_count"] == 0:
            logger.error(f"No ownership records found for league {league_id}, GW{gameweek}")
            return False

        # Check percentage range (should be 0-100)
        if row["min_percent"] is not None and row["min_percent"] < 0:
            logger.error(f"Invalid ownership_percent < 0: {row['min_percent']}")
            return False

        if row["max_percent"] is not None and row["max_percent"] > 100:
            logger.error(f"Invalid ownership_percent > 100: {row['max_percent']}")
            return False

        # Check captain count matches expected (each manager picks exactly one captain)
        # Allow small tolerance for edge cases (managers who didn't play)
        if row["total_captains"] is not None:
            captain_diff = abs(row["total_captains"] - expected_members)
            if captain_diff > expected_members * 0.1:  # 10% tolerance
                logger.error(
                    f"Captain count mismatch: expected ~{expected_members}, "
                    f"got {row['total_captains']}"
                )
                return False

        logger.info(
            f"Ownership verification passed for league {league_id}, GW{gameweek}: "
            f"{row['player_count']} players, {row['total_captains']} captains"
        )
        return True

    except (asyncpg.PostgresError, asyncpg.InterfaceError) as e:
        logger.error(
            f"Database error verifying ownership for league {league_id}, "
            f"season {season_id}, GW{gameweek}: {type(e).__name__}: {e}"
        )
        raise


async def get_gameweeks_with_picks(
    conn: asyncpg.Connection,
    league_id: int,
    season_id: int,
) -> list[int]:
    """Get all gameweeks that have manager_pick data for a league.

    Used by backfill script to determine which gameweeks to process.

    Args:
        conn: Database connection
        league_id: League ID
        season_id: Season ID

    Returns:
        List of gameweek numbers with pick data, sorted ascending

    Raises:
        asyncpg.PostgresError: On database query errors
        asyncpg.InterfaceError: On connection errors
    """
    try:
        rows = await conn.fetch(
            """
            SELECT DISTINCT mgs.gameweek
            FROM manager_gw_snapshot mgs
            JOIN league_manager lm ON lm.manager_id = mgs.manager_id
                AND lm.season_id = mgs.season_id
            WHERE lm.league_id = $1 AND lm.season_id = $2
            ORDER BY mgs.gameweek
            """,
            league_id,
            season_id,
        )
        return [row["gameweek"] for row in rows]

    except (asyncpg.PostgresError, asyncpg.InterfaceError) as e:
        logger.error(
            f"Database error fetching gameweeks for league {league_id}, "
            f"season {season_id}: {type(e).__name__}: {e}"
        )
        raise
