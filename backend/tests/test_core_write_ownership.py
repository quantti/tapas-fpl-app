"""Mock-only tests for the Tapas core-writer cutover boundary."""

from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.config import get_settings
from app.core_writes import CoreWritesDisabled, require_disposable_database
from scripts import collect_manager_snapshots, collect_points_against, migrate, scheduled_update
from tests.conftest import AsyncContextManagerMock, MockAsyncpgPool


@pytest.fixture
def core_writes_disabled(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("FPL_CORE_WRITES_ENABLED", "false")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.mark.parametrize(
    "writer",
    [
        lambda conn: scheduled_update.sync_teams_from_bootstrap(conn, [], 2),
        lambda conn: scheduled_update.sync_players_from_bootstrap(conn, [], 2),
        lambda conn: scheduled_update.sync_fixtures_from_api(conn, [], 2),
        lambda conn: collect_points_against.save_player_fixture_stats(conn, 1, 1, 2, []),
    ],
    ids=["team", "player", "fixture", "pfs"],
)
async def test_direct_core_writers_are_blocked_before_db_calls(
    core_writes_disabled, writer
):
    conn = AsyncMock()

    with pytest.raises(CoreWritesDisabled):
        await writer(conn)

    conn.execute.assert_not_awaited()
    conn.executemany.assert_not_awaited()


async def test_points_against_collection_and_reset_are_blocked(
    core_writes_disabled, monkeypatch: pytest.MonkeyPatch
):
    conn = AsyncMock()
    client = AsyncMock()

    with pytest.raises(CoreWritesDisabled):
        await collect_points_against.collect_points_against(conn, client, 2)
    with pytest.raises(CoreWritesDisabled):
        await collect_points_against.reset_data(conn, 2)

    conn.execute.assert_not_awaited()


async def test_manual_sync_commands_are_blocked_before_network_or_db(
    core_writes_disabled,
):
    with pytest.raises(CoreWritesDisabled):
        await scheduled_update.sync_bootstrap_only()
    with pytest.raises(CoreWritesDisabled):
        await scheduled_update.sync_fixtures_only()


async def test_manager_gameweek_sync_is_read_only_at_cutover(core_writes_disabled):
    conn = AsyncMock()
    conn.fetchval.return_value = 38
    http_client = AsyncMock()

    count = await collect_manager_snapshots.sync_gameweeks_from_bootstrap(
        conn, http_client, 2
    )

    assert count == 38
    http_client.get.assert_not_awaited()
    conn.execute.assert_not_awaited()


async def test_manager_snapshot_uses_owned_gameweek_without_placeholder_write(
    core_writes_disabled,
):
    conn = AsyncMock()
    conn.fetchval.return_value = True

    await collect_manager_snapshots.ensure_gameweek_exists(conn, 4, 2)

    conn.fetchval.assert_awaited_once()
    conn.execute.assert_not_awaited()


async def test_manager_snapshot_rejects_missing_owned_gameweek(core_writes_disabled):
    conn = AsyncMock()
    conn.fetchval.return_value = False

    with pytest.raises(RuntimeError, match="Owned gameweek 4 is not published"):
        await collect_manager_snapshots.ensure_gameweek_exists(conn, 4, 2)

    conn.execute.assert_not_awaited()


@pytest.mark.parametrize("derivation_ready", [True, False])
async def test_scheduled_update_skips_core_but_invokes_unrelated_jobs(
    core_writes_disabled, derivation_ready: bool
):
    pool = MockAsyncpgPool()
    # latest snapshot GW, advisory lock, owned target gameweek
    pool.conn.fetchval.side_effect = [2, True, True]
    client = AsyncMock()
    client.get_bootstrap.return_value = SimpleNamespace(
        events=[
            {
                "id": 2,
                "data_checked": True,
                "deadline_time": "2026-09-01T10:00:00Z",
            }
        ],
        players=[{"id": 1}],
        teams=[{"id": 1}],
    )

    with (
        patch.object(scheduled_update, "FplApiClient", return_value=client),
        patch.object(scheduled_update, "create_pool", AsyncMock(return_value=pool)),
        patch.object(scheduled_update, "init_app_pool", AsyncMock()),
        patch.object(scheduled_update, "close_app_pool", AsyncMock()),
        patch.object(scheduled_update, "get_or_create_season", AsyncMock(return_value=2)),
        patch.object(scheduled_update, "get_stored_gameweek", AsyncMock(return_value=1)),
        patch.object(scheduled_update, "run_points_against_update", AsyncMock()) as core_job,
        patch.object(
            scheduled_update,
            "derive_points_against",
            AsyncMock(return_value=derivation_ready),
        ) as derive_job,
        patch.object(
            scheduled_update, "verify_points_against_data", AsyncMock(return_value=True)
        ),
        patch.object(
            scheduled_update, "run_chips_update", AsyncMock(return_value=(1, 0, 1))
        ) as chips,
        patch.object(scheduled_update, "verify_chips_data", AsyncMock(return_value=True)),
        patch.object(
            scheduled_update,
            "run_manager_snapshots_update",
            AsyncMock(return_value=(1, 0, 1)),
        ) as managers,
        patch.object(
            scheduled_update, "verify_manager_snapshots_data", AsyncMock(return_value=True)
        ),
        patch.object(
            scheduled_update, "compute_league_ownership", AsyncMock(return_value=(1, 1))
        ) as ownership,
        patch.object(
            scheduled_update, "verify_league_ownership_data", AsyncMock(return_value=True)
        ),
        patch.object(
            scheduled_update, "update_collection_status", AsyncMock()
        ) as collection_status,
    ):
        outcome = (
            nullcontext()
            if derivation_ready
            else pytest.raises(RuntimeError, match="derivation unavailable")
        )
        with outcome:
            await scheduled_update.run_scheduled_update()

    core_job.assert_not_awaited()
    derive_job.assert_awaited_once_with(pool.conn, 2, 2)
    chips.assert_awaited_once()
    managers.assert_awaited_once()
    ownership.assert_awaited_once()
    if derivation_ready:
        collection_status.assert_awaited_once()
    else:
        collection_status.assert_not_awaited()


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://postgres:secret@db.example.supabase.co:5432/postgres",
        "postgresql://postgres:secret@localhost:5432/postgres",
        None,
    ],
    ids=["remote", "production_db_name", "missing"],
)
def test_destructive_utility_rejects_non_disposable_database(url):
    with pytest.raises(RuntimeError, match="disposable|explicit local"):
        require_disposable_database(url, "test reset")


async def test_migrate_reset_rejects_production_before_query(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://postgres:secret@db.example.supabase.co:5432/postgres",
    )
    conn = AsyncMock()

    with pytest.raises(RuntimeError, match="disposable"):
        await migrate.reset_database(conn)

    conn.fetch.assert_not_awaited()
    conn.execute.assert_not_awaited()


def test_destructive_utility_accepts_local_named_database():
    require_disposable_database(
        "postgresql://tapas:localdev@localhost:5432/tapas_fpl", "test reset"
    )


def test_disposable_writer_is_blocked_when_core_writes_disabled(
    core_writes_disabled,
):
    with pytest.raises(CoreWritesDisabled):
        require_disposable_database(
            "postgresql://tapas:localdev@localhost:5432/tapas_fpl", "test seed"
        )


async def test_incomplete_pa_derivation_retains_previous_publication(monkeypatch):
    conn = AsyncMock()
    conn.transaction = MagicMock(return_value=AsyncContextManagerMock())
    conn.fetchval.side_effect = [2, 1]
    monkeypatch.setattr(
        scheduled_update, "pfs_read_cte", AsyncMock(return_value="pfs_read AS (SELECT 1)")
    )

    ready = await scheduled_update.derive_points_against(conn, 2, 4)

    assert ready is False
    conn.execute.assert_not_awaited()


async def test_complete_pa_derivation_writes_only_derived_tables(monkeypatch):
    conn = AsyncMock()
    conn.fetchval.side_effect = [2, 2]
    conn.transaction = MagicMock(return_value=AsyncContextManagerMock())
    monkeypatch.setattr(
        scheduled_update, "pfs_read_cte", AsyncMock(return_value="pfs_read AS (SELECT 1)")
    )

    ready = await scheduled_update.derive_points_against(conn, 2, 4)

    assert ready is True
    statements = "\n".join(call.args[0] for call in conn.execute.await_args_list)
    assert "points_against_by_fixture" in statements
    assert "points_against_collection_status" in statements
    for core_table in ("team", "player", "gameweek", "fixture", "player_fixture_stats"):
        assert f"INSERT INTO {core_table}" not in statements
        assert f"UPDATE {core_table}" not in statements
        assert f"DELETE FROM {core_table}" not in statements
