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
        from app.services.history import calculate_captain_differential

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
        from app.services.history import calculate_captain_differential

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
        from app.services.history import calculate_captain_differential

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
        from app.services.history import calculate_captain_differential

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
        assert john["total"] == 25

        jane = next(b for b in result["bench_points"] if b["manager_id"] == 456)
        assert jane["total"] == 25

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

        mock_history_db.conn.fetch.side_effect = [
            mock_managers,
            mock_history,
            mock_picks,
            mock_gameweeks,
        ]

        with mock_history_db:
            result = await history_service.get_league_stats(
                league_id=98765, season_id=1, current_gameweek=1
            )

        john = result["captain_differentials"][0]
        assert john["manager_id"] == 123
        assert john["differential_picks"] == 1

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
        assert john["remaining"] == 3  # 1 + 2 carried (max 5)


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
        ]

        with mock_history_db:
            result = await history_service.get_manager_comparison(
                manager_a=123, manager_b=456, league_id=98765, season_id=1
            )

        assert result["manager_a"]["manager_id"] == 123
        assert result["manager_a"]["total_points"] == 100
        assert result["manager_b"]["manager_id"] == 456
        assert result["manager_b"]["total_points"] == 90

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
            [],  # history_a
            [],  # history_b
            mock_picks_a,
            mock_picks_b,
            [],  # chips_a
            [],  # chips_b
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
            [],
            [],
            [],
            [],
            [],
            [],
            [],  # league template
        ]

        with mock_history_db:
            result = await history_service.get_manager_comparison(
                manager_a=123, manager_b=456, league_id=98765, season_id=1
            )

        assert "league_template_overlap_a" in result
        assert "league_template_overlap_b" in result

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

    async def test_raises_error_when_comparing_same_manager(
        self, history_service: "HistoryService"
    ):
        """Should raise error when comparing manager to themselves."""
        with pytest.raises(ValueError, match="Cannot compare manager to themselves"):
            await history_service.get_manager_comparison(
                manager_a=123, manager_b=123, league_id=98765, season_id=1
            )


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
