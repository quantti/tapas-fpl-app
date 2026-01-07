"""History service - aggregates historical FPL data for Statistics page.

Replaces ~440 frontend API calls with single backend queries.
Provides:
- League historical data aggregation
- Position history calculation (bump chart)
- Statistics computation (bench points, captain differential, free transfers)
- Head-to-head manager comparison
"""

import logging
from typing import Any, TypedDict

from app.db import get_connection

logger = logging.getLogger(__name__)


# =============================================================================
# Constants
# =============================================================================

# From 2024/25 season, max free transfers increased from 2 to 5
MAX_FREE_TRANSFERS_2024_25 = 5
MAX_FREE_TRANSFERS_LEGACY = 2

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
    season_id: str = "2024-25",
) -> int:
    """Calculate remaining free transfers for a manager.

    From 2024/25 season, max FT is 5 (previously 2).

    Rules:
    - Start with 1 FT at GW1
    - Unused FT carries forward (max 5 for 2024/25+, max 2 for older seasons)
    - Taking a hit (transfers_cost < 0) resets to 1 FT
    - Wildcard resets to 1 FT
    - Free hit doesn't affect FT count (team reverts)

    Args:
        history: List of manager history rows (must be sorted by gameweek)
        current_gameweek: Current gameweek number
        season_id: Season ID for determining max FT rule

    Returns:
        Number of free transfers remaining
    """
    if current_gameweek == 1 or not history:
        return 1

    # Determine max FT based on season
    max_ft = MAX_FREE_TRANSFERS_2024_25 if season_id >= "2024-25" else MAX_FREE_TRANSFERS_LEGACY

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


# =============================================================================
# HistoryService
# =============================================================================


class HistoryService:
    """Service for aggregating historical FPL data."""

    async def get_league_history(
        self,
        league_id: int,
        season_id: str,
        include_picks: bool = False,
    ) -> dict[str, Any]:
        """Get all historical data for a league in one call.

        Replaces ~400 frontend API calls with single backend query.

        Args:
            league_id: FPL league ID
            season_id: Season ID (e.g., "2024-25")
            include_picks: Whether to include full squad picks per gameweek

        Returns:
            Dict with league_id, season_id, managers (with history and chips)
        """
        # Convert season_id string to integer for database query
        season_int = _season_id_to_int(season_id)

        async with get_connection() as conn:
            # 1. Get league members
            members = await conn.fetch(
                """
                SELECT m.id,
                       COALESCE(m.player_first_name, '') || ' ' ||
                       COALESCE(m.player_last_name, '') as player_name,
                       m.name as team_name
                FROM league_manager lm
                JOIN manager m ON m.id = lm.manager_id AND m.season_id = lm.season_id
                WHERE lm.league_id = $1 AND lm.season_id = $2
                """,
                league_id,
                season_int,
            )

            if not members:
                return {
                    "league_id": league_id,
                    "season_id": season_id,
                    "managers": [],
                    "current_gameweek": None,
                }

            manager_ids = [m["id"] for m in members]

            # 2. Get history for all managers
            history_rows = await conn.fetch(
                """
                SELECT mgs.manager_id,
                       mgs.gameweek,
                       mgs.points as gameweek_points,
                       mgs.total_points,
                       mgs.points_on_bench,
                       mgs.overall_rank,
                       mgs.transfers_made,
                       mgs.transfers_cost,
                       mgs.bank,
                       mgs.value as team_value,
                       mgs.chip_used as active_chip
                FROM manager_gw_snapshot mgs
                WHERE mgs.manager_id = ANY($1) AND mgs.season_id = $2
                ORDER BY mgs.manager_id, mgs.gameweek
                """,
                manager_ids,
                season_int,
            )

            # 3. Get chips for all managers
            chip_rows = await conn.fetch(
                """
                SELECT cu.manager_id,
                       cu.chip_type as chip_name,
                       cu.gameweek as gameweek_used
                FROM chip_usage cu
                WHERE cu.manager_id = ANY($1) AND cu.season_id = $2
                ORDER BY cu.manager_id, cu.gameweek
                """,
                manager_ids,
                season_int,
            )

            # 4. Optionally get picks
            pick_rows: list[Any] = []
            if include_picks:
                pick_rows = await conn.fetch(
                    """
                    SELECT mgs.manager_id,
                           mgs.gameweek,
                           mp.player_id,
                           mp.position,
                           mp.multiplier,
                           mp.is_captain,
                           mp.points
                    FROM manager_pick mp
                    JOIN manager_gw_snapshot mgs ON mgs.id = mp.snapshot_id
                    WHERE mgs.manager_id = ANY($1) AND mgs.season_id = $2
                    ORDER BY mgs.manager_id, mgs.gameweek, mp.position
                    """,
                    manager_ids,
                    season_int,
                )

        # Build response
        history_by_manager: dict[int, list[dict]] = {m["id"]: [] for m in members}
        for row in history_rows:
            history_by_manager[row["manager_id"]].append(dict(row))

        chips_by_manager: dict[int, list[dict]] = {m["id"]: [] for m in members}
        for row in chip_rows:
            chips_by_manager[row["manager_id"]].append(
                {"name": row["chip_name"], "gameweek": row["gameweek_used"]}
            )

        picks_by_manager_gw: dict[int, dict[int, list[dict]]] = {}
        if include_picks:
            for row in pick_rows:
                mid = row["manager_id"]
                gw = row["gameweek"]
                if mid not in picks_by_manager_gw:
                    picks_by_manager_gw[mid] = {}
                if gw not in picks_by_manager_gw[mid]:
                    picks_by_manager_gw[mid][gw] = []
                picks_by_manager_gw[mid][gw].append(
                    {
                        "player_id": row["player_id"],
                        "position": row["position"],
                        "multiplier": row["multiplier"],
                        "is_captain": row["is_captain"],
                        "points": row["points"],
                    }
                )

        # Find current gameweek
        current_gw = max((h["gameweek"] for h in history_rows), default=None)

        managers_response = []
        for member in members:
            mid = member["id"]
            history_list = []

            for h in history_by_manager[mid]:
                gw_data = {
                    "gameweek": h["gameweek"],
                    "gameweek_points": h["gameweek_points"],
                    "total_points": h["total_points"],
                    "overall_rank": h["overall_rank"],
                    "transfers_made": h["transfers_made"],
                    "transfers_cost": h["transfers_cost"],
                    "points_on_bench": h["points_on_bench"],
                    "bank": h["bank"],
                    "team_value": h["team_value"],
                    "active_chip": h["active_chip"],
                }

                if include_picks and mid in picks_by_manager_gw:
                    gw_picks = picks_by_manager_gw[mid].get(h["gameweek"], [])
                    gw_data["picks"] = gw_picks

                history_list.append(gw_data)

            managers_response.append(
                {
                    "manager_id": mid,
                    "name": member["player_name"].strip(),
                    "team_name": member["team_name"],
                    "history": history_list,
                    "chips": chips_by_manager[mid],
                }
            )

        return {
            "league_id": league_id,
            "season_id": season_id,
            "managers": managers_response,
            "current_gameweek": current_gw,
        }

    async def get_league_positions(
        self,
        league_id: int,
        season_id: str,
    ) -> dict[str, Any]:
        """Get league position history for bump chart.

        Args:
            league_id: FPL league ID
            season_id: Season ID

        Returns:
            Dict with positions per gameweek and manager metadata
        """
        season_int = _season_id_to_int(season_id)

        async with get_connection() as conn:
            # Get league members
            members = await conn.fetch(
                """
                SELECT m.id,
                       COALESCE(m.player_first_name, '') || ' ' ||
                       COALESCE(m.player_last_name, '') as player_name,
                       m.name as team_name
                FROM league_manager lm
                JOIN manager m ON m.id = lm.manager_id AND m.season_id = lm.season_id
                WHERE lm.league_id = $1 AND lm.season_id = $2
                """,
                league_id,
                season_int,
            )

            if not members:
                return {
                    "league_id": league_id,
                    "season_id": season_id,
                    "positions": [],
                    "managers": [],
                }

            manager_ids = [m["id"] for m in members]

            # Get history
            history_rows = await conn.fetch(
                """
                SELECT mgs.manager_id,
                       mgs.gameweek,
                       mgs.total_points
                FROM manager_gw_snapshot mgs
                WHERE mgs.manager_id = ANY($1) AND mgs.season_id = $2
                ORDER BY mgs.gameweek
                """,
                manager_ids,
                season_int,
            )

        # Group history by manager
        history_by_manager: dict[int, list[ManagerHistoryRow]] = {m["id"]: [] for m in members}
        gameweeks_seen: set[int] = set()

        for row in history_rows:
            history_by_manager[row["manager_id"]].append(
                {
                    "manager_id": row["manager_id"],
                    "gameweek": row["gameweek"],
                    "gameweek_points": 0,
                    "total_points": row["total_points"],
                    "points_on_bench": 0,
                    "overall_rank": None,
                    "transfers_made": 0,
                    "transfers_cost": 0,
                    "bank": 0,
                    "team_value": 0,
                    "active_chip": None,
                }
            )
            gameweeks_seen.add(row["gameweek"])

        # Calculate positions per gameweek
        positions_list = []
        for gw in sorted(gameweeks_seen):
            positions = calculate_league_positions(history_by_manager, gw)
            positions_entry: dict[str, Any] = {"gameweek": gw}
            for mid, rank in positions.items():
                positions_entry[mid] = rank
            positions_list.append(positions_entry)

        # Build manager metadata with colors
        manager_metadata = []
        for i, member in enumerate(members):
            color = CHART_COLORS[i % len(CHART_COLORS)]
            manager_metadata.append(
                {
                    "id": member["id"],
                    "name": member["player_name"].strip(),
                    "color": color,
                }
            )

        return {
            "league_id": league_id,
            "season_id": season_id,
            "positions": positions_list,
            "managers": manager_metadata,
        }

    async def get_league_stats(
        self,
        league_id: int,
        season_id: str,
        current_gameweek: int,
    ) -> dict[str, Any]:
        """Get aggregated stats for statistics page.

        Includes bench points, captain differentials, free transfers.

        Args:
            league_id: FPL league ID
            season_id: Season ID
            current_gameweek: Current gameweek number

        Returns:
            Dict with bench_points, captain_differentials, free_transfers
        """
        season_int = _season_id_to_int(season_id)

        async with get_connection() as conn:
            # Get league members
            members = await conn.fetch(
                """
                SELECT m.id,
                       COALESCE(m.player_first_name, '') || ' ' ||
                       COALESCE(m.player_last_name, '') as player_name,
                       m.name as team_name
                FROM league_manager lm
                JOIN manager m ON m.id = lm.manager_id AND m.season_id = lm.season_id
                WHERE lm.league_id = $1 AND lm.season_id = $2
                """,
                league_id,
                season_int,
            )

            if not members:
                return {
                    "season_id": season_id,
                    "bench_points": [],
                    "captain_differentials": [],
                    "free_transfers": [],
                }

            manager_ids = [m["id"] for m in members]

            # Get history
            history_rows = await conn.fetch(
                """
                SELECT mgs.manager_id,
                       mgs.gameweek,
                       mgs.points as gameweek_points,
                       mgs.total_points,
                       mgs.points_on_bench,
                       mgs.overall_rank,
                       mgs.transfers_made,
                       mgs.transfers_cost,
                       mgs.bank,
                       mgs.value as team_value,
                       mgs.chip_used as active_chip
                FROM manager_gw_snapshot mgs
                WHERE mgs.manager_id = ANY($1) AND mgs.season_id = $2
                ORDER BY mgs.manager_id, mgs.gameweek
                """,
                manager_ids,
                season_int,
            )

            # Get captain picks
            pick_rows = await conn.fetch(
                """
                SELECT mgs.manager_id,
                       mgs.gameweek,
                       mp.player_id,
                       mp.position,
                       mp.multiplier,
                       mp.is_captain,
                       mp.points
                FROM manager_pick mp
                JOIN manager_gw_snapshot mgs ON mgs.id = mp.snapshot_id
                WHERE mgs.manager_id = ANY($1)
                  AND mgs.season_id = $2
                  AND mp.is_captain = true
                ORDER BY mgs.manager_id, mgs.gameweek
                """,
                manager_ids,
                season_int,
            )

            # Get gameweeks for template captain
            gameweek_rows = await conn.fetch(
                """
                SELECT id, most_captained
                FROM gameweek
                WHERE season_id = $1
                ORDER BY id
                """,
                season_int,
            )

        # Group data by manager
        history_by_manager: dict[int, list[ManagerHistoryRow]] = {m["id"]: [] for m in members}
        for row in history_rows:
            history_by_manager[row["manager_id"]].append(dict(row))

        picks_by_manager: dict[int, list[PickRow]] = {m["id"]: [] for m in members}
        for row in pick_rows:
            picks_by_manager[row["manager_id"]].append(dict(row))

        gameweeks: list[GameweekRow] = [dict(row) for row in gameweek_rows]

        # Calculate stats
        bench_points_list = []
        captain_diff_list = []
        free_transfers_list = []

        for member in members:
            mid = member["id"]
            name = member["player_name"].strip()
            history = history_by_manager[mid]
            picks = picks_by_manager[mid]

            # Bench points
            total_bench = calculate_bench_points(history)
            bench_points_list.append({"manager_id": mid, "name": name, "total": total_bench})

            # Captain differential
            captain_diff = calculate_captain_differential(picks, gameweeks)
            captain_diff_list.append(
                {
                    "manager_id": mid,
                    "name": name,
                    "differential_picks": captain_diff["differential_picks"],
                    "gain": captain_diff["gain"],
                }
            )

            # Free transfers
            ft_remaining = calculate_free_transfers(history, current_gameweek, season_id)
            free_transfers_list.append({"manager_id": mid, "name": name, "remaining": ft_remaining})

        return {
            "season_id": season_id,
            "bench_points": bench_points_list,
            "captain_differentials": captain_diff_list,
            "free_transfers": free_transfers_list,
        }

    async def get_manager_comparison(
        self,
        manager_a: int,
        manager_b: int,
        league_id: int,
        season_id: str,
    ) -> dict[str, Any]:
        """Get head-to-head comparison between two managers.

        Args:
            manager_a: First manager ID
            manager_b: Second manager ID
            league_id: League ID (for template calculation)
            season_id: Season ID

        Returns:
            Dict with comparison stats for both managers

        Raises:
            ValueError: If manager not found or comparing to self
        """
        if manager_a == manager_b:
            raise ValueError("Cannot compare manager to themselves")

        season_int = _season_id_to_int(season_id)

        async with get_connection() as conn:
            # Get manager A info
            manager_a_rows = await conn.fetch(
                """
                SELECT id,
                       COALESCE(player_first_name, '') || ' ' ||
                       COALESCE(player_last_name, '') as player_name,
                       name as team_name
                FROM manager
                WHERE id = $1 AND season_id = $2
                """,
                manager_a,
                season_int,
            )

            if not manager_a_rows:
                raise ValueError(f"Manager {manager_a} not found")

            # Get manager B info
            manager_b_rows = await conn.fetch(
                """
                SELECT id,
                       COALESCE(player_first_name, '') || ' ' ||
                       COALESCE(player_last_name, '') as player_name,
                       name as team_name
                FROM manager
                WHERE id = $1 AND season_id = $2
                """,
                manager_b,
                season_int,
            )

            if not manager_b_rows:
                raise ValueError(f"Manager {manager_b} not found")

            # Get history for both
            history_a = await conn.fetch(
                """
                SELECT manager_id,
                       gameweek,
                       points as gameweek_points,
                       total_points,
                       points_on_bench,
                       overall_rank,
                       transfers_made,
                       transfers_cost,
                       bank,
                       value as team_value,
                       chip_used as active_chip
                FROM manager_gw_snapshot
                WHERE manager_id = $1 AND season_id = $2
                ORDER BY gameweek
                """,
                manager_a,
                season_int,
            )

            history_b = await conn.fetch(
                """
                SELECT manager_id,
                       gameweek,
                       points as gameweek_points,
                       total_points,
                       points_on_bench,
                       overall_rank,
                       transfers_made,
                       transfers_cost,
                       bank,
                       value as team_value,
                       chip_used as active_chip
                FROM manager_gw_snapshot
                WHERE manager_id = $1 AND season_id = $2
                ORDER BY gameweek
                """,
                manager_b,
                season_int,
            )

            # Get current picks for both (most recent gameweek)
            max_gw = max(
                (r["gameweek"] for r in history_a),
                default=max((r["gameweek"] for r in history_b), default=1),
            )

            picks_a = await conn.fetch(
                """
                SELECT mp.player_id
                FROM manager_pick mp
                JOIN manager_gw_snapshot mgs ON mgs.id = mp.snapshot_id
                WHERE mgs.manager_id = $1
                  AND mgs.season_id = $2
                  AND mgs.gameweek = $3
                  AND mp.position <= 11
                """,
                manager_a,
                season_int,
                max_gw,
            )

            picks_b = await conn.fetch(
                """
                SELECT mp.player_id
                FROM manager_pick mp
                JOIN manager_gw_snapshot mgs ON mgs.id = mp.snapshot_id
                WHERE mgs.manager_id = $1
                  AND mgs.season_id = $2
                  AND mgs.gameweek = $3
                  AND mp.position <= 11
                """,
                manager_b,
                season_int,
                max_gw,
            )

            # Get chips used
            chips_a = await conn.fetch(
                """
                SELECT chip_type
                FROM chip_usage
                WHERE manager_id = $1 AND season_id = $2
                """,
                manager_a,
                season_int,
            )

            chips_b = await conn.fetch(
                """
                SELECT chip_type
                FROM chip_usage
                WHERE manager_id = $1 AND season_id = $2
                """,
                manager_b,
                season_int,
            )

        # Build stats for manager A
        history_a_list = [dict(r) for r in history_a]
        total_points_a = history_a_list[-1]["total_points"] if history_a_list else 0
        overall_rank_a = history_a_list[-1]["overall_rank"] if history_a_list else None
        total_transfers_a = sum(h["transfers_made"] for h in history_a_list)
        total_hits_a = sum(1 for h in history_a_list if h["transfers_cost"] < 0)
        hits_cost_a = sum(h["transfers_cost"] for h in history_a_list)

        # Best/worst gameweek
        best_gw_a = max(history_a_list, key=lambda x: x["gameweek_points"], default=None)
        worst_gw_a = min(history_a_list, key=lambda x: x["gameweek_points"], default=None)

        chips_used_a = [r["chip_type"] for r in chips_a]
        all_chips = ["wildcard", "bboost", "3xc", "freehit"]
        chips_remaining_a = [c for c in all_chips if c not in chips_used_a]

        # Build stats for manager B
        history_b_list = [dict(r) for r in history_b]
        total_points_b = history_b_list[-1]["total_points"] if history_b_list else 0
        overall_rank_b = history_b_list[-1]["overall_rank"] if history_b_list else None
        total_transfers_b = sum(h["transfers_made"] for h in history_b_list)
        total_hits_b = sum(1 for h in history_b_list if h["transfers_cost"] < 0)
        hits_cost_b = sum(h["transfers_cost"] for h in history_b_list)

        best_gw_b = max(history_b_list, key=lambda x: x["gameweek_points"], default=None)
        worst_gw_b = min(history_b_list, key=lambda x: x["gameweek_points"], default=None)

        chips_used_b = [r["chip_type"] for r in chips_b]
        chips_remaining_b = [c for c in all_chips if c not in chips_used_b]

        # Find common players
        players_a = {r["player_id"] for r in picks_a}
        players_b = {r["player_id"] for r in picks_b}
        common_players = sorted(players_a & players_b)

        # Template overlap is calculated from common players between managers
        # (simplified - doesn't require extra DB query)
        overlap_a = len(common_players)
        overlap_b = len(common_players)

        return {
            "season_id": season_id,
            "manager_a": {
                "manager_id": manager_a,
                "name": manager_a_rows[0]["player_name"].strip(),
                "team_name": manager_a_rows[0]["team_name"],
                "total_points": total_points_a,
                "overall_rank": overall_rank_a,
                "total_transfers": total_transfers_a,
                "total_hits": total_hits_a,
                "hits_cost": hits_cost_a,
                "chips_used": chips_used_a,
                "chips_remaining": chips_remaining_a,
                "best_gameweek": (
                    {"gw": best_gw_a["gameweek"], "points": best_gw_a["gameweek_points"]}
                    if best_gw_a
                    else None
                ),
                "worst_gameweek": (
                    {
                        "gw": worst_gw_a["gameweek"],
                        "points": worst_gw_a["gameweek_points"],
                    }
                    if worst_gw_a
                    else None
                ),
            },
            "manager_b": {
                "manager_id": manager_b,
                "name": manager_b_rows[0]["player_name"].strip(),
                "team_name": manager_b_rows[0]["team_name"],
                "total_points": total_points_b,
                "overall_rank": overall_rank_b,
                "total_transfers": total_transfers_b,
                "total_hits": total_hits_b,
                "hits_cost": hits_cost_b,
                "chips_used": chips_used_b,
                "chips_remaining": chips_remaining_b,
                "best_gameweek": (
                    {"gw": best_gw_b["gameweek"], "points": best_gw_b["gameweek_points"]}
                    if best_gw_b
                    else None
                ),
                "worst_gameweek": (
                    {
                        "gw": worst_gw_b["gameweek"],
                        "points": worst_gw_b["gameweek_points"],
                    }
                    if worst_gw_b
                    else None
                ),
            },
            "common_players": common_players,
            "league_template_overlap_a": overlap_a,
            "league_template_overlap_b": overlap_b,
        }


# =============================================================================
# Helper Functions
# =============================================================================


def _season_id_to_int(season_id: str) -> int:
    """Convert season ID string to database integer.

    The database uses integer season_id (1 for 2024-25, 2 for 2025-26).

    Args:
        season_id: Season string like "2024-25"

    Returns:
        Integer season ID for database queries
    """
    season_map = {
        "2024-25": 1,
        "2025-26": 2,
    }
    return season_map.get(season_id, 1)
