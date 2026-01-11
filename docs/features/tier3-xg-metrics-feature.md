# Tier 3 xG Metrics Feature

Expected Goals (xG) based analytics for Head-to-Head manager comparison.

**Completed:** 2026-01-11
**Status:** ✅ Shipped in v0.27.0

## Overview

Tier 3 adds three xG-based metrics to the H2H comparison Analytics section:

| Metric | Description |
|--------|-------------|
| **Luck Index** | `actual_points - expected_points` aggregated across season |
| **Captain xP Delta** | Difference between captain's actual and expected points |
| **Squad xP** | Total expected points from starting XI |

These metrics help managers understand whether their performance is driven by skill (player selection, captain choices) or luck (over/underperforming xG).

## Technical Implementation

### Backend (`backend/app/services/calculations.py`)

**Expected Points Formula:**
```python
xP = xG × goal_pts + xA × assist_pts

# For GK/DEF, add expected clean sheet contribution:
xCS = max(0, 1 - xGA / 2.0)  # 2.0 goals = ~0% CS probability
xP += xCS × cs_pts
```

**Scoring by Position:**
| Position | Goal | Assist | Clean Sheet |
|----------|------|--------|-------------|
| GK | 6 | 3 | 4 |
| DEF | 6 | 3 | 4 |
| MID | 5 | 3 | 1 |
| FWD | 4 | 3 | 0 |

**Key Files:**
- `backend/app/services/calculations.py:620-668` - Core xP calculation functions
- `backend/app/services/history_service.py` - Aggregation across gameweeks
- `backend/tests/test_history_service.py` - 92 tests including Tier 3

### Frontend (`frontend/src/features/HeadToHead/`)

- Metrics displayed in Analytics section with InfoTooltip explanations
- Green/red color coding based on positive/negative values
- Graceful fallback when xG data unavailable (shows "-")

**Key Files:**
- `frontend/src/services/queries/useHeadToHeadComparison.ts` - Hook integration
- `frontend/src/features/HeadToHead/HeadToHead.tsx` - UI rendering
- `frontend/tests/fixtures/mock-data.ts` - E2E test data

### Database

Uses existing `manager_gameweek_history` view which includes:
- `expected_goals`, `expected_assists`, `expected_goals_conceded` per pick
- Aggregated by manager and gameweek

## Bug Fixes During Development

### 1. Decimal/Float Type Mismatch (Production Bug)

**Symptom:** 500 error on H2H comparison endpoint
```
TypeError: unsupported operand type(s) for /: 'decimal.Decimal' and 'float'
```

**Cause:** PostgreSQL returns `DECIMAL` columns as Python's `decimal.Decimal`, but arithmetic operators don't mix with native `float`.

**Fix:** Convert Decimal to float at function entry:
```python
def _calculate_expected_points(xg: float, xa: float, xga: float, element_type: int) -> float:
    # Convert from Decimal (database) to float for arithmetic
    xg = float(xg)
    xa = float(xa)
    xga = float(xga)
    ...
```

**Commit:** `d58b6c2 fix(backend): convert Decimal to float in xG calculations`

### 2. E2E Mock Data Missing Tier 3 Fields

**Symptom:** CI E2E tests would fail with missing fields

**Fix:** Added `luck_index`, `captain_xp_delta`, `squad_xp` to mock data:
```typescript
// frontend/tests/fixtures/mock-data.ts
luckIndex: 12.5,
captainXpDelta: 8.3,
squadXp: 45.2,
```

**Commit:** `c852af5 test(e2e): add Tier 3 xG metrics to mock data`

## Commit History

```
d58b6c2 fix(backend): convert Decimal to float in xG calculations
bfae27e chore(release): 0.27.0 [skip ci]
c852af5 test(e2e): add Tier 3 xG metrics to mock data
0ab502b feat(frontend): integrate Tier 3 xG metrics in H2H comparison
15de2a8 feat(backend): implement and integrate Tier 3 xG metrics
dda933e test(backend): add TDD tests for Tier 3 xG metrics
580c948 docs: add Tier 3 implementation plan with TDD test cases
51782b7 docs: refine Tier 3 xG metrics requirements for H2H comparison
```

## Test Coverage

**Backend:** 367 tests passing
- `test_history_service.py` - 92 tests including:
  - Tier 3 integration tests (6 tests)
  - Position scoring boundary tests
  - Captain multiplier handling (DGW 2×/3×)
  - Vice captain activation rules
  - Empty/null data edge cases

**Frontend:** 647 tests passing
- `useHeadToHeadComparison.test.tsx` - 20 tests
- E2E: `analytics.spec.ts` - 11 H2H tests

## Deployment

- Backend auto-deploys to Fly.io on push to `main`
- Frontend auto-deploys to Vercel on push to `main`
- Released as v0.27.0

## Future Considerations

1. **xG Data Availability:** Early season GWs may have sparse xG data
2. **DGW Handling:** Captain multipliers (2× or 3×) are correctly applied
3. **Chip Usage:** TC/BB chips affect expected points calculations
4. **Display Precision:** Consider rounding to 1 decimal place for cleaner UI

## Related Documentation

- `backend/docs/head-to-head-enhancement-plan.md` - Detailed TDD test cases and formulas
- `docs/h2h-plan.md` - Overall H2H feature roadmap
