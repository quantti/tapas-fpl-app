"""Integration tests for Set and Forget endpoint.

Tests cover:
- Endpoint validation (league_id, current_gameweek, season_id)
- Response structure
- Database unavailable handling (503)
- Caching behavior
- 404 for non-existent league
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.services.set_and_forget import SetAndForgetResult


# Note: async_client and mock_pool fixtures are defined in conftest.py


@pytest.fixture
def mock_set_and_forget_service():
    """Mock SetAndForgetService to avoid DB calls."""
    with patch("app.api.routes.SetAndForgetService") as mock_cls:
        mock_service = AsyncMock()
        mock_cls.return_value = mock_service
        yield mock_service


@pytest.fixture
def sample_set_and_forget_result():
    """Sample SetAndForgetResult response."""
    return SetAndForgetResult(
        total_points=1250,
        actual_points=1200,
        difference=50,
        auto_subs_made=15,
        captain_points_gained=120,
    )


class TestSetAndForgetEndpointValidation:
    """Tests for endpoint parameter validation."""

    @pytest.mark.parametrize(
        ("url", "description"),
        [
            ("/api/v1/set-and-forget/league/-1?current_gameweek=21", "negative league_id"),
            ("/api/v1/set-and-forget/league/0?current_gameweek=21", "zero league_id"),
            ("/api/v1/set-and-forget/league/242017?current_gameweek=-1", "negative gameweek"),
            ("/api/v1/set-and-forget/league/242017?current_gameweek=0", "zero gameweek"),
            ("/api/v1/set-and-forget/league/242017?current_gameweek=39", "gameweek over 38"),
            ("/api/v1/set-and-forget/league/242017?current_gameweek=21&season_id=0", "zero season_id"),
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

    async def test_returns_422_when_current_gameweek_missing(
        self, async_client: AsyncClient, mock_pool
    ):
        """Should return 422 when required current_gameweek is missing."""
        response = await async_client.get("/api/v1/set-and-forget/league/242017")
        assert response.status_code == 422


class TestSetAndForgetEndpointDatabaseUnavailable:
    """Tests for database unavailable scenarios."""

    async def test_returns_503_when_db_unavailable(self, async_client: AsyncClient):
        """Should return 503 when database is unavailable."""
        with patch(
            "app.dependencies.get_pool",
            side_effect=RuntimeError("Database pool not initialized"),
        ):
            response = await async_client.get(
                "/api/v1/set-and-forget/league/242017?current_gameweek=21"
            )

        assert response.status_code == 503
        assert "Database not available" in response.json()["detail"]


class TestSetAndForgetEndpointResponseStructure:
    """Tests for response JSON structure."""

    async def test_response_has_required_top_level_fields(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_set_and_forget_service,
        sample_set_and_forget_result,
    ):
        """Response should have league_id, season_id, current_gameweek, managers."""
        mock_set_and_forget_service.calculate.return_value = sample_set_and_forget_result

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            # Mock league_manager query
            mock_ctx.fetch.return_value = [{"manager_id": 123}]
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock()

            response = await async_client.get(
                "/api/v1/set-and-forget/league/242017?current_gameweek=21"
            )

        assert response.status_code == 200
        data = response.json()

        assert "league_id" in data
        assert "season_id" in data
        assert "current_gameweek" in data
        assert "managers" in data
        assert isinstance(data["managers"], list)

    async def test_manager_has_required_fields(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_set_and_forget_service,
        sample_set_and_forget_result,
    ):
        """Each manager should have all required fields."""
        mock_set_and_forget_service.calculate.return_value = sample_set_and_forget_result

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            mock_ctx.fetch.return_value = [{"manager_id": 123}]
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock()

            response = await async_client.get(
                "/api/v1/set-and-forget/league/242017?current_gameweek=21"
            )

        data = response.json()
        manager = data["managers"][0]

        required_fields = [
            "manager_id",
            "total_points",
            "actual_points",
            "difference",
            "auto_subs_made",
            "captain_points_gained",
        ]

        for field in required_fields:
            assert field in manager, f"Missing field: {field}"


class TestSetAndForgetEndpointDefaultValues:
    """Tests for default parameter handling."""

    async def test_uses_season_id_1_when_not_specified(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_set_and_forget_service,
        sample_set_and_forget_result,
    ):
        """Should default to season_id=1 when not specified."""
        mock_set_and_forget_service.calculate.return_value = sample_set_and_forget_result

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            mock_ctx.fetch.return_value = [{"manager_id": 123}]
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock()

            response = await async_client.get(
                "/api/v1/set-and-forget/league/242017?current_gameweek=21"
            )

        assert response.status_code == 200
        # Verify the response shows season_id=1
        assert response.json()["season_id"] == 1


class TestSetAndForgetEndpointCaching:
    """Tests for response caching."""

    def test_cache_configured_with_ttl_constant(self):
        """Cache should be configured with CACHE_TTL_SECONDS."""
        from app.api.routes import CACHE_TTL_SECONDS, _set_and_forget_cache

        assert _set_and_forget_cache.ttl == CACHE_TTL_SECONDS
        assert CACHE_TTL_SECONDS == 600  # 10 minutes

    async def test_second_request_uses_cache(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_set_and_forget_service,
        sample_set_and_forget_result,
    ):
        """Second request should return cached response."""
        mock_set_and_forget_service.calculate.return_value = sample_set_and_forget_result

        # Clear cache before test
        from app.api.routes import _set_and_forget_cache

        _set_and_forget_cache.clear()

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            mock_ctx.fetch.return_value = [{"manager_id": 123}]
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock()

            # First request
            r1 = await async_client.get(
                "/api/v1/set-and-forget/league/242017?current_gameweek=21&season_id=1"
            )
            # Second request (should use cache)
            r2 = await async_client.get(
                "/api/v1/set-and-forget/league/242017?current_gameweek=21&season_id=1"
            )

        # Service should only be called once (second request uses cache)
        assert mock_set_and_forget_service.calculate.call_count == 1
        # Both responses should be the same
        assert r1.json() == r2.json()


class TestSetAndForgetEndpointLeagueNotFound:
    """Tests for non-existent league handling."""

    async def test_returns_404_for_nonexistent_league(
        self,
        async_client: AsyncClient,
        mock_pool,
    ):
        """Should return 404 when league doesn't exist in database."""
        from app.api.routes import _set_and_forget_cache

        _set_and_forget_cache.clear()

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            # Empty result = no managers in league
            mock_ctx.fetch.return_value = []
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock(return_value=None)

            response = await async_client.get(
                "/api/v1/set-and-forget/league/999999?current_gameweek=21"
            )

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


class TestSetAndForgetEndpointSorting:
    """Tests for response sorting."""

    async def test_managers_sorted_by_difference_descending(
        self,
        async_client: AsyncClient,
        mock_pool,
        mock_set_and_forget_service,
    ):
        """Managers should be sorted by difference (best set-and-forget performance first)."""
        from app.api.routes import _set_and_forget_cache

        _set_and_forget_cache.clear()

        # Return different results for different managers
        results = [
            SetAndForgetResult(1100, 1000, 100, 10, 50),  # +100
            SetAndForgetResult(900, 1000, -100, 5, 30),   # -100
            SetAndForgetResult(1050, 1000, 50, 8, 40),    # +50
        ]
        mock_set_and_forget_service.calculate.side_effect = results

        with patch("app.api.routes.get_connection") as mock_conn:
            mock_ctx = AsyncMock()
            mock_ctx.fetch.return_value = [
                {"manager_id": 1},
                {"manager_id": 2},
                {"manager_id": 3},
            ]
            mock_conn.return_value.__aenter__.return_value = mock_ctx
            mock_conn.return_value.__aexit__ = AsyncMock()

            response = await async_client.get(
                "/api/v1/set-and-forget/league/242017?current_gameweek=21"
            )

        data = response.json()
        differences = [m["difference"] for m in data["managers"]]

        # Should be sorted descending by difference
        assert differences == [100, 50, -100]
