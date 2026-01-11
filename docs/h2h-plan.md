# Head-to-Head Manager Comparison

Planning document for the H2H manager comparison feature.

**Last Updated:** 2026-01-11
**Status:** Phase 1 + Tier 2 + Tier 3 Complete

## Current Implementation Status

### ✅ Completed Features

**Season Overview:**
- Total Points (with point difference display)
- Overall Rank
- League Rank
- Last 5 GW Average (form/trend indicator)

**Transfers:**
- Total Transfers (season)
- Remaining FT (free transfers available)
- Hits Taken (count)
- Points Lost (from hits)

**Captain:**
- Captain Points (total from captaincy)
- Differential Picks (non-template captain choices)

**Chips:**
- Used (current half)
- Remaining (current half)

**Value:**
- Squad Value
- Bank

**Playstyle (Template Overlap):**
- League Template overlap score (0-11 players matching)
- World Template overlap score (global FPL ownership)
- Playstyle labels: Template / Balanced / Differential / Maverick
- Progress bar visualization with color coding

**Squad (Roster Comparison):**
- Shared players (dimmed display)
- Manager A only (highlighted)
- Manager B only (highlighted)
- Player positions shown via position badges

**Head-to-Head Record:**
- Wins / Losses / Draws GW-by-GW record
- Best GW (gameweek + points)
- Worst GW (gameweek + points)

**Analytics (Tier 1 + 2 + 3):**
- Consistency Score: StdDev of GW points (lower = more consistent)
- Bench Waste Rate: Avg bench points as % of total
- Hit Frequency: % of GWs with hits taken
- Form Momentum: "Improving" / "Stable" / "Declining" (3-GW trend, ±5% threshold)
- Recovery Rate: Average points scored after red arrow GWs
- **Luck Index:** Actual vs expected points (xG-based, positive = lucky)
- **Captain xP Delta:** Captain actual vs expected points
- **Squad xP:** Total expected points from starting XI
- InfoTooltip component for metric explanations

**Files:**
- `frontend/src/services/queries/useHeadToHeadComparison.ts` - Core data hook (backend API)
- `frontend/src/features/HeadToHead/HeadToHead.tsx` - UI component (~540 lines)
- `frontend/src/features/HeadToHead/HeadToHead.module.css` - Styling
- `frontend/src/components/InfoTooltip/` - Accessible tooltip component
- `frontend/tests/analytics.spec.ts` - E2E tests (11 H2H tests)
- `backend/app/services/calculations.py` - Pure calculation functions
- `backend/tests/test_history_service.py` - 92 tests including boundary tests
- `backend/docs/head-to-head-enhancement-plan.md` - Detailed backend plan

---

## Research: Industry Best Practices

Based on analysis of FPL tools (LiveFPL, FPL Review, Fantasy Football Hub) and other fantasy sports platforms (ESPN, Yahoo, Sleeper, Fantrax, DraftKings).

### Common Stats Compared Across Platforms

| Category | FPL | NFL/NBA Fantasy |
|----------|-----|-----------------|
| **Total Points** | Season total, GW average | Season total, weekly average |
| **Points Against** | League rank | H2H scoring, schedule luck |
| **Transfers/Moves** | Transfer count, hits | Add/drop activity, waiver priority |
| **Roster Value** | Team value, ITB | Salary cap space |
| **Efficiency** | Points per million | Points per $1000, VORP |
| **Luck Metrics** | Expected vs actual | Schedule-adjusted wins |
| **Historical** | Season rank history | All-time H2H record |
| **Form** | Last 5 GW average | Last 4 weeks performance |
| **Differentials** | Unique players | Roster overlap % |

### UI Patterns

**Side-by-Side Layout** (Most Common - what we use)
- Two columns, one per manager
- Team name at top
- Metrics listed vertically
- Color coding: Green for better, red for worse
- Summary/totals at bottom

**Innovative Features from Other Platforms:**

1. **Sleeper's Win Probability** - Visual meter showing projected winner
2. **ESPN's Position Breakdown** - Shows advantage at each position (GK, DEF, MID, FWD)
3. **Yahoo's Trade Analyzer** - Compare then propose trades for differentials
4. **Fantrax Historical Trends** - Rank trajectories overlaid on same chart
5. **LiveFPL's Virtual League** - Compare any two managers (even across leagues)
6. **Fantasy Football Hub's "Manager DNA"** - Categorizes play style

---

## Future Enhancements

### Phase 3: Visual Enhancements

#### 3.1 Points Per Gameweek Chart
Line chart showing both managers' points per GW overlaid:
- X-axis: Gameweeks
- Y-axis: Points
- Two lines (one per manager)
- Hover for details
- Use Recharts (already in project dependencies)

#### 3.2 Position Breakdown
Points by position with color indicators:
```
         Manager A    Manager B
GK:          42    ◄    38      (green/red)
DEF:        187    ►   201
MID:        312    ◄   298
FWD:        189    ►   195
```

#### 3.3 Fixture Difficulty Comparison
Next 5 GWs average fixture difficulty for each manager's squad

### Phase 3 (continued): Transfer Analytics

#### 3.4 Transfer ROI
Points gained/lost from transfers:
```typescript
interface TransferROI {
  pointsFromTransfersIn: number   // Points scored by players transferred in
  pointsFromTransfersOut: number  // Points scored by players transferred out (if kept)
  netGain: number
}
```

### Phase 4: Advanced Features

#### 4.1 Rank Trajectory Chart
Bump chart showing both managers' overall rank over the season:
- Divergence points highlighted
- Key events annotated (chips, hits)
- Use Recharts AreaChart or LineChart

#### 4.2 Manager DNA Profile
Categorize managers by behavior patterns:
- **Template Player**: >70% template ownership
- **Differential Hunter**: <50% template, many punts
- **Early Adopter**: Transfers in rising players early
- **Set and Forget**: Low transfer count
- **Hit Taker**: High hit count for short-term gains

#### 4.3 "Key Differential" Highlight
The player most likely to decide the matchup:
- Owned by one manager only
- High expected points for upcoming GW
- Could swing the H2H result

#### 4.4 Share as Image
Generate shareable comparison graphic for social media

---

## Data Requirements

### Already Available
- `managerDetails` from `useFplData`: totalPoints, rank, teamValue, bank, chipsUsed
- `historyQueries` from `useHeadToHeadComparison`: GW history, transfers, chips
- `useHistoricalData`: liveDataByGw, picksByManagerAndGw (for captain analysis)
- `useBenchPoints`: bench points per manager
- `useCaptainDifferential`: captain differential data

### Need to Fetch/Calculate
- Position breakdown: Need to aggregate points by position from picks + live data
- Transfer ROI: Need to track transfer history and calculate counterfactuals
- Roster overlap: Compare picks arrays between managers
- Fixture difficulty: Use existing `calculateFixtureScore` utility

---

## UI Design

### Current Layout (Matchup Style)
```
┌─────────────────────────────────────────────────────┐
│  [Team A Name]      VS      [Team B Name]           │
├─────────────────────────────────────────────────────┤
│  Season Overview                                    │
│  1,234  ──── Total Points ────  1,198              │
│  45,678 ──── Overall Rank ────  52,341             │
│  3      ──── League Rank  ────  5                  │
│  52.4   ──── Last 5 GW Avg ───  48.2               │
│                                                     │
│        [Team A leads by 36 pts]                     │
├─────────────────────────────────────────────────────┤
│  Transfers                                          │
│  ...                                                │
└─────────────────────────────────────────────────────┘
```

### Proposed: Tabbed Sections
Keep current view as "Overview" tab, add:
- **Overview** (current) - Season stats
- **Roster** - Side-by-side team with differentials
- **History** - GW-by-GW comparison chart
- **Analysis** - Position breakdown, transfer ROI, manager DNA

---

## Implementation Priority

| Feature | Priority | Complexity | Impact | Phase | Status |
|---------|----------|------------|--------|-------|--------|
| Template overlap | MEDIUM | LOW | MEDIUM | 1 | ✅ Done |
| Roster comparison | HIGH | LOW | HIGH | 1 | ✅ Done |
| H2H record | LOW | MEDIUM | MEDIUM | 1 | ✅ Done |
| Best/Worst GW | MEDIUM | LOW | MEDIUM | 1 | ✅ Done |
| Consistency score | MEDIUM | LOW | MEDIUM | 1 | ✅ Done |
| Bench waste rate | LOW | LOW | LOW | 1 | ✅ Done |
| Hit frequency | LOW | LOW | LOW | 1 | ✅ Done |
| Form momentum | MEDIUM | LOW | MEDIUM | 2 | ✅ Done |
| Recovery rate | MEDIUM | LOW | LOW | 2 | ✅ Done |
| **Points per GW chart** | HIGH | MEDIUM | HIGH | 3 | Pending |
| **Position breakdown** | HIGH | MEDIUM | HIGH | 3 | Pending |
| Fixture difficulty | MEDIUM | LOW | MEDIUM | 3 | Pending |
| Transfer ROI | MEDIUM | HIGH | MEDIUM | 3 | Pending |
| Rank trajectory chart | MEDIUM | MEDIUM | HIGH | 3 | Pending |
| Manager DNA | LOW | HIGH | MEDIUM | 4 | Pending |
| Share as image | LOW | HIGH | MEDIUM | 4 | Pending |

---

## References

### FPL Tools Analyzed
- LiveFPL.net - Live comparison, differential highlighting
- FPL Review - xP-based analysis, fixture difficulty
- Fantasy Football Hub - Manager profiles, ROI tracking
- Fantasy Football Scout - H2H mini-league focus

### Other Fantasy Platforms
- ESPN Fantasy - Win probability, position breakdown
- Yahoo Fantasy - Trade analyzer integration
- Sleeper - Mobile-first UX, live animations, in-app chat
- Fantrax - Deep historical analysis, trend overlays
- DraftKings - Ownership differential highlighting

### Key Insights
1. **Color coding is essential** - Green/red for advantage/disadvantage
2. **Historical context matters** - Show trends, not just current state
3. **Highlight differentials** - Unique players are most interesting
4. **Make it actionable** - Connect comparison to decisions (transfers, trades)
5. **Mobile-first design** - Sleeper's card-based approach works well
