# Historical Data Migration Plan

**Date**: January 5, 2026
**Status**: Planning
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

## Database Schema Changes

### New Tables Required

#### 1. `manager_gameweek_history` (High Priority)
Core historical data per manager per gameweek.

```sql
CREATE TABLE manager_gameweek_history (
    manager_id BIGINT NOT NULL,
    season_id INTEGER NOT NULL,
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
    transfers_cost INTEGER DEFAULT 0,  -- hits (always negative or 0)

    -- Value (stored as INTEGER, divide by 10 for £m)
    bank INTEGER DEFAULT 0,
    team_value INTEGER DEFAULT 0,

    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (manager_id, season_id, gameweek)
);

CREATE INDEX idx_mgh_season_gw ON manager_gameweek_history(season_id, gameweek);
```

**Data source**: `/api/entry/{manager_id}/history/`

#### 2. `manager_picks` (High Priority)
Full squad selection per gameweek - enables template team, ownership, captain analysis.

```sql
CREATE TABLE manager_picks (
    manager_id BIGINT NOT NULL,
    season_id INTEGER NOT NULL,
    gameweek INTEGER NOT NULL,
    player_id INTEGER NOT NULL,

    position INTEGER NOT NULL,      -- 1-11 starting, 12-15 bench
    multiplier INTEGER DEFAULT 1,   -- 0=bench, 1=normal, 2=captain, 3=TC
    is_captain BOOLEAN DEFAULT FALSE,
    is_vice_captain BOOLEAN DEFAULT FALSE,

    -- Points (denormalized for fast queries)
    points INTEGER DEFAULT 0,       -- Actual points scored (without multiplier)

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (manager_id, season_id, gameweek, player_id)
);

CREATE INDEX idx_mp_season_gw ON manager_picks(season_id, gameweek);
CREATE INDEX idx_mp_player ON manager_picks(player_id, season_id);
```

**Data source**: `/api/entry/{manager_id}/event/{gw}/picks/`

#### 3. `manager_chips` (Medium Priority)
Track chip usage per manager.

```sql
CREATE TABLE manager_chips (
    manager_id BIGINT NOT NULL,
    season_id INTEGER NOT NULL,
    chip_name VARCHAR(20) NOT NULL,  -- wildcard, bboost, 3xc, freehit, wildcard2
    gameweek_used INTEGER,            -- NULL if not yet used

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (manager_id, season_id, chip_name)
);
```

**Data source**: `/api/entry/{manager_id}/history/` → `chips` array

#### 4. `league_standings_history` (Medium Priority)
Pre-computed league positions per gameweek for bump charts.

```sql
CREATE TABLE league_standings_history (
    league_id BIGINT NOT NULL,
    season_id INTEGER NOT NULL,
    gameweek INTEGER NOT NULL,
    manager_id BIGINT NOT NULL,

    rank INTEGER NOT NULL,
    previous_rank INTEGER,
    total_points INTEGER NOT NULL,
    gameweek_points INTEGER NOT NULL,

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (league_id, season_id, gameweek, manager_id)
);

CREATE INDEX idx_lsh_league_manager ON league_standings_history(league_id, season_id, manager_id);
```

**Data source**: Computed from `manager_gameweek_history`

#### 5. `managers` (Low Priority - Cache)
Cache manager metadata to avoid repeated FPL API calls.

```sql
CREATE TABLE managers (
    manager_id BIGINT NOT NULL,
    season_id INTEGER NOT NULL,

    player_name VARCHAR(100),
    team_name VARCHAR(100),
    started_event INTEGER,

    updated_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (manager_id, season_id)
);
```

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
  "season_id": 2025,
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
          "team_value": 1000
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

**Caching**: 5 minutes (completed GWs are immutable, but current GW updates)

#### GET `/api/v1/history/league/{league_id}/positions`
**Purpose**: League position history for bump chart

**Response**:
```json
{
  "league_id": 123456,
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

#### GET `/api/v1/history/manager/{manager_id}`
**Purpose**: Single manager's full history

**Query params**:
- `season_id` (optional)
- `include_picks` (boolean)

**Response**: Same structure as league endpoint but for single manager

#### GET `/api/v1/history/comparison`
**Purpose**: Head-to-head manager comparison

**Query params**:
- `manager_a` (required)
- `manager_b` (required)
- `season_id` (optional)

**Response**:
```json
{
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
  "manager_b": { ... },
  "common_players": [1, 5, 8],
  "league_template_overlap_a": 8,
  "league_template_overlap_b": 6
}
```

---

## Data Collection Strategy

### Option A: Real-time Collection (Recommended)
- Run data collection job after each gameweek deadline
- Use existing `gameweek_status` table to track collection state
- Collect data for all tracked leagues

### Option B: On-demand Collection
- Fetch and cache data when first requested
- Slower initial load but simpler infrastructure

### Collection Flow
```
1. GW deadline passes
2. Wait for FPL to finalize points (check event_status)
3. For each tracked league:
   a. Fetch league standings
   b. For each manager:
      - Fetch /entry/{id}/history
      - Fetch /entry/{id}/event/{gw}/picks
   c. Calculate league positions
   d. Store in database
4. Mark GW as collected in gameweek_status
```

---

## Migration Phases

### Phase 1: Database Schema (Week 1)
- [ ] Create migration files for new tables
- [ ] Apply migrations to Supabase
- [ ] Update DB.md documentation

### Phase 2: Data Collection (Week 2)
- [ ] Create FPL API client for historical endpoints
- [ ] Implement data collection service
- [ ] Add collection job triggered by gameweek status
- [ ] Backfill historical data for current season

### Phase 3: API Endpoints (Week 3)
- [ ] Create `/api/v1/history` router
- [ ] Implement league history endpoint
- [ ] Implement positions endpoint
- [ ] Implement stats endpoint
- [ ] Implement comparison endpoint
- [ ] Add response caching

### Phase 4: Frontend Migration (Week 4)
- [ ] Create new hooks that call backend endpoints
- [ ] Replace `useHistoricalData` with backend call
- [ ] Migrate `useBenchPoints` to use backend stats
- [ ] Migrate `useCaptainDifferential` to use backend stats
- [ ] Migrate `useLeaguePositionHistory` to use backend positions
- [ ] Migrate `useFreeTransfers` to use backend stats
- [ ] Update `useHeadToHeadComparison` to use backend comparison

### Phase 5: Cleanup (Week 5)
- [ ] Remove unused frontend code
- [ ] Update frontend tests
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
   - Option A: User registers leagues they want to track
   - Option B: Collect on first request, then schedule updates

2. **Historical backfill**: Should we backfill all previous gameweeks for existing users?
   - Recommendation: Yes, one-time backfill job

3. **Rate limiting**: FPL API rate limits during collection?
   - Add delays between requests, use exponential backoff

4. **Multi-season**: When new season starts, how to handle transition?
   - New `season_id`, fresh collection, archive old data
