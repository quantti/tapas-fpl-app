"""API route definitions - Future analytics endpoints."""

from fastapi import APIRouter

router = APIRouter()


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
