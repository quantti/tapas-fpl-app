# Frontend Backend Integration Plan

**Status:** In Progress (Statistics page pending)
**Created:** 2026-01-08
**Last Updated:** 2026-01-20

## Overview

Migrate Statistics and Analytics page components from direct FPL API calls to pre-computed backend endpoints. This reduces ~100+ API calls to a few calls per page load.

## Completed Integrations

### ✅ Dashboard Consolidation
**Completed:** 2026-01-20

| Component | Hook | Data Source | API Calls |
|-----------|------|-------------|-----------|
| Dashboard | `useLeagueDashboard` | Backend `/dashboard/league/{id}` | 1 call |

**Changes:**
- Created `GET /api/v1/dashboard/league/{id}` backend endpoint
- Created `useLeagueDashboard` hook with TanStack Query
- Reduced 60+ FPL API calls to 1 backend call
- Added fallback logic in `useFplData.ts` when backend returns empty data
- Cron schedule adjusted to 08:00 UTC for data freshness
- See `backend/docs/dashboard-endpoint-plan.md` for full details

---

### ✅ Recommendations (Analytics Page)
**Completed:** 2026-01-12

| Component | Hook | Data Source | API Calls |
|-----------|------|-------------|-----------|
| Recommendations | `useRecommendedPlayers` | Backend `/recommendations` | 1 call |

**Changes:**
- Added `backendApi.getLeagueRecommendations()` method
- Rewrote `useRecommendedPlayers` hook to call backend API
- Simplified `Recommendations.tsx` component props
- Backend uses `cachetools.TTLCache` with 5-minute TTL

---

## Current Architecture (Statistics Page)

| Feature | Hook | Data Source | API Calls |
|---------|------|-------------|-----------|
| BenchPoints | `useBenchPoints` | FPL API (picks + live per GW) | ~N × GWs |
| FreeTransfers | `useLeagueStats` | Backend `/stats` | 1 (migrated) |
| LeaguePosition | `useLeaguePositionHistory` | FPL API (`getEntryHistory`) | N managers |
| CaptainSuccess | `useCaptainSuccess` (TBD) | FPL API | N managers |
| ChipsRemaining | `backendApi.getLeagueChips` | Backend API | 1 call |

**Problem:** With 10 managers and 20 gameweeks, the Statistics page makes 100+ FPL API requests.

## Target Architecture

| Feature | Hook | Data Source | API Calls |
|---------|------|-------------|-----------|
| BenchPoints | `useLeagueStats` | Backend `/stats` | 1 (shared) |
| FreeTransfers | `useLeagueStats` | Backend `/stats` | 1 (shared) |
| CaptainSuccess | `useLeagueStats` | Backend `/stats` | 1 (shared) |
| LeaguePosition | `useLeaguePositions` | Backend `/positions` | 1 |
| ChipsRemaining | `backendApi.getLeagueChips` | Backend `/chips` | 1 (no change) |

**Result:** 2 backend API calls total (stats + positions).

## Backend Endpoints

### GET `/api/v1/history/league/{league_id}/stats`

Returns pre-computed statistics for all managers:

```typescript
interface LeagueStatsResponse {
  league_id: number;
  season_id: number;
  current_gameweek: number;
  bench_points: BenchPointsStat[];
  free_transfers: FreeTransferStat[];
  captain_differential: CaptainDifferentialStat[];
}

interface BenchPointsStat {
  manager_id: number;
  name: string;
  bench_points: number;
}

interface FreeTransferStat {
  manager_id: number;
  name: string;
  free_transfers: number; // 1-5
}

interface CaptainDifferentialStat {
  manager_id: number;
  name: string;
  differential_picks: number;
  gain: number; // Can be negative
}
```

### GET `/api/v1/history/league/{league_id}/positions`

Returns position history for bump chart:

```typescript
interface LeaguePositionsResponse {
  league_id: number;
  season_id: number;
  positions: GameweekPosition[]; // Pivoted: {gameweek, [managerId]: rank}
  managers: ManagerMetadata[];   // {id, name, color}
}
```

## Implementation Plan

### Phase 1: Backend Types & API Client

**Files to modify:**
- `frontend/src/services/backendApi.ts`

**Tasks:**
1. Add TypeScript interfaces for `LeagueStatsResponse` and `LeaguePositionsResponse`
2. Add `backendApi.getLeagueStats(leagueId, currentGameweek, seasonId)` method
3. Add `backendApi.getLeaguePositions(leagueId, seasonId)` method

### Phase 2: Create Query Hooks

**Files to create:**
- `frontend/src/services/queries/useLeagueStats.ts`
- `frontend/src/services/queries/useLeaguePositions.ts`

**Tasks:**
1. Create `useLeagueStats` hook using TanStack Query
   - Fetches from backend `/stats` endpoint
   - Returns bench_points, free_transfers, captain_differential
   - Handles loading, error states
   - Cache with appropriate staleTime (1-5 minutes)

2. Create `useLeaguePositions` hook
   - Fetches from backend `/positions` endpoint
   - Returns positions array and manager metadata
   - Pre-formatted for Recharts consumption

### Phase 3: Update Components

**Files to modify:**
- `frontend/src/features/BenchPoints/BenchPoints.tsx`
- `frontend/src/features/FreeTransfers/FreeTransfers.tsx`
- `frontend/src/features/LeaguePosition/LeaguePosition.tsx`
- `frontend/src/features/CaptainSuccess/CaptainSuccess.tsx` (investigate first)

**Tasks:**
1. **BenchPoints:** Replace `useBenchPoints` with data from `useLeagueStats`
2. **FreeTransfers:** ✅ Migrated to `useLeagueStats` (frontend hook deleted)
3. **LeaguePosition:** Replace `useLeaguePositionHistory` with `useLeaguePositions`
4. **CaptainSuccess:** Check if it uses captain differential data, integrate if so

### Phase 4: Data Flow Architecture

**Option A: Lift hooks to Statistics page (recommended)**
```tsx
// Statistics.tsx
const { benchPoints, freeTransfers, captainDiff, isLoading } = useLeagueStats(LEAGUE_ID, currentGameweek);
const { positions, managers } = useLeaguePositions(LEAGUE_ID);

// Pass pre-fetched data to components
<BenchPoints data={benchPoints} loading={isLoading} />
<FreeTransfers data={freeTransfers} loading={isLoading} />
```

**Option B: Each component fetches own data**
- Simpler component API
- TanStack Query deduplicates identical requests
- More isolated components

**Decision:** Start with Option B (simpler), refactor to Option A if needed.

### Phase 5: Cleanup & Testing

**Tasks:**
1. Update/remove unused hooks if fully migrated:
   - `useBenchPoints.ts` (keep for potential fallback?)
   - ~~`useFreeTransfers.ts`~~ ✅ Deleted (calculation now in backend)
   - `useLeaguePositionHistory.ts`

2. Add/update tests:
   - Test new `useLeagueStats` hook
   - Test new `useLeaguePositions` hook
   - Update component tests with mocked backend responses

3. E2E verification:
   - Run Playwright tests
   - Manual verification on Statistics page

## Error Handling Strategy

Backend may be unavailable (Fly.io cold starts, outages). Strategy:

1. **Graceful degradation:** Show "Statistics temporarily unavailable" message
2. **No FPL API fallback:** Don't fall back to direct FPL calls (defeats purpose)
3. **Retry logic:** TanStack Query built-in retry (3 attempts, exponential backoff)

```typescript
useQuery({
  queryKey: ['league-stats', leagueId],
  queryFn: () => backendApi.getLeagueStats(leagueId, currentGameweek),
  retry: 3,
  retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  staleTime: 60_000, // 1 minute
});
```

## Migration Checklist

### ✅ Recommendations (Completed 2026-01-12)
- [x] Add `getLeagueRecommendations` method to `backendApi.ts`
- [x] Rewrite `useRecommendedPlayers` hook
- [x] Update `Recommendations.tsx` component
- [x] Update `Analytics.tsx` view
- [x] Add hook tests
- [x] Add backend caching (`cachetools.TTLCache`)

### Statistics Page (Pending)
- [ ] Add backend types to `backendApi.ts`
- [ ] Add `getLeagueStats` method
- [ ] Add `getLeaguePositions` method
- [ ] Create `useLeagueStats` hook
- [ ] Create `useLeaguePositions` hook
- [ ] Update `BenchPoints` component
- [ ] Update `FreeTransfers` component
- [ ] Update `LeaguePosition` component
- [ ] Investigate `CaptainSuccess` component
- [ ] Add hook tests
- [ ] Run E2E tests
- [ ] Manual QA on Statistics page

## Dependencies

- Backend history endpoints deployed and tested (done)
- Database has historical data populated (done for season 1)
- Backend running on Fly.io (done)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Backend cold starts | 2-3s delay first load | Show loading state, consider wake-up ping |
| Data freshness | Stale data if DB not updated | Backend has scheduled updates (cron) |
| Type mismatches | Runtime errors | Strict TypeScript, runtime validation |

---

## Next Steps

1. Start with Phase 1 (types and API client)
2. Implement hooks in Phase 2
3. Update one component at a time in Phase 3
4. Test thoroughly before removing old hooks
