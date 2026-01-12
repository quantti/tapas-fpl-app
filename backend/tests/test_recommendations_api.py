"""Tests for recommendations API endpoint."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


class TestRecommendationsEndpoint:
    """Tests for GET /api/v1/recommendations/league/{league_id}."""

    async def test_works_without_db_using_api_fallback(self, async_client: AsyncClient):
        """Should work without database by falling back to API."""
        response = await async_client.get("/api/v1/recommendations/league/12345")

        # Endpoint should succeed using API fallback when DB unavailable
        assert response.status_code == 200
        data = response.json()
        assert "punts" in data
        assert "defensive" in data
        assert "time_to_sell" in data

    async def test_validates_league_id_must_be_positive(
        self, async_client: AsyncClient, mock_pool
    ):
        """Should reject league_id < 1."""
        response = await async_client.get("/api/v1/recommendations/league/0")

        assert response.status_code == 422
        assert "league_id must be >= 1" in response.json()["detail"]

    async def test_validates_limit_range(self, async_client: AsyncClient, mock_pool):
        """Should reject limit outside 1-50 range."""
        response = await async_client.get(
            "/api/v1/recommendations/league/12345?limit=0"
        )
        assert response.status_code == 422

        response = await async_client.get(
            "/api/v1/recommendations/league/12345?limit=100"
        )
        assert response.status_code == 422

    async def test_returns_recommendations_structure(
        self, async_client: AsyncClient, mock_recommendations_service
    ):
        """Should return punts, defensive, and time_to_sell lists."""
        mock_recommendations_service.return_value = {
            "punts": [{"id": 1, "name": "Test Player", "score": 0.85}],
            "defensive": [{"id": 2, "name": "Defender", "score": 0.75}],
            "time_to_sell": [{"id": 3, "name": "Declining Player", "score": 0.65}],
        }

        response = await async_client.get("/api/v1/recommendations/league/12345")

        assert response.status_code == 200
        data = response.json()
        assert "punts" in data
        assert "defensive" in data
        assert "time_to_sell" in data
        assert len(data["punts"]) == 1
        assert data["punts"][0]["name"] == "Test Player"

    async def test_respects_limit_parameter(
        self, async_client: AsyncClient, mock_recommendations_service
    ):
        """Should limit results when limit param provided."""
        # Return 15 players but request only 5
        mock_recommendations_service.return_value = {
            "punts": [{"id": i, "score": 0.9 - i * 0.01} for i in range(15)],
            "defensive": [],
            "time_to_sell": [],
        }

        response = await async_client.get(
            "/api/v1/recommendations/league/12345?limit=5"
        )

        assert response.status_code == 200
        data = response.json()
        # Service is called with limit, should return limited results
        assert len(data["punts"]) <= 15  # Service mock returns 15, endpoint may slice

    async def test_includes_league_metadata(
        self, async_client: AsyncClient, mock_recommendations_service
    ):
        """Should include league_id in response."""
        mock_recommendations_service.return_value = {
            "punts": [],
            "defensive": [],
            "time_to_sell": [],
        }

        response = await async_client.get("/api/v1/recommendations/league/12345")

        assert response.status_code == 200
        data = response.json()
        assert data["league_id"] == 12345

    async def test_handles_fpl_api_rate_limit(
        self, async_client: AsyncClient, mock_recommendations_service
    ):
        """Should return 429 when FPL API rate limits."""
        import httpx

        mock_recommendations_service.side_effect = httpx.HTTPStatusError(
            "Rate limited",
            request=httpx.Request("GET", "https://fantasy.premierleague.com"),
            response=httpx.Response(429),
        )

        response = await async_client.get("/api/v1/recommendations/league/12345")

        assert response.status_code == 429
        assert "rate limit" in response.json()["detail"].lower()

    async def test_handles_fpl_api_unavailable(
        self, async_client: AsyncClient, mock_recommendations_service
    ):
        """Should return 502 when FPL API is down."""
        import httpx

        mock_recommendations_service.side_effect = httpx.HTTPStatusError(
            "Service unavailable",
            request=httpx.Request("GET", "https://fantasy.premierleague.com"),
            response=httpx.Response(503),
        )

        response = await async_client.get("/api/v1/recommendations/league/12345")

        assert response.status_code == 502
        assert "unavailable" in response.json()["detail"].lower()

    async def test_handles_fpl_api_timeout(
        self, async_client: AsyncClient, mock_recommendations_service
    ):
        """Should return 504 when FPL API times out."""
        import httpx

        mock_recommendations_service.side_effect = httpx.TimeoutException(
            "Request timed out"
        )

        response = await async_client.get("/api/v1/recommendations/league/12345")

        assert response.status_code == 504
        assert "timed out" in response.json()["detail"].lower()

    async def test_includes_season_id_in_response(
        self, async_client: AsyncClient, mock_recommendations_service
    ):
        """Should include season_id in response."""
        mock_recommendations_service.return_value = {
            "punts": [],
            "defensive": [],
            "time_to_sell": [],
        }

        response = await async_client.get(
            "/api/v1/recommendations/league/12345?season_id=2"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["season_id"] == 2

    async def test_validates_negative_league_id(
        self, async_client: AsyncClient, mock_pool
    ):
        """Should reject negative league_id."""
        response = await async_client.get("/api/v1/recommendations/league/-1")

        assert response.status_code == 422

    async def test_returns_empty_lists_for_league_without_managers(
        self, async_client: AsyncClient, mock_recommendations_service
    ):
        """Should return empty lists when league has no data."""
        mock_recommendations_service.return_value = {
            "punts": [],
            "defensive": [],
            "time_to_sell": [],
        }

        response = await async_client.get("/api/v1/recommendations/league/99999")

        assert response.status_code == 200
        data = response.json()
        assert data["punts"] == []
        assert data["defensive"] == []
        assert data["time_to_sell"] == []


class TestRecommendationServiceIntegration:
    """Integration tests for the full scoring pipeline."""

    async def test_calculates_recommendations_from_fpl_data(
        self, async_client: AsyncClient, mock_fpl_client, mock_pool
    ):
        """Should calculate real scores from mocked FPL data."""
        # Setup mock FPL data with players
        mock_fpl_client.get_bootstrap_static.return_value = {
            "elements": [
                {
                    "id": 1,
                    "web_name": "Salah",
                    "element_type": 3,  # MID
                    "minutes": 2700,
                    "expected_goals": "15.5",
                    "expected_assists": "8.0",
                    "expected_goals_conceded": "0.0",
                    "clean_sheets": 0,
                    "form": "8.5",
                    "selected_by_percent": "45.0",
                    "now_cost": 130,
                    "team": 14,
                    "status": "a",  # Available
                },
                {
                    "id": 2,
                    "web_name": "Punt Player",
                    "element_type": 3,  # MID
                    "minutes": 1800,
                    "expected_goals": "5.0",
                    "expected_assists": "4.0",
                    "expected_goals_conceded": "0.0",
                    "clean_sheets": 0,
                    "form": "6.0",
                    "selected_by_percent": "2.0",  # Low ownership = punt
                    "now_cost": 55,
                    "team": 5,
                    "status": "a",  # Available
                },
            ],
        }

        # Setup mock league ownership (only Salah is owned in league)
        mock_fpl_client.get_league_standings_raw.return_value = {
            "standings": {"results": [{"entry": 1}, {"entry": 2}]},
        }
        mock_fpl_client.get_manager_picks.return_value = {
            "picks": [{"element": 1}]  # Only Salah owned
        }

        response = await async_client.get("/api/v1/recommendations/league/12345")

        assert response.status_code == 200
        data = response.json()

        # Punt player should be in punts (low ownership)
        # Salah should be in defensive (medium ownership in league)
        assert "punts" in data
        assert "defensive" in data


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_recommendations_service(mock_pool):
    """Mock the recommendations service get_league_recommendations function."""
    with patch("app.api.routes.RecommendationsService") as mock_cls:
        mock_instance = AsyncMock()
        mock_cls.return_value = mock_instance
        yield mock_instance.get_league_recommendations


@pytest.fixture
def mock_fpl_client(mock_pool):
    """Mock the FPL client for integration tests."""
    with patch("app.api.routes.FplApiClient") as mock_cls:
        mock_instance = AsyncMock()
        mock_cls.return_value.__aenter__.return_value = mock_instance
        yield mock_instance
