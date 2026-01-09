"""History API routes - League history, positions, stats, and comparison endpoints."""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field

from app.dependencies import require_db
from app.services.history import HistoryService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/history", tags=["history"])


# =============================================================================
# Pydantic Response Models
# =============================================================================


class ChipUsage(BaseModel):
    """A chip used by a manager."""

    chip_type: str
    gameweek: int = Field(ge=1, le=38)


class PickRecord(BaseModel):
    """A player pick in a manager's squad."""

    player_id: int
    position: int = Field(ge=1, le=15)
    multiplier: int = Field(ge=0, le=3)
    is_captain: bool
    points: int


class ManagerHistoryRecord(BaseModel):
    """Manager history for a single gameweek."""

    gameweek: int = Field(ge=1, le=38)
    gameweek_points: int
    total_points: int
    points_on_bench: int
    overall_rank: int | None
    transfers_made: int = Field(ge=0)
    transfers_cost: int = Field(le=0)  # Always 0 or negative
    bank: int = Field(ge=0)
    team_value: int = Field(ge=0)
    active_chip: str | None
    picks: list[PickRecord] | None = None  # Only present when include_picks=true


class ManagerData(BaseModel):
    """Full data for a manager in league history response."""

    manager_id: int
    name: str
    team_name: str
    history: list[ManagerHistoryRecord]
    chips: list[ChipUsage]


class LeagueHistoryResponse(BaseModel):
    """Response for GET /league/{league_id}."""

    league_id: int
    season_id: int
    current_gameweek: int | None = Field(ge=1, le=38, default=None)
    managers: list[ManagerData]


class ManagerMetadata(BaseModel):
    """Manager metadata for chart rendering."""

    id: int
    name: str
    color: str


class LeaguePositionsResponse(BaseModel):
    """Response for GET /league/{league_id}/positions.

    Note: The 'positions' field uses dynamic keys (manager_ids as strings).
    Each position entry has 'gameweek' and manager_id: rank pairs.
    Example: [{"gameweek": 1, "123": 2, "456": 1}]
    """

    league_id: int
    season_id: int
    positions: list[dict[str, Any]]  # Pivoted data with dynamic manager ID keys
    managers: list[ManagerMetadata]


class BenchPointsStat(BaseModel):
    """Bench points statistic for a manager."""

    manager_id: int
    name: str
    bench_points: int = Field(ge=0)


class FreeTransferStat(BaseModel):
    """Free transfers remaining for a manager."""

    manager_id: int
    name: str
    free_transfers: int = Field(ge=1, le=5)


class CaptainDifferentialDetail(BaseModel):
    """Per-gameweek captain differential detail.

    Note: Keep in sync with CaptainDifferentialDetail TypedDict
    in app/services/calculations.py (used for internal calculations).
    """

    gameweek: int = Field(ge=1, le=38)
    captain_id: int
    captain_name: str
    captain_points: int
    template_id: int
    template_name: str
    template_points: int
    gain: int  # Can be negative
    multiplier: int = Field(ge=2, le=3)  # 2 for normal, 3 for TC


class CaptainDifferentialStat(BaseModel):
    """Captain differential statistic for a manager."""

    manager_id: int
    name: str
    differential_picks: int = Field(ge=0)
    gain: int  # Can be negative
    details: list[CaptainDifferentialDetail]


class LeagueStatsResponse(BaseModel):
    """Response for GET /league/{league_id}/stats."""

    league_id: int
    season_id: int
    current_gameweek: int = Field(ge=1, le=38)
    bench_points: list[BenchPointsStat]
    free_transfers: list[FreeTransferStat]
    captain_differential: list[CaptainDifferentialStat]


class GameweekExtreme(BaseModel):
    """Best or worst gameweek record."""

    gw: int = Field(ge=1, le=38)
    points: int


class TemplateOverlap(BaseModel):
    """Template team overlap statistics."""

    match_count: int = Field(ge=0, le=11, description="Number of matching players")
    match_percentage: float = Field(ge=0, le=100, description="Percentage of XI matching")
    matching_player_ids: list[int] = Field(description="Player IDs that match template")
    differential_player_ids: list[int] = Field(description="Player IDs not in template")
    playstyle_label: str = Field(
        description="Playstyle label: Template (9-11), Balanced (5-8), Differential (2-4), Maverick (0-1)"
    )


class ManagerComparisonStats(BaseModel):
    """Comparison stats for a single manager."""

    # Identity
    manager_id: int
    name: str
    team_name: str

    # Season totals
    total_points: int
    overall_rank: int | None
    league_rank: int | None = Field(
        default=None, ge=1, description="Manager's rank within the league"
    )

    # Transfers
    total_transfers: int = Field(ge=0)
    total_hits: int = Field(ge=0)
    hits_cost: int = Field(le=0)  # Negative value (cost)
    remaining_transfers: int = Field(ge=1, le=5, description="Free transfers available")

    # Captain performance
    captain_points: int = Field(ge=0, description="Total captain points (with multiplier)")
    differential_captains: int = Field(ge=0, description="GWs with non-template captain")

    # Chips (current half-season)
    chips_used: list[str]
    chips_remaining: list[str]

    # Gameweek extremes
    best_gameweek: GameweekExtreme | None
    worst_gameweek: GameweekExtreme | None

    # Current squad
    starting_xi: list[int] = Field(
        min_length=0, max_length=11, description="Player IDs in starting XI"
    )

    # Template overlap
    league_template_overlap: TemplateOverlap | None = Field(
        default=None, description="Overlap with league's most owned players"
    )
    world_template_overlap: TemplateOverlap | None = Field(
        default=None, description="Overlap with globally most owned players"
    )

    # Tier 1 analytics
    consistency_score: float = Field(ge=0, description="StdDev of GW points (lower=consistent)")
    bench_waste_rate: float = Field(ge=0, le=100, description="Avg bench points as % of total")
    hit_frequency: float = Field(ge=0, le=100, description="% of GWs with hits taken")
    last_5_average: float = Field(ge=0, description="Average points over last 5 GWs")


class HeadToHeadRecord(BaseModel):
    """Head-to-head record between two managers."""

    wins_a: int = Field(ge=0, description="Gameweeks won by manager A")
    wins_b: int = Field(ge=0, description="Gameweeks won by manager B")
    draws: int = Field(ge=0, description="Gameweeks with equal points")


class ComparisonResponse(BaseModel):
    """Response for GET /comparison."""

    season_id: int = Field(ge=1, le=2, description="Season ID")
    manager_a: ManagerComparisonStats
    manager_b: ManagerComparisonStats
    common_players: list[int]
    head_to_head: HeadToHeadRecord


# =============================================================================
# Route Parameters
# =============================================================================

# Custom Path type for league_id validation (ge=1 for positive integers only)
LeagueIdPath = Annotated[int, Path(ge=1, description="League ID (must be positive)")]

# Common season_id query parameter
# Valid values: 1 = 2024-25, 2 = 2025-26 (must match VALID_SEASON_IDS in history service)
SeasonIdQuery = Annotated[
    int,
    Query(ge=1, le=2, description="Season ID: 1 = 2024-25, 2 = 2025-26"),
]


# =============================================================================
# Routes
# =============================================================================


@router.get("/league/{league_id}", response_model=LeagueHistoryResponse)
async def get_league_history(
    league_id: LeagueIdPath,
    season_id: SeasonIdQuery = 1,
    include_picks: bool = Query(default=False, description="Include squad picks in response"),
    _: None = Depends(require_db),
) -> dict:
    """
    Get all historical data for a league.

    Returns manager history, chips used, and optionally squad picks for each gameweek.
    This endpoint replaces ~400 individual FPL API calls.
    """
    try:
        service = HistoryService()
        return await service.get_league_history(
            league_id=league_id,
            season_id=season_id,
            include_picks=include_picks,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception(f"Failed to get league history: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error while fetching league history",
        ) from e


@router.get("/league/{league_id}/positions")
async def get_league_positions(
    league_id: LeagueIdPath,
    season_id: SeasonIdQuery = 1,
    _: None = Depends(require_db),
) -> dict:
    """
    Get league position history for bump chart visualization.

    Returns positions for each manager at each gameweek, plus metadata for chart rendering.
    """
    try:
        service = HistoryService()
        return await service.get_league_positions(
            league_id=league_id,
            season_id=season_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception(f"Failed to get league positions: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error while fetching league positions",
        ) from e


@router.get("/league/{league_id}/stats")
async def get_league_stats(
    league_id: LeagueIdPath,
    season_id: SeasonIdQuery = 1,
    current_gameweek: int = Query(
        default=1, ge=1, le=38, description="Current gameweek for FT calculation"
    ),
    _: None = Depends(require_db),
) -> dict:
    """
    Get aggregated statistics for the Statistics page.

    Returns bench points, captain differentials, and free transfers remaining
    for all managers in the league.
    """
    try:
        service = HistoryService()
        return await service.get_league_stats(
            league_id=league_id,
            season_id=season_id,
            current_gameweek=current_gameweek,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception(f"Failed to get league stats: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error while fetching league stats",
        ) from e


@router.get("/comparison")
async def get_manager_comparison(
    manager_a: int = Query(..., ge=1, description="First manager ID"),
    manager_b: int = Query(..., ge=1, description="Second manager ID"),
    league_id: int = Query(..., ge=1, description="League ID for context"),
    season_id: SeasonIdQuery = 1,
    _: None = Depends(require_db),
) -> dict:
    """
    Get head-to-head comparison between two managers.

    Returns detailed stats, common players, and template overlap for both managers.
    """
    # Validate managers are different
    if manager_a == manager_b:
        raise HTTPException(
            status_code=400, detail="Cannot compare a manager with themselves"
        )

    try:
        service = HistoryService()
        return await service.get_manager_comparison(
            manager_a=manager_a,
            manager_b=manager_b,
            league_id=league_id,
            season_id=season_id,
        )
    except ValueError as e:
        # Service raises ValueError for invalid manager comparison
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.exception(f"Failed to get manager comparison: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error while fetching manager comparison",
        ) from e
