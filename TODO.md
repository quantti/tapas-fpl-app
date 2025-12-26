# TODO

## Frontend

### Multi-League Support (Required for Public Release)
- [ ] Landing page with league ID input
- [ ] `/league/:id` routes for URL sharing/bookmarking
- [ ] Remove hardcoded `LEAGUE_ID` from config
- [ ] Recent leagues history (localStorage)
- [ ] League validation and error messages

### UI Enhancements
- [x] Free transfers card - show how many free transfers each manager has
- [ ] Player recommendation modal - clicking a player opens modal with:
  - Next 5 fixtures
  - Last 5 gameweek results
  - xGI stats
  - Current price and recent price changes
- [x] Better position indicators - replace colored dots with text labels (DEF, MID, FWD) in badges
- [ ] H2H manager comparison view
- [ ] Points breakdown by position
- [ ] Transfer history timeline

### Code Quality
- [ ] Refactor CSS modules to follow nested pattern (root class matching filename):
  - [ ] ChipsRemaining.module.css
  - [ ] BenchPoints.module.css
  - [x] FreeTransfers.module.css

### Polish
- [ ] Error boundaries for graceful failure handling
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

## Completed

See CLAUDE.md "Features" section for completed work.

Key completed optimizations:
- React Query / TanStack Query setup
- Shared historical data hook (useHistoricalData)
- Tiered Cloudflare Worker cache TTLs (bootstrap: 5min, live: 2min, etc.)
- React Router for internal navigation
- Dark mode with system preference detection
- Free Transfers with deadline awareness and 2024/25 5 FT max rule
