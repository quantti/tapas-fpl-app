# Tapas FPL App

A Fantasy Premier League companion app for tracking league standings, player stats, and live gameweek data.

**Current Season:** 2025/26 (FPL season ID will be assigned when season starts)

> **Note**: This file contains high-level architecture. See subdirectory docs for detailed documentation:
> - `frontend/FRONTEND.md` - React components, hooks, testing, CSS modules
> - `backend/BACKEND.md` - Python FastAPI, database schema, Supabase

## Tech Stack

- **Frontend**: Vite + React 18 + TypeScript
- **Routing**: React Router v6
- **State Management**: TanStack Query (React Query) for server state
- **Charts**: Recharts for data visualization
- **Icons**: Lucide React
- **API Proxy**: Vercel Serverless Functions (same-origin, tiered caching)
- **Backend**: Python FastAPI on Fly.io (Points Against, Chips Remaining APIs)
- **Database**: Supabase (PostgreSQL 17)
- **Hosting**: Vercel (frontend + API proxy), Fly.io (backend)
- **Testing**: Vitest + React Testing Library + Playwright (E2E)

## Architecture

```
┌─────────────────────────────────────────┐
│              Vercel                      │
│  ┌─────────────────┐  ┌──────────────┐  │     ┌─────────────────┐
│  │   Vite + React  │  │  Serverless  │──┼────▶│    FPL API      │
│  │   TypeScript    │  │  Functions   │  │     │                 │
│  │   (frontend)    │  │  (API proxy) │  │     └─────────────────┘
│  └─────────────────┘  └──────────────┘  │
└─────────────────────────────────────────┘
        │
        │ (Analytics APIs)
        ▼
┌──────────────────┐     ┌─────────────────┐
│  Python FastAPI  │────▶│   Supabase      │
│  (Fly.io)        │     │   PostgreSQL 17 │
│  Points Against  │     │   (EU West)     │
│  Chips Remaining │     │                 │
└──────────────────┘     └─────────────────┘
```

**Why this architecture?**
- Vercel Serverless Functions: Same-origin API proxy (avoids CORS), tiered caching
- Fly.io: Full Python environment for future ML/analytics (has 2-3s cold starts)

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
- [x] Gameweek countdown banner
- [x] Header navigation with hamburger menu
- [x] Player recommendations (Punts, Defensive, Time to Sell)
- [x] League Template Team (most owned starting XI)
- [x] Graceful 503 error handling
- [x] League recalculation banner
- [x] Game Rewards (bonus points + DefCon per fixture)
- [x] Player details modal (xG/xA stats, form, fixtures, history)
- [x] Cookie consent banner (GDPR-compliant)
- [x] Release notification banner
- [x] Head-to-Head manager comparison with template overlap score
- [x] Points Against - tracks FPL points conceded by each team

## Project Structure

```
tapas-fpl-app/
├── CLAUDE.md              # This file - high-level architecture
├── frontend/              # Vite + React app
│   ├── FRONTEND.md       # Frontend documentation
│   ├── api/              # Vercel Serverless Functions (FPL proxy)
│   ├── src/
│   │   ├── App.tsx       # Router setup
│   │   ├── views/        # Page components (Dashboard, Statistics, Analytics)
│   │   ├── components/   # Reusable UI components with .module.css
│   │   ├── hooks/        # Custom React hooks
│   │   ├── services/     # API client
│   │   ├── utils/        # Utility functions
│   │   ├── config/       # App configuration
│   │   ├── styles/       # Global CSS variables
│   │   └── types/        # TypeScript types
│   ├── tests/            # Playwright E2E tests
│   └── package.json
├── backend/               # Python FastAPI
│   ├── BACKEND.md        # Backend documentation
│   ├── app/              # FastAPI application
│   ├── migrations/       # SQL migrations for Supabase
│   ├── tests/            # pytest tests
│   ├── DB.md             # Database schema documentation
│   └── fly.toml          # Fly.io deployment config
```

## Development Commands

### Frontend
```bash
cd frontend
npm install
npm run dev              # Start dev server
npm run build            # Production build
npm run ts               # TypeScript type checking
npm run lint             # Run ESLint
npm run format           # Check formatting (Biome)
npm run css:types        # Generate CSS module type definitions
npm test                 # Run unit tests
npm run test:e2e:docker  # Run E2E tests in Docker
```

### Backend
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload  # Start dev server
python -m pytest               # Run tests
```

## Design Principles

- Keep it simple — avoid over-engineering
- Cache aggressively — FPL data doesn't change frequently
- Mobile-friendly — friends will likely view on phones

### Multi-Season Architecture

**IMPORTANT:** This app is designed for multi-season support. Every feature must consider season context.

**Database design:**
- All FPL entities use composite primary keys: `(id, season_id)`
- FPL reuses IDs each season (player 427 = Salah in 2024/25 AND 2025/26)
- Foreign keys include `season_id` to prevent cross-season data mixing
- Example: `FOREIGN KEY (team_id, season_id) REFERENCES team(id, season_id)`

**When implementing features:**
1. Always include `season_id` in queries and API endpoints
2. Default to current season but allow historical queries
3. Views and functions must filter by `season_id`
4. Test with multi-season data to catch cross-season bugs
5. Consider season transitions (archived data, new season bootstrap)

**Season transition checklist:**
- [ ] Create new season record in `season` table
- [ ] Run data collection for new season
- [ ] Update `is_current` flag on season table
- [ ] Verify frontend defaults to new season

## Deployment

| Service | Platform | URL |
|---------|----------|-----|
| Frontend + API Proxy | Vercel | https://tapas-and-tackles.live |
| Backend | Fly.io | https://tapas-fpl-backend.fly.dev |
| Database | Supabase | https://itmykooxrbrdbgqwsesb.supabase.co |

**Deploy process:**
- Frontend + API: Push to `main` → GitHub Actions → Vercel auto-deploys
- Backend: `cd backend && fly deploy`

## Environment Variables

### Frontend (.env)
```
# FPL API proxy - leave empty to use Vercel serverless functions (same origin)
# For local dev, you can point to production: VITE_API_URL=https://tapas-and-tackles.live
VITE_API_URL=
```

### Backend (Fly.io secrets)
```bash
fly secrets set CORS_ORIGINS="https://tapas-and-tackles.live,..."
fly secrets set SUPABASE_URL="https://..."
fly secrets set SUPABASE_KEY="<publishable-key>"
```

## CI/CD

**GitHub Actions** (`.github/workflows/ci.yml`):
- Type checking, linting, formatting
- Unit tests (Vitest)
- E2E tests (Playwright in Docker)
- Auto-deploys frontend to Vercel on `main` push (after frontend tests pass)
- Auto-deploys backend to Fly.io on `main` push (after backend tests pass)

**Note:** Frontend and backend deploys are independent — backend deploys don't wait for frontend tests and vice versa.

**Releases** (`.github/workflows/release.yml`):
- Uses [semantic-release](https://semantic-release.gitbook.io/) for automated versioning
- Auto-triggers on every push to `main`
- Creates releases based on conventional commits (`feat:` → minor, `fix:` → patch)
- Manual trigger available with dry-run option: `gh workflow run release -f dry_run=true`
- Updates `CHANGELOG.md`, bumps `package.json`, creates GitHub release
