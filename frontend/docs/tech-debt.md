# Technical Debt & Code Quality Report

> Generated: December 31, 2025
> Codebase: frontend/src

## Overview

This document tracks identified technical debt, code quality issues, and improvement opportunities. Issues are categorized by priority and include specific file locations for remediation.

---

## Critical Issues (High Priority)

### 1. Map Creation Pattern Duplication

**Impact:** 8 duplicate implementations
**Pattern:** `new Map(array.map((item) => [item.id, item]))`

| Location | Code |
|----------|------|
| `hooks/useFplData.ts:67-68` | playersMap, teamsMap creation |
| `components/ManagerModal.tsx:163-165` | Three maps created identically |
| `components/PlayerModal.tsx:286` | teamsMap creation |
| `components/FixturesTest.tsx:18` | teamsMap creation |
| `utils/liveScoring.ts:157` | livePlayersMap creation |

**Fix:** Create reusable utility functions:
```typescript
// src/utils/mappers.ts
export function createPlayersMap(players: Player[]): Map<number, Player> {
  return new Map(players.map((p) => [p.id, p]))
}

export function createTeamsMap(teams: Team[]): Map<number, Team> {
  return new Map(teams.map((t) => [t.id, t]))
}
```

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

### 3. Time Constant Magic Numbers

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

### 4. Position Type Magic Numbers

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

### 5. PlayerModal.tsx Complexity

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

### 7. Weight Configuration Duplication

**Location:** `hooks/useRecommendedPlayers.ts:36-56`

**Issue:** Three weight configurations (PUNT_WEIGHTS, DEFENSIVE_WEIGHTS, SELL_WEIGHTS) with similar structure.

**Fix:** Consider a weight factory or config builder to reduce repetition.

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

### 9. Type Assertions

**Location:** `hooks/useHistoricalData.ts:122`, `components/ManagerModal.tsx:102-104`

**Issue:** Type assertions (`as Type`) without runtime validation.

**Fix:** Add type guards where critical.

---

### 10. Import Organization

**Issue:** Minor inconsistencies in import grouping.

**Fix:** Enforce with ESLint import sorting rule.

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
- [x] Update all 8 map creation usages
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
- Unit tests: 353 passing
- E2E tests: 83 passing
- Visual snapshots: 12 total (dashboard, statistics, analytics, error states)

---

## Files Requiring Most Attention

| File | Issues | Priority | Status |
|------|--------|----------|--------|
| ~~`components/PlayerModal.tsx`~~ | ~~High complexity~~ Sub-components extracted | ~~Medium~~ | ✅ Resolved |
| ~~`components/ManagerModal.tsx`~~ | ~~Nested helper functions~~ | ~~Medium~~ | ✅ Resolved |
| `hooks/useRecommendedPlayers.ts` | Weight config duplication | Low | Open |
| ~~3 view CSS modules~~ | ~~Spinner/loading duplication~~ | ~~High~~ | ✅ Resolved |
| ~~`hooks/useFplData.ts`~~ | ~~Boolean naming~~ | ~~Medium~~ | ✅ Resolved |
