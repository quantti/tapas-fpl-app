"""TDD tests for History API endpoints (Phases 1-4 of historical data migration).

These tests define the expected API contract before implementation.
Tests are organized by endpoint and test category:
- Validation tests (422) - run without DB
- Error handling tests (503) - run without DB
- Response format tests - require DB mock
- Business logic tests - require DB mock

Endpoints covered:
- GET /api/v1/history/league/{league_id} - All historical data for a league
- GET /api/v1/history/league/{league_id}/positions - League position history (bump chart)
- GET /api/v1/history/league/{league_id}/stats - Aggregated statistics
- GET /api/v1/history/comparison - Head-to-head manager comparison
"""

import pytest
from httpx import AsyncClient

from app.services.history import clear_cache
from tests.conftest import MockDB

# =============================================================================
# Fixtures for API tests with DB mock
# =============================================================================


@pytest.fixture(autouse=True)
def clear_history_cache():
    """Clear history service cache before each test to prevent pollution."""
    clear_cache()
    yield
    clear_cache()


@pytest.fixture
def mock_api_db() -> MockDB:
    """Mock database for API endpoint tests."""
    return MockDB("app.services.history.get_connection")

# =============================================================================
# GET /api/v1/history/league/{league_id}
# =============================================================================


class TestHistoryLeagueEndpoint:
    """Tests for GET /api/v1/history/league/{league_id}.

    This endpoint returns all historical data for a league in one call,
    replacing ~400 frontend API calls to FPL.
    """

    async def test_league_history_returns_503_without_db(self, async_client: AsyncClient):
        """League history should return 503 when database unavailable."""
        response = await async_client.get("/api/v1/history/league/12345")

        assert response.status_code == 503
        assert "Database not available" in response.json()["detail"]

    @pytest.mark.parametrize(
        "invalid_league_id",
        [0, -1, -100],
        ids=["zero", "negative", "large_negative"],
    )
    async def test_league_history_validates_invalid_league_id(
        self, async_client: AsyncClient, mock_pool, invalid_league_id: int
    ):
        """League history should reject invalid league_id values."""
        response = await async_client.get(f"/api/v1/history/league/{invalid_league_id}")

        assert response.status_code == 422

    async def test_league_history_validates_non_integer_league_id(
        self, async_client: AsyncClient, mock_pool
    ):
        """League history should return 422 for non-integer league_id."""
        response = await async_client.get("/api/v1/history/league/abc")

        assert response.status_code == 422

    async def test_league_history_accepts_season_id_param(self, async_client: AsyncClient):
        """League history should accept optional season_id parameter."""
        response = await async_client.get("/api/v1/history/league/12345?season_id=1")

        # Will return 503 (no DB), but validates the param is accepted
        assert response.status_code == 503

    async def test_league_history_accepts_include_picks_param(self, async_client: AsyncClient):
        """League history should accept optional include_picks parameter."""
        response = await async_client.get("/api/v1/history/league/12345?include_picks=true")

        # Will return 503 (no DB), but validates the param is accepted
        assert response.status_code == 503

    async def test_league_history_include_picks_defaults_to_false(self, async_client: AsyncClient):
        """include_picks parameter should default to false."""
        response = await async_client.get("/api/v1/history/league/12345")

        # Will return 503 (no DB), validates endpoint works without param
        assert response.status_code == 503

    async def test_league_history_handles_very_large_league_id(self, async_client: AsyncClient):
        """Should handle very large league_id without crashing."""
        response = await async_client.get("/api/v1/history/league/9999999999999")

        # Either 422 (if validation catches it) or 503 (DB unavailable)
        assert response.status_code in [422, 503]


class TestHistoryLeagueResponseFormat:
    """Tests for league history response format (require DB mock)."""

    async def test_league_history_response_structure(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """League history response should have correct structure."""
        # Mock data for league members, history, and chips
        mock_members = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        mock_history = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "overall_rank": 1000,
                "bank": 5,
                "team_value": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "points_on_bench": 10,
                "active_chip": None,
            }
        ]
        mock_chips = [{"manager_id": 123, "chip_name": "wildcard", "gameweek_used": 5}]

        mock_api_db.conn.fetch.side_effect = [mock_members, mock_history, mock_chips]

        with mock_api_db:
            response = await async_client.get("/api/v1/history/league/12345")

        assert response.status_code == 200
        data = response.json()

        # Top-level fields
        assert "league_id" in data
        assert "season_id" in data
        assert "managers" in data
        assert "current_gameweek" in data

        # Manager structure
        if data["managers"]:
            manager = data["managers"][0]
            assert "manager_id" in manager
            assert "name" in manager
            assert "team_name" in manager
            assert "history" in manager
            assert "chips" in manager

            # History entry structure
            if manager["history"]:
                entry = manager["history"][0]
                assert "gameweek" in entry
                assert "gameweek_points" in entry
                assert "total_points" in entry
                assert "overall_rank" in entry
                assert "transfers_made" in entry
                assert "transfers_cost" in entry
                assert "points_on_bench" in entry
                assert "bank" in entry
                assert "team_value" in entry
                assert "active_chip" in entry

            # Chips entry structure
            if manager["chips"]:
                chip = manager["chips"][0]
                assert "chip_type" in chip
                assert "gameweek" in chip

    async def test_league_history_with_picks_includes_squad(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """League history with include_picks=true should include squad picks."""
        mock_members = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        mock_history = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "overall_rank": 1000,
                "bank": 5,
                "team_value": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "points_on_bench": 10,
                "active_chip": None,
            }
        ]
        mock_chips = [{"manager_id": 123, "chip_name": "wildcard", "gameweek_used": 5}]
        mock_picks = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "player_id": 100,
                "position": 1,
                "multiplier": 2,
                "is_captain": True,
                "points": 10,
            }
        ]

        mock_api_db.conn.fetch.side_effect = [
            mock_members,
            mock_history,
            mock_chips,
            mock_picks,
        ]

        with mock_api_db:
            response = await async_client.get("/api/v1/history/league/12345?include_picks=true")

        assert response.status_code == 200
        data = response.json()

        if data["managers"]:
            manager = data["managers"][0]
            if manager["history"]:
                entry = manager["history"][0]
                assert "picks" in entry

                if entry["picks"]:
                    pick = entry["picks"][0]
                    assert "player_id" in pick
                    assert "position" in pick
                    assert "multiplier" in pick
                    assert "is_captain" in pick
                    assert "points" in pick


class TestHistoryLeagueBusinessLogic:
    """Tests for league history business logic (require DB mock)."""

    async def test_league_history_returns_all_completed_gameweeks(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Should return history for all gameweeks up to current."""
        mock_members = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        # History for GW1, GW2, GW3
        mock_history = [
            {
                "manager_id": 123,
                "gameweek": gw,
                "gameweek_points": 50 + gw * 5,
                "total_points": sum(50 + i * 5 for i in range(1, gw + 1)),
                "overall_rank": 1000 - gw * 100,
                "bank": 5,
                "team_value": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "points_on_bench": 5,
                "active_chip": None,
            }
            for gw in range(1, 4)
        ]
        mock_chips = []

        mock_api_db.conn.fetch.side_effect = [mock_members, mock_history, mock_chips]

        with mock_api_db:
            response = await async_client.get("/api/v1/history/league/12345")

        assert response.status_code == 200
        data = response.json()

        # Should have history for 3 gameweeks
        manager = data["managers"][0]
        assert len(manager["history"]) == 3
        gameweeks = [h["gameweek"] for h in manager["history"]]
        assert gameweeks == [1, 2, 3]

    async def test_league_history_returns_empty_for_unknown_league(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Should return empty managers list for leagues not in database."""
        # Empty result for unknown league
        mock_api_db.conn.fetch.side_effect = [[], [], []]

        with mock_api_db:
            response = await async_client.get("/api/v1/history/league/99999")

        assert response.status_code == 200
        data = response.json()
        assert data["managers"] == []


# =============================================================================
# GET /api/v1/history/league/{league_id}/positions
# =============================================================================


class TestHistoryPositionsEndpoint:
    """Tests for GET /api/v1/history/league/{league_id}/positions.

    This endpoint returns league position history for bump charts,
    replacing useLeaguePositionHistory hook (~20 API calls).
    """

    async def test_positions_returns_503_without_db(self, async_client: AsyncClient):
        """Positions endpoint should return 503 when database unavailable."""
        response = await async_client.get("/api/v1/history/league/12345/positions")

        assert response.status_code == 503
        assert "Database not available" in response.json()["detail"]

    @pytest.mark.parametrize(
        "invalid_league_id",
        [0, -1, -100],
        ids=["zero", "negative", "large_negative"],
    )
    async def test_positions_validates_invalid_league_id(
        self, async_client: AsyncClient, mock_pool, invalid_league_id: int
    ):
        """Positions should reject invalid league_id values."""
        response = await async_client.get(f"/api/v1/history/league/{invalid_league_id}/positions")

        assert response.status_code == 422

    async def test_positions_validates_non_integer_league_id(
        self, async_client: AsyncClient, mock_pool
    ):
        """Positions should return 422 for non-integer league_id."""
        response = await async_client.get("/api/v1/history/league/abc/positions")

        assert response.status_code == 422

    async def test_positions_accepts_season_id_param(self, async_client: AsyncClient):
        """Positions should accept optional season_id parameter."""
        response = await async_client.get(
            "/api/v1/history/league/12345/positions?season_id=1"
        )

        assert response.status_code == 503


class TestHistoryPositionsResponseFormat:
    """Tests for positions response format (require DB mock)."""

    async def test_positions_response_structure(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Positions response should have correct structure for bump chart."""
        # Mock data: league members and history
        mock_members = [
            {"id": 123, "player_name": "John Doe", "team_name": "FC John"},
            {"id": 456, "player_name": "Jane Smith", "team_name": "FC Jane"},
        ]
        mock_history = [
            {"manager_id": 123, "gameweek": 1, "total_points": 65},
            {"manager_id": 456, "gameweek": 1, "total_points": 70},
            {"manager_id": 123, "gameweek": 2, "total_points": 130},
            {"manager_id": 456, "gameweek": 2, "total_points": 125},
        ]

        mock_api_db.conn.fetch.side_effect = [mock_members, mock_history]

        with mock_api_db:
            response = await async_client.get("/api/v1/history/league/12345/positions")

        assert response.status_code == 200
        data = response.json()

        # Top-level fields
        assert "league_id" in data
        assert "season_id" in data
        assert "positions" in data
        assert "managers" in data

        # Positions structure (array of gameweek snapshots)
        assert len(data["positions"]) == 2  # GW1 and GW2
        gw_snapshot = data["positions"][0]
        assert "gameweek" in gw_snapshot
        # Each manager_id maps to their rank that GW (as string keys from JSON)
        assert "123" in gw_snapshot or 123 in gw_snapshot

        # Managers structure (metadata for chart)
        assert len(data["managers"]) == 2
        manager = data["managers"][0]
        assert "id" in manager
        assert "name" in manager
        assert "color" in manager  # For chart line color


class TestHistoryPositionsBusinessLogic:
    """Tests for positions business logic (require DB mock)."""

    async def test_positions_computed_from_total_points(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Positions should be derived from total_points each gameweek."""
        mock_members = [
            {"id": 123, "player_name": "John Doe", "team_name": "FC John"},
            {"id": 456, "player_name": "Jane Smith", "team_name": "FC Jane"},
        ]
        # GW1: Jane leads (70 > 65), GW2: John leads (130 > 125)
        mock_history = [
            {"manager_id": 123, "gameweek": 1, "total_points": 65},
            {"manager_id": 456, "gameweek": 1, "total_points": 70},
            {"manager_id": 123, "gameweek": 2, "total_points": 130},
            {"manager_id": 456, "gameweek": 2, "total_points": 125},
        ]

        mock_api_db.conn.fetch.side_effect = [mock_members, mock_history]

        with mock_api_db:
            response = await async_client.get("/api/v1/history/league/12345/positions")

        assert response.status_code == 200
        data = response.json()

        # GW1: Jane (456) is 1st, John (123) is 2nd
        gw1 = data["positions"][0]
        assert gw1["gameweek"] == 1
        # JSON keys are strings
        assert gw1.get("456") == 1 or gw1.get(456) == 1
        assert gw1.get("123") == 2 or gw1.get(123) == 2

        # GW2: John (123) is 1st, Jane (456) is 2nd
        gw2 = data["positions"][1]
        assert gw2["gameweek"] == 2
        assert gw2.get("123") == 1 or gw2.get(123) == 1
        assert gw2.get("456") == 2 or gw2.get(456) == 2

    async def test_positions_handles_ties_consistently(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Tied points should result in same rank."""
        mock_members = [
            {"id": 123, "player_name": "John Doe", "team_name": "FC John"},
            {"id": 456, "player_name": "Jane Smith", "team_name": "FC Jane"},
        ]
        # Both have same points - should tie for 1st
        mock_history = [
            {"manager_id": 123, "gameweek": 1, "total_points": 70},
            {"manager_id": 456, "gameweek": 1, "total_points": 70},
        ]

        mock_api_db.conn.fetch.side_effect = [mock_members, mock_history]

        with mock_api_db:
            response = await async_client.get("/api/v1/history/league/12345/positions")

        assert response.status_code == 200
        data = response.json()

        # Both should be rank 1 (tied)
        gw1 = data["positions"][0]
        rank_123 = gw1.get(123) or gw1.get("123")
        rank_456 = gw1.get(456) or gw1.get("456")
        assert rank_123 == rank_456 == 1


# =============================================================================
# GET /api/v1/history/league/{league_id}/stats
# =============================================================================


class TestHistoryStatsEndpoint:
    """Tests for GET /api/v1/history/league/{league_id}/stats.

    This endpoint returns aggregated stats for the Statistics page,
    replacing BenchPoints, CaptainSuccess, and FreeTransfers calculations.
    """

    async def test_stats_returns_503_without_db(self, async_client: AsyncClient):
        """Stats endpoint should return 503 when database unavailable."""
        response = await async_client.get("/api/v1/history/league/12345/stats")

        assert response.status_code == 503
        assert "Database not available" in response.json()["detail"]

    @pytest.mark.parametrize(
        "invalid_league_id",
        [0, -1, -100],
        ids=["zero", "negative", "large_negative"],
    )
    async def test_stats_validates_invalid_league_id(
        self, async_client: AsyncClient, mock_pool, invalid_league_id: int
    ):
        """Stats should reject invalid league_id values."""
        response = await async_client.get(f"/api/v1/history/league/{invalid_league_id}/stats")

        assert response.status_code == 422

    async def test_stats_validates_non_integer_league_id(
        self, async_client: AsyncClient, mock_pool
    ):
        """Stats should return 422 for non-integer league_id."""
        response = await async_client.get("/api/v1/history/league/abc/stats")

        assert response.status_code == 422

    async def test_stats_accepts_season_id_param(self, async_client: AsyncClient):
        """Stats should accept optional season_id parameter."""
        response = await async_client.get("/api/v1/history/league/12345/stats?season_id=1")

        assert response.status_code == 503

    async def test_stats_accepts_current_gameweek_param(self, async_client: AsyncClient):
        """Stats should accept optional current_gameweek parameter."""
        response = await async_client.get("/api/v1/history/league/12345/stats?current_gameweek=19")

        assert response.status_code == 503

    @pytest.mark.parametrize(
        "invalid_gw",
        [0, -1, 39, 100],
        ids=["zero", "negative", "gw39", "gw100"],
    )
    async def test_stats_validates_invalid_current_gameweek(
        self, async_client: AsyncClient, mock_pool, invalid_gw: int
    ):
        """Stats should reject invalid current_gameweek values."""
        response = await async_client.get(
            f"/api/v1/history/league/12345/stats?current_gameweek={invalid_gw}"
        )

        assert response.status_code == 422


class TestHistoryStatsResponseFormat:
    """Tests for stats response format (require DB mock)."""

    async def test_stats_response_structure(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Stats response should have correct structure."""
        # Mock data: members, history, captain picks, and gameweeks
        mock_members = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        mock_history = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 10,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        mock_captain_picks = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "player_id": 427,
                "position": 1,
                "multiplier": 2,
                "is_captain": True,
                "points": 12,
            }
        ]
        mock_gameweeks = [{"id": 1, "most_captained": 427}]
        # Player names and GW points for collected player IDs
        mock_player_names = [{"id": 427, "web_name": "Salah"}]
        mock_player_gw_points = [{"player_id": 427, "gameweek": 1, "total_points": 12}]

        mock_api_db.conn.fetch.side_effect = [
            mock_members,
            mock_history,
            mock_captain_picks,
            mock_gameweeks,
            mock_player_names,
            mock_player_gw_points,
        ]

        with mock_api_db:
            response = await async_client.get("/api/v1/history/league/12345/stats")

        assert response.status_code == 200
        data = response.json()

        # Top-level fields
        assert "season_id" in data
        assert "bench_points" in data
        assert "captain_differential" in data
        assert "free_transfers" in data

        # Bench points structure
        assert len(data["bench_points"]) == 1
        entry = data["bench_points"][0]
        assert "manager_id" in entry
        assert "name" in entry
        assert "bench_points" in entry

        # Captain differential structure
        assert len(data["captain_differential"]) == 1
        entry = data["captain_differential"][0]
        assert "manager_id" in entry
        assert "name" in entry
        assert "differential_picks" in entry
        assert "gain" in entry
        assert "details" in entry  # Details array (empty when captain == template)

        # Free transfers structure
        assert len(data["free_transfers"]) == 1
        entry = data["free_transfers"][0]
        assert "manager_id" in entry
        assert "name" in entry
        assert "free_transfers" in entry


class TestHistoryStatsBusinessLogic:
    """Tests for stats business logic (require DB mock)."""

    async def test_bench_points_sum_all_gameweeks(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Bench points should be sum of points_on_bench across all GWs."""
        mock_members = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        # 3 gameweeks with bench points: 10 + 15 + 8 = 33
        mock_history = [
            {
                "manager_id": 123,
                "gameweek": gw,
                "gameweek_points": 50,
                "total_points": 50 * gw,
                "points_on_bench": bench,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
            for gw, bench in [(1, 10), (2, 15), (3, 8)]
        ]
        mock_captain_picks = []
        mock_gameweeks = []

        mock_api_db.conn.fetch.side_effect = [
            mock_members,
            mock_history,
            mock_captain_picks,
            mock_gameweeks,
        ]

        with mock_api_db:
            response = await async_client.get("/api/v1/history/league/12345/stats")

        assert response.status_code == 200
        data = response.json()

        assert data["bench_points"][0]["bench_points"] == 33

    async def test_captain_differential_vs_template(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Captain differential should compare to most_captained in gameweek."""
        mock_members = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        mock_history = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 50,
                "total_points": 50,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        # Captain different from most_captained (differential pick)
        mock_captain_picks = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "player_id": 328,  # Different from most_captained
                "position": 1,
                "multiplier": 2,
                "is_captain": True,
                "points": 15,  # Got 15 pts (30 with 2x)
            }
        ]
        mock_gameweeks = [{"id": 1, "most_captained": 427}]  # Template captain
        # Player names and GW points for both captain (328) and template (427)
        mock_player_names = [
            {"id": 328, "web_name": "Bruno"},
            {"id": 427, "web_name": "Salah"},
        ]
        mock_player_gw_points = [
            {"player_id": 328, "gameweek": 1, "total_points": 15},
            {"player_id": 427, "gameweek": 1, "total_points": 10},
        ]

        mock_api_db.conn.fetch.side_effect = [
            mock_members,
            mock_history,
            mock_captain_picks,
            mock_gameweeks,
            mock_player_names,
            mock_player_gw_points,
        ]

        with mock_api_db:
            response = await async_client.get("/api/v1/history/league/12345/stats")

        assert response.status_code == 200
        data = response.json()

        captain_diff = data["captain_differential"][0]
        assert captain_diff["differential_picks"] == 1  # 1 differential captain pick

        # Verify details structure when there ARE differential picks
        assert "details" in captain_diff
        assert len(captain_diff["details"]) == 1
        detail = captain_diff["details"][0]
        assert detail["gameweek"] == 1
        assert detail["captain_id"] == 328
        assert detail["captain_name"] == "Bruno"
        assert detail["captain_points"] == 15
        assert detail["template_id"] == 427
        assert detail["template_name"] == "Salah"
        assert detail["template_points"] == 10
        assert detail["gain"] == 10  # (15 - 10) * 2 = 10
        assert detail["multiplier"] == 2

    async def test_free_transfers_calculation(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Free transfers should account for carries, hits, and gain +1 each GW."""
        mock_members = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        # GW1: no transfers → 1 FT, gain +1 → 2 FT
        # GW2: 1 transfer (use 1 FT) → 1 FT left, gain +1 → 2 FT
        # GW3: 2 transfers with -4 hit → reset to 1, gain +1 → 2 FT
        # GW4: no transfers → 2 FT, gain +1 → 3 FT
        # Result: 3 FT remaining
        mock_history = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 50,
                "total_points": 50,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            },
            {
                "manager_id": 123,
                "gameweek": 2,
                "gameweek_points": 50,
                "total_points": 100,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 1,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            },
            {
                "manager_id": 123,
                "gameweek": 3,
                "gameweek_points": 50,
                "total_points": 150,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 2,
                "transfers_cost": -4,  # Hit
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            },
            {
                "manager_id": 123,
                "gameweek": 4,
                "gameweek_points": 50,
                "total_points": 200,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            },
        ]
        mock_captain_picks = []
        mock_gameweeks = []

        mock_api_db.conn.fetch.side_effect = [
            mock_members,
            mock_history,
            mock_captain_picks,
            mock_gameweeks,
        ]

        with mock_api_db:
            response = await async_client.get(
                "/api/v1/history/league/12345/stats?current_gameweek=5"
            )

        assert response.status_code == 200
        data = response.json()

        # After GW4, should have 3 FT (reset+gain after hit, then +1 for GW4)
        assert data["free_transfers"][0]["free_transfers"] == 3

    async def test_free_transfers_max_5_rule(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Free transfers max should be 5 starting from 2024/25 season."""
        mock_members = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        # 6 gameweeks with no transfers - would accumulate 7 FT without cap
        mock_history = [
            {
                "manager_id": 123,
                "gameweek": gw,
                "gameweek_points": 50,
                "total_points": 50 * gw,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
            for gw in range(1, 7)
        ]
        mock_captain_picks = []
        mock_gameweeks = []

        mock_api_db.conn.fetch.side_effect = [
            mock_members,
            mock_history,
            mock_captain_picks,
            mock_gameweeks,
        ]

        with mock_api_db:
            response = await async_client.get(
                "/api/v1/history/league/12345/stats?current_gameweek=7"
            )

        assert response.status_code == 200
        data = response.json()

        # Should be capped at 5
        assert data["free_transfers"][0]["free_transfers"] == 5


# =============================================================================
# GET /api/v1/history/comparison
# =============================================================================


class TestHistoryComparisonEndpoint:
    """Tests for GET /api/v1/history/comparison.

    This endpoint returns head-to-head manager comparison data,
    replacing useHeadToHeadComparison hook.
    """

    async def test_comparison_returns_503_without_db(self, async_client: AsyncClient):
        """Comparison endpoint should return 503 when database unavailable."""
        response = await async_client.get(
            "/api/v1/history/comparison?manager_a=123&manager_b=456&league_id=789"
        )

        assert response.status_code == 503
        assert "Database not available" in response.json()["detail"]

    async def test_comparison_requires_manager_a(self, async_client: AsyncClient, mock_pool):
        """Comparison should return 422 when manager_a is missing."""
        response = await async_client.get("/api/v1/history/comparison?manager_b=456&league_id=789")

        assert response.status_code == 422

    async def test_comparison_requires_manager_b(self, async_client: AsyncClient, mock_pool):
        """Comparison should return 422 when manager_b is missing."""
        response = await async_client.get("/api/v1/history/comparison?manager_a=123&league_id=789")

        assert response.status_code == 422

    async def test_comparison_requires_league_id(self, async_client: AsyncClient, mock_pool):
        """Comparison should return 422 when league_id is missing."""
        response = await async_client.get("/api/v1/history/comparison?manager_a=123&manager_b=456")

        assert response.status_code == 422

    @pytest.mark.parametrize(
        "invalid_id",
        [0, -1, -100],
        ids=["zero", "negative", "large_negative"],
    )
    async def test_comparison_validates_invalid_manager_a(
        self, async_client: AsyncClient, mock_pool, invalid_id: int
    ):
        """Comparison should reject invalid manager_a values."""
        response = await async_client.get(
            f"/api/v1/history/comparison?manager_a={invalid_id}&manager_b=456&league_id=789"
        )

        assert response.status_code == 422

    @pytest.mark.parametrize(
        "invalid_id",
        [0, -1, -100],
        ids=["zero", "negative", "large_negative"],
    )
    async def test_comparison_validates_invalid_manager_b(
        self, async_client: AsyncClient, mock_pool, invalid_id: int
    ):
        """Comparison should reject invalid manager_b values."""
        response = await async_client.get(
            f"/api/v1/history/comparison?manager_a=123&manager_b={invalid_id}&league_id=789"
        )

        assert response.status_code == 422

    @pytest.mark.parametrize(
        "invalid_id",
        [0, -1, -100],
        ids=["zero", "negative", "large_negative"],
    )
    async def test_comparison_validates_invalid_league_id(
        self, async_client: AsyncClient, mock_pool, invalid_id: int
    ):
        """Comparison should reject invalid league_id values."""
        response = await async_client.get(
            f"/api/v1/history/comparison?manager_a=123&manager_b=456&league_id={invalid_id}"
        )

        assert response.status_code == 422

    async def test_comparison_validates_non_integer_params(
        self, async_client: AsyncClient, mock_pool
    ):
        """Comparison should return 422 for non-integer params."""
        response = await async_client.get(
            "/api/v1/history/comparison?manager_a=abc&manager_b=456&league_id=789"
        )

        assert response.status_code == 422

    async def test_comparison_accepts_season_id_param(self, async_client: AsyncClient):
        """Comparison should accept optional season_id parameter."""
        response = await async_client.get(
            "/api/v1/history/comparison?manager_a=123&manager_b=456&league_id=789&season_id=1"
        )

        assert response.status_code == 503


class TestHistoryComparisonResponseFormat:
    """Tests for comparison response format (require DB mock)."""

    async def test_comparison_response_structure(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Comparison response should have correct structure."""
        # Mock data: manager info, history, picks, chips for both managers
        mock_manager_a = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        mock_manager_b = [{"id": 456, "player_name": "Jane Smith", "team_name": "FC Jane"}]
        mock_history_a = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 10,
                "overall_rank": 1000,
                "transfers_made": 1,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        mock_history_b = [
            {
                "manager_id": 456,
                "gameweek": 1,
                "gameweek_points": 70,
                "total_points": 70,
                "points_on_bench": 5,
                "overall_rank": 500,
                "transfers_made": 2,
                "transfers_cost": -4,
                "bank": 10,
                "team_value": 1005,
                "active_chip": None,
            }
        ]
        # Starting XI picks (position <= 11)
        mock_picks_a = [{"player_id": 427}, {"player_id": 328}]
        mock_picks_b = [{"player_id": 427}, {"player_id": 500}]
        mock_chips_a = [{"chip_type": "wildcard", "season_half": 1}]
        mock_chips_b = []

        # 14 fetch calls: manager_a, manager_b, history_a, history_b,
        # picks_a, picks_b, chips_a, chips_b, captain_picks, gameweeks,
        # league_standings, league_template, world_template, xg_picks
        mock_api_db.conn.fetch.side_effect = [
            mock_manager_a,
            mock_manager_b,
            mock_history_a,
            mock_history_b,
            mock_picks_a,
            mock_picks_b,
            mock_chips_a,
            mock_chips_b,
            [],  # captain_picks
            [{"id": 1, "most_captained": 427}],  # gameweeks
            [],  # league_standings
            [],  # league_template
            [],  # world_template
            [],  # xg_picks
        ]

        with mock_api_db:
            response = await async_client.get(
                "/api/v1/history/comparison?manager_a=123&manager_b=456&league_id=789"
            )

        assert response.status_code == 200
        data = response.json()

        # Top-level fields
        assert "season_id" in data
        assert "manager_a" in data
        assert "manager_b" in data
        assert "common_players" in data
        assert "head_to_head" in data

        # Verify common_players contains shared player
        assert 427 in data["common_players"]

        # Manager structure (same for both) - matches Phase 1 implementation
        for manager in [data["manager_a"], data["manager_b"]]:
            assert "manager_id" in manager
            assert "name" in manager
            assert "team_name" in manager
            assert "total_points" in manager
            assert "overall_rank" in manager
            assert "league_rank" in manager  # New: league context
            assert "total_transfers" in manager
            assert "total_hits" in manager
            assert "hits_cost" in manager
            assert "remaining_transfers" in manager
            assert "captain_points" in manager
            assert "differential_captains" in manager
            assert "chips_used" in manager
            assert "chips_remaining" in manager
            assert "best_gameweek" in manager
            assert "worst_gameweek" in manager
            assert "starting_xi" in manager
            # Template overlap fields
            assert "league_template_overlap" in manager
            assert "world_template_overlap" in manager
            # Tier 1 analytics
            assert "consistency_score" in manager
            assert "bench_waste_rate" in manager
            assert "hit_frequency" in manager
            assert "last_5_average" in manager
            # Tier 2 analytics
            assert "form_momentum" in manager
            assert "recovery_rate" in manager
            # Tier 3 analytics (xG-based)
            assert "luck_index" in manager
            assert "captain_xp_delta" in manager
            assert "squad_xp" in manager


class TestHistoryComparisonBusinessLogic:
    """Tests for comparison business logic (require DB mock)."""

    async def test_comparison_finds_common_players(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Common players should be intersection of current starting XIs."""
        mock_manager_a = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        mock_manager_b = [{"id": 456, "player_name": "Jane Smith", "team_name": "FC Jane"}]
        mock_history_a = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        mock_history_b = [
            {
                "manager_id": 456,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        # Players: A has [427, 328, 100], B has [427, 500, 100] -> common: [100, 427]
        mock_picks_a = [{"player_id": 427}, {"player_id": 328}, {"player_id": 100}]
        mock_picks_b = [{"player_id": 427}, {"player_id": 500}, {"player_id": 100}]
        mock_chips_a = []
        mock_chips_b = []

        # 14 fetch calls including new template and xG picks queries
        mock_api_db.conn.fetch.side_effect = [
            mock_manager_a,
            mock_manager_b,
            mock_history_a,
            mock_history_b,
            mock_picks_a,
            mock_picks_b,
            mock_chips_a,
            mock_chips_b,
            [],  # captain_picks
            [{"id": 1, "most_captained": 427}],  # gameweeks
            [],  # league_standings
            [],  # league_template
            [],  # world_template
            [],  # xg_picks
        ]

        with mock_api_db:
            response = await async_client.get(
                "/api/v1/history/comparison?manager_a=123&manager_b=456&league_id=789"
            )

        assert response.status_code == 200
        data = response.json()

        # Should find 2 common players (427 and 100)
        assert len(data["common_players"]) == 2
        assert set(data["common_players"]) == {100, 427}

    async def test_comparison_calculates_head_to_head(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Head-to-head record should count GW wins, losses, and draws."""
        mock_manager_a = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        mock_manager_b = [{"id": 456, "player_name": "Jane Smith", "team_name": "FC Jane"}]
        # GW1: A wins (70 > 60), GW2: B wins (65 > 55), GW3: draw (50 = 50)
        mock_history_a = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 70,
                "total_points": 70,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            },
            {
                "manager_id": 123,
                "gameweek": 2,
                "gameweek_points": 55,
                "total_points": 125,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            },
            {
                "manager_id": 123,
                "gameweek": 3,
                "gameweek_points": 50,
                "total_points": 175,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            },
        ]
        mock_history_b = [
            {
                "manager_id": 456,
                "gameweek": 1,
                "gameweek_points": 60,
                "total_points": 60,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            },
            {
                "manager_id": 456,
                "gameweek": 2,
                "gameweek_points": 65,
                "total_points": 125,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            },
            {
                "manager_id": 456,
                "gameweek": 3,
                "gameweek_points": 50,
                "total_points": 175,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            },
        ]
        mock_picks_a = [{"player_id": 1}, {"player_id": 2}, {"player_id": 3}]
        mock_picks_b = [{"player_id": 1}, {"player_id": 2}, {"player_id": 3}]
        mock_chips_a = []
        mock_chips_b = []

        # 14 fetch calls including new template and xG picks queries
        mock_api_db.conn.fetch.side_effect = [
            mock_manager_a,
            mock_manager_b,
            mock_history_a,
            mock_history_b,
            mock_picks_a,
            mock_picks_b,
            mock_chips_a,
            mock_chips_b,
            [],  # captain_picks
            [  # gameweeks
                {"id": 1, "most_captained": 1},
                {"id": 2, "most_captained": 1},
                {"id": 3, "most_captained": 1},
            ],
            [],  # league_standings
            [],  # league_template
            [],  # world_template
            [],  # xg_picks
        ]

        with mock_api_db:
            response = await async_client.get(
                "/api/v1/history/comparison?manager_a=123&manager_b=456&league_id=789"
            )

        assert response.status_code == 200
        data = response.json()

        # Head-to-head: A wins 1, B wins 1, draws 1
        assert data["head_to_head"]["wins_a"] == 1
        assert data["head_to_head"]["wins_b"] == 1
        assert data["head_to_head"]["draws"] == 1

    async def test_comparison_returns_400_for_unknown_manager(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Should return 400 if either manager not in database."""
        # asyncio.gather fetches both managers in parallel, so need 2 return values
        # Manager A not found (empty), Manager B exists (but won't be checked)
        mock_api_db.conn.fetch.side_effect = [
            [],  # Empty result for manager_a
            [{"id": 456, "player_name": "Jane", "team_name": "FC Jane"}],  # manager_b
        ]

        with mock_api_db:
            response = await async_client.get(
                "/api/v1/history/comparison?manager_a=99999&manager_b=456&league_id=789"
            )

        # Service raises ValueError which becomes 400
        assert response.status_code == 400
        assert "not found" in response.json()["detail"].lower()

    async def test_comparison_returns_400_for_same_manager(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Should return 400 if manager_a equals manager_b."""
        # No DB calls needed - validation happens in service before queries
        with mock_api_db:
            response = await async_client.get(
                "/api/v1/history/comparison?manager_a=123&manager_b=123&league_id=789"
            )

        assert response.status_code == 400
        assert "themselves" in response.json()["detail"].lower()

    async def test_comparison_returns_league_rank(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Should return each manager's rank within the league."""
        mock_manager_a = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        mock_manager_b = [{"id": 456, "player_name": "Jane Smith", "team_name": "FC Jane"}]
        mock_history_a = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        mock_history_b = [
            {
                "manager_id": 456,
                "gameweek": 1,
                "gameweek_points": 70,
                "total_points": 70,
                "points_on_bench": 0,
                "overall_rank": 500,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        mock_picks_a = [{"player_id": 427}]
        mock_picks_b = [{"player_id": 427}]
        # League standings: Jane (456) is rank 1, John (123) is rank 2
        mock_league_standings = [
            {"manager_id": 456, "rank": 1},
            {"manager_id": 123, "rank": 2},
        ]

        mock_api_db.conn.fetch.side_effect = [
            mock_manager_a,
            mock_manager_b,
            mock_history_a,
            mock_history_b,
            mock_picks_a,
            mock_picks_b,
            [],  # chips_a
            [],  # chips_b
            [],  # captain_picks
            [{"id": 1, "most_captained": 427}],  # gameweeks
            mock_league_standings,  # league standings query
            [],  # league_template query
            [],  # world_template query
            [],  # xg_picks
        ]

        with mock_api_db:
            response = await async_client.get(
                "/api/v1/history/comparison?manager_a=123&manager_b=456&league_id=789"
            )

        assert response.status_code == 200
        data = response.json()

        # Verify league_rank is present and correct
        assert "league_rank" in data["manager_a"]
        assert "league_rank" in data["manager_b"]
        assert data["manager_a"]["league_rank"] == 2  # John is rank 2
        assert data["manager_b"]["league_rank"] == 1  # Jane is rank 1

        # Verify template overlaps are None when no template data
        assert data["manager_a"]["league_template_overlap"] is None
        assert data["manager_a"]["world_template_overlap"] is None

    async def test_comparison_returns_league_template_overlap(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Should return overlap between manager's XI and league template."""
        mock_manager_a = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        mock_manager_b = [{"id": 456, "player_name": "Jane Smith", "team_name": "FC Jane"}]
        mock_history_a = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        mock_history_b = [
            {
                "manager_id": 456,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        # Manager A has players [427, 328, 100] - 2 match league template [427, 328, 500]
        # Manager B has players [427, 500, 200] - 2 match league template
        mock_picks_a = [{"player_id": 427}, {"player_id": 328}, {"player_id": 100}]
        mock_picks_b = [{"player_id": 427}, {"player_id": 500}, {"player_id": 200}]
        # League template: most owned players across all league managers
        # Simulated: 427 (3 owners), 328 (2 owners), 500 (2 owners)
        mock_league_template = [
            {"player_id": 427, "owner_count": 3},
            {"player_id": 328, "owner_count": 2},
            {"player_id": 500, "owner_count": 2},
        ]

        mock_api_db.conn.fetch.side_effect = [
            mock_manager_a,
            mock_manager_b,
            mock_history_a,
            mock_history_b,
            mock_picks_a,
            mock_picks_b,
            [],  # chips_a
            [],  # chips_b
            [],  # captain_picks
            [{"id": 1, "most_captained": 427}],  # gameweeks
            [],  # league_standings
            mock_league_template,  # league template query
            [],  # world_template query
            [],  # xg_picks
        ]

        with mock_api_db:
            response = await async_client.get(
                "/api/v1/history/comparison?manager_a=123&manager_b=456&league_id=789"
            )

        assert response.status_code == 200
        data = response.json()

        # Verify league_template_overlap structure for Manager A
        overlap_a = data["manager_a"]["league_template_overlap"]
        assert "match_count" in overlap_a
        assert "match_percentage" in overlap_a
        assert "matching_player_ids" in overlap_a
        assert "differential_player_ids" in overlap_a
        assert "playstyle_label" in overlap_a

        # Manager A has 427, 328 matching template [427, 328, 500]
        assert overlap_a["match_count"] == 2
        assert overlap_a["match_percentage"] == pytest.approx(66.7, abs=0.1)
        assert set(overlap_a["matching_player_ids"]) == {427, 328}
        assert 100 in overlap_a["differential_player_ids"]
        assert overlap_a["playstyle_label"] == "Differential"  # 2-4 matches = Differential

        # Verify Manager B overlap too
        overlap_b = data["manager_b"]["league_template_overlap"]
        assert overlap_b["match_count"] == 2  # 427, 500 match template
        assert set(overlap_b["matching_player_ids"]) == {427, 500}
        assert 200 in overlap_b["differential_player_ids"]

    async def test_comparison_returns_world_template_overlap(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Should return overlap between manager's XI and world template (top owned)."""
        mock_manager_a = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        mock_manager_b = [{"id": 456, "player_name": "Jane Smith", "team_name": "FC Jane"}]
        mock_history_a = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        mock_history_b = [
            {
                "manager_id": 456,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        # Manager A has players [427, 328, 100]
        # World template (highest selected_by_percent): [427, 351, 500]
        mock_picks_a = [{"player_id": 427}, {"player_id": 328}, {"player_id": 100}]
        mock_picks_b = [{"player_id": 427}, {"player_id": 351}, {"player_id": 500}]
        # World's most owned players by selected_by_percent
        mock_world_template = [
            {"id": 427, "selected_by_percent": 85.5},  # Salah
            {"id": 351, "selected_by_percent": 78.2},  # Haaland
            {"id": 500, "selected_by_percent": 45.0},  # Popular mid
        ]

        mock_api_db.conn.fetch.side_effect = [
            mock_manager_a,
            mock_manager_b,
            mock_history_a,
            mock_history_b,
            mock_picks_a,
            mock_picks_b,
            [],  # chips_a
            [],  # chips_b
            [],  # captain_picks
            [{"id": 1, "most_captained": 427}],  # gameweeks
            [],  # league_standings
            [],  # league_template
            mock_world_template,  # world template query (top owned players)
            [],  # xg_picks
        ]

        with mock_api_db:
            response = await async_client.get(
                "/api/v1/history/comparison?manager_a=123&manager_b=456&league_id=789"
            )

        assert response.status_code == 200
        data = response.json()

        # Verify world_template_overlap structure
        overlap_a = data["manager_a"]["world_template_overlap"]
        assert "match_count" in overlap_a
        assert "match_percentage" in overlap_a
        assert "matching_player_ids" in overlap_a
        assert "differential_player_ids" in overlap_a
        assert "playstyle_label" in overlap_a

        # Manager A has only 427 matching world template [427, 351, 500]
        assert overlap_a["match_count"] == 1
        assert 427 in overlap_a["matching_player_ids"]

        # Manager B matches all 3 world template players
        # Note: playstyle labels are based on match COUNT not percentage:
        # 9-11=Template, 5-8=Balanced, 2-4=Differential, 0-1=Maverick
        overlap_b = data["manager_b"]["world_template_overlap"]
        assert overlap_b["match_count"] == 3
        assert overlap_b["playstyle_label"] == "Differential"  # 3 matches = Differential

    async def test_comparison_handles_zero_template_overlap(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Should handle case where manager has zero overlap with template (Maverick)."""
        mock_manager_a = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        mock_manager_b = [{"id": 456, "player_name": "Jane Smith", "team_name": "FC Jane"}]
        mock_history_a = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        mock_history_b = [
            {
                "manager_id": 456,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        # Manager A has completely different players from world template
        mock_picks_a = [{"player_id": 999}, {"player_id": 998}, {"player_id": 997}]
        mock_picks_b = [{"player_id": 427}]  # Only one player
        mock_world_template = [
            {"id": 427, "selected_by_percent": 85.5},
            {"id": 351, "selected_by_percent": 78.2},
            {"id": 500, "selected_by_percent": 45.0},
        ]

        mock_api_db.conn.fetch.side_effect = [
            mock_manager_a,
            mock_manager_b,
            mock_history_a,
            mock_history_b,
            mock_picks_a,
            mock_picks_b,
            [],  # chips_a
            [],  # chips_b
            [],  # captain_picks
            [{"id": 1, "most_captained": 427}],  # gameweeks
            [],  # league_standings
            [],  # league_template
            mock_world_template,  # world template query
            [],  # xg_picks
        ]

        with mock_api_db:
            response = await async_client.get(
                "/api/v1/history/comparison?manager_a=123&manager_b=456&league_id=789"
            )

        assert response.status_code == 200
        data = response.json()

        # Manager A has zero overlap - should be "Maverick"
        overlap_a = data["manager_a"]["world_template_overlap"]
        assert overlap_a["match_count"] == 0
        assert overlap_a["match_percentage"] == 0.0
        assert overlap_a["matching_player_ids"] == []
        assert overlap_a["playstyle_label"] == "Maverick"

    async def test_comparison_handles_missing_league_rank(
        self, async_client: AsyncClient, mock_pool, mock_api_db: MockDB
    ):
        """Should return None for league_rank when manager not in league standings."""
        mock_manager_a = [{"id": 123, "player_name": "John Doe", "team_name": "FC John"}]
        mock_manager_b = [{"id": 456, "player_name": "Jane Smith", "team_name": "FC Jane"}]
        mock_history_a = [
            {
                "manager_id": 123,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        mock_history_b = [
            {
                "manager_id": 456,
                "gameweek": 1,
                "gameweek_points": 65,
                "total_points": 65,
                "points_on_bench": 0,
                "overall_rank": 1000,
                "transfers_made": 0,
                "transfers_cost": 0,
                "bank": 5,
                "team_value": 1000,
                "active_chip": None,
            }
        ]
        mock_picks_a = [{"player_id": 427}]
        mock_picks_b = [{"player_id": 427}]

        mock_api_db.conn.fetch.side_effect = [
            mock_manager_a,
            mock_manager_b,
            mock_history_a,
            mock_history_b,
            mock_picks_a,
            mock_picks_b,
            [],  # chips_a
            [],  # chips_b
            [],  # captain_picks
            [{"id": 1, "most_captained": 427}],  # gameweeks
            [],  # league_standings - empty, managers not in this league's standings
            [],  # league_template
            [],  # world_template
            [],  # xg_picks
        ]

        with mock_api_db:
            response = await async_client.get(
                "/api/v1/history/comparison?manager_a=123&manager_b=456&league_id=789"
            )

        assert response.status_code == 200
        data = response.json()

        # Both managers should have None for league_rank when not in standings
        assert data["manager_a"]["league_rank"] is None
        assert data["manager_b"]["league_rank"] is None
