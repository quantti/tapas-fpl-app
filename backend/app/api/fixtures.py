"""Fixtures API routes - Match fixtures and results."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field

from app.db import get_pool
from app.dependencies import require_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/fixtures", tags=["fixtures"])


# =============================================================================
# Pydantic Response Models
# =============================================================================


class FixtureTeam(BaseModel):
    """Team info for a fixture."""

    id: int
    name: str
    short_name: str


class Fixture(BaseModel):
    """A single fixture."""

    id: int
    season_id: int
    gameweek: int | None = Field(ge=1, le=38, default=None)
    code: int
    team_h: FixtureTeam
    team_a: FixtureTeam
    team_h_score: int | None = None
    team_a_score: int | None = None
    team_h_difficulty: int | None = Field(ge=1, le=5, default=None)
    team_a_difficulty: int | None = Field(ge=1, le=5, default=None)
    kickoff_time: str | None = None
    started: bool = False
    finished: bool = False
    finished_provisional: bool = False
    minutes: int = 0


class FixturesResponse(BaseModel):
    """Response for fixture list endpoints."""

    season_id: int
    fixtures: list[Fixture]
    total: int


class FixtureDetailResponse(BaseModel):
    """Response for single fixture with stats."""

    fixture: Fixture
    stats: list[dict] | None = None


# =============================================================================
# Endpoints
# =============================================================================


async def _fetch_fixtures(
    season_id: int,
    gameweek: int | None = None,
    team_id: int | None = None,
    finished: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> FixturesResponse:
    """Core fixture fetching logic - can be called directly."""
    pool = get_pool()
    async with pool.acquire() as conn:
        # Build query with filters
        conditions = ["f.season_id = $1"]
        params: list = [season_id]
        param_idx = 2

        if gameweek is not None:
            conditions.append(f"f.gameweek = ${param_idx}")
            params.append(gameweek)
            param_idx += 1

        if team_id is not None:
            conditions.append(f"(f.team_h = ${param_idx} OR f.team_a = ${param_idx})")
            params.append(team_id)
            param_idx += 1

        if finished is not None:
            conditions.append(f"f.finished = ${param_idx}")
            params.append(finished)
            param_idx += 1

        where_clause = " AND ".join(conditions)

        # Get total count
        count_query = f"SELECT COUNT(*) FROM fixture f WHERE {where_clause}"
        total = await conn.fetchval(count_query, *params)

        # Get fixtures with team details
        params.extend([limit, offset])
        query = f"""
            SELECT
                f.id, f.season_id, f.gameweek, f.code,
                f.team_h, th.name as team_h_name, th.short_name as team_h_short,
                f.team_a, ta.name as team_a_name, ta.short_name as team_a_short,
                f.team_h_score, f.team_a_score,
                f.team_h_difficulty, f.team_a_difficulty,
                f.kickoff_time, f.started, f.finished, f.finished_provisional, f.minutes
            FROM fixture f
            JOIN team th ON th.id = f.team_h AND th.season_id = f.season_id
            JOIN team ta ON ta.id = f.team_a AND ta.season_id = f.season_id
            WHERE {where_clause}
            ORDER BY f.kickoff_time ASC NULLS LAST, f.id
            LIMIT ${param_idx} OFFSET ${param_idx + 1}
        """
        rows = await conn.fetch(query, *params)

        fixtures = [
            Fixture(
                id=r["id"],
                season_id=r["season_id"],
                gameweek=r["gameweek"],
                code=r["code"],
                team_h=FixtureTeam(
                    id=r["team_h"], name=r["team_h_name"], short_name=r["team_h_short"]
                ),
                team_a=FixtureTeam(
                    id=r["team_a"], name=r["team_a_name"], short_name=r["team_a_short"]
                ),
                team_h_score=r["team_h_score"],
                team_a_score=r["team_a_score"],
                team_h_difficulty=r["team_h_difficulty"],
                team_a_difficulty=r["team_a_difficulty"],
                kickoff_time=r["kickoff_time"].isoformat() if r["kickoff_time"] else None,
                started=r["started"],
                finished=r["finished"],
                finished_provisional=r["finished_provisional"],
                minutes=r["minutes"],
            )
            for r in rows
        ]

        return FixturesResponse(season_id=season_id, fixtures=fixtures, total=total)


@router.get("", response_model=FixturesResponse)
async def get_fixtures(
    _: None = Depends(require_db),
    season_id: int = Query(default=1, ge=1, description="Season ID"),
    gameweek: int | None = Query(default=None, ge=1, le=38, description="Filter by gameweek"),
    team_id: int | None = Query(default=None, ge=1, description="Filter by team (home or away)"),
    finished: bool | None = Query(default=None, description="Filter by finished status"),
    limit: int = Query(default=50, ge=1, le=200, description="Max fixtures to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
) -> FixturesResponse:
    """Get fixtures with optional filters."""
    return await _fetch_fixtures(
        season_id=season_id,
        gameweek=gameweek,
        team_id=team_id,
        finished=finished,
        limit=limit,
        offset=offset,
    )


@router.get("/gameweek/{gameweek}", response_model=FixturesResponse)
async def get_fixtures_by_gameweek(
    _: None = Depends(require_db),
    gameweek: int = Path(ge=1, le=38, description="Gameweek number"),
    season_id: int = Query(default=1, ge=1, description="Season ID"),
) -> FixturesResponse:
    """Get all fixtures for a specific gameweek."""
    return await _fetch_fixtures(season_id=season_id, gameweek=gameweek, limit=20)


@router.get("/team/{team_id}", response_model=FixturesResponse)
async def get_fixtures_by_team(
    _: None = Depends(require_db),
    team_id: int = Path(ge=1, le=20, description="Team ID"),
    season_id: int = Query(default=1, ge=1, description="Season ID"),
    finished: bool | None = Query(default=None, description="Filter by finished status"),
) -> FixturesResponse:
    """Get all fixtures for a specific team."""
    return await _fetch_fixtures(
        season_id=season_id, team_id=team_id, finished=finished, limit=50
    )


@router.get("/{fixture_id}", response_model=FixtureDetailResponse)
async def get_fixture(
    _: None = Depends(require_db),
    fixture_id: int = Path(ge=1, description="Fixture ID"),
    season_id: int = Query(default=1, ge=1, description="Season ID"),
) -> FixtureDetailResponse:
    """Get a single fixture with stats."""
    pool = get_pool()
    async with pool.acquire() as conn:
        query = """
            SELECT
                f.id, f.season_id, f.gameweek, f.code,
                f.team_h, th.name as team_h_name, th.short_name as team_h_short,
                f.team_a, ta.name as team_a_name, ta.short_name as team_a_short,
                f.team_h_score, f.team_a_score,
                f.team_h_difficulty, f.team_a_difficulty,
                f.kickoff_time, f.started, f.finished, f.finished_provisional,
                f.minutes, f.stats
            FROM fixture f
            JOIN team th ON th.id = f.team_h AND th.season_id = f.season_id
            JOIN team ta ON ta.id = f.team_a AND ta.season_id = f.season_id
            WHERE f.id = $1 AND f.season_id = $2
        """
        row = await conn.fetchrow(query, fixture_id, season_id)

        if not row:
            raise HTTPException(status_code=404, detail="Fixture not found")

        fixture = Fixture(
            id=row["id"],
            season_id=row["season_id"],
            gameweek=row["gameweek"],
            code=row["code"],
            team_h=FixtureTeam(
                id=row["team_h"], name=row["team_h_name"], short_name=row["team_h_short"]
            ),
            team_a=FixtureTeam(
                id=row["team_a"], name=row["team_a_name"], short_name=row["team_a_short"]
            ),
            team_h_score=row["team_h_score"],
            team_a_score=row["team_a_score"],
            team_h_difficulty=row["team_h_difficulty"],
            team_a_difficulty=row["team_a_difficulty"],
            kickoff_time=row["kickoff_time"].isoformat() if row["kickoff_time"] else None,
            started=row["started"],
            finished=row["finished"],
            finished_provisional=row["finished_provisional"],
            minutes=row["minutes"],
        )

        # Handle stats - asyncpg may return as string or parsed JSONB
        stats = row["stats"]
        if isinstance(stats, str):
            try:
                stats = json.loads(stats)
            except json.JSONDecodeError:
                logger.warning(f"Malformed stats JSON for fixture {fixture_id}")
                stats = None

        return FixtureDetailResponse(fixture=fixture, stats=stats)
