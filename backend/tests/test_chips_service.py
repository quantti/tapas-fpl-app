"""Tests for Chips service with mocked database (TDD - written before implementation)."""

from typing import TYPE_CHECKING, TypedDict
from unittest.mock import AsyncMock, patch

import pytest

if TYPE_CHECKING:
    from app.services.chips import ChipsService

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


@pytest.fixture
def mock_db():
    """Create a mock database connection with patch context.

    Usage:
        async def test_example(self, chips_service, mock_db):
            mock_db.conn.fetch.return_value = [...]
            with mock_db.patch:
                result = await chips_service.some_method()
    """

    class MockDB:
        def __init__(self):
            self.conn = AsyncMock()
            self.patch = patch("app.services.chips.get_connection")
            self._mock_get_conn = None

        def __enter__(self):
            self._mock_get_conn = self.patch.__enter__()
            self._mock_get_conn.return_value.__aenter__.return_value = self.conn
            return self

        def __exit__(self, *args):
            self.patch.__exit__(*args)

    return MockDB()


# =============================================================================
# Helper: Import functions (fail-fast for TDD)
# =============================================================================


def _import_get_season_half():
    """Import get_season_half - will fail until implementation exists."""
    from app.services.chips import get_season_half

    return get_season_half


def _import_get_remaining_chips():
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
            (19, 1),  # Last GW of first half
            (20, 2),  # First GW of second half (chip reset)
            (38, 2),  # Last GW of second half
        ],
    )
    def test_valid_gameweek_returns_correct_half(self, gameweek: int, expected_half: int):
        """Valid gameweeks should return correct season half."""
        get_season_half = _import_get_season_half()
        assert get_season_half(gameweek) == expected_half

    @pytest.mark.parametrize("invalid_gw", [0, -1, -100, 39, 100])
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
        self, chips_service: "ChipsService", mock_db
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
        self, chips_service: "ChipsService", mock_db
    ):
        """Should return all 4 chips for each half when none used."""
        mock_db.conn.fetch.return_value = []
        with mock_db:
            result = await chips_service.get_manager_chips(manager_id=12345, season_id=1)

        assert len(result.first_half.chips_remaining) == 4
        assert len(result.second_half.chips_remaining) == 4

    async def test_propagates_database_error(
        self, chips_service: "ChipsService", mock_db
    ):
        """Should propagate database errors to caller."""
        mock_db.conn.fetch.side_effect = Exception("Connection timeout")
        with mock_db, pytest.raises(Exception, match="Connection timeout"):
            await chips_service.get_manager_chips(manager_id=12345, season_id=1)


# =============================================================================
# ChipsService.get_league_chips Tests
# =============================================================================


class TestChipsServiceGetLeagueChips:
    """Tests for ChipsService.get_league_chips method."""

    async def test_returns_chips_for_all_managers(
        self, chips_service: "ChipsService", mock_db
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
            (19, 1),
            (20, 2),  # Chip reset boundary
            (22, 2),
        ],
    )
    async def test_returns_correct_current_half(
        self, chips_service: "ChipsService", mock_db, gameweek: int, expected_half: int
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
        self, chips_service: "ChipsService", mock_db
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
        self, chips_service: "ChipsService", mock_db
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
        self, chips_service: "ChipsService", mock_db
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

    @pytest.mark.parametrize("invalid_gw", [0, -1, 39, 100])
    async def test_raises_error_for_invalid_gameweek(
        self, chips_service: "ChipsService", mock_db, invalid_gw: int
    ):
        """Should raise ValueError when current_gameweek is out of range."""
        mock_db.conn.fetch.side_effect = [[], []]
        with mock_db, pytest.raises(ValueError, match="Gameweek must be between 1 and 38"):
            await chips_service.get_league_chips(
                league_id=98765, season_id=1, current_gameweek=invalid_gw
            )


# =============================================================================
# ChipsService.save_chip_usage Tests
# =============================================================================


class TestChipsServiceSaveChipUsage:
    """Tests for ChipsService.save_chip_usage method."""

    async def test_saves_chip_with_season_half_1_for_gw5(
        self, chips_service: "ChipsService", mock_db
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
        self, chips_service: "ChipsService", mock_db
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

    async def test_uses_upsert_for_duplicate_chip_usage(
        self, chips_service: "ChipsService", mock_db
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

    @pytest.mark.parametrize("invalid_gw", [0, -1, 39, 100])
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


# =============================================================================
# ChipsService.collect_manager_chips Tests
# =============================================================================


class TestChipsServiceCollectManagerChips:
    """Tests for ChipsService.collect_manager_chips method (lazy collection)."""

    @pytest.mark.skip(reason="Collection requires FplApiClient.get_manager_history() - Phase 4")
    async def test_fetches_from_fpl_api_and_saves(
        self, chips_service: "ChipsService", mock_db
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
