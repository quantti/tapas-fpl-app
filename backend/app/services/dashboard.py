"""Dashboard consolidation service - returns all league data in one call."""

from dataclasses import dataclass, field
from typing import Any

import asyncpg


def _to_float(value: Any, default: float = 0.0) -> float:
    """Convert value to float, returning default if None."""
    return float(value) if value is not None else default


class LeagueNotFoundError(Exception):
    """Raised when a league does not exist in the database."""


@dataclass(slots=True)
class ManagerPick:
    """A single player pick in a manager's squad."""

    position: int
    player_id: int
    player_name: str
    team_id: int
    team_short_name: str
    element_type: int
    is_captain: bool
    is_vice_captain: bool
    multiplier: int
    now_cost: int
    form: float
    points_per_game: float
    selected_by_percent: float


@dataclass(slots=True)
class ManagerTransfer:
    """A transfer made by a manager."""

    player_in_id: int
    player_in_name: str
    player_out_id: int
    player_out_name: str


@dataclass(slots=True)
class ManagerDashboard:
    """Full dashboard data for a single manager."""

    entry_id: int
    manager_name: str
    team_name: str
    total_points: int
    gw_points: int
    rank: int
    last_rank: int | None
    overall_rank: int | None
    last_overall_rank: int | None  # Always None - not stored in snapshot table
    bank: float
    team_value: float
    transfers_made: int
    transfer_cost: int
    total_hits_cost: int  # Cumulative transfer costs across all GWs
    chip_active: str | None
    picks: list[ManagerPick] = field(default_factory=list)
    chips_used: list[str] = field(default_factory=list)
    transfers: list[ManagerTransfer] = field(default_factory=list)


@dataclass(slots=True)
class LeagueDashboard:
    """Consolidated dashboard response."""

    league_id: int
    gameweek: int
    season_id: int
    managers: list[ManagerDashboard] = field(default_factory=list)


class DashboardService:
    """Service for fetching consolidated league dashboard data."""

    async def get_league_dashboard(
        self,
        league_id: int,
        gameweek: int,
        season_id: int,
        conn: asyncpg.Connection,
    ) -> LeagueDashboard:
        """Returns consolidated dashboard data for a league.

        Fetches all manager data including picks, chips, transfers, and standings.
        All queries run sequentially as asyncpg connections don't support concurrent
        operations on the same connection.

        Query execution order:
            1. League existence check (fail-fast if not found)
            2. Manager IDs lookup (needed for subsequent queries)
            3. Snapshots fetch (determines which managers have data)
            4-9. Data queries (sequential):
                - Picks with player/team data
                - Chips used
                - Transfers for gameweek
                - Manager info (names)
                - League standings
                - Cumulative transfer costs

        Args:
            league_id: The FPL league ID to fetch data for.
            gameweek: The gameweek number (1-38).
            season_id: The season ID.
            conn: Database connection (passed from route).

        Returns:
            LeagueDashboard containing all manager data for the league.

        Raises:
            LeagueNotFoundError: If the league does not exist.
            asyncpg.PostgresError: If any database query fails (fail-fast behavior).
        """
        # 1. Check if league exists
        league_exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM league WHERE id = $1 AND season_id = $2)",
            league_id,
            season_id,
        )
        if not league_exists:
            raise LeagueNotFoundError(f"League {league_id} not found")

        # 2. Get all manager IDs in this league
        league_managers = await conn.fetch(
            """
            SELECT manager_id
            FROM league_manager
            WHERE league_id = $1 AND season_id = $2
            """,
            league_id,
            season_id,
        )

        if not league_managers:
            return LeagueDashboard(
                league_id=league_id,
                gameweek=gameweek,
                season_id=season_id,
                managers=[],
            )

        manager_ids = [row["manager_id"] for row in league_managers]

        # 3. Batch fetch snapshots for all managers
        snapshots = await conn.fetch(
            """
            SELECT manager_id, points, total_points, overall_rank,
                   bank, value, transfers_made, transfers_cost, chip_used
            FROM manager_gw_snapshot
            WHERE manager_id = ANY($1) AND gameweek = $2 AND season_id = $3
            """,
            manager_ids,
            gameweek,
            season_id,
        )

        # Build snapshot lookup by manager_id
        snapshot_by_manager: dict[int, dict[str, Any]] = {
            row["manager_id"]: dict(row) for row in snapshots
        }

        # Only include managers with snapshots
        managers_with_snapshots = [
            mid for mid in manager_ids if mid in snapshot_by_manager
        ]

        if not managers_with_snapshots:
            return LeagueDashboard(
                league_id=league_id,
                gameweek=gameweek,
                season_id=season_id,
                managers=[],
            )

        # 4. Fetch remaining data sequentially (asyncpg connections don't support
        # concurrent operations on the same connection)

        # Picks with player and team data
        picks_rows = await conn.fetch(
            """
            SELECT
                s.manager_id,
                mp.position,
                mp.player_id,
                mp.is_captain,
                mp.is_vice_captain,
                mp.multiplier,
                p.web_name,
                p.team_id,
                p.element_type,
                p.now_cost,
                p.form,
                p.points_per_game,
                p.selected_by_percent,
                t.short_name
            FROM manager_pick mp
            JOIN manager_gw_snapshot s ON mp.snapshot_id = s.id
            JOIN player p ON mp.player_id = p.id AND p.season_id = $3
            JOIN team t ON p.team_id = t.id AND t.season_id = $3
            WHERE s.manager_id = ANY($1) AND s.gameweek = $2 AND s.season_id = $3
            ORDER BY s.manager_id, mp.position
            """,
            managers_with_snapshots,
            gameweek,
            season_id,
        )

        # Chips used (all time for managers)
        chips_rows = await conn.fetch(
            """
            SELECT manager_id, chip_type, season_half
            FROM chip_usage
            WHERE manager_id = ANY($1) AND season_id = $2
            ORDER BY manager_id, season_half
            """,
            managers_with_snapshots,
            season_id,
        )

        # Transfers for this gameweek with player names
        transfers_rows = await conn.fetch(
            """
            SELECT
                t.manager_id,
                t.player_in,
                t.player_out,
                pin.web_name AS player_in_name,
                pout.web_name AS player_out_name
            FROM transfer t
            JOIN player pin ON t.player_in = pin.id AND pin.season_id = $3
            JOIN player pout ON t.player_out = pout.id AND pout.season_id = $3
            WHERE t.manager_id = ANY($1) AND t.gameweek = $2 AND t.season_id = $3
            """,
            managers_with_snapshots,
            gameweek,
            season_id,
        )

        # Manager info (names)
        manager_info_rows = await conn.fetch(
            """
            SELECT id, player_first_name, player_last_name, name
            FROM manager
            WHERE id = ANY($1) AND season_id = $2
            """,
            managers_with_snapshots,
            season_id,
        )

        # League standings (rank, last_rank)
        standings = await conn.fetch(
            """
            SELECT manager_id, rank, last_rank, total, event_total
            FROM league_manager
            WHERE league_id = $1 AND manager_id = ANY($2) AND season_id = $3
            ORDER BY rank
            """,
            league_id,
            managers_with_snapshots,
            season_id,
        )

        # Cumulative transfer costs (total hits across all GWs up to current)
        cumulative_hits_rows = await conn.fetch(
            """
            SELECT manager_id, COALESCE(SUM(transfers_cost), 0) AS total_hits
            FROM manager_gw_snapshot
            WHERE manager_id = ANY($1) AND gameweek <= $2 AND season_id = $3
            GROUP BY manager_id
            """,
            managers_with_snapshots,
            gameweek,
            season_id,
        )

        # Build picks lookup by manager_id
        picks_by_manager: dict[int, list[ManagerPick]] = {
            mid: [] for mid in managers_with_snapshots
        }
        for row in picks_rows:
            picks_by_manager[row["manager_id"]].append(
                ManagerPick(
                    position=row["position"],
                    player_id=row["player_id"],
                    player_name=row["web_name"],
                    team_id=row["team_id"],
                    team_short_name=row["short_name"],
                    element_type=row["element_type"],
                    is_captain=row["is_captain"],
                    is_vice_captain=row["is_vice_captain"],
                    multiplier=row["multiplier"],
                    now_cost=row["now_cost"],
                    form=_to_float(row["form"]),
                    points_per_game=_to_float(row["points_per_game"]),
                    selected_by_percent=_to_float(row["selected_by_percent"]),
                )
            )

        # Build chips lookup by manager_id (format: "chiptype_half")
        chips_by_manager: dict[int, list[str]] = {
            mid: [] for mid in managers_with_snapshots
        }
        for row in chips_rows:
            chip_str = f"{row['chip_type']}_{row['season_half']}"
            chips_by_manager[row["manager_id"]].append(chip_str)

        # Build transfers lookup by manager_id
        transfers_by_manager: dict[int, list[ManagerTransfer]] = {
            mid: [] for mid in managers_with_snapshots
        }
        for row in transfers_rows:
            transfers_by_manager[row["manager_id"]].append(
                ManagerTransfer(
                    player_in_id=row["player_in"],
                    player_in_name=row["player_in_name"],
                    player_out_id=row["player_out"],
                    player_out_name=row["player_out_name"],
                )
            )

        # Build manager info lookup
        info_by_manager: dict[int, dict[str, Any]] = {
            row["id"]: dict(row) for row in manager_info_rows
        }

        # Build cumulative hits lookup
        hits_by_manager: dict[int, int] = {
            row["manager_id"]: row["total_hits"] for row in cumulative_hits_rows
        }

        # 4. Assemble managers sorted by rank
        managers: list[ManagerDashboard] = []
        for row in standings:
            mid = row["manager_id"]
            if mid not in snapshot_by_manager:
                continue

            snapshot = snapshot_by_manager[mid]
            info = info_by_manager.get(mid, {})

            manager_name = " ".join(
                filter(
                    None,
                    [info.get("player_first_name"), info.get("player_last_name")],
                )
            )

            managers.append(
                ManagerDashboard(
                    entry_id=mid,
                    manager_name=manager_name,
                    team_name=info.get("name", ""),
                    total_points=snapshot["total_points"],
                    gw_points=snapshot["points"],
                    rank=row["rank"],
                    last_rank=row["last_rank"],
                    overall_rank=snapshot["overall_rank"],
                    last_overall_rank=None,  # Not stored in current snapshot
                    bank=(snapshot["bank"] or 0) / 10.0,  # Convert from 0.1M to millions
                    team_value=(snapshot["value"] or 0) / 10.0,
                    transfers_made=snapshot["transfers_made"],
                    transfer_cost=snapshot["transfers_cost"],
                    total_hits_cost=hits_by_manager.get(mid, 0),
                    chip_active=snapshot["chip_used"],
                    picks=picks_by_manager.get(mid, []),
                    chips_used=chips_by_manager.get(mid, []),
                    transfers=transfers_by_manager.get(mid, []),
                )
            )

        return LeagueDashboard(
            league_id=league_id,
            gameweek=gameweek,
            season_id=season_id,
            managers=managers,
        )
