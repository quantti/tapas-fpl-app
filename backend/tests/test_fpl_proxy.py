"""Unit tests for FPL proxy service."""

import time

import httpx
import pytest
import respx

from app.services.fpl_proxy import CacheEntry, FPLProxyService


class TestCacheEntry:
    """Tests for CacheEntry class."""

    def test_cache_entry_not_expired(self):
        """Cache entry should not be expired within TTL."""
        entry = CacheEntry(data={"test": "data"}, ttl=60)

        assert not entry.is_expired()
        assert entry.data == {"test": "data"}

    def test_cache_entry_expired(self):
        """Cache entry should be expired after TTL."""
        entry = CacheEntry(data={"test": "data"}, ttl=0)
        time.sleep(0.1)  # Wait a bit to ensure expiry

        assert entry.is_expired()

    def test_cache_entry_stores_data(self):
        """Cache entry should store arbitrary data."""
        data = {"players": [1, 2, 3], "count": 3}
        entry = CacheEntry(data=data, ttl=60)

        assert entry.data == data


class TestFPLProxyService:
    """Tests for FPLProxyService class."""

    @pytest.fixture
    def proxy_service(self):
        """Create a fresh proxy service for each test."""
        return FPLProxyService()

    @respx.mock
    async def test_get_bootstrap_static_success(
        self, proxy_service: FPLProxyService, sample_bootstrap_response: dict
    ):
        """Should fetch and return bootstrap-static data."""
        respx.get("https://fantasy.premierleague.com/api/bootstrap-static/").respond(
            json=sample_bootstrap_response
        )

        result = await proxy_service.get_bootstrap_static()

        assert result == sample_bootstrap_response
        assert "events" in result
        assert "teams" in result
        assert "elements" in result

    @respx.mock
    async def test_get_bootstrap_static_caching(
        self, proxy_service: FPLProxyService, sample_bootstrap_response: dict
    ):
        """Should cache bootstrap-static data and not re-fetch."""
        route = respx.get("https://fantasy.premierleague.com/api/bootstrap-static/").respond(
            json=sample_bootstrap_response
        )

        # First call - should fetch
        result1 = await proxy_service.get_bootstrap_static()
        # Second call - should use cache
        result2 = await proxy_service.get_bootstrap_static()

        assert result1 == result2
        assert route.call_count == 1  # Only one actual HTTP call

    @respx.mock
    async def test_get_fixtures_success(
        self, proxy_service: FPLProxyService, sample_fixtures_response: list
    ):
        """Should fetch and return fixtures data."""
        respx.get("https://fantasy.premierleague.com/api/fixtures/").respond(
            json=sample_fixtures_response
        )

        result = await proxy_service.get_fixtures()

        assert result == sample_fixtures_response
        assert len(result) == 3

    @respx.mock
    async def test_get_entry_success(
        self, proxy_service: FPLProxyService, sample_entry_response: dict
    ):
        """Should fetch and return entry data."""
        respx.get("https://fantasy.premierleague.com/api/entry/12345/").respond(
            json=sample_entry_response
        )

        result = await proxy_service.get_entry(12345)

        assert result == sample_entry_response
        assert result["id"] == 12345
        assert result["name"] == "Test FC"

    @respx.mock
    async def test_get_entry_picks_success(
        self, proxy_service: FPLProxyService, sample_picks_response: dict
    ):
        """Should fetch and return entry picks data."""
        respx.get("https://fantasy.premierleague.com/api/entry/12345/event/18/picks/").respond(
            json=sample_picks_response
        )

        result = await proxy_service.get_entry_picks(12345, 18)

        assert result == sample_picks_response
        assert "picks" in result
        assert len(result["picks"]) == 2

    @respx.mock
    async def test_get_league_standings_success(
        self, proxy_service: FPLProxyService, sample_league_response: dict
    ):
        """Should fetch and return league standings."""
        respx.get("https://fantasy.premierleague.com/api/leagues-classic/314/standings/").respond(
            json=sample_league_response
        )

        result = await proxy_service.get_league_standings(314)

        assert result == sample_league_response
        assert result["league"]["name"] == "Test League"
        assert len(result["standings"]["results"]) == 2

    @respx.mock
    async def test_get_event_live_success(
        self, proxy_service: FPLProxyService, sample_live_response: dict
    ):
        """Should fetch and return live event data."""
        respx.get("https://fantasy.premierleague.com/api/event/18/live/").respond(
            json=sample_live_response
        )

        result = await proxy_service.get_event_live(18)

        assert result == sample_live_response
        assert "elements" in result
        assert len(result["elements"]) == 2

    @respx.mock
    async def test_http_error_returns_none(self, proxy_service: FPLProxyService):
        """Should return None on HTTP error."""
        respx.get("https://fantasy.premierleague.com/api/bootstrap-static/").respond(status_code=500)

        result = await proxy_service.get_bootstrap_static()

        assert result is None

    @respx.mock
    async def test_network_error_returns_none(self, proxy_service: FPLProxyService):
        """Should return None on network error."""
        respx.get("https://fantasy.premierleague.com/api/bootstrap-static/").mock(
            side_effect=httpx.ConnectError("Connection failed")
        )

        result = await proxy_service.get_bootstrap_static()

        assert result is None

    @respx.mock
    async def test_404_returns_none(self, proxy_service: FPLProxyService):
        """Should return None on 404."""
        respx.get("https://fantasy.premierleague.com/api/entry/99999999/").respond(status_code=404)

        result = await proxy_service.get_entry(99999999)

        assert result is None

    @respx.mock
    async def test_different_endpoints_cached_separately(
        self,
        proxy_service: FPLProxyService,
        sample_bootstrap_response: dict,
        sample_fixtures_response: list,
    ):
        """Different endpoints should have separate cache entries."""
        respx.get("https://fantasy.premierleague.com/api/bootstrap-static/").respond(
            json=sample_bootstrap_response
        )
        respx.get("https://fantasy.premierleague.com/api/fixtures/").respond(
            json=sample_fixtures_response
        )

        bootstrap = await proxy_service.get_bootstrap_static()
        fixtures = await proxy_service.get_fixtures()

        assert bootstrap != fixtures
        assert "events" in bootstrap
        assert isinstance(fixtures, list)

    @respx.mock
    async def test_get_fixtures_with_event_filter(
        self, proxy_service: FPLProxyService, sample_fixtures_response: list
    ):
        """Should fetch fixtures filtered by event."""
        respx.get("https://fantasy.premierleague.com/api/fixtures/?event=18").respond(
            json=sample_fixtures_response[:1]
        )

        result = await proxy_service.get_fixtures(event=18)

        assert result is not None
        assert len(result) == 1

    @respx.mock
    async def test_get_entry_history_success(
        self, proxy_service: FPLProxyService, sample_entry_history_response: dict
    ):
        """Should fetch and return entry history data."""
        respx.get("https://fantasy.premierleague.com/api/entry/12345/history/").respond(
            json=sample_entry_history_response
        )

        result = await proxy_service.get_entry_history(12345)

        assert result == sample_entry_history_response
        assert "current" in result
        assert "past" in result
        assert "chips" in result

    @respx.mock
    async def test_get_entry_transfers_success(
        self, proxy_service: FPLProxyService, sample_entry_transfers_response: list
    ):
        """Should fetch and return entry transfers data."""
        respx.get("https://fantasy.premierleague.com/api/entry/12345/transfers/").respond(
            json=sample_entry_transfers_response
        )

        result = await proxy_service.get_entry_transfers(12345)

        assert result == sample_entry_transfers_response
        assert len(result) == 2
        assert result[0]["element_in"] == 100

    @respx.mock
    async def test_get_element_summary_success(
        self, proxy_service: FPLProxyService, sample_element_summary_response: dict
    ):
        """Should fetch and return element summary data."""
        respx.get("https://fantasy.premierleague.com/api/element-summary/1/").respond(
            json=sample_element_summary_response
        )

        result = await proxy_service.get_element_summary(1)

        assert result == sample_element_summary_response
        assert "fixtures" in result
        assert "history" in result
        assert "history_past" in result

    @respx.mock
    async def test_get_event_status_success(
        self, proxy_service: FPLProxyService, sample_event_status_response: dict
    ):
        """Should fetch and return event status data."""
        respx.get("https://fantasy.premierleague.com/api/event-status/").respond(
            json=sample_event_status_response
        )

        result = await proxy_service.get_event_status()

        assert result == sample_event_status_response
        assert "status" in result
        assert "leagues" in result
