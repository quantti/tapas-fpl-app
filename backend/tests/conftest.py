"""Shared pytest fixtures for backend tests."""

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def async_client() -> AsyncClient:
    """Async HTTP client for testing the FastAPI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


# =============================================================================
# MockDB: Shared Database Mock Fixture
# =============================================================================


class AsyncContextManagerMock:
    """Async context manager mock for use with 'async with' statements."""

    async def __aenter__(self) -> "AsyncContextManagerMock":
        return self

    async def __aexit__(self, *args: Any) -> None:
        pass


class MockDB:
    """Mock database connection with context manager pattern.

    The module_path is REQUIRED to ensure tests explicitly declare which service
    they're mocking. This prevents accidental cross-service pollution.

    Usage:
        # Create a service-specific fixture:
        @pytest.fixture
        def mock_chips_db() -> MockDB:
            return MockDB("app.services.chips.get_connection")

        # Use in tests:
        async def test_example(mock_chips_db: MockDB):
            mock_chips_db.conn.fetch.return_value = [{"id": 1}]
            with mock_chips_db:
                result = await service.get_data()

        # For multiple queries:
        mock_db.conn.fetch.side_effect = [result1, result2]

        # For errors:
        mock_db.conn.fetch.side_effect = Exception("Connection timeout")
    """

    conn: AsyncMock
    patch: Any
    _mock_get_conn: Any

    def __init__(self, module_path: str) -> None:
        """Initialize MockDB with the target module path.

        Args:
            module_path: The import path to patch (e.g., "app.services.chips.get_connection").
                        Always patch where the function is USED, not where it's defined.
        """
        self.conn = AsyncMock()
        # conn.transaction() is sync but returns an async context manager
        # Use MagicMock for transaction to avoid it returning a coroutine
        self.conn.transaction = MagicMock(return_value=AsyncContextManagerMock())
        self.patch = patch(module_path)
        self._mock_get_conn = None

    def __enter__(self) -> "MockDB":
        self._mock_get_conn = self.patch.__enter__()
        self._mock_get_conn.return_value.__aenter__.return_value = self.conn
        return self

    def __exit__(self, *args: Any) -> None:
        self.patch.__exit__(*args)


@pytest.fixture
def mock_db() -> MockDB:
    """Mock database connection for chips service tests.

    This fixture is pre-configured for the chips service. For other services,
    create a similar fixture with the appropriate module path:

        @pytest.fixture
        def mock_points_db() -> MockDB:
            return MockDB("app.services.points_against.get_connection")
    """
    return MockDB("app.services.chips.get_connection")


@pytest.fixture
def mock_pool():
    """Mock get_pool to make require_db() dependency pass.

    Use this fixture when testing endpoint validation (422 errors) where you
    need to bypass the database availability check but don't need actual DB queries.

    For tests that need actual DB mocking, use MockDB fixtures instead.
    """
    with patch("app.dependencies.get_pool") as mock:
        mock.return_value = MagicMock()
        yield mock


# =============================================================================
# MockAsyncpgPool: Shared asyncpg Pool Mock for Script Tests
# =============================================================================


class MockAcquire:
    """Async context manager for pool.acquire()."""

    def __init__(self, conn: AsyncMock) -> None:
        self.conn = conn

    async def __aenter__(self) -> AsyncMock:
        return self.conn

    async def __aexit__(self, *args: Any) -> None:
        pass


class MockAsyncpgPool:
    """Mock asyncpg connection pool with acquire() context manager.

    Usage:
        async def test_example(mock_asyncpg_pool):
            mock_asyncpg_pool.conn.fetch.return_value = [{"id": 1}]
            # ... test code that uses pool.acquire()
    """

    def __init__(self) -> None:
        self.conn = AsyncMock()

    def acquire(self) -> MockAcquire:
        """Return async context manager (not a coroutine)."""
        return MockAcquire(self.conn)

    async def close(self) -> None:
        pass


@pytest.fixture
def mock_asyncpg_pool() -> MockAsyncpgPool:
    """Mock asyncpg pool for script tests (backfill, compute).

    This provides a pool with acquire() that returns an async context manager,
    matching asyncpg's Pool.acquire() behavior.
    """
    return MockAsyncpgPool()


@pytest.fixture(autouse=True)
def clear_api_cache():
    """Clear the in-memory API cache before each test.

    This ensures tests don't interfere with each other via cached responses.
    The cache is particularly important for recommendations tests where we need
    to test both successful responses and error handling.
    """
    from app.api.routes import clear_cache

    clear_cache()
    yield
    clear_cache()
