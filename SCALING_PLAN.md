# Scaling Plan: Tapas & Tackles FPL App

A comprehensive analysis and roadmap for releasing the app to a wider audience.

---

## Executive Summary

The current architecture is **not ready for public release**. A single page load generates **~652 API requests**, which would exhaust the free tier (100,000 requests/day) after just **~154 users**. However, with targeted optimizations, the app could support **10,000+ daily users** on a **$5-25/month** budget.

### Key Metrics

| Metric | Current | After Optimization |
|--------|---------|-------------------|
| Requests per page load | 652 | ~50-80 |
| Free tier capacity | ~154 users/day | ~1,500-2,000 users/day |
| $5/month capacity | ~500 users/day | ~5,000-10,000 users/day |

---

## Part 1: Current Architecture Analysis

### 1.1 Request Breakdown (Per Page Load)

```
Component                    Requests    Notes
─────────────────────────────────────────────────────────
useFplData (initial)         62          2 bootstrap + 60 manager data
useLiveScoring               2           Only when matches are live
useBenchPoints               294         14 GWs × (1 + 20 managers)
useCaptainSuccess            294         14 GWs × (1 + 20 managers)
─────────────────────────────────────────────────────────
TOTAL                        ~652        Assuming GW15, 20 managers
```

### 1.2 Critical Issues

1. **Massive Duplication**: `useBenchPoints` and `useCaptainSuccess` fetch identical data independently
   - Both call `getLiveGameweek(gw)` for each completed gameweek
   - Both call `getEntryPicks(managerId, gw)` for each manager/gameweek combination
   - **~294 duplicate requests** per page load

2. **No Request Deduplication**: Same endpoint called multiple times without caching layer

3. **Uniform Cache TTL**: All data cached for 5 minutes, including:
   - Historical gameweeks (immutable, should cache forever)
   - Bootstrap data (changes rarely, could cache 6-24 hours)
   - Live scores (needs 1-5 minute cache)

4. **Hardcoded Configuration**:
   - League ID: `242017` in `config.ts`
   - Manager limit: `20` hardcoded in `useFplData.ts:103`
   - No URL-based league selection

5. **No Persistence**: Full data refetch on every page refresh

### 1.3 Architecture Diagram (Current)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Vercel)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │  useFplData │  │useBenchPts  │  │useCaptainSuc│  ← No shared    │
│  │  62 reqs    │  │  294 reqs   │  │  294 reqs   │    cache layer  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                         │
│         └────────────────┴────────────────┘                         │
│                          │ 652 requests                             │
└──────────────────────────┼──────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE WORKER                                 │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Cache Middleware (5 min TTL for ALL requests)                 │ │
│  │  - No differentiation between live/historical data             │ │
│  │  - No KV storage (commented out)                               │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    FPL API (fantasy.premierleague.com)               │
│  - No official rate limits documented                                │
│  - Community observes ~300 req/min before throttling                 │
│  - Risk of IP ban with aggressive usage                              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Part 2: Infrastructure Limits & Costs

### 2.1 Cloudflare Workers

| Tier | Monthly Cost | Requests | Capacity (Current) | Capacity (Optimized) |
|------|-------------|----------|-------------------|---------------------|
| Free | $0 | 100K/day | ~154 users/day | ~1,500 users/day |
| Paid | $5 | 10M/month | ~500 users/day | ~5,000 users/day |
| Paid+ | $5 + $0.30/M | Unlimited | Scales | Scales |

**KV Storage (for persistent caching):**
- Free: 1GB storage, 100K reads/day
- Paid: $0.50/GB-month, $0.50/M reads

### 2.2 Vercel

| Tier | Monthly Cost | Bandwidth | Function Calls |
|------|-------------|-----------|----------------|
| Hobby (Free) | $0 | 100 GB | 1M |
| Pro | $20 | 1 TB (+$150/TB) | 1M (+$0.60/M) |

**Free Tier Reality**: Static React app uses minimal bandwidth. 100GB supports ~500K-1M page views/month.

### 2.3 FPL API Considerations

- **Unofficial API** - no SLA or guarantees
- **Observed limits**: ~300 requests/minute before potential throttling
- **Risk**: Heavy usage from single IP could result in temporary ban
- **Mitigation**: Aggressive caching, request spreading, exponential backoff

### 2.4 Cost Projections

| Users/Day | Current Cost | Optimized Cost | Notes |
|-----------|--------------|----------------|-------|
| 100 | $0 (barely fits) | $0 | Free tier |
| 500 | $5 | $0 | Optimization keeps it free |
| 1,000 | $5-10 | $0-5 | Edge of free tier |
| 5,000 | $15-20 | $5 | Paid Worker tier |
| 10,000 | $30-50 | $5-10 | Minimal overage |
| 50,000 | $150+ | $25-40 | Consider enterprise |

---

## Part 3: Required Changes for Public Release

### Phase 1: Critical Optimizations (Week 1-2)

**Priority: MUST DO before any public release**

#### 1.1 Implement React Query / TanStack Query

Replace direct fetch calls with React Query for automatic:
- Request deduplication
- Intelligent caching
- Background refetching
- Stale-while-revalidate

```typescript
// Before: Multiple components fetch same data independently
const { data } = useBenchPoints(managerIds, currentGameweek)
const { data } = useCaptainSuccess(managerIds, currentGameweek)
// = 588 duplicate requests

// After: Shared query cache
const { data: liveGw } = useQuery({
  queryKey: ['liveGameweek', gw],
  queryFn: () => getLiveGameweek(gw),
  staleTime: gw < currentGw ? Infinity : 60_000, // Historical = forever
})
// = 0 duplicate requests
```

**Impact**: Eliminates ~294 duplicate requests (45% reduction)

#### 1.2 Tiered Cache TTLs in Worker

```typescript
// worker/src/index.ts
const CACHE_RULES = {
  '/bootstrap-static': 6 * 60 * 60,     // 6 hours (rarely changes)
  '/fixtures': 60 * 60,                  // 1 hour
  '/event/*/live': 60,                   // 1 minute (live scores)
  '/entry/*/event/*/picks': 24 * 60 * 60, // 24 hours (historical picks)
  '/leagues-classic/*/standings': 5 * 60, // 5 minutes
  default: 5 * 60                         // 5 minutes
}
```

**Impact**: Reduces repeat requests for static data by 90%+

#### 1.3 Lazy Load Historical Stats

```typescript
// Don't load BenchPoints/CaptainSuccess until visible
const BenchPoints = lazy(() => import('./BenchPoints'))

// Or use intersection observer
const { ref, inView } = useInView({ triggerOnce: true })
{inView && <BenchPoints {...props} />}
```

**Impact**: Defers ~588 requests until user scrolls

#### 1.4 Shared Historical Data Hook

```typescript
// New: useHistoricalData.ts
export function useHistoricalData(managerIds, currentGameweek) {
  // Single source of truth for all historical GW data
  // Both BenchPoints and CaptainSuccess consume this
  const liveGameweeks = useQueries(...)
  const managerPicks = useQueries(...)

  return { liveGameweeks, managerPicks, loading, error }
}
```

**Impact**: Eliminates ALL duplication between features

### Phase 2: Multi-League Support (Week 2-3)

#### 2.1 URL-Based League Selection

```typescript
// Routes
/                           → Landing page (league search)
/league/:leagueId           → Dashboard for specific league
/league/:leagueId/manager/:id → Manager detail view

// URL: /league/242017
const { leagueId } = useParams()
const { standings } = useFplData(leagueId)
```

#### 2.2 League Search Component

```typescript
// New: LeagueSearch.tsx
function LeagueSearch() {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()

  // FPL API doesn't have search, so:
  // Option A: User enters league ID directly
  // Option B: Build search index (requires database)

  return (
    <form onSubmit={() => navigate(`/league/${query}`)}>
      <input
        placeholder="Enter league ID"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
    </form>
  )
}
```

#### 2.3 Recent Leagues (localStorage)

```typescript
// Store recently viewed leagues locally
const RECENT_LEAGUES_KEY = 'tapas-recent-leagues'

function useRecentLeagues() {
  const [leagues, setLeagues] = useState<League[]>(() =>
    JSON.parse(localStorage.getItem(RECENT_LEAGUES_KEY) || '[]')
  )

  const addLeague = (league: League) => {
    const updated = [league, ...leagues.filter(l => l.id !== league.id)].slice(0, 5)
    localStorage.setItem(RECENT_LEAGUES_KEY, JSON.stringify(updated))
    setLeagues(updated)
  }

  return { leagues, addLeague }
}
```

### Phase 3: Database & User Accounts (Week 4-6)

**Only needed if you want:**
- User accounts with saved leagues
- Private league access (requires FPL auth)
- Historical trend data
- Push notifications

#### 3.1 Database Options

| Option | Cost | Pros | Cons |
|--------|------|------|------|
| Cloudflare D1 | Free (5GB) | Same platform as Workers | SQLite limitations |
| Supabase | Free (500MB) | Postgres, auth built-in | Cold starts |
| PlanetScale | Free (5GB) | MySQL, branching | Complexity |
| Neon | Free (0.5GB) | Postgres, serverless | Storage limit |

**Recommendation**: Cloudflare D1 for simplicity (same deploy pipeline)

#### 3.2 Schema (Minimal)

```sql
-- Users (optional - only if auth needed)
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Favorite leagues per user
CREATE TABLE user_leagues (
  user_id TEXT,
  league_id INTEGER,
  league_name TEXT,
  added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, league_id)
);

-- Cached FPL data snapshots (optional)
CREATE TABLE gameweek_snapshots (
  league_id INTEGER,
  gameweek INTEGER,
  data JSON,
  captured_at DATETIME,
  PRIMARY KEY (league_id, gameweek)
);
```

#### 3.3 Authentication Options

| Option | Integration | Cost |
|--------|-------------|------|
| Cloudflare Access | Easy with Workers | Free (50 users) |
| Firebase Auth | SDK available | Free (50K MAU) |
| Supabase Auth | Postgres integration | Free |
| Auth0 | Full-featured | Free (7K MAU) |

**Recommendation**: Skip auth initially. URL-based league sharing works without accounts.

### Phase 4: Performance Enhancements (Ongoing)

#### 4.1 Request Batching in Worker

```typescript
// New endpoint: /api/batch
app.post('/api/batch', async (c) => {
  const { requests } = await c.req.json()
  // requests = ['/bootstrap-static', '/fixtures/1', ...]

  const results = await Promise.all(
    requests.map(path => fetchFromFpl(path))
  )

  return c.json({ results })
})
```

**Impact**: Single HTTP request for multiple data fetches

#### 4.2 Service Worker Caching (PWA)

```typescript
// sw.ts - Cache static FPL data client-side
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/api/bootstrap-static')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          caches.open('fpl-data').then(cache =>
            cache.put(event.request, response.clone())
          )
          return response
        })
      )
    )
  }
})
```

#### 4.3 Incremental Loading

```typescript
// Load essential data first, historical in background
async function loadDashboard(leagueId) {
  // Critical path - show standings immediately
  const [bootstrap, standings] = await Promise.all([
    getBootstrapStatic(),
    getLeagueStandings(leagueId)
  ])
  render({ bootstrap, standings }) // First paint

  // Background - load manager details
  const managerDetails = await loadManagerDetails(standings.managers)
  render({ bootstrap, standings, managerDetails }) // Enhanced view

  // Deferred - historical stats
  requestIdleCallback(() => {
    loadHistoricalStats(managerDetails)
  })
}
```

---

## Part 4: Feature Roadmap for Public Release

### MVP for Public (Must Have)

- [ ] **League ID input** - Let users enter any league ID
- [ ] **URL sharing** - `/league/:id` routes for bookmarking
- [ ] **Recent leagues** - localStorage history
- [ ] **Request optimization** - React Query + cache improvements
- [ ] **Error handling** - Graceful failures when FPL API is down
- [ ] **Loading states** - Skeleton screens, progressive loading
- [ ] **Mobile optimization** - Touch targets, responsive tables

### Nice to Have

- [ ] **League search** - Would require database to index leagues
- [ ] **User accounts** - Save favorite leagues, preferences
- [ ] **Push notifications** - "Match starting soon", "Your captain scored"
- [ ] **Historical trends** - Charts showing position over time
- [ ] **H2H comparisons** - Compare two managers directly
- [ ] **PWA support** - Offline access, install prompt

### Future (Database Required)

- [ ] **Private league access** - Requires FPL authentication proxy
- [ ] **Season archives** - Store historical seasons
- [ ] **Aggregate statistics** - "Average captain points across all users"
- [ ] **Social features** - Comments, predictions

---

## Part 5: Implementation Checklist

### Week 1: Critical Optimizations

```
[ ] Install React Query / TanStack Query
[ ] Refactor useFplData to use React Query
[ ] Create useHistoricalData shared hook
[ ] Update useBenchPoints to use shared hook
[ ] Update useCaptainSuccess to use shared hook
[ ] Implement tiered cache TTLs in Worker
[ ] Add lazy loading for BenchPoints/CaptainSuccess
[ ] Test: Verify request count reduced to <100 per page load
```

### Week 2: Multi-League Support

```
[ ] Add React Router
[ ] Create landing page with league ID input
[ ] Implement /league/:id routes
[ ] Add league context/state management
[ ] Implement recent leagues (localStorage)
[ ] Update page titles/meta for each league
[ ] Test: Different leagues load correctly
```

### Week 3: Polish & Testing

```
[ ] Error boundaries for API failures
[ ] Retry logic with exponential backoff
[ ] Loading skeletons
[ ] Mobile responsive audit
[ ] Performance audit (Lighthouse)
[ ] Cross-browser testing
[ ] Rate limit handling (429 responses)
```

### Week 4: Soft Launch

```
[ ] Deploy optimized version
[ ] Monitor Cloudflare analytics
[ ] Gather feedback from friends
[ ] Iterate on UX issues
[ ] Monitor for FPL API issues
```

---

## Part 6: Architecture (Target State)

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Vercel)                           │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    React Query Cache                            ││
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐││
│  │  │ Bootstrap    │ │ Standings    │ │ Historical Data (shared) │││
│  │  │ stale: 6hr   │ │ stale: 5min  │ │ stale: Infinity          │││
│  │  └──────────────┘ └──────────────┘ └──────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────┘│
│                              │                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │  Dashboard  │  │ BenchPoints │  │CaptainSucc  │  ← All share    │
│  │             │  │(lazy loaded)│  │(lazy loaded)│    cached data  │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ ~50-80 requests (deduplicated)
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE WORKER                                 │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Smart Cache Middleware                                        │ │
│  │  - Bootstrap: 6 hours                                          │ │
│  │  - Live scores: 1 minute                                       │ │
│  │  - Historical picks: 24 hours                                  │ │
│  │  - Standings: 5 minutes                                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  KV Storage (optional)                                         │ │
│  │  - Persist popular league data                                 │ │
│  │  - Reduce FPL API calls                                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    FPL API                                           │
│  - Minimal requests due to caching layers                            │
│  - Exponential backoff on 429                                        │
│  - Graceful degradation if unavailable                               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Part 7: Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| FPL API rate limiting | Medium | High | Aggressive caching, backoff |
| FPL API changes/breaks | Low | Critical | Monitor, graceful errors |
| Cloudflare outage | Very Low | High | Static fallback page |
| Viral growth exceeds budget | Low | Medium | Usage alerts, caps |

### Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Low adoption | Medium | Low | Start with friend group |
| Legal issues (FPL TOS) | Low | Medium | Non-commercial, attribution |
| Competitor apps | Medium | Low | Focus on niche (mini-leagues) |

---

## Appendix A: Quick Reference

### API Endpoints Used

| Endpoint | Cache TTL | Requests/Load |
|----------|-----------|---------------|
| `/bootstrap-static` | 6 hours | 1 |
| `/fixtures` | 1 hour | 1 |
| `/leagues-classic/{id}/standings` | 5 min | 1 |
| `/entry/{id}/event/{gw}/picks` | 24 hours | 20 × GWs |
| `/entry/{id}/history` | 5 min | 20 |
| `/entry/{id}/transfers` | 5 min | 20 |
| `/event/{gw}/live` | 1 min (live) / 24hr (past) | GWs |

### Cost Calculator

```
Monthly cost = max($0, (requests - 100K×30) / 1M × $0.30) + $5 (if over free tier)

Examples:
- 100 users/day × 80 req × 30 days = 240K requests → $0 (free tier)
- 1,000 users/day × 80 req × 30 days = 2.4M requests → $5
- 10,000 users/day × 80 req × 30 days = 24M requests → $5 + $4.20 = $9.20
```

---

*Document created: December 2024*
*Last updated: December 2024*
