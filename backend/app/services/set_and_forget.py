"""Set and Forget calculation service.

Calculates hypothetical points if a manager kept their first squad all season:
1. Uses first gameweek picks only (handles late joiners who started after GW1)
2. Applies auto-sub rules when starters have 0 minutes
3. Uses original captain; falls back to vice-captain if captain has 0 mins
4. Applies TC/BB chips, ignores Wildcard/Free Hit squad changes
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import TypedDict, cast

from app.db import get_connection

logger = logging.getLogger(__name__)

# =============================================================================
# Constants
# =============================================================================

GK = 1
DEF = 2
MID = 3
FWD = 4

# Formation constraints: minimum players required per position
MIN_DEF = 3
MIN_FWD = 1


# =============================================================================
# TypedDicts
# =============================================================================


class GW1Pick(TypedDict):
    """GW1 pick with player info."""

    player_id: int
    position: int  # 1-15
    is_captain: bool
    is_vice_captain: bool
    multiplier: int
    element_type: int  # Position type: 1=GK, 2=DEF, 3=MID, 4=FWD


class PlayerStats(TypedDict):
    """Player fixture stats for a gameweek."""

    player_id: int
    gameweek: int
    total_points: int
    minutes: int


# =============================================================================
# Result Dataclass
# =============================================================================


@dataclass
class SetAndForgetResult:
    """Result of Set and Forget calculation."""

    total_points: int
    actual_points: int
    difference: int
    auto_subs_made: int
    captain_points_gained: int  # Extra points from captain multiplier


# =============================================================================
# Service Class
# =============================================================================


class SetAndForgetService:
    """Service for calculating Set and Forget points."""

    async def calculate(
        self,
        manager_id: int,
        season_id: int,
        current_gameweek: int,
    ) -> SetAndForgetResult:
        """Calculate Set and Forget points for a manager.

        Args:
            manager_id: FPL manager ID
            season_id: Season ID
            current_gameweek: Current/target gameweek

        Returns:
            SetAndForgetResult with total points and comparison data

        Raises:
            ValueError: If current_gameweek is not between 1 and 38
        """
        if not 1 <= current_gameweek <= 38:
            raise ValueError(f"Gameweek must be between 1 and 38, got {current_gameweek}")

        try:
            async with get_connection() as conn:
                # 1. Find manager's first gameweek (handles late joiners like GW2 starters)
                first_gw = await conn.fetchval(
                    """
                    SELECT MIN(gameweek)
                    FROM manager_gw_snapshot
                    WHERE manager_id = $1 AND season_id = $2
                    """,
                    manager_id,
                    season_id,
                )

                if first_gw is None:
                    logger.info(
                        "Manager %d has no snapshots in season %d",
                        manager_id,
                        season_id,
                    )
                    return SetAndForgetResult(
                        total_points=0,
                        actual_points=0,
                        difference=0,
                        auto_subs_made=0,
                        captain_points_gained=0,
                    )

                # 2. Fetch first GW picks with player info
                # manager_pick links to manager_gw_snapshot via snapshot_id
                picks_rows = await conn.fetch(
                    """
                    SELECT mp.player_id, mp.position, mp.is_captain, mp.is_vice_captain,
                           mp.multiplier, p.element_type
                    FROM manager_pick mp
                    JOIN manager_gw_snapshot mgs ON mp.snapshot_id = mgs.id
                    JOIN player p ON p.id = mp.player_id AND p.season_id = mgs.season_id
                    WHERE mgs.manager_id = $1 AND mgs.season_id = $2 AND mgs.gameweek = $3
                    ORDER BY mp.position
                    """,
                    manager_id,
                    season_id,
                    first_gw,
                )

                if not picks_rows:
                    logger.warning(
                        "Manager %d has snapshot for GW%d but no picks (data sync issue)",
                        manager_id,
                        first_gw,
                    )
                    return SetAndForgetResult(
                        total_points=0,
                        actual_points=0,
                        difference=0,
                        auto_subs_made=0,
                        captain_points_gained=0,
                    )

                # Convert to typed dicts (asyncpg.Record is structurally compatible)
                picks = cast(list[GW1Pick], [dict(row) for row in picks_rows])

                # 3. Fetch all fixture stats for these players from first_gw to current GW
                # Uses player_fixture_stats (populated by Points Against collection)
                # instead of player_gw_stats (empty - no sync script)
                player_ids = [p["player_id"] for p in picks]
                stats_rows = await conn.fetch(
                    """
                    SELECT pfs.player_id, pfs.gameweek, pfs.total_points, pfs.minutes
                    FROM player_fixture_stats pfs
                    WHERE pfs.player_id = ANY($1)
                      AND pfs.season_id = $2
                      AND pfs.gameweek >= $3
                      AND pfs.gameweek <= $4
                    ORDER BY pfs.gameweek, pfs.player_id
                    """,
                    player_ids,
                    season_id,
                    first_gw,
                    current_gameweek,
                )

                # Group stats by gameweek -> player_id, summing for DGW
                stats_by_gw: dict[int, dict[int, PlayerStats]] = {}
                for row in stats_rows:
                    gw = row["gameweek"]
                    player_id = row["player_id"]
                    if gw not in stats_by_gw:
                        stats_by_gw[gw] = {}
                    if player_id not in stats_by_gw[gw]:
                        stats_by_gw[gw][player_id] = {
                            "player_id": player_id,
                            "gameweek": gw,
                            "total_points": 0,
                            "minutes": 0,
                        }
                    # Sum points and minutes across multiple fixtures (DGW)
                    stats_by_gw[gw][player_id]["total_points"] += row["total_points"]
                    stats_by_gw[gw][player_id]["minutes"] += row["minutes"]

                # 4. Fetch chip usage (only from first_gw onwards)
                chip_rows = await conn.fetch(
                    """
                    SELECT chip_type, gameweek
                    FROM chip_usage
                    WHERE manager_id = $1 AND season_id = $2
                      AND gameweek >= $3 AND gameweek <= $4
                    """,
                    manager_id,
                    season_id,
                    first_gw,
                    current_gameweek,
                )
                chips_by_gw: dict[int, str] = {row["gameweek"]: row["chip_type"] for row in chip_rows}

                # 5. Fetch actual total points for comparison (from first_gw onwards)
                # Note: The column is named 'points' in manager_gw_snapshot schema
                actual_points = await conn.fetchval(
                    """
                    SELECT COALESCE(SUM(points), 0)
                    FROM manager_gw_snapshot
                    WHERE manager_id = $1 AND season_id = $2
                      AND gameweek >= $3 AND gameweek <= $4
                    """,
                    manager_id,
                    season_id,
                    first_gw,
                    current_gameweek,
                )
        except Exception as error:
            logger.error(
                "Database error in SetAndForgetService.calculate for "
                "manager_id=%d, season_id=%d, gameweek=%d: %s",
                manager_id,
                season_id,
                current_gameweek,
                str(error),
                exc_info=True,
            )
            raise

        # 6. Calculate points for each gameweek (from first_gw onwards)
        total_points = 0
        total_auto_subs = 0
        total_captain_bonus = 0

        for gw in range(first_gw, current_gameweek + 1):
            gw_stats = stats_by_gw.get(gw, {})
            chip = chips_by_gw.get(gw)

            gw_points, auto_subs, captain_bonus = self._calculate_gameweek_points(
                picks=picks,
                stats=gw_stats,
                chip=chip,
            )

            total_points += gw_points
            total_auto_subs += auto_subs
            total_captain_bonus += captain_bonus

        return SetAndForgetResult(
            total_points=total_points,
            actual_points=actual_points or 0,
            difference=total_points - (actual_points or 0),
            auto_subs_made=total_auto_subs,
            captain_points_gained=total_captain_bonus,
        )

    def _calculate_gameweek_points(
        self,
        picks: list[GW1Pick],
        stats: dict[int, PlayerStats],
        chip: str | None,
    ) -> tuple[int, int, int]:
        """Calculate points for a single gameweek.

        Returns:
            Tuple of (total_points, auto_subs_made, captain_bonus_points)
        """
        # Separate starting XI and bench
        starters = [p for p in picks if p["position"] <= 11]
        bench = [p for p in picks if p["position"] > 11]

        # Get minutes for each player
        def get_minutes(player_id: int) -> int:
            if player_id in stats:
                return stats[player_id]["minutes"]
            return 0

        def get_points(player_id: int) -> int:
            if player_id in stats:
                return stats[player_id]["total_points"]
            return 0

        # Find captain and vice-captain
        captain = next((p for p in picks if p["is_captain"]), None)
        vice_captain = next((p for p in picks if p["is_vice_captain"]), None)

        # Determine active captain (VC if captain has 0 mins)
        captain_played = captain and get_minutes(captain["player_id"]) > 0
        vc_played = vice_captain and get_minutes(vice_captain["player_id"]) > 0

        active_captain_id: int | None = None
        if captain_played:
            active_captain_id = captain["player_id"]
        elif vc_played:
            active_captain_id = vice_captain["player_id"]

        # Determine captain multiplier based on chip
        captain_multiplier = 3 if chip == "3xc" else 2

        # Handle Bench Boost - all 15 players count, no auto-subs
        if chip == "bboost":
            total = 0
            captain_bonus = 0

            for pick in picks:
                points = get_points(pick["player_id"])
                if pick["player_id"] == active_captain_id:
                    bonus = points * (captain_multiplier - 1)
                    captain_bonus += bonus
                    total += points * captain_multiplier
                else:
                    total += points

            return total, 0, captain_bonus

        # Normal calculation with auto-subs
        auto_subs = 0
        playing_xi: list[GW1Pick] = []
        used_bench_players: set[int] = set()

        # Count positions in starting XI
        position_counts = {GK: 0, DEF: 0, MID: 0, FWD: 0}
        for p in starters:
            position_counts[p["element_type"]] += 1

        # Process starters - check who needs subbing
        for starter in starters:
            mins = get_minutes(starter["player_id"])
            if mins > 0:
                playing_xi.append(starter)
            else:
                # Need a sub - find valid replacement from bench
                sub = self._find_valid_sub(
                    starter=starter,
                    bench=bench,
                    playing_xi=playing_xi,
                    position_counts=position_counts,
                    get_minutes=get_minutes,
                    used_bench_players=used_bench_players,
                )
                if sub:
                    playing_xi.append(sub)
                    used_bench_players.add(sub["player_id"])
                    # Update position counts
                    position_counts[starter["element_type"]] -= 1
                    position_counts[sub["element_type"]] += 1
                    auto_subs += 1
                else:
                    # No valid sub, player scores 0
                    playing_xi.append(starter)

        # Calculate points
        total = 0
        captain_bonus = 0

        for pick in playing_xi:
            points = get_points(pick["player_id"])
            if pick["player_id"] == active_captain_id:
                bonus = points * (captain_multiplier - 1)
                captain_bonus += bonus
                total += points * captain_multiplier
            else:
                total += points

        return total, auto_subs, captain_bonus

    def _find_valid_sub(
        self,
        starter: GW1Pick,
        bench: list[GW1Pick],
        playing_xi: list[GW1Pick],
        position_counts: dict[int, int],
        get_minutes: Callable[[int], int],
        used_bench_players: set[int],
    ) -> GW1Pick | None:
        """Find a valid substitute from the bench.

        Rules:
        - GK can only be replaced by GK (position 15)
        - Outfield must maintain: min 3 DEF, min 1 FWD
        - Sub must have > 0 minutes
        - Bench priority: positions 12, 13, 14, 15

        Returns:
            Valid substitute pick, or None if no valid sub available
        """
        is_gk_sub = starter["element_type"] == GK

        # Sort bench by position (12, 13, 14, 15)
        sorted_bench = sorted(bench, key=lambda p: p["position"])

        for candidate in sorted_bench:
            # Skip if already used as sub
            if candidate["player_id"] in used_bench_players:
                continue

            # Skip if already in playing XI (shouldn't happen, but safety check)
            if any(p["player_id"] == candidate["player_id"] for p in playing_xi):
                continue

            # Skip if 0 minutes
            if get_minutes(candidate["player_id"]) == 0:
                continue

            # GK can only replace GK
            if is_gk_sub:
                if candidate["element_type"] == GK:
                    return candidate
                continue

            # Non-GK sub - check formation validity
            if candidate["element_type"] == GK:
                continue  # Can't sub GK for outfield

            # Check if removing starter violates formation
            new_counts = position_counts.copy()
            new_counts[starter["element_type"]] -= 1
            new_counts[candidate["element_type"]] += 1

            # Validate formation
            if new_counts[DEF] >= MIN_DEF and new_counts[FWD] >= MIN_FWD:
                return candidate

        return None
