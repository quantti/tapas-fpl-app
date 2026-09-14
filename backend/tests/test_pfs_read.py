"""Mock-DB contract tests for evidence-aware PFS SQL projection."""

from unittest.mock import AsyncMock

from app.services.history import _CAPTAIN_PICKS_SQL, _FULL_PICKS_SQL, _XG_PICKS_SQL
from app.services.pfs_read import pfs_read_cte


async def test_metadata_absent_keeps_legacy_rows():
    conn = AsyncMock()
    conn.fetchval.side_effect = [False, False]

    sql = await pfs_read_cte(conn)

    assert "FROM player_fixture_stats p" in sql
    assert "fpl_fixture_sync" not in sql
    assert "WHERE FALSE" not in sql


async def test_owner_projection_is_season_qualified_and_current_generation_only():
    conn = AsyncMock()
    conn.fetchval.side_effect = [True, True]

    sql = await pfs_read_cte(conn)

    assert "fs.season_id = p.season_id AND fs.fixture_id = p.fixture_id" in sql
    assert "e.season_id = p.season_id AND e.fixture_id = p.fixture_id" in sql
    assert "e.player_id = p.player_id" in sql
    assert "e.generation = fs.current_verified_generation" in sql
    assert "fs.state = 'VERIFIED'" in sql
    assert "COALESCE((fs.state = 'VERIFIED'" in sql
    assert "AS evidence_available" in sql
    # Pending/stale physical rows remain visible as unavailable coverage evidence.
    assert "WHERE (fs.fixture_id IS NULL" not in sql


async def test_staging_discovery_is_legacy_not_owned():
    conn = AsyncMock()
    conn.fetchval.side_effect = [True, True]

    sql = await pfs_read_cte(conn)

    assert "fs.observation_generation IS NULL" in sql
    assert "fs.last_verified_generation IS NULL" in sql


async def test_component_presence_masks_absent_but_preserves_known_zero():
    conn = AsyncMock()
    conn.fetchval.side_effect = [True, True]

    sql = await pfs_read_cte(conn)

    # CASE returns the physical value (including numeric zero) only when its bit is present.
    assert "(e.component_presence & 1) <> 0" in sql
    assert "THEN p.expected_goals END AS expected_goals" in sql
    assert "COALESCE(p.expected_goals" not in sql
    assert "(e.component_presence & 8) <> 0" in sql


def test_history_picks_preserve_pending_rows_and_distinguish_zero_from_unknown():
    for query in (_CAPTAIN_PICKS_SQL, _FULL_PICKS_SQL):
        assert "LEFT JOIN pfs_read" in query
        assert "BOOL_AND(pfs.evidence_available)" in query
        assert "THEN SUM(pfs.total_points) END AS points" in query
        assert "CASE WHEN COUNT(f.fixture_id) = 0 THEN 0" in query
        assert "COUNT(f.fixture_id) = COUNT(pfs.fixture_id)" in query
        assert "COALESCE(SUM(pfs.total_points), 0)" not in query


def test_dgw_aggregation_refuses_partial_optional_components():
    assert "COUNT(pfs.fixture_id) = COUNT(pfs.expected_goals)" in _XG_PICKS_SQL
    assert "COUNT(pfs.fixture_id) = COUNT(pfs.expected_assists)" in _XG_PICKS_SQL
    assert "COUNT(pfs.fixture_id) = COUNT(pfs.expected_goals_conceded)" in _XG_PICKS_SQL
    assert "BOOL_AND(pfs.evidence_available)" in _XG_PICKS_SQL
    assert "LEFT JOIN pfs_read" in _XG_PICKS_SQL
    assert "COALESCE(SUM(pfs.expected" not in _XG_PICKS_SQL
