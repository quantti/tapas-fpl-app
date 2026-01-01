# Technical Debt & Code Quality Report

> Generated: December 31, 2025 (Updated: January 1, 2026 - Issues #3-5, #10, #13, #14, #16, #17 marked resolved)
> Codebase: frontend/src

## Overview

This document tracks identified technical debt, code quality issues, and improvement opportunities. Issues are categorized by priority and include specific file locations for remediation.

---

## Critical Issues (High Priority)

### 1. Map Creation Pattern Duplication ✅ RESOLVED

**Original Impact:** 8 duplicate implementations of `new Map(array.map((item) => [item.id, item]))`

**Resolution:** Created `src/utils/mappers.ts` with reusable utility functions:
- `createPlayersMap(players)` - Player ID → Player
- `createTeamsMap(teams)` - Team ID → Team
- `createLivePlayersMap(liveData)` - Player ID → LivePlayer

**Files updated:**
- `hooks/useFplData.ts` - uses createPlayersMap, createTeamsMap
- `components/ManagerModal.tsx` - uses all three mapper functions
- `components/PlayerModal.tsx` - uses createTeamsMap
- `components/HistoryTable.tsx` - uses createTeamsMap
- `components/FixturesTest.tsx` - uses createTeamsMap
- `utils/liveScoring.ts` - uses createLivePlayersMap

**Test coverage:** 10 unit tests in `utils/mappers.test.ts`

**Note:** `LeagueStandings.tsx` has a different map type (managerDetails by managerId) which is a one-off use case, not covered by common mappers.

---

### 2. Loading/Spinner CSS Duplication ✅ RESOLVED

**Original Impact:** 3 view files with copy-pasted spinner CSS
**Resolution:** Created reusable `<Spinner />` and `<LoadingState />` components

**Fixed files:**
- `views/Dashboard.module.css` - removed duplicate `.loading`, `.spinner`, `@keyframes spin`
- `views/Statistics.module.css` - removed duplicate `.loading`, `.spinner`, `@keyframes spin`
- `views/Analytics.module.css` - removed duplicate `.loading`, `.spinner`, `@keyframes spin`

**New components:**
- `components/Spinner.tsx` - accessible spinner with size variants (sm/md/lg)
- `components/Spinner.module.css` - single source of truth for spinner animation
- `components/LoadingState.tsx` - centered wrapper with optional message
- `components/LoadingState.module.css` - layout styles for loading state

**Test coverage:** 13 tests (6 for Spinner, 7 for LoadingState)

**Note:** Original assessment listed 11 files. Audit revealed only 3 view files had the actual spinner CSS with `@keyframes spin`. Other component files have simpler text-based loading styles without the spinner animation.

---

### 3. Time Constant Magic Numbers ✅ RESOLVED

**Impact:** Maintenance burden, inconsistency risk

**Occurrences:**
- `5 * 60 * 1000` (5 minutes) - 4 places
- `30 * 60 * 1000` (30 minutes) - 5 places
- `60 * 60 * 1000` (1 hour) - 5 places
- `60 * 1000` (1 minute) - 3 places

**Fix:** Add to `config.ts`:
```typescript
export const CACHE_TIMES = {
  ONE_MINUTE: 60_000,
  FIVE_MINUTES: 5 * 60_000,
  TEN_MINUTES: 10 * 60_000,
  THIRTY_MINUTES: 30 * 60_000,
  ONE_HOUR: 60 * 60_000,
} as const
```

---

### 4. Position Type Magic Numbers ✅ RESOLVED

**Impact:** 10+ occurrences, reduced readability

**Problem:** Using `element_type === 1/2/3/4` instead of named constants.

**Examples:**
- `components/PlayerModal.tsx:308-309` - `player.element_type === 1`
- `hooks/useRecommendedPlayers.ts:119, 241` - `p.element_type !== 1`
- `utils/templateTeam.ts` - Multiple occurrences

**Fix:** Constants exist in `constants/positions.ts` but aren't used:
```typescript
// Add to constants/positions.ts
export const POSITION_TYPES = {
  GOALKEEPER: 1,
  DEFENDER: 2,
  MIDFIELDER: 3,
  FORWARD: 4,
} as const

// Usage:
if (player.element_type === POSITION_TYPES.GOALKEEPER)
```

---

### 5. PlayerModal.tsx Complexity ✅ RESOLVED

**Impact:** 267-line `renderContent()` function, high cyclomatic complexity

**Location:** `components/PlayerModal.tsx:288-555`

**Issues:**
- ~15+ conditional branches
- Duplicate delta calculations (lines 313-319)
- Position-specific stats grid with 4 conditional blocks (lines 377-428)
- Delta legends with 3-level nested ternaries (lines 431-537)

**Fix:** Extract sub-components:
```typescript
// Proposed structure:
<PlayerHeader player={player} teams={teamsMap} />
<PlayerStatsGrid player={player} details={details} />
<PerformanceDeltaSection player={player} details={details} />
<FixturesList fixtures={upcoming} teams={teamsMap} />
<SeasonHistory history={history} />
```

---

## Medium Priority Issues

### 6. ManagerModal Nested Helper Functions ✅ RESOLVED

**Original Location:** `components/ManagerModal.tsx:150-276` (126 lines)

**Original Issues:**
- Multiple nested helper functions defined inside render
- `getOpponentInfo` recreated logic from elsewhere
- `teamFixtureMap` creation duplicated `buildTeamFixtureMap`
- `getShirtUrl` duplicated `PitchPlayer.getShirtUrl`

**Resolution:** Extracted to shared utilities and reused existing code:
- `buildTeamFixtureMap()` - imported from `utils/autoSubs.ts`
- `hasFixtureStarted()` - new function in `utils/autoSubs.ts` (9 tests)
- `getOpponentInfo()` - new function in `utils/autoSubs.ts` (4 tests)
- `getShirtUrl()` - reused `PitchPlayer.getShirtUrl` static method

**Impact:** Removed ~25 lines of duplicate code, added 9 tests for new utilities

---

### 7. Weight Configuration Duplication — WON'T FIX

**Location:** Now in `utils/playerScoring.ts` (extracted during #12)

**Decision:** Keep separate weight configs with shared `PositionWeights` type.

**Rationale:**
- All three configs (PUNT, DEFENSIVE, SELL) need different values for different use cases
- Shared TypeScript type `PositionWeights` ensures consistent structure
- A factory/builder would add complexity without reducing code or improving clarity
- Current design is explicit and easy to understand

---

### 8. Inconsistent Boolean Naming ✅ RESOLVED

**Original Issue:** Mixed patterns for boolean variables

| Pattern | Examples |
|---------|----------|
| Good (has prefix) | `isLive`, `isLoading`, `isOpen` |
| ~~Inconsistent~~ | ~~`loading`~~ → now `isLoading` |

**Resolution:** Renamed `loading` to `isLoading` in `hooks/useFplData.ts` and all 3 consumers:
- `hooks/useFplData.ts` - renamed variable and return value
- `views/Dashboard.tsx` - updated destructuring and usage
- `views/Statistics.tsx` - updated destructuring and usage
- `views/Analytics.tsx` - updated destructuring and usage

**Note:** `error` was not changed as it's not a boolean (it's `string | null`).

---

## Low Priority Issues

### 9. Type Assertions — WON'T FIX

**Location:** `hooks/useHistoricalData.ts:78,124`, `components/ManagerModal.tsx:105-114`

**Decision:** Keep current type assertions - they're standard TypeScript patterns.

**Rationale:**
- `Promise.all` returns `unknown[]` - assertions are necessary for typed results
- Object literal assertions (e.g., `{} as ManagerPicks`) are standard for constructing typed objects
- Runtime validation would add overhead without benefit (API responses are already validated by TypeScript types)
- These are not "unsafe" casts - they're typing hints for the compiler

---

### 10. Import Organization ✅ RESOLVED

**Original Issue:** Minor inconsistencies in import grouping across files.

**Resolution:** Added `eslint-plugin-import` with `import/order` rule:
- Groups: builtin → external → internal → parent → sibling → index → type
- Alphabetized imports within each group
- Blank lines between groups for visual separation

**Files updated:**
- `eslint.config.js` - Added import plugin and import/order rule
- All source files auto-fixed with `eslint --fix`

---

## Strengths (Preserve These Patterns)

- **Error Handling:** Custom `FplApiError` class preserves HTTP status, 503 graceful handling
- **Async Patterns:** `Promise.all` for parallel fetching, proper React Query config
- **TypeScript:** Comprehensive type definitions, good use of generics
- **Documentation:** Well-documented utility functions with JSDoc
- **Separation of Concerns:** Clean division of hooks/utils/components
- **Historical Data Optimization:** `staleTime: Infinity` for immutable data

---

## Implementation Plan

### Phase 1: Quick Wins ✅ COMPLETED
- [x] Create `src/utils/mappers.ts` with createPlayersMap/createTeamsMap/createLivePlayersMap
- [x] Add CACHE_TIMES to `src/config.ts`
- [x] Add POSITION_TYPES to `src/constants/positions.ts`
- [x] Update all 8 map creation usages (Issue #1 ✅ RESOLVED)
- [x] Update all time magic numbers (5 files)
- [x] Update all position magic numbers (4 files)

### Phase 2: Component Extraction ✅ COMPLETED
- [x] Create `<Spinner />` component with size variants (sm/md/lg)
- [x] Create `<LoadingState />` wrapper component
- [x] Remove duplicate CSS from 3 view files
- [x] Add 13 unit tests (TDD approach)

### Phase 3: PlayerModal Refactoring ✅ COMPLETED
**Goal:** Reduce cognitive complexity through pure function extraction and component decomposition

**Completed:**
- [x] Extract pure utility functions to `src/utils/playerStats.ts` (TDD)
  - `formatDelta()` - Format numbers with +/- sign
  - `getDeltaClass()` - Returns 'positive'/'negative' CSS class (with inverted logic support)
  - `getGoalsDeltaLegend()` - "scored X more/fewer than xG"
  - `getAssistsDeltaLegend()` - "X more/fewer assists than xA"
  - `getGoalsConcededDeltaLegend()` - "conceded X more/fewer than expected"
  - `getGoalInvolvementsDeltaLegend()` - "X more/fewer G+A than expected"
  - `getSeasonSummary()` - Position-specific season stats string
- [x] Add 24 unit tests for extracted utilities
- [x] Refactor PlayerModal to use new utilities
- [x] Extract sub-components: `PlayerHeader`, `PlayerStatsGrid`, `PerformanceDeltas`
- [x] ~~Extract ManagerModal helper functions~~ → Resolved via shared utilities
- [x] ~~Standardize boolean naming~~ → `loading` renamed to `isLoading`
- [x] Verify all existing tests pass (16 unit + 4 E2E visual snapshots)

**Impact:**
- `renderContent()` reduced from ~180 lines to ~40 lines
- Extracted 3 sub-components with clear single responsibilities
- Delta legend section reduced from 36 lines to 15 lines
- Season row section reduced from 12 lines to 3 lines
- Logic is now testable in isolation (24 pure function tests)
- No additional unit tests needed - existing 16 tests provide coverage

---

## Test Coverage Improvements

### templateTeam.ts ✅ RESOLVED
**Original Issue:** 186-line utility with complex algorithm had NO unit tests.

**Resolution:** Created `src/utils/templateTeam.test.ts` with 19 unit tests covering:
- `calculateOwnership()` - ownership percentage calculations, edge cases
- `buildTemplateTeam()` - position ordering, tiebreakers, insufficient players
- `getFormationString()` - formation string generation

### Analytics Page E2E ✅ RESOLVED
**Original Issue:** Only basic E2E coverage for Analytics view.

**Resolution:** Created `tests/analytics.spec.ts` with 19 E2E tests:
- Responsive layout tests (mobile/tablet/desktop)
- Recommendation card visibility and interaction
- Player modal open/close functionality
- Visual snapshots for all viewports

**Current Test Counts:**
- Unit tests: 387 passing (+51 playerScoring tests, -24 duplicate hook tests, +7 others)
- E2E tests: 83 passing
- Visual snapshots: 12 total (dashboard, statistics, analytics, error states)

---

## Architecture Improvements (From Analysis)

### High Priority

#### 11. Query Key Factory Missing ✅ RESOLVED

**Original Impact:** Scattered query key definitions across hooks, risk of typos and cache invalidation issues

**Resolution:** Created `services/queryKeys.ts` with centralized type-safe query key factory.

**Files updated:**
- `services/queryKeys.ts` - New centralized factory with 9 query keys
- `hooks/useFplData.ts` - Updated 4 query keys (bootstrap, eventStatus, standings, managerDetails)
- `hooks/useRecommendedPlayers.ts` - Updated 1 query key (fixturesAll)
- `hooks/usePlayerDetails.ts` - Updated 1 query key (playerSummary)
- `hooks/useHistoricalData.ts` - Updated 2 query keys (liveGameweek, entryPicks)
- `hooks/useLeaguePositionHistory.ts` - Updated 1 query key (entryHistory)
- `hooks/useFreeTransfers.ts` - Updated 1 query key (entryHistory)

**Query keys defined:**
```typescript
export const queryKeys = {
  bootstrap: ['bootstrap'] as const,
  eventStatus: ['eventStatus'] as const,
  fixturesAll: ['fixtures-all'] as const,
  standings: (leagueId: number) => ['standings', leagueId] as const,
  managerDetails: (managerId: number, gameweekId: number | undefined) =>
    ['managerDetails', managerId, gameweekId] as const,
  entryHistory: (managerId: number) => ['entryHistory', managerId] as const,
  entryPicks: (managerId: number, gameweek: number) =>
    ['entryPicks', managerId, gameweek] as const,
  liveGameweek: (gameweek: number) => ['liveGameweek', gameweek] as const,
  playerSummary: (playerId: number | undefined) =>
    ['playerSummary', playerId] as const,
} as const
```

**Benefits:**
- Type-safe query keys prevent typos
- Single source of truth for cache invalidation
- Easier refactoring of key structure
- Better IDE autocomplete support

---

#### 12. useRecommendedPlayers.ts Too Large ✅ RESOLVED

**Original Issue:** 306-line hook mixing pure scoring functions with data fetching logic.

**Resolution:** Extracted pure functions to `utils/playerScoring.ts` (TDD approach):

**New file: `utils/playerScoring.ts` (239 lines):**
- `isEligibleOutfieldPlayer()` - Eligibility check (outfield, available, min minutes)
- `calculatePlayerStats()` - Per-90 stats calculation
- `getPercentile()` - Percentile ranking against distribution
- `calculatePlayerPercentiles()` - Composite percentile calculation
- `calculateBuyScore()` - Score for punt/defensive recommendations
- `calculateSellScore()` - Score for "time to sell" recommendations
- `calculateFixtureScore()` - Weighted fixture difficulty score
- `calculateLeagueOwnership()` - League ownership percentage calculation
- Weight configs: `PUNT_WEIGHTS`, `DEFENSIVE_WEIGHTS`, `SELL_WEIGHTS`, `FIXTURE_WEIGHTS`

**Test coverage:** `utils/playerScoring.test.ts` with 51 unit tests

**Result:**
- `hooks/useRecommendedPlayers.ts` reduced from 366 → 191 lines (48% smaller)
- `hooks/useRecommendedPlayers.test.tsx` reduced from 609 → 385 lines (duplicate unit tests removed)
- All scoring logic now testable in isolation
- Hook focuses purely on data fetching and orchestration

---

### Medium Priority

#### 13. Historical Data Fetching Duplication ✅ RESOLVED

**Original Impact:** Multiple hooks fetching same `/entry/{id}/event/{gw}/picks/` pattern

**Resolution:** Created `hooks/useHistoricalData.ts` as shared data fetching hook:
- Fetches all completed gameweek data (live scoring + manager picks)
- Uses `staleTime: Infinity` for immutable completed gameweek data
- TanStack Query deduplication prevents redundant API calls
- Single source of truth for historical data

**Files updated:**
- `hooks/useBenchPoints.ts` - imports and uses `useHistoricalData`
- `hooks/useCaptainSuccess.ts` - imports and uses `useHistoricalData`

**Benefits:**
- Eliminates duplicate API fetching across hooks
- Optimal caching for immutable historical data
- Cleaner separation: useHistoricalData fetches, consumer hooks calculate

---

#### 14. Fixture State Checking Scattered ✅ RESOLVED

**Original Issue:** Fixture state checking logic duplicated across views and components.

**Resolution:** Centralized in `utils/liveScoring.ts` and `utils/autoSubs.ts`:

**New utilities in `utils/liveScoring.ts`:**
- `isFixtureLive(fixture)` - Check if fixture is in play (started && !finished && !finished_provisional)
- `hasGamesInProgress(fixtures)` - Check if any fixtures in list are in progress
- `allFixturesFinished(fixtures)` - Check if all fixtures are finished (provisional)
- `hasAnyFixtureStarted(fixtures)` - Check if any fixture has started

**Existing utilities in `utils/autoSubs.ts`:**
- `hasFixtureStarted(teamId, map)` - Check if team's fixture has started (for showing points)
- `isPlayerFixtureFinished(teamId, map)` - Check if team's fixture is finished

**Files updated:**
- `views/Dashboard.tsx` - uses `hasGamesInProgress()`, `allFixturesFinished()`
- `components/LeagueStandings.tsx` - uses `hasGamesInProgress()`, `hasAnyFixtureStarted()`
- `components/FixturesTest.tsx` - uses `isFixtureLive()`

**Test coverage:** 10 new tests in `utils/liveScoring.test.ts` (397 total unit tests)

---

#### 15. Prop Drilling Through Multiple Levels — WON'T FIX

**Decision:** Keep explicit props over React Context.

**Rationale:**
- Props are explicit and traceable (easier debugging)
- TanStack Query already handles caching/deduplication
- Context for frequently-updating data causes unnecessary re-renders
- Current prop depth (2-3 levels) is manageable
- Maps are already memoized at view level

---

### Low Priority

#### 16. Manual Polling vs TanStack Query refetchInterval ✅ RESOLVED

**Original Issue:** Manual `setInterval` for live data polling instead of TanStack Query built-in.

**Resolution:** Refactored `hooks/useLiveScoring.ts` to use TanStack Query's `refetchInterval`:
```typescript
const { data, dataUpdatedAt, refetch } = useQuery({
  queryKey: queryKeys.liveGameweek(gameweek),
  queryFn: () => fplApi.getLiveGameweek(gameweek),
  enabled: gameweek > 0,
  refetchInterval: isLive ? pollInterval : false,
  staleTime: isLive ? 0 : 5 * 60 * 1000, // Always fresh when live, 5min when not
})
```

**Benefits:**
- Removed ~30 lines of manual interval management code
- Automatic cleanup on unmount (no manual clearInterval)
- Better integration with TanStack Query's caching/deduplication
- `dataUpdatedAt` provides accurate timestamp (vs manual `lastUpdated` state)
- Consistent polling behavior across live data and fixtures queries

**Files updated:**
- `hooks/useLiveScoring.ts` - Complete rewrite using TanStack Query
- `hooks/useLiveScoring.test.ts` - Updated tests with QueryClientProvider wrapper

**Test coverage:** All 12 hook tests pass (397 total unit tests)

---

#### 17. Feature Folder Structure ✅ RESOLVED

**Original Issue:** Flat `components/` with 22 files mixed concerns.

**Resolution:** Implemented feature folder structure:

```
features/
├── BenchPoints/           # BenchPoints.tsx + .module.css + index.ts
├── CaptainSuccess/        # CaptainSuccess.tsx + DifferentialModal + index.ts
├── FreeTransfers/         # FreeTransfers.tsx + .module.css + index.ts
├── LeaguePosition/        # LeaguePosition.tsx (chart) + index.ts
├── PlayerDetails/         # PlayerDetails.tsx + HistoryTable + index.ts
└── Recommendations/       # Recommendations.tsx + index.ts

services/queries/          # Data-fetching hooks (moved from hooks/)
├── useBenchPoints.ts
├── useCaptainSuccess.ts
├── useFplData.ts
├── useFreeTransfers.ts
├── useHistoricalData.ts
├── useLeaguePositionHistory.ts
├── useLiveScoring.ts
├── usePlayerDetails.ts
└── useRecommendedPlayers.ts

hooks/                     # UI-only hooks (theme, release notification)
├── useTheme.ts
├── useReleaseNotification.ts
└── useCookieConsent.ts

components/                # Truly shared UI components
├── Card.tsx, CardHeader.tsx
├── Modal.tsx, PitchLayout.tsx, PitchPlayer.tsx
├── LoadingState.tsx, Spinner.tsx
├── Header.tsx, ThemeToggle.tsx
└── ...etc
```

**Benefits:**
- Clear separation: features vs shared components vs data hooks
- Co-located CSS modules within feature folders
- Barrel exports (`index.ts`) for clean imports
- Data-fetching hooks isolated in `services/queries/`

---

#### 18. TanStack Table + React Compiler Compatibility

**Status:** Known issue - monitoring for TanStack Table v9

**Impact:** React Compiler shows `react-hooks/incompatible-library` warning for components using TanStack Table.

**Root Cause:**
TanStack Table's `useReactTable()` hook returns getter functions that create new object references on each call. This breaks React Compiler's memoization assumptions.

```typescript
// TanStack Table pattern - getters return new objects each call
const table = useReactTable({...})
table.getRowModel()  // New object every time
table.getHeaderGroups()  // New object every time
```

**Current Impact:** Near zero for small tables (~38 rows in HistoryTable). React Compiler simply skips optimizing that component and uses React's normal diffing.

**Future Concerns:** If implementing large tables (e.g., all 750+ FPL players):

| Solution | Tradeoff |
|----------|----------|
| `'use no memo'` directive | Disables React Compiler for that file |
| `@tanstack/react-virtual` | Add windowing for 1000+ row tables |
| Wait for TanStack Table v9 | May include React Compiler fixes |

**Affected File:** `src/features/PlayerDetails/components/HistoryTable.tsx`

**Decision:** Accept warning for now. Monitor TanStack Table v9 release notes. Add virtualization when implementing all-players table.

---

#### 19. Path Aliases Configuration ✅ IMPLEMENTED

**Why:** Cleaner imports with absolute paths instead of `../../utils/foo`.

**Files Configured:**
- `tsconfig.app.json` - TypeScript path aliases
- `vite.config.ts` - Vite resolve aliases (must match TypeScript)
- `vitest.config.ts` - Vitest resolve aliases (required for tests)
- `eslint.config.js` - pathGroups for import/order rule

**Available Aliases:**
```typescript
import { Card } from 'components/Card'       // src/components/
import { useFplData } from 'services/queries/useFplData'  // src/services/
import { formatDelta } from 'utils/playerStats'  // src/utils/
import { CACHE_TIMES } from 'config'          // src/config.ts
import type { Player } from 'types/fpl'       // src/types/
import { POSITION_TYPES } from 'constants/positions'  // src/constants/
import { BenchPoints } from 'features/BenchPoints'  // src/features/
import Logo from 'assets/logo.svg?react'      // src/assets/
```

**ESLint pathGroups:** Required to recognize aliased imports as "internal" group for proper sorting:
```javascript
pathGroups: [
  { pattern: 'assets/**', group: 'internal', position: 'before' },
  { pattern: 'components/**', group: 'internal', position: 'before' },
  // ...etc for all aliases
]
```

**Gotcha:** Vitest needs its own `resolve.alias` config separate from Vite - tests will fail without it.

---

## Architecture Strengths (Preserve These)

- **Central `useFplData` hook** provides bootstrap data to all views
- **Effective `useMemo`** usage for maps and computed values
- **Co-located CSS Modules** prevent style conflicts
- **Tests next to source files** aids discoverability
- **Proper `enabled` flags** for dependent queries
- **`staleTime: Infinity`** for immutable historical data

---

## State Management Architecture

### Current Approach (Keep This)

TanStack Query handles all server state. This is the correct pattern and aligns with 2025 React best practices.

**Why TanStack Query is sufficient:**
- Automatic caching, deduplication, background refetching
- Built-in loading/error states
- Optimistic updates when needed
- The majority of our "state" is server state from FPL API

### When to Use React Context

**Do use Context for:**
- Derived Maps that multiple components need (`playersMap`, `teamsMap`)
- Low-frequency updates (theme, auth state)
- Data that changes together (bootstrap elements → playersMap + teamsMap)

**Don't use Context for:**
- Live data that polls frequently (`liveData`, `fixtures`) — causes unnecessary re-renders
- Manager-specific data (`picks`, `managerInfo`) — fetch in consuming component
- Any data where selective subscriptions matter

### When to Add Zustand (Future)

**2025 industry consensus:** TanStack Query + Zustand is the modern standard, but don't add Zustand preemptively.

**Add Zustand only when:**
1. Multiple unrelated components need to share client-side state
2. You need selective subscriptions (update one slice without re-rendering others)
3. State updates are frequent and Context re-renders become a performance issue
4. You have genuine client-side state (not server state)

**Current assessment:** Not needed. Map utilities (`createPlayersMap`, `createTeamsMap`) with `useMemo` are sufficient.

### Reference: 2025 React State Management Landscape

| Tool | Weekly Downloads | Use Case |
|------|------------------|----------|
| TanStack Query | 5.3M+ | Server state (we use this) |
| Zustand | 4.5M+ | Client state when needed |
| Redux Toolkit | 3.8M+ | Complex apps, time-travel debugging |
| Jotai | 1.5M+ | Atomic state, fine-grained reactivity |
| MobX | 1.2M+ | Observable patterns, class-based |

**TkDodo (TanStack Query maintainer):** "When using TanStack Query, you often don't need additional client state management."

---

## Files Requiring Most Attention

| File | Issues | Priority | Status |
|------|--------|----------|--------|
| ~~`components/PlayerModal.tsx`~~ | ~~High complexity~~ Sub-components extracted | ~~Medium~~ | ✅ Resolved |
| ~~`components/ManagerModal.tsx`~~ | ~~Nested helper functions~~ | ~~Medium~~ | ✅ Resolved |
| ~~`hooks/useRecommendedPlayers.ts`~~ | ~~306 lines~~ → 191 lines, pure funcs extracted | ~~High~~ | ✅ Resolved |
| ~~`services/queryKeys.ts`~~ | ~~Missing - scattered query keys~~ | ~~High~~ | ✅ Resolved |
| ~~`utils/mappers.ts`~~ | ~~Map creation duplication~~ → 10 tests | ~~High~~ | ✅ Resolved |
| ~~`hooks/useBenchPoints.ts`~~ | ~~Duplicates historical data fetching~~ → uses useHistoricalData | ~~Medium~~ | ✅ Resolved |
| ~~`hooks/useCaptainSuccess.ts`~~ | ~~Duplicates historical data fetching~~ → uses useHistoricalData | ~~Medium~~ | ✅ Resolved |
| ~~3 view CSS modules~~ | ~~Spinner/loading duplication~~ | ~~High~~ | ✅ Resolved |
| ~~`hooks/useFplData.ts`~~ | ~~Boolean naming~~ | ~~Medium~~ | ✅ Resolved |
| ~~Flat components/ folder~~ | ~~22 files mixed concerns~~ → feature folders | ~~Low~~ | ✅ Resolved |
| `HistoryTable.tsx` | TanStack Table + React Compiler warning | Low | Known Issue |
| ~~Path aliases~~ | ~~Relative imports `../../`~~ → absolute | ~~Low~~ | ✅ Resolved |
