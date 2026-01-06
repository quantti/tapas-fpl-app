# TODO

## Immediate Tasks

### 1. Frontend: Integrate Chips Backend API
- [ ] Update `ChipsRemaining` component to call backend API instead of direct FPL calls
- [ ] Use `GET /api/v1/chips/league/{league_id}?current_gameweek=N&sync=true`
- [ ] Remove direct FPL API calls (fixes "chips spam" issue)
- [ ] Test locally before deploying

### 2. Frontend: Activate Points Against Feature
- [ ] Unhide Points Against card on Statistics page
- [ ] Connect to backend API `GET /api/v1/points-against`
- [ ] Test locally before deploying

### 3. Fix Flaky E2E Tests
- [ ] Investigate why 47 tests fail intermittently (element not found errors)
- [ ] Increase timeouts or add better wait conditions
- [ ] Consider mocking FPL API responses for stability

---

## Frontend

### Multi-League Support (Required for Public Release)
- [ ] Landing page with league ID input
- [ ] `/league/:id` routes for URL sharing/bookmarking
- [ ] Remove hardcoded `LEAGUE_ID` from config
- [ ] Recent leagues history (localStorage)
- [ ] League validation and error messages

### UI Enhancements
- [x] Free transfers card - show how many free transfers each manager has
- [ ] Player recommendation modal - see [docs/player-modal-plan.md](docs/player-modal-plan.md)
- [x] Better position indicators - replace colored dots with text labels (DEF, MID, FWD) in badges
- [x] H2H manager comparison view - Phase 1 complete, see [docs/h2h-plan.md](docs/h2h-plan.md)
- [x] Points breakdown by position (PersonalStats position breakdown)
- [ ] Transfer history timeline
- [ ] Bench Points card enhancements (Statistics page):
  - [ ] Add table showing highest gameweek by bench points per manager
  - [ ] Show highest individual player benched during the season (player name + points)

### Player Modal Improvements
- [ ] Per-game expected stats table in History tab:
  - [ ] Show xG, xA, xGI per fixture (data already in `PlayerHistory`)
  - [ ] Add xGC for defenders/goalkeepers
  - [ ] Visual delta: actual vs expected (green/red indicators)
- [ ] Per-90 stats section in Overview tab:
  - [ ] Already calculated in `usePlayerDetails.ts` (xG90, xA90, xGI90, xGC90)
  - [ ] Display in a clear stat row with labels
- [ ] Form trend mini-chart (sparkline of last 5 GWs)
- [ ] Price change history from `history_past`

### Player Recommendations Improvements
- [ ] Per-game xStats analysis (not just season totals):
  - [ ] Weight recent games more heavily (rolling 5-game xG90/xA90)
  - [ ] Detect form inflection points (sudden improvement/decline)
- [ ] Add "Why?" tooltip explaining recommendation:
  - [ ] Show key stats driving the score
  - [ ] Fixture difficulty breakdown
- [ ] Filter by price range (budget punts vs premium)
- [ ] Filter by position (show DEF-only, MID-only, etc.)
- [ ] "Rising Stars" category: players with improving xG90 trend

### Code Quality
- [ ] Split `frontend/CLAUDE.md` if it exceeds 40k chars (currently ~15k):
  - Candidates: testing docs, feature docs, FPL API reference
- [ ] Refactor CSS modules to follow nested pattern (root class matching filename):
  - [ ] ChipsRemaining.module.css
  - [ ] BenchPoints.module.css
  - [x] FreeTransfers.module.css
  - [ ] GameRewards.module.css - nesting doesn't reflect DOM hierarchy
  - [ ] Audit all CSS modules - nesting should mirror actual DOM structure (e.g., `.bonusRow` should be nested inside `.rewardsList` if that's the parent in JSX)
- [ ] Extract `FixtureCard` from `GameRewards.tsx` into separate component
- [ ] Create shared `Layout` component to eliminate Header duplication:
  - [ ] Create `src/components/Layout.tsx` with Header + content wrapper
  - [ ] Create `src/components/Layout.module.css` with shared styles (max-width: 1200px, margin: 0 auto, padding: 0 1rem)
  - [ ] Update Dashboard to use Layout
  - [ ] Update Statistics to use Layout
  - [ ] Update Analytics to use Layout
  - [ ] Update Roadmap to use Layout
  - [ ] Remove duplicated width/padding styles from individual view CSS modules

### Polish
- [x] Error boundaries for graceful failure handling (503 "FPL is updating" message)
- [ ] Mobile responsiveness audit (touch targets, responsive tables)
- [ ] Loading skeleton improvements

## Backend

### Phase 2: Expected Points Engine
- [ ] xP calculation with all components
- [ ] Expected minutes prediction
- [ ] BPS projection
- [ ] Stub endpoint exists at `/api/analytics/expected-points/{player_id}`

### Phase 3: Transfer Optimizer
- [ ] MILP-based transfer optimization (HiGHS solver)
- [ ] Squad constraints
- [ ] Multi-week horizon
- [ ] Hit calculation
- [ ] Stub endpoint exists at `/api/analytics/optimize-transfers`

## Infrastructure

### Database (Required for Some Features)
- [ ] Set up Supabase/Neon for persistent storage
- [ ] Historical data tracking across gameweeks
- [ ] Ownership trends over time
- [ ] Season-over-season comparisons
- [ ] Scheduled data snapshots via background jobs

### Nice to Have
- [ ] PWA support (offline access, install prompt)
- [ ] Push notifications ("Match starting soon", "Your captain scored")

---

## Recently Completed

### Backend: Chips Remaining API (Jan 2026)
- [x] Database schema (`chip_usage` table with season half support)
- [x] ChipsService with sync from FPL API
- [x] API endpoints (`/api/v1/chips/league/{id}`, `/api/v1/chips/manager/{id}`)
- [x] Concurrent sync with `asyncio.gather()` and rate limiting
- [x] Error handling (429, 502, 504)
- [x] Deployed to Fly.io

---

## Completed

See CLAUDE.md "Features" section for completed work.

Key completed optimizations:
- React Query / TanStack Query setup
- Shared historical data hook (useHistoricalData)
- Tiered Cloudflare Worker cache TTLs (bootstrap: 5min, live: 2min, etc.)
- React Router for internal navigation
- Dark mode with system preference detection
- Free Transfers with deadline awareness and 2024/25 5 FT max rule
