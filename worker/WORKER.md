# Cloudflare Worker

Edge API proxy for the FPL API with tiered caching. Provides <50ms cold starts using V8 isolates.

## Why Cloudflare Workers?

- **Fast cold starts**: <50ms (V8 isolates) vs 2-3s for Python/Fly.io
- **Edge caching**: Responses cached globally at Cloudflare's edge
- **No CORS issues**: Proxies FPL API requests, adding proper CORS headers

## Cache TTLs

The Worker proxy (`src/index.ts`) uses tiered cache TTLs to balance freshness with performance:

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

## Development

```bash
cd worker
npm install
npm run dev       # Start local dev server
npm run deploy    # Deploy to Cloudflare
```

## Deployment

- **URL**: https://tapas-fpl-proxy.vankari.workers.dev
- **Deploy**: `npx wrangler deploy` from this directory

## Structure

```
worker/
├── src/
│   └── index.ts    # Main worker entry point with routing and caching logic
├── wrangler.toml   # Cloudflare Workers configuration
└── package.json
```
