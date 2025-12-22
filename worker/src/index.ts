import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { cache } from 'hono/cache';

type Bindings = {
  FPL_API_BASE: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Enable CORS for frontend
app.use('*', cors({
  origin: '*', // In production, restrict to your frontend domain
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
}));

/**
 * Tiered Cache TTLs based on endpoint type:
 * - bootstrap-static: 6 hours (rarely changes)
 * - fixtures: 1 hour (changes when matches start/end)
 * - standings: 5 minutes (updates during gameweeks)
 * - live gameweek: 2 minutes (live scores)
 * - historical picks: 1 hour (past data, rarely accessed repeatedly)
 * - manager history/transfers: 5 minutes (changes after transfers)
 * - default: 5 minutes
 */
function getCacheTTL(path: string): number {
  // Bootstrap static - players, teams, gameweeks (rarely changes)
  if (path.includes('/bootstrap-static')) {
    return 6 * 60 * 60; // 6 hours
  }

  // Fixtures - match schedule
  if (path.includes('/fixtures')) {
    return 60 * 60; // 1 hour
  }

  // Live gameweek data - scores during matches
  if (path.match(/\/event\/\d+\/live/)) {
    return 2 * 60; // 2 minutes
  }

  // Historical picks - manager's past GW picks (past data is stable)
  if (path.match(/\/entry\/\d+\/event\/\d+\/picks/)) {
    return 60 * 60; // 1 hour (frontend caches completed GWs forever)
  }

  // League standings - updates during active gameweeks
  if (path.includes('/leagues-classic')) {
    return 5 * 60; // 5 minutes
  }

  // Manager history and transfers
  if (path.includes('/history') || path.includes('/transfers')) {
    return 5 * 60; // 5 minutes
  }

  // Player summary
  if (path.includes('/element-summary')) {
    return 30 * 60; // 30 minutes
  }

  // Event status
  if (path.includes('/event-status')) {
    return 60; // 1 minute
  }

  // Default
  return 5 * 60; // 5 minutes
}

// Dynamic cache middleware with tiered TTLs
app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  const ttl = getCacheTTL(path);

  // Set cache control header based on endpoint
  await next();

  // Add cache headers to response
  c.header('Cache-Control', `public, max-age=${ttl}`);
});

// Also apply Hono's cache middleware for edge caching
app.use('/api/*', cache({
  cacheName: 'fpl-api-cache',
  // Note: This will use the Cache-Control header we set above
  cacheControl: 'max-age=300', // Fallback, overridden by dynamic header
}));

// Health check
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'Tapas FPL API Proxy',
    version: '1.1.0',
    cache: 'tiered TTLs enabled',
    endpoints: [
      '/api/bootstrap-static',
      '/api/fixtures',
      '/api/entry/:teamId',
      '/api/entry/:teamId/history',
      '/api/entry/:teamId/event/:event/picks',
      '/api/leagues-classic/:leagueId/standings',
      '/api/event/:event/live',
      '/api/element-summary/:playerId',
    ]
  });
});

// Proxy all /api/* requests to FPL API
app.get('/api/*', async (c) => {
  const path = c.req.path.replace('/api', '');
  const fplUrl = `${c.env.FPL_API_BASE}${path}/`;

  try {
    const response = await fetch(fplUrl, {
      headers: {
        'User-Agent': 'TapasFPL/1.0',
      },
    });

    if (!response.ok) {
      return c.json(
        { error: 'FPL API error', status: response.status },
        response.status as 400 | 404 | 500
      );
    }

    const data = await response.json();

    // Set tiered cache TTL
    const ttl = getCacheTTL(path);
    c.header('Cache-Control', `public, max-age=${ttl}`);

    return c.json(data);
  } catch (error) {
    return c.json(
      { error: 'Failed to fetch from FPL API', details: String(error) },
      500
    );
  }
});

export default app;
