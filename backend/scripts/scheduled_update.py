#!/usr/bin/env python
"""
Combined scheduled update for all backend data.

Run daily at 06:00 UTC via Supercronic.
Only marks gameweek as processed after verifying data was saved correctly.

Updates:
1. Points Against - FPL points conceded by each team (~2-5 min incremental)
2. Teams & Players - Sync from bootstrap for world template (~5 sec)
3. Fixtures - Match schedule, FDR ratings, scores (~2 sec)
4. Chips Usage - Manager chip activations for tracked league (~30 sec)
5. Manager Snapshots - GW-by-GW picks and stats for H2H comparison (~15 sec)

Usage:
    python -m scripts.scheduled_update                 # Run scheduled update
    python -m scripts.scheduled_update --status        # Show update status
    python -m scripts.scheduled_update --dry-run       # Check without making changes
    python -m scripts.scheduled_update --sync-bootstrap # Sync teams/players only
    python -m scripts.scheduled_update --sync-fixtures  # Sync fixtures only

If collection fails or verification fails, the gameweek is NOT marked as processed.
Next run will attempt to process it again. Manual intervention required if repeated failures.
"""

import argparse
import asyncio
import logging
import os
import sys
import time
from datetime import UTC, datetime

import asyncpg
import httpx
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.chips import ChipsService
from app.services.fpl_client import FplApiClient
from scripts.collect_manager_snapshots import (
    ensure_manager_exists,
    fetch_manager_history,
    fetch_manager_info,
    fetch_manager_picks,
    save_snapshot_and_picks,
    sync_gameweeks_from_bootstrap,
)
from scripts.collect_points_against import (
    collect_points_against,
    get_or_create_season,
)
from scripts.collect_points_against import (
    show_status as show_pa_status,
)

# Load environment
load_dotenv(".env.local")
load_dotenv(".env")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Configuration (can be overridden via environment variables)
LEAGUE_ID = int(os.getenv("SCHEDULED_UPDATE_LEAGUE_ID", "242017"))  # Tapas and Tackles
MAX_RUNTIME_SECONDS = int(os.getenv("SCHEDULED_UPDATE_TIMEOUT", "1800"))  # 30 min
MAX_FAILURE_RATE = 0.1  # 10% - fail if more than this ratio of managers fail to sync

# Advisory lock key to prevent concurrent scheduled updates
# Using a fixed large number unlikely to collide with other locks
SCHEDULED_UPDATE_LOCK_KEY = 999_999_001


async def create_pool() -> asyncpg.Pool:
    """Create database pool with settings optimized for Supabase/PgBouncer.

    Key settings:
    - statement_cache_size=0: Required for PgBouncer transaction mode
    - command_timeout=300: 5 min for long queries
    - min_size=1, max_size=5: Conservative pool size
    """
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        logger.warning(
            "DATABASE_URL not set, using localhost fallback. "
            "Set DATABASE_URL for production use."
        )
        db_url = "postgresql://tapas:localdev@localhost:5432/tapas_fpl"

    return await asyncpg.create_pool(
        db_url,
        min_size=1,
        max_size=5,
        command_timeout=300,  # 5 min for long operations
        statement_cache_size=0,  # Required for PgBouncer transaction mode
    )


async def get_stored_gameweek(conn: asyncpg.Connection, season_id: int) -> int:
    """Get the last processed gameweek from collection_status table.

    Args:
        conn: Database connection
        season_id: Season ID to check status for

    Returns:
        Last processed gameweek (0 if none)
    """
    row = await conn.fetchrow(
        "SELECT latest_gameweek FROM collection_status WHERE id = 'scheduled' AND season_id = $1",
        season_id,
    )
    if not row:
        logger.info(
            f"No collection_status record found for season {season_id} - this is the first run"
        )
        return 0
    return row["latest_gameweek"]


async def update_collection_status(
    conn: asyncpg.Connection, season_id: int, gameweek: int
) -> None:
    """Update the collection_status table with latest processed gameweek.

    Args:
        conn: Database connection
        season_id: Season ID to update status for
        gameweek: Gameweek that was just processed
    """
    await conn.execute(
        """
        INSERT INTO collection_status (id, season_id, latest_gameweek, last_update)
        VALUES ('scheduled', $1, $2, NOW())
        ON CONFLICT (id, season_id) DO UPDATE SET
            latest_gameweek = $2,
            last_update = NOW()
        """,
        season_id,
        gameweek,
    )


async def sync_fixtures_from_api(
    conn: asyncpg.Connection, fixtures: list[dict], season_id: int
) -> int:
    """Sync fixture data from FPL API to database.

    Fixtures include both static data (teams, FDR, kickoff) and dynamic data
    (scores, started/finished, stats) that changes during gameweeks.

    Args:
        conn: Database connection
        fixtures: Fixture list from FPL API (fpl_client.get_fixtures())
        season_id: Season ID

    Returns:
        Number of fixtures synced
    """
    if not fixtures:
        logger.warning("No fixtures to sync")
        return 0

    def parse_kickoff(kickoff_str: str | None) -> datetime | None:
        if not kickoff_str:
            return None
        try:
            return datetime.fromisoformat(kickoff_str.replace("Z", "+00:00"))
        except ValueError:
            return None

    await conn.executemany(
        """
        INSERT INTO fixture (
            id, season_id, gameweek, code, team_h, team_a,
            team_h_score, team_a_score, team_h_difficulty, team_a_difficulty,
            kickoff_time, started, finished, finished_provisional, minutes, stats
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id, season_id) DO UPDATE SET
            gameweek = EXCLUDED.gameweek,
            team_h_score = EXCLUDED.team_h_score,
            team_a_score = EXCLUDED.team_a_score,
            team_h_difficulty = EXCLUDED.team_h_difficulty,
            team_a_difficulty = EXCLUDED.team_a_difficulty,
            kickoff_time = EXCLUDED.kickoff_time,
            started = EXCLUDED.started,
            finished = EXCLUDED.finished,
            finished_provisional = EXCLUDED.finished_provisional,
            minutes = EXCLUDED.minutes,
            stats = EXCLUDED.stats,
            updated_at = NOW()
        """,
        [
            (
                f["id"],
                season_id,
                f.get("event"),  # gameweek - can be NULL if postponed
                f["code"],
                f["team_h"],
                f["team_a"],
                f.get("team_h_score"),
                f.get("team_a_score"),
                f.get("team_h_difficulty"),
                f.get("team_a_difficulty"),
                parse_kickoff(f.get("kickoff_time")),
                f.get("started", False),
                f.get("finished", False),
                f.get("finished_provisional", False),
                f.get("minutes", 0),
                f.get("stats") or [],  # JSONB - asyncpg handles list->JSON
            )
            for f in fixtures
        ],
    )

    return len(fixtures)


async def verify_fixtures_data(
    conn: asyncpg.Connection, season_id: int, expected_count: int
) -> bool:
    """Verify fixture data was synced correctly.

    Checks:
    1. Fixture count matches expected (within 95% tolerance)
    2. At least some fixtures have FDR values populated

    Returns:
        True if verification passes, False otherwise
    """
    actual_count = await conn.fetchval(
        "SELECT COUNT(*) FROM fixture WHERE season_id = $1", season_id
    )

    if actual_count == 0:
        logger.error(f"Fixture sync verification failed: no fixtures found for season {season_id}")
        return False

    # Allow small tolerance (some fixtures may be filtered)
    tolerance = 0.95
    if actual_count < expected_count * tolerance:
        logger.error(
            f"Fixture sync verification failed: expected ~{expected_count} fixtures, "
            f"found {actual_count} (< {tolerance*100}% threshold)"
        )
        return False

    # Check that FDR values are present (at least some fixtures have them)
    fdr_count = await conn.fetchval(
        """
        SELECT COUNT(*) FROM fixture
        WHERE season_id = $1
          AND team_h_difficulty IS NOT NULL
          AND team_a_difficulty IS NOT NULL
        """,
        season_id,
    )

    if fdr_count == 0:
        logger.error("Fixture sync verification failed: no fixtures have FDR values")
        return False

    logger.debug(
        f"Fixture sync verified: {actual_count} fixtures, {fdr_count} with FDR values"
    )
    return True


async def sync_teams_from_bootstrap(
    conn: asyncpg.Connection, teams: list[dict], season_id: int
) -> int:
    """Sync team data from FPL bootstrap to database.

    Teams must be synced before players due to FK constraint.

    Args:
        conn: Database connection
        teams: Team list from bootstrap API (bootstrap.teams)
        season_id: Season ID

    Returns:
        Number of teams synced
    """
    if not teams:
        logger.warning("No teams to sync")
        return 0

    await conn.executemany(
        """
        INSERT INTO team (
            id, season_id, code, name, short_name,
            strength, strength_overall_home, strength_overall_away,
            strength_attack_home, strength_attack_away,
            strength_defence_home, strength_defence_away
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id, season_id) DO UPDATE SET
            name = EXCLUDED.name,
            short_name = EXCLUDED.short_name,
            updated_at = NOW()
        """,
        [
            (
                t["id"],
                season_id,
                t["code"],
                t.get("name", "Unknown"),
                t.get("short_name", "UNK"),
                t.get("strength"),
                t.get("strength_overall_home"),
                t.get("strength_overall_away"),
                t.get("strength_attack_home"),
                t.get("strength_attack_away"),
                t.get("strength_defence_home"),
                t.get("strength_defence_away"),
            )
            for t in teams
        ],
    )

    return len(teams)


async def sync_players_from_bootstrap(
    conn: asyncpg.Connection, players: list[dict], season_id: int
) -> int:
    """Sync player data from FPL bootstrap to database.

    This is required for world template calculations which need selected_by_percent.
    NOTE: Teams must be synced first (FK constraint).

    Args:
        conn: Database connection
        players: Player list from bootstrap API (bootstrap.players)
        season_id: Season ID

    Returns:
        Number of players synced
    """
    if not players:
        logger.warning("No players to sync")
        return 0

    # Upsert player data - include all required fields from player table
    await conn.executemany(
        """
        INSERT INTO player (
            id, season_id, team_id, web_name, element_type, now_cost,
            selected_by_percent, total_points, form
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id, season_id) DO UPDATE SET
            team_id = EXCLUDED.team_id,
            web_name = EXCLUDED.web_name,
            element_type = EXCLUDED.element_type,
            now_cost = EXCLUDED.now_cost,
            selected_by_percent = EXCLUDED.selected_by_percent,
            total_points = EXCLUDED.total_points,
            form = EXCLUDED.form,
            updated_at = NOW()
        """,
        [
            (
                p["id"],
                season_id,
                p.get("team", 0),
                p.get("web_name", "Unknown"),
                p.get("element_type", 1),
                p.get("now_cost", 0),
                float(p.get("selected_by_percent", "0")),  # FPL API returns string
                p.get("total_points", 0),
                float(p.get("form", "0")),  # FPL API returns string
            )
            for p in players
        ],
    )

    return len(players)


async def verify_player_sync(
    conn: asyncpg.Connection, season_id: int, expected_count: int
) -> bool:
    """Verify player data was synced correctly.

    Checks:
    1. Player count matches expected (within tolerance)
    2. Players have valid selected_by_percent values (not all NULL/zero)

    Returns:
        True if verification passes, False otherwise
    """
    # Check actual count in database
    actual_count = await conn.fetchval(
        "SELECT COUNT(*) FROM player WHERE season_id = $1", season_id
    )

    if actual_count == 0:
        logger.error(f"Player sync verification failed: no players found for season {season_id}")
        return False

    # Allow small tolerance (some players may be filtered)
    tolerance = 0.95
    if actual_count < expected_count * tolerance:
        logger.error(
            f"Player sync verification failed: expected ~{expected_count} players, "
            f"found {actual_count} (< {tolerance*100}% threshold)"
        )
        return False

    # Check that selected_by_percent has valid data (at least some non-zero values)
    non_zero_count = await conn.fetchval(
        """
        SELECT COUNT(*) FROM player
        WHERE season_id = $1 AND selected_by_percent > 0
        """,
        season_id,
    )

    if non_zero_count == 0:
        logger.error("Player sync verification failed: all selected_by_percent values are 0")
        return False

    logger.debug(
        f"Player sync verified: {actual_count} players, {non_zero_count} with ownership > 0%"
    )
    return True


async def verify_points_against_data(
    conn: asyncpg.Connection, season_id: int, gameweek: int
) -> bool:
    """Verify Points Against data was saved correctly for the gameweek.

    Checks:
    1. Collection status shows "idle" (successful completion)
    2. Collection status latest_gameweek matches expected gameweek
    3. At least one fixture exists for the gameweek
    4. Data has reasonable values (not all zeros or NULL)

    Returns:
        True if verification passes, False otherwise
    """
    # Check collection status first - ensures collection actually completed
    status_row = await conn.fetchrow(
        """
        SELECT latest_gameweek, status, error_message
        FROM points_against_collection_status
        WHERE id = 'points_against'
        """,
    )

    if not status_row:
        logger.error("No points_against_collection_status record found")
        return False

    if status_row["status"] == "failed":
        logger.error(
            f"Points Against collection status is 'failed': {status_row['error_message']}"
        )
        return False

    if status_row["status"] == "running":
        logger.error("Points Against collection is still running")
        return False

    if status_row["latest_gameweek"] != gameweek:
        logger.error(
            f"Points Against collection status gameweek mismatch: "
            f"expected GW{gameweek}, got GW{status_row['latest_gameweek']}"
        )
        return False

    # Check fixture data
    row = await conn.fetchrow(
        """
        SELECT
            COUNT(*) as fixture_count,
            SUM(home_points + away_points) as total_points
        FROM points_against_by_fixture
        WHERE season_id = $1 AND gameweek = $2
        """,
        season_id,
        gameweek,
    )

    if not row or row["fixture_count"] == 0:
        logger.error(f"No Points Against data found for GW{gameweek}")
        return False

    # Each gameweek should have ~10 fixtures (20 teams / 2)
    # Allow some flexibility for blank/double gameweeks
    if row["fixture_count"] < 5:
        logger.warning(
            f"Low fixture count ({row['fixture_count']}) for GW{gameweek} - "
            "might be a blank gameweek, proceeding"
        )

    # Sanity check: should have scored some points
    # SUM() returns None if all values are NULL, so check both None and 0
    if row["total_points"] is None or row["total_points"] == 0:
        logger.error(
            f"Points Against data shows {row['total_points']} total points for GW{gameweek}"
        )
        return False

    logger.info(
        f"Points Against verification passed: status=idle, GW{gameweek}, "
        f"{row['fixture_count']} fixtures, {row['total_points']} total points"
    )
    return True


async def verify_chips_data(
    conn: asyncpg.Connection,
    season_id: int,
    league_id: int,
    expected_members: int,
    failed_syncs: int,
) -> bool:
    """Verify Chips data was saved correctly for the league.

    Checks:
    - League members exist in database
    - Member count matches expected
    - Failure rate is within acceptable threshold

    Args:
        conn: Database connection
        season_id: Season ID
        league_id: League ID
        expected_members: Number of members that were synced
        failed_syncs: Number of managers that failed to sync

    Returns:
        True if verification passes, False otherwise
    """
    # Check league members exist
    member_count = await conn.fetchval(
        """
        SELECT COUNT(*) FROM league_manager
        WHERE league_id = $1 AND season_id = $2
        """,
        league_id,
        season_id,
    )

    if member_count == 0:
        logger.error(f"No league members found for league {league_id}")
        return False

    # Verify member count matches expected
    if expected_members > 0 and member_count < expected_members:
        logger.error(
            f"Member count mismatch: expected {expected_members}, found {member_count}"
        )
        return False

    # Check failure rate threshold
    if expected_members > 0:
        failure_rate = failed_syncs / expected_members
        if failure_rate > MAX_FAILURE_RATE:
            logger.error(
                f"Chips sync failure rate too high: {failed_syncs}/{expected_members} "
                f"({failure_rate:.1%}) > {MAX_FAILURE_RATE:.0%} threshold"
            )
            return False

    logger.info(
        f"Chips verification passed: {member_count} league members, "
        f"{failed_syncs} sync failures"
    )
    return True


async def run_points_against_update(
    conn: asyncpg.Connection,
    fpl_client: FplApiClient,
    season_id: int,
) -> None:
    """Run Points Against incremental update.

    Uses faster rate limiting than initial bulk collection since we're
    only fetching players who played in the latest gameweek (~300 vs 785).
    """
    logger.info("Starting Points Against update...")
    start = time.monotonic()

    await collect_points_against(conn, fpl_client, season_id)

    elapsed = time.monotonic() - start
    logger.info(f"Points Against update complete in {elapsed:.1f}s")


async def run_chips_update(
    fpl_client: FplApiClient,
    season_id: int,
) -> tuple[int, int, int]:
    """Run Chips update for tracked league.

    Returns:
        Tuple of (chips_synced, failed_count, total_members)
    """
    logger.info(f"Starting Chips update for league {LEAGUE_ID}...")
    start = time.monotonic()

    chips_service = ChipsService()
    synced, failed, total = await chips_service.sync_league_chips(
        league_id=LEAGUE_ID,
        season_id=season_id,
        fpl_client=fpl_client,
    )

    elapsed = time.monotonic() - start
    logger.info(
        f"Chips update complete in {elapsed:.1f}s - synced {synced} chips, "
        f"{failed}/{total} managers failed"
    )
    return (synced, failed, total)


async def run_manager_snapshots_update(
    conn: asyncpg.Connection,
    fpl_client: FplApiClient,
    season_id: int,
    gameweek: int,
) -> tuple[int, int, int]:
    """Run incremental Manager Snapshots update for the tracked league.

    Only fetches and saves data for the specified gameweek (typically the
    latest finalized GW). This is much faster than bulk collection since
    we only make 2 API calls per manager (history + picks) instead of
    21+ calls for full history.

    Args:
        conn: Database connection
        fpl_client: FPL API client
        season_id: Season ID
        gameweek: The specific gameweek to collect

    Returns:
        Tuple of (managers_processed, failed_count, total_members)
    """
    logger.info(
        f"Starting Manager Snapshots update for league {LEAGUE_ID}, GW{gameweek}..."
    )
    start = time.monotonic()

    # Get league members
    standings = await fpl_client.get_league_standings(LEAGUE_ID)
    members = standings.members
    total_members = len(members)
    logger.info(f"Found {total_members} members in {standings.league_name}")

    # Sync gameweeks first (needed for FK constraint)
    async with httpx.AsyncClient(timeout=30.0) as http_client:
        await sync_gameweeks_from_bootstrap(conn, http_client, season_id)

        managers_processed = 0
        failed_count = 0

        for i, member in enumerate(members):
            manager_id = member.manager_id

            try:
                # Rate limiting - be gentle with FPL API
                await asyncio.sleep(0.5)

                # Fetch manager info (needed for FK constraint)
                manager_info = await fetch_manager_info(http_client, manager_id)
                await ensure_manager_exists(conn, manager_id, season_id, manager_info)

                # Fetch history to get GW stats
                history, _ = await fetch_manager_history(http_client, manager_id)

                # Find the specific gameweek in history
                gw_data = None
                for h in history:
                    if h.gameweek == gameweek:
                        gw_data = h
                        break

                if not gw_data:
                    logger.warning(
                        f"Manager {manager_id} has no data for GW{gameweek} - skipping"
                    )
                    continue

                # Fetch picks for this GW
                await asyncio.sleep(0.5)
                picks, chip_used = await fetch_manager_picks(
                    http_client, manager_id, gameweek
                )

                # Save snapshot and picks
                await save_snapshot_and_picks(
                    conn, manager_id, season_id, gw_data, picks, chip_used
                )

                managers_processed += 1
                logger.debug(
                    f"Saved GW{gameweek} snapshot for manager {manager_id} "
                    f"({i + 1}/{total_members})"
                )

            except (httpx.HTTPError, RuntimeError) as e:
                logger.warning(f"Failed to process manager {manager_id}: {e}")
                failed_count += 1
                continue

    elapsed = time.monotonic() - start
    logger.info(
        f"Manager Snapshots update complete in {elapsed:.1f}s - "
        f"{managers_processed}/{total_members} managers, {failed_count} failed"
    )
    return (managers_processed, failed_count, total_members)


async def verify_manager_snapshots_data(
    conn: asyncpg.Connection,
    season_id: int,
    gameweek: int,
    expected_members: int,
    failed_count: int,
) -> bool:
    """Verify Manager Snapshots data was saved correctly for the gameweek.

    Checks:
    - Snapshots exist for the gameweek
    - Snapshot count is reasonable (within failure tolerance)
    - Picks exist for the snapshots

    Args:
        conn: Database connection
        season_id: Season ID
        gameweek: Gameweek that was collected
        expected_members: Number of managers that should have been processed
        failed_count: Number of managers that failed to sync

    Returns:
        True if verification passes, False otherwise
    """
    # Check failure rate threshold
    if expected_members > 0:
        failure_rate = failed_count / expected_members
        if failure_rate > MAX_FAILURE_RATE:
            logger.error(
                f"Manager Snapshots sync failure rate too high: "
                f"{failed_count}/{expected_members} ({failure_rate:.1%}) "
                f"> {MAX_FAILURE_RATE:.0%} threshold"
            )
            return False

    # Check snapshot count
    row = await conn.fetchrow(
        """
        SELECT
            COUNT(*) as snapshot_count,
            COUNT(DISTINCT manager_id) as manager_count
        FROM manager_gw_snapshot
        WHERE season_id = $1 AND gameweek = $2
        """,
        season_id,
        gameweek,
    )

    if not row or row["snapshot_count"] == 0:
        logger.error(f"No Manager Snapshots found for GW{gameweek}")
        return False

    # Should have at least some snapshots (accounting for failures)
    min_expected = expected_members - failed_count
    if row["snapshot_count"] < min_expected:
        logger.error(
            f"Snapshot count mismatch: expected at least {min_expected}, "
            f"found {row['snapshot_count']}"
        )
        return False

    # Check that picks exist for the snapshots
    picks_row = await conn.fetchrow(
        """
        SELECT COUNT(*) as pick_count
        FROM manager_pick mp
        JOIN manager_gw_snapshot mgs ON mp.snapshot_id = mgs.id
        WHERE mgs.season_id = $1 AND mgs.gameweek = $2
        """,
        season_id,
        gameweek,
    )

    # Each manager should have ~15 picks (11 starting + 4 bench)
    expected_picks = row["snapshot_count"] * 15
    if not picks_row or picks_row["pick_count"] < expected_picks * 0.9:
        logger.error(
            f"Pick count too low: expected ~{expected_picks}, "
            f"found {picks_row['pick_count'] if picks_row else 0}"
        )
        return False

    logger.info(
        f"Manager Snapshots verification passed: GW{gameweek}, "
        f"{row['snapshot_count']} snapshots, {picks_row['pick_count']} picks"
    )
    return True


async def run_scheduled_update(dry_run: bool = False) -> None:
    """Main entry point for scheduled updates.

    Only marks gameweek as processed after both:
    1. Collection completes without errors
    2. Verification confirms data was saved correctly

    If either fails, gameweek remains unprocessed for next run.

    Args:
        dry_run: If True, check what would be updated without making changes
    """
    mode = "DRY RUN" if dry_run else "LIVE"
    logger.info(
        f"Starting scheduled update ({mode}) at {datetime.now(UTC).isoformat()}"
    )

    pool = None
    # Use faster rate for incremental updates (1 req/sec vs 0.2 req/sec for bulk)
    # This is safe because weekly incremental only fetches ~300 players, not all 785
    fpl_client = FplApiClient(requests_per_second=1.0, max_concurrent=5)

    try:
        # 1. Check if new GW is finalized
        logger.info("Checking for finalized gameweek...")
        bootstrap = await fpl_client.get_bootstrap()

        # Validate FPL API response - check all critical data is present
        if not bootstrap or not hasattr(bootstrap, "events") or not bootstrap.events:
            raise RuntimeError(
                "Invalid FPL API response: missing or empty events data. "
                "FPL API may be unavailable or updating."
            )
        if not bootstrap.players:
            raise RuntimeError(
                f"Invalid FPL API response: missing or empty players data "
                f"(got {len(bootstrap.players) if bootstrap.players else 0} players). "
                "FPL API may be updating."
            )
        if not bootstrap.teams:
            raise RuntimeError(
                "Invalid FPL API response: missing or empty teams data. "
                "FPL API may be updating."
            )

        latest_finalized = None
        for event in reversed(bootstrap.events):
            if event.get("data_checked"):
                latest_finalized = event["id"]
                break

        if not latest_finalized:
            logger.info("No finalized gameweek found, skipping")
            return

        logger.info(f"Latest finalized GW: {latest_finalized}")

        # 2. Connect to database
        pool = await create_pool()
        async with pool.acquire() as conn:
            # 3. Get or create season (need this first for status check)
            season_id = await get_or_create_season(conn)
            logger.info(f"Season ID: {season_id}")

            # 4. Check stored latest gameweek for this season
            stored_gw = await get_stored_gameweek(conn, season_id)
            logger.info(f"Last processed GW: {stored_gw}")

            if latest_finalized <= stored_gw:
                logger.info(f"GW{latest_finalized} already processed, skipping")
                return

            logger.info(f"Processing GW{latest_finalized} (new since GW{stored_gw})")

            if dry_run:
                logger.info("[DRY RUN] Would update Points Against data")
                logger.info("[DRY RUN] Would sync teams and players")
                logger.info("[DRY RUN] Would sync fixtures")
                logger.info("[DRY RUN] Would update Chips data")
                logger.info("[DRY RUN] Would update Manager Snapshots data")
                logger.info(
                    f"[DRY RUN] Would mark GW{latest_finalized} as processed"
                )
                logger.info("[DRY RUN] Complete - no changes made")
                return

            # 5. Acquire advisory lock to prevent concurrent updates
            # This prevents race conditions if cron overlap or manual run happens
            logger.info("Acquiring advisory lock for scheduled update...")
            lock_acquired = await conn.fetchval(
                "SELECT pg_try_advisory_lock($1)", SCHEDULED_UPDATE_LOCK_KEY
            )
            if not lock_acquired:
                logger.warning(
                    "Another scheduled update is already running, skipping this run"
                )
                return

            try:
                # 6. Update Points Against (slow operation)
                await run_points_against_update(conn, fpl_client, season_id)

                # 7. Verify Points Against data
                if not await verify_points_against_data(conn, season_id, latest_finalized):
                    raise RuntimeError(
                        f"Points Against verification failed for GW{latest_finalized}"
                    )

                # 7.5 Sync teams and players (needed for world template calculations)
                # Teams: sync only if not already present (they don't change mid-season)
                team_count = await conn.fetchval(
                    "SELECT COUNT(*) FROM team WHERE season_id = $1", season_id
                )
                if team_count == 0:
                    teams_synced = await sync_teams_from_bootstrap(
                        conn, bootstrap.teams, season_id
                    )
                    logger.info(f"Team sync complete: {teams_synced} teams")
                else:
                    logger.debug(f"Teams already present ({team_count}), skipping sync")

                # Players: sync every time as selected_by_percent changes weekly
                players_synced = await sync_players_from_bootstrap(
                    conn, bootstrap.players, season_id
                )
                logger.info(f"Player sync complete: {players_synced} players")

                # 7.6 Verify player sync
                if not await verify_player_sync(conn, season_id, len(bootstrap.players)):
                    raise RuntimeError("Player sync verification failed")

                # 7.7 Sync fixtures (updates every GW: scores, stats, rescheduling)
                fixtures = await fpl_client.get_fixtures()
                fixtures_synced = await sync_fixtures_from_api(conn, fixtures, season_id)
                logger.info(f"Fixture sync complete: {fixtures_synced} fixtures")

                # 7.8 Verify fixture sync
                if not await verify_fixtures_data(conn, season_id, len(fixtures)):
                    raise RuntimeError("Fixture sync verification failed")

                # 8. Update Chips for tracked league (fast operation)
                _, failed_count, total_members = await run_chips_update(fpl_client, season_id)

                # 9. Check that league has members (sanity check for correct league ID)
                if total_members == 0:
                    raise RuntimeError(
                        f"League {LEAGUE_ID} has no members - check if league ID is correct"
                    )

                # 10. Verify Chips data (including failure rate check)
                if not await verify_chips_data(
                    conn, season_id, LEAGUE_ID, total_members, failed_count
                ):
                    raise RuntimeError(f"Chips verification failed for league {LEAGUE_ID}")

                # 11. Update Manager Snapshots for tracked league
                (
                    snapshots_processed,
                    snapshots_failed,
                    snapshots_total,
                ) = await run_manager_snapshots_update(
                    conn, fpl_client, season_id, latest_finalized
                )

                # 12. Verify Manager Snapshots data
                if not await verify_manager_snapshots_data(
                    conn, season_id, latest_finalized, snapshots_total, snapshots_failed
                ):
                    raise RuntimeError(
                        f"Manager Snapshots verification failed for GW{latest_finalized}"
                    )

                # 13. All verified - mark gameweek as processed
                await update_collection_status(conn, season_id, latest_finalized)
                logger.info(f"Scheduled update complete for GW{latest_finalized}")
            finally:
                # Always release the advisory lock
                await conn.execute(
                    "SELECT pg_advisory_unlock($1)", SCHEDULED_UPDATE_LOCK_KEY
                )

    except Exception as e:
        logger.error(f"Scheduled update failed: {e}", exc_info=True)
        logger.error(
            "Gameweek NOT marked as processed. Next run will retry. "
            "If this persists, manual intervention required."
        )
        raise
    finally:
        await fpl_client.close()
        if pool:
            await pool.close()


async def show_status() -> None:
    """Show current status of scheduled updates."""
    pool = None
    try:
        pool = await create_pool()
        async with pool.acquire() as conn:
            # Get current season
            season_id = await get_or_create_season(conn)

            # Show scheduled update status for current season
            row = await conn.fetchrow(
                """
                SELECT latest_gameweek, last_update
                FROM collection_status
                WHERE id = 'scheduled' AND season_id = $1
                """,
                season_id,
            )

            print("\nScheduled Update Status")
            print("-" * 40)
            print(f"Season ID:           {season_id}")
            if row:
                print(f"Latest Gameweek:     {row['latest_gameweek']}")
                print(f"Last Update:         {row['last_update']}")
            else:
                print("No scheduled updates have run yet for this season")
            print("-" * 40)

            # Show Points Against status
            await show_pa_status(conn)

    except asyncpg.PostgresError as e:
        logger.error(f"Database error checking status: {e}")
        print(f"\nError: Could not connect to database - {e}")
        raise
    finally:
        if pool:
            await pool.close()


async def sync_bootstrap_only() -> None:
    """Sync only teams and players from FPL bootstrap.

    This is a one-time operation to populate the database with team and player data
    required for world template calculations. Runs independently of scheduled updates.
    """
    pool = None
    fpl_client = FplApiClient(requests_per_second=1.0, max_concurrent=5)

    try:
        logger.info("Fetching FPL bootstrap data...")
        bootstrap = await fpl_client.get_bootstrap()

        if not bootstrap.teams:
            raise RuntimeError("No teams in bootstrap data")
        if not bootstrap.players:
            raise RuntimeError("No players in bootstrap data")

        pool = await create_pool()
        async with pool.acquire() as conn:
            season_id = await get_or_create_season(conn)
            logger.info(f"Season ID: {season_id}")

            # Sync players (teams already populated at season start)
            players_synced = await sync_players_from_bootstrap(
                conn, bootstrap.players, season_id
            )
            logger.info(f"Players synced: {players_synced}")

            # Verify player sync
            if not await verify_player_sync(conn, season_id, len(bootstrap.players)):
                raise RuntimeError("Player sync verification failed")

            print(f"\n✓ Synced {players_synced} players")

    except Exception as e:
        logger.error(f"Bootstrap sync failed: {e}", exc_info=True)
        raise
    finally:
        await fpl_client.close()
        if pool:
            await pool.close()


async def sync_fixtures_only() -> None:
    """Sync all fixtures from FPL API.

    This syncs fixture data including:
    - Static: teams, kickoff times, FDR ratings
    - Dynamic: scores, started/finished status, stats

    Use this for initial population or to update fixture data outside scheduled runs.
    """
    pool = None
    fpl_client = FplApiClient(requests_per_second=1.0, max_concurrent=5)

    try:
        logger.info("Fetching FPL fixtures data...")
        fixtures = await fpl_client.get_fixtures()

        if not fixtures:
            raise RuntimeError("No fixtures returned from FPL API")

        logger.info(f"Got {len(fixtures)} fixtures from FPL API")

        pool = await create_pool()
        async with pool.acquire() as conn:
            season_id = await get_or_create_season(conn)
            logger.info(f"Season ID: {season_id}")

            # Ensure teams exist (FK constraint)
            team_count = await conn.fetchval(
                "SELECT COUNT(*) FROM team WHERE season_id = $1", season_id
            )
            if team_count == 0:
                logger.info("No teams found - syncing teams from bootstrap first...")
                bootstrap = await fpl_client.get_bootstrap()
                teams_synced = await sync_teams_from_bootstrap(
                    conn, bootstrap.teams, season_id
                )
                logger.info(f"Teams synced: {teams_synced}")

            # Sync fixtures
            fixtures_synced = await sync_fixtures_from_api(conn, fixtures, season_id)
            logger.info(f"Fixtures synced: {fixtures_synced}")

            # Verify fixture sync
            if not await verify_fixtures_data(conn, season_id, len(fixtures)):
                raise RuntimeError("Fixture sync verification failed")

            # Show summary
            finished_count = await conn.fetchval(
                "SELECT COUNT(*) FROM fixture WHERE season_id = $1 AND finished = true",
                season_id,
            )
            upcoming_count = fixtures_synced - finished_count

            print(f"\n✓ Synced {fixtures_synced} fixtures")
            print(f"  - Finished: {finished_count}")
            print(f"  - Upcoming: {upcoming_count}")

    except Exception as e:
        logger.error(f"Fixture sync failed: {e}", exc_info=True)
        raise
    finally:
        await fpl_client.close()
        if pool:
            await pool.close()


async def main() -> None:
    """Main entry point with argument parsing."""
    parser = argparse.ArgumentParser(description="Scheduled data updates")
    parser.add_argument(
        "--status", action="store_true", help="Show current update status"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Check what would be updated without making changes",
    )
    parser.add_argument(
        "--sync-bootstrap",
        action="store_true",
        help="Sync only teams and players from FPL bootstrap (one-time operation)",
    )
    parser.add_argument(
        "--sync-fixtures",
        action="store_true",
        help="Sync all fixtures from FPL API (initial population or manual update)",
    )

    args = parser.parse_args()

    if args.status:
        await show_status()
    elif args.sync_bootstrap:
        await sync_bootstrap_only()
    elif args.sync_fixtures:
        await sync_fixtures_only()
    else:
        try:
            await asyncio.wait_for(
                run_scheduled_update(dry_run=args.dry_run),
                timeout=MAX_RUNTIME_SECONDS,
            )
        except TimeoutError as e:
            logger.error(
                f"Scheduled update timed out after {MAX_RUNTIME_SECONDS}s. "
                "Check FPL API responsiveness and database performance."
            )
            raise RuntimeError(
                f"Update timed out after {MAX_RUNTIME_SECONDS}s"
            ) from e


if __name__ == "__main__":
    asyncio.run(main())
