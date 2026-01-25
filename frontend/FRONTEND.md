# Frontend

React 18 + TypeScript + Vite application for the Tapas FPL companion app.

> **Related docs:** See `backend/FPL_RULES.md` for FPL game rules (transfers, chips, scoring system).

## Pages & Routing

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Dashboard` | Main view: league standings, transfers, countdown |
| `/statistics` | `Statistics` | Stats cards, bench points, captain success, charts |
| `/analytics` | `Analytics` | Player recommendations |
| `/changelog` | `Changelog` | Release notes history |

**Header Navigation:**
- Hamburger menu with links to Dashboard, Statistics, Changelog
- Dark mode toggle (iOS-style switch)
- Active page highlighting

## Project Structure

```
api/                    # Vercel Serverless Functions
├── fpl/
│   └── [...path].ts        # FPL API proxy (catch-all route)
src/
├── views/              # Page components (Dashboard, Statistics, Analytics)
├── features/           # Domain features with co-located code
│   ├── BenchPoints/        # Component + CSS + index.ts
│   ├── CaptainSuccess/     # Component + DifferentialModal + CSS
│   ├── FreeTransfers/      # Component + CSS
│   ├── LeaguePosition/     # Bump chart component
│   ├── PlayerDetails/      # Player modal + HistoryTable
│   └── Recommendations/    # Recommendations cards
├── components/         # Shared UI components (Modal, Card, Spinner, etc.)
├── services/
│   ├── api.ts              # FPL API client
│   ├── queryKeys.ts        # TanStack Query key factory
│   └── queries/            # Data-fetching hooks
│       ├── useFplData.ts       # Main bootstrap data
│       ├── useLiveScoring.ts   # Live gameweek polling
│       ├── usePlayerDetails.ts # Element-summary data
│       └── ...
├── hooks/              # UI-only hooks (theme, notifications, consent)
├── utils/              # Pure utility functions
├── types/              # TypeScript type definitions
├── constants/          # App constants (positions, cache times)
├── config.ts           # Configuration values
└── styles/             # Global CSS variables
```

**Architecture Principle:** Features have domain logic and may use queries; Components are pure UI (no data fetching).

## Architecture: Hooks vs Components

**Core principle:** Separate logic from presentation. Components receive data through props; hooks handle all computation and state management.

### Pattern

```
┌─────────────────────────────────────────────────────────────┐
│  MyFeature.tsx (container)                                  │
│    └── useMyFeature() hook                                  │
│          ├── useQuery() for data fetching                   │
│          ├── useMemo() for computed values                  │
│          └── pure utils for calculations                    │
│    └── <MyComponent data={computedData} />                  │
│                                                             │
│  MyComponent.tsx (presentation)                             │
│    └── Receives props only, no hooks except UI state        │
│    └── Renders based on props                               │
└─────────────────────────────────────────────────────────────┘
```

### Why This Pattern?

| Benefit | Explanation |
|---------|-------------|
| **Testability** | Hook logic tested without rendering; component tested with mock props |
| **Reusability** | Same hook can power multiple components; same component can display different data |
| **Maintainability** | Logic changes don't affect rendering; UI changes don't affect logic |
| **Mocking** | Single hook mock instead of mocking multiple internal hooks |

### Example

```typescript
// ❌ BAD: Logic mixed into component
function PlayerCard({ playerId }: Props) {
  const { data: liveData } = useLiveScoring();
  const { data: fixtures } = useFixtures();
  const player = liveData?.elements.find(p => p.id === playerId);
  const fixture = fixtures?.find(f => f.team_h === player?.team || f.team_a === player?.team);
  const bonus = calculateBonus(player, fixture);
  // ... more inline calculations
  return <div>{bonus}</div>;
}

// ✅ GOOD: Logic in hook, component is pure presentation
function usePlayerLiveStats(playerId: number, liveContext: LiveContext) {
  const player = useMemo(() => findPlayer(liveContext, playerId), [liveContext, playerId]);
  const fixture = useMemo(() => findFixture(liveContext, player), [liveContext, player]);
  const bonus = useMemo(() => calculateBonus(player, fixture), [player, fixture]);
  return { player, fixture, bonus, isLive: !!player };
}

function PlayerCard({ stats }: { stats: PlayerLiveStats }) {
  return <div>{stats.bonus}</div>;  // Pure presentation
}

// Container composes them
function PlayerCardContainer({ playerId, liveContext }: Props) {
  const stats = usePlayerLiveStats(playerId, liveContext);
  return stats.isLive ? <PlayerCard stats={stats} /> : null;
}
```

### Guidelines

1. **Hooks handle:**
   - Data fetching (TanStack Query)
   - Computed/derived values (`useMemo`)
   - Business logic (via pure utility functions)
   - State transformations

2. **Components handle:**
   - Rendering JSX
   - Local UI state (`useState` for open/closed, hover, etc.)
   - Event handlers that call hook callbacks
   - Styling and layout

3. **Pure utilities (`utils/`) handle:**
   - Calculations that don't need React state
   - Data transformations
   - Algorithms (sorting, filtering, scoring)

### Hook Location

| Type | Location | Examples |
|------|----------|----------|
| Data fetching | `services/queries/` | `useFplData`, `useLiveScoring`, `usePlayerDetails` |
| Feature logic | `hooks/` or co-located | `usePlayerLiveStats`, `useTheme` |
| UI-only | `hooks/` | `useReleaseNotification` |

## Path Aliases

Cleaner imports using absolute paths instead of `../../`:

```typescript
import { Card } from 'components/Card'
import { useFplData } from 'services/queries/useFplData'
import { formatDelta } from 'utils/playerStats'
import { CACHE_TIMES } from 'src/config'    // Root-level files use src/ prefix
import type { Player } from 'types/fpl'
import { BenchPoints } from 'features/BenchPoints'
```

**Available aliases:**
- `components/*` → `src/components/*`
- `features/*` → `src/features/*`
- `services/*` → `src/services/*`
- `hooks/*` → `src/hooks/*`
- `utils/*` → `src/utils/*`
- `types/*` → `src/types/*`
- `constants/*` → `src/constants/*`
- `assets/*` → `src/assets/*`
- `src/*` → `src/*` (for root-level files like `config.ts`)

**ESLint enforcement:** The `no-restricted-imports` rule enforces `src/config` instead of relative paths (`../config`, `./config`).

**Configuration files:** `tsconfig.app.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`

## Local Development

### Full Stack (Frontend + Backend)

```bash
npm run start:dev    # Starts PostgreSQL, runs migrations, backend API, and frontend
```

This script (`scripts/start-dev.sh`) does:
1. Starts PostgreSQL via Docker Compose
2. Runs database migrations
3. Seeds test data
4. Starts backend API on `http://localhost:8000`
5. Starts Vercel dev server on `http://localhost:3000`

**Requirements:**
- Docker running (for PostgreSQL)
- Backend virtualenv set up (`../backend/.venv`)
- Node.js 20+ (Node 22 has SIGSEGV issues with Vercel dev)

### Frontend Only (Production Backend)

```bash
npm run start:prod   # Frontend with production backend (Fly.io)
```

Use this when:
- Backend is down or you don't want to run it locally
- Testing against production data
- Data collection is running in production

### Frontend Only (Basic)

```bash
npm run dev          # Vite dev server only (no API proxy)
```

## FPL API Proxy

The app uses **Vercel Serverless Functions** to proxy FPL API requests:

```
Frontend → /api/fpl/* → Vercel Function → fantasy.premierleague.com/api/*
```

**Implementation:** `api/fpl/[...path].ts` - Catch-all route with tiered caching:
- Bootstrap static: 5 min
- Fixtures: 30s (live) / 15 min (default) - uses `?live=1` query param
- Live gameweek: 1 min
- Historical picks: 1 hour
- Event status: 1 min

**Why a proxy?** FPL API has no CORS headers, requiring server-side requests.

## FPL API Reference

Base URL (via proxy): `/api/fpl/`

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `/bootstrap-static/` | All players, teams, gameweeks, game settings |
| `/entry/{team_id}/` | Manager's team info |
| `/entry/{team_id}/history/` | Manager's season history |
| `/entry/{team_id}/event/{gw}/picks/` | Manager's picks for a gameweek |
| `/leagues-classic/{league_id}/standings/` | Classic league standings |
| `/event/{gw}/live/` | Live gameweek data (points, bonus, etc.) |
| `/element-summary/{player_id}/` | Individual player detailed stats |
| `/event-status/` | League recalculation state and bonus processing status |

### Notes

- No official documentation — API is unofficial
- No CORS headers — proxied via Vercel Serverless Functions
- Rate limiting exists — proxy implements tiered caching to reduce load
- Data updates a few times per day during active gameweeks
- FPL API requires trailing slashes on all endpoints

### API Gotchas

**Fixtures endpoint filtering:**
```typescript
// WRONG: 0 is falsy, fetches ALL 380 season fixtures
getFixtures: (gw?: number) => gw ? `/fixtures?event=${gw}` : '/fixtures'

// RIGHT: explicit check
getFixtures: (gw?: number) => gw !== undefined ? `/fixtures?event=${gw}` : '/fixtures'
```

**Fixture finished states:**
- `finished_provisional` - true immediately when match ends
- `finished` - true only after bonus points confirmed (~1 hour later)
- Use `finished_provisional` for "is game still in progress" checks

### Data Display Requirements

**Player Points Display Logic:**
- Show "–" (dash) for players whose fixture hasn't started yet
- Show actual points (including 0) only after fixture has started or finished
- The `/event/{gw}/live/` endpoint returns `total_points: 0` for all players before their fixtures start — this should NOT be displayed as "0"
- Use the fixture's `started` or `finished` flags from `/fixtures/` to determine display state
- Captain/vice-captain multipliers apply to displayed points

**Fixture State Detection:**
```typescript
// Build a map of team -> fixture from /fixtures/ endpoint
const hasFixtureStarted = (teamId: number): boolean => {
  const fixture = teamFixtureMap.get(teamId)
  return fixture ? fixture.started || fixture.finished : false
}

// Only show points once fixture has started
const showPoints = fixtureStarted
```

## Error Handling

### FPL API 503 Responses
The FPL API returns HTTP 503 during gameweek transitions (30-60 minutes after the last match while data is processed). The app handles this gracefully with a friendly message instead of a generic error.

**Key files:**
- `src/services/api.ts` - `FplApiError` class preserves HTTP status codes
- `src/components/FplUpdating.tsx` - Friendly "FPL is updating" message component
- `src/services/queries/useFplData.ts` - Exposes `isApiUnavailable` boolean

**FplApiError class:**
```typescript
export class FplApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string
  ) {
    super(`API error: ${status} ${statusText}`)
    this.name = 'FplApiError'
  }

  get isServiceUnavailable(): boolean {
    return this.status === 503
  }
}
```

**Usage in views:**
```typescript
const { error, isApiUnavailable } = useFplData()

if (error) {
  return isApiUnavailable ? <FplUpdating /> : <GenericError message={error} />
}
```

### League Recalculation Banner
When FPL is recalculating league tables (different from 503 - API works but data may be stale), the app shows a warning banner.

**Key files:**
- `src/services/queries/useFplData.ts` - Fetches `/event-status/` and exposes `leaguesUpdating` boolean
- `src/components/LeagueUpdating.tsx` - Warning banner component
- `src/views/Dashboard.tsx` - Shows banner when `leaguesUpdating` is true

**Key difference from 503:**
- 503 = API down, no data → replace entire page with `FplUpdating`
- `leagues: "Updating"` = API works, data may be stale → show warning banner above content

## Data Fetching

### TanStack Query
All server state is managed with TanStack Query (React Query). This provides automatic caching, deduplication, background refetching, and loading/error states.

### Query Keys Factory
All query keys are centralized in `src/services/queryKeys.ts` for type safety and cache invalidation:

```typescript
import { queryKeys } from '../services/queryKeys'

// Usage in hooks:
queryKey: queryKeys.bootstrap                           // Static data
queryKey: queryKeys.standings(leagueId)                 // League standings
queryKey: queryKeys.managerDetails(managerId, gwId)     // Manager picks/history
queryKey: queryKeys.entryHistory(managerId)             // Entry history
queryKey: queryKeys.entryPicks(managerId, gw)           // Specific GW picks
queryKey: queryKeys.liveGameweek(gw)                    // Live scoring data
queryKey: queryKeys.playerSummary(playerId)             // Player element-summary
queryKey: queryKeys.fixturesAll                         // All fixtures
queryKey: queryKeys.eventStatus                         // Event status
```

**Benefits:**
- Type-safe keys prevent typos
- Single source of truth for cache invalidation
- IDE autocomplete for all query keys
- Easy refactoring when key structure changes

### Cache Times
Cache durations are defined in `src/config.ts`:

```typescript
import { CACHE_TIMES } from 'src/config'

staleTime: CACHE_TIMES.FIVE_MINUTES    // Bootstrap data
staleTime: CACHE_TIMES.TEN_MINUTES     // Fixtures
staleTime: Infinity                     // Completed gameweek data (immutable)
```

## Utility Functions

Reusable pure functions for calculations, data transformations, and business logic.

### Player Scoring (`utils/playerScoring.ts`)
Pure functions for player recommendation scoring. Used by `useRecommendedPlayers` hook.

| Function | Purpose | Returns |
|----------|---------|---------|
| `isEligibleOutfieldPlayer(player)` | Check if player eligible for recs (outfield, available, 450+ mins) | `boolean` |
| `calculatePlayerStats(player)` | Calculate per-90 stats (xG90, xA90, xGC90, cs90, form) | `PlayerStats` |
| `getPercentile(value, allValues)` | Rank value within distribution (0-1) | `number` |
| `calculatePlayerPercentiles(stats, percentiles, invertXGC)` | Get percentile rankings for all stats | `PlayerPercentiles` |
| `calculateBuyScore(pct, weights, fixtureScore)` | Score for punt/defensive recommendations | `number` |
| `calculateSellScore(pct, weights, fixtureScore)` | Score for "time to sell" (inverted - higher = worse) | `number` |
| `calculateFixtureScore(teamId, fixtures, currentGW)` | Weighted 5-GW fixture difficulty (0-1, 1=easiest) | `number` |
| `calculateLeagueOwnership(players, managerDetails)` | Ownership % per player in league | `Map<number, number>` |

**Weight configs:** `PUNT_WEIGHTS`, `DEFENSIVE_WEIGHTS`, `SELL_WEIGHTS`, `FIXTURE_WEIGHTS`

```typescript
import { calculateFixtureScore, isEligibleOutfieldPlayer, PUNT_WEIGHTS } from '../utils/playerScoring'

// Filter eligible players
const eligible = players.filter(isEligibleOutfieldPlayer)

// Calculate fixture difficulty for a team
const fixtureScore = calculateFixtureScore(teamId, fixtures, currentGW)
```

### Player Stats (`utils/playerStats.ts`)
Display formatting for player statistics and performance deltas.

| Function | Purpose | Returns |
|----------|---------|---------|
| `parseNumericString(value)` | Parse FPL string numbers ("5.2" → 5.2) | `number` |
| `formatDelta(value, decimals)` | Format with +/- sign ("+2.5", "-1.0") | `string` |
| `getDeltaClass(value, inverted?)` | CSS class for delta coloring | `'positive' \| 'negative' \| ''` |
| `getGoalsDeltaLegend(delta)` | "scored X more/fewer than xG" | `string` |
| `getAssistsDeltaLegend(delta)` | "X more/fewer assists than xA" | `string` |
| `getGoalsConcededDeltaLegend(delta)` | "conceded X more/fewer than expected" | `string` |
| `getGoalInvolvementsDeltaLegend(delta)` | "X more/fewer G+A than expected" | `string` |
| `getSeasonSummary(player, position)` | Position-specific season stats string | `string` |

```typescript
import { formatDelta, getDeltaClass, getGoalsDeltaLegend } from '../utils/playerStats'

const delta = goals - expectedGoals
const formatted = formatDelta(delta, 2)        // "+2.50"
const className = getDeltaClass(delta)         // "positive"
const legend = getGoalsDeltaLegend(delta)      // "scored 2.50 more than expected"
```

### Auto Subs (`utils/autoSubs.ts`)
Automatic substitution logic and fixture state utilities.

| Function | Purpose | Returns |
|----------|---------|---------|
| `buildTeamFixtureMap(fixtures)` | Map team ID → current GW fixture | `Map<number, Fixture>` |
| `hasFixtureStarted(teamId, teamFixtureMap)` | Check if team's fixture has begun | `boolean` |
| `isPlayerFixtureFinished(teamId, fixtures)` | Check if team's fixture is finished | `boolean` |
| `getOpponentInfo(teamId, teamFixtureMap, teamsMap)` | Get opponent name + (H)/(A) | `OpponentInfo` |
| `hasContribution(livePlayer)` | Check if player has any points contribution | `boolean` |
| `getPlayerEligibility(livePlayer, playerData)` | Determine if starter/bench player played | `'played' \| 'benched' \| 'unknown'` |
| `countFormation(picks, playersMap)` | Count positions in current formation | `{ DEF, MID, FWD }` |
| `canSubstitute(current, bench, playersMap, positionCounts)` | Check if bench player can legally substitute | `boolean` |
| `calculateAutoSubs(picks, liveData, fixtures)` | Determine which bench players come on | `AutoSubResult[]` |

**Constants:** `POSITION_LIMITS`, `STARTING_XI_MAX_POSITION`, `BENCH_POSITIONS`

```typescript
import { buildTeamFixtureMap, hasFixtureStarted, getOpponentInfo } from '../utils/autoSubs'

const fixtureMap = buildTeamFixtureMap(fixtures)
const started = hasFixtureStarted(player.team, fixtureMap)
const opponent = getOpponentInfo(player.team, fixtureMap, teamsMap)
```

### Template Team (`utils/templateTeam.ts`)
Build most-owned starting XI from league or global ownership.

| Function | Purpose | Returns |
|----------|---------|---------|
| `calculateOwnership(managerDetails, playersMap, teamsMap)` | League ownership % from manager picks | `Map<number, PlayerWithOwnership>` |
| `calculateWorldOwnership(players, teamsMap)` | Global ownership % from `selected_by_percent` | `Map<number, PlayerWithOwnership>` |
| `buildTemplateTeam(ownership)` | Most-owned valid starting XI (greedy formation) | `PlayerWithOwnership[]` |
| `getFormationString(players)` | Formation from positions (e.g., "3-5-2") | `string` |

### Fixture Rewards (`utils/fixtureRewards.ts`)
Extract bonus points and DefCon stats from finished fixtures.

| Function | Purpose | Returns |
|----------|---------|---------|
| `extractFixtureRewards(fixture, liveData, playersMap)` | Bonus + DefCon players per fixture | `FixtureRewards` |
| `extractAllFixtureRewards(fixtures, liveData, playersMap)` | Process all fixtures for rewards | `FixtureRewards[]` |

### Live Scoring (`utils/liveScoring.ts`)
Real-time points calculation and fixture state utilities.

| Function | Purpose | Returns |
|----------|---------|---------|
| `calculateProvisionalBonus(bpsScores)` | Calculate 3/2/1 bonus from BPS | `Map<number, number>` |
| `calculateLivePoints(livePlayer, multiplier)` | Points for single player with captain multiplier | `number` |
| `isFixtureLive(fixture)` | Check if fixture is currently in progress | `boolean` |
| `hasGamesInProgress(fixtures)` | Check if any fixtures are in progress | `boolean` |
| `allFixturesFinished(fixtures)` | Check if all fixtures are finished (provisional) | `boolean` |
| `hasAnyFixtureStarted(fixtures)` | Check if any fixture has started | `boolean` |
| `shouldShowProvisionalBonus(fixture)` | Check if provisional bonus should display | `boolean` |
| `calculateLiveManagerPoints(picks, liveData, fixtures)` | Total live points for manager's team | `LiveManagerPoints` |

```typescript
import { hasGamesInProgress, allFixturesFinished, isFixtureLive } from '../utils/liveScoring'

// Check live state
const gamesInProgress = hasGamesInProgress(fixtures)
const allDone = allFixturesFinished(fixtures)
const isLive = isFixtureLive(fixture)
```

### Mappers (`utils/mappers.ts`)
Create lookup Maps from FPL arrays.

| Function | Purpose | Returns |
|----------|---------|---------|
| `createPlayersMap(players)` | Player ID → Player | `Map<number, Player>` |
| `createTeamsMap(teams)` | Team ID → Team | `Map<number, Team>` |
| `createLivePlayersMap(liveData)` | Player ID → LivePlayer | `Map<number, LivePlayer>` |

```typescript
import { createPlayersMap, createTeamsMap } from '../utils/mappers'

const playersMap = createPlayersMap(bootstrap.elements)
const teamsMap = createTeamsMap(bootstrap.teams)
```

### Countdown (`utils/countdown.ts`)
Gameweek deadline countdown calculations.

| Function | Purpose | Returns |
|----------|---------|---------|
| `calculateTimeRemaining(deadline)` | Calculate days/hours/mins/secs until deadline | `TimeRemaining \| null` |

```typescript
import { calculateTimeRemaining } from '../utils/countdown'

const remaining = calculateTimeRemaining(gameweek.deadline_time)
// { days: 2, hours: 5, minutes: 30, seconds: 15 } or null if passed
```

### DefCon (`utils/defcon.ts`)
Defensive Contribution (DefCon) calculations for FPL 2025/26 bonus system.

| Function | Purpose | Returns |
|----------|---------|---------|
| `isOutfieldPosition(elementType)` | Type guard for DEF/MID/FWD positions | `boolean` |
| `getDefConThreshold(elementType)` | Get threshold for position (10 DEF, 12 MID/FWD) | `number \| null` |
| `metDefConThreshold(defensiveContrib, elementType)` | Check if player met threshold for one game | `boolean` |
| `calculatePlayerSeasonDefCon(history, elementType)` | Season DefCon stats (total, games, per-game) | `{ total, games, perGame }` |

**Constants:** `DEFCON_THRESHOLDS` (position thresholds), `DEFCON_BONUS_POINTS` (2 points per game)

```typescript
import { metDefConThreshold, calculatePlayerSeasonDefCon, DEFCON_THRESHOLDS } from '../utils/defcon'

// Check single game
const earnedDefCon = metDefConThreshold(player.defensive_contribution, player.element_type)

// Calculate season total
const { total, games, perGame } = calculatePlayerSeasonDefCon(history, player.element_type)
```

### Formatters (`utils/formatters.ts`)
Display formatting utilities.

| Function | Purpose | Returns |
|----------|---------|---------|
| `getPlayerDisplayName(player)` | Get display name (web_name or full name) | `string` |

```typescript
import { getPlayerDisplayName } from '../utils/formatters'

const name = getPlayerDisplayName(player) // "Salah" or "Mohamed Salah"
```

### Picks (`utils/picks.ts`)
FPL pick data utilities.

| Function | Purpose | Returns |
|----------|---------|---------|
| `getCaptainBadge(pick)` | Get captain badge for display | `'C' \| 'V' \| undefined` |

```typescript
import { getCaptainBadge } from '../utils/picks'

const badge = getCaptainBadge(pick) // "C", "V", or undefined
```

## Custom Hooks

React hooks for data fetching, state management, and business logic.

**Location:** Data-fetching hooks are in `services/queries/`, UI hooks are in `hooks/`.

### Data Fetching Hooks (`services/queries/`)

| Hook | Purpose | Key Returns |
|------|---------|-------------|
| `useFplData()` | Main data hook - bootstrap, standings, managers | `{ standings, managerDetails, currentGameweek, isLive, isApiUnavailable }` |
| `useHistoricalData({ managerIds, currentGw })` | Fetch all completed GW data (immutable, cached forever) | `{ liveDataByGw, picksByManagerAndGw, completedGameweeks }` |
| `useLiveScoring(isLive, gw)` | Poll live data during active gameweeks | `{ liveData, fixtures, isLoading }` |
| `usePlayerDetails({ playerId })` | Element-summary + calculated stats | `{ player, history, fixtures, isLoading }` |

### Calculated Data Hooks (`services/queries/`)

| Hook | Purpose | Key Returns |
|------|---------|-------------|
| `useBenchPoints(managers, historicalData)` | Cumulative bench points per manager | `{ benchPoints: ManagerBenchPoints[] }` |
| `useCaptainDifferential(managers, historicalData)` | Captain picks vs template | `{ differentials: CaptainDifferential[] }` |
| `useFreeTransfers(managers)` | Calculate remaining FTs | `{ freeTransfers: FreeTransferData[] }` |
| `useLeaguePositionHistory(managers, currentGw)` | Position per GW for bump chart | `{ positionHistory: PositionHistory[] }` |
| `useRecommendedPlayers(players, managers, teams, gw)` | Player recommendations | `{ punts, defensive, toSell }` |
| `useHeadToHeadComparison(params)` | Compare two managers | `{ managerA, managerB, loading, error }` |

### UI State Hooks (`hooks/`)

| Hook | Purpose | Key Returns |
|------|---------|-------------|
| `useTheme()` | Dark/light theme with system preference | `{ theme, toggleTheme, setTheme }` |
| `useReleaseNotification()` | Release banner visibility | `{ showNotification, dismiss }` |

### Cookie Consent (`hooks/useCookieConsent.ts`)
Utility functions for cookie consent checks (not a hook, but related utilities).

| Function | Purpose | Returns |
|----------|---------|---------|
| `hasConsent(category)` | Check if category is accepted | `boolean` |
| `hasPreferencesConsent()` | Check preferences consent | `boolean` |
| `hasAnalyticsConsent()` | Check analytics consent | `boolean` |
| `openCookiePreferences()` | Open preferences modal | `void` |
| `acceptAllCookies()` | Accept all categories | `void` |
| `acceptNecessaryOnly()` | Accept necessary only | `void` |
| `acceptCategories(categories)` | Accept specific categories | `void` |

```typescript
import { useFplData } from 'services/queries/useFplData'
import { useHistoricalData } from 'services/queries/useHistoricalData'

// Main data loading
const { standings, currentGameweek, isLive } = useFplData()

// Historical data with infinite caching
const { liveDataByGw, picksByManagerAndGw } = useHistoricalData({
  managerIds,
  currentGameweek,
  enabled: currentGameweek > 1,
})
```

## Reusable Components

Generic UI components that can be composed across features.

### Modal (`components/Modal.tsx`)
Accessible modal using native `<dialog>` element with focus trap, ESC to close, and backdrop click.

```tsx
import { Modal } from '../components/Modal'

<Modal isOpen={isOpen} onClose={onClose} title="Modal Title">
  {children}
</Modal>
```

**Props:** `isOpen`, `onClose`, `title?`, `children`

### LoadingState (`components/LoadingState.tsx`)
Centered loading spinner with optional message. Use for page/section loading.

```tsx
import { LoadingState } from '../components/LoadingState'

<LoadingState message="Loading data..." size="md" />
```

**Props:** `message?` (default: "Loading..."), `size?` ("sm" | "md" | "lg"), `className?`

### Spinner (`components/Spinner.tsx`)
Animated loading spinner with size variants. Used by LoadingState.

```tsx
import { Spinner } from '../components/Spinner'

<Spinner size="lg" />
```

**Props:** `size?` ("sm"=24px, "md"=40px, "lg"=56px), `className?`

### PitchLayout (`components/PitchLayout.tsx`)
Generic pitch layout with player rows (FWD → MID → DEF → GK) and optional bench.

```tsx
import { PitchLayout } from '../components/PitchLayout'

<PitchLayout
  players={startingXI}
  renderPlayer={(player) => <MyPlayerCard player={player} />}
  bench={{ players: benchPlayers, renderPlayer: (p) => <MyBenchCard player={p} /> }}
/>
```

**Props:** `players`, `renderPlayer`, `bench?` (with `players` and `renderPlayer`)

### PitchPlayer (`components/PitchPlayer.tsx`)
Player card for pitch display with shirt, name, stat, and optional captain badge.

```tsx
import { PitchPlayer } from '../components/PitchPlayer'

<PitchPlayer
  name="Salah"
  shirtUrl={PitchPlayer.getShirtUrl(teamCode)}
  teamShortName="LIV"
  stat={<span>12 pts</span>}
  badge="C"
  onClick={() => openModal(playerId)}
/>
```

**Props:** `name`, `shirtUrl`, `teamShortName`, `stat` (ReactNode), `badge?` ("C" | "V"), `isBench?`, `onClick?`

**Static method:** `PitchPlayer.getShirtUrl(teamCode)` - Returns FPL shirt image URL

### CardRow (`components/CardRow.tsx`)
Unified row component for ranked lists and stat cards. Uses CSS Grid for consistent column alignment.

```tsx
import { CardRow } from '../components/CardRow'

// Basic usage
<CardRow label="Manager Name" value="100 pts" />

// With rank
<CardRow rank={1} label="Manager Name" value="100 pts" />

// Clickable row
<CardRow label="Manager Name" value="100 pts" onClick={handleClick} />

// Value colors (default, success, warning, error, muted, gold)
<CardRow label="Free Transfers" value="5 FT" valueColor="gold" />

// Custom children instead of value
<CardRow rank={1} label="Manager Name">
  <ChipBadges chips={chips} />
</CardRow>
```

**Props:** `label`, `value?`, `rank?`, `valueColor?`, `onClick?`, `children?`

**CSS Grid layouts:**
| Scenario | Columns |
|----------|---------|
| Basic | `1fr auto` |
| With rank | `20px 1fr auto` |
| Clickable | `1fr auto auto` |
| Clickable + rank | `20px 1fr auto auto` |

**Used by:** FreeTransfers, ChipsRemaining, CaptainSuccess, PlayerOwnership, StatsCards, LeaguePositionChart

### HistoryTable (`features/PlayerDetails/components/HistoryTable.tsx`)
TanStack Table for player gameweek history with icons and pagination.

```tsx
import { HistoryTable } from 'features/PlayerDetails/components/HistoryTable'

<HistoryTable
  data={playerHistory}
  playerPosition={player.element_type}
  teams={bootstrap.teams}
/>
```

**Props:** `data` (PlayerHistory[]), `playerPosition`, `teams` (Team[])

**Note:** Has known React Compiler warning (`react-hooks/incompatible-library`) due to TanStack Table's getter pattern. Performance impact is negligible for small tables. For large tables (1000+ rows), consider adding `@tanstack/react-virtual` for windowing.

### ThemeToggle (`components/ThemeToggle.tsx`)
Sun/Moon button for toggling dark mode. Uses `useTheme` hook internally.

```tsx
import { ThemeToggle } from '../components/ThemeToggle'

<ThemeToggle />
```

### InfoTooltip (`components/InfoTooltip/InfoTooltip.tsx`)
Accessible info icon with tooltip on hover/focus. Works on desktop (hover) and touch devices (tap triggers focus).

```tsx
import { InfoTooltip } from 'components/InfoTooltip'

<span>
  Some label <InfoTooltip text="Explanation of this metric" size={14} />
</span>
```

**Props:** `text` (tooltip content), `size?` (icon size in px, default 14)

**Accessibility:**
- Uses `<button>` element for keyboard/touch accessibility
- `aria-describedby` links icon to tooltip content
- `role="tooltip"` on tooltip span
- `aria-hidden="true"` on decorative icon

## Biome (Formatter)

We use [Biome](https://biomejs.dev/) for code formatting. The project uses a **monorepo setup** with configs at both root and frontend levels.

### Configuration Files

| File | Purpose |
|------|---------|
| `/biome.json` | Root config with VCS integration, formatter/linter disabled |
| `/frontend/biome.json` | Frontend config with `root: false`, full formatter settings |

### Monorepo Setup

The `root: false` in frontend's config tells Biome to look for a parent config and merge settings. The root config provides:
- **VCS integration**: `useIgnoreFile: true` respects `.gitignore`
- **Disabled formatter/linter**: Prevents formatting files outside frontend

### Commands

```bash
npm run format       # Check formatting (CI mode, no writes)
npx biome format .   # Format all files (writes changes)
npx biome check .    # Run all checks
```

### VS Code Integration

Biome formats on save for JS/TS/TSX/JSON/CSS files. Settings are in `.vscode/settings.json` (gitignored).

Key settings:
- `biome.enabled`: true
- `biome.requireConfiguration`: true
- `editor.defaultFormatter`: "biomejs.biome" per file type
- `editor.formatOnSave`: true per file type

### Formatter Rules

| Setting | Value |
|---------|-------|
| Indent | 2 spaces |
| Line width | 100 |
| Quotes | Single |
| Semicolons | Always |
| Trailing commas | ES5 |
| Line endings | LF |

## Styling - CSS Modules

We use CSS Modules with native CSS nesting for component styling.

### File Naming
- Component: `ComponentName.tsx`
- Styles: `ComponentName.module.css`
- Types (auto-generated): `ComponentName.module.css.d.ts`

### CSS Structure Pattern
**IMPORTANT**: Each CSS module must have a single root class matching the filename (PascalCase), with all other styles nested inside.

```css
/* ComponentName.module.css */
.ComponentName {
  /* Root container styles */

  .childElement {
    /* Nested child styles - scoped to root */
  }

  .element {
    /* Base element */

    &.-modifier {
      /* Modifier variant (BEM-like) */
    }
  }
}

/* @keyframes must be at top level (outside root class) */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

### Type Generation
```bash
npm run css:types        # Generate .d.ts files for all CSS modules
npm run css:types:watch  # Watch mode for development
```

The `css:types` script generates TypeScript definitions:
1. `tcm` (typed-css-modules) generates `.d.ts` files
2. `fix-css-types.cjs` post-processes to preserve PascalCase class names
3. Biome formats the generated files

### Usage in Components
```tsx
import * as styles from './ComponentName.module.css';

// Single class
<div className={styles.container}>

// Multiple classes (base + modifier)
<div className={`${styles.cell} ${styles.center}`}>

// Conditional modifier
<tr className={`${styles.row} ${isActive ? styles.active : ''}`}>
```

### CSS Variables
Global CSS variables are defined in `src/styles/variables.css` and imported in `index.css`.
Use variables for colors, spacing, typography, and other design tokens.

**Key color variables:**
| Variable | Purpose | Value |
|----------|---------|-------|
| `--color-success` | Positive values, gains | Green |
| `--color-warning` | Caution states | Yellow/amber |
| `--color-error` | Negative values, losses | Red |
| `--color-gold` | Premium/max states (5 FT) | `#d4a400` (WCAG AA) |
| `--color-text-muted` | Secondary text, low values | Gray |

### Dark Theme
Dark theme is implemented using CSS custom properties with a `[data-theme="dark"]` selector.

**Key files:**
- `src/styles/variables.css` - Dark theme color overrides
- `src/hooks/useTheme.ts` - Theme state management with system preference detection
- `src/components/Header.tsx` - iOS-style toggle switch in hamburger menu
- `index.html` - Flash prevention script in `<head>`

**Flash prevention:** Inline script in `<head>` sets `data-theme` before first render to prevent white flash.

## Feature Documentation

### Live Scoring
Real-time updates during active gameweeks with automatic table re-sorting and provisional bonus display.

**Key files:**
- `src/services/queries/useFplData.ts` - Main data hook, determines `isLive` state
- `src/services/queries/useLiveScoring.ts` - Polls live data and fixtures at intervals
- `src/utils/liveScoring.ts` - Points calculation utilities
- `src/components/LeagueStandings.tsx` - Displays live-sorted standings

**State Determination:**

| State | Condition | Behavior |
|-------|-----------|----------|
| `isLive` | `deadline_time < now AND !currentGameweek.finished` | Enables polling |
| `hasGamesInProgress` | `fixtures.some(f => f.started && !f.finished_provisional)` | Shows "LIVE" badge |

**Live Points Calculation:**
1. For each pick with `multiplier > 0` (starting XI):
   - Get `total_points` from `/event/{gw}/live/` endpoint
   - Apply captain multiplier (1=normal, 2=captain, 3=triple captain)
2. Add provisional bonus (if `stats.bonus === 0` and fixture >= 60 mins)
3. Subtract transfer hits cost

**Provisional Bonus Logic:**
- Calculated from BPS (Bonus Points System) scores per fixture
- Top 3 BPS get 3/2/1 bonus points
- Tie handling: tied players share same bonus
- Only shown when fixture >= 60 minutes OR finished

**Polling Behavior:**
- Default interval: 60 seconds
- Always fetches once on mount for fixture status
- Only sets up interval polling when `isLive === true`

### Bench Points
Tracks cumulative "wasted" points left on the bench across all completed gameweeks.

**Key files:**
- `src/services/queries/useBenchPoints.ts` - Fetches historical picks and calculates bench points
- `src/features/BenchPoints/BenchPoints.tsx` - Displays ranked list

**Implementation notes:**
- Bench players are positions 12-15 (multiplier=0)
- Excludes bench boost weeks (those points actually counted)

### Captain Differential
Tracks when managers pick a captain different from the global template (most-captained player).

**Key files:**
- `src/services/queries/useCaptainSuccess.ts` - `useCaptainDifferential` hook
- `src/features/CaptainSuccess/CaptainSuccess.tsx` - Displays "Differential Captains" card
- `src/features/CaptainSuccess/components/DifferentialModal.tsx` - Per-GW breakdown modal

**Metrics:**
- **Differential Picks**: Count of non-template captain picks
- **Differential Gain**: Net points vs template captain

### League Position Chart
A "bump chart" showing how each manager's league position changed across gameweeks.

**Key files:**
- `src/services/queries/useLeaguePositionHistory.ts` - Fetches entry history and calculates positions
- `src/features/LeaguePosition/LeaguePosition.tsx` - Recharts LineChart with inverted Y-axis

### League Template Team
Shows the most owned starting XI across all managers in the league.

**Key files:**
- `src/components/LeagueTemplateTeam.tsx` - Main component
- `src/components/PitchLayout.tsx` - Reusable pitch layout with SVG background
- `src/components/PitchPlayer.tsx` - Shared player display component
- `src/utils/templateTeam.ts` - Ownership calculation and team building logic

**Algorithm:**
1. Calculate ownership % for each player (count / total managers × 100)
2. Sort players by ownership within each position
3. Fill positions: 1 GK, then greedily fill DEF/MID/FWD to reach 11 players
4. Determine formation string (e.g., "3-5-2") from selected players

### Free Transfers Tracker
Shows remaining free transfers for each manager in the league with color-coded values.

**Key files:**
- `src/services/queries/useFreeTransfers.ts` - Core calculation logic
- `src/features/FreeTransfers/FreeTransfers.tsx` - Display component with deadline awareness

**Color gradient:** Values are color-coded to quickly identify banked transfers:
| FT Count | Color |
|----------|-------|
| 1 | Gray (muted) |
| 2 | Yellow (warning) |
| 3-4 | Green (success) |
| 5 | Gold |

**FPL Free Transfer Rules (introduced 2024/25, continues in 2025/26):**
- Start with 1 FT at beginning of season
- Gain +1 FT per gameweek (max **5** can be banked)
- Wildcard resets FT to 1
- Free Hit doesn't consume FT

### Game Rewards
Shows bonus points (3/2/1) and defensive contribution (DefCon) points per fixture.

**Key files:**
- `src/utils/fixtureRewards.ts` - Core extraction logic
- `src/components/GameRewards.tsx` - Card component

**FPL 2025/26 Rules:**
- **Bonus Points**: Top 3 BPS scores get 3/2/1 points
- **DefCon**: 2 points for meeting threshold (DEF: 10+ CBIT, MID/FWD: 12+ CBITr)

### Player Recommendations
Three recommendation lists: Punts, Defensive, Time to Sell.

**Key files:**
- `src/services/queries/useRecommendedPlayers.ts` - Core calculation logic with scoring algorithms
- `src/features/Recommendations/Recommendations.tsx` - Three-card display component

| Type | Ownership Filter | Description |
|------|------------------|-------------|
| Punts | < 40% | Differential picks |
| Defensive | 40-100% | Template picks |
| Time to Sell | > 0% (owned) | Underperforming players |

### Head-to-Head Comparison
Compare any two managers in the league with detailed statistics.

**Key files:**
- `src/features/HeadToHead/HeadToHead.tsx` - Main component with matchup-style UI
- `src/services/queries/useHeadToHeadComparison.ts` - Fetches and calculates comparison stats
- `src/utils/comparison.ts` - Comparison utilities (formatting, CSS classes)
- `src/utils/chips.ts` - Chip utilities including half-season tracking
- `src/utils/templateTeam.ts` - Template team calculation (league and world)

**Stats Compared:**
- **Season Overview**: Total points, overall rank, league rank, last 5 GW average
- **Transfers**: Total transfers, remaining FTs, hits taken, points lost to hits
- **Captain**: Total captain points, differential captain picks
- **Chips**: Used/remaining chips for current half (2025/26 rules: reset at GW20)
- **Value**: Squad value, bank balance
- **Playstyle**: Template overlap scores for both League and World templates
- **Analytics (Tier 2)**: Form momentum, recovery rate (with InfoTooltip explanations)

**Tier 2 Analytics:**
| Metric | Calculation | Values |
|--------|-------------|--------|
| Form Momentum | Compare last 3 GW avg vs previous 3 GW avg | "Improving" (>5%), "Stable" (±5%), "Declining" (<-5%) |
| Recovery Rate | Average points in GWs following a red arrow (rank drop) | Number (higher = better bounce-back ability) |

**Template Types:**
| Type | Source | Description |
|------|--------|-------------|
| League | Mini-league managers | Most owned starting XI in your league |
| World | FPL `selected_by_percent` | Most owned starting XI globally |

**Playstyle Labels:**
| Label | Match Count | Description |
|-------|-------------|-------------|
| Template | 9-11 | Follows the meta |
| Balanced | 6-8 | Mix of template and differentials |
| Differential | 3-5 | Mostly unique picks |
| Maverick | 0-2 | Highly contrarian |

### Player Details Modal
Detailed player stats modal accessible from pitch players in ManagerModal or Analytics page.

**Key files:**
- `src/features/PlayerDetails/PlayerDetails.tsx` - Main modal component with tabbed interface
- `src/services/queries/usePlayerDetails.ts` - Fetches element-summary and calculates derived stats
- `src/features/PlayerDetails/PlayerDetails.module.css` - Styles with responsive breakpoints
- `src/features/PlayerDetails/PlayerDetails.test.tsx` - Unit tests (16 tests)
- `src/features/PlayerDetails/components/HistoryTable.tsx` - TanStack Table for season history
- `tests/player-modal.spec.ts` - E2E visual regression tests

**Tabs:**
1. **Overview** - Form trend, expected stats (xG/xA/xGI/xGC), performance deltas
2. **Fixtures** - Upcoming 5 fixtures with FDR difficulty colors
3. **History** - Full season history with visual icons (goals, assists, CS, bonus)

**Stats Displayed:**
- **Form vs Average**: Current form compared to season average
- **Expected Stats**: xG, xA, xGI, xGC with per-90 values
- **Performance Deltas**: Goals vs xG, assists vs xA (over/underperformance)
- **DefCon**: For DEF/MID only - shows if meeting defensive threshold
- **Price**: Current price with weekly change indicator

**Opening the Modal:**
```tsx
// From PitchPlayer component
<PitchPlayer
  player={player}
  onPlayerClick={(playerId) => setSelectedPlayerId(playerId)}
/>

// PlayerModal receives playerId and fetches details
<PlayerModal
  playerId={selectedPlayerId}
  onClose={() => setSelectedPlayerId(null)}
/>
```

**SVG Imports:**
The modal uses inline SVG for the football icon. SVG imports with `?react` suffix require type declaration in `src/vite-env.d.ts`:
```typescript
declare module '*.svg?react' {
  import type { FC, SVGProps } from 'react'
  const content: FC<SVGProps<SVGElement>>
  export default content
}
```

### Cookie Consent
GDPR-compliant cookie consent using `vanilla-cookieconsent` library.

**Key files:**
- `src/components/CookieConsent.tsx` - Banner component with category configuration
- `src/hooks/useCookieConsent.ts` - Utility functions for checking consent

**Categories:** Necessary (read-only), Preferences, Analytics

### Release Notification
Dismissible banner on Dashboard alerting users to new releases.

**Key files:**
- `src/config/releases.ts` - Shared releases data
- `src/hooks/useReleaseNotification.ts` - Hook managing visibility
- `src/components/ReleaseNotification.tsx` - Blue info banner component

**Display format:** `✨ v0.13.0 — 1 new feature`

## Testing

### Testing Philosophy

**Test a lot, mostly integration tests.**

| Layer | Approach | Examples |
|-------|----------|----------|
| **Pure functions** | Unit tests with high coverage | `liveScoring.ts`, `playerStats.ts`, `autoSubs.ts` |
| **Small components** | Low coverage, test via integration | `Spinner`, `Card`, `PitchPlayer` - tested through parent components |
| **Container components** | Integration tests | `PlayerModal`, `ManagerModal`, `LeagueStandings` |
| **E2E tests** | Cover views and user flows | Dashboard navigation, modal interactions |
| **Visual snapshots** | Ensure style consistency | Prevent CSS regressions across pages |

**Why this approach?**
- Pure functions are easy to test in isolation and have clear inputs/outputs
- Small components change frequently and are better tested through their containers
- Integration tests catch real bugs at component boundaries
- E2E tests verify the app works as users expect
- Snapshots catch unintended visual changes without manual verification

### Commands
```bash
npm test                    # Watch mode (unit tests)
npm test -- --run           # Single run
npm run test:e2e:docker     # E2E tests in Docker (CI-matching)
```

### Visual Snapshot Testing

⚠️ **CRITICAL: Always use Docker for E2E tests and snapshots!**

E2E tests include visual regression tests using Playwright's `toHaveScreenshot()`. **All E2E tests MUST run in Docker** using the official Playwright image.

```bash
# Run E2E tests (use this always)
npm run test:e2e:docker

# Update visual snapshots (use this when snapshots need updating)
npm run test:e2e:docker -- --update-snapshots
```

**Never run `npx playwright test` directly** - this uses local fonts/rendering that differs from CI.

**Why Docker is mandatory:**
- CI runs in Docker with specific fonts and rendering
- Local `npx playwright test` produces different pixel output
- Snapshots generated locally will fail in CI
- Docker ensures: local snapshots = CI snapshots

**Docker image:** `mcr.microsoft.com/playwright:v1.57.0-jammy` (must match `@playwright/test` version)

**Why production build (preview mode):**
The Playwright config uses `npm run build && npm run preview` instead of `npm run dev`:
- Dev mode conditionally loads TanStack Query Devtools (when `import.meta.env.DEV`)
- Devtools lazy-load with timing inconsistencies, causing snapshot differences
- Production build ensures `DEV=false`, so devtools never render
- This matches what users see in production

### Test Files

**Unit tests:** `src/hooks/*.test.ts`, `src/utils/*.test.ts`, `src/components/*.test.tsx`

**E2E tests:** `tests/*.spec.ts`

**Test fixtures:** `tests/fixtures/test-fixtures.ts`, `tests/fixtures/mock-data.ts`

### React Testing Library Best Practices

**The Golden Rule**: Test behavior, not implementation details.

**Query Priority:**
1. `getByRole` - Best choice; validates accessibility
2. `getByLabelText` - For form inputs
3. `getByText` - For non-interactive content
4. `getByTestId` - Last resort

**Use `user-event` over `fireEvent`:**
```tsx
const user = userEvent.setup()
await user.type(input, 'hello')
await user.click(screen.getByRole('button'))
```

**Use `findBy*` for async elements:**
```tsx
const button = await screen.findByRole('button')
```

## Icons

We use [Lucide React](https://lucide.dev/) for SVG icons (dark theme compatible).

### Icon Assignments

| Section | Icon | Color |
|---------|------|-------|
| Chips | `Zap` | `#FFE033` (electric yellow) |
| Transfers | `ArrowRight` + `ArrowLeft` | green + red |
| Team Values | `Coins` | `#FFD700` (gold) |
| Bench Points | `Armchair` | `#6B8CAE` (steel blue) |
| Differential Captains | `Crown` | `#FFD700` (gold) |
| Player Ownership | `Users` | `#14B8A6` (teal) |
| League Position Chart | `TrendingUp` | `#6366f1` (indigo) |
| Punts | `Dices` | `#F59E0B` (amber) |
| Defensive Options | `Shield` | `#14B8A6` (teal) |
| Time to Sell | `TrendingDown` | `#EF4444` (red) |
| Game Rewards | `Trophy` | `#FFD700` (gold) |
| Head-to-Head | `Swords` | `#9333ea` (purple) |

## Release Notes Workflow

**IMPORTANT**: Before every `feat:` or `fix:` commit, add a release note first.

### Process
1. Complete your feature or fix
2. Add release note: `node scripts/add-release-note.js "Title" "Description" [type]`
3. Stage all changes including Changelog.tsx
4. Commit with `feat:` or `fix:` prefix

### Commands
```bash
# Add a feature release note
node scripts/add-release-note.js "Feature Title" "Description" feature

# Add a fix release note
node scripts/add-release-note.js "Bug Fix Title" "What was fixed." fix

# Interactive mode
node scripts/add-release-note.js
```

### Files
- `src/views/Changelog.tsx` - User-visible changelog
- `scripts/add-release-note.js` - CLI tool to add notes

## TODO / Tech Debt

- [ ] **Inconsistent CSS file naming**: Some CSS files use `*.module.css` (correct) while others use plain `*.css`. All component styles should use CSS Modules naming (`ComponentName.module.css`). Files to fix:
  - `src/App.css` → `src/App.module.css`
  - `src/components/CookieConsent.css` → `src/components/CookieConsent.module.css`
  - (run `find src -name "*.css" ! -name "*.module.css"` to find others)
