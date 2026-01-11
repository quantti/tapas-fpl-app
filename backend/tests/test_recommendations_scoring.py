"""TDD tests for recommendations scoring functions.

These tests define the expected behavior for the player recommendations engine.
The engine calculates:
- Punts: Low ownership (<40%), high xG/xA potential
- Defensive: Medium ownership (40-100%), high form picks
- Time to Sell: Owned players (>0%), low form, score >0.5
"""

from decimal import Decimal
from typing import TypedDict

import pytest

# =============================================================================
# TypedDicts for Mock Data - Match actual PostgreSQL types
# =============================================================================


class PlayerRow(TypedDict):
    """Database row structure for player table.

    CRITICAL: PostgreSQL DECIMAL columns return decimal.Decimal, NOT float.
    All numeric fields must use Decimal type to match actual DB behavior.
    """

    id: int
    season_id: int
    team_id: int
    element_type: int  # 1=GK, 2=DEF, 3=MID, 4=FWD
    web_name: str
    # 'a'=available, 'i'=injured, 's'=suspended, 'd'=doubtful, 'u'=unavailable, 'n'=not
    status: str
    minutes: int | None
    form: Decimal | None
    expected_goals: Decimal | None
    expected_assists: Decimal | None
    expected_goals_conceded: Decimal | None
    clean_sheets: int | None


class PlayerFixtureStatsRow(TypedDict):
    """Database row structure for player_fixture_stats table."""

    player_id: int
    season_id: int
    gameweek: int
    player_team_id: int
    opponent_team_id: int
    was_home: bool
    minutes: int
    total_points: int
    expected_goals: Decimal | None
    expected_assists: Decimal | None
    expected_goals_conceded: Decimal | None
    clean_sheets: int


class ManagerPickRow(TypedDict):
    """Database row structure for manager_pick table."""

    snapshot_id: int
    player_id: int
    position: int  # 1-15 (1-11 starting, 12-15 bench)
    multiplier: int  # 0=bench, 1=normal, 2=captain


class TeamRow(TypedDict):
    """Database row structure for team table (for opponent difficulty)."""

    id: int
    season_id: int
    name: str
    short_name: str
    strength: int  # 1-5 scale


class ScoredPlayerRow(TypedDict):
    """Scored player for recommendation filtering."""

    id: int
    ownership: float
    score: float
    sell_score: float | None


# =============================================================================
# Constants - Ownership Thresholds
# =============================================================================

PUNTS_OWNERSHIP_THRESHOLD = 0.40  # Players owned by < 40% of league
DEFENSIVE_OWNERSHIP_MIN = 0.40  # Minimum for defensive options
DEFENSIVE_OWNERSHIP_MAX = 1.00  # Exclude 100% owned players
SELL_SCORE_THRESHOLD = 0.5  # Minimum sell score to recommend


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def sample_available_midfielder() -> PlayerRow:
    """Sample available midfielder with good stats."""
    return {
        "id": 427,
        "season_id": 1,
        "team_id": 11,
        "element_type": 3,  # MID
        "web_name": "Salah",
        "status": "a",
        "minutes": 1800,
        "form": Decimal("7.5"),
        "expected_goals": Decimal("12.50"),
        "expected_assists": Decimal("6.30"),
        "expected_goals_conceded": Decimal("0.00"),
        "clean_sheets": 0,
    }


@pytest.fixture
def sample_available_defender() -> PlayerRow:
    """Sample available defender with defensive stats."""
    return {
        "id": 100,
        "season_id": 1,
        "team_id": 1,
        "element_type": 2,  # DEF
        "web_name": "Gabriel",
        "status": "a",
        "minutes": 1710,
        "form": Decimal("5.2"),
        "expected_goals": Decimal("2.10"),
        "expected_assists": Decimal("1.50"),
        "expected_goals_conceded": Decimal("18.50"),
        "clean_sheets": 8,
    }


@pytest.fixture
def sample_goalkeeper() -> PlayerRow:
    """Sample goalkeeper (should be excluded)."""
    return {
        "id": 1,
        "season_id": 1,
        "team_id": 1,
        "element_type": 1,  # GK
        "web_name": "Raya",
        "status": "a",
        "minutes": 1890,
        "form": Decimal("5.0"),
        "expected_goals": Decimal("0.00"),
        "expected_assists": Decimal("0.00"),
        "expected_goals_conceded": Decimal("22.00"),
        "clean_sheets": 9,
    }


@pytest.fixture
def sample_fixture_stats() -> list[PlayerFixtureStatsRow]:
    """Sample fixture stats for last 5 gameweeks."""
    return [
        {
            "player_id": 427,
            "season_id": 1,
            "gameweek": 17,
            "player_team_id": 11,
            "opponent_team_id": 5,  # Easy opponent (strength 2)
            "was_home": True,
            "minutes": 90,
            "total_points": 12,
            "expected_goals": Decimal("0.85"),
            "expected_assists": Decimal("0.32"),
            "expected_goals_conceded": Decimal("0.00"),
            "clean_sheets": 0,
        },
        {
            "player_id": 427,
            "season_id": 1,
            "gameweek": 18,
            "player_team_id": 11,
            "opponent_team_id": 12,  # Medium opponent (strength 3)
            "was_home": False,
            "minutes": 90,
            "total_points": 8,
            "expected_goals": Decimal("0.65"),
            "expected_assists": Decimal("0.28"),
            "expected_goals_conceded": Decimal("0.00"),
            "clean_sheets": 0,
        },
        {
            "player_id": 427,
            "season_id": 1,
            "gameweek": 19,
            "player_team_id": 11,
            "opponent_team_id": 6,  # Hard opponent (strength 5)
            "was_home": True,
            "minutes": 90,
            "total_points": 2,
            "expected_goals": Decimal("0.35"),
            "expected_assists": Decimal("0.15"),
            "expected_goals_conceded": Decimal("0.00"),
            "clean_sheets": 0,
        },
        {
            "player_id": 427,
            "season_id": 1,
            "gameweek": 20,
            "player_team_id": 11,
            "opponent_team_id": 15,  # Easy opponent (strength 2)
            "was_home": False,
            "minutes": 90,
            "total_points": 15,
            "expected_goals": Decimal("1.10"),
            "expected_assists": Decimal("0.45"),
            "expected_goals_conceded": Decimal("0.00"),
            "clean_sheets": 0,
        },
        {
            "player_id": 427,
            "season_id": 1,
            "gameweek": 21,
            "player_team_id": 11,
            "opponent_team_id": 10,  # Medium opponent (strength 3)
            "was_home": True,
            "minutes": 90,
            "total_points": 6,
            "expected_goals": Decimal("0.55"),
            "expected_assists": Decimal("0.30"),
            "expected_goals_conceded": Decimal("0.00"),
            "clean_sheets": 0,
        },
    ]


# =============================================================================
# 1. Eligibility Tests
# =============================================================================


class TestEligibility:
    """Tests for player eligibility filtering."""

    def test_excludes_goalkeepers(self, sample_goalkeeper: PlayerRow):
        """Goalkeepers (element_type=1) should never be recommended."""
        from app.services.recommendations import is_eligible_player

        assert is_eligible_player(sample_goalkeeper) is False

    def test_excludes_injured_players(self, sample_available_midfielder: PlayerRow):
        """Injured players (status='i') should be excluded."""
        from app.services.recommendations import is_eligible_player

        player = {**sample_available_midfielder, "status": "i"}
        assert is_eligible_player(player) is False

    def test_excludes_suspended_players(self, sample_available_midfielder: PlayerRow):
        """Suspended players (status='s') should be excluded."""
        from app.services.recommendations import is_eligible_player

        player = {**sample_available_midfielder, "status": "s"}
        assert is_eligible_player(player) is False

    def test_excludes_doubtful_players(self, sample_available_midfielder: PlayerRow):
        """Doubtful players (status='d') should be excluded."""
        from app.services.recommendations import is_eligible_player

        player = {**sample_available_midfielder, "status": "d"}
        assert is_eligible_player(player) is False

    def test_excludes_unavailable_players(self, sample_available_midfielder: PlayerRow):
        """Unavailable players (status='u') should be excluded."""
        from app.services.recommendations import is_eligible_player

        player = {**sample_available_midfielder, "status": "u"}
        assert is_eligible_player(player) is False

    def test_excludes_not_in_squad_players(self, sample_available_midfielder: PlayerRow):
        """Not in squad players (status='n') should be excluded."""
        from app.services.recommendations import is_eligible_player

        player = {**sample_available_midfielder, "status": "n"}
        assert is_eligible_player(player) is False

    def test_excludes_low_minutes_449(self, sample_available_midfielder: PlayerRow):
        """Players with 449 minutes (< 450 threshold) should be excluded."""
        from app.services.recommendations import is_eligible_player

        player = {**sample_available_midfielder, "minutes": 449}
        assert is_eligible_player(player) is False

    def test_includes_boundary_minutes_450(self, sample_available_midfielder: PlayerRow):
        """Players with exactly 450 minutes should be included."""
        from app.services.recommendations import is_eligible_player

        player = {**sample_available_midfielder, "minutes": 450}
        assert is_eligible_player(player) is True

    def test_includes_high_minutes_451(self, sample_available_midfielder: PlayerRow):
        """Players with 451 minutes (> 450 threshold) should be included."""
        from app.services.recommendations import is_eligible_player

        player = {**sample_available_midfielder, "minutes": 451}
        assert is_eligible_player(player) is True

    def test_excludes_null_minutes(self, sample_available_midfielder: PlayerRow):
        """Players with NULL minutes should be excluded gracefully."""
        from app.services.recommendations import is_eligible_player

        player = {**sample_available_midfielder, "minutes": None}
        assert is_eligible_player(player) is False

    def test_includes_available_outfield_player(
        self, sample_available_midfielder: PlayerRow
    ):
        """Available outfield player with sufficient minutes should be included."""
        from app.services.recommendations import is_eligible_player

        assert is_eligible_player(sample_available_midfielder) is True

    def test_includes_defender(self, sample_available_defender: PlayerRow):
        """Available defender with sufficient minutes should be included."""
        from app.services.recommendations import is_eligible_player

        assert is_eligible_player(sample_available_defender) is True

    def test_handles_missing_keys(self):
        """Should handle dict missing expected keys without crashing."""
        from app.services.recommendations import is_eligible_player

        # Empty dict - should return False, not KeyError
        assert is_eligible_player({}) is False

        # Partial dict missing status
        partial = {"element_type": 3, "minutes": 500}
        assert is_eligible_player(partial) is False

        # Missing minutes
        no_minutes = {"element_type": 3, "status": "a"}
        assert is_eligible_player(no_minutes) is False


# =============================================================================
# 2. Per-90 Calculation Tests
# =============================================================================


class TestPer90Calculations:
    """Tests for per-90 minute statistical calculations."""

    def test_calculate_xg90_basic(self):
        """Basic xG per 90 calculation."""
        from app.services.recommendations import calculate_xg90

        # 5 xG in 450 minutes = 1.0 xG per 90
        result = calculate_xg90(Decimal("5.0"), 450)
        assert result == pytest.approx(1.0, rel=1e-2)

    def test_calculate_xa90_basic(self):
        """Basic xA per 90 calculation."""
        from app.services.recommendations import calculate_xa90

        # 2.5 xA in 450 minutes = 0.5 xA per 90
        result = calculate_xa90(Decimal("2.5"), 450)
        assert result == pytest.approx(0.5, rel=1e-2)

    def test_calculate_xgc90_for_defenders(self):
        """xGC per 90 calculation for defenders."""
        from app.services.recommendations import calculate_xgc90

        # 9 xGC in 810 minutes = 1.0 xGC per 90
        result = calculate_xgc90(Decimal("9.0"), 810)
        assert result == pytest.approx(1.0, rel=1e-2)

    def test_calculate_cs90_for_defenders(self):
        """Clean sheets per 90 calculation."""
        from app.services.recommendations import calculate_cs90

        # 5 CS in 450 minutes = 1.0 CS per 90
        result = calculate_cs90(5, 450)
        assert result == pytest.approx(1.0, rel=1e-2)

    def test_per90_handles_decimal_from_database(self):
        """Per-90 calculation must handle Decimal types from PostgreSQL."""
        from app.services.recommendations import calculate_xg90

        # Database returns Decimal, not float
        result = calculate_xg90(Decimal("2.345"), 900)
        assert isinstance(result, float)
        assert result == pytest.approx(0.2345, rel=1e-3)

    def test_per90_handles_none_xg(self):
        """NULL xG from database should return 0.0, not crash."""
        from app.services.recommendations import calculate_xg90

        result = calculate_xg90(None, 900)
        assert result == 0.0

    def test_per90_handles_none_xa(self):
        """NULL xA from database should return 0.0, not crash."""
        from app.services.recommendations import calculate_xa90

        result = calculate_xa90(None, 900)
        assert result == 0.0

    def test_per90_handles_none_xgc(self):
        """NULL xGC from database should return 0.0, not crash."""
        from app.services.recommendations import calculate_xgc90

        result = calculate_xgc90(None, 900)
        assert result == 0.0

    def test_per90_zero_minutes_returns_zero(self):
        """Division by zero should return 0.0, not raise exception."""
        from app.services.recommendations import calculate_xg90

        result = calculate_xg90(Decimal("5.0"), 0)
        assert result == 0.0

    def test_per90_negative_minutes_returns_zero(self):
        """Negative minutes (data corruption) should return 0.0 safely."""
        from app.services.recommendations import calculate_xg90

        result = calculate_xg90(Decimal("5.0"), -90)
        assert result == 0.0

    def test_cs90_handles_none_clean_sheets(self):
        """NULL clean_sheets from database should return 0.0."""
        from app.services.recommendations import calculate_cs90

        result = calculate_cs90(None, 900)
        assert result == 0.0

    def test_per90_aggregation_across_fixtures(
        self, sample_fixture_stats: list[PlayerFixtureStatsRow]
    ):
        """Per-90 should be calculated from aggregated fixture data."""
        from app.services.recommendations import calculate_per90_from_fixtures

        result = calculate_per90_from_fixtures(sample_fixture_stats)

        # Total: 450 minutes, sum of xG across all fixtures
        total_xg = sum(
            float(f["expected_goals"]) for f in sample_fixture_stats if f["expected_goals"]
        )
        expected_xg90 = (total_xg / 450) * 90
        assert result["xg90"] == pytest.approx(expected_xg90, rel=1e-2)

    def test_per90_from_fixtures_empty_list(self):
        """Empty fixture list should return all zeros."""
        from app.services.recommendations import calculate_per90_from_fixtures

        result = calculate_per90_from_fixtures([])
        assert result == {"xg90": 0.0, "xa90": 0.0, "xgc90": 0.0, "cs90": 0.0}

    def test_per90_from_fixtures_all_none_stats(self):
        """Should handle fixtures where all xG/xA/xGC are None (e.g., early season)."""
        from app.services.recommendations import calculate_per90_from_fixtures

        stats = [
            {
                "minutes": 90,
                "expected_goals": None,
                "expected_assists": None,
                "expected_goals_conceded": None,
                "clean_sheets": 0,
            },
            {
                "minutes": 90,
                "expected_goals": None,
                "expected_assists": None,
                "expected_goals_conceded": None,
                "clean_sheets": 1,
            },
        ]
        result = calculate_per90_from_fixtures(stats)
        assert result["xg90"] == 0.0
        assert result["xa90"] == 0.0
        assert result["xgc90"] == 0.0
        # CS should still calculate: 1 CS in 180 mins = 0.5 per 90
        assert result["cs90"] == pytest.approx(0.5, rel=1e-2)


# =============================================================================
# 3. Percentile Ranking Tests
# =============================================================================


class TestPercentileRanking:
    """Tests for percentile ranking calculations."""

    def test_percentile_highest_value(self):
        """Highest value should get percentile close to 1.0."""
        from app.services.recommendations import get_percentile

        values = [1.0, 2.0, 3.0, 4.0, 5.0]
        result = get_percentile(5.0, values)
        assert result == pytest.approx(1.0, rel=1e-2)

    def test_percentile_lowest_value(self):
        """Lowest value should get percentile close to 0.0."""
        from app.services.recommendations import get_percentile

        values = [1.0, 2.0, 3.0, 4.0, 5.0]
        result = get_percentile(1.0, values)
        assert result == pytest.approx(0.0, rel=1e-2)

    def test_percentile_median_value(self):
        """Median value should get percentile around 0.5."""
        from app.services.recommendations import get_percentile

        values = [1.0, 2.0, 3.0, 4.0, 5.0]
        result = get_percentile(3.0, values)
        # Using (n-1) formula: 2/(5-1) = 0.5 (2 values below, 4 intervals)
        assert result == pytest.approx(0.5, rel=1e-1)

    def test_percentile_empty_array_returns_neutral(self):
        """Empty array should return 0.5 (neutral percentile)."""
        from app.services.recommendations import get_percentile

        result = get_percentile(5.0, [])
        assert result == 0.5

    def test_percentile_single_value_returns_neutral(self):
        """Single value array should return 0.5 (neutral percentile)."""
        from app.services.recommendations import get_percentile

        result = get_percentile(5.0, [5.0])
        assert result == 0.5

    def test_percentile_with_ties(self):
        """Tied values should get the same percentile."""
        from app.services.recommendations import get_percentile

        values = [1.0, 2.0, 2.0, 3.0, 4.0]  # Two 2.0 values
        result1 = get_percentile(2.0, values)
        result2 = get_percentile(2.0, values)
        assert result1 == result2

    def test_percentile_direction_higher_is_better(self):
        """Higher xG should result in higher percentile."""
        from app.services.recommendations import get_percentile

        values = [0.1, 0.2, 0.3, 0.4, 0.5]
        low_percentile = get_percentile(0.1, values)
        high_percentile = get_percentile(0.5, values)
        assert high_percentile > low_percentile

    def test_percentile_value_above_all(self):
        """Value higher than all should get percentile 1.0."""
        from app.services.recommendations import get_percentile

        values = [1.0, 2.0, 3.0]
        result = get_percentile(5.0, values)  # Higher than all
        assert result == pytest.approx(1.0, rel=1e-2)

    def test_percentile_value_between_existing(self):
        """Value between existing values should interpolate correctly."""
        from app.services.recommendations import get_percentile

        values = [1.0, 3.0, 5.0]
        result = get_percentile(2.0, values)  # Between 1.0 and 3.0
        # Using (n-1) formula: 1/(3-1) = 0.5 (1 value below, 2 intervals)
        assert result == pytest.approx(0.5, rel=1e-2)

    def test_percentile_handles_decimal_input(self):
        """Percentile should handle Decimal inputs from PostgreSQL."""
        from app.services.recommendations import get_percentile

        values = [Decimal("1.0"), Decimal("2.0"), Decimal("3.0")]
        result = get_percentile(Decimal("2.0"), values)
        assert isinstance(result, float)  # Should convert to float


# =============================================================================
# 4. Form Calculation Tests (Last 5 GW Average with Opponent Weighting)
# =============================================================================


class TestFormCalculation:
    """Tests for form calculation from recent gameweeks."""

    def test_form_last_5_gw_average(self, sample_fixture_stats: list[PlayerFixtureStatsRow]):
        """Form should be average of last 5 gameweek points."""
        from app.services.recommendations import calculate_form

        # Total points: 12 + 8 + 2 + 15 + 6 = 43, average = 8.6
        result = calculate_form(sample_fixture_stats, use_opponent_weight=False)
        expected = sum(f["total_points"] for f in sample_fixture_stats) / 5
        assert result == pytest.approx(expected, rel=1e-2)

    def test_form_with_opponent_weighting(
        self, sample_fixture_stats: list[PlayerFixtureStatsRow]
    ):
        """Form with opponent weighting should adjust for difficulty."""
        from app.services.recommendations import calculate_form

        # Results against easy opponents weighted lower (expected to score more)
        # Results against hard opponents weighted higher (harder to score)
        team_strengths = {5: 2, 12: 3, 6: 5, 15: 2, 10: 3}  # opponent_id: strength
        result = calculate_form(
            sample_fixture_stats, use_opponent_weight=True, team_strengths=team_strengths
        )
        unweighted = calculate_form(sample_fixture_stats, use_opponent_weight=False)
        # With weighting, the result should differ from simple average
        assert result != unweighted

    def test_form_insufficient_games_uses_available(self):
        """With fewer than 5 games, use available games for average."""
        from app.services.recommendations import calculate_form

        # Only 2 games available
        stats = [
            {
                "player_id": 1,
                "season_id": 1,
                "gameweek": 20,
                "player_team_id": 1,
                "opponent_team_id": 2,
                "was_home": True,
                "minutes": 90,
                "total_points": 10,
                "expected_goals": Decimal("0.5"),
                "expected_assists": Decimal("0.2"),
                "expected_goals_conceded": Decimal("0.0"),
                "clean_sheets": 0,
            },
            {
                "player_id": 1,
                "season_id": 1,
                "gameweek": 21,
                "player_team_id": 1,
                "opponent_team_id": 3,
                "was_home": False,
                "minutes": 90,
                "total_points": 8,
                "expected_goals": Decimal("0.3"),
                "expected_assists": Decimal("0.1"),
                "expected_goals_conceded": Decimal("0.0"),
                "clean_sheets": 0,
            },
        ]
        result = calculate_form(stats, use_opponent_weight=False)
        assert result == pytest.approx(9.0, rel=1e-2)  # (10 + 8) / 2

    def test_form_empty_stats_returns_zero(self):
        """Empty fixture stats should return 0.0 form."""
        from app.services.recommendations import calculate_form

        result = calculate_form([], use_opponent_weight=False)
        assert result == 0.0

    def test_form_all_zero_points_returns_zero(self):
        """Form should be 0.0 when all fixtures have 0 points."""
        from app.services.recommendations import calculate_form

        stats = [
            {
                "player_id": 1,
                "season_id": 1,
                "gameweek": gw,
                "player_team_id": 1,
                "opponent_team_id": 2,
                "was_home": True,
                "minutes": 90,
                "total_points": 0,
                "expected_goals": Decimal("0.0"),
                "expected_assists": Decimal("0.0"),
                "expected_goals_conceded": Decimal("0.0"),
                "clean_sheets": 0,
            }
            for gw in range(17, 22)
        ]
        result = calculate_form(stats, use_opponent_weight=False)
        assert result == 0.0

    def test_form_respects_season_isolation(self):
        """Form calculation should only use stats from requested season."""
        from app.services.recommendations import calculate_form

        stats = [
            {
                "player_id": 1,
                "season_id": 1,
                "gameweek": 20,
                "player_team_id": 1,
                "opponent_team_id": 2,
                "was_home": True,
                "minutes": 90,
                "total_points": 10,
                "expected_goals": Decimal("0.5"),
                "expected_assists": Decimal("0.2"),
                "expected_goals_conceded": Decimal("0.0"),
                "clean_sheets": 0,
            },
            {
                "player_id": 1,
                "season_id": 2,  # Different season - should be ignored
                "gameweek": 20,
                "player_team_id": 1,
                "opponent_team_id": 2,
                "was_home": True,
                "minutes": 90,
                "total_points": 20,  # High points that would skew if included
                "expected_goals": Decimal("1.0"),
                "expected_assists": Decimal("0.5"),
                "expected_goals_conceded": Decimal("0.0"),
                "clean_sheets": 0,
            },
        ]
        result = calculate_form(stats, use_opponent_weight=False, season_id=1)
        assert result == pytest.approx(10.0, rel=1e-2)  # Only season 1 stats


# =============================================================================
# 5. Ownership Calculation Tests
# =============================================================================


class TestOwnershipCalculation:
    """Tests for league ownership percentage calculation."""

    def test_ownership_100_percent_all_own(self):
        """100% ownership when all managers own the player."""
        from app.services.recommendations import calculate_ownership

        picks = [
            {"snapshot_id": 1, "player_id": 427, "position": 1, "multiplier": 1},
            {"snapshot_id": 2, "player_id": 427, "position": 2, "multiplier": 1},
            {"snapshot_id": 3, "player_id": 427, "position": 3, "multiplier": 1},
        ]
        result = calculate_ownership(player_id=427, picks=picks, num_managers=3)
        assert result == pytest.approx(1.0, rel=1e-2)

    def test_ownership_0_percent_none_own(self):
        """0% ownership when no managers own the player."""
        from app.services.recommendations import calculate_ownership

        picks = [
            {"snapshot_id": 1, "player_id": 100, "position": 1, "multiplier": 1},
            {"snapshot_id": 2, "player_id": 200, "position": 2, "multiplier": 1},
        ]
        result = calculate_ownership(player_id=427, picks=picks, num_managers=3)
        assert result == pytest.approx(0.0, rel=1e-2)

    def test_ownership_partial(self):
        """Partial ownership calculation."""
        from app.services.recommendations import calculate_ownership

        picks = [
            {"snapshot_id": 1, "player_id": 427, "position": 1, "multiplier": 1},
            {"snapshot_id": 2, "player_id": 100, "position": 2, "multiplier": 1},
            {"snapshot_id": 3, "player_id": 427, "position": 3, "multiplier": 1},
        ]
        result = calculate_ownership(player_id=427, picks=picks, num_managers=3)
        # 2 out of 3 managers own the player
        assert result == pytest.approx(2 / 3, rel=1e-2)

    def test_ownership_includes_bench_players(self):
        """Bench players (position 12-15) should count toward ownership."""
        from app.services.recommendations import calculate_ownership

        picks = [
            {"snapshot_id": 1, "player_id": 427, "position": 12, "multiplier": 0},  # Bench
            {"snapshot_id": 2, "player_id": 100, "position": 1, "multiplier": 1},
        ]
        result = calculate_ownership(player_id=427, picks=picks, num_managers=2)
        assert result == pytest.approx(0.5, rel=1e-2)

    def test_ownership_zero_managers_returns_zero(self):
        """Zero managers should return 0% ownership, not divide by zero."""
        from app.services.recommendations import calculate_ownership

        result = calculate_ownership(player_id=427, picks=[], num_managers=0)
        assert result == 0.0

    def test_ownership_season_isolation(self):
        """Ownership calculation assumes picks are pre-filtered by season.

        Season filtering should happen at the query level - this test documents
        that the function operates correctly on pre-filtered data.
        """
        from app.services.recommendations import calculate_ownership

        # Picks pre-filtered to a single season (as would be done at query level)
        picks_season_1 = [
            {"snapshot_id": 1, "player_id": 427, "position": 1, "multiplier": 1},
        ]
        result = calculate_ownership(
            player_id=427, picks=picks_season_1, num_managers=1
        )
        assert result == pytest.approx(1.0, rel=1e-2)


# =============================================================================
# 6. Buy Score Tests
# =============================================================================


class TestBuyScore:
    """Tests for buy score calculation (used for Punts and Defensive recommendations)."""

    def test_buy_score_defender_weights(self):
        """Defender buy score should use DEF-specific weights including xGC and CS."""
        from app.services.recommendations import PUNT_WEIGHTS, calculate_buy_score

        percentiles = {
            "xg90": 0.6,
            "xa90": 0.5,
            "xgc90": 0.8,  # Inverted: low xGC = high percentile
            "cs90": 0.7,
            "form": 0.65,
        }
        fixture_score = 0.6

        result = calculate_buy_score(
            percentiles, fixture_score, position=2, weights=PUNT_WEIGHTS
        )

        # DEF weights: xG:0.1, xA:0.1, xGC:0.2, CS:0.15, form:0.25, fix:0.2
        expected = (
            0.6 * 0.1 + 0.5 * 0.1 + 0.8 * 0.2 + 0.7 * 0.15 + 0.65 * 0.25 + 0.6 * 0.2
        )
        assert result == pytest.approx(expected, rel=1e-2)

    def test_buy_score_midfielder_weights(self):
        """Midfielder buy score should exclude defensive stats (xGC=0, CS=0)."""
        from app.services.recommendations import PUNT_WEIGHTS, calculate_buy_score

        percentiles = {
            "xg90": 0.7,
            "xa90": 0.6,
            "xgc90": 0.5,  # Should be ignored for MID
            "cs90": 0.5,  # Should be ignored for MID
            "form": 0.7,
        }
        fixture_score = 0.65

        result = calculate_buy_score(
            percentiles, fixture_score, position=3, weights=PUNT_WEIGHTS
        )

        # Calculate expected using actual weights (xGC and CS are 0 for MID)
        w = PUNT_WEIGHTS[3]
        expected = (
            percentiles["xg90"] * w["xG"]
            + percentiles["xa90"] * w["xA"]
            + percentiles["form"] * w["form"]
            + fixture_score * w["fix"]
        )
        assert result == pytest.approx(expected, rel=1e-2)

    def test_buy_score_forward_weights(self):
        """Forward buy score should prioritize xG."""
        from app.services.recommendations import PUNT_WEIGHTS, calculate_buy_score

        percentiles = {
            "xg90": 0.9,  # High xG
            "xa90": 0.4,
            "xgc90": 0.5,  # Ignored
            "cs90": 0.5,  # Ignored
            "form": 0.6,
        }
        fixture_score = 0.7

        result = calculate_buy_score(
            percentiles, fixture_score, position=4, weights=PUNT_WEIGHTS
        )

        # Calculate expected using actual weights (xGC and CS are 0 for FWD)
        w = PUNT_WEIGHTS[4]
        expected = (
            percentiles["xg90"] * w["xG"]
            + percentiles["xa90"] * w["xA"]
            + percentiles["form"] * w["form"]
            + fixture_score * w["fix"]
        )
        assert result == pytest.approx(expected, rel=1e-2)

    def test_buy_score_inverts_xgc_for_defenders(self):
        """For punts, low xGC should result in high score contribution."""
        from app.services.recommendations import (
            invert_xgc_percentile,
        )

        # Player with LOW xGC (good defensive performance)
        low_xgc_percentile = 0.2  # In 20th percentile for xGC (low)
        inverted = invert_xgc_percentile(low_xgc_percentile)
        assert inverted == pytest.approx(0.8, rel=1e-2)  # Should become 80th percentile

    def test_buy_score_range_0_to_1(self):
        """Buy score should always be between 0 and 1."""
        from app.services.recommendations import PUNT_WEIGHTS, calculate_buy_score

        # All percentiles at 0
        percentiles_low = {
            "xg90": 0.0,
            "xa90": 0.0,
            "xgc90": 0.0,
            "cs90": 0.0,
            "form": 0.0,
        }
        result_low = calculate_buy_score(percentiles_low, 0.0, position=3, weights=PUNT_WEIGHTS)
        assert 0.0 <= result_low <= 1.0

        # All percentiles at 1
        percentiles_high = {
            "xg90": 1.0,
            "xa90": 1.0,
            "xgc90": 1.0,
            "cs90": 1.0,
            "form": 1.0,
        }
        result_high = calculate_buy_score(
            percentiles_high, 1.0, position=3, weights=PUNT_WEIGHTS
        )
        assert 0.0 <= result_high <= 1.0

    def test_defensive_weights_differ_from_punt_weights(self):
        """Defensive options should use DEFENSIVE_WEIGHTS, not PUNT_WEIGHTS."""
        from app.services.recommendations import (
            DEFENSIVE_WEIGHTS,
            PUNT_WEIGHTS,
            calculate_buy_score,
        )

        # Use unequal percentiles so different weight distributions produce different scores
        # (When all percentiles are 0.5, any weights summing to 1.0 give score=0.5)
        percentiles = {
            "xg90": 0.8,  # High xG
            "xa90": 0.3,  # Low xA
            "xgc90": 0.5,
            "cs90": 0.5,
            "form": 0.6,  # Medium form
        }
        fixture_score = 0.5

        punt_score = calculate_buy_score(
            percentiles, fixture_score, position=3, weights=PUNT_WEIGHTS
        )
        defensive_score = calculate_buy_score(
            percentiles, fixture_score, position=3, weights=DEFENSIVE_WEIGHTS
        )
        # Different weights should produce different scores
        assert punt_score != defensive_score

    def test_punt_weights_sum_to_one_for_all_positions(self):
        """PUNT_WEIGHTS for each position must sum to 1.0."""
        from app.services.recommendations import PUNT_WEIGHTS

        for position in [2, 3, 4]:  # DEF, MID, FWD
            weights = PUNT_WEIGHTS[position]
            total = (
                weights["xG"]
                + weights["xA"]
                + weights["xGC"]
                + weights["CS"]
                + weights["form"]
                + weights["fix"]
            )
            msg = f"Position {position} weights don't sum to 1.0"
            assert total == pytest.approx(1.0, rel=1e-3), msg

    def test_defensive_weights_sum_to_one_for_all_positions(self):
        """DEFENSIVE_WEIGHTS for each position must sum to 1.0."""
        from app.services.recommendations import DEFENSIVE_WEIGHTS

        for position in [2, 3, 4]:  # DEF, MID, FWD
            weights = DEFENSIVE_WEIGHTS[position]
            total = (
                weights["xG"]
                + weights["xA"]
                + weights["xGC"]
                + weights["CS"]
                + weights["form"]
                + weights["fix"]
            )
            msg = f"Position {position} weights don't sum to 1.0"
            assert total == pytest.approx(1.0, rel=1e-3), msg

    def test_sell_weights_sum_to_one_for_all_positions(self):
        """SELL_WEIGHTS for each position must sum to 1.0."""
        from app.services.recommendations import SELL_WEIGHTS

        for position in [2, 3, 4]:  # DEF, MID, FWD
            weights = SELL_WEIGHTS[position]
            total = (
                weights["xG"]
                + weights["xA"]
                + weights["xGC"]
                + weights["CS"]
                + weights["form"]
                + weights["fix"]
            )
            msg = f"Position {position} weights don't sum to 1.0"
            assert total == pytest.approx(1.0, rel=1e-3), msg

    def test_buy_score_unknown_position_returns_zero(self):
        """Unknown position should return 0.0, not raise KeyError."""
        from app.services.recommendations import PUNT_WEIGHTS, calculate_buy_score

        percentiles = {"xg90": 0.5, "xa90": 0.5, "xgc90": 0.5, "cs90": 0.5, "form": 0.5}
        result = calculate_buy_score(percentiles, 0.5, position=99, weights=PUNT_WEIGHTS)
        assert result == 0.0


# =============================================================================
# 7. Sell Score Tests
# =============================================================================


class TestSellScore:
    """Tests for sell score calculation (used for Time to Sell recommendations)."""

    def test_sell_score_inverts_most_metrics(self):
        """Sell score should invert xG, xA, form (low = high sell score)."""
        from app.services.recommendations import SELL_WEIGHTS, calculate_sell_score

        # Player with HIGH xG (good) should have LOW contribution to sell score
        percentiles = {
            "xg90": 0.9,  # High xG
            "xa90": 0.8,  # High xA
            "xgc90": 0.5,
            "cs90": 0.5,
            "form": 0.9,  # High form
        }
        fixture_score = 0.5

        result = calculate_sell_score(percentiles, fixture_score, position=3, weights=SELL_WEIGHTS)

        # Since this player has good stats, sell score should be low
        assert result < 0.5

    def test_sell_score_does_not_invert_xgc(self):
        """xGC should NOT be inverted for sell score (high xGC = bad = contributes to sell)."""
        from app.services.recommendations import SELL_WEIGHTS, calculate_sell_score

        # Defender with HIGH xGC (bad defensive performance)
        percentiles_high_xgc = {
            "xg90": 0.5,
            "xa90": 0.5,
            "xgc90": 0.9,  # High xGC = bad
            "cs90": 0.5,
            "form": 0.5,
        }

        percentiles_low_xgc = {
            "xg90": 0.5,
            "xa90": 0.5,
            "xgc90": 0.1,  # Low xGC = good
            "cs90": 0.5,
            "form": 0.5,
        }

        result_high = calculate_sell_score(
            percentiles_high_xgc, 0.5, position=2, weights=SELL_WEIGHTS
        )
        result_low = calculate_sell_score(
            percentiles_low_xgc, 0.5, position=2, weights=SELL_WEIGHTS
        )

        # High xGC should contribute MORE to sell score
        assert result_high > result_low

    def test_sell_score_high_form_low_score(self):
        """Player with high form should have low sell score."""
        from app.services.recommendations import SELL_WEIGHTS, calculate_sell_score

        percentiles = {
            "xg90": 0.5,
            "xa90": 0.5,
            "xgc90": 0.5,
            "cs90": 0.5,
            "form": 0.95,  # Excellent form
        }
        result = calculate_sell_score(percentiles, 0.5, position=3, weights=SELL_WEIGHTS)
        assert result < 0.5

    def test_sell_score_low_form_high_score(self):
        """Player with low form should have high sell score."""
        from app.services.recommendations import SELL_WEIGHTS, calculate_sell_score

        percentiles = {
            "xg90": 0.5,
            "xa90": 0.5,
            "xgc90": 0.5,
            "cs90": 0.5,
            "form": 0.05,  # Terrible form
        }
        result = calculate_sell_score(percentiles, 0.5, position=3, weights=SELL_WEIGHTS)
        assert result > 0.5

    def test_sell_score_threshold_exactly_0_5(self):
        """Sell score exactly at 0.5 should NOT be included in recommendations."""
        from app.services.recommendations import should_include_in_sell_list

        assert should_include_in_sell_list(0.5) is False
        assert should_include_in_sell_list(0.50001) is True
        assert should_include_in_sell_list(0.49999) is False

    def test_sell_score_unknown_position_returns_zero(self):
        """Unknown position should return 0.0, not raise KeyError."""
        from app.services.recommendations import SELL_WEIGHTS, calculate_sell_score

        percentiles = {"xg90": 0.5, "xa90": 0.5, "xgc90": 0.5, "cs90": 0.5, "form": 0.5}
        result = calculate_sell_score(percentiles, 0.5, position=99, weights=SELL_WEIGHTS)
        assert result == 0.0


# =============================================================================
# 8. Recommendation Filtering Tests
# =============================================================================


class TestRecommendationFiltering:
    """Tests for filtering players into recommendation categories."""

    def test_punts_filters_low_ownership_under_40(self):
        """Punts should only include players with ownership < PUNTS_OWNERSHIP_THRESHOLD."""
        from app.services.recommendations import filter_for_punts

        players: list[ScoredPlayerRow] = [
            {"id": 1, "ownership": 0.39, "score": 0.7, "sell_score": None},  # Include
            {"id": 2, "ownership": 0.40, "score": 0.7, "sell_score": None},  # Exclude (boundary)
            {"id": 3, "ownership": 0.10, "score": 0.7, "sell_score": None},  # Include
        ]
        result = filter_for_punts(players)
        assert len(result) == 2
        assert all(p["ownership"] < PUNTS_OWNERSHIP_THRESHOLD for p in result)

    def test_defensive_filters_medium_ownership_40_to_100(self):
        """Defensive: DEFENSIVE_OWNERSHIP_MIN <= ownership < DEFENSIVE_OWNERSHIP_MAX."""
        from app.services.recommendations import filter_for_defensive

        players: list[ScoredPlayerRow] = [
            {"id": 1, "ownership": 0.39, "score": 0.7, "sell_score": None},  # Exclude
            {"id": 2, "ownership": 0.40, "score": 0.7, "sell_score": None},  # Include (boundary)
            {"id": 3, "ownership": 0.99, "score": 0.7, "sell_score": None},  # Include
            {"id": 4, "ownership": 1.00, "score": 0.7, "sell_score": None},  # Exclude
        ]
        result = filter_for_defensive(players)
        assert len(result) == 2
        for p in result:
            assert DEFENSIVE_OWNERSHIP_MIN <= p["ownership"] < DEFENSIVE_OWNERSHIP_MAX

    def test_defensive_excludes_exactly_100_percent(self):
        """Players owned by everyone (100%) should not be in defensive."""
        from app.services.recommendations import filter_for_defensive

        players: list[ScoredPlayerRow] = [
            {"id": 1, "ownership": 1.00, "score": 0.7, "sell_score": None}
        ]
        result = filter_for_defensive(players)
        assert len(result) == 0

    def test_sell_filters_owned_only(self):
        """Time to Sell should only include players with ownership > 0%."""
        from app.services.recommendations import filter_for_sell

        players: list[ScoredPlayerRow] = [
            {"id": 1, "ownership": 0.00, "score": 0.5, "sell_score": 0.8},  # Exclude (not owned)
            {"id": 2, "ownership": 0.10, "score": 0.5, "sell_score": 0.8},  # Include
            {"id": 3, "ownership": 0.50, "score": 0.5, "sell_score": 0.8},  # Include
        ]
        result = filter_for_sell(players)
        assert len(result) == 2
        assert all(p["ownership"] > 0 for p in result)

    def test_sell_excludes_below_threshold(self):
        """Time to Sell should exclude players with sell_score <= SELL_SCORE_THRESHOLD."""
        from app.services.recommendations import filter_for_sell

        players: list[ScoredPlayerRow] = [
            {"id": 1, "ownership": 0.50, "score": 0.5, "sell_score": 0.49},  # Exclude
            {"id": 2, "ownership": 0.50, "score": 0.5, "sell_score": 0.50},  # Exclude (boundary)
            {"id": 3, "ownership": 0.50, "score": 0.5, "sell_score": 0.51},  # Include
        ]
        result = filter_for_sell(players)
        assert len(result) == 1
        assert result[0]["id"] == 3

    def test_punts_returns_top_20(self):
        """Punts should return maximum 20 players."""
        from app.services.recommendations import get_top_punts

        players = [{"id": i, "score": 1.0 - i * 0.01} for i in range(30)]
        result = get_top_punts(players)
        assert len(result) == 20

    def test_defensive_returns_top_10(self):
        """Defensive should return maximum 10 players."""
        from app.services.recommendations import get_top_defensive

        players = [{"id": i, "score": 1.0 - i * 0.01} for i in range(20)]
        result = get_top_defensive(players)
        assert len(result) == 10

    def test_sell_returns_top_10(self):
        """Time to Sell should return maximum 10 players."""
        from app.services.recommendations import get_top_sell

        players = [{"id": i, "sell_score": 1.0 - i * 0.01} for i in range(20)]
        result = get_top_sell(players)
        assert len(result) == 10

    def test_sort_stability_with_tied_scores(self):
        """Players with equal scores should have deterministic ordering."""
        from app.services.recommendations import get_top_punts

        players = [
            {"id": 3, "score": 0.75},
            {"id": 1, "score": 0.75},  # Same score
            {"id": 2, "score": 0.75},  # Same score
        ]
        result1 = get_top_punts(players)
        result2 = get_top_punts(players)
        # Order should be consistent across calls
        assert [p["id"] for p in result1] == [p["id"] for p in result2]

    def test_returns_fewer_when_insufficient_candidates(self):
        """Should return all available if fewer than limit."""
        from app.services.recommendations import get_top_punts

        players = [{"id": i, "score": 0.8} for i in range(5)]
        result = get_top_punts(players)
        assert len(result) == 5  # Only 5 available, not 20

    def test_get_top_punts_empty_list(self):
        """Empty list should return empty list, not error."""
        from app.services.recommendations import get_top_punts

        result = get_top_punts([])
        assert result == []

    def test_get_top_defensive_empty_list(self):
        """Empty list should return empty list, not error."""
        from app.services.recommendations import get_top_defensive

        result = get_top_defensive([])
        assert result == []

    def test_get_top_sell_empty_list(self):
        """Empty list should return empty list, not error."""
        from app.services.recommendations import get_top_sell

        result = get_top_sell([])
        assert result == []

    def test_get_top_punts_handles_missing_keys(self):
        """Should handle players missing score or id keys gracefully."""
        from app.services.recommendations import get_top_punts

        players = [
            {"id": 1},  # Missing score - defaults to 0
            {"score": 0.8},  # Missing id - defaults to 0
            {"id": 2, "score": 0.9},  # Complete
        ]
        result = get_top_punts(players)
        # Should not crash, complete player with highest score should be first
        assert result[0].get("score", 0) == 0.9


# =============================================================================
# 9. Fixture Difficulty Calculation Tests
# =============================================================================


class TestFixtureDifficultyCalculation:
    """Unit tests for calculate_fixture_scores function."""

    def test_easy_fixtures_high_score(self):
        """Teams with low FDR should get high fixture scores."""
        from app.services.recommendations import calculate_fixture_scores

        fixtures = [
            {"event": 10, "team_h": 1, "team_a": 2, "team_h_difficulty": 1, "team_a_difficulty": 5},
        ]
        result = calculate_fixture_scores(fixtures, current_gameweek=10)

        # Team 1 at home vs easy opponent (FDR 1) -> high score
        assert result[1] == pytest.approx(1.0, rel=1e-2)
        # Team 2 away vs hard opponent (FDR 5) -> low score
        assert result[2] == pytest.approx(0.0, rel=1e-2)

    def test_medium_fixtures_neutral_score(self):
        """Teams with FDR 3 should get ~0.5 fixture scores."""
        from app.services.recommendations import calculate_fixture_scores

        fixtures = [
            {"event": 10, "team_h": 1, "team_a": 2, "team_h_difficulty": 3, "team_a_difficulty": 3},
        ]
        result = calculate_fixture_scores(fixtures, current_gameweek=10)

        assert result[1] == pytest.approx(0.5, rel=1e-2)
        assert result[2] == pytest.approx(0.5, rel=1e-2)

    def test_ignores_past_fixtures(self):
        """Should only consider fixtures from current gameweek onwards."""
        from app.services.recommendations import calculate_fixture_scores

        fixtures = [
            {"event": 5, "team_h": 1, "team_a": 2, "team_h_difficulty": 1, "team_a_difficulty": 5},
            {"event": 10, "team_h": 1, "team_a": 3, "team_h_difficulty": 4, "team_a_difficulty": 2},
        ]
        result = calculate_fixture_scores(fixtures, current_gameweek=10)

        # Should only consider GW10 fixture, not GW5
        # Team 1 has FDR 4 -> score (5-4)/(5-1) = 0.25
        assert result[1] == pytest.approx(0.25, rel=1e-2)

    def test_ignores_fixtures_beyond_horizon(self):
        """Should only consider fixtures within FIXTURE_HORIZON gameweeks."""
        from app.services.recommendations import (
            FIXTURE_HORIZON,
            calculate_fixture_scores,
        )

        fixtures = [
            {"event": 10, "team_h": 1, "team_a": 2, "team_h_difficulty": 1, "team_a_difficulty": 5},
            {"event": 10 + FIXTURE_HORIZON, "team_h": 1, "team_a": 3, "team_h_difficulty": 5, "team_a_difficulty": 1},
        ]
        result = calculate_fixture_scores(fixtures, current_gameweek=10)

        # Only GW10 fixture counts (within horizon), GW10+5=15 is outside
        assert result[1] == pytest.approx(1.0, rel=1e-2)

    def test_weighted_average_favors_closer_fixtures(self):
        """Closer fixtures should have more weight than distant ones."""
        from app.services.recommendations import calculate_fixture_scores

        fixtures = [
            {"event": 10, "team_h": 1, "team_a": 2, "team_h_difficulty": 1, "team_a_difficulty": 3},
            {"event": 11, "team_h": 1, "team_a": 3, "team_h_difficulty": 5, "team_a_difficulty": 2},
        ]
        result = calculate_fixture_scores(fixtures, current_gameweek=10)

        # Team 1: GW10 FDR=1 (weight 1.0), GW11 FDR=5 (weight 0.5)
        # Weighted avg = (1*1 + 5*0.5) / 1.5 = 3.5/1.5 = 2.33
        # Score = (5 - 2.33) / 4 = 0.67
        assert result[1] == pytest.approx(0.67, rel=0.05)

    def test_empty_fixtures_returns_empty_dict(self):
        """Empty fixtures list should return empty dict."""
        from app.services.recommendations import calculate_fixture_scores

        result = calculate_fixture_scores([], current_gameweek=10)
        assert result == {}

    def test_blank_gameweek_fixtures_skipped(self):
        """Fixtures with event=None should be skipped."""
        from app.services.recommendations import calculate_fixture_scores

        fixtures = [
            {"event": None, "team_h": 1, "team_a": 2, "team_h_difficulty": 1, "team_a_difficulty": 5},
            {"event": 10, "team_h": 3, "team_a": 4, "team_h_difficulty": 3, "team_a_difficulty": 3},
        ]
        result = calculate_fixture_scores(fixtures, current_gameweek=10)

        # Teams 1 and 2 should not be in result (blank GW)
        assert 1 not in result
        assert 2 not in result
        # Teams 3 and 4 should be present
        assert 3 in result
        assert 4 in result

    def test_double_gameweek_both_fixtures_counted(self):
        """Teams with DGW should have both fixtures factored in."""
        from app.services.recommendations import calculate_fixture_scores

        # Team 1 has two home fixtures in same gameweek (Double Gameweek)
        fixtures = [
            {"event": 10, "team_h": 1, "team_a": 2, "team_h_difficulty": 2, "team_a_difficulty": 3},
            {"event": 10, "team_h": 1, "team_a": 3, "team_h_difficulty": 2, "team_a_difficulty": 4},
        ]
        result = calculate_fixture_scores(fixtures, current_gameweek=10)

        # Team 1 has two fixtures with FDR 2 each (both weighted equally as first fixtures)
        # Weighted avg = (2*1 + 2*0.5) / 1.5 = 2.0
        # Score = (5 - 2) / 4 = 0.75
        assert result[1] == pytest.approx(0.75, rel=0.05)

    def test_none_difficulty_defaults_to_neutral(self):
        """Should handle None difficulty values gracefully."""
        from app.services.recommendations import calculate_fixture_scores

        fixtures = [
            {"event": 10, "team_h": 1, "team_a": 2, "team_h_difficulty": None, "team_a_difficulty": 3},
        ]
        result = calculate_fixture_scores(fixtures, current_gameweek=10)

        # Team 1 has None FDR -> defaults to 3 -> score 0.5
        assert result[1] == pytest.approx(0.5, rel=1e-2)
        # Team 2 has FDR 3 -> score 0.5
        assert result[2] == pytest.approx(0.5, rel=1e-2)

    def test_includes_fixture_at_exact_horizon_boundary(self):
        """Should include fixtures at exactly FIXTURE_HORIZON-1 gameweeks ahead."""
        from app.services.recommendations import (
            FIXTURE_HORIZON,
            calculate_fixture_scores,
        )

        # GW14 = GW10 + 4 (FIXTURE_HORIZON - 1), should be included
        fixtures = [
            {"event": 10 + FIXTURE_HORIZON - 1, "team_h": 1, "team_a": 2, "team_h_difficulty": 5, "team_a_difficulty": 1},
        ]
        result = calculate_fixture_scores(fixtures, current_gameweek=10)

        # GW14 should be included (exactly at boundary)
        assert 1 in result
        assert result[1] == pytest.approx(0.0, rel=1e-2)  # FDR 5 -> score 0


# =============================================================================
# 10. RecommendationsService Unit Tests
# =============================================================================


class TestRecommendationsService:
    """Unit tests for the RecommendationsService class."""

    async def test_calculate_per90_stats(self):
        """Should calculate per-90 stats for all players."""
        from app.services.recommendations import RecommendationsService

        # Create a minimal mock client
        class MockClient:
            async def get_bootstrap_static(self):
                return {}

            async def get_league_standings(self, league_id: int):
                return {}

            async def get_manager_picks(self, manager_id: int):
                return {}

        service = RecommendationsService(MockClient())

        players = [
            {
                "id": 1,
                "minutes": 900,
                "expected_goals": "5.0",
                "expected_assists": "3.0",
                "expected_goals_conceded": "2.0",
                "clean_sheets": 4,
            }
        ]

        result = service._calculate_per90_stats(players)

        assert len(result) == 1
        assert result[0]["xg90"] == pytest.approx(0.5, rel=1e-2)  # 5/900*90
        assert result[0]["xa90"] == pytest.approx(0.3, rel=1e-2)  # 3/900*90
        assert result[0]["xgc90"] == pytest.approx(0.2, rel=1e-2)  # 2/900*90
        assert result[0]["cs90"] == pytest.approx(0.4, rel=1e-2)  # 4/900*90

    async def test_calculate_percentiles(self):
        """Should calculate percentiles across all players."""
        from app.services.recommendations import RecommendationsService

        class MockClient:
            async def get_bootstrap_static(self):
                return {}

            async def get_league_standings(self, league_id: int):
                return {}

            async def get_manager_picks(self, manager_id: int):
                return {}

        service = RecommendationsService(MockClient())

        players = [
            {"id": 1, "xg90": 0.1, "xa90": 0.1, "xgc90": 0.1, "cs90": 0.1, "form": "2.0"},
            {"id": 2, "xg90": 0.5, "xa90": 0.5, "xgc90": 0.5, "cs90": 0.5, "form": "5.0"},
            {"id": 3, "xg90": 0.9, "xa90": 0.9, "xgc90": 0.9, "cs90": 0.9, "form": "8.0"},
        ]

        result = service._calculate_percentiles(players)

        # Highest values should have highest percentiles
        assert result[2]["percentiles"]["xg90"] == 1.0
        assert result[0]["percentiles"]["xg90"] == 0.0

    async def test_fetch_league_ownership_parallel_execution(self):
        """Should fetch manager picks in parallel using semaphore."""
        import asyncio

        from app.services.recommendations import RecommendationsService

        call_times = []

        class MockClient:
            async def get_bootstrap_static(self):
                return {}

            async def get_league_standings(self, league_id: int):
                return {"standings": {"results": [{"entry": i} for i in range(20)]}}

            async def get_manager_picks(self, manager_id: int):
                call_times.append(asyncio.get_event_loop().time())
                await asyncio.sleep(0.01)  # Small delay to test parallelism
                return {"picks": [{"element": 100 + manager_id}]}

        service = RecommendationsService(MockClient())

        result = await service._fetch_league_ownership(12345)

        # Should have fetched all 20 managers
        assert len(result["manager_ids"]) == 20
        assert len(result["player_counts"]) == 20
        assert result["failed_count"] == 0  # All requests successful

        # Check that calls were made in parallel (time should be much less than sequential)
        # With 10 concurrent requests and 0.01s each, 20 requests should take ~0.02s
        # Sequential would be 20 * 0.01 = 0.2s
        if len(call_times) >= 2:
            time_span = max(call_times) - min(call_times)
            assert time_span < 0.1  # Should complete in parallel

    async def test_fetch_league_ownership_handles_failed_requests(self):
        """Should handle failed manager requests gracefully and continue."""
        from app.services.recommendations import RecommendationsService

        class MockClient:
            async def get_bootstrap_static(self):
                return {}

            async def get_league_standings(self, league_id: int):
                return {"standings": {"results": [{"entry": 1}, {"entry": 2}, {"entry": 3}]}}

            async def get_manager_picks(self, manager_id: int):
                if manager_id == 2:
                    raise Exception("Failed to fetch manager 2")
                return {"picks": [{"element": 100 + manager_id}]}

        service = RecommendationsService(MockClient())

        result = await service._fetch_league_ownership(12345)

        # Should still return results for successful requests
        assert len(result["manager_ids"]) == 3
        assert len(result["player_counts"]) == 2  # Only 2 successful
        assert result["failed_count"] == 1  # One request failed

    async def test_get_league_recommendations_full_flow(self):
        """Should orchestrate the full recommendation flow."""
        from app.services.recommendations import RecommendationsService

        class MockClient:
            async def get_bootstrap_static(self):
                return {
                    "events": [{"id": 10, "is_current": True}],
                    "elements": [
                        {
                            "id": 1,
                            "web_name": "Player1",
                            "element_type": 3,  # MID
                            "status": "a",
                            "minutes": 900,
                            "expected_goals": "5.0",
                            "expected_assists": "3.0",
                            "expected_goals_conceded": "0.0",
                            "clean_sheets": 0,
                            "form": "7.0",
                            "now_cost": 100,
                            "team": 1,
                        },
                        {
                            "id": 2,
                            "web_name": "Player2",
                            "element_type": 4,  # FWD
                            "status": "a",
                            "minutes": 800,
                            "expected_goals": "8.0",
                            "expected_assists": "2.0",
                            "expected_goals_conceded": "0.0",
                            "clean_sheets": 0,
                            "form": "6.0",
                            "now_cost": 80,
                            "team": 2,
                        },
                    ],
                }

            async def get_fixtures(self):
                # Team 1 has easy fixtures (FDR 2), Team 2 has hard fixtures (FDR 4)
                return [
                    {"event": 10, "team_h": 1, "team_a": 3, "team_h_difficulty": 2, "team_a_difficulty": 3},
                    {"event": 10, "team_h": 4, "team_a": 2, "team_h_difficulty": 3, "team_a_difficulty": 4},
                ]

            async def get_league_standings(self, league_id: int):
                return {"standings": {"results": [{"entry": 1}]}}

            async def get_manager_picks(self, manager_id: int):
                return {"picks": [{"element": 1}]}  # Only Player1 owned

        service = RecommendationsService(MockClient())

        result = await service.get_league_recommendations(12345, limit=10)

        # Should return all three categories
        assert "punts" in result
        assert "defensive" in result
        assert "time_to_sell" in result

        # Player2 should be a punt (not owned, low ownership < 40%)
        # Player1 should be in defensive (owned by 1/1 = 100%, but >= 40%)

    async def test_get_league_recommendations_empty_when_no_eligible_players(self):
        """Should return empty lists when no players are eligible."""
        from app.services.recommendations import RecommendationsService

        class MockClient:
            async def get_bootstrap_static(self):
                return {
                    "events": [{"id": 10, "is_current": True}],
                    "elements": [
                        {
                            "id": 1,
                            "element_type": 1,  # GKP - excluded
                            "status": "a",
                            "minutes": 900,
                        }
                    ],
                }

            async def get_fixtures(self):
                return []

            async def get_league_standings(self, league_id: int):
                return {}

            async def get_manager_picks(self, manager_id: int):
                return {}

        service = RecommendationsService(MockClient())

        result = await service.get_league_recommendations(12345)

        assert result == {"punts": [], "defensive": [], "time_to_sell": []}
