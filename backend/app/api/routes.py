"""API route definitions - FPL proxy and future analytics endpoints."""

from fastapi import APIRouter, HTTPException

from app.services.fpl_proxy import FPLProxyService

router = APIRouter()

# Singleton proxy service instance
_proxy_service: FPLProxyService | None = None


def get_proxy_service() -> FPLProxyService:
    """Get or create proxy service instance."""
    global _proxy_service
    if _proxy_service is None:
        _proxy_service = FPLProxyService()
    return _proxy_service


# =============================================================================
# FPL API Proxy Routes (replaces Cloudflare Workers)
# =============================================================================


@router.get("/api/bootstrap-static")
async def get_bootstrap_static() -> dict:
    """Proxy for FPL bootstrap-static endpoint."""
    proxy = get_proxy_service()
    data = await proxy.get_bootstrap_static()
    if data is None:
        raise HTTPException(status_code=502, detail="Failed to fetch FPL data")
    return data


@router.get("/api/fixtures")
async def get_fixtures(event: int | None = None) -> list:
    """Proxy for FPL fixtures endpoint. Optional event filter."""
    proxy = get_proxy_service()
    data = await proxy.get_fixtures(event)
    if data is None:
        raise HTTPException(status_code=502, detail="Failed to fetch fixtures")
    return data


@router.get("/api/entry/{entry_id}")
async def get_entry(entry_id: int) -> dict:
    """Proxy for FPL entry (manager) endpoint."""
    proxy = get_proxy_service()
    data = await proxy.get_entry(entry_id)
    if data is None:
        raise HTTPException(status_code=502, detail="Failed to fetch entry")
    return data


@router.get("/api/entry/{entry_id}/event/{event_id}/picks")
async def get_entry_picks(entry_id: int, event_id: int) -> dict:
    """Proxy for FPL entry picks endpoint."""
    proxy = get_proxy_service()
    data = await proxy.get_entry_picks(entry_id, event_id)
    if data is None:
        raise HTTPException(status_code=502, detail="Failed to fetch picks")
    return data


@router.get("/api/leagues-classic/{league_id}/standings")
async def get_league_standings(league_id: int) -> dict:
    """Proxy for FPL classic league standings."""
    proxy = get_proxy_service()
    data = await proxy.get_league_standings(league_id)
    if data is None:
        raise HTTPException(status_code=502, detail="Failed to fetch standings")
    return data


@router.get("/api/event/{event_id}/live")
async def get_event_live(event_id: int) -> dict:
    """Proxy for FPL live event data."""
    proxy = get_proxy_service()
    data = await proxy.get_event_live(event_id)
    if data is None:
        raise HTTPException(status_code=502, detail="Failed to fetch live data")
    return data


@router.get("/api/entry/{entry_id}/history")
async def get_entry_history(entry_id: int) -> dict:
    """Proxy for FPL manager history (gameweeks, past seasons, chips)."""
    proxy = get_proxy_service()
    data = await proxy.get_entry_history(entry_id)
    if data is None:
        raise HTTPException(status_code=502, detail="Failed to fetch history")
    return data


@router.get("/api/entry/{entry_id}/transfers")
async def get_entry_transfers(entry_id: int) -> list:
    """Proxy for FPL manager transfer history."""
    proxy = get_proxy_service()
    data = await proxy.get_entry_transfers(entry_id)
    if data is None:
        raise HTTPException(status_code=502, detail="Failed to fetch transfers")
    return data


@router.get("/api/element-summary/{element_id}")
async def get_element_summary(element_id: int) -> dict:
    """Proxy for FPL player summary (fixture history, upcoming)."""
    proxy = get_proxy_service()
    data = await proxy.get_element_summary(element_id)
    if data is None:
        raise HTTPException(status_code=502, detail="Failed to fetch player summary")
    return data


@router.get("/api/event-status")
async def get_event_status() -> dict:
    """Proxy for FPL event processing status."""
    proxy = get_proxy_service()
    data = await proxy.get_event_status()
    if data is None:
        raise HTTPException(status_code=502, detail="Failed to fetch event status")
    return data


# =============================================================================
# Future: Analytics Endpoints (Phase 2+)
# =============================================================================


@router.get("/api/analytics/expected-points/{player_id}")
async def get_expected_points(player_id: int, horizon: int = 5) -> dict:
    """
    Get expected points for a player over upcoming gameweeks.

    TODO: Implement in Phase 2
    - xP calculation with all components
    - Expected minutes prediction
    - BPS projection
    """
    return {
        "player_id": player_id,
        "horizon": horizon,
        "status": "not_implemented",
        "message": "Expected points engine coming in Phase 2",
    }


@router.post("/api/analytics/optimize-transfers")
async def optimize_transfers() -> dict:
    """
    MILP-based transfer optimization.

    TODO: Implement in Phase 3
    - Squad constraints
    - Multi-week horizon
    - Hit calculation
    """
    return {
        "status": "not_implemented",
        "message": "Transfer optimizer coming in Phase 3",
    }
