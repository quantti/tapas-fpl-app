"""API route definitions - Analytics endpoints."""

import logging
from typing import Any

import httpx
from cachetools import TTLCache
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel

from app.db import get_connection
from app.schemas.dashboard import LeagueDashboardResponse
from app.dependencies import require_db
from app.services.chips import ChipsService
from app.services.dashboard import DashboardService, LeagueNotFoundError
from app.services.fpl_client import FplApiClient
from app.services.points_against import PointsAgainstService
from app.services.recommendations import RecommendationsService
from app.services.set_and_forget import SetAndForgetService

logger = logging.getLogger(__name__)
router = APIRouter()

# Cache configuration
CACHE_TTL_SECONDS = 600  # 10 minutes for static API data
RECOMMENDATIONS_CACHE_TTL_SECONDS = 300  # 5 minutes (shorter since ownership changes)
DASHBOARD_CACHE_TTL_SECONDS = 300  # 5 minutes for dashboard data
CACHE_MAX_SIZE = 100  # Maximum entries per cache

# Thread-safe TTL caches with bounded size
# Using separate caches for different TTL requirements
_api_cache: TTLCache[str, Any] = TTLCache(maxsize=CACHE_MAX_SIZE, ttl=CACHE_TTL_SECONDS)
_recommendations_cache: TTLCache[str, Any] = TTLCache(
    maxsize=CACHE_MAX_SIZE, ttl=RECOMMENDATIONS_CACHE_TTL_SECONDS
)
_dashboard_cache: TTLCache[str, Any] = TTLCache(
    maxsize=CACHE_MAX_SIZE, ttl=DASHBOARD_CACHE_TTL_SECONDS
)
_set_and_forget_cache: TTLCache[str, Any] = TTLCache(
    maxsize=CACHE_MAX_SIZE, ttl=CACHE_TTL_SECONDS
)


def clear_cache() -> None:
    """Clear all caches. Used by tests to ensure isolation."""
    _api_cache.clear()
    _recommendations_cache.clear()
    _dashboard_cache.clear()
    _set_and_forget_cache.clear()


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


@router.get("/api/v1/points-against")
async def get_points_against(
    season_id: int = Query(
        default=1, ge=1, le=100, description="Season ID (default: 1 for 2024-25)"
    ),
    _: None = Depends(require_db),
) -> dict:
    """
    Get points conceded by all teams for the season.

    Returns teams sorted by total points conceded (highest first = weakest defense).
    Useful for identifying captain targets and transfer opportunities.
    """

    # Check cache first
    cache_key = f"points_against_{season_id}"
    cached = _api_cache.get(cache_key)
    if cached is not None:
        logger.debug("Cache hit for %s", cache_key)
        return cached

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
        _api_cache[cache_key] = result

        return result
    except Exception as e:
        logger.exception("Failed to get points against")
        raise HTTPException(
            status_code=500, detail="Internal server error while fetching points against data"
        ) from e


@router.get("/api/v1/points-against/{team_id}/history")
async def get_team_points_against_history(
    team_id: int,
    season_id: int = Query(
        default=1, ge=1, le=100, description="Season ID (default: 1 for 2024-25)"
    ),
    _: None = Depends(require_db),
) -> dict:
    """
    Get fixture-by-fixture points conceded by a specific team.

    Shows how many points the team conceded in each match,
    useful for identifying trends (e.g., recent defensive improvements).
    """
    # Validate team_id first (FPL teams are 1-20)
    if not 1 <= team_id <= 20:
        raise HTTPException(status_code=400, detail="Invalid team_id. Must be between 1 and 20.")

    # Check cache first
    cache_key = f"team_history_{team_id}_{season_id}"
    cached = _api_cache.get(cache_key)
    if cached is not None:
        logger.debug("Cache hit for %s", cache_key)
        return cached

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
        _api_cache[cache_key] = result

        return result
    except Exception as e:
        logger.exception("Failed to get team history")
        raise HTTPException(
            status_code=500, detail="Internal server error while fetching team history"
        ) from e


@router.get("/api/v1/points-against/status")
async def get_points_against_status(_: None = Depends(require_db)) -> dict:
    """
    Get the status of the Points Against data collection.

    Shows when data was last updated, how many players were processed,
    and whether collection is currently running.
    """

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
        logger.exception("Failed to get collection status: %s", e)
        raise HTTPException(
            status_code=500, detail="Internal server error while fetching collection status"
        ) from e


# =============================================================================
# Chips Remaining Endpoints
# =============================================================================


@router.get("/api/v1/chips/league/{league_id}")
async def get_league_chips(
    league_id: int,
    current_gameweek: int = Query(
        ..., ge=1, le=38, description="Current gameweek (1-38)"
    ),
    season_id: int = Query(
        default=1, ge=1, le=100, description="Season ID (default: 1 for 2024-25)"
    ),
    sync: bool = Query(
        default=False, description="Sync chip data from FPL API before returning"
    ),
    _: None = Depends(require_db),
) -> dict:
    """
    Get chip usage for all managers in a league.

    Shows which chips have been used and which are remaining for each half of the season.
    Chips reset at GW20 for the second half.

    Set sync=true to fetch latest chip data from FPL API (slower but fresh data).
    """
    # Validate league_id (must be positive)
    if league_id < 1:
        raise HTTPException(status_code=422, detail="league_id must be >= 1")

    try:
        service = ChipsService()

        # On-demand sync: fetch from FPL API if requested
        if sync:
            try:
                async with FplApiClient() as fpl_client:
                    await service.sync_league_chips(league_id, season_id, fpl_client)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    raise HTTPException(
                        status_code=429, detail="FPL API rate limited. Please try again later."
                    ) from e
                if e.response.status_code >= 500:
                    raise HTTPException(
                        status_code=502, detail="FPL API is currently unavailable."
                    ) from e
                raise
            except httpx.TimeoutException as e:
                raise HTTPException(
                    status_code=504, detail="FPL API request timed out. Please try again."
                ) from e

        result = await service.get_league_chips(league_id, season_id, current_gameweek)

        return {
            "league_id": result.league_id,
            "season_id": result.season_id,
            "current_gameweek": result.current_gameweek,
            "current_half": result.current_half,
            "managers": [
                {
                    "manager_id": m.manager_id,
                    "name": m.name,
                    "first_half": {
                        "chips_used": [
                            {
                                "chip_type": c.chip_type,
                                "gameweek": c.gameweek,
                                "points_gained": c.points_gained,
                            }
                            for c in m.first_half.chips_used
                        ],
                        "chips_remaining": m.first_half.chips_remaining,
                    },
                    "second_half": {
                        "chips_used": [
                            {
                                "chip_type": c.chip_type,
                                "gameweek": c.gameweek,
                                "points_gained": c.points_gained,
                            }
                            for c in m.second_half.chips_used
                        ],
                        "chips_remaining": m.second_half.chips_remaining,
                    },
                }
                for m in result.managers
            ],
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except HTTPException:
        raise  # Re-raise HTTPExceptions (from FPL error handling above)
    except Exception as e:
        logger.exception("Failed to get league chips: %s", e)
        raise HTTPException(
            status_code=500, detail="Internal server error while fetching league chips"
        ) from e


@router.get("/api/v1/chips/manager/{manager_id}")
async def get_manager_chips(
    manager_id: int,
    season_id: int = Query(
        default=1, ge=1, le=100, description="Season ID (default: 1 for 2024-25)"
    ),
    sync: bool = Query(
        default=False, description="Sync chip data from FPL API before returning"
    ),
    _: None = Depends(require_db),
) -> dict:
    """
    Get chip usage for a single manager.

    Shows which chips have been used and which are remaining for each half of the season.
    Chips reset at GW20 for the second half.

    Set sync=true to fetch latest chip data from FPL API (slower but fresh data).
    """
    # Validate manager_id (must be positive)
    if manager_id < 1:
        raise HTTPException(status_code=422, detail="manager_id must be >= 1")

    try:
        service = ChipsService()

        # On-demand sync: fetch from FPL API if requested
        if sync:
            try:
                async with FplApiClient() as fpl_client:
                    await service.sync_manager_chips(manager_id, season_id, fpl_client)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    raise HTTPException(
                        status_code=429, detail="FPL API rate limited. Please try again later."
                    ) from e
                if e.response.status_code >= 500:
                    raise HTTPException(
                        status_code=502, detail="FPL API is currently unavailable."
                    ) from e
                raise
            except httpx.TimeoutException as e:
                raise HTTPException(
                    status_code=504, detail="FPL API request timed out. Please try again."
                ) from e

        result = await service.get_manager_chips(manager_id, season_id)

        return {
            "manager_id": result.manager_id,
            "season_id": season_id,
            "first_half": {
                "chips_used": [
                    {
                        "chip_type": c.chip_type,
                        "gameweek": c.gameweek,
                        "points_gained": c.points_gained,
                    }
                    for c in result.first_half.chips_used
                ],
                "chips_remaining": result.first_half.chips_remaining,
            },
            "second_half": {
                "chips_used": [
                    {
                        "chip_type": c.chip_type,
                        "gameweek": c.gameweek,
                        "points_gained": c.points_gained,
                    }
                    for c in result.second_half.chips_used
                ],
                "chips_remaining": result.second_half.chips_remaining,
            },
        }
    except HTTPException:
        raise  # Re-raise HTTPExceptions (from FPL error handling above)
    except Exception as e:
        logger.exception(f"Failed to get manager chips: {e}")
        raise HTTPException(
            status_code=500, detail="Internal server error while fetching manager chips"
        ) from e


# =============================================================================
# Player Recommendations Endpoints
# =============================================================================


def _format_recommendation_player(p: dict[str, Any]) -> dict[str, Any]:
    """Format a player dict for recommendation API response."""
    return {
        "id": p.get("id"),
        "name": p.get("name"),
        "team": p.get("team"),
        "position": p.get("element_type"),
        "price": p.get("price"),
        "ownership": round((p.get("ownership") or 0) * 100, 1),
        "score": round(p.get("score") or 0, 3),
        "xg90": round(p.get("xg90") or 0, 2),
        "xa90": round(p.get("xa90") or 0, 2),
        "form": p.get("form"),
    }


def _format_sell_player(p: dict[str, Any]) -> dict[str, Any]:
    """Format a player dict for sell recommendation API response."""
    result = _format_recommendation_player(p)
    result["sell_score"] = round(p.get("sell_score") or 0, 3)
    return result


@router.get("/api/v1/recommendations/league/{league_id}")
async def get_league_recommendations(
    league_id: int,
    limit: int = Query(
        default=10, ge=1, le=50, description="Max players per category (1-50)"
    ),
    season_id: int = Query(
        default=1, ge=1, le=100, description="Season ID (default: 1 for 2024-25)"
    ),
) -> dict[str, Any]:
    """
    Get player recommendations for a league.

    Returns three categories:
    - **punts**: Low ownership (<40%) players with high potential
    - **defensive**: Medium ownership (40-100%) form-based picks
    - **time_to_sell**: Owned players with declining metrics

    Scores are based on per-90 xG/xA/xGC stats, form, and fixture difficulty.
    Results are cached for 5 minutes to improve response times.
    """
    # Validate league_id (must be positive)
    if league_id < 1:
        raise HTTPException(status_code=422, detail="league_id must be >= 1")

    # Check cache first
    cache_key = f"recommendations_{league_id}_{season_id}_{limit}"
    cached = _recommendations_cache.get(cache_key)
    if cached is not None:
        logger.debug("Cache hit for %s", cache_key)
        return cached

    try:
        # Try to get DB connection, but fall back to API-only if unavailable
        conn = None
        try:
            from app.db import get_pool

            get_pool()  # Check if pool is initialized
            conn_context = get_connection()
        except RuntimeError:
            # Pool not initialized - will use API fallback
            conn_context = None

        async with FplApiClient() as fpl_client:
            if conn_context is not None:
                async with conn_context as conn:
                    service = RecommendationsService(fpl_client)
                    recommendations = await service.get_league_recommendations(
                        league_id, limit=limit, season_id=season_id, conn=conn
                    )
            else:
                service = RecommendationsService(fpl_client)
                recommendations = await service.get_league_recommendations(
                    league_id, limit=limit, season_id=season_id, conn=None
                )

        result = {
            "league_id": league_id,
            "season_id": season_id,
            "punts": [_format_recommendation_player(p) for p in recommendations["punts"]],
            "defensive": [_format_recommendation_player(p) for p in recommendations["defensive"]],
            "time_to_sell": [_format_sell_player(p) for p in recommendations["time_to_sell"]],
        }

        # Cache the result
        _recommendations_cache[cache_key] = result

        return result

    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            raise HTTPException(
                status_code=429, detail="FPL API rate limited. Please try again later."
            ) from e
        if e.response.status_code >= 500:
            raise HTTPException(
                status_code=502, detail="FPL API is currently unavailable."
            ) from e
        # Wrap all other HTTP errors (4xx) as 502 upstream error
        logger.warning("FPL API returned %s: %s", e.response.status_code, e)
        raise HTTPException(
            status_code=502,
            detail=f"FPL API error: {e.response.status_code}",
        ) from e
    except httpx.TimeoutException as e:
        raise HTTPException(
            status_code=504, detail="FPL API request timed out. Please try again."
        ) from e
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get recommendations: %s", e)
        raise HTTPException(
            status_code=500, detail="Internal server error while fetching recommendations"
        ) from e


# =============================================================================
# League Dashboard (Consolidated Endpoint)
# =============================================================================


@router.get("/api/v1/dashboard/league/{league_id}", response_model=LeagueDashboardResponse)
async def get_league_dashboard(
    league_id: int = Path(ge=1, description="FPL league ID"),
    gameweek: int | None = Query(
        default=None, ge=1, le=38, description="Gameweek (1-38). Defaults to current."
    ),
    season_id: int = Query(
        default=1, ge=1, le=100, description="Season ID (default: 1 for 2024-25)"
    ),
    _: None = Depends(require_db),
) -> LeagueDashboardResponse:
    """
    Get consolidated dashboard data for a league.

    Returns all manager data for the league in a single call, including:
    - Manager info (name, team name, points, rank)
    - Squad picks with player details
    - Chips used this season
    - Transfers made this gameweek

    Args:
        league_id: The FPL league ID (must be >= 1).
        gameweek: The gameweek number (1-38). Defaults to current gameweek.
        season_id: The season ID (must be >= 1). Defaults to 1.

    Returns:
        Dashboard data with league_id, gameweek, season_id, and managers list.

    Raises:
        422: Invalid parameters.
        404: League not found.
        503: Database unavailable.
    """
    # Check cache first if gameweek is specified (avoids DB connection for cache hits)
    if gameweek is not None:
        cache_key = f"dashboard_{league_id}_{gameweek}_{season_id}"
        if cache_key in _dashboard_cache:
            logger.debug("Dashboard cache hit for %s", cache_key)
            return _dashboard_cache[cache_key]

    async with get_connection() as conn:
        # Resolve current gameweek if not specified
        resolved_gameweek = gameweek
        if resolved_gameweek is None:
            resolved_gameweek = await conn.fetchval(
                "SELECT id FROM gameweek WHERE is_current = true AND season_id = $1",
                season_id,
            )
            if resolved_gameweek is None:
                resolved_gameweek = 1  # Fallback to GW1 if no current gameweek

        # Build cache key (now resolved_gameweek is always set)
        cache_key = f"dashboard_{league_id}_{resolved_gameweek}_{season_id}"
        if cache_key in _dashboard_cache:
            logger.debug("Dashboard cache hit for %s", cache_key)
            return _dashboard_cache[cache_key]

        try:
            service = DashboardService()
            dashboard = await service.get_league_dashboard(
                league_id, resolved_gameweek, season_id, conn
            )
        except LeagueNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except Exception as e:
            logger.exception("Failed to get league dashboard")
            raise HTTPException(
                status_code=500,
                detail="Internal server error while fetching dashboard",
            ) from e

        # Convert dataclass to Pydantic model (from_attributes=True handles nested objects)
        result = LeagueDashboardResponse.model_validate(dashboard, from_attributes=True)

        # Cache and return
        _dashboard_cache[cache_key] = result
        return result


# =============================================================================
# Set and Forget Endpoints
# =============================================================================


class SetAndForgetResponse(BaseModel):
    """Response for Set and Forget calculation."""

    manager_id: int
    total_points: int
    actual_points: int
    difference: int
    auto_subs_made: int
    captain_points_gained: int


class LeagueSetAndForgetResponse(BaseModel):
    """Response for league Set and Forget endpoint."""

    league_id: int
    season_id: int
    current_gameweek: int
    managers: list[SetAndForgetResponse]


@router.get("/api/v1/set-and-forget/league/{league_id}", response_model=LeagueSetAndForgetResponse)
async def get_league_set_and_forget(
    league_id: int = Path(ge=1, description="FPL league ID"),
    current_gameweek: int = Query(
        ..., ge=1, le=38, description="Current gameweek (1-38)"
    ),
    season_id: int = Query(
        default=1, ge=1, le=100, description="Season ID (default: 1 for 2024-25)"
    ),
    _: None = Depends(require_db),
) -> LeagueSetAndForgetResponse:
    """
    Calculate Set and Forget points for all managers in a league.

    Set and Forget calculates hypothetical points if a manager kept their GW1
    squad all season without making any transfers. Uses original captain choice,
    applies auto-sub rules, and respects TC/BB chip usage.

    Returns:
        Manager-by-manager comparison of actual vs hypothetical points.
    """
    # Check cache first
    cache_key = f"set_and_forget_{league_id}_{current_gameweek}_{season_id}"
    cached = _set_and_forget_cache.get(cache_key)
    if cached is not None:
        logger.debug("Cache hit for %s", cache_key)
        return cached

    try:
        async with get_connection() as conn:
            # Get all manager IDs in the league
            manager_rows = await conn.fetch(
                """
                SELECT manager_id FROM league_manager
                WHERE league_id = $1 AND season_id = $2
                """,
                league_id,
                season_id,
            )

            if not manager_rows:
                raise HTTPException(
                    status_code=404,
                    detail=f"League {league_id} not found or has no managers",
                )

            manager_ids = [row["manager_id"] for row in manager_rows]

        # Calculate Set and Forget for each manager
        service = SetAndForgetService()
        results: list[SetAndForgetResponse] = []

        for manager_id in manager_ids:
            result = await service.calculate(
                manager_id=manager_id,
                season_id=season_id,
                current_gameweek=current_gameweek,
            )
            results.append(
                SetAndForgetResponse(
                    manager_id=manager_id,
                    total_points=result.total_points,
                    actual_points=result.actual_points,
                    difference=result.difference,
                    auto_subs_made=result.auto_subs_made,
                    captain_points_gained=result.captain_points_gained,
                )
            )

        # Sort by difference (descending) to show who benefited most from set-and-forget
        results.sort(key=lambda r: r.difference, reverse=True)

        response = LeagueSetAndForgetResponse(
            league_id=league_id,
            season_id=season_id,
            current_gameweek=current_gameweek,
            managers=results,
        )

        # Cache the result
        _set_and_forget_cache[cache_key] = response

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to get set and forget data: %s", e)
        raise HTTPException(
            status_code=500,
            detail="Internal server error while calculating set and forget",
        ) from e
