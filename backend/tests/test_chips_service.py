"""Tests for Chips service with mocked database (TDD - written before implementation)."""

from collections.abc import Callable
from typing import TYPE_CHECKING, TypedDict
from unittest.mock import patch

import pytest

from tests.conftest import MockDB

if TYPE_CHECKING:
    from app.services.chips import ChipsService

# =============================================================================
# Constants
# =============================================================================

# Gameweek boundaries for season half determination
FIRST_HALF_END = 19  # Last GW of first half
SECOND_HALF_START = 20  # First GW of second half (chip reset)
SEASON_END = 38  # Last GW of season


# =============================================================================
# TypedDicts for Mock Data
# =============================================================================


class ChipUsageRow(TypedDict):
    """Database row structure for chip_usage table."""

    manager_id: int
    season_id: int
    season_half: int
    chip_type: str
    gameweek: int
    points_gained: int | None


class LeagueMemberRow(TypedDict):
    """Database row structure for league members query."""

    manager_id: int
    player_name: str


# =============================================================================
# Shared Fixtures
# =============================================================================


@pytest.fixture
def chips_service() -> "ChipsService":
    """Create ChipsService instance for testing."""
    from app.services.chips import ChipsService

    return ChipsService()


# mock_db fixture is inherited from conftest.py


# =============================================================================
# Helper: Import functions (fail-fast for TDD)
# =============================================================================


def _import_get_season_half() -> Callable[[int], int]:
    """Import get_season_half - will fail until implementation exists."""
    from app.services.chips import get_season_half

    return get_season_half


def _import_get_remaining_chips() -> Callable[[list[str]], list[str]]:
    """Import get_remaining_chips - will fail until implementation exists."""
    from app.services.chips import get_remaining_chips

    return get_remaining_chips


# =============================================================================
# Pure Function Tests: get_season_half
# =============================================================================


class TestGetSeasonHalf:
    """Tests for season half determination logic."""

    @pytest.mark.parametrize(
        ("gameweek", "expected_half"),
        [
            (1, 1),  # First GW of first half
            (FIRST_HALF_END, 1),  # Last GW of first half
            (SECOND_HALF_START, 2),  # First GW of second half (chip reset)
            (SEASON_END, 2),  # Last GW of second half
        ],
        ids=["gw1", "gw19_boundary", "gw20_reset", "gw38_end"],
    )
    def test_valid_gameweek_returns_correct_half(self, gameweek: int, expected_half: int):
        """Valid gameweeks should return correct season half."""
        get_season_half = _import_get_season_half()
        assert get_season_half(gameweek) == expected_half

    @pytest.mark.parametrize(
        "invalid_gw",
        [0, -1, -100, SEASON_END + 1, 100],
        ids=["zero", "negative", "large_negative", "gw39", "gw100"],
    )
    def test_invalid_gameweek_raises_value_error(self, invalid_gw: int):
        """Invalid gameweeks should raise ValueError."""
        get_season_half = _import_get_season_half()
        with pytest.raises(ValueError, match="Gameweek must be between 1 and 38"):
            get_season_half(invalid_gw)


# =============================================================================
# Pure Function Tests: get_remaining_chips
# =============================================================================


class TestGetRemainingChips:
    """Tests for remaining chips calculation."""

    def test_all_chips_remaining_when_none_used(self):
        """Should return all 4 chips when none used."""
        get_remaining_chips = _import_get_remaining_chips()
        remaining = get_remaining_chips([])
        assert sorted(remaining) == ["3xc", "bboost", "freehit", "wildcard"]

    def test_three_chips_remaining_when_one_used(self):
        """Should return 3 chips when 1 used."""
        get_remaining_chips = _import_get_remaining_chips()
        remaining = get_remaining_chips(["wildcard"])
        assert "wildcard" not in remaining
        assert sorted(remaining) == ["3xc", "bboost", "freehit"]

    def test_no_chips_remaining_when_all_used(self):
        """Should return empty list when all 4 used."""
        get_remaining_chips = _import_get_remaining_chips()
        remaining = get_remaining_chips(["wildcard", "bboost", "3xc", "freehit"])
        assert remaining == []

    def test_ignores_unknown_chip_types(self):
        """Should ignore chip types not in ALL_CHIPS set."""
        get_remaining_chips = _import_get_remaining_chips()
        remaining = get_remaining_chips(["unknown_chip", "wildcard", "invalid"])
        assert "wildcard" not in remaining
        assert sorted(remaining) == ["3xc", "bboost", "freehit"]

    def test_handles_duplicate_chips_in_used_list(self):
        """Should handle duplicate chip entries gracefully."""
        get_remaining_chips = _import_get_remaining_chips()
        remaining = get_remaining_chips(["wildcard", "wildcard", "bboost"])
        assert sorted(remaining) == ["3xc", "freehit"]

    def test_returns_chips_in_consistent_order(self):
        """Should return chips in alphabetical order for consistent API responses."""
        get_remaining_chips = _import_get_remaining_chips()
        remaining1 = get_remaining_chips([])
        remaining2 = get_remaining_chips([])
        assert remaining1 == remaining2
        assert remaining1 == ["3xc", "bboost", "freehit", "wildcard"]

    def test_chip_types_are_case_sensitive(self):
        """Chip types should be case-sensitive (uppercase not recognized)."""
        get_remaining_chips = _import_get_remaining_chips()
        remaining = get_remaining_chips(["WILDCARD", "BBOOST"])
        assert sorted(remaining) == ["3xc", "bboost", "freehit", "wildcard"]


# =============================================================================
# ChipsService.get_manager_chips Tests
# =============================================================================


class TestChipsServiceGetManagerChips:
    """Tests for ChipsService.get_manager_chips method."""

    async def test_returns_manager_chips_data(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should return ManagerChips with both halves."""
        mock_rows: list[ChipUsageRow] = [
            {
                "manager_id": 12345,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "wildcard",
                "gameweek": 5,
                "points_gained": None,
            },
            {
                "manager_id": 12345,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "bboost",
                "gameweek": 15,
                "points_gained": 24,
            },
            {
                "manager_id": 12345,
                "season_id": 1,
                "season_half": 2,
                "chip_type": "3xc",
                "gameweek": 21,
                "points_gained": 18,
            },
        ]

        mock_db.conn.fetch.return_value = mock_rows
        with mock_db:
            result = await chips_service.get_manager_chips(manager_id=12345, season_id=1)

        assert result.manager_id == 12345
        assert len(result.first_half.chips_used) == 2
        assert len(result.first_half.chips_remaining) == 2
        assert sorted(result.first_half.chips_remaining) == ["3xc", "freehit"]
        assert len(result.second_half.chips_used) == 1
        assert len(result.second_half.chips_remaining) == 3

    async def test_returns_all_chips_remaining_when_none_used(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should return all 4 chips for each half when none used."""
        mock_db.conn.fetch.return_value = []
        with mock_db:
            result = await chips_service.get_manager_chips(manager_id=12345, season_id=1)

        assert len(result.first_half.chips_remaining) == 4
        assert len(result.second_half.chips_remaining) == 4

    async def test_propagates_database_error(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should propagate database errors to caller."""
        mock_db.conn.fetch.side_effect = Exception("Connection timeout")
        with mock_db, pytest.raises(Exception, match="Connection timeout"):
            await chips_service.get_manager_chips(manager_id=12345, season_id=1)

    async def test_handles_malformed_chip_type_from_database(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should gracefully handle malformed chip_type values from database."""
        mock_rows: list[ChipUsageRow] = [
            {
                "manager_id": 12345,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "",  # Empty string - malformed data
                "gameweek": 5,
                "points_gained": None,
            },
        ]
        mock_db.conn.fetch.return_value = mock_rows
        with mock_db:
            result = await chips_service.get_manager_chips(manager_id=12345, season_id=1)

        # Empty chip_type should be ignored, all 4 chips still remaining
        assert len(result.first_half.chips_remaining) == 4

    async def test_handles_null_points_gained_in_response(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should correctly include chips with null points_gained in response."""
        mock_rows: list[ChipUsageRow] = [
            {
                "manager_id": 12345,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "wildcard",
                "gameweek": 5,
                "points_gained": None,  # Wildcard has no points calculation
            },
        ]
        mock_db.conn.fetch.return_value = mock_rows
        with mock_db:
            result = await chips_service.get_manager_chips(manager_id=12345, season_id=1)

        # Should have chip with None points_gained without crashing
        assert len(result.first_half.chips_used) == 1
        chip_used = result.first_half.chips_used[0]
        assert chip_used.points_gained is None


# =============================================================================
# ChipsService.get_league_chips Tests
# =============================================================================


class TestChipsServiceGetLeagueChips:
    """Tests for ChipsService.get_league_chips method."""

    async def test_returns_chips_for_all_managers(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should return chip data for all managers in league."""
        mock_league_members: list[LeagueMemberRow] = [
            {"manager_id": 123, "player_name": "John Doe"},
            {"manager_id": 456, "player_name": "Jane Smith"},
        ]

        mock_chip_usage: list[ChipUsageRow] = [
            {
                "manager_id": 123,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "wildcard",
                "gameweek": 5,
                "points_gained": None,
            }
        ]

        mock_db.conn.fetch.side_effect = [mock_league_members, mock_chip_usage]
        with mock_db:
            result = await chips_service.get_league_chips(
                league_id=98765, season_id=1, current_gameweek=10
            )

        assert result.league_id == 98765
        assert len(result.managers) == 2

        john = next(m for m in result.managers if m.manager_id == 123)
        assert len(john.first_half.chips_remaining) == 3

        jane = next(m for m in result.managers if m.manager_id == 456)
        assert len(jane.first_half.chips_remaining) == 4

    @pytest.mark.parametrize(
        ("gameweek", "expected_half"),
        [
            (15, 1),
            (FIRST_HALF_END, 1),  # Last GW before reset
            (SECOND_HALF_START, 2),  # Chip reset boundary
            (22, 2),
        ],
        ids=["gw15", "gw19_boundary", "gw20_reset", "gw22"],
    )
    async def test_returns_correct_current_half(
        self, chips_service: "ChipsService", mock_db: MockDB, gameweek: int, expected_half: int
    ):
        """Should return correct current_half based on gameweek."""
        mock_db.conn.fetch.side_effect = [[], []]
        with mock_db:
            result = await chips_service.get_league_chips(
                league_id=98765, season_id=1, current_gameweek=gameweek
            )

        assert result.current_half == expected_half
        assert result.current_gameweek == gameweek

    async def test_returns_empty_managers_for_empty_league(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should return empty managers list when league has no members."""
        mock_db.conn.fetch.side_effect = [[], []]
        with mock_db:
            result = await chips_service.get_league_chips(
                league_id=12345, season_id=1, current_gameweek=10
            )

        assert result.managers == []
        assert result.league_id == 12345

    async def test_handles_multiple_managers_using_same_chip(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should correctly track when multiple managers use the same chip."""
        mock_league_members: list[LeagueMemberRow] = [
            {"manager_id": 123, "player_name": "John"},
            {"manager_id": 456, "player_name": "Jane"},
            {"manager_id": 789, "player_name": "Bob"},
        ]

        mock_chip_usage: list[ChipUsageRow] = [
            {
                "manager_id": 123,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "wildcard",
                "gameweek": 2,
                "points_gained": None,
            },
            {
                "manager_id": 456,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "wildcard",
                "gameweek": 2,
                "points_gained": None,
            },
            {
                "manager_id": 789,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "wildcard",
                "gameweek": 3,
                "points_gained": None,
            },
        ]

        mock_db.conn.fetch.side_effect = [mock_league_members, mock_chip_usage]
        with mock_db:
            result = await chips_service.get_league_chips(
                league_id=98765, season_id=1, current_gameweek=5
            )

        assert len(result.managers) == 3
        for manager in result.managers:
            assert "wildcard" not in manager.first_half.chips_remaining
            assert len(manager.first_half.chips_remaining) == 3
            assert sorted(manager.first_half.chips_remaining) == ["3xc", "bboost", "freehit"]

    async def test_ignores_chip_usage_for_non_league_managers(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should not include chip data for managers not in the league (orphan data)."""
        mock_league_members: list[LeagueMemberRow] = [
            {"manager_id": 123, "player_name": "John"},
        ]

        # Chip usage includes a manager not in the league
        mock_chip_usage: list[ChipUsageRow] = [
            {
                "manager_id": 123,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "wildcard",
                "gameweek": 5,
                "points_gained": None,
            },
            {
                "manager_id": 999,
                "season_id": 1,
                "season_half": 1,
                "chip_type": "bboost",
                "gameweek": 6,
                "points_gained": 20,
            },
        ]

        mock_db.conn.fetch.side_effect = [mock_league_members, mock_chip_usage]
        with mock_db:
            result = await chips_service.get_league_chips(
                league_id=98765, season_id=1, current_gameweek=10
            )

        # Should only have 1 manager, orphan chip data ignored
        assert len(result.managers) == 1
        assert result.managers[0].manager_id == 123

    @pytest.mark.parametrize(
        "invalid_gw",
        [0, -1, SEASON_END + 1, 100],
        ids=["zero", "negative", "gw39", "gw100"],
    )
    async def test_raises_error_for_invalid_gameweek(
        self, chips_service: "ChipsService", mock_db: MockDB, invalid_gw: int
    ):
        """Should raise ValueError when current_gameweek is out of range."""
        mock_db.conn.fetch.side_effect = [[], []]
        with mock_db, pytest.raises(ValueError, match="Gameweek must be between 1 and 38"):
            await chips_service.get_league_chips(
                league_id=98765, season_id=1, current_gameweek=invalid_gw
            )

    async def test_propagates_error_when_second_query_fails(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should propagate error when chip usage query fails after league members succeeds."""
        mock_league_members: list[LeagueMemberRow] = [
            {"manager_id": 123, "player_name": "John Doe"},
        ]
        # First query succeeds, second fails
        mock_db.conn.fetch.side_effect = [
            mock_league_members,
            Exception("Query timeout"),
        ]
        with mock_db, pytest.raises(Exception, match="Query timeout"):
            await chips_service.get_league_chips(
                league_id=98765, season_id=1, current_gameweek=10
            )


# =============================================================================
# ChipsService.save_chip_usage Tests
# =============================================================================


class TestChipsServiceSaveChipUsage:
    """Tests for ChipsService.save_chip_usage method."""

    async def test_saves_chip_with_season_half_1_for_gw5(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should calculate and save season_half=1 for GW5."""
        with mock_db:
            await chips_service.save_chip_usage(
                manager_id=12345,
                season_id=1,
                gameweek=5,
                chip_type="wildcard",
                points_gained=None,
            )

        mock_db.conn.execute.assert_called_once()
        call_args = mock_db.conn.execute.call_args

        sql = call_args[0][0]
        assert "INSERT INTO chip_usage" in sql

        params = call_args[0][1:]
        assert 12345 in params, "manager_id should be in query params"
        assert 5 in params, "gameweek should be in query params"
        assert "wildcard" in params, "chip_type should be in query params"
        assert 1 in params, "season_half=1 for GW5 should be in query params"

    async def test_saves_chip_with_season_half_2_for_gw21(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should save season_half=2 for GW21."""
        with mock_db:
            await chips_service.save_chip_usage(
                manager_id=12345,
                season_id=1,
                gameweek=21,
                chip_type="bboost",
                points_gained=32,
            )

        call_args = mock_db.conn.execute.call_args
        params = call_args[0][1:]
        assert 21 in params, "gameweek should be in query params"
        assert 2 in params, "season_half=2 for GW21 should be in query params"
        assert 32 in params, "points_gained should be in query params"

    @pytest.mark.parametrize(
        ("gameweek", "expected_half"),
        [
            (FIRST_HALF_END, 1),  # GW19 - last of first half
            (SECOND_HALF_START, 2),  # GW20 - first of second half (chip reset)
        ],
        ids=["gw19_boundary", "gw20_reset"],
    )
    async def test_saves_correct_half_at_boundary_gameweeks(
        self, chips_service: "ChipsService", mock_db: MockDB, gameweek: int, expected_half: int
    ):
        """Should calculate correct season_half at GW19/GW20 boundary."""
        with mock_db:
            await chips_service.save_chip_usage(
                manager_id=12345,
                season_id=1,
                gameweek=gameweek,
                chip_type="wildcard",
                points_gained=None,
            )

        call_args = mock_db.conn.execute.call_args
        params = call_args[0][1:]
        assert gameweek in params, f"gameweek {gameweek} should be in query params"
        assert expected_half in params, f"season_half={expected_half} should be in query params"

    @pytest.mark.parametrize(
        "valid_chip",
        ["wildcard", "bboost", "3xc", "freehit"],
        ids=["wildcard", "bench_boost", "triple_captain", "free_hit"],
    )
    async def test_accepts_all_valid_chip_types(
        self, chips_service: "ChipsService", mock_db: MockDB, valid_chip: str
    ):
        """Should accept all valid chip types without raising."""
        with mock_db:
            await chips_service.save_chip_usage(
                manager_id=12345,
                season_id=1,
                gameweek=5,
                chip_type=valid_chip,
                points_gained=None,
            )

        mock_db.conn.execute.assert_called_once()

    async def test_uses_upsert_for_duplicate_chip_usage(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should use ON CONFLICT DO UPDATE for idempotent saves."""
        with mock_db:
            await chips_service.save_chip_usage(
                manager_id=12345,
                season_id=1,
                gameweek=5,
                chip_type="wildcard",
                points_gained=None,
            )

        call_args = mock_db.conn.execute.call_args
        sql = call_args[0][0]
        assert "INSERT INTO chip_usage" in sql
        assert "ON CONFLICT" in sql

    @pytest.mark.parametrize(
        "invalid_chip",
        ["invalid_chip", "WILDCARD", "", "   "],
        ids=["unknown", "uppercase", "empty", "whitespace"],
    )
    async def test_rejects_invalid_chip_type(
        self, chips_service: "ChipsService", invalid_chip: str
    ):
        """Should raise ValueError for invalid chip types."""
        with pytest.raises(ValueError, match="Invalid chip type"):
            await chips_service.save_chip_usage(
                manager_id=12345,
                season_id=1,
                gameweek=5,
                chip_type=invalid_chip,
                points_gained=None,
            )

    @pytest.mark.parametrize(
        "invalid_gw",
        [0, -1, SEASON_END + 1, 100],
        ids=["zero", "negative", "gw39", "gw100"],
    )
    async def test_rejects_invalid_gameweek(
        self, chips_service: "ChipsService", invalid_gw: int
    ):
        """Should raise ValueError for invalid gameweeks before DB interaction."""
        with pytest.raises(ValueError, match="Gameweek must be between 1 and 38"):
            await chips_service.save_chip_usage(
                manager_id=12345,
                season_id=1,
                gameweek=invalid_gw,
                chip_type="wildcard",
                points_gained=None,
            )

    async def test_propagates_database_error_on_save(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should propagate database errors during save operation."""
        mock_db.conn.execute.side_effect = Exception("Disk full")
        with mock_db, pytest.raises(Exception, match="Disk full"):
            await chips_service.save_chip_usage(
                manager_id=12345,
                season_id=1,
                gameweek=5,
                chip_type="wildcard",
                points_gained=None,
            )


# =============================================================================
# ChipsService.collect_manager_chips Tests
# =============================================================================


class TestChipsServiceCollectManagerChips:
    """Tests for ChipsService.collect_manager_chips method (lazy collection)."""

    @pytest.mark.skip(reason="Collection requires FplApiClient.get_manager_history() - Phase 4")
    async def test_fetches_from_fpl_api_and_saves(
        self, chips_service: "ChipsService", mock_db: MockDB
    ):
        """Should fetch chips from FPL API and save to database."""
        mock_fpl_response = {
            "chips": [
                {"name": "wildcard", "event": 5},
                {"name": "bboost", "event": 15},
            ]
        }

        with (
            mock_db,
            patch("app.services.chips.FPLClient") as mock_fpl_client,
        ):
            mock_fpl_client.return_value.get_manager_history.return_value = (
                mock_fpl_response
            )
            await chips_service.collect_manager_chips(manager_id=12345, season_id=1)

        assert mock_db.conn.execute.call_count == 2
