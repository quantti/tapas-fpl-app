"""Optional disposable-Postgres contract for the assistant's incremental PFS proof."""

import os
from urllib.parse import urlparse

import asyncpg
import pytest

from app.services.pfs_read import _physical_fingerprint_sql, pfs_read_cte
from scripts.scheduled_update import derive_points_against


@pytest.fixture
async def conn():
    url = os.getenv("TAPAS_COMPAT_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set TAPAS_COMPAT_TEST_DATABASE_URL to the disposable localhost:55432 database")
    parsed = urlparse(url)
    if (parsed.hostname, parsed.port, parsed.path) != ("127.0.0.1", 55432, "/postgres"):
        raise RuntimeError("Incremental PFS test requires disposable 127.0.0.1:55432/postgres")
    connection = await asyncpg.connect(url)
    try:
        await connection.execute("CREATE TEMP TABLE season (LIKE public.season INCLUDING DEFAULTS)")
        await connection.execute(
            "CREATE TEMP TABLE player_fixture_stats "
            "(LIKE public.player_fixture_stats INCLUDING DEFAULTS)"
        )
        await connection.execute(
            "ALTER TABLE player_fixture_stats "
            "ADD COLUMN IF NOT EXISTS defensive_contribution integer, "
            "ADD COLUMN IF NOT EXISTS clearances_blocks_interceptions integer, "
            "ADD COLUMN IF NOT EXISTS recoveries integer, ADD COLUMN IF NOT EXISTS tackles integer"
        )
        await connection.execute("""CREATE TEMP TABLE fpl_fixture_sync (
            season_id integer, fixture_id integer, state text,
            observation_generation bigint, last_verified_generation bigint,
            current_verified_generation bigint)""")
        await connection.execute("""CREATE TEMP TABLE fpl_player_fixture_evidence (
            season_id integer, season_code text, fixture_id integer, player_id integer,
            generation bigint, component_presence bigint,
            source_read_started_at timestamptz, source_read_finished_at timestamptz)""")
        await connection.execute("""CREATE TEMP TABLE fpl_player_fixture_current (
            season_id integer, season_code text, fixture_id integer, player_id integer,
            row_state text, source_run_generation bigint, evidence_generation bigint,
            physical_fingerprint text,
            source_read_started_at timestamptz, source_read_finished_at timestamptz)""")
        await connection.execute("""CREATE TEMP TABLE fpl_sync_receipt (
            season text, publication_key text, latest_generation bigint,
            source_read_started_at timestamptz, source_read_finished_at timestamptz)""")
        await connection.execute("""INSERT INTO season(id,code,name,start_date,is_current) VALUES
            (1,'2026-27','Playing','2026-08-01',true),
            (2,'2025-26','Archive','2025-08-01',false)""")
        yield connection
    finally:
        await connection.close()


async def projection(conn, season_id: int, fixture_id: int):
    sql = await pfs_read_cte(conn)
    return await conn.fetchrow(
        f"WITH {sql} SELECT evidence_available,total_points,expected_goals,"
        "expected_assists,expected_goals_available,expected_assists_available "
        "FROM pfs_read WHERE season_id=$1 AND fixture_id=$2",
        season_id,
        fixture_id,
    )


@pytest.mark.asyncio
async def test_proved_new_row_masks_missing_optionals_and_never_falls_back(conn):
    await conn.execute("""INSERT INTO player_fixture_stats
        (season_id,fixture_id,player_id,gameweek,player_team_id,opponent_team_id,
         was_home,kickoff_time,minutes,total_points,value,expected_goals,expected_assists)
        VALUES (1,7,11,7,2,3,true,'2026-10-17 11:30+00',90,5,75,0,0)""")
    await conn.execute("""INSERT INTO fpl_fixture_sync
        (season_id,fixture_id,state) VALUES (1,7,'SCHEDULED')""")
    await conn.execute("""INSERT INTO fpl_player_fixture_evidence VALUES
        (1,'2026-27',7,11,91,1,'2026-10-17 13:30+00','2026-10-17 13:31+00')""")
    await conn.execute("""INSERT INTO fpl_player_fixture_current
        (season_id,season_code,fixture_id,player_id,row_state,source_run_generation,
         evidence_generation,source_read_started_at,source_read_finished_at)
        VALUES (1,'2026-27',7,11,'VALID',91,91,'2026-10-17 13:30+00','2026-10-17 13:31+00')""")
    await conn.execute("""INSERT INTO fpl_sync_receipt VALUES
        ('2026-27','incremental-page:player:11',91,
         '2026-10-17 13:30+00','2026-10-17 13:31+00')""")
    await conn.execute(
        """UPDATE fpl_player_fixture_current c SET physical_fingerprint =
        """
        + _physical_fingerprint_sql()
        + """
        FROM player_fixture_stats p, season s, fpl_player_fixture_evidence ie
        WHERE c.season_id=p.season_id AND c.fixture_id=p.fixture_id
          AND c.player_id=p.player_id AND s.id=p.season_id
          AND ie.season_id=c.season_id AND ie.fixture_id=c.fixture_id
          AND ie.player_id=c.player_id AND ie.generation=c.evidence_generation"""
    )

    proved = await projection(conn, 1, 7)
    assert proved["evidence_available"] is True
    assert proved["total_points"] == 5
    assert proved["expected_goals"] == 0
    assert proved["expected_goals_available"] is True
    assert proved["expected_assists"] is None
    assert proved["expected_assists_available"] is False

    fingerprint = await conn.fetchval(
        "SELECT physical_fingerprint FROM fpl_player_fixture_current WHERE fixture_id=7"
    )
    await conn.execute("UPDATE fpl_player_fixture_current SET physical_fingerprint=NULL")
    assert (await projection(conn, 1, 7))["evidence_available"] is False
    await conn.execute("UPDATE fpl_player_fixture_current SET physical_fingerprint=$1", fingerprint)

    await conn.execute("UPDATE fpl_sync_receipt SET latest_generation=90")
    assert (await projection(conn, 1, 7))["evidence_available"] is False
    await conn.execute("UPDATE fpl_sync_receipt SET latest_generation=91")
    await conn.execute("DELETE FROM fpl_sync_receipt")
    assert (await projection(conn, 1, 7))["evidence_available"] is False
    await conn.execute("""INSERT INTO fpl_sync_receipt VALUES
        ('2026-27','incremental-page:player:11',91,
         '2026-10-17 13:30+00','2026-10-17 13:31+00')""")
    await conn.execute("UPDATE player_fixture_stats SET total_points=6 WHERE fixture_id=7")
    assert (await projection(conn, 1, 7))["evidence_available"] is False
    await conn.execute("UPDATE player_fixture_stats SET total_points=5 WHERE fixture_id=7")
    await conn.execute(
        "UPDATE fpl_player_fixture_current SET row_state='WITHDRAWN' WHERE fixture_id=7"
    )
    assert (await projection(conn, 1, 7))["evidence_available"] is False


@pytest.mark.asyncio
async def test_genuine_legacy_and_verified_rows_keep_season_isolation(conn):
    await conn.execute("""INSERT INTO player_fixture_stats
        (season_id,fixture_id,player_id,gameweek,player_team_id,opponent_team_id,
         was_home,minutes,total_points,value)
        VALUES (2,7,11,1,2,3,true,90,3,75), (1,9,12,5,2,3,true,90,4,75)""")
    await conn.execute("""INSERT INTO fpl_fixture_sync
        (season_id,fixture_id,state,observation_generation,last_verified_generation,
         current_verified_generation) VALUES (1,9,'VERIFIED',71,71,71)""")
    await conn.execute("""INSERT INTO fpl_player_fixture_evidence
        (season_id,season_code,fixture_id,player_id,generation,component_presence)
        VALUES (1,'2026-27',9,12,71,1)""")

    await conn.execute("""INSERT INTO fpl_player_fixture_current
        (season_id,season_code,fixture_id,player_id,row_state)
        VALUES (1,'2026-27',7,11,'WITHDRAWN')""")
    archived = await projection(conn, 2, 7)
    verified = await projection(conn, 1, 9)
    assert archived["evidence_available"] is True
    assert archived["expected_assists"] == 0
    assert verified["evidence_available"] is True
    assert verified["expected_goals"] == 0
    assert verified["expected_assists"] is None

    # A later page for the same player must not erase an earlier VERIFIED fixture.
    await conn.execute("""INSERT INTO fpl_sync_receipt VALUES
        ('2026-27','incremental-page:player:12',91,
         '2026-10-17 13:30+00','2026-10-17 13:31+00')""")
    assert (await projection(conn, 1, 9))["evidence_available"] is True
    await conn.execute("""INSERT INTO player_fixture_stats
        (season_id,fixture_id,player_id,gameweek,player_team_id,opponent_team_id,
         was_home,minutes,total_points,value)
        VALUES (1,8,12,4,2,3,true,90,2,75)""")
    assert (await projection(conn, 1, 8))["evidence_available"] is True
    # A fixture-scoped population receipt marks this fixture as importer-owned,
    # even before it has a current pointer for this player.
    await conn.execute("""INSERT INTO fpl_sync_receipt VALUES
        ('2026-27','incremental-population:fixture:8',92,
         '2026-10-17 13:30+00','2026-10-17 13:31+00')""")
    assert (await projection(conn, 1, 8))["evidence_available"] is False

    await conn.execute("""INSERT INTO fpl_player_fixture_current
        (season_id,season_code,fixture_id,player_id,row_state)
        VALUES (1,'2026-27',9,13,'WITHDRAWN')""")
    assert (await projection(conn, 1, 9))["evidence_available"] is False


@pytest.mark.asyncio
async def test_points_against_waits_for_finalized_population_and_retains_old_totals(conn):
    await conn.execute("""CREATE TEMP TABLE fixture (
        id integer, season_id integer, gameweek integer, finished boolean)""")
    await conn.execute("""CREATE TEMP TABLE fpl_gameweek_stat_sync (
        season_id integer, season_code text, gameweek integer, state text,
        source_signature text, finalized_source_signature text,
        current_invalidation_revision bigint, final_attempt_invalidation_revision bigint,
        finalized_invalidation_revision bigint, finalized_population_fingerprint text,
        finalized_row_revision_fingerprint text,
        finalized_mandatory_manifest_complete boolean)""")
    await conn.execute("""CREATE TEMP TABLE points_against_by_fixture (
        fixture_id integer, team_id integer, season_id integer, gameweek integer,
        home_points integer, away_points integer, is_home boolean,
        opponent_id integer, updated_at timestamptz)""")
    await conn.execute("""CREATE TEMP TABLE points_against_collection_status (
        id text PRIMARY KEY, season_id integer, latest_gameweek smallint,
        total_players_processed integer, last_incremental_update timestamptz,
        status text, error_message text, updated_at timestamptz)""")
    await conn.execute("INSERT INTO fixture VALUES (7,1,7,true)")
    await conn.execute("""INSERT INTO points_against_by_fixture
        (fixture_id,team_id,season_id,gameweek,home_points,away_points,is_home,opponent_id)
        VALUES (7,2,1,7,11,0,true,3)""")
    await conn.execute("""INSERT INTO points_against_collection_status
        (id,season_id,latest_gameweek,status) VALUES ('points_against',1,6,'idle')""")
    await conn.execute("""INSERT INTO fpl_gameweek_stat_sync
        (season_id,season_code,gameweek,state,source_signature,finalized_source_signature,
         current_invalidation_revision,final_attempt_invalidation_revision,
         finalized_invalidation_revision,finalized_population_fingerprint,
         finalized_row_revision_fingerprint,finalized_mandatory_manifest_complete)
        VALUES (1,'2026-27',7,'FINAL_PENDING','source','source',3,3,3,'population','rows',true)""")
    await conn.execute("""INSERT INTO player_fixture_stats
        (season_id,fixture_id,player_id,gameweek,player_team_id,opponent_team_id,
         was_home,minutes,total_points,value)
        VALUES (1,7,11,7,2,3,true,90,5,75), (1,7,12,7,3,2,false,90,3,75)""")
    await conn.execute("""INSERT INTO fpl_player_fixture_evidence
        (season_id,season_code,fixture_id,player_id,generation,component_presence,
         source_read_started_at,source_read_finished_at)
        VALUES (1,'2026-27',7,11,91,0,'2026-10-17 13:30+00','2026-10-17 13:31+00'),
               (1,'2026-27',7,12,91,0,'2026-10-17 13:30+00','2026-10-17 13:31+00')""")
    await conn.execute("""INSERT INTO fpl_player_fixture_current
        (season_id,season_code,fixture_id,player_id,row_state,source_run_generation,
         evidence_generation,source_read_started_at,source_read_finished_at)
        VALUES (1,'2026-27',7,11,'VALID',91,91,'2026-10-17 13:30+00','2026-10-17 13:31+00'),
               (1,'2026-27',7,12,'VALID',91,91,'2026-10-17 13:30+00','2026-10-17 13:31+00')""")
    await conn.execute("""INSERT INTO fpl_sync_receipt VALUES
        ('2026-27','incremental-page:player:11',91,
         '2026-10-17 13:30+00','2026-10-17 13:31+00'),
        ('2026-27','incremental-page:player:12',91,
         '2026-10-17 13:30+00','2026-10-17 13:31+00')""")
    await conn.execute(
        """UPDATE fpl_player_fixture_current c SET physical_fingerprint =
        """
        + _physical_fingerprint_sql()
        + """
        FROM player_fixture_stats p, season s, fpl_player_fixture_evidence ie
        WHERE c.season_id=p.season_id AND c.fixture_id=p.fixture_id
          AND c.player_id=p.player_id AND s.id=p.season_id
          AND ie.season_id=c.season_id AND ie.fixture_id=c.fixture_id
          AND ie.player_id=c.player_id AND ie.generation=c.evidence_generation"""
    )

    assert await derive_points_against(conn, 1, 7) is False
    assert (
        await conn.fetchval(
            "SELECT latest_gameweek FROM points_against_collection_status WHERE id='points_against'"
        )
        == 6
    )
    assert await conn.fetchval("SELECT home_points FROM points_against_by_fixture") == 11

    await conn.execute("UPDATE fpl_gameweek_stat_sync SET state='FINALIZED'")
    assert await derive_points_against(conn, 1, 7) is True
    assert await conn.fetchval("SELECT COUNT(*) FROM points_against_by_fixture") == 2
    assert (
        await conn.fetchval("SELECT home_points FROM points_against_by_fixture WHERE team_id=3")
        == 5
    )
    await conn.execute("UPDATE fpl_gameweek_stat_sync SET source_signature='changed'")
    assert await derive_points_against(conn, 1, 7) is False
    await conn.execute("UPDATE fpl_gameweek_stat_sync SET state='FINAL_PENDING'")
    await conn.execute("UPDATE player_fixture_stats SET total_points=8 WHERE player_id=11")
    assert await derive_points_against(conn, 1, 7) is False
    assert (
        await conn.fetchval("SELECT home_points FROM points_against_by_fixture WHERE team_id=3")
        == 5
    )
