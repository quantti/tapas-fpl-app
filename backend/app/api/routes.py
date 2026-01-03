"""API route definitions - Analytics endpoints."""

import logging
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.db import get_pool
from app.services.points_against import PointsAgainstService

logger = logging.getLogger(__name__)
router = APIRouter()

# Simple in-memory cache for points-against data (static within a gameweek)
CACHE_TTL_SECONDS = 600  # 10 minutes


@dataclass
class CacheEntry:
    """Cache entry with TTL."""

    data: Any
    expires_at: float = field(default_factory=lambda: time.monotonic())

    def is_valid(self) -> bool:
        return time.monotonic() < self.expires_at


_cache: dict[str, CacheEntry] = {}


# =============================================================================
# Future: Analytics Endpoints
# =============================================================================
# FPL API proxy is handled by Cloudflare Workers for instant edge responses.
# This backend will be used for analytics features that need Python/database.


@router.get("/api/analytics/expected-points/{player_id}")
async def get_expected_points(player_id: int, horizon: int = 5) -> dict:
    """
    Get expected points for a player over upcoming gameweeks.

    TODO: Implement
    - xP calculation with all components
    - Expected minutes prediction
    - BPS projection
    """
    return {
        "player_id": player_id,
        "horizon": horizon,
        "status": "not_implemented",
        "message": "Expected points engine coming soon",
    }


@router.post("/api/analytics/optimize-transfers")
async def optimize_transfers() -> dict:
    """
    MILP-based transfer optimization.

    TODO: Implement
    - Squad constraints
    - Multi-week horizon
    - Hit calculation
    """
    return {
        "status": "not_implemented",
        "message": "Transfer optimizer coming soon",
    }


# =============================================================================
# Points Against Endpoints
# =============================================================================


def _check_db_available() -> None:
    """Check if database is available, raise 503 if not."""
    try:
        get_pool()
    except RuntimeError as e:
        raise HTTPException(
            status_code=503,
            detail="Database not available. Points Against feature requires database connection.",
        ) from e


@router.get("/api/v1/points-against")
async def get_points_against(
    season_id: int = Query(default=1, ge=1, le=100, description="Season ID (default: 1 for 2024-25)")
) -> dict:
    """
    Get points conceded by all teams for the season.

    Returns teams sorted by total points conceded (highest first = weakest defense).
    Useful for identifying captain targets and transfer opportunities.
    """
    _check_db_available()

    # Check cache first
    cache_key = f"points_against_{season_id}"
    if cache_key in _cache and _cache[cache_key].is_valid():
        logger.debug(f"Cache hit for {cache_key}")
        return _cache[cache_key].data

    try:
        service = PointsAgainstService()
        totals = await service.get_season_totals(season_id)

        result = {
            "season_id": season_id,
            "teams": [
                {
                    "team_id": t.team_id,
                    "team_name": t.team_name,
                    "short_name": t.short_name,
                    "matches_played": t.matches_played,
                    "total_points": t.total_points,
                    "home_points": t.home_points,
                    "away_points": t.away_points,
                    "avg_per_match": t.avg_per_match,
                }
                for t in totals
            ],
        }

        # Cache the result
        _cache[cache_key] = CacheEntry(
            data=result, expires_at=time.monotonic() + CACHE_TTL_SECONDS
        )

        return result
    except Exception as e:
        logger.exception(f"Failed to get points against: {e}")
        raise HTTPException(
            status_code=500, detail="Internal server error while fetching points against data"
        ) from e


@router.get("/api/v1/points-against/{team_id}/history")
async def get_team_points_against_history(
    team_id: int,
    season_id: int = Query(default=1, ge=1, le=100, description="Season ID (default: 1 for 2024-25)"),
) -> dict:
    """
    Get fixture-by-fixture points conceded by a specific team.

    Shows how many points the team conceded in each match,
    useful for identifying trends (e.g., recent defensive improvements).
    """
    # Validate team_id first (FPL teams are 1-20)
    if not 1 <= team_id <= 20:
        raise HTTPException(status_code=400, detail="Invalid team_id. Must be between 1 and 20.")

    _check_db_available()

    # Check cache first
    cache_key = f"team_history_{team_id}_{season_id}"
    if cache_key in _cache and _cache[cache_key].is_valid():
        logger.debug(f"Cache hit for {cache_key}")
        return _cache[cache_key].data

    try:
        service = PointsAgainstService()
        history = await service.get_team_history(team_id, season_id)

        result = {
            "team_id": team_id,
            "season_id": season_id,
            "fixtures": [
                {
                    "fixture_id": f.fixture_id,
                    "gameweek": f.gameweek,
                    "total_points": f.home_points + f.away_points,
                    "home_points": f.home_points,
                    "away_points": f.away_points,
                    "is_home": f.is_home,
                    "opponent_id": f.opponent_id,
                }
                for f in history
            ],
        }

        # Cache the result
        _cache[cache_key] = CacheEntry(
            data=result, expires_at=time.monotonic() + CACHE_TTL_SECONDS
        )

        return result
    except Exception as e:
        logger.exception(f"Failed to get team history: {e}")
        raise HTTPException(
            status_code=500, detail="Internal server error while fetching team history"
        ) from e


@router.get("/api/v1/points-against/status")
async def get_points_against_status() -> dict:
    """
    Get the status of the Points Against data collection.

    Shows when data was last updated, how many players were processed,
    and whether collection is currently running.
    """
    _check_db_available()

    try:
        service = PointsAgainstService()
        status = await service.get_collection_status()

        if not status:
            return {
                "status": "not_initialized",
                "message": "Data collection has not been run yet",
            }

        return {
            "season_id": status.season_id,
            "latest_gameweek": status.latest_gameweek,
            "total_players_processed": status.total_players_processed,
            "status": status.status,
            "last_full_collection": (
                status.last_full_collection.isoformat()
                if status.last_full_collection
                else None
            ),
            "last_incremental_update": (
                status.last_incremental_update.isoformat()
                if status.last_incremental_update
                else None
            ),
            "error_message": status.error_message,
        }
    except Exception as e:
        logger.exception(f"Failed to get collection status: {e}")
        raise HTTPException(
            status_code=500, detail="Internal server error while fetching collection status"
        ) from e
