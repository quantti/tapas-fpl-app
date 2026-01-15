# Enhanced Fixture Difficulty Plan

**Date**: January 15, 2026
**Status**: Planning
**Goal**: Build an accurate fixture difficulty rating using historical data + current season metrics

## Executive Summary

FPL's official fixture difficulty ratings (FDR 1-5) are widely criticized as inaccurate. They don't account for:
- Historical head-to-head performance
- Current season form (xGI/xGC)
- Points Against (how many FPL points teams concede)
- Home/away splits

**Solution**: Create our own Fixture Difficulty Index (FDI) that combines:
1. **Current season data** (xGI, xGC, Points Against, Form) - already in DB
2. **Historical match data** (30+ seasons from football-data.co.uk)
3. **Head-to-head records** - derived from historical data
4. **Fixture congestion** (rest days from ALL competitions) - from API-Football

---

## Data Sources Overview

| Data | Source | Update Frequency |
|------|--------|------------------|
| Historical PL matches | football-data.co.uk (CSV) | One-time import |
| Current season metrics | FPL API (already in DB) | Daily |
| Multi-competition fixtures | API-Football | Daily |

---

## Data Source 1: API-Football (Multi-Competition Fixtures)

**URL**: https://www.api-football.com/

**Purpose**: Get fixture schedules for ALL competitions to calculate rest days

**Why needed**: Teams with 2 days rest are **40% less likely to win** (Kitman Labs study)

### Free Tier Details

| Aspect | Value |
|--------|-------|
| Cost | Free forever |
| Rate limit | 100 requests/day |
| Competitions | All (PL, UCL, UEL, UECL, FA Cup, EFL Cup) |
| Historical data | Limited on free tier |

### Competitions We'll Track

| Competition | API-Football ID | Notes |
|-------------|-----------------|-------|
| Premier League | 39 | Primary league |
| Champions League | 2 | European |
| Europa League | 3 | European |
| Europa Conference League | 848 | European |
| FA Cup | 45 | Domestic cup |
| EFL Cup (Carabao) | 46 | Domestic cup |

### API Endpoints Used

```
GET /fixtures?team={team_id}&season={year}
GET /fixtures?league={league_id}&season={year}
```

### Database Schema: Multi-Competition Fixtures

```sql
-- Migration 015: Multi-Competition Fixture Schedule
-- Description: Store fixtures from all competitions for rest day calculation

CREATE TABLE team_fixture_schedule (
    id SERIAL PRIMARY KEY,

    -- Team identification (FK to team table)
    team_short_name TEXT NOT NULL,           -- FPL short name (ARS, MUN, etc.)
    season_id INTEGER NOT NULL,              -- FK to season table
    api_football_team_id INTEGER,            -- API-Football team ID

    -- Competition
    competition_code TEXT NOT NULL,          -- 'PL', 'UCL', 'UEL', 'UECL', 'FA', 'EFL'
    competition_name TEXT,                   -- Full name for display
    round TEXT,                              -- 'Round of 16', 'Quarter-final', etc.

    -- Match details
    opponent_name TEXT NOT NULL,             -- Could be non-PL team
    kickoff_time TIMESTAMPTZ NOT NULL,
    is_home BOOLEAN NOT NULL,
    venue TEXT,                              -- Stadium name

    -- Result (filled after match completes)
    status TEXT DEFAULT 'scheduled',         -- 'scheduled', 'finished', 'postponed'
    home_goals SMALLINT,
    away_goals SMALLINT,

    -- Metadata
    api_football_fixture_id INTEGER UNIQUE,  -- For deduplication
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Foreign key to team table (validates team exists in current season)
    CONSTRAINT fk_tfs_team_season
        FOREIGN KEY (team_short_name, season_id)
        REFERENCES team(short_name, season_id)
        ON DELETE CASCADE,

    -- Prevent duplicates
    UNIQUE (team_short_name, season_id, kickoff_time, competition_code)
);

-- Primary index: Find team's last match before a date
CREATE INDEX idx_tfs_team_kickoff
    ON team_fixture_schedule(team_short_name, season_id, kickoff_time DESC);

-- Secondary: Filter by competition
CREATE INDEX idx_tfs_competition
    ON team_fixture_schedule(competition_code, season_id, kickoff_time);

-- Find upcoming fixtures
CREATE INDEX idx_tfs_upcoming
    ON team_fixture_schedule(kickoff_time)
    WHERE status = 'scheduled';

-- Composite index for rest days query (team + status + kickoff)
CREATE INDEX idx_tfs_team_status_kickoff
    ON team_fixture_schedule(team_short_name, status, kickoff_time DESC)
    WHERE status IN ('scheduled', 'finished');

-- RLS
ALTER TABLE team_fixture_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON team_fixture_schedule FOR SELECT USING (true);

-- Sync status tracking (for resume capability)
CREATE TABLE fixture_schedule_sync_status (
    team_short_name TEXT NOT NULL,
    season_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'syncing', 'completed', 'failed'
    fixtures_synced INTEGER DEFAULT 0,
    error_message TEXT,
    last_sync_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (team_short_name, season_id),
    CONSTRAINT fk_sync_status_team
        FOREIGN KEY (team_short_name, season_id)
        REFERENCES team(short_name, season_id)
        ON DELETE CASCADE
);

ALTER TABLE fixture_schedule_sync_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON fixture_schedule_sync_status FOR SELECT USING (true);

COMMENT ON TABLE team_fixture_schedule IS 'All fixtures for PL teams across all competitions. Used for rest day calculations.';
COMMENT ON TABLE fixture_schedule_sync_status IS 'Tracks sync progress per team for resume capability.';
```

### API-Football Team ID Mapping

Add to `team` table (or create separate mapping):

```sql
-- Add API-Football ID to team table
ALTER TABLE team
    ADD COLUMN IF NOT EXISTS api_football_team_id INTEGER;

-- Known mappings (2025/26 season) - only current PL teams
-- These are updated during import by matching team short_name
UPDATE team SET api_football_team_id = 42 WHERE short_name = 'ARS' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 66 WHERE short_name = 'AVL' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 35 WHERE short_name = 'BOU' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 402 WHERE short_name = 'BRE' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 51 WHERE short_name = 'BHA' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 49 WHERE short_name = 'CHE' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 52 WHERE short_name = 'CRY' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 45 WHERE short_name = 'EVE' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 36 WHERE short_name = 'FUL' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 57 WHERE short_name = 'IPS' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 46 WHERE short_name = 'LEI' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 40 WHERE short_name = 'LIV' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 50 WHERE short_name = 'MCI' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 33 WHERE short_name = 'MUN' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 34 WHERE short_name = 'NEW' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 65 WHERE short_name = 'NFO' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 41 WHERE short_name = 'SOU' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 47 WHERE short_name = 'TOT' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 48 WHERE short_name = 'WHU' AND season_id = (SELECT id FROM season WHERE is_current = true);
UPDATE team SET api_football_team_id = 39 WHERE short_name = 'WOL' AND season_id = (SELECT id FROM season WHERE is_current = true);
```

### Sync Script: `scripts/sync_fixture_schedule.py`

```python
"""
Sync fixture schedules from API-Football for all PL teams.

ONLY syncs teams that exist in the team table for current season.

Usage:
    python -m scripts.sync_fixture_schedule [--full] [--team ARS] [--resume]

Options:
    --full      Sync all fixtures (not just upcoming)
    --team      Sync specific team only (for debugging)
    --resume    Resume from last failed team (default: true)

Runs daily via scheduled job at 04:00 UTC.
"""

import asyncio
import os
from datetime import datetime
from typing import Optional

import httpx

from app.db import get_connection

API_FOOTBALL_KEY = os.environ.get("API_FOOTBALL_KEY")
API_FOOTBALL_BASE = "https://v3.football.api-sports.io"

COMPETITIONS = {
    39: "PL",      # Premier League
    2: "UCL",      # Champions League
    3: "UEL",      # Europa League
    848: "UECL",   # Europa Conference League
    45: "FA",      # FA Cup
    46: "EFL",     # EFL Cup
}


async def get_current_season_teams(conn) -> list[dict]:
    """
    Get ONLY teams that exist in team table for current season.
    This ensures we only sync PL teams, not relegated teams.
    """
    return await conn.fetch("""
        SELECT t.short_name, t.api_football_team_id, s.id as season_id
        FROM team t
        JOIN season s ON t.season_id = s.id
        WHERE s.is_current = true
          AND t.api_football_team_id IS NOT NULL
        ORDER BY t.short_name
    """)


async def get_resume_point(conn, season_id: int) -> Optional[str]:
    """
    Find first team with pending/failed status to resume from.
    """
    return await conn.fetchval("""
        SELECT team_short_name
        FROM fixture_schedule_sync_status
        WHERE season_id = $1
          AND status IN ('pending', 'failed')
        ORDER BY team_short_name
        LIMIT 1
    """, season_id)


async def update_sync_status(
    conn,
    team_short_name: str,
    season_id: int,
    status: str,
    fixtures_synced: int = 0,
    error_message: Optional[str] = None
):
    """Update sync status for a team."""
    await conn.execute("""
        INSERT INTO fixture_schedule_sync_status
            (team_short_name, season_id, status, fixtures_synced, error_message, last_sync_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (team_short_name, season_id) DO UPDATE SET
            status = EXCLUDED.status,
            fixtures_synced = EXCLUDED.fixtures_synced,
            error_message = EXCLUDED.error_message,
            last_sync_at = NOW(),
            updated_at = NOW()
    """, team_short_name, season_id, status, fixtures_synced, error_message)


async def fetch_team_fixtures(
    client: httpx.AsyncClient,
    team_id: int,
    season: int = 2025
) -> list[dict]:
    """Fetch all fixtures for a team from API-Football."""
    headers = {"x-apisports-key": API_FOOTBALL_KEY}

    response = await client.get(
        f"{API_FOOTBALL_BASE}/fixtures",
        headers=headers,
        params={"team": team_id, "season": season}
    )
    response.raise_for_status()

    data = response.json()
    return data.get("response", [])


def parse_fixture(fixture: dict, team_short_name: str, season_id: int, api_team_id: int) -> Optional[dict]:
    """Parse API-Football fixture into our schema."""
    league_id = fixture["league"]["id"]

    # Skip competitions we don't track
    if league_id not in COMPETITIONS:
        return None

    home_team = fixture["teams"]["home"]
    away_team = fixture["teams"]["away"]
    is_home = home_team["id"] == api_team_id

    return {
        "team_short_name": team_short_name,
        "season_id": season_id,
        "api_football_team_id": api_team_id,
        "competition_code": COMPETITIONS[league_id],
        "competition_name": fixture["league"]["name"],
        "round": fixture["league"].get("round"),
        "opponent_name": away_team["name"] if is_home else home_team["name"],
        "kickoff_time": fixture["fixture"]["date"],
        "is_home": is_home,
        "venue": fixture["fixture"]["venue"]["name"] if fixture["fixture"].get("venue") else None,
        "status": map_status(fixture["fixture"]["status"]["short"]),
        "home_goals": fixture["goals"]["home"],
        "away_goals": fixture["goals"]["away"],
        "api_football_fixture_id": fixture["fixture"]["id"],
    }


def map_status(api_status: str) -> str:
    """Map API-Football status to our status."""
    if api_status in ("FT", "AET", "PEN"):
        return "finished"
    elif api_status in ("PST", "CANC", "ABD"):
        return "postponed"
    else:
        return "scheduled"


async def upsert_fixture(conn, fixture: dict):
    """Insert or update fixture."""
    await conn.execute("""
        INSERT INTO team_fixture_schedule (
            team_short_name, season_id, api_football_team_id, competition_code,
            competition_name, round, opponent_name, kickoff_time,
            is_home, venue, status, home_goals,
            away_goals, api_football_fixture_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (api_football_fixture_id) DO UPDATE SET
            kickoff_time = EXCLUDED.kickoff_time,
            status = EXCLUDED.status,
            home_goals = EXCLUDED.home_goals,
            away_goals = EXCLUDED.away_goals,
            updated_at = NOW()
    """,
        fixture["team_short_name"],
        fixture["season_id"],
        fixture["api_football_team_id"],
        fixture["competition_code"],
        fixture["competition_name"],
        fixture["round"],
        fixture["opponent_name"],
        fixture["kickoff_time"],
        fixture["is_home"],
        fixture["venue"],
        fixture["status"],
        fixture["home_goals"],
        fixture["away_goals"],
        fixture["api_football_fixture_id"],
    )


async def sync_all_teams(resume_from_last_failed: bool = True):
    """
    Sync fixtures for all current PL teams.

    Features:
    - Only syncs teams in team table (current PL teams only)
    - Resume capability from last failed team
    - Atomic commits per team
    - Continues on failure (doesn't abort entire job)
    """
    async with get_connection() as conn:
        # Get current season teams ONLY
        teams = await get_current_season_teams(conn)
        if not teams:
            print("No teams found with api_football_team_id for current season")
            return

        season_id = teams[0]["season_id"]
        print(f"Syncing {len(teams)} PL teams for season_id={season_id}")

        # Check for resume point
        start_from = None
        if resume_from_last_failed:
            start_from = await get_resume_point(conn, season_id)
            if start_from:
                print(f"Resuming from: {start_from}")

        # Filter teams if resuming
        if start_from:
            teams = [t for t in teams if t["short_name"] >= start_from]

        async with httpx.AsyncClient(timeout=30.0) as client:
            for team in teams:
                team_name = team["short_name"]
                api_team_id = team["api_football_team_id"]

                try:
                    # Mark as syncing
                    await update_sync_status(conn, team_name, season_id, "syncing")

                    # Fetch fixtures
                    fixtures = await fetch_team_fixtures(client, api_team_id)
                    print(f"  {team_name}: fetched {len(fixtures)} fixtures")

                    # Atomic transaction per team
                    async with conn.transaction():
                        synced_count = 0
                        for f in fixtures:
                            parsed = parse_fixture(f, team_name, season_id, api_team_id)
                            if parsed:
                                await upsert_fixture(conn, parsed)
                                synced_count += 1

                    # Mark completed
                    await update_sync_status(conn, team_name, season_id, "completed", synced_count)
                    print(f"  {team_name}: synced {synced_count} fixtures")

                except Exception as e:
                    # Mark failed but continue to next team
                    await update_sync_status(conn, team_name, season_id, "failed", 0, str(e))
                    print(f"  {team_name}: FAILED - {e}")
                    continue

                # Rate limiting: max 100 req/day, 20 teams = 5 days buffer
                await asyncio.sleep(1)


async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="Sync all fixtures")
    parser.add_argument("--team", type=str, help="Sync specific team only")
    parser.add_argument("--resume", action="store_true", default=True, help="Resume from last failed")
    args = parser.parse_args()

    if args.team:
        # Single team sync (for debugging)
        print(f"Syncing single team: {args.team}")
        # ... implementation
    else:
        await sync_all_teams(resume_from_last_failed=args.resume)


if __name__ == "__main__":
    asyncio.run(main())
```

### Rest Days Calculation

```python
async def get_rest_days(
    conn,
    team_short_name: str,
    season_id: int,
    before_date: datetime
) -> int:
    """
    Get days since team's last match across ALL competitions.

    Returns:
        Number of days since last match (capped at 14)
    """
    result = await conn.fetchval("""
        SELECT kickoff_time
        FROM team_fixture_schedule
        WHERE team_short_name = $1
          AND season_id = $2
          AND kickoff_time < $3
          AND status = 'finished'
        ORDER BY kickoff_time DESC
        LIMIT 1
    """, team_short_name, season_id, before_date)

    if not result:
        return 7  # Default: assume well rested

    days = (before_date.date() - result.date()).days
    return min(days, 14)  # Cap at 14 days


def rest_days_to_factor(days: int) -> float:
    """
    Convert rest days to difficulty factor (0-1).

    Lower rest = more fatigued opponent = EASIER fixture for us.

    Returns:
        0.0 = opponent well rested (harder for us)
        1.0 = opponent fatigued (easier for us)
    """
    if days <= 2:
        return 0.9   # Very fatigued - 40% less likely to win
    elif days == 3:
        return 0.7   # Fatigued
    elif days == 4:
        return 0.5   # Moderate
    elif days <= 6:
        return 0.3   # Normal rest
    elif days <= 10:
        return 0.1   # Well rested
    else:
        return 0.0   # Very well rested (e.g., winter break)
```

### Daily Sync Schedule

Add to `scripts/scheduled_update.py`:

```python
# Add to daily scheduled job
async def run_daily_updates():
    # ... existing updates ...

    # Sync fixture schedules (API-Football)
    await sync_fixture_schedule()
```

**Cron**: Run at 04:00 UTC (before main FPL updates at 06:00)

---

## Data Source 2: football-data.co.uk (Historical PL Matches)

**URL**: https://www.football-data.co.uk/englandm.php

**Coverage**: 1993/94 season to present (30+ seasons)

**Format**: CSV files, one per season

**File naming**: `E0.csv` (Premier League = E0)

**URL pattern**: `https://www.football-data.co.uk/mmz4281/{season}/E0.csv`
- Where `{season}` is like `2324` for 2023/24, `9394` for 1993/94

### CSV Columns We'll Use

| Column | Description | Notes |
|--------|-------------|-------|
| `Date` | Match date | dd/mm/yy format |
| `HomeTeam` | Home team name | Need to map to FPL team IDs |
| `AwayTeam` | Away team name | Need to map to FPL team IDs |
| `FTHG` | Full Time Home Goals | |
| `FTAG` | Full Time Away Goals | |
| `FTR` | Full Time Result | H=Home Win, D=Draw, A=Away Win |
| `HTHG` | Half Time Home Goals | Optional - could use for comebacks |
| `HTAG` | Half Time Away Goals | Optional |
| `HS` | Home Shots | Available from ~2000s |
| `AS` | Away Shots | |
| `HST` | Home Shots on Target | |
| `AST` | Away Shots on Target | |

### Team Name Mapping Strategy

**CRITICAL**: Only store matches where BOTH teams are current PL teams (2025/26 season).

```
football-data.co.uk    →    FPL API (team.short_name)
----------------------------------------------------------
"Man United"           →    "MUN"   ✓ In current PL
"Man City"             →    "MCI"   ✓ In current PL
"Leeds"                →    "LEE"   ✗ NOT in current PL - SKIP
"Sheffield United"     →    "SHU"   ✗ NOT in current PL - SKIP
```

**Import rule**: If a team in a historical match is NOT in the current PL season's `team` table, skip that match entirely. We only care about H2H between current PL teams.

---

## Database Schema

### Migration 014: Historical Match Data

```sql
-- Migration 014: Historical Match Data
-- Description: Store historical Premier League match results for fixture difficulty calculation
-- IMPORTANT: Only stores matches between teams that exist in current season's team table

-- ============================================================================
-- TEAM NAME MAPPING (historical names → FPL short_name)
-- ============================================================================

-- Maps historical team names (from football-data.co.uk) to FPL team short_name
-- Only needs entries for teams currently in the PL
CREATE TABLE historical_team_mapping (
    historical_name TEXT NOT NULL,           -- Name from football-data.co.uk
    fpl_short_name TEXT NOT NULL,            -- FPL team short_name (e.g., "ARS", "MUN")
    notes TEXT,                              -- Why this mapping exists
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (historical_name)
);

-- Pre-populate known mappings for CURRENT PL teams only (2025/26)
INSERT INTO historical_team_mapping (historical_name, fpl_short_name, notes) VALUES
    -- Current Premier League teams (2025/26)
    ('Arsenal', 'ARS', 'Standard'),
    ('Aston Villa', 'AVL', 'Standard'),
    ('Bournemouth', 'BOU', 'Standard'),
    ('Brentford', 'BRE', 'Standard'),
    ('Brighton', 'BHA', 'Standard'),
    ('Chelsea', 'CHE', 'Standard'),
    ('Crystal Palace', 'CRY', 'Standard'),
    ('Everton', 'EVE', 'Standard'),
    ('Fulham', 'FUL', 'Standard'),
    ('Ipswich', 'IPS', 'Standard'),
    ('Leicester', 'LEI', 'Standard'),
    ('Liverpool', 'LIV', 'Standard'),
    ('Man City', 'MCI', 'Standard'),
    ('Man United', 'MUN', 'Standard'),
    ('Newcastle', 'NEW', 'Standard'),
    ('Nott''m Forest', 'NFO', 'Standard'),
    ('Southampton', 'SOU', 'Standard'),
    ('Spurs', 'TOT', 'Standard'),
    ('West Ham', 'WHU', 'Standard'),
    ('Wolves', 'WOL', 'Standard'),
    -- Historical variations for current teams
    ('Tottenham', 'TOT', 'Old name')
ON CONFLICT (historical_name) DO NOTHING;

-- ============================================================================
-- HISTORICAL MATCHES
-- ============================================================================

-- One row per match - ONLY matches between current PL teams
CREATE TABLE historical_match (
    id SERIAL PRIMARY KEY,

    -- Match identification
    match_date DATE NOT NULL,
    season_id INTEGER NOT NULL,              -- FK to season table
    season_code TEXT NOT NULL,               -- e.g., '2324' for lookup convenience

    -- Teams (using FPL short_name, validated against team table)
    home_team TEXT NOT NULL,                 -- FPL short_name
    away_team TEXT NOT NULL,                 -- FPL short_name

    -- Result
    home_goals SMALLINT NOT NULL,
    away_goals SMALLINT NOT NULL,
    result CHAR(1) NOT NULL,                 -- 'H', 'D', 'A'

    -- Optional stats (available from ~2000s onwards)
    home_shots SMALLINT,
    away_shots SMALLINT,
    home_shots_on_target SMALLINT,
    away_shots_on_target SMALLINT,

    -- Half-time (optional)
    ht_home_goals SMALLINT,
    ht_away_goals SMALLINT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Foreign key to season table
    CONSTRAINT fk_hm_season
        FOREIGN KEY (season_id)
        REFERENCES season(id),

    -- Prevent duplicates
    UNIQUE (match_date, home_team, away_team)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- H2H lookups (most common query pattern)
CREATE INDEX idx_hm_h2h ON historical_match(home_team, away_team);
CREATE INDEX idx_hm_h2h_reverse ON historical_match(away_team, home_team);

-- H2H with season ordering (for recency-weighted queries)
CREATE INDEX idx_hm_h2h_with_season
    ON historical_match(home_team, away_team, season_code DESC);
CREATE INDEX idx_hm_h2h_reverse_with_season
    ON historical_match(away_team, home_team, season_code DESC);

-- Team season queries
CREATE INDEX idx_hm_home_season ON historical_match(home_team, season_id);
CREATE INDEX idx_hm_away_season ON historical_match(away_team, season_id);

-- Date range queries (for recency weighting)
CREATE INDEX idx_hm_date ON historical_match(match_date DESC);
CREATE INDEX idx_hm_date_home_team
    ON historical_match(match_date DESC, home_team);

-- ============================================================================
-- AGGREGATED VIEWS
-- ============================================================================

-- Head-to-head record between any two teams
CREATE VIEW head_to_head_record AS
SELECT
    team_a,
    team_b,
    COUNT(*) AS total_matches,
    SUM(CASE WHEN winner = team_a THEN 1 ELSE 0 END) AS team_a_wins,
    SUM(CASE WHEN winner = team_b THEN 1 ELSE 0 END) AS team_b_wins,
    SUM(CASE WHEN winner IS NULL THEN 1 ELSE 0 END) AS draws,
    SUM(team_a_goals) AS team_a_goals_for,
    SUM(team_b_goals) AS team_b_goals_for,
    ROUND(SUM(team_a_goals)::NUMERIC / NULLIF(COUNT(*), 0), 2) AS team_a_goals_avg,
    ROUND(SUM(team_b_goals)::NUMERIC / NULLIF(COUNT(*), 0), 2) AS team_b_goals_avg,
    MIN(match_date) AS first_meeting,
    MAX(match_date) AS last_meeting
FROM (
    -- When team_a is home
    SELECT
        home_team AS team_a,
        away_team AS team_b,
        home_goals AS team_a_goals,
        away_goals AS team_b_goals,
        CASE
            WHEN result = 'H' THEN home_team
            WHEN result = 'A' THEN away_team
            ELSE NULL
        END AS winner,
        match_date
    FROM historical_match

    UNION ALL

    -- When team_a is away
    SELECT
        away_team AS team_a,
        home_team AS team_b,
        away_goals AS team_a_goals,
        home_goals AS team_b_goals,
        CASE
            WHEN result = 'A' THEN away_team
            WHEN result = 'H' THEN home_team
            ELSE NULL
        END AS winner,
        match_date
    FROM historical_match
) matches
WHERE team_a < team_b  -- Ensure consistent ordering (alphabetical)
GROUP BY team_a, team_b;

-- Team historical home/away record
CREATE VIEW team_historical_record AS
SELECT
    team,
    venue,
    COUNT(*) AS matches,
    SUM(wins) AS wins,
    SUM(draws) AS draws,
    SUM(losses) AS losses,
    SUM(goals_for) AS goals_for,
    SUM(goals_against) AS goals_against,
    ROUND(SUM(wins)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) AS win_pct,
    ROUND((SUM(wins) * 3 + SUM(draws))::NUMERIC / NULLIF(COUNT(*) * 3, 0) * 100, 1) AS points_pct
FROM (
    -- Home matches
    SELECT
        home_team AS team,
        'home' AS venue,
        CASE WHEN result = 'H' THEN 1 ELSE 0 END AS wins,
        CASE WHEN result = 'D' THEN 1 ELSE 0 END AS draws,
        CASE WHEN result = 'A' THEN 1 ELSE 0 END AS losses,
        home_goals AS goals_for,
        away_goals AS goals_against
    FROM historical_match

    UNION ALL

    -- Away matches
    SELECT
        away_team AS team,
        'away' AS venue,
        CASE WHEN result = 'A' THEN 1 ELSE 0 END AS wins,
        CASE WHEN result = 'D' THEN 1 ELSE 0 END AS draws,
        CASE WHEN result = 'H' THEN 1 ELSE 0 END AS losses,
        away_goals AS goals_for,
        home_goals AS goals_against
    FROM historical_match
) matches
GROUP BY team, venue;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Recent form (last N seasons) - parameterized
CREATE OR REPLACE FUNCTION get_team_recent_record(
    p_team TEXT,
    p_seasons INTEGER DEFAULT 5
)
RETURNS TABLE (
    matches INTEGER,
    wins INTEGER,
    draws INTEGER,
    losses INTEGER,
    goals_for BIGINT,
    goals_against BIGINT,
    win_pct NUMERIC,
    points_pct NUMERIC
) AS $$
    WITH recent_seasons AS (
        SELECT DISTINCT season_id
        FROM historical_match
        ORDER BY season_id DESC
        LIMIT p_seasons
    )
    SELECT
        COUNT(*)::INTEGER AS matches,
        SUM(CASE WHEN
            (home_team = p_team AND result = 'H') OR
            (away_team = p_team AND result = 'A')
        THEN 1 ELSE 0 END)::INTEGER AS wins,
        SUM(CASE WHEN result = 'D' THEN 1 ELSE 0 END)::INTEGER AS draws,
        SUM(CASE WHEN
            (home_team = p_team AND result = 'A') OR
            (away_team = p_team AND result = 'H')
        THEN 1 ELSE 0 END)::INTEGER AS losses,
        SUM(CASE WHEN home_team = p_team THEN home_goals ELSE away_goals END) AS goals_for,
        SUM(CASE WHEN home_team = p_team THEN away_goals ELSE home_goals END) AS goals_against,
        ROUND(
            SUM(CASE WHEN
                (home_team = p_team AND result = 'H') OR
                (away_team = p_team AND result = 'A')
            THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1
        ) AS win_pct,
        ROUND(
            (SUM(CASE WHEN
                (home_team = p_team AND result = 'H') OR
                (away_team = p_team AND result = 'A')
            THEN 1 ELSE 0 END) * 3 +
            SUM(CASE WHEN result = 'D' THEN 1 ELSE 0 END))::NUMERIC /
            NULLIF(COUNT(*) * 3, 0) * 100, 1
        ) AS points_pct
    FROM historical_match
    WHERE (home_team = p_team OR away_team = p_team)
      AND season_id IN (SELECT season_id FROM recent_seasons);
$$ LANGUAGE SQL;

-- H2H lookup function with recency weighting
CREATE OR REPLACE FUNCTION get_h2h_record(
    p_team_a TEXT,
    p_team_b TEXT,
    p_last_n_meetings INTEGER DEFAULT 10
)
RETURNS TABLE (
    total_meetings INTEGER,
    team_a_wins INTEGER,
    team_b_wins INTEGER,
    draws INTEGER,
    team_a_goals BIGINT,
    team_b_goals BIGINT,
    team_a_win_pct NUMERIC,
    last_meeting DATE,
    last_winner TEXT
) AS $$
    WITH h2h_matches AS (
        SELECT
            match_date,
            season_code,
            CASE
                WHEN home_team = p_team_a THEN home_goals
                ELSE away_goals
            END AS team_a_goals,
            CASE
                WHEN home_team = p_team_b THEN home_goals
                ELSE away_goals
            END AS team_b_goals,
            CASE
                WHEN (home_team = p_team_a AND result = 'H') OR (away_team = p_team_a AND result = 'A') THEN 'A'
                WHEN (home_team = p_team_b AND result = 'H') OR (away_team = p_team_b AND result = 'A') THEN 'B'
                ELSE 'D'
            END AS winner
        FROM historical_match
        WHERE (home_team = p_team_a AND away_team = p_team_b)
           OR (home_team = p_team_b AND away_team = p_team_a)
        ORDER BY match_date DESC
        LIMIT p_last_n_meetings
    )
    SELECT
        COUNT(*)::INTEGER AS total_meetings,
        SUM(CASE WHEN winner = 'A' THEN 1 ELSE 0 END)::INTEGER AS team_a_wins,
        SUM(CASE WHEN winner = 'B' THEN 1 ELSE 0 END)::INTEGER AS team_b_wins,
        SUM(CASE WHEN winner = 'D' THEN 1 ELSE 0 END)::INTEGER AS draws,
        SUM(team_a_goals) AS team_a_goals,
        SUM(team_b_goals) AS team_b_goals,
        ROUND(
            SUM(CASE WHEN winner = 'A' THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1
        ) AS team_a_win_pct,
        MAX(match_date) AS last_meeting,
        (SELECT
            CASE winner
                WHEN 'A' THEN p_team_a
                WHEN 'B' THEN p_team_b
                ELSE 'Draw'
            END
         FROM h2h_matches ORDER BY match_date DESC LIMIT 1
        ) AS last_winner
    FROM h2h_matches;
$$ LANGUAGE SQL;

-- ============================================================================
-- IMPORT STATUS TRACKING
-- ============================================================================

CREATE TABLE historical_data_import_status (
    id TEXT PRIMARY KEY DEFAULT 'historical_matches',
    latest_season_imported TEXT,             -- e.g., '2526'
    total_matches_imported INTEGER DEFAULT 0,
    total_seasons_imported INTEGER DEFAULT 0,
    matches_skipped INTEGER DEFAULT 0,       -- Matches skipped (non-PL teams)
    last_import_at TIMESTAMPTZ,
    status TEXT DEFAULT 'idle',              -- 'idle', 'running', 'error'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Enable RLS
ALTER TABLE historical_team_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_match ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_data_import_status ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Allow public read" ON historical_team_mapping FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON historical_match FOR SELECT USING (true);
CREATE POLICY "Allow public read" ON historical_data_import_status FOR SELECT USING (true);

-- Comments
COMMENT ON TABLE historical_match IS 'Historical PL match results. Only stores matches between current PL teams.';
COMMENT ON TABLE historical_team_mapping IS 'Maps historical team names to FPL short_name for current PL teams only';
COMMENT ON FUNCTION get_h2h_record IS 'Get head-to-head record between two teams (last N meetings)';
COMMENT ON FUNCTION get_team_recent_record IS 'Get team record over last N seasons';
```

---

## Backend Service Design

### Directory Structure

```
backend/
├── app/
│   ├── services/
│   │   ├── fixture_difficulty_service.py   # NEW - FDI service (impure, I/O)
│   │   ├── fixture_difficulty_calc.py      # NEW - FDI calculation (pure)
│   │   └── ...
│   └── api/
│       └── routes.py                        # Add FDI endpoints
├── scripts/
│   ├── import_historical_data.py            # NEW - CSV import script
│   └── sync_fixture_schedule.py             # NEW - API-Football sync
```

### Import Script: `scripts/import_historical_data.py`

```python
"""
Import historical Premier League match data from football-data.co.uk

IMPORTANT: Only imports matches where BOTH teams exist in the current
season's team table. This ensures we only store data for teams that
are relevant for fixture difficulty calculations.

Usage:
    python -m scripts.import_historical_data [--seasons 10] [--all]

Options:
    --seasons N     Import last N seasons (default: 10)
    --all           Import all available seasons (1993/94 onwards)
    --dry-run       Show what would be imported without inserting
"""

import asyncio
import csv
import io
from datetime import datetime
from typing import Optional, Set

import httpx

from app.db import get_connection


def get_season_codes(num_seasons: int, start_from: str = "2526") -> list[str]:
    """Generate season codes going backwards from start_from."""
    codes = []
    year1 = int(start_from[:2])
    year2 = int(start_from[2:])

    for _ in range(num_seasons):
        codes.append(f"{year1:02d}{year2:02d}")
        year1 -= 1
        year2 -= 1
        if year1 < 0:
            year1 = 99
        if year2 < 0:
            year2 = 99

    return codes


def get_csv_url(season_code: str) -> str:
    """Get football-data.co.uk URL for a season."""
    return f"https://www.football-data.co.uk/mmz4281/{season_code}/E0.csv"


async def get_current_pl_teams(conn) -> Set[str]:
    """
    Get set of FPL short_names for teams in current PL season.
    This is used to filter which matches to import.
    """
    rows = await conn.fetch("""
        SELECT t.short_name
        FROM team t
        JOIN season s ON t.season_id = s.id
        WHERE s.is_current = true
    """)
    return {row["short_name"] for row in rows}


async def get_team_name_mappings(conn) -> dict[str, str]:
    """Get historical_name → fpl_short_name mappings."""
    rows = await conn.fetch("""
        SELECT historical_name, fpl_short_name
        FROM historical_team_mapping
    """)
    return {row["historical_name"]: row["fpl_short_name"] for row in rows}


async def get_current_season_id(conn) -> int:
    """Get current season ID."""
    return await conn.fetchval("""
        SELECT id FROM season WHERE is_current = true
    """)


async def fetch_season_data(client: httpx.AsyncClient, season_code: str) -> list[dict]:
    """Fetch and parse CSV data for a season."""
    url = get_csv_url(season_code)
    response = await client.get(url)

    if response.status_code == 404:
        return []  # Season not available

    response.raise_for_status()

    # Parse CSV
    content = response.text
    reader = csv.DictReader(io.StringIO(content))

    matches = []
    for row in reader:
        # Skip incomplete rows
        if not row.get("HomeTeam") or not row.get("AwayTeam"):
            continue
        if not row.get("FTHG") or not row.get("FTAG"):
            continue

        match = {
            "date": parse_date(row.get("Date", "")),
            "home_team_raw": row["HomeTeam"],
            "away_team_raw": row["AwayTeam"],
            "home_goals": int(row["FTHG"]),
            "away_goals": int(row["FTAG"]),
            "result": row.get("FTR", calculate_result(row["FTHG"], row["FTAG"])),
            "home_shots": safe_int(row.get("HS")),
            "away_shots": safe_int(row.get("AS")),
            "home_shots_on_target": safe_int(row.get("HST")),
            "away_shots_on_target": safe_int(row.get("AST")),
            "ht_home_goals": safe_int(row.get("HTHG")),
            "ht_away_goals": safe_int(row.get("HTAG")),
            "season_code": season_code,
        }
        matches.append(match)

    return matches


def parse_date(date_str: str) -> Optional[datetime]:
    """Parse date from dd/mm/yy or dd/mm/yyyy format."""
    for fmt in ["%d/%m/%y", "%d/%m/%Y"]:
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    return None


def safe_int(value: str) -> Optional[int]:
    """Convert to int or return None."""
    try:
        return int(value) if value else None
    except ValueError:
        return None


def calculate_result(home_goals: str, away_goals: str) -> str:
    """Calculate result if FTR is missing."""
    h, a = int(home_goals), int(away_goals)
    if h > a:
        return "H"
    elif a > h:
        return "A"
    return "D"


async def import_season(
    conn,
    client: httpx.AsyncClient,
    season_code: str,
    current_season_id: int,
    current_pl_teams: Set[str],
    team_mappings: dict[str, str],
    dry_run: bool = False
) -> tuple[int, int]:
    """
    Import a single season's matches.

    Returns: (imported_count, skipped_count)
    """
    matches = await fetch_season_data(client, season_code)
    if not matches:
        print(f"  {season_code}: No data available")
        return 0, 0

    imported = 0
    skipped = 0

    for match in matches:
        # Map team names to FPL short_name
        home_fpl = team_mappings.get(match["home_team_raw"])
        away_fpl = team_mappings.get(match["away_team_raw"])

        # CRITICAL: Skip if either team is not in current PL
        if home_fpl not in current_pl_teams or away_fpl not in current_pl_teams:
            skipped += 1
            continue

        if dry_run:
            imported += 1
            continue

        try:
            await conn.execute("""
                INSERT INTO historical_match (
                    match_date, season_id, season_code, home_team, away_team,
                    home_goals, away_goals, result,
                    home_shots, away_shots,
                    home_shots_on_target, away_shots_on_target,
                    ht_home_goals, ht_away_goals
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                ON CONFLICT (match_date, home_team, away_team) DO NOTHING
            """,
                match["date"], current_season_id, season_code, home_fpl, away_fpl,
                match["home_goals"], match["away_goals"], match["result"],
                match["home_shots"], match["away_shots"],
                match["home_shots_on_target"], match["away_shots_on_target"],
                match["ht_home_goals"], match["ht_away_goals"]
            )
            imported += 1
        except Exception as e:
            print(f"    Error inserting match: {e}")
            skipped += 1

    return imported, skipped


async def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--seasons", type=int, default=10)
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    # Determine seasons to import
    num_seasons = 32 if args.all else args.seasons  # 32 = 1993/94 to 2025/26
    season_codes = get_season_codes(num_seasons)

    print(f"Importing {len(season_codes)} seasons: {season_codes[0]} to {season_codes[-1]}")
    if args.dry_run:
        print("DRY RUN - no data will be inserted")

    async with get_connection() as conn:
        # Get current PL teams (to filter matches)
        current_pl_teams = await get_current_pl_teams(conn)
        print(f"Current PL teams ({len(current_pl_teams)}): {sorted(current_pl_teams)}")

        # Get team name mappings
        team_mappings = await get_team_name_mappings(conn)
        print(f"Team mappings loaded: {len(team_mappings)} entries")

        # Get current season ID
        current_season_id = await get_current_season_id(conn)
        print(f"Current season ID: {current_season_id}")

        total_imported = 0
        total_skipped = 0

        async with httpx.AsyncClient(timeout=30.0) as client:
            for season_code in season_codes:
                imported, skipped = await import_season(
                    conn, client, season_code,
                    current_season_id, current_pl_teams, team_mappings,
                    dry_run=args.dry_run
                )
                total_imported += imported
                total_skipped += skipped
                print(f"  {season_code}: imported {imported}, skipped {skipped} (non-PL teams)")

                await asyncio.sleep(0.5)  # Be nice to the server

        print(f"\nTotal: {total_imported} matches imported, {total_skipped} skipped")

        # Update import status
        if not args.dry_run:
            await conn.execute("""
                INSERT INTO historical_data_import_status (
                    id, latest_season_imported, total_matches_imported,
                    total_seasons_imported, matches_skipped, last_import_at, status
                ) VALUES ('historical_matches', $1, $2, $3, $4, NOW(), 'idle')
                ON CONFLICT (id) DO UPDATE SET
                    latest_season_imported = EXCLUDED.latest_season_imported,
                    total_matches_imported = EXCLUDED.total_matches_imported,
                    total_seasons_imported = EXCLUDED.total_seasons_imported,
                    matches_skipped = EXCLUDED.matches_skipped,
                    last_import_at = NOW(),
                    updated_at = NOW()
            """, season_codes[0], total_imported, len(season_codes), total_skipped)


if __name__ == "__main__":
    asyncio.run(main())
```

### Service: `app/services/fixture_difficulty_calc.py` (Pure Functions)

```python
"""
Fixture Difficulty Index (FDI) calculation - PURE functions only.

This module contains only pure calculation functions with no I/O.
This allows easy unit testing without mocking databases.
"""

from dataclasses import dataclass
from typing import Literal, Optional


@dataclass
class FixtureDifficultyFactors:
    """Individual factors that contribute to fixture difficulty."""
    # Current season metrics (0-1 scale, 0 = hardest, 1 = easiest)
    current_xgc_rank: float         # Opponent's xGC rank (high = easier)
    current_xgi_rank: float         # Opponent's xGI rank (high = harder)
    points_against_rank: float      # Opponent's FPL points conceded (high = easier)
    current_form_rank: float        # Opponent's recent form (good = harder)

    # Fixture congestion (0-1 scale)
    rest_days_factor: float         # Opponent's rest days (low = fatigued = easier)

    # Historical metrics (0-1 scale)
    historical_h2h_factor: float    # H2H win % against this opponent
    historical_venue_factor: float  # Home/away historical performance

    # FPL baseline (for comparison only, not used in calculation)
    fpl_difficulty: float           # Official FPL FDR (1-5 normalized to 0-1)


@dataclass
class ConfidenceDetails:
    """Why confidence is high/medium/low."""
    has_h2h_data: bool
    h2h_sample_size: int
    has_current_season_data: bool
    current_season_matches: int
    has_rest_days_data: bool
    rest_days_data_age_days: int
    team_promoted_this_season: bool
    opponent_promoted_this_season: bool

    def calculate_confidence_level(self) -> Literal["high", "medium", "low"]:
        """Deterministic confidence based on available data."""
        if not self.has_current_season_data:
            return "low"

        if self.team_promoted_this_season or self.opponent_promoted_this_season:
            return "medium"

        if self.has_h2h_data and self.h2h_sample_size >= 5:
            return "high"

        if self.current_season_matches >= 10:
            return "medium"

        return "low"


# Weight configuration - can be tuned later
DEFAULT_WEIGHTS = {
    # Current season data (60% total)
    "current_xgc": 0.15,           # Defensive weakness (high xGC = easier)
    "current_xgi": 0.15,           # Attacking threat (high xGI = harder)
    "points_against": 0.15,        # FPL points conceded
    "current_form": 0.15,          # Recent momentum (6-match window)

    # Fixture congestion (10%)
    "rest_days": 0.10,             # Opponent fatigue from multi-comp fixtures

    # Historical data (30% total)
    "historical_h2h": 0.20,        # Head-to-head record
    "historical_venue": 0.10,      # Home/away split
}


def calculate_fdi_score(
    factors: FixtureDifficultyFactors,
    weights: Optional[dict[str, float]] = None
) -> float:
    """
    Pure function: calculate FDI score from factors.
    No I/O, fully testable.

    Args:
        factors: All factor values (0-1 scale)
        weights: Optional custom weights (defaults to DEFAULT_WEIGHTS)

    Returns:
        FDI score (0-100, higher = easier fixture)
    """
    weights = weights or DEFAULT_WEIGHTS

    fdi_score = (
        factors.current_xgc_rank * weights["current_xgc"] +
        (1 - factors.current_xgi_rank) * weights["current_xgi"] +
        factors.points_against_rank * weights["points_against"] +
        (1 - factors.current_form_rank) * weights["current_form"] +
        factors.rest_days_factor * weights["rest_days"] +
        factors.historical_h2h_factor * weights["historical_h2h"] +
        factors.historical_venue_factor * weights["historical_venue"]
    ) * 100

    return round(fdi_score, 1)


def score_to_stars(score: float) -> int:
    """Convert FDI score (0-100) to star rating (1-5)."""
    if score >= 75:
        return 5  # Very easy
    elif score >= 55:
        return 4  # Easy
    elif score >= 40:
        return 3  # Medium
    elif score >= 25:
        return 2  # Difficult
    else:
        return 1  # Very difficult


def rest_days_to_factor(days: int) -> float:
    """
    Convert rest days to difficulty factor (0-1).

    Lower rest = more fatigued opponent = EASIER fixture for us.

    Returns:
        0.0 = opponent well rested (harder for us)
        1.0 = opponent fatigued (easier for us)
    """
    if days <= 2:
        return 0.9   # Very fatigued - 40% less likely to win
    elif days == 3:
        return 0.7   # Fatigued
    elif days == 4:
        return 0.5   # Moderate
    elif days <= 6:
        return 0.3   # Normal rest
    elif days <= 10:
        return 0.1   # Well rested
    else:
        return 0.0   # Very well rested (e.g., winter break)


def calculate_h2h_factor_with_recency(
    h2h_matches: list[dict],
    current_season_code: str
) -> float:
    """
    Calculate H2H win % with recency weighting.
    Recent seasons weighted more heavily (exponential decay).

    Args:
        h2h_matches: List of {'season_code': str, 'team_a_wins': int (0 or 1)}
        current_season_code: e.g., '2526'

    Returns:
        Weighted win percentage (0-1 scale)
    """
    if not h2h_matches:
        return 0.5  # No H2H data: neutral factor

    current_season_year = int(current_season_code[:2])
    total_weighted_wins = 0
    total_weight = 0

    for match in h2h_matches:
        season_year = int(match['season_code'][:2])
        season_age = current_season_year - season_year
        if season_age < 0:
            season_age += 100  # Handle century rollover (99 → 00)

        # Exponential decay: 0.8^age
        weight = 0.8 ** season_age

        total_weighted_wins += match['team_a_wins'] * weight
        total_weight += weight

    return total_weighted_wins / total_weight if total_weight > 0 else 0.5
```

### Service: `app/services/fixture_difficulty_service.py` (I/O Functions)

```python
"""
Fixture Difficulty Index (FDI) service - I/O operations.

This module handles database queries and calls pure calculation functions.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Optional

from app.db import get_connection
from app.services.fixture_difficulty_calc import (
    FixtureDifficultyFactors,
    ConfidenceDetails,
    calculate_fdi_score,
    score_to_stars,
    rest_days_to_factor,
    calculate_h2h_factor_with_recency,
    DEFAULT_WEIGHTS,
)


@dataclass
class FixtureDifficultyResult:
    """Result of fixture difficulty calculation."""
    team_short_name: str
    opponent_short_name: str
    is_home: bool
    gameweek: int
    kickoff_time: Optional[datetime]

    # Final score (0-100, higher = easier fixture)
    fdi_score: float

    # Star rating (1-5)
    stars: int

    # Individual factors for transparency
    factors: FixtureDifficultyFactors

    # Confidence level (based on data availability)
    confidence: Literal["high", "medium", "low"]

    # FPL comparison
    fpl_fdr: int


class FixtureDifficultyService:
    """Service for calculating fixture difficulty."""

    async def get_fixture_difficulty(
        self,
        team_short_name: str,
        opponent_short_name: str,
        is_home: bool,
        season_id: int,
        fixture_date: datetime,
        gameweek: int = 0,
    ) -> FixtureDifficultyResult:
        """
        Calculate fixture difficulty for a team against an opponent.
        """
        async with get_connection() as conn:
            # Fetch all factors from DB
            factors = FixtureDifficultyFactors(
                current_xgc_rank=await self._get_xgc_rank(conn, opponent_short_name, season_id),
                current_xgi_rank=await self._get_xgi_rank(conn, opponent_short_name, season_id),
                points_against_rank=await self._get_pa_rank(conn, opponent_short_name, season_id),
                current_form_rank=await self._get_form_rank(conn, opponent_short_name, season_id),
                rest_days_factor=await self._get_rest_days_factor(conn, opponent_short_name, season_id, fixture_date),
                historical_h2h_factor=await self._get_h2h_factor(conn, team_short_name, opponent_short_name),
                historical_venue_factor=await self._get_venue_factor(conn, team_short_name, is_home),
                fpl_difficulty=await self._get_fpl_difficulty(conn, opponent_short_name, season_id),
            )

            # Build confidence diagnostics
            confidence_details = await self._build_confidence_details(
                conn, team_short_name, opponent_short_name, season_id
            )

        # Pure calculation
        fdi_score = calculate_fdi_score(factors)
        stars = score_to_stars(fdi_score)

        return FixtureDifficultyResult(
            team_short_name=team_short_name,
            opponent_short_name=opponent_short_name,
            is_home=is_home,
            gameweek=gameweek,
            kickoff_time=fixture_date,
            fdi_score=fdi_score,
            stars=stars,
            factors=factors,
            confidence=confidence_details.calculate_confidence_level(),
            fpl_fdr=int(factors.fpl_difficulty * 5) or 3,  # Convert back to 1-5
        )

    async def _get_xgc_rank(self, conn, team: str, season_id: int) -> float:
        """Get opponent's xGC percentile rank (0-1, higher = concedes more)."""
        # TODO: Query player_fixture_stats aggregated by team
        return 0.5  # Placeholder

    async def _get_xgi_rank(self, conn, team: str, season_id: int) -> float:
        """Get opponent's xGI percentile rank (0-1, higher = more dangerous)."""
        return 0.5  # Placeholder

    async def _get_pa_rank(self, conn, team: str, season_id: int) -> float:
        """Get opponent's Points Against percentile rank (0-1, higher = concedes more FPL points)."""
        # Query points_against_season_totals view
        return 0.5  # Placeholder

    async def _get_form_rank(self, conn, team: str, season_id: int) -> float:
        """Get opponent's 6-match form rank (0-1, higher = better form)."""
        return 0.5  # Placeholder

    async def _get_rest_days_factor(self, conn, team: str, season_id: int, before_date: datetime) -> float:
        """Get opponent's rest days factor (0-1, higher = more fatigued)."""
        result = await conn.fetchval("""
            SELECT kickoff_time
            FROM team_fixture_schedule
            WHERE team_short_name = $1
              AND season_id = $2
              AND kickoff_time < $3
              AND status = 'finished'
            ORDER BY kickoff_time DESC
            LIMIT 1
        """, team, season_id, before_date)

        if not result:
            return 0.3  # Default: assume normal rest

        days = (before_date.date() - result.date()).days
        return rest_days_to_factor(min(days, 14))

    async def _get_h2h_factor(self, conn, team_a: str, team_b: str) -> float:
        """Get H2H win factor with recency weighting."""
        h2h_matches = await conn.fetch("""
            SELECT
                season_code,
                CASE
                    WHEN (home_team = $1 AND result = 'H') OR (away_team = $1 AND result = 'A')
                    THEN 1 ELSE 0
                END AS team_a_wins
            FROM historical_match
            WHERE (home_team = $1 AND away_team = $2)
               OR (home_team = $2 AND away_team = $1)
            ORDER BY match_date DESC
            LIMIT 20
        """, team_a, team_b)

        if not h2h_matches:
            return 0.5  # No H2H data

        # Get current season code
        current_season = await conn.fetchval("""
            SELECT code FROM season WHERE is_current = true
        """)

        return calculate_h2h_factor_with_recency(
            [dict(m) for m in h2h_matches],
            current_season or "2526"
        )

    async def _get_venue_factor(self, conn, team: str, is_home: bool) -> float:
        """Get team's historical home/away performance factor."""
        venue = 'home' if is_home else 'away'
        result = await conn.fetchval("""
            SELECT win_pct
            FROM team_historical_record
            WHERE team = $1 AND venue = $2
        """, team, venue)

        if result is None:
            return 0.5  # No data

        return result / 100  # Convert % to 0-1

    async def _get_fpl_difficulty(self, conn, team: str, season_id: int) -> float:
        """Get FPL's official FDR normalized to 0-1."""
        # FPL stores difficulty in fixture table
        return 0.5  # Placeholder - would query FPL fixture data

    async def _build_confidence_details(
        self, conn, team: str, opponent: str, season_id: int
    ) -> ConfidenceDetails:
        """Build confidence diagnostics."""
        # Check H2H data
        h2h_count = await conn.fetchval("""
            SELECT COUNT(*)
            FROM historical_match
            WHERE (home_team = $1 AND away_team = $2)
               OR (home_team = $2 AND away_team = $1)
        """, team, opponent) or 0

        # Check current season data
        current_matches = await conn.fetchval("""
            SELECT COUNT(*)
            FROM team_fixture_schedule
            WHERE team_short_name = $1
              AND season_id = $2
              AND status = 'finished'
        """, opponent, season_id) or 0

        # Check fixture schedule sync age
        last_sync = await conn.fetchval("""
            SELECT last_sync_at
            FROM fixture_schedule_sync_status
            WHERE team_short_name = $1 AND season_id = $2
        """, opponent, season_id)

        sync_age_days = 999
        if last_sync:
            sync_age_days = (datetime.now(last_sync.tzinfo) - last_sync).days

        return ConfidenceDetails(
            has_h2h_data=h2h_count > 0,
            h2h_sample_size=h2h_count,
            has_current_season_data=current_matches > 0,
            current_season_matches=current_matches,
            has_rest_days_data=sync_age_days < 3,
            rest_days_data_age_days=sync_age_days,
            team_promoted_this_season=False,  # TODO: detect promoted teams
            opponent_promoted_this_season=False,
        )
```

---

## API Endpoints

### New Endpoints in `routes.py`

```python
from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime


class FixtureDifficultyFactorsResponse(BaseModel):
    """Individual factors (0-1 scale)."""
    current_xgc_rank: float = Field(..., ge=0, le=1)
    current_xgi_rank: float = Field(..., ge=0, le=1)
    points_against_rank: float = Field(..., ge=0, le=1)
    current_form_rank: float = Field(..., ge=0, le=1)
    rest_days_factor: float = Field(..., ge=0, le=1)
    historical_h2h_factor: float = Field(..., ge=0, le=1)
    historical_venue_factor: float = Field(..., ge=0, le=1)
    fpl_difficulty: float = Field(..., ge=0, le=1)


class FixtureDifficultyResponse(BaseModel):
    """Response for single fixture difficulty."""
    team_short_name: str
    opponent_short_name: str
    is_home: bool
    gameweek: int
    kickoff_time: Optional[datetime]

    fdi_score: float = Field(..., ge=0, le=100)
    stars: int = Field(..., ge=1, le=5)
    factors: FixtureDifficultyFactorsResponse
    confidence: Literal["high", "medium", "low"]
    fpl_fdr: int = Field(..., ge=1, le=5)


class TeamFixturesResponse(BaseModel):
    """Response for team's upcoming fixtures."""
    team_short_name: str
    season_id: int
    fixtures: list[FixtureDifficultyResponse]
    average_difficulty: float
    difficulty_trend: Literal["improving", "stable", "worsening"]


class H2HResponse(BaseModel):
    """Response for head-to-head record."""
    team_a: str
    team_b: str
    total_meetings: int
    team_a_wins: int
    team_b_wins: int
    draws: int
    team_a_goals_for: int
    team_b_goals_for: int
    team_a_win_pct: float
    team_b_win_pct: float
    last_meeting: Optional[datetime]
    last_result: Literal["H", "A", "D"]
    venue_breakdown: dict


# Endpoints

@router.get(
    "/api/v1/fixture-difficulty/{team_short_name}",
    response_model=TeamFixturesResponse,
    summary="Get fixture difficulty for upcoming fixtures",
    responses={
        404: {"description": "Team not found in current season"},
        422: {"description": "Invalid parameters"},
    }
)
async def get_team_fixture_difficulty(
    team_short_name: str = Path(..., regex="^[A-Z]{3}$"),
    num_fixtures: int = Query(default=5, ge=1, le=20),
    season_id: Optional[int] = Query(default=None, description="Season ID (default: current)")
) -> TeamFixturesResponse:
    """
    Get fixture difficulty for upcoming N fixtures for a team.

    Cache: 5 minutes
    """
    # Implementation uses FixtureDifficultyService
    pass


@router.get(
    "/api/v1/fixture-difficulty/h2h/{team_a}/{team_b}",
    response_model=H2HResponse,
    summary="Get head-to-head record between two teams",
    responses={
        404: {"description": "Team not found"},
    }
)
async def get_h2h_record(
    team_a: str = Path(..., regex="^[A-Z]{3}$"),
    team_b: str = Path(..., regex="^[A-Z]{3}$"),
    last_n: int = Query(default=10, ge=1, le=50)
) -> H2HResponse:
    """
    Get head-to-head record between two teams (last N meetings).

    Cache: 1 day (historical data doesn't change)
    """
    pass


@router.get(
    "/api/v1/historical/team/{team_short_name}/record",
    summary="Get team's historical record",
)
async def get_team_historical_record(
    team_short_name: str = Path(..., regex="^[A-Z]{3}$"),
    last_n_seasons: int = Query(default=5, ge=1, le=30)
) -> dict:
    """
    Get team's historical record over last N seasons.

    Cache: 1 day
    """
    pass
```

---

## Initial Formula (Draft)

```python
# Fixture Difficulty Index (FDI)
# Scale: 0-100 (higher = easier fixture)

FDI = (
    # Current season metrics (60%)
    0.15 × (opponent_xGC_percentile) +         # High xGC = leaky defense = easier
    0.15 × (1 - opponent_xGI_percentile) +     # High xGI = dangerous attack = harder
    0.15 × (opponent_PA_percentile) +          # High PA = concede FPL points = easier
    0.15 × (1 - opponent_form_6match) +        # Good form = harder (6-match window)

    # Fixture congestion (10%) - NEW
    0.10 × (opponent_rest_days_factor) +       # Fatigued opponent = easier

    # Historical data (30%)
    0.20 × (my_h2h_win_pct / 100) +            # Good H2H record = easier
    0.10 × (my_venue_win_pct / 100)            # Good home/away record = easier
) × 100

# FPL's official FDR is NOT used in calculation
# Keep it available for comparison/validation only

# Apply recency weighting for historical data
# Recent seasons weighted more heavily (exponential decay)
recency_weight(season_age) = 0.8^season_age
# e.g., current season = 1.0, last season = 0.8, 2 years ago = 0.64

# Rest days factor (from multi-competition fixture data)
# Days ≤2: 0.9 (very fatigued - 40% less likely to win)
# Days 3:  0.7 (fatigued)
# Days 4:  0.5 (moderate)
# Days 5-6: 0.3 (normal)
# Days 7-10: 0.1 (well rested)
# Days 10+: 0.0 (very well rested)
```

### Notes on Weights

- **Current season data (60%)** because it reflects actual performance
- **xGC, xGI, PA, Form equal (15% each)** - balanced current metrics
- **Rest days factor (10%)** - research shows 40% win probability drop with ≤2 days rest
- **Historical H2H significant (20%)** - some matchups are historically lopsided
- **FPL baseline removed (0%)** - kept only for comparison, not in calculation
- **Weights should be tuned** based on backtesting against actual results

---

## Implementation Phases

### Phase 1: Database & Historical Data (Migration 014)

- [ ] Create migration 014 with historical_match schema
- [ ] Add season_id FK constraint to season table
- [ ] Create historical_team_mapping table (current PL teams only)
- [ ] Build `import_historical_data.py` script
  - [ ] Validate team names against team table before importing
  - [ ] Skip matches where either team is not in current PL
  - [ ] Track skipped matches in import status
- [ ] Import historical data (30+ seasons)
- [ ] Verify team name mappings match existing team.short_name values
- [ ] Test H2H views and functions work correctly

### Phase 2: Multi-Competition Fixtures (Migration 015)

- [ ] Create migration 015 with team_fixture_schedule schema
- [ ] Add FK constraint to team table (validates PL teams only)
- [ ] Add fixture_schedule_sync_status table (for resume capability)
- [ ] Add api_football_team_id column to team table
- [ ] Sign up for API-Football free tier, get API key
- [ ] Add API_FOOTBALL_KEY to Fly.io secrets
- [ ] Build `sync_fixture_schedule.py` script
  - [ ] Only sync teams that exist in team table (20 PL teams)
  - [ ] Resume capability from last failed team
  - [ ] Atomic commits per team
- [ ] Initial sync of all PL team fixtures (all competitions)
- [ ] Add to daily scheduled job (04:00 UTC)

### Phase 3: TDD Tests (Write Tests First)

**Philosophy**: Write tests before implementation. Tests define the expected behavior and serve as living documentation. This is especially valuable for FDI calculations where we have a clear formula.

#### 3.1 Pure Calculation Tests (`tests/test_fixture_difficulty_calc.py`)

```python
"""
TDD tests for FDI calculation - write these FIRST before implementing.
"""

import pytest
from app.services.fixture_difficulty_calc import (
    FixtureDifficultyFactors,
    ConfidenceDetails,
    calculate_fdi_score,
    score_to_stars,
    rest_days_to_factor,
    calculate_h2h_factor_with_recency,
    DEFAULT_WEIGHTS,
)


class TestRestDaysToFactor:
    """Test rest days → difficulty factor conversion."""

    def test_very_fatigued_2_days(self):
        """≤2 days rest = 0.9 (very fatigued, easier for us)."""
        assert rest_days_to_factor(2) == 0.9
        assert rest_days_to_factor(1) == 0.9
        assert rest_days_to_factor(0) == 0.9

    def test_fatigued_3_days(self):
        """3 days rest = 0.7 (fatigued)."""
        assert rest_days_to_factor(3) == 0.7

    def test_moderate_4_days(self):
        """4 days rest = 0.5 (moderate)."""
        assert rest_days_to_factor(4) == 0.5

    def test_normal_rest_5_6_days(self):
        """5-6 days rest = 0.3 (normal)."""
        assert rest_days_to_factor(5) == 0.3
        assert rest_days_to_factor(6) == 0.3

    def test_well_rested_7_10_days(self):
        """7-10 days rest = 0.1 (well rested, harder for us)."""
        assert rest_days_to_factor(7) == 0.1
        assert rest_days_to_factor(10) == 0.1

    def test_very_well_rested_over_10_days(self):
        """10+ days rest = 0.0 (very well rested)."""
        assert rest_days_to_factor(11) == 0.0
        assert rest_days_to_factor(14) == 0.0


class TestScoreToStars:
    """Test FDI score → star rating conversion."""

    def test_very_easy_fixture(self):
        """Score ≥75 = 5 stars."""
        assert score_to_stars(75) == 5
        assert score_to_stars(100) == 5

    def test_easy_fixture(self):
        """Score 55-74 = 4 stars."""
        assert score_to_stars(55) == 4
        assert score_to_stars(74) == 4

    def test_medium_fixture(self):
        """Score 40-54 = 3 stars."""
        assert score_to_stars(40) == 3
        assert score_to_stars(54) == 3

    def test_difficult_fixture(self):
        """Score 25-39 = 2 stars."""
        assert score_to_stars(25) == 2
        assert score_to_stars(39) == 2

    def test_very_difficult_fixture(self):
        """Score <25 = 1 star."""
        assert score_to_stars(24) == 1
        assert score_to_stars(0) == 1


class TestCalculateH2HFactorWithRecency:
    """Test recency-weighted H2H calculation."""

    def test_no_h2h_data_returns_neutral(self):
        """No H2H data = 0.5 (neutral)."""
        assert calculate_h2h_factor_with_recency([], "2526") == 0.5

    def test_all_wins_returns_high_factor(self):
        """All wins = factor close to 1.0."""
        matches = [
            {"season_code": "2526", "team_a_wins": 1},
            {"season_code": "2425", "team_a_wins": 1},
        ]
        result = calculate_h2h_factor_with_recency(matches, "2526")
        assert result > 0.9

    def test_all_losses_returns_low_factor(self):
        """All losses = factor close to 0.0."""
        matches = [
            {"season_code": "2526", "team_a_wins": 0},
            {"season_code": "2425", "team_a_wins": 0},
        ]
        result = calculate_h2h_factor_with_recency(matches, "2526")
        assert result < 0.1

    def test_recent_results_weighted_more(self):
        """Recent wins should outweigh older losses."""
        # Recent win, older loss
        matches = [
            {"season_code": "2526", "team_a_wins": 1},  # Current season
            {"season_code": "2021", "team_a_wins": 0},  # 5 years ago
        ]
        result = calculate_h2h_factor_with_recency(matches, "2526")
        # Should be > 0.5 because recent win matters more
        assert result > 0.7

    def test_century_rollover_handling(self):
        """Handle 99 → 00 rollover correctly."""
        matches = [
            {"season_code": "0001", "team_a_wins": 1},
        ]
        # From 2526, 0001 is ~25 years ago
        result = calculate_h2h_factor_with_recency(matches, "2526")
        # Very old data, weight should be minimal
        assert 0.4 < result < 0.6  # Close to neutral due to heavy decay


class TestCalculateFdiScore:
    """Test main FDI calculation."""

    def test_all_favorable_factors_high_score(self):
        """All factors favorable = high FDI score (easy fixture)."""
        factors = FixtureDifficultyFactors(
            current_xgc_rank=1.0,        # Opponent leaks goals
            current_xgi_rank=0.0,        # Opponent not dangerous
            points_against_rank=1.0,     # Opponent concedes FPL points
            current_form_rank=0.0,       # Opponent in bad form
            rest_days_factor=1.0,        # Opponent fatigued
            historical_h2h_factor=1.0,   # We always beat them
            historical_venue_factor=1.0, # Great home/away record
            fpl_difficulty=0.0,          # Not used in calculation
        )
        score = calculate_fdi_score(factors)
        assert score >= 90

    def test_all_unfavorable_factors_low_score(self):
        """All factors unfavorable = low FDI score (hard fixture)."""
        factors = FixtureDifficultyFactors(
            current_xgc_rank=0.0,
            current_xgi_rank=1.0,
            points_against_rank=0.0,
            current_form_rank=1.0,
            rest_days_factor=0.0,
            historical_h2h_factor=0.0,
            historical_venue_factor=0.0,
            fpl_difficulty=1.0,
        )
        score = calculate_fdi_score(factors)
        assert score <= 10

    def test_neutral_factors_mid_score(self):
        """All neutral factors = ~50 score."""
        factors = FixtureDifficultyFactors(
            current_xgc_rank=0.5,
            current_xgi_rank=0.5,
            points_against_rank=0.5,
            current_form_rank=0.5,
            rest_days_factor=0.5,
            historical_h2h_factor=0.5,
            historical_venue_factor=0.5,
            fpl_difficulty=0.5,
        )
        score = calculate_fdi_score(factors)
        assert 45 <= score <= 55

    def test_weights_sum_to_one(self):
        """Verify default weights sum to 1.0."""
        total = sum(DEFAULT_WEIGHTS.values())
        assert abs(total - 1.0) < 0.001

    def test_fpl_difficulty_not_used(self):
        """FPL difficulty should NOT affect the score."""
        base_factors = FixtureDifficultyFactors(
            current_xgc_rank=0.5,
            current_xgi_rank=0.5,
            points_against_rank=0.5,
            current_form_rank=0.5,
            rest_days_factor=0.5,
            historical_h2h_factor=0.5,
            historical_venue_factor=0.5,
            fpl_difficulty=0.0,
        )
        high_fpl_factors = FixtureDifficultyFactors(
            **{**base_factors.__dict__, "fpl_difficulty": 1.0}
        )
        assert calculate_fdi_score(base_factors) == calculate_fdi_score(high_fpl_factors)


class TestConfidenceDetails:
    """Test confidence level calculation."""

    def test_no_current_data_low_confidence(self):
        """Missing current season data = low confidence."""
        details = ConfidenceDetails(
            has_h2h_data=True,
            h2h_sample_size=10,
            has_current_season_data=False,
            current_season_matches=0,
            has_rest_days_data=True,
            rest_days_data_age_days=0,
            team_promoted_this_season=False,
            opponent_promoted_this_season=False,
        )
        assert details.calculate_confidence_level() == "low"

    def test_promoted_team_medium_confidence(self):
        """Promoted team = medium confidence (limited PL history)."""
        details = ConfidenceDetails(
            has_h2h_data=False,
            h2h_sample_size=0,
            has_current_season_data=True,
            current_season_matches=15,
            has_rest_days_data=True,
            rest_days_data_age_days=0,
            team_promoted_this_season=True,
            opponent_promoted_this_season=False,
        )
        assert details.calculate_confidence_level() == "medium"

    def test_good_h2h_data_high_confidence(self):
        """Good H2H data (≥5 meetings) = high confidence."""
        details = ConfidenceDetails(
            has_h2h_data=True,
            h2h_sample_size=8,
            has_current_season_data=True,
            current_season_matches=20,
            has_rest_days_data=True,
            rest_days_data_age_days=0,
            team_promoted_this_season=False,
            opponent_promoted_this_season=False,
        )
        assert details.calculate_confidence_level() == "high"
```

#### 3.2 Integration Tests (`tests/test_fixture_difficulty_service.py`)

```python
"""
Integration tests for FDI service - test DB queries with fixtures.
"""

import pytest
from datetime import datetime, timedelta

from app.services.fixture_difficulty_service import FixtureDifficultyService


@pytest.fixture
def fdi_service():
    return FixtureDifficultyService()


@pytest.mark.asyncio
class TestFixtureDifficultyService:
    """Integration tests requiring database."""

    async def test_get_rest_days_no_previous_match(self, fdi_service, db_conn):
        """No previous match = default rest (7 days)."""
        # Setup: ensure no fixtures for team
        result = await fdi_service._get_rest_days_factor(
            db_conn, "NEW_TEAM", 1, datetime.now()
        )
        assert result == 0.3  # Default for 7 days

    async def test_get_h2h_factor_no_history(self, fdi_service, db_conn):
        """No H2H history = neutral factor (0.5)."""
        result = await fdi_service._get_h2h_factor(db_conn, "ARS", "NEW_TEAM")
        assert result == 0.5

    async def test_get_venue_factor_no_data(self, fdi_service, db_conn):
        """No venue data = neutral factor (0.5)."""
        result = await fdi_service._get_venue_factor(db_conn, "NEW_TEAM", is_home=True)
        assert result == 0.5
```

#### 3.3 API Tests (`tests/test_fixture_difficulty_routes.py`)

```python
"""
API endpoint tests for FDI.
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestFixtureDifficultyEndpoints:
    """Test FDI API endpoints."""

    async def test_get_team_fixtures_valid_team(self, client: AsyncClient):
        """Valid team returns fixture difficulties."""
        response = await client.get("/api/v1/fixture-difficulty/ARS")
        assert response.status_code == 200
        data = response.json()
        assert data["team_short_name"] == "ARS"
        assert "fixtures" in data
        assert "average_difficulty" in data

    async def test_get_team_fixtures_invalid_team(self, client: AsyncClient):
        """Invalid team returns 404."""
        response = await client.get("/api/v1/fixture-difficulty/XXX")
        assert response.status_code == 404

    async def test_get_h2h_valid_teams(self, client: AsyncClient):
        """Valid H2H request returns record."""
        response = await client.get("/api/v1/fixture-difficulty/h2h/ARS/MUN")
        assert response.status_code == 200
        data = response.json()
        assert data["team_a"] == "ARS"
        assert data["team_b"] == "MUN"
        assert "total_meetings" in data

    async def test_get_h2h_same_team(self, client: AsyncClient):
        """H2H with same team returns 422."""
        response = await client.get("/api/v1/fixture-difficulty/h2h/ARS/ARS")
        assert response.status_code == 422
```

- [ ] Write `test_fixture_difficulty_calc.py` (pure function tests)
  - [ ] `TestRestDaysToFactor` - all rest day scenarios
  - [ ] `TestScoreToStars` - star rating boundaries
  - [ ] `TestCalculateH2HFactorWithRecency` - recency weighting
  - [ ] `TestCalculateFdiScore` - main formula tests
  - [ ] `TestConfidenceDetails` - confidence levels
- [ ] Write `test_fixture_difficulty_service.py` (integration tests)
  - [ ] Test with mock fixtures in test DB
  - [ ] Edge cases: no data, promoted teams, sync failures
- [ ] Write `test_fixture_difficulty_routes.py` (API tests)
  - [ ] Valid/invalid team handling
  - [ ] H2H endpoint tests
  - [ ] Response schema validation
- [ ] Run tests - all should FAIL (no implementation yet)

### Phase 4: Backend Service (Implementation)

- [ ] Create `fixture_difficulty_calc.py` (pure functions)
  - [ ] Implement until all pure function tests pass
  - [ ] Recency weighting for historical data
- [ ] Create `fixture_difficulty_service.py` (I/O)
  - [ ] Factor retrieval functions (xGC, xGI, PA, form, H2H, venue, rest days)
  - [ ] Confidence scoring with diagnostics
  - [ ] Implement until all integration tests pass
- [ ] Add API endpoints for FDI lookup
  - [ ] Implement until all API tests pass
- [ ] Add caching layer (5 min for fixtures, 1 day for H2H)

### Phase 5: Integration & Validation

- [ ] Connect to existing points_against data
- [ ] Connect to current season team stats (xGC, xGI)
- [ ] Backtest against historical match outcomes
- [ ] Compare FDI vs FPL official FDR accuracy
- [ ] Tune weight configuration based on backtesting

### Phase 6: Frontend (Future - separate plan)

- [ ] Design fixture difficulty display
- [ ] Add to player/fixture views
- [ ] Visual indicators (stars, colors)
- [ ] Comparison view: FDI vs FPL FDR

---

## Error Handling

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| No H2H data (teams never met) | Return neutral factor (0.5), medium confidence |
| Team promoted this season | Rely on current metrics only, low confidence |
| Fixture schedule sync failed | Use stale data, mark medium confidence |
| Early season (<5 matches) | Weight historical more heavily, low confidence |
| Missing team mapping | Skip match during import, log warning |

---

## Data Volume Estimates

| Data | Rows | Storage |
|------|------|---------|
| Historical PL matches (current teams only) | ~2,000 | ~500KB |
| Team mappings | ~25 | <1KB |
| Multi-comp fixtures (per season) | ~1,500 | ~100KB |
| Sync status | ~20 | <1KB |
| Views/functions | N/A | Minimal |

**Total additional storage**: <5MB (well within Supabase free tier)

---

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `API_FOOTBALL_KEY` | Fly.io secrets | API-Football authentication |

```bash
fly secrets set API_FOOTBALL_KEY="your-api-key-here"
```

---

## Open Questions

1. **Recency weighting formula** - Using exponential decay (0.8^season_age) per research
2. **Promoted team handling** - Teams with no PL history get league average as baseline
3. **Weight optimization** - Backtest against actual match results, compare to FPL FDR
4. **Update frequency** - Daily at 04:00 UTC (fixtures change frequently due to TV/cups)

---

## References

- Data source: [football-data.co.uk](https://www.football-data.co.uk/englandm.php)
- CSV documentation: [notes.txt](https://www.football-data.co.uk/notes.txt)
- Existing Points Against: `backend/migrations/004_points_against.sql`
- Recommendations roadmap: `/RECOMMENDATIONS.md`
- Architecture review: `/FIXTURE_DIFFICULTY_REVIEW.md`
