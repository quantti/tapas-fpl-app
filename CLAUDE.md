# Tapas FPL App

A Fantasy Premier League companion app for tracking league standings, player stats, and live gameweek data.

## Tech Stack

- **Frontend**: Vite + React 18 + TypeScript
- **Routing**: React Router v6
- **State Management**: TanStack Query (React Query) for server state
- **Charts**: Recharts for data visualization
- **Icons**: Lucide React
- **Backend/Proxy**: Python FastAPI (async caching proxy)
- **Hosting**: Vercel (frontend), Fly.io (backend)
- **Testing**: Vitest + React Testing Library

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Vite + React  │────▶│  Python FastAPI  │────▶│    FPL API      │
│   TypeScript    │     │  (Fly.io)        │     │                 │
│                 │     │  CORS proxy +    │     │                 │
│   Vercel        │     │  in-memory cache │     │                 │
│                 │     │                  │     │                 │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                                 ▼ (future)
                        ┌─────────────────┐
                        │   Database      │
                        │   (Supabase/    │
                        │    Neon)        │
                        └─────────────────┘
```

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

## Future Features (UI enhancements)

- [ ] Free transfers card - show how many free transfers each manager has
- [ ] Player recommendation modal - clicking a player opens modal with:
  - Next 5 fixtures
  - Last 5 gameweek results
  - xGI stats
  - Current price and recent price changes
- [ ] Better position indicators - replace colored dots with text labels (DEF, MID, FWD) in circles or similar

## Future Features (requires database)

- [ ] Historical data tracking across gameweeks
- [ ] Ownership trends over time
- [ ] Season-over-season comparisons
- [ ] Scheduled data snapshots via background jobs

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

### Live Scoring
Real-time updates during active gameweeks.

**Key files:**
- `src/hooks/useLiveScoring.ts` - Polls live data and fixtures
- `src/hooks/useFplData.ts` - Main data hook with TanStack Query
- `src/utils/liveScoring.ts` - Points calculation utilities

**Implementation notes:**
- `isLive` = deadline passed AND `currentGameweek.finished === false`
- `hasGamesInProgress` uses `finished_provisional` (updates immediately when match ends)
- `finished` only becomes true after bonus points confirmed (~1 hour delay)
- Live total = previous total + live GW points
- Table re-sorts by live total during active games

## Testing

```bash
npm test             # Watch mode (unit tests)
npm test -- --run    # Single run
npm run test:e2e     # E2E tests (Playwright)
npm run test:e2e:ui  # E2E with UI
```

**Unit test files:**
- `src/hooks/useLiveScoring.test.ts` - Live scoring hook tests
- `src/hooks/useTheme.test.ts` - Theme hook tests
- `src/utils/liveScoring.test.ts` - Points calculation tests
- `src/components/PlayerOwnership.test.tsx` - Component tests

**E2E test files:**
- `tests/responsive.spec.ts` - Layout, navigation, responsive design
- `tests/countdown.spec.ts` - Gameweek countdown display
- `tests/manager-modal.spec.ts` - Team lineup modal (pitch layout, players, bench)

**Testing patterns:**
- Mock `@tanstack/react-query` for hook tests
- Use `vi.mock()` for API mocking
- `renderHook()` from `@testing-library/react` for hooks

## CI/CD

**GitHub Actions** (`.github/workflows/ci.yml`):
- Runs on push/PR to `main`
- Type checking (`tsc`)
- Linting (`eslint`)
- Unit tests (`vitest`)
- E2E tests (`playwright`)
- Uploads Playwright report on failure

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
| Theme toggle | `Sun` / `Moon` | default | Light/dark mode |

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
│   │   │   └── StatsCards.tsx          # Team value, hits
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
│   ├── tests/                # Playwright e2e tests
│   ├── package.json
│   └── vite.config.ts
├── backend/                  # Python FastAPI (API proxy)
│   ├── app/
│   │   ├── main.py           # FastAPI app entry point
│   │   ├── config.py         # Settings and cache TTLs
│   │   ├── api/routes.py     # API endpoints
│   │   └── services/fpl_proxy.py  # FPL proxy with caching
│   ├── tests/                # pytest tests
│   │   ├── conftest.py       # Test fixtures
│   │   ├── test_config.py    # Config tests
│   │   ├── test_fpl_proxy.py # Unit tests
│   │   └── test_api.py       # Integration tests
│   ├── fly.toml              # Fly.io deployment config
│   ├── requirements.txt
│   └── README.md
└── CLAUDE.md
```

## Development Commands

### Frontend
```bash
cd frontend
npm install
npm run dev          # Start dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run css:types    # Generate CSS module type definitions
npm test             # Run tests in watch mode
npm test -- --run    # Run tests once
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
- Design for extensibility — database can be added later
- Mobile-friendly — friends will likely view on phones

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
fly secrets set DATABASE_URL=...   # Future: database connection string
```

**CORS Note:** Include both `www` and non-www origins if your domain uses redirects.
