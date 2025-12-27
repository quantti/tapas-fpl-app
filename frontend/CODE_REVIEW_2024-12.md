# Frontend Code Review Report
**Date:** December 2024
**Scope:** `/frontend/src` (excluding tests)

## Executive Summary

Comprehensive review of the frontend codebase using 5 parallel analysis agents. Overall, the codebase demonstrates solid engineering practices with good TypeScript usage, proper TanStack Query patterns, and clean architecture. However, there are opportunities for improvement, particularly around code duplication, performance optimization, and one critical bug.

---

## 🔴 Critical Issue Found

### Memory Leak in GameweekCountdown

**File:** `src/components/GameweekCountdown.tsx:37-43`

The interval continues running **forever** after the countdown expires:

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    setTimeRemaining(calculateTimeRemaining(deadline))
  }, 1000)
  return () => clearInterval(interval)
}, [deadline])
```

**Problem:** When `timeRemaining` becomes `null`, the component returns `null` but the interval keeps ticking, calling `setState` every second indefinitely.

**Fix:**
```typescript
useEffect(() => {
  const initial = calculateTimeRemaining(deadline)
  if (initial === null) {
    setTimeRemaining(null)
    return  // Don't start interval if already expired
  }

  const interval = setInterval(() => {
    const remaining = calculateTimeRemaining(deadline)
    setTimeRemaining(remaining)
    if (remaining === null) clearInterval(interval)
  }, 1000)

  return () => clearInterval(interval)
}, [deadline])
```

---

## 🟠 Code Duplication (HIGH Priority)

### 1. Player Name Formatting - Duplicated in 5 Files

**Files affected:**
- `ManagerModal.tsx:138-139`
- `RecommendedPlayers.tsx:123-124`
- `PlayerOwnership.tsx:91-92`
- `CaptainDifferentialModal.tsx:95-99`
- (and implicitly in others)

**Current pattern (repeated):**
```typescript
const displayName = player.web_name ||
  `${player.first_name} ${player.second_name}`;
```

**Fix:** Add to `src/utils/formatters.ts`:
```typescript
export function getPlayerDisplayName(player: Player | undefined): string {
  if (!player) return '?';
  return player.web_name || `${player.first_name} ${player.second_name}`;
}
```

### 2. Position Labels/Colors - Duplicated in 3 Files

**Files affected:**
- `RecommendedPlayers.tsx` - POSITION_CONFIG
- `PlayerOwnership.tsx` - positionLabels, positionColors
- `ManagerModal.tsx` - inline conditionals

**Fix:** Create `src/constants/positions.ts`:
```typescript
export const POSITION_LABELS: Record<number, string> = {
  1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD',
};

export const POSITION_COLORS: Record<number, string> = {
  1: '#f59e0b', 2: '#b91c1c', 3: '#1d4ed8', 4: '#15803d',
};
```

---

## 🟡 Missing Performance Optimizations (MEDIUM Priority)

### Missing useMemo in Expensive Computations

| File | Function | Complexity | Fix |
|------|----------|------------|-----|
| `LeagueStandings.tsx:59-109` | `sortedStandings` | O(n log n) + O(n) | Wrap with `useMemo` |
| `PlayerOwnership.tsx:54-82` | `ownershipData` | O(n) iterations | Wrap with `useMemo` |
| `LeaguePositionChart.tsx:56-73` | `chartData` | O(managers × gameweeks) | Wrap with `useMemo` |

**Example fix for LeagueStandings:**
```typescript
const sortedStandings = useMemo(() => {
  return [...standings]
    .map((standing) => { /* ... */ })
    .sort((a, b) => b.liveTotal - a.liveTotal);
}, [standings, isLive, liveData, previousTotals]);
```

---

## 🟡 Code Quality Issues (MEDIUM Priority)

### 1. Magic Numbers

**Files:** `ManagerModal.tsx:87-92`, `useBenchPoints.ts:47`

```typescript
const starters = enrichedPicks.filter((p) => p.position <= 11);  // Magic number
```

**Fix:** Add to constants:
```typescript
export const STARTING_XI_MAX_POSITION = 11;
```

### 2. Error Handling in API Client

**File:** `src/services/api.ts:12-24`

Current code doesn't handle network errors or JSON parsing failures gracefully. Consider adding try/catch around `fetch()` and `response.json()`.

---

## 🔵 React 19 Modernization Opportunities

The codebase is React 18 compatible but could leverage React 19 features:

| Current Pattern | React 19 Alternative | Priority |
|-----------------|---------------------|----------|
| `forwardRef` (if any) | `ref` as regular prop | HIGH when upgrading |
| Manual `useMemo`/`useCallback` | React Compiler auto-memoization | MEDIUM |
| `<Context.Provider>` | `<Context>` directly | LOW |
| `useEffect` for forms | `useActionState` | Consider for new code |

**Note:** The React Compiler is still in beta. Current `useMemo`/`useCallback` usage is correct for React 18.

---

## ✅ Strengths Observed

The codebase demonstrates expert-level patterns in several areas:

1. **TanStack Query Usage** - Proper `staleTime`/`gcTime` configuration, appropriate query keys
2. **TypeScript** - Strong typing throughout, no `any` types in production code
3. **Architecture** - Clean separation: hooks (data), components (UI), views (pages)
4. **CSS Modules** - Consistent naming, proper scoping
5. **Error Boundaries** - Good error handling patterns in async operations
6. **Caching** - Smart use of `Infinity` staleTime for immutable historical data
7. **Performance** - Good use of Maps for O(1) lookups
8. **Accessibility** - WCAG AA color contrast compliance, eslint-plugin-jsx-a11y, axe-core E2E tests

---

## 📋 Recommended Improvement Plan

### Phase 1: Critical Fixes (Do First)
1. **Fix GameweekCountdown memory leak** - ~10 min

### Phase 2: DRY Refactoring (High Value)
2. **Extract `getPlayerDisplayName()` to formatters.ts** - ~15 min
3. **Create `constants/positions.ts`** - ~10 min

### Phase 3: Performance Optimization
4. **Add `useMemo` to LeagueStandings** - ~5 min
5. **Add `useMemo` to PlayerOwnership** - ~5 min
6. **Add `useMemo` to LeaguePositionChart** - ~5 min

### Phase 4: Code Quality
7. **Extract magic numbers to constants** - ~10 min
8. **Improve API error handling** - ~15 min

---

## Summary Table

| Priority | Issue | Impact | Status |
|----------|-------|--------|--------|
| 🔴 Critical | GameweekCountdown memory leak | Intervals run forever after countdown expires | TODO |
| 🟠 High | Player name duplication (5 files) | Maintenance burden, inconsistency risk | TODO |
| 🟠 High | Position constants duplication (3 files) | Same as above | TODO |
| 🟡 Medium | Missing useMemo (3 components) | Unnecessary re-renders on large datasets | TODO |
| 🟡 Medium | Magic numbers | Readability | TODO |
| 🔵 Low | React 19 patterns | Future-proofing | DEFER |
