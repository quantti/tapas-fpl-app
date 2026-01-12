"""Tests for league ownership computation functions.

Tests cover:
- compute_league_ownership: Core aggregation logic
- verify_league_ownership_data: Data validation
- get_gameweeks_with_picks: Gameweek discovery
"""

from typing import TypedDict
from unittest.mock import AsyncMock, patch

import pytest


# =============================================================================
# TypedDicts for Mock Data
# =============================================================================


class OwnershipVerificationRow(TypedDict):
    """Database row structure for verification query."""

    player_count: int
    total_captains: int | None
    min_percent: float | None
    max_percent: float | None


class GameweekRow(TypedDict):
    """Database row structure for gameweek query."""

    gameweek: int


# =============================================================================
# Shared Fixtures
# =============================================================================


@pytest.fixture
def mock_conn() -> AsyncMock:
    """Create a mock asyncpg connection."""
    return AsyncMock()


# =============================================================================
# Tests: compute_league_ownership
# =============================================================================


class TestComputeLeagueOwnership:
    """Tests for compute_league_ownership function."""

    async def test_returns_correct_player_and_manager_counts(
        self, mock_conn: AsyncMock
    ):
        """Should aggregate ownership and return (records, managers) tuple."""
        from scripts.compute_league_ownership import compute_league_ownership

        # Mock: 20 managers in league
        mock_conn.fetchval.return_value = 20
        # Mock: INSERT returned 150 player records
        mock_conn.execute.return_value = "INSERT 0 150"

        records, managers = await compute_league_ownership(
            mock_conn, league_id=242017, season_id=2, gameweek=10
        )

        assert records == 150
        assert managers == 20
        mock_conn.execute.assert_called_once()

    async def test_returns_zero_when_no_managers_found(self, mock_conn: AsyncMock):
        """Should return (0, 0) when league has no manager data for gameweek."""
        from scripts.compute_league_ownership import compute_league_ownership

        mock_conn.fetchval.return_value = 0  # No managers

        records, managers = await compute_league_ownership(
            mock_conn, league_id=242017, season_id=2, gameweek=10
        )

        assert records == 0
        assert managers == 0
        # Should NOT attempt insert when no managers
        mock_conn.execute.assert_not_called()

    async def test_handles_none_manager_count(self, mock_conn: AsyncMock):
        """Should handle NULL return from COUNT query gracefully."""
        from scripts.compute_league_ownership import compute_league_ownership

        mock_conn.fetchval.return_value = None  # DB returns NULL

        records, managers = await compute_league_ownership(
            mock_conn, league_id=242017, season_id=2, gameweek=10
        )

        assert records == 0
        assert managers == 0
        mock_conn.execute.assert_not_called()

    async def test_handles_malformed_execute_result(self, mock_conn: AsyncMock):
        """Should re-query for actual count when execute result is malformed."""
        from scripts.compute_league_ownership import compute_league_ownership

        # First call: manager count, Second call: re-query count
        mock_conn.fetchval.side_effect = [20, 150]
        mock_conn.execute.return_value = "UNEXPECTED FORMAT"

        records, managers = await compute_league_ownership(
            mock_conn, league_id=242017, season_id=2, gameweek=10
        )

        # Should re-query to get actual count (150)
        assert records == 150
        assert managers == 20
        # Verify fetchval was called twice (manager count + re-query)
        assert mock_conn.fetchval.call_count == 2

    async def test_handles_empty_execute_result(self, mock_conn: AsyncMock):
        """Should re-query for actual count when execute result is empty."""
        from scripts.compute_league_ownership import compute_league_ownership

        # First call: manager count, Second call: re-query count
        mock_conn.fetchval.side_effect = [20, 100]
        mock_conn.execute.return_value = ""

        records, managers = await compute_league_ownership(
            mock_conn, league_id=242017, season_id=2, gameweek=10
        )

        # Should re-query to get actual count (100)
        assert records == 100
        assert managers == 20

    async def test_query_includes_correct_parameters(self, mock_conn: AsyncMock):
        """Should pass league_id, season_id, gameweek, and manager_count to query."""
        from scripts.compute_league_ownership import compute_league_ownership

        mock_conn.fetchval.return_value = 25
        mock_conn.execute.return_value = "INSERT 0 100"

        await compute_league_ownership(
            mock_conn, league_id=242017, season_id=2, gameweek=15
        )

        # Verify execute was called with correct params
        call_args = mock_conn.execute.call_args
        assert call_args[0][1] == 242017  # league_id
        assert call_args[0][2] == 2  # season_id
        assert call_args[0][3] == 15  # gameweek
        assert call_args[0][4] == 25  # manager_count

    async def test_propagates_database_exception_on_fetchval(self, mock_conn: AsyncMock):
        """Should propagate database exceptions from manager count query."""
        from scripts.compute_league_ownership import compute_league_ownership

        mock_conn.fetchval.side_effect = Exception("Connection reset")

        with pytest.raises(Exception, match="Connection reset"):
            await compute_league_ownership(
                mock_conn, league_id=242017, season_id=2, gameweek=10
            )

    async def test_propagates_database_exception_on_execute(self, mock_conn: AsyncMock):
        """Should propagate database exceptions from insert query."""
        from scripts.compute_league_ownership import compute_league_ownership

        mock_conn.fetchval.return_value = 20
        mock_conn.execute.side_effect = Exception("Deadlock detected")

        with pytest.raises(Exception, match="Deadlock detected"):
            await compute_league_ownership(
                mock_conn, league_id=242017, season_id=2, gameweek=10
            )


# =============================================================================
# Tests: verify_league_ownership_data
# =============================================================================


class TestVerifyLeagueOwnershipData:
    """Tests for verify_league_ownership_data function."""

    async def test_returns_true_for_valid_data(self, mock_conn: AsyncMock):
        """Should pass verification when all checks are within bounds."""
        from scripts.compute_league_ownership import verify_league_ownership_data

        mock_conn.fetchrow.return_value = OwnershipVerificationRow(
            player_count=150,
            total_captains=20,  # Matches expected_members
            min_percent=5.0,
            max_percent=95.0,
        )

        result = await verify_league_ownership_data(
            mock_conn,
            season_id=2,
            league_id=242017,
            gameweek=10,
            expected_members=20,
        )

        assert result is True

    async def test_returns_false_when_no_records_found(self, mock_conn: AsyncMock):
        """Should fail verification when ownership table has no data."""
        from scripts.compute_league_ownership import verify_league_ownership_data

        mock_conn.fetchrow.return_value = OwnershipVerificationRow(
            player_count=0,
            total_captains=None,
            min_percent=None,
            max_percent=None,
        )

        result = await verify_league_ownership_data(
            mock_conn,
            season_id=2,
            league_id=242017,
            gameweek=10,
            expected_members=20,
        )

        assert result is False

    async def test_returns_false_when_row_is_none(self, mock_conn: AsyncMock):
        """Should fail verification when query returns None."""
        from scripts.compute_league_ownership import verify_league_ownership_data

        mock_conn.fetchrow.return_value = None

        result = await verify_league_ownership_data(
            mock_conn,
            season_id=2,
            league_id=242017,
            gameweek=10,
            expected_members=20,
        )

        assert result is False

    async def test_fails_when_min_percent_negative(self, mock_conn: AsyncMock):
        """Should fail when ownership_percent < 0 (data corruption)."""
        from scripts.compute_league_ownership import verify_league_ownership_data

        mock_conn.fetchrow.return_value = OwnershipVerificationRow(
            player_count=150,
            total_captains=20,
            min_percent=-5.0,  # Invalid negative percentage
            max_percent=95.0,
        )

        result = await verify_league_ownership_data(
            mock_conn,
            season_id=2,
            league_id=242017,
            gameweek=10,
            expected_members=20,
        )

        assert result is False

    async def test_fails_when_max_percent_over_100(self, mock_conn: AsyncMock):
        """Should fail when ownership_percent > 100 (data corruption)."""
        from scripts.compute_league_ownership import verify_league_ownership_data

        mock_conn.fetchrow.return_value = OwnershipVerificationRow(
            player_count=150,
            total_captains=20,
            min_percent=5.0,
            max_percent=105.0,  # Invalid percentage over 100
        )

        result = await verify_league_ownership_data(
            mock_conn,
            season_id=2,
            league_id=242017,
            gameweek=10,
            expected_members=20,
        )

        assert result is False

    async def test_fails_when_captain_count_exceeds_tolerance(
        self, mock_conn: AsyncMock
    ):
        """Should fail when captain count differs by >10% from expected."""
        from scripts.compute_league_ownership import verify_league_ownership_data

        mock_conn.fetchrow.return_value = OwnershipVerificationRow(
            player_count=150,
            total_captains=5,  # Expected 20, diff is 75% - way over 10%
            min_percent=5.0,
            max_percent=95.0,
        )

        result = await verify_league_ownership_data(
            mock_conn,
            season_id=2,
            league_id=242017,
            gameweek=10,
            expected_members=20,
        )

        assert result is False

    async def test_passes_when_captain_count_within_tolerance(
        self, mock_conn: AsyncMock
    ):
        """Should pass when captain count is within 10% tolerance."""
        from scripts.compute_league_ownership import verify_league_ownership_data

        # 10% of 20 = 2, so 18-22 captains should pass
        mock_conn.fetchrow.return_value = OwnershipVerificationRow(
            player_count=150,
            total_captains=18,  # Within tolerance (10% of 20 = 2)
            min_percent=5.0,
            max_percent=95.0,
        )

        result = await verify_league_ownership_data(
            mock_conn,
            season_id=2,
            league_id=242017,
            gameweek=10,
            expected_members=20,
        )

        assert result is True

    async def test_handles_none_total_captains(self, mock_conn: AsyncMock):
        """Should pass verification when total_captains is None (no captain column)."""
        from scripts.compute_league_ownership import verify_league_ownership_data

        mock_conn.fetchrow.return_value = OwnershipVerificationRow(
            player_count=150,
            total_captains=None,  # No captain data
            min_percent=5.0,
            max_percent=95.0,
        )

        result = await verify_league_ownership_data(
            mock_conn,
            season_id=2,
            league_id=242017,
            gameweek=10,
            expected_members=20,
        )

        assert result is True  # None captains should not fail verification


# =============================================================================
# Tests: get_gameweeks_with_picks
# =============================================================================


class TestGetGameweeksWithPicks:
    """Tests for get_gameweeks_with_picks function."""

    async def test_returns_sorted_gameweek_list(self, mock_conn: AsyncMock):
        """Should return gameweeks in ascending order."""
        from scripts.compute_league_ownership import get_gameweeks_with_picks

        mock_conn.fetch.return_value = [
            GameweekRow(gameweek=5),
            GameweekRow(gameweek=10),
            GameweekRow(gameweek=15),
            GameweekRow(gameweek=20),
        ]

        result = await get_gameweeks_with_picks(mock_conn, league_id=242017, season_id=2)

        assert result == [5, 10, 15, 20]

    async def test_returns_empty_list_when_no_picks(self, mock_conn: AsyncMock):
        """Should return empty list when league has no pick data."""
        from scripts.compute_league_ownership import get_gameweeks_with_picks

        mock_conn.fetch.return_value = []

        result = await get_gameweeks_with_picks(mock_conn, league_id=242017, season_id=2)

        assert result == []

    async def test_query_filters_by_league_and_season(self, mock_conn: AsyncMock):
        """Should filter query by league_id and season_id."""
        from scripts.compute_league_ownership import get_gameweeks_with_picks

        mock_conn.fetch.return_value = []

        await get_gameweeks_with_picks(mock_conn, league_id=242017, season_id=2)

        # Verify fetch was called with correct params
        call_args = mock_conn.fetch.call_args
        assert call_args[0][1] == 242017  # league_id
        assert call_args[0][2] == 2  # season_id
