"""FPL API client with rate limiting for data collection."""

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx
from tenacity import (
    before_sleep_log,
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger(__name__)

FPL_BASE_URL = "https://fantasy.premierleague.com/api"

# HTTP status codes that should trigger a retry
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def _is_retryable_error(exception: BaseException) -> bool:
    """Check if an error should trigger a retry."""
    if isinstance(exception, (httpx.TimeoutException, httpx.NetworkError)):
        return True
    if isinstance(exception, httpx.HTTPStatusError):
        return exception.response.status_code in RETRYABLE_STATUS_CODES
    return False


@dataclass
class PlayerHistory:
    """Player's gameweek history entry."""

    fixture_id: int
    opponent_team: int
    gameweek: int
    total_points: int
    was_home: bool


@dataclass
class BootstrapData:
    """Core bootstrap data from FPL API."""

    players: list[dict[str, Any]]
    teams: list[dict[str, Any]]
    events: list[dict[str, Any]]
    current_gameweek: int | None


class FplApiClient:
    """
    FPL API client with rate limiting.

    The FPL API doesn't officially document rate limits, but empirically:
    - ~60 requests/minute is safe
    - 503s happen if you go too fast
    - Player element-summary endpoints are the heaviest
    """

    def __init__(
        self,
        requests_per_second: float = 1.0,
        max_concurrent: int = 5,
    ):
        """
        Initialize the client.

        Args:
            requests_per_second: Target rate (1.0 = 1 request/sec)
            max_concurrent: Maximum concurrent requests
        """
        self.delay = 1.0 / requests_per_second
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self._last_request_time = 0.0
        self._lock = asyncio.Lock()
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client (lazy initialization, coroutine-safe)."""
        if self._client is None:
            async with self._lock:
                if self._client is None:  # Double-check after acquiring lock
                    self._client = httpx.AsyncClient(timeout=30.0)
        return self._client

    async def close(self) -> None:
        """Close the HTTP client and release resources (coroutine-safe)."""
        async with self._lock:
            if self._client is not None:
                await self._client.aclose()
                self._client = None

    async def __aenter__(self) -> "FplApiClient":
        """Enter async context manager."""
        return self

    async def __aexit__(self, *args: object) -> None:
        """Exit async context manager and close client."""
        await self.close()

    async def _rate_limit(self) -> None:
        """Apply rate limiting between requests."""
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_request_time
            if elapsed < self.delay:
                await asyncio.sleep(self.delay - elapsed)
            self._last_request_time = time.monotonic()

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception(_is_retryable_error),
        before_sleep=before_sleep_log(logger, logging.WARNING),
    )
    async def _get(self, url: str) -> dict[str, Any]:
        """Make a rate-limited GET request with retries."""
        async with self.semaphore:
            await self._rate_limit()

            client = await self._get_client()
            response = await client.get(url)
            response.raise_for_status()
            return response.json()

    async def get_bootstrap(self) -> BootstrapData:
        """
        Fetch bootstrap-static data (players, teams, gameweeks).
        This is a single request that gives us all the core data.
        """
        data = await self._get(f"{FPL_BASE_URL}/bootstrap-static/")

        # Find current gameweek
        current_gw = None
        for event in data.get("events", []):
            if event.get("is_current"):
                current_gw = event["id"]
                break

        return BootstrapData(
            players=data.get("elements", []),
            teams=data.get("teams", []),
            events=data.get("events", []),
            current_gameweek=current_gw,
        )

    async def get_player_history(self, player_id: int) -> list[PlayerHistory]:
        """
        Fetch a player's gameweek history (element-summary endpoint).
        This is the heavy endpoint - one request per player.
        """
        data = await self._get(f"{FPL_BASE_URL}/element-summary/{player_id}/")

        history = []
        for h in data.get("history", []):
            history.append(
                PlayerHistory(
                    fixture_id=h["fixture"],
                    opponent_team=h["opponent_team"],
                    gameweek=h["round"],
                    total_points=h["total_points"],
                    was_home=h["was_home"],
                )
            )

        return history

    async def get_fixtures(self) -> list[dict[str, Any]]:
        """Fetch all fixtures for the current season."""
        return await self._get(f"{FPL_BASE_URL}/fixtures/")
