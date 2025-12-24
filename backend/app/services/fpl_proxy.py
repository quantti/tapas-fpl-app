"""FPL API proxy service with caching - replaces Cloudflare Workers."""

import logging
import time
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class CacheEntry:
    """Simple cache entry with TTL."""

    def __init__(self, data: Any, ttl: int) -> None:
        self.data = data
        self.expires_at = time.time() + ttl

    def is_expired(self) -> bool:
        return time.time() > self.expires_at


class FPLProxyService:
    """
    Proxy service for FPL API requests.

    Features:
    - In-memory caching with configurable TTL
    - Proper error handling
    - Request timeout management
    - User-Agent header to avoid blocks

    Replaces the Cloudflare Workers CORS proxy with additional caching benefits.
    """

    def __init__(self) -> None:
        self._cache: dict[str, CacheEntry] = {}
        self._client = httpx.AsyncClient(
            base_url=settings.fpl_api_base_url,
            timeout=30.0,
            headers={
                "User-Agent": "TapasFPL/1.0 (Fantasy Premier League App)",
            },
        )

    async def _fetch(self, path: str, cache_ttl: int) -> Any | None:
        """Fetch data from FPL API with caching."""
        cache_key = path

        # Check cache
        if cache_key in self._cache:
            entry = self._cache[cache_key]
            if not entry.is_expired():
                logger.debug(f"Cache hit for {path}")
                return entry.data

        # Fetch from API
        try:
            logger.info(f"Fetching {path} from FPL API")
            response = await self._client.get(path)
            response.raise_for_status()
            data = response.json()

            # Cache the response
            self._cache[cache_key] = CacheEntry(data, cache_ttl)
            return data

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching {path}: {e.response.status_code}")
            return None
        except httpx.RequestError as e:
            logger.error(f"Request error fetching {path}: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error fetching {path}: {e}")
            return None

    async def get_bootstrap_static(self) -> dict | None:
        """Get bootstrap-static data (players, teams, events)."""
        return await self._fetch("/bootstrap-static/", settings.cache_ttl_bootstrap)

    async def get_fixtures(self, event: int | None = None) -> list | None:
        """Get fixtures, optionally filtered by gameweek."""
        if event is not None:
            return await self._fetch(f"/fixtures/?event={event}", settings.cache_ttl_fixtures)
        return await self._fetch("/fixtures/", settings.cache_ttl_fixtures)

    async def get_entry(self, entry_id: int) -> dict | None:
        """Get manager entry data."""
        return await self._fetch(f"/entry/{entry_id}/", settings.cache_ttl_bootstrap)

    async def get_entry_picks(self, entry_id: int, event_id: int) -> dict | None:
        """Get manager picks for a specific gameweek."""
        return await self._fetch(
            f"/entry/{entry_id}/event/{event_id}/picks/",
            settings.cache_ttl_bootstrap,
        )

    async def get_league_standings(self, league_id: int) -> dict | None:
        """Get classic league standings."""
        return await self._fetch(
            f"/leagues-classic/{league_id}/standings/",
            settings.cache_ttl_bootstrap,
        )

    async def get_event_live(self, event_id: int) -> dict | None:
        """Get live event data (points, bonus, etc)."""
        return await self._fetch(f"/event/{event_id}/live/", settings.cache_ttl_live)

    async def get_entry_history(self, entry_id: int) -> dict | None:
        """Get manager's gameweek history, past seasons, and chips used."""
        return await self._fetch(f"/entry/{entry_id}/history/", settings.cache_ttl_bootstrap)

    async def get_entry_transfers(self, entry_id: int) -> list | None:
        """Get all transfers made by a manager this season."""
        return await self._fetch(f"/entry/{entry_id}/transfers/", settings.cache_ttl_bootstrap)

    async def get_element_summary(self, element_id: int) -> dict | None:
        """Get player summary with fixture history and upcoming matches."""
        return await self._fetch(f"/element-summary/{element_id}/", settings.cache_ttl_bootstrap)

    async def get_event_status(self) -> dict | None:
        """Get event processing status (bonus points, leagues)."""
        return await self._fetch("/event-status/", settings.cache_ttl_live)

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()
