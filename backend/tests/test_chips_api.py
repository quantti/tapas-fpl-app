"""Tests for Chips Remaining API endpoints (TDD - written before implementation)."""

from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient

from tests.conftest import MockDB


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_chips_db() -> MockDB:
    """Mock database connection for chips service."""
    return MockDB("app.services.chips.get_connection")


@pytest.fixture
def mock_pool():
    """Mock DB pool check for require_db() dependency (503 check)."""
    with patch("app.dependencies.get_pool") as mock:
        mock.return_value = MagicMock()
        yield mock


class TestChipsLeagueEndpoint:
    """Tests for GET /api/v1/chips/league/{league_id}."""

    async def test_league_chips_returns_503_without_db(self, async_client: AsyncClient):
        """League chips should return 503 when database unavailable."""
        response = await async_client.get("/api/v1/chips/league/12345?current_gameweek=15")

        # Expect 503 since test fixture doesn't initialize DB pool
        assert response.status_code == 503
        assert "Database not available" in response.json()["detail"]

    @pytest.mark.parametrize(
        "invalid_league_id",
        [0, -1, -100],
        ids=["zero", "negative", "large_negative"],
    )
    async def test_league_chips_validates_invalid_league_id(
        self, async_client: AsyncClient, mock_pool, invalid_league_id: int
    ):
        """League chips should reject invalid league_id values."""
        response = await async_client.get(
            f"/api/v1/chips/league/{invalid_league_id}?current_gameweek=15"
        )

        assert response.status_code == 422  # FastAPI validation error

    async def test_league_chips_validates_non_integer_league_id(
        self, async_client: AsyncClient, mock_pool
    ):
        """League chips should return 422 for non-integer league_id."""
        response = await async_client.get("/api/v1/chips/league/abc?current_gameweek=15")

        assert response.status_code == 422  # FastAPI validation error

    @pytest.mark.parametrize(
        "invalid_gw",
        [0, -1, 39, 100],
        ids=["zero", "negative", "gw39", "gw100"],
    )
    async def test_league_chips_validates_invalid_current_gameweek(
        self, async_client: AsyncClient, mock_pool, invalid_gw: int
    ):
        """League chips should reject invalid current_gameweek values."""
        response = await async_client.get(
            f"/api/v1/chips/league/12345?current_gameweek={invalid_gw}"
        )

        assert response.status_code == 422  # FastAPI validation error

    async def test_league_chips_validates_non_integer_current_gameweek(
        self, async_client: AsyncClient, mock_pool
    ):
        """League chips should return 422 for non-integer current_gameweek."""
        response = await async_client.get("/api/v1/chips/league/12345?current_gameweek=abc")

        assert response.status_code == 422  # FastAPI validation error

    async def test_league_chips_validates_missing_current_gameweek(
        self, async_client: AsyncClient, mock_pool
    ):
        """League chips should return 422 when current_gameweek is missing."""
        response = await async_client.get("/api/v1/chips/league/12345")

        assert response.status_code == 422  # Required parameter missing

    async def test_league_chips_accepts_season_id_param(self, async_client: AsyncClient):
        """League chips should accept optional season_id parameter."""
        response = await async_client.get(
            "/api/v1/chips/league/12345?current_gameweek=15&season_id=1"
        )

        # Will return 503 (no DB), but validates the param is accepted
        assert response.status_code == 503

    async def test_league_chips_accepts_sync_param(self, async_client: AsyncClient):
        """League chips should accept optional sync parameter."""
        response = await async_client.get(
            "/api/v1/chips/league/12345?current_gameweek=15&sync=true"
        )

        # Will return 503 (no DB), but validates the param is accepted
        assert response.status_code == 503

    async def test_league_chips_sync_default_is_false(self, async_client: AsyncClient):
        """Sync parameter should default to false (no sync by default)."""
        response = await async_client.get(
            "/api/v1/chips/league/12345?current_gameweek=15"
        )

        # Will return 503 (no DB), validates endpoint works without sync param
        assert response.status_code == 503

    @pytest.mark.parametrize(
        "invalid_season_id",
        [0, -1, -100],
        ids=["zero", "negative", "large_negative"],
    )
    async def test_league_chips_validates_invalid_season_id(
        self, async_client: AsyncClient, mock_pool, invalid_season_id: int
    ):
        """League chips should reject invalid season_id values."""
        response = await async_client.get(
            f"/api/v1/chips/league/12345?current_gameweek=15&season_id={invalid_season_id}"
        )

        assert response.status_code == 422  # FastAPI validation error

    async def test_league_chips_validates_non_integer_season_id(
        self, async_client: AsyncClient, mock_pool
    ):
        """League chips should return 422 for non-integer season_id query param."""
        response = await async_client.get(
            "/api/v1/chips/league/12345?current_gameweek=15&season_id=abc"
        )

        assert response.status_code == 422  # FastAPI validation error

    async def test_league_chips_handles_very_large_league_id(
        self, async_client: AsyncClient
    ):
        """Should handle very large league_id without crashing (overflow protection)."""
        # FPL league IDs are typically 32-bit integers
        response = await async_client.get(
            "/api/v1/chips/league/9999999999999?current_gameweek=15"
        )

        # Either 422 (if validation catches it) or 503 (DB unavailable)
        assert response.status_code in [422, 503]


class TestChipsManagerEndpoint:
    """Tests for GET /api/v1/chips/manager/{manager_id}."""

    async def test_manager_chips_returns_503_without_db(self, async_client: AsyncClient):
        """Manager chips should return 503 when database unavailable."""
        response = await async_client.get("/api/v1/chips/manager/12345")

        assert response.status_code == 503
        assert "Database not available" in response.json()["detail"]

    @pytest.mark.parametrize(
        "invalid_manager_id",
        [0, -1, -100],
        ids=["zero", "negative", "large_negative"],
    )
    async def test_manager_chips_validates_invalid_manager_id(
        self, async_client: AsyncClient, mock_pool, invalid_manager_id: int
    ):
        """Manager chips should reject invalid manager_id values."""
        response = await async_client.get(f"/api/v1/chips/manager/{invalid_manager_id}")

        assert response.status_code == 422  # FastAPI validation error

    async def test_manager_chips_validates_non_integer_manager_id(
        self, async_client: AsyncClient, mock_pool
    ):
        """Manager chips should return 422 for non-integer manager_id."""
        response = await async_client.get("/api/v1/chips/manager/abc")

        assert response.status_code == 422  # FastAPI validation error

    async def test_manager_chips_accepts_season_id_param(self, async_client: AsyncClient):
        """Manager chips should accept optional season_id parameter."""
        response = await async_client.get("/api/v1/chips/manager/12345?season_id=1")

        # Will return 503 (no DB), but validates the param is accepted
        assert response.status_code == 503

    async def test_manager_chips_accepts_sync_param(self, async_client: AsyncClient):
        """Manager chips should accept optional sync parameter."""
        response = await async_client.get("/api/v1/chips/manager/12345?sync=true")

        # Will return 503 (no DB), but validates the param is accepted
        assert response.status_code == 503

    @pytest.mark.parametrize(
        "invalid_season_id",
        [0, -1, -100],
        ids=["zero", "negative", "large_negative"],
    )
    async def test_manager_chips_validates_invalid_season_id(
        self, async_client: AsyncClient, mock_pool, invalid_season_id: int
    ):
        """Manager chips should reject invalid season_id values."""
        response = await async_client.get(
            f"/api/v1/chips/manager/12345?season_id={invalid_season_id}"
        )

        assert response.status_code == 422  # FastAPI validation error

    async def test_manager_chips_validates_non_integer_season_id(
        self, async_client: AsyncClient, mock_pool
    ):
        """Manager chips should return 422 for non-integer season_id query param."""
        response = await async_client.get("/api/v1/chips/manager/12345?season_id=abc")

        assert response.status_code == 422  # FastAPI validation error

    async def test_manager_chips_handles_very_large_manager_id(
        self, async_client: AsyncClient
    ):
        """Should handle very large manager_id without crashing (overflow protection)."""
        # FPL manager IDs are typically 32-bit integers
        response = await async_client.get("/api/v1/chips/manager/9999999999999")

        # Either 422 (if validation catches it) or 503 (DB unavailable)
        assert response.status_code in [422, 503]


class TestChipsResponseFormat:
    """Tests for chips API response format."""

    async def test_league_chips_response_structure(
        self, async_client: AsyncClient, mock_pool, mock_chips_db: MockDB
    ):
        """League chips response should have correct structure."""
        # Mock league members query
        mock_members = [
            {"manager_id": 123, "player_name": "John Doe"},
            {"manager_id": 456, "player_name": "Jane Smith"},
        ]
        # Mock chip usage query
        mock_chips = [
            {
                "manager_id": 123,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "wildcard",
                "gameweek": 5,
                "points_gained": None,
            },
            {
                "manager_id": 456,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "bboost",
                "gameweek": 10,
                "points_gained": 15,
            },
        ]

        mock_chips_db.conn.fetch.side_effect = [mock_members, mock_chips]

        with mock_chips_db:
            response = await async_client.get(
                "/api/v1/chips/league/12345?current_gameweek=15"
            )

        assert response.status_code == 200
        data = response.json()

        # Top-level fields
        assert data["league_id"] == 12345
        assert data["season_id"] == 1
        assert data["current_gameweek"] == 15
        assert data["current_half"] == 1  # GW15 is first half
        assert "managers" in data
        assert len(data["managers"]) == 2

        # Manager structure
        manager = data["managers"][0]
        assert "manager_id" in manager
        assert "name" in manager
        assert "first_half" in manager
        assert "second_half" in manager

        # Half structure
        first_half = manager["first_half"]
        assert "chips_used" in first_half
        assert "chips_remaining" in first_half

        # Chips used structure
        if first_half["chips_used"]:
            chip = first_half["chips_used"][0]
            assert "chip_type" in chip
            assert "gameweek" in chip
            assert "points_gained" in chip

    async def test_manager_chips_response_structure(
        self, async_client: AsyncClient, mock_pool, mock_chips_db: MockDB
    ):
        """Manager chips response should have correct structure."""
        # Mock chip usage query (single manager)
        mock_chips = [
            {
                "manager_id": 12345,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "3xc",
                "gameweek": 8,
                "points_gained": 24,
            },
            {
                "manager_id": 12345,
                "season_id": 1,
                "season_half": 2,
                "chip_type": "freehit",
                "gameweek": 25,
                "points_gained": None,
            },
        ]

        mock_chips_db.conn.fetch.return_value = mock_chips

        with mock_chips_db:
            response = await async_client.get("/api/v1/chips/manager/12345")

        assert response.status_code == 200
        data = response.json()

        # Top-level fields (no current_half - manager endpoint doesn't take current_gameweek)
        assert data["manager_id"] == 12345
        assert data["season_id"] == 1
        assert "first_half" in data
        assert "second_half" in data

        # Half structure
        assert "chips_used" in data["first_half"]
        assert "chips_remaining" in data["first_half"]

        # First half should have 3xc used
        assert len(data["first_half"]["chips_used"]) == 1
        assert data["first_half"]["chips_used"][0]["chip_type"] == "3xc"

        # Second half should have freehit used
        assert len(data["second_half"]["chips_used"]) == 1
        assert data["second_half"]["chips_used"][0]["chip_type"] == "freehit"


class TestChipsEmptyResponses:
    """Tests for empty responses when manager/league not in database.

    Note: The current implementation returns 200 with empty data for unknown
    leagues/managers (not 404). This allows the frontend to handle gracefully
    and trigger sync if needed.
    """

    async def test_league_chips_returns_empty_for_unknown_league(
        self, async_client: AsyncClient, mock_pool, mock_chips_db: MockDB
    ):
        """League chips returns empty managers list when league not in database."""
        # Empty league members = no managers to return
        mock_chips_db.conn.fetch.return_value = []

        with mock_chips_db:
            response = await async_client.get(
                "/api/v1/chips/league/99999999?current_gameweek=15"
            )

        assert response.status_code == 200
        data = response.json()
        assert data["league_id"] == 99999999
        assert data["managers"] == []

    async def test_manager_chips_returns_empty_for_unknown_manager(
        self, async_client: AsyncClient, mock_pool, mock_chips_db: MockDB
    ):
        """Manager chips returns empty chips when manager not in database."""
        # No chip records = empty usage
        mock_chips_db.conn.fetch.return_value = []

        with mock_chips_db:
            response = await async_client.get("/api/v1/chips/manager/99999999")

        assert response.status_code == 200
        data = response.json()
        assert data["manager_id"] == 99999999
        # All 4 chips should be remaining (none used)
        assert set(data["first_half"]["chips_remaining"]) == {"3xc", "bboost", "freehit", "wildcard"}
        assert set(data["second_half"]["chips_remaining"]) == {"3xc", "bboost", "freehit", "wildcard"}


class TestChipsBusinessLogic:
    """Tests for chips business logic.

    Pure functions can be tested directly without DB mocks.
    """

    def test_chips_remaining_calculation(self):
        """Chips remaining should be ALL_CHIPS minus used chips."""
        from app.services.chips import get_remaining_chips

        # ALL_CHIPS = {"wildcard", "bboost", "3xc", "freehit"}

        # No chips used = all remaining
        assert set(get_remaining_chips([])) == {"wildcard", "bboost", "3xc", "freehit"}

        # One chip used
        assert set(get_remaining_chips(["wildcard"])) == {"bboost", "3xc", "freehit"}

        # Multiple chips used
        assert set(get_remaining_chips(["wildcard", "bboost"])) == {"3xc", "freehit"}

        # All chips used = none remaining
        assert get_remaining_chips(["wildcard", "bboost", "3xc", "freehit"]) == []

        # Unknown chips are ignored
        assert set(get_remaining_chips(["wildcard", "unknown_chip"])) == {
            "bboost",
            "3xc",
            "freehit",
        }

    def test_season_half_determination(self):
        """GW1-19 = half 1, GW20-38 = half 2."""
        from app.services.chips import get_season_half

        # First half: GW1-19
        assert get_season_half(1) == 1
        assert get_season_half(10) == 1
        assert get_season_half(19) == 1

        # Second half: GW20-38
        assert get_season_half(20) == 2
        assert get_season_half(30) == 2
        assert get_season_half(38) == 2

        # Invalid gameweeks raise ValueError
        with pytest.raises(ValueError):
            get_season_half(0)
        with pytest.raises(ValueError):
            get_season_half(39)
        with pytest.raises(ValueError):
            get_season_half(-1)

    async def test_chips_reset_at_gw20(
        self, async_client: AsyncClient, mock_pool, mock_chips_db: MockDB
    ):
        """All chips should be available again in second half (GW20+).

        Even if all chips used in first half, second_half.chips_remaining should have all 4.
        """
        # Manager used all 4 chips in first half
        mock_chips = [
            {"manager_id": 123, "season_id": 1, "season_half": 1, "chip_type": "wildcard", "gameweek": 2, "points_gained": None},
            {"manager_id": 123, "season_id": 1, "season_half": 1, "chip_type": "bboost", "gameweek": 5, "points_gained": 20},
            {"manager_id": 123, "season_id": 1, "season_half": 1, "chip_type": "3xc", "gameweek": 10, "points_gained": 30},
            {"manager_id": 123, "season_id": 1, "season_half": 1, "chip_type": "freehit", "gameweek": 15, "points_gained": 50},
        ]

        mock_chips_db.conn.fetch.return_value = mock_chips

        with mock_chips_db:
            response = await async_client.get("/api/v1/chips/manager/123")

        assert response.status_code == 200
        data = response.json()

        # First half: all chips used, none remaining
        assert len(data["first_half"]["chips_used"]) == 4
        assert data["first_half"]["chips_remaining"] == []

        # Second half: no chips used, all 4 remaining (reset!)
        assert len(data["second_half"]["chips_used"]) == 0
        assert set(data["second_half"]["chips_remaining"]) == {
            "wildcard",
            "bboost",
            "3xc",
            "freehit",
        }
