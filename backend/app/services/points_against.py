"""Service for Points Against feature - tracks FPL points conceded by each team."""

import logging
from dataclasses import dataclass
from datetime import datetime

import asyncpg

from app.db import get_connection

logger = logging.getLogger(__name__)


@dataclass
class TeamPointsAgainst:
    """Points against data for a single team."""

    team_id: int
    team_name: str
    short_name: str
    matches_played: int
    total_points: int
    home_points: int
    away_points: int
    avg_per_match: float


@dataclass
class FixturePointsAgainst:
    """Points against data for a single fixture."""

    fixture_id: int
    team_id: int
    gameweek: int
    home_points: int
    away_points: int
    is_home: bool
    opponent_id: int


@dataclass
class CollectionStatus:
    """Status of the points against data collection."""

    season_id: int
    latest_gameweek: int
    total_players_processed: int
    last_full_collection: datetime | None
    last_incremental_update: datetime | None
    status: str
    error_message: str | None


class PointsAgainstService:
    """Service for managing Points Against data."""

    async def get_season_totals(self, season_id: int) -> list[TeamPointsAgainst]:
        """
        Get aggregated points against for all teams in a season.
        Uses the pre-computed view for efficiency.
        """
        async with get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    team_id,
                    team_name,
                    short_name,
                    matches_played,
                    total_points,
                    home_points,
                    away_points,
                    avg_per_match
                FROM points_against_season_totals
                WHERE season_id = $1
                ORDER BY total_points DESC
                """,
                season_id,
            )

            return [
                TeamPointsAgainst(
                    team_id=row["team_id"],
                    team_name=row["team_name"],
                    short_name=row["short_name"],
                    matches_played=row["matches_played"],
                    total_points=row["total_points"],
                    home_points=row["home_points"],
                    away_points=row["away_points"],
                    avg_per_match=float(row["avg_per_match"] or 0),
                )
                for row in rows
            ]

    async def get_team_history(
        self, team_id: int, season_id: int
    ) -> list[FixturePointsAgainst]:
        """
        Get fixture-by-fixture points against for a specific team.
        Useful for showing trends over the season.
        """
        async with get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    fixture_id,
                    team_id,
                    gameweek,
                    home_points,
                    away_points,
                    is_home,
                    opponent_id
                FROM points_against_by_fixture
                WHERE team_id = $1 AND season_id = $2
                ORDER BY gameweek
                """,
                team_id,
                season_id,
            )

            return [
                FixturePointsAgainst(
                    fixture_id=row["fixture_id"],
                    team_id=row["team_id"],
                    gameweek=row["gameweek"],
                    home_points=row["home_points"],
                    away_points=row["away_points"],
                    is_home=row["is_home"],
                    opponent_id=row["opponent_id"],
                )
                for row in rows
            ]

    async def save_fixture_points(
        self,
        conn: asyncpg.Connection,
        fixture_id: int,
        team_id: int,
        season_id: int,
        gameweek: int,
        home_points: int,
        away_points: int,
        is_home: bool,
        opponent_id: int,
    ) -> None:
        """Save or update points against for a single fixture."""
        await conn.execute(
            """
            INSERT INTO points_against_by_fixture (
                fixture_id, team_id, season_id, gameweek,
                home_points, away_points, is_home, opponent_id, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            ON CONFLICT (fixture_id) DO UPDATE SET
                home_points = EXCLUDED.home_points,
                away_points = EXCLUDED.away_points,
                updated_at = NOW()
            """,
            fixture_id,
            team_id,
            season_id,
            gameweek,
            home_points,
            away_points,
            is_home,
            opponent_id,
        )

    async def get_collection_status(self) -> CollectionStatus | None:
        """Get the current collection status."""
        async with get_connection() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                    season_id,
                    latest_gameweek,
                    total_players_processed,
                    last_full_collection,
                    last_incremental_update,
                    status,
                    error_message
                FROM points_against_collection_status
                WHERE id = 'points_against'
                """
            )

            if not row:
                return None

            return CollectionStatus(
                season_id=row["season_id"],
                latest_gameweek=row["latest_gameweek"],
                total_players_processed=row["total_players_processed"],
                last_full_collection=row["last_full_collection"],
                last_incremental_update=row["last_incremental_update"],
                status=row["status"],
                error_message=row["error_message"],
            )

    async def update_collection_status(
        self,
        conn: asyncpg.Connection,
        season_id: int,
        latest_gameweek: int,
        total_players_processed: int,
        status: str,
        error_message: str | None = None,
        is_full_collection: bool = False,
    ) -> None:
        """Update the collection status."""
        await conn.execute(
            """
            INSERT INTO points_against_collection_status (
                id, season_id, latest_gameweek, total_players_processed,
                last_full_collection, last_incremental_update,
                status, error_message, updated_at
            )
            VALUES (
                'points_against', $1, $2, $3,
                CASE WHEN $6 THEN NOW() ELSE NULL END,
                CASE WHEN NOT $6 THEN NOW() ELSE NULL END,
                $4, $5, NOW()
            )
            ON CONFLICT (id) DO UPDATE SET
                season_id = EXCLUDED.season_id,
                latest_gameweek = EXCLUDED.latest_gameweek,
                total_players_processed = EXCLUDED.total_players_processed,
                last_full_collection = CASE
                    WHEN $6 THEN NOW()
                    ELSE points_against_collection_status.last_full_collection
                END,
                last_incremental_update = CASE
                    WHEN NOT $6 THEN NOW()
                    ELSE points_against_collection_status.last_incremental_update
                END,
                status = EXCLUDED.status,
                error_message = EXCLUDED.error_message,
                updated_at = NOW()
            """,
            season_id,
            latest_gameweek,
            total_players_processed,
            status,
            error_message,
            is_full_collection,
        )

    async def clear_season_data(self, season_id: int) -> int:
        """Clear all points against data for a season. Returns count of deleted rows."""
        async with get_connection() as conn:
            result = await conn.execute(
                """
                DELETE FROM points_against_by_fixture
                WHERE season_id = $1
                """,
                season_id,
            )
            # Parse "DELETE X" to get count
            count = int(result.split()[-1]) if result else 0
            logger.info(f"Cleared {count} rows for season {season_id}")
            return count
