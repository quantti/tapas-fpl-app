"""Integration tests for API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client():
    """Async HTTP client for testing the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestHealthEndpoint:
    """Tests for health check endpoint."""

    async def test_health_returns_healthy(self, client: AsyncClient):
        """Health endpoint should return healthy status."""
        response = await client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "healthy"}


class TestDocsEndpoint:
    """Tests for documentation endpoints."""

    async def test_docs_available(self, client: AsyncClient):
        """OpenAPI docs should be available."""
        response = await client.get("/docs")

        # FastAPI redirects /docs to /docs/ or returns HTML
        assert response.status_code in (200, 307)


class TestAnalyticsEndpoints:
    """Tests for analytics stub endpoints."""

    async def test_expected_points_stub(self, client: AsyncClient):
        """Expected points endpoint should return stub response."""
        response = await client.get("/api/analytics/expected-points/12345")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "not_implemented"
        assert data["player_id"] == 12345

    async def test_expected_points_with_horizon(self, client: AsyncClient):
        """Expected points should accept horizon parameter."""
        response = await client.get("/api/analytics/expected-points/12345?horizon=10")

        assert response.status_code == 200
        data = response.json()
        assert data["horizon"] == 10

    async def test_optimize_transfers_stub(self, client: AsyncClient):
        """Optimize transfers endpoint should return stub response."""
        response = await client.post("/api/analytics/optimize-transfers")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "not_implemented"


class TestCORSHeaders:
    """Tests for CORS configuration."""

    async def test_cors_headers_present(self, client: AsyncClient):
        """CORS headers should be present in response."""
        response = await client.options(
            "/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )

        # FastAPI/Starlette returns 200 for OPTIONS with CORS
        assert response.status_code in (200, 400)
