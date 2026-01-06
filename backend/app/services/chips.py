"""Chips Remaining service - tracks FPL chip usage per season half.

FPL 2025-26 Rules:
- All 4 chips reset at GW20 (second half of season)
- Chips: wildcard, bboost (bench boost), 3xc (triple captain), freehit
"""

import asyncio
import logging
from dataclasses import dataclass, field

import asyncpg

from app.db import get_connection
from app.services.fpl_client import FplApiClient, LeagueMember, LeagueStandings

logger = logging.getLogger(__name__)

# =============================================================================
# Constants
# =============================================================================

# Gameweek boundaries for season half determination
FIRST_HALF_END = 19  # Last GW of first half (GW20+ = second half, chips reset)
SEASON_END = 38  # Last GW of season

# All available chips (lowercase, matching FPL API)
ALL_CHIPS = frozenset({"wildcard", "bboost", "3xc", "freehit"})

# SQL query to fetch league members with player names (used in multiple places)
_LEAGUE_MEMBERS_SQL = """
    SELECT lm.manager_id,
           COALESCE(m.player_first_name, '') || ' ' ||
           COALESCE(m.player_last_name, '') as player_name
    FROM league_manager lm
    JOIN manager m ON m.id = lm.manager_id AND m.season_id = lm.season_id
    WHERE lm.league_id = $1 AND lm.season_id = $2
"""


# =============================================================================
# Pure Functions
# =============================================================================


def get_season_half(gameweek: int) -> int:
    """Determine which half of the season a gameweek belongs to.

    Args:
        gameweek: The gameweek number (1-38)

    Returns:
        1 for first half (GW1-19), 2 for second half (GW20-38)

    Raises:
        ValueError: If gameweek is not between 1 and 38
    """
    if not 1 <= gameweek <= SEASON_END:
        raise ValueError("Gameweek must be between 1 and 38")

    return 1 if gameweek <= FIRST_HALF_END else 2


def get_remaining_chips(used_chips: list[str]) -> list[str]:
    """Calculate which chips are still available.

    Args:
        used_chips: List of chip types that have been used

    Returns:
        List of remaining chip types, sorted alphabetically for consistent API responses
    """
    # Filter to only known chip types (ignore invalid/unknown chips)
    used_set = set(used_chips) & ALL_CHIPS
    remaining = ALL_CHIPS - used_set
    return sorted(remaining)


# =============================================================================
# Data Models
# =============================================================================


@dataclass
class ChipUsed:
    """A chip that has been used in a season half."""

    chip_type: str
    gameweek: int
    points_gained: int | None = None


@dataclass
class HalfChips:
    """Chip status for one half of a season."""

    chips_used: list[ChipUsed] = field(default_factory=list)
    chips_remaining: list[str] = field(default_factory=list)


@dataclass
class ManagerChips:
    """Chip usage for a single manager."""

    manager_id: int
    first_half: HalfChips = field(default_factory=HalfChips)
    second_half: HalfChips = field(default_factory=HalfChips)


@dataclass
class ManagerChipsWithName:
    """Chip usage for a manager with display name (for league view)."""

    manager_id: int
    name: str
    first_half: HalfChips = field(default_factory=HalfChips)
    second_half: HalfChips = field(default_factory=HalfChips)


@dataclass
class LeagueChips:
    """Chip usage for all managers in a league."""

    league_id: int
    season_id: int
    current_gameweek: int
    current_half: int
    managers: list[ManagerChipsWithName] = field(default_factory=list)


# =============================================================================
# ChipsService
# =============================================================================


class ChipsService:
    """Service for managing chip usage data."""

    async def _ensure_league_members(
        self,
        conn: asyncpg.Connection,
        league_id: int,
        season_id: int,
        fpl_client: FplApiClient,
    ) -> list[LeagueMember]:
        """
        Ensure league members are stored in the database.

        If the league doesn't exist in the database, fetches from FPL API
        and populates league, manager, and league_manager tables.

        Uses advisory lock to prevent race conditions when multiple requests
        try to populate the same league concurrently.

        Args:
            conn: Database connection
            league_id: FPL league ID
            season_id: Season ID
            fpl_client: FPL API client

        Returns:
            List of league members
        """
        # Check if we already have this league's members
        existing = await conn.fetch(_LEAGUE_MEMBERS_SQL, league_id, season_id)

        if existing:
            return [
                LeagueMember(
                    manager_id=row["manager_id"],
                    player_name=row["player_name"].strip(),
                    team_name="",  # Not needed for chips
                    rank=0,
                    total_points=0,
                )
                for row in existing
            ]

        # Use advisory lock to prevent concurrent sync attempts for same league
        # Lock key combines league_id and season_id to be unique
        lock_key = league_id * 1000 + season_id
        try:
            await conn.execute("SELECT pg_advisory_lock($1)", lock_key)

            # Double-check after acquiring lock (another request may have populated)
            existing = await conn.fetch(_LEAGUE_MEMBERS_SQL, league_id, season_id)
            if existing:
                return [
                    LeagueMember(
                        manager_id=row["manager_id"],
                        player_name=row["player_name"].strip(),
                        team_name="",
                        rank=0,
                        total_points=0,
                    )
                    for row in existing
                ]

            # Fetch from FPL API
            logger.info(f"Fetching league {league_id} members from FPL API")
            standings = await fpl_client.get_league_standings(league_id)

            if not standings.members:
                return []

            # Use transaction for atomicity
            async with conn.transaction():
                # Insert league with actual name from API
                await conn.execute(
                    """
                    INSERT INTO league (id, season_id, name)
                    VALUES ($1, $2, $3)
                    ON CONFLICT (id, season_id) DO UPDATE SET name = EXCLUDED.name
                    """,
                    league_id,
                    season_id,
                    standings.league_name,
                )

                # Batch insert managers
                manager_data = []
                for member in standings.members:
                    name_parts = member.player_name.split(" ", 1)
                    first_name = name_parts[0] if name_parts else ""
                    last_name = name_parts[1] if len(name_parts) > 1 else ""
                    manager_data.append(
                        (member.manager_id, season_id, first_name, last_name, member.team_name)
                    )

                await conn.executemany(
                    """
                    INSERT INTO manager (id, season_id, player_first_name, player_last_name, name)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (id, season_id) DO UPDATE SET
                        player_first_name = EXCLUDED.player_first_name,
                        player_last_name = EXCLUDED.player_last_name,
                        name = EXCLUDED.name
                    """,
                    manager_data,
                )

                # Batch insert league_manager relationships
                league_manager_data = [
                    (league_id, member.manager_id, season_id)
                    for member in standings.members
                ]

                await conn.executemany(
                    """
                    INSERT INTO league_manager (league_id, manager_id, season_id)
                    VALUES ($1, $2, $3)
                    ON CONFLICT DO NOTHING
                    """,
                    league_manager_data,
                )

            logger.info(f"Stored {len(standings.members)} members for league {league_id}")
            return standings.members

        finally:
            # Always release the advisory lock
            await conn.execute("SELECT pg_advisory_unlock($1)", lock_key)

    async def get_manager_chips(self, manager_id: int, season_id: int) -> ManagerChips:
        """Get chip usage for a single manager.

        Args:
            manager_id: FPL manager ID
            season_id: Season ID (1 for 2024-25)

        Returns:
            ManagerChips with first_half and second_half chip data
        """
        async with get_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT manager_id, season_id, season_half, chip_type, gameweek, points_gained
                FROM chip_usage
                WHERE manager_id = $1 AND season_id = $2
                ORDER BY gameweek
                """,
                manager_id,
                season_id,
            )

        return self._build_manager_chips(manager_id, rows)

    async def get_league_chips(
        self, league_id: int, season_id: int, current_gameweek: int
    ) -> LeagueChips:
        """Get chip usage for all managers in a league.

        Args:
            league_id: FPL league ID
            season_id: Season ID (1 for 2024-25)
            current_gameweek: Current gameweek (1-38)

        Returns:
            LeagueChips with all managers' chip data

        Raises:
            ValueError: If current_gameweek is not between 1 and 38
        """
        current_half = get_season_half(current_gameweek)  # Validates gameweek

        async with get_connection() as conn:
            # Get league members (join with manager table for player name)
            members = await conn.fetch(_LEAGUE_MEMBERS_SQL, league_id, season_id)

            if not members:
                return LeagueChips(
                    league_id=league_id,
                    season_id=season_id,
                    current_gameweek=current_gameweek,
                    current_half=current_half,
                    managers=[],
                )

            # Get chip usage for all league members
            manager_ids = [m["manager_id"] for m in members]
            chip_rows = await conn.fetch(
                """
                SELECT manager_id, season_id, season_half, chip_type, gameweek, points_gained
                FROM chip_usage
                WHERE manager_id = ANY($1) AND season_id = $2
                ORDER BY manager_id, gameweek
                """,
                manager_ids,
                season_id,
            )

        # Build chips by manager
        chips_by_manager: dict[int, list] = {m["manager_id"]: [] for m in members}
        for row in chip_rows:
            mid = row["manager_id"]
            if mid in chips_by_manager:  # Only include league members
                chips_by_manager[mid].append(row)

        # Build response
        manager_chips_list = []
        for member in members:
            mid = member["manager_id"]
            manager_chips = self._build_manager_chips(mid, chips_by_manager[mid])
            manager_chips_list.append(
                ManagerChipsWithName(
                    manager_id=mid,
                    name=member["player_name"].strip(),
                    first_half=manager_chips.first_half,
                    second_half=manager_chips.second_half,
                )
            )

        return LeagueChips(
            league_id=league_id,
            season_id=season_id,
            current_gameweek=current_gameweek,
            current_half=current_half,
            managers=manager_chips_list,
        )

    async def save_chip_usage(
        self,
        manager_id: int,
        season_id: int,
        gameweek: int,
        chip_type: str,
        points_gained: int | None,
    ) -> None:
        """Save or update chip usage record.

        Args:
            manager_id: FPL manager ID
            season_id: Season ID
            gameweek: Gameweek when chip was used (1-38)
            chip_type: Type of chip (wildcard, bboost, 3xc, freehit)
            points_gained: Points gained from chip (None for wildcard)

        Raises:
            ValueError: If gameweek or chip_type is invalid
        """
        # Validate inputs
        season_half = get_season_half(gameweek)  # Validates gameweek

        if chip_type not in ALL_CHIPS:
            raise ValueError(f"Invalid chip type: {chip_type}")

        async with get_connection() as conn:
            await conn.execute(
                """
                INSERT INTO chip_usage
                    (manager_id, season_id, season_half, chip_type, gameweek, points_gained)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (manager_id, season_id, season_half, chip_type)
                DO UPDATE SET
                    gameweek = EXCLUDED.gameweek,
                    points_gained = EXCLUDED.points_gained
                """,
                manager_id,
                season_id,
                season_half,
                chip_type,
                gameweek,
                points_gained,
            )

    async def sync_manager_chips(
        self,
        manager_id: int,
        season_id: int,
        fpl_client: FplApiClient,
    ) -> int:
        """Fetch chip usage from FPL API and save to database.

        This is the on-demand sync method. It fetches the manager's chip history
        from the FPL API and upserts into the database.

        Args:
            manager_id: FPL manager ID
            season_id: Season ID (1 for 2024-25)
            fpl_client: FPL API client instance (for rate limiting control)

        Returns:
            Number of chips synced
        """
        chips = await fpl_client.get_entry_history(manager_id)

        synced_count = 0
        for chip in chips:
            # Normalize chip names (FPL API uses different casing sometimes)
            chip_type = chip.name.lower()
            if chip_type not in ALL_CHIPS:
                logger.warning(
                    f"Unknown chip type '{chip.name}' for manager {manager_id} "
                    f"in gameweek {chip.event}. Skipping."
                )
                continue

            await self.save_chip_usage(
                manager_id=manager_id,
                season_id=season_id,
                gameweek=chip.event,
                chip_type=chip_type,
                points_gained=None,  # No points calculation per user request
            )
            synced_count += 1

        return synced_count

    async def sync_league_chips(
        self,
        league_id: int,
        season_id: int,
        fpl_client: FplApiClient,
    ) -> int:
        """Sync chip usage for all managers in a league.

        Uses asyncio.gather for concurrent requests (FplApiClient handles rate limiting).
        Continues syncing other managers if individual manager sync fails.

        If the league members aren't in the database yet, fetches them from the
        FPL API and stores them first.

        Args:
            league_id: FPL league ID
            season_id: Season ID
            fpl_client: FPL API client instance

        Returns:
            Total number of chips synced across all managers
        """
        # Ensure league members exist in DB (fetches from FPL API if needed)
        async with get_connection() as conn:
            members = await self._ensure_league_members(
                conn, league_id, season_id, fpl_client
            )

        if not members:
            return 0

        async def sync_one(manager_id: int) -> int:
            """Sync single manager, return 0 on failure."""
            try:
                return await self.sync_manager_chips(manager_id, season_id, fpl_client)
            except Exception as e:
                logger.error(f"Failed to sync chips for manager {manager_id}: {e}")
                return 0

        # Concurrent sync (FplApiClient semaphore handles rate limiting)
        tasks = [sync_one(m.manager_id) for m in members]
        results = await asyncio.gather(*tasks)

        total = sum(results)
        failed_count = results.count(0)
        if failed_count > 0:
            logger.warning(
                f"League {league_id} sync completed with {failed_count}/{len(members)} "
                f"manager failures"
            )

        return total

    def _build_manager_chips(self, manager_id: int, rows: list) -> ManagerChips:
        """Build ManagerChips from database rows.

        Args:
            manager_id: FPL manager ID
            rows: Database rows with chip_type, gameweek, points_gained, season_half

        Returns:
            ManagerChips with computed chips_used and chips_remaining per half
        """
        first_half_used: list[ChipUsed] = []
        second_half_used: list[ChipUsed] = []

        for row in rows:
            chip_type = row["chip_type"]
            # Skip empty/invalid chip types (malformed data)
            if not chip_type or chip_type not in ALL_CHIPS:
                continue

            chip = ChipUsed(
                chip_type=chip_type,
                gameweek=row["gameweek"],
                points_gained=row["points_gained"],
            )

            if row["season_half"] == 1:
                first_half_used.append(chip)
            else:
                second_half_used.append(chip)

        return ManagerChips(
            manager_id=manager_id,
            first_half=HalfChips(
                chips_used=first_half_used,
                chips_remaining=get_remaining_chips([c.chip_type for c in first_half_used]),
            ),
            second_half=HalfChips(
                chips_used=second_half_used,
                chips_remaining=get_remaining_chips([c.chip_type for c in second_half_used]),
            ),
        )
