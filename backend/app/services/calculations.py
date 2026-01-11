"""Pure calculation functions for FPL statistics.

These functions are stateless and have no database or external dependencies,
making them easy to test in isolation.

Note on caching: These functions take mutable container types (lists, dicts) as
arguments, which are unhashable and therefore incompatible with @lru_cache.
Service-level TTL caching in history.py handles caching at the appropriate level
for HTTP requests.
"""

from statistics import pstdev
from typing import Literal, TypedDict

# =============================================================================
# Constants
# =============================================================================

# Threshold percentage for determining form momentum (improving/declining vs stable)
MOMENTUM_THRESHOLD_PCT = 5

# FPL Position element_type values
GK, DEF, MID, FWD = 1, 2, 3, 4

# FPL points per action by position
POINTS_PER_GOAL = {GK: 6, DEF: 6, MID: 5, FWD: 4}
POINTS_PER_ASSIST = 3
POINTS_PER_CS = 4

# xCS approximation: teams conceding ~2.5 xGA have near-zero CS probability
XCS_DIVISOR = 2.5

# =============================================================================
# TypedDicts for type hints
# =============================================================================


class ManagerHistoryRow(TypedDict):
    """Database row structure for manager history."""

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


class PickRow(TypedDict):
    """Database row structure for manager picks."""

    manager_id: int
    gameweek: int
    player_id: int
    position: int
    multiplier: int
    is_captain: bool
    points: int


class GameweekRow(TypedDict):
    """Database row structure for gameweeks."""

    id: int
    most_captained: int | None


class PickWithXg(TypedDict, total=False):
    """Pick data with xG metrics for Tier 3 calculations.

    All xG fields are optional (total=False) as they may not be available
    for all fixtures.
    """

    element_type: int  # Position: 1=GK, 2=DEF, 3=MID, 4=FWD
    multiplier: int  # 0=bench, 1=playing, 2=captain, 3=TC
    is_captain: bool
    total_points: int  # Actual FPL points (multiplied for captain)
    expected_goals: float | None
    expected_assists: float | None
    expected_goals_conceded: float | None  # For GK/DEF
    minutes: int


# =============================================================================
# Constants
# =============================================================================

# From 2024/25 season (season_id=1), max free transfers increased from 2 to 5
MAX_FREE_TRANSFERS_NEW = 5  # Season ID >= 1 (2024-25+)
MAX_FREE_TRANSFERS_LEGACY = 2  # Hypothetical older seasons

# Season ID when new FT rules started
NEW_FT_RULES_SEASON_ID = 1  # 2024-25

# Chips that reset FT to 1
WILDCARD_CHIPS = frozenset({"wildcard"})

# Chips that don't affect FT calculation (team reverts)
REVERT_CHIPS = frozenset({"freehit"})

# Chart colors for league position bump chart (colorblind-friendly palette)
CHART_COLORS = [
    "#3b82f6",  # Blue
    "#ef4444",  # Red
    "#22c55e",  # Green
    "#f59e0b",  # Amber
    "#8b5cf6",  # Purple
    "#06b6d4",  # Cyan
    "#ec4899",  # Pink
    "#f97316",  # Orange
    "#14b8a6",  # Teal
    "#a855f7",  # Violet
    "#84cc16",  # Lime
    "#6366f1",  # Indigo
    "#64748b",  # Slate
    "#0ea5e9",  # Sky
    "#d946ef",  # Fuchsia
    "#10b981",  # Emerald
    "#eab308",  # Yellow
    "#78716c",  # Stone
    "#fb7185",  # Rose
    "#4ade80",  # Green-400
]


# =============================================================================
# Pure Functions
# =============================================================================


def calculate_bench_points(history: list[ManagerHistoryRow]) -> int:
    """Calculate total bench points across all gameweeks.

    Args:
        history: List of manager history rows with points_on_bench field

    Returns:
        Total cumulative bench points
    """
    return sum(row["points_on_bench"] for row in history)


def calculate_free_transfers(
    history: list[ManagerHistoryRow],
    current_gameweek: int,
    season_id: int = 1,
) -> int:
    """Calculate remaining free transfers for a manager.

    From 2024/25 season (season_id=1), max FT is 5 (previously 2).

    Rules:
    - Start with 1 FT at GW1
    - Unused FT carries forward (max 5 for 2024/25+, max 2 for older seasons)
    - Taking a hit (transfers_cost > 0) resets to 1 FT
    - Wildcard resets to 1 FT
    - Free hit doesn't affect FT count (team reverts)

    Args:
        history: List of manager history rows (must be sorted by gameweek)
        current_gameweek: Current gameweek number
        season_id: Integer season ID (1 = 2024-25, 2 = 2025-26, etc.)

    Returns:
        Number of free transfers remaining
    """
    if current_gameweek == 1 or not history:
        return 1

    # Determine max FT based on season
    if season_id >= NEW_FT_RULES_SEASON_ID:
        max_ft = MAX_FREE_TRANSFERS_NEW
    else:
        max_ft = MAX_FREE_TRANSFERS_LEGACY

    # Sort history by gameweek
    sorted_history = sorted(history, key=lambda x: x["gameweek"])

    ft = 1  # Start with 1 FT

    for row in sorted_history:
        gw = row["gameweek"]
        if gw >= current_gameweek:
            break

        chip = row.get("active_chip")

        # Wildcard resets FT to 1
        if chip in WILDCARD_CHIPS:
            ft = 1
            continue

        # Free hit doesn't affect FT (team reverts)
        if chip in REVERT_CHIPS:
            continue

        # Check for hit (FPL API returns positive transfers_cost when taking hits)
        transfers_cost = row.get("transfers_cost", 0)
        transfers_made = row.get("transfers_made", 0)

        if transfers_cost > 0:
            # Took a hit - reset to 1
            ft = 1
        else:
            # Calculate FT used and carry
            ft_used = min(transfers_made, ft)
            ft_remaining = ft - ft_used
            # Add 1 for next week, cap at max
            ft = min(ft_remaining + 1, max_ft)

    return ft


class CaptainDifferentialDetail(TypedDict):
    """Per-gameweek captain differential detail.

    Note: Keep in sync with CaptainDifferentialDetail Pydantic model
    in app/api/history.py (used for API response validation).
    """

    gameweek: int
    captain_id: int
    captain_name: str
    captain_points: int
    template_id: int
    template_name: str
    template_points: int
    gain: int
    multiplier: int


class CaptainDifferentialResult(TypedDict):
    """Result of captain differential calculation."""

    differential_picks: int
    gain: int
    details: list[CaptainDifferentialDetail]


def calculate_captain_differential(
    picks: list[PickRow],
    gameweeks: list[GameweekRow],
    template_captain_points: dict[int, int] | None = None,
) -> dict[str, int]:
    """Calculate captain differential statistics (aggregate only).

    A differential captain is when the manager's captain differs from
    the most-captained player (template captain).

    Args:
        picks: List of manager picks (captain picks only)
        gameweeks: List of gameweeks with most_captained player ID
        template_captain_points: Optional dict mapping gameweek -> template captain points

    Returns:
        Dict with differential_picks count and gain (points difference)
    """
    if not picks or not gameweeks:
        return {"differential_picks": 0, "gain": 0}

    # Build lookup for template captain by gameweek
    template_by_gw = {gw["id"]: gw["most_captained"] for gw in gameweeks}

    differential_picks = 0
    total_gain = 0

    for pick in picks:
        if not pick.get("is_captain"):
            continue

        gw = pick["gameweek"]
        template_captain = template_by_gw.get(gw)

        if template_captain is None:
            continue

        # Check if differential (different from template)
        if pick["player_id"] != template_captain:
            differential_picks += 1

            # Calculate points gain if template points available
            if template_captain_points and gw in template_captain_points:
                # Manager points = points * multiplier
                # If multiplier is 1 (default), captain uses 2x
                multiplier = pick.get("multiplier", 1)
                if multiplier == 1:
                    multiplier = 2  # Regular captain uses 2x
                manager_points = pick["points"] * multiplier
                # Template always uses x2 (captain)
                template_points = template_captain_points[gw] * 2

                total_gain += manager_points - template_points

    return {"differential_picks": differential_picks, "gain": total_gain}


def calculate_captain_differential_with_details(
    picks: list[PickRow],
    gameweeks: list[GameweekRow],
    player_names: dict[int, str],
    player_gw_points: dict[int, dict[int, int]],
) -> CaptainDifferentialResult:
    """Calculate captain differential with per-GW breakdown.

    Args:
        picks: List of manager picks (captain picks only)
        gameweeks: List of gameweeks with most_captained player ID
        player_names: Dict mapping player_id -> web_name
        player_gw_points: Dict mapping player_id -> {gameweek -> points}

    Returns:
        CaptainDifferentialResult with aggregate stats and per-GW details
    """
    if not picks or not gameweeks:
        return {"differential_picks": 0, "gain": 0, "details": []}

    # Build lookup for template captain by gameweek
    template_by_gw = {gw["id"]: gw["most_captained"] for gw in gameweeks}

    details: list[CaptainDifferentialDetail] = []
    total_gain = 0

    for pick in picks:
        if not pick.get("is_captain"):
            continue

        gw = pick["gameweek"]
        template_captain_id = template_by_gw.get(gw)

        if template_captain_id is None:
            continue

        captain_id = pick["player_id"]

        # Check if differential (different from template)
        if captain_id != template_captain_id:
            # Get multiplier (2 for normal, 3 for TC)
            multiplier = pick.get("multiplier", 1)
            if multiplier == 1:
                multiplier = 2  # Regular captain uses 2x

            # Get captain's raw points (before multiplier)
            captain_raw_points = pick["points"]

            # Get template captain's raw points
            template_raw_points = player_gw_points.get(template_captain_id, {}).get(gw, 0)

            # Calculate gain: (captain_raw - template_raw) * multiplier
            gain = (captain_raw_points - template_raw_points) * multiplier
            total_gain += gain

            details.append(
                {
                    "gameweek": gw,
                    "captain_id": captain_id,
                    "captain_name": player_names.get(captain_id, "Unknown"),
                    "captain_points": captain_raw_points,
                    "template_id": template_captain_id,
                    "template_name": player_names.get(template_captain_id, "Unknown"),
                    "template_points": template_raw_points,
                    "gain": gain,
                    "multiplier": multiplier,
                }
            )

    # Sort details by gameweek
    details.sort(key=lambda x: x["gameweek"])

    return {
        "differential_picks": len(details),
        "gain": total_gain,
        "details": details,
    }


def calculate_league_positions(
    history_by_manager: dict[int, list[ManagerHistoryRow]],
    gameweek: int,
) -> dict[int, int]:
    """Calculate league positions for a specific gameweek.

    Uses standard sports ranking (ties get same rank, next rank skipped).

    Args:
        history_by_manager: Dict mapping manager_id -> history rows
        gameweek: Gameweek to calculate positions for

    Returns:
        Dict mapping manager_id -> rank (1 = first place)
    """
    if not history_by_manager:
        return {}

    # Get total_points for each manager at this gameweek
    manager_points: list[tuple[int, int]] = []

    for manager_id, history in history_by_manager.items():
        gw_data = next((h for h in history if h["gameweek"] == gameweek), None)
        if gw_data:
            manager_points.append((manager_id, gw_data["total_points"]))

    if not manager_points:
        return {}

    # Sort by points descending
    manager_points.sort(key=lambda x: x[1], reverse=True)

    # Assign ranks with tie handling (standard sports ranking)
    result: dict[int, int] = {}
    current_rank = 1

    for i, (manager_id, points) in enumerate(manager_points):
        if i > 0 and points < manager_points[i - 1][1]:
            # Points lower than previous - rank is position + 1
            current_rank = i + 1

        result[manager_id] = current_rank

    return result


def calculate_consistency_score(history: list[ManagerHistoryRow]) -> float:
    """Calculate consistency score as standard deviation of gameweek points.

    Lower values indicate more consistent performance (less variance).

    Args:
        history: List of manager history rows with gameweek_points field

    Returns:
        Population standard deviation of gameweek points (0.0 if < 2 gameweeks)
    """
    if len(history) < 2:
        return 0.0

    points = [row["gameweek_points"] for row in history]
    return pstdev(points)


def calculate_bench_waste_rate(history: list[ManagerHistoryRow]) -> float:
    """Calculate average bench points as percentage of total points per GW.

    Measures how much value is being "wasted" on the bench.

    Args:
        history: List of manager history rows with gameweek_points and points_on_bench

    Returns:
        Average percentage of bench points vs total points (skips 0-point GWs)
    """
    if not history:
        return 0.0

    percentages: list[float] = []
    for row in history:
        total = row["gameweek_points"]
        if total <= 0:
            continue  # Skip zero-point gameweeks to avoid division by zero
        bench = row["points_on_bench"]
        percentages.append((bench / total) * 100)

    if not percentages:
        return 0.0

    return sum(percentages) / len(percentages)


def calculate_hit_frequency(history: list[ManagerHistoryRow]) -> float:
    """Calculate percentage of gameweeks where hits were taken.

    Args:
        history: List of manager history rows with transfers_cost field

    Returns:
        Percentage (0-100) of gameweeks with hits (transfers_cost > 0)
    """
    if not history:
        return 0.0

    hits_count = sum(1 for row in history if row["transfers_cost"] > 0)
    return (hits_count / len(history)) * 100


def calculate_last_5_average(history: list[ManagerHistoryRow]) -> float:
    """Calculate average points over the last 5 gameweeks.

    Args:
        history: List of manager history rows (any order)

    Returns:
        Average of last 5 gameweeks' points (or all GWs if < 5)
    """
    if not history:
        return 0.0

    # Sort by gameweek descending and take last 5
    sorted_history = sorted(history, key=lambda x: x["gameweek"], reverse=True)
    last_5 = sorted_history[:5]

    return sum(row["gameweek_points"] for row in last_5) / len(last_5)


# =============================================================================
# Tier 2 Calculations
# =============================================================================


FormMomentum = Literal["improving", "stable", "declining"]


def calculate_form_momentum(history: list[ManagerHistoryRow]) -> FormMomentum:
    """Calculate form momentum based on 3-GW rolling average trend.

    Compares the most recent 3-GW average to the previous 3-GW average.

    Args:
        history: List of manager history rows (any order)

    Returns:
        "improving" if recent avg > previous avg by >MOMENTUM_THRESHOLD_PCT%
        "declining" if recent avg < previous avg by >MOMENTUM_THRESHOLD_PCT%
        "stable" otherwise (or if insufficient data)
    """
    if len(history) < 6:
        return "stable"  # Need at least 6 GWs for meaningful comparison

    # Sort by gameweek descending
    sorted_history = sorted(history, key=lambda x: x["gameweek"], reverse=True)

    # Recent 3 GWs (most recent)
    recent_3 = sorted_history[:3]
    recent_avg = sum(row["gameweek_points"] for row in recent_3) / 3

    # Previous 3 GWs (4th, 5th, 6th most recent)
    previous_3 = sorted_history[3:6]
    previous_avg = sum(row["gameweek_points"] for row in previous_3) / 3

    # Avoid division by zero
    if previous_avg == 0:
        return "stable"

    # Calculate percentage change
    change_pct = ((recent_avg - previous_avg) / previous_avg) * 100

    if change_pct > MOMENTUM_THRESHOLD_PCT:
        return "improving"
    elif change_pct < -MOMENTUM_THRESHOLD_PCT:
        return "declining"
    else:
        return "stable"


def calculate_recovery_rate(history: list[ManagerHistoryRow]) -> float:
    """Calculate average points gained after red arrow gameweeks.

    A "red arrow" is a gameweek where overall rank dropped (got worse).
    Recovery rate measures how well a manager bounces back.

    Args:
        history: List of manager history rows (any order)

    Returns:
        Average points scored in GWs immediately after a red arrow.
        Returns 0.0 if no red arrows or insufficient data.
    """
    if len(history) < 2:
        return 0.0

    # Sort by gameweek ascending
    sorted_history = sorted(history, key=lambda x: x["gameweek"])

    recovery_points: list[int] = []

    for i in range(1, len(sorted_history)):
        prev_gw = sorted_history[i - 1]
        current_gw = sorted_history[i]

        prev_rank = prev_gw.get("overall_rank")
        current_rank = current_gw.get("overall_rank")

        # Skip if rank data is missing
        if prev_rank is None or current_rank is None:
            continue

        # Check if previous GW was a red arrow (rank got worse = number increased)
        # and there's a next GW to check recovery
        if current_rank > prev_rank and i + 1 < len(sorted_history):
            next_gw = sorted_history[i + 1]
            recovery_points.append(next_gw["gameweek_points"])

    if not recovery_points:
        return 0.0

    return sum(recovery_points) / len(recovery_points)


# =============================================================================
# Tier 3: xG-Based Metrics
# =============================================================================


def _calculate_appearance_bonus(minutes: int) -> int:
    """Calculate FPL appearance bonus based on minutes played.

    FPL awards: 1pt for 1-59 mins, 2pts for 60+ mins, 0pts for 0 mins.
    """
    if minutes >= 60:
        return 2
    if minutes > 0:
        return 1
    return 0


def _calculate_expected_points(
    xg: float, xa: float, xga: float, element_type: int
) -> float:
    """Calculate expected FPL points from xG/xA/xGA.

    Args:
        xg: Expected goals
        xa: Expected assists
        xga: Expected goals against (for CS calculation)
        element_type: Player position (GK=1, DEF=2, MID=3, FWD=4)

    Returns:
        Expected FPL points (excluding appearance bonus)
    """
    # Convert from Decimal (database) to float for arithmetic
    xg = float(xg)
    xa = float(xa)
    xga = float(xga)

    goal_pts = POINTS_PER_GOAL.get(element_type, 4)
    xp = xg * goal_pts + xa * POINTS_PER_ASSIST

    # For GK/DEF, add expected clean sheet contribution
    if element_type in (GK, DEF):
        xcs = max(0.0, 1.0 - xga / XCS_DIVISOR)
        xp += xcs * POINTS_PER_CS

    return xp


def _get_actual_points(
    total_points: float, appearance_bonus: int, element_type: int
) -> float:
    """Get actual FPL points excluding appearance bonus.

    For GK/DEF with clean sheet (total >= 6), we don't subtract appearance
    because CS bonus contextually includes defensive performance.

    Args:
        total_points: Raw points (or base points after dividing by multiplier)
        appearance_bonus: Points to subtract (0, 1, or 2)
        element_type: Player position

    Returns:
        Actual points excluding appearance bonus
    """
    if element_type in (GK, DEF) and total_points >= 6:
        return float(total_points)
    return float(total_points - appearance_bonus)


def calculate_luck_index(picks: list[PickWithXg]) -> float | None:
    """Calculate luck index: sum of (actual - expected) across all picks.

    Measures whether players over/underperformed their xG/xA expectations.
    Positive = lucky (players scored more than expected)
    Negative = unlucky (players scored less than expected)

    Note: For GK/DEF, we use a heuristic (total_points >= 6) to infer clean sheet.
    This may misclassify edge cases like a defender who scored but conceded.

    Args:
        picks: List of PickWithXg dicts (see TypedDict definition).

    Returns:
        Sum of luck deltas rounded to 2 decimals, or None if no valid picks.
    """
    if not picks:
        return None

    total_luck = 0.0
    valid_picks = 0

    for pick in picks:
        # Skip bench players (multiplier=0)
        if pick.get("multiplier", 1) == 0:
            continue

        # Skip players who didn't play (minutes=0)
        if pick.get("minutes", 90) == 0:
            continue

        # Skip if xG data is missing (both xG and xA are None)
        # Note: We include assists-only players as they contribute to luck
        xg = pick.get("expected_goals")
        xa = pick.get("expected_assists")
        if xg is None and xa is None:
            continue

        # Explicit None checks to avoid masking type errors
        xg = 0.0 if xg is None else xg
        xa = 0.0 if xa is None else xa
        xga_raw = pick.get("expected_goals_conceded")
        xga = 0.0 if xga_raw is None else xga_raw

        element_type = pick.get("element_type", FWD)
        total_points = pick.get("total_points", 0)
        minutes = pick.get("minutes", 90)

        xp = _calculate_expected_points(xg, xa, xga, element_type)
        appearance_bonus = _calculate_appearance_bonus(minutes)
        actual = _get_actual_points(total_points, appearance_bonus, element_type)

        luck_delta = actual - xp
        total_luck += luck_delta
        valid_picks += 1

    if valid_picks == 0:
        return None

    return round(total_luck, 2)


def calculate_captain_xp_delta(picks: list[PickWithXg]) -> float | None:
    """Calculate captain performance vs expectation.

    Measures whether captain picks overperformed or underperformed xG expectations.
    Positive = captain beat expectations
    Negative = captain underperformed expectations

    Args:
        picks: List of PickWithXg dicts (see TypedDict definition).

    Returns:
        Sum of captain deltas rounded to 2 decimals, or None if no valid captain picks.
    """
    if not picks:
        return None

    total_delta = 0.0
    valid_picks = 0

    for pick in picks:
        # Only consider effective captains (multiplier >= 2)
        # This also handles bench players (multiplier=0) since 0 < 2
        multiplier = pick.get("multiplier", 1)
        if multiplier < 2:
            continue

        # Skip captains who didn't play
        if pick.get("minutes", 90) == 0:
            continue

        # Skip if xG data is missing (xG is the primary metric for captaincy skill)
        xg = pick.get("expected_goals")
        if xg is None:
            continue

        # Explicit None checks to avoid masking type errors
        xa_raw = pick.get("expected_assists")
        xa = 0.0 if xa_raw is None else xa_raw
        xga_raw = pick.get("expected_goals_conceded")
        xga = 0.0 if xga_raw is None else xga_raw

        element_type = pick.get("element_type", FWD)
        total_points = pick.get("total_points", 0)
        minutes = pick.get("minutes", 90)

        # Calculate base points (before captain multiplier)
        base_points = total_points / multiplier

        xp = _calculate_expected_points(xg, xa, xga, element_type)
        appearance_bonus = _calculate_appearance_bonus(minutes)
        actual_base = _get_actual_points(base_points, appearance_bonus, element_type)

        delta = actual_base - xp
        total_delta += delta
        valid_picks += 1

    if valid_picks == 0:
        return None

    return round(total_delta, 2)


def calculate_squad_xp(picks: list[PickWithXg]) -> float | None:
    """Calculate squad expected performance (xGI sum).

    Measures squad quality using raw xGI values (not FPL points):
    - FWD/MID: xP = xG + xA
    - DEF/GK: xP = xG + xA + xCS (where xCS = max(0, 1 - xGA/2.5))

    Captain's xP is NOT doubled (we measure squad composition, not captain bonus).
    Bench players (multiplier=0) are excluded.

    Args:
        picks: List of PickWithXg dicts (see TypedDict definition).

    Returns:
        Total squad xP, or None if no valid data
    """
    if not picks:
        return None

    total_xp = 0.0
    valid_picks = 0

    for pick in picks:
        # Exclude bench players
        if pick.get("multiplier", 1) == 0:
            continue

        # Skip players with no xG data
        xg = pick.get("expected_goals")
        xa = pick.get("expected_assists")
        if xg is None and xa is None:
            continue

        # Explicit None checks to avoid masking type errors
        xg = 0.0 if xg is None else xg
        xa = 0.0 if xa is None else xa

        # Base xGI for all positions
        xp = xg + xa

        # Add xCS for DEF/GK
        element_type = pick.get("element_type", FWD)
        if element_type in (GK, DEF):
            xga_raw = pick.get("expected_goals_conceded")
            xga = 0.0 if xga_raw is None else xga_raw
            xcs = max(0.0, 1.0 - xga / XCS_DIVISOR)
            xp += xcs

        total_xp += xp
        valid_picks += 1

    if valid_picks == 0:
        return None

    return round(total_xp, 2)
