"""Chips Remaining service - tracks FPL chip usage per season half.

FPL 2025-26 Rules:
- All 4 chips reset at GW20 (second half of season)
- Chips: wildcard, bboost (bench boost), 3xc (triple captain), freehit
"""

from dataclasses import dataclass, field

from app.db import get_connection

# =============================================================================
# Constants
# =============================================================================

# Gameweek boundaries for season half determination
FIRST_HALF_END = 19  # Last GW of first half (GW20+ = second half, chips reset)
SEASON_END = 38  # Last GW of season

# All available chips (lowercase, matching FPL API)
ALL_CHIPS = frozenset({"wildcard", "bboost", "3xc", "freehit"})


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
            # Get league members
            members = await conn.fetch(
                """
                SELECT manager_id, player_name
                FROM league_members
                WHERE league_id = $1 AND season_id = $2
                """,
                league_id,
                season_id,
            )

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
                    name=member["player_name"],
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
