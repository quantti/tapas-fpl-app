# Tapas FPL App

A Fantasy Premier League companion app for tracking league standings, player stats, and live gameweek data.

## Tech Stack

- **Frontend**: Vite + React 18 + TypeScript
- **Routing**: React Router v6
- **State Management**: TanStack Query (React Query) for server state
- **Charts**: Recharts for data visualization
- **Icons**: Lucide React
- **API Proxy**: Cloudflare Workers (edge caching, <50ms cold starts)
- **Backend**: Python FastAPI on Fly.io (future analytics only)
- **Database**: Supabase (PostgreSQL 17)
- **Hosting**: Vercel (frontend), Cloudflare (worker), Fly.io (backend)
- **Testing**: Vitest + React Testing Library + Playwright (E2E)

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Vite + React  │────▶│ Cloudflare       │────▶│    FPL API      │
│   TypeScript    │     │ Workers          │     │                 │
│                 │     │ (Edge proxy +    │     │                 │
│   Vercel        │     │  tiered caching) │     │                 │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │
        │ (future analytics)
        ▼
┌──────────────────┐     ┌─────────────────┐
│  Python FastAPI  │────▶│   Supabase      │
│  (Fly.io)        │     │   PostgreSQL 17 │
│  analytics only  │     │   (EU West)     │
└──────────────────┘     └─────────────────┘
```

**Why this architecture?**
- Cloudflare Workers: <50ms cold starts (V8 isolates), perfect for API proxy
- Fly.io: Full Python environment for future ML/analytics (has 2-3s cold starts)

## Cloudflare Worker Cache TTLs

The Worker proxy (`worker/src/index.ts`) uses tiered cache TTLs to balance freshness with performance:

| Endpoint | TTL | Rationale |
|----------|-----|-----------|
| `/bootstrap-static` | 5 min | Contains `is_current` gameweek flag - must stay fresh! |
| `/fixtures` | 15 min | Changes when matches start/end |
| `/event/{gw}/live` | 2 min | Live scores during matches |
| `/entry/{id}/event/{gw}/picks` | 1 hour | Historical picks are immutable |
| `/leagues-classic/{id}/standings` | 5 min | Updates during active gameweeks |
| `/entry/{id}/history` | 5 min | Changes after transfers |
| `/element-summary/{id}` | 30 min | Player stats, moderate freshness |
| `/event-status` | 1 min | Processing state indicator |
| Default | 5 min | Fallback for unmatched endpoints |

**Important:** Bootstrap-static was previously cached for 6 hours, which caused stale gameweek data during GW transitions. Keep this at 5 minutes or less.

## Pages & Routing

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Dashboard` | Main view: league standings, transfers, countdown |
| `/statistics` | `Statistics` | Stats cards, bench points, captain success, charts |
| `/analytics` | `Analytics` | Player recommendations |

**Header Navigation:**
- Hamburger menu with links to Dashboard and Statistics
- Dark mode toggle (iOS-style switch)
- Active page highlighting

## Features

- [x] Live standings with real-time score updates and re-sorting
- [x] Mini-league standings with manager details modal
- [x] Player ownership percentages across league
- [x] Dark mode with system preference detection
- [x] Bench points tracking (cumulative wasted points)
- [x] Captain differential tracker
- [x] League position history chart (bump chart)
- [x] Chips remaining tracker
- [x] Transfers display (in/out per manager)
- [x] Team value and hit stats
- [x] Gameweek countdown banner (shows after all fixtures finish)
- [x] Header navigation with hamburger menu
- [x] Player recommendations (Punts, Defensive, Time to Sell) with position badges
- [x] League Template Team (most owned starting XI in pitch formation)
- [x] Graceful 503 error handling ("FPL is updating" message during gameweek transitions)
- [x] Game Rewards (bonus points + DefCon per fixture with position-specific thresholds)

## FPL API Reference

Base URL: `https://fantasy.premierleague.com/api/`

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

### Notes

- No official documentation — API is unofficial
- No CORS headers — requires backend proxy
- Rate limiting exists but is undocumented — implement caching
- Data updates a few times per day during active gameweeks

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
- `src/hooks/useFplData.ts` - Exposes `isApiUnavailable` boolean

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

**Implementation notes:**
- All views (Dashboard, Statistics, Analytics) check `isApiUnavailable`
- FplUpdating shows spinning refresh icon with explanation text
- E2E tests in `tests/error-states.spec.ts` verify 503 handling

## Styling - CSS Modules

We use CSS Modules with native CSS nesting for component styling.

### File Naming
- Component: `ComponentName.tsx`
- Styles: `ComponentName.module.css`
- Types (auto-generated): `ComponentName.module.css.d.ts`

### CSS Structure Pattern
**IMPORTANT**: Each CSS module must have a single root class matching the filename (PascalCase), with all other styles nested inside. See `FixturesTest.module.css` for a canonical example.

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

    &:hover {
      /* Pseudo-states */
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
The `css:types` script generates TypeScript definitions for CSS modules:
1. `tcm` (typed-css-modules) generates `.d.ts` files
2. `fix-css-types.cjs` post-processes to preserve PascalCase class names (tcm lowercases them)
3. Biome formats the generated files

**Note**: The fix script is needed because `tcm --namedExports` converts `ComponentName` to `componentName` in exports.

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

### Commands
```bash
npm run css:types        # Generate .d.ts files for all CSS modules
npm run css:types:watch  # Watch mode for development
```

### CSS Variables
Global CSS variables are defined in `src/styles/variables.css` and imported in `index.css`.
Use variables for colors, spacing, typography, and other design tokens.

### Dark Theme
Dark theme is implemented using CSS custom properties with a `[data-theme="dark"]` selector.

**Key files:**
- `src/styles/variables.css` - Dark theme color overrides
- `src/hooks/useTheme.ts` - Theme state management with system preference detection
- `src/components/Header.tsx` - iOS-style toggle switch in hamburger menu
- `index.html` - Flash prevention script in `<head>`

**Theme variables:**
```css
[data-theme="dark"] {
  --color-background: var(--gray-900);
  --color-surface: var(--gray-800);
  --color-text: var(--gray-100);
  --color-primary-text: #a855f7; /* Brighter purple for dark mode */
}
```

**Flash prevention:** Inline script in `<head>` sets `data-theme` before first render to prevent white flash.

### Bench Points Feature
Tracks cumulative "wasted" points left on the bench across all completed gameweeks.

**Key files:**
- `src/hooks/useBenchPoints.ts` - Fetches historical picks and calculates bench points
- `src/components/BenchPoints.tsx` - Displays ranked list

**Implementation notes:**
- Fetches picks for each manager for all gameweeks 1 to (current - 1)
- Bench players are positions 12-15 (multiplier=0)
- Excludes bench boost weeks (those points actually counted)
- Uses `/event/{gw}/live/` for player points per gameweek

### Captain Differential Feature
Tracks when managers pick a captain different from the global template (most-captained player) and whether it paid off.

**Key files:**
- `src/hooks/useCaptainSuccess.ts` - `useCaptainDifferential` hook fetches historical picks
- `src/components/CaptainSuccess.tsx` - Displays "Differential Captains" card
- `src/components/CaptainDifferentialModal.tsx` - Per-GW breakdown modal

**Metrics calculated:**
- **Differential Picks**: Count of times a manager picked a non-template captain
- **Differential Gain**: Net points gained/lost compared to if they'd captained the template

**Modal detail view:**
Clicking a manager row opens a modal showing:
- Each gameweek where they made a differential pick
- Their captain choice vs the template captain
- Points scored by each
- Gain/loss for that specific gameweek

**Implementation notes:**
- Template captain = `most_captained` from bootstrap-static (global FPL, not just league)
- Handles Triple Captain (3× multiplier for both actual and template comparison)
- Only shows managers who made at least one differential pick
- Sorted by highest differential gain (best differential pickers first)

### League Position Chart
A "bump chart" showing how each manager's league position changed across gameweeks.

**Key files:**
- `src/hooks/useLeaguePositionHistory.ts` - Fetches entry history and calculates positions
- `src/components/LeaguePositionChart.tsx` - Recharts LineChart with inverted Y-axis

**Implementation notes:**
- FPL API only provides overall rank, not league position
- League position is calculated by sorting managers by `total_points` at each gameweek
- Uses `useQueries` to fetch all manager histories in parallel
- Chart has horizontal scroll for later gameweeks (min 25px per GW)
- Y-axis is reversed (position 1 at top)

### League Template Team
Shows the most owned starting XI across all managers in the league, displayed in a pitch formation view.

**Key files:**
- `src/components/LeagueTemplateTeam.tsx` - Main component rendering the template team
- `src/components/PitchLayout.tsx` - Reusable pitch layout with SVG background and optional bench
- `src/components/PitchPlayer.tsx` - Shared player display component (shirt, name, stat)
- `src/utils/templateTeam.ts` - Ownership calculation and team building logic
- `public/pitch.svg` - Football pitch SVG background

**Implementation notes:**
- Calculates ownership percentage for each player across all managers
- Builds optimal 11-player team using greedy position-filling algorithm
- Supports formations: picks best available players per position (GK, DEF, MID, FWD)
- Uses FPL shirt images from official CDN
- Responsive breakpoints: tablet (≤900px) and mobile (≤480px) with smaller player cards
- PitchLayout and PitchPlayer are reused by ManagerModal for team lineup display

**Algorithm:**
1. Calculate ownership % for each player (count / total managers × 100)
2. Sort players by ownership within each position
3. Fill positions: 1 GK, then greedily fill DEF/MID/FWD to reach 11 players
4. Determine formation string (e.g., "3-5-2") from selected players

### Live Scoring
Real-time updates during active gameweeks with automatic table re-sorting and provisional bonus display.

**Key files:**
- `src/hooks/useFplData.ts` - Main data hook, determines `isLive` state, fetches manager picks
- `src/hooks/useLiveScoring.ts` - Polls live data and fixtures at intervals
- `src/utils/liveScoring.ts` - Points calculation utilities (bonus, multipliers)
- `src/components/LeagueStandings.tsx` - Displays live-sorted standings with provisional bonus
- `src/views/Dashboard.tsx` - Orchestrates live data flow to components

**Data Flow:**
```
useFplData (isLive, managerDetails with picks)
     │
     ▼
useLiveScoring (liveData, fixtures) ──polling when isLive──▶ FPL API
     │
     ▼
LeagueStandings
  ├── calculateLiveManagerPoints() for each manager
  ├── Re-sort by liveTotal
  └── Display provisional bonus (+X)
```

**State Determination:**

| State | Condition | Behavior |
|-------|-----------|----------|
| `isLive` | `deadline_time < now AND !currentGameweek.finished` | Enables polling, live calculations |
| `hasGamesInProgress` | `fixtures.some(f => f.started && !f.finished_provisional)` | Shows "LIVE" badge |

**Live Points Calculation (`calculateLiveManagerPoints`):**
1. For each pick with `multiplier > 0` (starting XI):
   - Get `total_points` from `/event/{gw}/live/` endpoint
   - Apply captain multiplier (1=normal, 2=captain, 3=triple captain)
2. Add provisional bonus (if `stats.bonus === 0` and fixture >= 60 mins)
3. Subtract transfer hits cost
4. Return: `{ basePoints, provisionalBonus, totalPoints, hitsCost, netPoints }`

**Provisional Bonus Logic (`calculateProvisionalBonus`):**
- Calculated from BPS (Bonus Points System) scores per fixture
- Top 3 BPS get 3/2/1 bonus points
- Tie handling: tied players share same bonus (e.g., two tied for 1st both get 3)
- Only shown when fixture >= 60 minutes OR finished (via `shouldShowProvisionalBonus`)
- Once official bonus awarded (`stats.bonus > 0`), provisional is ignored

**Fixture State Flags:**
| Flag | When True | Use Case |
|------|-----------|----------|
| `started` | Match kicked off | Show points instead of "–" |
| `finished_provisional` | Full time whistle blown | Stop "LIVE" badge, match ended |
| `finished` | Bonus points confirmed (~1hr delay) | Official final points |

**Polling Behavior (`useLiveScoring`):**
- Default interval: 60 seconds (`DEFAULT_POLL_INTERVAL`)
- Always fetches once on mount (even when `!isLive`) for fixture status
- Only sets up interval polling when `isLive === true`
- Cleans up interval on unmount or when `isLive` changes
- Fetches both `/event/{gw}/live/` and `/fixtures?event={gw}` in parallel

**Live Total Calculation:**
```typescript
// entry.total already includes entry.event_total
const previousTotal = entry.total - entry.event_total
const liveTotal = previousTotal + livePoints.netPoints
```

**Table Re-sorting:**
When `isLive && liveData`, standings sort by `liveTotal` descending. Display rank = position in sorted array (1-indexed).

### Free Transfers Tracker
Shows remaining free transfers for each manager in the league.

**Key files:**
- `src/hooks/useFreeTransfers.ts` - Core calculation logic with `calculateFreeTransfers` function
- `src/hooks/useFreeTransfers.test.ts` - Comprehensive test suite (26 tests)
- `src/components/FreeTransfers.tsx` - Display component with deadline awareness

**FPL Free Transfer Rules (2024/25 season):**
- Start with 1 FT at beginning of season
- Gain +1 FT per gameweek (max **5** can be banked - increased from 2 in 2024/25)
- Wildcard resets FT to 1 (transfers don't consume FT that week)
- Free Hit doesn't consume FT (transfers don't count that GW)
- Transfers beyond available FT cost -4 points each

**Deadline Timing Logic:**
The component accounts for whether the deadline has passed:
- **Before deadline:** Shows remaining FT for current GW transfers
- **After deadline:** Shows FT available for next GW (includes the +1 FT grant)

```typescript
// After deadline passes, treat current GW as "completed"
const gwComplete = !isCurrentGw || deadlinePassed
if (gwComplete) {
  ft = Math.min(5, ft + 1) // Grant +1 FT
}
```

**Implementation notes:**
- FPL API doesn't directly expose remaining FT - must be calculated from history
- Fetches `/entry/{id}/history/` to get `event_transfers` per gameweek
- Uses chip history to detect wildcards and free hits
- `deadlineTime` from bootstrap determines if deadline passed

### Game Rewards Feature
Shows bonus points (3/2/1) and defensive contribution (DefCon) points per fixture during live gameweeks. Displays provisional bonus from BPS scores during live matches (≥60 minutes), using the same calculation logic as the live league standings.

**Key files:**
- `src/utils/fixtureRewards.ts` - Core extraction logic with DefCon threshold filtering and provisional bonus
- `src/utils/fixtureRewards.test.ts` - Comprehensive test suite (26 tests)
- `src/components/GameRewards.tsx` - Card component displaying per-fixture rewards
- `src/components/GameRewards.module.css` - Styles (nested inside root class)

**FPL 2025/26 Rules:**
- **Bonus Points**: Top 3 BPS scores get 3/2/1 points
- **Tie handling**: Tied players share same tier, next tier is skipped (e.g., two tied for 1st both get 3, third gets 1)
- **Defensive Contributions (DefCon)**: 2 points for meeting threshold
  - Defenders: 10+ CBIT (Clearances, Blocks, Interceptions, Tackles)
  - Midfielders/Forwards: 12+ CBITr (includes Recoveries)
  - Clean sheet NOT required

**API Data Structure:**
```typescript
// Fixture stats array includes:
// - `bonus` identifier: Final confirmed bonus (1-3 pts) - only populated after match ends
// - `defensive_contribution` identifier: DefCon stat (2 pts if threshold met)
fixture.stats = [
  { identifier: 'bonus', h: [{ element: 123, value: 3 }], a: [...] },
  { identifier: 'defensive_contribution', h: [...], a: [...] }
]
```

**Provisional Bonus Calculation:**
When `fixture.stats.bonus` is empty (live match), calculates from BPS in `liveData`:
```
calculateProvisionalBonusForFixture(fixture, liveData, playersMap):
  1. Filter players by fixture ID (via liveData.elements[].explain.fixture)
  2. Extract BPS from each player's stats.bps
  3. Call shared calculateProvisionalBonus() from liveScoring.ts
  4. Return PlayerReward[] with player names
```

**Data Flow:**
```
Dashboard (liveData from useLiveScoring)
  │
  ▼
GameRewards
  └── extractAllFixtureRewards(fixtures, playersMap, teamsMap, liveData)
        └── Per fixture: confirmed bonus OR provisional from BPS
```

**Display Logic:**

| Fixture State | Show Rewards |
|--------------|--------------|
| Not started | No - show "Not started" |
| In progress < 60 mins | No - show "In progress" |
| In progress >= 60 mins | Yes - provisional bonus + DefCon |
| Finished | Yes - confirmed bonus + DefCon |

**Type Safety:**
```typescript
// Position type guard for DefCon threshold lookup
type OutfieldPosition = 2 | 3 | 4  // DEF, MID, FWD
const DEFCON_THRESHOLDS: Record<OutfieldPosition, number> = {
  2: 10,  // Defenders
  3: 12,  // Midfielders
  4: 12,  // Forwards
}
```

**Implementation notes:**
- Uses `shouldShowProvisionalBonus()` from `liveScoring.ts` for timing
- DefCon entries filtered by position-specific thresholds
- Goalkeepers excluded from DefCon (no threshold defined)
- `useMemo` for teamsMap transformation to prevent recalculation
- Defensive null checks for undefined maps

### Player Recommendations
Three recommendation lists for transfer planning: Punts (differential picks), Defensive (template picks), and Time to Sell (underperforming owned players).

**Key files:**
- `src/hooks/useRecommendedPlayers.ts` - Core calculation logic with scoring algorithms
- `src/hooks/useRecommendedPlayers.test.tsx` - Comprehensive test suite (38 tests)
- `src/components/RecommendedPlayers.tsx` - Three-card display component

**Recommendation Types:**

| Type | Ownership Filter | Description |
|------|------------------|-------------|
| Punts | < 40% | Differential picks - low ownership, high upside |
| Defensive | 40-100% | Template picks - safe, popular choices |
| Time to Sell | > 0% (owned) | Underperforming players to remove |

**Scoring Algorithm:**
1. Calculate per-90 stats: xG90, xA90, xGC90, CS90, form
2. Calculate percentiles against all eligible outfield players
3. Apply position-specific weights (DEF/MID/FWD have different priorities)
4. Combine with fixture difficulty score (next 5 GWs, weighted by proximity)

**Position Weights:**
- **DEF**: High weight on xGC, clean sheets, form
- **MID**: Balanced xG + xA, high form weight
- **FWD**: Heavy xG weight, very high form weight

**Fixture Score:**
```typescript
// FIXTURE_WEIGHTS = [0.35, 0.25, 0.2, 0.12, 0.08] - nearer GWs weighted more
// Difficulty 1-5 converted to ease 0-1 (5=hardest=0, 1=easiest=1)
```

**Filters:**
- Excludes goalkeepers (element_type !== 1)
- Requires status 'a' (available)
- Minimum 450 minutes played
- toSell: requires score > 0.5 (worse than average)

**Test Coverage (38 tests):**
- Unit tests for `getPercentile`, `calculateFixtureScore`, `calculateLeagueOwnership`
- Characterization tests for all filter conditions and ownership thresholds
- Error handling and graceful degradation when fixtures API fails

## Testing

### Commands
```bash
npm test                    # Watch mode (unit tests)
npm test -- --run           # Single run
npm run test:e2e:docker     # E2E tests in Docker (recommended)
npm run test:e2e:docker:update  # Update visual snapshots (Docker)
npm run test:e2e            # E2E with local Playwright (won't match snapshots)
npm run test:e2e:ui         # E2E with UI (local Playwright)
```

### Visual Snapshot Testing

E2E tests include visual regression tests using Playwright's `toHaveScreenshot()`. To ensure consistent rendering across environments, **all E2E tests run in Docker** using the official Playwright image.

**Why Docker?** Font rendering differs between operating systems and even Ubuntu versions. The Docker approach ensures:
- Local snapshots match CI exactly
- No 1-2px height differences from font rendering
- Same environment everywhere: `mcr.microsoft.com/playwright:v1.57.0-jammy`

**Updating snapshots:**
```bash
npm run test:e2e:docker:update  # Regenerates all visual snapshots (Docker)
```

**Important:** When making frontend changes that affect visual appearance, always regenerate snapshots before committing.

**Note:** The version in the Docker image (`v1.57.0`) must match the `@playwright/test` version in `package.json`. Update both when upgrading Playwright.

**Docker file ownership:** The Docker commands use `-e DOCKER_USER="$(id -u):$(id -g)"` to ensure snapshot files are created with correct ownership (not root). This is the officially recommended approach by Playwright.

### Test Files

**Unit tests:**
- `src/hooks/useLiveScoring.test.ts` - Live scoring hook tests
- `src/hooks/useTheme.test.ts` - Theme hook tests
- `src/utils/liveScoring.test.ts` - Points calculation tests
- `src/components/PlayerOwnership.test.tsx` - Component tests

**E2E tests:**
- `tests/dashboard.spec.ts` - Dashboard layout, standings table, responsive design
- `tests/statistics.spec.ts` - Statistics page, stats grid, visual snapshots
- `tests/navigation.spec.ts` - Cross-page navigation, dark mode toggle
- `tests/player-ownership.spec.ts` - Player ownership modal, clickable rows
- `tests/manager-modal.spec.ts` - Team lineup modal (pitch layout, players, bench)
- `tests/countdown.spec.ts` - Gameweek countdown display
- `tests/error-states.spec.ts` - FPL 503 error handling, visual snapshots

**Test helpers:**
- `tests/helpers/page-utils.ts` - Shared utilities: VIEWPORTS, SELECTORS, waitForPageReady()

**Test fixtures:**
- `tests/fixtures/test-fixtures.ts` - Playwright fixtures with API mocking
- `tests/fixtures/mock-data.ts` - Mock FPL API responses with named PLAYER_IDS constants

**Mock data design:** Manager 4 has different player picks than Managers 1-3. This creates varied ownership percentages (25%, 75%, 100%) so PlayerOwnership tests can verify clickable rows (players with <100% ownership are clickable).

**Visual snapshots:** Each test file stores snapshots in a directory named `{test-file}.spec.ts-snapshots/`. When splitting test files, snapshots must be copied to the new directory.

**Testing patterns:**
- Mock `@tanstack/react-query` for hook tests
- Use `vi.mock()` for API mocking in unit tests
- E2E tests use `page.route()` to intercept API calls (see `test-fixtures.ts`)
- `renderHook()` from `@testing-library/react` for hooks
- Use `data-testid` attributes for stable E2E selectors
- ESLint enforces vitest best practices via `@vitest/eslint-plugin`
- Biome handles all formatting (code + CSS) - no stylelint

### React Testing Library Best Practices

**The Golden Rule**: Test behavior, not implementation details. Tests should interact with components the way users do.

#### Query Priority (Most to Least Preferred)

1. **`getByRole`** - Best choice; validates accessibility
   ```tsx
   // ✅ User-focused
   screen.getByRole('button', { name: /submit/i })
   screen.getByRole('textbox', { name: /username/i })

   // ❌ Implementation detail
   screen.getByTestId('submit-button')
   container.querySelector('.btn-submit')
   ```

2. **`getByLabelText`** - For form inputs
3. **`getByText`** - For non-interactive content
4. **`getByTestId`** - Last resort for complex components

#### Use `screen` Object

```tsx
// ❌ Outdated pattern
const { getByRole } = render(<Component />)
getByRole('button')

// ✅ Modern pattern
render(<Component />)
screen.getByRole('button')
```

#### Query Variants

```tsx
// getBy* - Element must exist (throws if not found)
expect(screen.getByRole('alert')).toBeInTheDocument()

// queryBy* - ONLY for asserting non-existence
expect(screen.queryByRole('alert')).not.toBeInTheDocument()

// findBy* - For async elements (returns Promise)
const button = await screen.findByRole('button')
```

#### Use `user-event` Over `fireEvent`

```tsx
// ❌ Unrealistic - fires single event
fireEvent.change(input, { target: { value: 'hello' } })

// ✅ Realistic - simulates actual user typing
const user = userEvent.setup()
await user.type(input, 'hello')
await user.click(screen.getByRole('button'))
```

#### Async Testing

```tsx
// ❌ Verbose
const button = await waitFor(() => screen.getByRole('button'))

// ✅ Simpler - findBy* handles waiting
const button = await screen.findByRole('button')

// waitFor for side effects only
await waitFor(() => expect(mockFn).toHaveBeenCalled())
```

#### waitFor Best Practices

```tsx
// ❌ Multiple assertions - slow failure
await waitFor(() => {
  expect(fetch).toHaveBeenCalledWith('foo')
  expect(fetch).toHaveBeenCalledTimes(1)
})

// ✅ Single assertion in waitFor
await waitFor(() => expect(fetch).toHaveBeenCalledWith('foo'))
expect(fetch).toHaveBeenCalledTimes(1)

// ❌ Side effects inside waitFor (runs multiple times!)
await waitFor(() => {
  fireEvent.click(button)
  expect(result).toBeInTheDocument()
})

// ✅ Side effects outside
fireEvent.click(button)
await waitFor(() => expect(result).toBeInTheDocument())
```

#### Use jest-dom Matchers

```tsx
// ❌ Generic assertions
expect(button.disabled).toBe(true)

// ✅ Descriptive error messages
expect(button).toBeDisabled()
expect(element).toBeInTheDocument()
expect(element).toHaveTextContent(/hello/i)
```

#### Avoid act() Warnings

```tsx
// render() and fireEvent already wrap in act()
// Only use act() for direct state updates

// ❌ Redundant
act(() => { render(<Component />) })

// ✅ Correct
render(<Component />)
```

#### Don't Test Implementation Details

```tsx
// ❌ Testing CSS class names (implementation detail)
expect(element).toHaveClass('active')

// ✅ Test visible behavior
expect(element).toHaveStyle({ backgroundColor: 'blue' })
// Or better: test what the user actually sees/experiences
expect(screen.getByText('Active')).toBeInTheDocument()

// ❌ Testing internal state
expect(component.state.isLoading).toBe(true)

// ✅ Test what user sees
expect(screen.getByRole('progressbar')).toBeInTheDocument()
```

#### Resources
- [Kent C. Dodds: Common RTL Mistakes](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Testing Library Docs](https://testing-library.com/docs/queries/about#priority)

## CI/CD

**GitHub Actions** (`.github/workflows/ci.yml`):
- Runs on push/PR to `main`
- Type checking (`tsc`)
- Linting (`eslint`) + Format check (`biome`)
- Unit tests (`vitest`)
- E2E tests (Playwright in Docker - same image as local)
- Uploads Playwright report on failure
- Auto-deploys backend to Fly.io on `main` push

**Update Snapshots Workflow** (`.github/workflows/update-snapshots.yml`):
- Manual trigger via GitHub Actions UI
- Regenerates visual snapshots using Docker
- Auto-commits updated snapshots directly to the branch

## Icons

We use [Lucide React](https://lucide.dev/) for SVG icons. This ensures dark theme compatibility (no emojis).

### Icon Library
```tsx
import { IconName } from 'lucide-react'

// Basic usage
<IconName size={16} />

// With color
<IconName size={16} color="#FFE033" />

// Filled icon
<IconName size={16} color="#FFE033" fill="#FFE033" />
```

### Icon Assignments

| Section | Icon | Color | Notes |
|---------|------|-------|-------|
| Chips (Used) | `Zap` | `#FFE033` (electric yellow) | Filled |
| Chips Remaining | `Zap` | `#FFE033` (electric yellow) | Filled |
| Hits (GW) | `TrendingDown` | `var(--color-error)` | Red for negative |
| Transfers | `ArrowRight` + `ArrowLeft` | green + red | Stacked vertically, stretched 1.3x |
| Captains | `Copyright` | default | C symbol |
| Team Values | `Coins` | `#FFD700` (gold) | |
| Total Hits | `TrendingDown` | `var(--color-error)` | Red for negative |
| Live indicator | `Circle` | `currentColor` | Filled, pulses |
| Rank up | `CircleChevronUp` | `var(--color-success)` | |
| Rank down | `CircleChevronDown` | `var(--color-error)` | |
| Team link | `ChevronRight` | default | In standings table |
| Bench Points | `Armchair` | `#6B8CAE` (steel blue) | |
| Differential Captains | `Crown` | `#FFD700` (gold) | |
| Player Ownership | `Users` | `#14B8A6` (teal) | |
| League Position Chart | `TrendingUp` | `#6366f1` (indigo) | |
| Template Team | `Users` | `#14B8A6` (teal) | Same as Player Ownership |
| Theme toggle | `Sun` / `Moon` | default | Light/dark mode |
| Punts | `Dices` | `#F59E0B` (amber) | |
| Defensive Options | `Shield` | `#14B8A6` (teal) | |
| Time to Sell | `TrendingDown` | `#EF4444` (red) | |
| FPL Updating | `RefreshCw` | `var(--color-primary)` | Spinning animation |
| Position DEF | Text badge | `#ef4444` (red) | White text on colored bg |
| Position MID | Text badge | `#3b82f6` (blue) | White text on colored bg |
| Position FWD | Text badge | `#22c55e` (green) | White text on colored bg |
| Game Rewards | `Trophy` | `#FFD700` (gold) | Section header |
| Bonus 3pts | `Award` | `#FFD700` (gold) | Gold medal |
| Bonus 2pts | `Award` | `#C0C0C0` (silver) | Silver medal |
| Bonus 1pt | `Award` | `#CD7F32` (bronze) | Bronze medal |
| DefCon | `Shield` | `#14B8A6` (teal) | Filled |

### Custom Icon Compositions

**Transfers Icon (stacked arrows):**
```tsx
<span className={styles.transferIcon}>
  <ArrowRight size={12} color="var(--color-success)" />
  <ArrowLeft size={12} color="var(--color-error)" />
</span>
```
```css
.transferIcon {
  display: flex;
  flex-direction: column;
  line-height: 0;
  transform: scaleX(1.3);
}
```

## Project Structure

```
tapas-fpl-app/
├── frontend/                 # Vite + React app
│   ├── src/
│   │   ├── App.tsx          # Router setup (react-router-dom)
│   │   ├── views/           # Page-level route components
│   │   │   ├── Dashboard.tsx           # Main page: standings, transfers
│   │   │   ├── Statistics.tsx          # Stats page: all stat cards
│   │   │   └── Analytics.tsx           # Analytics page: recommendations
│   │   ├── components/      # Reusable UI components with co-located .module.css
│   │   │   ├── Header.tsx              # Navigation header + hamburger menu
│   │   │   ├── LeagueStandings.tsx     # Live standings table
│   │   │   ├── LeaguePositionChart.tsx # Bump chart
│   │   │   ├── ManagerModal.tsx        # Manager detail modal
│   │   │   ├── GameweekDetails.tsx     # GW info sidebar
│   │   │   ├── GameweekCountdown.tsx   # Countdown to next deadline
│   │   │   ├── PlayerOwnership.tsx     # Ownership stats
│   │   │   ├── BenchPoints.tsx         # Wasted bench points
│   │   │   ├── CaptainSuccess.tsx      # Differential captains
│   │   │   ├── ChipsRemaining.tsx      # Chip tracker
│   │   │   ├── RecommendedPlayers.tsx  # Player recommendations
│   │   │   ├── StatsCards.tsx          # Team value, hits
│   │   │   ├── LeagueTemplateTeam.tsx  # Most owned starting XI
│   │   │   ├── PitchLayout.tsx         # Reusable pitch formation layout
│   │   │   ├── FplUpdating.tsx         # 503 error message component
│   │   │   └── GameRewards.tsx         # Bonus + DefCon per fixture
│   │   ├── hooks/
│   │   │   ├── useFplData.ts           # Main data hook (TanStack Query)
│   │   │   ├── useLiveScoring.ts       # Live polling
│   │   │   ├── useLeaguePositionHistory.ts
│   │   │   ├── useBenchPoints.ts
│   │   │   ├── useCaptainSuccess.ts
│   │   │   └── useTheme.ts
│   │   ├── services/api.ts   # FPL API client
│   │   ├── styles/           # Global CSS variables
│   │   ├── types/fpl.ts      # TypeScript types
│   │   └── utils/            # Utility functions
│   │       ├── templateTeam.ts      # Template team calculation
│   │       └── fixtureRewards.ts    # Bonus + DefCon extraction
│   ├── tests/                # Playwright e2e tests
│   ├── package.json
│   └── vite.config.ts
├── backend/                  # Python FastAPI (API proxy)
│   ├── app/
│   │   ├── main.py           # FastAPI app entry point
│   │   ├── config.py         # Settings and cache TTLs
│   │   ├── api/routes.py     # API endpoints
│   │   └── services/fpl_proxy.py  # FPL proxy with caching
│   ├── migrations/           # SQL migrations for Supabase
│   │   ├── 001_core_tables.sql    # Core FPL entities
│   │   ├── 002_historical.sql     # Historical tracking
│   │   └── 003_analytics.sql      # Analytics tables
│   ├── tests/                # pytest tests
│   │   ├── conftest.py       # Test fixtures
│   │   ├── test_config.py    # Config tests
│   │   ├── test_fpl_proxy.py # Unit tests
│   │   └── test_api.py       # Integration tests
│   ├── fly.toml              # Fly.io deployment config
│   ├── DB.md                 # Database schema documentation
│   ├── requirements.txt
│   └── README.md
└── CLAUDE.md
```

## Development Commands

### Frontend
```bash
cd frontend
npm install
npm run dev              # Start dev server
npm run build            # Production build
npm run preview          # Preview production build
npm run ts               # TypeScript type checking (no emit)
npm run lint             # Run ESLint (JS/TS linting)
npm run format           # Check formatting (Biome)
npm run format:fix       # Fix formatting (Biome)
npm run css:types        # Generate CSS module type definitions
npm test                 # Run unit tests in watch mode
npm test -- --run        # Run unit tests once
npm run test:e2e:docker  # Run E2E tests in Docker (recommended)
npm run test:e2e:docker:update  # Update visual snapshots (Docker)
```

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload  # Start dev server (port 8000)
python -m pytest               # Run tests
```

## Design Principles

- Keep it simple — avoid over-engineering
- Cache aggressively — FPL data doesn't change frequently
- Multi-season support — composite keys `(id, season_id)` for FPL entities
- Mobile-friendly — friends will likely view on phones

## Database (Supabase)

### Connection Details
- **Project**: tapas-and-tackles
- **Region**: EU West 1 (Ireland)
- **PostgreSQL**: 17.6.1
- **URL**: `https://itmykooxrbrdbgqwsesb.supabase.co`

### Schema Design

The database uses **composite primary keys** `(id, season_id)` for FPL entities (team, player, league, manager) to support multi-season data while keeping familiar FPL IDs.

**Migration files** in `backend/migrations/`:
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

See `backend/DB.md` for complete schema documentation including:
- All column definitions and types
- Foreign key relationships
- Index strategies
- Design decisions and rationale

## Deployment

### Vercel (Frontend)
- **Account**: quantti
- **Project**: quanttis-projects/tapas-and-tackles
- **Custom domain**: https://tapas-and-tackles.live ✓
- **Auto-deploy**: Push to `main` → Vercel builds and deploys automatically

### Fly.io (Backend)
- **App name**: tapas-fpl-backend
- **URL**: https://tapas-fpl-backend.fly.dev
- **Deploy**: `fly deploy` from /backend

### Deploy Commands
```bash
# Frontend: just push to git, GitHub Actions runs CI, Vercel auto-deploys
git push

# Backend (from /backend)
fly deploy
```

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=https://tapas-fpl-backend.fly.dev
```

### Backend (Fly.io secrets)
```bash
# Set secrets via fly CLI
fly secrets list                   # View current secrets
fly secrets set CORS_ORIGINS="https://tapas-and-tackles.live,https://www.tapas-and-tackles.live,http://localhost:5173"
fly secrets set SUPABASE_URL="https://itmykooxrbrdbgqwsesb.supabase.co"
fly secrets set SUPABASE_KEY="<publishable-key>"  # Use publishable key for server-side
```

**CORS Note:** Include both `www` and non-www origins if your domain uses redirects.

### Supabase Keys
- **Publishable key** (`sb_publishable_...`): Safe for server-side use, respects RLS
- **Secret key**: Admin access, bypasses RLS — use only for migrations/admin tasks
- Keys available in Supabase Dashboard → Project Settings → API
