# Backend

Python FastAPI application for analytics and data services.

> **Related docs:** See `FPL_RULES.md` for FPL game rules (transfers, chips, scoring system) that inform implementations.

## ⚠️ IMPORTANT: DB-First Architecture

**Before making ANY FPL API call, check if the data exists in the database.**

See [`DB.md` → Data Availability Quick Reference](./DB.md#%EF%B8%8F-data-availability-quick-reference) for:
- Complete list of data available in DB vs API
- Performance comparison (DB: ~50ms vs API: ~3-5s)
- Field name mappings (DB columns ↔ API fields)
- Code examples (wrong vs right)

**Rule of thumb**: If it's not live match data, it's probably in the DB.

## Development

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload  # Start dev server (port 8000)
python -m pytest               # Run tests
```

## Local Development with Docker

For full-stack local development (frontend + backend + database), use the local Docker setup.

### Quick Start

```bash
cd frontend
npm run start:dev      # Starts everything (DB, backend, frontend)
npm run start:prod     # Frontend with production backend (vercel dev)
```

### What `start:dev` Does

1. Starts PostgreSQL in Docker (`tapas-fpl-db`)
2. Runs database migrations
3. Seeds test data (optional)
4. Starts backend API (port 8000)
5. Starts frontend dev server (Vite, port 5173)

### Keeping Local DB in Sync with Production

The local database must have the **same migrations** as production (Supabase).

**When adding new migrations:**

1. Create migration file in `backend/migrations/` (numbered sequentially)
2. Test locally: `npm run start:dev`
3. Deploy to production:
   ```bash
   fly ssh console --app tapas-fpl-backend -C "python -m scripts.migrate"
   ```

**When production has new migrations:**

```bash
# Check migration status
docker exec tapas-fpl-db psql -U tapas -d tapas_fpl -c "SELECT * FROM _migrations ORDER BY name;"

# If out of sync, easiest fix is to recreate local DB
docker compose down -v  # -v removes the volume (data)
npm run start:dev       # Recreates DB with all migrations
```

**Migration naming:**
- Use sequential numbers: `001_`, `002_`, etc.
- Never rename migration files after they're applied to production
- If you need to fix a migration, create a new one

**Writing portable migrations:**

Migrations must work on both local (Docker) and production (Supabase):

```sql
-- ❌ DON'T: Hardcode usernames
ALTER TABLE my_table OWNER TO postgres;

-- ✅ DO: Let owner be set by whoever runs migration
-- (Just omit OWNER statements entirely)

-- ✅ DO: RLS works regardless of owner
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow read" ON my_table FOR SELECT USING (true);
```

| Statement | Local | Production | Recommendation |
|-----------|-------|------------|----------------|
| `OWNER TO postgres` | ❌ Fails | ✅ Works | Omit |
| `OWNER TO tapas` | ✅ Works | ❌ Fails | Omit |
| `ENABLE ROW LEVEL SECURITY` | ✅ Works | ✅ Works | Use |
| `CREATE POLICY` | ✅ Works | ✅ Works | Use |

### Test Data

Local development uses mock data seeded by `scripts/seed_test_data.py`. This is NOT real FPL data.

```bash
# Manually seed test data (usually automatic via start:dev)
cd backend
source .venv/bin/activate
DATABASE_URL="postgresql://tapas:localdev@localhost:5432/tapas_fpl" python -m scripts.seed_test_data
```

### Docker Commands

```bash
# Start only the database
cd backend && docker compose up -d

# Stop everything
docker compose down

# Reset database (delete all data)
docker compose down -v

# View database logs
docker logs tapas-fpl-db

# Connect to database directly
docker exec -it tapas-fpl-db psql -U tapas -d tapas_fpl
```

### Local vs Production Differences

| Aspect | Local (Docker) | Production (Supabase) |
|--------|----------------|----------------------|
| Database | PostgreSQL in Docker | Supabase PostgreSQL 17 |
| User | `tapas` | `postgres` |
| Database name | `tapas_fpl` | `postgres` |
| Connection | `localhost:5432` | IPv6 direct / IPv4 pooler |
| Data | Test data | Real FPL data |
| RLS | Disabled | Enabled |

### Troubleshooting Local Setup

**"relation does not exist"**
- Migration tracking out of sync
- Fix: `docker compose down -v && npm run start:dev`

**"role 'postgres' does not exist"**
- Migration file has `OWNER TO postgres` (production-only)
- Fix: Edit migration to remove `OWNER TO postgres` line

**Port 5432 already in use**
```bash
# Check what's using the port
sudo lsof -i :5432
# Stop local PostgreSQL if running
sudo systemctl stop postgresql
```

## Planning & Design

### Data Model Validation (Critical!)

**Before planning any implementation, verify that actual data matches your assumptions.**

This lesson was learned from a refactoring session where test fixtures and service implementations were based on incorrect assumptions about FPL API response structures and database schema. The result: hours of debugging cache pollution, mock data mismatches, and type errors that could have been avoided with upfront data validation.

#### The Problem

When planning implementations involving external APIs or complex data models:
- **Assumptions are often wrong** - Documentation may be outdated, or you may misremember field names/types
- **Mock data diverges from reality** - Test fixtures based on assumptions break in subtle ways
- **Type mismatches cause silent bugs** - String keys vs integer keys, nullable vs required fields

#### Validation Checklist

Before writing any code, run these verification steps:

1. **Query actual data sources:**
   ```bash
   # FPL API - check actual response structure
   curl -s "https://fantasy.premierleague.com/api/entry/91555/history/" | jq '.current[0] | keys'

   # Database - check actual column types and values
   fly ssh console --app tapas-fpl-backend -C "python -c \"
   import asyncio, asyncpg, os
   async def check():
       conn = await asyncpg.connect(os.environ['DATABASE_URL'])
       row = await conn.fetchrow('SELECT * FROM manager_gw_snapshot LIMIT 1')
       print(dict(row) if row else 'No data')
   asyncio.run(check())
   \""
   ```

2. **Document field names and types explicitly:**
   - Don't assume `season_id` is a string like `"2024-25"` - verify it's actually integer `1`
   - Don't assume response keys are integers - they may be strings (`"123"` vs `123`)
   - Check nullable fields - `overall_rank` can be `None` early in season

3. **Create TypedDicts from actual data:**
   ```python
   # AFTER verifying actual structure, create typed mock data
   class ManagerHistoryRow(TypedDict):
       gameweek: int
       total_points: int
       overall_rank: int | None  # Nullable! Verified from API
   ```

4. **Verify mock data matches production:**
   - Cross-reference test fixtures against real API responses
   - Use actual field names from database `\d table_name` output
   - Test with real league/manager IDs before generalizing

#### Common Data Model Pitfalls

| Assumption | Reality | Impact |
|------------|---------|--------|
| `season_id` is `"2024-25"` | `season_id` is integer `1` | All queries fail |
| Response keys are integers | Keys are strings in JSON | KeyError in tests |
| All fields are required | Many fields nullable | NoneType errors |
| API structure matches docs | API may have changed | Wrong field access |
| `DECIMAL` columns return `float` | PostgreSQL returns `decimal.Decimal` | TypeError on arithmetic |
| `dict.get(key, default)` handles None | Default only applies when key missing | TypeError: float(None) |

### Database Type Safety (Critical for TDD!)

**Learned from Tier 3 xG metrics feature:** Despite having 92 TDD tests, production bugs escaped because mock data didn't match actual database types.

#### PostgreSQL → Python Type Mapping

| PostgreSQL Type | Python Type | Gotcha |
|-----------------|-------------|--------|
| `INTEGER` | `int` | Safe |
| `TEXT`, `VARCHAR` | `str` | Safe |
| `BOOLEAN` | `bool` | Safe |
| `NUMERIC`, `DECIMAL` | `decimal.Decimal` | **Won't mix with `float`!** |
| `REAL`, `DOUBLE PRECISION` | `float` | Safe |
| `JSONB` | `dict` | Keys are strings |
| Nullable columns | `None` or value | Must check explicitly |

#### The Decimal/Float Problem

```python
# PostgreSQL NUMERIC/DECIMAL columns return decimal.Decimal
row = await conn.fetchrow("SELECT expected_goals FROM player_fixture_stats LIMIT 1")
xg = row["expected_goals"]  # type: decimal.Decimal, NOT float!

# This CRASHES in production:
result = xg / 2.0  # TypeError: unsupported operand type(s) for /: 'decimal.Decimal' and 'float'

# Fix: Convert at function entry
xg = float(xg) if xg is not None else 0.0
```

#### The dict.get() Pitfall

```python
# dict.get(key, default) only applies when key is MISSING
# If key exists with None value, you get None back!

pick = {"total_points": None}  # Key exists, value is None

# WRONG - crashes with TypeError: float(None)
total_points = float(pick.get("total_points", 0))

# CORRECT - explicit None check
total_points_raw = pick.get("total_points")
total_points = 0.0 if total_points_raw is None else float(total_points_raw)
```

#### TDD Planning Checklist for Database Code

Before writing TDD tests, run these verification steps:

1. **Check column types in database:**
   ```sql
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'your_table';
   ```

2. **Print actual Python types from production:**
   ```python
   row = await conn.fetchrow("SELECT * FROM your_table LIMIT 1")
   for key, value in dict(row).items():
       print(f"{key}: {type(value).__name__} = {value}")
   ```

3. **Create mock data that matches actual types:**
   ```python
   from decimal import Decimal

   # BAD - uses Python native types
   mock_row = {"expected_goals": 0.5, "total_points": 10}

   # GOOD - matches actual database types
   mock_row = {"expected_goals": Decimal("0.5"), "total_points": 10}

   # ALSO TEST - nullable columns with None
   mock_row_null = {"expected_goals": None, "total_points": None}
   ```

4. **Test both key-missing and key-with-None scenarios:**
   ```python
   @pytest.mark.parametrize("pick,expected", [
       ({}, 0.0),                      # Key missing
       ({"total_points": None}, 0.0),  # Key exists, value None
       ({"total_points": 10}, 10.0),   # Normal case
   ])
   def test_handles_total_points_variants(pick, expected):
       result = extract_total_points(pick)
       assert result == expected
   ```

5. **Use grep to find ALL usages before claiming "done":**
   ```bash
   # Find all functions using a field
   grep -n "expected_goals\|xg" backend/app/services/*.py
   ```

#### Example: What We Got Wrong

Tier 3 xG feature had 92 TDD tests but missed 3 production bugs:

| Bug | Mock Data | Production Data | Fix |
|-----|-----------|-----------------|-----|
| Decimal/float | `0.5` (float) | `Decimal("0.5")` | `float(xg)` |
| Incomplete fix | Fixed 1 function | 3 functions used xG | Grep all usages |
| None handling | `0` (int) | `None` (nullable) | Explicit None check |

**See:** `docs/features/tier3-xg-metrics-feature.md` for full postmortem.

#### Previous Example: API Response Structure

```python
# WRONG - Based on assumptions
mock_data = {"season_id": "2024-25", "positions": {123: 1}}

# CORRECT - After verifying actual data
mock_data = {"season_id": 1, "positions": {"123": 1}}
```

**Key takeaway:** 30 minutes of data verification upfront saves hours of debugging later.

### asyncpg Connection Constraints (Critical!)

**Learned from dashboard consolidation feature:** A single asyncpg connection cannot execute multiple queries concurrently. Attempting to do so causes runtime errors.

#### The Problem

```python
# ❌ WRONG - crashes with "cannot perform operation: another operation is in progress"
async def get_data(conn: asyncpg.Connection):
    results = await asyncio.gather(
        conn.fetch("SELECT * FROM picks"),
        conn.fetch("SELECT * FROM transfers"),
        conn.fetch("SELECT * FROM chips"),
    )
```

**Error message:**
```
asyncpg.exceptions._base.InterfaceError: cannot perform operation: another operation is in progress
```

#### The Solution

**Option 1: Sequential execution (simple, recommended for most cases)**

```python
# ✅ CORRECT - sequential awaits on same connection
async def get_data(conn: asyncpg.Connection):
    picks = await conn.fetch("SELECT * FROM picks")
    transfers = await conn.fetch("SELECT * FROM transfers")
    chips = await conn.fetch("SELECT * FROM chips")
    return picks, transfers, chips
```

**Option 2: Connection pool for true parallelism (when performance critical)**

```python
# ✅ CORRECT - parallel execution with multiple connections
async def get_data_parallel(pool: asyncpg.Pool):
    async with pool.acquire() as conn1, pool.acquire() as conn2, pool.acquire() as conn3:
        results = await asyncio.gather(
            conn1.fetch("SELECT * FROM picks"),
            conn2.fetch("SELECT * FROM transfers"),
            conn3.fetch("SELECT * FROM chips"),
        )
    return results
```

#### When to Use Each Approach

| Scenario | Approach | Rationale |
|----------|----------|-----------|
| Route handler with passed connection | Sequential | Connection already acquired, can't get more |
| Background job needing max throughput | Pool + parallel | Worth the complexity for speed |
| Service with 3-6 queries | Sequential | Simpler, latency acceptable |
| Service with 10+ independent queries | Pool + parallel | Sequential would be too slow |

#### Testing Considerations

When writing tests for services that use sequential queries:

```python
# Mock returns values in order for sequential calls
mock_conn.fetch.side_effect = [
    first_query_result,
    second_query_result,
    third_query_result,
]
```

**Key insight:** With sequential execution, if the second query fails, the third never runs. Test this behavior explicitly.

## Database Migrations

Migrations are tracked in a `_migrations` table and managed via the migration script:

```bash
cd backend
source .venv/bin/activate

# Run pending migrations
DATABASE_URL="postgresql://..." python -m scripts.migrate

# Show migration status
python -m scripts.migrate --status

# Reset database (DANGEROUS - drops all tables)
python -m scripts.migrate --reset
```

**Environment variables:**
- `DATABASE_URL`: Full PostgreSQL connection string (recommended)
- Or set in `.env.local` file

**Note:** The `_migrations` table tracks which migrations have been applied. If you ran migrations via Supabase SQL Editor initially, create the tracking table:

```sql
CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO _migrations (name) VALUES
    ('001_core_tables.sql'),
    ('002_historical.sql'),
    ('003_analytics.sql'),
    ('004_points_against.sql'),
    ('005_season_2025_26.sql'),
    ('006_player_fixture_stats.sql'),
    ('007_player_fixture_stats_improvements.sql'),
    ('008_chip_usage.sql'),
    ('009_fix_points_against_pk.sql'),
    ('010_collection_status.sql'),
    ('011_pfs_captain_lookup_index.sql')
ON CONFLICT (name) DO NOTHING;
```

## Structure

```
backend/
├── app/
│   ├── main.py           # FastAPI app entry point
│   ├── config.py         # Settings and cache TTLs
│   ├── db.py             # Database connection pool
│   ├── api/routes.py     # API endpoints
│   └── services/
│       ├── fpl_client.py     # FPL API client with rate limiting
│       ├── points_against.py # Points Against service
│       └── chips.py          # Chips Remaining service
├── migrations/           # SQL migrations for Supabase
│   ├── 001_core_tables.sql
│   ├── 002_historical.sql
│   ├── 003_analytics.sql
│   ├── 004_points_against.sql
│   ├── 005_season_2025_26.sql
│   ├── 006_player_fixture_stats.sql
│   ├── 007_player_fixture_stats_improvements.sql
│   ├── 008_chip_usage.sql
│   ├── 009_fix_points_against_pk.sql
│   ├── 010_collection_status.sql
│   └── 011_pfs_captain_lookup_index.sql
├── scripts/
│   ├── migrate.py                    # Database migration runner
│   ├── collect_points_against.py     # Full Points Against data collector (~66 min)
│   ├── collect_manager_snapshots.py  # Manager GW snapshots + picks (~10 min)
│   ├── compute_league_ownership.py   # Ownership computation functions (reusable)
│   ├── backfill_league_ownership.py  # One-time historical ownership backfill
│   ├── scheduled_update.py           # Combined scheduled update (daily via Supercronic)
│   ├── test_small_collection.py      # Test collection with 5 players (~2 min)
│   └── seed_test_data.py             # Test data seeder
├── tests/
│   ├── conftest.py           # Test fixtures (MockDB, async_client)
│   ├── test_api.py           # API endpoint tests
│   ├── test_config.py        # Settings tests
│   ├── test_chips_api.py     # Chips API endpoint tests
│   ├── test_chips_service.py # Chips service unit tests
│   └── test_fpl_client.py    # FPL API client tests
├── fly.toml              # Fly.io deployment config
├── DB.md                 # Database schema documentation
└── requirements.txt
```

## Database (Supabase)

### Connection Details
- **Project**: tapas-and-tackles
- **Region**: EU West 1 (Ireland)
- **PostgreSQL**: 17.6.1
- **URL**: `https://itmykooxrbrdbgqwsesb.supabase.co`

### Schema Design

The database uses **composite primary keys** `(id, season_id)` for FPL entities (team, player, league, manager) to support multi-season data while keeping familiar FPL IDs.

**Migration files** in `migrations/`:
| File | Description |
|------|-------------|
| `001_core_tables.sql` | Season, app_user, team, player, gameweek, fixture, league, manager |
| `002_historical.sql` | manager_gw_snapshot, manager_pick, transfer, chip_usage, player_gw_stats, price_change |
| `003_analytics.sql` | expected_points_cache, performance_delta, player_form, recommendation_score, league_ownership |
| `004_points_against.sql` | points_against_by_fixture, points_against_collection_status, points_against_season_totals view |
| `005_season_2025_26.sql` | Add 2025-26 season, clean test data from points_against tables |
| `006_player_fixture_stats.sql` | player_fixture_stats (35+ fields), player_vs_team_stats view, player_season_deltas view, get_player_form() function |
| `007_player_fixture_stats_improvements.sql` | updated_at column + trigger, check constraint, improved view and function |
| `008_chip_usage.sql` | chip_usage table for tracking manager chip activations |
| `009_fix_points_against_pk.sql` | Fix points_against_by_fixture primary key |
| `010_collection_status.sql` | collection_status table for tracking scheduled update progress per season |
| `011_pfs_captain_lookup_index.sql` | Index for captain differential lookup query (gameweek ASC order) |

### Table Overview (24 tables)

**Core FPL Entities:**
- `season` - FPL seasons (current: 2025-26)
- `team` - Premier League teams (composite PK: id, season_id)
- `player` - FPL players with stats, prices, ICT index
- `gameweek` - GW metadata, deadlines, most captained
- `fixture` - Match data with scores and stats (JSONB)
- `league` - Mini-leagues
- `manager` - FPL entries/teams
- `league_manager` - Many-to-many league membership

**App User Management:**
- `app_user` - Our app's users (UUID PK, GDPR soft-delete)
- `tracked_league` - Leagues a user wants to track
- `tracked_manager` - Individual managers to follow

**Historical Tracking:**
- `manager_gw_snapshot` - Manager state per gameweek
- `manager_pick` - Squad picks per GW (positions 1-15)
- `transfer` - Transfer history with prices
- `chip_usage` - Wildcard, bench boost, etc.
- `player_gw_stats` - Per-player per-GW performance
- `price_change` - Player price change history

**Analytics (future):**
- `expected_points_cache` - xP predictions
- `performance_delta` - Over/under performance tracking
- `player_form` - Multi-horizon form calculations
- `recommendation_score` - Punt/defensive/sell scores
- `league_ownership` - League-specific ownership stats

**Points Against & Player Stats:**
- `points_against_by_fixture` - FPL points conceded per team per fixture
- `points_against_collection_status` - Data collection state tracking
- `player_fixture_stats` - Detailed per-player per-fixture stats (35+ fields)

**Collection Tracking:**
- `collection_status` - Tracks last processed gameweek per collector per season (scheduled updates)

### Key Design Patterns

**Composite Foreign Keys:**
```sql
-- Player references team within same season
FOREIGN KEY (team_id, season_id) REFERENCES team(id, season_id)
```

**Partial Indexes:**
```sql
-- Only index current season's current gameweek
CREATE INDEX idx_gameweek_current ON gameweek(season_id, is_current)
WHERE is_current = true;
```

**GDPR Soft Delete:**
```sql
-- app_user has deleted_at for soft delete
CREATE INDEX idx_app_user_active ON app_user(email)
WHERE deleted_at IS NULL;
```

### Detailed Schema Reference

See `DB.md` for complete schema documentation including:
- All column definitions and types
- Foreign key relationships
- Index strategies
- Design decisions and rationale

## Features

### Points Against API

Tracks FPL points conceded by each Premier League team per fixture. Useful for identifying weak defenses (captain targets) and strong defenses (avoid).

**Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/points-against` | Season totals for all teams, sorted by total points conceded |
| `GET /api/v1/points-against/{team_id}/history` | Fixture-by-fixture breakdown for a team |
| `GET /api/v1/points-against/status` | Data collection status and last update time |

**Query Parameters:**
- `season_id` (default: 1, range: 1-100) - Season to query

**Response Caching:**
- In-memory cache with 10-minute TTL
- Points Against data is static within a gameweek

**Data Collection:**

```bash
# IMPORTANT: Collection MUST run on Fly.io (needs IPv6 for Supabase direct connection)

# Quick collection (run interactively - blocks terminal)
fly ssh console --app tapas-fpl-backend -C "python -m scripts.collect_points_against"

# Background collection (recommended - keeps running if SSH disconnects)
fly ssh console --app tapas-fpl-backend -C "nohup python -m scripts.collect_points_against > /tmp/collection.log 2>&1 &"

# Monitor background collection
fly ssh console --app tapas-fpl-backend -C "tail -20 /tmp/collection.log"

# Show collection status
fly ssh console --app tapas-fpl-backend -C "python -m scripts.collect_points_against --status"

# Reset and re-collect (interactive - requires confirmation)
fly ssh console --app tapas-fpl-backend
# Then inside the shell:
python -m scripts.collect_points_against --reset
```

**Collection Details:**
- Fetches ~790 players from FPL API
- Rate limited to **0.2 req/sec** (1 request every 5 seconds) to avoid FPL API rate limits
- Each player requires 1 API call to `/api/element-summary/{player_id}/`
- **Total time: ~66 minutes** (790 players × 5 seconds)
- Aggregates points scored against each opponent per fixture
- Saves detailed player fixture stats (35+ fields per player per fixture)
- Fails if >10% of requests fail (prevents partial data)

**Rate Limiting:**
- Default: 0.2 requests/second, max 1 concurrent
- Configurable in script: `FplApiClient(requests_per_second=0.2, max_concurrent=1)`
- More aggressive rate (1 req/sec) may trigger FPL API rate limits

**Data Saving Behavior:**
- `player_fixture_stats` - Saved **incrementally** after each player (survives crash)
- `points_against_by_fixture` - Saved **at the end** in single transaction (all or nothing)

**Data Saved:**
1. `points_against_by_fixture` - Aggregated points conceded per team per fixture
2. `player_fixture_stats` - Individual player stats (xG, xA, BPS, ICT index, etc.)

### Chips Remaining API

Tracks chip usage per manager with season-half support (FPL 2025-26: all chips reset at GW20).

**Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/chips/league/{league_id}` | Chip usage for all managers in a league |
| `GET /api/v1/chips/manager/{manager_id}` | Chip usage for a single manager |

**Query Parameters:**
- `season_id` (default: 1) - Season ID
- `current_gameweek` (required for league endpoint) - Current gameweek (1-38)
- `sync` (default: false) - Fetch fresh data from FPL API before returning

**Response Format:**
```json
{
  "manager_id": 91555,
  "season_id": 1,
  "first_half": {
    "chips_used": [
      {"chip_type": "wildcard", "gameweek": 6, "points_gained": null}
    ],
    "chips_remaining": ["3xc", "bboost", "freehit"]
  },
  "second_half": {
    "chips_used": [],
    "chips_remaining": ["3xc", "bboost", "freehit", "wildcard"]
  }
}
```

**On-Demand Sync:**
- Set `sync=true` to fetch latest chip data from FPL API
- Uses `asyncio.gather()` for concurrent requests (rate-limited)
- Partial failures are logged but don't fail the entire sync

**Error Handling:**
- `429` - FPL API rate limited
- `502` - FPL API unavailable
- `504` - FPL API timeout
- `503` - Database unavailable

### Free Transfers Calculation

Calculates remaining free transfers for each manager based on their gameweek history.

**Implementation:** `app/services/calculations.py` → `calculate_free_transfers()`

#### FPL Free Transfer Rules (2024/25 onwards)

| Rule | Description |
|------|-------------|
| Starting FT | 1 FT at gameweek 1 |
| Weekly gain | +1 FT after each completed gameweek |
| Maximum | 5 FT (changed from 2 in 2024/25) |
| Unused FT | Carries forward to next gameweek (up to max) |

#### Transfer Scenarios

| Scenario | FT Before | Transfers Made | FT After | Notes |
|----------|-----------|----------------|----------|-------|
| Normal transfer | 2 | 1 | 2 | 2 - 1 + 1 (weekly gain) |
| Use all FT | 3 | 3 | 1 | 3 - 3 + 1 |
| Hit (-4 points) | 2 | 3 | 1 | 2 - 2 (depletes to 0) + 1 |
| Hit (-8 points) | 1 | 3 | 1 | 1 - 1 (depletes to 0) + 1 |
| No transfers | 3 | 0 | 4 | 3 + 1 (capped at 5) |
| At max | 5 | 0 | 5 | Already at max, no gain |

#### Chip Behavior

| Chip | FT Consumption | Weekly Gain | Effect |
|------|----------------|-------------|--------|
| **Wildcard** | None (unlimited free transfers) | **NO +1** | Preserves banked FT, no weekly gain |
| **Free Hit** | None (team reverts after GW) | **NO +1** | Preserves banked FT, no weekly gain |
| **Triple Captain** | Normal | +1 | No special FT handling |
| **Bench Boost** | Normal | +1 | No special FT handling |

> **Important:** You do NOT gain a free transfer during Wildcard or Free Hit weeks.
> The +1 FT is earned in the following gameweek, not the chip week itself.

**Wildcard/Free Hit Examples:**

| Scenario | FT Before Chip | FT During Chip GW | FT Next GW |
|----------|----------------|-------------------|------------|
| Wildcard with 3 FT | 3 | 3 (preserved, no +1) | 4 (3 + weekly) |
| Free Hit with 2 FT | 2 | 2 (preserved, no +1) | 3 (2 + weekly) |
| Wildcard with 5 FT | 5 | 5 (preserved) | 5 (capped at max) |

#### Hit Points (-4 Penalty)

The -4 point penalty applies when you make more transfers than your available FT:

```
Extra transfers = transfers_made - available_FT
Hit penalty = extra_transfers × (-4)
```

**Example:** 2 FT available, make 4 transfers → 2 extra × -4 = -8 points

**Important:** The FPL API returns `transfers_cost` as a **negative number** (e.g., `-4`, `-8`).

#### Season-Specific Rules

| Season | Max FT | Season ID |
|--------|--------|-----------|
| 2024/25 onwards | 5 | ≥ 1 |
| 2023/24 and earlier | 2 | < 1 (legacy) |

#### API Data Source

Free transfer calculation uses the FPL API `/api/entry/{manager_id}/history/` endpoint:

```json
{
  "current": [
    {
      "event": 21,
      "transfers_made": 1,
      "transfers_cost": 0,
      "active_chip": null
    },
    {
      "event": 20,
      "transfers_made": 3,
      "transfers_cost": -4,
      "active_chip": "wildcard"
    }
  ]
}
```

**Key Fields:**
- `transfers_made` - Number of transfers made in the gameweek
- `transfers_cost` - Point penalty (negative: -4, -8, etc. or 0)
- `active_chip` - Chip played: `"wildcard"`, `"freehit"`, `"3xc"`, `"bboost"`, or `null`

#### Implementation Notes

**Chip Data Source:**

The backend uses two tables that may contain chip data:

1. `manager_gw_snapshot.chip_used` - May be NULL even when chip was used
2. `chip_usage` table - Authoritative chip usage records

The history query JOINs both tables to ensure chip detection:

```sql
SELECT mgs.manager_id,
       mgs.gameweek,
       COALESCE(mgs.chip_used, cu.chip_type) as active_chip
FROM manager_gw_snapshot mgs
LEFT JOIN chip_usage cu ON cu.manager_id = mgs.manager_id
                       AND cu.season_id = mgs.season_id
                       AND cu.gameweek = mgs.gameweek
```

**Frontend-Backend Coordination:**

The frontend must send the correct gameweek for FT calculation:
- **Before deadline:** Send `currentGameweek.id` (shows FT remaining for this GW)
- **After deadline:** Send `currentGameweek.id + 1` (includes +1 for completed GW)

This is handled in `Statistics.tsx` via `freeTransfersGameweek` memo.

### Recommendations API

Provides player recommendations based on league ownership, form, and underlying stats (xG, xA).

**Endpoints:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/recommendations/league/{league_id}` | Player recommendations for a league |

**Query Parameters:**
- `season_id` (default: 1) - Season ID
- `limit` (default: 10, max: 50) - Number of players per category

**Response Format:**
```json
{
  "league_id": 12345,
  "season_id": 1,
  "punts": [...],      // Low ownership differentials (<40% in league)
  "defensive": [...],  // Popular players (>40% ownership) in good form
  "time_to_sell": [...] // Players with poor form/fixtures
}
```

Each player object contains:
- `id`, `name`, `team`, `position`, `price`
- `ownership` (percentage in league, 0-100)
- `score` (recommendation strength, 0-1)
- `xg90`, `xa90`, `form`

**How It Works:**
1. Fetches all players from FPL bootstrap-static API
2. Fetches all manager picks in the league (parallel, rate-limited)
3. Calculates per-90 stats (xG90, xA90, xGC90, CS90)
4. Computes percentiles across all players
5. Scores players based on form, underlying stats, and league ownership
6. Categorizes into punts/defensive/time_to_sell

**Performance:**
- With `league_ownership` data: **~2-3 seconds** (DB query + FPL bootstrap for player stats)
- Without `league_ownership` data: **~12 seconds** (falls back to FPL API for manager picks)
- Cached requests: **instant** (5-minute TTL)

**Caching:**
- In-memory cache with 5-minute TTL (shorter than other endpoints since ownership changes)
- Cache key: `recommendations_{league_id}_{season_id}_{limit}`
- Cache automatically cleared between tests via `conftest.py` autouse fixture

**Data Source Priority:**
- Primary: `league_ownership` table (populated by `scheduled_update.py`)
- Fallback: FPL API (fetches 50 manager picks, rate-limited, slow)

**Known Limitations:**
- No fixture difficulty integration yet
- Relies on FPL API availability (503 if FPL is down)
- Cold start penalty on Fly.io (~2-3s additional)

### FPL API Client

Rate-limited async client for FPL API (`app/services/fpl_client.py`).

**Features:**
- Configurable rate limiting (default: 1 req/sec, 5 concurrent)
- Automatic retries with exponential backoff
- Retries on: HTTP 429/500/502/503/504, timeouts, network errors

**Usage:**
```python
from app.services.fpl_client import FplApiClient

client = FplApiClient(requests_per_second=1.0, max_concurrent=5)
bootstrap = await client.get_bootstrap()  # Players, teams, gameweeks
history = await client.get_player_history(player_id)  # Per-GW stats
```

## Scripts

All scripts must be run from Fly.io SSH due to IPv6 requirement for Supabase connection.

### collect_points_against.py

Full data collection script that fetches all player histories from FPL API.

```bash
# Full collection (background - recommended)
fly ssh console --app tapas-fpl-backend -C "nohup python -m scripts.collect_points_against > /tmp/collection.log 2>&1 &"

# Check status
fly ssh console --app tapas-fpl-backend -C "python -m scripts.collect_points_against --status"

# Reset and re-collect (interactive)
fly ssh console --app tapas-fpl-backend
python -m scripts.collect_points_against --reset
```

**Options:**
- `--status` - Show collection status and team totals
- `--reset` - Clear all data and re-run (requires confirmation)

**Output:**
- Progress updates every 50 players
- ETA calculation
- Final summary: players processed, errors, fixtures saved

### collect_manager_snapshots.py

Bulk collection script for manager gameweek snapshots and picks. Required for H2H comparison feature.

```bash
# Full collection for default league (242017)
fly ssh console --app tapas-fpl-backend -C "python -m scripts.collect_manager_snapshots"

# Check status
fly ssh console --app tapas-fpl-backend -C "python -m scripts.collect_manager_snapshots --status"

# Single manager (for testing)
fly ssh console --app tapas-fpl-backend -C "python -m scripts.collect_manager_snapshots --manager 91555"

# Specific league
fly ssh console --app tapas-fpl-backend -C "python -m scripts.collect_manager_snapshots --league 123456"
```

**Options:**
- `--status` - Show collection status (managers, GWs, picks)
- `--manager <id>` - Collect single manager only
- `--league <id>` - Use specific league (default: 242017)
- `--reset` - Clear all data and re-run (requires confirmation)

**Data Saved:**
- `manager_gw_snapshot` - Manager state per gameweek (points, rank, transfers, bank)
- `manager_pick` - Squad picks per GW (15 players with position, captain, multiplier)

**Runtime:** ~10 minutes for 20 managers × 21 GWs

### compute_league_ownership.py

Reusable module for computing per-gameweek player ownership statistics from `manager_pick` data. Used by both `backfill_league_ownership.py` and `scheduled_update.py`.

**Functions:**
- `compute_league_ownership()` - Aggregates ownership and upserts to `league_ownership`
- `verify_league_ownership_data()` - Validates computed ownership data
- `get_gameweeks_with_picks()` - Lists gameweeks with available pick data

**Not run directly** - imported by other scripts.

### backfill_league_ownership.py

One-time backfill script to populate historical `league_ownership` data from existing `manager_pick` records.

```bash
# Preview what would be done
fly ssh console --app tapas-fpl-backend -C "python -m scripts.backfill_league_ownership --dry-run"

# Run backfill for all gameweeks
fly ssh console --app tapas-fpl-backend -C "python -m scripts.backfill_league_ownership"

# Backfill specific gameweek only
fly ssh console --app tapas-fpl-backend -C "python -m scripts.backfill_league_ownership --gameweek 20"

# Backfill specific league
fly ssh console --app tapas-fpl-backend -C "python -m scripts.backfill_league_ownership --league 242017"
```

**Options:**
- `--dry-run` - Show what would be done without making changes
- `--league <id>` - League to backfill (default: 242017)
- `--season <id>` - Season ID (auto-detected if not provided)
- `--gameweek <num>` - Single gameweek to backfill (all if not provided)

**Data Saved:**
- `league_ownership` - Per-player ownership stats (count, percent, captain count)

**Runtime:** ~30 seconds for 21 gameweeks

### test_small_collection.py

Test script for verifying collection logic with a small sample (5 players).

```bash
fly ssh console --app tapas-fpl-backend -C "python scripts/test_small_collection.py"
```

**Purpose:**
- Verify database schema matches collection script
- Test in ~2 minutes instead of ~66 minutes
- Verify `player_fixture_stats` and `points_against_by_fixture` inserts work
- Verify `points_against_collection_status` tracking

### migrate.py

Database migration runner with tracking.

```bash
# Run pending migrations
fly ssh console --app tapas-fpl-backend -C "python -m scripts.migrate"

# Show migration status
fly ssh console --app tapas-fpl-backend -C "python -m scripts.migrate --status"

# Reset database (DANGEROUS)
fly ssh console --app tapas-fpl-backend -C "python -m scripts.migrate --reset"
```

### seed_test_data.py

Seed test data for development.

```bash
fly ssh console --app tapas-fpl-backend -C "python -m scripts.seed_test_data"
```

### scheduled_update.py

Combined scheduled update that runs daily via Supercronic. Updates Points Against, Manager Snapshots, Chips data, and League Ownership.

```bash
# Run scheduled update
fly ssh console --app tapas-fpl-backend -C "python -m scripts.scheduled_update"

# Check status
fly ssh console --app tapas-fpl-backend -C "python -m scripts.scheduled_update --status"

# Dry run (check what would be updated without making changes)
fly ssh console --app tapas-fpl-backend -C "python -m scripts.scheduled_update --dry-run"

# Sync player stats only (goals, assists, xG, xA, form, etc.)
fly ssh console --app tapas-fpl-backend -C "python -m scripts.scheduled_update --sync-bootstrap"
```

**Options:**
- `--status` - Show current update status (last processed gameweek, timestamp)
- `--dry-run` - Check for new gameweek without making changes
- `--sync-bootstrap` - Sync player data from FPL bootstrap API (all stats fields)

**Environment Variables:**
- `SCHEDULED_UPDATE_LEAGUE_ID` - League to sync chips for (default: 242017)
- `SCHEDULED_UPDATE_TIMEOUT` - Maximum runtime in seconds (default: 1800)

**Automatic Scheduling:**
- Runs daily at 08:00 UTC via Supercronic (configured in `crontab`)
- Only processes if a new finalized gameweek is detected
- Skips if already processed (idempotent)

**Process:**
1. Check FPL API for finalized gameweeks (`data_checked: true`)
2. Validate FPL API response (events, players, teams must be present)
3. Compare against last processed gameweek per season
4. Acquire advisory lock (prevents concurrent runs)
5. Sync player data from FPL bootstrap API (goals, assists, xG, xA, form, etc.)
6. Run Points Against incremental update (~2-5 min)
7. Verify Points Against data via `points_against_collection_status` table
8. Run Manager Snapshots incremental update (~1-2 min)
9. Verify Manager Snapshots data (snapshots and picks saved)
10. Run Chips sync for tracked league (~30 sec)
11. Verify Chips data (failure rate < 10%, members > 0)
12. Compute League Ownership from manager picks (~30 sec)
13. Mark gameweek as processed
14. Release advisory lock

**Robustness Features:**
- **Advisory locks**: `pg_try_advisory_lock` prevents race conditions from cron overlap or manual runs
- **Bootstrap validation**: Fails fast if FPL API returns empty players/teams (API updating)
- **Failure rate threshold**: Chips sync fails if >10% of managers fail to sync
- **Zero members check**: Catches wrong league ID configuration
- **PA status verification**: Checks `points_against_collection_status` table for completion
- **Specific exceptions**: Only catches expected errors (`asyncpg.PostgresError`, `httpx.HTTPError`, `TimeoutError`)
- **Dual pool initialization**: Initializes both script pool and `app.db` pool (ChipsService uses `get_connection()` from `app/db.py`)

**Failure Handling:**
- If any step fails, gameweek is NOT marked as processed
- Advisory lock is always released (via `finally` block)
- Next run will retry automatically
- Manual intervention required if repeated failures

## Data Collection Status

Current production data status (as of GW21, 2025-26 season):

| Table | Rows | Coverage | Updated By |
|-------|------|----------|------------|
| `player` | 795 | All FPL players | Scheduled update (--sync-bootstrap) |
| `player_fixture_stats` | 15,760 | GW1-21 | Points Against collection |
| `points_against_by_fixture` | 420 | GW1-21 | Points Against collection |
| `manager_gw_snapshot` | 377 | GW1-21, 18 managers | Manager Snapshots collection |
| `manager_pick` | 5,655 | GW1-21, 18 managers | Manager Snapshots collection |
| `chip_usage` | 39 | GW1-21 | Chips sync |
| `league_ownership` | 0 | - | Scheduled update (needs run) |

**Player stats synced from bootstrap API:**
- Core: `total_points`, `minutes`, `form`, `selected_by_percent`
- Goals: `goals_scored`, `assists`, `clean_sheets`, `goals_conceded`
- Saves: `saves`, `penalties_saved`, `penalties_missed`
- Cards: `yellow_cards`, `red_cards`
- Bonus: `bonus`, `bps` (bonus points system)
- xStats: `expected_goals`, `expected_assists`, `expected_goal_involvements`, `expected_goals_conceded`
- ICT: `influence`, `creativity`, `threat`, `ict_index`

**Initial Setup (one-time):**

Before scheduled updates can work, you must run bulk collection for historical data:

```bash
# 1. Points Against (~66 min) - required for captain points calculation
fly ssh console --app tapas-fpl-backend -C "nohup python -m scripts.collect_points_against > /tmp/pa.log 2>&1 &"

# 2. Manager Snapshots (~10 min) - required for H2H comparison
fly ssh console --app tapas-fpl-backend -C "python -m scripts.collect_manager_snapshots"

# 3. Player stats sync (~30 sec) - sync goals, assists, xG, xA from FPL API
fly ssh console --app tapas-fpl-backend -C "python -m scripts.scheduled_update --sync-bootstrap"

# 4. League Ownership backfill (~30 sec) - compute ownership from manager_pick data
fly ssh console --app tapas-fpl-backend -C "python -m scripts.backfill_league_ownership"

# 5. Chips sync (~30 sec) - handled by scheduled update
# No manual run needed
```

**Ongoing Updates:**

The `scheduled_update.py` script handles all data types incrementally:
- Player stats (goals, assists, xG, xA, form)
- Points Against (per-fixture stats)
- Manager Snapshots (picks, transfers)
- Chips sync
- League Ownership (computed from picks)

Configuration:
- Runs daily at 06:00 UTC via Supercronic
- Only processes new finalized gameweeks
- Tracks progress in `collection_status` table

## Deployment (Fly.io)

- **App name**: tapas-fpl-backend
- **URL**: https://tapas-fpl-backend.fly.dev
- **Deploy**: Push to `main` → GitHub Actions auto-deploys

**⚠️ NEVER deploy directly with `fly deploy`. Always push to git and let CI/CD handle deployment.**

### Fly CLI Setup (for debugging/monitoring only)

```bash
# Add to PATH (required if not already set)
export PATH="$HOME/.fly/bin:$PATH"

# Verify installation
fly version

# Login (if needed)
fly auth login
fly auth whoami
```

### Deployment Commands (CI/CD reference only)

These commands are used by GitHub Actions CI/CD. **Do not run manually.**

```bash
# CI/CD uses these commands - DO NOT RUN MANUALLY
# fly deploy
# fly deploy --local-only

# These monitoring commands ARE safe to run:
fly status --app tapas-fpl-backend
fly logs --app tapas-fpl-backend
```

### Machine Management

```bash
# List machines
fly machine list --app tapas-fpl-backend

# Check app status (shows running machines)
fly status --app tapas-fpl-backend

# Start a machine (if stopped)
fly machine start <machine_id> --app tapas-fpl-backend

# Restart the app
fly apps restart tapas-fpl-backend

# Destroy a stopped machine
fly machine destroy <machine_id> --app tapas-fpl-backend --force
```

### Auto-stop Configuration

The app runs two process types with different auto-stop behavior:

| Process | Behavior | Why |
|---------|----------|-----|
| `api` | Auto-stops when idle | Saves costs, 2-3s cold start is acceptable |
| `cron` | Runs 24/7 | Must be alive at 06:00 UTC for scheduled jobs |

**Configure auto-stop for API machines:**

```bash
# Enable auto-stop (stops when idle, starts on request)
fly machine update <machine_id> --autostop=stop --autostart=true --app tapas-fpl-backend -y

# Disable auto-stop (runs 24/7)
fly machine update <machine_id> --autostop=off --app tapas-fpl-backend -y
```

**Auto-stop values:**
- `off` - Never auto-stop (runs 24/7)
- `stop` - Stop when idle (default for API)
- `suspend` - Suspend when idle (faster wake-up than stop)

**Note:** The `cron` process is not part of `[http_service]` in fly.toml, so it doesn't auto-stop. Only configure auto-stop for `api` machines.

### Logs

```bash
# Stream live logs
fly logs --app tapas-fpl-backend

# View recent logs
fly logs --app tapas-fpl-backend --no-tail

# View logs from a specific instance
fly logs --app tapas-fpl-backend -i <instance_id>
```

### SSH Access

```bash
# Interactive shell
fly ssh console --app tapas-fpl-backend

# Run single command
fly ssh console --app tapas-fpl-backend -C "python -m scripts.migrate --status"

# Check a file
fly ssh console --app tapas-fpl-backend -C "tail -20 /tmp/collection.log"
```

### Quick Reference: Common Operations

```bash
# Check app status
fly status --app tapas-fpl-backend

# View logs
fly logs --app tapas-fpl-backend

# Deploy new version
cd backend && fly deploy

# Run data collection (MUST run from Fly.io due to IPv6)
fly ssh console --app tapas-fpl-backend -C "python -m scripts.collect_points_against"

# Check collection status
fly ssh console --app tapas-fpl-backend -C "python -m scripts.collect_points_against --status"

# Run migrations
fly ssh console --app tapas-fpl-backend -C "python -m scripts.migrate"

# Interactive shell
fly ssh console --app tapas-fpl-backend
```

### Secrets

Secrets are stored in Fly.io and injected as environment variables at runtime.

```bash
fly secrets list                   # View current secrets

# Required: Database connection
fly secrets set DATABASE_URL="postgresql://postgres:<PASSWORD>@db.itmykooxrbrdbgqwsesb.supabase.co:5432/postgres"

# Required: CORS origins
fly secrets set CORS_ORIGINS="https://tapas-and-tackles.live,https://www.tapas-and-tackles.live,http://localhost:5173,http://localhost:3000"
```

**Where to find the database password:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/itmykooxrbrdbgqwsesb/settings/database)
2. Project Settings → Database → Connection string → URI
3. Copy the password from the connection string

**CORS Note:** Include both `www` and non-www origins if your domain uses redirects.

## Connecting to Supabase

### Decision Table: How to Connect

| Task | Where to Run | Connection Method |
|------|--------------|-------------------|
| Run data collection scripts | Fly.io SSH | Direct (IPv6) - auto via `DATABASE_URL` secret |
| Run migrations | Fly.io SSH | Direct (IPv6) - auto via `DATABASE_URL` secret |
| Deploy backend | Local terminal | `fly deploy` (no DB needed) |
| Quick DB query | Fly.io SSH | Direct (IPv6) - auto via `DATABASE_URL` secret |
| Local script testing (rare) | Local terminal | Session Pooler (IPv4) + `$SUPABASE_PW` |

**TL;DR: For anything that touches the database, use `fly ssh console --app tapas-fpl-backend`**

### ⚠️ CRITICAL: IPv6-Only Connection

**Supabase direct connection uses IPv6.** This means:
- ✅ **Fly.io can connect** — Fly.io supports IPv6 natively
- ❌ **Local machines usually cannot** — Most home/office networks are IPv4-only
- ❌ **GitHub Actions cannot** — GitHub runners don't support IPv6

### Running Scripts

**All data collection scripts MUST run from Fly.io**, not locally:

```bash
# 1. Check if Fly.io machine is running
fly status --app tapas-fpl-backend

# 2. If no machines running, start one
fly machine list --app tapas-fpl-backend
fly machine start <machine_id> --app tapas-fpl-backend

# 3. Run scripts via SSH (DATABASE_URL is already set as a secret)
fly ssh console --app tapas-fpl-backend -C "python -m scripts.collect_points_against"
fly ssh console --app tapas-fpl-backend -C "python -m scripts.collect_points_against --status"
fly ssh console --app tapas-fpl-backend -C "python -m scripts.test_collection"

# 4. Interactive shell for debugging
fly ssh console --app tapas-fpl-backend
```

### Local Development (Limited)

Local development works for:
- Running the FastAPI server (without database)
- Running tests (mocked database)
- Editing code

Local development does NOT work for:
- Running data collection scripts against Supabase
- Testing database connectivity
- Running migrations against production

If you need to test database queries locally, use the Fly.io SSH console:

```bash
# Quick database query from Fly.io
fly ssh console --app tapas-fpl-backend -C "python -c \"
import asyncio
import asyncpg
import os

async def test():
    conn = await asyncpg.connect(os.environ['DATABASE_URL'])
    row = await conn.fetchrow('SELECT COUNT(*) as cnt FROM points_against_by_fixture')
    print(f'Rows: {row[\"cnt\"]}')
    await conn.close()

asyncio.run(test())
\""
```

### Alternative: Supabase Connection Pooler (IPv4)

If you need local database access, use the **Session Pooler** connection (IPv4-compatible):

```bash
# Session pooler URL (IPv4, port 5432)
postgresql://postgres.itmykooxrbrdbgqwsesb:<PASSWORD>@aws-0-eu-west-2.pooler.supabase.com:5432/postgres

# Transaction pooler URL (IPv4, port 6543) - for short-lived connections
postgresql://postgres.itmykooxrbrdbgqwsesb:<PASSWORD>@aws-0-eu-west-2.pooler.supabase.com:6543/postgres
```

**Note:** Pooler URLs have different format: `postgres.<project-ref>` instead of just `postgres`.

### Local Environment Setup

The database password is stored in `backend/.env`:

```bash
# backend/.env contains:
SUPABASE_PW=<password>

# Load it into shell
source backend/.env
echo $SUPABASE_PW  # Verify it's set

# Run local script with pooler URL (IPv4)
DATABASE_URL="postgresql://postgres.itmykooxrbrdbgqwsesb:$SUPABASE_PW@aws-0-eu-west-2.pooler.supabase.com:6543/postgres" python -m scripts.migrate --status
```

**Password location:** `backend/.env` file (gitignored). The scripts also auto-load from `.env.local` and `.env` via `python-dotenv`.

## Testing

```bash
cd backend
source .venv/bin/activate
python -m pytest              # Run all tests
python -m pytest -v           # Verbose output
python -m pytest tests/test_api.py  # Run specific file
ruff check tests/             # Lint tests
```

### Test Organization

```
tests/
├── conftest.py           # Shared fixtures (async_client, mock_db)
├── test_api.py           # Existing API endpoint tests
├── test_config.py        # Settings tests
├── test_chips_api.py     # Chips API endpoint tests (TDD)
└── test_chips_service.py # Chips service unit tests (TDD)
```

**File naming:** `test_<module_name>.py`
**Class naming:** `TestClassName` - group related tests
**Function naming:** `test_<unit>_<scenario>_<expected>`

### Best Practices

#### 1. Use TypedDicts for Mock Data

Type-safe mock data catches typos and provides IDE autocomplete:

```python
from typing import TypedDict

class ChipUsageRow(TypedDict):
    """Database row structure for chip_usage table."""
    manager_id: int
    season_id: int
    chip_type: str

# Usage in tests
mock_rows: list[ChipUsageRow] = [
    {"manager_id": 123, "season_id": 1, "chip_type": "wildcard"},
]
```

#### 2. Extract Constants for Magic Numbers

Replace magic numbers with named constants for self-documenting tests:

```python
# Constants at top of test file
FIRST_HALF_END = 19
SECOND_HALF_START = 20
SEASON_END = 38

# In parametrize
@pytest.mark.parametrize(
    ("gameweek", "expected_half"),
    [
        (1, 1),
        (FIRST_HALF_END, 1),      # More readable than (19, 1)
        (SECOND_HALF_START, 2),   # Clear intent: chip reset boundary
        (SEASON_END, 2),
    ],
)
```

#### 3. Use Parametrize with IDs

Always add `ids` for readable test output - makes CI failures easy to diagnose:

```python
# BAD - output shows: test_...[0-1-100]
@pytest.mark.parametrize("value", [0, -1, -100])

# GOOD - output shows: test_...[zero], test_...[negative]
@pytest.mark.parametrize(
    "value",
    [0, -1, -100],
    ids=["zero", "negative", "large_negative"],
)
```

#### 4. Extract Fixtures for Database Mocking

Use a fixture with context manager for consistent DB mocking. Define reusable
fixtures in `conftest.py` for use across multiple test files:

```python
# conftest.py - shared fixtures
from typing import Any
from unittest.mock import AsyncMock, patch

class MockDB:
    """Mock database connection with context manager pattern.

    IMPORTANT: module_path is REQUIRED - always patch where the function
    is USED, not where it's defined. This prevents cross-service pollution.
    """
    conn: AsyncMock
    patch: Any

    def __init__(self, module_path: str) -> None:  # No default - explicit is better
        self.conn = AsyncMock()
        self.patch = patch(module_path)
        self._mock_get_conn = None

    def __enter__(self) -> "MockDB":
        self._mock_get_conn = self.patch.__enter__()
        self._mock_get_conn.return_value.__aenter__.return_value = self.conn
        return self

    def __exit__(self, *args: Any) -> None:
        self.patch.__exit__(*args)

# Service-specific fixtures - create one per service being tested
@pytest.fixture
def mock_db() -> MockDB:
    """Mock database for chips service tests."""
    return MockDB("app.services.chips.get_connection")

@pytest.fixture
def mock_points_db() -> MockDB:
    """Mock database for points_against service tests."""
    return MockDB("app.services.points_against.get_connection")

# Usage - combine with pytest.raises using comma (avoid nested with)
async def test_db_error(mock_db: MockDB):
    mock_db.conn.fetch.side_effect = Exception("timeout")
    with mock_db, pytest.raises(Exception, match="timeout"):
        await service.fetch_data()
```

#### 5. Test Both Valid and Invalid Inputs

For every validation, test both acceptance and rejection:

```python
# Test valid inputs are ACCEPTED
@pytest.mark.parametrize("valid_chip", ["wildcard", "bboost", "3xc", "freehit"])
async def test_accepts_valid_chip_types(valid_chip):
    await service.save(chip_type=valid_chip)  # Should not raise

# Test invalid inputs are REJECTED
@pytest.mark.parametrize(
    "invalid_chip",
    ["unknown", "WILDCARD", "", "   "],
    ids=["unknown", "uppercase", "empty", "whitespace"],
)
async def test_rejects_invalid_chip_types(invalid_chip):
    with pytest.raises(ValueError, match="Invalid chip type"):
        await service.save(chip_type=invalid_chip)
```

#### 6. Test Boundary Conditions

Always test at boundaries, not just arbitrary values:

```python
@pytest.mark.parametrize(
    ("gameweek", "expected"),
    [
        (FIRST_HALF_END, 1),      # Last GW of first half (boundary)
        (SECOND_HALF_START, 2),   # First GW of second half (boundary)
    ],
    ids=["gw19_boundary", "gw20_reset"],
)
async def test_boundary_gameweeks(gameweek, expected):
    assert get_season_half(gameweek) == expected
```

#### 7. Test Non-Integer Path Parameters

FastAPI handles type coercion - test that invalid types return 422:

```python
async def test_validates_non_integer_id(async_client):
    response = await async_client.get("/api/v1/chips/league/abc")
    assert response.status_code == 422  # FastAPI validation error
```

#### 8. TDD: Use Helper Functions for Deferred Imports

When writing tests before implementation, defer imports to fail fast:

```python
from typing import Callable

def _import_service() -> type:
    """Import service - will fail until implementation exists."""
    from app.services.chips import ChipsService
    return ChipsService

def _import_get_season_half() -> Callable[[int], int]:
    """Import function with type hint for IDE support."""
    from app.services.chips import get_season_half
    return get_season_half

def test_service_method():
    ChipsService = _import_service()  # Fails with clear ImportError
    service = ChipsService()
    # ...
```

#### 9. Test Database Errors for ALL Operations

Test error propagation for EVERY database operation (read AND write):

```python
# Test READ errors
async def test_propagates_database_error_on_fetch(mock_db: MockDB):
    mock_db.conn.fetch.side_effect = Exception("Connection timeout")
    with mock_db, pytest.raises(Exception, match="Connection timeout"):
        await service.get_data()

# Test WRITE errors - often forgotten!
async def test_propagates_database_error_on_save(mock_db: MockDB):
    mock_db.conn.execute.side_effect = Exception("Disk full")
    with mock_db, pytest.raises(Exception, match="Disk full"):
        await service.save_data(data)
```

#### 10. Test Multi-Query Partial Failures

When a service makes multiple queries, test what happens if later queries fail:

```python
async def test_handles_second_query_failure(mock_db: MockDB):
    """Should propagate error when second query fails after first succeeds."""
    mock_db.conn.fetch.side_effect = [
        [{"id": 1, "name": "First"}],  # First query succeeds
        Exception("Query timeout"),     # Second query fails
    ]
    with mock_db, pytest.raises(Exception, match="Query timeout"):
        await service.get_combined_data()  # Makes 2 queries internally
```

#### 11. Test Non-Integer Query Parameters

Test type validation for BOTH path and query parameters:

```python
# Path parameter (documented in #7)
async def test_validates_non_integer_path_param(async_client):
    response = await async_client.get("/api/v1/chips/league/abc")
    assert response.status_code == 422

# Query parameter - often forgotten!
async def test_validates_non_integer_query_param(async_client):
    response = await async_client.get("/api/v1/chips/league/12345?season_id=abc")
    assert response.status_code == 422
```

#### 12. Test Very Large Integers

Test for integer overflow or database type mismatches:

```python
async def test_handles_very_large_id(async_client):
    """Should handle very large IDs without crashing."""
    # FPL IDs are typically 32-bit integers
    response = await async_client.get("/api/v1/chips/league/9999999999999")
    assert response.status_code in [422, 503]  # Validation or DB unavailable
```

#### 13. Test Malformed Data from Database

Test handling of unexpected values returned from the database:

```python
async def test_handles_malformed_data_from_database(mock_db: MockDB):
    """Should gracefully handle malformed data from DB."""
    mock_rows = [
        {"chip_type": "", "gameweek": 5},      # Empty string
        {"chip_type": None, "gameweek": 5},    # Null value
    ]
    mock_db.conn.fetch.return_value = mock_rows
    with mock_db:
        result = await service.get_chips()

    # Verify malformed data is filtered/handled, not crash
    assert len(result.chips_remaining) == 4  # All chips still available
```

#### 14. Verify Nullable Fields Explicitly

Test that nullable fields (like `points_gained`) don't cause serialization issues:

```python
async def test_handles_null_points_gained(mock_db: MockDB):
    """Should include chips with null points_gained in response."""
    mock_rows = [{
        "chip_type": "wildcard",
        "gameweek": 5,
        "points_gained": None,  # Wildcard has no points calculation
    }]
    mock_db.conn.fetch.return_value = mock_rows
    with mock_db:
        result = await service.get_chips()

    assert result.chips_used[0].points_gained is None  # Not crash
```

#### 15. Use pytest.param for Complex Parametrize

For tests with many parameters, `pytest.param` combines value and ID:

```python
# Standard approach (separate IDs list)
@pytest.mark.parametrize(
    ("gameweek", "expected"),
    [(1, 1), (19, 1), (20, 2), (38, 2)],
    ids=["gw1", "gw19_boundary", "gw20_reset", "gw38_end"],
)

# pytest.param approach (inline IDs)
@pytest.mark.parametrize(
    ("gameweek", "expected"),
    [
        pytest.param(1, 1, id="gw1"),
        pytest.param(FIRST_HALF_END, 1, id="gw19_boundary"),
        pytest.param(SECOND_HALF_START, 2, id="gw20_reset"),
        pytest.param(SEASON_END, 2, id="gw38_end"),
    ],
)
```

### Async Testing

**Configuration (pyproject.toml):**
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"  # Auto-detect async tests
asyncio_default_fixture_loop_scope = "function"
```

**Async fixtures:**
```python
import pytest_asyncio

@pytest_asyncio.fixture
async def async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
```

**Mocking async code:**
```python
from unittest.mock import AsyncMock, patch

# Mock async function
mock_fetch = AsyncMock(return_value={"data": "test"})

# Mock async context manager
mock_conn = AsyncMock()
mock_conn.__aenter__.return_value = mock_conn
mock_conn.__aexit__.return_value = None
```

### Test Categories

| Category | Location | Description |
|----------|----------|-------------|
| API | `test_*_api.py` | HTTP endpoint validation, status codes, response format |
| Service | `test_*_service.py` | Business logic, database interactions |
| Config | `test_config.py` | Settings parsing, defaults |

### Common Pitfalls (Learned from PR Reviews)

| Pitfall | Fix |
|---------|-----|
| Nested `with mock_db:` + `with pytest.raises():` | Combine: `with mock_db, pytest.raises():` |
| Parametrize without IDs | Always add `ids=["name1", "name2"]` |
| Testing only happy path | Add tests for both valid AND invalid inputs |
| Magic numbers in tests | Extract to named constants |
| Repeated imports in test methods | Use fixtures or module-level imports |
| Missing boundary tests | Test at exact boundaries (GW19/20), not just arbitrary values |
| Missing non-integer path param tests | FastAPI path params need 422 tests for "abc" |
| Missing non-integer query param tests | Query params also need 422 tests for "?param=abc" |
| Only testing read errors | Test BOTH fetch and execute errors |
| Missing partial failure tests | Multi-query operations need second-query-fails tests |
| MockDB with default path | Always specify explicit module_path per service |
| MockDB in test file only | Move to `conftest.py` for reuse across test files |
| Fixtures without type hints | Add `-> MockDB` return type for IDE support |
| `_import_*` helpers without types | Add `-> Callable[[int], int]` for IDE support |
| Missing very large ID tests | Test with `9999999999999` for overflow protection |
| Missing malformed data tests | Test empty strings, nulls from database |
| Missing nullable field tests | Verify `None` values don't crash serialization |

### Service Cache Management

Some services use in-memory caching to reduce database calls. **Tests must clear caches to prevent pollution.**

#### History Service Cache

The history service (`app/services/history.py`) uses TTL-based in-memory caching for expensive queries. It exposes a `clear_cache()` function specifically for test isolation.

**Usage in tests:**

```python
# test_history_service.py
from app.services.history import clear_cache

@pytest.fixture(autouse=True)
def clear_history_cache():
    """Clear history service cache before and after each test."""
    clear_cache()  # Clear before test
    yield
    clear_cache()  # Clear after test
```

**Why clear before AND after:**
- **Before:** Ensures test starts with clean state (no leftover data from previous tests)
- **After:** Prevents test data from leaking into subsequent tests

**When to use `clear_cache()`:**
- Any test that calls `get_league_history()`, `get_league_positions()`, or `get_league_stats()`
- Cache tests that verify cache hit/miss behavior
- Integration tests that need fresh database queries

**Cache implementation notes:**
- Cache entries use `time.monotonic()` for TTL (clock-independent)
- Cache key format: `"{method}_{league_id}_{season_id}"`
- Default TTL: 10 minutes (configured in `history.py`)
- Cache bypassed when `include_picks=True` (picks change frequently)

#### Routes API Cache

The routes module (`app/api/routes.py`) uses `cachetools.TTLCache` for expensive API endpoints. Two separate caches handle different TTL requirements, each with bounded size (maxsize=100) and thread-safety.

This cache is **cleared automatically** by the `clear_api_cache` autouse fixture in `conftest.py` via the public `clear_cache()` function.

**Cached endpoints:**
- `GET /api/v1/points-against/` - 10-minute TTL (`_api_cache`)
- `GET /api/v1/points-against/{team_id}/history` - 10-minute TTL (`_api_cache`)
- `GET /api/v1/recommendations/league/{league_id}` - 5-minute TTL (`_recommendations_cache`)

**Cache keys:**
- Points against: `points_against_{season_id}`
- Team history: `team_history_{team_id}_{season_id}`
- Recommendations: `recommendations_{league_id}_{season_id}_{limit}`

#### Adding Cache Clearing to New Services

If you add caching to a new service:

1. Use `cachetools.TTLCache` for thread-safe, bounded caching:
   ```python
   from cachetools import TTLCache
   from typing import Any

   _cache: TTLCache[str, Any] = TTLCache(maxsize=100, ttl=600)

   def clear_cache() -> None:
       """Clear all cached data. Used by tests to prevent pollution."""
       _cache.clear()
   ```

2. Create an autouse fixture in the test file:
   ```python
   from app.services.your_service import clear_cache

   @pytest.fixture(autouse=True)
   def clear_service_cache():
       clear_cache()
       yield
       clear_cache()
   ```

3. Document it in this section.

### Test Coverage

| Test Class | Tests | Description |
|------------|-------|-------------|
| `TestHealthEndpoint` | 1 | Health check returns status and DB info |
| `TestDocsEndpoint` | 1 | OpenAPI docs available |
| `TestAnalyticsEndpoints` | 3 | Stub endpoints return not_implemented |
| `TestCORSHeaders` | 1 | CORS preflight works |
| `TestPointsAgainstEndpoints` | 5 | Points Against API validation and 503 handling |
| `TestSettings` | 5 | Configuration parsing |
| `TestGetSettings` | 2 | Settings caching |
| `TestChipsLeagueEndpoint` | 6 | League chips API validation |
| `TestChipsManagerEndpoint` | 6 | Manager chips API validation |
| `TestGetSeasonHalf` | 2 | Season half calculation (pure function) |
| `TestGetRemainingChips` | 7 | Remaining chips calculation (pure function) |
| `TestChipsServiceGetManagerChips` | 3 | Manager chips service |
| `TestChipsServiceGetLeagueChips` | 6 | League chips service |
| `TestChipsServiceSaveChipUsage` | 7 | Chip save with validation |
| `TestChipsServiceSync` | 5 | FPL API sync with partial failures |
| `TestChipsServiceSyncErrorPropagation` | 3 | Error propagation tests |
| `TestFplClientBootstrap` | 2 | Bootstrap endpoint parsing |
| `TestFplClientPlayerHistory` | 2 | Player history endpoint |
| `TestFplClientFixtures` | 1 | Fixtures endpoint |
| `TestFplClientEntryHistory` | 6 | Manager chip history with retry/404 |
| `TestFplClientRetry` | 7 | Retry behavior on transient errors |
| `TestFplClientResourceManagement` | 3 | HTTP client lifecycle |
| `TestFplClientRetryExhaustion` | 4 | Retry exhaustion and non-retryable errors |

**Total: 149 tests** (142 pass, 7 skipped)

**Testing Without Database:**
- Tests run without database connection
- API endpoints return 503 (Service Unavailable) when DB unavailable
- Input validation runs before DB check

## Error Handling

**HTTP Status Codes:**
- `400` - Invalid input (e.g., team_id not 1-20, season_id not 1-100)
- `500` - Internal server error (logged with stack trace)
- `503` - Database unavailable

**Logging:**
- Uses `logger.exception()` for errors (includes stack trace)
- Exception chaining with `from e` for proper context

**Retry Logic (FPL API Client):**
- 3 attempts with exponential backoff (2s → 4s → 8s, max 30s)
- Retries on: HTTP 429/500/502/503/504, timeouts, network errors

## Troubleshooting

### Fly.io Connection Issues

**"No machines running"**
```bash
fly machine list --app tapas-fpl-backend
fly machine start <machine_id> --app tapas-fpl-backend
```

**"fly: command not found"**
```bash
export PATH="$HOME/.fly/bin:$PATH"
# Or use full path: ~/.fly/bin/flyctl
```

**"Error: not logged in"**
```bash
fly auth login
fly auth whoami  # Verify logged in
```

### Database Connection Issues

**"could not translate host name" (IPv6 issue)**
- Direct Supabase connection requires IPv6
- Use Fly.io SSH for scripts: `fly ssh console --app tapas-fpl-backend`
- Or use Session Pooler URL for local access (see "Alternative: Supabase Connection Pooler")

**"password authentication failed"**
```bash
# Check if password is set (load from .env first)
source backend/.env
echo $SUPABASE_PW

# Verify DATABASE_URL format (pooler vs direct)
# Pooler: postgres.itmykooxrbrdbgqwsesb (note the dot)
# Direct: postgres (no project ref prefix)
```

**"connection refused" or "timeout"**
- Check if Fly.io machine is running: `fly status --app tapas-fpl-backend`
- Check Supabase status: https://status.supabase.com/

### Data Collection Issues

**"Collection failed: >10% failures"**
- FPL API may be rate limiting or down
- Wait and retry later
- Check FPL API status: https://fantasy.premierleague.com/

**"Table does not exist"**
- Run migrations first: `fly ssh console --app tapas-fpl-backend -C "python -m scripts.migrate"`

**Collection seems stuck**
```bash
# Check if process is running
fly ssh console --app tapas-fpl-backend -C "ps aux | grep python"

# Check log output
fly ssh console --app tapas-fpl-backend -C "tail -20 /tmp/collection.log"

# Note: Rate limit is 0.2 req/sec = 5 seconds per player
# 790 players × 5 sec = ~66 minutes total
```

**Background collection stopped/crashed**
- Check log for errors: `fly ssh console --app tapas-fpl-backend -C "cat /tmp/collection.log"`
- `player_fixture_stats` are saved incrementally (already saved data is preserved)
- `points_against_by_fixture` is only saved at the end (will need re-run)
- Re-run collection: `fly ssh console --app tapas-fpl-backend -C "nohup python -m scripts.collect_points_against > /tmp/collection.log 2>&1 &"`

**Machine stopped during long-running collection (~66 min)**

Fly.io auto-stops machines when there's no HTTP traffic. Disable auto-stop before running long collections:

```bash
# 1. Get machine ID
fly machine list --app tapas-fpl-backend

# 2. Disable auto-stop on running machine (runtime change, no deploy needed)
fly machine update <machine_id> --autostop=off --app tapas-fpl-backend

# 3. Run collection
fly ssh console --app tapas-fpl-backend -C "nohup python -m scripts.collect_points_against > /tmp/collection.log 2>&1 &"

# 4. Re-enable auto-stop after collection completes (to save costs)
fly machine update <machine_id> --autostop=stop --app tapas-fpl-backend
```

Alternative: Set `auto_stop_machines = 'off'` in `fly.toml` and redeploy (permanent change).

**"ON CONFLICT" errors**
- Check migration was applied: `python -m scripts.migrate --status`
- `points_against_by_fixture` PK is `(fixture_id, team_id)` - each fixture has 2 rows (one per team)
- `player_fixture_stats` PK is `(fixture_id, player_id, season_id)`

**SSH pipe command not working**
```bash
# WRONG: Pipe runs locally, not on server
fly ssh console --app tapas-fpl-backend -C "cat /tmp/collection.log | tail -20"

# CORRECT: Use commands that don't need pipes
fly ssh console --app tapas-fpl-backend -C "tail -20 /tmp/collection.log"
```

### Deployment Issues

**"Waiting for depot builder..." (slow deploy)**
```bash
# Use local Docker build instead
fly deploy --local-only
```

**Deploy fails with "docker not running"**
- Start Docker: `sudo systemctl start docker`
- Or use standard deploy: `fly deploy` (uses Depot, may be slower)
