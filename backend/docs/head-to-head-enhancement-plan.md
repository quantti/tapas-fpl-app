# Head-to-Head Comparison API Enhancement Plan

**Status:** Phase 3 Complete ✅ — Ready for Tier 2 Features
**Created:** 2026-01-09
**Updated:** 2026-01-09
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

### Future Phases (Deferred)

| Phase | Scope | Prerequisite |
|-------|-------|--------------|
| Tier 2 | Captain hit rate, transfer ROI, form momentum | `player_gw_stats` populated |
| Tier 3 | Luck index, xP delta, squad xGI | `player_fixture_stats` populated |
| Tier 4 | H2H record, differential points breakdown | Tier 1 complete |

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

| Metric | Description | Data Source |
|--------|-------------|-------------|
| **luck_index** | Season total: actual points - expected points | `player_fixture_stats` xG/xA + picks |
| **captain_xp_delta** | Captain's actual vs expected (over/underperforming) | `manager_pick` + `player_fixture_stats` |
| **squad_xgi** | Total expected goal involvement of current squad | `player.expected_goal_involvements` |

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

    # NEW: Advanced (optional, if player_fixture_stats populated)
    luck_index: float | None  # Actual - Expected points
    squad_xgi: float | None  # Total xGI of current squad
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
- [ ] Response time < 500ms (needs production measurement)
- [x] Frontend uses single API call instead of 87 (Phase 2 complete)
- [x] All existing comparison tests pass (138 backend + 641 frontend tests)
- [x] New fields have test coverage (34 new tests for Phase 1)
- [x] Frontend tests for new chip utility functions (35 chip tests)
- [x] Dead code removed and validation tests added (Phase 3 complete)
