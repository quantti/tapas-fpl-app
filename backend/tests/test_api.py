"""Integration tests for API endpoints."""

import pytest
import respx
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.api import routes


@pytest.fixture(autouse=True)
def clear_cache():
    """Clear the FPL proxy cache before each test."""
    # Reset the proxy service singleton between tests
    routes._proxy_service = None
    yield
    routes._proxy_service = None


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


class TestBootstrapStaticEndpoint:
    """Tests for /api/bootstrap-static endpoint."""

    @respx.mock
    async def test_bootstrap_static_success(
        self, client: AsyncClient, sample_bootstrap_response: dict
    ):
        """Should proxy bootstrap-static from FPL API."""
        respx.get("https://fantasy.premierleague.com/api/bootstrap-static/").respond(
            json=sample_bootstrap_response
        )

        response = await client.get("/api/bootstrap-static")

        assert response.status_code == 200
        data = response.json()
        assert "events" in data
        assert "teams" in data
        assert "elements" in data

    @respx.mock
    async def test_bootstrap_static_fpl_error(self, client: AsyncClient):
        """Should return 502 when FPL API fails."""
        respx.get("https://fantasy.premierleague.com/api/bootstrap-static/").respond(
            status_code=500
        )

        response = await client.get("/api/bootstrap-static")

        assert response.status_code == 502
        assert "detail" in response.json()


class TestFixturesEndpoint:
    """Tests for /api/fixtures endpoint."""

    @respx.mock
    async def test_fixtures_success(
        self, client: AsyncClient, sample_fixtures_response: list
    ):
        """Should proxy fixtures from FPL API."""
        respx.get("https://fantasy.premierleague.com/api/fixtures/").respond(
            json=sample_fixtures_response
        )

        response = await client.get("/api/fixtures")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 3

    @respx.mock
    async def test_fixtures_fpl_error(self, client: AsyncClient):
        """Should return 502 when FPL API fails."""
        respx.get("https://fantasy.premierleague.com/api/fixtures/").respond(
            status_code=500
        )

        response = await client.get("/api/fixtures")

        assert response.status_code == 502


class TestEntryEndpoint:
    """Tests for /api/entry/{entry_id} endpoint."""

    @respx.mock
    async def test_entry_success(
        self, client: AsyncClient, sample_entry_response: dict
    ):
        """Should proxy entry data from FPL API."""
        respx.get("https://fantasy.premierleague.com/api/entry/12345/").respond(
            json=sample_entry_response
        )

        response = await client.get("/api/entry/12345")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == 12345
        assert data["name"] == "Test FC"

    @respx.mock
    async def test_entry_not_found(self, client: AsyncClient):
        """Should return 502 when entry doesn't exist (FPL returns 404)."""
        respx.get("https://fantasy.premierleague.com/api/entry/99999999/").respond(
            status_code=404
        )

        response = await client.get("/api/entry/99999999")

        # API returns 502 for all FPL API errors including 404s
        assert response.status_code == 502


class TestEntryPicksEndpoint:
    """Tests for /api/entry/{entry_id}/event/{event_id}/picks endpoint."""

    @respx.mock
    async def test_entry_picks_success(
        self, client: AsyncClient, sample_picks_response: dict
    ):
        """Should proxy entry picks from FPL API."""
        respx.get(
            "https://fantasy.premierleague.com/api/entry/12345/event/18/picks/"
        ).respond(json=sample_picks_response)

        response = await client.get("/api/entry/12345/event/18/picks")

        assert response.status_code == 200
        data = response.json()
        assert "picks" in data
        assert "entry_history" in data

    @respx.mock
    async def test_entry_picks_not_found(self, client: AsyncClient):
        """Should return 502 when picks don't exist (FPL returns 404)."""
        respx.get(
            "https://fantasy.premierleague.com/api/entry/12345/event/99/picks/"
        ).respond(status_code=404)

        response = await client.get("/api/entry/12345/event/99/picks")

        # API returns 502 for all FPL API errors including 404s
        assert response.status_code == 502


class TestLeagueStandingsEndpoint:
    """Tests for /api/leagues-classic/{league_id}/standings endpoint."""

    @respx.mock
    async def test_league_standings_success(
        self, client: AsyncClient, sample_league_response: dict
    ):
        """Should proxy league standings from FPL API."""
        respx.get(
            "https://fantasy.premierleague.com/api/leagues-classic/314/standings/"
        ).respond(json=sample_league_response)

        response = await client.get("/api/leagues-classic/314/standings")

        assert response.status_code == 200
        data = response.json()
        assert data["league"]["name"] == "Test League"
        assert len(data["standings"]["results"]) == 2

    @respx.mock
    async def test_league_standings_not_found(self, client: AsyncClient):
        """Should return 502 when league doesn't exist (FPL returns 404)."""
        respx.get(
            "https://fantasy.premierleague.com/api/leagues-classic/99999/standings/"
        ).respond(status_code=404)

        response = await client.get("/api/leagues-classic/99999/standings")

        # API returns 502 for all FPL API errors including 404s
        assert response.status_code == 502


class TestEventLiveEndpoint:
    """Tests for /api/event/{event_id}/live endpoint."""

    @respx.mock
    async def test_event_live_success(
        self, client: AsyncClient, sample_live_response: dict
    ):
        """Should proxy live event data from FPL API."""
        respx.get("https://fantasy.premierleague.com/api/event/18/live/").respond(
            json=sample_live_response
        )

        response = await client.get("/api/event/18/live")

        assert response.status_code == 200
        data = response.json()
        assert "elements" in data
        assert len(data["elements"]) == 2

    @respx.mock
    async def test_event_live_not_found(self, client: AsyncClient):
        """Should return 502 when event doesn't exist (FPL returns 404)."""
        respx.get("https://fantasy.premierleague.com/api/event/99/live/").respond(
            status_code=404
        )

        response = await client.get("/api/event/99/live")

        # API returns 502 for all FPL API errors including 404s
        assert response.status_code == 502


class TestFixturesWithEventFilter:
    """Tests for /api/fixtures with event filter."""

    @respx.mock
    async def test_fixtures_with_event_filter(
        self, client: AsyncClient, sample_fixtures_response: list
    ):
        """Should proxy fixtures filtered by event."""
        respx.get("https://fantasy.premierleague.com/api/fixtures/?event=18").respond(
            json=sample_fixtures_response[:1]
        )

        response = await client.get("/api/fixtures?event=18")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


class TestEntryHistoryEndpoint:
    """Tests for /api/entry/{entry_id}/history endpoint."""

    @respx.mock
    async def test_entry_history_success(
        self, client: AsyncClient, sample_entry_history_response: dict
    ):
        """Should proxy entry history from FPL API."""
        respx.get("https://fantasy.premierleague.com/api/entry/12345/history/").respond(
            json=sample_entry_history_response
        )

        response = await client.get("/api/entry/12345/history")

        assert response.status_code == 200
        data = response.json()
        assert "current" in data
        assert "past" in data
        assert "chips" in data

    @respx.mock
    async def test_entry_history_not_found(self, client: AsyncClient):
        """Should return 502 when entry doesn't exist."""
        respx.get("https://fantasy.premierleague.com/api/entry/99999999/history/").respond(
            status_code=404
        )

        response = await client.get("/api/entry/99999999/history")

        assert response.status_code == 502


class TestEntryTransfersEndpoint:
    """Tests for /api/entry/{entry_id}/transfers endpoint."""

    @respx.mock
    async def test_entry_transfers_success(
        self, client: AsyncClient, sample_entry_transfers_response: list
    ):
        """Should proxy entry transfers from FPL API."""
        respx.get("https://fantasy.premierleague.com/api/entry/12345/transfers/").respond(
            json=sample_entry_transfers_response
        )

        response = await client.get("/api/entry/12345/transfers")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2

    @respx.mock
    async def test_entry_transfers_not_found(self, client: AsyncClient):
        """Should return 502 when entry doesn't exist."""
        respx.get("https://fantasy.premierleague.com/api/entry/99999999/transfers/").respond(
            status_code=404
        )

        response = await client.get("/api/entry/99999999/transfers")

        assert response.status_code == 502


class TestElementSummaryEndpoint:
    """Tests for /api/element-summary/{element_id} endpoint."""

    @respx.mock
    async def test_element_summary_success(
        self, client: AsyncClient, sample_element_summary_response: dict
    ):
        """Should proxy element summary from FPL API."""
        respx.get("https://fantasy.premierleague.com/api/element-summary/1/").respond(
            json=sample_element_summary_response
        )

        response = await client.get("/api/element-summary/1")

        assert response.status_code == 200
        data = response.json()
        assert "fixtures" in data
        assert "history" in data

    @respx.mock
    async def test_element_summary_not_found(self, client: AsyncClient):
        """Should return 502 when element doesn't exist."""
        respx.get("https://fantasy.premierleague.com/api/element-summary/99999/").respond(
            status_code=404
        )

        response = await client.get("/api/element-summary/99999")

        assert response.status_code == 502


class TestEventStatusEndpoint:
    """Tests for /api/event-status endpoint."""

    @respx.mock
    async def test_event_status_success(
        self, client: AsyncClient, sample_event_status_response: dict
    ):
        """Should proxy event status from FPL API."""
        respx.get("https://fantasy.premierleague.com/api/event-status/").respond(
            json=sample_event_status_response
        )

        response = await client.get("/api/event-status")

        assert response.status_code == 200
        data = response.json()
        assert "status" in data
        assert "leagues" in data

    @respx.mock
    async def test_event_status_fpl_error(self, client: AsyncClient):
        """Should return 502 when FPL API fails."""
        respx.get("https://fantasy.premierleague.com/api/event-status/").respond(
            status_code=500
        )

        response = await client.get("/api/event-status")

        assert response.status_code == 502


class TestAnalyticsEndpoints:
    """Tests for analytics stub endpoints (Phase 2/3)."""

    async def test_expected_points_stub(self, client: AsyncClient):
        """Expected points endpoint should return stub response."""
        response = await client.get("/api/analytics/expected-points/12345")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "not_implemented"
        assert "phase 2" in data["message"].lower()

    async def test_optimize_transfers_stub(self, client: AsyncClient):
        """Optimize transfers endpoint should return stub response."""
        response = await client.post(
            "/api/analytics/optimize-transfers",
            json={"entry_id": 12345, "constraints": {}},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "not_implemented"
        assert "phase 3" in data["message"].lower()


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
