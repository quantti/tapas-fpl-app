"""Pure calculation functions for FPL statistics.

These functions are stateless and have no database or external dependencies,
making them easy to test in isolation.

Note on caching: These functions take mutable container types (lists, dicts) as
arguments, which are unhashable and therefore incompatible with @lru_cache.
Service-level TTL caching in history.py handles caching at the appropriate level
for HTTP requests.
"""

from typing import TypedDict


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
    - Taking a hit (transfers_cost < 0) resets to 1 FT
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
    max_ft = MAX_FREE_TRANSFERS_NEW if season_id >= NEW_FT_RULES_SEASON_ID else MAX_FREE_TRANSFERS_LEGACY

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

        # Check for hit (transfers_cost is negative when taking hits)
        transfers_cost = row.get("transfers_cost", 0)
        transfers_made = row.get("transfers_made", 0)

        if transfers_cost < 0:
            # Took a hit - reset to 1
            ft = 1
        else:
            # Calculate FT used and carry
            ft_used = min(transfers_made, ft)
            ft_remaining = ft - ft_used
            # Add 1 for next week, cap at max
            ft = min(ft_remaining + 1, max_ft)

    return ft


def calculate_captain_differential(
    picks: list[PickRow],
    gameweeks: list[GameweekRow],
    template_captain_points: dict[int, int] | None = None,
) -> dict[str, int]:
    """Calculate captain differential statistics.

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
