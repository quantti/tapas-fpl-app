# Owned FPL core cutover runbook

This runbook is review material only. This change does not deploy, change secrets, disable jobs, or
write production data. `FPL_CORE_WRITES_ENABLED` defaults to `true`; do not set it to `false` until
the owner publication and evidence gates have been reviewed.

## Scope

When the flag is `false`, Tapas blocks writes to `team`, `player`, `gameweek`, `fixture`, and
`player_fixture_stats`, including direct Points Against collection/reset, scheduled core steps,
`--sync-bootstrap`, `--sync-fixtures`, and manager-snapshot placeholder/gameweek syncs. The combined
cron remains enabled and continues manager snapshots/picks, manager/league/chip writes, league
ownership and other derived work. Manager jobs require the owner-published gameweek row.

## Preconditions

1. Identify exactly one playing season by both `season.id` and `season.code`.
2. Validate the assistant's staged source captures and rehearse publication in disposable Postgres.
   Do not require production publication before draining Tapas: that would overlap writers.
   A staging/discovery row alone is not ownership.
3. Rehearse the readiness gate: each required finished fixture must have `state='VERIFIED'`, a
   non-null `current_verified_generation`, and matching season-qualified player evidence rows.
   Repeat this gate in production only after the switch; until then, retain safe refusals.
4. Record baseline identities/counts and sampled values for all five core tables for reconciliation.
5. Verify optional-component masks distinguish present zero from absent data. Do not approve a
   partial `SUM` as a complete metric.
6. Review active manual sessions and acquire/check the scheduled-update advisory lock. Let any
   running Tapas core collection finish or terminate safely; do not switch during incremental PFS
   upserts or reset activity.
7. Review and separately approve `OWNED_CORE_DB_ROLES_REVIEW.sql`. Do not execute it from this
   repository or as part of application deployment.

## Switch

1. Deploy reviewed versions with the assistant OFF and Tapas at its default `true`.
2. Pause admission to every old core-writer entry point during the maintenance window, including
   the combined cron where necessary. Record all manual, embedded and scheduled writers.
3. Set `FPL_CORE_WRITES_ENABLED=false` in every Tapas execution environment through a separately
   reviewed configuration change. Drain all processes started with the old value; changing a
   secret does not change an already-running process. Record process IDs, locks and final writes.
4. Verify no old core writer remains, then apply reviewed, distinct-role permissions. Only now
   may the owner set the assistant's explicit playing season, cutover confirmation and ACTIVE mode.
5. Reconcile the current season and apply the production readiness gate above. Missing evidence
   must continue to produce unavailable metrics/refusals, not a forced successful comparison.
6. Restore the combined cron with core writes disabled. Confirm manager, chip, league and derived
   jobs still run; incomplete Points Against evidence must retain its previous publication/status.
7. Verify known-zero and absent-component API results, actual alert delivery and a real matchday.
   Do not add production flags to checked-in environment files or this branch.

## Monitoring

Alert on blocked direct core-writer attempts, missing owned gameweeks, unverified/revoked fixture
receipts, evidence-generation mismatches, unexpected null coverage, and any write by the Tapas role
to the five core tables. Keep season ID/code, fixture ID, and generation in evidence.

The historical database views/functions `player_vs_team_stats`, `player_season_deltas`, and
`get_player_form` read the physical PFS table and are not used by the Tapas runtime APIs. They must
not be used for owned-generation decisions; changing shared schema objects is outside this phase.

## Rollback

Rollback must avoid dual writers.

1. Stop/admit no new assistant core publications and wait for its in-flight transaction(s) to
   drain. Record the last generation and fixture states; never invalidate evidence by overwriting
   it with defaults.
2. Before any Tapas core overwrite, revoke current fixture verification through a separately
   reviewed maintenance change, preserving observations, last verified generations and receipts.
   Otherwise a Tapas write would inherit a stale owner generation and false source timestamps.
   Readers must remain fail-closed until a reviewed evidence migration or owner re-verification.
3. Restore the pre-cutover DB grants from the reviewed role-specific rollback statements.
4. Set `FPL_CORE_WRITES_ENABLED=true` in a reviewed Tapas configuration change.
5. Resume Tapas core collection only after confirming the assistant writer cannot publish.
6. Reconcile all five core tables and Points Against status before allowing another scheduled run.
7. Evidence-aware readers continue to reject unverified generations and mask absent optional
   components. Do not delete receipts as a shortcut to legacy mode.

## Local verification — 2026-09-14

700 backend tests passed, including guarded manual/embedded writers, unavailable metrics,
Set-and-Forget/DGW evidence and independent Points Against derivation. Final execution was serial
in a 512 MiB, one-CPU systemd scope. No production DDL, flag change, write or deployment occurred.
The SQL role template and operational sequence still require owner approval and live evidence.
