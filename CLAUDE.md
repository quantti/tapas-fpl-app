# Tapas FPL App

A Fantasy Premier League companion app for tracking league standings, player stats, and live gameweek data.

## Tech Stack

- **Frontend**: Vite + React + TypeScript
- **Backend/Proxy**: Cloudflare Workers (with Hono framework)
- **Hosting**: Vercel or Netlify (frontend), Cloudflare (workers)
- **Database**: None initially (designed for future addition)

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Vite + React  │────▶│  Cloudflare      │────▶│    FPL API      │
│   TypeScript    │     │  Workers + Hono  │     │                 │
│                 │     │  (CORS proxy +   │     │                 │
│   Vercel/       │     │   caching)       │     │                 │
│   Netlify       │     │                  │     │                 │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                                 ▼ (future)
                        ┌─────────────────┐
                        │   Database      │
                        │   (Supabase/    │
                        │    Neon)        │
                        └─────────────────┘
```

## Features (MVP)

- [ ] Live standings during gameweeks
- [ ] Mini-league standings and comparisons
- [ ] Player ownership statistics
- [ ] Basic player/team stats

## Future Features (requires database)

- [ ] Historical data tracking across gameweeks
- [ ] Ownership trends over time
- [ ] Season-over-season comparisons
- [ ] Scheduled data snapshots via Cloudflare Workers cron

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
```css
.Container {
  /* Root container styles */

  .childElement {
    /* Nested child styles */
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
```

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
| Chips | `Zap` | `#FFE033` (electric yellow) | Filled |
| Hits (GW) | `TrendingDown` | `var(--color-error)` | Red for negative |
| Transfers | `ArrowRight` + `ArrowLeft` | green + red | Stacked vertically, stretched 1.3x |
| Captains | `Copyright` | default | C symbol |
| Team Values | `Coins` | `#FFD700` (gold) | |
| Total Hits | `TrendingDown` | `var(--color-error)` | Red for negative |
| Live indicator | `Circle` | `currentColor` | Filled, pulses |
| Rank up | `CircleChevronUp` | `var(--color-success)` | |
| Rank down | `CircleChevronDown` | `var(--color-error)` | |
| Team link | `ChevronRight` | default | In standings table |

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
│   │   ├── components/      # React components with co-located .module.css
│   │   ├── hooks/
│   │   ├── services/        # API client
│   │   ├── styles/          # Global styles and CSS variables
│   │   ├── types/           # TypeScript types for FPL data
│   │   └── utils/
│   ├── package.json
│   └── vite.config.ts
├── worker/                   # Cloudflare Worker
│   ├── src/
│   │   └── index.ts         # Hono app with FPL proxy routes
│   ├── package.json
│   └── wrangler.toml
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
```

### Worker
```bash
cd worker
npm install
npm run dev          # Start local worker
npm run deploy       # Deploy to Cloudflare
```

## Design Principles

- Keep it simple — avoid over-engineering
- Cache aggressively — FPL data doesn't change frequently
- Design for extensibility — database can be added later
- Mobile-friendly — friends will likely view on phones

## Deployment

### Vercel (Frontend)
- **Account**: quantti
- **Project**: quanttis-projects/frontend
- **Production URL**: https://frontend-ifl3if94u-quanttis-projects.vercel.app
- **Custom domain**: https://tapas-and-tackles.live ✓

### Cloudflare Workers (API Proxy)
- **URL**: https://tapas-fpl-proxy.vankari.workers.dev

### Deploy Commands
```bash
# Frontend (from /frontend)
vercel --prod

# Worker (from /worker)
npx wrangler deploy
```

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=https://tapas-fpl-proxy.vankari.workers.dev
```

### Worker (wrangler.toml / secrets)
```
# Future: database connection string
# DATABASE_URL=...
```
