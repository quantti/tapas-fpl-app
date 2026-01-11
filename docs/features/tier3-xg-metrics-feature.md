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

### 3. Incomplete Decimal Conversion (Production Bug)

**Symptom:** 500 error persisted after initial fix
```
TypeError: unsupported operand type(s) for /: 'decimal.Decimal' and 'float'
File "calculations.py", line 840, in calculate_squad_xp
```

**Cause:** Initial fix only addressed `_calculate_expected_points()` but THREE functions used xG fields:
- `calculate_luck_index()` - **MISSED**
- `calculate_captain_xp_delta()` - **MISSED**
- `calculate_squad_xp()` - **MISSED**

**Fix:** Grep for all usages of `XCS_DIVISOR` and xG field access, apply conversion to ALL functions:
```python
# Each function needs explicit conversion
xg = 0.0 if xg is None else float(xg)
xa = 0.0 if xa is None else float(xa)
xga = 0.0 if xga_raw is None else float(xga_raw)
```

**Commit:** `797bb10 fix(backend): convert all Decimal fields to float in xG calculations`

### 4. dict.get() None Value Bug (Discovered in PR Review)

**Symptom:** Would crash if `total_points` key exists but value is `None`
```python
# BUG: dict.get() default only applies when key is MISSING
total_points = float(pick.get("total_points", 0))  # Crashes if value is None!
```

**Cause:** Python's `dict.get(key, default)` returns the default ONLY when the key doesn't exist. If the key exists with a `None` value, you get `None` back—not the default.

**Fix:** Use explicit None check pattern:
```python
total_points_raw = pick.get("total_points")
total_points = 0.0 if total_points_raw is None else float(total_points_raw)
```

**Commit:** `2f67c90 fix(backend): handle None values in total_points field`

## Lessons Learned: TDD Gaps

Despite having 92 TDD tests for this feature, several production bugs escaped testing. This section documents what we learned.

### Why TDD Didn't Catch These Bugs

| Bug | Root Cause | Why TDD Missed It |
|-----|------------|-------------------|
| Decimal/float mismatch | PostgreSQL returns `DECIMAL` as Python `decimal.Decimal` | Mock data used Python `float` literals, not actual DB types |
| Incomplete conversion | Only checked one function | Tests didn't cover all code paths using xG fields |
| None value handling | `dict.get()` behavior misunderstood | Mock data never had `None` values for existing keys |

### Planning Phase Improvements

**Before writing TDD tests, verify actual data types:**

1. **Query actual database** to see real column types:
   ```sql
   SELECT column_name, data_type FROM information_schema.columns
   WHERE table_name = 'player_fixture_stats';
   -- expected_goals: numeric (returns Decimal in Python!)
   ```

2. **Print actual values** from production:
   ```python
   row = await conn.fetchrow("SELECT expected_goals FROM player_fixture_stats LIMIT 1")
   print(type(row["expected_goals"]))  # <class 'decimal.Decimal'>
   ```

3. **Check for nullable columns**:
   ```sql
   SELECT column_name, is_nullable FROM information_schema.columns
   WHERE table_name = 'player_fixture_stats' AND is_nullable = 'YES';
   ```

### Mock Data Best Practices

```python
# BAD: Using Python native types
mock_pick = {
    "expected_goals": 0.5,      # float - doesn't match DB
    "total_points": 0,          # int - masks None handling bugs
}

# GOOD: Use Decimal to match PostgreSQL behavior
from decimal import Decimal
mock_pick = {
    "expected_goals": Decimal("0.5"),  # Matches DB type!
    "total_points": None,              # Tests None handling
}

# ALSO TEST: Key exists with None value vs key missing
mock_with_none = {"total_points": None}  # Key exists, value None
mock_without_key = {}                     # Key missing entirely
```

### TDD Test Checklist for Database Code

Add these tests to your TDD suite when working with database data:

- [ ] Test with `decimal.Decimal` input values (not just `float`)
- [ ] Test with `None` values for nullable columns
- [ ] Test with key missing vs key present with `None` value
- [ ] Test ALL functions that access the same data fields
- [ ] Use `grep` to find all usages of a field before claiming "done"

## Commit History

```
2f67c90 fix(backend): handle None values in total_points field
797bb10 fix(backend): convert all Decimal fields to float in xG calculations
dd44480 docs: add Tier 3 xG metrics feature documentation
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
