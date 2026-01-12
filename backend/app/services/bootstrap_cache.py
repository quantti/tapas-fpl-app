"""Shared cache for FPL bootstrap-static data.

This module provides a singleton cache for bootstrap data to:
1. Prevent OOM crashes from multiple concurrent requests parsing the same ~1.8MB response
2. Reduce FPL API calls (data rarely changes during a gameweek)
3. Handle concurrent requests without thundering herd via asyncio.Lock

Memory impact estimate:
- Raw JSON: ~1.8MB
- Parsed Python dict: ~5-10MB
- With TTLCache(maxsize=1): Single copy only = ~10MB max

Cache TTL: 5 minutes (shorter than routes cache since this is source data)
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from cachetools import TTLCache

logger = logging.getLogger(__name__)

# Cache configuration
BOOTSTRAP_CACHE_TTL = 300  # 5 minutes - balance freshness vs API calls
BOOTSTRAP_CACHE_SIZE = 1  # Only cache one version (current)

# Module-level singleton cache
# Key: "bootstrap" -> value: parsed dict
_bootstrap_cache: TTLCache[str, dict[str, Any]] = TTLCache(
    maxsize=BOOTSTRAP_CACHE_SIZE,
    ttl=BOOTSTRAP_CACHE_TTL,
)

# Lock to prevent thundering herd on cache miss
# Note: FastAPI uses a single event loop, so module-level lock is safe.
# If used in multi-loop contexts, this would need lazy initialization.
_bootstrap_lock = asyncio.Lock()

# Timestamp for monitoring/debugging
_last_fetch_time: float = 0.0


async def get_cached_bootstrap(
    fetcher: Callable[[str], Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    """Get bootstrap data from cache or fetch if expired/missing.

    Uses asyncio.Lock to prevent multiple concurrent requests from
    fetching the same data simultaneously (thundering herd prevention).

    Args:
        fetcher: Async function that takes URL and returns parsed JSON dict.
                 This is the FplApiClient._get method.

    Returns:
        Bootstrap-static data dict with elements, events, teams arrays

    Raises:
        httpx.HTTPError: If fetch fails
    """
    global _last_fetch_time

    cache_key = "bootstrap"

    # Fast path: check cache without lock
    # TTLCache.get() is atomic and returns None for expired items,
    # so this is safe for asyncio's single-threaded event loop
    cached = _bootstrap_cache.get(cache_key)
    if cached is not None:
        logger.debug("Bootstrap cache hit")
        return cached

    # Slow path: acquire lock and fetch
    async with _bootstrap_lock:
        # Double-check after acquiring lock (another request may have populated)
        cached = _bootstrap_cache.get(cache_key)
        if cached is not None:
            logger.debug("Bootstrap cache hit (after lock)")
            return cached

        # Cache miss - fetch from API
        logger.info("Fetching bootstrap-static from FPL API (cache miss)")
        start = time.monotonic()

        try:
            data = await fetcher(
                "https://fantasy.premierleague.com/api/bootstrap-static/"
            )
        except Exception as e:
            logger.error(
                f"Failed to fetch bootstrap-static: {type(e).__name__}: {e}. "
                "Request will fail, next request will retry."
            )
            raise

        elapsed = time.monotonic() - start
        _last_fetch_time = time.time()

        # Validate response before caching
        if not data.get("elements"):
            logger.error(
                "Bootstrap response missing 'elements' key. "
                f"Response keys: {list(data.keys())}, "
                f"Response sample: {str(data)[:200]}. "
                "API may be under maintenance or rate-limiting."
            )
            return data  # Return but don't cache invalid response

        # Store in cache
        try:
            _bootstrap_cache[cache_key] = data
            logger.info(
                f"Cached bootstrap-static: {len(data.get('elements', []))} players, "
                f"fetched in {elapsed:.2f}s"
            )
        except Exception as e:
            logger.error(
                f"Failed to cache bootstrap data: {e}. "
                "Request will succeed but future requests won't benefit from cache."
            )

        return data


def get_cached_gameweek() -> int | None:
    """Get current gameweek from cached bootstrap if available.

    Returns:
        Current gameweek number, or None if not cached or no current gameweek
    """
    cached = _bootstrap_cache.get("bootstrap")
    if cached is None:
        return None

    for event in cached.get("events", []):
        if event.get("is_current"):
            event_id = event.get("id")
            if event_id is not None:
                return event_id
            logger.warning(f"Event marked is_current but has no id: {event}")

    # Cache exists but no current gameweek - normal during off-season
    logger.debug(
        "Bootstrap cached but no current gameweek found. "
        f"Total events: {len(cached.get('events', []))}"
    )
    return None


def clear_cache() -> None:
    """Clear bootstrap cache. Used by tests to ensure isolation."""
    _bootstrap_cache.clear()


def get_cache_stats() -> dict[str, Any]:
    """Get cache statistics for monitoring."""
    return {
        "cached": "bootstrap" in _bootstrap_cache,
        "last_fetch": _last_fetch_time,
        "ttl_seconds": BOOTSTRAP_CACHE_TTL,
    }
