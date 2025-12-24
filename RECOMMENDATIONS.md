# Recommended Players Feature

Planning document for the Punts and Defensive Options recommendation system.

## Overview

Two categories of player recommendations:
1. **Punts** - Low ownership, high potential differential picks
2. **Defensive Options** - Template players you should consider owning

## Data Sources

**Good news: FPL API provides all needed data!**

| Stat | Source | Field |
|------|--------|-------|
| xG | FPL API | `expected_goals` |
| xA | FPL API | `expected_assists` |
| xGI | FPL API | `expected_goal_involvements` |
| xGC | FPL API | `expected_goals_conceded` |
| Form | FPL API | `form` |
| Global ownership | FPL API | `selected_by_percent` |
| League ownership | Calculated | From managerDetails picks |
| Fixture difficulty | FPL API | `team_h_difficulty`, `team_a_difficulty` |
| Minutes | FPL API | `minutes` |
| ICT Index | FPL API | `ict_index`, `threat`, `creativity`, `influence` |

**No new API calls needed** - all data already fetched by existing hooks.

### Optional Future Enhancement

Understat integration for advanced stats (requires backend):
- npxG (non-penalty xG)
- xGChain
- xGBuildup
- Shot location data

Would require:
- Backend scraping service
- Player ID mapping (FPL ID ↔ Understat ID)
- Caching layer

## Algorithm Design

### Per-90 Calculations

```typescript
interface PlayerStats {
  xG90: number      // expected_goals / (minutes / 90)
  xA90: number      // expected_assists / (minutes / 90)
  xGI90: number     // expected_goal_involvements / (minutes / 90)
  xGC90: number     // expected_goals_conceded / (minutes / 90)
}

function calculatePer90(player: Player): PlayerStats | null {
  const minutes90 = player.minutes / 90
  if (minutes90 < 5) return null // Not enough data

  return {
    xG90: parseFloat(player.expected_goals) / minutes90,
    xA90: parseFloat(player.expected_assists) / minutes90,
    xGI90: parseFloat(player.expected_goal_involvements) / minutes90,
    xGC90: parseFloat(player.expected_goals_conceded) / minutes90,
  }
}
```

### Fixture Score Calculation

```typescript
// Next 5 gameweeks, weighted (nearer = more important)
const weights = [0.35, 0.25, 0.20, 0.12, 0.08]

function calculateFixtureScore(
  teamId: number,
  fixtures: Fixture[],
  currentGW: number
): number {
  const upcoming = fixtures
    .filter(f => f.event && f.event > currentGW && f.event <= currentGW + 5)
    .sort((a, b) => a.event! - b.event!)

  return upcoming.reduce((sum, f, i) => {
    const isHome = f.team_h === teamId
    const difficulty = isHome ? f.team_h_difficulty : f.team_a_difficulty
    const easeScore = (5 - difficulty) / 4  // Convert 1-5 difficulty to 1-0 ease
    return sum + easeScore * (weights[i] || 0)
  }, 0)
}
```

### PUNTS Score

Target: Players that could be difference-makers with low ownership.

**Key design decision:** Low ownership is a **filter requirement**, not a scoring factor. If a player has <40% league ownership, they qualify as a punt. The score then ranks them by quality metrics only.

```typescript
// Base score calculation
BASE_PUNT_SCORE = (
  xG90_percentile × 0.35 +             // Good underlying attacking stats
  xA90_percentile × 0.25 +
  fixture_score × 0.25 +               // Easy upcoming fixtures (next 5 GWs)
  form_percentile × 0.15               // Recent form boost
)

// Position modifiers (mids are most valuable for punts)
POSITION_MODIFIER = {
  MID: 1.3,   // Midfielders get bonus (more points potential)
  FWD: 1.0,   // Forwards baseline
  DEF: 0.8    // Defenders slightly penalized
}

PUNT_SCORE = BASE_PUNT_SCORE × POSITION_MODIFIER[position]
```

**Filters (must pass ALL):**
- League ownership < 40%
- Minutes > 450 (minimum ~5 full games)
- Status = 'a' (available, not injured)
- Position: DEF, MID, or FWD only (exclude GKs)

### DEFENSIVE OPTIONS Score

Target: Template players you should consider if you don't have them.

**Key design decision:** High ownership is a **filter requirement**, not a scoring factor. If a player has >50% league ownership, they qualify as a defensive pick. The score then ranks them by form and fixtures.

```typescript
DEFENSIVE_SCORE = (
  form_percentile × 0.50 +             // In-form players (primary factor)
  fixture_score × 0.50                 // Good upcoming fixtures (next 5 GWs)
)
```

**Filters (must pass ALL):**
- League ownership > 50% AND < 100% (exclude players everyone owns)
- Minutes > 450 (minimum ~5 full games)
- Status = 'a' (available)
- Position: DEF, MID, or FWD only (exclude GKs)

### Position-Specific Weighting

| Position | xG Weight | xA Weight | xGC Weight | Clean Sheet |
|----------|-----------|-----------|------------|-------------|
| GK | 0.0 | 0.0 | 0.4 | 0.6 |
| DEF | 0.15 | 0.15 | 0.3 | 0.4 |
| MID | 0.35 | 0.35 | 0.1 | 0.2 |
| FWD | 0.5 | 0.3 | 0.0 | 0.2 |

## UI Design

### Location
Statistics page - new card spanning 2 columns (like StatsCards)

### Layout - Clean Side by Side Cards

```
┌─────────────────────────┐  ┌─────────────────────────┐
│ 🎲 PUNTS                │  │ 🛡️ DEFENSIVE OPTIONS     │
│                         │  │                         │
│ 🟢 Palmer    CHE ★★★★☆  │  │ 🔵 Salah     LIV ★★★★★  │
│ 🔵 Mbeumo    BRE ★★★☆☆  │  │ 🟢 Haaland   MCI ★★★★☆  │
│ 🟢 McNeil    EVE ★★★★☆  │  │ 🔴 Alexander ARS ★★★★☆  │
│ 🔴 Gabriel   ARS ★★★☆☆  │  │ 🔵 Saka      ARS ★★★★☆  │
│ 🔵 Watkins   AVL ★★★★☆  │  │ 🟢 Isak      NEW ★★★☆☆  │
└─────────────────────────┘  └─────────────────────────┘
```

### Design Decisions
- **10 players per category**
- **Clean UI** - no stats, just essentials
- **Shirt/jersey icon** with team colors
- **Position colors**: DEF = red, MID = blue, FWD = green
- **Stars** for fixture difficulty (5 = easiest, 1 = hardest)
- **No GKs** - excluded from both categories

### Row Information
- Position color indicator (colored dot or shirt)
- Player name
- Team short name (3 letters)
- Fixture difficulty stars (next 5 GWs)

## Implementation Plan

### Files to Create

1. **`src/utils/recommendations.ts`**
   - `calculatePer90Stats(player: Player)`
   - `calculateFixtureScore(teamId, fixtures, currentGW)`
   - `calculatePuntScore(player, stats, leagueOwnership, fixtureScore)`
   - `calculateDefensiveScore(player, stats, leagueOwnership, fixtureScore)`
   - `getPercentile(value, allValues)`

2. **`src/hooks/useRecommendedPlayers.ts`**
   - Input: bootstrap, fixtures, managerDetails, currentGameweek
   - Output: `{ punts: RecommendedPlayer[], defensive: RecommendedPlayer[] }`
   - Handles all filtering, scoring, and sorting

3. **`src/components/RecommendedPlayers.tsx`**
   - Two-column layout
   - Player rows with stats
   - Fixture difficulty visualization

4. **`src/components/RecommendedPlayers.module.css`**
   - Styling following existing patterns

### Data Flow

```
bootstrap-static ─────┐
                      │
fixtures ─────────────┼──► useRecommendedPlayers ──► RecommendedPlayers
                      │         hook                    component
managerDetails ───────┘
(league ownership)
```

## Future Enhancements

### Phase 2 - Per-Fixture Analysis (requires element-summary API)
- **Recency-weighted xGI**: Weight recent gameweeks higher (GW25 matters more than GW5)
- **xGI vs fixture difficulty**: Find players who maintain output against tough opponents
  - Fetch element-summary for top candidates (~10-15 API calls)
  - Compare per-fixture xG+xA against opponent difficulty rating
  - Bonus for players with high xGI in tough games
  - Example: 0.8 xGI vs difficulty 4-5 = more valuable than 0.8 xGI vs difficulty 1-2
- Player detail modal with recent fixture breakdown

### Phase 3
- Position filtering (GK/DEF/MID/FWD tabs)
- Price bracket filtering (budget/mid/premium)
- "Why recommended" expandable explanation

### Phase 4
- Player comparison tool
- Watchlist functionality
- Transfer suggestions based on current team

### Phase 5 (requires backend)
- Understat integration for npxG, xGChain
- Historical performance tracking
- Price change predictions

## Open Questions

1. **How many players per category?** 5? 10? Configurable?
2. **Filter by position?** Combined list or separate?
3. **Show players owned by everyone?** Still useful to highlight
4. **Include price in scoring?** Value picks vs raw quality
5. **Minimum minutes threshold?** Too low = unreliable, too high = misses emerging players

## References

- FPL API types: `src/types/fpl.ts`
- Existing ownership calculation: `src/components/PlayerOwnership.tsx`
- Fixture data usage: `src/hooks/useFplData.ts`
