"""History service - aggregates historical FPL data for Statistics page.

Replaces ~440 frontend API calls with single backend queries.
Provides:
- League historical data aggregation
- Position history calculation (bump chart)
- Statistics computation (bench points, captain differential, free transfers)
- Head-to-head manager comparison
"""

import logging
import time
from dataclasses import dataclass
from typing import Any, TypedDict

from app.db import get_connection
from app.services.calculations import (
    CHART_COLORS,
    GameweekRow,
    ManagerHistoryRow,
    PickRow,
    calculate_bench_points,
    calculate_bench_waste_rate,
    calculate_captain_differential_with_details,
    calculate_consistency_score,
    calculate_form_momentum,
    calculate_free_transfers,
    calculate_hit_frequency,
    calculate_last_5_average,
    calculate_league_positions,
    calculate_recovery_rate,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Domain Constants
# =============================================================================

STARTING_XI_SIZE = 11  # FPL starting lineup size (excludes 4 bench players)


# =============================================================================
# Type Definitions
# =============================================================================


class TemplateOverlapDict(TypedDict):
    """Type definition for template overlap calculation result.

    Playstyle thresholds: 9-11 Template, 5-8 Balanced, 2-4 Differential, 0-1 Maverick
    """

    match_count: int
    match_percentage: float
    matching_player_ids: list[int]
    differential_player_ids: list[int]
    playstyle_label: str


# =============================================================================
# SQL Constants
# =============================================================================

# Get league members with player names
_LEAGUE_MEMBERS_SQL = """
    SELECT m.id,
           COALESCE(m.player_first_name, '') || ' ' ||
           COALESCE(m.player_last_name, '') as player_name,
           m.name as team_name
    FROM league_manager lm
    JOIN manager m ON m.id = lm.manager_id AND m.season_id = lm.season_id
    WHERE lm.league_id = $1 AND lm.season_id = $2
"""

# Get single manager info
_MANAGER_INFO_SQL = """
    SELECT id,
           COALESCE(player_first_name, '') || ' ' ||
           COALESCE(player_last_name, '') as player_name,
           name as team_name
    FROM manager
    WHERE id = $1 AND season_id = $2
"""

# Get player names by IDs
_PLAYER_NAMES_SQL = """
    SELECT id, web_name
    FROM player
    WHERE id = ANY($1) AND season_id = $2
"""

# Get player points per gameweek (for template captain lookup)
_PLAYER_GW_POINTS_SQL = """
    SELECT pfs.player_id, pfs.gameweek, pfs.total_points
    FROM player_fixture_stats pfs
    WHERE pfs.player_id = ANY($1) AND pfs.season_id = $2
    ORDER BY pfs.player_id, pfs.gameweek
"""

# Get full history for managers
_MANAGER_HISTORY_SQL = """
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
"""

# Get history for single manager
_SINGLE_MANAGER_HISTORY_SQL = """
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
"""

# Get positions-only history (for bump chart)
_POSITIONS_HISTORY_SQL = """
    SELECT mgs.manager_id,
           mgs.gameweek,
           mgs.total_points
    FROM manager_gw_snapshot mgs
    WHERE mgs.manager_id = ANY($1) AND mgs.season_id = $2
    ORDER BY mgs.gameweek
"""

# Get chips for managers
_MANAGER_CHIPS_SQL = """
    SELECT cu.manager_id,
           cu.chip_type as chip_name,
           cu.gameweek as gameweek_used
    FROM chip_usage cu
    WHERE cu.manager_id = ANY($1) AND cu.season_id = $2
    ORDER BY cu.manager_id, cu.gameweek
"""

# Get captain picks (joins player_fixture_stats for actual points)
# SUM handles DGWs where a player has multiple fixtures
_CAPTAIN_PICKS_SQL = """
    SELECT mgs.manager_id,
           mgs.gameweek,
           mp.player_id,
           mp.position,
           mp.multiplier,
           mp.is_captain,
           COALESCE(SUM(pfs.total_points), 0) AS points
    FROM manager_pick mp
    JOIN manager_gw_snapshot mgs ON mgs.id = mp.snapshot_id
    LEFT JOIN player_fixture_stats pfs
        ON pfs.player_id = mp.player_id
        AND pfs.gameweek = mgs.gameweek
        AND pfs.season_id = mgs.season_id
    WHERE mgs.manager_id = ANY($1)
      AND mgs.season_id = $2
      AND mp.is_captain = true
    GROUP BY mgs.manager_id, mgs.gameweek, mp.player_id, mp.position, mp.multiplier, mp.is_captain
    ORDER BY mgs.manager_id, mgs.gameweek
"""

# Get full picks (for include_picks option)
# Joins player_fixture_stats for actual points, SUM handles DGWs
_FULL_PICKS_SQL = """
    SELECT mgs.manager_id,
           mgs.gameweek,
           mp.player_id,
           mp.position,
           mp.multiplier,
           mp.is_captain,
           COALESCE(SUM(pfs.total_points), 0) AS points
    FROM manager_pick mp
    JOIN manager_gw_snapshot mgs ON mgs.id = mp.snapshot_id
    LEFT JOIN player_fixture_stats pfs
        ON pfs.player_id = mp.player_id
        AND pfs.gameweek = mgs.gameweek
        AND pfs.season_id = mgs.season_id
    WHERE mgs.manager_id = ANY($1) AND mgs.season_id = $2
    GROUP BY mgs.manager_id, mgs.gameweek, mp.player_id, mp.position, mp.multiplier, mp.is_captain
    ORDER BY mgs.manager_id, mgs.gameweek, mp.position
"""

# Get gameweeks (for template captain)
_GAMEWEEKS_SQL = """
    SELECT id, most_captained
    FROM gameweek
    WHERE season_id = $1
    ORDER BY id
"""

# Get starting XI picks for a specific gameweek
_STARTING_XI_PICKS_SQL = """
    SELECT mp.player_id
    FROM manager_pick mp
    JOIN manager_gw_snapshot mgs ON mgs.id = mp.snapshot_id
    WHERE mgs.manager_id = $1
      AND mgs.season_id = $2
      AND mgs.gameweek = $3
      AND mp.position <= 11
"""

# Get chips used by single manager (includes season_half for 2025/26 rules)
_SINGLE_MANAGER_CHIPS_SQL = """
    SELECT chip_type, season_half
    FROM chip_usage
    WHERE manager_id = $1 AND season_id = $2
"""

# Get league standings (rank within league) for specific managers
# Note: league_manager.rank may be NULL if not synced from FPL API
_LEAGUE_STANDINGS_SQL = """
    SELECT manager_id, rank
    FROM league_manager
    WHERE league_id = $1 AND season_id = $2 AND manager_id = ANY($3)
"""

# Calculate league rank dynamically from manager points
# This is a fallback when league_manager.rank is not populated
_LEAGUE_RANK_DYNAMIC_SQL = """
    WITH latest_snapshots AS (
        SELECT mgs.manager_id, mgs.total_points
        FROM manager_gw_snapshot mgs
        JOIN league_manager lm ON lm.manager_id = mgs.manager_id AND lm.season_id = mgs.season_id
        WHERE lm.league_id = $1 AND mgs.season_id = $2
          AND mgs.gameweek = $3
    ),
    ranked AS (
        SELECT manager_id, total_points,
               RANK() OVER (ORDER BY total_points DESC) as rank
        FROM latest_snapshots
    )
    SELECT manager_id, rank::int
    FROM ranked
    WHERE manager_id = ANY($4)
"""

# Get league template: most owned players in starting XI across league managers
# Returns top 11 players by ownership count in current GW
_LEAGUE_TEMPLATE_SQL = """
    SELECT mp.player_id, COUNT(DISTINCT s.manager_id) as owner_count
    FROM manager_gw_snapshot s
    JOIN manager_pick mp ON mp.snapshot_id = s.id
    JOIN league_manager lm ON lm.manager_id = s.manager_id AND lm.season_id = s.season_id
    WHERE lm.league_id = $1 AND s.season_id = $2 AND s.gameweek = $3
      AND mp.position <= 11
    GROUP BY mp.player_id
    ORDER BY owner_count DESC, mp.player_id
    LIMIT 11
"""

# Get world template: globally most owned players (top 11 by selected_by_percent)
_WORLD_TEMPLATE_SQL = """
    SELECT id, selected_by_percent
    FROM player
    WHERE season_id = $1
    ORDER BY selected_by_percent DESC
    LIMIT 11
"""


# =============================================================================
# Caching
# =============================================================================

CACHE_TTL_SECONDS = 300  # 5 minutes for history data


@dataclass
class CacheEntry:
    """Cache entry with TTL.

    Note: expires_at must always be explicitly set via _set_cached().
    There is no default to avoid creating immediately-expired entries.
    """

    data: Any
    expires_at: float

    def is_valid(self) -> bool:
        return time.monotonic() < self.expires_at


_cache: dict[str, CacheEntry] = {}


def _get_cached(key: str) -> Any | None:
    """Get cached value if valid."""
    if key in _cache and _cache[key].is_valid():
        logger.debug("Cache hit for %s", key)
        return _cache[key].data
    return None


def _set_cached(key: str, data: Any) -> None:
    """Set cached value with TTL."""
    _cache[key] = CacheEntry(data=data, expires_at=time.monotonic() + CACHE_TTL_SECONDS)


def clear_cache() -> None:
    """Clear all cached data. Used by tests to prevent pollution."""
    _cache.clear()


# =============================================================================
# Season ID Validation
# =============================================================================

# Valid season IDs (database uses integers)
VALID_SEASON_IDS = frozenset({1, 2})  # 1 = 2024-25, 2 = 2025-26


def _validate_season_id(season_id: int) -> None:
    """Validate season_id is known.

    Args:
        season_id: Integer season ID

    Raises:
        ValueError: If season_id is not valid
    """
    if season_id not in VALID_SEASON_IDS:
        valid = sorted(VALID_SEASON_IDS)
        raise ValueError(f"Invalid season_id: {season_id}. Valid values: {valid}")


def _calculate_template_overlap(
    starting_xi: list[int], template_player_ids: list[int]
) -> TemplateOverlapDict:
    """Calculate overlap between a manager's XI and a template.

    Note: Mirrors TemplateOverlap Pydantic model in api/history.py

    Args:
        starting_xi: Player IDs in manager's starting XI (max STARTING_XI_SIZE)
        template_player_ids: Player IDs in the template (most owned)

    Returns:
        Dict with match_count, match_percentage, matching_player_ids,
        differential_player_ids, and playstyle_label
    """
    xi_set = set(starting_xi)
    template_set = set(template_player_ids)

    matching = xi_set & template_set
    differential = xi_set - template_set

    match_count = len(matching)
    xi_size = len(starting_xi)
    match_percentage = round((match_count / xi_size) * 100, 1) if xi_size > 0 else 0.0

    # Playstyle labels based on match count (out of STARTING_XI_SIZE=11)
    # 9-11: Template, 5-8: Balanced, 2-4: Differential, 0-1: Maverick
    if match_count >= 9:
        playstyle_label = "Template"
    elif match_count >= 5:
        playstyle_label = "Balanced"
    elif match_count >= 2:
        playstyle_label = "Differential"
    else:
        playstyle_label = "Maverick"

    return {
        "match_count": match_count,
        "match_percentage": match_percentage,
        "matching_player_ids": sorted(matching),
        "differential_player_ids": sorted(differential),
        "playstyle_label": playstyle_label,
    }


# =============================================================================
# HistoryService
# =============================================================================


class HistoryService:
    """Service for aggregating historical FPL data."""

    async def get_league_history(
        self,
        league_id: int,
        season_id: int,
        include_picks: bool = False,
    ) -> dict[str, Any]:
        """Get all historical data for a league in one call.

        Replaces ~400 frontend API calls with single backend query.

        Args:
            league_id: FPL league ID
            season_id: Integer season ID (1 = 2024-25, 2 = 2025-26)
            include_picks: Whether to include full squad picks per gameweek

        Returns:
            Dict with league_id, season_id, managers (with history and chips)
        """
        _validate_season_id(season_id)

        # Check cache (only for no-picks version)
        cache_key = f"league_history_{league_id}_{season_id}"
        if not include_picks:
            cached = _get_cached(cache_key)
            if cached is not None:
                return cached

        async with get_connection() as conn:
            # 1. Get league members
            members = await conn.fetch(_LEAGUE_MEMBERS_SQL, league_id, season_id)

            if not members:
                result = {
                    "league_id": league_id,
                    "season_id": season_id,
                    "managers": [],
                    "current_gameweek": None,
                }
                if not include_picks:
                    _set_cached(cache_key, result)
                return result

            manager_ids = [m["id"] for m in members]

            # 2. Get history and chips sequentially (asyncpg: no parallel on same conn)
            history_rows = await conn.fetch(_MANAGER_HISTORY_SQL, manager_ids, season_id)
            chip_rows = await conn.fetch(_MANAGER_CHIPS_SQL, manager_ids, season_id)

            # 3. Optionally get picks
            pick_rows: list[Any] = []
            if include_picks:
                pick_rows = await conn.fetch(_FULL_PICKS_SQL, manager_ids, season_id)

        # Build response
        history_by_manager: dict[int, list[dict]] = {m["id"]: [] for m in members}
        for row in history_rows:
            history_by_manager[row["manager_id"]].append(dict(row))

        chips_by_manager: dict[int, list[dict]] = {m["id"]: [] for m in members}
        for row in chip_rows:
            chips_by_manager[row["manager_id"]].append(
                {"chip_type": row["chip_name"], "gameweek": row["gameweek_used"]}
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

        result = {
            "league_id": league_id,
            "season_id": season_id,
            "managers": managers_response,
            "current_gameweek": current_gw,
        }

        # Cache non-picks version
        if not include_picks:
            _set_cached(cache_key, result)

        return result

    async def get_league_positions(
        self,
        league_id: int,
        season_id: int,
    ) -> dict[str, Any]:
        """Get league position history for bump chart.

        Args:
            league_id: FPL league ID
            season_id: Integer season ID

        Returns:
            Dict with positions per gameweek and manager metadata
        """
        _validate_season_id(season_id)

        # Check cache
        cache_key = f"league_positions_{league_id}_{season_id}"
        cached = _get_cached(cache_key)
        if cached is not None:
            return cached

        async with get_connection() as conn:
            # Get league members
            members = await conn.fetch(_LEAGUE_MEMBERS_SQL, league_id, season_id)

            if not members:
                result = {
                    "league_id": league_id,
                    "season_id": season_id,
                    "positions": [],
                    "managers": [],
                }
                _set_cached(cache_key, result)
                return result

            manager_ids = [m["id"] for m in members]

            # Get history
            history_rows = await conn.fetch(_POSITIONS_HISTORY_SQL, manager_ids, season_id)

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
                positions_entry[str(mid)] = rank  # Use string keys for JSON
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

        result = {
            "league_id": league_id,
            "season_id": season_id,
            "positions": positions_list,
            "managers": manager_metadata,
        }

        _set_cached(cache_key, result)
        return result

    async def get_league_stats(
        self,
        league_id: int,
        season_id: int,
        current_gameweek: int,
    ) -> dict[str, Any]:
        """Get aggregated stats for statistics page.

        Includes bench points, captain differentials (with per-GW details), free transfers.

        Args:
            league_id: FPL league ID
            season_id: Integer season ID
            current_gameweek: Current gameweek number

        Returns:
            Dict with bench_points, captain_differential (with details), free_transfers
        """
        _validate_season_id(season_id)

        # Check cache (includes current_gameweek since free transfers depend on it)
        cache_key = f"league_stats_{league_id}_{season_id}_{current_gameweek}"
        cached = _get_cached(cache_key)
        if cached is not None:
            return cached

        async with get_connection() as conn:
            # Get league members
            members = await conn.fetch(_LEAGUE_MEMBERS_SQL, league_id, season_id)

            if not members:
                # Cache empty results to prevent repeated lookups for non-existent leagues
                empty_result = {
                    "league_id": league_id,
                    "season_id": season_id,
                    "current_gameweek": current_gameweek,
                    "bench_points": [],
                    "captain_differential": [],
                    "free_transfers": [],
                }
                _set_cached(cache_key, empty_result)
                return empty_result

            manager_ids = [m["id"] for m in members]

            # Run queries sequentially (asyncpg doesn't support parallel on same connection)
            history_rows = await conn.fetch(_MANAGER_HISTORY_SQL, manager_ids, season_id)
            pick_rows = await conn.fetch(_CAPTAIN_PICKS_SQL, manager_ids, season_id)
            gameweek_rows = await conn.fetch(_GAMEWEEKS_SQL, season_id)

            # Group data by manager (in-memory, fast)
            history_by_manager: dict[int, list[ManagerHistoryRow]] = {m["id"]: [] for m in members}
            for row in history_rows:
                history_by_manager[row["manager_id"]].append(dict(row))

            picks_by_manager: dict[int, list[PickRow]] = {m["id"]: [] for m in members}
            for row in pick_rows:
                picks_by_manager[row["manager_id"]].append(dict(row))

            gameweeks: list[GameweekRow] = [dict(row) for row in gameweek_rows]

            # Collect player IDs for name/points lookup
            all_player_ids: set[int] = set()
            for picks in picks_by_manager.values():
                for pick in picks:
                    all_player_ids.add(pick["player_id"])
            for gw in gameweeks:
                if gw.get("most_captained"):
                    all_player_ids.add(gw["most_captained"])

            # Fetch player names and per-GW points (same connection)
            name_rows: list[Any] = []
            points_rows: list[Any] = []
            if all_player_ids:
                player_ids_list = list(all_player_ids)
                name_rows = await conn.fetch(_PLAYER_NAMES_SQL, player_ids_list, season_id)
                points_rows = await conn.fetch(_PLAYER_GW_POINTS_SQL, player_ids_list, season_id)

        # Build lookups (outside connection block)
        player_names: dict[int, str] = {}
        for row in name_rows:
            player_names[row["id"]] = row["web_name"]

        player_gw_points: dict[int, dict[int, int]] = {}
        for row in points_rows:
            pid = row["player_id"]
            gw = row["gameweek"]
            if pid not in player_gw_points:
                player_gw_points[pid] = {}
            player_gw_points[pid][gw] = row["total_points"]

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
            bench_points_list.append({"manager_id": mid, "name": name, "bench_points": total_bench})

            # Captain differential with details
            captain_diff = calculate_captain_differential_with_details(
                picks, gameweeks, player_names, player_gw_points
            )
            captain_diff_list.append(
                {
                    "manager_id": mid,
                    "name": name,
                    "differential_picks": captain_diff["differential_picks"],
                    "gain": captain_diff["gain"],
                    "details": captain_diff["details"],
                }
            )

            # Free transfers (now uses int season_id)
            ft_remaining = calculate_free_transfers(history, current_gameweek, season_id)
            free_transfers_list.append(
                {"manager_id": mid, "name": name, "free_transfers": ft_remaining}
            )

        result = {
            "league_id": league_id,
            "season_id": season_id,
            "current_gameweek": current_gameweek,
            "bench_points": bench_points_list,
            "captain_differential": captain_diff_list,
            "free_transfers": free_transfers_list,
        }

        _set_cached(cache_key, result)
        return result

    async def get_manager_comparison(
        self,
        manager_a: int,
        manager_b: int,
        league_id: int,
        season_id: int,
    ) -> dict[str, Any]:
        """Get head-to-head comparison between two managers.

        Args:
            manager_a: First manager ID
            manager_b: Second manager ID
            league_id: League ID (for template calculation)
            season_id: Integer season ID

        Returns:
            Dict with comparison stats for both managers

        Raises:
            ValueError: If manager not found or invalid season
        """
        _validate_season_id(season_id)

        async with get_connection() as conn:
            # Fetch both managers' info sequentially (asyncpg: no parallel on same conn)
            manager_a_rows = await conn.fetch(_MANAGER_INFO_SQL, manager_a, season_id)
            manager_b_rows = await conn.fetch(_MANAGER_INFO_SQL, manager_b, season_id)

            if not manager_a_rows:
                raise ValueError(f"Manager {manager_a} not found")
            if not manager_b_rows:
                raise ValueError(f"Manager {manager_b} not found")

            # Fetch histories
            history_a = await conn.fetch(_SINGLE_MANAGER_HISTORY_SQL, manager_a, season_id)
            history_b = await conn.fetch(_SINGLE_MANAGER_HISTORY_SQL, manager_b, season_id)

            # Determine max gameweek for picks query
            max_gw = max(
                (r["gameweek"] for r in history_a),
                default=max((r["gameweek"] for r in history_b), default=1),
            )

            # Fetch starting XI picks
            picks_a = await conn.fetch(_STARTING_XI_PICKS_SQL, manager_a, season_id, max_gw)
            picks_b = await conn.fetch(_STARTING_XI_PICKS_SQL, manager_b, season_id, max_gw)

            # Fetch chips
            chips_a = await conn.fetch(_SINGLE_MANAGER_CHIPS_SQL, manager_a, season_id)
            chips_b = await conn.fetch(_SINGLE_MANAGER_CHIPS_SQL, manager_b, season_id)

            # Fetch captain picks for both managers (for captain_points calculation)
            manager_ids = [manager_a, manager_b]
            captain_picks = await conn.fetch(_CAPTAIN_PICKS_SQL, manager_ids, season_id)

            # Fetch gameweeks for differential captain calculation
            gameweeks = await conn.fetch(_GAMEWEEKS_SQL, season_id)

            # Fetch league standings (ranks for both managers)
            # First try static rank from league_manager table
            league_standings = await conn.fetch(
                _LEAGUE_STANDINGS_SQL, league_id, season_id, manager_ids
            )

            # If static ranks are NULL, calculate dynamically from total_points
            has_null_ranks = any(r["rank"] is None for r in league_standings)
            if has_null_ranks and max_gw:
                logger.info(
                    f"Static league ranks contain NULL values, calculating dynamically "
                    f"from GW{max_gw} snapshots for managers {manager_ids}"
                )
                league_standings = await conn.fetch(
                    _LEAGUE_RANK_DYNAMIC_SQL, league_id, season_id, max_gw, manager_ids
                )
                if len(league_standings) < len(manager_ids):
                    logger.warning(
                        f"Dynamic rank calculation returned {len(league_standings)} results "
                        f"for {len(manager_ids)} managers - some snapshot data may be missing"
                    )

            # Fetch league template (most owned players in this league)
            league_template = await conn.fetch(_LEAGUE_TEMPLATE_SQL, league_id, season_id, max_gw)

            # Fetch world template (globally most owned players)
            world_template = await conn.fetch(_WORLD_TEMPLATE_SQL, season_id)

        # Build lookup for league ranks
        league_rank_lookup = {r["manager_id"]: r["rank"] for r in league_standings}

        # Extract template player IDs
        league_template_ids = [r["player_id"] for r in league_template]
        world_template_ids = [r["id"] for r in world_template]

        # Group captain picks by manager
        captain_picks_a = [p for p in captain_picks if p["manager_id"] == manager_a]
        captain_picks_b = [p for p in captain_picks if p["manager_id"] == manager_b]

        # Build gameweek lookup for template captain
        gameweeks_list: list[GameweekRow] = [dict(r) for r in gameweeks]

        # Build stats for both managers
        stats_a = self._build_manager_stats(
            manager_row=manager_a_rows[0],
            history=history_a,
            picks=picks_a,
            chips=chips_a,
            captain_picks=captain_picks_a,
            gameweeks=gameweeks_list,
            current_gameweek=max_gw,
            season_id=season_id,
            league_rank=league_rank_lookup.get(manager_a),
            league_template_ids=league_template_ids,
            world_template_ids=world_template_ids,
        )
        stats_b = self._build_manager_stats(
            manager_row=manager_b_rows[0],
            history=history_b,
            picks=picks_b,
            chips=chips_b,
            captain_picks=captain_picks_b,
            gameweeks=gameweeks_list,
            current_gameweek=max_gw,
            season_id=season_id,
            league_rank=league_rank_lookup.get(manager_b),
            league_template_ids=league_template_ids,
            world_template_ids=world_template_ids,
        )

        # Find common players
        players_a = {r["player_id"] for r in picks_a}
        players_b = {r["player_id"] for r in picks_b}
        common_players = sorted(players_a & players_b)

        return {
            "season_id": season_id,
            "manager_a": stats_a,
            "manager_b": stats_b,
            "common_players": common_players,
            "head_to_head": self._calculate_head_to_head(history_a, history_b),
        }

    def _build_manager_stats(
        self,
        manager_row: Any,
        history: list[Any],
        picks: list[Any],
        chips: list[Any],
        captain_picks: list[Any],
        gameweeks: list[GameweekRow],
        current_gameweek: int,
        season_id: int,
        league_rank: int | None = None,
        league_template_ids: list[int] | None = None,
        world_template_ids: list[int] | None = None,
    ) -> dict[str, Any]:
        """Build stats dict for a single manager.

        Args:
            manager_row: Manager info row
            history: History rows
            picks: Current starting XI picks rows
            chips: Chips used rows
            captain_picks: Captain picks with points for all GWs
            gameweeks: Gameweek data with most_captained
            current_gameweek: Current gameweek number
            season_id: Season ID for FT calculation
            league_rank: Manager's rank within the league
            league_template_ids: Player IDs in league template (most owned)
            world_template_ids: Player IDs in world template (globally most owned)

        Returns:
            Dict with manager stats
        """
        history_list: list[ManagerHistoryRow] = [dict(r) for r in history]

        total_points = history_list[-1]["total_points"] if history_list else 0
        overall_rank = history_list[-1]["overall_rank"] if history_list else None
        total_transfers = sum(h["transfers_made"] for h in history_list)
        hits_cost = sum(h["transfers_cost"] for h in history_list)
        total_hits = hits_cost // 4  # Each hit costs 4 points

        # Best/worst gameweek
        best_gw = max(history_list, key=lambda x: x["gameweek_points"], default=None)
        worst_gw = min(history_list, key=lambda x: x["gameweek_points"], default=None)

        # 2025/26 rules: ALL 4 chips reset at GW20 (season_half 1 = GW1-19, 2 = GW20-38)
        current_half = 1 if current_gameweek <= 19 else 2
        chips_used = [r["chip_type"] for r in chips if r["season_half"] == current_half]
        all_chips = ["wildcard", "bboost", "3xc", "freehit"]
        chips_remaining = [c for c in all_chips if c not in chips_used]

        # Free transfers remaining
        remaining_transfers = calculate_free_transfers(
            history_list, current_gameweek + 1, season_id
        )

        # Captain points (raw points scored by captains, not multiplied)
        captain_points = sum(p["points"] for p in captain_picks)

        # Differential captains (different from template)
        template_by_gw = {gw["id"]: gw["most_captained"] for gw in gameweeks}
        differential_captains = sum(
            1 for p in captain_picks if p["player_id"] != template_by_gw.get(p["gameweek"])
        )

        # Starting XI player IDs
        starting_xi = sorted([r["player_id"] for r in picks])

        # Tier 1 analytics - use pure calculation functions
        consistency_score = calculate_consistency_score(history_list)
        bench_waste_rate = calculate_bench_waste_rate(history_list)
        hit_frequency = calculate_hit_frequency(history_list)
        last_5_average = calculate_last_5_average(history_list)

        # Tier 2 analytics
        form_momentum = calculate_form_momentum(history_list)
        recovery_rate = calculate_recovery_rate(history_list)

        # Template overlap calculations
        league_template_overlap = (
            _calculate_template_overlap(starting_xi, league_template_ids)
            if league_template_ids
            else None
        )
        world_template_overlap = (
            _calculate_template_overlap(starting_xi, world_template_ids)
            if world_template_ids
            else None
        )

        return {
            "manager_id": manager_row["id"],
            "name": manager_row["player_name"].strip(),
            "team_name": manager_row["team_name"],
            "total_points": total_points,
            "overall_rank": overall_rank,
            "league_rank": league_rank,
            "total_transfers": total_transfers,
            "total_hits": total_hits,
            "hits_cost": hits_cost,
            "remaining_transfers": remaining_transfers,
            "captain_points": captain_points,
            "differential_captains": differential_captains,
            "chips_used": chips_used,
            "chips_remaining": chips_remaining,
            "best_gameweek": (
                {"gw": best_gw["gameweek"], "points": best_gw["gameweek_points"]}
                if best_gw
                else None
            ),
            "worst_gameweek": (
                {"gw": worst_gw["gameweek"], "points": worst_gw["gameweek_points"]}
                if worst_gw
                else None
            ),
            "starting_xi": starting_xi,
            # Template overlap
            "league_template_overlap": league_template_overlap,
            "world_template_overlap": world_template_overlap,
            # Tier 1 analytics
            "consistency_score": round(consistency_score, 2),
            "bench_waste_rate": round(bench_waste_rate, 2),
            "hit_frequency": round(hit_frequency, 2),
            "last_5_average": round(last_5_average, 2),
            # Tier 2 analytics
            "form_momentum": form_momentum,
            "recovery_rate": round(recovery_rate, 2),
        }

    def _calculate_head_to_head(
        self,
        history_a: list[Any],
        history_b: list[Any],
    ) -> dict[str, int]:
        """Calculate head-to-head record between two managers.

        Args:
            history_a: History rows for manager A
            history_b: History rows for manager B

        Returns:
            Dict with wins_a, wins_b, draws counts
        """
        # Build lookup by gameweek
        points_a = {r["gameweek"]: r["gameweek_points"] for r in history_a}
        points_b = {r["gameweek"]: r["gameweek_points"] for r in history_b}

        wins_a = 0
        wins_b = 0
        draws = 0

        # Compare only gameweeks where both have data
        common_gws = set(points_a.keys()) & set(points_b.keys())
        for gw in common_gws:
            if points_a[gw] > points_b[gw]:
                wins_a += 1
            elif points_b[gw] > points_a[gw]:
                wins_b += 1
            else:
                draws += 1

        return {"wins_a": wins_a, "wins_b": wins_b, "draws": draws}
