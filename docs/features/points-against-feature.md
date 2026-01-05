# Feature: FPL Points Against by Team

## Overview

Display how many total FPL fantasy points have been scored against each Premier League team. This indicates defensive strength from an FPL perspective - teams that concede more FPL points are easier to target.

**Reference**: Similar to the "FPL PTS AG" column showing Wolves (991) as worst and Arsenal (535) as best defense.

## User Story

As an FPL manager, I want to see which teams concede the most FPL points, so I can target players facing weak defenses and avoid those facing strong ones.

---

## Data Requirements

### Source: FPL API `element-summary/{playerId}`

Each player's history contains **35+ fields**. We now collect ALL of them:

```typescript
interface PlayerHistory {
  // Core identification
  fixture: number;          // Fixture ID (unique per match)
  opponent_team: number;    // Team they played against
  round: number;            // Gameweek number
  was_home: boolean;        // Home or away fixture
  kickoff_time: string;

  // Points breakdown
  minutes: number;
  total_points: number;
  bonus: number;
  bps: number;              // Bonus Points System raw score

  // Attacking stats
  goals_scored: number;
  assists: number;
  expected_goals: number;   // xG
  expected_assists: number; // xA
  expected_goal_involvements: number;

  // Defensive stats
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  saves: number;
  expected_goals_conceded: number;

  // Cards
  yellow_cards: number;
  red_cards: number;

  // ICT Index
  influence: number;
  creativity: number;
  threat: number;
  ict_index: number;

  // Value and ownership at time of match
  value: number;
  selected: number;
  transfers_in: number;
  transfers_out: number;

  // Playing status
  starts: number;           // 1 if started, 0 if sub
}
```

### Calculation Logic

```
Points Against Team X = SUM of all players' total_points
                        WHERE opponent_team = X
```

### Enhanced Data Storage

The collection script now saves **both**:
1. **Aggregated Points Against** → `points_against_by_fixture` (team totals per fixture)
2. **Individual Player Stats** → `player_fixture_stats` (full player data per fixture)

This enables position-based breakdowns, form analysis, and recommendations integration.

### Breakdown Options
- **Total**: All points against (home + away)
- **Home**: Points conceded when playing at home
- **Away**: Points conceded when playing away
- **Per Gameweek**: Granular tracking for trends

---

## Architecture

### Why Backend + Database?

| Approach | Pros | Cons |
|----------|------|------|
| Frontend-only | Simple | 700+ API calls, 5-10 min load, poor UX |
| Backend + DB | Fast responses, incremental updates | More infrastructure |
| Worker + KV | Simpler than full DB | Less flexible queries |

**Decision**: Backend + Database (Supabase PostgreSQL)

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    INITIAL DATA COLLECTION                       │
│                    (One-time CLI script)                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Fetch bootstrap-static → Get all player IDs (~700)          │
│  2. Batch fetch element-summary/{id} for each player            │
│     - Rate limit: 60 req/min to avoid throttling                │
│     - Total time: ~70 seconds                                   │
│  3. For each player's history entry:                            │
│     - Extract: fixture, opponent_team, total_points, was_home   │
│  4. Aggregate by fixture_id (handles DGWs correctly)            │
│  5. Upsert to database (ON CONFLICT DO UPDATE)                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    INCREMENTAL UPDATES                           │
│              (GitHub Actions cron - 3 AM UTC daily)              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Fetch live endpoint → Get players who played in latest GW  │
│  2. Fetch element-summary only for those players (~200-300)     │
│  3. Upsert new fixture data to existing aggregates              │
│  4. Update collection_status table                              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND REQUEST                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Frontend ──► Cloudflare Worker (1hr cache) ──► Backend API     │
│                                                                  │
│  Response time: <100ms (pre-aggregated data)                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Table: `points_against_by_fixture`

**Key design decision**: Use `fixture_id` as primary key to correctly handle Double Gameweeks (DGWs) where a team plays twice in one gameweek.

```sql
-- Migration: 004_points_against.sql

CREATE TABLE points_against_by_fixture (
  fixture_id INTEGER PRIMARY KEY,           -- FPL fixture ID (unique per match)
  team_id INTEGER NOT NULL,                 -- Team being scored against
  season_id INTEGER NOT NULL REFERENCES season(id),  -- FK to season table
  gameweek INTEGER NOT NULL,
  home_points INTEGER NOT NULL DEFAULT 0,   -- Points conceded at home
  away_points INTEGER NOT NULL DEFAULT 0,   -- Points conceded away
  is_home BOOLEAN NOT NULL,                 -- Was this team at home?
  opponent_id INTEGER NOT NULL,             -- Who they played
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_pa_team_season
  ON points_against_by_fixture(team_id, season_id);
CREATE INDEX idx_pa_gameweek
  ON points_against_by_fixture(season_id, gameweek);
CREATE INDEX idx_pa_team_gw
  ON points_against_by_fixture(team_id, season_id, gameweek);
```

### Table: `team` (exists in 001_core_tables.sql)

Reference table for team names - **already exists**, no need to create.

```sql
-- From 001_core_tables.sql (DO NOT recreate)
CREATE TABLE team (
  id INTEGER NOT NULL,                      -- FPL team ID (1-20)
  season_id INTEGER NOT NULL REFERENCES season(id),
  code INTEGER NOT NULL,                    -- FPL team code
  name VARCHAR(100) NOT NULL,
  short_name VARCHAR(3) NOT NULL,           -- 'ARS', 'CHE', etc.
  strength INTEGER,
  strength_overall_home INTEGER,
  strength_overall_away INTEGER,
  strength_attack_home INTEGER,
  strength_attack_away INTEGER,
  strength_defence_home INTEGER,
  strength_defence_away INTEGER,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, season_id)
);
```

### Table: `points_against_collection_status`

Track collection progress and last update time.

```sql
CREATE TABLE points_against_collection_status (
  id TEXT PRIMARY KEY DEFAULT 'points_against',
  season_id INTEGER NOT NULL REFERENCES season(id),
  latest_gameweek INTEGER NOT NULL,
  total_players_processed INTEGER NOT NULL,
  last_full_collection TIMESTAMPTZ,
  last_incremental_update TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'idle',      -- 'idle', 'running', 'error'
  error_message TEXT
);
```

### Why Per-Fixture Granularity?

Storing per-fixture (not per-gameweek) correctly handles:
- **Double Gameweeks**: Liverpool plays twice in GW34 → 2 fixture rows
- **Blank Gameweeks**: Team has no fixture → no row (no nulls)
- **Postponements**: Rescheduled matches get their own fixture_id

Query examples:
```sql
-- Season totals (using the pre-built view)
SELECT * FROM points_against_season_totals
WHERE season_code = '2025-26'
ORDER BY total_points DESC;

-- Or with direct query (season_id is an INTEGER FK)
SELECT paf.team_id, SUM(paf.home_points + paf.away_points) as total
FROM points_against_by_fixture paf
JOIN season s ON s.id = paf.season_id
WHERE s.code = '2025-26'
GROUP BY paf.team_id
ORDER BY total DESC;

-- Home vs Away split
SELECT paf.team_id,
       SUM(CASE WHEN paf.is_home THEN paf.home_points + paf.away_points ELSE 0 END) as home_pa,
       SUM(CASE WHEN NOT paf.is_home THEN paf.home_points + paf.away_points ELSE 0 END) as away_pa
FROM points_against_by_fixture paf
JOIN season s ON s.id = paf.season_id
WHERE s.code = '2025-26'
GROUP BY paf.team_id;

-- Last 5 gameweeks form
SELECT paf.team_id, SUM(paf.home_points + paf.away_points) as recent_pa
FROM points_against_by_fixture paf
JOIN season s ON s.id = paf.season_id
WHERE s.code = '2025-26'
  AND paf.gameweek >= (SELECT MAX(gameweek) - 4 FROM points_against_by_fixture)
GROUP BY paf.team_id;
```

---

## Backend API

### Endpoint: `GET /api/v1/points-against`

**Query Parameters:**
- `season_id` (optional): Default current season
- `last_n` (optional): Only include last N gameweeks

**Response:**
```json
{
  "season_id": "2025-26",
  "as_of_gameweek": 20,
  "updated_at": "2025-01-03T10:00:00Z",
  "teams": [
    {
      "id": 20,
      "name": "Wolverhampton Wanderers",
      "short_name": "WOL",
      "total": 991,
      "home": 512,
      "away": 479,
      "matches_played": 20,
      "avg_per_match": 49.55
    },
    {
      "id": 1,
      "name": "Arsenal",
      "short_name": "ARS",
      "total": 535,
      "home": 245,
      "away": 290,
      "matches_played": 20,
      "avg_per_match": 26.75
    }
  ]
}
```

**Cache Headers:**
```
Cache-Control: public, max-age=3600
```

### Endpoint: `GET /api/v1/points-against/{team_id}/history`

Per-gameweek breakdown for a specific team (for charts/trends).

**Response:**
```json
{
  "team_id": 20,
  "team_name": "Wolverhampton Wanderers",
  "season_id": "2025-26",
  "history": [
    { "gameweek": 1, "opponent": "Arsenal", "is_home": false, "points": 45 },
    { "gameweek": 2, "opponent": "Chelsea", "is_home": true, "points": 52 },
    { "gameweek": 34, "opponent": "Liverpool", "is_home": true, "points": 38 },
    { "gameweek": 34, "opponent": "Man City", "is_home": false, "points": 41 }
  ]
}
```

### Endpoint: `GET /api/v1/health/data-freshness`

Monitor data collection status.

**Response:**
```json
{
  "status": "ok",
  "last_update": "2025-01-03T03:15:00Z",
  "hours_since_update": 6.5,
  "latest_gameweek": 20,
  "alert": false
}
```

### Admin Endpoints

```
POST /admin/points-against/collect
  Body: { "mode": "full" | "incremental", "season_id": "2025-26" }

POST /admin/points-against/refresh
  Body: { "gameweek": 15 }  # Re-process specific GW
```

---

## Data Collection Script

### Full Collection (Python)

```python
# backend/scripts/collect_points_against.py

import asyncio
import httpx
from datetime import datetime
from tenacity import retry, wait_exponential, stop_after_attempt

FPL_BASE = "https://fantasy.premierleague.com/api"
REQUESTS_PER_MINUTE = 60
DELAY = 60 / REQUESTS_PER_MINUTE  # 1 second between requests


class FPLClient:
    def __init__(self):
        self.last_request = 0

    async def _rate_limit(self):
        now = asyncio.get_event_loop().time()
        elapsed = now - self.last_request
        if elapsed < DELAY:
            await asyncio.sleep(DELAY - elapsed)
        self.last_request = asyncio.get_event_loop().time()

    @retry(wait=wait_exponential(multiplier=1, min=4, max=60), stop=stop_after_attempt(5))
    async def get(self, url: str) -> dict:
        await self._rate_limit()
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=30)
            if response.status_code == 429:
                raise Exception("Rate limited - will retry")
            response.raise_for_status()
            return response.json()


async def collect_points_against(db, season_id: str, mode: str = "full"):
    """
    Collect FPL points against data for all teams.

    Full mode: Fetch all players, aggregate all history
    Incremental mode: Only fetch players who played in latest GW
    """
    client = FPLClient()

    # 1. Get bootstrap data
    bootstrap = await client.get(f"{FPL_BASE}/bootstrap-static/")
    teams = {t["id"]: t for t in bootstrap["teams"]}
    current_gw = next(e["id"] for e in bootstrap["events"] if e["is_current"])

    # Store team names
    # Get season ID from the season table
    season_row = await db.fetchrow("SELECT id FROM season WHERE code = $1", season_id)
    season_db_id = season_row["id"]

    for team in bootstrap["teams"]:
        await db.execute("""
            INSERT INTO team (id, season_id, code, name, short_name)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id, season_id) DO UPDATE SET
                name = EXCLUDED.name, short_name = EXCLUDED.short_name
        """, team["id"], season_db_id, team["code"], team["name"], team["short_name"])

    # 2. Get player list
    if mode == "full":
        player_ids = [p["id"] for p in bootstrap["elements"]]
    else:
        # Incremental: only players who played in latest GW
        live = await client.get(f"{FPL_BASE}/event/{current_gw}/live/")
        player_ids = [
            int(pid) for pid, stats in live["elements"].items()
            if stats["stats"]["minutes"] > 0
        ]

    # 3. Aggregate points by fixture
    # Key: fixture_id -> { team_id, opponent_id, is_home, gw, home_pts, away_pts }
    fixture_data = {}

    for i, player_id in enumerate(player_ids):
        try:
            summary = await client.get(f"{FPL_BASE}/element-summary/{player_id}/")

            for match in summary["history"]:
                fixture_id = match["fixture"]
                opponent_id = match["opponent_team"]
                gw = match["round"]
                points = match["total_points"]
                was_home = match["was_home"]

                if fixture_id not in fixture_data:
                    fixture_data[fixture_id] = {
                        "team_id": opponent_id,  # Points against THIS team
                        "opponent_id": opponent_id if was_home else match["opponent_team"],
                        "is_home": not was_home,  # Opponent's perspective
                        "gameweek": gw,
                        "home_points": 0,
                        "away_points": 0,
                    }

                # Add points to appropriate bucket
                if was_home:
                    # Player was home, so opponent (who we track) was away
                    fixture_data[fixture_id]["away_points"] += points
                else:
                    # Player was away, so opponent (who we track) was home
                    fixture_data[fixture_id]["home_points"] += points

            if (i + 1) % 50 == 0:
                print(f"Processed {i + 1}/{len(player_ids)} players")

        except Exception as e:
            print(f"Error fetching player {player_id}: {e}")
            continue

    # 4. Upsert to database
    for fixture_id, data in fixture_data.items():
        await db.execute("""
            INSERT INTO points_against_by_fixture
                (fixture_id, team_id, season_id, gameweek, home_points, away_points, is_home, opponent_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (fixture_id) DO UPDATE SET
                home_points = EXCLUDED.home_points,
                away_points = EXCLUDED.away_points,
                updated_at = NOW()
        """, fixture_id, data["team_id"], season_id, data["gameweek"],
            data["home_points"], data["away_points"], data["is_home"], data["opponent_id"])

    # 5. Update collection status
    await db.execute("""
        INSERT INTO collection_status
            (id, season_id, latest_gameweek, total_players_processed, last_full_collection, status)
        VALUES ('points_against', $1, $2, $3, $4, 'idle')
        ON CONFLICT (id) DO UPDATE SET
            season_id = EXCLUDED.season_id,
            latest_gameweek = EXCLUDED.latest_gameweek,
            total_players_processed = EXCLUDED.total_players_processed,
            last_full_collection = CASE WHEN $5 = 'full' THEN NOW() ELSE collection_status.last_full_collection END,
            last_incremental_update = CASE WHEN $5 = 'incremental' THEN NOW() ELSE collection_status.last_incremental_update END,
            status = 'idle'
    """, season_id, current_gw, len(player_ids), datetime.utcnow(), mode)

    return {"players_processed": len(player_ids), "fixtures": len(fixture_data), "gameweek": current_gw}
```

---

## Scheduling: GitHub Actions

```yaml
# .github/workflows/points-against-collection.yml

name: Points Against Collection

on:
  schedule:
    # Run at 3 AM UTC daily (after most GWs complete + bonus points added)
    - cron: '0 3 * * *'
  workflow_dispatch:
    inputs:
      mode:
        description: 'Collection mode'
        required: true
        default: 'incremental'
        type: choice
        options:
          - incremental
          - full

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger collection
        run: |
          curl -X POST "${{ secrets.BACKEND_URL }}/admin/points-against/collect" \
            -H "Authorization: Bearer ${{ secrets.ADMIN_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"mode": "${{ inputs.mode || 'incremental' }}", "season_id": "2025-26"}'

      - name: Notify on failure
        if: failure()
        run: |
          echo "Collection failed! Check backend logs."
          # Add Slack/Discord notification here if desired
```

---

## Frontend Component

### Component: `PointsAgainstCard`

Location: `frontend/src/components/PointsAgainstCard.tsx`

```tsx
interface TeamPointsAgainst {
  id: number;
  name: string;
  short_name: string;
  total: number;
  home: number;
  away: number;
  matches_played: number;
  avg_per_match: number;
}

interface PointsAgainstData {
  season_id: string;
  as_of_gameweek: number;
  updated_at: string;
  teams: TeamPointsAgainst[];
}

function PointsAgainstCard() {
  const { data, isLoading } = usePointsAgainst();
  const [sortField, setSortField] = useState<'total' | 'home' | 'away'>('total');

  if (isLoading) return <LoadingState />;

  const sortedTeams = [...(data?.teams ?? [])].sort((a, b) => b[sortField] - a[sortField]);

  return (
    <Card>
      <CardHeader title="FPL Points Against" subtitle={`GW ${data?.as_of_gameweek}`} />
      <table>
        <thead>
          <tr>
            <th>Club</th>
            <th onClick={() => setSortField('total')}>Total</th>
            <th onClick={() => setSortField('home')}>Home</th>
            <th onClick={() => setSortField('away')}>Away</th>
          </tr>
        </thead>
        <tbody>
          {sortedTeams.map((team, index) => (
            <tr key={team.id}>
              <td>
                <TeamBadge team={team} />
                {team.short_name}
              </td>
              <td>{team.total}</td>
              <td>{team.home}</td>
              <td>{team.away}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
```

### Hook: `usePointsAgainst`

Location: `frontend/src/services/queries/usePointsAgainst.ts`

```typescript
export function usePointsAgainst(seasonId?: string) {
  return useQuery({
    queryKey: queryKeys.analytics.pointsAgainst(seasonId),
    queryFn: () => backendApi.getPointsAgainst(seasonId),
    staleTime: CACHE_TIMES.THIRTY_MINUTES,
    gcTime: CACHE_TIMES.ONE_HOUR,
  });
}
```

---

## Local Development Setup

### Quick Start

```bash
# 1. Start local PostgreSQL (one command)
cd backend
docker compose up -d

# 2. Run migrations
python -m scripts.migrate

# 3. Start backend
uvicorn app.main:app --reload

# 4. (Optional) Seed test data
python -m scripts.seed_test_data
```

### Docker Compose for PostgreSQL

Create `backend/docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:17-alpine
    container_name: tapas-fpl-db
    environment:
      POSTGRES_USER: tapas
      POSTGRES_PASSWORD: localdev
      POSTGRES_DB: tapas_fpl
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      # Auto-run migrations on startup (optional)
      - ./migrations:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tapas -d tapas_fpl"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

**Commands:**
```bash
# Start database
docker compose up -d

# View logs
docker compose logs -f postgres

# Stop database (preserves data)
docker compose stop

# Stop and remove data (clean slate)
docker compose down -v

# Connect with psql
docker exec -it tapas-fpl-db psql -U tapas -d tapas_fpl
```

### Environment Variables

Create `backend/.env.local`:

```bash
# Database (local Docker)
DATABASE_URL=postgresql://tapas:localdev@localhost:5432/tapas_fpl

# Alternative: Use Supabase for local dev (same as prod schema)
# DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres

# CORS (allow local frontend)
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Admin API key (for collection endpoints)
ADMIN_API_KEY=local-dev-key

# FPL API (no key needed, public)
FPL_API_BASE=https://fantasy.premierleague.com/api
```

Load in development:
```python
# backend/app/config.py
from dotenv import load_dotenv
load_dotenv(".env.local")  # Falls back to .env if not found
```

### Database Migrations

Migration runner script (`backend/scripts/migrate.py`):

```python
#!/usr/bin/env python
"""Run SQL migrations in order."""
import os
import asyncpg
from pathlib import Path

async def run_migrations():
    db_url = os.getenv("DATABASE_URL", "postgresql://tapas:localdev@localhost:5432/tapas_fpl")
    conn = await asyncpg.connect(db_url)

    migrations_dir = Path(__file__).parent.parent / "migrations"

    # Ensure migrations table exists
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS _migrations (
            name TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    # Get already applied migrations
    applied = set(row['name'] for row in await conn.fetch("SELECT name FROM _migrations"))

    # Run pending migrations in order
    for migration_file in sorted(migrations_dir.glob("*.sql")):
        if migration_file.name not in applied:
            print(f"Applying {migration_file.name}...")
            sql = migration_file.read_text()
            await conn.execute(sql)
            await conn.execute("INSERT INTO _migrations (name) VALUES ($1)", migration_file.name)
            print(f"  ✓ {migration_file.name}")

    await conn.close()
    print("Migrations complete!")

if __name__ == "__main__":
    import asyncio
    asyncio.run(run_migrations())
```

### Test Data Seeding

For development/testing without running full FPL collection:

```python
# backend/scripts/seed_test_data.py
"""Seed database with realistic test data for local development."""

import asyncio
import asyncpg
import os
import random

TEAMS = [
    (1, "Arsenal", "ARS"),
    (2, "Aston Villa", "AVL"),
    (3, "Bournemouth", "BOU"),
    (4, "Brentford", "BRE"),
    (5, "Brighton", "BHA"),
    (6, "Chelsea", "CHE"),
    (7, "Crystal Palace", "CRY"),
    (8, "Everton", "EVE"),
    (9, "Fulham", "FUL"),
    (10, "Ipswich", "IPS"),
    (11, "Leicester", "LEI"),
    (12, "Liverpool", "LIV"),
    (13, "Man City", "MCI"),
    (14, "Man Utd", "MUN"),
    (15, "Newcastle", "NEW"),
    (16, "Nottm Forest", "NFO"),
    (17, "Southampton", "SOU"),
    (18, "Spurs", "TOT"),
    (19, "West Ham", "WHU"),
    (20, "Wolves", "WOL"),
]

async def seed():
    db_url = os.getenv("DATABASE_URL", "postgresql://tapas:localdev@localhost:5432/tapas_fpl")
    conn = await asyncpg.connect(db_url)
    season_id = "2025-26"

    # Get or create season
    season_row = await conn.fetchrow("SELECT id FROM season WHERE code = $1", season_id)
    if not season_row:
        season_row = await conn.fetchrow("""
            INSERT INTO season (code, name, start_date, is_current)
            VALUES ($1, $2, '2025-08-15', true) RETURNING id
        """, season_id, f"Season {season_id}")
    season_db_id = season_row["id"]

    # Seed teams
    for team_id, name, short_name in TEAMS:
        await conn.execute("""
            INSERT INTO team (id, season_id, code, name, short_name)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id, season_id) DO NOTHING
        """, team_id, season_db_id, team_id, name, short_name)

    # Seed points_against_by_fixture (20 GWs of fake data)
    fixture_id = 1
    for gw in range(1, 21):
        # Each GW has 10 fixtures (20 teams, everyone plays once)
        teams_this_gw = list(range(1, 21))
        random.shuffle(teams_this_gw)

        for i in range(0, 20, 2):
            home_team = teams_this_gw[i]
            away_team = teams_this_gw[i + 1]

            # Random points (25-70 per side, weighted by team "strength")
            # Lower team_id = stronger defense (less points against)
            home_pa = random.randint(20, 60) + (home_team * 2)  # Wolves concedes more
            away_pa = random.randint(20, 60) + (away_team * 2)

            # Record from home team perspective
            await conn.execute("""
                INSERT INTO points_against_by_fixture
                    (fixture_id, team_id, season_id, gameweek, home_points, away_points, is_home, opponent_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (fixture_id) DO NOTHING
            """, fixture_id, home_team, season_id, gw, home_pa, 0, True, away_team)

            fixture_id += 1

            # Record from away team perspective
            await conn.execute("""
                INSERT INTO points_against_by_fixture
                    (fixture_id, team_id, season_id, gameweek, home_points, away_points, is_home, opponent_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (fixture_id) DO NOTHING
            """, fixture_id, away_team, season_id, gw, 0, away_pa, False, home_team)

            fixture_id += 1

    # Update collection status
    await conn.execute("""
        INSERT INTO collection_status
            (id, season_id, latest_gameweek, total_players_processed, status)
        VALUES ('points_against', $1, 20, 0, 'seeded')
        ON CONFLICT (id) DO UPDATE SET
            latest_gameweek = 20, status = 'seeded'
    """, season_id)

    await conn.close()
    print("✓ Seeded 20 teams")
    print(f"✓ Seeded {fixture_id - 1} fixture records (20 GWs)")
    print("✓ Ready for local development!")

if __name__ == "__main__":
    asyncio.run(seed())
```

### Running Backend Locally

```bash
cd backend

# 1. Create virtual environment (first time)
python -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Start PostgreSQL
docker compose up -d

# 4. Run migrations
python -m scripts.migrate

# 5. (Optional) Seed test data
python -m scripts.seed_test_data

# 6. Start backend server
uvicorn app.main:app --reload --port 8000

# Backend now available at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Frontend → Local Backend

Update frontend to use local backend:

```bash
# frontend/.env.local
VITE_API_URL=http://localhost:8000
```

Or temporarily in terminal:
```bash
cd frontend
VITE_API_URL=http://localhost:8000 npm run dev
```

### Connecting to Production DB Locally (Read-Only)

For debugging with real data:

```bash
# backend/.env.local
DATABASE_URL=postgresql://postgres.[project]:[password]@aws-0-eu-west-2.pooler.supabase.com:6543/postgres
```

⚠️ **Warning**: Never run write operations against production DB locally.

### VS Code Tasks (Optional)

Add to `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Backend: Start DB",
      "type": "shell",
      "command": "docker compose up -d",
      "options": { "cwd": "${workspaceFolder}/backend" }
    },
    {
      "label": "Backend: Run Migrations",
      "type": "shell",
      "command": "python -m scripts.migrate",
      "options": { "cwd": "${workspaceFolder}/backend" }
    },
    {
      "label": "Backend: Start Server",
      "type": "shell",
      "command": "uvicorn app.main:app --reload",
      "options": { "cwd": "${workspaceFolder}/backend" }
    },
    {
      "label": "Backend: Full Setup",
      "dependsOn": ["Backend: Start DB", "Backend: Run Migrations", "Backend: Start Server"],
      "dependsOrder": "sequence"
    }
  ]
}
```

---

## Implementation Checklist

### Phase 0: Local Development Environment
- [ ] Create `backend/docker-compose.yml` for PostgreSQL
- [ ] Create `backend/.env.local` with local credentials
- [ ] Create `backend/scripts/migrate.py` migration runner
- [ ] Create `backend/scripts/seed_test_data.py` for test data
- [ ] Verify local PostgreSQL starts with `docker compose up -d`
- [ ] Add `asyncpg` and `python-dotenv` to `requirements.txt`

### Phase 1: Database Setup
- [x] Create migration `004_points_against.sql`
- [ ] Test migration locally first
- [ ] Run migration on Supabase (production)
- [ ] Verify tables and indexes created

### Phase 2: Backend API
- [ ] Add Supabase client to backend
- [ ] Implement `PointsAgainstService` class
- [ ] Create collection script with rate limiting
- [ ] Add `/api/v1/points-against` endpoint
- [ ] Add `/api/v1/points-against/{team_id}/history` endpoint
- [ ] Add `/api/v1/health/data-freshness` endpoint
- [ ] Add admin collection trigger endpoint
- [ ] Test locally with sample data

### Phase 3: Data Collection
- [ ] Run initial full collection
- [ ] Verify data accuracy (spot-check against reference)
- [ ] Document collection time and any issues

### Phase 4: Frontend Component ✅
- [x] Create `usePointsAgainst` hook (`frontend/src/services/queries/usePointsAgainst.ts`)
- [x] Create `PointsAgainstCard` component (`frontend/src/components/PointsAgainstCard.tsx`)
- [x] Add sortable columns (total, home, away, avg)
- [x] Add to Analytics view ("Defensive Weakness" section)
- [x] Color-coded rows by defensive strength
- [ ] Add team badges (optional enhancement)

### Phase 5: Automation
- [ ] Set up GitHub Actions workflow
- [ ] Add `BACKEND_URL` and `ADMIN_API_KEY` secrets
- [ ] Test manual workflow dispatch
- [ ] Verify cron runs successfully

### Phase 6: Caching & Monitoring
- [ ] Add Worker cache for points-against endpoint
- [ ] Add data freshness monitoring
- [ ] Set up failure alerts (optional)

### Phase 2.5: Technical Debt (Pre-Frontend Integration) ✅

Code review findings from commit `3be6dbc` to address before Phase 4:

**Must Fix:**
- [x] **Test coverage gaps** - Add happy path tests, service unit tests, FPL client tests
  - `backend/tests/test_points_against_service.py` (new)
  - `backend/tests/test_fpl_client.py` (new) - uses `respx` for HTTP mocking
- [x] **HTTP client inefficiency** - Reuse `httpx.AsyncClient` in `fpl_client.py`
  - Client created lazily, reused across requests, `close()` method added
- [x] **Deprecated FastAPI patterns** - Migrated to `lifespan` context manager in `main.py`

**Low Priority (Nice to Have):**
- [ ] Add `asyncio.Lock` to `init_pool()` for race condition protection
- [ ] Add LRU eviction to `_cache` dict in routes.py
- [ ] Catch specific `asyncpg` errors instead of bare `Exception`
- [ ] Fix empty password in fallback Supabase URL construction

---

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Double Gameweek | Handled by `fixture_id` primary key - each match gets own row |
| Blank Gameweek | No fixture = no row - queries naturally exclude |
| Postponed match | Original fixture_id preserved when rescheduled |
| Bonus points delay | Run collection at 3 AM UTC (6+ hours after matches) |
| FPL API rate limit | Exponential backoff, retry up to 5 times |
| Partial failure | Upsert ensures re-runs are idempotent |
| Season transition | `season_id` parameter isolates data per season |

---

## Future Enhancements

### Now Possible with `player_fixture_stats` Data ✅

The following features are now enabled by the comprehensive player data collection:

1. **Position breakdown**: Points conceded to GKP/DEF/MID/FWD separately
   ```sql
   -- Query player_fixture_stats with player position from bootstrap
   SELECT position, SUM(total_points) as points_conceded
   FROM player_fixture_stats pfs
   JOIN player p ON pfs.player_id = p.id
   WHERE pfs.opponent_team_id = 20  -- vs Wolves
   GROUP BY position;
   ```

2. **xG-based weakness detection**: Teams that concede high xG (not just points)
   ```sql
   SELECT opponent_team_id, SUM(expected_goals) as total_xg_against
   FROM player_fixture_stats
   GROUP BY opponent_team_id
   ORDER BY total_xg_against DESC;
   ```

3. **Form-adjusted recommendations**: Integration with RECOMMENDATIONS.md roadmap
   - Multi-horizon form using `get_player_form()` function
   - Delta tracking (overperformers vs xG)

### Planned Features

4. **Fixture difficulty**: Custom FDR based on PA data
5. **Trend chart**: Points against over time visualization
6. **Captain suggestions**: "Captain against Wolves, they concede 49.5 pts/match"
7. **Transfer targets**: Players with upcoming fixtures vs high-PA teams

### Data Collection Status

| Table | Status | Purpose |
|-------|--------|---------|
| `points_against_by_fixture` | ✅ Live | Team-level PA totals |
| `player_fixture_stats` | ✅ Live | Player-level stats (35+ fields) |
| `player_vs_team_stats` | ✅ View | Player performance vs each opponent |
| `player_season_deltas` | ✅ View | Over/underperformance tracking |
| `get_player_form()` | ✅ Function | Multi-horizon form calculation |
