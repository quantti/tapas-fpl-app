"""Integration tests for dashboard endpoint.

Tests cover:
- Endpoint validation (league_id, gameweek, season_id)
- Response structure
- Database unavailable handling (503)
- Caching behavior
- 404 for non-existent league
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.services.dashboard import (
    LeagueDashboard,
    LeagueNotFoundError,
    ManagerDashboard,
    ManagerPick,
    ManagerTransfer,
)


# Note: async_client and mock_pool fixtures are defined in conftest.py


@pytest.fixture
def mock_dashboard_service():
    """Mock DashboardService to avoid DB calls."""
    with patch("app.api.routes.DashboardService") as mock_cls:
        mock_service = AsyncMock()
        mock_cls.return_value = mock_service
        yield mock_service


@pytest.fixture
def sample_dashboard_response():
    """Sample LeagueDashboard response using actual dataclasses."""
    pick = ManagerPick(
        position=1,
        player_id=427,
        player_name="Salah",
        team_id=12,
        team_short_name="LIV",
        element_type=3,
        is_captain=True,
        is_vice_captain=False,
        multiplier=2,
        now_cost=134,
        form=9.8,
        points_per_game=8.1,
        selected_by_percent=78.2,
    )

    transfer = ManagerTransfer(
        player_in_id=427,
        player_in_name="Salah",
        player_out_id=355,
        player_out_name="Haaland",
    )

    manager = ManagerDashboard(
        entry_id=123,
        manager_name="John Doe",
        team_name="FC United",
        total_points=1250,
        gw_points=65,
        rank=1,
        last_rank=2,
        overall_rank=50000,
        last_overall_rank=None,
        bank=0.5,
        team_value=102.3,
        transfers_made=1,
        transfer_cost=0,
        chip_active=None,
        picks=[pick],
        chips_used=["wildcard_1"],
        transfers=[transfer],
    )

    return LeagueDashboard(
        league_id=242017,
        gameweek=21,
        season_id=1,
        managers=[manager],
    )


class TestDashboardEndpointValidation:
    """Tests for endpoint parameter validation."""

    @pytest.mark.parametrize(
        ("url", "description"),
        [
            ("/api/v1/dashboard/league/-1", "negative league_id"),
            ("/api/v1/dashboard/league/0", "zero league_id"),
            ("/api/v1/dashboard/league/242017?gameweek=-1", "negative gameweek"),
            ("/api/v1/dashboard/league/242017?gameweek=0", "zero gameweek"),
            ("/api/v1/dashboard/league/242017?gameweek=39", "gameweek over 38"),
            ("/api/v1/dashboard/league/242017?season_id=0", "zero season_id"),
        ],
        ids=[
            "negative_league_id",
            "zero_league_id",
            "negative_gameweek",
            "zero_gameweek",
            "gameweek_over_38",
            "zero_season_id",
        ],
    )
    async def test_returns_422_for_invalid_parameters(
        self, async_client: AsyncClient, mock_pool, url: str, description: str
    ):
        """Invalid parameters should return 422."""
        response = await async_client.get(url)
        assert response.status_code == 422, f"Expected 422 for {description}"


class TestDashboardEndpointDatabaseUnavailable:
    """Tests for database unavailable scenarios."""

    async def test_returns_503_when_db_unavailable(self, async_client: AsyncClient):
        """Should return 503 when database is unavailable."""
        # Mock get_pool to raise RuntimeError (DB unavailable)
        with patch(
            "app.dependencies.get_pool",
            side_effect=RuntimeError("Database pool not initialized"),
        ):
            response = await async_client.get("/api/v1/dashboard/league/242017")

        assert response.status_code == 503
        assert "Database not available" in response.json()["detail"]


class TestDashboardEndpointResponseStructure:
    """Tests for response JSON structure."""

    async def test_response_has_required_top_level_fields(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
        sample_dashboard_response,
    ):
        """Response should have league_id, gameweek, season_id, managers."""
        mock_dashboard_service.get_league_dashboard.return_value = sample_dashboard_response

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_conn.return_value.__aenter__ = AsyncMock()
            mock_conn.return_value.__aexit__ = AsyncMock()

            response = await async_client.get(
                "/api/v1/dashboard/league/242017?gameweek=21"
            )

        assert response.status_code == 200
        data = response.json()

        assert "league_id" in data
        assert "gameweek" in data
        assert "season_id" in data
        assert "managers" in data
        assert isinstance(data["managers"], list)

    async def test_manager_has_required_fields(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
        sample_dashboard_response,
    ):
        """Each manager should have all required fields."""
        mock_dashboard_service.get_league_dashboard.return_value = sample_dashboard_response

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_conn.return_value.__aenter__ = AsyncMock()
            mock_conn.return_value.__aexit__ = AsyncMock()

            response = await async_client.get(
                "/api/v1/dashboard/league/242017?gameweek=21"
            )

        data = response.json()
        manager = data["managers"][0]

        required_fields = [
            "entry_id",
            "manager_name",
            "team_name",
            "total_points",
            "gw_points",
            "rank",
            "last_rank",
            "overall_rank",
            "last_overall_rank",
            "bank",
            "team_value",
            "transfers_made",
            "transfer_cost",
            "chip_active",
            "picks",
            "chips_used",
            "transfers",
        ]

        for field in required_fields:
            assert field in manager, f"Missing field: {field}"

    async def test_pick_has_required_fields(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
        sample_dashboard_response,
    ):
        """Each pick should have all required fields."""
        mock_dashboard_service.get_league_dashboard.return_value = sample_dashboard_response

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_conn.return_value.__aenter__ = AsyncMock()
            mock_conn.return_value.__aexit__ = AsyncMock()

            response = await async_client.get(
                "/api/v1/dashboard/league/242017?gameweek=21"
            )

        data = response.json()
        pick = data["managers"][0]["picks"][0]

        required_fields = [
            "position",
            "player_id",
            "player_name",
            "team_id",
            "team_short_name",
            "element_type",
            "is_captain",
            "is_vice_captain",
            "multiplier",
            "now_cost",
            "form",
            "points_per_game",
            "selected_by_percent",
        ]

        for field in required_fields:
            assert field in pick, f"Missing field: {field}"

    async def test_transfer_has_required_fields(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
        sample_dashboard_response,
    ):
        """Each transfer should have all required fields."""
        mock_dashboard_service.get_league_dashboard.return_value = sample_dashboard_response

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_conn.return_value.__aenter__ = AsyncMock()
            mock_conn.return_value.__aexit__ = AsyncMock()

            response = await async_client.get(
                "/api/v1/dashboard/league/242017?gameweek=21"
            )

        data = response.json()
        transfer = data["managers"][0]["transfers"][0]

        required_fields = [
            "player_in_id",
            "player_in_name",
            "player_out_id",
            "player_out_name",
        ]

        for field in required_fields:
            assert field in transfer, f"Missing field: {field}"


class TestDashboardEndpointDefaultValues:
    """Tests for default parameter handling."""

    async def test_uses_current_gameweek_when_not_specified(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
        sample_dashboard_response,
    ):
        """Should use current gameweek from DB when not specified."""
        mock_dashboard_service.get_league_dashboard.return_value = sample_dashboard_response

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            # Simulate fetchval returning current gameweek
            mock_ctx.fetchval.return_value = 21
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock()

            response = await async_client.get("/api/v1/dashboard/league/242017")

        assert response.status_code == 200
        # Verify service was called with gameweek 21
        call_args = mock_dashboard_service.get_league_dashboard.call_args
        assert call_args[0][1] == 21  # gameweek parameter

    async def test_uses_season_id_1_when_not_specified(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
        sample_dashboard_response,
    ):
        """Should default to season_id=1 when not specified."""
        mock_dashboard_service.get_league_dashboard.return_value = sample_dashboard_response

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            mock_ctx.fetchval.return_value = 21
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock()

            response = await async_client.get(
                "/api/v1/dashboard/league/242017?gameweek=21"
            )

        assert response.status_code == 200
        # Verify service was called with season_id=1
        call_args = mock_dashboard_service.get_league_dashboard.call_args
        assert call_args[0][2] == 1  # season_id parameter


class TestDashboardEndpointCaching:
    """Tests for response caching."""

    def test_cache_configured_with_ttl_constant(self):
        """Cache should be configured with DASHBOARD_CACHE_TTL_SECONDS."""
        from app.api.routes import DASHBOARD_CACHE_TTL_SECONDS, _dashboard_cache

        # Verify the cache TTL matches our constant
        assert _dashboard_cache.ttl == DASHBOARD_CACHE_TTL_SECONDS
        assert DASHBOARD_CACHE_TTL_SECONDS == 300  # 5 minutes

    async def test_second_request_uses_cache(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
        sample_dashboard_response,
    ):
        """Second request should return cached response."""
        mock_dashboard_service.get_league_dashboard.return_value = sample_dashboard_response

        # Clear cache before test
        from app.api.routes import _dashboard_cache

        _dashboard_cache.clear()

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock()

            # First request
            r1 = await async_client.get(
                "/api/v1/dashboard/league/242017?gameweek=21&season_id=1"
            )
            # Second request (should use cache)
            r2 = await async_client.get(
                "/api/v1/dashboard/league/242017?gameweek=21&season_id=1"
            )

        # Service should only be called once (second request uses cache)
        assert mock_dashboard_service.get_league_dashboard.call_count == 1
        # Both responses should be the same
        assert r1.json() == r2.json()

    async def test_different_gameweeks_are_cached_separately(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
        sample_dashboard_response,
    ):
        """Different gameweeks should have separate cache entries."""
        mock_dashboard_service.get_league_dashboard.return_value = sample_dashboard_response

        # Clear cache before test
        from app.api.routes import _dashboard_cache

        _dashboard_cache.clear()

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock()

            # Request GW 21
            await async_client.get(
                "/api/v1/dashboard/league/242017?gameweek=21&season_id=1"
            )
            # Request GW 20 (different cache key)
            await async_client.get(
                "/api/v1/dashboard/league/242017?gameweek=20&season_id=1"
            )

        # Service should be called twice (different cache keys)
        assert mock_dashboard_service.get_league_dashboard.call_count == 2


class TestDashboardEndpointEmptyLeague:
    """Tests for empty league handling."""

    async def test_empty_league_returns_200_with_empty_managers(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
    ):
        """Empty league should return 200 with empty managers list."""
        from unittest.mock import MagicMock

        mock_response = MagicMock()
        mock_response.league_id = 999999
        mock_response.gameweek = 21
        mock_response.season_id = 1
        mock_response.managers = []

        mock_dashboard_service.get_league_dashboard.return_value = mock_response

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock()

            response = await async_client.get(
                "/api/v1/dashboard/league/999999?gameweek=21"
            )

        assert response.status_code == 200
        data = response.json()
        assert data["league_id"] == 999999
        assert data["managers"] == []


class TestDashboardEndpointLeagueNotFound:
    """Tests for non-existent league handling."""

    async def test_returns_404_for_nonexistent_league(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
    ):
        """Should return 404 when league doesn't exist in database."""
        # Clear cache to avoid stale data from previous tests
        from app.api.routes import _dashboard_cache

        _dashboard_cache.clear()

        mock_dashboard_service.get_league_dashboard.side_effect = LeagueNotFoundError(
            "League 999999 not found"
        )

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_conn.return_value.__aenter__ = AsyncMock()
            # __aexit__ must return falsy to not suppress exceptions
            mock_conn.return_value.__aexit__ = AsyncMock(return_value=None)

            response = await async_client.get(
                "/api/v1/dashboard/league/999999?gameweek=21"
            )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


class TestDashboardEndpointEdgeCases:
    """Tests for edge cases and error handling."""

    async def test_uses_gameweek_1_when_no_current_gameweek_in_db(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
        sample_dashboard_response,
    ):
        """Should default to GW1 when no current gameweek exists in DB (pre-season)."""
        mock_dashboard_service.get_league_dashboard.return_value = sample_dashboard_response

        # Clear cache
        from app.api.routes import _dashboard_cache

        _dashboard_cache.clear()

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            # Simulate no current gameweek (pre-season scenario)
            mock_ctx.fetchval.return_value = None
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock()

            response = await async_client.get("/api/v1/dashboard/league/242017")

        assert response.status_code == 200
        # Verify service was called with gameweek 1 (fallback)
        call_args = mock_dashboard_service.get_league_dashboard.call_args
        assert call_args[0][1] == 1  # gameweek defaults to 1

    async def test_returns_500_on_service_exception(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
    ):
        """Should return 500 when service raises unexpected exception."""
        from app.api.routes import _dashboard_cache

        _dashboard_cache.clear()

        mock_dashboard_service.get_league_dashboard.side_effect = RuntimeError(
            "Unexpected database error"
        )

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_conn.return_value.__aenter__ = AsyncMock()
            mock_conn.return_value.__aexit__ = AsyncMock(return_value=None)

            response = await async_client.get(
                "/api/v1/dashboard/league/242017?gameweek=21"
            )

        assert response.status_code == 500
        assert "internal server error" in response.json()["detail"].lower()

    async def test_cache_hit_after_gameweek_resolution(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_dashboard_service,
        sample_dashboard_response,
    ):
        """Second request without gameweek should hit cache after GW resolved."""
        mock_dashboard_service.get_league_dashboard.return_value = sample_dashboard_response

        from app.api.routes import _dashboard_cache

        _dashboard_cache.clear()

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            mock_ctx.fetchval.return_value = 21  # Current gameweek
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock()

            # First request (no gameweek specified, resolves to 21)
            await async_client.get("/api/v1/dashboard/league/242017")
            # Second request (also no gameweek specified)
            await async_client.get("/api/v1/dashboard/league/242017")

        # Service should only be called once (second request uses cache)
        assert mock_dashboard_service.get_league_dashboard.call_count == 1
