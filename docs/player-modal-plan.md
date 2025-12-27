# Player Modal Implementation Plan

## Overview

A compact modal that appears when clicking on a player in RecommendedPlayers (or other player lists). Shows key transfer decision information at a glance.

## Research Summary

Based on research of FPL tools (FPL Review, Fantasy Football Scout, LiveFPL), managers want:
- Price + ownership at a glance
- Form vs season average
- Upcoming fixture difficulty
- xG/xA vs actual (over/underperformance)
- Recent gameweek points breakdown

## Available Data

All data is available from existing FPL API:

| Category | Fields | Source |
|----------|--------|--------|
| **Basic** | name, team, position, status, news | `Player` (bootstrap) |
| **Price** | `now_cost`, `selected_by_percent` | `Player` |
| **Points** | `total_points`, `form`, `points_per_game` | `Player` |
| **Season Stats** | goals, assists, clean_sheets, minutes, bonus | `Player` |
| **xG/xA** | `expected_goals`, `expected_assists`, `expected_goal_involvements` | `Player` |
| **ICT** | influence, creativity, threat, `ict_index` | `Player` |
| **Fixtures** | `team_h_difficulty`, `team_a_difficulty` (FDR 1-5) | `Fixture` |
| **History** | per-GW points, minutes, goals, assists | `/element-summary/{id}` (new) |

## Modal Design

```
┌─────────────────────────────────────────────────┐
│ [Shirt] Mohamed Salah           £13.2m  ↑0.3    │
│         Liverpool • MID         24.5% owned     │
│         ✓ Available                             │
├─────────────────────────────────────────────────┤
│  SEASON           │  FORM (30 days)             │
│  142 pts          │  8.2 ppg                    │
│  12 G  8 A        │  ▲ above avg                │
├─────────────────────────────────────────────────┤
│  UNDERLYING STATS                               │
│  xG: 10.8 (+1.2)  │  xA: 6.4 (+1.6)            │
│  ICT: 312         │  2,340 mins                 │
├─────────────────────────────────────────────────┤
│  NEXT 5 FIXTURES                                │
│  CHE   BOU   NEW   WHU   LIV                    │
│  (H)   (A)   (H)   (A)   (H)                    │
│  [3]   [2]   [2]   [2]   [5]    Avg: 2.8       │
│  🟡    🟢    🟢    🟢    🔴                      │
├─────────────────────────────────────────────────┤
│  LAST 5 GAMEWEEKS                               │
│  GW18: 12  │ GW17: 6  │ GW16: 8  │ ...         │
└─────────────────────────────────────────────────┘
```

### Color Coding

**Fixture Difficulty (FDR):**
- 1-2: Green (easy)
- 3: Yellow (medium)
- 4-5: Red (hard)

**xG Delta:**
- Positive (+1.2): Green (overperforming)
- Negative (-1.2): Red (underperforming)

**Form vs PPG:**
- Form > PPG: Green arrow up
- Form < PPG: Red arrow down

## Implementation Tasks

### 1. API Layer
- [ ] Add `getElementSummary(playerId)` to `api.ts`
- [ ] Add `ElementSummary` type to `fpl.ts`

### 2. Hook
- [ ] Create `usePlayerDetails.ts` hook
  - Fetches element-summary on demand
  - Caches with React Query (staleTime: 5min)

### 3. Utilities
- [ ] Create `getNextFixtures(teamId, fixtures, count)` helper
- [ ] Create `formatPrice(nowCost)` helper (divide by 10)
- [ ] Create `getFdrColor(difficulty)` helper

### 4. Components
- [ ] Create `PlayerModal.tsx`
  - Sections: Header, Stats, xG, Fixtures, History
  - Reuse existing `Modal.tsx` wrapper
- [ ] Create `PlayerModal.module.css`
- [ ] Create `FixtureTicker.tsx` (reusable fixture display)

### 5. Integration
- [ ] Make RecommendedPlayers rows clickable
- [ ] Pass player data to modal on click
- [ ] Add loading state while fetching element-summary

### 6. Testing
- [ ] Unit tests for helpers
- [ ] Component tests for PlayerModal
- [ ] E2E test for modal interaction

## Scope for v1 (Keep It Small)

**Include:**
- Header with price, ownership, status
- Season stats (points, goals, assists)
- xG/xA with delta calculation
- Next 5 fixtures with FDR colors
- Last 5 GW points

**Skip for v1:**
- Price change predictions (needs external data)
- Transfer velocity tracking
- Per-90 stats normalization
- Comparison with other players

## Files to Create/Modify

```
frontend/src/
├── services/api.ts              # Add getElementSummary
├── types/fpl.ts                 # Add ElementSummary type
├── hooks/usePlayerDetails.ts    # New hook
├── utils/fixtures.ts            # New helpers
├── components/
│   ├── PlayerModal.tsx          # New component
│   ├── PlayerModal.module.css   # New styles
│   ├── FixtureTicker.tsx        # New component (optional)
│   └── RecommendedPlayers.tsx   # Make rows clickable
└── tests/
    └── player-modal.spec.ts     # E2E tests
```

## Element Summary API Response

Endpoint: `/element-summary/{player_id}/`

```typescript
interface ElementSummary {
  fixtures: {
    id: number
    event: number
    team_h: number
    team_a: number
    difficulty: number
    is_home: boolean
    // ...
  }[]
  history: {
    element: number
    fixture: number
    opponent_team: number
    total_points: number
    was_home: boolean
    kickoff_time: string
    team_h_score: number
    team_a_score: number
    round: number
    minutes: number
    goals_scored: number
    assists: number
    clean_sheets: number
    // ... all per-GW stats
  }[]
  history_past: {
    season_name: string
    total_points: number
    // ... season totals
  }[]
}
```

## Notes

- Modal should be mobile-friendly (full-width on small screens)
- Consider swipe gestures for fixture list on mobile
- Keep animations minimal for performance
- Reuse existing Modal.tsx component for consistency
