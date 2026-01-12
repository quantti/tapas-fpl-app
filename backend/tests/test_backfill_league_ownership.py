"""Tests for league ownership backfill script.

Tests cover the backfill orchestration logic, not the underlying
compute_league_ownership functions (tested separately).
"""

from unittest.mock import MagicMock, patch

import pytest


# =============================================================================
# Tests: backfill_league_ownership
# =============================================================================


class TestBackfillLeagueOwnership:
    """Tests for backfill_league_ownership function."""

    @patch("scripts.backfill_league_ownership.create_pool")
    @patch("scripts.backfill_league_ownership.get_or_create_season")
    @patch("scripts.backfill_league_ownership.get_gameweeks_with_picks")
    async def test_dry_run_does_not_compute_ownership(
        self,
        mock_get_gws: MagicMock,
        mock_get_season: MagicMock,
        mock_create_pool: MagicMock,
        mock_asyncpg_pool,
    ):
        """Dry run should query gameweeks but not compute ownership."""
        from scripts.backfill_league_ownership import backfill_league_ownership

        mock_create_pool.return_value = mock_asyncpg_pool
        mock_get_season.return_value = 2
        mock_get_gws.return_value = [10, 11, 12]

        with patch(
            "scripts.backfill_league_ownership.compute_league_ownership"
        ) as mock_compute:
            await backfill_league_ownership(
                league_id=242017,
                dry_run=True,
            )

            # Should NOT compute ownership in dry run
            mock_compute.assert_not_called()

    @patch("scripts.backfill_league_ownership.create_pool")
    @patch("scripts.backfill_league_ownership.get_or_create_season")
    @patch("scripts.backfill_league_ownership.get_gameweeks_with_picks")
    @patch("scripts.backfill_league_ownership.compute_league_ownership")
    @patch("scripts.backfill_league_ownership.verify_league_ownership_data")
    async def test_processes_all_gameweeks(
        self,
        mock_verify: MagicMock,
        mock_compute: MagicMock,
        mock_get_gws: MagicMock,
        mock_get_season: MagicMock,
        mock_create_pool: MagicMock,
        mock_asyncpg_pool,
    ):
        """Should process all gameweeks returned by get_gameweeks_with_picks."""
        from scripts.backfill_league_ownership import backfill_league_ownership

        mock_create_pool.return_value = mock_asyncpg_pool
        mock_get_season.return_value = 2
        mock_get_gws.return_value = [10, 11, 12, 13]
        mock_compute.return_value = (100, 20)  # records, managers
        mock_verify.return_value = True

        await backfill_league_ownership(
            league_id=242017,
            dry_run=False,
        )

        # Should compute ownership for each gameweek
        assert mock_compute.call_count == 4

    @patch("scripts.backfill_league_ownership.create_pool")
    @patch("scripts.backfill_league_ownership.get_or_create_season")
    @patch("scripts.backfill_league_ownership.get_gameweeks_with_picks")
    @patch("scripts.backfill_league_ownership.compute_league_ownership")
    @patch("scripts.backfill_league_ownership.verify_league_ownership_data")
    async def test_processes_single_gameweek_when_specified(
        self,
        mock_verify: MagicMock,
        mock_compute: MagicMock,
        mock_get_gws: MagicMock,
        mock_get_season: MagicMock,
        mock_create_pool: MagicMock,
        mock_asyncpg_pool,
    ):
        """Should only process specified gameweek, not query for all."""
        from scripts.backfill_league_ownership import backfill_league_ownership

        mock_create_pool.return_value = mock_asyncpg_pool
        mock_get_season.return_value = 2
        mock_compute.return_value = (100, 20)
        mock_verify.return_value = True

        await backfill_league_ownership(
            league_id=242017,
            gameweek=15,  # Specific gameweek
            dry_run=False,
        )

        # Should NOT call get_gameweeks_with_picks
        mock_get_gws.assert_not_called()
        # Should only compute for GW15
        assert mock_compute.call_count == 1
        call_args = mock_compute.call_args
        assert call_args[0][3] == 15  # gameweek parameter

    @patch("scripts.backfill_league_ownership.create_pool")
    @patch("scripts.backfill_league_ownership.get_or_create_season")
    @patch("scripts.backfill_league_ownership.get_gameweeks_with_picks")
    @patch("scripts.backfill_league_ownership.compute_league_ownership")
    @patch("scripts.backfill_league_ownership.verify_league_ownership_data")
    async def test_continues_processing_after_verification_failure(
        self,
        mock_verify: MagicMock,
        mock_compute: MagicMock,
        mock_get_gws: MagicMock,
        mock_get_season: MagicMock,
        mock_create_pool: MagicMock,
        mock_asyncpg_pool,
    ):
        """Should continue processing other gameweeks after one fails verification."""
        from scripts.backfill_league_ownership import backfill_league_ownership

        mock_create_pool.return_value = mock_asyncpg_pool
        mock_get_season.return_value = 2
        mock_get_gws.return_value = [10, 11, 12]
        mock_compute.return_value = (100, 20)
        # First verification fails, others pass
        mock_verify.side_effect = [False, True, True]

        # Should raise RuntimeError after processing all gameweeks
        with pytest.raises(RuntimeError, match="Verification failed for gameweeks"):
            await backfill_league_ownership(
                league_id=242017,
                dry_run=False,
            )

        # Should still have processed all gameweeks before raising
        assert mock_compute.call_count == 3
        assert mock_verify.call_count == 3

    @patch("scripts.backfill_league_ownership.create_pool")
    @patch("scripts.backfill_league_ownership.get_or_create_season")
    @patch("scripts.backfill_league_ownership.get_gameweeks_with_picks")
    async def test_handles_no_gameweeks_found(
        self,
        mock_get_gws: MagicMock,
        mock_get_season: MagicMock,
        mock_create_pool: MagicMock,
        mock_asyncpg_pool,
    ):
        """Should handle case when no gameweeks have pick data."""
        from scripts.backfill_league_ownership import backfill_league_ownership

        mock_create_pool.return_value = mock_asyncpg_pool
        mock_get_season.return_value = 2
        mock_get_gws.return_value = []  # No gameweeks

        with patch(
            "scripts.backfill_league_ownership.compute_league_ownership"
        ) as mock_compute:
            await backfill_league_ownership(
                league_id=242017,
                dry_run=False,
            )

            # Should not compute anything
            mock_compute.assert_not_called()

    @patch("scripts.backfill_league_ownership.create_pool")
    @patch("scripts.backfill_league_ownership.get_or_create_season")
    @patch("scripts.backfill_league_ownership.get_gameweeks_with_picks")
    @patch("scripts.backfill_league_ownership.compute_league_ownership")
    @patch("scripts.backfill_league_ownership.verify_league_ownership_data")
    async def test_uses_provided_season_id(
        self,
        mock_verify: MagicMock,
        mock_compute: MagicMock,
        mock_get_gws: MagicMock,
        mock_get_season: MagicMock,
        mock_create_pool: MagicMock,
        mock_asyncpg_pool,
    ):
        """Should use provided season_id instead of auto-detecting."""
        from scripts.backfill_league_ownership import backfill_league_ownership

        mock_create_pool.return_value = mock_asyncpg_pool
        mock_get_gws.return_value = [10]
        mock_compute.return_value = (100, 20)
        mock_verify.return_value = True

        await backfill_league_ownership(
            league_id=242017,
            season_id=5,  # Explicitly provided
            dry_run=False,
        )

        # Should NOT call get_or_create_season
        mock_get_season.assert_not_called()
        # Should use season_id=5 in compute call
        call_args = mock_compute.call_args
        assert call_args[0][2] == 5  # season_id parameter

    @patch("scripts.backfill_league_ownership.create_pool")
    @patch("scripts.backfill_league_ownership.get_or_create_season")
    @patch("scripts.backfill_league_ownership.get_gameweeks_with_picks")
    @patch("scripts.backfill_league_ownership.compute_league_ownership")
    @patch("scripts.backfill_league_ownership.verify_league_ownership_data")
    async def test_passes_manager_count_to_verify(
        self,
        mock_verify: MagicMock,
        mock_compute: MagicMock,
        mock_get_gws: MagicMock,
        mock_get_season: MagicMock,
        mock_create_pool: MagicMock,
        mock_asyncpg_pool,
    ):
        """Should pass manager_count from compute to verify."""
        from scripts.backfill_league_ownership import backfill_league_ownership

        mock_create_pool.return_value = mock_asyncpg_pool
        mock_get_season.return_value = 2
        mock_get_gws.return_value = [10]
        mock_compute.return_value = (100, 25)  # 25 managers
        mock_verify.return_value = True

        await backfill_league_ownership(
            league_id=242017,
            dry_run=False,
        )

        # Verify was called with manager_count from compute
        call_args = mock_verify.call_args
        assert call_args[0][4] == 25  # expected_members
