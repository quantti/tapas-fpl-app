# Recommended Players Feature

Planning document for the Punts, Defensive Options, and Time to Sell recommendation system.

## Current Implementation Status ✅

### Completed Features

**Three recommendation categories:**
1. **Punts** (20 players) - Low ownership (<40%), high potential differential picks
2. **Defensive Options** (10 players) - Template players (40-100% ownership) you should consider
3. **Time to Sell** (10 players) - Underperforming players owned by league managers

**Position-Specific Scoring Weights:**

```typescript
// PUNTS - Position specific weights
const PUNT_WEIGHTS = {
  DEF: { xG: 0.10, xA: 0.10, xGC: 0.20, cs: 0.15, form: 0.25, fix: 0.20 },
  MID: { xG: 0.20, xA: 0.20, xGC: 0.00, cs: 0.00, form: 0.25, fix: 0.15 },
  FWD: { xG: 0.35, xA: 0.10, xGC: 0.00, cs: 0.00, form: 0.30, fix: 0.15 },
}

// DEFENSIVE OPTIONS - Form-heavy for template picks
const DEFENSIVE_WEIGHTS = {
  DEF: { xG: 0.05, xA: 0.05, xGC: 0.15, cs: 0.15, form: 0.35, fix: 0.25 },
  MID: { xG: 0.10, xA: 0.10, xGC: 0.00, cs: 0.00, form: 0.45, fix: 0.25 },
  FWD: { xG: 0.20, xA: 0.05, xGC: 0.00, cs: 0.00, form: 0.50, fix: 0.25 },
}

// TIME TO SELL - Form dominant (poor form = sell candidate)
const SELL_WEIGHTS = {
  DEF: { xG: 0.05, xA: 0.05, xGC: 0.15, cs: 0.15, form: 0.55, fix: 0.05 },
  MID: { xG: 0.15, xA: 0.15, xGC: 0.00, cs: 0.00, form: 0.65, fix: 0.05 },
  FWD: { xG: 0.20, xA: 0.10, xGC: 0.00, cs: 0.00, form: 0.65, fix: 0.05 },
}
```

**Key Implementation Decisions:**
- Stars show overall recommendation score, not just fixture difficulty
- "Time to Sell" requires badness score > 0.5 (worse than average)
- "Time to Sell" only shows players owned by at least one league manager
- Percentile-based scoring normalizes stats across positions
- Per-90 calculations for fair comparison across playing time

**Files Created:**
- `frontend/src/hooks/useRecommendedPlayers.ts` - Core scoring algorithms
- `frontend/src/components/RecommendedPlayers.tsx` - UI component
- `frontend/src/components/RecommendedPlayers.module.css` - Styling

### Backend Deployment ✅

**Live at:** https://tapas-fpl-backend.fly.dev

| Endpoint | Status | URL |
|----------|--------|-----|
| Health | ✅ | https://tapas-fpl-backend.fly.dev/health |
| API Docs | ✅ | https://tapas-fpl-backend.fly.dev/docs |
| FPL Proxy | ✅ | https://tapas-fpl-backend.fly.dev/api/bootstrap-static |
| Fixtures | ✅ | https://tapas-fpl-backend.fly.dev/api/fixtures |

**Deployment Details:**
- **Provider:** Fly.io (Amsterdam region)
- **Image size:** 67 MB
- **Resources:** shared-cpu-1x, 256MB RAM
- **Auto-scaling:** Scales to 0 when idle, auto-starts on request
- **CORS:** Configured for tapas-fpl-app.vercel.app and localhost

**To redeploy:**
```bash
cd backend
~/.fly/bin/flyctl deploy
```

---

## Overview

Three categories of player recommendations:
1. **Punts** - Low ownership, high potential differential picks
2. **Defensive Options** - Template players you should consider owning
3. **Time to Sell** - Underperforming players to transfer out

## Data Sources

**Good news: FPL API provides all needed data!**

| Stat | Source | Field |
|------|--------|-------|
| xG | FPL API | `expected_goals` |
| xA | FPL API | `expected_assists` |
| xGI | FPL API | `expected_goal_involvements` |
| xGC | FPL API | `expected_goals_conceded` |
| Form | FPL API | `form` |
| Global ownership | FPL API | `selected_by_percent` |
| League ownership | Calculated | From managerDetails picks |
| Fixture difficulty | FPL API | `team_h_difficulty`, `team_a_difficulty` |
| Minutes | FPL API | `minutes` |
| ICT Index | FPL API | `ict_index`, `threat`, `creativity`, `influence` |

**No new API calls needed** - all data already fetched by existing hooks.

### Optional Future Enhancement

Understat integration for advanced stats (requires backend):
- npxG (non-penalty xG)
- xGChain
- xGBuildup
- Shot location data

Would require:
- Backend scraping service
- Player ID mapping (FPL ID ↔ Understat ID)
- Caching layer

## Algorithm Design

### Per-90 Calculations

```typescript
interface PlayerStats {
  xG90: number      // expected_goals / (minutes / 90)
  xA90: number      // expected_assists / (minutes / 90)
  xGI90: number     // expected_goal_involvements / (minutes / 90)
  xGC90: number     // expected_goals_conceded / (minutes / 90)
}

function calculatePer90(player: Player): PlayerStats | null {
  const minutes90 = player.minutes / 90
  if (minutes90 < 5) return null // Not enough data

  return {
    xG90: parseFloat(player.expected_goals) / minutes90,
    xA90: parseFloat(player.expected_assists) / minutes90,
    xGI90: parseFloat(player.expected_goal_involvements) / minutes90,
    xGC90: parseFloat(player.expected_goals_conceded) / minutes90,
  }
}
```

### Fixture Score Calculation

```typescript
// Next 5 gameweeks, weighted (nearer = more important)
const weights = [0.35, 0.25, 0.20, 0.12, 0.08]

function calculateFixtureScore(
  teamId: number,
  fixtures: Fixture[],
  currentGW: number
): number {
  const upcoming = fixtures
    .filter(f => f.event && f.event > currentGW && f.event <= currentGW + 5)
    .sort((a, b) => a.event! - b.event!)

  return upcoming.reduce((sum, f, i) => {
    const isHome = f.team_h === teamId
    const difficulty = isHome ? f.team_h_difficulty : f.team_a_difficulty
    const easeScore = (5 - difficulty) / 4  // Convert 1-5 difficulty to 1-0 ease
    return sum + easeScore * (weights[i] || 0)
  }, 0)
}
```

### PUNTS Score

Target: Players that could be difference-makers with low ownership.

**Key design decision:** Low ownership is a **filter requirement**, not a scoring factor. If a player has <40% league ownership, they qualify as a punt. The score then ranks them by quality metrics only.

```typescript
// Base score calculation
BASE_PUNT_SCORE = (
  xG90_percentile × 0.35 +             // Good underlying attacking stats
  xA90_percentile × 0.25 +
  fixture_score × 0.25 +               // Easy upcoming fixtures (next 5 GWs)
  form_percentile × 0.15               // Recent form boost
)

// Position modifiers (mids are most valuable for punts)
POSITION_MODIFIER = {
  MID: 1.3,   // Midfielders get bonus (more points potential)
  FWD: 1.0,   // Forwards baseline
  DEF: 0.8    // Defenders slightly penalized
}

PUNT_SCORE = BASE_PUNT_SCORE × POSITION_MODIFIER[position]
```

**Filters (must pass ALL):**
- League ownership < 40%
- Minutes > 450 (minimum ~5 full games)
- Status = 'a' (available, not injured)
- Position: DEF, MID, or FWD only (exclude GKs)

### DEFENSIVE OPTIONS Score

Target: Template players you should consider if you don't have them.

**Key design decision:** High ownership is a **filter requirement**, not a scoring factor. If a player has >50% league ownership, they qualify as a defensive pick. The score then ranks them by form and fixtures.

```typescript
DEFENSIVE_SCORE = (
  form_percentile × 0.50 +             // In-form players (primary factor)
  fixture_score × 0.50                 // Good upcoming fixtures (next 5 GWs)
)
```

**Filters (must pass ALL):**
- League ownership > 50% AND < 100% (exclude players everyone owns)
- Minutes > 450 (minimum ~5 full games)
- Status = 'a' (available)
- Position: DEF, MID, or FWD only (exclude GKs)

### Position-Specific Weighting

| Position | xG Weight | xA Weight | xGC Weight | Clean Sheet |
|----------|-----------|-----------|------------|-------------|
| GK | 0.0 | 0.0 | 0.4 | 0.6 |
| DEF | 0.15 | 0.15 | 0.3 | 0.4 |
| MID | 0.35 | 0.35 | 0.1 | 0.2 |
| FWD | 0.5 | 0.3 | 0.0 | 0.2 |

## UI Design

### Location
Statistics page - new card spanning 2 columns (like StatsCards)

### Layout - Clean Side by Side Cards

```
┌─────────────────────────┐  ┌─────────────────────────┐
│ 🎲 PUNTS                │  │ 🛡️ DEFENSIVE OPTIONS     │
│                         │  │                         │
│ 🟢 Palmer    CHE ★★★★☆  │  │ 🔵 Salah     LIV ★★★★★  │
│ 🔵 Mbeumo    BRE ★★★☆☆  │  │ 🟢 Haaland   MCI ★★★★☆  │
│ 🟢 McNeil    EVE ★★★★☆  │  │ 🔴 Alexander ARS ★★★★☆  │
│ 🔴 Gabriel   ARS ★★★☆☆  │  │ 🔵 Saka      ARS ★★★★☆  │
│ 🔵 Watkins   AVL ★★★★☆  │  │ 🟢 Isak      NEW ★★★☆☆  │
└─────────────────────────┘  └─────────────────────────┘
```

### Design Decisions
- **10 players per category**
- **Clean UI** - no stats, just essentials
- **Shirt/jersey icon** with team colors
- **Position colors**: DEF = red, MID = blue, FWD = green
- **Stars** for fixture difficulty (5 = easiest, 1 = hardest)
- **No GKs** - excluded from both categories

### Row Information
- Position color indicator (colored dot or shirt)
- Player name
- Team short name (3 letters)
- Fixture difficulty stars (next 5 GWs)

## Implementation Plan

### Files to Create

1. **`src/utils/recommendations.ts`**
   - `calculatePer90Stats(player: Player)`
   - `calculateFixtureScore(teamId, fixtures, currentGW)`
   - `calculatePuntScore(player, stats, leagueOwnership, fixtureScore)`
   - `calculateDefensiveScore(player, stats, leagueOwnership, fixtureScore)`
   - `getPercentile(value, allValues)`

2. **`src/hooks/useRecommendedPlayers.ts`**
   - Input: bootstrap, fixtures, managerDetails, currentGameweek
   - Output: `{ punts: RecommendedPlayer[], defensive: RecommendedPlayer[] }`
   - Handles all filtering, scoring, and sorting

3. **`src/components/RecommendedPlayers.tsx`**
   - Two-column layout
   - Player rows with stats
   - Fixture difficulty visualization

4. **`src/components/RecommendedPlayers.module.css`**
   - Styling following existing patterns

### Data Flow

```
bootstrap-static ─────┐
                      │
fixtures ─────────────┼──► useRecommendedPlayers ──► RecommendedPlayers
                      │         hook                    component
managerDetails ───────┘
(league ownership)
```

## Future Enhancements - Research-Based Roadmap

Based on comprehensive research of professional FPL tools (FPL Review, AIrsenal, LiveFPL), academic papers, and open-source implementations.

---

### Phase 1: Enhanced Metrics (Frontend)

**Priority: HIGH** | **Complexity: LOW** | **Impact: MEDIUM**

Improvements that can be done entirely in the frontend with existing API data.

#### 1.1 Delta Tracking (Actual vs Expected)
Track over/underperformance to identify regression candidates:

```typescript
interface DeltaMetrics {
  goalsDelta: number      // goals - xG (positive = overperforming)
  assistsDelta: number    // assists - xA
  pointsDelta: number     // actual_points - expected_points
}

// Players with positive delta likely to regress
// Players with negative delta may be due for uptick
```

**Use cases:**
- Add to "Time to Sell": Overperformers due for regression
- Add to "Punts": Underperformers due for uptick

#### 1.2 Multi-Horizon Form Features
Instead of single "form" value, calculate rolling averages:

```typescript
interface MultiHorizonForm {
  form_1gw: number   // Last gameweek only (hot streak detection)
  form_3gw: number   // Short-term (current momentum)
  form_5gw: number   // Medium-term (sustained performance)
  form_10gw: number  // Long-term (reliable performer)
}
```

**Commercial tools use this to:**
- Weight recent performance more heavily
- Detect momentum changes early
- Distinguish sustained performers from flash-in-the-pan

#### 1.3 Ownership-Adjusted Value
Factor in effective ownership for differential potential:

```typescript
const effectiveOwnership = leagueOwnership * (globalOwnership / 100)
const differentialValue = score * (1 - effectiveOwnership)
```

---

### Phase 2: Expected Points Engine (Backend Required)

**Priority: HIGH** | **Complexity: MEDIUM** | **Impact: HIGH**

The core calculation used by all professional tools.

#### 2.1 Expected Points (xP) Formula

This is the industry standard calculation:

```typescript
interface ExpectedPoints {
  // Attacking returns
  xGoalPoints: number     // xG × position_goal_points × conversion_rate
  xAssistPoints: number   // xA × assist_points
  xCleanSheet: number     // P(clean_sheet) × cs_points

  // Guaranteed points
  appearancePoints: number // P(plays) × (P(60min) × 2 + P(<60min) × 1)

  // Bonus estimation (complex model)
  xBonus: number          // Based on BPS projection

  // Negative points
  xGoalsConceded: number  // xGC × goals_conceded_penalty (DEF/GK)
  xYellowCard: number     // P(yellow) × -1
  xOwnGoal: number        // P(own_goal) × -2
}

const totalXP = sum(all_components) × expectedMinutes / 90
```

**Why backend:**
- BPS calculation requires historical match data
- Clean sheet probability needs team-level aggregation
- Yellow card probability from historical fouls data

#### 2.2 Expected Minutes Prediction

The "secret sauce" of commercial tools. Key factors:

```typescript
interface MinutesPrediction {
  // Primary factors
  baseMinutes: number        // Rolling average (weighted recent)
  rotationRisk: number       // Based on team fixtures, UCL, cups
  injuryHistory: number      // Decay factor from past injuries
  managerPatterns: number    // Does manager rotate this position?

  // Contextual factors
  fixtureImportance: number  // League position implications
  competitionLoad: number    // UCL/Cup fixture density
  restDays: number           // Days since last match
}

// Output: probability distribution of minutes
// P(0min), P(1-59min), P(60+min)
```

**This is critical because:**
- A 10-point player who plays 45 min = 5 effective points
- Minutes uncertainty dominates point variance

---

### Phase 3: MILP Transfer Optimization (Backend Required)

**Priority: MEDIUM** | **Complexity: HIGH** | **Impact: VERY HIGH**

Used by top-100 finishers. Solves the optimal transfer problem mathematically.

#### 3.1 Problem Formulation

```
Maximize: Σ(expected_points[i] × selected[i]) for GW to GW+horizon

Subject to:
- Budget: Σ(price[i] × selected[i]) ≤ selling_value + bank
- Squad size: Σ(selected[i]) = 15
- Position limits: GK=2, DEF=5, MID=5, FWD=3
- Team limit: max 3 players per team
- Transfer cost: each transfer beyond free = -4 points
- Chip constraints: if wildcard, no transfer cost
```

#### 3.2 Implementation with HiGHS Solver

```python
# Backend Python implementation
from highspy import Highs

def optimize_transfers(
    current_squad: list[int],
    all_players: list[Player],
    budget: float,
    free_transfers: int,
    horizon: int = 5,  # Optimize over next 5 GWs
    chip: str | None = None
) -> TransferPlan:

    h = Highs()

    # Binary decision variables: is player i selected?
    x = [h.addBinary(f"select_{p.id}") for p in all_players]

    # Objective: maximize expected points over horizon
    objective = sum(
        x[i] * player.expected_points[gw]
        for i, player in enumerate(all_players)
        for gw in range(horizon)
    )

    # ... constraint definitions ...

    h.maximize(objective)
    return extract_solution(h, current_squad, all_players)
```

#### 3.3 Key Features
- **Multi-week horizon**: Optimize for 5+ gameweeks, not just next GW
- **Chip planning**: Suggest optimal wildcard/bench boost timing
- **Hit calculation**: Automatically determines if -4/-8 worth it
- **Price rise/fall**: Factor in predicted price changes

---

### Phase 4: ML Pipeline (Backend Required)

**Priority: LOW** | **Complexity: VERY HIGH** | **Impact: HIGH**

For teams wanting state-of-the-art predictions.

#### 4.1 Feature Engineering

```python
features = {
    # Player features
    'xg_per_90': float,
    'xa_per_90': float,
    'form_1gw': float,
    'form_3gw': float,
    'form_5gw': float,
    'delta_goals': float,      # goals - xG
    'delta_assists': float,    # assists - xA
    'minutes_consistency': float,
    'bps_per_90': float,

    # Team features
    'team_xg_per_match': float,
    'team_xga_per_match': float,
    'team_form': float,

    # Opponent features
    'opp_xga': float,          # How many goals opponent concedes
    'opp_xg': float,           # How many goals opponent scores
    'opp_league_position': int,

    # Contextual
    'is_home': bool,
    'days_rest': int,
    'fixture_difficulty': int,
    'gw_number': int,          # Season progression
}
```

#### 4.2 Model Architecture

```python
# Ensemble approach (what academic papers recommend)
from xgboost import XGBRegressor
from sklearn.ensemble import RandomForestRegressor

class FPLPointsPredictor:
    def __init__(self):
        self.xgb = XGBRegressor(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1
        )
        self.rf = RandomForestRegressor(
            n_estimators=100,
            max_depth=10
        )

    def predict(self, features):
        xgb_pred = self.xgb.predict(features)
        rf_pred = self.rf.predict(features)
        return 0.6 * xgb_pred + 0.4 * rf_pred  # Ensemble
```

#### 4.3 Training Pipeline
- Historical data: 3+ seasons of FPL data
- Target: actual gameweek points
- Validation: walk-forward (train on GW1-20, test GW21, etc.)
- Retrain: weekly after each gameweek completes

---

### Phase 5: Advanced Fixture Analysis

**Priority: MEDIUM** | **Complexity: MEDIUM** | **Impact: MEDIUM**

#### 5.1 Fixture Ticker Integration
Visual fixture difficulty for next 6 gameweeks:

```
Player     | GW19 | GW20 | GW21 | GW22 | GW23 | GW24
-----------+------+------+------+------+------+------
Salah      | EVE  | MUN  | NFO  | BOU  | WES  | IPS
           | (2)  | (4)  | (2)  | (2)  | (2)  | (2)
```

#### 5.2 Double/Blank Gameweek Detection
- Identify teams with DGW potential (cup rescheduling)
- Flag BGW risks from Cup clashes
- Factor into multi-week optimization

#### 5.3 Rotation Risk Modeling
Track which teams have heavy fixture congestion:
- UCL teams in knockout rounds
- FA Cup progression
- League Cup progression

---

## Backend Architecture (If Implemented)

```
┌─────────────────────────────────────────────────────────────┐
│                       Frontend (React)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Punts     │  │  Defensive  │  │ Time to Sell│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│            │              │               │                  │
│            └──────────────┼───────────────┘                  │
│                           ▼                                  │
│              ┌─────────────────────────┐                    │
│              │  Transfer Optimizer UI  │                    │
│              └─────────────────────────┘                    │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Python/FastAPI)                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Expected Points Engine                  │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │   │
│  │  │ xP Calc  │  │  xMins   │  │  BPS Projection  │  │   │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              MILP Optimizer (HiGHS)                  │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │   │
│  │  │ Transfer │  │   Chip   │  │  Multi-Horizon   │  │   │
│  │  │  Solver  │  │ Planner  │  │   Optimization   │  │   │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                ML Pipeline (Optional)                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │   │
│  │  │ XGBoost  │  │   RF     │  │    Ensemble      │  │   │
│  │  └──────────┘  └──────────┘  └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                              │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ FPL API  │  │  Historical  │  │  Understat (opt)    │   │
│  │  Cache   │  │     DB       │  │     Scraper         │   │
│  └──────────┘  └──────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Priority Matrix

| Enhancement | Priority | Complexity | Impact | Requires Backend |
|-------------|----------|------------|--------|------------------|
| Delta tracking | HIGH | LOW | MEDIUM | No |
| Multi-horizon form | HIGH | LOW | MEDIUM | No |
| Ownership-adjusted value | MEDIUM | LOW | LOW | No |
| Expected Points engine | HIGH | MEDIUM | HIGH | Yes |
| Expected Minutes | HIGH | HIGH | VERY HIGH | Yes |
| MILP Optimizer | MEDIUM | HIGH | VERY HIGH | Yes |
| ML Pipeline | LOW | VERY HIGH | HIGH | Yes |
| Fixture ticker | MEDIUM | LOW | MEDIUM | No |
| DGW/BGW detection | MEDIUM | MEDIUM | MEDIUM | No |

---

## Research References

### Academic Papers
- **OpenFPL**: "An Open-Source Framework for Fantasy Premier League" - Comprehensive xP framework
- **AIrsenal**: Open-source FPL bot using Bayesian inference
- **FPL Transfer Optimization**: MILP formulation research

### Commercial Tools Analyzed
- **FPL Review**: Expected points model, fixture ticker, optimization
- **LiveFPL**: Real-time ownership, effective ownership calculations
- **Fantasy Football Fix**: Multi-horizon form, delta tracking
- **Fantasy Football Scout**: Member area algorithms

### Open Source Implementations
- github.com/vaastav/Fantasy-Premier-League (historical data)
- github.com/alansendar/fpl_optimizer (MILP example)
- github.com/AIrsenal/AIrsenal (Bayesian approach)

---

## Backend Hosting Strategy

### Current Architecture

```
Frontend (Vercel) → Cloudflare Workers (CORS proxy) → FPL API
```

### Target Architecture (with backend)

```
Frontend (Vercel) → Python Backend → FPL API
                         ↓
                   (xP calculations, MILP optimization, ML predictions)
```

The backend replaces Cloudflare Workers and adds computation capabilities.

### Hosting Options Comparison

| Provider | Free Tier | Paid Tier | Cold Starts | Best For |
|----------|-----------|-----------|-------------|----------|
| **Fly.io** | 3 shared VMs | ~$2-5/mo | No (always on) | Python/FastAPI, recommended start |
| **Railway** | $5 credit/mo | ~$5/mo | No | Quick deploys, good DX |
| **Render** | 750 hrs/mo | $7/mo | Yes (free tier) | Simple apps |
| **Hetzner VPS** | None | €4/mo | No | Full control, cheapest long-term |
| **Oracle Cloud** | 2 VMs forever | N/A | No | Truly free, harder setup |
| **DigitalOcean** | None | $5/mo | No | Droplets, straightforward |

### Recommended Path

```
Fly.io (free) → Growth → Railway ($5-20/mo) → Scale → Hetzner VPS ($20/mo)
                                              or → AWS/GCP (enterprise)
```

### Migration & Portability

**Lock-in risk: MINIMAL** when using Docker

| Component | Portable? | Migration Effort |
|-----------|-----------|------------------|
| Python/FastAPI code | ✅ 100% | None |
| Docker image | ✅ 100% | Works everywhere |
| Environment vars | ✅ Easy | Copy to new provider |
| Database (if any) | ⚠️ Export | pg_dump, standard tools |
| Domain/DNS | ✅ Easy | Point to new IP |

**Migration time estimate: 1-2 hours** if properly containerized.

### Portability Best Practices

1. **Use Docker** - Standard container, runs anywhere
2. **Environment variables** - No hardcoded config
3. **Separate database** - Use managed DB (Supabase/Neon free tier)
4. **Avoid provider-specific features** - Keep deployment generic

---

## Backend Implementation

### Directory Structure

```
backend/
├── Dockerfile              # Multi-stage build for small image
├── docker-compose.yml      # Local development
├── fly.toml                # Fly.io deployment config
├── pyproject.toml          # Modern Python packaging
├── requirements.txt        # Dependencies
├── .env.example            # Environment template
├── .gitignore
└── app/
    ├── __init__.py
    ├── main.py             # FastAPI entry point
    ├── config.py           # Settings from environment
    ├── api/
    │   ├── __init__.py
    │   └── routes.py       # API endpoints
    └── services/
        ├── __init__.py
        └── fpl_proxy.py    # FPL API proxy with caching
```

### Available Endpoints

**FPL Proxy (replaces Cloudflare Workers):**
| Endpoint | Description |
|----------|-------------|
| `GET /api/bootstrap-static` | Players, teams, events |
| `GET /api/fixtures` | All fixtures |
| `GET /api/entry/{id}` | Manager info |
| `GET /api/entry/{id}/event/{gw}/picks` | Manager picks |
| `GET /api/leagues-classic/{id}/standings` | League standings |
| `GET /api/event/{gw}/live` | Live scoring data |

**Analytics (TODO - Phase 2+):**
| Endpoint | Description | Phase |
|----------|-------------|-------|
| `GET /api/analytics/expected-points/{id}` | xP calculation | 2 |
| `POST /api/analytics/optimize-transfers` | MILP optimization | 3 |

### Running Locally

```bash
cd backend

# Option 1: Docker (recommended)
docker-compose up

# Option 2: Direct Python
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### Deploying to Fly.io

```bash
cd backend

# First time setup
fly launch --no-deploy
fly secrets set CORS_ORIGINS="https://your-app.vercel.app"

# Deploy
fly deploy

# View logs
fly logs
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FPL_API_BASE_URL` | `https://fantasy.premierleague.com/api` | FPL API base |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed origins (comma-separated) |
| `LOG_LEVEL` | `INFO` | Logging level |
| `CACHE_TTL_BOOTSTRAP` | `300` | Bootstrap cache TTL (seconds) |
| `CACHE_TTL_FIXTURES` | `600` | Fixtures cache TTL |
| `CACHE_TTL_LIVE` | `60` | Live data cache TTL |

### Switching Frontend to Use Backend

When backend is deployed, update frontend `api.ts`:

```typescript
// Before: Cloudflare Workers
const FPL_API_BASE = 'https://tapas-fpl-proxy.vankari.workers.dev'

// After: Python backend
const FPL_API_BASE = 'https://tapas-fpl-backend.fly.dev'
// Or use environment variable:
const FPL_API_BASE = import.meta.env.VITE_API_URL ?? 'https://tapas-fpl-backend.fly.dev'
```

### Caching Strategy

The backend includes in-memory caching:
- **Bootstrap-static**: 5 min TTL (player data changes infrequently)
- **Fixtures**: 10 min TTL (fixture changes rare)
- **Live data**: 1 min TTL (needs freshness during matches)

Benefits over Cloudflare Workers:
- Reduced FPL API calls
- Faster responses for cached data
- Configurable TTLs
- Foundation for analytics computation

---

## Resolved Questions

1. **How many players per category?** → Punts: 20, Defensive: 10, Sell: 10
2. **Filter by position?** → Combined list with position-specific weights
3. **Show players owned by everyone?** → Exclude from defensive (100% filter)
4. **Include price in scoring?** → Not yet, future enhancement
5. **Minimum minutes threshold?** → 450 minutes (~5 full games)

## References

- FPL API types: `src/types/fpl.ts`
- Existing ownership calculation: `src/components/PlayerOwnership.tsx`
- Fixture data usage: `src/hooks/useFplData.ts`
- Recommendation hook: `src/hooks/useRecommendedPlayers.ts`
- Recommendation component: `src/components/RecommendedPlayers.tsx`
