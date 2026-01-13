"""Unit tests for DashboardService - TDD approach.

Tests cover:
- League manager retrieval
- Batch snapshot fetching
- Picks with player details
- Chips used aggregation
- Transfers for gameweek
- Bank/value unit conversion (0.1M → millions)
- Empty league handling
- Missing data handling
- Error propagation
"""

from decimal import Decimal
from typing import TypedDict
from unittest.mock import AsyncMock

import pytest

from app.services.dashboard import (
    DashboardService,
    LeagueDashboard,
    LeagueNotFoundError,
    ManagerDashboard,
    ManagerPick,
    ManagerTransfer,
)


class SnapshotRow(TypedDict):
    """Mock manager_gw_snapshot row."""

    manager_id: int
    points: int
    total_points: int
    overall_rank: int
    bank: int  # In 0.1M units (5 = 0.5M)
    value: int  # In 0.1M units (1023 = 102.3M)
    transfers_made: int
    transfers_cost: int
    chip_used: str | None


class PickRow(TypedDict):
    """Mock manager_pick row with JOINed player data.

    Note: asyncpg returns NUMERIC columns as Decimal, not str.
    """

    manager_id: int
    position: int
    player_id: int
    is_captain: bool
    is_vice_captain: bool
    multiplier: int
    web_name: str
    team_id: int
    element_type: int
    now_cost: int
    form: Decimal | None
    points_per_game: Decimal | None
    selected_by_percent: Decimal | None
    short_name: str


class ChipUsageRow(TypedDict):
    """Mock chip_usage row."""

    manager_id: int
    chip_type: str
    season_half: int


class TransferRow(TypedDict):
    """Mock transfer row with JOINed player names."""

    manager_id: int
    player_in: int
    player_out: int
    player_in_name: str
    player_out_name: str


class ManagerInfoRow(TypedDict):
    """Mock manager row."""

    id: int
    player_first_name: str
    player_last_name: str
    name: str


class LeagueStandingsRow(TypedDict):
    """Mock league_manager row."""

    manager_id: int
    rank: int
    last_rank: int | None
    total: int
    event_total: int


@pytest.fixture
def sample_league_managers() -> list[dict]:
    """Sample league_manager lookup result."""
    return [
        {"manager_id": 123},
        {"manager_id": 456},
        {"manager_id": 789},
    ]


@pytest.fixture
def sample_snapshots() -> list[SnapshotRow]:
    """Sample manager_gw_snapshot rows."""
    return [
        {
            "manager_id": 123,
            "points": 65,
            "total_points": 1250,
            "overall_rank": 50000,
            "bank": 5,  # 0.5M
            "value": 1023,  # 102.3M
            "transfers_made": 1,
            "transfers_cost": 0,
            "chip_used": None,
        },
        {
            "manager_id": 456,
            "points": 72,
            "total_points": 1310,
            "overall_rank": 25000,
            "bank": 12,  # 1.2M
            "value": 1055,  # 105.5M
            "transfers_made": 0,
            "transfers_cost": 0,
            "chip_used": "bboost",
        },
        {
            "manager_id": 789,
            "points": 48,
            "total_points": 1180,
            "overall_rank": 120000,
            "bank": 0,  # 0.0M
            "value": 998,  # 99.8M
            "transfers_made": 2,
            "transfers_cost": 4,
            "chip_used": None,
        },
    ]


@pytest.fixture
def sample_picks() -> list[PickRow]:
    """Sample manager_pick rows (3 picks per manager for brevity)."""
    return [
        # Manager 123's picks
        {
            "manager_id": 123,
            "position": 1,
            "player_id": 401,
            "is_captain": False,
            "is_vice_captain": False,
            "multiplier": 1,
            "web_name": "Raya",
            "team_id": 1,
            "element_type": 1,
            "now_cost": 55,
            "form": Decimal("5.2"),
            "points_per_game": Decimal("4.8"),
            "selected_by_percent": Decimal("22.5"),
            "short_name": "ARS",
        },
        {
            "manager_id": 123,
            "position": 2,
            "player_id": 302,
            "is_captain": False,
            "is_vice_captain": False,
            "multiplier": 1,
            "web_name": "Saliba",
            "team_id": 1,
            "element_type": 2,
            "now_cost": 62,
            "form": Decimal("6.1"),
            "points_per_game": Decimal("5.2"),
            "selected_by_percent": Decimal("45.3"),
            "short_name": "ARS",
        },
        {
            "manager_id": 123,
            "position": 3,
            "player_id": 427,
            "is_captain": True,
            "is_vice_captain": False,
            "multiplier": 2,
            "web_name": "Salah",
            "team_id": 12,
            "element_type": 3,
            "now_cost": 134,
            "form": Decimal("9.8"),
            "points_per_game": Decimal("8.1"),
            "selected_by_percent": Decimal("78.2"),
            "short_name": "LIV",
        },
        # Manager 456's picks
        {
            "manager_id": 456,
            "position": 1,
            "player_id": 150,
            "is_captain": False,
            "is_vice_captain": False,
            "multiplier": 1,
            "web_name": "Alisson",
            "team_id": 12,
            "element_type": 1,
            "now_cost": 58,
            "form": Decimal("4.5"),
            "points_per_game": Decimal("4.2"),
            "selected_by_percent": Decimal("18.9"),
            "short_name": "LIV",
        },
        {
            "manager_id": 456,
            "position": 2,
            "player_id": 340,
            "is_captain": False,
            "is_vice_captain": False,
            "multiplier": 1,
            "web_name": "Van Dijk",
            "team_id": 12,
            "element_type": 2,
            "now_cost": 65,
            "form": Decimal("5.8"),
            "points_per_game": Decimal("4.9"),
            "selected_by_percent": Decimal("32.1"),
            "short_name": "LIV",
        },
        {
            "manager_id": 456,
            "position": 3,
            "player_id": 355,
            "is_captain": True,
            "is_vice_captain": False,
            "multiplier": 2,
            "web_name": "Haaland",
            "team_id": 13,
            "element_type": 4,
            "now_cost": 151,
            "form": Decimal("8.2"),
            "points_per_game": Decimal("7.8"),
            "selected_by_percent": Decimal("82.1"),
            "short_name": "MCI",
        },
    ]


@pytest.fixture
def sample_chips() -> list[ChipUsageRow]:
    """Sample chip_usage rows."""
    return [
        {"manager_id": 123, "chip_type": "wildcard", "season_half": 1},
        {"manager_id": 123, "chip_type": "bboost", "season_half": 2},
        {"manager_id": 456, "chip_type": "freehit", "season_half": 1},
    ]


@pytest.fixture
def sample_transfers() -> list[TransferRow]:
    """Sample transfer rows."""
    return [
        {
            "manager_id": 789,
            "player_in": 427,
            "player_out": 355,
            "player_in_name": "Salah",
            "player_out_name": "Haaland",
        },
        {
            "manager_id": 789,
            "player_in": 302,
            "player_out": 285,
            "player_in_name": "Saliba",
            "player_out_name": "Gabriel",
        },
    ]


@pytest.fixture
def sample_manager_info() -> list[ManagerInfoRow]:
    """Sample manager info rows."""
    return [
        {
            "id": 123,
            "player_first_name": "John",
            "player_last_name": "Doe",
            "name": "FC United",
        },
        {
            "id": 456,
            "player_first_name": "Jane",
            "player_last_name": "Smith",
            "name": "Real Winners",
        },
        {
            "id": 789,
            "player_first_name": "Bob",
            "player_last_name": "Wilson",
            "name": "Dream Team",
        },
    ]


@pytest.fixture
def sample_league_standings() -> list[LeagueStandingsRow]:
    """Sample league_manager standings rows."""
    return [
        {"manager_id": 456, "rank": 1, "last_rank": 2, "total": 1310, "event_total": 72},
        {"manager_id": 123, "rank": 2, "last_rank": 1, "total": 1250, "event_total": 65},
        {"manager_id": 789, "rank": 3, "last_rank": 3, "total": 1180, "event_total": 48},
    ]


@pytest.fixture
def mock_conn() -> AsyncMock:
    """Mock database connection."""
    return AsyncMock()


class TestDashboardService:
    """TDD tests for DashboardService."""

    async def test_get_league_dashboard_returns_league_dashboard_object(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Dashboard should return LeagueDashboard with all managers."""
        from app.services.dashboard import DashboardService, LeagueDashboard

        # Setup mock to return data for each query
        mock_conn.fetch.side_effect = [
            sample_league_managers,  # _get_league_managers
            sample_snapshots,  # _get_snapshots
            sample_picks,  # _get_picks
            sample_chips,  # _get_chips
            sample_transfers,  # _get_transfers
            sample_manager_info,  # _get_manager_info
            sample_league_standings,  # _get_league_standings
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(
            league_id=242017,
            gameweek=21,
            season_id=1,
            conn=mock_conn,
        )

        assert isinstance(result, LeagueDashboard)
        assert result.league_id == 242017
        assert result.gameweek == 21
        assert result.season_id == 1
        assert len(result.managers) == 3

    async def test_managers_sorted_by_rank(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Managers should be sorted by rank ascending."""
        from app.services.dashboard import DashboardService

        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,
            sample_picks,
            sample_chips,
            sample_transfers,
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        # Verify sorted by rank (456=1st, 123=2nd, 789=3rd)
        assert result.managers[0].entry_id == 456
        assert result.managers[0].rank == 1
        assert result.managers[1].entry_id == 123
        assert result.managers[1].rank == 2
        assert result.managers[2].entry_id == 789
        assert result.managers[2].rank == 3

    async def test_manager_has_correct_points_data(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Manager should have correct points and rank data."""
        from app.services.dashboard import DashboardService

        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,
            sample_picks,
            sample_chips,
            sample_transfers,
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        # Find manager 123 (should be rank 2)
        manager_123 = next(m for m in result.managers if m.entry_id == 123)

        assert manager_123.gw_points == 65
        assert manager_123.total_points == 1250
        assert manager_123.overall_rank == 50000
        assert manager_123.rank == 2
        assert manager_123.last_rank == 1

    async def test_bank_and_value_converted_to_millions(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Bank and team_value should be converted from 0.1M to millions."""
        from app.services.dashboard import DashboardService

        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,
            sample_picks,
            sample_chips,
            sample_transfers,
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        manager_123 = next(m for m in result.managers if m.entry_id == 123)

        # DB stores bank=5 (0.5M), value=1023 (102.3M)
        # Should convert to 0.5 and 102.3
        assert manager_123.bank == 0.5
        assert manager_123.team_value == 102.3

    async def test_transfers_info_correct(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Transfer made and cost should be correct."""
        from app.services.dashboard import DashboardService

        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,
            sample_picks,
            sample_chips,
            sample_transfers,
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        # Manager 789 made 2 transfers with 4pt hit
        manager_789 = next(m for m in result.managers if m.entry_id == 789)

        assert manager_789.transfers_made == 2
        assert manager_789.transfer_cost == 4

    async def test_chip_active_correct(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Active chip should be set from snapshot."""
        from app.services.dashboard import DashboardService

        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,
            sample_picks,
            sample_chips,
            sample_transfers,
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        # Manager 456 has bboost active
        manager_456 = next(m for m in result.managers if m.entry_id == 456)
        assert manager_456.chip_active == "bboost"

        # Manager 123 has no chip active
        manager_123 = next(m for m in result.managers if m.entry_id == 123)
        assert manager_123.chip_active is None

    async def test_manager_names_correct(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Manager name and team name should be populated."""
        from app.services.dashboard import DashboardService

        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,
            sample_picks,
            sample_chips,
            sample_transfers,
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        manager_123 = next(m for m in result.managers if m.entry_id == 123)

        assert manager_123.manager_name == "John Doe"
        assert manager_123.team_name == "FC United"

    async def test_picks_have_player_details(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Each pick should include player name, team, and stats."""
        from app.services.dashboard import DashboardService

        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,
            sample_picks,
            sample_chips,
            sample_transfers,
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        manager_123 = next(m for m in result.managers if m.entry_id == 123)

        # Should have 3 picks from sample data
        assert len(manager_123.picks) == 3

        # Check Salah pick (position 3, captain)
        salah_pick = next(p for p in manager_123.picks if p.player_id == 427)
        assert salah_pick.player_name == "Salah"
        assert salah_pick.team_short_name == "LIV"
        assert salah_pick.team_id == 12
        assert salah_pick.element_type == 3  # MID
        assert salah_pick.is_captain is True
        assert salah_pick.multiplier == 2
        assert salah_pick.position == 3
        assert salah_pick.now_cost == 134
        assert salah_pick.form == 9.8
        assert salah_pick.points_per_game == 8.1
        assert salah_pick.selected_by_percent == 78.2

    async def test_picks_ordered_by_position(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Picks should be ordered by position (1-15)."""
        from app.services.dashboard import DashboardService

        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,
            sample_picks,
            sample_chips,
            sample_transfers,
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        manager_123 = next(m for m in result.managers if m.entry_id == 123)
        positions = [p.position for p in manager_123.picks]

        assert positions == sorted(positions)

    async def test_chips_used_includes_both_season_halves(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Chips used should include chips from both halves with suffix."""
        from app.services.dashboard import DashboardService

        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,
            sample_picks,
            sample_chips,
            sample_transfers,
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        manager_123 = next(m for m in result.managers if m.entry_id == 123)

        # Manager 123 used wildcard in half 1 and bboost in half 2
        assert "wildcard_1" in manager_123.chips_used
        assert "bboost_2" in manager_123.chips_used
        assert len(manager_123.chips_used) == 2

    async def test_transfers_include_player_names(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Transfers should include player in/out names."""
        from app.services.dashboard import DashboardService

        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,
            sample_picks,
            sample_chips,
            sample_transfers,
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        # Manager 789 made 2 transfers
        manager_789 = next(m for m in result.managers if m.entry_id == 789)

        assert len(manager_789.transfers) == 2

        # Check first transfer (Salah in, Haaland out)
        transfer = manager_789.transfers[0]
        assert transfer.player_in_id == 427
        assert transfer.player_in_name == "Salah"
        assert transfer.player_out_id == 355
        assert transfer.player_out_name == "Haaland"

    async def test_empty_league_returns_empty_managers_list(
        self,
        mock_conn: AsyncMock,
    ):
        """Empty league should return LeagueDashboard with empty managers list."""
        from app.services.dashboard import DashboardService, LeagueDashboard

        # Empty league - no managers
        mock_conn.fetch.return_value = []

        service = DashboardService()
        result = await service.get_league_dashboard(999999, 21, 1, mock_conn)

        assert isinstance(result, LeagueDashboard)
        assert result.league_id == 999999
        assert result.managers == []

    async def test_manager_without_snapshot_is_excluded(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Manager without snapshot for gameweek should be excluded from results."""
        from app.services.dashboard import DashboardService

        # Only manager 123 has a snapshot
        partial_snapshots = [
            {
                "manager_id": 123,
                "points": 65,
                "total_points": 1250,
                "overall_rank": 50000,
                "bank": 5,
                "value": 1023,
                "transfers_made": 1,
                "transfers_cost": 0,
                "chip_used": None,
            }
        ]

        mock_conn.fetch.side_effect = [
            sample_league_managers,  # 3 managers in league
            partial_snapshots,  # Only 1 has snapshot
            [],  # picks
            [],  # chips
            [],  # transfers
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        # Only manager 123 should be in results
        assert len(result.managers) == 1
        assert result.managers[0].entry_id == 123

    async def test_manager_with_no_chips_has_empty_list(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Manager who hasn't used any chips should have empty chips_used list."""
        from app.services.dashboard import DashboardService

        # No chips used by any manager
        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,
            sample_picks,
            [],  # No chips
            sample_transfers,
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        for manager in result.managers:
            assert manager.chips_used == []

    async def test_manager_with_no_transfers_has_empty_list(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Manager who made no transfers should have empty transfers list."""
        from app.services.dashboard import DashboardService

        # No transfers this gameweek
        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,
            sample_picks,
            sample_chips,
            [],  # No transfers
            sample_manager_info,
            sample_league_standings,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        for manager in result.managers:
            assert manager.transfers == []

    async def test_handles_null_form_values(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Null form/PPG/ownership values should be converted to 0."""
        from app.services.dashboard import DashboardService

        picks_with_null = [
            {
                "manager_id": 123,
                "position": 1,
                "player_id": 999,
                "is_captain": False,
                "is_vice_captain": False,
                "multiplier": 1,
                "web_name": "NewPlayer",
                "team_id": 1,
                "element_type": 1,
                "now_cost": 45,
                "form": None,
                "points_per_game": None,
                "selected_by_percent": None,
                "short_name": "ARS",
            }
        ]

        # Filter fixtures to only include manager 123
        chips_for_123 = [c for c in sample_chips if c["manager_id"] == 123]
        transfers_for_123 = [t for t in sample_transfers if t["manager_id"] == 123]
        manager_info_for_123 = [m for m in sample_manager_info if m["id"] == 123]
        standings_for_123 = [s for s in sample_league_standings if s["manager_id"] == 123]

        mock_conn.fetch.side_effect = [
            sample_league_managers[:1],  # Just manager 123
            sample_snapshots[:1],
            picks_with_null,
            chips_for_123,
            transfers_for_123,
            manager_info_for_123,
            standings_for_123,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        pick = result.managers[0].picks[0]
        assert pick.form == 0.0
        assert pick.points_per_game == 0.0
        assert pick.selected_by_percent == 0.0

    async def test_handles_null_bank_and_value(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_picks: list[PickRow],
        sample_chips: list[ChipUsageRow],
        sample_transfers: list[TransferRow],
        sample_manager_info: list[ManagerInfoRow],
        sample_league_standings: list[LeagueStandingsRow],
    ):
        """Null bank and value should default to 0.0 (new manager mid-season)."""
        from app.services.dashboard import DashboardService

        snapshot_with_nulls: list[SnapshotRow] = [
            {
                "manager_id": 123,
                "points": 65,
                "total_points": 1250,
                "overall_rank": 50000,
                "bank": None,  # Null bank
                "value": None,  # Null value
                "transfers_made": 0,
                "transfers_cost": 0,
                "chip_used": None,
            }
        ]

        # Filter fixtures to only include manager 123
        picks_for_123 = [p for p in sample_picks if p["manager_id"] == 123]
        chips_for_123 = [c for c in sample_chips if c["manager_id"] == 123]
        transfers_for_123 = [t for t in sample_transfers if t["manager_id"] == 123]
        manager_info_for_123 = [m for m in sample_manager_info if m["id"] == 123]
        standings_for_123 = [s for s in sample_league_standings if s["manager_id"] == 123]

        mock_conn.fetch.side_effect = [
            sample_league_managers[:1],  # Just manager 123
            snapshot_with_nulls,
            picks_for_123,
            chips_for_123,
            transfers_for_123,
            manager_info_for_123,
            standings_for_123,
        ]

        service = DashboardService()
        result = await service.get_league_dashboard(242017, 21, 1, mock_conn)

        assert result.managers[0].bank == 0.0
        assert result.managers[0].team_value == 0.0


class TestDashboardServiceBatchQueries:
    """Tests verifying batch query behavior."""

    async def test_uses_batch_query_for_snapshots(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
    ):
        """Should use ANY($1) for batch snapshot fetch."""
        from app.services.dashboard import DashboardService

        mock_conn.fetch.side_effect = [
            sample_league_managers,
            [],  # snapshots
            [],  # picks
            [],  # chips
            [],  # transfers
            [],  # manager_info
            [],  # league_standings
        ]

        service = DashboardService()
        await service.get_league_dashboard(242017, 21, 1, mock_conn)

        # Check second call (snapshots) uses ANY for batch
        call_args = mock_conn.fetch.call_args_list[1]
        query = call_args[0][0]
        assert "ANY($1)" in query

    async def test_uses_batch_query_for_picks(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[dict],
    ):
        """Should use ANY($1) for batch picks fetch."""
        from app.services.dashboard import DashboardService

        # Need non-empty snapshots to avoid early return
        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,  # Non-empty to continue execution
            [],  # picks
            [],  # chips
            [],  # transfers
            [],  # manager_info
            [],  # league_standings
        ]

        service = DashboardService()
        await service.get_league_dashboard(242017, 21, 1, mock_conn)

        # Check third call (picks) uses ANY for batch
        call_args = mock_conn.fetch.call_args_list[2]
        query = call_args[0][0]
        assert "ANY($1)" in query

    async def test_picks_query_joins_snapshot_player_team(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[dict],
    ):
        """Picks query should JOIN manager_gw_snapshot, player, and team."""
        from app.services.dashboard import DashboardService

        # Need non-empty snapshots to avoid early return
        mock_conn.fetch.side_effect = [
            sample_league_managers,
            sample_snapshots,  # Non-empty to continue execution
            [],  # picks
            [],  # chips
            [],  # transfers
            [],  # manager_info
            [],  # league_standings
        ]

        service = DashboardService()
        await service.get_league_dashboard(242017, 21, 1, mock_conn)

        # Check picks query has required JOINs
        call_args = mock_conn.fetch.call_args_list[2]
        query = call_args[0][0].lower()

        assert "join manager_gw_snapshot" in query
        assert "join player" in query
        assert "join team" in query

    async def test_executes_five_queries_in_parallel_via_gather(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[dict],
    ):
        """Should execute picks, chips, transfers, manager_info, and standings in parallel.

        The service uses asyncio.gather to run 5 independent queries concurrently
        after the sequential setup queries (league_manager and snapshots).
        """
        from app.services.dashboard import DashboardService

        mock_conn.fetch.side_effect = [
            sample_league_managers,  # Sequential: league_manager lookup
            sample_snapshots,  # Sequential: snapshots
            # Parallel via asyncio.gather:
            [],  # picks
            [],  # chips
            [],  # transfers
            [],  # manager_info
            [],  # standings
        ]

        service = DashboardService()
        await service.get_league_dashboard(242017, 21, 1, mock_conn)

        # Verify total of 7 fetch calls: 2 sequential + 5 parallel
        assert mock_conn.fetch.call_count == 7

        # Verify the 5 parallel queries are for the expected tables
        parallel_calls = mock_conn.fetch.call_args_list[2:7]
        queries = [call[0][0].lower() for call in parallel_calls]

        # Each parallel query should target a different table
        assert any("manager_pick" in q for q in queries), "Missing picks query"
        assert any("chip_usage" in q for q in queries), "Missing chips query"
        assert any("transfer" in q for q in queries), "Missing transfers query"
        assert any("from manager" in q for q in queries), "Missing manager_info query"
        assert any("league_manager" in q and "rank" in q for q in queries), (
            "Missing standings query"
        )


class TestDashboardServiceErrors:
    """Tests for error handling and propagation."""

    async def test_raises_league_not_found_for_nonexistent_league(
        self,
        mock_conn: AsyncMock,
    ):
        """Should raise LeagueNotFoundError when league doesn't exist in DB."""
        # First query (league_manager lookup) returns empty
        mock_conn.fetchval.return_value = None  # League doesn't exist

        service = DashboardService()

        with pytest.raises(LeagueNotFoundError) as exc_info:
            await service.get_league_dashboard(999999, 21, 1, mock_conn)

        assert "999999" in str(exc_info.value)

    async def test_database_error_propagates(
        self,
        mock_conn: AsyncMock,
    ):
        """Database errors should propagate to caller."""
        mock_conn.fetch.side_effect = Exception("Connection lost")

        service = DashboardService()

        with pytest.raises(Exception) as exc_info:
            await service.get_league_dashboard(242017, 21, 1, mock_conn)

        assert "Connection lost" in str(exc_info.value)

    async def test_mid_operation_db_failure_propagates(
        self,
        mock_conn: AsyncMock,
        sample_league_managers: list[dict],
        sample_snapshots: list[SnapshotRow],
        sample_picks: list[PickRow],
    ):
        """DB failure in parallel queries should propagate error, not return partial data.

        The service uses asyncio.gather to run 5 queries in parallel (picks, chips,
        transfers, manager_info, standings). If any query fails, the exception should
        propagate and no partial data should be returned.
        """
        # Sequential queries succeed, then one parallel query fails
        mock_conn.fetch.side_effect = [
            sample_league_managers,  # Success: league_manager lookup (sequential)
            sample_snapshots,  # Success: snapshots (sequential)
            # Parallel queries via asyncio.gather (5 queries):
            sample_picks,  # picks - success
            Exception("Connection lost during chips query"),  # chips - failure
            [],  # transfers - would succeed but gather fails fast
            [],  # manager_info - would succeed but gather fails fast
            [],  # standings - would succeed but gather fails fast
        ]

        service = DashboardService()

        with pytest.raises(Exception) as exc_info:
            await service.get_league_dashboard(242017, 21, 1, mock_conn)

        assert "Connection lost" in str(exc_info.value)
        # All 7 fetch calls are initiated (2 sequential + 5 parallel)
        # asyncio.gather starts all coroutines before any complete
        assert mock_conn.fetch.call_count == 7
