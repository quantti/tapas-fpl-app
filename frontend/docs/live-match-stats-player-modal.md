# Live Match Stats in Player Modal

**Date:** 2025-01-11
**Status:** Implemented
**Author:** Claude Code

## Overview

Live match statistics are now displayed in the PlayerDetails modal when opened from the ManagerModal during a live gameweek. Users can see real-time match data for players currently playing.

## Features

When a player's match has started (from kickoff through end of gameweek), the modal shows:

- **LIVE/FT badge** - Pulsing "LIVE" during match, "FT" when finished
- **Minutes played** - Current minutes on the pitch
- **Live points** - Real-time point accumulation
- **In-game events** - Goals (⚽), assists (A), yellow cards, red cards
- **Provisional bonus** - Gold badge (B1-B3) when bonus is likely
- **DefCon badge** - Teal "DC" when defensive threshold met
- **Point breakdown** - Expandable list showing points per stat category

## UI Design

```
┌─────────────────────────────────────────────────┐
│ [Photo] Player Name · DEF · Arsenal · £6.2m    │  ← Header (unchanged)
├─────────────────────────────────────────────────┤
│ ▌LIVE  67'                            8 pts    │  ← Live Banner
│   ⚽1  A1  🟨  [B2]  [DC]                       │  ← Live stats row
│   ▼ Point breakdown                             │  ← Expandable
│     Minutes        +2                           │
│     Goals          +4                           │
│     Assists        +3                           │
├─────────────────────────────────────────────────┤
│ [Stats Grid - Points, Form, xG, etc.]          │  ← Existing
└─────────────────────────────────────────────────┘
```

**Visual treatment:**
- Left green accent border (3px) + pulsing "LIVE" badge
- Subtle green-tinted background
- Gold (#ffd700) bonus circle with dashed border when provisional
- Teal (#14b8a6) DefCon badge

## Architecture

### Data Flow

```
Dashboard
  └─ useLiveScoring() → liveData, fixtures, gameweek
       └─ ManagerModal (receives all context)
            └─ PlayerDetails (receives liveContext prop)
                  ├─ usePlayerLiveStats() → computed stats
                  └─ LiveMatchSection (renders stats)
```

### Files Created/Modified

| File | Purpose |
|------|---------|
| `src/hooks/usePlayerLiveStats.ts` | Hook computing all live stats for a player |
| `src/hooks/usePlayerLiveStats.test.ts` | 23 unit tests for the hook |
| `src/features/PlayerDetails/components/LiveMatchSection.tsx` | Pure presentation component |
| `src/features/PlayerDetails/components/LiveMatchSection.test.tsx` | 21 unit tests for the component |
| `src/features/PlayerDetails/components/LiveMatchSection.module.css` | CSS styles |
| `src/features/PlayerDetails/PlayerDetails.tsx` | Added liveContext prop, integrates hook + component |
| `src/features/PlayerDetails/index.ts` | Re-exports LiveContext type |
| `src/components/ManagerModal.tsx` | Passes liveContext to PlayerDetails |
| `vercel.json` | Fixed SPA routing for static files |

### Key Decisions

**Why a hook (`usePlayerLiveStats`) instead of inline computation?**

1. **Testability**: Pure computation can be unit tested without rendering
2. **Reusability**: Same logic can be used in other contexts
3. **Separation of concerns**: Hook handles "what to show", component handles "how to show"
4. **Follows existing patterns**: Matches `useLiveScoring`, `useManagerPicks` architecture

**Why memoize liveContext in ManagerModal?**

The `liveContext` prop passed to PlayerDetails is an object. Without memoization, a new object reference is created on every render, causing PlayerDetails (and any hooks using `liveContext` as a dependency) to re-run unnecessarily. This caused a severe memory leak that froze the browser.

```typescript
// Bad: Creates new object every render → infinite re-renders
<PlayerDetails liveContext={{ gameweek, liveData, fixtures }} />

// Good: Memoized, stable reference
const liveContext = useMemo(
  () => ({ gameweek, liveData, fixtures }),
  [gameweek, liveData, fixtures]
);
<PlayerDetails liveContext={liveContext} />
```

## API

### usePlayerLiveStats Hook

```typescript
interface PlayerLiveStats {
  isLive: boolean;              // Player's match has started
  isInProgress: boolean;        // Match currently in progress (not FT)
  fixture: Fixture | null;      // The player's current fixture
  minutes: number;
  totalPoints: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  officialBonus: number;        // Final bonus (0 until confirmed)
  provisionalBonus: number;     // Calculated bonus (0-3)
  showProvisionalBonus: boolean; // True if >= 60' or finished
  metDefCon: boolean;           // Met DefCon threshold
  explain: ExplainStat[];       // Point breakdown by category
}

function usePlayerLiveStats(
  playerId: number | null,
  elementType: number,
  teamId: number,
  liveContext: LiveContext | undefined
): PlayerLiveStats
```

### LiveMatchSection Component

```typescript
interface Props {
  stats: PlayerLiveStats;
}

function LiveMatchSection({ stats }: Props)
```

Returns `null` when `stats.isLive` is false.

## Test Coverage

- **usePlayerLiveStats**: 23 tests covering:
  - Basic data extraction from live data
  - Fixture finding by team ID
  - Match status (in progress vs finished)
  - Provisional bonus calculation
  - DefCon threshold for all positions
  - Edge cases (no live data, no fixture, player not in match)

- **LiveMatchSection**: 21 tests covering:
  - Rendering conditions (live vs not live, in progress vs FT)
  - Event icon display (goals, assists, cards)
  - Bonus badge (provisional, official, no bonus)
  - DefCon badge
  - Point breakdown expand/collapse
  - Multiplier display for countable stats

## Bug Fixes During Implementation

1. **Dark mode unreadable text**: Used non-existent `--color-text-secondary` CSS variable
   - Fix: Changed to `--color-text-muted`

2. **Confusing multiplier display**: Showed "81×" for minutes which doesn't make sense
   - Fix: Created `COUNTABLE_STATS` set, only show multiplier for goals/assists/saves etc.

3. **Memory leak freezing browser**: Inline `liveContext={{ ... }}` created new object every render
   - Fix: Memoized with `useMemo`

4. **pitch.svg returning SPA page**: Vercel rewrite rule caught all paths including static files
   - Fix: Changed pattern from `/((?!api/|@|src/|node_modules/).+)` to `/:path([^.]+)` which only matches paths without dots
