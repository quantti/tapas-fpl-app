"""Tests for league ownership database integration in recommendations.

TDD tests for Phase 6: Replace API-based ownership fetching with DB queries.

Tests cover:
- _get_league_ownership_from_db: Query pre-computed ownership from league_ownership table
- Fallback logic: Use DB when available, fall back to API when not
"""

from collections import Counter
from typing import TypedDict
from unittest.mock import AsyncMock, MagicMock, patch

import asyncpg
import pytest


# =============================================================================
# TypedDicts for Mock Data
# =============================================================================


class OwnershipRow(TypedDict):
    """Database row structure for league_ownership query."""

    player_id: int
    ownership_count: int


# =============================================================================
# Shared Fixtures
# =============================================================================


@pytest.fixture
def mock_conn() -> AsyncMock:
    """Create a mock asyncpg connection."""
    return AsyncMock()


@pytest.fixture
def mock_fpl_client() -> MagicMock:
    """Create a mock FPL API client."""
    client = MagicMock()
    client.get_league_standings_raw = AsyncMock()
    client.get_manager_picks = AsyncMock()
    return client


@pytest.fixture
def recommendations_service(mock_fpl_client: MagicMock):
    """Create RecommendationsService with mocked FPL client."""
    from app.services.recommendations import RecommendationsService

    return RecommendationsService(fpl_client=mock_fpl_client)


# =============================================================================
# Tests: _get_league_ownership_from_db
# =============================================================================


class TestGetLeagueOwnershipFromDb:
    """Tests for _get_league_ownership_from_db method."""

    async def test_returns_counter_with_ownership_counts(
        self, recommendations_service, mock_conn: AsyncMock
    ):
        """Should return Counter mapping player_id to ownership_count."""
        mock_conn.fetch.return_value = [
            OwnershipRow(player_id=303, ownership_count=15),
            OwnershipRow(player_id=427, ownership_count=18),
            OwnershipRow(player_id=128, ownership_count=12),
        ]

        result = await recommendations_service._get_league_ownership_from_db(
            conn=mock_conn,
            league_id=242017,
            season_id=2,
            gameweek=20,
        )

        assert isinstance(result, Counter)
        assert result[303] == 15
        assert result[427] == 18
        assert result[128] == 12

    async def test_returns_empty_counter_when_no_data(
        self, recommendations_service, mock_conn: AsyncMock
    ):
        """Should return empty Counter when no ownership data exists."""
        mock_conn.fetch.return_value = []

        result = await recommendations_service._get_league_ownership_from_db(
            conn=mock_conn,
            league_id=242017,
            season_id=2,
            gameweek=20,
        )

        assert isinstance(result, Counter)
        assert len(result) == 0

    async def test_query_filters_by_league_season_gameweek(
        self, recommendations_service, mock_conn: AsyncMock
    ):
        """Should query with correct league_id, season_id, and gameweek."""
        mock_conn.fetch.return_value = []

        await recommendations_service._get_league_ownership_from_db(
            conn=mock_conn,
            league_id=242017,
            season_id=2,
            gameweek=15,
        )

        # Verify fetch was called with correct params
        mock_conn.fetch.assert_called_once()
        call_args = mock_conn.fetch.call_args
        # Check positional args after the SQL query string
        assert call_args[0][1] == 242017  # league_id
        assert call_args[0][2] == 2  # season_id
        assert call_args[0][3] == 15  # gameweek

    async def test_handles_none_result_gracefully(
        self, recommendations_service, mock_conn: AsyncMock
    ):
        """Should handle None result from database."""
        mock_conn.fetch.return_value = None

        result = await recommendations_service._get_league_ownership_from_db(
            conn=mock_conn,
            league_id=242017,
            season_id=2,
            gameweek=20,
        )

        assert isinstance(result, Counter)
        assert len(result) == 0


# =============================================================================
# Tests: Ownership Source Selection (DB vs API fallback)
# =============================================================================


class TestOwnershipSourceSelection:
    """Tests for choosing between DB and API for ownership data."""

    async def test_uses_db_when_ownership_data_exists(
        self, recommendations_service, mock_conn: AsyncMock
    ):
        """Should use DB ownership when data exists for the gameweek."""
        # Mock DB has ownership data
        mock_conn.fetchval.return_value = 150  # 150 player records exist

        with patch.object(
            recommendations_service,
            "_get_league_ownership_from_db",
            new_callable=AsyncMock,
        ) as mock_db_ownership:
            mock_db_ownership.return_value = Counter({303: 15, 427: 18})

            result = await recommendations_service._get_ownership_data(
                conn=mock_conn,
                league_id=242017,
                season_id=2,
                gameweek=20,
            )

            # Should call DB method
            mock_db_ownership.assert_called_once_with(
                conn=mock_conn,
                league_id=242017,
                season_id=2,
                gameweek=20,
            )
            assert result["player_counts"][303] == 15

    async def test_falls_back_to_api_when_no_db_data(
        self, recommendations_service, mock_conn: AsyncMock, mock_fpl_client: MagicMock
    ):
        """Should fall back to API when no ownership data in DB."""
        # Mock DB has no ownership data
        mock_conn.fetchval.return_value = 0

        # Mock API response
        mock_fpl_client.get_league_standings_raw.return_value = {
            "standings": {"results": [{"entry": 123}, {"entry": 456}]}
        }
        mock_fpl_client.get_manager_picks.return_value = {
            "picks": [{"element": 303}, {"element": 427}]
        }

        with patch.object(
            recommendations_service,
            "_fetch_league_ownership",
            new_callable=AsyncMock,
        ) as mock_api_ownership:
            mock_api_ownership.return_value = {
                "manager_ids": [123, 456],
                "player_counts": Counter({303: 2, 427: 2}),
                "failed_count": 0,
            }

            result = await recommendations_service._get_ownership_data(
                conn=mock_conn,
                league_id=242017,
                season_id=2,
                gameweek=20,
            )

            # Should call API method as fallback
            mock_api_ownership.assert_called_once_with(242017)
            assert result["player_counts"][303] == 2

    async def test_returns_manager_count_from_db(
        self, recommendations_service, mock_conn: AsyncMock
    ):
        """Should return manager count when using DB source."""
        # Mock DB has ownership data with manager count
        mock_conn.fetchval.side_effect = [150, 20]  # record count, manager count

        with patch.object(
            recommendations_service,
            "_get_league_ownership_from_db",
            new_callable=AsyncMock,
        ) as mock_db_ownership:
            mock_db_ownership.return_value = Counter({303: 15})

            result = await recommendations_service._get_ownership_data(
                conn=mock_conn,
                league_id=242017,
                season_id=2,
                gameweek=20,
            )

            assert "manager_ids" in result or "manager_count" in result

    async def test_logs_when_falling_back_to_api(
        self, recommendations_service, mock_conn: AsyncMock, mock_fpl_client: MagicMock
    ):
        """Should log warning message when falling back to API."""
        mock_conn.fetchval.return_value = 0  # No DB data

        with patch.object(
            recommendations_service,
            "_fetch_league_ownership",
            new_callable=AsyncMock,
        ) as mock_api_ownership:
            mock_api_ownership.return_value = {
                "manager_ids": [],
                "player_counts": Counter(),
                "failed_count": 0,
            }

            with patch("app.services.recommendations.logger") as mock_logger:
                await recommendations_service._get_ownership_data(
                    conn=mock_conn,
                    league_id=242017,
                    season_id=2,
                    gameweek=20,
                )

                # Should log warning that we're falling back with specific message
                mock_logger.warning.assert_called()
                # Check for the exact fallback message pattern
                log_calls = [str(call) for call in mock_logger.warning.call_args_list]
                assert any(
                    "falling back to API" in call for call in log_calls
                ), f"Expected 'falling back to API' in log calls: {log_calls}"


# =============================================================================
# Tests: Integration with get_recommendations
# =============================================================================


class TestGetRecommendationsOwnershipIntegration:
    """Tests for ownership integration in main get_recommendations flow."""

    async def test_get_ownership_data_returns_api_result_structure(
        self, recommendations_service, mock_conn: AsyncMock, mock_fpl_client: MagicMock
    ):
        """API fallback should return dict with manager_ids, player_counts, failed_count."""
        mock_conn.fetchval.return_value = 0  # No DB data

        with patch.object(
            recommendations_service,
            "_fetch_league_ownership",
            new_callable=AsyncMock,
        ) as mock_api:
            mock_api.return_value = {
                "manager_ids": [123, 456],
                "player_counts": Counter({303: 2}),
                "failed_count": 0,
            }

            result = await recommendations_service._get_ownership_data(
                conn=mock_conn,
                league_id=242017,
                season_id=2,
                gameweek=20,
            )

            assert "player_counts" in result
            assert "failed_count" in result

    async def test_get_ownership_data_db_result_includes_source(
        self, recommendations_service, mock_conn: AsyncMock
    ):
        """DB path should return result with source='db' indicator."""
        # Manager count query returns 20
        mock_conn.fetchval.return_value = 20

        with patch.object(
            recommendations_service,
            "_get_league_ownership_from_db",
            new_callable=AsyncMock,
        ) as mock_db:
            mock_db.return_value = Counter({303: 15})

            result = await recommendations_service._get_ownership_data(
                conn=mock_conn,
                league_id=242017,
                season_id=2,
                gameweek=20,
            )

            assert result.get("source") == "db"
            assert result["manager_count"] == 20


# =============================================================================
# Tests: Database Exception Handling
# =============================================================================


class TestDatabaseExceptionHandling:
    """Tests for graceful handling of database errors."""

    async def test_get_league_ownership_from_db_returns_none_on_db_error(
        self, recommendations_service, mock_conn: AsyncMock
    ):
        """Database errors should return None for graceful fallback."""
        mock_conn.fetch.side_effect = asyncpg.PostgresError("Connection timeout")

        result = await recommendations_service._get_league_ownership_from_db(
            conn=mock_conn,
            league_id=242017,
            season_id=2,
            gameweek=20,
        )

        assert result is None

    async def test_get_ownership_data_falls_back_to_api_on_db_error(
        self, recommendations_service, mock_conn: AsyncMock
    ):
        """Error during DB query should fall back to API instead of raising."""
        # Make _get_league_ownership_from_db return None (simulating DB error)
        with patch.object(
            recommendations_service,
            "_get_league_ownership_from_db",
            new_callable=AsyncMock,
        ) as mock_db, patch.object(
            recommendations_service,
            "_fetch_league_ownership",
            new_callable=AsyncMock,
        ) as mock_api:
            mock_db.return_value = None  # Simulates DB error
            mock_api.return_value = {
                "manager_ids": [1, 2, 3],
                "player_counts": Counter({303: 2}),
                "failed_count": 0,
            }

            result = await recommendations_service._get_ownership_data(
                conn=mock_conn,
                league_id=242017,
                season_id=2,
                gameweek=20,
            )

            # Should fall back to API
            assert result["source"] == "api"
            mock_api.assert_called_once_with(242017)

    async def test_get_ownership_data_falls_back_when_manager_count_query_fails(
        self, recommendations_service, mock_conn: AsyncMock
    ):
        """Should fall back to API when DB ownership succeeds but manager count fails."""
        # Mock: DB ownership query succeeds
        with patch.object(
            recommendations_service,
            "_get_league_ownership_from_db",
            new_callable=AsyncMock,
        ) as mock_db, patch.object(
            recommendations_service,
            "_fetch_league_ownership",
            new_callable=AsyncMock,
        ) as mock_api:
            mock_db.return_value = Counter({303: 15, 427: 18})  # DB succeeds
            # Mock: manager count query fails with DB error
            mock_conn.fetchval.side_effect = asyncpg.PostgresError("Query timeout")
            mock_api.return_value = {
                "manager_ids": [1, 2, 3],
                "player_counts": Counter({303: 2}),
                "failed_count": 0,
            }

            result = await recommendations_service._get_ownership_data(
                conn=mock_conn,
                league_id=242017,
                season_id=2,
                gameweek=20,
            )

            # Should fall back to API when manager count query fails
            assert result["source"] == "api"
            mock_api.assert_called_once_with(242017)

    async def test_falls_back_to_api_when_manager_count_is_zero(
        self, recommendations_service, mock_conn: AsyncMock
    ):
        """Should fall back to API when manager count query returns 0."""
        with patch.object(
            recommendations_service,
            "_get_league_ownership_from_db",
            new_callable=AsyncMock,
        ) as mock_db, patch.object(
            recommendations_service,
            "_fetch_league_ownership",
            new_callable=AsyncMock,
        ) as mock_api:
            mock_db.return_value = Counter({303: 15})  # DB has ownership data
            mock_conn.fetchval.return_value = 0  # But manager count is 0
            mock_api.return_value = {
                "manager_ids": [1, 2, 3],
                "player_counts": Counter({303: 2}),
                "failed_count": 0,
            }

            result = await recommendations_service._get_ownership_data(
                conn=mock_conn,
                league_id=242017,
                season_id=2,
                gameweek=20,
            )

            # Should fall back to API when manager count is 0
            assert result["source"] == "api"
            mock_api.assert_called_once_with(242017)

    async def test_get_league_ownership_from_db_returns_none_on_interface_error(
        self, recommendations_service, mock_conn: AsyncMock
    ):
        """InterfaceError (connection lost) should return None for graceful fallback."""
        mock_conn.fetch.side_effect = asyncpg.InterfaceError("connection is closed")

        result = await recommendations_service._get_league_ownership_from_db(
            conn=mock_conn,
            league_id=242017,
            season_id=2,
            gameweek=20,
        )

        assert result is None


# =============================================================================
# Tests: Boundary Conditions for Verification (compute_league_ownership)
# =============================================================================


class TestVerificationBoundaryConditions:
    """Tests for edge cases in ownership percentage validation."""

    async def test_verify_passes_at_exactly_zero_percent(self, mock_conn: AsyncMock):
        """Should pass verification when min_percent is exactly 0.0."""
        from scripts.compute_league_ownership import verify_league_ownership_data

        mock_conn.fetchrow.return_value = {
            "player_count": 150,
            "total_captains": 20,
            "min_percent": 0.0,  # Exactly 0%
            "max_percent": 95.0,
        }

        result = await verify_league_ownership_data(
            mock_conn,
            season_id=2,
            league_id=242017,
            gameweek=10,
            expected_members=20,
        )

        assert result is True

    async def test_verify_passes_at_exactly_100_percent(self, mock_conn: AsyncMock):
        """Should pass verification when max_percent is exactly 100.0."""
        from scripts.compute_league_ownership import verify_league_ownership_data

        mock_conn.fetchrow.return_value = {
            "player_count": 150,
            "total_captains": 20,
            "min_percent": 5.0,
            "max_percent": 100.0,  # Exactly 100%
        }

        result = await verify_league_ownership_data(
            mock_conn,
            season_id=2,
            league_id=242017,
            gameweek=10,
            expected_members=20,
        )

        assert result is True

    async def test_verify_fails_just_over_100_percent(self, mock_conn: AsyncMock):
        """Should fail verification when max_percent is 100.01."""
        from scripts.compute_league_ownership import verify_league_ownership_data

        mock_conn.fetchrow.return_value = {
            "player_count": 150,
            "total_captains": 20,
            "min_percent": 5.0,
            "max_percent": 100.01,  # Just over 100%
        }

        result = await verify_league_ownership_data(
            mock_conn,
            season_id=2,
            league_id=242017,
            gameweek=10,
            expected_members=20,
        )

        assert result is False

    async def test_verify_fails_just_under_zero_percent(self, mock_conn: AsyncMock):
        """Should fail verification when min_percent is -0.01."""
        from scripts.compute_league_ownership import verify_league_ownership_data

        mock_conn.fetchrow.return_value = {
            "player_count": 150,
            "total_captains": 20,
            "min_percent": -0.01,  # Just under 0%
            "max_percent": 95.0,
        }

        result = await verify_league_ownership_data(
            mock_conn,
            season_id=2,
            league_id=242017,
            gameweek=10,
            expected_members=20,
        )

        assert result is False


# =============================================================================
# Tests: API Route Integration (verifies conn is passed to service)
# =============================================================================


class TestApiRouteConnectionPassing:
    """Tests that the API route passes database connection to the service."""

    async def test_route_passes_conn_to_service(self):
        """The /recommendations endpoint should pass conn to get_league_recommendations."""
        from unittest.mock import patch, AsyncMock, MagicMock

        # Mock the service method to capture arguments
        captured_kwargs = {}

        async def capture_get_league_recommendations(*args, **kwargs):
            captured_kwargs.update(kwargs)
            return {"punts": [], "defensive": [], "time_to_sell": []}

        # Mock dependencies
        mock_conn = AsyncMock()
        mock_fpl_client = MagicMock()
        mock_service = MagicMock()
        mock_service.get_league_recommendations = capture_get_league_recommendations

        with patch("app.db.get_pool") as mock_get_pool, patch(
            "app.api.routes.get_connection"
        ) as mock_get_conn, patch(
            "app.api.routes.FplApiClient"
        ) as mock_fpl_class, patch(
            "app.api.routes.RecommendationsService"
        ) as mock_service_class:
            # Mock get_pool to not raise RuntimeError (pool is "initialized")
            mock_get_pool.return_value = MagicMock()

            # Set up context manager for get_connection
            mock_get_conn.return_value.__aenter__.return_value = mock_conn
            mock_get_conn.return_value.__aexit__.return_value = None

            # Set up FplApiClient context manager
            mock_fpl_class.return_value.__aenter__.return_value = mock_fpl_client
            mock_fpl_class.return_value.__aexit__.return_value = None

            # Set up service to use our capture function
            mock_service_class.return_value = mock_service

            # Import and call the route handler
            from app.api.routes import get_league_recommendations

            await get_league_recommendations(
                league_id=242017, limit=10, season_id=2
            )

            # Verify conn was passed to the service method
            assert "conn" in captured_kwargs, (
                "Route should pass conn parameter to get_league_recommendations. "
                f"Got kwargs: {captured_kwargs}"
            )
            assert captured_kwargs["conn"] is mock_conn

    async def test_service_uses_db_when_conn_provided(
        self, mock_conn: AsyncMock, mock_fpl_client: MagicMock
    ):
        """Service should use DB path when conn is provided and has data."""
        from app.services.recommendations import RecommendationsService

        service = RecommendationsService(fpl_client=mock_fpl_client)

        # Mock _get_league_ownership_from_db to verify it's called
        with patch.object(
            service, "_get_league_ownership_from_db", new_callable=AsyncMock
        ) as mock_db_lookup, patch.object(
            service, "_fetch_league_ownership", new_callable=AsyncMock
        ) as mock_api_lookup:
            mock_db_lookup.return_value = Counter({303: 15})
            mock_conn.fetchval.return_value = 20  # manager count

            await service._get_ownership_data(
                conn=mock_conn,
                league_id=242017,
                season_id=2,
                gameweek=10,
            )

            # DB method should be called
            mock_db_lookup.assert_called_once()
            # API method should NOT be called (DB succeeded)
            mock_api_lookup.assert_not_called()

    async def test_fallback_api_error_returns_empty_structure(
        self, mock_fpl_client: MagicMock
    ):
        """_fallback_to_api_ownership should return empty structure on API error."""
        import httpx
        from app.services.recommendations import RecommendationsService

        service = RecommendationsService(fpl_client=mock_fpl_client)

        with patch.object(
            service, "_fetch_league_ownership", new_callable=AsyncMock
        ) as mock_api:
            mock_api.side_effect = httpx.HTTPError("API timeout")

            result = await service._fallback_to_api_ownership(league_id=242017)

            assert result["source"] == "api_error"
            assert result["manager_count"] == 0
            assert len(result["player_counts"]) == 0
