# FPL API vs Database Usage Analysis

**Date:** 2026-01-13
**Status:** Backend is well-optimized with DB-first patterns

## Summary

The backend already implements DB-first patterns for all major endpoints. API calls are used appropriately:
- **Data Collection Scripts** - Expected to call FPL API (populate DB)
- **API Endpoints** - Use DB first, fall back to API when needed

## Detailed Findings

### 1. RecommendationsService (`app/services/recommendations.py`)

| API Call | Line | DB Alternative | Status |
|----------|------|----------------|--------|
| bootstrap-static | 868-880 | `player`, `gameweek`, `team` | **DB-FIRST** (API fallback) |
| fixtures | 869 | `fixture` | **DB-FIRST** (API fallback) |
| league standings | 1010 | `league_manager` | **DB-FIRST** (API fallback) |
| manager picks | 1030 | `league_ownership` | **DB-FIRST** (API fallback) |

**Implementation:** Lines 856-866 check for DB connection first:
```python
if conn is not None:
    elements = await self._get_players_from_db(conn, season_id)
    fixtures = await self._get_fixtures_from_db(conn, season_id)
    current_gameweek = await self._get_current_gameweek_from_db(conn, season_id)
```

### 2. ChipsService (`app/services/chips.py`)

| API Call | Line | DB Alternative | Status |
|----------|------|----------------|--------|
| league standings | 206 | `league_manager` | **CONDITIONAL** - Only when league not in DB |
| manager history | 437 | `chip_usage` | **CONDITIONAL** - Only when `sync=true` |

**Note:** Both are appropriate:
- League standings: One-time population per league
- Chip sync: User-requested refresh only

### 3. Data Collection Scripts (Expected API Usage)

| Script | Purpose | Status |
|--------|---------|--------|
| `scheduled_update.py` | Daily data sync | **KEEP API** |
| `collect_points_against.py` | Points against collection | **KEEP API** |
| `collect_manager_snapshots.py` | Manager history collection | **KEEP API** |

These scripts exist to populate the database - API calls are expected.

## Architecture Pattern

```
FPL API → Scheduled Jobs → PostgreSQL DB → Backend Services → Frontend
           (daily 06:00)    (Supabase)       (DB-first)
```

## Database Tables with FPL Data

| Table | Data | Populated By |
|-------|------|--------------|
| `player` | 795 players with stats, xG, xA, form | `scheduled_update.py --sync-bootstrap` |
| `team` | 20 Premier League teams | `scheduled_update.py` |
| `gameweek` | GW metadata, deadlines | `scheduled_update.py` |
| `fixture` | 380 fixtures with scores | `scheduled_update.py` |
| `league_ownership` | Per-player ownership per GW | `scheduled_update.py` |
| `points_against_by_fixture` | Points conceded per team | `collect_points_against.py` |
| `player_fixture_stats` | 35+ fields per player per fixture | `collect_points_against.py` |
| `manager_gw_snapshot` | Manager state per GW | `collect_manager_snapshots.py` |
| `manager_pick` | Squad picks (positions 1-15) | `collect_manager_snapshots.py` |
| `chip_usage` | Wildcard, bboost, etc. | `scheduled_update.py` |

## Caching Strategy

### In-Memory Caching

| Cache | TTL | Location |
|-------|-----|----------|
| Bootstrap-static | 5 min | `app/services/bootstrap_cache.py` |
| Points Against | 10 min | `app/api/routes.py` |
| Recommendations | 5 min | `app/api/routes.py` |

### Bootstrap Cache Features
- Shared singleton prevents duplicate fetches
- `asyncio.Lock` prevents thundering herd
- Only caches valid responses (with `elements` key)

## Performance Impact

| Endpoint | Before (API) | After (DB) | Improvement |
|----------|--------------|------------|-------------|
| `/recommendations/league/{id}` | ~12,000ms | ~558ms | **21x faster** |

## Conclusion

**No action required.** The backend already:
1. Uses DB-first patterns for all read operations
2. Falls back to API only when DB unavailable
3. Uses appropriate caching for expensive operations
4. Scripts correctly populate DB from API

## Future Considerations

If new endpoints are added, follow the established pattern:
1. Check if DB connection available
2. Query DB first
3. Fall back to API if DB unavailable or data missing
4. Cache results with appropriate TTL
