"""Evidence-aware SQL projection for shared player_fixture_stats readers."""

from typing import Any

EXPECTED_GOALS = 1 << 0
EXPECTED_ASSISTS = 1 << 1
EXPECTED_GOAL_INVOLVEMENTS = 1 << 2
EXPECTED_GOALS_CONCEDED = 1 << 3
DEFENSIVE_CONTRIBUTION = 1 << 11

FIXTURE_SYNC_TABLE = "fpl_fixture_sync"
EVIDENCE_TABLE = "fpl_player_fixture_evidence"
CURRENT_TABLE = "fpl_player_fixture_current"
RECEIPT_TABLE = "fpl_sync_receipt"


class IncompletePfsData(RuntimeError):
    """Raised when a derived answer requires unavailable fixture evidence."""


_COLUMNS = """p.fixture_id, p.player_id, p.season_id, p.gameweek,
           p.player_team_id, p.opponent_team_id, p.was_home, p.kickoff_time,
           p.minutes, p.total_points, p.goals_scored, p.assists"""

_LEGACY_COMPONENT_FLAGS = """TRUE AS evidence_available,
           TRUE AS expected_goals_available, TRUE AS expected_assists_available,
           TRUE AS expected_goal_involvements_available,
           TRUE AS expected_goals_conceded_available"""


async def pfs_read_cte(conn: Any) -> str:
    """Return a CTE that hides unverified owner rows and masks absent components.

    Table discovery alone is not ownership: a fixture enters the protocol only when
    it has an observation or a last verified generation. With no owner metadata,
    the projection is the unchanged legacy table.
    """
    fixture_metadata = await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", FIXTURE_SYNC_TABLE)
    evidence_metadata = await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", EVIDENCE_TABLE)
    current_metadata = await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", CURRENT_TABLE)
    receipt_metadata = await conn.fetchval("SELECT to_regclass($1) IS NOT NULL", RECEIPT_TABLE)

    if not any((fixture_metadata, evidence_metadata, current_metadata, receipt_metadata)):
        return f"""pfs_read AS (
            SELECT {_COLUMNS}, p.expected_goals, p.expected_assists,
                   p.expected_goal_involvements, p.goals_conceded,
                   p.expected_goals_conceded, {_LEGACY_COMPONENT_FLAGS}
            FROM player_fixture_stats p
        )"""
    if not fixture_metadata:
        # Preserve rows as unavailable: absence must not become a zero-minute appearance.
        return f"""pfs_read AS (
            SELECT {_COLUMNS}, NULL AS expected_goals, NULL AS expected_assists,
                   NULL AS expected_goal_involvements, p.goals_conceded,
                   NULL AS expected_goals_conceded, FALSE AS evidence_available,
                   FALSE AS expected_goals_available, FALSE AS expected_assists_available,
                   FALSE AS expected_goal_involvements_available,
                   FALSE AS expected_goals_conceded_available
            FROM player_fixture_stats p
        )"""
    if not evidence_metadata:
        return f"""pfs_read AS (
            SELECT {_COLUMNS}, p.expected_goals, p.expected_assists,
                   p.expected_goal_involvements, p.goals_conceded,
                   p.expected_goals_conceded,
                   (fs.fixture_id IS NULL OR (fs.observation_generation IS NULL
                    AND fs.last_verified_generation IS NULL)) AS evidence_available,
                   (fs.fixture_id IS NULL OR (fs.observation_generation IS NULL
                    AND fs.last_verified_generation IS NULL)) AS expected_goals_available,
                   (fs.fixture_id IS NULL OR (fs.observation_generation IS NULL
                    AND fs.last_verified_generation IS NULL)) AS expected_assists_available,
                   (fs.fixture_id IS NULL OR (fs.observation_generation IS NULL
                    AND fs.last_verified_generation IS NULL))
                    AS expected_goal_involvements_available,
                   (fs.fixture_id IS NULL OR (fs.observation_generation IS NULL
                    AND fs.last_verified_generation IS NULL)) AS expected_goals_conceded_available
            FROM player_fixture_stats p
            LEFT JOIN {FIXTURE_SYNC_TABLE} fs
              ON fs.season_id = p.season_id AND fs.fixture_id = p.fixture_id
        )"""

    legacy = """fs.fixture_id IS NULL OR (fs.observation_generation IS NULL
                              AND fs.last_verified_generation IS NULL)"""
    verified = """COALESCE((fs.state = 'VERIFIED'
                          AND fs.current_verified_generation IS NOT NULL
                          AND e.generation = fs.current_verified_generation), FALSE)"""
    if current_metadata and receipt_metadata:
        return _incremental_projection(legacy, verified)
    if current_metadata or receipt_metadata:
        # An incomplete ownership schema cannot certify a physical value as legacy.
        return f"""pfs_read AS (
            SELECT {_COLUMNS}, NULL AS expected_goals, NULL AS expected_assists,
                   NULL AS expected_goal_involvements, p.goals_conceded,
                   NULL AS expected_goals_conceded, FALSE AS evidence_available,
                   FALSE AS expected_goals_available, FALSE AS expected_assists_available,
                   FALSE AS expected_goal_involvements_available,
                   FALSE AS expected_goals_conceded_available
            FROM player_fixture_stats p
        )"""
    return f"""pfs_read AS (
        SELECT {_COLUMNS},
               CASE WHEN ({legacy}) OR (({verified})
                          AND (e.component_presence & {EXPECTED_GOALS}) <> 0)
                    THEN p.expected_goals END AS expected_goals,
               CASE WHEN ({legacy}) OR (({verified})
                          AND (e.component_presence & {EXPECTED_ASSISTS}) <> 0)
                    THEN p.expected_assists END AS expected_assists,
               CASE WHEN ({legacy}) OR (({verified})
                          AND (e.component_presence & {EXPECTED_GOAL_INVOLVEMENTS}) <> 0)
                    THEN p.expected_goal_involvements END AS expected_goal_involvements,
               p.goals_conceded,
               CASE WHEN ({legacy}) OR (({verified})
                          AND (e.component_presence & {EXPECTED_GOALS_CONCEDED}) <> 0)
                    THEN p.expected_goals_conceded END AS expected_goals_conceded,
               (({legacy}) OR ({verified})) AS evidence_available,
               (({legacy}) OR (({verified}) AND
                    (e.component_presence & {EXPECTED_GOALS}) <> 0)) AS expected_goals_available,
               (({legacy}) OR (({verified}) AND
                    (e.component_presence & {EXPECTED_ASSISTS}) <> 0))
                    AS expected_assists_available,
               (({legacy}) OR (({verified}) AND
                    (e.component_presence & {EXPECTED_GOAL_INVOLVEMENTS}) <> 0))
                    AS expected_goal_involvements_available,
               (({legacy}) OR (({verified}) AND
                    (e.component_presence & {EXPECTED_GOALS_CONCEDED}) <> 0))
                    AS expected_goals_conceded_available
        FROM player_fixture_stats p
        LEFT JOIN {FIXTURE_SYNC_TABLE} fs
          ON fs.season_id = p.season_id AND fs.fixture_id = p.fixture_id
        LEFT JOIN {EVIDENCE_TABLE} e
          ON e.season_id = p.season_id AND e.fixture_id = p.fixture_id
         AND e.player_id = p.player_id
         AND e.generation = fs.current_verified_generation
    )"""


def _physical_fingerprint_sql() -> str:
    # Match the owned publisher's PlayerFixtureFingerprint.physicalSqlExpression exactly.
    def optional(column: str, bit: int) -> str:
        return f"CASE WHEN (ie.component_presence & {bit}) <> 0 THEN p.{column} END"

    values = [
        "p.season_id",
        "s.code",
        "p.fixture_id",
        "p.player_id",
        "p.gameweek",
        "p.player_team_id",
        "p.opponent_team_id",
        "p.was_home",
        "p.kickoff_time AT TIME ZONE 'UTC'",
        "p.minutes",
        "p.total_points",
        "p.bonus",
        "p.bps",
        "p.goals_scored",
        "p.assists",
        optional("expected_goals", 1),
        optional("expected_assists", 2),
        optional("expected_goal_involvements", 4),
        "p.clean_sheets",
        "p.goals_conceded",
        "p.own_goals",
        "p.penalties_saved",
        "p.penalties_missed",
        "p.saves",
        optional("expected_goals_conceded", 8),
        "p.yellow_cards",
        "p.red_cards",
        optional("influence", 16),
        optional("creativity", 32),
        optional("threat", 64),
        optional("ict_index", 128),
        "p.value",
        "p.selected",
        "p.transfers_in",
        "p.transfers_out",
        "p.starts",
        optional("clearances_blocks_interceptions", 256),
        optional("recoveries", 512),
        optional("tackles", 1024),
        optional("defensive_contribution", 2048),
        "ie.component_presence",
    ]
    return (
        "encode(sha256(convert_to(jsonb_build_array("
        + ", ".join(values)
        + ")::text, 'UTF8')), 'hex')"
    )


def _incremental_projection(legacy: str, verified: str) -> str:
    page = """EXISTS (SELECT 1 FROM fpl_sync_receipt page_receipt
        WHERE page_receipt.season = s.code
          AND page_receipt.publication_key = 'incremental-page:player:' || p.player_id
          AND page_receipt.latest_generation >= c.source_run_generation
          AND page_receipt.source_read_started_at IS NOT NULL
          AND page_receipt.source_read_finished_at IS NOT NULL
          AND page_receipt.source_read_started_at <= page_receipt.source_read_finished_at
          AND page_receipt.source_read_finished_at >= c.source_read_finished_at
          AND (page_receipt.latest_generation > c.source_run_generation
               OR (page_receipt.source_read_started_at = c.source_read_started_at
                   AND page_receipt.source_read_finished_at = c.source_read_finished_at))
          AND (page_receipt.latest_generation = c.source_run_generation
               OR page_receipt.source_read_started_at >= c.source_read_finished_at))"""
    physical = _physical_fingerprint_sql()
    current_proof = f"""(c.fixture_id IS NOT NULL AND c.row_state = 'VALID'
        AND c.season_code = s.code AND c.evidence_generation IS NOT NULL
        AND c.evidence_generation = c.source_run_generation
        AND c.source_read_started_at = ie.source_read_started_at
        AND c.source_read_finished_at = ie.source_read_finished_at
        AND ie.generation = c.evidence_generation
        AND {page} AND c.physical_fingerprint = {physical})"""
    fixture_marker = """NOT EXISTS (SELECT 1 FROM fpl_player_fixture_current own_fixture
        WHERE own_fixture.season_id = p.season_id AND own_fixture.fixture_id = p.fixture_id)"""
    population_marker = """NOT EXISTS (SELECT 1 FROM fpl_sync_receipt own_population
        WHERE own_population.season = s.code
          AND own_population.publication_key = 'incremental-population:fixture:' || p.fixture_id)"""
    old_proof = (
        f"(c.fixture_id IS NULL AND {fixture_marker} "
        f"AND ({verified} OR (({legacy}) AND {population_marker})))"
    )

    def available(bit: int) -> str:
        return (
            f"((v.current_valid AND (ie.component_presence & {bit}) <> 0) OR "
            f"(v.old_valid AND (({legacy}) OR (e.component_presence & {bit}) <> 0)))"
        )

    def component(column: str, bit: int) -> str:
        return (
            f"CASE WHEN v.current_valid AND (ie.component_presence & {bit}) <> 0 "
            f"THEN p.{column} WHEN v.old_valid AND (({legacy}) OR "
            f"(e.component_presence & {bit}) <> 0) THEN p.{column} END AS {column}"
        )

    return f"""pfs_read AS (
        SELECT {_COLUMNS},
               {component("expected_goals", 1)},
               {component("expected_assists", 2)},
               {component("expected_goal_involvements", 4)},
               p.goals_conceded,
               {component("expected_goals_conceded", 8)},
               (v.current_valid OR v.old_valid) AS evidence_available,
               {available(1)} AS expected_goals_available,
               {available(2)} AS expected_assists_available,
               {available(4)} AS expected_goal_involvements_available,
               {available(8)} AS expected_goals_conceded_available
        FROM player_fixture_stats p
        LEFT JOIN {FIXTURE_SYNC_TABLE} fs
          ON fs.season_id = p.season_id AND fs.fixture_id = p.fixture_id
        LEFT JOIN {EVIDENCE_TABLE} e
          ON e.season_id = p.season_id AND e.fixture_id = p.fixture_id
         AND e.player_id = p.player_id AND e.generation = fs.current_verified_generation
        LEFT JOIN {CURRENT_TABLE} c
          ON c.season_id = p.season_id AND c.fixture_id = p.fixture_id
         AND c.player_id = p.player_id
        LEFT JOIN {EVIDENCE_TABLE} ie
          ON ie.season_id = c.season_id AND ie.season_code = c.season_code
         AND ie.fixture_id = c.fixture_id AND ie.player_id = c.player_id
         AND ie.generation = c.evidence_generation
        LEFT JOIN season s ON s.id = p.season_id
        CROSS JOIN LATERAL (SELECT COALESCE({current_proof}, FALSE) AS current_valid,
                                  COALESCE({old_proof}, FALSE) AS old_valid) v
    )"""


async def with_pfs_read(conn: Any, query: str) -> str:
    """Prefix a query with the projection selected for the connected schema."""
    return f"WITH {await pfs_read_cte(conn)}\n{query}"
