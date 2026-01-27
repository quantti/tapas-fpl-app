"""Tests for Set and Forget calculation service.

Set and Forget calculates what points a manager would have scored if they:
1. Kept their first active squad all season (handles late joiners who started after GW1)
2. Applied chips (TC, BB) but ignored Wildcard/Free Hit squad changes
3. Used auto-sub rules when starters had 0 minutes
4. Used original captain; vice-captain if captain had 0 minutes

FPL Position element_types: GK=1, DEF=2, MID=3, FWD=4
Formation rules: min 1 GK, min 3 DEF, min 1 FWD
Bench positions: 12-15 (12=first sub priority, 15=last)
"""

from typing import TYPE_CHECKING, TypedDict

import pytest

from tests.conftest import MockDB

if TYPE_CHECKING:
    from app.services.set_and_forget import SetAndForgetService


# =============================================================================
# Constants
# =============================================================================

GK = 1
DEF = 2
MID = 3
FWD = 4


# =============================================================================
# TypedDicts for Mock Data
# =============================================================================


class PlayerFixtureStatsRow(TypedDict):
    """Database row structure for player_fixture_stats table."""

    player_id: int
    gameweek: int
    fixture_id: int
    total_points: int
    minutes: int


class ChipUsageRow(TypedDict):
    """Database row structure for chip_usage table."""

    manager_id: int
    season_id: int
    chip_type: str  # 'bboost', '3xc', 'wildcard', 'freehit'
    gameweek: int


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def set_and_forget_service() -> "SetAndForgetService":
    """Create SetAndForgetService instance for testing."""
    from app.services.set_and_forget import SetAndForgetService

    return SetAndForgetService()


@pytest.fixture
def mock_saf_db() -> MockDB:
    """Mock database connection for set and forget service."""
    return MockDB("app.services.set_and_forget.get_connection")


# =============================================================================
# Helper Functions
# =============================================================================


class JoinedPickRow(TypedDict):
    """Combined pick + player data as returned by the service's JOIN query."""

    player_id: int
    position: int
    is_captain: bool
    is_vice_captain: bool
    multiplier: int
    element_type: int


def make_gw1_pick(
    player_id: int,
    position: int,
    element_type: int,
    is_captain: bool = False,
    is_vice_captain: bool = False,
) -> JoinedPickRow:
    """Create GW1 pick with player info (as returned by service's JOIN query)."""
    multiplier = 2 if is_captain else (0 if position > 11 else 1)
    return {
        "player_id": player_id,
        "position": position,
        "is_captain": is_captain,
        "is_vice_captain": is_vice_captain,
        "multiplier": multiplier,
        "element_type": element_type,
    }


def make_fixture_stats(
    player_id: int,
    gameweek: int,
    total_points: int,
    minutes: int,
    fixture_id: int | None = None,
) -> PlayerFixtureStatsRow:
    """Create player fixture stats for testing."""
    return {
        "player_id": player_id,
        "gameweek": gameweek,
        "fixture_id": fixture_id or (gameweek * 10 + player_id),
        "total_points": total_points,
        "minutes": minutes,
    }


def make_standard_squad() -> list[JoinedPickRow]:
    """Create a standard 3-4-3 GW1 squad for testing.

    Returns:
        List of joined pick rows where:
        - Position 1: GK (captain)
        - Position 2-4: DEF
        - Position 5-8: MID (position 5 is vice captain)
        - Position 9-11: FWD
        - Position 12: DEF (first bench)
        - Position 13: MID
        - Position 14: FWD
        - Position 15: GK (bench keeper)
    """
    picks = []

    # Starting XI: 3-4-3 formation
    # GK (position 1, captain for testing)
    picks.append(make_gw1_pick(1, 1, GK, is_captain=True))

    # DEF (positions 2-4)
    for i, pos in enumerate([2, 3, 4], start=2):
        picks.append(make_gw1_pick(i, pos, DEF))

    # MID (positions 5-8, position 5 is VC)
    for i, pos in enumerate([5, 6, 7, 8], start=5):
        picks.append(make_gw1_pick(i, pos, MID, is_vice_captain=(pos == 5)))

    # FWD (positions 9-11)
    for i, pos in enumerate([9, 10, 11], start=9):
        picks.append(make_gw1_pick(i, pos, FWD))

    # Bench (positions 12-15)
    picks.append(make_gw1_pick(12, 12, DEF))   # first sub
    picks.append(make_gw1_pick(13, 13, MID))   # second sub
    picks.append(make_gw1_pick(14, 14, FWD))   # third sub
    picks.append(make_gw1_pick(15, 15, GK))    # bench keeper

    return picks


# =============================================================================
# 1. Basic Calculation Tests
# =============================================================================


class TestBasicCalculation:
    """Tests for basic Set and Forget points calculation."""

    @pytest.mark.asyncio
    async def test_returns_sum_of_starting_xi_points_for_single_gameweek(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """GW1 squad, everyone plays, no subs needed.

        Setup: 11 starters each score 5 points
        Expected: Captain (10) + others (50) = 60 points
        """
        picks = make_standard_squad()

        # All starters score 5 points, play 90 mins
        fixture_stats = [
            make_fixture_stats(player_id=i, gameweek=1, total_points=5, minutes=90)
            for i in range(1, 12)  # Players 1-11 (starters)
        ]
        # Bench players also have stats (but shouldn't count)
        fixture_stats.extend([
            make_fixture_stats(player_id=i, gameweek=1, total_points=3, minutes=90)
            for i in range(12, 16)  # Players 12-15 (bench)
        ])

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (player 1) gets doubled: 5 * 2 = 10
        # Other 10 starters: 10 * 5 = 50
        # Total: 10 + 50 = 60
        assert result.total_points == 60

    @pytest.mark.asyncio
    async def test_accumulates_points_across_multiple_gameweeks(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Points accumulate across GW1-5.

        Setup: Same squad, each player scores 5 points per GW for 5 GWs
        Expected: (10 + 50) * 5 = 300 points
        """
        picks = make_standard_squad()

        # 5 gameweeks of stats
        fixture_stats = []
        for gw in range(1, 6):
            for player_id in range(1, 16):
                fixture_stats.append(
                    make_fixture_stats(
                        player_id=player_id, gameweek=gw, total_points=5, minutes=90
                    )
                )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=5
            )

        # 5 GWs * 60 points per GW = 300
        assert result.total_points == 300

    @pytest.mark.asyncio
    async def test_returns_zero_for_manager_with_no_gw1_picks(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Manager didn't make any GW1 picks (late start or non-existent).

        Setup: No GW1 picks exist, manager doesn't exist in database
        Expected: 0 points
        """
        # First fetch returns empty picks, then fetchval checks manager existence
        mock_saf_db.conn.fetch.side_effect = [[]]
        mock_saf_db.conn.fetchval.return_value = False  # Manager doesn't exist

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=10
            )

        assert result.total_points == 0

    @pytest.mark.asyncio
    async def test_returns_zero_when_manager_exists_but_no_gw1_picks(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Manager exists but has no GW1 picks (possible data sync issue).

        Setup: Manager exists in database but has no GW1 picks
        Expected: 0 points (with warning logged)
        """
        mock_saf_db.conn.fetch.side_effect = [[]]
        mock_saf_db.conn.fetchval.return_value = True  # Manager exists

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=10
            )

        assert result.total_points == 0

    @pytest.mark.asyncio
    async def test_handles_player_with_negative_points(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Player can have negative points (red card, own goal).

        Setup: Captain has -2 points, others have 5
        Expected: Captain (-4) + others (50) = 46 points
        """
        picks = make_standard_squad()

        fixture_stats = [
            make_fixture_stats(player_id=1, gameweek=1, total_points=-2, minutes=90),
        ]
        fixture_stats.extend([
            make_fixture_stats(player_id=i, gameweek=1, total_points=5, minutes=90)
            for i in range(2, 12)
        ])

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (player 1): -2 * 2 = -4
        # 10 others: 10 * 5 = 50
        # Total: -4 + 50 = 46
        assert result.total_points == 46


# =============================================================================
# 2. Auto-Sub Tests (0 minutes scenarios)
# =============================================================================


class TestAutoSubBasic:
    """Tests for basic auto-substitution when starters have 0 minutes."""

    @pytest.mark.asyncio
    async def test_one_minute_played_does_not_trigger_auto_sub(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Player with 1 minute played should NOT be auto-subbed.

        Setup:
        - Player 11 (FWD) has 1 minute, scores 2 points
        - Bench player 12 has 90 minutes, scores 7 points

        Expected: Player 11 stays (no sub), scores 2 points
        Boundary test: only minutes=0 triggers auto-sub
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 11:
                minutes, points = 1, 2  # 1 minute = played, no sub
            elif player_id == 12:
                minutes, points = 90, 7  # bench would score more
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (10) + 9 starters (45) + player 11 with 1 min (2) = 57
        # NO sub because 1 minute > 0
        assert result.total_points == 57
        assert result.auto_subs_made == 0

    @pytest.mark.asyncio
    async def test_auto_subs_processed_in_bench_priority_order(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Auto-subs follow bench order: position 12 → 13 → 14.

        Setup:
        - Players 9, 10, 11 (all FWD) have 0 minutes
        - Bench: DEF(12)=4pts, MID(13)=6pts, FWD(14)=8pts, GK(15)
        - Formation 3-4-3, need to maintain min 1 FWD

        Expected: Subs in order 12, 13, 14 (not by points or position type)
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id in [9, 10, 11]:  # All FWDs out
                minutes, points = 0, 0
            elif player_id == 12:
                minutes, points = 90, 4  # first bench (DEF)
            elif player_id == 13:
                minutes, points = 90, 6  # second bench (MID)
            elif player_id == 14:
                minutes, points = 90, 8  # third bench (FWD)
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (10) + 7 starters (35) + 3 subs (4+6+8=18) = 63
        # All 3 bench outfield players sub in
        assert result.total_points == 63
        assert result.auto_subs_made == 3

    @pytest.mark.asyncio
    async def test_subs_in_first_bench_player_when_starter_has_zero_minutes(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """FWD starter (position 11) has 0 mins, DEF at position 12 subs in.

        Setup:
        - Starting XI: 3 DEF, 4 MID, 3 FWD (positions 1-11)
        - Player 11 (FWD) has 0 minutes
        - Bench order: DEF(12), MID(13), FWD(14), GK(15)

        Expected: Position 12 (DEF) subs in, formation becomes 4-4-2 (valid)
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            minutes = 0 if player_id == 11 else 90
            points = 5 if minutes > 0 else 0
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )
        # Give bench player 12 (DEF) 7 points
        fixture_stats = [
            s if s["player_id"] != 12 else {**s, "total_points": 7}
            for s in fixture_stats
        ]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Original: captain (10) + 9 starters (45) + player 11 (0) = 55
        # With sub: captain (10) + 9 starters (45) + bench 12 (7) = 62
        assert result.total_points == 62
        assert result.auto_subs_made == 1

    @pytest.mark.asyncio
    async def test_skips_bench_player_who_also_has_zero_minutes(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Skip bench players with 0 minutes, use next available.

        Setup:
        - Player 11 (FWD) has 0 minutes
        - Player 12 (first bench, DEF) has 0 minutes
        - Player 13 (second bench, MID) has 90 minutes, 6 points

        Expected: Player 13 subs in
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id in [11, 12]:
                minutes, points = 0, 0
            elif player_id == 13:
                minutes, points = 90, 6
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # 10 starters (captain=10, 9 others=45), player 11=0 out, player 13=6 in
        # 10 + 45 + 6 = 61
        assert result.total_points == 61

    @pytest.mark.asyncio
    async def test_handles_multiple_starters_needing_subs(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Multiple starters have 0 minutes.

        Setup:
        - Players 10, 11 (both FWD) have 0 minutes
        - Bench: DEF(12), MID(13), FWD(14), GK(15)

        Expected: Two subs made (DEF and MID, keeping formation valid)
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id in [10, 11]:
                minutes, points = 0, 0
            elif player_id in [12, 13, 14]:
                minutes, points = 90, 4  # bench players score 4
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (10) + 8 starters (40) + 2 bench (8) = 58
        assert result.total_points == 58
        assert result.auto_subs_made == 2

    @pytest.mark.asyncio
    async def test_bench_player_cannot_sub_twice(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Same bench player cannot substitute for multiple starters.

        Setup:
        - Players 10, 11 (both FWD) have 0 minutes
        - Bench: DEF(12) has 0 mins, MID(13) has 0 mins, FWD(14) can sub, GK(15)
        - Only FWD(14) is valid for both missing FWDs

        Expected: FWD(14) subs for first, second FWD scores 0 (no double-use)
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id in [10, 11]:  # Both FWDs out
                minutes, points = 0, 0
            elif player_id in [12, 13]:  # First two bench players also out
                minutes, points = 0, 0
            elif player_id == 14:  # Only valid bench player
                minutes, points = 90, 7
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (10) + 8 starters (40) + 1 sub (7) + 1 unsub'd FWD (0) = 57
        assert result.total_points == 57
        assert result.auto_subs_made == 1  # Only one sub possible

    @pytest.mark.asyncio
    async def test_sub_with_negative_points_counted_correctly(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Sub player with negative points counts correctly.

        Setup:
        - Player 11 (FWD) has 0 minutes
        - Bench player 12 (DEF) has 90 minutes but -2 points (red card)

        Expected: Total includes -2 from bench sub
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 11:
                minutes, points = 0, 0  # Starter out
            elif player_id == 12:
                minutes, points = 90, -2  # Sub has negative points (red card)
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (10) + 9 starters (45) + sub with red card (-2) = 53
        assert result.total_points == 53
        assert result.auto_subs_made == 1


class TestAutoSubFormationConstraints:
    """Tests for auto-sub formation constraint enforcement."""

    @pytest.mark.asyncio
    async def test_cannot_sub_if_would_violate_minimum_3_defenders(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Cannot sub a DEF if already at minimum 3 DEF and no DEF on bench.

        Setup:
        - 3-4-3 formation, one DEF (position 2) has 0 minutes
        - Bench order: MID(12), FWD(13), FWD(14), GK(15) - no DEF on bench!

        Expected: No valid sub available, player 2 scores 0
        """
        picks = []

        # GK
        picks.append(make_gw1_pick(1, 1, GK, is_captain=True))

        # 3 DEF (positions 2-4)
        for i, pos in enumerate([2, 3, 4], start=2):
            picks.append(make_gw1_pick(i, pos, DEF))

        # 4 MID (positions 5-8)
        for i, pos in enumerate([5, 6, 7, 8], start=5):
            picks.append(make_gw1_pick(i, pos, MID, is_vice_captain=(pos == 5)))

        # 3 FWD (positions 9-11)
        for i, pos in enumerate([9, 10, 11], start=9):
            picks.append(make_gw1_pick(i, pos, FWD))

        # Bench: MID, FWD, FWD, GK (no DEF!)
        for i, (pos, element_type) in enumerate(
            [(12, MID), (13, FWD), (14, FWD), (15, GK)], start=12
        ):
            picks.append(make_gw1_pick(i, pos, element_type))

        # Player 2 (DEF) has 0 minutes
        fixture_stats = []
        for player_id in range(1, 16):
            minutes = 0 if player_id == 2 else 90
            points = 0 if player_id == 2 else 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (10) + 9 starters (45) + player 2 (0, no sub possible) = 55
        assert result.total_points == 55
        assert result.auto_subs_made == 0

    @pytest.mark.asyncio
    async def test_cannot_sub_if_would_violate_minimum_1_forward(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Cannot lose last FWD without FWD replacement.

        Setup:
        - 5-4-1 formation (1 FWD)
        - The single FWD has 0 minutes
        - Bench: DEF, DEF, MID, GK - no FWD!

        Expected: No valid sub, FWD scores 0
        """
        picks = []

        # GK
        picks.append(make_gw1_pick(1, 1, GK, is_captain=True))

        # 5 DEF (positions 2-6)
        for i, pos in enumerate([2, 3, 4, 5, 6], start=2):
            picks.append(make_gw1_pick(i, pos, DEF))

        # 4 MID (positions 7-10)
        for i, pos in enumerate([7, 8, 9, 10], start=7):
            picks.append(make_gw1_pick(i, pos, MID, is_vice_captain=(pos == 7)))

        # 1 FWD (position 11)
        picks.append(make_gw1_pick(11, 11, FWD))

        # Bench: DEF, DEF, MID, GK (no FWD!)
        for i, (pos, element_type) in enumerate(
            [(12, DEF), (13, DEF), (14, MID), (15, GK)], start=12
        ):
            picks.append(make_gw1_pick(i, pos, element_type))

        # FWD (player 11) has 0 minutes
        fixture_stats = []
        for player_id in range(1, 16):
            minutes = 0 if player_id == 11 else 90
            points = 0 if player_id == 11 else 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (10) + 9 starters (45) + FWD (0, no valid sub) = 55
        assert result.total_points == 55
        assert result.auto_subs_made == 0

    @pytest.mark.asyncio
    async def test_sub_succeeds_at_minimum_def_when_def_available_on_bench(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """DEF can be subbed when at min 3 DEF if bench has DEF.

        Setup:
        - 3-4-3 formation (at minimum 3 DEF)
        - Player 2 (DEF) has 0 minutes
        - Bench: DEF(12), MID(13), FWD(14), GK(15) - DEF available!

        Expected: DEF(12) subs for DEF(2), formation stays valid
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 2:  # DEF has 0 mins
                minutes, points = 0, 0
            elif player_id == 12:  # Bench DEF
                minutes, points = 90, 7
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (10) + 9 starters (45) + bench DEF (7) = 62
        assert result.total_points == 62
        assert result.auto_subs_made == 1

    @pytest.mark.asyncio
    async def test_goalkeeper_only_replaced_by_bench_goalkeeper(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """GK can only be replaced by another GK.

        Setup:
        - Starting GK has 0 minutes
        - Bench: DEF(12), MID(13), FWD(14), GK(15)

        Expected: Bench GK (position 15) subs in, not position 12
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 1:
                minutes, points = 0, 0
            elif player_id == 15:
                minutes, points = 90, 3  # bench GK
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (GK) has 0 mins -> VC (player 5) becomes captain
        # VC: 5 * 2 = 10 (doubled as new captain)
        # Bench GK subs in: 3 (not doubled, just a sub)
        # Other 9 starters: 9 * 5 = 45
        # Total: 10 + 3 + 45 = 58
        assert result.total_points == 58

    @pytest.mark.asyncio
    async def test_multiple_subs_where_second_blocked_by_formation(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Second sub blocked when first sub affects formation constraint.

        Setup: 3-4-3 formation
        - DEF player 2 has 0 minutes
        - FWD player 11 has 0 minutes
        - Bench: DEF(12)=5pts, MID(13)=0mins, FWD(14)=0mins, GK(15)

        Processing order:
        1. DEF 2 out -> DEF 12 subs in (valid, keeps 3 DEF)
        2. FWD 11 out -> MID 13 has 0 mins, FWD 14 has 0 mins -> no valid sub

        Expected: 1 sub made, FWD 11 scores 0
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 2:  # DEF starter out
                minutes, points = 0, 0
            elif player_id == 11:  # FWD starter out
                minutes, points = 0, 0
            elif player_id == 12:  # DEF on bench (valid sub)
                minutes, points = 90, 5
            elif player_id in [13, 14]:  # MID and FWD on bench both out
                minutes, points = 0, 0
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (10) + 8 starters (40) + DEF sub (5) + FWD no sub (0) = 55
        assert result.total_points == 55
        assert result.auto_subs_made == 1


# =============================================================================
# 3. Captain/Vice-Captain Tests
# =============================================================================


class TestNonStandardFormations:
    """Tests for non-standard GW1 formations (not 3-4-3)."""

    @pytest.mark.asyncio
    async def test_5_4_1_formation_valid_subs(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """5-4-1 formation handles subs correctly.

        Setup:
        - 5-4-1 formation (5 DEF, 4 MID, 1 FWD)
        - One DEF (player 2) has 0 minutes
        - Bench: DEF(12), MID(13), FWD(14), GK(15)

        Expected: DEF(12) subs in, stays at 5-4-1
        """
        picks = []

        # GK (captain)
        picks.append(make_gw1_pick(1, 1, GK, is_captain=True))

        # 5 DEF (positions 2-6)
        for i, pos in enumerate([2, 3, 4, 5, 6], start=2):
            picks.append(make_gw1_pick(i, pos, DEF))

        # 4 MID (positions 7-10, pos 7 is VC)
        for i, pos in enumerate([7, 8, 9, 10], start=7):
            picks.append(make_gw1_pick(i, pos, MID, is_vice_captain=(pos == 7)))

        # 1 FWD (position 11)
        picks.append(make_gw1_pick(11, 11, FWD))

        # Bench: DEF, MID, FWD, GK
        picks.append(make_gw1_pick(12, 12, DEF))
        picks.append(make_gw1_pick(13, 13, MID))
        picks.append(make_gw1_pick(14, 14, FWD))
        picks.append(make_gw1_pick(15, 15, GK))

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 2:  # DEF has 0 mins
                minutes, points = 0, 0
            elif player_id == 12:  # Bench DEF
                minutes, points = 90, 6
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (10) + 9 starters (45) + bench DEF (6) = 61
        assert result.total_points == 61
        assert result.auto_subs_made == 1

    @pytest.mark.asyncio
    async def test_4_5_1_formation_valid_subs(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """4-5-1 formation handles subs correctly.

        Setup:
        - 4-5-1 formation (4 DEF, 5 MID, 1 FWD)
        - One MID (player 6) has 0 minutes
        - Bench: DEF(12), MID(13), FWD(14), GK(15)

        Expected: DEF(12) subs in (first in bench order), becomes 5-4-1
        """
        picks = []

        # GK (captain)
        picks.append(make_gw1_pick(1, 1, GK, is_captain=True))

        # 4 DEF (positions 2-5)
        for i, pos in enumerate([2, 3, 4, 5], start=2):
            picks.append(make_gw1_pick(i, pos, DEF))

        # 5 MID (positions 6-10, pos 6 is VC)
        for i, pos in enumerate([6, 7, 8, 9, 10], start=6):
            picks.append(make_gw1_pick(i, pos, MID, is_vice_captain=(pos == 6)))

        # 1 FWD (position 11)
        picks.append(make_gw1_pick(11, 11, FWD))

        # Bench: DEF, MID, FWD, GK
        picks.append(make_gw1_pick(12, 12, DEF))
        picks.append(make_gw1_pick(13, 13, MID))
        picks.append(make_gw1_pick(14, 14, FWD))
        picks.append(make_gw1_pick(15, 15, GK))

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 6:  # MID has 0 mins
                minutes, points = 0, 0
            elif player_id == 12:  # Bench DEF
                minutes, points = 90, 7
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain (10) + 9 starters (45) + bench DEF (7) = 62
        # MID out, DEF in -> 5-4-1 (valid)
        assert result.total_points == 62
        assert result.auto_subs_made == 1


class TestCaptainViceCaptain:
    """Tests for captain and vice-captain point handling."""

    @pytest.mark.asyncio
    async def test_captain_points_are_doubled(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Captain's points are multiplied by 2.

        Setup: Captain scores 10 points
        Expected: 10 * 2 = 20 points for captain
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            points = 10 if player_id == 1 else 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=90
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain: 10 * 2 = 20, others: 10 * 5 = 50
        # Total: 70
        assert result.total_points == 70
        # Captain bonus: 10 * (2-1) = 10 extra points from doubling
        assert result.captain_points_gained == 10

    @pytest.mark.asyncio
    async def test_vice_captain_activated_when_captain_has_zero_minutes(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Vice-captain gets doubled points when captain has 0 minutes.

        Setup:
        - Captain (player 1) has 0 minutes
        - Vice-captain (player 5) scores 8 points

        Expected: VC gets 8 * 2 = 16 points
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 1:
                minutes, points = 0, 0
            elif player_id == 5:  # VC
                minutes, points = 90, 8
            elif player_id == 15:  # bench GK (will sub for captain)
                minutes, points = 90, 3
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain with 0 mins: bench GK subs in (player 15, 3pts)
        # VC becomes captain: 8 * 2 = 16
        # Other 9 starters (not captain, not VC): 9 * 5 = 45
        # Sub GK: 3 (not doubled since VC is captain now)
        # Total: 16 + 45 + 3 = 64
        assert result.total_points == 64
        # Captain bonus: 8 * (2-1) = 8 extra points from VC doubling
        assert result.captain_points_gained == 8

    @pytest.mark.asyncio
    async def test_captain_with_zero_points_but_minutes_stays_captain(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Captain who plays but scores 0 points still gets doubled (0*2=0).

        Setup:
        - Captain (player 1) has 90 minutes but 0 points (bad game)
        - VC (player 5) scores 10 points

        Expected: Captain stays captain (0 * 2 = 0), VC not doubled
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 1:  # Captain plays but scores 0
                minutes, points = 90, 0
            elif player_id == 5:  # VC scores well
                minutes, points = 90, 10
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain: 0 * 2 = 0 (still captain, played minutes)
        # VC: 10 (not doubled)
        # Other 9 starters: 9 * 5 = 45
        # Total: 0 + 10 + 45 = 55
        assert result.total_points == 55
        assert result.captain_points_gained == 0  # 0 * (2-1) = 0

    @pytest.mark.asyncio
    async def test_no_doubled_points_when_both_captain_and_vc_have_zero_minutes(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """No player gets doubled points if both C and VC have 0 minutes.

        Setup:
        - Captain (player 1) has 0 minutes
        - Vice-captain (player 5) has 0 minutes

        Expected: No doubled points, subs happen normally
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id in [1, 5]:
                minutes, points = 0, 0
            elif player_id in [12, 13, 15]:  # bench players who will sub
                minutes, points = 90, 4
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # No captain bonus since both C and VC didn't play
        assert result.captain_points_gained == 0

    @pytest.mark.asyncio
    async def test_vice_captain_on_bench_activated_when_captain_zero_mins(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """VC can be on bench - gets doubled only if subbed in.

        Setup:
        - Captain (player 1, GK) has 0 minutes
        - VC is bench player 12 (DEF), has 90 minutes, 8 points
        - Another starter (player 11) has 0 minutes

        Expected: VC subs in for player 11, gets doubled (8*2=16)
        Note: VC must be in playing XI to get captain bonus
        """
        picks = []

        # GK (captain)
        picks.append(make_gw1_pick(1, 1, GK, is_captain=True))

        # DEF (positions 2-4)
        for i, pos in enumerate([2, 3, 4], start=2):
            picks.append(make_gw1_pick(i, pos, DEF))

        # MID (positions 5-8)
        for i, pos in enumerate([5, 6, 7, 8], start=5):
            picks.append(make_gw1_pick(i, pos, MID))

        # FWD (positions 9-11)
        for i, pos in enumerate([9, 10, 11], start=9):
            picks.append(make_gw1_pick(i, pos, FWD))

        # Bench: DEF(12) is VC!, MID(13), FWD(14), GK(15)
        picks.append(make_gw1_pick(12, 12, DEF, is_vice_captain=True))
        picks.append(make_gw1_pick(13, 13, MID))
        picks.append(make_gw1_pick(14, 14, FWD))
        picks.append(make_gw1_pick(15, 15, GK))

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 1:  # Captain GK has 0 mins
                minutes, points = 0, 0
            elif player_id == 11:  # Starter FWD has 0 mins
                minutes, points = 0, 0
            elif player_id == 12:  # VC on bench
                minutes, points = 90, 8
            elif player_id == 15:  # Bench GK
                minutes, points = 90, 3
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain GK out -> bench GK (15) subs in: 3 pts
        # FWD out -> VC DEF (12) subs in: 8 * 2 = 16 (VC becomes captain)
        # 9 other starters: 9 * 5 = 45
        # Total: 3 + 16 + 45 = 64
        assert result.total_points == 64
        assert result.captain_points_gained == 8  # 8 * (2-1)


# =============================================================================
# 4. Chip Effects Tests
# =============================================================================


class TestTripleCaptainChip:
    """Tests for Triple Captain chip effect."""

    @pytest.mark.asyncio
    async def test_triple_captain_triples_captain_points(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """TC chip multiplies captain by 3 instead of 2.

        Setup:
        - TC used in GW5
        - Captain scores 12 points in GW5

        Expected: 12 * 3 = 36 points for captain in GW5
        """
        picks = make_standard_squad()

        # Stats for 5 GWs
        fixture_stats = []
        for gw in range(1, 6):
            for player_id in range(1, 16):
                points = 12 if (gw == 5 and player_id == 1) else 5
                fixture_stats.append(
                    make_fixture_stats(
                        player_id=player_id, gameweek=gw, total_points=points, minutes=90
                    )
                )

        chips = [{"manager_id": 12345, "season_id": 1, "chip_type": "3xc", "gameweek": 5}]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=5
            )

        # GW1-4: (10 + 50) * 4 = 240
        # GW5: (12 * 3) + 50 = 86
        # Total: 326
        assert result.total_points == 326

    @pytest.mark.asyncio
    async def test_triple_captain_activates_vice_captain_when_captain_0_mins(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """TC applied to VC if captain has 0 mins.

        Setup:
        - TC used in GW5
        - Captain has 0 minutes in GW5
        - VC scores 10 points in GW5

        Expected: 10 * 3 = 30 points for VC in GW5
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 1:  # Captain
                minutes, points = 0, 0
            elif player_id == 5:  # VC
                minutes, points = 90, 10
            elif player_id == 15:  # bench GK
                minutes, points = 90, 5
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=5, total_points=points, minutes=minutes
                )
            )

        chips = [{"manager_id": 12345, "season_id": 1, "chip_type": "3xc", "gameweek": 5}]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=5
            )

        # VC tripled: 10 * 3 = 30
        # 9 other starters: 9 * 5 = 45
        # Sub for GK (bench GK): 5
        # Total: 30 + 45 + 5 = 80
        assert result.total_points == 80

    @pytest.mark.asyncio
    async def test_triple_captain_no_bonus_when_both_c_and_vc_have_zero_mins(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """TC chip gives no bonus when both captain and VC have 0 minutes.

        Setup:
        - TC used in GW5
        - Captain (player 1) has 0 minutes
        - VC (player 5) has 0 minutes

        Expected: No tripled points, normal subs happen
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id in [1, 5]:  # Both C and VC out
                minutes, points = 0, 0
            elif player_id in [12, 13, 15]:  # bench players who can sub
                minutes, points = 90, 4
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=5, total_points=points, minutes=minutes
                )
            )

        chips = [{"manager_id": 12345, "season_id": 1, "chip_type": "3xc", "gameweek": 5}]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=5
            )

        # No captain bonus (both C and VC have 0 mins)
        # 9 starters: 9 * 5 = 45
        # Subs for C(GK->15) and VC(MID->12 or 13): ~4+4 = 8
        # Total depends on exact sub logic, but no TC bonus
        assert result.captain_points_gained == 0

    @pytest.mark.asyncio
    async def test_triple_captain_applies_to_vice_captain_negative_points(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """TC multiplier applies correctly to VC with negative points.

        Setup:
        - TC used in GW5
        - Captain (player 1) has 0 minutes
        - VC (player 5) has -2 points (red card), 90 minutes

        Expected: -2 * 3 = -6 points for VC (multiplier applies to negative)
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 1:  # Captain out
                minutes, points = 0, 0
            elif player_id == 5:  # VC with red card
                minutes, points = 90, -2
            elif player_id == 15:  # bench GK for sub
                minutes, points = 90, 3
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=5, total_points=points, minutes=minutes
                )
            )

        chips = [{"manager_id": 12345, "season_id": 1, "chip_type": "3xc", "gameweek": 5}]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=5
            )

        # VC tripled: -2 * 3 = -6
        # 9 other starters: 9 * 5 = 45
        # Sub for GK (bench GK): 3
        # Total: -6 + 45 + 3 = 42
        assert result.total_points == 42
        # Captain bonus: -2 * (3-1) = -4 (negative bonus from negative points)
        assert result.captain_points_gained == -4


class TestBenchBoostChip:
    """Tests for Bench Boost chip effect."""

    @pytest.mark.asyncio
    async def test_bench_boost_includes_all_15_players(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """BB chip counts points from all 15 players.

        Setup:
        - BB used in GW3
        - All 15 players score 5 points

        Expected: (10 + 50 + 20) = 80 points in GW3
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=3, total_points=5, minutes=90
                )
            )

        chips = [{"manager_id": 12345, "season_id": 1, "chip_type": "bboost", "gameweek": 3}]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=3
            )

        # Captain: 5 * 2 = 10
        # Other 10 starters: 10 * 5 = 50
        # 4 bench: 4 * 5 = 20
        # Total: 80
        assert result.total_points == 80

    @pytest.mark.asyncio
    async def test_bench_boost_bench_players_with_zero_minutes_score_zero(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """BB includes 0-minute bench players (they score 0).

        Setup:
        - BB used in GW3
        - Bench player 12 has 0 minutes

        Expected: Player 12 contributes 0 points even with BB
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 12:
                minutes, points = 0, 0
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=3, total_points=points, minutes=minutes
                )
            )

        chips = [{"manager_id": 12345, "season_id": 1, "chip_type": "bboost", "gameweek": 3}]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=3
            )

        # Captain: 10, starters: 50, bench: 15 (3 * 5, not 4)
        # Total: 75
        assert result.total_points == 75

    @pytest.mark.asyncio
    async def test_bench_boost_disables_auto_subs(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """BB week: no auto-subs even if starter has 0 minutes.

        Setup:
        - BB used in GW3
        - Player 11 (FWD) has 0 minutes, 0 points
        - Bench player 12 (DEF) has 90 minutes, 7 points

        Expected:
        - All 15 players count (BB rule)
        - No auto-sub for player 11 (0 mins scores 0)
        - Bench player 12 scores 7 (not as a sub, but as BB inclusion)
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 11:  # Starter with 0 mins
                minutes, points = 0, 0
            elif player_id == 12:  # Bench player
                minutes, points = 90, 7
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=3, total_points=points, minutes=minutes
                )
            )

        chips = [{"manager_id": 12345, "season_id": 1, "chip_type": "bboost", "gameweek": 3}]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=3
            )

        # Captain (10) + 9 starters (45) + player 11 (0) + bench (7+5+5+5=22) = 77
        # NO auto-sub during BB - all 15 count regardless of minutes
        assert result.total_points == 77
        assert result.auto_subs_made == 0

    @pytest.mark.asyncio
    async def test_bench_boost_with_captain_zero_minutes_activates_vc(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """BB week with captain having 0 mins: VC gets doubled, no auto-subs.

        Setup:
        - BB used in GW3
        - Captain (player 1, GK) has 0 minutes, 0 points
        - Vice-captain (player 5, MID) has 90 minutes, 10 points
        - Other players have 90 minutes, 5 points each

        Expected:
        - VC gets doubled: 10 * 2 = 20
        - Captain scores 0 (no sub needed during BB)
        - All 15 players count
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id == 1:  # Captain (GK) with 0 mins
                minutes, points = 0, 0
            elif player_id == 5:  # Vice-captain (MID)
                minutes, points = 90, 10
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=3, total_points=points, minutes=minutes
                )
            )

        chips = [{"manager_id": 12345, "season_id": 1, "chip_type": "bboost", "gameweek": 3}]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=3
            )

        # Captain (0 pts) + VC doubled (10 * 2 = 20) + 9 starters (45) + 4 bench (20)
        # Total: 0 + 20 + 45 + 20 = 85
        assert result.total_points == 85
        assert result.captain_points_gained == 10  # VC bonus: 10 * (2-1)
        assert result.auto_subs_made == 0  # No auto-subs during BB


class TestChipCombinations:
    """Tests for chip combinations and multi-chip scenarios."""

    @pytest.mark.asyncio
    async def test_triple_captain_during_dgw(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """TC chip during DGW triples combined points from both fixtures.

        Setup:
        - TC used in DGW29
        - Captain plays 2 fixtures: 8pts + 12pts = 20pts total

        Expected: Captain gets 20 * 3 = 60 points
        """
        picks = make_standard_squad()

        fixture_stats = []
        # Captain has two DGW fixtures
        fixture_stats.append(
            make_fixture_stats(
                player_id=1, gameweek=29, total_points=8, minutes=90, fixture_id=1001
            )
        )
        fixture_stats.append(
            make_fixture_stats(
                player_id=1, gameweek=29, total_points=12, minutes=90, fixture_id=1002
            )
        )
        # Others have one fixture
        for player_id in range(2, 16):
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=29, total_points=5, minutes=90
                )
            )

        chips = [{"manager_id": 12345, "season_id": 1, "chip_type": "3xc", "gameweek": 29}]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=29
            )

        # Captain: (8+12) * 3 = 60
        # 10 other starters: 10 * 5 = 50
        # Total: 110
        assert result.total_points == 110

    @pytest.mark.asyncio
    async def test_bench_boost_during_dgw(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """BB during DGW counts all 15 players with DGW points.

        Setup:
        - BB used in DGW29
        - All 15 players have 2 fixtures each

        Expected: All 15 players contribute both fixture points
        """
        picks = make_standard_squad()

        fixture_stats = []
        # All players have two DGW fixtures
        for player_id in range(1, 16):
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=29, total_points=4, minutes=90, fixture_id=player_id * 100 + 1
                )
            )
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=29, total_points=3, minutes=90, fixture_id=player_id * 100 + 2
                )
            )

        chips = [{"manager_id": 12345, "season_id": 1, "chip_type": "bboost", "gameweek": 29}]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=29
            )

        # Captain: (4+3) * 2 = 14
        # 14 other players: 14 * (4+3) = 98
        # Total: 14 + 98 = 112
        assert result.total_points == 112

    @pytest.mark.asyncio
    async def test_multiple_chips_in_same_season(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """TC in GW5 and BB in GW10 both apply correctly.

        Setup:
        - TC used in GW5, captain scores 12
        - BB used in GW10, bench players score 4 each

        Expected: Both chip effects applied in their respective GWs
        """
        picks = make_standard_squad()

        fixture_stats = []
        for gw in range(1, 11):
            for player_id in range(1, 16):
                if gw == 5 and player_id == 1:
                    points = 12  # Captain in TC week
                else:
                    points = 5
                fixture_stats.append(
                    make_fixture_stats(
                        player_id=player_id, gameweek=gw, total_points=points, minutes=90
                    )
                )

        chips = [
            {"manager_id": 12345, "season_id": 1, "chip_type": "3xc", "gameweek": 5},
            {"manager_id": 12345, "season_id": 1, "chip_type": "bboost", "gameweek": 10},
        ]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=10
            )

        # GW1-4: 60 * 4 = 240
        # GW5 (TC): 12*3 + 50 = 86
        # GW6-9: 60 * 4 = 240
        # GW10 (BB): 10 + 50 + 20 = 80
        # Total: 240 + 86 + 240 + 80 = 646
        assert result.total_points == 646


class TestWildcardAndFreeHitIgnored:
    """Tests confirming Wildcard and Free Hit are ignored."""

    @pytest.mark.asyncio
    async def test_wildcard_does_not_change_gw1_squad(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Wildcard is ignored - always use GW1 squad.

        Setup: Manager used WC in GW8, but we still use GW1 squad
        Expected: Points calculated from GW1 squad, not WC squad
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=10, total_points=5, minutes=90
                )
            )

        chips = [{"manager_id": 12345, "season_id": 1, "chip_type": "wildcard", "gameweek": 8}]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=10
            )

        # Should use GW1 squad, wildcard ignored
        assert result.total_points == 60

    @pytest.mark.asyncio
    async def test_free_hit_does_not_affect_calculation(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Free Hit is ignored - GW1 squad used even in FH week.

        Setup: FH used in GW15
        Expected: GW1 squad used for GW15 calculation
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=15, total_points=5, minutes=90
                )
            )

        chips = [{"manager_id": 12345, "season_id": 1, "chip_type": "freehit", "gameweek": 15}]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=15
            )

        # GW1 squad used, Free Hit ignored
        assert result.total_points == 60

    @pytest.mark.asyncio
    async def test_both_wildcards_ignored_2025_26_season(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Both wildcards (first and second half) are ignored.

        2025/26 rule: Managers get 2 wildcards per season.
        Set and Forget ignores both - always uses GW1 squad.

        Setup:
        - First WC used in GW8
        - Second WC used in GW24

        Expected: GW1 squad used throughout
        """
        picks = make_standard_squad()

        fixture_stats = []
        for gw in range(1, 26):
            for player_id in range(1, 16):
                fixture_stats.append(
                    make_fixture_stats(
                        player_id=player_id, gameweek=gw, total_points=5, minutes=90
                    )
                )

        chips = [
            {"manager_id": 12345, "season_id": 1, "chip_type": "wildcard", "gameweek": 8},
            {"manager_id": 12345, "season_id": 1, "chip_type": "wildcard", "gameweek": 24},
        ]

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, chips]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=25
            )

        # Both wildcards ignored, GW1 squad used: 60 * 25 = 1500
        assert result.total_points == 1500


# =============================================================================
# 5. Double Gameweek (DGW) Tests
# =============================================================================


class TestDoubleGameweek:
    """Tests for Double Gameweek handling."""

    @pytest.mark.asyncio
    async def test_dgw_player_with_two_fixtures_gets_both_counted(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Player with 2 fixtures in DGW gets points from both.

        Setup:
        - GW29 is a DGW
        - Player 1 (captain) plays 2 fixtures: 6pts + 8pts

        Expected: Captain gets (6 + 8) * 2 = 28 points
        """
        picks = make_standard_squad()

        fixture_stats = []
        # Captain (player 1) has two fixtures
        fixture_stats.append(
            make_fixture_stats(
                player_id=1, gameweek=29, total_points=6, minutes=90, fixture_id=1001
            )
        )
        fixture_stats.append(
            make_fixture_stats(
                player_id=1, gameweek=29, total_points=8, minutes=90, fixture_id=1002
            )
        )
        # Others have one fixture
        for player_id in range(2, 16):
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=29, total_points=5, minutes=90
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=29
            )

        # Captain: (6 + 8) * 2 = 28
        # 10 other starters: 10 * 5 = 50
        # Total: 78
        assert result.total_points == 78

    @pytest.mark.asyncio
    async def test_dgw_captain_plays_one_fixture_vc_plays_both(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Captain plays 1 DGW fixture, VC plays both - captain stays captain.

        Setup:
        - Captain plays 1 fixture (90 mins), scores 3
        - VC plays 2 fixtures, scores 6 + 4 = 10

        Expected: Captain still gets doubled (played some mins)
        """
        picks = make_standard_squad()

        fixture_stats = []
        # Captain plays one fixture only
        fixture_stats.append(
            make_fixture_stats(
                player_id=1, gameweek=29, total_points=3, minutes=90, fixture_id=1001
            )
        )
        # VC (player 5) plays two fixtures
        fixture_stats.append(
            make_fixture_stats(
                player_id=5, gameweek=29, total_points=6, minutes=90, fixture_id=2001
            )
        )
        fixture_stats.append(
            make_fixture_stats(
                player_id=5, gameweek=29, total_points=4, minutes=90, fixture_id=2002
            )
        )
        # Others have one fixture
        for player_id in [2, 3, 4, 6, 7, 8, 9, 10, 11]:
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=29, total_points=5, minutes=90
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=29
            )

        # Captain: 3 * 2 = 6 (played, so stays captain)
        # VC: 6 + 4 = 10 (not doubled)
        # Other 9: 9 * 5 = 45
        # Total: 6 + 10 + 45 = 61
        assert result.total_points == 61

    @pytest.mark.asyncio
    async def test_dgw_captain_plays_first_fixture_zero_in_second_stays_captain(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Captain plays fixture 1, 0 mins in fixture 2 - stays captain.

        Setup:
        - Captain plays fixture 1 (45 mins, 2 pts), fixture 2 (0 mins, 0 pts)
        - VC plays both fixtures (90+90 mins, 10 total pts)

        Expected: Captain stays captain (any minutes = stays captain)
        Captain gets (2+0)*2 = 4 points, VC not doubled
        """
        picks = make_standard_squad()

        fixture_stats = []
        # Captain plays first, benched in second
        fixture_stats.append(
            make_fixture_stats(
                player_id=1, gameweek=29, total_points=2, minutes=45, fixture_id=1001
            )
        )
        fixture_stats.append(
            make_fixture_stats(
                player_id=1, gameweek=29, total_points=0, minutes=0, fixture_id=1002
            )
        )
        # VC plays both
        fixture_stats.append(
            make_fixture_stats(
                player_id=5, gameweek=29, total_points=6, minutes=90, fixture_id=2001
            )
        )
        fixture_stats.append(
            make_fixture_stats(
                player_id=5, gameweek=29, total_points=4, minutes=90, fixture_id=2002
            )
        )
        # Others have one fixture
        for player_id in [2, 3, 4, 6, 7, 8, 9, 10, 11]:
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=29, total_points=5, minutes=90
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=29
            )

        # Captain: (2+0) * 2 = 4 (played first fixture, stays captain)
        # VC: 6+4 = 10 (not doubled)
        # Other 9: 9 * 5 = 45
        # Total: 4 + 10 + 45 = 59
        assert result.total_points == 59

    @pytest.mark.asyncio
    async def test_dgw_captain_zero_in_both_fixtures_activates_vc(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Captain has 0 mins in BOTH DGW fixtures, VC activated.

        Setup:
        - Captain has 2 fixtures, 0 mins in both
        - VC plays normally

        Expected: VC gets doubled
        """
        picks = make_standard_squad()

        fixture_stats = []
        # Captain 0 mins in both
        fixture_stats.append(
            make_fixture_stats(
                player_id=1, gameweek=29, total_points=0, minutes=0, fixture_id=1001
            )
        )
        fixture_stats.append(
            make_fixture_stats(
                player_id=1, gameweek=29, total_points=0, minutes=0, fixture_id=1002
            )
        )
        # VC plays
        fixture_stats.append(
            make_fixture_stats(
                player_id=5, gameweek=29, total_points=10, minutes=90, fixture_id=2001
            )
        )
        # Others (including bench)
        for player_id in [2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]:
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=29, total_points=5, minutes=90
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=29
            )

        # Captain 0 mins -> VC becomes captain: 10 * 2 = 20
        # Sub for GK (bench GK 15): 5
        # Other 9 starters: 9 * 5 = 45
        # Total: 20 + 5 + 45 = 70
        assert result.total_points == 70


# =============================================================================
# 6. Edge Cases
# =============================================================================


class TestEdgeCases:
    """Edge case tests for unusual scenarios."""

    @pytest.mark.asyncio
    async def test_all_bench_players_also_have_zero_minutes(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Starter and all bench players have 0 minutes.

        Setup:
        - Player 11 (FWD) has 0 mins
        - All bench (12, 13, 14, 15) have 0 mins

        Expected: Player 11 scores 0, no sub possible
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id in [11, 12, 13, 14, 15]:
                minutes, points = 0, 0
            else:
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Captain: 10, 9 starters: 45, player 11: 0 (no sub)
        # Total: 55
        assert result.total_points == 55
        assert result.auto_subs_made == 0

    @pytest.mark.asyncio
    async def test_entire_starting_xi_has_zero_minutes(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Extreme: All 11 starters have 0 minutes.

        Setup: All starters 0 mins, bench plays

        Expected: 4 subs made where valid, rest score 0
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            if player_id <= 11:  # Starters
                minutes, points = 0, 0
            else:  # Bench
                minutes, points = 90, 5
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=1, total_points=points, minutes=minutes
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=1
            )

        # Only 4 bench can sub in at most
        # Bench GK (15) for GK (1)
        # DEF (12) for one outfield
        # MID (13) for one outfield
        # FWD (14) for one outfield
        # 4 subs * 5 pts = 20 (no captain bonus as C and VC both 0 mins)
        assert result.auto_subs_made == 4
        assert result.total_points == 20

    @pytest.mark.asyncio
    async def test_player_transferred_out_mid_season_still_counted(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Player sold IRL mid-season but was in GW1 squad.

        Setup:
        - Player 11 (FWD) sold to Championship in January
        - No fixture stats after GW20
        - Bench player 12 (DEF) will sub in GW21-25

        Expected: Player 11 contributes 0 from GW21 onwards, sub happens
        """
        picks = make_standard_squad()

        fixture_stats = []
        # Player 11 only has stats for GW1-20
        for gw in range(1, 21):
            for player_id in range(1, 16):
                fixture_stats.append(
                    make_fixture_stats(
                        player_id=player_id, gameweek=gw, total_points=5, minutes=90
                    )
                )
        # GW21-25: Player 11 has no stats (transferred), bench players have stats
        for gw in range(21, 26):
            for player_id in range(1, 16):
                if player_id != 11:
                    fixture_stats.append(
                        make_fixture_stats(
                            player_id=player_id, gameweek=gw, total_points=5, minutes=90
                        )
                    )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=25
            )

        # GW1-20: 60 pts/GW * 20 = 1200
        # GW21-25: player 11 has 0 mins (no stats), bench DEF (12) subs in
        #   Captain (10) + 9 starters (45) + sub (5) = 60 pts/GW * 5 = 300
        # Total: 1200 + 300 = 1500
        assert result.total_points == 1500
        assert result.auto_subs_made == 5  # One sub per GW for GW21-25

    @pytest.mark.asyncio
    async def test_blank_gameweek_handling(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Blank GW where some players have no fixture.

        Setup:
        - GW18 is a blank for some teams
        - Players 9, 10, 11 (all FWD) have no fixture in GW18
        - Bench: DEF(12), MID(13), FWD(14), GK(15) all have fixtures

        Expected: Players 9,10,11 score 0 (0 mins), bench 12,13,14 sub in
        """
        picks = make_standard_squad()

        fixture_stats = []
        # GW18: FWDs 9,10,11 have no fixture (blank)
        for player_id in range(1, 16):
            if player_id in [9, 10, 11]:
                continue  # No fixture = no stats row
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=18, total_points=5, minutes=90
                )
            )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=18
            )

        # Captain (10) + 7 starters (35) + 3 subs (15) = 60
        # Players 9,10,11 blank -> bench 12,13,14 sub in (each 5 pts)
        assert result.total_points == 60
        assert result.auto_subs_made == 3

    @pytest.mark.asyncio
    async def test_season_boundary_gw38_calculation(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Full season calculation to GW38.

        Setup: 38 gameweeks of data

        Expected: Sum across all 38 GWs
        """
        picks = make_standard_squad()

        fixture_stats = []
        for gw in range(1, 39):
            for player_id in range(1, 16):
                fixture_stats.append(
                    make_fixture_stats(
                        player_id=player_id, gameweek=gw, total_points=5, minutes=90
                    )
                )

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=38
            )

        # 60 points per GW * 38 GWs = 2280
        assert result.total_points == 2280


class TestComparisonOutput:
    """Tests for comparison output (actual vs set-and-forget)."""

    @pytest.mark.asyncio
    async def test_returns_comparison_with_actual_points(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Response includes actual points for comparison.

        Setup: Manager has 150 actual points
        Expected: Result contains both saf_points and actual_points
        """
        picks = make_standard_squad()

        fixture_stats = []
        for player_id in range(1, 16):
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=5, total_points=5, minutes=90
                )
            )

        # Mock actual points from manager_gw_snapshot
        actual_total = 150

        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]
        mock_saf_db.conn.fetchval.return_value = actual_total

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=5
            )

        assert result.total_points is not None
        assert result.actual_points == 150
        assert result.difference == result.total_points - 150


class TestInputValidation:
    """Tests for input validation."""

    @pytest.mark.asyncio
    async def test_rejects_gameweek_below_1(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Should reject current_gameweek < 1."""
        with mock_saf_db, pytest.raises(ValueError, match="Gameweek must be between 1 and 38"):
            await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=0
            )

    @pytest.mark.asyncio
    async def test_rejects_gameweek_above_38(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Should reject current_gameweek > 38."""
        with mock_saf_db, pytest.raises(ValueError, match="Gameweek must be between 1 and 38"):
            await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=39
            )


class TestDatabaseErrors:
    """Tests for database error handling."""

    @pytest.mark.asyncio
    async def test_propagates_database_error_on_gw1_picks_query(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Should propagate database errors during GW1 picks query."""
        mock_saf_db.conn.fetch.side_effect = Exception("Connection timeout")

        with mock_saf_db, pytest.raises(Exception, match="Connection timeout"):
            await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=10
            )

    @pytest.mark.asyncio
    async def test_propagates_database_error_on_fixture_stats_query(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Should propagate database errors during fixture stats query."""
        picks = make_standard_squad()

        mock_saf_db.conn.fetch.side_effect = [
            picks,
            Exception("Query failed"),
        ]

        with mock_saf_db, pytest.raises(Exception, match="Query failed"):
            await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=10
            )


class TestLateJoiners:
    """Tests for managers who joined after GW1 (late joiners)."""

    @pytest.mark.asyncio
    async def test_late_joiner_uses_first_active_gameweek_as_base(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Manager who started in GW2 uses GW2 squad as set-and-forget base.

        Setup: Manager joined in GW2, their GW2 squad scores 60 pts in GW2 and GW3
        Expected: 120 total points (60 * 2 GWs)
        """
        picks = make_standard_squad()

        # Stats for GW2 and GW3 (not GW1 since manager wasn't active)
        fixture_stats = []
        for gw in [2, 3]:
            for player_id in range(1, 16):
                fixture_stats.append(
                    make_fixture_stats(
                        player_id=player_id, gameweek=gw, total_points=5, minutes=90
                    )
                )

        # Mock: first_gw=2 (late joiner), actual_points=115
        mock_saf_db.conn.fetchval.side_effect = [2, 115]
        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=3
            )

        # 2 GWs * 60 points per GW = 120
        assert result.total_points == 120
        assert result.actual_points == 115
        assert result.difference == 5

    @pytest.mark.asyncio
    async def test_late_joiner_gw2_ignores_gw1_data(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Manager who started in GW2 should not include any GW1 points.

        Setup: Player stats exist for GW1 but manager joined GW2
        Expected: Only GW2+ points count
        """
        picks = make_standard_squad()

        # Only GW2 stats (GW1 data should not be fetched)
        fixture_stats = []
        for player_id in range(1, 16):
            fixture_stats.append(
                make_fixture_stats(
                    player_id=player_id, gameweek=2, total_points=10, minutes=90
                )
            )

        mock_saf_db.conn.fetchval.side_effect = [2, 50]  # first_gw=2, actual=50
        mock_saf_db.conn.fetch.side_effect = [picks, fixture_stats, []]

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=12345, season_id=1, current_gameweek=2
            )

        # 1 GW * (10*2 captain + 10*10 others) = 120
        assert result.total_points == 120

    @pytest.mark.asyncio
    async def test_manager_with_no_snapshots_returns_zeros(
        self, set_and_forget_service: "SetAndForgetService", mock_saf_db: MockDB
    ):
        """Manager with no gameweek snapshots (never played) returns zeros.

        Setup: No snapshots exist for manager
        Expected: 0 points
        """
        mock_saf_db.conn.fetchval.return_value = None  # No first_gw

        with mock_saf_db:
            result = await set_and_forget_service.calculate(
                manager_id=99999, season_id=1, current_gameweek=10
            )

        assert result.total_points == 0
        assert result.actual_points == 0
        assert result.difference == 0
