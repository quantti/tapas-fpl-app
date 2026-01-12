# League Ownership Data Pipeline

## Overview

Populate and maintain the `league_ownership` table with per-gameweek player ownership statistics for the tracked league. This enables fast ownership lookups without hitting the FPL API at request time.

**Status:** Planned
**Created:** 2026-01-12

## Current State

The `league_ownership` table exists but is empty. Currently, ownership data is computed live in `recommendations.py` by:
1. Fetching picks for each manager from FPL API (`/entry/{id}/event/{gw}/picks/`)
2. Aggregating ownership counts in memory using Python `Counter`

This approach makes ~20 API calls per request (one per manager).

## Target State

Compute ownership from the existing `manager_pick` table (already populated by `scheduled_update.py`). This eliminates API calls and provides ~2 second response time.

## Schema Analysis

### Existing Table (`migrations/003_analytics.sql`)

```sql
CREATE TABLE league_ownership (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    FOREIGN KEY (league_id, season_id) REFERENCES league(id, season_id),
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    ownership_count INTEGER DEFAULT 0,     -- How many managers own this player
    ownership_percent DECIMAL(5,2) DEFAULT 0,
    captain_count INTEGER DEFAULT 0,
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(league_id, player_id, season_id, gameweek)
);

CREATE INDEX idx_lo_league ON league_ownership(league_id, gameweek);
CREATE INDEX idx_lo_ownership ON league_ownership(league_id, ownership_percent DESC);
```

### Schema Verification ✅

| Field | Source | Status |
|-------|--------|--------|
| `ownership_count` | `COUNT(*)` from `manager_pick` | ✅ Present |
| `ownership_percent` | `100.0 * COUNT(*) / total_managers` | ✅ Present |
| `captain_count` | `COUNT(*) FILTER (WHERE is_captain)` | ✅ Present |

### Recommended Schema Addition

Add `vice_captain_count` for future features (e.g., vice captain analysis):

```sql
ALTER TABLE league_ownership ADD COLUMN vice_captain_count INTEGER DEFAULT 0;
```

## Data Source

### Manager Pick Table

```sql
-- Picks are stored here after Manager Snapshots collection
CREATE TABLE manager_pick (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES manager_gw_snapshot(id),
    player_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    multiplier INTEGER NOT NULL,  -- 0=bench, 1=normal, 2=captain, 3=triple
    is_captain BOOLEAN NOT NULL,
    is_vice_captain BOOLEAN NOT NULL
);
```

The `manager_pick` table is populated by `scheduled_update.py` → `run_manager_snapshots_update()` which runs after each gameweek finalizes.

### Aggregation Query

```sql
INSERT INTO league_ownership (
    league_id, player_id, season_id, gameweek,
    ownership_count, ownership_percent, captain_count, vice_captain_count
)
SELECT
    $1 AS league_id,
    mp.player_id,
    mgs.season_id,
    mgs.gameweek,
    COUNT(*) AS ownership_count,
    ROUND(100.0 * COUNT(*) / (
        SELECT COUNT(DISTINCT mgs2.manager_id)
        FROM manager_gw_snapshot mgs2
        JOIN league_manager lm ON lm.manager_id = mgs2.manager_id
            AND lm.season_id = mgs2.season_id
        WHERE lm.league_id = $1 AND mgs2.gameweek = mgs.gameweek
    ), 2) AS ownership_percent,
    COUNT(*) FILTER (WHERE mp.is_captain = true) AS captain_count,
    COUNT(*) FILTER (WHERE mp.is_vice_captain = true) AS vice_captain_count
FROM manager_pick mp
JOIN manager_gw_snapshot mgs ON mp.snapshot_id = mgs.id
JOIN league_manager lm ON lm.manager_id = mgs.manager_id
    AND lm.season_id = mgs.season_id
WHERE lm.league_id = $1 AND lm.season_id = $2 AND mgs.gameweek = $3
GROUP BY mp.player_id, mgs.season_id, mgs.gameweek
ON CONFLICT (league_id, player_id, season_id, gameweek) DO UPDATE SET
    ownership_count = EXCLUDED.ownership_count,
    ownership_percent = EXCLUDED.ownership_percent,
    captain_count = EXCLUDED.captain_count,
    vice_captain_count = EXCLUDED.vice_captain_count,
    calculated_at = NOW();
```

## Implementation Plan

### Phase 1: Schema Migration

**File:** `backend/migrations/013_league_ownership_vice_captain.sql`

```sql
-- Add vice_captain_count column
ALTER TABLE league_ownership ADD COLUMN IF NOT EXISTS vice_captain_count INTEGER DEFAULT 0;
```

### Phase 2: Ownership Computation Function

**File:** `backend/scripts/compute_league_ownership.py` (new)

Create a reusable function that computes ownership for a specific league and gameweek:

```python
async def compute_league_ownership(
    conn: asyncpg.Connection,
    league_id: int,
    season_id: int,
    gameweek: int,
) -> int:
    """Compute and store ownership stats for a league and gameweek.

    Args:
        conn: Database connection
        league_id: League to compute ownership for
        season_id: Season ID
        gameweek: Gameweek to compute

    Returns:
        Number of player ownership records created/updated
    """
    # Implementation: Execute aggregation query above
    pass
```

### Phase 3: One-Time Backfill Script

**File:** `backend/scripts/backfill_league_ownership.py` (new)

```python
"""
One-time script to backfill league_ownership from historical manager_pick data.

Usage:
    python -m scripts.backfill_league_ownership
    python -m scripts.backfill_league_ownership --league 242017 --season 2
    python -m scripts.backfill_league_ownership --dry-run
"""

async def backfill_league_ownership(
    league_id: int,
    season_id: int,
    dry_run: bool = False,
) -> None:
    """Backfill ownership for all historical gameweeks.

    Process:
    1. Find all gameweeks with manager_pick data for this league
    2. For each gameweek, compute ownership
    3. Verify totals match expected
    """
    pass
```

**Execution flow:**
1. Query distinct gameweeks from `manager_gw_snapshot` for league members
2. For each gameweek (oldest to newest):
   - Call `compute_league_ownership()`
   - Log progress
3. Verify final counts

### Phase 4: Integrate into Scheduled Updates

**File:** `backend/scripts/scheduled_update.py` (modify)

Add after Manager Snapshots verification (step 12):

```python
# 13. Compute League Ownership for the processed gameweek
logger.info(f"Computing league ownership for GW{latest_finalized}...")
ownership_records = await compute_league_ownership(
    conn, LEAGUE_ID, season_id, latest_finalized
)
logger.info(f"League ownership computed: {ownership_records} player records")

# 14. Verify League Ownership data
if not await verify_league_ownership_data(
    conn, season_id, LEAGUE_ID, latest_finalized, expected_members=snapshots_total
):
    raise RuntimeError(
        f"League ownership verification failed for GW{latest_finalized}"
    )

# 15. All verified - mark gameweek as processed (renumbered from 13)
await update_collection_status(conn, season_id, latest_finalized)
```

### Phase 5: Verification Function

```python
async def verify_league_ownership_data(
    conn: asyncpg.Connection,
    season_id: int,
    league_id: int,
    gameweek: int,
    expected_members: int,
) -> bool:
    """Verify league ownership was computed correctly.

    Checks:
    - At least some ownership records exist for the gameweek
    - ownership_percent values sum to reasonable total (15 * 100% per manager ≈ 1500%)
    - Captain count total equals number of managers (each picks one captain)
    """
    pass
```

### Phase 6: Update Recommendations Service

**File:** `backend/app/services/recommendations.py` (modify)

Replace `_fetch_league_ownership()` with database query:

```python
async def _get_league_ownership_from_db(
    self,
    conn: asyncpg.Connection,
    league_id: int,
    season_id: int,
    gameweek: int,
) -> Counter:
    """Get ownership counts from pre-computed league_ownership table."""
    rows = await conn.fetch(
        """
        SELECT player_id, ownership_count
        FROM league_ownership
        WHERE league_id = $1 AND season_id = $2 AND gameweek = $3
        """,
        league_id, season_id, gameweek,
    )
    return Counter({row['player_id']: row['ownership_count'] for row in rows})
```

## Timing Strategy

### Scheduled Update Flow

```
Sunday 16:30 - Last match kicks off
Sunday 18:30 - Last match ends
Sunday ~20:00 - Bonus points calculated
Sunday ~22:00 - data_checked = true (FPL API finalized)
Monday 06:00 - Our scheduled update runs:
  1. Points Against (~2-5 min)
  2. Bootstrap sync (teams/players) (~5 sec)
  3. Fixtures (~2 sec)
  4. Chips (~30 sec)
  5. Manager Snapshots (~15 sec)  ← Populates manager_pick
  6. League Ownership (~2 sec)    ← NEW: Computes from manager_pick
  7. Mark GW as processed
```

### Why This Order Works

1. Manager Snapshots must complete first (provides `manager_pick` data)
2. League Ownership computation runs immediately after
3. Both use the same gameweek, ensuring consistency
4. Advisory lock prevents concurrent runs

### Retry Strategy

Built into `scheduled_update.py`:
- If League Ownership fails, gameweek is NOT marked as processed
- Next run (tomorrow 06:00) will retry
- Advisory lock prevents overlapping runs

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `migrations/013_league_ownership_vice_captain.sql` | Create | Add vice_captain_count |
| `scripts/compute_league_ownership.py` | Create | Reusable ownership computation |
| `scripts/backfill_league_ownership.py` | Create | One-time historical backfill |
| `scripts/scheduled_update.py` | Modify | Add ownership step after snapshots |
| `app/services/recommendations.py` | Modify | Use DB instead of live API |

## Testing Strategy

### Unit Tests

```python
# tests/test_league_ownership.py

async def test_compute_league_ownership_creates_records():
    """Ownership computation creates correct records."""
    pass

async def test_compute_league_ownership_handles_empty_picks():
    """No picks for gameweek returns 0 records."""
    pass

async def test_ownership_percent_calculation():
    """Percentages are calculated correctly."""
    pass

async def test_captain_count_aggregation():
    """Captain counts match actual captains."""
    pass
```

### Integration Tests

```python
async def test_scheduled_update_includes_ownership():
    """Full scheduled update computes ownership."""
    pass

async def test_recommendations_uses_db_ownership():
    """Recommendations service reads from league_ownership table."""
    pass
```

## Verification Checklist

### Backfill Verification

- [ ] Row count matches: `(players_owned) × (gameweeks) × (leagues)`
- [ ] No duplicate `(league_id, player_id, season_id, gameweek)` combinations
- [ ] `ownership_percent` values are between 0 and 100
- [ ] `captain_count` ≤ `ownership_count` for all rows
- [ ] Sum of `captain_count` per gameweek = number of managers

### Scheduled Update Verification

- [ ] Ownership computed after manager snapshots complete
- [ ] Gameweek not marked processed if ownership fails
- [ ] Logs show ownership computation timing and record count

## Rollback Plan

If issues occur:

1. **Revert to live API:** Keep `_fetch_league_ownership()` method, add feature flag
2. **Clear bad data:** `DELETE FROM league_ownership WHERE gameweek = $1`
3. **Re-run backfill:** `python -m scripts.backfill_league_ownership --gameweek 20`

## Performance Expectations

| Operation | Duration | Notes |
|-----------|----------|-------|
| Backfill (21 GWs) | ~30 sec | One-time, runs locally |
| Scheduled compute | ~2 sec | Per gameweek, part of daily run |
| Query ownership | ~50 ms | Uses indexed lookup |

## Dependencies

- ✅ `manager_pick` table populated (by Manager Snapshots)
- ✅ `league_manager` table populated (by Chips sync)
- ✅ `scheduled_update.py` runs daily

## References

- Backend architect recommendation: Compute from `manager_pick` instead of FPL API
- FPL API pick structure: `{element, is_captain, is_vice_captain, multiplier}`
- Existing ownership calculation: `backend/app/services/recommendations.py:_fetch_league_ownership()`
