# Database Schema Design

Database design for Tapas FPL App - supporting multiple users tracking multiple leagues with historical data.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           APP LAYER                                     │
│  ┌──────────┐     ┌─────────────────┐     ┌──────────────────────┐     │
│  │ app_user │────▶│ tracked_league  │────▶│ tracked_manager      │     │
│  └──────────┘     └─────────────────┘     └──────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         FPL DATA LAYER                                  │
│  ┌──────────┐     ┌─────────────────┐     ┌──────────────────────┐     │
│  │  league  │◀───▶│ league_manager  │◀───▶│      manager         │     │
│  └──────────┘     └─────────────────┘     └──────────────────────┘     │
│                                                     │                   │
│                                                     ▼                   │
│  ┌──────────┐     ┌─────────────────┐     ┌──────────────────────┐     │
│  │  player  │◀────│ manager_pick    │◀────│ manager_gw_snapshot  │     │
│  └──────────┘     └─────────────────┘     └──────────────────────┘     │
│       │                                                                 │
│       ▼                                                                 │
│  ┌──────────┐     ┌─────────────────┐     ┌──────────────────────┐     │
│  │   team   │     │ player_gw_stats │     │      fixture         │     │
│  └──────────┘     └─────────────────┘     └──────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Design Decisions

### Separation of Concerns

1. **App Users vs FPL Managers**
   - `app_user`: People using our app (could track any FPL teams)
   - `manager`: FPL accounts (Entry IDs from the API)
   - One app user can track multiple managers/leagues

2. **Tracking vs Storing**
   - `tracked_league`: Which leagues an app user follows
   - `league`: Actual league data from FPL
   - This allows us to only store data for leagues people care about

3. **Snapshots for History**
   - Most FPL data is "current state" only
   - We create snapshots at each gameweek to build history
   - This enables trend analysis, ML training, etc.

### Database Choice: Supabase (PostgreSQL)

**Why PostgreSQL:**
- JSONB for flexible FPL API data storage
- Array types for efficient list storage
- Excellent time-series query support
- Production-ready from day one

**Why Supabase over alternatives:**
| Consideration | Supabase | Neon | Decision |
|---------------|----------|------|----------|
| Cold starts | Always-on | 500ms-2s on wake | Supabase wins for UX |
| Free storage | 500MB | 512MB | Similar |
| Auth | Built-in | None | Supabase wins |
| Traffic pattern | Good for bursts | Best for low/sporadic | FPL has match-day bursts |
| Dashboard | Excellent UI | Basic | Supabase wins |

**Chosen: Supabase** — Always-on database avoids cold start latency during match days.

**Free tier limits:**
- 500MB database storage
- 2 projects
- 50,000 monthly active users
- 500MB file storage
- 2GB bandwidth

---

## Supabase Setup Plan

### Phase 1: Project Setup
1. Create Supabase account at [supabase.com](https://supabase.com)
2. Create new project: `tapas-fpl`
3. Select region closest to users (EU for Premier League audience)
4. Save connection strings securely

### Phase 2: Schema Migration
1. Run Phase 1 migration (core tables) via Supabase SQL Editor
2. Verify tables created with correct constraints
3. Run Phase 2 migration (historical tracking)
4. Run Phase 3 migration (analytics tables) — can defer until needed

### Phase 3: Backend Integration
1. Install `supabase-py` in FastAPI backend
2. Add database connection to `config.py`
3. Create database service module
4. Implement sync jobs for FPL data
5. Add API endpoints to serve cached data

### Phase 4: Environment Configuration
```bash
# Fly.io secrets to add
fly secrets set SUPABASE_URL="https://xxx.supabase.co"
fly secrets set SUPABASE_ANON_KEY="eyJ..."
fly secrets set SUPABASE_SERVICE_KEY="eyJ..."  # For backend operations
fly secrets set DATABASE_URL="postgresql://..."  # Direct connection
```

---

## Backend Changes Required

### New Dependencies
```txt
# requirements.txt additions
supabase>=2.0.0
asyncpg>=0.29.0        # Async PostgreSQL driver
sqlalchemy>=2.0.0      # ORM (optional, for complex queries)
alembic>=1.13.0        # Migrations
```

### New Files Structure
```
backend/
├── app/
│   ├── db/
│   │   ├── __init__.py
│   │   ├── connection.py      # Supabase client setup
│   │   ├── models.py          # Pydantic models for DB entities
│   │   └── sync.py            # FPL API → Database sync logic
│   ├── api/
│   │   ├── routes.py          # Existing proxy routes
│   │   └── db_routes.py       # New DB-backed endpoints
│   └── services/
│       ├── fpl_proxy.py       # Existing
│       └── fpl_sync.py        # New: sync FPL data to DB
├── migrations/
│   ├── 001_core_tables.sql
│   ├── 002_historical.sql
│   └── 003_analytics.sql
└── scripts/
    └── sync_fpl_data.py       # Manual sync script
```

### Config Changes (`config.py`)
```python
# New settings
SUPABASE_URL: str = ""
SUPABASE_ANON_KEY: str = ""
SUPABASE_SERVICE_KEY: str = ""
DATABASE_URL: str = ""  # Direct PostgreSQL connection

# Sync settings
SYNC_ENABLED: bool = True
SYNC_INTERVAL_MINUTES: int = 5  # During active GWs
```

### New Endpoints (Phase 1)
| Endpoint | Purpose |
|----------|---------|
| `GET /db/health` | Database connectivity check |
| `GET /db/seasons` | List available seasons |
| `GET /db/leagues/{id}` | League data from DB |
| `POST /db/sync/bootstrap` | Trigger bootstrap data sync |
| `POST /db/sync/gameweek/{gw}` | Sync specific gameweek |

---

## Schema Definition

### Season Management

```sql
-- Tracks FPL seasons (2024-25, etc.)
CREATE TABLE season (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE,      -- '2024-25'
    name VARCHAR(50) NOT NULL,             -- 'Season 2024/25'
    start_date DATE NOT NULL,
    end_date DATE,
    is_current BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Current season for quick lookups
CREATE INDEX idx_season_current ON season(is_current) WHERE is_current = true;
```

### App User Management

```sql
-- Our app's users (NOT FPL managers)
CREATE TABLE app_user (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,             -- Optional, for auth
    display_name VARCHAR(100),
    -- Auth provider info (future: Google, etc.)
    auth_provider VARCHAR(50),
    auth_provider_id VARCHAR(255),
    -- Settings
    default_league_id INTEGER,             -- FK to league
    preferences JSONB DEFAULT '{}',        -- UI preferences, notifications, etc.
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ                 -- GDPR soft-delete; NULL = active
);

-- Partial index for active users (excludes soft-deleted)
CREATE INDEX idx_app_user_active ON app_user(email) WHERE deleted_at IS NULL;

-- Leagues an app user wants to track
CREATE TABLE tracked_league (
    id SERIAL PRIMARY KEY,
    app_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    league_id INTEGER NOT NULL,            -- FPL league ID
    is_primary BOOLEAN DEFAULT false,      -- Main league for this user
    nickname VARCHAR(100),                 -- User's custom name for this league
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(app_user_id, league_id)
);

CREATE INDEX idx_tracked_league_user ON tracked_league(app_user_id);

-- Individual managers an app user wants to track (outside of leagues)
CREATE TABLE tracked_manager (
    id SERIAL PRIMARY KEY,
    app_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    manager_id INTEGER NOT NULL,           -- FPL entry ID
    nickname VARCHAR(100),                 -- User's custom name for this manager
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(app_user_id, manager_id)
);

CREATE INDEX idx_tracked_manager_user ON tracked_manager(app_user_id);
```

### FPL Core Entities

```sql
-- Premier League teams (from bootstrap-static)
CREATE TABLE team (
    id INTEGER NOT NULL,                   -- FPL team ID (1-20)
    season_id INTEGER NOT NULL REFERENCES season(id),
    code INTEGER NOT NULL,                 -- FPL team code
    name VARCHAR(100) NOT NULL,
    short_name VARCHAR(3) NOT NULL,        -- 'ARS', 'CHE', etc.
    -- Strength ratings
    strength INTEGER,
    strength_overall_home INTEGER,
    strength_overall_away INTEGER,
    strength_attack_home INTEGER,
    strength_attack_away INTEGER,
    strength_defence_home INTEGER,
    strength_defence_away INTEGER,
    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, season_id)
);

-- Players (from bootstrap-static)
CREATE TABLE player (
    id INTEGER NOT NULL,                   -- FPL element ID
    season_id INTEGER NOT NULL REFERENCES season(id),
    team_id INTEGER NOT NULL,              -- Current team
    FOREIGN KEY (team_id, season_id) REFERENCES team(id, season_id),
    -- Identity
    first_name VARCHAR(100),
    second_name VARCHAR(100),
    web_name VARCHAR(100) NOT NULL,
    -- Position: 1=GK, 2=DEF, 3=MID, 4=FWD
    element_type INTEGER NOT NULL,
    -- Current price (in 0.1m units, e.g., 100 = £10.0m)
    now_cost INTEGER NOT NULL,
    -- Status
    status VARCHAR(1) DEFAULT 'a',         -- a=available, i=injured, etc.
    news TEXT,
    news_added TIMESTAMPTZ,
    -- Season totals (latest)
    total_points INTEGER DEFAULT 0,
    minutes INTEGER DEFAULT 0,
    goals_scored INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    clean_sheets INTEGER DEFAULT 0,
    goals_conceded INTEGER DEFAULT 0,
    own_goals INTEGER DEFAULT 0,
    penalties_saved INTEGER DEFAULT 0,
    penalties_missed INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    bonus INTEGER DEFAULT 0,
    bps INTEGER DEFAULT 0,
    -- Expected stats (season totals)
    expected_goals DECIMAL(6,2) DEFAULT 0,
    expected_assists DECIMAL(6,2) DEFAULT 0,
    expected_goal_involvements DECIMAL(6,2) DEFAULT 0,
    expected_goals_conceded DECIMAL(6,2) DEFAULT 0,
    -- ICT Index
    influence DECIMAL(6,1) DEFAULT 0,
    creativity DECIMAL(6,1) DEFAULT 0,
    threat DECIMAL(6,1) DEFAULT 0,
    ict_index DECIMAL(6,1) DEFAULT 0,
    -- Ownership
    selected_by_percent DECIMAL(5,2) DEFAULT 0,
    -- Form & points
    form DECIMAL(4,1) DEFAULT 0,
    points_per_game DECIMAL(4,1) DEFAULT 0,
    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, season_id)
);

CREATE INDEX idx_player_team ON player(team_id, season_id);
CREATE INDEX idx_player_element_type ON player(element_type, season_id);
CREATE INDEX idx_player_ownership ON player(season_id, selected_by_percent DESC);

-- Gameweeks (from bootstrap-static events)
CREATE TABLE gameweek (
    id INTEGER NOT NULL,                   -- GW number (1-38)
    season_id INTEGER NOT NULL REFERENCES season(id),
    name VARCHAR(50),                      -- "Gameweek 1"
    deadline_time TIMESTAMPTZ NOT NULL,
    finished BOOLEAN DEFAULT false,
    data_checked BOOLEAN DEFAULT false,
    is_current BOOLEAN DEFAULT false,
    is_next BOOLEAN DEFAULT false,
    -- Aggregate stats
    average_entry_score INTEGER,
    highest_score INTEGER,
    transfers_made INTEGER,
    -- Most popular choices
    most_selected INTEGER,                 -- Player ID
    most_transferred_in INTEGER,
    most_captained INTEGER,
    most_vice_captained INTEGER,
    top_element INTEGER,                   -- Highest scorer
    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, season_id)
);

CREATE INDEX idx_gameweek_current ON gameweek(season_id, is_current) WHERE is_current = true;
```

### Fixtures

```sql
-- Fixtures (from /fixtures endpoint)
CREATE TABLE fixture (
    id INTEGER PRIMARY KEY,                -- FPL fixture ID
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER,                      -- Can be NULL if postponed
    code INTEGER NOT NULL,                 -- FPL fixture code
    -- Teams
    team_h INTEGER NOT NULL,               -- Home team ID
    team_a INTEGER NOT NULL,               -- Away team ID
    FOREIGN KEY (team_h, season_id) REFERENCES team(id, season_id),
    FOREIGN KEY (team_a, season_id) REFERENCES team(id, season_id),
    -- Score
    team_h_score INTEGER,
    team_a_score INTEGER,
    -- Difficulty ratings
    team_h_difficulty INTEGER,
    team_a_difficulty INTEGER,
    -- Timing
    kickoff_time TIMESTAMPTZ,
    started BOOLEAN DEFAULT false,
    finished BOOLEAN DEFAULT false,
    finished_provisional BOOLEAN DEFAULT false,
    minutes INTEGER DEFAULT 0,
    -- Raw stats (JSONB for flexibility)
    stats JSONB DEFAULT '[]',
    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fixture_gameweek ON fixture(season_id, gameweek);
CREATE INDEX idx_fixture_teams ON fixture(team_h, team_a);
CREATE INDEX idx_fixture_kickoff ON fixture(kickoff_time);
```

### Leagues and Managers

```sql
-- FPL Leagues (mini-leagues)
CREATE TABLE league (
    id INTEGER NOT NULL,                   -- FPL league ID
    season_id INTEGER NOT NULL REFERENCES season(id),
    name VARCHAR(255) NOT NULL,
    created TIMESTAMPTZ,
    -- League settings
    league_type VARCHAR(10),               -- 'x' = classic
    scoring VARCHAR(10),                   -- 'c' = classic scoring
    start_event INTEGER DEFAULT 1,
    admin_entry INTEGER,                   -- Admin's manager ID
    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, season_id)
);

-- FPL Managers (Entries)
CREATE TABLE manager (
    id INTEGER NOT NULL,                   -- FPL entry ID
    season_id INTEGER NOT NULL REFERENCES season(id),
    -- Identity
    player_first_name VARCHAR(100),
    player_last_name VARCHAR(100),
    name VARCHAR(100) NOT NULL,            -- Team name
    -- Location
    player_region_name VARCHAR(100),
    player_region_iso_code VARCHAR(10),
    -- Current totals
    summary_overall_points INTEGER DEFAULT 0,
    summary_overall_rank INTEGER,
    summary_event_points INTEGER DEFAULT 0,
    -- Value & transfers
    last_deadline_bank INTEGER DEFAULT 0,  -- Bank in 0.1m units
    last_deadline_value INTEGER DEFAULT 0, -- Team value
    last_deadline_total_transfers INTEGER DEFAULT 0,
    -- FPL metadata
    favourite_team INTEGER,
    started_event INTEGER DEFAULT 1,
    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, season_id)
);

-- Many-to-many: Managers in Leagues
CREATE TABLE league_manager (
    league_id INTEGER NOT NULL,
    manager_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    FOREIGN KEY (league_id, season_id) REFERENCES league(id, season_id),
    FOREIGN KEY (manager_id, season_id) REFERENCES manager(id, season_id),
    -- Standing info
    rank INTEGER,
    last_rank INTEGER,
    total INTEGER DEFAULT 0,               -- Total points
    event_total INTEGER DEFAULT 0,         -- Current GW points
    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (league_id, manager_id, season_id)
);

CREATE INDEX idx_league_manager_league ON league_manager(league_id);
CREATE INDEX idx_league_manager_manager ON league_manager(manager_id);
CREATE INDEX idx_league_manager_rank ON league_manager(league_id, rank);
```

### Historical Snapshots

```sql
-- Manager state snapshot per gameweek
CREATE TABLE manager_gw_snapshot (
    id SERIAL PRIMARY KEY,
    manager_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    FOREIGN KEY (manager_id, season_id) REFERENCES manager(id, season_id),
    FOREIGN KEY (gameweek, season_id) REFERENCES gameweek(id, season_id),
    -- Points
    points INTEGER DEFAULT 0,              -- GW points (before hits)
    total_points INTEGER DEFAULT 0,        -- Cumulative after this GW
    points_on_bench INTEGER DEFAULT 0,     -- Wasted bench points
    -- Transfers
    transfers_made INTEGER DEFAULT 0,
    transfers_cost INTEGER DEFAULT 0,      -- Hit points taken
    -- Value
    bank INTEGER DEFAULT 0,                -- In 0.1m
    value INTEGER DEFAULT 0,               -- Team value
    -- Rank
    overall_rank INTEGER,
    gameweek_rank INTEGER,
    -- Chip used this GW (null if none)
    chip_used VARCHAR(20),                 -- 'wildcard', 'bboost', 'freehit', '3xc'
    -- Formation
    formation VARCHAR(10),                 -- e.g., "3-4-3"
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(manager_id, season_id, gameweek)
);

CREATE INDEX idx_mgw_manager ON manager_gw_snapshot(manager_id);
CREATE INDEX idx_mgw_gameweek ON manager_gw_snapshot(season_id, gameweek);
CREATE INDEX idx_mgw_chip ON manager_gw_snapshot(chip_used) WHERE chip_used IS NOT NULL;

-- Manager's picks per gameweek
-- Note: player_id FK requires knowing season_id; we get it via snapshot -> season
CREATE TABLE manager_pick (
    id SERIAL PRIMARY KEY,
    snapshot_id INTEGER NOT NULL REFERENCES manager_gw_snapshot(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL,            -- FK enforced at application level due to snapshot indirection
    -- Pick details
    position INTEGER NOT NULL,             -- 1-15 (1-11 starting, 12-15 bench)
    multiplier INTEGER DEFAULT 1,          -- 0=bench, 1=normal, 2=captain, 3=TC
    is_captain BOOLEAN DEFAULT false,
    is_vice_captain BOOLEAN DEFAULT false,
    -- Points earned (for historical record)
    points INTEGER DEFAULT 0,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pick_snapshot ON manager_pick(snapshot_id);
CREATE INDEX idx_pick_player ON manager_pick(player_id);
CREATE INDEX idx_pick_captain ON manager_pick(snapshot_id) WHERE is_captain = true;
-- Composite index for common "player picks by gameweek" queries
CREATE INDEX idx_pick_player_snapshot ON manager_pick(player_id, snapshot_id);
```

### Transfer History

```sql
-- Transfer records
CREATE TABLE transfer (
    id SERIAL PRIMARY KEY,
    manager_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,             -- GW the transfer was for
    -- Player movement
    player_in INTEGER NOT NULL,
    player_out INTEGER NOT NULL,
    FOREIGN KEY (manager_id, season_id) REFERENCES manager(id, season_id),
    FOREIGN KEY (player_in, season_id) REFERENCES player(id, season_id),
    FOREIGN KEY (player_out, season_id) REFERENCES player(id, season_id),
    -- Prices at time of transfer
    price_in INTEGER NOT NULL,             -- In 0.1m
    price_out INTEGER NOT NULL,
    -- Transfer type
    is_hit BOOLEAN DEFAULT false,          -- Was this a -4 hit?
    -- Timestamp
    transfer_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transfer_manager ON transfer(manager_id);
CREATE INDEX idx_transfer_gw ON transfer(season_id, gameweek);
CREATE INDEX idx_transfer_player_in ON transfer(player_in);
CREATE INDEX idx_transfer_player_out ON transfer(player_out);
```

### Chip Usage Tracking

```sql
-- Chip usage history
CREATE TABLE chip_usage (
    id SERIAL PRIMARY KEY,
    manager_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    FOREIGN KEY (manager_id, season_id) REFERENCES manager(id, season_id),
    gameweek INTEGER NOT NULL,
    -- Chip type
    chip_type VARCHAR(20) NOT NULL,        -- 'wildcard', 'bboost', 'freehit', '3xc'
    -- Optional: extra points gained (for bench boost)
    points_gained INTEGER,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(manager_id, season_id, chip_type, gameweek)
);

CREATE INDEX idx_chip_manager ON chip_usage(manager_id);
CREATE INDEX idx_chip_type ON chip_usage(chip_type);
```

### Chip Usage (Event-based) - 2025-26 Rules

From 2025-26, **ALL chips reset at GW20** - each half-season has: wildcard, bboost, 3xc, freehit (8 chips total per manager per season).

```sql
-- Migration: 008_chip_usage.sql
CREATE TABLE chip_usage (
    id BIGSERIAL PRIMARY KEY,
    manager_id BIGINT NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL CHECK (gameweek >= 1 AND gameweek <= 38),
    chip_type VARCHAR(20) NOT NULL CHECK (chip_type IN ('wildcard', 'bboost', '3xc', 'freehit')),

    -- Which half of the season (1 = GW1-19, 2 = GW20-38)
    season_half SMALLINT NOT NULL CHECK (season_half IN (1, 2)),

    -- Analytics metadata
    points_gained INTEGER,              -- bench pts for BB, extra captain pts for 3xc
    team_value_at_use INTEGER,          -- in 0.1m units

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(manager_id, season_id, season_half, chip_type)
);

CREATE INDEX idx_chip_usage_manager_season ON chip_usage(manager_id, season_id);
CREATE INDEX idx_chip_usage_season_half ON chip_usage(season_id, season_half);
```

**Query chips used in first half:**
```sql
SELECT chip_type, gameweek, points_gained
FROM chip_usage
WHERE manager_id = 123 AND season_id = 1 AND season_half = 1;
```

**Query remaining chips for second half:**
```sql
-- Returns chip types NOT yet used in second half
SELECT chip_type FROM (VALUES ('wildcard'), ('bboost'), ('3xc'), ('freehit')) AS all_chips(chip_type)
WHERE chip_type NOT IN (
    SELECT chip_type FROM chip_usage
    WHERE manager_id = 123 AND season_id = 1 AND season_half = 2
);
```

**Compare bench boost success in a league:**
```sql
SELECT
    m.name AS manager_name,
    cu.gameweek,
    cu.points_gained AS bb_points
FROM chip_usage cu
JOIN manager m ON cu.manager_id = m.id
WHERE cu.chip_type = 'bboost'
  AND cu.manager_id IN (SELECT manager_id FROM league_manager WHERE league_id = 456)
ORDER BY cu.points_gained DESC;
```

### Player Gameweek Stats

```sql
-- Player performance per gameweek (from /event/{gw}/live)
CREATE TABLE player_gw_stats (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    fixture_id INTEGER REFERENCES fixture(id),  -- Can have multiple if DGW
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    FOREIGN KEY (gameweek, season_id) REFERENCES gameweek(id, season_id),
    -- Points breakdown
    total_points INTEGER DEFAULT 0,
    minutes INTEGER DEFAULT 0,
    goals_scored INTEGER DEFAULT 0,
    assists INTEGER DEFAULT 0,
    clean_sheets INTEGER DEFAULT 0,
    goals_conceded INTEGER DEFAULT 0,
    own_goals INTEGER DEFAULT 0,
    penalties_saved INTEGER DEFAULT 0,
    penalties_missed INTEGER DEFAULT 0,
    yellow_cards INTEGER DEFAULT 0,
    red_cards INTEGER DEFAULT 0,
    saves INTEGER DEFAULT 0,
    bonus INTEGER DEFAULT 0,
    bps INTEGER DEFAULT 0,
    -- ICT for this GW
    influence DECIMAL(6,1) DEFAULT 0,
    creativity DECIMAL(6,1) DEFAULT 0,
    threat DECIMAL(6,1) DEFAULT 0,
    ict_index DECIMAL(6,1) DEFAULT 0,
    -- Expected stats for this GW
    expected_goals DECIMAL(5,2) DEFAULT 0,
    expected_assists DECIMAL(5,2) DEFAULT 0,
    expected_goal_involvements DECIMAL(5,2) DEFAULT 0,
    expected_goals_conceded DECIMAL(5,2) DEFAULT 0,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, season_id, gameweek, fixture_id)
);

CREATE INDEX idx_pgs_player ON player_gw_stats(player_id);
CREATE INDEX idx_pgs_gameweek ON player_gw_stats(season_id, gameweek);
CREATE INDEX idx_pgs_points ON player_gw_stats(total_points DESC);
```

### Price Changes

```sql
-- Player price change history
CREATE TABLE price_change (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    -- Change details
    old_price INTEGER NOT NULL,            -- In 0.1m
    new_price INTEGER NOT NULL,
    change_amount INTEGER NOT NULL,        -- +1 or -1 (in 0.1m)
    -- When
    change_date DATE NOT NULL,
    gameweek INTEGER,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_player ON price_change(player_id);
CREATE INDEX idx_price_date ON price_change(change_date DESC);
```

---

## Analytics Support Tables

These tables support the future ML pipeline and advanced analytics from RECOMMENDATIONS.md.

### Expected Points Cache

```sql
-- Cached expected points calculations
CREATE TABLE expected_points_cache (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,             -- Prediction for this GW
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    -- xP breakdown
    xp_goals DECIMAL(5,2) DEFAULT 0,
    xp_assists DECIMAL(5,2) DEFAULT 0,
    xp_clean_sheet DECIMAL(5,2) DEFAULT 0,
    xp_appearance DECIMAL(5,2) DEFAULT 0,
    xp_bonus DECIMAL(5,2) DEFAULT 0,
    xp_goals_conceded DECIMAL(5,2) DEFAULT 0,
    xp_total DECIMAL(6,2) DEFAULT 0,
    -- Expected minutes
    expected_minutes DECIMAL(4,1) DEFAULT 0,
    minutes_probability_0 DECIMAL(4,3) DEFAULT 0,   -- P(0 min)
    minutes_probability_60 DECIMAL(4,3) DEFAULT 0,  -- P(60+ min)
    -- Calculation metadata
    model_version VARCHAR(20),
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, season_id, gameweek)
);

CREATE INDEX idx_xp_gameweek ON expected_points_cache(season_id, gameweek);
CREATE INDEX idx_xp_total ON expected_points_cache(gameweek, xp_total DESC);
```

### Delta Tracking (Over/Under Performance)

```sql
-- Tracks actual vs expected performance
CREATE TABLE performance_delta (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    -- Deltas (actual - expected)
    goals_delta DECIMAL(5,2) DEFAULT 0,    -- goals - xG
    assists_delta DECIMAL(5,2) DEFAULT 0,  -- assists - xA
    points_delta DECIMAL(5,2) DEFAULT 0,   -- actual - xP
    -- Rolling deltas (cumulative)
    rolling_goals_delta DECIMAL(6,2) DEFAULT 0,
    rolling_assists_delta DECIMAL(6,2) DEFAULT 0,
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, season_id, gameweek)
);

CREATE INDEX idx_delta_player ON performance_delta(player_id);
CREATE INDEX idx_delta_regression ON performance_delta(rolling_goals_delta DESC);
```

### Multi-Horizon Form

```sql
-- Rolling form calculations at different horizons
CREATE TABLE player_form (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    -- Form at different horizons (points per game)
    form_1gw DECIMAL(4,1) DEFAULT 0,       -- Last GW only
    form_3gw DECIMAL(4,1) DEFAULT 0,       -- Last 3 GWs
    form_5gw DECIMAL(4,1) DEFAULT 0,       -- Last 5 GWs
    form_10gw DECIMAL(4,1) DEFAULT 0,      -- Last 10 GWs
    -- xG-based form
    xg_form_5gw DECIMAL(5,2) DEFAULT 0,    -- xG per 90 over 5 GWs
    xa_form_5gw DECIMAL(5,2) DEFAULT 0,    -- xA per 90 over 5 GWs
    -- Metadata
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, season_id, gameweek)
);

CREATE INDEX idx_form_gw ON player_form(season_id, gameweek);
```

### Recommendation Scores

```sql
-- Pre-computed recommendation scores
CREATE TABLE recommendation_score (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    -- Category scores (0-100)
    punt_score DECIMAL(5,2) DEFAULT 0,
    defensive_score DECIMAL(5,2) DEFAULT 0,
    sell_score DECIMAL(5,2) DEFAULT 0,     -- "Time to sell" badness score
    -- Fixture score (next 5 GWs)
    fixture_score DECIMAL(4,2) DEFAULT 0,
    -- League-specific ownership (stored per league)
    -- Note: For league-specific, use separate table
    global_ownership DECIMAL(5,2) DEFAULT 0,
    -- Metadata
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(player_id, season_id, gameweek)
);

CREATE INDEX idx_rec_punt ON recommendation_score(gameweek, punt_score DESC);
CREATE INDEX idx_rec_defensive ON recommendation_score(gameweek, defensive_score DESC);
CREATE INDEX idx_rec_sell ON recommendation_score(gameweek, sell_score DESC);

-- League-specific ownership for recommendations
CREATE TABLE league_ownership (
    id SERIAL PRIMARY KEY,
    league_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek INTEGER NOT NULL,
    FOREIGN KEY (league_id, season_id) REFERENCES league(id, season_id),
    FOREIGN KEY (player_id, season_id) REFERENCES player(id, season_id),
    -- Ownership stats
    ownership_count INTEGER DEFAULT 0,     -- How many managers own
    ownership_percent DECIMAL(5,2) DEFAULT 0,
    captain_count INTEGER DEFAULT 0,
    -- Metadata
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(league_id, player_id, season_id, gameweek)
);

CREATE INDEX idx_lo_league ON league_ownership(league_id, gameweek);
CREATE INDEX idx_lo_ownership ON league_ownership(league_id, ownership_percent DESC);
```

---

## Player Fixture Stats (Migration 005)

Per-player per-fixture detailed stats from FPL API `element-summary/{id}/` endpoint. This enables:
- Delta tracking (actual vs expected performance)
- Multi-horizon form calculations
- Expected Points engine foundation
- Player-level Points Against analysis

### Table: `player_fixture_stats`

```sql
-- Stores ALL 35+ fields from FPL API per player per fixture
CREATE TABLE player_fixture_stats (
    -- Primary identification
    fixture_id INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL REFERENCES season(id),
    gameweek SMALLINT NOT NULL,

    -- Match context
    player_team_id INTEGER NOT NULL,        -- Player's team
    opponent_team_id INTEGER NOT NULL,      -- Opposition team
    was_home BOOLEAN NOT NULL,
    kickoff_time TIMESTAMPTZ,

    -- Points breakdown
    minutes SMALLINT NOT NULL DEFAULT 0,
    total_points SMALLINT NOT NULL DEFAULT 0,
    bonus SMALLINT NOT NULL DEFAULT 0,
    bps SMALLINT NOT NULL DEFAULT 0,        -- Bonus Points System score

    -- Attacking stats (for delta tracking: actual - expected)
    goals_scored SMALLINT NOT NULL DEFAULT 0,
    assists SMALLINT NOT NULL DEFAULT 0,
    expected_goals DECIMAL(5,2) NOT NULL DEFAULT 0,
    expected_assists DECIMAL(5,2) NOT NULL DEFAULT 0,
    expected_goal_involvements DECIMAL(5,2) NOT NULL DEFAULT 0,

    -- Defensive stats
    clean_sheets SMALLINT NOT NULL DEFAULT 0,
    goals_conceded SMALLINT NOT NULL DEFAULT 0,
    own_goals SMALLINT NOT NULL DEFAULT 0,
    penalties_saved SMALLINT NOT NULL DEFAULT 0,
    penalties_missed SMALLINT NOT NULL DEFAULT 0,
    saves SMALLINT NOT NULL DEFAULT 0,
    expected_goals_conceded DECIMAL(5,2) NOT NULL DEFAULT 0,

    -- Cards
    yellow_cards SMALLINT NOT NULL DEFAULT 0,
    red_cards SMALLINT NOT NULL DEFAULT 0,

    -- ICT Index (Influence, Creativity, Threat)
    influence DECIMAL(6,1) NOT NULL DEFAULT 0,
    creativity DECIMAL(6,1) NOT NULL DEFAULT 0,
    threat DECIMAL(6,1) NOT NULL DEFAULT 0,
    ict_index DECIMAL(6,1) NOT NULL DEFAULT 0,

    -- Value and ownership at time of match
    value INTEGER NOT NULL,                  -- Price * 10 (e.g., 100 = £10.0m)
    selected INTEGER NOT NULL DEFAULT 0,     -- Global ownership count
    transfers_in INTEGER NOT NULL DEFAULT 0,
    transfers_out INTEGER NOT NULL DEFAULT 0,

    -- Playing status
    starts SMALLINT NOT NULL DEFAULT 0,      -- 1 if started, 0 if sub

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    PRIMARY KEY (fixture_id, player_id)
);

-- Indexes
CREATE INDEX idx_pfs_player_season ON player_fixture_stats(player_id, season_id);
CREATE INDEX idx_pfs_opponent ON player_fixture_stats(opponent_team_id, season_id);
CREATE INDEX idx_pfs_player_gw ON player_fixture_stats(player_id, season_id, gameweek DESC);
CREATE INDEX idx_pfs_player_gw_asc ON player_fixture_stats(player_id, season_id, gameweek);
CREATE INDEX idx_pfs_season_gw ON player_fixture_stats(season_id, gameweek);
CREATE INDEX idx_pfs_xg_delta ON player_fixture_stats(season_id, (goals_scored - expected_goals) DESC)
    WHERE minutes >= 60;
```

### View: `player_vs_team_stats`

Aggregated stats for how each player performs against each opponent:

```sql
CREATE OR REPLACE VIEW player_vs_team_stats AS
SELECT
    pfs.player_id,
    pfs.opponent_team_id,
    pfs.season_id,
    COUNT(*) as matches,
    SUM(pfs.total_points) as total_points,
    ROUND(AVG(pfs.total_points), 1) as avg_points,
    SUM(pfs.goals_scored) as goals,
    SUM(pfs.assists) as assists,
    SUM(pfs.minutes) as total_minutes,
    ROUND(SUM(pfs.expected_goals)::numeric, 2) as total_xg,
    ROUND(SUM(pfs.expected_assists)::numeric, 2) as total_xa
FROM player_fixture_stats pfs
GROUP BY pfs.player_id, pfs.opponent_team_id, pfs.season_id;
```

### View: `player_season_deltas`

Over/underperformance tracking - players who score more/less than xG suggests:

```sql
CREATE OR REPLACE VIEW player_season_deltas AS
SELECT
    pfs.player_id,
    pfs.season_id,
    COUNT(*) as matches,
    SUM(pfs.minutes) as total_minutes,
    SUM(pfs.goals_scored) as actual_goals,
    ROUND(SUM(pfs.expected_goals)::numeric, 2) as expected_goals,
    SUM(pfs.goals_scored) - SUM(pfs.expected_goals) as goals_delta,
    SUM(pfs.assists) as actual_assists,
    ROUND(SUM(pfs.expected_assists)::numeric, 2) as expected_assists,
    SUM(pfs.assists) - SUM(pfs.expected_assists) as assists_delta,
    SUM(pfs.total_points) as total_points,
    ROUND(AVG(pfs.total_points), 1) as avg_points
FROM player_fixture_stats pfs
WHERE pfs.minutes >= 1
GROUP BY pfs.player_id, pfs.season_id;
```

### Function: `get_player_form()`

Multi-horizon form calculation for Phase 1 recommendations features:

```sql
CREATE OR REPLACE FUNCTION get_player_form(
    p_player_id INTEGER,
    p_season_id INTEGER,
    p_current_gw INTEGER
) RETURNS TABLE (
    form_1gw DECIMAL(4,1),
    form_3gw DECIMAL(4,1),
    form_5gw DECIMAL(4,1),
    form_10gw DECIMAL(4,1),
    minutes_1gw INTEGER,
    minutes_3gw INTEGER,
    minutes_5gw INTEGER,
    minutes_10gw INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(AVG(total_points) FILTER (WHERE gameweek = p_current_gw - 1), 0)::DECIMAL(4,1),
        COALESCE(AVG(total_points) FILTER (WHERE gameweek >= p_current_gw - 3), 0)::DECIMAL(4,1),
        COALESCE(AVG(total_points) FILTER (WHERE gameweek >= p_current_gw - 5), 0)::DECIMAL(4,1),
        COALESCE(AVG(total_points) FILTER (WHERE gameweek >= p_current_gw - 10), 0)::DECIMAL(4,1),
        COALESCE(SUM(minutes) FILTER (WHERE gameweek = p_current_gw - 1), 0)::INTEGER,
        COALESCE(SUM(minutes) FILTER (WHERE gameweek >= p_current_gw - 3), 0)::INTEGER,
        COALESCE(SUM(minutes) FILTER (WHERE gameweek >= p_current_gw - 5), 0)::INTEGER,
        COALESCE(SUM(minutes) FILTER (WHERE gameweek >= p_current_gw - 10), 0)::INTEGER
    FROM player_fixture_stats
    WHERE player_id = p_player_id
      AND season_id = p_season_id
      AND gameweek < p_current_gw;
END;
$$ LANGUAGE plpgsql;
```

**Example usage:**
```sql
-- Get Salah's form across horizons at GW20
SELECT * FROM get_player_form(427, 1, 20);
-- Returns: form_1gw=12.0, form_3gw=8.5, form_5gw=7.2, form_10gw=6.8, ...
```

---

## Data Sync Strategy

### What to Cache vs Fetch Live

| Data | Cache Strategy | TTL | Notes |
|------|----------------|-----|-------|
| Bootstrap (players, teams) | Store + refresh | 5 min during GW, 1 hour otherwise | Large payload, changes infrequently |
| Fixtures | Store + refresh | 10 min | Changes during postponements |
| Live GW data | Cache only | 1 min | During matches only |
| Manager picks | Store permanently | N/A | Historical record |
| League standings | Store + refresh | 5 min | During live GWs |
| Transfers | Store permanently | N/A | Historical record |

### Sync Jobs

```python
# Example sync schedule (using APScheduler or Celery)

# Every 5 minutes during active gameweek
sync_bootstrap_data()
sync_live_gameweek_data()
sync_league_standings()

# Once per gameweek (after GW ends)
snapshot_all_managers()
calculate_bench_points()
calculate_captain_differentials()
update_price_changes()

# Daily
calculate_recommendation_scores()
update_player_form()
calculate_expected_points()
```

---

## Migration Strategy

### Phase 1: Core Tables (MVP)
```sql
-- Essential for basic functionality
season, team, player, gameweek, fixture
league, manager, league_manager
```

### Phase 2: Historical Tracking
```sql
-- For stats and analytics
manager_gw_snapshot, manager_pick
transfer, chip_usage
player_gw_stats, price_change
```

### Phase 3: Analytics
```sql
-- For advanced features
expected_points_cache
performance_delta
player_form
recommendation_score, league_ownership
```

### Phase 4: User Management
```sql
-- When adding auth
app_user, tracked_league
```

---

## Example Queries

### Get manager's full gameweek history

```sql
SELECT
    g.id as gameweek,
    s.points,
    s.total_points,
    s.points_on_bench,
    s.chip_used,
    s.transfers_cost,
    s.overall_rank
FROM manager_gw_snapshot s
JOIN gameweek g ON g.id = s.gameweek AND g.season_id = s.season_id
WHERE s.manager_id = 123
  AND s.season_id = (SELECT id FROM season WHERE is_current)
ORDER BY g.id;
```

### League standings with chip tracking

```sql
SELECT
    m.name as team_name,
    m.player_first_name || ' ' || m.player_last_name as manager_name,
    lm.total as points,
    lm.rank,
    COUNT(cu.id) FILTER (WHERE cu.chip_type = 'wildcard') as wildcards_used,
    COUNT(cu.id) FILTER (WHERE cu.chip_type = 'bboost') as bb_used,
    COUNT(cu.id) FILTER (WHERE cu.chip_type = 'freehit') as fh_used,
    COUNT(cu.id) FILTER (WHERE cu.chip_type = '3xc') as tc_used
FROM league_manager lm
JOIN manager m ON m.id = lm.manager_id
LEFT JOIN chip_usage cu ON cu.manager_id = m.id AND cu.season_id = lm.season_id
WHERE lm.league_id = 456
  AND lm.season_id = (SELECT id FROM season WHERE is_current)
GROUP BY m.id, lm.total, lm.rank
ORDER BY lm.rank;
```

### Bench points leaderboard

```sql
SELECT
    m.name as team_name,
    SUM(s.points_on_bench) as total_bench_points
FROM manager_gw_snapshot s
JOIN manager m ON m.id = s.manager_id
WHERE s.season_id = (SELECT id FROM season WHERE is_current)
  AND s.manager_id IN (
      SELECT manager_id FROM league_manager WHERE league_id = 456
  )
GROUP BY m.id, m.name
ORDER BY total_bench_points DESC;
```

### Captain differential analysis

```sql
WITH template_captains AS (
    SELECT gameweek, most_captained as template_captain
    FROM gameweek
    WHERE season_id = (SELECT id FROM season WHERE is_current)
)
SELECT
    m.name,
    COUNT(*) FILTER (WHERE mp.player_id != tc.template_captain) as differential_picks,
    SUM(CASE
        WHEN mp.player_id != tc.template_captain
        THEN mp.points * mp.multiplier
        ELSE 0
    END) as differential_points
FROM manager_gw_snapshot s
JOIN manager m ON m.id = s.manager_id
JOIN manager_pick mp ON mp.snapshot_id = s.id AND mp.is_captain = true
JOIN template_captains tc ON tc.gameweek = s.gameweek
WHERE s.manager_id IN (SELECT manager_id FROM league_manager WHERE league_id = 456)
GROUP BY m.id, m.name
HAVING COUNT(*) FILTER (WHERE mp.player_id != tc.template_captain) > 0
ORDER BY differential_points DESC;
```

### Players due for regression (overperforming)

```sql
SELECT
    p.web_name,
    t.short_name as team,
    pd.rolling_goals_delta,
    pd.rolling_assists_delta,
    p.selected_by_percent as ownership
FROM performance_delta pd
JOIN player p ON p.id = pd.player_id
JOIN team t ON t.id = p.team_id
WHERE pd.season_id = (SELECT id FROM season WHERE is_current)
  AND pd.gameweek = (SELECT id FROM gameweek WHERE is_current)
  AND pd.rolling_goals_delta > 2  -- Scored 2+ more than xG
ORDER BY pd.rolling_goals_delta DESC
LIMIT 10;
```

---

## Index Summary

Key indexes for query performance:

| Table | Index | Purpose |
|-------|-------|---------|
| `app_user` | `(email) WHERE deleted_at IS NULL` | Active user lookups |
| `tracked_league` | `(app_user_id)` | User's tracked leagues |
| `tracked_manager` | `(app_user_id)` | User's tracked managers |
| `player` | `(team_id, season_id)` | Team roster queries |
| `player` | `(element_type, season_id)` | Position filtering |
| `player` | `(season_id, selected_by_percent DESC)` | Ownership rankings |
| `fixture` | `(season_id, gameweek)` | GW fixtures |
| `manager_gw_snapshot` | `(manager_id)` | Manager history |
| `manager_pick` | `(snapshot_id)` | GW picks |
| `manager_pick` | `(player_id, snapshot_id)` | Player ownership queries |
| `transfer` | `(manager_id)` | Transfer history |
| `player_gw_stats` | `(season_id, gameweek)` | Live/historical stats |
| `league_ownership` | `(league_id, gameweek)` | League-specific ownership |

---

## Future Considerations

### Partitioning
For large-scale deployments, consider partitioning:
- `player_gw_stats` by season
- `manager_gw_snapshot` by season
- `transfer` by season

### Read Replicas
If read performance becomes a bottleneck:
- Analytics queries on replica
- Live data from primary

### Data Retention
- Keep current + last season in hot storage
- Archive older seasons to cold storage or export

---

## Next Steps

1. **Choose database provider** (Supabase recommended for free tier + auth)
2. **Create migrations** using Alembic (Python) or raw SQL
3. **Implement sync service** to populate data from FPL API
4. **Add API endpoints** in FastAPI to serve data
5. **Update frontend** to use backend endpoints
