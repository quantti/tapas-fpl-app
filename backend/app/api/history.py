"""History API routes - League history, positions, stats, and comparison endpoints."""

import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query

from app.db import get_pool
from app.services.history import HistoryService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/history", tags=["history"])


def _check_db_available() -> None:
    """Check if database is available, raise 503 if not."""
    try:
        get_pool()
    except RuntimeError as e:
        raise HTTPException(
            status_code=503,
            detail="Database not available. History features require database connection.",
        ) from e


# Custom Path type for league_id validation (ge=1 for positive integers only)
LeagueIdPath = Annotated[int, Path(ge=1, description="League ID (must be positive)")]


@router.get("/league/{league_id}")
async def get_league_history(
    league_id: LeagueIdPath,
    season_id: str = Query(default="2024-25", description="Season ID (e.g., 2024-25)"),
    include_picks: bool = Query(default=False, description="Include squad picks in response"),
) -> dict:
    """
    Get all historical data for a league.

    Returns manager history, chips used, and optionally squad picks for each gameweek.
    This endpoint replaces ~400 individual FPL API calls.
    """
    _check_db_available()

    try:
        service = HistoryService()
        return await service.get_league_history(
            league_id=league_id,
            season_id=season_id,
            include_picks=include_picks,
        )
    except Exception as e:
        logger.exception(f"Failed to get league history: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error while fetching league history",
        ) from e


@router.get("/league/{league_id}/positions")
async def get_league_positions(
    league_id: LeagueIdPath,
    season_id: str = Query(default="2024-25", description="Season ID (e.g., 2024-25)"),
) -> dict:
    """
    Get league position history for bump chart visualization.

    Returns positions for each manager at each gameweek, plus metadata for chart rendering.
    """
    _check_db_available()

    try:
        service = HistoryService()
        return await service.get_league_positions(
            league_id=league_id,
            season_id=season_id,
        )
    except Exception as e:
        logger.exception(f"Failed to get league positions: {e}")
        raise HTTPException(
            status_code=500,
            detail="Internal server error while fetching league positions",
        ) from e


@router.get("/league/{league_id}/stats")
async def get_league_stats(
    league_id: LeagueIdPath,
    season_id: str = Query(default="2024-25", description="Season ID (e.g., 2024-25)"),
    current_gameweek: int = Query(
        default=1, ge=1, le=38, description="Current gameweek for FT calculation"
    ),
) -> dict:
    """
    Get aggregated statistics for the Statistics page.

    Returns bench points, captain differentials, and free transfers remaining
    for all managers in the league.
    """
    _check_db_available()

    try:
        service = HistoryService()
        return await service.get_league_stats(
            league_id=league_id,
            season_id=season_id,
            current_gameweek=current_gameweek,
        )
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
    season_id: str = Query(default="2024-25", description="Season ID (e.g., 2024-25)"),
) -> dict:
    """
    Get head-to-head comparison between two managers.

    Returns detailed stats, common players, and template overlap for both managers.
    """
    _check_db_available()

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
