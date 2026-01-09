# Head-to-Head Manager Comparison

Planning document for the H2H manager comparison feature.

## Current Implementation Status

### Completed Features

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

**Playstyle (Template Overlap):** ✅
- League Template overlap score (0-11 players matching)
- World Template overlap score (global FPL ownership)
- Playstyle labels: Template / Balanced / Differential / Maverick
- Progress bar visualization with color coding

**Tier 2 Analytics:** ✅
- Form Momentum: "Improving" / "Stable" / "Declining" (based on 3-GW trend, ±5% threshold)
- Recovery Rate: Average points scored after red arrow GWs
- InfoTooltip component for metric explanations

**Files Created/Modified:**
- `frontend/src/services/queries/useHeadToHeadComparison.ts` - Core data hook (uses backend API)
- `frontend/src/features/HeadToHead/HeadToHead.tsx` - UI component
- `frontend/src/features/HeadToHead/HeadToHead.module.css` - Styling
- `frontend/src/components/InfoTooltip/` - Accessible tooltip component
- `frontend/tests/analytics.spec.ts` - E2E tests (11 H2H tests)
- `backend/app/services/calculations.py` - Pure calculation functions
- `backend/tests/test_history_service.py` - 92 tests including boundary tests

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

### Phase 1: Quick Wins (Frontend Only)

#### 1.1 Roster Comparison
Show which players each manager owns with differential highlighting:
```
Shared Players: Salah, Haaland, TAA (dimmed)
Manager A only: Palmer, Isak, Gabriel
Manager B only: Saka, Watkins, Van Dijk
```

#### 1.2 Best/Worst Gameweeks
```typescript
interface GameweekExtremes {
  bestGW: { gw: number; points: number }
  worstGW: { gw: number; points: number }
  highestRank: { gw: number; rank: number }
  lowestRank: { gw: number; rank: number }
}
```

#### 1.3 Points Per Gameweek Chart
Line chart showing both managers' points per GW overlaid:
- X-axis: Gameweeks
- Y-axis: Points
- Two lines (one per manager)
- Hover for details

#### 1.4 Bench Points Comparison
Total bench points wasted per manager (data already available from useBenchPoints)

#### 1.5 Captain Success Rate
Percentage of optimal captain picks (when their captain was the highest scorer in their team)

### Phase 2: Enhanced Analytics

#### 2.1 Position Breakdown
Points by position with color indicators:
```
         Manager A    Manager B
GK:          42    ◄    38      (green/red)
DEF:        187    ►   201
MID:        312    ◄   298
FWD:        189    ►   195
```

#### 2.2 Template Overlap Score (League Template)
How "template" each manager is compared to the league's most-owned starting XI.

**Implementation Details:**

**Data Sources:**
- League template: `buildTemplateTeam()` from `utils/templateTeam.ts` (already exists)
- Manager picks: `managerDetails[].picks` with `multiplier > 0` (starting XI only)

**Calculation:**
```typescript
interface TemplateOverlap {
  matchCount: number           // Players matching template (0-11)
  matchPercentage: number      // matchCount / 11 * 100
  matchingPlayerIds: number[]  // Which players match
  differentialPlayerIds: number[]  // Which players don't match
  playstyleLabel: string       // "Template" | "Balanced" | "Differential" | "Maverick"
}
```

**Playstyle Labels (based on match count):**
| Match Count | Label | Description |
|-------------|-------|-------------|
| 9-11 | Template | Follows the consensus |
| 6-8 | Balanced | Mix of template and differentials |
| 3-5 | Differential | Mostly unique picks |
| 0-2 | Maverick | Highly contrarian |

**UI Display:**
```
         Manager A         Manager B
Template: 8/11 (73%)  ►    5/11 (45%)
          Balanced         Differential
```

**Progress Bar Visualization:**
- 11 segments (one per player)
- Filled segments = matching players
- Color coding: green for high overlap, amber for mid, red for low

**Files to Create/Modify:**
- Add `calculateTemplateOverlap()` to `useHeadToHeadComparison.ts`
- Add new section in `HeadToHead.tsx` for Template Overlap display
- Add CSS for progress bar visualization

**Future Enhancement:** Add global FPL template comparison (using `bootstrap.elements` most selected players)

#### 2.3 Transfer ROI
Points gained/lost from transfers:
```typescript
interface TransferROI {
  pointsFromTransfersIn: number   // Points scored by players transferred in
  pointsFromTransfersOut: number  // Points scored by players transferred out (if kept)
  netGain: number
}
```

#### 2.4 Fixture Difficulty Comparison
Next 5 GWs average fixture difficulty for each manager's squad

### Phase 3: Advanced Features

#### 3.1 Historical H2H Record
If managers are in same H2H league:
- Win/Loss/Draw record
- Points scored vs each other
- Head-to-head streak

#### 3.2 Manager DNA Profile
Categorize managers by behavior patterns:
- **Template Player**: >70% template ownership
- **Differential Hunter**: <50% template, many punts
- **Early Adopter**: Transfers in rising players early
- **Set and Forget**: Low transfer count
- **Hit Taker**: High hit count for short-term gains

#### 3.3 Rank Trajectory Chart
Bump chart showing both managers' overall rank over the season:
- Divergence points highlighted
- Key events annotated (chips, hits)

#### 3.4 "Key Differential" Highlight
The player most likely to decide the matchup:
- Owned by one manager only
- High expected points for upcoming GW
- Could swing the H2H result

#### 3.5 Share as Image
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
| Template overlap | MEDIUM | LOW | MEDIUM | 2 | ✅ Done |
| Form momentum | MEDIUM | LOW | MEDIUM | 2 | ✅ Done |
| Recovery rate | MEDIUM | LOW | LOW | 2 | ✅ Done |
| Best/Worst GW | MEDIUM | LOW | MEDIUM | 1 | ✅ Done (backend) |
| H2H record | LOW | MEDIUM | MEDIUM | 1 | ✅ Done (backend) |
| Roster comparison | HIGH | LOW | HIGH | 1 | Pending |
| Points per GW chart | HIGH | MEDIUM | HIGH | 1 | Pending |
| Bench points comparison | LOW | LOW | LOW | 1 | Pending |
| Position breakdown | HIGH | MEDIUM | HIGH | 2 | Pending |
| Transfer ROI | MEDIUM | HIGH | MEDIUM | 2 | Pending |
| Fixture difficulty | MEDIUM | LOW | MEDIUM | 2 | Pending |
| Manager DNA | LOW | HIGH | MEDIUM | 3 | Pending |
| Rank trajectory chart | MEDIUM | MEDIUM | HIGH | 3 | Pending |
| Share as image | LOW | HIGH | MEDIUM | 3 | Pending |

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
