"""TDD tests for Tier 3 xG metrics calculation functions.

These tests are written BEFORE implementation (TDD red phase).
Run with: python -m pytest tests/test_calculations.py -v

FPL Scoring Rules Reference:
| Position | Goal | Assist | Clean Sheet | Goals Conceded |
|----------|------|--------|-------------|----------------|
| GK (1)   | 6    | 3      | 4           | -1 per 2       |
| DEF (2)  | 6    | 3      | 4           | -1 per 2       |
| MID (3)  | 5    | 3      | 1           | 0              |
| FWD (4)  | 4    | 3      | 0           | 0              |

Position element_types: GK=1, DEF=2, MID=3, FWD=4

xCS (Expected Clean Sheet) Formula:
    xCS = max(0, 1 - xGA / 2.5)

The 2.5 divisor is derived from the observation that teams conceding ~2.5 xGA
have near-zero clean sheet probability. This is a simplified model; in practice
CS probability follows a Poisson distribution based on opponent xG.
"""

from typing import TypedDict

import pytest

from app.services.calculations import (
    calculate_luck_index,
    calculate_captain_xp_delta,
    calculate_squad_xp,
)


# =============================================================================
# TypedDict for pick structure
# =============================================================================


class PickWithXg(TypedDict, total=False):
    """Pick data structure with xG metrics for Tier 3 calculations.

    This matches the structure returned by the database query joining
    manager_pick with player_fixture_stats.
    """

    player_id: int
    element_type: int  # GK=1, DEF=2, MID=3, FWD=4
    multiplier: int  # 0=bench, 1=playing, 2=captain, 3=triple captain
    is_captain: bool
    total_points: int  # Points AFTER multiplier applied (as shown in FPL API)
    expected_goals: float | None
    expected_assists: float | None
    expected_goals_conceded: float | None  # Only relevant for GK/DEF
    minutes: int
    gameweek: int


# =============================================================================
# Constants
# =============================================================================

# FPL position element types
GK = 1
DEF = 2
MID = 3
FWD = 4

# Points per goal by position
POINTS_PER_GOAL = {GK: 6, DEF: 6, MID: 5, FWD: 4}
POINTS_PER_ASSIST = 3
POINTS_PER_CLEAN_SHEET = {GK: 4, DEF: 4, MID: 1, FWD: 0}


# =============================================================================
# Helper functions for creating test data
# =============================================================================


def make_pick(
    player_id: int = 1,
    element_type: int = FWD,
    multiplier: int = 1,
    is_captain: bool = False,
    total_points: int = 2,
    xg: float | None = 0.0,
    xa: float | None = 0.0,
    xga: float | None = None,
    minutes: int = 90,
    gameweek: int = 1,
) -> PickWithXg:
    """Create a pick dictionary for testing.

    Args:
        player_id: Unique player identifier.
        element_type: Position (GK=1, DEF=2, MID=3, FWD=4).
        multiplier: 0=bench, 1=playing, 2=captain, 3=triple captain.
        is_captain: Whether this player is the captain.
        total_points: Points AFTER multiplier applied (as shown in FPL API).
            For captain with 8 base points, pass total_points=16.
        xg: Expected goals (None if data unavailable).
        xa: Expected assists (None if data unavailable).
        xga: Expected goals against (only relevant for GK/DEF).
        minutes: Minutes played (0 = didn't play).
        gameweek: Gameweek number.

    Returns:
        PickWithXg dict matching the database query structure.
    """
    return {
        "player_id": player_id,
        "element_type": element_type,
        "multiplier": multiplier,
        "is_captain": is_captain,
        "total_points": total_points,
        "expected_goals": xg,
        "expected_assists": xa,
        "expected_goals_conceded": xga,
        "minutes": minutes,
        "gameweek": gameweek,
    }


# =============================================================================
# 3.1 Luck Index Tests
# =============================================================================


class TestLuckIndexCoreCalculation:
    """Core calculation tests for luck_index."""

    def test_luck_index_forward_scores_goal_from_low_xg(self):
        """FWD with xG=0.1, xA=0.0 scores 1 goal (4pts from goal).

        xP = 0.1*4 + 0*3 = 0.4
        Actual = 4 (goal points only, excluding appearance)
        Luck = 4 - 0.4 = +3.6 (lucky goal)
        """
        picks = [make_pick(element_type=FWD, xg=0.1, xa=0.0, total_points=6)]
        # 6 total points = 2 appearance + 4 goal
        # Luck index based on goal/assist contribution: 4 - 0.4 = 3.6
        result = calculate_luck_index(picks)
        assert result == pytest.approx(3.6, rel=0.01)

    def test_luck_index_forward_blanks_despite_high_xg(self):
        """FWD with xG=1.5, xA=0.3 scores 0 goals.

        xP = 1.5*4 + 0.3*3 = 6.9
        Actual = 0 (no goals/assists)
        Luck = 0 - 6.9 = -6.9 (unlucky blank)
        """
        picks = [make_pick(element_type=FWD, xg=1.5, xa=0.3, total_points=2)]
        # 2 points = appearance only, no goals/assists
        result = calculate_luck_index(picks)
        assert result == pytest.approx(-6.9, rel=0.01)

    def test_luck_index_midfielder_scores_uses_5pts_per_goal(self):
        """MID with xG=0.5, xA=0.2 scores 1 goal.

        xP = 0.5*5 + 0.2*3 = 3.1
        Actual = 5 (goal points)
        Luck = 5 - 3.1 = +1.9
        """
        picks = [make_pick(element_type=MID, xg=0.5, xa=0.2, total_points=7)]
        # 7 points = 2 appearance + 5 goal
        result = calculate_luck_index(picks)
        assert result == pytest.approx(1.9, rel=0.01)

    def test_luck_index_forward_gets_assist_from_low_xa(self):
        """FWD with xG=0.0, xA=0.1 gets 1 assist (3pts).

        xP = 0*4 + 0.1*3 = 0.3
        Actual = 3 (assist points)
        Luck = 3 - 0.3 = +2.7 (lucky assist)
        """
        picks = [make_pick(element_type=FWD, xg=0.0, xa=0.1, total_points=5)]
        # 5 total = 2 appearance + 3 assist
        result = calculate_luck_index(picks)
        assert result == pytest.approx(2.7, rel=0.01)

    def test_luck_index_defender_includes_clean_sheet_bonus(self):
        """DEF with xG=0.1, xA=0.0, xGA=0.8 keeps clean sheet.

        xCS probability = max(0, 1 - xGA/2.5) = 0.68
        xP = 0.1*6 + 0*3 + 0.68*4 = 3.32
        Actual = 6 (appearance 2 + CS 4)
        Luck = 6 - 3.32 = +2.68
        """
        picks = [make_pick(element_type=DEF, xg=0.1, xa=0.0, xga=0.8, total_points=6)]
        # 6 points = 2 appearance + 4 clean sheet
        result = calculate_luck_index(picks)
        assert result == pytest.approx(2.68, rel=0.01)

    def test_luck_index_goalkeeper_concedes_despite_low_xga(self):
        """GK with xGA=0.5 concedes 3 goals.

        xCS probability = max(0, 1 - 0.5/2.5) = 0.8
        xP for CS = 0.8*4 = 3.2 expected CS points
        Actual = -1 (goals conceded penalty, no CS)
        Luck = -1 - 3.2 = -4.2 (unlucky conceding)
        """
        picks = [make_pick(element_type=GK, xg=0.0, xa=0.0, xga=0.5, total_points=1)]
        # 1 point = 2 appearance - 1 goals conceded penalty
        result = calculate_luck_index(picks)
        assert result == pytest.approx(-4.2, rel=0.01)


class TestLuckIndexAggregation:
    """Aggregation tests for luck_index."""

    def test_luck_index_sums_across_all_starting_players(self):
        """11 players each with luck_delta should sum all."""
        picks = [
            make_pick(player_id=i, element_type=FWD, xg=0.5, xa=0.0, total_points=6)
            for i in range(11)
        ]
        # Each: 4 - (0.5*4) = 4 - 2 = 2 luck
        # Total: 11 * 2 = 22
        result = calculate_luck_index(picks)
        assert result == pytest.approx(22.0, rel=0.01)

    def test_luck_index_sums_across_multiple_gameweeks(self):
        """Same player across GW1-5 should give cumulative season luck."""
        picks = [
            make_pick(player_id=1, gameweek=gw, element_type=FWD, xg=0.5, total_points=6)
            for gw in range(1, 6)
        ]
        # Each GW: 4 - 2 = 2 luck, 5 GWs = 10
        result = calculate_luck_index(picks)
        assert result == pytest.approx(10.0, rel=0.01)

    def test_luck_index_excludes_bench_players(self):
        """Multiplier=0 players should not be counted."""
        picks = [
            make_pick(player_id=1, multiplier=1, xg=0.5, total_points=6),
            make_pick(player_id=2, multiplier=0, xg=1.0, total_points=2),  # bench
        ]
        # Only first player: 4 - 2 = 2
        result = calculate_luck_index(picks)
        assert result == pytest.approx(2.0, rel=0.01)

    def test_luck_index_includes_bench_boost_players(self):
        """When bench_boost chip active, all players have multiplier=1."""
        picks = [
            make_pick(player_id=i, multiplier=1, xg=0.5, total_points=6)
            for i in range(15)  # All 15 players
        ]
        # 15 * 2 = 30 luck
        result = calculate_luck_index(picks)
        assert result == pytest.approx(30.0, rel=0.01)


class TestLuckIndexEdgeCases:
    """Edge case tests for luck_index."""

    def test_luck_index_returns_none_for_empty_input(self):
        """Input: [] should return None."""
        result = calculate_luck_index([])
        assert result is None

    def test_luck_index_skips_players_with_zero_minutes(self):
        """Player didn't play (minutes=0) should be skipped."""
        picks = [
            make_pick(player_id=1, minutes=90, xg=0.5, total_points=6),
            make_pick(player_id=2, minutes=0, xg=1.0, total_points=0),
        ]
        # Only first player: 4 - 2 = 2
        result = calculate_luck_index(picks)
        assert result == pytest.approx(2.0, rel=0.01)

    def test_luck_index_handles_null_xg_values(self):
        """Some fixtures missing xG data should be skipped."""
        picks = [
            make_pick(player_id=1, xg=0.5, total_points=6),
            make_pick(player_id=2, xg=None, xa=None, total_points=4),
        ]
        # Only first player counted
        result = calculate_luck_index(picks)
        assert result == pytest.approx(2.0, rel=0.01)

    def test_luck_index_handles_double_gameweek(self):
        """Player has 2 fixtures in same GW should sum both fixture deltas."""
        picks = [
            # Same player, same GW, two fixtures
            make_pick(player_id=1, gameweek=1, xg=0.5, total_points=6),
            make_pick(player_id=1, gameweek=1, xg=0.3, total_points=4),
        ]
        # First: 4 - 2 = 2, Second: 2 - 1.2 = 0.8
        # Total: 2.8
        result = calculate_luck_index(picks)
        assert result == pytest.approx(2.8, rel=0.01)

    def test_luck_index_rounds_to_two_decimal_places(self):
        """Precision handling for display."""
        picks = [make_pick(xg=0.333, total_points=6)]
        result = calculate_luck_index(picks)
        # Should be rounded to 2 decimal places
        assert result == round(result, 2)


# =============================================================================
# 3.2 Captain xP Delta Tests
# =============================================================================


class TestCaptainDeltaCoreCalculation:
    """Core calculation tests for captain_xp_delta."""

    def test_captain_delta_positive_when_captain_overperforms(self):
        """Captain (FWD) with xG=0.5, xA=0.1 scores 2 goals.

        xP = 0.5*4 + 0.1*3 = 2.3
        Actual = 8pts (2 goals)
        Delta = 8 - 2.3 = +5.7
        """
        picks = [
            make_pick(is_captain=True, multiplier=2, xg=0.5, xa=0.1, total_points=16)
        ]
        # 16 doubled = 8 base, 8 - 2.3 = 5.7
        result = calculate_captain_xp_delta(picks)
        assert result == pytest.approx(5.7, rel=0.01)

    def test_captain_delta_negative_when_captain_blanks(self):
        """Captain (MID) with xG=1.2, xA=0.5 scores 0.

        xP = 1.2*5 + 0.5*3 = 7.5
        Actual = 2pts (appearance)
        Delta = 2 - 7.5 = -5.5
        """
        picks = [
            make_pick(
                element_type=MID, is_captain=True, multiplier=2, xg=1.2, xa=0.5, total_points=4
            )
        ]
        # 4 doubled = 2 base
        result = calculate_captain_xp_delta(picks)
        assert result == pytest.approx(-5.5, rel=0.01)

    def test_captain_delta_uses_base_points_not_doubled(self):
        """Captain's 2x multiplier applies to actual points only.

        We compare actual/multiplier vs xP (not doubled xP).
        This measures captain SELECTION skill, not multiplier effect.
        """
        picks = [
            make_pick(is_captain=True, multiplier=2, xg=0.5, total_points=12)
        ]
        # 12 doubled = 6 base, xP = 2, delta = 6 - 2 = 4
        result = calculate_captain_xp_delta(picks)
        assert result == pytest.approx(4.0, rel=0.01)

    def test_captain_delta_defender_includes_clean_sheet_in_xp(self):
        """DEF captain: xP should include xCS probability.

        xP = 0.1*6 + 0.0*3 + 0.6*4 = 3.0
        (xCS = 1 - 1.0/2.5 = 0.6)
        Actual = 10pts base (2 app + 4 CS + 4 goal bonus = 10)
        Delta = 10 - 3.0 = +7.0
        """
        picks = [
            make_pick(
                element_type=DEF,
                is_captain=True,
                multiplier=2,
                xg=0.1,
                xa=0.0,
                xga=1.0,
                total_points=20,  # 10 base * 2 captain
            )
        ]
        result = calculate_captain_xp_delta(picks)
        assert result == pytest.approx(7.0, rel=0.01)


class TestCaptainDeltaMultiplierHandling:
    """Multiplier handling tests for captain_xp_delta."""

    def test_captain_delta_normal_captain_uses_multiplier_2(self):
        """Standard captain: actual_pts / 2 vs xP."""
        picks = [
            make_pick(is_captain=True, multiplier=2, xg=0.5, total_points=10)
        ]
        # 10/2 = 5 base, xP = 2, delta = 3
        result = calculate_captain_xp_delta(picks)
        assert result == pytest.approx(3.0, rel=0.01)

    def test_captain_delta_triple_captain_uses_multiplier_3(self):
        """TC chip active: actual_pts / 3 vs xP."""
        picks = [
            make_pick(is_captain=True, multiplier=3, xg=0.5, total_points=15)
        ]
        # 15/3 = 5 base, xP = 2, delta = 3
        result = calculate_captain_xp_delta(picks)
        assert result == pytest.approx(3.0, rel=0.01)

    def test_captain_delta_vice_captain_activated(self):
        """Captain got 0 mins, VC played - VC becomes captain with multiplier=2."""
        picks = [
            # Captain didn't play
            make_pick(player_id=1, is_captain=True, multiplier=2, minutes=0, total_points=0),
            # VC played and became effective captain
            make_pick(player_id=2, is_captain=False, multiplier=2, xg=0.5, total_points=10),
        ]
        # VC's stats: 10/2 = 5 base, xP = 2, delta = 3
        result = calculate_captain_xp_delta(picks)
        assert result == pytest.approx(3.0, rel=0.01)


class TestCaptainDeltaAggregation:
    """Aggregation tests for captain_xp_delta."""

    def test_captain_delta_cumulative_across_season(self):
        """Sum delta for all GWs where captain data exists."""
        picks = [
            make_pick(gameweek=gw, is_captain=True, multiplier=2, xg=0.5, total_points=10)
            for gw in range(1, 6)
        ]
        # Each GW: 5 - 2 = 3, 5 GWs = 15
        result = calculate_captain_xp_delta(picks)
        assert result == pytest.approx(15.0, rel=0.01)

    def test_captain_delta_handles_dgw_captain(self):
        """Captain played twice in DGW should sum both fixtures."""
        picks = [
            # Same captain, same GW, two fixtures
            make_pick(player_id=1, gameweek=1, is_captain=True, multiplier=2, xg=0.5, total_points=10),
            make_pick(player_id=1, gameweek=1, is_captain=True, multiplier=2, xg=0.3, total_points=6),
        ]
        # First: 5 - 2 = 3, Second: 3 - 1.2 = 1.8
        # Total: 4.8
        result = calculate_captain_xp_delta(picks)
        assert result == pytest.approx(4.8, rel=0.01)


class TestCaptainDeltaEdgeCases:
    """Edge case tests for captain_xp_delta."""

    def test_captain_delta_returns_none_for_empty_input(self):
        """Empty input should return None."""
        result = calculate_captain_xp_delta([])
        assert result is None

    def test_captain_delta_returns_none_when_no_captain_played(self):
        """Captain and VC both got 0 mins in a GW."""
        picks = [
            make_pick(player_id=1, is_captain=True, multiplier=2, minutes=0, total_points=0),
            make_pick(player_id=2, is_captain=False, multiplier=1, minutes=0, total_points=0),
        ]
        result = calculate_captain_xp_delta(picks)
        assert result is None

    def test_captain_delta_handles_captain_null_xg(self):
        """Captain's fixture missing xG should skip that GW."""
        picks = [
            make_pick(gameweek=1, is_captain=True, multiplier=2, xg=0.5, total_points=10),
            make_pick(gameweek=2, is_captain=True, multiplier=2, xg=None, total_points=8),
        ]
        # Only GW1 counted: 5 - 2 = 3
        result = calculate_captain_xp_delta(picks)
        assert result == pytest.approx(3.0, rel=0.01)

    def test_captain_delta_handles_single_gameweek_data(self):
        """Only 1 GW of data should still return a value."""
        picks = [
            make_pick(gameweek=1, is_captain=True, multiplier=2, xg=0.5, total_points=10)
        ]
        result = calculate_captain_xp_delta(picks)
        assert result == pytest.approx(3.0, rel=0.01)


# =============================================================================
# 3.3 Squad xP Tests
# =============================================================================


class TestSquadXpPositionBasedCalculation:
    """Position-based calculation tests for squad_xp."""

    def test_squad_xp_forward_uses_xgi_only(self):
        """FWD: xP = xG + xA (raw xGI, not multiplied by points)."""
        picks = [make_pick(element_type=FWD, xg=0.8, xa=0.3)]
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(1.1, rel=0.01)

    def test_squad_xp_midfielder_uses_xgi_only(self):
        """MID: xP = xG + xA."""
        picks = [make_pick(element_type=MID, xg=0.5, xa=0.5)]
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(1.0, rel=0.01)

    def test_squad_xp_defender_uses_xgi_plus_xcs(self):
        """DEF: xP = xG + xA + xCS_probability.

        xCS = max(0, 1 - opponent_xG/2.5)
        """
        picks = [make_pick(element_type=DEF, xg=0.1, xa=0.2, xga=1.0)]
        # xCS = 1 - 1.0/2.5 = 0.6
        # xP = 0.1 + 0.2 + 0.6 = 0.9
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(0.9, rel=0.01)

    def test_squad_xp_goalkeeper_uses_xgi_plus_xcs(self):
        """GK: same as DEF (xG + xA + xCS)."""
        picks = [make_pick(element_type=GK, xg=0.0, xa=0.0, xga=0.5)]
        # xCS = 1 - 0.5/2.5 = 0.8
        # xP = 0 + 0 + 0.8 = 0.8
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(0.8, rel=0.01)


class TestSquadXpFormation:
    """Formation tests for squad_xp."""

    def test_squad_xp_standard_442_formation(self):
        """1 GK, 4 DEF, 4 MID, 2 FWD should calculate each correctly."""
        picks = (
            [make_pick(player_id=0, element_type=GK, xg=0.0, xa=0.0, xga=1.0)]
            + [make_pick(player_id=i, element_type=DEF, xg=0.1, xa=0.1, xga=1.0) for i in range(1, 5)]
            + [make_pick(player_id=i, element_type=MID, xg=0.3, xa=0.2) for i in range(5, 9)]
            + [make_pick(player_id=i, element_type=FWD, xg=0.5, xa=0.2) for i in range(9, 11)]
        )
        # GK: 0 + 0 + 0.6 = 0.6
        # 4 DEF: 4 * (0.1 + 0.1 + 0.6) = 4 * 0.8 = 3.2
        # 4 MID: 4 * (0.3 + 0.2) = 4 * 0.5 = 2.0
        # 2 FWD: 2 * (0.5 + 0.2) = 2 * 0.7 = 1.4
        # Total: 0.6 + 3.2 + 2.0 + 1.4 = 7.2
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(7.2, rel=0.01)

    def test_squad_xp_343_formation(self):
        """1 GK, 3 DEF, 4 MID, 3 FWD."""
        picks = (
            [make_pick(player_id=0, element_type=GK, xg=0.0, xa=0.0, xga=1.0)]
            + [make_pick(player_id=i, element_type=DEF, xg=0.1, xa=0.1, xga=1.0) for i in range(1, 4)]
            + [make_pick(player_id=i, element_type=MID, xg=0.3, xa=0.2) for i in range(4, 8)]
            + [make_pick(player_id=i, element_type=FWD, xg=0.5, xa=0.2) for i in range(8, 11)]
        )
        # GK: 0.6, 3 DEF: 2.4, 4 MID: 2.0, 3 FWD: 2.1
        # Total: 0.6 + 2.4 + 2.0 + 2.1 = 7.1
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(7.1, rel=0.01)

    def test_squad_xp_532_formation(self):
        """1 GK, 5 DEF, 3 MID, 2 FWD."""
        picks = (
            [make_pick(player_id=0, element_type=GK, xg=0.0, xa=0.0, xga=1.0)]
            + [make_pick(player_id=i, element_type=DEF, xg=0.1, xa=0.1, xga=1.0) for i in range(1, 6)]
            + [make_pick(player_id=i, element_type=MID, xg=0.3, xa=0.2) for i in range(6, 9)]
            + [make_pick(player_id=i, element_type=FWD, xg=0.5, xa=0.2) for i in range(9, 11)]
        )
        # GK: 0.6, 5 DEF: 4.0, 3 MID: 1.5, 2 FWD: 1.4
        # Total: 0.6 + 4.0 + 1.5 + 1.4 = 7.5
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(7.5, rel=0.01)

    def test_squad_xp_541_formation(self):
        """1 GK, 5 DEF, 4 MID, 1 FWD (defensive setup)."""
        picks = (
            [make_pick(player_id=0, element_type=GK, xg=0.0, xa=0.0, xga=1.0)]
            + [make_pick(player_id=i, element_type=DEF, xg=0.1, xa=0.1, xga=1.0) for i in range(1, 6)]
            + [make_pick(player_id=i, element_type=MID, xg=0.3, xa=0.2) for i in range(6, 10)]
            + [make_pick(player_id=10, element_type=FWD, xg=0.5, xa=0.2)]
        )
        # GK: 0.6, 5 DEF: 4.0, 4 MID: 2.0, 1 FWD: 0.7
        # Total: 0.6 + 4.0 + 2.0 + 0.7 = 7.3
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(7.3, rel=0.01)


class TestSquadXpFiltering:
    """Filtering tests for squad_xp."""

    def test_squad_xp_excludes_bench_players(self):
        """Multiplier=0 players should not be in starting XI."""
        picks = [
            make_pick(player_id=1, multiplier=1, xg=0.5, xa=0.2),
            make_pick(player_id=2, multiplier=0, xg=1.0, xa=0.5),  # bench
        ]
        # Only first player: 0.5 + 0.2 = 0.7
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(0.7, rel=0.01)

    def test_squad_xp_includes_all_players_during_bench_boost(self):
        """Bench Boost chip: all 15 players have multiplier >= 1."""
        picks = [
            make_pick(player_id=i, multiplier=1, xg=0.5, xa=0.2)
            for i in range(15)
        ]
        # 15 * 0.7 = 10.5
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(10.5, rel=0.01)

    def test_squad_xp_counts_captain_once_not_doubled(self):
        """Captain's xP not multiplied (we measure squad quality, not captain bonus)."""
        picks = [
            make_pick(player_id=1, is_captain=True, multiplier=2, xg=0.5, xa=0.2),
            make_pick(player_id=2, multiplier=1, xg=0.3, xa=0.1),
        ]
        # Captain: 0.7 (not doubled), Other: 0.4
        # Total: 1.1
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(1.1, rel=0.01)


class TestSquadXpEdgeCases:
    """Edge case tests for squad_xp."""

    def test_squad_xp_returns_none_for_empty_squad(self):
        """Empty input should return None."""
        result = calculate_squad_xp([])
        assert result is None

    def test_squad_xp_returns_none_when_all_xg_null(self):
        """All players missing xG data should return None."""
        picks = [
            make_pick(player_id=1, xg=None, xa=None),
            make_pick(player_id=2, xg=None, xa=None),
        ]
        result = calculate_squad_xp(picks)
        assert result is None

    def test_squad_xp_handles_partial_xg_data(self):
        """Some players have xG, others don't - use available data."""
        picks = [
            make_pick(player_id=1, xg=0.5, xa=0.2),
            make_pick(player_id=2, xg=None, xa=None),
        ]
        # Only first player: 0.7
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(0.7, rel=0.01)

    def test_squad_xp_handles_player_with_multiple_fixtures(self):
        """DGW: player has 2 fixtures should sum xGI from both."""
        picks = [
            make_pick(player_id=1, gameweek=1, xg=0.5, xa=0.2),
            make_pick(player_id=1, gameweek=1, xg=0.3, xa=0.1),  # second fixture
        ]
        # First: 0.7, Second: 0.4
        # Total: 1.1
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(1.1, rel=0.01)

    def test_squad_xp_uses_current_gw_data_only(self):
        """Only current GW fixtures, not historical."""
        picks = [
            make_pick(player_id=1, gameweek=1, xg=0.5, xa=0.2),
            make_pick(player_id=1, gameweek=2, xg=0.8, xa=0.3),
        ]
        # Both GWs included - this tests aggregation across multiple GWs
        # if filtering is needed, it should happen at query level
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(1.8, rel=0.01)


class TestSquadXpBoundary:
    """Boundary tests for squad_xp."""

    def test_squad_xp_zero_xg_returns_zero_not_none(self):
        """All players with xG=0, xA=0 should return 0.0, not None."""
        picks = [
            make_pick(player_id=1, xg=0.0, xa=0.0),
            make_pick(player_id=2, xg=0.0, xa=0.0),
        ]
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(0.0, rel=0.01)

    def test_squad_xp_very_high_xg_values(self):
        """Edge case: total xGI > 10 (unlikely but valid)."""
        picks = [
            make_pick(player_id=i, xg=1.5, xa=0.5)
            for i in range(11)
        ]
        # 11 * 2.0 = 22.0
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(22.0, rel=0.01)

    def test_squad_xp_negative_xcs_clamped_to_zero(self):
        """opponent_xG very high should have xCS = max(0, ...) not negative."""
        picks = [make_pick(element_type=DEF, xg=0.1, xa=0.1, xga=5.0)]
        # xCS = max(0, 1 - 5.0/2.5) = max(0, -1) = 0
        # xP = 0.1 + 0.1 + 0 = 0.2
        result = calculate_squad_xp(picks)
        assert result == pytest.approx(0.2, rel=0.01)
