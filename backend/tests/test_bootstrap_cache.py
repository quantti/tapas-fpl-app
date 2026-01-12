"""Unit tests for bootstrap_cache module.

Tests cover:
- Cache hit/miss behavior
- Thundering herd prevention (concurrent requests)
- Invalid response handling
- get_cached_gameweek function
- Cache clearing and stats
"""

import asyncio
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services.bootstrap_cache import (
    BOOTSTRAP_CACHE_TTL,
    clear_cache,
    get_cache_stats,
    get_cached_bootstrap,
    get_cached_gameweek,
)


@pytest.fixture
def mock_fetcher() -> AsyncMock:
    """Create a mock fetcher function."""
    return AsyncMock()


@pytest.fixture
def valid_bootstrap_response() -> dict[str, Any]:
    """Standard bootstrap response with all required fields."""
    return {
        "elements": [
            {"id": 1, "web_name": "Salah"},
            {"id": 2, "web_name": "Haaland"},
        ],
        "teams": [
            {"id": 1, "name": "Arsenal"},
            {"id": 12, "name": "Liverpool"},
        ],
        "events": [
            {"id": 1, "is_current": False},
            {"id": 18, "is_current": True},
            {"id": 19, "is_current": False},
        ],
    }


class TestGetCachedBootstrap:
    """Tests for get_cached_bootstrap function."""

    async def test_cache_miss_fetches_data(
        self, mock_fetcher: AsyncMock, valid_bootstrap_response: dict[str, Any]
    ):
        """First request should call fetcher and cache result."""
        mock_fetcher.return_value = valid_bootstrap_response

        result = await get_cached_bootstrap(mock_fetcher)

        mock_fetcher.assert_called_once_with(
            "https://fantasy.premierleague.com/api/bootstrap-static/"
        )
        assert result == valid_bootstrap_response

    async def test_cache_hit_skips_fetch(
        self, mock_fetcher: AsyncMock, valid_bootstrap_response: dict[str, Any]
    ):
        """Second request should use cache, not fetcher."""
        mock_fetcher.return_value = valid_bootstrap_response

        # First call populates cache
        await get_cached_bootstrap(mock_fetcher)
        # Second call should hit cache
        result = await get_cached_bootstrap(mock_fetcher)

        # Fetcher should only be called once
        mock_fetcher.assert_called_once()
        assert result == valid_bootstrap_response

    async def test_invalid_response_not_cached(self, mock_fetcher: AsyncMock):
        """Response without 'elements' should not be cached."""
        invalid_response = {"teams": [], "events": []}
        mock_fetcher.return_value = invalid_response

        # First call - invalid response
        result1 = await get_cached_bootstrap(mock_fetcher)
        assert result1 == invalid_response

        # Second call - should fetch again (not cached)
        mock_fetcher.return_value = {"elements": [{"id": 1}], "teams": [], "events": []}
        result2 = await get_cached_bootstrap(mock_fetcher)

        # Fetcher should be called twice (first response wasn't cached)
        assert mock_fetcher.call_count == 2
        assert result2["elements"] == [{"id": 1}]

    async def test_fetcher_exception_propagates(self, mock_fetcher: AsyncMock):
        """Fetcher exceptions should propagate to caller."""
        mock_fetcher.side_effect = Exception("Network error")

        with pytest.raises(Exception, match="Network error"):
            await get_cached_bootstrap(mock_fetcher)

    async def test_thundering_herd_prevention(
        self, mock_fetcher: AsyncMock, valid_bootstrap_response: dict[str, Any]
    ):
        """Concurrent requests should only trigger one fetch."""
        call_count = 0

        async def slow_fetcher(url: str) -> dict[str, Any]:
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.1)  # Simulate slow API
            return valid_bootstrap_response

        mock_fetcher.side_effect = slow_fetcher

        # Fire 5 concurrent requests
        results = await asyncio.gather(
            get_cached_bootstrap(mock_fetcher),
            get_cached_bootstrap(mock_fetcher),
            get_cached_bootstrap(mock_fetcher),
            get_cached_bootstrap(mock_fetcher),
            get_cached_bootstrap(mock_fetcher),
        )

        # Only one actual fetch should have occurred
        assert call_count == 1
        # All results should be the same
        assert all(r == valid_bootstrap_response for r in results)


class TestGetCachedGameweek:
    """Tests for get_cached_gameweek function."""

    async def test_returns_current_gameweek(
        self, mock_fetcher: AsyncMock, valid_bootstrap_response: dict[str, Any]
    ):
        """Should return current gameweek from cached data."""
        mock_fetcher.return_value = valid_bootstrap_response
        await get_cached_bootstrap(mock_fetcher)

        result = get_cached_gameweek()

        assert result == 18

    def test_returns_none_when_cache_empty(self):
        """Should return None when cache is empty."""
        # Cache is cleared by autouse fixture
        result = get_cached_gameweek()

        assert result is None

    async def test_returns_none_when_no_current_gameweek(self, mock_fetcher: AsyncMock):
        """Should return None when no event is marked current."""
        response = {
            "elements": [{"id": 1}],
            "teams": [],
            "events": [
                {"id": 1, "is_current": False},
                {"id": 2, "is_current": False},
            ],
        }
        mock_fetcher.return_value = response
        await get_cached_bootstrap(mock_fetcher)

        result = get_cached_gameweek()

        assert result is None

    async def test_handles_event_without_id(self, mock_fetcher: AsyncMock):
        """Should handle malformed event gracefully."""
        response = {
            "elements": [{"id": 1}],
            "teams": [],
            "events": [
                {"is_current": True},  # Missing 'id' field
                {"id": 2, "is_current": False},
            ],
        }
        mock_fetcher.return_value = response
        await get_cached_bootstrap(mock_fetcher)

        result = get_cached_gameweek()

        # Should return None (not crash) when id is missing
        assert result is None


class TestClearCache:
    """Tests for clear_cache function."""

    async def test_clear_removes_cached_data(
        self, mock_fetcher: AsyncMock, valid_bootstrap_response: dict[str, Any]
    ):
        """Clearing cache should force next request to fetch."""
        mock_fetcher.return_value = valid_bootstrap_response

        # Populate cache
        await get_cached_bootstrap(mock_fetcher)
        assert mock_fetcher.call_count == 1

        # Clear and verify gameweek is gone
        clear_cache()
        assert get_cached_gameweek() is None

        # Next request should fetch again
        await get_cached_bootstrap(mock_fetcher)
        assert mock_fetcher.call_count == 2


class TestGetCacheStats:
    """Tests for get_cache_stats function."""

    def test_returns_not_cached_when_empty(self):
        """Should report not cached when cache is empty."""
        stats = get_cache_stats()

        assert stats["cached"] is False
        assert stats["ttl_seconds"] == BOOTSTRAP_CACHE_TTL

    async def test_returns_cached_after_fetch(
        self, mock_fetcher: AsyncMock, valid_bootstrap_response: dict[str, Any]
    ):
        """Should report cached after successful fetch."""
        mock_fetcher.return_value = valid_bootstrap_response
        await get_cached_bootstrap(mock_fetcher)

        stats = get_cache_stats()

        assert stats["cached"] is True
        assert stats["last_fetch"] > 0
