# Head-to-Head Comparison API Enhancement Plan

**Status:** Tier 2 Complete ✅ | Tier 3 Implementation Complete ✅
**Created:** 2026-01-09
**Updated:** 2026-01-11
**Backend Commit:** e692acf
**Frontend Commit:** 3e03801
**Goal:** Extend existing comparison endpoint to eliminate ~600 frontend API calls

## Completed Work

### Phase 1: Core Fields + Tier 1 Analytics ✅

Added core Phase 1 fields and Tier 1 analytics to the comparison endpoint:

**Phase 1 Core Fields:**

| Field | Description | Implementation |
|-------|-------------|----------------|
| `remaining_transfers` | Free transfers available (1-5) | `calculate_free_transfers()` |
| `captain_points` | Total captain points with multiplier | Sum of captain picks × multiplier |
| `differential_captains` | GWs with non-template captain | Count where captain ≠ most_captained |
| `starting_xi` | Player IDs in current starting XI | Filter picks by multiplier > 0 |
| `best_gameweek` | Highest scoring GW | Max from gameweek_points |
| `worst_gameweek` | Lowest scoring GW | Min from gameweek_points |
| `head_to_head` | Wins/losses/draws record | Compare GW points |

**Tier 1 Analytics Fields:**

| Field | Description | Implementation |
|-------|-------------|----------------|
| `consistency_score` | StdDev of GW points (lower = more consistent) | `calculate_consistency_score()` |
| `bench_waste_rate` | Avg bench points as % of total per GW | `calculate_bench_waste_rate()` |
| `hit_frequency` | % of GWs with hits taken | `calculate_hit_frequency()` |
| `last_5_average` | Average points over last 5 GWs | `calculate_last_5_average()` |

**Files modified:**
- `app/services/calculations.py` - 4 new pure functions
- `app/services/history.py` - Updated `_build_manager_stats()` to call new functions
- `app/api/history.py` - Extended `ManagerComparisonStats` Pydantic model
- `tests/test_history_service.py` - 18 new TDD tests (17 pure function + 1 integration)

### Tier 2 Analytics ✅

Added Tier 2 analytics based on manager history data:

| Field | Description | Implementation |
|-------|-------------|----------------|
| `form_momentum` | 3-GW trend: "improving", "stable", "declining" | `calculate_form_momentum()` |
| `recovery_rate` | Avg points scored after red arrow GWs | `calculate_recovery_rate()` |

**Skipped metrics:**
- `captain_vs_best` - Avg diff between captain points and best XI player (user feedback: low value)

**Backend files modified:**
- `app/services/calculations.py` - 2 new pure functions with `Literal` type, `MOMENTUM_THRESHOLD_PCT` constant
- `app/services/history.py` - Call new functions in `_build_manager_stats()`
- `app/api/history.py` - Added Tier 2 fields to `ManagerComparisonStats`
- `tests/test_history_service.py` - 14 new TDD tests + 3 boundary tests for ±5% threshold

**Frontend files modified:**
- `frontend/src/services/backendApi.ts` - Added Tier 2 types
- `frontend/src/services/queries/useHeadToHeadComparison.ts` - Updated types and transformer
- `frontend/src/features/HeadToHead/HeadToHead.tsx` - Added Tier 2 section with color-coded momentum labels
- `frontend/src/features/HeadToHead/HeadToHead.module.css` - Tier 2 row styling + mobile layout fixes
- `frontend/src/components/InfoTooltip/` - New component for metric explanations (accessibility-compliant)

**InfoTooltip Component:**
- Accessible tooltip using `<button>` element for keyboard/touch support
- `aria-describedby` + `role="tooltip"` for screen readers
- CSS module structure following FRONTEND.md conventions
- Documented in FRONTEND.md Reusable Components section

**Test counts:**
- Backend: 92 history service tests pass (including boundary tests)
- Frontend: 641 tests pass

## Problem

The frontend `useHeadToHeadComparison` hook creates a query explosion:
- `useHistoricalData` fetches live GW data + picks for 2 managers × all completed GWs
- At GW 30: ~87 FPL API calls per comparison request

## Current State

**Existing endpoint:** `GET /api/v1/history/comparison`

**Current response fields (ManagerComparisonStats):**
```python
manager_id: int
name: str
total_points: int
gameweek_points: int
overall_rank: int | None
transfers_made: int
transfers_cost: int
bench_points: int
team_value: int
bank: int
template_overlap: float  # 0-100
```

**Frontend needs (ComparisonStats from useHeadToHeadComparison):**
| Field | Current Backend | Status |
|-------|----------------|--------|
| managerId, teamName | ✅ manager_id, name | Done |
| totalPoints | ✅ total_points | Done |
| gameweekPoints | ✅ gameweek_points | Done |
| overallRank | ✅ overall_rank | Done |
| leagueRank | ❌ Missing | **Add** |
| last5Average | ❌ Missing | **Add** |
| totalTransfers | ✅ transfers_made | Done |
| remainingTransfers (FT) | ❌ Missing | **Add** |
| totalHits | ❌ Missing | **Add** |
| hitsCost | ✅ transfers_cost | Done |
| captainPoints | ❌ Missing | **Add** |
| differentialCaptains | ❌ Missing | **Add** |
| chipsUsed (current half) | ❌ Missing | **Add** |
| chipsRemaining (current half) | ❌ Missing | **Add** |
| squadValue | ✅ team_value | Done |
| bank | ✅ bank | Done |
| leagueTemplateOverlap | ⚠️ template_overlap (partial) | **Enhance** |
| worldTemplateOverlap | ❌ Missing | **Add** |
| startingXI | ❌ Missing | **Add** |
| bestGameweek | ❌ Missing | **Add** |
| worstGameweek | ❌ Missing | **Add** |

## Proposed Response Schema

```python
class TemplateOverlap(BaseModel):
    """Template team overlap statistics."""
    match_count: int = Field(ge=0, le=11)
    match_percentage: float = Field(ge=0, le=100)
    matching_player_ids: list[int]
    differential_player_ids: list[int]
    playstyle_label: str  # "Template", "Balanced", "Differential", "Maverick"

class GameweekExtreme(BaseModel):
    """Best or worst gameweek record."""
    gameweek: int = Field(ge=1, le=38)
    points: int

class ManagerComparisonStatsV2(BaseModel):
    """Enhanced comparison stats for a single manager."""

    # Identity
    manager_id: int
    name: str
    team_name: str

    # Season overview
    total_points: int
    overall_rank: int | None
    league_rank: int
    last_5_average: float

    # Transfers
    total_transfers: int = Field(ge=0)
    remaining_transfers: int = Field(ge=1, le=5)
    total_hits: int = Field(ge=0)
    hits_cost: int = Field(le=0)

    # Captain (NEW - requires calculation from picks)
    captain_points: int
    differential_captains: int = Field(ge=0)

    # Chips (current half)
    chips_used: list[str]
    chips_remaining: list[str]

    # Value
    squad_value: int = Field(ge=0)  # In 0.1m units
    bank: int = Field(ge=0)  # In 0.1m units

    # Template overlap (enhanced)
    league_template_overlap: TemplateOverlap
    world_template_overlap: TemplateOverlap

    # Roster
    starting_xi: list[int]  # Player IDs in starting XI

    # Gameweek extremes
    best_gameweek: GameweekExtreme | None
    worst_gameweek: GameweekExtreme | None

class RosterComparison(BaseModel):
    """Comparison of two managers' rosters."""
    common_count: int
    common_player_ids: list[int]
    manager_a_only_ids: list[int]
    manager_b_only_ids: list[int]

class ComparisonResponseV2(BaseModel):
    """Enhanced response for GET /comparison."""

    manager_a: ManagerComparisonStatsV2
    manager_b: ManagerComparisonStatsV2
    roster_comparison: RosterComparison
    head_to_head: dict[str, int]  # wins_a, wins_b, draws
```

## Implementation Plan

### Phase 1: Core Fields (MVP - Replace Frontend Calls)

Add new fields to existing `ManagerComparisonStats` model. The endpoint already exists and has tests.

**Core fields needed by frontend:**

1. **league_rank** - Query league standings for manager's current position
2. **last_5_average** - Calculate from `manager_gw_snapshot` (last 5 gameweeks)
3. **remaining_transfers** - Reuse existing `calculate_free_transfers()` from calculations.py
4. **total_hits** - Count from `manager_gw_snapshot` where `transfers_cost < 0`
5. **captain_points** - Sum captain picks × multiplier from `manager_pick`
6. **differential_captains** - Compare to `gameweek.most_captained`
7. **chips_used/remaining** - Already have chip data, add half-season filtering
8. **league_template_overlap** - Calculate from all league managers' current picks
9. **world_template_overlap** - Calculate from `player.selected_by_percent`
10. **starting_xi** - Query current GW picks where `multiplier > 0`
11. **best/worst_gameweek** - Find max/min from `manager_gw_snapshot.gameweek_points`

**Database queries (estimated):**
- Manager info + history: Already fetched
- League standings: 1 query (20 rows)
- Gameweeks (for most_captained): 1 query
- All picks for captain calc: 2 queries (1 per manager)
- Player global ownership: 1 query

**Total new queries:** ~5-6 (vs 87 frontend API calls)

### Phase 1b: Tier 1 Analytics (Quick Wins)

Add high-value, low-effort metrics calculable from existing snapshots:

1. **consistency_score** - `STDDEV_POP(points)` from snapshots
2. **bench_waste_rate** - Avg `points_on_bench / points` ratio
3. **hit_frequency** - `COUNT(*) WHERE transfers_cost < 0 / total_gws`
4. **last_5_average** - Average of last 5 GW points

**Queries:** Single aggregation query per manager

### Phase 2: Frontend Integration ✅

**Completed in commit 3e03801:**

1. ✅ Rewrote `useHeadToHeadComparison` hook to call backend API
2. ✅ Added `ComparisonResponse` types to `backendApi.ts`
3. ✅ Added `validateComparisonResponse` validation function
4. ✅ Updated `HeadToHead.tsx` to use new response shape
5. ✅ Added `formatChipNames()` utility for display names
6. ✅ Combined UI sections (Gameweeks + Head-to-Head Record)
7. ✅ Added `seasonId` to query key (multi-season compliance)

**Files modified:**
- `frontend/src/services/backendApi.ts` - Types, validation, API method
- `frontend/src/services/queries/useHeadToHeadComparison.ts` - Complete rewrite
- `frontend/src/services/queryKeys.ts` - Added managerComparison key with seasonId
- `frontend/src/features/HeadToHead/HeadToHead.tsx` - Updated for new data shape
- `frontend/src/utils/chips.ts` - Added display name formatting
- `frontend/src/utils/chips.test.ts` - Tests for new functions

**Result:** Replaced ~87 FPL API calls with single backend call

### Phase 3: Cleanup ✅

**Completed cleanup tasks:**

1. ✅ Deleted unused `useHistoricalData.ts` (no imports found)
2. ✅ Verified `useLeaguePositions.ts` is actively used (kept)
3. ✅ Added 19 new validation tests for `validateComparisonResponse`
4. ✅ All 641 frontend tests pass

**Files removed:**
- `frontend/src/services/queries/useHistoricalData.ts` - Dead code, replaced by backend API

**Files modified:**
- `frontend/src/services/backendApi.test.ts` - Added `validateComparisonResponse` tests

## Data Dependencies

**Required tables:**
- `manager` - name, team_name
- `manager_gw_snapshot` - history, bench points, transfers
- `manager_pick` - captain picks, starting XI
- `league_manager` - league standings/rank
- `gameweek` - most_captained player
- `player` - selected_by_percent (world ownership)
- `chip_usage` - chips used

**All tables already exist and are populated by scheduled updates.**

## Effort Estimate

### Phase 1: MVP (Required for Frontend Migration)

| Task | Complexity |
|------|------------|
| Extend Pydantic models | Low |
| Add league_rank query | Low |
| Add captain calculations | Medium |
| Add template overlap calc | Medium |
| Add best/worst GW | Low |
| Update tests | Medium |
| Frontend hook migration | Medium |
| **Phase 1 Total** | ~2-3 sessions |

### Phase 1b: Tier 1 Analytics (Optional, High Value)

| Task | Complexity |
|------|------------|
| Add consistency_score | Low |
| Add bench/transfer/hit rates | Low |
| Update tests | Low |
| **Phase 1b Total** | ~0.5 session |

### Future Phases

| Phase | Scope | Prerequisite | Status |
|-------|-------|--------------|--------|
| Tier 2 | Form momentum, recovery rate | `manager_gw_snapshot` | ✅ Complete |
| Tier 3 | Luck index, captain xP delta, squad xP | `player_fixture_stats` | ✅ Implementation Complete |
| Tier 4 | H2H record, differential points breakdown | Tier 1 complete | Deferred |

### Tier 3 Data Availability ✅

Verified 2026-01-11. All required data is populated:

| Table | Rows | Purpose |
|-------|------|---------|
| `player_fixture_stats` | 15,760 | xG, xA, xGA per player per fixture |
| `player` | 795 | `element_type` for position (GK/DEF/MID/FWD) |
| `manager_pick` | 5,655 | Squad selections per gameweek |

**Join test:** 5,655 picks successfully matched to xG data.

## Additional Metrics (from research)

Based on web research of FPL analytics tools (FPL Review, LiveFPL, Fantasy Football Hub) and our database capabilities, these additional metrics would provide meaningful comparison insights:

### Tier 1: Calculable Now (High Value, Low Effort)

| Metric | Description | Data Source |
|--------|-------------|-------------|
| **consistency_score** | Standard deviation of GW points (lower = more consistent) | `manager_gw_snapshot.points` |
| **bench_waste_rate** | Avg bench points per GW as % of total | `manager_gw_snapshot.points_on_bench` |
| **hit_frequency** | % of GWs with hits taken | `manager_gw_snapshot.transfers_cost` |
| **last_5_average** | Average points over last 5 GWs | `manager_gw_snapshot.points` |

### Tier 2: Requires Join Calculations (Medium Effort)

| Metric | Description | Data Source |
|--------|-------------|-------------|
| **captain_vs_best** | Avg diff between captain points and best XI player | `manager_pick` + `player_gw_stats` |
| **transfer_roi** | Net points from transfers in vs out (last 5 GWs) | `transfer` + `player_gw_stats` |
| **differential_success** | Points from players <5% league ownership | `manager_pick` + `league_ownership` |
| **form_momentum** | 3-GW trend (improving/declining/stable) | `manager_gw_snapshot.points` rolling avg |
| **recovery_rate** | Points gained after red arrow GWs | `manager_gw_snapshot` sequential analysis |

### Tier 3: xG-Based Advanced Stats (Requires player_fixture_stats)

These metrics answer "who's actually playing better FPL?" by separating skill from luck.

#### 3.1 Luck Index
**User question:** "Am I making good decisions, or just getting lucky/unlucky?"

| Aspect | Description |
|--------|-------------|
| **What it shows** | Season total: actual FPL points minus expected points |
| **Positive value** | Manager has been lucky (players overperforming xG/xA) |
| **Negative value** | Manager has been unlucky (players underperforming) |
| **Comparison insight** | Identifies if a rival's lead is sustainable or variance-based |

**Data required:**
- `player_fixture_stats.xg`, `player_fixture_stats.xa` per gameweek
- `manager_pick` to know which players were in squad
- Actual points from `player_gw_stats.total_points`

#### 3.2 Captain xP Delta
**User question:** "Are my captain choices working out?"

| Aspect | Description |
|--------|-------------|
| **What it shows** | Cumulative difference between captain's actual points and expected points |
| **Positive value** | Captain picks beating expectations |
| **Negative value** | Bad luck on captains (e.g., Haaland blanks despite high xG) |
| **Comparison insight** | Separates skill from luck in highest-impact weekly decision |

**Data required:**
- `manager_pick` where `is_captain = true`
- `player_fixture_stats.xg`, `player_fixture_stats.xa` for captain's fixtures
- Captain's actual points (with 2x multiplier applied)

#### 3.3 Squad xP (Expected Performance)
**User question:** "Is my squad actually good, or have I just been unlucky?"

| Aspect | Description |
|--------|-------------|
| **What it shows** | Combined expected performance of current starting XI |
| **For attackers/mids** | xGI (xG + xA) - expected goals and assists |
| **For defenders/GKs** | xGA (expected goals against) - clean sheet likelihood |
| **Comparison insight** | "Whose squad has more firepower and defensive solidity?" |

**Data required:**
- `manager_pick` for current GW starting XI (`multiplier > 0`)
- `player.expected_goal_involvements` or sum of recent `player_fixture_stats.xg + xa`
- `player_fixture_stats.expected_goals_conceded` for defenders/GKs

---

## Tier 3 Implementation Plan

### TDD Test Cases ✅

**Implemented:** 2026-01-11 in `tests/test_calculations.py` (47 tests total for Tier 3)

**FPL Scoring Rules Reference:**
| Position | Goal | Assist | Clean Sheet | Goals Conceded |
|----------|------|--------|-------------|----------------|
| GK (1)   | 6    | 3      | 4           | -1 per 2       |
| DEF (2)  | 6    | 3      | 4           | -1 per 2       |
| MID (3)  | 5    | 3      | 1           | 0              |
| FWD (4)  | 4    | 3      | 0           | 0              |

#### 3.1 Luck Index Tests

**Core Calculation Tests:**
```python
# test_luck_index_forward_scores_goal_from_low_xg
# FWD with xG=0.1, xA=0.0 scores 1 goal (4pts from goal)
# xP = 0.1*4 + 0*3 = 0.4
# Luck = 4 - 0.4 = +3.6 (lucky goal)

# test_luck_index_forward_blanks_despite_high_xg
# FWD with xG=1.5, xA=0.3 scores 0 goals
# xP = 1.5*4 + 0.3*3 = 6.9
# Actual = 2 (appearance only)
# Luck = 2 - 6.9 = -4.9 (unlucky blank)

# test_luck_index_midfielder_scores_uses_5pts_per_goal
# MID with xG=0.5, xA=0.2 scores 1 goal
# xP = 0.5*5 + 0.2*3 = 3.1
# Actual = 5 (goal)
# Luck = 5 - 3.1 = +1.9

# test_luck_index_defender_includes_clean_sheet_bonus
# DEF with xG=0.1, xA=0.0, xGA=0.8 keeps clean sheet
# xCS probability = max(0, 1 - xGA/2.5) = 0.68
# xP = 0.1*6 + 0*3 + 0.68*4 = 3.32
# Actual = 6 (appearance + CS)
# Luck = 6 - 3.32 = +2.68

# test_luck_index_goalkeeper_concedes_despite_low_xga
# GK with xGA=0.5 concedes 3 goals
# xP for CS = (1 - 0.5/2.5)*4 = 3.2 expected CS points
# Actual = -1 (goals conceded penalty)
# Negative luck from conceding vs expected CS
```

**Aggregation Tests:**
```python
# test_luck_index_sums_across_all_starting_players
# 11 players each with luck_delta → sum all

# test_luck_index_sums_across_multiple_gameweeks
# Same player across GW1-5 → cumulative season luck

# test_luck_index_excludes_bench_players
# multiplier=0 players not counted

# test_luck_index_includes_bench_boost_players
# When bench_boost chip active (multiplier=1 for bench)
```

**Edge Cases:**
```python
# test_luck_index_returns_none_for_empty_input
# Input: [] → None

# test_luck_index_skips_players_with_zero_minutes
# Player didn't play (minutes=0) → skip, don't include in calculation

# test_luck_index_handles_null_xg_values
# Some fixtures missing xG data → skip those fixtures

# test_luck_index_handles_double_gameweek
# Player has 2 fixtures in same GW → sum both fixture deltas

# test_luck_index_rounds_to_two_decimal_places
# Precision handling for display
```

#### 3.2 Captain xP Delta Tests

**Core Calculation Tests:**
```python
# test_captain_delta_positive_when_captain_overperforms
# Captain (FWD) with xG=0.5, xA=0.1 scores 2 goals
# xP = 0.5*4 + 0.1*3 = 2.3
# Actual = 8pts (2 goals)
# Delta = 8 - 2.3 = +5.7

# test_captain_delta_negative_when_captain_blanks
# Captain (MID) with xG=1.2, xA=0.5 scores 0
# xP = 1.2*5 + 0.5*3 = 7.5
# Actual = 2pts (appearance)
# Delta = 2 - 7.5 = -5.5

# test_captain_delta_uses_base_points_not_doubled
# Captain's 2x multiplier applies to actual points only
# We compare actual/multiplier vs xP (not doubled xP)
# This measures captain SELECTION skill, not multiplier effect
```

**Multiplier Handling:**
```python
# test_captain_delta_normal_captain_uses_multiplier_2
# Standard captain: actual_pts / 2 vs xP

# test_captain_delta_triple_captain_uses_multiplier_3
# TC chip active: actual_pts / 3 vs xP

# test_captain_delta_vice_captain_activated
# Captain got 0 mins, VC played
# Use VC's stats with multiplier=2 (VC becomes captain)
```

**Aggregation Tests:**
```python
# test_captain_delta_cumulative_across_season
# Sum delta for all GWs where captain data exists

# test_captain_delta_handles_dgw_captain
# Captain played twice in DGW → sum both fixtures
```

**Edge Cases:**
```python
# test_captain_delta_returns_none_for_empty_input

# test_captain_delta_returns_none_when_no_captain_played
# Captain and VC both got 0 mins in a GW

# test_captain_delta_handles_captain_null_xg
# Captain's fixture missing xG → skip that GW

# test_captain_delta_handles_single_gameweek_data
# Only 1 GW of data → still returns value (not None)
```

#### 3.3 Squad xP Tests

**Position-Based Calculation Tests:**
```python
# test_squad_xp_forward_uses_xgi_only
# FWD: xP = xG + xA (raw xGI, not multiplied by points)
# We return xGI as "expected involvement" metric

# test_squad_xp_midfielder_uses_xgi_only
# MID: xP = xG + xA

# test_squad_xp_defender_uses_xgi_plus_xcs
# DEF: xP = xG + xA + xCS_probability
# xCS = max(0, 1 - opponent_xG/2.5)

# test_squad_xp_goalkeeper_uses_xgi_plus_xcs
# GK: same as DEF (xG + xA + xCS)
```

**Formation Tests:**
```python
# test_squad_xp_standard_442_formation
# 1 GK, 4 DEF, 4 MID, 2 FWD → calculate each correctly

# test_squad_xp_343_formation
# 1 GK, 3 DEF, 4 MID, 3 FWD

# test_squad_xp_532_formation
# 1 GK, 5 DEF, 3 MID, 2 FWD

# test_squad_xp_541_formation
# 1 GK, 5 DEF, 4 MID, 1 FWD (defensive setup)
```

**Filtering Tests:**
```python
# test_squad_xp_excludes_bench_players
# multiplier=0 → not in starting XI

# test_squad_xp_includes_all_players_during_bench_boost
# Bench Boost chip: all 15 players have multiplier >= 1

# test_squad_xp_counts_captain_once_not_doubled
# Captain's xP not multiplied (we measure squad quality, not captain bonus)
```

**Edge Cases:**
```python
# test_squad_xp_returns_none_for_empty_squad

# test_squad_xp_returns_none_when_all_xg_null
# All players missing xG data

# test_squad_xp_handles_partial_xg_data
# Some players have xG, others don't → use available data

# test_squad_xp_handles_player_with_multiple_fixtures
# DGW: player has 2 fixtures → sum xGI from both

# test_squad_xp_uses_current_gw_data_only
# Only current GW fixtures, not historical
```

**Boundary Tests:**
```python
# test_squad_xp_zero_xg_returns_zero_not_none
# All players with xG=0, xA=0 → returns 0.0, not None

# test_squad_xp_very_high_xg_values
# Edge case: total xGI > 10 (unlikely but valid)

# test_squad_xp_negative_xcs_clamped_to_zero
# opponent_xG very high → xCS = max(0, ...) not negative
```

### Implementation Steps

1. ✅ **Write TDD tests** (`tests/test_calculations.py`)
   - 15 Luck Index tests (core + aggregation + edge cases)
   - 13 Captain xP Delta tests (core + multiplier + edge cases)
   - 19 Squad xP tests (position + formation + edge cases)

2. ✅ **Implement pure functions** (`app/services/calculations.py`)
   - `calculate_luck_index()` - Actual vs expected points (luck measurement)
   - `calculate_captain_xp_delta()` - Captain selection skill measurement
   - `calculate_squad_xp()` - Squad quality via raw xGI (not FPL points)

3. ✅ **Add SQL query for xG data** (`app/services/history.py`)
   ```sql
   SELECT mp.player_id, mp.is_captain, mp.multiplier,
          pfs.expected_goals, pfs.expected_assists,
          pfs.expected_goals_conceded, pfs.total_points,
          p.element_type
   FROM manager_pick mp
   JOIN manager_gw_snapshot mgs ON mp.snapshot_id = mgs.id
   JOIN player_fixture_stats pfs ON mp.player_id = pfs.player_id
       AND mgs.gameweek = pfs.gameweek AND mgs.season_id = pfs.season_id
   JOIN player p ON mp.player_id = p.id AND mgs.season_id = p.season_id
   WHERE mgs.manager_id = $1 AND mgs.season_id = $2
   ```

4. ✅ **Extend `_build_manager_stats()`** to call new functions

5. ✅ **Update Pydantic model** (`app/api/history.py`)
   - Add `luck_index`, `captain_xp_delta`, `squad_xp` fields

6. ✅ **Frontend integration**
   - Update `backendApi.ts` types
   - Add Tier 3 section to `HeadToHead.tsx`
   - Add tooltips explaining each metric

### xP Calculation Formula

**Expected Points (xP) approximation:**
```python
# For attackers/midfielders:
xP = (xG * 4) + (xA * 3) + base_points  # FWD: 4pts/goal
xP = (xG * 5) + (xA * 3) + base_points  # MID: 5pts/goal

# For defenders/goalkeepers:
xP = (xG * 6) + (xA * 3) + cs_probability * 4 + base_points
# cs_probability ≈ 1 - (opponent_xG / 2.5) for simplicity

# base_points = 2 (appearance) + minutes bonus
```

**Simplification for MVP:** Use `total_points` from actual data vs `xGI` as proxy:
```python
luck_delta = actual_points - (xG * points_per_goal + xA * 3)
```

**Summary table:**

| Metric | Description | Data Source |
|--------|-------------|-------------|
| **luck_index** | Actual points - expected points (season total) | `player_fixture_stats` + `manager_pick` |
| **captain_xp_delta** | Captain actual vs expected (cumulative) | `manager_pick` + `player_fixture_stats` |
| **squad_xp** | Squad expected performance (xGI for attackers, xGA for defenders) | `player_fixture_stats` + `player.element_type` |

### Tier 4: Comparative Metrics (Cross-Manager)

| Metric | Description | Data Source |
|--------|-------------|-------------|
| **h2h_record** | Direct GW-by-GW wins/losses/draws | `manager_gw_snapshot.points` both managers |
| **common_player_points** | Points from shared players (shows diff in captaincy/bench) | `manager_pick` intersection |
| **differential_player_points** | Points from unique players | `manager_pick` set difference |

### Recommended Response Schema Updates

```python
class ManagerComparisonStatsV2(BaseModel):
    # ... existing fields ...

    # NEW: Decision quality metrics
    captain_hit_rate: float = Field(ge=0, le=100)  # % of GWs captain scored 6+
    captain_vs_best_avg: float  # Avg points missed vs optimal captain
    transfer_roi_5gw: int  # Net points from recent transfers

    # NEW: Consistency metrics
    consistency_score: float  # StdDev of GW points (lower = better)
    form_momentum: str  # "improving", "stable", "declining"
    best_streak: int  # Consecutive green arrows
    worst_streak: int  # Consecutive red arrows

    # NEW: Tier 3 Advanced (optional, requires player_fixture_stats)
    luck_index: float | None  # Actual - Expected points (season total)
    captain_xp_delta: float | None  # Captain actual vs expected (cumulative)
    squad_xp: float | None  # Squad expected performance (xGI for attackers, xGA for defenders)
```

### Database Queries for New Metrics

**Consistency Score:**
```sql
SELECT STDDEV_POP(points) as consistency_score
FROM manager_gw_snapshot
WHERE manager_id = ? AND season_id = ?;
```

**Captain Hit Rate:**
```sql
SELECT
    COUNT(*) FILTER (WHERE pgs.total_points >= 6) * 100.0 / COUNT(*) as hit_rate
FROM manager_gw_snapshot s
JOIN manager_pick mp ON mp.snapshot_id = s.id AND mp.is_captain = true
JOIN player_gw_stats pgs ON pgs.player_id = mp.player_id
    AND pgs.season_id = s.season_id AND pgs.gameweek = s.gameweek
WHERE s.manager_id = ? AND s.season_id = ?;
```

**Transfer ROI (last 5 GWs):**
```sql
WITH transfers AS (
    SELECT
        t.player_in, t.player_out, t.gameweek,
        pgs_in.total_points as points_in,
        pgs_out.total_points as points_out
    FROM transfer t
    LEFT JOIN player_gw_stats pgs_in ON t.player_in = pgs_in.player_id
        AND t.gameweek = pgs_in.gameweek
    LEFT JOIN player_gw_stats pgs_out ON t.player_out = pgs_out.player_id
        AND t.gameweek = pgs_out.gameweek
    WHERE t.manager_id = ? AND t.gameweek >= ?
)
SELECT SUM(points_in - points_out) as transfer_roi FROM transfers;
```

## Risks

1. **Performance** - More calculations per request, but eliminates 87 API calls
2. **Data freshness** - Backend data depends on scheduled sync (every 30min during matches)
3. **Breaking changes** - New fields are additive, existing fields unchanged
4. **xG data availability** - Tier 3 metrics require `player_fixture_stats` to be populated

## Success Criteria

- [x] Endpoint returns all fields needed by frontend (Phase 1 complete)
- [ ] Response time < 500ms (measured: **850ms** - needs optimization)
- [x] Frontend uses single API call instead of 87 (Phase 2 complete)
- [x] All existing comparison tests pass (138 backend + 641 frontend tests)
- [x] New fields have test coverage (34 new tests for Phase 1)
- [x] Frontend tests for new chip utility functions (35 chip tests)
- [x] Dead code removed and validation tests added (Phase 3 complete)
