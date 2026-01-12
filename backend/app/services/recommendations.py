"""Player recommendations scoring engine.

Calculates buy/sell scores for players based on:
- Per-90 stats (xG, xA, xGC, CS)
- Form (last 5 gameweek average)
- Fixture difficulty
- League ownership

Recommendation categories:
- Punts: Low ownership (<40%), high potential
- Defensive: Medium ownership (40-100%), form-based
- Time to Sell: Owned players with declining metrics
"""

import asyncio
import logging
from collections import Counter
from decimal import Decimal
from typing import Any, Protocol, TypedDict

logger = logging.getLogger(__name__)

# =============================================================================
# Type Definitions
# =============================================================================


class FplClientProtocol(Protocol):
    """Protocol for FPL API client dependency injection."""

    async def get_bootstrap_static(self) -> dict[str, Any]: ...
    async def get_fixtures(self) -> list[dict[str, Any]]: ...
    async def get_league_standings_raw(self, league_id: int) -> dict[str, Any]: ...
    async def get_manager_picks(self, manager_id: int) -> dict[str, Any]: ...


class PlayerPercentiles(TypedDict, total=False):
    """Percentile rankings for player stats (all values 0.0 to 1.0)."""

    xg90: float
    xa90: float
    xgc90: float
    cs90: float
    form: float


# =============================================================================
# Public API
# =============================================================================

__all__ = [
    # Types
    "PlayerPercentiles",
    "FplClientProtocol",
    # Constants
    "MIN_MINUTES_THRESHOLD",
    "POSITION_GKP",
    "POSITION_DEF",
    "POSITION_MID",
    "POSITION_FWD",
    "PUNTS_OWNERSHIP_THRESHOLD",
    "DEFENSIVE_OWNERSHIP_MIN",
    "DEFENSIVE_OWNERSHIP_MAX",
    "SELL_SCORE_THRESHOLD",
    "PUNT_WEIGHTS",
    "DEFENSIVE_WEIGHTS",
    "SELL_WEIGHTS",
    "FIXTURE_HORIZON",
    "FDR_MIN",
    "FDR_MAX",
    # Eligibility
    "is_eligible_player",
    # Per-90 calculations
    "calculate_per90",
    "calculate_xg90",
    "calculate_xa90",
    "calculate_xgc90",
    "calculate_cs90",
    "calculate_per90_from_fixtures",
    # Percentile ranking
    "get_percentile",
    # Form calculation
    "calculate_form",
    # Ownership calculation
    "calculate_ownership",
    # Fixture difficulty
    "calculate_fixture_scores",
    # Score calculations
    "invert_xgc_percentile",
    "calculate_buy_score",
    "calculate_sell_score",
    "should_include_in_sell_list",
    # Filtering and sorting
    "filter_for_punts",
    "filter_for_defensive",
    "filter_for_sell",
    "get_top_punts",
    "get_top_defensive",
    "get_top_sell",
    # Service class
    "RecommendationsService",
]

# =============================================================================
# Constants
# =============================================================================

# Minimum minutes threshold for eligibility
MIN_MINUTES_THRESHOLD = 450

# Position constants (FPL element_type)
POSITION_GKP = 1
POSITION_DEF = 2
POSITION_MID = 3
POSITION_FWD = 4

# Ownership thresholds
PUNTS_OWNERSHIP_THRESHOLD = 0.40
DEFENSIVE_OWNERSHIP_MIN = 0.40
DEFENSIVE_OWNERSHIP_MAX = 1.00
SELL_SCORE_THRESHOLD = 0.5

# Fixture difficulty settings
FIXTURE_HORIZON = 5  # Number of gameweeks to consider for fixture difficulty
FDR_MIN = 1  # FPL's minimum FDR rating
FDR_MAX = 5  # FPL's maximum FDR rating

# Position-specific weights for buy score
# Keys: xG, xA, xGC, CS, form, fix (fixture difficulty)
# All weights must sum to 1.0 for each position
PUNT_WEIGHTS: dict[int, dict[str, float]] = {
    2: {  # DEF - all 6 factors used
        "xG": 0.10,
        "xA": 0.10,
        "xGC": 0.20,  # Use inverted percentile (low xGC = good)
        "CS": 0.15,
        "form": 0.25,
        "fix": 0.20,
    },
    3: {  # MID - no defensive stats, redistribute to attacking
        "xG": 0.25,
        "xA": 0.25,
        "xGC": 0.00,
        "CS": 0.00,
        "form": 0.30,
        "fix": 0.20,
    },
    4: {  # FWD - prioritize xG heavily
        "xG": 0.40,
        "xA": 0.15,
        "xGC": 0.00,
        "CS": 0.00,
        "form": 0.30,
        "fix": 0.15,
    },
}

# Defensive options - higher form weight for consistent picks
DEFENSIVE_WEIGHTS: dict[int, dict[str, float]] = {
    2: {  # DEF - all 6 factors used
        "xG": 0.08,
        "xA": 0.08,
        "xGC": 0.22,
        "CS": 0.17,
        "form": 0.30,
        "fix": 0.15,
    },
    3: {  # MID - no defensive stats, heavy form weight
        "xG": 0.20,
        "xA": 0.20,
        "xGC": 0.00,
        "CS": 0.00,
        "form": 0.40,
        "fix": 0.20,
    },
    4: {  # FWD - prioritize xG and form
        "xG": 0.35,
        "xA": 0.10,
        "xGC": 0.00,
        "CS": 0.00,
        "form": 0.35,
        "fix": 0.20,
    },
}

# Sell weights - inverted xG/xA/form, NOT inverted xGC
SELL_WEIGHTS: dict[int, dict[str, float]] = {
    2: {  # DEF
        "xG": 0.10,
        "xA": 0.10,
        "xGC": 0.20,
        "CS": 0.15,
        "form": 0.25,
        "fix": 0.20,
    },
    3: {  # MID
        "xG": 0.25,
        "xA": 0.20,
        "xGC": 0.00,
        "CS": 0.00,
        "form": 0.35,
        "fix": 0.20,
    },
    4: {  # FWD
        "xG": 0.30,
        "xA": 0.15,
        "xGC": 0.00,
        "CS": 0.00,
        "form": 0.35,
        "fix": 0.20,
    },
}


def _validate_weights() -> None:
    """Validate all weight configurations sum to 1.0.

    Raises:
        ValueError: If any weight set doesn't sum to 1.0
    """
    for name, weights_dict in [
        ("PUNT_WEIGHTS", PUNT_WEIGHTS),
        ("DEFENSIVE_WEIGHTS", DEFENSIVE_WEIGHTS),
        ("SELL_WEIGHTS", SELL_WEIGHTS),
    ]:
        for pos, weights in weights_dict.items():
            total = sum(weights.values())
            if abs(total - 1.0) >= 1e-9:
                raise ValueError(f"{name}[{pos}] sums to {total}, not 1.0")


# Validate at module load to catch config errors early
_validate_weights()


# =============================================================================
# 1. Eligibility Functions
# =============================================================================


def is_eligible_player(player: dict[str, Any]) -> bool:
    """Check if player is eligible for recommendations.

    Criteria:
    - Not a goalkeeper (element_type != 1)
    - Available status (status == 'a')
    - Minimum minutes played (>= 450)

    Args:
        player: Player row from database with element_type, status, minutes

    Returns:
        True if player meets all eligibility criteria
    """
    # Exclude goalkeepers
    if player.get("element_type") == POSITION_GKP:
        return False

    # Only available players
    if player.get("status") != "a":
        return False

    # Minimum minutes threshold
    minutes = player.get("minutes")
    return minutes is not None and minutes >= MIN_MINUTES_THRESHOLD


# =============================================================================
# 2. Per-90 Calculations
# =============================================================================


def calculate_per90(value: Decimal | int | None, minutes: int) -> float:
    """Calculate any stat per 90 minutes.

    Generic function for per-90 stat calculation. Handles None values
    and invalid minutes safely.

    Args:
        value: Total stat value (Decimal/int from PostgreSQL, or None)
        minutes: Total minutes played

    Returns:
        Value per 90 minutes, or 0.0 if invalid input
    """
    if value is None or minutes <= 0:
        return 0.0
    return (float(value) / minutes) * 90


def calculate_xg90(xg: Decimal | None, minutes: int) -> float:
    """Calculate expected goals per 90 minutes.

    Args:
        xg: Total expected goals (Decimal from PostgreSQL, or None)
        minutes: Total minutes played

    Returns:
        xG per 90 minutes, or 0.0 if invalid input
    """
    return calculate_per90(xg, minutes)


def calculate_xa90(xa: Decimal | None, minutes: int) -> float:
    """Calculate expected assists per 90 minutes.

    Args:
        xa: Total expected assists (Decimal from PostgreSQL, or None)
        minutes: Total minutes played

    Returns:
        xA per 90 minutes, or 0.0 if invalid input
    """
    return calculate_per90(xa, minutes)


def calculate_xgc90(xgc: Decimal | None, minutes: int) -> float:
    """Calculate expected goals conceded per 90 minutes.

    Args:
        xgc: Total expected goals conceded (Decimal from PostgreSQL, or None)
        minutes: Total minutes played

    Returns:
        xGC per 90 minutes, or 0.0 if invalid input
    """
    return calculate_per90(xgc, minutes)


def calculate_cs90(cs: int | None, minutes: int) -> float:
    """Calculate clean sheets per 90 minutes.

    Args:
        cs: Total clean sheets (int from PostgreSQL, or None)
        minutes: Total minutes played

    Returns:
        CS per 90 minutes, or 0.0 if invalid input
    """
    return calculate_per90(cs, minutes)


def calculate_per90_from_fixtures(stats: list[dict[str, Any]]) -> dict[str, float]:
    """Calculate per-90 stats from aggregated fixture data.

    Args:
        stats: List of player fixture stats rows

    Returns:
        Dictionary with xg90, xa90, xgc90, cs90 keys
    """
    if not stats:
        return {"xg90": 0.0, "xa90": 0.0, "xgc90": 0.0, "cs90": 0.0}

    total_minutes = sum(s.get("minutes", 0) for s in stats)
    if total_minutes <= 0:
        return {"xg90": 0.0, "xa90": 0.0, "xgc90": 0.0, "cs90": 0.0}

    total_xg = sum(
        float(s["expected_goals"]) for s in stats if s.get("expected_goals") is not None
    )
    total_xa = sum(
        float(s["expected_assists"]) for s in stats if s.get("expected_assists") is not None
    )
    total_xgc = sum(
        float(s["expected_goals_conceded"])
        for s in stats
        if s.get("expected_goals_conceded") is not None
    )
    total_cs = sum(s.get("clean_sheets", 0) for s in stats)

    return {
        "xg90": (total_xg / total_minutes) * 90,
        "xa90": (total_xa / total_minutes) * 90,
        "xgc90": (total_xgc / total_minutes) * 90,
        "cs90": (float(total_cs) / total_minutes) * 90,
    }


# =============================================================================
# 3. Percentile Ranking
# =============================================================================


def get_percentile(value: float | Decimal, values: list[float | Decimal]) -> float:
    """Calculate percentile rank of a value within a distribution.

    Uses fraction of values below the target value.

    Args:
        value: The value to rank
        values: List of all values in the distribution

    Returns:
        Percentile as float (0.0 to 1.0), or 0.5 if insufficient data
    """
    if len(values) <= 1:
        return 0.5

    # Convert to floats for comparison
    value_f = float(value)
    values_f = sorted(float(v) for v in values)

    # Count values strictly below
    count_below = sum(1 for v in values_f if v < value_f)

    # Percentile as fraction, using (n-1) divisor for proper 0-1 range
    # This gives 0.0 for min, 1.0 for max
    percentile = count_below / (len(values_f) - 1)
    return min(1.0, max(0.0, percentile))


# =============================================================================
# 4. Form Calculation
# =============================================================================


def calculate_form(
    stats: list[dict[str, Any]],
    use_opponent_weight: bool,
    team_strengths: dict[int, int] | None = None,
    season_id: int | None = None,
) -> float:
    """Calculate form score from recent fixture stats.

    Form is the average points over recent gameweeks, optionally
    weighted by opponent difficulty.

    Args:
        stats: List of fixture stats rows (should be last 5 GW)
        use_opponent_weight: Whether to adjust for opponent difficulty
        team_strengths: Dict mapping team_id to strength (1-5)
        season_id: Filter to specific season (optional)

    Returns:
        Form score (average points, possibly weighted)
    """
    if not stats:
        return 0.0

    # Filter by season if specified
    if season_id is not None:
        stats = [s for s in stats if s.get("season_id") == season_id]

    if not stats:
        return 0.0

    if not use_opponent_weight:
        # Simple average
        total_points = sum(s.get("total_points", 0) for s in stats)
        return total_points / len(stats)

    # Weighted average based on opponent strength
    if team_strengths is None:
        team_strengths = {}

    weighted_sum = 0.0
    weight_total = 0.0

    for s in stats:
        points = s.get("total_points", 0)
        opponent_id = s.get("opponent_team_id")
        strength = team_strengths.get(opponent_id, 3)  # Default to medium

        # Weight: harder opponents (higher strength) give more weight to good scores
        # Scale: strength 1-5 -> weight 0.6-1.4
        weight = 0.6 + (strength - 1) * 0.2
        weighted_sum += points * weight
        weight_total += weight

    if weight_total == 0:
        return 0.0

    return weighted_sum / weight_total


# =============================================================================
# 5. Ownership Calculation
# =============================================================================


def calculate_ownership(
    player_id: int,
    picks: list[dict[str, Any]],
    num_managers: int,
) -> float:
    """Calculate league ownership percentage for a player.

    Args:
        player_id: The player's ID
        picks: List of manager pick rows
        num_managers: Total number of managers in the league

    Returns:
        Ownership as fraction (0.0 to 1.0)
    """
    if num_managers == 0:
        return 0.0

    # Count unique snapshots (managers) that own this player
    owning_snapshots = set()
    for pick in picks:
        if pick.get("player_id") == player_id:
            owning_snapshots.add(pick.get("snapshot_id"))

    return len(owning_snapshots) / num_managers


# =============================================================================
# 6. Fixture Difficulty Calculation
# =============================================================================


def calculate_fixture_scores(
    fixtures: list[dict[str, Any]],
    current_gameweek: int,
) -> dict[int, float]:
    """Calculate fixture difficulty score for each team.

    Uses FPL's Fixture Difficulty Rating (FDR) for upcoming fixtures.
    Lower FDR = easier opponent, so we invert to get higher score = better fixtures.

    Args:
        fixtures: List of fixture dicts from FPL API
        current_gameweek: Current gameweek number

    Returns:
        Dict mapping team_id to fixture_score (0.0 to 1.0, higher = easier fixtures)
    """
    # Build upcoming fixtures by team
    team_fixtures: dict[int, list[int]] = {}  # team_id -> list of FDR values

    for fixture in fixtures:
        gw = fixture.get("event")
        if gw is None:
            continue  # Blank gameweek fixture

        # Only consider upcoming fixtures within horizon
        if gw < current_gameweek or gw > current_gameweek + FIXTURE_HORIZON - 1:
            continue

        home_team = fixture.get("team_h")
        away_team = fixture.get("team_a")
        # Default to neutral FDR (3) if missing or None
        home_difficulty = fixture.get("team_h_difficulty") or 3
        away_difficulty = fixture.get("team_a_difficulty") or 3

        if home_team is not None:
            team_fixtures.setdefault(home_team, []).append(home_difficulty)
        if away_team is not None:
            team_fixtures.setdefault(away_team, []).append(away_difficulty)

    # Calculate weighted average FDR for each team
    # Closer gameweeks weighted more heavily (exponential decay)
    fixture_scores: dict[int, float] = {}

    for team_id, fdr_list in team_fixtures.items():
        # Note: fdr_list is never empty here because teams are only added
        # when a fixture is found. Teams with no fixtures simply won't appear
        # in team_fixtures dict (handled by caller with .get(team_id, 0.5))

        # Weight by position (first fixture = highest weight)
        weights = [0.5 ** i for i in range(len(fdr_list))]
        total_weight = sum(weights)

        weighted_fdr = sum(fdr * w for fdr, w in zip(fdr_list, weights)) / total_weight

        # Normalize FDR (1-5) to 0-1 scale, then invert (lower FDR = higher score)
        # FDR 1 -> score 1.0 (easy), FDR 5 -> score 0.0 (hard)
        normalized = (weighted_fdr - FDR_MIN) / (FDR_MAX - FDR_MIN)
        fixture_scores[team_id] = 1.0 - normalized

    return fixture_scores


# =============================================================================
# 7. Buy Score Calculation
# =============================================================================


def invert_xgc_percentile(percentile: float) -> float:
    """Invert xGC percentile for buy score calculation.

    For buying, low xGC is good (team doesn't concede much).
    So we invert: 20th percentile -> 80th percentile.

    Args:
        percentile: Original xGC percentile (0.0 to 1.0)

    Returns:
        Inverted percentile (0.0 to 1.0)
    """
    return 1.0 - percentile


def calculate_buy_score(
    percentiles: dict[str, float],
    fixture_score: float,
    position: int,
    weights: dict[int, dict[str, float]],
) -> float:
    """Calculate buy score for a player.

    Combines percentile ranks of various stats with position-specific weights.

    Note: For defenders, the caller should pass xgc90 as an INVERTED percentile
    (use invert_xgc_percentile() first) since low xGC = good for buying.

    Args:
        percentiles: Dict with xg90, xa90, xgc90, cs90, form percentiles
                     (xgc90 should be pre-inverted for buy recommendations)
        fixture_score: Upcoming fixture difficulty score (0.0 to 1.0)
        position: Player position (2=DEF, 3=MID, 4=FWD)
        weights: Weight configuration (PUNT_WEIGHTS or DEFENSIVE_WEIGHTS)

    Returns:
        Buy score (0.0 to 1.0)
    """
    if position not in weights:
        return 0.0

    w = weights[position]

    score = (
        percentiles.get("xg90", 0.0) * w["xG"]
        + percentiles.get("xa90", 0.0) * w["xA"]
        + percentiles.get("xgc90", 0.0) * w["xGC"]  # Caller pre-inverts for buy
        + percentiles.get("cs90", 0.0) * w["CS"]
        + percentiles.get("form", 0.0) * w["form"]
        + fixture_score * w["fix"]
    )

    return score


# =============================================================================
# 7. Sell Score Calculation
# =============================================================================


def calculate_sell_score(
    percentiles: dict[str, float],
    fixture_score: float,
    position: int,
    weights: dict[int, dict[str, float]],
) -> float:
    """Calculate sell score for a player.

    For sell recommendations, we INVERT most metrics (low xG = sell).
    Exception: xGC is NOT inverted (high xGC = bad = sell).

    Args:
        percentiles: Dict with xg90, xa90, xgc90, cs90, form percentiles
        fixture_score: Upcoming fixture difficulty score (0.0 to 1.0)
        position: Player position (2=DEF, 3=MID, 4=FWD)
        weights: Weight configuration (SELL_WEIGHTS)

    Returns:
        Sell score (0.0 to 1.0)
    """
    if position not in weights:
        return 0.0

    w = weights[position]

    # Invert xG, xA, CS, form (low = recommend sell)
    # Do NOT invert xGC (high xGC = bad = recommend sell)
    # Invert fixture (bad fixtures = might want to sell)
    score = (
        (1.0 - percentiles.get("xg90", 0.0)) * w["xG"]
        + (1.0 - percentiles.get("xa90", 0.0)) * w["xA"]
        + percentiles.get("xgc90", 0.0) * w["xGC"]  # NOT inverted
        + (1.0 - percentiles.get("cs90", 0.0)) * w["CS"]
        + (1.0 - percentiles.get("form", 0.0)) * w["form"]
        + (1.0 - fixture_score) * w["fix"]  # Bad fixtures -> sell
    )

    return score


def should_include_in_sell_list(sell_score: float) -> bool:
    """Check if sell score meets threshold for recommendation.

    Args:
        sell_score: The calculated sell score

    Returns:
        True if score exceeds threshold
    """
    return sell_score > SELL_SCORE_THRESHOLD


# =============================================================================
# 8. Recommendation Filtering
# =============================================================================


def filter_for_punts(players: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filter players for punt recommendations.

    Punts are low-ownership (<40%) players with high potential.

    Args:
        players: List of scored player dicts with ownership, score keys

    Returns:
        Filtered list of punt candidates
    """
    return [p for p in players if p.get("ownership", 0) < PUNTS_OWNERSHIP_THRESHOLD]


def filter_for_defensive(players: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filter players for defensive recommendations.

    Defensive options are medium ownership (40% to <100%) players.

    Args:
        players: List of scored player dicts with ownership, score keys

    Returns:
        Filtered list of defensive candidates
    """
    return [
        p
        for p in players
        if DEFENSIVE_OWNERSHIP_MIN <= p.get("ownership", 0) < DEFENSIVE_OWNERSHIP_MAX
    ]


def filter_for_sell(players: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Filter players for sell recommendations.

    Sell candidates are owned players (>0%) with sell_score above threshold.

    Args:
        players: List of scored player dicts with ownership, sell_score keys

    Returns:
        Filtered list of sell candidates
    """
    return [
        p
        for p in players
        if p.get("ownership", 0) > 0 and should_include_in_sell_list(p.get("sell_score", 0))
    ]


def get_top_punts(players: list[dict[str, Any]], limit: int = 20) -> list[dict[str, Any]]:
    """Get top punt recommendations sorted by score.

    Args:
        players: List of player dicts with score key
        limit: Maximum number to return (default 20)

    Returns:
        Top N players sorted by score descending, with stable ordering
    """
    # Sort by score descending, then by id for stability
    sorted_players = sorted(
        players,
        key=lambda p: (-p.get("score", 0), p.get("id", 0)),
    )
    return sorted_players[:limit]


def get_top_defensive(players: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
    """Get top defensive recommendations sorted by score.

    Args:
        players: List of player dicts with score key
        limit: Maximum number to return (default 10)

    Returns:
        Top N players sorted by score descending, with stable ordering
    """
    sorted_players = sorted(
        players,
        key=lambda p: (-p.get("score", 0), p.get("id", 0)),
    )
    return sorted_players[:limit]


def get_top_sell(players: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
    """Get top sell recommendations sorted by sell_score.

    Args:
        players: List of player dicts with sell_score key
        limit: Maximum number to return (default 10)

    Returns:
        Top N players sorted by sell_score descending, with stable ordering
    """
    sorted_players = sorted(
        players,
        key=lambda p: (-p.get("sell_score", 0), p.get("id", 0)),
    )
    return sorted_players[:limit]


# =============================================================================
# 9. Recommendations Service (API Orchestration)
# =============================================================================


# Max concurrent manager API requests (avoid rate limiting)
MAX_CONCURRENT_MANAGER_REQUESTS = 10
MAX_MANAGERS_TO_FETCH = 50


class RecommendationsService:
    """Orchestrates player recommendations by fetching data and calculating scores.

    This service:
    1. Fetches player data from FPL bootstrap-static API
    2. Fetches league ownership from manager picks
    3. Calculates per-90 stats and percentiles
    4. Calculates buy/sell scores
    5. Returns categorized recommendations (punts, defensive, time_to_sell)
    """

    def __init__(self, fpl_client: FplClientProtocol) -> None:
        """Initialize with an FPL API client.

        Args:
            fpl_client: FplApiClient instance for API calls
        """
        self.fpl_client = fpl_client

    async def get_league_recommendations(
        self,
        league_id: int,
        limit: int = 10,
        season_id: int = 1,
    ) -> dict[str, Any]:
        """Get player recommendations for a league.

        Args:
            league_id: FPL league ID
            limit: Maximum number of players per category
            season_id: Season ID for filtering (default 1 for 2024-25)

        Returns:
            Dict with punts, defensive, and time_to_sell lists
        """
        # Note: season_id is currently unused as FPL API data is season-implicit
        # Will be used when querying from database for historical data
        _ = season_id  # Mark as intentionally unused for now

        # 1. Fetch all external data in parallel (independent API calls)
        bootstrap, fixtures, league_ownership = await asyncio.gather(
            self.fpl_client.get_bootstrap_static(),
            self.fpl_client.get_fixtures(),
            self._fetch_league_ownership(league_id),
        )
        elements = bootstrap.get("elements", [])

        # Get current gameweek from events
        current_gameweek = 1  # Default to GW1
        for event in bootstrap.get("events", []):
            if event.get("is_current"):
                current_gameweek = event.get("id", 1)
                break

        # 2. Filter for eligible players
        eligible_players = [p for p in elements if is_eligible_player(p)]

        if not eligible_players:
            return {"punts": [], "defensive": [], "time_to_sell": []}

        # 3. Calculate per-90 stats for all eligible players
        players_with_stats = self._calculate_per90_stats(eligible_players)

        # 4. Calculate percentiles across all eligible players
        players_with_percentiles = self._calculate_percentiles(players_with_stats)

        # 5. Calculate fixture difficulty scores
        fixture_scores = calculate_fixture_scores(fixtures, current_gameweek)

        # 6. Calculate league ownership stats
        num_managers = len(league_ownership.get("manager_ids", []))

        # 7. Apply ownership and calculate scores
        scored_players = self._calculate_scores(
            players_with_percentiles, league_ownership, num_managers, fixture_scores
        )

        # 8. Filter and sort into categories
        punts_candidates = filter_for_punts(scored_players)
        defensive_candidates = filter_for_defensive(scored_players)
        sell_candidates = filter_for_sell(scored_players)

        return {
            "punts": get_top_punts(punts_candidates, limit),
            "defensive": get_top_defensive(defensive_candidates, limit),
            "time_to_sell": get_top_sell(sell_candidates, limit),
        }

    def _calculate_per90_stats(
        self, players: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Calculate per-90 stats for all players.

        Args:
            players: List of FPL player elements

        Returns:
            Players with xg90, xa90, xgc90, cs90 added
        """
        result = []
        for p in players:
            minutes = p.get("minutes", 0)

            # Parse decimal strings from FPL API
            xg = Decimal(p.get("expected_goals", "0") or "0")
            xa = Decimal(p.get("expected_assists", "0") or "0")
            xgc = Decimal(p.get("expected_goals_conceded", "0") or "0")
            cs = p.get("clean_sheets", 0) or 0

            player_copy = dict(p)
            player_copy["xg90"] = calculate_xg90(xg, minutes)
            player_copy["xa90"] = calculate_xa90(xa, minutes)
            player_copy["xgc90"] = calculate_xgc90(xgc, minutes)
            player_copy["cs90"] = calculate_cs90(cs, minutes)
            result.append(player_copy)

        return result

    def _calculate_percentiles(
        self, players: list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        """Calculate percentile rankings for all players.

        Args:
            players: List of players with per-90 stats

        Returns:
            Players with percentile rankings added
        """
        # Collect all values for percentile calculation
        all_xg90 = [p["xg90"] for p in players]
        all_xa90 = [p["xa90"] for p in players]
        all_xgc90 = [p["xgc90"] for p in players]
        all_cs90 = [p["cs90"] for p in players]
        all_form = [float(p.get("form", "0") or "0") for p in players]

        result = []
        for p in players:
            player_copy = dict(p)
            player_copy["percentiles"] = {
                "xg90": get_percentile(p["xg90"], all_xg90),
                "xa90": get_percentile(p["xa90"], all_xa90),
                "xgc90": get_percentile(p["xgc90"], all_xgc90),
                "cs90": get_percentile(p["cs90"], all_cs90),
                "form": get_percentile(float(p.get("form", "0") or "0"), all_form),
            }
            result.append(player_copy)

        return result

    async def _fetch_league_ownership(self, league_id: int) -> dict[str, Any]:
        """Fetch which players are owned by managers in the league.

        Uses parallel requests with semaphore to avoid rate limiting while
        improving response times compared to sequential calls.

        Args:
            league_id: FPL league ID

        Returns:
            Dict with manager_ids, player_counts, and failed_count

        Raises:
            Exception: Propagates errors from league standings fetch
        """
        # Fetch league standings - let errors propagate (critical failure)
        standings = await self.fpl_client.get_league_standings_raw(league_id)
        managers = standings.get("standings", {}).get("results", [])

        manager_ids = [m["entry"] for m in managers]

        if not manager_ids:
            logger.info(f"No managers found for league {league_id}")
            return {"manager_ids": [], "player_counts": Counter(), "failed_count": 0}

        # Limit managers to fetch
        managers_to_fetch = manager_ids[:MAX_MANAGERS_TO_FETCH]
        failed_count = 0

        # Fetch picks in parallel with controlled concurrency
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_MANAGER_REQUESTS)

        async def fetch_manager_picks(
            manager_id: int,
        ) -> tuple[list[dict[str, Any]], bool]:
            """Returns (picks, success) tuple."""
            nonlocal failed_count
            async with semaphore:
                try:
                    picks_data = await self.fpl_client.get_manager_picks(manager_id)
                    return (picks_data.get("picks", []), True)
                except Exception as e:
                    logger.warning(
                        f"Failed to fetch picks for manager {manager_id}: "
                        f"{type(e).__name__}: {e}"
                    )
                    failed_count += 1
                    return ([], False)

        # Gather all manager picks in parallel
        results = await asyncio.gather(
            *[fetch_manager_picks(m) for m in managers_to_fetch]
        )

        # Count player ownership using Counter
        player_counts: Counter[int] = Counter()
        for picks, _success in results:
            for pick in picks:
                player_id = pick.get("element")
                if player_id:
                    player_counts[player_id] += 1

        # Log if too many failures (> 50%)
        if failed_count > len(managers_to_fetch) * 0.5:
            logger.warning(
                f"High failure rate fetching manager picks for league {league_id}: "
                f"{failed_count}/{len(managers_to_fetch)} failed"
            )

        return {
            "manager_ids": manager_ids,
            "player_counts": player_counts,
            "failed_count": failed_count,
        }

    def _calculate_scores(
        self,
        players: list[dict[str, Any]],
        league_ownership: dict[str, Any],
        num_managers: int,
        fixture_scores: dict[int, float],
    ) -> list[dict[str, Any]]:
        """Calculate buy/sell scores for all players.

        Args:
            players: Players with percentiles
            league_ownership: League ownership data
            num_managers: Total managers in league
            fixture_scores: Dict mapping team_id to fixture difficulty score

        Returns:
            Players with ownership, score, and sell_score
        """
        player_counts = league_ownership.get("player_counts", {})

        result = []
        for p in players:
            player_copy = dict(p)
            player_id = p.get("id")
            position = p.get("element_type", 3)
            team_id = p.get("team", 0)

            # Calculate league ownership
            owned_count = player_counts.get(player_id, 0)
            ownership = owned_count / num_managers if num_managers > 0 else 0.0
            player_copy["ownership"] = ownership

            percentiles = p.get("percentiles", {})

            # For buy score, invert xGC for defenders
            buy_percentiles = dict(percentiles)
            if position == POSITION_DEF:
                buy_percentiles["xgc90"] = invert_xgc_percentile(
                    percentiles.get("xgc90", 0.5)
                )

            # Get fixture difficulty score for player's team (0.5 neutral if unknown)
            fixture_score = fixture_scores.get(team_id, 0.5)

            if ownership < PUNTS_OWNERSHIP_THRESHOLD:
                player_copy["score"] = calculate_buy_score(
                    buy_percentiles, fixture_score, position, PUNT_WEIGHTS
                )
            else:
                player_copy["score"] = calculate_buy_score(
                    buy_percentiles, fixture_score, position, DEFENSIVE_WEIGHTS
                )

            player_copy["sell_score"] = calculate_sell_score(
                percentiles, fixture_score, position, SELL_WEIGHTS
            )

            # Add display fields
            player_copy["name"] = p.get("web_name", "Unknown")
            player_copy["team"] = p.get("team", 0)
            player_copy["price"] = p.get("now_cost", 0) / 10

            result.append(player_copy)

        return result
