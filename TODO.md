# TODO

## Immediate Tasks

None currently - all immediate tasks completed.

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
- [ ] Set and Forget table - hypothetical points if manager made no transfers all season:
  - [ ] Calculate points from GW1 squad only (no transfers)
  - [ ] Use original captain choice; fall back to vice-captain if captain unavailable
  - [ ] Apply same chip usage (except Wildcard - skip it)
  - [ ] Show comparison: actual points vs set-and-forget points
  - [ ] Highlight managers who would have done better/worse without transfers
- [x] Better position indicators - replace colored dots with text labels (DEF, MID, FWD) in badges
- [x] H2H manager comparison view - Phase 1 complete, see [docs/h2h-plan.md](docs/h2h-plan.md)
- [x] Points breakdown by position (PersonalStats position breakdown)
- [ ] Transfer history timeline
- [ ] Bench Points card enhancements (Statistics page):
  - [ ] Add table showing highest gameweek by bench points per manager
  - [ ] Show highest individual player benched during the season (player name + points)

### Player Modal Improvements
- [x] Per-game expected stats table in History tab:
  - [x] Show xG, xA, xGI per fixture (data already in `PlayerHistory`)
  - [x] Add xGC for defenders/goalkeepers
  - [x] Visual delta: actual vs expected (green/red indicators)
- [x] Per-90 stats section in Overview tab:
  - [x] Already calculated in `usePlayerDetails.ts` (xG90, xA90, xGI90, xGC90)
  - [x] Display in a clear stat row with labels
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
  - [x] GameRewards.module.css - updated with proper nesting for Game Scores
  - [ ] Audit all CSS modules - nesting should mirror actual DOM structure
- [ ] Rename GameRewards component to GameScores for consistency
- [ ] Extract `FixtureCard` from `GameRewards.tsx` into separate component
- [ ] Create shared `Layout` component to eliminate Header duplication:
  - [ ] Create `src/components/Layout.tsx` with Header + content wrapper
  - [ ] Create `src/components/Layout.module.css` with shared styles (max-width: 1200px, margin: 0 auto, padding: 0 1rem)
  - [ ] Update Dashboard to use Layout
  - [ ] Update Statistics to use Layout
  - [ ] Update Analytics to use Layout
  - [ ] Update Roadmap to use Layout
  - [ ] Remove duplicated width/padding styles from individual view CSS modules

### Performance
- [ ] H2H comparison API response time (~884ms) - investigate optimization:
  - [ ] Profile backend endpoint `/api/v1/history/comparison`
  - [ ] Consider caching comparison results
  - [ ] Check if parallel FPL API calls can be optimized

### Polish
- [x] Error boundaries for graceful failure handling (503 "FPL is updating" message)
- [ ] Mobile responsiveness audit (touch targets, responsive tables)
- [ ] Loading skeleton improvements

## Backend

### 🔨 In Progress: Fixture Difficulty Index (FDI)
See [docs/planning/fixture-difficulty-plan.md](docs/planning/fixture-difficulty-plan.md)

Custom fixture difficulty rating (1-5 stars, 0-100 scale) that improves on FPL's inaccurate FDR:
- [ ] Phase 1: Migration 014 - Historical match data (football-data.co.uk, 30+ seasons)
- [ ] Phase 2: Migration 015 - Multi-competition fixtures (API-Football for rest days)
- [ ] Phase 3: TDD tests - Write tests first for all calculations
- [ ] Phase 4: Backend service - FDI calculation with H2H, form, Points Against weights
- [ ] Phase 5: Integration & validation - Backtesting, weight tuning
- [ ] Phase 6: Frontend integration (future)

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

### Free Transfers Calculation Fix (Jan 2026)
- [x] Fixed WC/FH chip detection: JOIN `chip_usage` table (snapshot `chip_used` may be NULL)
- [x] Fixed WC/FH weekly gain: NO +1 during chip week (was incorrectly adding +1)
- [x] Fixed frontend deadline awareness: Send GW+1 after deadline passes
- [x] Added `max(ft, 1)` safety check for minimum 1 FT
- [x] Removed obsolete `useFreeTransfers.ts` from frontend (uses backend API)
- [x] Updated documentation in BACKEND.md and FPL_RULES.md

### Frontend: Game Scores Redesign (Jan 2026)
- [x] Renamed "Game Rewards" to "Game Scores"
- [x] Live match scores with minutes/status indicator
- [x] Match events: goals, assists, own goals, cards, penalties, goalkeeper saves
- [x] Kept bonus points and DefCon sections

### Backend: Dashboard Consolidation (Jan 2026)
- [x] Created `/api/v1/dashboard/league/{id}` endpoint
- [x] Consolidated 60+ FPL API calls into single backend call
- [x] Frontend `useLeagueDashboard` hook with fallback logic
- [x] Cron schedule adjusted to 08:00 UTC for data freshness
- [x] See `backend/docs/dashboard-endpoint-plan.md` for full details

### Frontend: Points Against Feature (Jan 2026)
- [x] Unhide Points Against card on Statistics page
- [x] Connected to backend API

### Frontend: Chips Backend Integration (Jan 2026)
- [x] Updated ChipsRemaining to use backend API
- [x] Removed direct FPL API calls (fixed "chips spam")

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
