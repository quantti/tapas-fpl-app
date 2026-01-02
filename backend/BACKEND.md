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

## Structure

```
backend/
├── app/
│   ├── main.py           # FastAPI app entry point
│   ├── config.py         # Settings and cache TTLs
│   ├── api/routes.py     # API endpoints
│   └── services/fpl_proxy.py  # FPL proxy with caching
├── migrations/           # SQL migrations for Supabase
│   ├── 001_core_tables.sql
│   ├── 002_historical.sql
│   └── 003_analytics.sql
├── tests/
│   ├── conftest.py       # Test fixtures
│   ├── test_config.py
│   ├── test_fpl_proxy.py
│   └── test_api.py
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

## Deployment (Fly.io)

- **App name**: tapas-fpl-backend
- **URL**: https://tapas-fpl-backend.fly.dev
- **Deploy**: `fly deploy` from this directory

### Secrets
```bash
fly secrets list                   # View current secrets
fly secrets set CORS_ORIGINS="https://tapas-and-tackles.live,https://www.tapas-and-tackles.live,http://localhost:5173"
fly secrets set SUPABASE_URL="https://itmykooxrbrdbgqwsesb.supabase.co"
fly secrets set SUPABASE_KEY="<publishable-key>"
```

**CORS Note:** Include both `www` and non-www origins if your domain uses redirects.

### Supabase Keys
- **Publishable key** (`sb_publishable_...`): Safe for server-side use, respects RLS
- **Secret key**: Admin access, bypasses RLS — use only for migrations/admin tasks
- Keys available in Supabase Dashboard → Project Settings → API
