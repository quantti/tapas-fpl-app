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

// Cache responses for 5 minutes (FPL data doesn't change frequently)
app.use('*', cache({
  cacheName: 'fpl-api-cache',
  cacheControl: 'max-age=300',
}));

// Health check
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'Tapas FPL API Proxy',
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
    return c.json(data);
  } catch (error) {
    return c.json(
      { error: 'Failed to fetch from FPL API', details: String(error) },
      500
    );
  }
});

export default app;
