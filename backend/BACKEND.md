# Backend

Python FastAPI application for future analytics. Currently the frontend uses Cloudflare Workers as the API proxy (see `worker/CLAUDE.md`).

## Development

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload  # Start dev server (port 8000)
python -m pytest               # Run tests
```

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
    ('004_points_against.sql')
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
│       └── points_against.py # Points Against service
├── migrations/           # SQL migrations for Supabase
│   ├── 001_core_tables.sql
│   ├── 002_historical.sql
│   ├── 003_analytics.sql
│   └── 004_points_against.sql
├── scripts/
│   ├── migrate.py               # Database migration runner
│   ├── collect_points_against.py # Points Against data collector
│   └── seed_test_data.py        # Test data seeder
├── tests/
│   ├── conftest.py       # Test fixtures
│   ├── test_config.py    # Settings tests
│   └── test_api.py       # API endpoint tests (18 tests)
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

### Table Overview (22 tables)

**Core FPL Entities:**
- `season` - FPL seasons (2024-25, etc.)
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
cd backend
source .venv/bin/activate

# Run collection (fetches all player histories from FPL API)
python -m scripts.collect_points_against

# Show collection status
python -m scripts.collect_points_against --status

# Reset and re-collect
python -m scripts.collect_points_against --reset
```

**Collection Details:**
- Fetches ~800 players from FPL API with rate limiting (1 req/sec)
- Aggregates points scored against each opponent per fixture
- Fails if >10% of requests fail (prevents partial data)
- Takes ~15 minutes for full collection

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

## Deployment (Fly.io)

- **App name**: tapas-fpl-backend
- **URL**: https://tapas-fpl-backend.fly.dev
- **Deploy**: `fly deploy` from this directory

### Secrets
```bash
fly secrets list                   # View current secrets

# Required: Database connection
fly secrets set DATABASE_URL="postgresql://postgres:<PASSWORD>@db.itmykooxrbrdbgqwsesb.supabase.co:5432/postgres"

# Required: CORS origins
fly secrets set CORS_ORIGINS="https://tapas-and-tackles.live,https://www.tapas-and-tackles.live,http://localhost:5173,http://localhost:3000"
```

**Where to find the password:**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/itmykooxrbrdbgqwsesb/settings/database)
2. Project Settings → Database → Connection string → URI
3. Copy the password from the connection string

**CORS Note:** Include both `www` and non-www origins if your domain uses redirects.

### Local Development with Supabase
```bash
# Set SUPABASE_PW in your shell session (get password from Supabase Dashboard)
export SUPABASE_PW="<password-from-dashboard>"

# Run migrations against Supabase
DATABASE_URL="postgresql://postgres:$SUPABASE_PW@db.itmykooxrbrdbgqwsesb.supabase.co:5432/postgres" python -m scripts.migrate
```

## Testing

```bash
cd backend
source .venv/bin/activate
python -m pytest              # Run all tests
python -m pytest -v           # Verbose output
python -m pytest tests/test_api.py  # Run specific file
```

**Test Coverage (18 tests):**

| Test Class | Tests | Description |
|------------|-------|-------------|
| `TestHealthEndpoint` | 1 | Health check returns status and DB info |
| `TestDocsEndpoint` | 1 | OpenAPI docs available |
| `TestAnalyticsEndpoints` | 3 | Stub endpoints return not_implemented |
| `TestCORSHeaders` | 1 | CORS preflight works |
| `TestPointsAgainstEndpoints` | 5 | Points Against API validation and 503 handling |
| `TestSettings` | 5 | Configuration parsing |
| `TestGetSettings` | 2 | Settings caching |

**Testing Without Database:**
- Tests run without database connection
- Points Against endpoints return 503 (Service Unavailable) when DB unavailable
- Input validation (team_id range) runs before DB check

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
