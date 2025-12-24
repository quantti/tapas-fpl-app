-- Migration 001: Core Tables
-- Description: Creates foundational tables for FPL data storage
-- Run this first in Supabase SQL Editor

-- ============================================================================
-- SEASON MANAGEMENT
-- ============================================================================

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

-- Insert current season
INSERT INTO season (code, name, start_date, is_current)
VALUES ('2024-25', 'Season 2024/25', '2024-08-16', true);

-- ============================================================================
-- APP USER MANAGEMENT
-- ============================================================================

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

-- ============================================================================
-- FPL CORE ENTITIES
-- ============================================================================

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
    -- Current price (in 0.1m units, e.g., 100 = 10.0m)
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

-- ============================================================================
-- FIXTURES
-- ============================================================================

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

-- ============================================================================
-- LEAGUES AND MANAGERS
-- ============================================================================

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
