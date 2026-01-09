"""TDD tests for HistoryService (historical data migration - phases 1-4).

These tests define the expected service contract before implementation.
HistoryService handles:
- League historical data aggregation
- Position history calculation
- Statistics computation (bench points, captain differential, free transfers)
- Head-to-head manager comparison
"""

from typing import TYPE_CHECKING, TypedDict

import pytest

from app.services.history import clear_cache
from tests.conftest import MockDB

if TYPE_CHECKING:
    from app.services.history import HistoryService


@pytest.fixture(autouse=True)
def clear_history_cache():
    """Clear history service cache before each test to prevent pollution."""
    clear_cache()
    yield
    clear_cache()


# =============================================================================
# TypedDicts for Mock Data
# =============================================================================


class ManagerHistoryRow(TypedDict):
    """Database row structure for manager_gameweek_history table."""

    manager_id: int
    gameweek: int
    gameweek_points: int
    total_points: int
    points_on_bench: int
    overall_rank: int | None
    transfers_made: int
    transfers_cost: int
    bank: int
    team_value: int
    active_chip: str | None


class ManagerRow(TypedDict):
    """Database row structure for managers table."""

    id: int
    player_name: str
    team_name: str


class ChipRow(TypedDict):
    """Database row structure for manager_chips table."""

    manager_id: int
    chip_name: str
    gameweek_used: int | None


class PickRow(TypedDict):
    """Database row structure for manager_picks table."""

    manager_id: int
    gameweek: int
    player_id: int
    position: int
    multiplier: int
    is_captain: bool
    points: int


class GameweekRow(TypedDict):
    """Database row structure for gameweeks table."""

    id: int
    most_captained: int | None


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_history_db() -> MockDB:
    """Mock database connection for history service tests."""
    return MockDB("app.services.history.get_connection")


@pytest.fixture
def history_service() -> "HistoryService":
    """Create HistoryService instance for testing."""
    from app.services.history import HistoryService

    return HistoryService()


# =============================================================================
# Pure Function Tests: calculate_bench_points
# =============================================================================


class TestCalculateBenchPoints:
    """Tests for bench points calculation."""

    def test_sums_points_on_bench_across_gameweeks(self):
        """Should sum points_on_bench for all gameweeks."""
        from app.services.history import calculate_bench_points

        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, points_on_bench=5),
            _make_history_row(gameweek=2, points_on_bench=12),
            _make_history_row(gameweek=3, points_on_bench=8),
        ]
        assert calculate_bench_points(history) == 25

    def test_returns_zero_for_empty_history(self):
        """Should return 0 when no history provided."""
        from app.services.history import calculate_bench_points

        assert calculate_bench_points([]) == 0

    def test_handles_zero_bench_points_gameweeks(self):
        """Should correctly sum when some gameweeks have 0 bench points."""
        from app.services.history import calculate_bench_points

        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, points_on_bench=10),
            _make_history_row(gameweek=2, points_on_bench=0),
            _make_history_row(gameweek=3, points_on_bench=5),
        ]
        assert calculate_bench_points(history) == 15


# =============================================================================
# Pure Function Tests: calculate_free_transfers
# =============================================================================


class TestCalculateFreeTransfers:
    """Tests for free transfer calculation."""

    def test_starts_with_one_free_transfer(self):
        """GW1 should have 1 free transfer."""
        from app.services.history import calculate_free_transfers

        history: list[ManagerHistoryRow] = []
        assert calculate_free_transfers(history, current_gameweek=1) == 1

    def test_carries_unused_transfer(self):
        """Unused transfer should carry to next week (max 2 pre-2024/25)."""
        from app.services.history import calculate_free_transfers

        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, transfers_made=0),  # +1 carry
        ]
        assert calculate_free_transfers(history, current_gameweek=2) == 2

    def test_max_five_transfers_from_2024_25(self):
        """From 2024/25 season, max FT should be 5."""
        from app.services.history import calculate_free_transfers

        # 4 gameweeks with no transfers = 5 banked
        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=i, transfers_made=0) for i in range(1, 5)
        ]
        result = calculate_free_transfers(history, current_gameweek=5, season_id=1)
        assert result == 5

    def test_max_five_not_exceeded(self):
        """Should not exceed 5 even with more unused weeks."""
        from app.services.history import calculate_free_transfers

        # 10 gameweeks with no transfers
        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=i, transfers_made=0) for i in range(1, 11)
        ]
        result = calculate_free_transfers(history, current_gameweek=11, season_id=1)
        assert result == 5

    def test_hit_reduces_to_one_free_transfer(self):
        """Taking a hit should reset to 1 FT next week."""
        from app.services.history import calculate_free_transfers

        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, transfers_made=0),  # Bank 1
            _make_history_row(gameweek=2, transfers_made=0),  # Bank 2
            _make_history_row(gameweek=3, transfers_made=3, transfers_cost=-8),  # Hit!
        ]
        # After hit, reset to 1
        result = calculate_free_transfers(history, current_gameweek=4)
        assert result == 1

    def test_wildcard_resets_to_one(self):
        """Wildcard should reset FT to 1."""
        from app.services.history import calculate_free_transfers

        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, transfers_made=0),
            _make_history_row(gameweek=2, transfers_made=0),
            _make_history_row(gameweek=3, active_chip="wildcard", transfers_made=5),
        ]
        result = calculate_free_transfers(history, current_gameweek=4)
        assert result == 1

    def test_free_hit_does_not_affect_ft_count(self):
        """Free hit should not affect FT (team reverts)."""
        from app.services.history import calculate_free_transfers

        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, transfers_made=0),  # Bank 1 → 2
            _make_history_row(gameweek=2, active_chip="freehit", transfers_made=10),
        ]
        # After free hit, FT should continue from pre-FH state
        result = calculate_free_transfers(history, current_gameweek=3)
        assert result == 2


# =============================================================================
# Pure Function Tests: calculate_captain_differential
# =============================================================================


class TestCalculateCaptainDifferential:
    """Tests for captain differential calculation."""

    def test_counts_differential_picks(self):
        """Should count gameweeks where captain differs from template."""
        from app.services.calculations import calculate_captain_differential

        picks: list[PickRow] = [
            _make_pick_row(gameweek=1, player_id=100, is_captain=True),
            _make_pick_row(gameweek=2, player_id=200, is_captain=True),
            _make_pick_row(gameweek=3, player_id=300, is_captain=True),
        ]
        gameweeks: list[GameweekRow] = [
            {"id": 1, "most_captained": 100},  # Same as manager
            {"id": 2, "most_captained": 200},  # Same as manager
            {"id": 3, "most_captained": 999},  # Different - differential!
        ]
        result = calculate_captain_differential(picks, gameweeks)
        assert result["differential_picks"] == 1

    def test_calculates_points_gained(self):
        """Should calculate net points gained from differential picks."""
        from app.services.calculations import calculate_captain_differential

        picks: list[PickRow] = [
            _make_pick_row(gameweek=1, player_id=100, is_captain=True, points=15),
        ]
        gameweeks: list[GameweekRow] = [
            {"id": 1, "most_captained": 200},  # Different - differential
        ]
        # Need template captain points too (mocked separately)
        template_points = {1: 10}  # Template captain scored 10
        result = calculate_captain_differential(
            picks, gameweeks, template_captain_points=template_points
        )
        # Manager got 15*2=30, template got 10*2=20, gain = +10
        assert result["gain"] == 10

    def test_handles_triple_captain(self):
        """Triple captain should have multiplier of 3."""
        from app.services.calculations import calculate_captain_differential

        picks: list[PickRow] = [
            _make_pick_row(gameweek=1, player_id=100, is_captain=True, points=10, multiplier=3),
        ]
        gameweeks: list[GameweekRow] = [
            {"id": 1, "most_captained": 200},
        ]
        template_points = {1: 10}
        result = calculate_captain_differential(
            picks, gameweeks, template_captain_points=template_points
        )
        # Manager got 10*3=30, template got 10*2=20, gain = +10
        assert result["gain"] == 10

    def test_returns_zero_for_no_differentials(self):
        """Should return 0 when all captains match template."""
        from app.services.calculations import calculate_captain_differential

        picks: list[PickRow] = [
            _make_pick_row(gameweek=1, player_id=100, is_captain=True),
            _make_pick_row(gameweek=2, player_id=200, is_captain=True),
        ]
        gameweeks: list[GameweekRow] = [
            {"id": 1, "most_captained": 100},
            {"id": 2, "most_captained": 200},
        ]
        result = calculate_captain_differential(picks, gameweeks)
        assert result["differential_picks"] == 0
        assert result["gain"] == 0


# =============================================================================
# Pure Function Tests: calculate_captain_differential_with_details
# =============================================================================


class TestCalculateCaptainDifferentialWithDetails:
    """Tests for captain differential calculation with per-GW details."""

    def test_returns_details_for_differential_picks(self):
        """Should return per-GW details with player names and points."""
        from app.services.calculations import calculate_captain_differential_with_details

        picks: list[PickRow] = [
            _make_pick_row(gameweek=1, player_id=100, is_captain=True, points=15),
        ]
        gameweeks: list[GameweekRow] = [{"id": 1, "most_captained": 200}]
        player_names = {100: "Salah", 200: "Haaland"}
        player_gw_points = {100: {1: 15}, 200: {1: 10}}

        result = calculate_captain_differential_with_details(
            picks, gameweeks, player_names, player_gw_points
        )

        assert result["differential_picks"] == 1
        assert result["gain"] == 10  # (15-10) * 2
        assert len(result["details"]) == 1

        detail = result["details"][0]
        assert detail["gameweek"] == 1
        assert detail["captain_id"] == 100
        assert detail["captain_name"] == "Salah"
        assert detail["captain_points"] == 15
        assert detail["template_id"] == 200
        assert detail["template_name"] == "Haaland"
        assert detail["template_points"] == 10
        assert detail["gain"] == 10
        assert detail["multiplier"] == 2

    def test_handles_missing_player_name(self):
        """Should use 'Unknown' when player name not in lookup."""
        from app.services.calculations import calculate_captain_differential_with_details

        picks: list[PickRow] = [
            _make_pick_row(gameweek=1, player_id=100, is_captain=True, points=10),
        ]
        gameweeks: list[GameweekRow] = [{"id": 1, "most_captained": 200}]
        player_names = {}  # Empty - no names found
        player_gw_points = {200: {1: 8}}

        result = calculate_captain_differential_with_details(
            picks, gameweeks, player_names, player_gw_points
        )

        detail = result["details"][0]
        assert detail["captain_name"] == "Unknown"
        assert detail["template_name"] == "Unknown"

    def test_handles_missing_template_points(self):
        """Should use 0 when template captain points not found."""
        from app.services.calculations import calculate_captain_differential_with_details

        picks: list[PickRow] = [
            _make_pick_row(gameweek=1, player_id=100, is_captain=True, points=10),
        ]
        gameweeks: list[GameweekRow] = [{"id": 1, "most_captained": 200}]
        player_names = {100: "Salah", 200: "Haaland"}
        player_gw_points = {}  # Empty - no points found

        result = calculate_captain_differential_with_details(
            picks, gameweeks, player_names, player_gw_points
        )

        detail = result["details"][0]
        assert detail["template_points"] == 0
        assert detail["gain"] == 20  # (10 - 0) * 2

    def test_handles_multiplier_of_1_as_captain(self):
        """Multiplier of 1 should be treated as 2 (captain default)."""
        from app.services.calculations import calculate_captain_differential_with_details

        picks: list[PickRow] = [
            _make_pick_row(gameweek=1, player_id=100, is_captain=True, points=10, multiplier=1),
        ]
        gameweeks: list[GameweekRow] = [{"id": 1, "most_captained": 200}]
        player_names = {100: "Salah", 200: "Haaland"}
        player_gw_points = {200: {1: 8}}

        result = calculate_captain_differential_with_details(
            picks, gameweeks, player_names, player_gw_points
        )

        detail = result["details"][0]
        assert detail["multiplier"] == 2  # Defaulted from 1 to 2
        assert detail["gain"] == 4  # (10 - 8) * 2

    def test_handles_triple_captain_multiplier(self):
        """TC chip should use multiplier of 3."""
        from app.services.calculations import calculate_captain_differential_with_details

        picks: list[PickRow] = [
            _make_pick_row(gameweek=1, player_id=100, is_captain=True, points=10, multiplier=3),
        ]
        gameweeks: list[GameweekRow] = [{"id": 1, "most_captained": 200}]
        player_names = {100: "Salah", 200: "Haaland"}
        player_gw_points = {200: {1: 8}}

        result = calculate_captain_differential_with_details(
            picks, gameweeks, player_names, player_gw_points
        )

        detail = result["details"][0]
        assert detail["multiplier"] == 3
        assert detail["gain"] == 6  # (10 - 8) * 3

    def test_sorts_details_by_gameweek(self):
        """Details should be sorted ascending by gameweek."""
        from app.services.calculations import calculate_captain_differential_with_details

        # Picks in reverse order
        picks: list[PickRow] = [
            _make_pick_row(gameweek=3, player_id=100, is_captain=True, points=10),
            _make_pick_row(gameweek=1, player_id=100, is_captain=True, points=12),
            _make_pick_row(gameweek=2, player_id=100, is_captain=True, points=8),
        ]
        gameweeks: list[GameweekRow] = [
            {"id": 1, "most_captained": 200},
            {"id": 2, "most_captained": 200},
            {"id": 3, "most_captained": 200},
        ]
        player_names = {100: "Salah", 200: "Haaland"}
        player_gw_points = {200: {1: 5, 2: 5, 3: 5}}

        result = calculate_captain_differential_with_details(
            picks, gameweeks, player_names, player_gw_points
        )

        assert len(result["details"]) == 3
        assert result["details"][0]["gameweek"] == 1
        assert result["details"][1]["gameweek"] == 2
        assert result["details"][2]["gameweek"] == 3

    def test_returns_empty_for_no_picks(self):
        """Should return empty details when no picks."""
        from app.services.calculations import calculate_captain_differential_with_details

        result = calculate_captain_differential_with_details(
            picks=[],
            gameweeks=[{"id": 1, "most_captained": 200}],
            player_names={},
            player_gw_points={},
        )

        assert result["differential_picks"] == 0
        assert result["gain"] == 0
        assert result["details"] == []

    def test_returns_empty_for_no_gameweeks(self):
        """Should return empty details when no gameweeks."""
        from app.services.calculations import calculate_captain_differential_with_details

        picks: list[PickRow] = [
            _make_pick_row(gameweek=1, player_id=100, is_captain=True, points=10),
        ]

        result = calculate_captain_differential_with_details(
            picks=picks,
            gameweeks=[],
            player_names={},
            player_gw_points={},
        )

        assert result["differential_picks"] == 0
        assert result["gain"] == 0
        assert result["details"] == []

    def test_skips_non_differential_picks(self):
        """Should only include gameweeks where captain differs from template."""
        from app.services.calculations import calculate_captain_differential_with_details

        picks: list[PickRow] = [
            # GW1: Same as template (200)
            _make_pick_row(gameweek=1, player_id=200, is_captain=True, points=10),
            # GW2: Different from template (100 vs 200)
            _make_pick_row(gameweek=2, player_id=100, is_captain=True, points=15),
        ]
        gameweeks: list[GameweekRow] = [
            {"id": 1, "most_captained": 200},
            {"id": 2, "most_captained": 200},
        ]
        player_names = {100: "Salah", 200: "Haaland"}
        player_gw_points = {200: {1: 10, 2: 8}}

        result = calculate_captain_differential_with_details(
            picks, gameweeks, player_names, player_gw_points
        )

        assert result["differential_picks"] == 1
        assert len(result["details"]) == 1
        assert result["details"][0]["gameweek"] == 2


# =============================================================================
# Pure Function Tests: calculate_league_positions
# =============================================================================


class TestCalculateLeaguePositions:
    """Tests for league position calculation."""

    def test_ranks_by_total_points_descending(self):
        """Should rank managers by total_points (highest = rank 1)."""
        from app.services.history import calculate_league_positions

        history_by_manager = {
            123: [_make_history_row(gameweek=1, total_points=100)],
            456: [_make_history_row(gameweek=1, total_points=150)],
            789: [_make_history_row(gameweek=1, total_points=80)],
        }
        result = calculate_league_positions(history_by_manager, gameweek=1)
        assert result[456] == 1  # 150 pts = 1st
        assert result[123] == 2  # 100 pts = 2nd
        assert result[789] == 3  # 80 pts = 3rd

    def test_handles_ties_with_same_rank(self):
        """Tied points should result in same rank."""
        from app.services.history import calculate_league_positions

        history_by_manager = {
            123: [_make_history_row(gameweek=1, total_points=100)],
            456: [_make_history_row(gameweek=1, total_points=100)],  # Tied
            789: [_make_history_row(gameweek=1, total_points=80)],
        }
        result = calculate_league_positions(history_by_manager, gameweek=1)
        assert result[123] == 1  # Tied 1st
        assert result[456] == 1  # Tied 1st
        assert result[789] == 3  # 3rd (not 2nd - standard sports ranking)

    def test_returns_empty_for_no_managers(self):
        """Should return empty dict when no managers."""
        from app.services.history import calculate_league_positions

        result = calculate_league_positions({}, gameweek=1)
        assert result == {}


# =============================================================================
# HistoryService.get_league_history Tests
# =============================================================================


class TestHistoryServiceGetLeagueHistory:
    """Tests for HistoryService.get_league_history method."""

    async def test_returns_history_for_all_managers(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should return history for all managers in league."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"},
            {"id": 456, "player_name": "Jane", "team_name": "FC Jane"},
        ]
        mock_history: list[ManagerHistoryRow] = [
            _make_history_row(manager_id=123, gameweek=1, total_points=50),
            _make_history_row(manager_id=123, gameweek=2, total_points=110),
            _make_history_row(manager_id=456, gameweek=1, total_points=60),
            _make_history_row(manager_id=456, gameweek=2, total_points=120),
        ]
        mock_chips: list[ChipRow] = [
            {"manager_id": 123, "chip_name": "wildcard", "gameweek_used": 2}
        ]

        mock_history_db.conn.fetch.side_effect = [mock_managers, mock_history, mock_chips]

        with mock_history_db:
            result = await history_service.get_league_history(league_id=98765, season_id=1)

        assert result["league_id"] == 98765
        assert result["season_id"] == 1
        assert len(result["managers"]) == 2

        john = next(m for m in result["managers"] if m["manager_id"] == 123)
        assert john["name"] == "John"
        assert len(john["history"]) == 2
        assert len(john["chips"]) == 1

    async def test_includes_picks_when_requested(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should include picks when include_picks=True."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"}
        ]
        mock_history: list[ManagerHistoryRow] = [_make_history_row(manager_id=123, gameweek=1)]
        mock_chips: list[ChipRow] = []
        mock_picks: list[PickRow] = [
            _make_pick_row(manager_id=123, gameweek=1, player_id=100, position=1),
            _make_pick_row(manager_id=123, gameweek=1, player_id=200, position=2),
        ]

        mock_history_db.conn.fetch.side_effect = [
            mock_managers,
            mock_history,
            mock_chips,
            mock_picks,
        ]

        with mock_history_db:
            result = await history_service.get_league_history(
                league_id=98765, season_id=1, include_picks=True
            )

        john = result["managers"][0]
        gw1 = john["history"][0]
        assert "picks" in gw1
        assert len(gw1["picks"]) == 2

    async def test_excludes_picks_by_default(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should not include picks by default."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"}
        ]
        mock_history: list[ManagerHistoryRow] = [_make_history_row(manager_id=123, gameweek=1)]
        mock_chips: list[ChipRow] = []

        mock_history_db.conn.fetch.side_effect = [mock_managers, mock_history, mock_chips]

        with mock_history_db:
            result = await history_service.get_league_history(league_id=98765, season_id=1)

        john = result["managers"][0]
        gw1 = john["history"][0]
        assert "picks" not in gw1

    async def test_returns_empty_managers_for_unknown_league(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should return empty managers list when league has no members."""
        mock_history_db.conn.fetch.side_effect = [[], [], []]

        with mock_history_db:
            result = await history_service.get_league_history(league_id=99999, season_id=1)

        assert result["managers"] == []


# =============================================================================
# HistoryService.get_league_positions Tests
# =============================================================================


class TestHistoryServiceGetLeaguePositions:
    """Tests for HistoryService.get_league_positions method."""

    async def test_returns_positions_per_gameweek(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should return position history for bump chart."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"},
            {"id": 456, "player_name": "Jane", "team_name": "FC Jane"},
        ]
        mock_history: list[ManagerHistoryRow] = [
            _make_history_row(manager_id=123, gameweek=1, total_points=50),
            _make_history_row(manager_id=456, gameweek=1, total_points=60),
            _make_history_row(manager_id=123, gameweek=2, total_points=100),
            _make_history_row(manager_id=456, gameweek=2, total_points=90),
        ]

        mock_history_db.conn.fetch.side_effect = [mock_managers, mock_history]

        with mock_history_db:
            result = await history_service.get_league_positions(
                league_id=98765, season_id=1
            )

        assert result["league_id"] == 98765
        assert len(result["positions"]) == 2  # 2 gameweeks

        gw1 = result["positions"][0]
        assert gw1["gameweek"] == 1
        assert gw1["123"] == 2  # John 2nd (50 pts)
        assert gw1["456"] == 1  # Jane 1st (60 pts)

        gw2 = result["positions"][1]
        assert gw2["gameweek"] == 2
        assert gw2["123"] == 1  # John 1st (100 pts)
        assert gw2["456"] == 2  # Jane 2nd (90 pts)

    async def test_includes_manager_metadata_for_chart(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should include manager names and colors for chart legend."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"}
        ]
        mock_history: list[ManagerHistoryRow] = []

        mock_history_db.conn.fetch.side_effect = [mock_managers, mock_history]

        with mock_history_db:
            result = await history_service.get_league_positions(
                league_id=98765, season_id=1
            )

        assert len(result["managers"]) == 1
        manager = result["managers"][0]
        assert manager["id"] == 123
        assert manager["name"] == "John"
        assert "color" in manager


# =============================================================================
# HistoryService.get_league_stats Tests
# =============================================================================


class TestHistoryServiceGetLeagueStats:
    """Tests for HistoryService.get_league_stats method."""

    async def test_returns_bench_points_per_manager(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should return cumulative bench points for each manager."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"},
            {"id": 456, "player_name": "Jane", "team_name": "FC Jane"},
        ]
        mock_history: list[ManagerHistoryRow] = [
            _make_history_row(manager_id=123, gameweek=1, points_on_bench=10),
            _make_history_row(manager_id=123, gameweek=2, points_on_bench=15),
            _make_history_row(manager_id=456, gameweek=1, points_on_bench=5),
            _make_history_row(manager_id=456, gameweek=2, points_on_bench=20),
        ]

        mock_history_db.conn.fetch.side_effect = [mock_managers, mock_history, [], []]

        with mock_history_db:
            result = await history_service.get_league_stats(
                league_id=98765, season_id=1, current_gameweek=2
            )

        john = next(b for b in result["bench_points"] if b["manager_id"] == 123)
        assert john["bench_points"] == 25

        jane = next(b for b in result["bench_points"] if b["manager_id"] == 456)
        assert jane["bench_points"] == 25

    async def test_returns_captain_differentials(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should return captain differential stats for each manager."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"}
        ]
        mock_history: list[ManagerHistoryRow] = []
        mock_picks: list[PickRow] = [
            _make_pick_row(manager_id=123, gameweek=1, player_id=100, is_captain=True, points=15)
        ]
        mock_gameweeks: list[GameweekRow] = [{"id": 1, "most_captained": 200}]
        # Player names for the collected player IDs (100 from pick, 200 from template)
        mock_player_names = [
            {"id": 100, "web_name": "Salah"},
            {"id": 200, "web_name": "Haaland"},
        ]
        # GW points for those players
        mock_player_gw_points = [
            {"player_id": 100, "gameweek": 1, "total_points": 15},
            {"player_id": 200, "gameweek": 1, "total_points": 10},
        ]

        mock_history_db.conn.fetch.side_effect = [
            mock_managers,
            mock_history,
            mock_picks,
            mock_gameweeks,
            mock_player_names,
            mock_player_gw_points,
        ]

        with mock_history_db:
            result = await history_service.get_league_stats(
                league_id=98765, season_id=1, current_gameweek=1
            )

        john = result["captain_differential"][0]
        assert john["manager_id"] == 123
        assert john["differential_picks"] == 1

    async def test_captain_differential_negative_gain(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should calculate negative gain when differential captain underperforms template."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"}
        ]
        mock_history: list[ManagerHistoryRow] = []
        # John picked player 100 as captain, but template was player 200
        mock_picks: list[PickRow] = [
            _make_pick_row(manager_id=123, gameweek=1, player_id=100, is_captain=True, points=5)
        ]
        mock_gameweeks: list[GameweekRow] = [{"id": 1, "most_captained": 200}]
        mock_player_names = [
            {"id": 100, "web_name": "Palmer"},
            {"id": 200, "web_name": "Haaland"},
        ]
        # Palmer scored 5 points, Haaland scored 15 points
        # Negative gain = (5 - 15) * 2 = -20
        mock_player_gw_points = [
            {"player_id": 100, "gameweek": 1, "total_points": 5},
            {"player_id": 200, "gameweek": 1, "total_points": 15},
        ]

        mock_history_db.conn.fetch.side_effect = [
            mock_managers,
            mock_history,
            mock_picks,
            mock_gameweeks,
            mock_player_names,
            mock_player_gw_points,
        ]

        with mock_history_db:
            result = await history_service.get_league_stats(
                league_id=98765, season_id=1, current_gameweek=1
            )

        john = result["captain_differential"][0]
        assert john["manager_id"] == 123
        assert john["differential_picks"] == 1
        assert john["gain"] == -20  # (5 - 15) * 2 = -20

        # Verify details include the negative gain
        detail = john["details"][0]
        assert detail["captain_points"] == 5
        assert detail["template_points"] == 15
        assert detail["gain"] == -20

    async def test_returns_free_transfers_remaining(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should return remaining free transfers for each manager."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"}
        ]
        mock_history: list[ManagerHistoryRow] = [
            _make_history_row(manager_id=123, gameweek=1, transfers_made=0),
            _make_history_row(manager_id=123, gameweek=2, transfers_made=0),
        ]

        mock_history_db.conn.fetch.side_effect = [mock_managers, mock_history, [], []]

        with mock_history_db:
            result = await history_service.get_league_stats(
                league_id=98765, season_id=1, current_gameweek=3
            )

        john = result["free_transfers"][0]
        assert john["manager_id"] == 123
        assert john["free_transfers"] == 3  # 1 + 2 carried (max 5)


# =============================================================================
# HistoryService.get_manager_comparison Tests
# =============================================================================


class TestHistoryServiceGetManagerComparison:
    """Tests for HistoryService.get_manager_comparison method."""

    async def test_returns_comparison_stats(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should return comparison stats for both managers."""
        mock_manager_a: ManagerRow = {"id": 123, "player_name": "John", "team_name": "FC John"}
        mock_manager_b: ManagerRow = {"id": 456, "player_name": "Jane", "team_name": "FC Jane"}
        mock_history_a: list[ManagerHistoryRow] = [
            _make_history_row(manager_id=123, gameweek=1, total_points=100)
        ]
        mock_history_b: list[ManagerHistoryRow] = [
            _make_history_row(manager_id=456, gameweek=1, total_points=90)
        ]

        mock_history_db.conn.fetch.side_effect = [
            [mock_manager_a],
            [mock_manager_b],
            mock_history_a,
            mock_history_b,
            [],  # picks_a
            [],  # picks_b
            [],  # chips_a
            [],  # chips_b
            [],  # captain_picks
            [{"id": 1, "most_captained": 100}],  # gameweeks
        ]

        with mock_history_db:
            result = await history_service.get_manager_comparison(
                manager_a=123, manager_b=456, league_id=98765, season_id=1
            )

        assert result["manager_a"]["manager_id"] == 123
        assert result["manager_a"]["total_points"] == 100
        assert result["manager_b"]["manager_id"] == 456
        assert result["manager_b"]["total_points"] == 90
        # Verify Phase 1 fields are present
        assert "remaining_transfers" in result["manager_a"]
        assert "captain_points" in result["manager_a"]
        assert "differential_captains" in result["manager_a"]
        assert "starting_xi" in result["manager_a"]
        assert "head_to_head" in result

    async def test_finds_common_players(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should identify players in both managers' current squads."""
        mock_manager_a: ManagerRow = {"id": 123, "player_name": "John", "team_name": "FC John"}
        mock_manager_b: ManagerRow = {"id": 456, "player_name": "Jane", "team_name": "FC Jane"}
        # Current GW picks
        mock_picks_a: list[PickRow] = [
            _make_pick_row(manager_id=123, gameweek=5, player_id=100, position=1),
            _make_pick_row(manager_id=123, gameweek=5, player_id=200, position=2),
            _make_pick_row(manager_id=123, gameweek=5, player_id=300, position=3),
        ]
        mock_picks_b: list[PickRow] = [
            _make_pick_row(manager_id=456, gameweek=5, player_id=100, position=1),  # Common
            _make_pick_row(manager_id=456, gameweek=5, player_id=400, position=2),
            _make_pick_row(manager_id=456, gameweek=5, player_id=300, position=3),  # Common
        ]

        mock_history_db.conn.fetch.side_effect = [
            [mock_manager_a],
            [mock_manager_b],
            [_make_history_row(manager_id=123, gameweek=5)],  # history_a (needed for max_gw)
            [_make_history_row(manager_id=456, gameweek=5)],  # history_b
            mock_picks_a,
            mock_picks_b,
            [],  # chips_a
            [],  # chips_b
            [],  # captain_picks
            [{"id": 5, "most_captained": 100}],  # gameweeks
        ]

        with mock_history_db:
            result = await history_service.get_manager_comparison(
                manager_a=123, manager_b=456, league_id=98765, season_id=1
            )

        assert sorted(result["common_players"]) == [100, 300]

    async def test_calculates_template_overlap(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should calculate overlap with league template team."""
        # This tests the template overlap score feature
        mock_manager_a: ManagerRow = {"id": 123, "player_name": "John", "team_name": "FC John"}
        mock_manager_b: ManagerRow = {"id": 456, "player_name": "Jane", "team_name": "FC Jane"}

        mock_history_db.conn.fetch.side_effect = [
            [mock_manager_a],
            [mock_manager_b],
            [_make_history_row(manager_id=123, gameweek=1)],  # history_a
            [_make_history_row(manager_id=456, gameweek=1)],  # history_b
            [],  # picks_a
            [],  # picks_b
            [],  # chips_a
            [],  # chips_b
            [],  # captain_picks
            [{"id": 1, "most_captained": 100}],  # gameweeks
        ]

        with mock_history_db:
            result = await history_service.get_manager_comparison(
                manager_a=123, manager_b=456, league_id=98765, season_id=1
            )

        # Phase 1 doesn't include template overlap - removed from scope
        # Just verify basic structure works
        assert "manager_a" in result
        assert "manager_b" in result

    async def test_raises_error_for_unknown_manager(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should raise error when manager not found."""
        # asyncio.gather fetches both managers in parallel, so need 2 return values
        mock_history_db.conn.fetch.side_effect = [
            [],  # manager_a not found
            [{"id": 456, "player_name": "Jane", "team_name": "FC Jane"}],  # manager_b
        ]

        with mock_history_db, pytest.raises(ValueError, match="Manager .* not found"):
            await history_service.get_manager_comparison(
                manager_a=99999, manager_b=456, league_id=98765, season_id=1
            )

    async def test_returns_tier1_analytics_fields(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should return Tier 1 analytics fields: consistency, bench waste, hits, form."""
        mock_manager_a: ManagerRow = {"id": 123, "player_name": "John", "team_name": "FC John"}
        mock_manager_b: ManagerRow = {"id": 456, "player_name": "Jane", "team_name": "FC Jane"}
        # Multi-gameweek history for meaningful analytics
        mock_history_a: list[ManagerHistoryRow] = [
            _make_history_row(
                manager_id=123, gameweek=1, gameweek_points=50, points_on_bench=5
            ),
            _make_history_row(
                manager_id=123, gameweek=2, gameweek_points=60,
                points_on_bench=8, transfers_cost=-4,
            ),
            _make_history_row(
                manager_id=123, gameweek=3, gameweek_points=70, points_on_bench=3
            ),
        ]
        mock_history_b: list[ManagerHistoryRow] = [
            _make_history_row(
                manager_id=456, gameweek=1, gameweek_points=45, points_on_bench=2
            ),
            _make_history_row(
                manager_id=456, gameweek=2, gameweek_points=55, points_on_bench=4
            ),
            _make_history_row(
                manager_id=456, gameweek=3, gameweek_points=65, points_on_bench=6
            ),
        ]

        mock_history_db.conn.fetch.side_effect = [
            [mock_manager_a],
            [mock_manager_b],
            mock_history_a,
            mock_history_b,
            [],  # picks_a
            [],  # picks_b
            [],  # chips_a
            [],  # chips_b
            [],  # captain_picks
            [  # gameweeks
                {"id": 1, "most_captained": 100},
                {"id": 2, "most_captained": 100},
                {"id": 3, "most_captained": 100},
            ],
        ]

        with mock_history_db:
            result = await history_service.get_manager_comparison(
                manager_a=123, manager_b=456, league_id=98765, season_id=1
            )

        # Verify Tier 1 fields are present and numeric
        assert "consistency_score" in result["manager_a"]
        assert "bench_waste_rate" in result["manager_a"]
        assert "hit_frequency" in result["manager_a"]
        assert "last_5_average" in result["manager_a"]

        # Verify calculated values (manager_a has 1 hit out of 3 GWs = 33.33%)
        assert result["manager_a"]["hit_frequency"] == pytest.approx(33.33, rel=0.01)
        # Manager B has no hits = 0%
        assert result["manager_b"]["hit_frequency"] == 0.0

        # last_5_average for manager_a: (50+60+70)/3 = 60
        assert result["manager_a"]["last_5_average"] == 60.0

    # Note: Same-manager validation test removed - validation moved to API layer
    # See test_history_api.py::TestHistoryComparisonEndpoint::test_comparison_rejects_same_manager


# =============================================================================
# Error Handling Tests
# =============================================================================


class TestHistoryServiceErrorHandling:
    """Tests for error handling in HistoryService."""

    async def test_propagates_database_error(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Should propagate database errors to caller."""
        mock_history_db.conn.fetch.side_effect = Exception("Connection timeout")

        with mock_history_db, pytest.raises(Exception, match="Connection timeout"):
            await history_service.get_league_history(league_id=98765, season_id=1)

    async def test_gather_propagates_second_query_failure(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """asyncio.gather should propagate error if second parallel query fails."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"}
        ]

        # First query (managers) succeeds, but second query (history) in gather fails
        mock_history_db.conn.fetch.side_effect = [
            mock_managers,  # Members query succeeds
            Exception("Chips query timeout"),  # Chips query in gather fails
        ]

        with mock_history_db, pytest.raises(Exception, match="Chips query timeout"):
            await history_service.get_league_history(league_id=98765, season_id=1)

    async def test_gather_propagates_stats_query_failure(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """asyncio.gather should propagate error when stats parallel query fails."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"}
        ]

        # Members succeed, history succeeds, but picks query fails
        mock_history_db.conn.fetch.side_effect = [
            mock_managers,  # Members query succeeds
            Exception("History query failed"),  # History query in gather fails
        ]

        with mock_history_db, pytest.raises(Exception, match="History query failed"):
            await history_service.get_league_stats(
                league_id=98765, season_id=1, current_gameweek=1
            )

    async def test_comparison_gather_propagates_manager_lookup_failure(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Manager comparison should propagate error if parallel lookup fails."""
        # First manager lookup succeeds, second fails
        mock_history_db.conn.fetch.side_effect = [
            [{"id": 123, "player_name": "John", "team_name": "FC John"}],
            Exception("Manager B lookup failed"),
        ]

        with mock_history_db, pytest.raises(Exception, match="Manager B lookup failed"):
            await history_service.get_manager_comparison(
                manager_a=123, manager_b=456, league_id=98765, season_id=1
            )


# =============================================================================
# Cache Behavior Tests
# =============================================================================


class TestHistoryServiceCacheBehavior:
    """Tests for caching behavior in HistoryService."""

    async def test_second_call_returns_cached_data(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Second call should return cached data without hitting database."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"}
        ]
        mock_history: list[ManagerHistoryRow] = [
            _make_history_row(manager_id=123, gameweek=1, total_points=100)
        ]
        mock_chips: list[ChipRow] = []

        mock_history_db.conn.fetch.side_effect = [mock_managers, mock_history, mock_chips]

        with mock_history_db:
            # First call - hits database
            result1 = await history_service.get_league_history(
                league_id=98765, season_id=1
            )

            # Reset side_effect - second call should NOT hit database
            mock_history_db.conn.fetch.side_effect = Exception("Should not be called")

            # Second call - should return cached data
            result2 = await history_service.get_league_history(
                league_id=98765, season_id=1
            )

        assert result1 == result2
        assert result1["managers"][0]["manager_id"] == 123

    async def test_cache_is_bypassed_when_include_picks_is_true(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Cache should be bypassed when include_picks=True."""
        mock_managers: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "FC John"}
        ]
        mock_history: list[ManagerHistoryRow] = [
            _make_history_row(manager_id=123, gameweek=1)
        ]
        mock_chips: list[ChipRow] = []
        mock_picks: list[PickRow] = []

        # Set up for two calls - both should hit database
        # Each call needs: managers, history, chips, picks
        mock_history_db.conn.fetch.side_effect = [
            mock_managers,
            mock_history,
            mock_chips,
            mock_picks,
            mock_managers,
            mock_history,
            mock_chips,
            mock_picks,
        ]

        with mock_history_db:
            await history_service.get_league_history(
                league_id=98765, season_id=1, include_picks=True
            )
            await history_service.get_league_history(
                league_id=98765, season_id=1, include_picks=True
            )

        # Should have made 8 fetch calls (4 per call with include_picks=True)
        assert mock_history_db.conn.fetch.call_count == 8

    async def test_different_leagues_have_separate_caches(
        self, history_service: "HistoryService", mock_history_db: MockDB
    ):
        """Different league IDs should have separate cache entries."""
        mock_managers_a: list[ManagerRow] = [
            {"id": 123, "player_name": "John", "team_name": "League A"}
        ]
        mock_managers_b: list[ManagerRow] = [
            {"id": 456, "player_name": "Jane", "team_name": "League B"}
        ]
        mock_history: list[ManagerHistoryRow] = []
        mock_chips: list[ChipRow] = []

        mock_history_db.conn.fetch.side_effect = [
            mock_managers_a,
            mock_history,
            mock_chips,
            mock_managers_b,
            mock_history,
            mock_chips,
        ]

        with mock_history_db:
            result_a = await history_service.get_league_history(
                league_id=11111, season_id=1
            )
            result_b = await history_service.get_league_history(
                league_id=22222, season_id=1
            )

        assert result_a["managers"][0]["manager_id"] == 123
        assert result_b["managers"][0]["manager_id"] == 456


# =============================================================================
# Pure Function Tests: Tier 1 Analytics - calculate_consistency_score
# =============================================================================


class TestCalculateConsistencyScore:
    """Tests for consistency score calculation (standard deviation of GW points)."""

    def test_returns_stddev_of_gameweek_points(self):
        """Should return standard deviation of gameweek_points."""
        from app.services.calculations import calculate_consistency_score

        # Points: 50, 70, 60 → mean=60, variance=((10^2 + 10^2 + 0^2)/3)=66.67, stddev≈8.16
        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, gameweek_points=50),
            _make_history_row(gameweek=2, gameweek_points=70),
            _make_history_row(gameweek=3, gameweek_points=60),
        ]
        result = calculate_consistency_score(history)
        assert round(result, 2) == 8.16

    def test_returns_zero_for_empty_history(self):
        """Should return 0 when no history provided."""
        from app.services.calculations import calculate_consistency_score

        assert calculate_consistency_score([]) == 0.0

    def test_returns_zero_for_single_gameweek(self):
        """Should return 0 when only one gameweek (no variance possible)."""
        from app.services.calculations import calculate_consistency_score

        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, gameweek_points=50)
        ]
        assert calculate_consistency_score(history) == 0.0

    def test_high_variance_manager(self):
        """Should return higher score for inconsistent managers."""
        from app.services.calculations import calculate_consistency_score

        # Very inconsistent: 20, 80, 30, 90 → high stddev
        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, gameweek_points=20),
            _make_history_row(gameweek=2, gameweek_points=80),
            _make_history_row(gameweek=3, gameweek_points=30),
            _make_history_row(gameweek=4, gameweek_points=90),
        ]
        result = calculate_consistency_score(history)
        # Mean = 55, deviations: -35, 25, -25, 35
        # Variance = (35^2 + 25^2 + 25^2 + 35^2)/4 = (1225+625+625+1225)/4 = 925
        # StdDev = sqrt(925) ≈ 30.41
        assert round(result, 2) == 30.41

    def test_low_variance_manager(self):
        """Should return lower score for consistent managers."""
        from app.services.calculations import calculate_consistency_score

        # Very consistent: 55, 55, 55, 55 → stddev = 0
        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, gameweek_points=55),
            _make_history_row(gameweek=2, gameweek_points=55),
            _make_history_row(gameweek=3, gameweek_points=55),
            _make_history_row(gameweek=4, gameweek_points=55),
        ]
        assert calculate_consistency_score(history) == 0.0


# =============================================================================
# Pure Function Tests: Tier 1 Analytics - calculate_bench_waste_rate
# =============================================================================


class TestCalculateBenchWasteRate:
    """Tests for bench waste rate calculation (avg bench points as % of total)."""

    def test_returns_percentage_of_bench_vs_total(self):
        """Should return bench points as percentage of total points per GW."""
        from app.services.calculations import calculate_bench_waste_rate

        # GW1: 10 bench / 60 total = 16.67%
        # GW2: 5 bench / 50 total = 10%
        # Average = 13.33%
        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, gameweek_points=60, points_on_bench=10),
            _make_history_row(gameweek=2, gameweek_points=50, points_on_bench=5),
        ]
        result = calculate_bench_waste_rate(history)
        assert round(result, 2) == 13.33

    def test_returns_zero_for_empty_history(self):
        """Should return 0 when no history provided."""
        from app.services.calculations import calculate_bench_waste_rate

        assert calculate_bench_waste_rate([]) == 0.0

    def test_returns_zero_when_no_bench_points(self):
        """Should return 0 when no bench points in any gameweek."""
        from app.services.calculations import calculate_bench_waste_rate

        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, gameweek_points=60, points_on_bench=0),
            _make_history_row(gameweek=2, gameweek_points=50, points_on_bench=0),
        ]
        assert calculate_bench_waste_rate(history) == 0.0

    def test_handles_zero_points_gameweek(self):
        """Should skip gameweeks with zero total points (avoid division by zero)."""
        from app.services.calculations import calculate_bench_waste_rate

        # GW2 has 0 total points, should be skipped
        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, gameweek_points=50, points_on_bench=5),  # 10%
            _make_history_row(gameweek=2, gameweek_points=0, points_on_bench=0),   # Skip
            _make_history_row(gameweek=3, gameweek_points=60, points_on_bench=12), # 20%
        ]
        result = calculate_bench_waste_rate(history)
        # Average of 10% and 20% = 15%
        assert round(result, 2) == 15.0


# =============================================================================
# Pure Function Tests: Tier 1 Analytics - calculate_hit_frequency
# =============================================================================


class TestCalculateHitFrequency:
    """Tests for hit frequency calculation (% of GWs with hits taken)."""

    def test_returns_percentage_of_gws_with_hits(self):
        """Should return percentage of gameweeks where hits were taken."""
        from app.services.calculations import calculate_hit_frequency

        # 2 out of 4 GWs had hits = 50%
        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, transfers_cost=0),
            _make_history_row(gameweek=2, transfers_cost=-4),  # Hit
            _make_history_row(gameweek=3, transfers_cost=0),
            _make_history_row(gameweek=4, transfers_cost=-8),  # Hit
        ]
        result = calculate_hit_frequency(history)
        assert result == 50.0

    def test_returns_zero_for_empty_history(self):
        """Should return 0 when no history provided."""
        from app.services.calculations import calculate_hit_frequency

        assert calculate_hit_frequency([]) == 0.0

    def test_returns_zero_when_no_hits(self):
        """Should return 0 when no hits taken."""
        from app.services.calculations import calculate_hit_frequency

        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, transfers_cost=0),
            _make_history_row(gameweek=2, transfers_cost=0),
            _make_history_row(gameweek=3, transfers_cost=0),
        ]
        assert calculate_hit_frequency(history) == 0.0

    def test_returns_100_when_hits_every_week(self):
        """Should return 100 when hits taken every gameweek."""
        from app.services.calculations import calculate_hit_frequency

        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, transfers_cost=-4),
            _make_history_row(gameweek=2, transfers_cost=-8),
            _make_history_row(gameweek=3, transfers_cost=-4),
        ]
        assert calculate_hit_frequency(history) == 100.0


# =============================================================================
# Pure Function Tests: Tier 1 Analytics - calculate_last_5_average
# =============================================================================


class TestCalculateLast5Average:
    """Tests for last 5 gameweeks average calculation."""

    def test_returns_average_of_last_5_gws(self):
        """Should return average of last 5 gameweek points."""
        from app.services.calculations import calculate_last_5_average

        # Last 5 GWs: 50, 60, 70, 80, 90 → avg = 70
        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, gameweek_points=30),  # Not counted
            _make_history_row(gameweek=2, gameweek_points=40),  # Not counted
            _make_history_row(gameweek=3, gameweek_points=50),
            _make_history_row(gameweek=4, gameweek_points=60),
            _make_history_row(gameweek=5, gameweek_points=70),
            _make_history_row(gameweek=6, gameweek_points=80),
            _make_history_row(gameweek=7, gameweek_points=90),
        ]
        result = calculate_last_5_average(history)
        assert result == 70.0

    def test_returns_average_when_less_than_5_gws(self):
        """Should return average of all gameweeks when less than 5."""
        from app.services.calculations import calculate_last_5_average

        # Only 3 GWs: 50, 60, 70 → avg = 60
        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=1, gameweek_points=50),
            _make_history_row(gameweek=2, gameweek_points=60),
            _make_history_row(gameweek=3, gameweek_points=70),
        ]
        result = calculate_last_5_average(history)
        assert result == 60.0

    def test_returns_zero_for_empty_history(self):
        """Should return 0 when no history provided."""
        from app.services.calculations import calculate_last_5_average

        assert calculate_last_5_average([]) == 0.0

    def test_handles_unsorted_gameweeks(self):
        """Should sort by gameweek and take last 5."""
        from app.services.calculations import calculate_last_5_average

        # Unsorted input, last 5 should be GW3-7
        history: list[ManagerHistoryRow] = [
            _make_history_row(gameweek=5, gameweek_points=70),
            _make_history_row(gameweek=1, gameweek_points=30),
            _make_history_row(gameweek=7, gameweek_points=90),
            _make_history_row(gameweek=3, gameweek_points=50),
            _make_history_row(gameweek=6, gameweek_points=80),
            _make_history_row(gameweek=2, gameweek_points=40),
            _make_history_row(gameweek=4, gameweek_points=60),
        ]
        result = calculate_last_5_average(history)
        # Last 5 (GW3-7): 50, 60, 70, 80, 90 → avg = 70
        assert result == 70.0


# =============================================================================
# Helper Functions for Test Data
# =============================================================================


def _make_history_row(
    manager_id: int = 123,
    gameweek: int = 1,
    gameweek_points: int = 50,
    total_points: int = 50,
    points_on_bench: int = 0,
    overall_rank: int | None = None,
    transfers_made: int = 0,
    transfers_cost: int = 0,
    bank: int = 0,
    team_value: int = 1000,
    active_chip: str | None = None,
) -> ManagerHistoryRow:
    """Create a mock ManagerHistoryRow with defaults."""
    return {
        "manager_id": manager_id,
        "gameweek": gameweek,
        "gameweek_points": gameweek_points,
        "total_points": total_points,
        "points_on_bench": points_on_bench,
        "overall_rank": overall_rank,
        "transfers_made": transfers_made,
        "transfers_cost": transfers_cost,
        "bank": bank,
        "team_value": team_value,
        "active_chip": active_chip,
    }


def _make_pick_row(
    manager_id: int = 123,
    gameweek: int = 1,
    player_id: int = 100,
    position: int = 1,
    multiplier: int = 1,
    is_captain: bool = False,
    points: int = 0,
) -> PickRow:
    """Create a mock PickRow with defaults."""
    return {
        "manager_id": manager_id,
        "gameweek": gameweek,
        "player_id": player_id,
        "position": position,
        "multiplier": multiplier,
        "is_captain": is_captain,
        "points": points,
    }
