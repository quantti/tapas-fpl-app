# Tapas FPL App

A Fantasy Premier League companion app for tracking league standings, player stats, and live gameweek data.

> **Note**: This file contains high-level architecture. See subdirectory `CLAUDE.md` files for detailed documentation:
> - `frontend/CLAUDE.md` - React components, hooks, testing, CSS modules
> - `backend/CLAUDE.md` - Python FastAPI, database schema, Supabase
> - `worker/CLAUDE.md` - Cloudflare Workers, cache TTLs

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

## Project Structure

```
tapas-fpl-app/
├── CLAUDE.md              # This file - high-level architecture
├── frontend/              # Vite + React app
│   ├── CLAUDE.md         # Frontend documentation
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
│   ├── CLAUDE.md         # Backend documentation
│   ├── app/              # FastAPI application
│   ├── migrations/       # SQL migrations for Supabase
│   ├── tests/            # pytest tests
│   ├── DB.md             # Database schema documentation
│   └── fly.toml          # Fly.io deployment config
└── worker/                # Cloudflare Workers
    ├── CLAUDE.md         # Worker documentation
    ├── src/index.ts      # Worker entry point
    └── wrangler.toml     # Cloudflare config
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

### Worker
```bash
cd worker
npm run dev       # Start local dev server
npm run deploy    # Deploy to Cloudflare
```

## Design Principles

- Keep it simple — avoid over-engineering
- Cache aggressively — FPL data doesn't change frequently
- Multi-season support — composite keys `(id, season_id)` for FPL entities
- Mobile-friendly — friends will likely view on phones

## Deployment

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | Vercel | https://tapas-and-tackles.live |
| API Proxy | Cloudflare Workers | https://tapas-fpl-proxy.vankari.workers.dev |
| Backend | Fly.io | https://tapas-fpl-backend.fly.dev |
| Database | Supabase | https://itmykooxrbrdbgqwsesb.supabase.co |

**Deploy process:**
- Frontend: Push to `main` → GitHub Actions → Vercel auto-deploys
- Worker: `cd worker && npx wrangler deploy`
- Backend: `cd backend && fly deploy`

## Environment Variables

### Frontend (.env)
```
VITE_API_URL=https://tapas-fpl-backend.fly.dev
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
- Auto-deploys backend to Fly.io on `main` push

**Releases** (`.github/workflows/release.yml`):
- Uses [semantic-release](https://semantic-release.gitbook.io/) for automated versioning
- Auto-triggers on every push to `main`
- Creates releases based on conventional commits (`feat:` → minor, `fix:` → patch)
- Manual trigger available with dry-run option: `gh workflow run release -f dry_run=true`
- Updates `CHANGELOG.md`, bumps `package.json`, creates GitHub release
