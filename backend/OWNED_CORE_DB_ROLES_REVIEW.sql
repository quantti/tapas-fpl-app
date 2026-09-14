-- REVIEW TEMPLATE ONLY. DO NOT EXECUTE FROM THIS REPOSITORY.
-- Replace role placeholders through the approved secret/role-management process.
-- Capture current grants before review so rollback restores exact prior privileges.
-- This template intentionally makes no schema changes.

BEGIN;

-- Core ownership: only the assistant publisher role may mutate these tables.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE
    team, player, gameweek, fixture, player_fixture_stats
FROM <tapas_runtime_role>;

GRANT SELECT ON TABLE
    season, team, player, gameweek, fixture, player_fixture_stats,
    fpl_fixture_sync, fpl_player_fixture_evidence
TO <tapas_runtime_role>;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    team, player, gameweek, fixture, player_fixture_stats
TO <assistant_core_writer_role>;
GRANT SELECT ON TABLE season TO <assistant_core_writer_role>;
-- The reviewed writer uses SELECT ... FOR UPDATE on season to serialize publication. PostgreSQL
-- additionally requires UPDATE on at least one column for that lock; no code may modify season.
GRANT UPDATE (id) ON TABLE season TO <assistant_core_writer_role>;
-- This is a core-table grant outline, not a complete provisioning script. Separately review
-- ownership/DDL and RLS permissions for all fpl_sync_* and evidence/capture tables before startup.

-- Tapas retains only its manager/league/chip/derived write surface.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    league, manager, league_manager, manager_gw_snapshot, manager_pick,
    transfer, chip_usage, league_ownership, points_against_by_fixture,
    points_against_collection_status, collection_status
TO <tapas_runtime_role>;

-- Review sequence grants separately against the actual schema/owners. Manager snapshot IDs may
-- require their dedicated sequence; never grant blanket public-schema privileges.

-- Approval checkpoint: inspect information_schema.role_table_grants and exercise each role in a
-- transaction that is rolled back. Replace this ROLLBACK with COMMIT only in the approved change.
ROLLBACK;

-- ROLLBACK TEMPLATE (review against captured pre-cutover grants; do not run concurrently with the
-- assistant writer):
-- GRANT INSERT, UPDATE, DELETE ON TABLE
--     team, player, gameweek, fixture, player_fixture_stats
-- TO <tapas_runtime_role>;
