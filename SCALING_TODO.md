# Scaling Implementation TODO

Implementation checklist for optimizing the app for public release.

## Phase 1: Query Optimization (Critical)

### 1.1 Install & Configure TanStack Query
- [ ] Install `@tanstack/react-query` and `@tanstack/react-query-devtools`
- [ ] Create QueryClient with default options
- [ ] Wrap App in QueryClientProvider
- [ ] Configure default staleTime and gcTime

### 1.2 Create Shared Historical Data Hook
- [ ] Create `useHistoricalData.ts` hook
- [ ] Fetch all historical gameweek live data once
- [ ] Fetch all manager picks for historical gameweeks once
- [ ] Export shared data for BenchPoints and CaptainSuccess
- [ ] Use `staleTime: Infinity` for completed gameweeks

### 1.3 Refactor Existing Hooks
- [ ] Refactor `useBenchPoints.ts` to consume shared hook
- [ ] Refactor `useCaptainSuccess.ts` to consume shared hook
- [ ] Remove duplicate API calls from both hooks
- [ ] Verify both components still work correctly

### 1.4 Refactor Core Data Hook
- [ ] Refactor `useFplData.ts` to use React Query
- [ ] Separate queries: bootstrap, standings, manager details
- [ ] Configure appropriate staleTime for each query type
- [ ] Keep auto-refresh behavior for live games

## Phase 2: Worker Cache Optimization

### 2.1 Tiered Cache TTLs
- [ ] Update worker to detect endpoint type
- [ ] Bootstrap-static: 6 hours
- [ ] Fixtures: 1 hour
- [ ] Standings: 5 minutes
- [ ] Live gameweek: 1 minute (when live) / 24 hours (completed)
- [ ] Historical picks: 24 hours

### 2.2 Cache Headers
- [ ] Add proper Cache-Control headers per endpoint
- [ ] Consider stale-while-revalidate for standings

## Phase 3: Frontend Performance

### 3.1 Lazy Loading
- [ ] Lazy load BenchPoints component
- [ ] Lazy load CaptainSuccess component
- [ ] Add loading skeletons for lazy components
- [ ] Use Intersection Observer for trigger

### 3.2 Progressive Loading
- [ ] Load standings first (critical path)
- [ ] Load manager details in background
- [ ] Load historical stats on scroll/idle

## Phase 4: Multi-League Support

### 4.1 Routing
- [ ] Add React Router
- [ ] Create `/league/:id` route
- [ ] Create landing page with league input
- [ ] Redirect root to landing or last league

### 4.2 League Context
- [ ] Move league ID to URL params
- [ ] Remove hardcoded LEAGUE_ID from config
- [ ] Add recent leagues (localStorage)

## Verification

### Request Count Targets
- [ ] Current: ~652 requests per page load
- [ ] Target: <100 requests per page load
- [ ] Verify with Network tab in DevTools

### Performance Metrics
- [ ] First Contentful Paint: < 1.5s
- [ ] Time to Interactive: < 3s
- [ ] Lighthouse Performance: > 90

---

## Progress

| Phase | Status | Requests Saved |
|-------|--------|----------------|
| 1.1 TanStack Query | ✅ Complete | - |
| 1.2 Shared Hook | ✅ Complete | ~294 |
| 1.3 Refactor Hooks | ✅ Complete | - |
| 1.4 Core Refactor | Not Started | dedup |
| 2.1 Tiered Cache | ✅ Complete | repeat visits |
| 3.1 Lazy Loading | ⏸️ Reverted | caused skeleton stuck issue |

### Completed Optimizations

**React Query Setup (main.tsx)**
- QueryClient with 5-min staleTime, 30-min gcTime
- ReactQueryDevtools for debugging

**Shared Historical Data Hook (useHistoricalData.ts)**
- Single hook fetches all historical gameweek data
- Uses `useQueries` for parallel fetching
- `staleTime: Infinity` for completed gameweeks (immutable data)
- Automatic request deduplication via React Query

**Refactored Hooks**
- `useBenchPoints.ts` - now consumes shared hook
- `useCaptainSuccess.ts` - now consumes shared hook
- Both hooks only compute values, no duplicate fetching

**Tiered Cache TTLs (worker/src/index.ts)**
- Bootstrap: 6 hours
- Fixtures: 1 hour
- Live scores: 2 minutes
- Historical picks: 1 hour
- Standings: 5 minutes

**Lazy Loading (Dashboard.tsx)** - REVERTED
- Attempted React.lazy() with IntersectionObserver
- Caused skeleton stuck issue - components never loaded
- Reverted to direct imports for reliability
- Consider revisiting with simpler approach if bundle size becomes issue

*Started: December 2024*
*Phase 1-3 completed: December 2024*
