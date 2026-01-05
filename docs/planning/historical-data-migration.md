# Historical Data Migration Plan

**Date**: January 5, 2026
**Status**: Planning
**Last Updated**: January 5, 2026 (reviewed against existing conventions)
**Goal**: Move historical FPL data queries from frontend to backend

## Executive Summary

The frontend currently makes **~440 API calls** to the FPL API per league page load (for a 20-manager league with 19 completed gameweeks). This creates:
- Slow initial load times
- Redundant data fetching
- Complex client-side calculations
- No caching of immutable historical data

**Solution**: Migrate historical data storage and computation to the backend, exposing aggregated endpoints that the frontend can consume with minimal round trips.

---

## Current Frontend Queries to Migrate

### High Priority (Most API Calls)

| Hook | File | API Calls | What It Does |
|------|------|-----------|--------------|
| `useHistoricalData` | `services/queries/useHistoricalData.ts` | 19 + (20×19) = 399 | Fetches live data + picks for all completed GWs |
| `useBenchPoints` | `services/queries/useBenchPoints.ts` | Uses above | Calculates cumulative bench points |
| `useCaptainDifferential` | `services/queries/useCaptainSuccess.ts` | Uses above | Captain vs template analysis |

### Medium Priority

| Hook | File | API Calls | What It Does |
|------|------|-----------|--------------|
| `useLeaguePositionHistory` | `services/queries/useLeaguePositionHistory.ts` | 20 | Entry history per manager for bump chart |
| `useFreeTransfers` | `services/queries/useFreeTransfers.ts` | 20 | Calculate remaining FTs |
| `useHeadToHeadComparison` | `services/queries/useHeadToHeadComparison.ts` | 2-4 | Manager comparison stats |

### Keep in Frontend (Current GW Only)

| Hook | Reason |
|------|--------|
| `useFplData` | Current GW standings, live data |
| `useLiveScoring` | Real-time polling during matches |
| `usePlayerDetails` | On-demand player lookup |
| `useRecommendedPlayers` | Uses bootstrap + current fixtures |

---

## Existing Infrastructure to Leverage

### Current Database Tables

| Table | Status | Notes |
|-------|--------|-------|
| `points_against` | Exists | Team defensive stats |
| `fixtures` | Exists | **Extend, don't recreate** |
| `gameweek_status` | Exists | Processing state tracking |

### Existing Conventions (MUST FOLLOW)

```sql
-- Season ID format (from existing migrations)
season_id VARCHAR(10) NOT NULL  -- e.g., '2024-25'

-- Timestamp columns
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

-- RLS pattern (ALL tables must have)
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON <table_name> FOR SELECT USING (true);

-- Ownership
ALTER TABLE <table_name> OWNER TO postgres;

-- Freshness tracking
last_synced_at TIMESTAMPTZ
```

### Scheduled Updates Infrastructure

Leverage existing `fly machines` cron pattern from `scheduled-updates.md`:
```
fly machines run --schedule="0 */6 * * *"
```

---

## Database Schema Changes

### Phase 1: Foundation Tables

#### 1.1 `seasons` (New - Reference Table)
```sql
CREATE TABLE IF NOT EXISTS seasons (
    id VARCHAR(10) PRIMARY KEY,  -- '2024-25'
    name VARCHAR(50) NOT NULL,   -- '2024/25 Season'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE seasons OWNER TO postgres;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON seasons FOR SELECT USING (true);
```

#### 1.2 `teams` (New)
Static team reference data (20 teams per season).

```sql
CREATE TABLE IF NOT EXISTS teams (
    id INTEGER NOT NULL,              -- FPL team ID (1-20)
    season_id VARCHAR(10) NOT NULL,

    name VARCHAR(50) NOT NULL,        -- "Arsenal"
    short_name VARCHAR(3) NOT NULL,   -- "ARS"
    code INTEGER NOT NULL,            -- Team code for shirts

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, season_id),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
);

CREATE INDEX idx_teams_season ON teams(season_id);
ALTER TABLE teams OWNER TO postgres;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON teams FOR SELECT USING (true);
```

**Data source**: `/api/bootstrap-static/` → `teams` array

#### 1.3 `gameweeks` (New)
Gameweek metadata and deadlines.

```sql
CREATE TABLE IF NOT EXISTS gameweeks (
    id INTEGER NOT NULL,              -- GW number (1-38)
    season_id VARCHAR(10) NOT NULL,

    name VARCHAR(20) NOT NULL,        -- "Gameweek 1"
    deadline_time TIMESTAMPTZ NOT NULL,
    finished BOOLEAN DEFAULT FALSE,
    is_current BOOLEAN DEFAULT FALSE,
    is_next BOOLEAN DEFAULT FALSE,

    -- Template captain for differential analysis
    most_captained INTEGER,           -- FPL player ID
    most_vice_captained INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (id, season_id),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
);

CREATE INDEX idx_gameweeks_season ON gameweeks(season_id);
CREATE INDEX idx_gameweeks_current ON gameweeks(season_id, is_current) WHERE is_current = TRUE;
ALTER TABLE gameweeks OWNER TO postgres;
ALTER TABLE gameweeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON gameweeks FOR SELECT USING (true);
```

**Data source**: `/api/bootstrap-static/` → `events` array

#### 1.4 Extend `fixtures` (MODIFY EXISTING)
**Important**: Do NOT create new table - extend existing.

```sql
-- Add missing columns to existing fixtures table
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS pulse_id INTEGER;
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS stats JSONB;  -- BPS, goals, assists data
```

### Phase 2: Player Tables

#### 2.1 `players` (New)
Player reference data (refreshed from bootstrap).

```sql
CREATE TABLE IF NOT EXISTS players (
    id INTEGER NOT NULL,              -- FPL element ID
    season_id VARCHAR(10) NOT NULL,

    -- Identity
    web_name VARCHAR(50) NOT NULL,    -- Display name ("Salah")
    first_name VARCHAR(50),
    second_name VARCHAR(50),

    -- Classification
    team_id INTEGER NOT NULL,         -- FPL team ID (1-20)
    element_type INTEGER NOT NULL,    -- 1=GK, 2=DEF, 3=MID, 4=FWD

    -- Status
    status VARCHAR(1),                -- 'a'=available, 'i'=injured, etc.
    news TEXT,
    news_added TIMESTAMPTZ,
    chance_of_playing_this_round INTEGER,
    chance_of_playing_next_round INTEGER,

    -- Value (stored as INTEGER, /10 for £m)
    now_cost INTEGER NOT NULL,
    cost_change_start INTEGER DEFAULT 0,

    -- Season totals (denormalized for quick queries)
    total_points INTEGER DEFAULT 0,
    minutes INTEGER DEFAULT 0,
    goals_scored INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    clean_sheets INTEGER DEFAULT 0,

    -- Ownership
    selected_by_percent DECIMAL(5,2),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_synced_at TIMESTAMPTZ,

    PRIMARY KEY (id, season_id),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
);

CREATE INDEX idx_players_season_team ON players(season_id, team_id);
CREATE INDEX idx_players_season_type ON players(season_id, element_type);
ALTER TABLE players OWNER TO postgres;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON players FOR SELECT USING (true);
```

**Data source**: `/api/bootstrap-static/` → `elements` array

#### 2.2 `player_gameweek_stats` (New)
Per-player per-gameweek performance data.

```sql
CREATE TABLE IF NOT EXISTS player_gameweek_stats (
    player_id INTEGER NOT NULL,
    season_id VARCHAR(10) NOT NULL,
    gameweek INTEGER NOT NULL,

    -- Fixture context
    fixture_id INTEGER,               -- Links to fixtures table
    opponent_team INTEGER,            -- FPL team ID
    was_home BOOLEAN,

    -- Basic stats
    minutes INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,

    -- Attacking
    goals_scored INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,

    -- Defensive
    clean_sheets INTEGER DEFAULT 0,
    goals_conceded INTEGER DEFAULT 0,
    own_goals INTEGER DEFAULT 0,

    -- Bonus
    bonus INTEGER DEFAULT 0,
    bps INTEGER DEFAULT 0,

    -- Expected stats (IMPORTANT: missing from original plan)
    expected_goals DECIMAL(5,2),
    expected_assists DECIMAL(5,2),
    expected_goal_involvements DECIMAL(5,2),
    expected_goals_conceded DECIMAL(5,2),

    -- Value at time of GW
    value INTEGER,                    -- Player price that GW

    -- Saves/penalties
    saves INTEGER DEFAULT 0,
    penalties_saved INTEGER DEFAULT 0,
    penalties_missed INTEGER DEFAULT 0,

    -- Cards
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,

    -- Influence/creativity/threat (ICT)
    influence DECIMAL(6,1),
    creativity DECIMAL(6,1),
    threat DECIMAL(6,1),
    ict_index DECIMAL(6,1),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (player_id, season_id, gameweek),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
);

CREATE INDEX idx_pgs_season_gw ON player_gameweek_stats(season_id, gameweek);
CREATE INDEX idx_pgs_fixture ON player_gameweek_stats(fixture_id, season_id);
ALTER TABLE player_gameweek_stats OWNER TO postgres;
ALTER TABLE player_gameweek_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON player_gameweek_stats FOR SELECT USING (true);
```

**Data source**: `/api/event/{gw}/live/` → `elements` array

### Phase 3: Manager Tables

#### 3.1 `managers` (New - Cache)
Cache manager metadata to avoid repeated FPL API calls.

```sql
CREATE TABLE IF NOT EXISTS managers (
    id BIGINT NOT NULL,               -- FPL entry ID
    season_id VARCHAR(10) NOT NULL,

    player_name VARCHAR(100),         -- Manager's name
    team_name VARCHAR(100),           -- Team name
    started_event INTEGER,            -- GW they joined

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_synced_at TIMESTAMPTZ,

    PRIMARY KEY (id, season_id),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
);

ALTER TABLE managers OWNER TO postgres;
ALTER TABLE managers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON managers FOR SELECT USING (true);
```

#### 3.2 `manager_gameweek_history` (New)
Core historical data per manager per gameweek.

```sql
CREATE TABLE IF NOT EXISTS manager_gameweek_history (
    manager_id BIGINT NOT NULL,
    season_id VARCHAR(10) NOT NULL,
    gameweek INTEGER NOT NULL,

    -- Points
    gameweek_points INTEGER NOT NULL,
    total_points INTEGER NOT NULL,
    points_on_bench INTEGER DEFAULT 0,

    -- Rank
    overall_rank INTEGER,
    gameweek_rank INTEGER,

    -- Transfers
    transfers_made INTEGER DEFAULT 0,
    transfers_cost INTEGER DEFAULT 0,  -- hits (negative or 0)

    -- Value (stored as INTEGER, /10 for £m)
    bank INTEGER DEFAULT 0,
    team_value INTEGER DEFAULT 0,

    -- Chip used this GW (nullable)
    active_chip VARCHAR(20),          -- wildcard, bboost, 3xc, freehit

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (manager_id, season_id, gameweek),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
);

CREATE INDEX idx_mgh_season_gw ON manager_gameweek_history(season_id, gameweek);
ALTER TABLE manager_gameweek_history OWNER TO postgres;
ALTER TABLE manager_gameweek_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON manager_gameweek_history FOR SELECT USING (true);
```

**Data source**: `/api/entry/{manager_id}/history/`

#### 3.3 `manager_picks` (New)
Full squad selection per gameweek.

```sql
CREATE TABLE IF NOT EXISTS manager_picks (
    manager_id BIGINT NOT NULL,
    season_id VARCHAR(10) NOT NULL,
    gameweek INTEGER NOT NULL,
    player_id INTEGER NOT NULL,

    position INTEGER NOT NULL,        -- 1-11 starting, 12-15 bench
    multiplier INTEGER DEFAULT 1,     -- 0=auto-subbed out, 1=normal, 2=captain, 3=TC
    is_captain BOOLEAN DEFAULT FALSE,
    is_vice_captain BOOLEAN DEFAULT FALSE,

    -- Points (denormalized for fast queries)
    points INTEGER DEFAULT 0,         -- Actual points scored (without multiplier)

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (manager_id, season_id, gameweek, player_id),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
);

CREATE INDEX idx_mp_season_gw ON manager_picks(season_id, gameweek);
CREATE INDEX idx_mp_player ON manager_picks(player_id, season_id);
CREATE INDEX idx_mp_captain ON manager_picks(season_id, gameweek, is_captain) WHERE is_captain = TRUE;
ALTER TABLE manager_picks OWNER TO postgres;
ALTER TABLE manager_picks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON manager_picks FOR SELECT USING (true);
```

**Data source**: `/api/entry/{manager_id}/event/{gw}/picks/`

#### 3.4 `manager_chips` (New)
Track chip usage per manager.

```sql
CREATE TABLE IF NOT EXISTS manager_chips (
    manager_id BIGINT NOT NULL,
    season_id VARCHAR(10) NOT NULL,
    chip_name VARCHAR(20) NOT NULL,   -- wildcard, bboost, 3xc, freehit, wildcard2
    gameweek_used INTEGER,            -- NULL if not yet used

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (manager_id, season_id, chip_name),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
);

ALTER TABLE manager_chips OWNER TO postgres;
ALTER TABLE manager_chips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON manager_chips FOR SELECT USING (true);
```

**Data source**: `/api/entry/{manager_id}/history/` → `chips` array

#### 3.5 `league_standings_history` (New)
Pre-computed league positions per gameweek for bump charts.

```sql
CREATE TABLE IF NOT EXISTS league_standings_history (
    league_id BIGINT NOT NULL,
    season_id VARCHAR(10) NOT NULL,
    gameweek INTEGER NOT NULL,
    manager_id BIGINT NOT NULL,

    rank INTEGER NOT NULL,
    previous_rank INTEGER,
    total_points INTEGER NOT NULL,
    gameweek_points INTEGER NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (league_id, season_id, gameweek, manager_id),
    FOREIGN KEY (season_id) REFERENCES seasons(id)
);

CREATE INDEX idx_lsh_league_manager ON league_standings_history(league_id, season_id, manager_id);
ALTER TABLE league_standings_history OWNER TO postgres;
ALTER TABLE league_standings_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON league_standings_history FOR SELECT USING (true);
```

**Data source**: Computed from `manager_gameweek_history`

---

## Backend API Design

### New Router: `/api/v1/history`

#### GET `/api/v1/history/league/{league_id}`
**Purpose**: Get all historical data for a league in one call (replaces ~400 frontend calls)

**Query params**:
- `season_id` (optional, defaults to current)
- `include_picks` (boolean, default false) - include full squad picks

**Response**:
```json
{
  "league_id": 123456,
  "season_id": "2024-25",
  "managers": [
    {
      "manager_id": 789,
      "name": "John Doe",
      "team_name": "FC Winners",
      "history": [
        {
          "gameweek": 1,
          "gameweek_points": 65,
          "total_points": 65,
          "overall_rank": 150000,
          "transfers_made": 0,
          "transfers_cost": 0,
          "points_on_bench": 12,
          "bank": 5,
          "team_value": 1000,
          "active_chip": null
        }
      ],
      "chips": [
        {"name": "wildcard", "gameweek": 5}
      ]
    }
  ],
  "current_gameweek": 19
}
```

**Caching**: 5 minutes (completed GWs immutable, current GW updates)

#### GET `/api/v1/history/league/{league_id}/positions`
**Purpose**: League position history for bump chart

**Response**:
```json
{
  "league_id": 123456,
  "season_id": "2024-25",
  "positions": [
    {"gameweek": 1, "manager_123": 5, "manager_456": 3},
    {"gameweek": 2, "manager_123": 4, "manager_456": 2}
  ],
  "managers": [
    {"id": 123, "name": "John", "color": "#3b82f6"}
  ]
}
```

**Caching**: 30 minutes

#### GET `/api/v1/history/league/{league_id}/stats`
**Purpose**: Aggregated stats for statistics page

**Response**:
```json
{
  "season_id": "2024-25",
  "bench_points": [
    {"manager_id": 123, "name": "John", "total": 156}
  ],
  "captain_differentials": [
    {"manager_id": 123, "name": "John", "differential_picks": 5, "gain": 24}
  ],
  "free_transfers": [
    {"manager_id": 123, "name": "John", "remaining": 3}
  ]
}
```

**Caching**: 5 minutes

#### GET `/api/v1/history/comparison`
**Purpose**: Head-to-head manager comparison

**Query params**:
- `manager_a` (required)
- `manager_b` (required)
- `league_id` (required) - for league template calculation
- `season_id` (optional)

**Response**:
```json
{
  "season_id": "2024-25",
  "manager_a": {
    "manager_id": 123,
    "name": "John",
    "total_points": 1250,
    "overall_rank": 50000,
    "total_transfers": 25,
    "total_hits": 3,
    "hits_cost": -12,
    "captain_points": 320,
    "differential_captains": 5,
    "chips_used": ["wildcard"],
    "chips_remaining": ["bboost", "3xc", "freehit"],
    "squad_value": 1052,
    "bank": 8,
    "best_gameweek": {"gw": 15, "points": 98},
    "worst_gameweek": {"gw": 3, "points": 32},
    "starting_xi": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  },
  "manager_b": { "..." },
  "common_players": [1, 5, 8],
  "league_template_overlap_a": 8,
  "league_template_overlap_b": 6
}
```

---

## Data Collection Strategy

### Rate Limiting (IMPORTANT)
FPL API has rate limits. Must implement:
- Max 60 requests/minute to FPL API
- 500ms delay between requests
- Exponential backoff on 429/503 responses
- Progress tracking for large imports

```python
async def fetch_with_retry(url: str, max_retries: int = 3) -> dict:
    for attempt in range(max_retries):
        try:
            response = await client.get(url)
            if response.status_code in (429, 503):
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
                continue
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError:
            if attempt == max_retries - 1:
                raise
    return {}
```

### Collection Flow (Extend Existing Scheduled Updates)

```
1. GW deadline passes
2. Wait for FPL to finalize points (check event_status)
3. Fetch /bootstrap-static/ for current state
4. Update teams, gameweeks, players tables
5. For each tracked league:
   a. Fetch league standings
   b. For each manager:
      - Fetch /entry/{id}/history (if not cached)
      - Fetch /entry/{id}/event/{gw}/picks
   c. Calculate league positions
   d. Store in database
6. Mark GW as collected in gameweek_status
```

### Historical Backfill

One-time job to import historical data for existing season:
- Run during off-peak hours
- Import one GW at a time
- Track progress in `gameweek_status` table

---

## Implementation Phases (Prioritized)

### Phase 1: Foundation (1 week)
**Rationale**: Core reference data needed by everything else

- [ ] Create `seasons` table + migration
- [ ] Create `teams` table + migration
- [ ] Create `gameweeks` table + migration
- [ ] Extend existing `fixtures` table
- [ ] Create data collection for bootstrap-static
- [ ] Populate current season reference data

### Phase 2: Player Data (1 week)
**Rationale**: Highest value - enables xG analysis, player recommendations

- [ ] Create `players` table + migration
- [ ] Create `player_gameweek_stats` table + migration
- [ ] Add player stats collection to scheduled updates
- [ ] Backfill current season player data
- [ ] Create `/api/v1/players/{id}/history` endpoint

### Phase 3: Manager Core Data (1 week)
**Rationale**: Enables league history without full picks

- [ ] Create `managers` table + migration
- [ ] Create `manager_gameweek_history` table + migration
- [ ] Create `manager_chips` table + migration
- [ ] Add manager history collection
- [ ] Backfill current season manager history
- [ ] Create `/api/v1/history/league/{id}` endpoint

### Phase 4: Manager Picks & Analysis (1 week)
**Rationale**: Full analytical capability

- [ ] Create `manager_picks` table + migration
- [ ] Create `league_standings_history` table + migration
- [ ] Add picks collection to scheduled updates
- [ ] Backfill current season picks
- [ ] Create `/api/v1/history/league/{id}/positions` endpoint
- [ ] Create `/api/v1/history/league/{id}/stats` endpoint
- [ ] Create `/api/v1/history/comparison` endpoint

### Phase 5: Frontend Migration (1 week)
**Rationale**: Replace frontend hooks with backend calls

- [ ] Create new hooks that call backend endpoints
- [ ] Replace `useHistoricalData` with backend call
- [ ] Migrate `useBenchPoints` to use backend stats
- [ ] Migrate `useCaptainDifferential` to use backend stats
- [ ] Migrate `useLeaguePositionHistory` to use backend positions
- [ ] Migrate `useFreeTransfers` to use backend stats
- [ ] Update `useHeadToHeadComparison` to use backend comparison

### Phase 6: Cleanup & Testing (1 week)
**Rationale**: Ensure quality and remove dead code

- [ ] Remove unused frontend code
- [ ] Update frontend tests
- [ ] Add backend integration tests
- [ ] Performance testing
- [ ] Documentation updates

---

## Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| API calls per page load | ~440 | 1-3 |
| Initial load time | 3-5s | <1s |
| Data freshness | Real-time | 5-min cache |
| Backend complexity | Low | Medium |

---

## Open Questions

1. **League tracking**: How do we know which leagues to collect data for?
   - Option A: User registers leagues they want to track (recommended)
   - Option B: Collect on first request, then schedule updates

2. **Historical backfill scope**: How far back to backfill?
   - Recommendation: Current season only initially, expand later

3. **Multi-season data access**: Should old season data be accessible?
   - Recommendation: Yes, via season_id parameter

4. **Season transition handling**:
   - Create new season record when FPL season starts
   - Archive previous season data (no deletion)
   - Reset `is_current` flags

---

## Appendix: Data Volume Estimates

For a 20-manager league over 38 gameweeks:

| Table | Rows/Season | Storage |
|-------|-------------|---------|
| `manager_gameweek_history` | 760 | ~50KB |
| `manager_picks` | 11,400 | ~500KB |
| `manager_chips` | 100 | ~5KB |
| `league_standings_history` | 760 | ~50KB |
| `player_gameweek_stats` | ~20,000 | ~2MB |

Total per league: ~3MB/season - easily manageable on Supabase free tier.
