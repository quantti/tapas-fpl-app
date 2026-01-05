# Feature: Chips Remaining (Backend Migration)

## Overview

Migrate the "Chips Remaining" display from frontend API calls to backend-served data. Currently, the frontend makes **N API calls** (one per manager) to fetch chip usage data, causing slow page loads and unnecessary FPL API traffic.

**Current state**: Frontend calls `/api/entry/{manager_id}/history/` for each manager to get `chips` array.
**Target state**: Single backend endpoint returns all managers' chip data.

## User Story

As an FPL manager viewing my league, I want to see which chips my rivals have remaining, so I can anticipate their strategies and plan accordingly.

---

## Problem Statement

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CURRENT FLOW (SLOW)                          │
│                                                                  │
│  Frontend ─┬─► /api/entry/123/history/ ──► chips: [...]         │
│            ├─► /api/entry/456/history/ ──► chips: [...]         │
│            ├─► /api/entry/789/history/ ──► chips: [...]         │
│            └─► ... × N managers                                  │
│                                                                  │
│  Result: N sequential/parallel API calls per league             │
│  For 20 managers = 20 calls just for chip data                  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Source

Each manager's chip usage comes from `/api/entry/{manager_id}/history/`:

```json
{
  "chips": [
    { "name": "wildcard", "event": 5 },
    { "name": "bboost", "event": 12 }
  ],
  "current": [...],
  "past": [...]
}
```

### Available Chips (2025-26 Rules)

**NEW FOR 2025-26**: All chips reset at GW20. Each half-season has a full set of chips.

| Chip | Per Half-Season | Total Per Season |
|------|-----------------|------------------|
| `wildcard` | 1 | 2 |
| `bboost` | 1 | 2 |
| `3xc` | 1 | 2 |
| `freehit` | 1 | 2 |

**Half-seasons:**
- **First half**: GW1-19 (4 chips)
- **Second half**: GW20-38 (4 chips)

**Total**: 8 chips per manager per season.

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TARGET FLOW (FAST)                           │
│                                                                  │
│  Frontend ──► /api/v1/chips/league/{league_id}                  │
│                        │                                         │
│                        ▼                                         │
│              Backend (Fly.io)                                    │
│                        │                                         │
│                        ▼                                         │
│              Supabase (manager_chips table)                      │
│                                                                  │
│  Result: 1 API call returns all managers' chip data             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Table: `chip_usage` (Event-based)

Event log of chip activations - append-only, supports analytics.

```sql
-- Migration: 008_chip_usage.sql

CREATE TABLE IF NOT EXISTS chip_usage (
    id BIGSERIAL PRIMARY KEY,
    manager_id BIGINT NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL CHECK (gameweek >= 1 AND gameweek <= 38),
    chip_type VARCHAR(20) NOT NULL CHECK (chip_type IN ('wildcard', 'bboost', '3xc', 'freehit')),

    -- Which half of the season (1 = GW1-19, 2 = GW20-38)
    season_half SMALLINT NOT NULL CHECK (season_half IN (1, 2)),

    -- Analytics metadata
    points_gained INTEGER,              -- bench pts for BB, extra captain pts for 3xc
    team_value_at_use INTEGER,          -- in 0.1m units

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One chip of each type per half-season
    UNIQUE(manager_id, season_id, season_half, chip_type)
);

CREATE INDEX idx_chip_usage_manager_season ON chip_usage(manager_id, season_id);
CREATE INDEX idx_chip_usage_season_half ON chip_usage(season_id, season_half);
```

### Design Decisions

1. **Event-based**: Append-only log of chip activations (not state-based)
2. **`season_half` column**: Explicit tracking of which half (1 or 2) - enables simple queries
3. **Analytics fields**: `points_gained` for BB/3xc comparison, `team_value_at_use` for context
4. **UNIQUE constraint**: One chip of each type per half-season per manager

---

## Backend API

### Endpoint: `GET /api/v1/chips/league/{league_id}`

Returns chip usage for all managers in a league.

**Query Parameters:**
- `season_id` (optional): Default current season

**Response:**
```json
{
  "league_id": 123456,
  "season_id": "2025-26",
  "current_gameweek": 22,
  "current_half": 2,
  "managers": [
    {
      "manager_id": 789,
      "name": "John Doe",
      "first_half": {
        "chips_used": [
          { "chip_type": "wildcard", "gameweek": 5, "points_gained": null },
          { "chip_type": "bboost", "gameweek": 15, "points_gained": 24 }
        ],
        "chips_remaining": ["3xc", "freehit"]
      },
      "second_half": {
        "chips_used": [
          { "chip_type": "3xc", "gameweek": 21, "points_gained": 18 }
        ],
        "chips_remaining": ["wildcard", "bboost", "freehit"]
      }
    },
    {
      "manager_id": 456,
      "name": "Jane Smith",
      "first_half": {
        "chips_used": [],
        "chips_remaining": ["wildcard", "bboost", "3xc", "freehit"]
      },
      "second_half": {
        "chips_used": [],
        "chips_remaining": ["wildcard", "bboost", "3xc", "freehit"]
      }
    }
  ]
}
```

**Calculation Logic for `chips_remaining`**:
```python
ALL_CHIPS = {"wildcard", "bboost", "3xc", "freehit"}

def get_remaining_chips_for_half(chips_used_in_half: list) -> list:
    """All chips reset per half - simple set difference."""
    used_names = {c["chip_type"] for c in chips_used_in_half}
    return sorted(ALL_CHIPS - used_names)

def get_season_half(gameweek: int) -> int:
    """GW1-19 = half 1, GW20-38 = half 2."""
    return 1 if gameweek < 20 else 2
```

**Cache Headers:**
```
Cache-Control: public, max-age=300
```

### Endpoint: `GET /api/v1/chips/manager/{manager_id}`

Single manager chip status (for H2H comparison page).

**Response:**
```json
{
  "manager_id": 789,
  "season_id": "2025-26",
  "current_half": 2,
  "first_half": {
    "chips_used": [{ "chip_type": "wildcard", "gameweek": 5 }],
    "chips_remaining": ["bboost", "3xc", "freehit"]
  },
  "second_half": {
    "chips_used": [],
    "chips_remaining": ["wildcard", "bboost", "3xc", "freehit"]
  }
}
```

---

## Data Collection Strategy

### Option A: Lazy Collection (Recommended)

Collect chip data when a league is first requested, then update incrementally.

```python
def get_season_half(gameweek: int) -> int:
    """GW1-19 = half 1, GW20-38 = half 2."""
    return 1 if gameweek < 20 else 2

async def collect_league_chips(league_id: int, season_id: int):
    """Fetch and store chip data for all managers in a league."""

    # 1. Get manager IDs from FPL league standings
    standings = await fpl_client.get_league_standings(league_id)
    manager_ids = [m["entry"] for m in standings["results"]]

    # 2. For each manager, fetch history and extract chips
    for manager_id in manager_ids:
        history = await fpl_client.get_manager_history(manager_id)

        for chip in history.get("chips", []):
            gameweek = chip["event"]
            season_half = get_season_half(gameweek)

            await db.execute("""
                INSERT INTO chip_usage (manager_id, season_id, gameweek, chip_type, season_half)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (manager_id, season_id, season_half, chip_type) DO UPDATE SET
                    gameweek = EXCLUDED.gameweek
            """, manager_id, season_id, gameweek, chip["name"], season_half)
```

**Pros:**
- Only collect data for leagues that are actually viewed
- No wasted resources on inactive leagues

**Cons:**
- First request may be slow

### Option B: Scheduled Updates (For tracked leagues)

If a league is "tracked" (user registered), update chips daily:

```python
# backend/scripts/collect_chips.py

async def update_tracked_leagues():
    """Update chip data for all tracked leagues."""

    tracked = await db.fetch("SELECT DISTINCT league_id FROM tracked_leagues")

    for league in tracked:
        await collect_league_chips(league["league_id"], current_season_id)
```

### Initial Data Population

Since we already collect `manager_gameweek_history` in Points Against flow, we can extract chip data from the same history endpoint:

```python
# When fetching /api/entry/{id}/history/, also extract chips:
for chip in history_data.get("chips", []):
    # Store in manager_chips table
```

---

## Frontend Migration

### Current Component: `ChipsRemaining.tsx`

Location: `frontend/src/components/ChipsRemaining.tsx`

```tsx
// CURRENT: Uses managerDetails from N API calls
export function ChipsRemaining({ managerDetails, currentGameweek, deadlineTime }: Props) {
  const isSecondHalf = useMemo(() => {
    if (currentGameweek >= 20) return true;
    if (currentGameweek === 19 && deadlineTime) {
      return new Date() > new Date(deadlineTime);
    }
    return false;
  }, [currentGameweek, deadlineTime]);

  // ... renders chips grid
}
```

### New Hook: `useLeagueChips`

```typescript
// frontend/src/services/queries/useLeagueChips.ts

export function useLeagueChips(leagueId: number, seasonId?: string) {
  return useQuery({
    queryKey: queryKeys.chips.league(leagueId, seasonId),
    queryFn: () => backendApi.getLeagueChips(leagueId, seasonId),
    staleTime: CACHE_TIMES.FIVE_MINUTES,
    gcTime: CACHE_TIMES.ONE_HOUR,
    enabled: !!leagueId,
  });
}
```

### Migration Path

1. **Phase 1**: Add backend endpoint + hook (parallel to existing)
2. **Phase 2**: Update `ChipsRemaining` to accept data from either source
3. **Phase 3**: Switch `useFplData` consumers to use `useLeagueChips`
4. **Phase 4**: Remove chip-related code from `useFplData` response

---

## Implementation Checklist

### Phase 1: Database
- [ ] Create migration `008_manager_chips.sql`
- [ ] Test migration locally
- [ ] Run migration on Supabase

### Phase 2: Backend API
- [ ] Add `ChipsService` class in `backend/app/services/`
- [ ] Implement `GET /api/v1/chips/league/{league_id}`
- [ ] Implement `GET /api/v1/chips/manager/{manager_id}`
- [ ] Add collection logic (lazy or scheduled)
- [ ] Add tests for endpoints

### Phase 3: Data Collection
- [ ] Integrate chip extraction into existing history fetch
- [ ] OR create dedicated `collect_chips.py` script
- [ ] Test with production league data

### Phase 4: Frontend
- [ ] Create `useLeagueChips` hook
- [ ] Add backend API client method
- [ ] Update `ChipsRemaining` component
- [ ] Update query keys

### Phase 5: Migration & Cleanup
- [ ] Remove chip fetching from `useFplData`
- [ ] Update tests
- [ ] Verify performance improvement

---

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| API calls for chips | N (per manager) | 1 |
| Chip data load time | 500ms-2s | <100ms |
| FPL API traffic | High | Minimal |

---

## Dependencies

- Requires `season` table (exists)
- Benefits from league tracking mechanism (future feature)
- Can share collection infrastructure with Points Against

---

## Open Questions

1. **League tracking**: Should we track leagues explicitly, or collect on-demand?
   - Recommendation: Start with lazy collection, add tracking later

2. **Sync frequency**: How often to refresh chip data?
   - Recommendation: Daily for tracked leagues, on-demand for others

3. **Historical chips**: Should we show chips from previous seasons?
   - Recommendation: Focus on current season initially

---

## Related Documents

- `docs/planning/historical-data-migration.md` - Original migration plan
- `docs/features/points-against-feature.md` - Similar backend pattern
- `frontend/src/components/ChipsRemaining.tsx` - Current implementation
