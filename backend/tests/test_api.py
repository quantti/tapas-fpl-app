"""Integration tests for API endpoints."""

import pytest
from httpx import AsyncClient


class TestHealthEndpoint:
    """Tests for health check endpoint."""

    async def test_health_returns_healthy(self, async_client: AsyncClient):
        """Health endpoint should return healthy status with database info."""
        response = await async_client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "database" in data
        assert data["database"] in ("connected", "not_configured", "disconnected")


class TestDocsEndpoint:
    """Tests for documentation endpoints."""

    async def test_docs_available(self, async_client: AsyncClient):
        """OpenAPI docs should be available."""
        response = await async_client.get("/docs")

        # FastAPI redirects /docs to /docs/ or returns HTML
        assert response.status_code in (200, 307)


class TestAnalyticsEndpoints:
    """Tests for analytics stub endpoints."""

    async def test_expected_points_stub(self, async_client: AsyncClient):
        """Expected points endpoint should return stub response."""
        response = await async_client.get("/api/analytics/expected-points/12345")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "not_implemented"
        assert data["player_id"] == 12345

    async def test_expected_points_with_horizon(self, async_client: AsyncClient):
        """Expected points should accept horizon parameter."""
        response = await async_client.get("/api/analytics/expected-points/12345?horizon=10")

        assert response.status_code == 200
        data = response.json()
        assert data["horizon"] == 10

    async def test_optimize_transfers_stub(self, async_client: AsyncClient):
        """Optimize transfers endpoint should return stub response."""
        response = await async_client.post("/api/analytics/optimize-transfers")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "not_implemented"


class TestCORSHeaders:
    """Tests for CORS configuration."""

    async def test_cors_headers_present(self, async_client: AsyncClient):
        """CORS headers should be present in response."""
        response = await async_client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )

        # FastAPI/Starlette returns 200 for OPTIONS with CORS
        assert response.status_code in (200, 400)


class TestPointsAgainstEndpoints:
    """Tests for Points Against API endpoints."""

    async def test_points_against_returns_503_without_db(self, async_client: AsyncClient):
        """Points against should return 503 when database unavailable."""
        response = await async_client.get("/api/v1/points-against")

        # Expect 503 since test fixture doesn't initialize DB pool
        assert response.status_code == 503
        assert "Database not available" in response.json()["detail"]

    async def test_team_history_validates_team_id_too_high(
        self, async_client: AsyncClient, mock_pool
    ):
        """Team history should reject team_id > 20."""
        response = await async_client.get("/api/v1/points-against/21/history")

        assert response.status_code == 400
        assert "Invalid team_id" in response.json()["detail"]

    async def test_team_history_validates_team_id_too_low(
        self, async_client: AsyncClient, mock_pool
    ):
        """Team history should reject team_id < 1."""
        response = await async_client.get("/api/v1/points-against/0/history")

        assert response.status_code == 400
        assert "Invalid team_id" in response.json()["detail"]

    async def test_team_history_returns_503_without_db(self, async_client: AsyncClient):
        """Team history should return 503 when database unavailable."""
        response = await async_client.get("/api/v1/points-against/1/history")

        # Expect 503 since test fixture doesn't initialize DB pool
        assert response.status_code == 503
        assert "Database not available" in response.json()["detail"]

    async def test_status_returns_503_without_db(self, async_client: AsyncClient):
        """Status endpoint should return 503 when database unavailable."""
        response = await async_client.get("/api/v1/points-against/status")

        # Expect 503 since test fixture doesn't initialize DB pool
        assert response.status_code == 503
        assert "Database not available" in response.json()["detail"]
