"""Evidence-aware SQL projection for shared player_fixture_stats readers."""

from typing import Any

EXPECTED_GOALS = 1 << 0
EXPECTED_ASSISTS = 1 << 1
EXPECTED_GOAL_INVOLVEMENTS = 1 << 2
EXPECTED_GOALS_CONCEDED = 1 << 3
DEFENSIVE_CONTRIBUTION = 1 << 11

FIXTURE_SYNC_TABLE = "fpl_fixture_sync"
EVIDENCE_TABLE = "fpl_player_fixture_evidence"


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
    fixture_metadata = await conn.fetchval(
        "SELECT to_regclass($1) IS NOT NULL", FIXTURE_SYNC_TABLE
    )
    evidence_metadata = await conn.fetchval(
        "SELECT to_regclass($1) IS NOT NULL", EVIDENCE_TABLE
    )

    if not fixture_metadata and not evidence_metadata:
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


async def with_pfs_read(conn: Any, query: str) -> str:
    """Prefix a query with the projection selected for the connected schema."""
    return f"WITH {await pfs_read_cte(conn)}\n{query}"
