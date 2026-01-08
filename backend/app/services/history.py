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
from typing import Any

from app.db import get_connection
from app.services.calculations import (
    CHART_COLORS,
    GameweekRow,
    ManagerHistoryRow,
    PickRow,
    calculate_bench_points,
    calculate_captain_differential_with_details,
    calculate_free_transfers,
    calculate_league_positions,
)

logger = logging.getLogger(__name__)


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

# Get captain picks
_CAPTAIN_PICKS_SQL = """
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
"""

# Get full picks (for include_picks option)
_FULL_PICKS_SQL = """
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

# Get chips used by single manager
_SINGLE_MANAGER_CHIPS_SQL = """
    SELECT chip_type
    FROM chip_usage
    WHERE manager_id = $1 AND season_id = $2
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

        async with get_connection() as conn:
            # Get league members
            members = await conn.fetch(_LEAGUE_MEMBERS_SQL, league_id, season_id)

            if not members:
                return {
                    "season_id": season_id,
                    "bench_points": [],
                    "captain_differential": [],
                    "free_transfers": [],
                }

            manager_ids = [m["id"] for m in members]

            # Run queries sequentially (asyncpg doesn't support parallel queries on same connection)
            history_rows = await conn.fetch(_MANAGER_HISTORY_SQL, manager_ids, season_id)
            pick_rows = await conn.fetch(_CAPTAIN_PICKS_SQL, manager_ids, season_id)
            gameweek_rows = await conn.fetch(_GAMEWEEKS_SQL, season_id)

        # Group data by manager
        history_by_manager: dict[int, list[ManagerHistoryRow]] = {m["id"]: [] for m in members}
        for row in history_rows:
            history_by_manager[row["manager_id"]].append(dict(row))

        picks_by_manager: dict[int, list[PickRow]] = {m["id"]: [] for m in members}
        for row in pick_rows:
            picks_by_manager[row["manager_id"]].append(dict(row))

        gameweeks: list[GameweekRow] = [dict(row) for row in gameweek_rows]

        # Collect all unique player IDs (captains + template captains)
        all_player_ids: set[int] = set()
        for picks in picks_by_manager.values():
            for pick in picks:
                all_player_ids.add(pick["player_id"])
        for gw in gameweeks:
            if gw.get("most_captained"):
                all_player_ids.add(gw["most_captained"])

        # Fetch player names and per-GW points
        player_names: dict[int, str] = {}
        player_gw_points: dict[int, dict[int, int]] = {}

        if all_player_ids:
            async with get_connection() as conn:
                player_ids_list = list(all_player_ids)
                # Run sequentially (asyncpg: no parallel on same connection)
                name_rows = await conn.fetch(_PLAYER_NAMES_SQL, player_ids_list, season_id)
                points_rows = await conn.fetch(_PLAYER_GW_POINTS_SQL, player_ids_list, season_id)

            # Build player name lookup
            for row in name_rows:
                player_names[row["id"]] = row["web_name"]

            # Build player GW points lookup
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
            free_transfers_list.append({
                "manager_id": mid, "name": name, "free_transfers": ft_remaining
            })

        return {
            "league_id": league_id,
            "season_id": season_id,
            "current_gameweek": current_gameweek,
            "bench_points": bench_points_list,
            "captain_differential": captain_diff_list,
            "free_transfers": free_transfers_list,
        }

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

            # Fetch picks and chips
            picks_a = await conn.fetch(_STARTING_XI_PICKS_SQL, manager_a, season_id, max_gw)
            picks_b = await conn.fetch(_STARTING_XI_PICKS_SQL, manager_b, season_id, max_gw)
            chips_a = await conn.fetch(_SINGLE_MANAGER_CHIPS_SQL, manager_a, season_id)
            chips_b = await conn.fetch(_SINGLE_MANAGER_CHIPS_SQL, manager_b, season_id)

        # Build stats for both managers
        stats_a = self._build_manager_stats(
            manager_a_rows[0], history_a, picks_a, chips_a
        )
        stats_b = self._build_manager_stats(
            manager_b_rows[0], history_b, picks_b, chips_b
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
            "league_template_overlap_a": len(common_players),
            "league_template_overlap_b": len(common_players),
        }

    def _build_manager_stats(
        self,
        manager_row: Any,
        history: list[Any],
        picks: list[Any],
        chips: list[Any],
    ) -> dict[str, Any]:
        """Build stats dict for a single manager.

        Args:
            manager_row: Manager info row
            history: History rows
            picks: Current picks rows
            chips: Chips used rows

        Returns:
            Dict with manager stats
        """
        history_list = [dict(r) for r in history]

        total_points = history_list[-1]["total_points"] if history_list else 0
        overall_rank = history_list[-1]["overall_rank"] if history_list else None
        total_transfers = sum(h["transfers_made"] for h in history_list)
        total_hits = sum(1 for h in history_list if h["transfers_cost"] < 0)
        hits_cost = sum(h["transfers_cost"] for h in history_list)

        # Best/worst gameweek
        best_gw = max(history_list, key=lambda x: x["gameweek_points"], default=None)
        worst_gw = min(history_list, key=lambda x: x["gameweek_points"], default=None)

        chips_used = [r["chip_type"] for r in chips]
        all_chips = ["wildcard", "bboost", "3xc", "freehit"]
        chips_remaining = [c for c in all_chips if c not in chips_used]

        return {
            "manager_id": manager_row["id"],
            "name": manager_row["player_name"].strip(),
            "team_name": manager_row["team_name"],
            "total_points": total_points,
            "overall_rank": overall_rank,
            "total_transfers": total_transfers,
            "total_hits": total_hits,
            "hits_cost": hits_cost,
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
        }
