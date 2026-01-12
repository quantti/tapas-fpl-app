"""Tests for fixtures API endpoints."""

import pytest
from httpx import AsyncClient
from unittest.mock import patch, MagicMock, AsyncMock


@pytest.fixture
def mock_fixtures_pool():
    """Mock get_pool for fixtures API module."""
    with patch("app.dependencies.get_pool") as dep_mock, \
         patch("app.api.fixtures.get_pool") as api_mock:
        # Create async context manager for pool.acquire()
        mock_conn = MagicMock()
        mock_conn.fetchval = AsyncMock()
        mock_conn.fetch = AsyncMock()
        mock_conn.fetchrow = AsyncMock()

        mock_acquire = MagicMock()
        mock_acquire.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_acquire.__aexit__ = AsyncMock(return_value=None)

        mock_pool_instance = MagicMock()
        mock_pool_instance.acquire.return_value = mock_acquire

        dep_mock.return_value = mock_pool_instance
        api_mock.return_value = mock_pool_instance

        yield mock_conn


class TestFixturesEndpoints:
    """Tests for GET /api/v1/fixtures endpoints."""

    async def test_returns_503_without_db(self, async_client: AsyncClient):
        """Should return 503 when database unavailable."""
        response = await async_client.get("/api/v1/fixtures")

        assert response.status_code == 503
        assert "Database not available" in response.json()["detail"]

    async def test_returns_fixtures_list(
        self, async_client: AsyncClient, mock_fixtures_pool
    ):
        """Should return fixtures list structure."""
        mock_fixtures_pool.fetchval.return_value = 2
        mock_fixtures_pool.fetch.return_value = [
            {
                "id": 1,
                "season_id": 1,
                "gameweek": 1,
                "code": 12345,
                "team_h": 1,
                "team_h_name": "Arsenal",
                "team_h_short": "ARS",
                "team_a": 2,
                "team_a_name": "Aston Villa",
                "team_a_short": "AVL",
                "team_h_score": 2,
                "team_a_score": 1,
                "team_h_difficulty": 3,
                "team_a_difficulty": 4,
                "kickoff_time": None,
                "started": True,
                "finished": True,
                "finished_provisional": True,
                "minutes": 90,
            }
        ]

        response = await async_client.get("/api/v1/fixtures?season_id=1")

        assert response.status_code == 200
        data = response.json()
        assert "fixtures" in data
        assert "total" in data
        assert "season_id" in data
        assert data["season_id"] == 1

    async def test_filters_by_gameweek(
        self, async_client: AsyncClient, mock_fixtures_pool
    ):
        """Should filter fixtures by gameweek."""
        mock_fixtures_pool.fetchval.return_value = 10
        mock_fixtures_pool.fetch.return_value = []

        response = await async_client.get("/api/v1/fixtures?gameweek=5")

        assert response.status_code == 200

    async def test_filters_by_team(self, async_client: AsyncClient, mock_fixtures_pool):
        """Should filter fixtures by team."""
        mock_fixtures_pool.fetchval.return_value = 38
        mock_fixtures_pool.fetch.return_value = []

        response = await async_client.get("/api/v1/fixtures?team_id=14")

        assert response.status_code == 200

    async def test_filters_by_finished_status(
        self, async_client: AsyncClient, mock_fixtures_pool
    ):
        """Should filter fixtures by finished status."""
        mock_fixtures_pool.fetchval.return_value = 210
        mock_fixtures_pool.fetch.return_value = []

        response = await async_client.get("/api/v1/fixtures?finished=true")

        assert response.status_code == 200

    async def test_validates_gameweek_range(
        self, async_client: AsyncClient, mock_fixtures_pool
    ):
        """Should reject gameweek outside 1-38 range."""
        response = await async_client.get("/api/v1/fixtures?gameweek=0")
        assert response.status_code == 422

        response = await async_client.get("/api/v1/fixtures?gameweek=39")
        assert response.status_code == 422

    async def test_validates_limit_range(
        self, async_client: AsyncClient, mock_fixtures_pool
    ):
        """Should reject limit outside 1-200 range."""
        response = await async_client.get("/api/v1/fixtures?limit=0")
        assert response.status_code == 422

        response = await async_client.get("/api/v1/fixtures?limit=201")
        assert response.status_code == 422


class TestFixturesByGameweekEndpoint:
    """Tests for GET /api/v1/fixtures/gameweek/{gameweek}."""

    async def test_returns_fixtures_for_gameweek(
        self, async_client: AsyncClient, mock_fixtures_pool
    ):
        """Should return fixtures for specific gameweek."""
        mock_fixtures_pool.fetchval.return_value = 10
        mock_fixtures_pool.fetch.return_value = []

        response = await async_client.get("/api/v1/fixtures/gameweek/21")

        assert response.status_code == 200
        data = response.json()
        assert "fixtures" in data

    async def test_validates_gameweek_path_param(
        self, async_client: AsyncClient, mock_fixtures_pool
    ):
        """Should reject invalid gameweek in path."""
        response = await async_client.get("/api/v1/fixtures/gameweek/0")
        assert response.status_code == 422

        response = await async_client.get("/api/v1/fixtures/gameweek/39")
        assert response.status_code == 422


class TestFixturesByTeamEndpoint:
    """Tests for GET /api/v1/fixtures/team/{team_id}."""

    async def test_returns_fixtures_for_team(
        self, async_client: AsyncClient, mock_fixtures_pool
    ):
        """Should return fixtures for specific team."""
        mock_fixtures_pool.fetchval.return_value = 38
        mock_fixtures_pool.fetch.return_value = []

        response = await async_client.get("/api/v1/fixtures/team/14")

        assert response.status_code == 200
        data = response.json()
        assert "fixtures" in data

    async def test_validates_team_id_path_param(
        self, async_client: AsyncClient, mock_fixtures_pool
    ):
        """Should reject invalid team_id in path."""
        response = await async_client.get("/api/v1/fixtures/team/0")
        assert response.status_code == 422

        response = await async_client.get("/api/v1/fixtures/team/21")
        assert response.status_code == 422


class TestSingleFixtureEndpoint:
    """Tests for GET /api/v1/fixtures/{fixture_id}."""

    async def test_returns_single_fixture(
        self, async_client: AsyncClient, mock_fixtures_pool
    ):
        """Should return a single fixture with stats."""
        mock_fixtures_pool.fetchrow.return_value = {
            "id": 123,
            "season_id": 1,
            "gameweek": 21,
            "code": 12345,
            "team_h": 14,
            "team_h_name": "Liverpool",
            "team_h_short": "LIV",
            "team_a": 1,
            "team_a_name": "Arsenal",
            "team_a_short": "ARS",
            "team_h_score": 2,
            "team_a_score": 2,
            "team_h_difficulty": 4,
            "team_a_difficulty": 4,
            "kickoff_time": None,
            "started": True,
            "finished": True,
            "finished_provisional": True,
            "minutes": 90,
            "stats": [{"identifier": "goals_scored", "a": [], "h": []}],
        }

        response = await async_client.get("/api/v1/fixtures/123")

        assert response.status_code == 200
        data = response.json()
        assert "fixture" in data
        assert "stats" in data
        assert data["fixture"]["id"] == 123

    async def test_returns_404_for_unknown_fixture(
        self, async_client: AsyncClient, mock_fixtures_pool
    ):
        """Should return 404 for non-existent fixture."""
        mock_fixtures_pool.fetchrow.return_value = None

        response = await async_client.get("/api/v1/fixtures/99999")

        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    async def test_validates_fixture_id_path_param(
        self, async_client: AsyncClient, mock_fixtures_pool
    ):
        """Should reject invalid fixture_id in path."""
        response = await async_client.get("/api/v1/fixtures/0")
        assert response.status_code == 422
