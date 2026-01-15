# Fixture Difficulty Index (FDI) - Architectural Review

**Date**: January 15, 2026
**Reviewer**: Backend Architecture Specialist
**Plan Location**: `docs/planning/fixture-difficulty-plan.md`

---

## Executive Summary

The FDI plan is well-structured with good separation of concerns and realistic data sourcing. However, there are **critical architectural issues** that need addressing before implementation:

1. **Database schema normalization gaps** - team name mappings lack referential integrity
2. **Missing recency weighting in historical calculations** - formula mentions it but implementation doesn't
3. **API-Football sync has no failure recovery** - rate limiting could cause partial data gaps
4. **Service layer abstractions incomplete** - fixture calculation needs refactoring for testability
5. **No caching strategy** for expensive aggregations

---

## Part 1: Database Schema Analysis

### 1.1 Strong Points

**Migration 014 (Historical Data)**:
- Clean separation of `historical_team_mapping` for name resolution
- Good index coverage on H2H queries (`idx_hm_h2h`, `idx_hm_h2h_reverse`)
- SQL views and functions provide efficient aggregations
- `get_h2h_record()` and `team_historical_record` views are well-designed

**Migration 015 (Multi-Competition Fixtures)**:
- UNIQUE constraint on `(team_short_name, kickoff_time, competition_code)` prevents duplicates
- Proper indexes for `(team_short_name, kickoff_time DESC)` - optimized for "last match" queries
- API-Football deduplication via `api_football_fixture_id` is solid

### 1.2 Critical Issues

#### Issue 1: Missing Foreign Key Relationships

**Problem**: Historical data lacks foreign key constraints to existing tables.

```sql
-- Migration 014 MISSING:
ALTER TABLE historical_match
    ADD CONSTRAINT fk_historical_match_home_team
    FOREIGN KEY (home_team, season_code)
    REFERENCES team(short_name, season_id);
```

**Impact**:
- Query planner can't optimize joins properly
- Data corruption risk if teams are deleted
- Cannot cascade deletes for data cleanup

**Recommendation**:
- Add FK constraints to `team` table (join on `short_name + season_id`)
- Make sure `team` table has composite index `(short_name, season_id)`
- Handle relegated teams gracefully (NULL `season_id` for teams not in current season)

#### Issue 2: Missing Historical Season Mapping

**Problem**: The plan uses text `season_code` (e.g., "2526") but existing codebase uses numeric `season_id`.

Current DB schema (from migration 001):
```sql
-- Existing pattern
season(id INT, code TEXT)
team(id INT, season_id INT, short_name TEXT)  -- Composite FK
```

Plan's historical schema:
```sql
-- Proposed pattern
historical_match(season_code TEXT)  -- "2526" as text
team_fixture_schedule(season_code TEXT)  -- "2526" as text
```

**Impact**:
- Impedance mismatch when joining with existing tables
- Every query needs string manipulation (`season_code → season_id`)
- Two sources of truth for season identifier

**Recommendation**:
```sql
-- Migration 014: Add season_id foreign key
ALTER TABLE historical_match
    ADD COLUMN season_id INTEGER REFERENCES season(id),
    ADD CONSTRAINT chk_season_consistency
        CHECK (season_code = (SELECT code FROM season WHERE id = season_id));

-- Migration 015: Add season_id to fixtures
ALTER TABLE team_fixture_schedule
    ADD COLUMN season_id INTEGER REFERENCES season(id);

-- Keep season_code as denormalized for fast lookups (no FK)
-- Bi-directional sync: season_code ↔ season_id
```

#### Issue 3: Team Mapping Incomplete for Promoted/Relegated Teams

**Problem**: The `historical_team_mapping` is one-directional and doesn't track team status.

```python
# What if a team was promoted, then relegated?
# E.g., Norwich: in PL (2019/20), out (2020-2021 to 2023/24), back in (2024/25)
# Plan assumes: historical_name → fpl_short_name
# Reality: same team had NO FPL ID during relegation period
```

**Recommendation**:
```sql
-- Enhanced mapping table
CREATE TABLE team_mapping (
    id SERIAL PRIMARY KEY,
    historical_name TEXT NOT NULL,           -- "Norwich"
    fpl_short_name TEXT,                     -- "NOR" (NULL if never in PL)
    season_code TEXT,                        -- e.g., "2425" (when mapping applies)
    status TEXT NOT NULL,                    -- 'active', 'relegated', 'promoted'
    notes TEXT,
    UNIQUE (historical_name, season_code)    -- One mapping per season per team
);

-- Query: "What was Norwich called in 1999/2000?"
SELECT fpl_short_name FROM team_mapping
WHERE historical_name = 'Norwich' AND season_code = '9900';
```

---

## Part 2: API Design Issues

### 2.1 Missing Endpoint Specifications

The plan lists endpoints but with incomplete specifications:

```python
# Missing details:
# 1. Response schema definition
# 2. Error handling cases
# 3. Rate limiting / caching headers
# 4. Input validation bounds
# 5. Seasonal context handling
```

**Recommendation**:

```python
# Enhanced endpoint definitions

from pydantic import BaseModel, Field

class FixtureDifficultyFactors(BaseModel):
    """Individual factors (0-1 scale)."""
    current_xgc_rank: float = Field(..., ge=0, le=1)
    current_xgi_rank: float = Field(..., ge=0, le=1)
    points_against_rank: float = Field(..., ge=0, le=1)
    current_form_rank: float = Field(..., ge=0, le=1)
    rest_days_factor: float = Field(..., ge=0, le=1)
    historical_h2h_factor: float = Field(..., ge=0, le=1)
    historical_venue_factor: float = Field(..., ge=0, le=1)
    fpl_difficulty: float = Field(..., ge=0, le=1)

    class Config:
        json_schema_extra = {
            "example": {
                "current_xgc_rank": 0.75,
                "current_xgi_rank": 0.45,
                "points_against_rank": 0.80,
                "current_form_rank": 0.60,
                "rest_days_factor": 0.85,
                "historical_h2h_factor": 0.65,
                "historical_venue_factor": 0.70,
                "fpl_difficulty": 0.50
            }
        }

class FixtureDifficultyResponse(BaseModel):
    """Response model for fixture difficulty."""
    fixture_id: int
    team_id: int
    team_short_name: str
    opponent_id: int
    opponent_short_name: str
    gameweek: int
    is_home: bool
    kickoff_time: datetime

    # Final score (0-100, higher = easier)
    fdi_score: float = Field(..., ge=0, le=100)

    # Star rating (1-5, higher = easier)
    stars: int = Field(..., ge=1, le=5)

    # Component factors for transparency
    factors: FixtureDifficultyFactors

    # Confidence based on available data
    confidence: Literal["high", "medium", "low"]

    # Comparison with FPL FDR
    fpl_fdr: int = Field(..., ge=1, le=5, description="Official FPL fixture difficulty")

# ============================================================================
# ENDPOINT: Get upcoming fixture difficulties
# ============================================================================

@router.get("/api/v1/fixture-difficulty")
async def get_upcoming_fixture_difficulties(
    team_short_name: str = Query(..., regex="^[A-Z]{3}$"),
    season_id: int = Query(default=1, description="Season ID"),
    num_fixtures: int = Query(default=5, ge=1, le=20),
    include_confidence_details: bool = Query(default=False),
) -> dict:
    """
    Get fixture difficulty for upcoming N fixtures for a team.

    Response includes:
    - FDI score (0-100) and star rating
    - Component factors for transparency
    - Confidence level based on available data
    - FPL FDR for comparison

    Args:
        team_short_name: FPL team short name (e.g., "ARS", "MUN")
        season_id: Season ID (default: 1 for current)
        num_fixtures: Number of upcoming fixtures (1-20)
        include_confidence_details: Include why confidence is high/medium/low

    Returns:
        {
            "team_short_name": "ARS",
            "season_id": 1,
            "fixtures": [FixtureDifficultyResponse, ...],
            "average_difficulty": 45.2,
            "difficulty_trend": "improving"  # or "stable" / "worsening"
        }

    Errors:
        404: Team not found in current season
        422: Invalid season_id or team_short_name

    Cache: 5 minutes (fixtures change frequently due to TV scheduling)
    """
    pass

# ============================================================================
# ENDPOINT: Head-to-head record
# ============================================================================

@router.get("/api/v1/fixture-difficulty/h2h/{team_a}/{team_b}")
async def get_h2h_record(
    team_a: str = Path(..., regex="^[A-Z]{3}$"),
    team_b: str = Path(..., regex="^[A-Z]{3}$"),
    last_n: int = Query(default=10, ge=1, le=50),
) -> dict:
    """
    Get head-to-head record between two teams (all time, last N meetings).

    Returns:
        {
            "team_a": "ARS",
            "team_b": "MUN",
            "total_meetings": 47,
            "team_a_wins": 15,
            "team_b_wins": 18,
            "draws": 14,
            "team_a_goals_for": 52,
            "team_b_goals_for": 61,
            "team_a_win_pct": 31.9,
            "team_b_win_pct": 38.3,
            "last_meeting": "2025-01-12",
            "last_result": "D",  # 'H' (team_a won), 'A' (team_b won), 'D' (draw)
            "venue_breakdown": {
                "at_team_a_home": {
                    "matches": 24,
                    "team_a_wins": 10,
                    "team_a_win_pct": 41.7
                },
                "at_team_b_home": {
                    "matches": 23,
                    "team_a_wins": 5,
                    "team_a_win_pct": 21.7
                }
            }
        }

    Cache: 1 day (historical data doesn't change)
    """
    pass
```

### 2.2 Seasonal Context Handling

**Problem**: Endpoints don't specify how to handle season transitions.

**Recommendation**:
```python
# Handle season context consistently
async def get_fixture_difficulty(
    team_short_name: str,
    opponent_short_name: str,
    is_home: bool,
    season_id: int | None = None,  # NULL = current season
    gameweek: int | None = None,   # For context/validation
) -> FixtureDifficultyResponse:
    """
    season_id=None should resolve to current season from season table.
    Validate that team_short_name exists in requested season.
    """
    if season_id is None:
        async with get_connection() as conn:
            season_id = await conn.fetchval(
                "SELECT id FROM season WHERE is_current = true"
            )
```

---

## Part 3: Implementation Issues

### 3.1 API-Football Rate Limiting Disaster Scenario

**Problem**: Script runs daily at 04:00 UTC with 100 req/day limit. If one sync fails:

```
Day 1: Sync teams [1-10] successfully (10 requests)
       Sync teams [11-16] + network timeout = partial failure

Day 2: Start over from team [1]
       Duplicates from yesterday persist (UNIQUE constraint prevents)
       But teams [11-16] never complete = missing fixtures for 2+ days

Result: Incomplete rest day calculations for 6 teams
```

**Recommendation**:

```python
# scripts/sync_fixture_schedule.py - Add robustness

class SyncStatus:
    """Track sync progress per team."""
    team: str
    status: Literal["pending", "syncing", "completed", "failed"]
    fixtures_synced: int
    last_sync_at: datetime
    error_message: str | None

async def sync_fixture_schedule(resume_from_last_failed: bool = True):
    """
    Sync with resume capability and atomic commits.
    """
    async with get_connection() as conn:
        # Check for incomplete syncs from previous run
        if resume_from_last_failed:
            incomplete = await conn.fetchval("""
                SELECT MIN(team_short_name)
                FROM sync_status
                WHERE status IN ('pending', 'failed')
                ORDER BY updated_at ASC
                LIMIT 1
            """)
            start_from = incomplete or 'ARS'

        # Atomic transaction per team
        async for team_id, team_short_name in iter_teams(start_from):
            try:
                fixtures = await fetch_team_fixtures(team_id)
                await conn.execute("BEGIN")
                for fixture in fixtures:
                    await upsert_fixture(conn, fixture)
                await conn.execute("COMMIT")
                await update_sync_status(conn, team_short_name, "completed")
            except Exception as e:
                await conn.execute("ROLLBACK")
                await update_sync_status(conn, team_short_name, "failed", str(e))
                logger.error(f"Failed to sync {team_short_name}: {e}")
                # Continue to next team instead of failing entire job
                continue

# New migration 016: Sync status tracking
CREATE TABLE fixture_schedule_sync_status (
    team_short_name TEXT PRIMARY KEY,
    status TEXT NOT NULL,  -- 'pending', 'syncing', 'completed', 'failed'
    fixtures_synced INTEGER DEFAULT 0,
    error_message TEXT,
    last_sync_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.2 Missing Recency Weighting in Historical Factors

**Problem**: Plan specifies recency formula but implementation doesn't apply it:

```python
# Plan (page 1207):
recency_weight(season_age) = 0.8^season_age

# Implementation (line 1094-1099): Missing!
factors.historical_h2h_factor * weights["historical_h2h"]  # Not weighted by season age
factors.historical_venue_factor * weights["historical_venue"]
```

**Recommendation**:

```python
async def get_h2h_factor_with_recency(
    conn,
    team_a: str,
    team_b: str,
    current_season_code: str,
) -> float:
    """
    Calculate H2H win % with recency weighting.
    Recent seasons weighted more heavily (exponential decay).
    """
    h2h_matches = await conn.fetch("""
        SELECT
            season_code,
            CASE
                WHEN (home_team = $1 AND result = 'H') OR (away_team = $1 AND result = 'A')
                    THEN 1 ELSE 0
            END AS team_a_wins
        FROM historical_match
        WHERE (home_team = $1 AND away_team = $2)
           OR (home_team = $2 AND away_team = $1)
        ORDER BY season_code DESC
    """, team_a, team_b)

    if not h2h_matches:
        return 0.5  # No H2H data: neutral factor

    # Apply recency weighting
    current_season_year = int(current_season_code[:2])
    total_weighted_wins = 0
    total_weight = 0

    for match in h2h_matches:
        season_year = int(match['season_code'][:2])
        season_age = current_season_year - season_year

        # Exponential decay: 0.8^age
        # Current season: 0.8^0 = 1.0
        # 1 year ago: 0.8^1 = 0.8
        # 2 years ago: 0.8^2 = 0.64
        weight = 0.8 ** season_age

        total_weighted_wins += match['team_a_wins'] * weight
        total_weight += weight

    return total_weighted_wins / total_weight if total_weight > 0 else 0.5
```

### 3.3 Service Layer Testability Issues

**Problem**: `fixture_difficulty.py` mixes I/O with calculation logic:

```python
async def calculate_fixture_difficulty(conn, team, opponent, ...):
    # I/O: Database queries
    current_factors = await get_current_season_factors(conn, ...)
    opponent_rest_days = await get_rest_days(conn, ...)

    # Calculation: Pure function
    fdi_score = (factors.xgc * 0.15 + ...)

    return FixtureDifficultyResult(...)
```

**Impact**:
- Can't test calculation logic without database
- Can't test with mock data
- Hard to tune weights iteratively

**Recommendation**:

```python
# Split into pure and impure functions

# Pure calculation function (testable without DB)
def calculate_fdi_score(
    factors: FixtureDifficultyFactors,
    weights: dict[str, float] | None = None
) -> tuple[float, int, str]:
    """
    Pure function: calculate FDI score from factors.
    No I/O, fully testable.

    Returns: (fdi_score, stars, confidence)
    """
    weights = weights or DEFAULT_WEIGHTS

    fdi_score = (
        factors.current_xgc_rank * weights["current_xgc"] +
        (1 - factors.current_xgi_rank) * weights["current_xgi"] +
        factors.points_against_rank * weights["points_against"] +
        (1 - factors.current_form_rank) * weights["current_form"] +
        factors.rest_days_factor * weights["rest_days"] +
        factors.historical_h2h_factor * weights["historical_h2h"] +
        factors.historical_venue_factor * weights["historical_venue"]
    ) * 100

    stars = _score_to_stars(fdi_score)
    confidence = _determine_confidence(factors)

    return fdi_score, stars, confidence

# Impure service function (I/O only)
class FixtureDifficultyService:
    async def get_fixture_difficulty(
        self,
        team_short_name: str,
        opponent_short_name: str,
        is_home: bool,
        season_id: int,
    ) -> FixtureDifficultyResult:
        """Fetch factors from DB, delegate calculation to pure function."""
        async with get_connection() as conn:
            # Fetch all factors
            factors = FixtureDifficultyFactors(
                current_xgc_rank=await get_current_xgc_rank(conn, ...),
                current_xgi_rank=await get_current_xgi_rank(conn, ...),
                points_against_rank=await get_pa_rank(conn, ...),
                current_form_rank=await get_form_rank(conn, ...),
                rest_days_factor=await get_rest_days_factor(conn, ...),
                historical_h2h_factor=await get_h2h_factor(conn, ...),
                historical_venue_factor=await get_venue_factor(conn, ...),
                fpl_difficulty=await get_fpl_difficulty(conn, ...),
            )

        # Pure calculation
        fdi_score, stars, confidence = calculate_fdi_score(factors)

        return FixtureDifficultyResult(
            team_id=...,
            opponent_id=...,
            is_home=is_home,
            gameweek=...,
            fdi_score=fdi_score,
            stars=stars,
            factors=factors,
            confidence=confidence,
        )
```

---

## Part 4: Caching Strategy

### 4.1 Missing Cache Layers

**Problem**: No caching defined for expensive aggregations.

Expensive queries:
- H2H historical record (reads 100+ years of data, complex group by)
- Team historical record (5-season view, multiple aggregations)
- Rest days calculation (multi-competition fixture scan)

**Recommendation**:

```python
# Cache tiers (like existing codebase)

FIXTURE_DIFFICULTY_CACHE_TTL_SECONDS = 600  # 10 minutes (fixtures change via TV)
H2H_CACHE_TTL_SECONDS = 86400  # 1 day (historical data immutable)
HISTORICAL_SEASON_CACHE_TTL_SECONDS = 86400  # 1 day

# Use existing pattern from routes.py
_fixture_difficulty_cache: TTLCache[str, Any] = TTLCache(
    maxsize=100, ttl=FIXTURE_DIFFICULTY_CACHE_TTL_SECONDS
)

# Implement cache keys consistently
def _cache_key_fixture_difficulty(team_short_name: str, num_fixtures: int) -> str:
    return f"fd:{team_short_name}:{num_fixtures}"

def _cache_key_h2h(team_a: str, team_b: str) -> str:
    return f"h2h:{min(team_a, team_b)}:{max(team_a, team_b)}"  # Normalize order
```

---

## Part 5: Error Handling Gaps

### 5.1 Missing Error Cases

**Problem**: No defined behavior for edge cases.

```python
# What happens if...

# 1. Team has never played opponent before
# Expected: Return neutral factor (0.5) + low confidence
# Actual: Undefined

# 2. Team was promoted this season (no historical data)
# Expected: Rely on current season + xG metrics, low confidence
# Actual: Undefined

# 3. Fixture schedule sync failed 3 days ago
# Expected: Rest days calculation degraded, medium confidence
# Actual: Undefined

# 4. Team has <5 matches in current season (early gameweeks)
# Expected: Current metrics unreliable, weight historical more
# Actual: Undefined
```

**Recommendation**:

```python
@dataclass
class ConfidenceDetails:
    """Why confidence is high/medium/low."""
    has_h2h_data: bool
    h2h_sample_size: int
    has_current_season_data: bool
    current_season_matches: int
    has_rest_days_data: bool
    rest_days_data_age: int  # Days since last sync
    team_promoted_this_season: bool
    opponent_promoted_this_season: bool

    def calculate_confidence_level(self) -> Literal["high", "medium", "low"]:
        """Deterministic confidence based on available data."""
        if not self.has_current_season_data:
            return "low"  # No current season data

        if self.team_promoted_this_season or self.opponent_promoted_this_season:
            return "medium"  # Promoted team = less reliable

        if self.has_h2h_data and self.h2h_sample_size >= 5:
            return "high"  # Good H2H history

        if self.current_season_matches >= 10:
            return "medium"  # Enough current season data to be reliable

        return "low"  # Early season, limited data

# Service layer
async def get_fixture_difficulty_with_diagnostics(
    conn,
    team_short_name: str,
    opponent_short_name: str,
    is_home: bool,
    season_id: int,
) -> tuple[FixtureDifficultyResult, ConfidenceDetails]:
    """
    Return both result and diagnostics for debugging/transparency.
    """
    # Build diagnostics
    diagnostics = ConfidenceDetails(
        has_h2h_data=bool(h2h_records),
        h2h_sample_size=len(h2h_records),
        has_current_season_data=bool(current_season_stats),
        current_season_matches=current_season_stats.matches,
        has_rest_days_data=(fixture_schedule_sync_age < 1),
        rest_days_data_age=fixture_schedule_sync_age,
        team_promoted_this_season=(current_season_idx < 3),  # Check if in PL < 3 seasons
        opponent_promoted_this_season=(opponent_season_idx < 3),
    )

    result = FixtureDifficultyResult(
        ...,
        confidence=diagnostics.calculate_confidence_level(),
    )

    return result, diagnostics
```

---

## Part 6: Scalability Concerns

### 6.1 Index Coverage Analysis

**Current indexes (from plan)**:

```sql
CREATE INDEX idx_hm_h2h ON historical_match(home_team, away_team);
CREATE INDEX idx_hm_h2h_reverse ON historical_match(away_team, home_team);
CREATE INDEX idx_hm_home_season ON historical_match(home_team, season_code);
CREATE INDEX idx_hm_away_season ON historical_match(away_team, season_code);
CREATE INDEX idx_hm_date ON historical_match(match_date DESC);
```

**Missing**: Composite indexes for common query patterns

**Recommendation**:

```sql
-- Add composite indexes for common queries

-- Query: "Get H2H record between two specific teams, last N seasons"
CREATE INDEX idx_hm_h2h_with_season
    ON historical_match(home_team, away_team, season_code DESC);

CREATE INDEX idx_hm_h2h_reverse_with_season
    ON historical_match(away_team, home_team, season_code DESC);

-- Query: "Get team's home/away record in recent seasons"
CREATE INDEX idx_hm_home_season_date
    ON historical_match(home_team, season_code, match_date DESC);

CREATE INDEX idx_hm_away_season_date
    ON historical_match(away_team, season_code, match_date DESC);

-- Query: "Get all fixtures in date range (for recency weighting)"
CREATE INDEX idx_hm_date_home_team
    ON historical_match(match_date DESC, home_team);

-- Fixture schedule indexes
CREATE INDEX idx_tfs_team_status_kickoff
    ON team_fixture_schedule(team_short_name, status, kickoff_time DESC)
    WHERE status IN ('scheduled', 'finished');  -- Partial index for active fixtures

CREATE INDEX idx_tfs_competition_season_kickoff
    ON team_fixture_schedule(competition_code, season_code, kickoff_time);
```

**Data growth estimate**:
- Historical: ~12,000 rows (30 seasons × 380 matches/season ÷ 2)
- Fixtures per season: ~1,500 rows (20 teams × 6 competitions × ~12 matches/team)
- **Total**: <20k rows (minimal growth, well within Supabase)

---

## Part 7: Integration with Existing Codebase

### 7.1 Pattern Alignment

**Good alignment**:
- Service layer pattern (like `PointsAgainstService`)
- Dataclass schemas (like `TeamPointsAgainst`)
- Database pool usage (async/await with `get_connection()`)
- View-based aggregations (like `points_against_season_totals`)

**Areas to improve**:
1. **Naming conventions**: Use `service.py` suffix (not `fixture_difficulty.py`)
2. **Error handling**: Follow existing error patterns (no `Exception` catches)
3. **Type hints**: Add return type annotations consistently
4. **Testing**: Align with existing test patterns

### 7.2 Dependency on Existing Features

```
FDI Service dependencies:
├── season table (existing)
├── team table (existing)
├── points_against_by_fixture (existing - Migration 004)
├── player_fixture_stats (existing - Migration 006) → xG data
└── NEW: historical_match, team_fixture_schedule

Current endpoints depend on:
├── /api/v1/points-against (existing)
└── /api/v1/recommendations (existing)

FDI adds:
├── /api/v1/fixture-difficulty (new)
└── /api/v1/fixture-difficulty/h2h (new)
```

---

## Part 8: Implementation Checklist

### Phase 1: Database (Weeks 1-2)

- [ ] Create Migration 014
  - [ ] Create `historical_team_mapping` with FK to `season`
  - [ ] Create `historical_match` with FK constraints
  - [ ] Create views: `head_to_head_record`, `team_historical_record`
  - [ ] Create functions: `get_h2h_record()`, `get_team_recent_record()`
  - [ ] Create all indexes (including composite)
  - [ ] Add RLS policies (public read)

- [ ] Create Migration 015
  - [ ] Create `team_fixture_schedule`
  - [ ] Add `api_football_team_id` to `historical_team_mapping`
  - [ ] Create `fixture_schedule_sync_status` (for resume capability)
  - [ ] Add all indexes (including partial)

- [ ] Create Migration 016
  - [ ] Add `season_id` columns to historical tables
  - [ ] Add FK constraints to `season` table
  - [ ] Test backward compatibility with `season_code`

**QA**: Verify all migrations work with existing data

### Phase 2: Data Import (Weeks 2-3)

- [ ] Implement `scripts/import_historical_data.py`
  - [ ] football-data.co.uk CSV parser
  - [ ] Team name mapping resolution
  - [ ] Batch insert with progress tracking
  - [ ] Error recovery (resume from failures)
  - [ ] Test with last 10 seasons first

- [ ] Implement `scripts/sync_fixture_schedule.py`
  - [ ] API-Football authentication
  - [ ] Multi-team sync with rate limiting
  - [ ] Resume capability from `sync_status` table
  - [ ] Atomic commits per team
  - [ ] Test with 1 team first, scale to all 20

- [ ] Scheduled job integration
  - [ ] Add to `scheduled_update.py` at 04:00 UTC
  - [ ] Error notifications (Sentry/logs)
  - [ ] Dry-run option for testing

**QA**: Verify data imports complete, test joins with existing tables

### Phase 3: Service Layer (Week 3)

- [ ] Implement `fixture_difficulty_service.py`
  - [ ] Pure calculation function with weights
  - [ ] Factor retrieval functions (xGC, xGI, PA, form, H2H, venue, rest days)
  - [ ] Recency weighting for historical data
  - [ ] Confidence scoring with diagnostics
  - [ ] Full type hints and docstrings

- [ ] Implement caching layer
  - [ ] Cache keys for all queries
  - [ ] TTL configuration (600s for fixtures, 86400s for historical)
  - [ ] Cache invalidation logic (seasonal)

- [ ] Error handling
  - [ ] Promoted team logic
  - [ ] Missing H2H data fallback
  - [ ] Sync failure graceful degradation

**QA**: Unit tests for pure calculation function, integration tests with mock data

### Phase 4: API Endpoints (Week 4)

- [ ] Create new endpoints in `routes.py`
  - [ ] `GET /api/v1/fixture-difficulty` (team upcoming fixtures)
  - [ ] `GET /api/v1/fixture-difficulty/h2h/{team_a}/{team_b}` (H2H record)
  - [ ] `GET /api/v1/fixture-difficulty/team/{short_name}/historical` (team record)
  - [ ] Proper response schemas with Pydantic
  - [ ] Input validation (regex, bounds)
  - [ ] Cache headers (Cache-Control)

- [ ] Error handling
  - [ ] 404 for missing teams
  - [ ] 422 for invalid season
  - [ ] 503 for sync failures

- [ ] Documentation
  - [ ] OpenAPI schemas
  - [ ] Error code documentation
  - [ ] Example requests/responses

**QA**: Endpoint integration tests, load testing on large fixture lists

### Phase 5: Validation & Tuning (Week 5)

- [ ] Backtest FDI vs actual results
  - [ ] Compare FDI scores to match outcomes (last 3 seasons)
  - [ ] Compare FDI to official FPL FDR accuracy
  - [ ] Identify weight optimizations

- [ ] Performance validation
  - [ ] Query performance monitoring (slow queries)
  - [ ] Cache hit rates
  - [ ] Database index usage analysis

- [ ] Data quality
  - [ ] Verify team mappings complete for all seasons
  - [ ] Check for missing fixtures (API-Football sync coverage)
  - [ ] Validate H2H calculations against manual samples

**QA**: End-to-end scenario testing, production dry-run

---

## Part 9: Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|-----------|
| API-Football rate limit exhaustion | HIGH | Resume capability, smaller batches, fallback to cached data |
| Team name mapping gaps (relegated teams) | HIGH | Season-aware mapping table, promoted team fallback logic |
| Historical data import quality | MEDIUM | Data validation script, sample verification, DQA reports |
| Missing FK constraints | MEDIUM | Add constraints incrementally, test with existing data first |
| Recency weighting formula wrong | MEDIUM | Backtest against actual results, tune weights iteratively |
| Season_code ↔ season_id impedance mismatch | MEDIUM | Dual-write both, consistent throughout codebase |
| Promoted teams (no PL history) | LOW | Use league average as baseline, mark low confidence |
| Missing indexes on new tables | LOW | Index all foreign keys, test query plans |

---

## Part 10: Recommendations Summary

### Critical (Block Implementation)
1. **Add FK constraints to season table** - prevents data corruption
2. **Add season_id handling** - eliminate text-based season codes
3. **Add resume capability to API-Football sync** - prevent data gaps
4. **Split calculation logic** - pure vs impure functions for testability

### Important (Do Before Phase 1)
5. **Add team_mapping table** - handle promoted/relegated teams
6. **Define error handling** - promoted teams, missing data, sync failures
7. **Complete API specifications** - add response schemas, caching headers
8. **Optimize database indexes** - composite indexes for common patterns

### Nice to Have
9. **Add recency weighting** - exponential decay formula in code
10. **Implement caching layer** - follow existing pattern from routes.py
11. **Add diagnostic confidence details** - transparency on why confidence level is set

---

## Conclusion

The FDI plan is architecturally sound and well-researched. Implementation is straightforward with proper data sourcing and clear calculation logic. However, several structural issues must be addressed before coding:

1. **Database layer**: Add FK constraints, season_id handling, team mappings for relegated teams
2. **Sync robustness**: Resume capability for API-Football sync
3. **Service design**: Split pure calculation from I/O for testability
4. **API contracts**: Complete endpoint specifications with error cases

With these changes, the feature will be production-ready, maintainable, and aligned with existing codebase patterns.

**Estimated Timeline**: 4-5 weeks (1 week DB + 1 week import + 1 week service + 1 week API + 1 week validation)

**Storage Impact**: <10MB additional (well within Supabase free tier)

**Performance Impact**: Minimal (small tables, good index coverage)

