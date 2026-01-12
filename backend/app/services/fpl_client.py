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

from app.services.bootstrap_cache import get_cached_bootstrap, get_cached_gameweek

logger = logging.getLogger(__name__)

FPL_BASE_URL = "https://fantasy.premierleague.com/api"

# HTTP status codes that should trigger a retry
RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}


def _safe_int(val: Any, default: int = 0) -> int:
    """Safely convert API value to int, handling None and empty strings."""
    if val is None or val == "":
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def _safe_float(val: Any, default: float = 0.0) -> float:
    """Safely convert API value to float, handling None and empty strings."""
    if val is None or val == "":
        return default
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _is_retryable_error(exception: BaseException) -> bool:
    """Check if an error should trigger a retry."""
    if isinstance(exception, (httpx.TimeoutException, httpx.NetworkError)):
        return True
    if isinstance(exception, httpx.HTTPStatusError):
        return exception.response.status_code in RETRYABLE_STATUS_CODES
    return False


@dataclass(slots=True)
class PlayerHistory:
    """Player's gameweek history entry from element-summary endpoint."""

    # Core identification
    fixture_id: int
    opponent_team: int
    gameweek: int
    was_home: bool
    kickoff_time: str | None

    # Points breakdown
    minutes: int
    total_points: int
    bonus: int
    bps: int  # Bonus Points System raw score

    # Attacking stats
    goals_scored: int
    assists: int
    expected_goals: float
    expected_assists: float
    expected_goal_involvements: float

    # Defensive stats
    clean_sheets: int
    goals_conceded: int
    own_goals: int
    penalties_saved: int
    penalties_missed: int
    saves: int
    expected_goals_conceded: float

    # Cards
    yellow_cards: int
    red_cards: int

    # ICT Index
    influence: float
    creativity: float
    threat: float
    ict_index: float

    # Value and ownership at time of match
    value: int  # Price * 10
    selected: int
    transfers_in: int
    transfers_out: int

    # Playing status
    starts: int  # 1 if started, 0 if sub


@dataclass(slots=True)
class ChipUsage:
    """A chip used by a manager in a season."""

    name: str  # "wildcard", "bboost", "3xc", "freehit"
    event: int  # Gameweek number when used


@dataclass(slots=True)
class LeagueMember:
    """A manager in a mini-league."""

    manager_id: int
    player_name: str
    team_name: str
    rank: int
    total_points: int


@dataclass(slots=True)
class LeagueStandings:
    """League standings including league info and members."""

    league_id: int
    league_name: str
    members: list[LeagueMember]


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
        self._current_gameweek: int | None = None  # Cached for efficiency

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
            self._current_gameweek = None  # Reset cache to avoid stale data

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

        Uses shared singleton cache to prevent OOM from multiple concurrent
        requests parsing the ~1.8MB response.
        """
        data = await get_cached_bootstrap(self._get)

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

        Returns all stats from the API for recommendations engine:
        - Points breakdown (minutes, bonus, bps)
        - Attacking stats (goals, assists, xG, xA)
        - Defensive stats (clean sheets, goals conceded, saves)
        - ICT Index components
        - Value and ownership at time of match
        """
        data = await self._get(f"{FPL_BASE_URL}/element-summary/{player_id}/")

        history = []
        for h in data.get("history", []):
            history.append(
                PlayerHistory(
                    # Core identification
                    fixture_id=h["fixture"],
                    opponent_team=h["opponent_team"],
                    gameweek=h["round"],
                    was_home=h["was_home"],
                    kickoff_time=h.get("kickoff_time"),
                    # Points breakdown
                    minutes=_safe_int(h.get("minutes")),
                    total_points=_safe_int(h.get("total_points")),
                    bonus=_safe_int(h.get("bonus")),
                    bps=_safe_int(h.get("bps")),
                    # Attacking stats
                    goals_scored=_safe_int(h.get("goals_scored")),
                    assists=_safe_int(h.get("assists")),
                    expected_goals=_safe_float(h.get("expected_goals")),
                    expected_assists=_safe_float(h.get("expected_assists")),
                    expected_goal_involvements=_safe_float(
                        h.get("expected_goal_involvements")
                    ),
                    # Defensive stats
                    clean_sheets=_safe_int(h.get("clean_sheets")),
                    goals_conceded=_safe_int(h.get("goals_conceded")),
                    own_goals=_safe_int(h.get("own_goals")),
                    penalties_saved=_safe_int(h.get("penalties_saved")),
                    penalties_missed=_safe_int(h.get("penalties_missed")),
                    saves=_safe_int(h.get("saves")),
                    expected_goals_conceded=_safe_float(
                        h.get("expected_goals_conceded")
                    ),
                    # Cards
                    yellow_cards=_safe_int(h.get("yellow_cards")),
                    red_cards=_safe_int(h.get("red_cards")),
                    # ICT Index
                    influence=_safe_float(h.get("influence")),
                    creativity=_safe_float(h.get("creativity")),
                    threat=_safe_float(h.get("threat")),
                    ict_index=_safe_float(h.get("ict_index")),
                    # Value and ownership
                    value=_safe_int(h.get("value")),
                    selected=_safe_int(h.get("selected")),
                    transfers_in=_safe_int(h.get("transfers_in")),
                    transfers_out=_safe_int(h.get("transfers_out")),
                    # Playing status
                    starts=_safe_int(h.get("starts")),
                )
            )

        return history

    async def get_fixtures(self) -> list[dict[str, Any]]:
        """Fetch all fixtures for the current season."""
        return await self._get(f"{FPL_BASE_URL}/fixtures/")

    async def get_entry_history(self, manager_id: int) -> list[ChipUsage]:
        """
        Fetch a manager's season history including chip usage.

        The /entry/{id}/history endpoint returns:
        - current: gameweek entries for current season
        - past: summary of past seasons
        - chips: list of chips used (name, time, event)

        Args:
            manager_id: FPL manager ID

        Returns:
            List of chips used this season
        """
        data = await self._get(f"{FPL_BASE_URL}/entry/{manager_id}/history/")

        chips = []
        for chip in data.get("chips", []):
            name = chip.get("name", "")
            event = _safe_int(chip.get("event"))
            if name and event > 0:
                chips.append(ChipUsage(name=name, event=event))

        return chips

    async def get_league_standings(self, league_id: int) -> LeagueStandings:
        """
        Fetch league standings with all members.

        The /leagues-classic/{id}/standings/ endpoint returns paginated results.
        We fetch all pages to get all members.

        Args:
            league_id: FPL classic league ID

        Returns:
            LeagueStandings with league info and all members
        """
        members: list[LeagueMember] = []
        league_name = f"League {league_id}"  # Default fallback
        page = 1
        has_next = True

        while has_next:
            data = await self._get(
                f"{FPL_BASE_URL}/leagues-classic/{league_id}/standings/?page_standings={page}"
            )

            # Extract league name from first page response
            if page == 1:
                league_info = data.get("league", {})
                league_name = league_info.get("name", league_name)

            standings = data.get("standings", {})
            results = standings.get("results", [])

            for entry in results:
                manager_id = _safe_int(entry.get("entry"))
                # Filter out invalid entries (manager_id=0 means parsing failed)
                if manager_id <= 0:
                    logger.warning(
                        f"Skipping invalid entry in league {league_id}: {entry}"
                    )
                    continue

                members.append(
                    LeagueMember(
                        manager_id=manager_id,
                        player_name=entry.get("player_name", ""),
                        team_name=entry.get("entry_name", ""),
                        rank=_safe_int(entry.get("rank")),
                        total_points=_safe_int(entry.get("total")),
                    )
                )

            has_next = standings.get("has_next", False)
            page += 1

            # Safety limit to prevent infinite loops
            if page > 100:
                logger.warning(f"League {league_id} has >5000 members, stopping at page 100")
                break

        return LeagueStandings(
            league_id=league_id,
            league_name=league_name,
            members=members,
        )

    async def get_league_standings_raw(self, league_id: int) -> dict[str, Any]:
        """
        Fetch raw league standings as dict.

        Unlike get_league_standings which returns a typed LeagueStandings dataclass,
        this method returns the raw FPL API response format for RecommendationsService.

        Args:
            league_id: FPL classic league ID

        Returns:
            Dict with standings.results array containing all league members
        """
        members: list[dict[str, Any]] = []
        page = 1
        has_next = True

        while has_next:
            data = await self._get(
                f"{FPL_BASE_URL}/leagues-classic/{league_id}/standings/?page_standings={page}"
            )

            standings = data.get("standings", {})
            results = standings.get("results", [])
            members.extend(results)

            has_next = standings.get("has_next", False)
            page += 1

            if page > 100:
                logger.warning(f"League {league_id} has >5000 members, stopping at page 100")
                break

        # Return in expected format
        return {"standings": {"results": members}}

    async def get_bootstrap_static(self) -> dict[str, Any]:
        """
        Fetch raw bootstrap-static data as dict.

        Used by RecommendationsService which needs the raw API response
        including elements, events, and teams. Uses shared singleton cache
        to prevent OOM from multiple concurrent requests parsing the ~1.8MB response.

        Returns:
            Dict with elements (players), events (gameweeks), and teams arrays
        """
        data = await get_cached_bootstrap(self._get)

        # Update instance cache for efficiency (may already be set by shared cache)
        for event in data.get("events", []):
            if event.get("is_current"):
                self._current_gameweek = event["id"]
                break

        return data

    async def _get_current_gameweek(self) -> int:
        """
        Get current gameweek, fetching from API if not cached.

        Fallback chain: instance cache → shared cache → fetch → first unfinished → GW 1

        Returns:
            Current gameweek number (1-38)
        """
        # Fast path: instance cache
        if self._current_gameweek is not None:
            return self._current_gameweek

        # Fast path: shared cache (no API call if bootstrap is cached)
        cached_gw = get_cached_gameweek()
        if cached_gw is not None:
            self._current_gameweek = cached_gw
            return cached_gw

        # Slow path: fetch via shared cache
        bootstrap = await get_cached_bootstrap(self._get)
        for event in bootstrap.get("events", []):
            if event.get("is_current"):
                self._current_gameweek = event["id"]
                return self._current_gameweek

        # Fallback to first unfinished gameweek
        for event in bootstrap.get("events", []):
            if not event.get("finished"):
                self._current_gameweek = event["id"]
                return self._current_gameweek

        self._current_gameweek = 1  # Ultimate fallback
        return self._current_gameweek

    async def get_manager_picks(self, manager_id: int) -> dict[str, Any]:
        """
        Fetch a manager's current gameweek picks.

        Args:
            manager_id: FPL manager ID

        Returns:
            Dict with picks list containing player selections
        """
        current_gw = await self._get_current_gameweek()
        return await self._get(
            f"{FPL_BASE_URL}/entry/{manager_id}/event/{current_gw}/picks/"
        )
