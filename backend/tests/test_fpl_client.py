"""Tests for FPL API client with mocked HTTP responses."""

import httpx
import pytest
import respx
from httpx import Response
from tenacity import RetryError

from app.services.fpl_client import (
    BootstrapData,
    FplApiClient,
    PlayerHistory,
)


@pytest.fixture
def fpl_client():
    """Create FPL client for testing."""
    # Fast rate for tests (no waiting)
    return FplApiClient(requests_per_second=100.0, max_concurrent=10)


class TestFplClientBootstrap:
    """Tests for bootstrap-static endpoint."""

    @respx.mock
    async def test_get_bootstrap_returns_data(self, fpl_client: FplApiClient):
        """Should parse bootstrap data correctly."""
        respx.get("https://fantasy.premierleague.com/api/bootstrap-static/").mock(
            return_value=Response(
                200,
                json={
                    "elements": [
                        {"id": 1, "web_name": "Salah"},
                        {"id": 2, "web_name": "Haaland"},
                    ],
                    "teams": [
                        {"id": 1, "name": "Arsenal", "short_name": "ARS"},
                        {"id": 12, "name": "Liverpool", "short_name": "LIV"},
                    ],
                    "events": [
                        {"id": 1, "is_current": False},
                        {"id": 18, "is_current": True},
                        {"id": 19, "is_current": False},
                    ],
                },
            )
        )

        result = await fpl_client.get_bootstrap()
        await fpl_client.close()

        assert isinstance(result, BootstrapData)
        assert len(result.players) == 2
        assert result.players[0]["web_name"] == "Salah"
        assert len(result.teams) == 2
        assert result.current_gameweek == 18

    @respx.mock
    async def test_get_bootstrap_handles_no_current_gameweek(
        self, fpl_client: FplApiClient
    ):
        """Should return None for current_gameweek if no event is current."""
        respx.get("https://fantasy.premierleague.com/api/bootstrap-static/").mock(
            return_value=Response(
                200,
                json={
                    "elements": [],
                    "teams": [],
                    "events": [
                        {"id": 1, "is_current": False},
                        {"id": 2, "is_current": False},
                    ],
                },
            )
        )

        result = await fpl_client.get_bootstrap()
        await fpl_client.close()

        assert result.current_gameweek is None


class TestFplClientPlayerHistory:
    """Tests for element-summary endpoint."""

    @respx.mock
    async def test_get_player_history_returns_list(self, fpl_client: FplApiClient):
        """Should parse player history correctly."""
        respx.get("https://fantasy.premierleague.com/api/element-summary/1/").mock(
            return_value=Response(
                200,
                json={
                    "history": [
                        {
                            "fixture": 101,
                            "opponent_team": 5,
                            "round": 1,
                            "total_points": 8,
                            "was_home": True,
                        },
                        {
                            "fixture": 115,
                            "opponent_team": 12,
                            "round": 2,
                            "total_points": 15,
                            "was_home": False,
                        },
                    ],
                    "fixtures": [],  # Not used
                },
            )
        )

        result = await fpl_client.get_player_history(1)
        await fpl_client.close()

        assert len(result) == 2
        assert isinstance(result[0], PlayerHistory)
        assert result[0].fixture_id == 101
        assert result[0].opponent_team == 5
        assert result[0].gameweek == 1
        assert result[0].total_points == 8
        assert result[0].was_home is True
        assert result[1].total_points == 15
        assert result[1].was_home is False

    @respx.mock
    async def test_get_player_history_empty(self, fpl_client: FplApiClient):
        """Should return empty list for player with no history."""
        respx.get("https://fantasy.premierleague.com/api/element-summary/999/").mock(
            return_value=Response(200, json={"history": [], "fixtures": []})
        )

        result = await fpl_client.get_player_history(999)
        await fpl_client.close()

        assert result == []


class TestFplClientFixtures:
    """Tests for fixtures endpoint."""

    @respx.mock
    async def test_get_fixtures_returns_list(self, fpl_client: FplApiClient):
        """Should return fixtures list."""
        respx.get("https://fantasy.premierleague.com/api/fixtures/").mock(
            return_value=Response(
                200,
                json=[
                    {"id": 1, "team_h": 1, "team_a": 2, "event": 1},
                    {"id": 2, "team_h": 3, "team_a": 4, "event": 1},
                ],
            )
        )

        result = await fpl_client.get_fixtures()
        await fpl_client.close()

        assert len(result) == 2
        assert result[0]["id"] == 1


class TestFplClientRetry:
    """Tests for retry behavior on transient errors."""

    @respx.mock
    async def test_retries_on_503(self, fpl_client: FplApiClient):
        """Should retry on 503 Service Unavailable."""
        route = respx.get("https://fantasy.premierleague.com/api/bootstrap-static/")
        # First call fails, second succeeds
        route.side_effect = [
            Response(503),
            Response(200, json={"elements": [], "teams": [], "events": []}),
        ]

        result = await fpl_client.get_bootstrap()
        await fpl_client.close()

        assert route.call_count == 2
        assert isinstance(result, BootstrapData)

    @respx.mock
    async def test_retries_on_429(self, fpl_client: FplApiClient):
        """Should retry on 429 Too Many Requests."""
        route = respx.get("https://fantasy.premierleague.com/api/fixtures/")
        route.side_effect = [
            Response(429),
            Response(200, json=[{"id": 1}]),
        ]

        result = await fpl_client.get_fixtures()
        await fpl_client.close()

        assert route.call_count == 2
        assert len(result) == 1

    @respx.mock
    async def test_retries_on_502(self, fpl_client: FplApiClient):
        """Should retry on 502 Bad Gateway."""
        route = respx.get("https://fantasy.premierleague.com/api/fixtures/")
        route.side_effect = [
            Response(502),
            Response(200, json=[{"id": 1}]),
        ]

        result = await fpl_client.get_fixtures()
        await fpl_client.close()

        assert route.call_count == 2
        assert len(result) == 1

    @respx.mock
    async def test_retries_on_timeout(self, fpl_client: FplApiClient):
        """Should retry on timeout exceptions."""
        route = respx.get("https://fantasy.premierleague.com/api/fixtures/")
        route.side_effect = [
            httpx.TimeoutException("Connection timed out"),
            Response(200, json=[{"id": 1}]),
        ]

        result = await fpl_client.get_fixtures()
        await fpl_client.close()

        assert route.call_count == 2
        assert len(result) == 1

    @respx.mock
    async def test_retries_on_500(self, fpl_client: FplApiClient):
        """Should retry on 500 Internal Server Error."""
        route = respx.get("https://fantasy.premierleague.com/api/fixtures/")
        route.side_effect = [
            Response(500),
            Response(200, json=[{"id": 1}]),
        ]

        result = await fpl_client.get_fixtures()
        await fpl_client.close()

        assert route.call_count == 2
        assert len(result) == 1

    @respx.mock
    async def test_retries_on_504(self, fpl_client: FplApiClient):
        """Should retry on 504 Gateway Timeout."""
        route = respx.get("https://fantasy.premierleague.com/api/fixtures/")
        route.side_effect = [
            Response(504),
            Response(200, json=[{"id": 1}]),
        ]

        result = await fpl_client.get_fixtures()
        await fpl_client.close()

        assert route.call_count == 2
        assert len(result) == 1

    @respx.mock
    async def test_retries_on_network_error(self, fpl_client: FplApiClient):
        """Should retry on network connection errors."""
        route = respx.get("https://fantasy.premierleague.com/api/fixtures/")
        route.side_effect = [
            httpx.NetworkError("Connection reset"),
            Response(200, json=[{"id": 1}]),
        ]

        result = await fpl_client.get_fixtures()
        await fpl_client.close()

        assert route.call_count == 2
        assert len(result) == 1


class TestFplClientResourceManagement:
    """Tests for HTTP client lifecycle."""

    @respx.mock
    async def test_client_reused_across_calls(self, fpl_client: FplApiClient):
        """Should reuse the same HTTP client for multiple requests."""
        respx.get("https://fantasy.premierleague.com/api/fixtures/").mock(
            return_value=Response(200, json=[])
        )

        await fpl_client.get_fixtures()
        client_after_first = fpl_client._client

        await fpl_client.get_fixtures()
        client_after_second = fpl_client._client

        await fpl_client.close()

        assert client_after_first is client_after_second
        assert client_after_first is not None

    async def test_close_handles_no_client(self, fpl_client: FplApiClient):
        """Should not error when closing before any requests."""
        # No requests made, client never initialized
        await fpl_client.close()  # Should not raise

        assert fpl_client._client is None

    @respx.mock
    async def test_async_context_manager(self):
        """Should support async with statement for automatic cleanup."""
        respx.get("https://fantasy.premierleague.com/api/fixtures/").mock(
            return_value=Response(200, json=[{"id": 1}])
        )

        async with FplApiClient(requests_per_second=100.0) as client:
            result = await client.get_fixtures()
            assert len(result) == 1

        # Client should be closed after exiting context
        assert client._client is None


class TestFplClientRetryExhaustion:
    """Tests for retry exhaustion behavior."""

    @respx.mock
    async def test_raises_after_retries_exhausted(self, fpl_client: FplApiClient):
        """Should raise RetryError after 3 failed retries."""
        route = respx.get("https://fantasy.premierleague.com/api/fixtures/")
        route.side_effect = [Response(503), Response(503), Response(503)]

        with pytest.raises(RetryError):
            await fpl_client.get_fixtures()

        await fpl_client.close()
        assert route.call_count == 3

    @respx.mock
    async def test_does_not_retry_on_404(self, fpl_client: FplApiClient):
        """Should NOT retry on 404 Not Found."""
        route = respx.get("https://fantasy.premierleague.com/api/element-summary/999/")
        route.mock(return_value=Response(404))

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await fpl_client.get_player_history(999)

        await fpl_client.close()
        assert route.call_count == 1  # No retries
        assert exc_info.value.response.status_code == 404

    @respx.mock
    async def test_does_not_retry_on_401(self, fpl_client: FplApiClient):
        """Should NOT retry on 401 Unauthorized."""
        route = respx.get("https://fantasy.premierleague.com/api/fixtures/")
        route.mock(return_value=Response(401))

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await fpl_client.get_fixtures()

        await fpl_client.close()
        assert route.call_count == 1  # No retries
        assert exc_info.value.response.status_code == 401

    @respx.mock
    async def test_does_not_retry_on_400(self, fpl_client: FplApiClient):
        """Should NOT retry on 400 Bad Request."""
        route = respx.get("https://fantasy.premierleague.com/api/fixtures/")
        route.mock(return_value=Response(400))

        with pytest.raises(httpx.HTTPStatusError) as exc_info:
            await fpl_client.get_fixtures()

        await fpl_client.close()
        assert route.call_count == 1  # No retries
        assert exc_info.value.response.status_code == 400
