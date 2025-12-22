# TODO

## Infrastructure

- [x] Add custom domain to Vercel
- [x] Configure DNS settings

## UI Polish

- [x] Dark mode theme
  - [x] Create dark color palette in variables.css
  - [x] Add theme toggle component
  - [x] Persist theme preference (localStorage)
  - [x] System preference detection (prefers-color-scheme)
  - [x] Flash prevention script
- [ ] General polish and refinements
- [ ] Mobile responsiveness improvements

## Features

- [x] Player ownership across league
- [ ] More statistics and views
  - [ ] Head-to-head comparison between managers
  - [ ] Points breakdown by position
  - [x] Bench points tracking
  - [x] Captain pick success rates
  - [ ] Transfer history timeline
- [ ] Historical data tracking (requires database)
- [ ] Season-over-season comparisons

## Scaling & Performance

- [x] TanStack Query setup (request deduplication, caching)
- [x] Shared historical data hook (~294 duplicate requests eliminated)
- [x] Tiered cache TTLs in Cloudflare Worker
- [ ] Refactor useFplData to React Query
- [ ] Multi-league support (routing, league selection)

## Completed

- [x] Live standings during gameweeks
- [x] Manager lineup modal with team shirts
- [x] Gameweek details (chips, hits, transfers, captains)
- [x] Stats cards (team values, total hits)
- [x] Replace emojis with Lucide SVG icons
- [x] Icon coloring (gold coins, electric zap, colored arrows, teal users, steel blue armchair)
- [x] Custom domain setup (tapas-and-tackles.live)
- [x] Player ownership feature
- [x] Dark mode with system preference detection
- [x] Theme toggle (Sun/Moon icons)
- [x] Gameweek date range display
- [x] Bench points tracking (cumulative from previous GWs)
- [x] Captain differential tracker
  - [x] Captain differential detail modal (per-GW breakdown)
- [x] Layout improvements
  - [x] GameweekDetails: Team Value + Captains side-by-side
  - [x] Transfers moved to full-width responsive grid below main content
  - [x] Wider side column (480px) for better readability
