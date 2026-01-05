"""Shared pytest fixtures for backend tests."""

from typing import Any
from unittest.mock import AsyncMock, patch

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
