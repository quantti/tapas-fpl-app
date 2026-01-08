"""Tests for Points Against service with mocked database."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest

from app.services.points_against import (
    CollectionStatus,
    FixturePointsAgainst,
    PointsAgainstService,
    TeamPointsAgainst,
)


@pytest.fixture
def service():
    """Create PointsAgainstService instance."""
    return PointsAgainstService()


class TestGetSeasonTotals:
    """Tests for get_season_totals method."""

    async def test_returns_team_data(self, service: PointsAgainstService):
        """Should return list of TeamPointsAgainst objects."""
        mock_rows = [
            {
                "team_id": 20,
                "team_name": "Wolverhampton Wanderers",
                "short_name": "WOL",
                "matches_played": 20,
                "total_points": 991,
                "home_points": 512,
                "away_points": 479,
                "avg_per_match": 49.55,
            },
            {
                "team_id": 1,
                "team_name": "Arsenal",
                "short_name": "ARS",
                "matches_played": 20,
                "total_points": 535,
                "home_points": 245,
                "away_points": 290,
                "avg_per_match": 26.75,
            },
        ]

        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = mock_rows

        with patch("app.services.points_against.get_connection") as mock_get_conn:
            mock_get_conn.return_value.__aenter__.return_value = mock_conn

            result = await service.get_season_totals(season_id=1)

        assert len(result) == 2
        assert isinstance(result[0], TeamPointsAgainst)
        assert result[0].team_id == 20
        assert result[0].team_name == "Wolverhampton Wanderers"
        assert result[0].total_points == 991
        assert result[0].avg_per_match == 49.55
        assert result[1].team_id == 1
        assert result[1].total_points == 535

    async def test_returns_empty_list_when_no_data(self, service: PointsAgainstService):
        """Should return empty list when no season data exists."""
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []

        with patch("app.services.points_against.get_connection") as mock_get_conn:
            mock_get_conn.return_value.__aenter__.return_value = mock_conn

            result = await service.get_season_totals(season_id=99)

        assert result == []

    async def test_handles_null_avg_per_match(self, service: PointsAgainstService):
        """Should convert None avg_per_match to 0.0."""
        mock_rows = [
            {
                "team_id": 1,
                "team_name": "Test Team",
                "short_name": "TST",
                "matches_played": 0,
                "total_points": 0,
                "home_points": 0,
                "away_points": 0,
                "avg_per_match": None,
            }
        ]

        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = mock_rows

        with patch("app.services.points_against.get_connection") as mock_get_conn:
            mock_get_conn.return_value.__aenter__.return_value = mock_conn

            result = await service.get_season_totals(season_id=1)

        assert result[0].avg_per_match == 0.0


class TestGetTeamHistory:
    """Tests for get_team_history method."""

    async def test_returns_fixture_history(self, service: PointsAgainstService):
        """Should return list of FixturePointsAgainst objects."""
        mock_rows = [
            {
                "fixture_id": 101,
                "team_id": 20,
                "gameweek": 1,
                "home_points": 45,
                "away_points": 0,
                "is_home": True,
                "opponent_id": 1,
            },
            {
                "fixture_id": 115,
                "team_id": 20,
                "gameweek": 2,
                "home_points": 0,
                "away_points": 52,
                "is_home": False,
                "opponent_id": 6,
            },
        ]

        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = mock_rows

        with patch("app.services.points_against.get_connection") as mock_get_conn:
            mock_get_conn.return_value.__aenter__.return_value = mock_conn

            result = await service.get_team_history(team_id=20, season_id=1)

        assert len(result) == 2
        assert isinstance(result[0], FixturePointsAgainst)
        assert result[0].fixture_id == 101
        assert result[0].gameweek == 1
        assert result[0].home_points == 45
        assert result[0].is_home is True
        assert result[1].away_points == 52
        assert result[1].is_home is False

    async def test_returns_empty_for_team_with_no_matches(
        self, service: PointsAgainstService
    ):
        """Should return empty list when team has no fixture data."""
        mock_conn = AsyncMock()
        mock_conn.fetch.return_value = []

        with patch("app.services.points_against.get_connection") as mock_get_conn:
            mock_get_conn.return_value.__aenter__.return_value = mock_conn

            result = await service.get_team_history(team_id=99, season_id=1)

        assert result == []


class TestGetCollectionStatus:
    """Tests for get_collection_status method."""

    async def test_returns_status(self, service: PointsAgainstService):
        """Should return CollectionStatus when data exists."""
        last_full = datetime(2025, 1, 3, 3, 0, 0, tzinfo=UTC)
        last_incr = datetime(2025, 1, 5, 3, 0, 0, tzinfo=UTC)

        mock_row = {
            "season_id": 1,
            "latest_gameweek": 20,
            "total_players_processed": 700,
            "last_full_collection": last_full,
            "last_incremental_update": last_incr,
            "status": "idle",
            "error_message": None,
        }

        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = mock_row

        with patch("app.services.points_against.get_connection") as mock_get_conn:
            mock_get_conn.return_value.__aenter__.return_value = mock_conn

            result = await service.get_collection_status()

        assert isinstance(result, CollectionStatus)
        assert result.season_id == 1
        assert result.latest_gameweek == 20
        assert result.total_players_processed == 700
        assert result.status == "idle"
        assert result.last_full_collection == last_full
        assert result.last_incremental_update == last_incr

    async def test_returns_none_when_not_initialized(
        self, service: PointsAgainstService
    ):
        """Should return None when collection has never run."""
        mock_conn = AsyncMock()
        mock_conn.fetchrow.return_value = None

        with patch("app.services.points_against.get_connection") as mock_get_conn:
            mock_get_conn.return_value.__aenter__.return_value = mock_conn

            result = await service.get_collection_status()

        assert result is None


class TestSaveFixturePoints:
    """Tests for save_fixture_points method."""

    async def test_executes_upsert(self, service: PointsAgainstService):
        """Should execute INSERT...ON CONFLICT with correct parameters."""
        mock_conn = AsyncMock()

        await service.save_fixture_points(
            conn=mock_conn,
            fixture_id=101,
            team_id=20,
            season_id=1,
            gameweek=1,
            home_points=45,
            away_points=12,
            is_home=True,
            opponent_id=1,
        )

        mock_conn.execute.assert_called_once()
        call_args = mock_conn.execute.call_args
        # Verify the SQL contains upsert pattern
        assert "INSERT INTO points_against_by_fixture" in call_args[0][0]
        assert "ON CONFLICT" in call_args[0][0]
        # Verify parameters
        assert call_args[0][1] == 101  # fixture_id
        assert call_args[0][2] == 20  # team_id
        assert call_args[0][3] == 1  # season_id


class TestClearSeasonData:
    """Tests for clear_season_data method."""

    async def test_deletes_and_returns_count(self, service: PointsAgainstService):
        """Should delete data and return row count."""
        mock_conn = AsyncMock()
        mock_conn.execute.return_value = "DELETE 150"

        with patch("app.services.points_against.get_connection") as mock_get_conn:
            mock_get_conn.return_value.__aenter__.return_value = mock_conn

            count = await service.clear_season_data(season_id=1)

        assert count == 150
        mock_conn.execute.assert_called_once()
        call_args = mock_conn.execute.call_args
        assert "DELETE FROM points_against_by_fixture" in call_args[0][0]

    async def test_returns_zero_for_empty_result(self, service: PointsAgainstService):
        """Should return 0 when no rows deleted."""
        mock_conn = AsyncMock()
        mock_conn.execute.return_value = "DELETE 0"

        with patch("app.services.points_against.get_connection") as mock_get_conn:
            mock_get_conn.return_value.__aenter__.return_value = mock_conn

            count = await service.clear_season_data(season_id=99)

        assert count == 0


class TestUpdateCollectionStatus:
    """Tests for update_collection_status method."""

    async def test_updates_status_for_full_collection(
        self, service: PointsAgainstService
    ):
        """Should execute upsert with is_full_collection=True."""
        mock_conn = AsyncMock()

        await service.update_collection_status(
            conn=mock_conn,
            season_id=1,
            latest_gameweek=20,
            total_players_processed=700,
            status="idle",
            is_full_collection=True,
        )

        mock_conn.execute.assert_called_once()
        call_args = mock_conn.execute.call_args
        # Verify upsert SQL pattern
        assert "INSERT INTO points_against_collection_status" in call_args[0][0]
        assert "ON CONFLICT" in call_args[0][0]
        # Verify is_full_collection parameter position (6th, after error_message)
        assert call_args[0][6] is True

    async def test_updates_status_for_incremental_update(
        self, service: PointsAgainstService
    ):
        """Should execute upsert with is_full_collection=False."""
        mock_conn = AsyncMock()

        await service.update_collection_status(
            conn=mock_conn,
            season_id=1,
            latest_gameweek=20,
            total_players_processed=700,
            status="idle",
            is_full_collection=False,
        )

        mock_conn.execute.assert_called_once()
        call_args = mock_conn.execute.call_args
        # Verify is_full_collection=False is passed
        assert call_args[0][6] is False

    async def test_records_error_message(self, service: PointsAgainstService):
        """Should save error message when provided."""
        mock_conn = AsyncMock()

        await service.update_collection_status(
            conn=mock_conn,
            season_id=1,
            latest_gameweek=20,
            total_players_processed=700,
            status="error",
            error_message="Connection timeout",
        )

        mock_conn.execute.assert_called_once()
        call_args = mock_conn.execute.call_args
        # error_message is 5th parameter
        assert call_args[0][5] == "Connection timeout"
