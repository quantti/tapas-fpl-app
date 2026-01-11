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

from decimal import Decimal
from typing import Any

# =============================================================================
# Constants
# =============================================================================

# Minimum minutes threshold for eligibility
MIN_MINUTES_THRESHOLD = 450

# Ownership thresholds
PUNTS_OWNERSHIP_THRESHOLD = 0.40
DEFENSIVE_OWNERSHIP_MIN = 0.40
DEFENSIVE_OWNERSHIP_MAX = 1.00
SELL_SCORE_THRESHOLD = 0.5

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
    if player.get("element_type") == 1:
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


def calculate_xg90(xg: Decimal | None, minutes: int) -> float:
    """Calculate expected goals per 90 minutes.

    Args:
        xg: Total expected goals (Decimal from PostgreSQL, or None)
        minutes: Total minutes played

    Returns:
        xG per 90 minutes, or 0.0 if invalid input
    """
    if xg is None or minutes <= 0:
        return 0.0
    return (float(xg) / minutes) * 90


def calculate_xa90(xa: Decimal | None, minutes: int) -> float:
    """Calculate expected assists per 90 minutes.

    Args:
        xa: Total expected assists (Decimal from PostgreSQL, or None)
        minutes: Total minutes played

    Returns:
        xA per 90 minutes, or 0.0 if invalid input
    """
    if xa is None or minutes <= 0:
        return 0.0
    return (float(xa) / minutes) * 90


def calculate_xgc90(xgc: Decimal | None, minutes: int) -> float:
    """Calculate expected goals conceded per 90 minutes.

    Args:
        xgc: Total expected goals conceded (Decimal from PostgreSQL, or None)
        minutes: Total minutes played

    Returns:
        xGC per 90 minutes, or 0.0 if invalid input
    """
    if xgc is None or minutes <= 0:
        return 0.0
    return (float(xgc) / minutes) * 90


def calculate_cs90(cs: int | None, minutes: int) -> float:
    """Calculate clean sheets per 90 minutes.

    Args:
        cs: Total clean sheets (int from PostgreSQL, or None)
        minutes: Total minutes played

    Returns:
        CS per 90 minutes, or 0.0 if invalid input
    """
    if cs is None or minutes <= 0:
        return 0.0
    return (float(cs) / minutes) * 90


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


def calculate_ownership_for_season(
    player_id: int,
    picks: list[dict[str, Any]],
    num_managers: int,
    season_id: int,
) -> float:
    """Calculate ownership for a specific season.

    This is a convenience wrapper - season filtering should
    happen at the query level, but this documents the contract.

    Args:
        player_id: The player's ID
        picks: List of manager pick rows (already filtered by season)
        num_managers: Total managers in the league for this season
        season_id: Season ID (for documentation, filtering at query level)

    Returns:
        Ownership as fraction (0.0 to 1.0)
    """
    _ = season_id  # Filtering should be done at query level
    return calculate_ownership(player_id, picks, num_managers)


# =============================================================================
# 6. Buy Score Calculation
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
