import type { VercelRequest, VercelResponse } from '@vercel/node';

const FPL_API_BASE = 'https://fantasy.premierleague.com/api';

/** Tiered Cache TTLs based on endpoint type. isLive reduces TTL for fresher data during live games. */
function getCacheTTL(path: string, isLive: boolean): number {
  // Bootstrap static - players, teams, gameweeks
  if (path.includes('bootstrap-static')) {
    return 5 * 60; // 5 minutes
  }

  // Fixtures - shorter TTL when live since scores update frequently
  if (path.includes('fixtures')) {
    return isLive ? 30 : 15 * 60; // 30 seconds when live, 15 minutes otherwise
  }

  // Live gameweek data
  if (path.match(/event\/\d+\/live/)) {
    return 60; // 1 minute
  }

  // Historical picks (past data is stable)
  if (path.match(/entry\/\d+\/event\/\d+\/picks/)) {
    return 60 * 60; // 1 hour
  }

  // League standings
  if (path.includes('leagues-classic')) {
    return 5 * 60; // 5 minutes
  }

  // Manager history and transfers
  if (path.includes('history') || path.includes('transfers')) {
    return 5 * 60; // 5 minutes
  }

  // Player summary
  if (path.includes('element-summary')) {
    return 30 * 60; // 30 minutes
  }

  // Event status
  if (path.includes('event-status')) {
    return 60; // 1 minute
  }

  // Default
  return 5 * 60; // 5 minutes
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Build FPL API URL from the URL path (Vercel doesn't properly handle [...path])
  // Extract everything after /api/fpl/
  const url = req.url || '';
  const fplPathMatch = url.match(/\/api\/fpl\/(.+?)(?:\?|$)/);
  const path = fplPathMatch ? fplPathMatch[1] : '';

  // Check if this is a live request (for dynamic cache TTL)
  const isLive = req.query.live === '1' || req.query.live === 'true';

  // Build query string from remaining params (exclude path-related and cache-control params)
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    // Exclude path params and our custom 'live' param from being forwarded to FPL API
    if (key !== 'path' && !key.includes('path') && key !== 'live' && value) {
      queryParams.set(key, Array.isArray(value) ? value[0] : value);
    }
  }
  const queryString = queryParams.toString();

  // FPL API requires trailing slash
  const fplUrl = `${FPL_API_BASE}/${path}/${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await fetch(fplUrl, {
      headers: {
        // Browser-like headers to avoid Cloudflare 403 blocks
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
    });

    if (!response.ok) {
      // Don't cache error responses
      res.setHeader('Cache-Control', 'no-store');
      return res.status(response.status).json({
        error: 'FPL API error',
        status: response.status,
      });
    }

    const data = await response.json();

    // Set cache headers (shorter TTL during live games)
    const ttl = getCacheTTL(path, isLive);
    res.setHeader('Cache-Control', `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`);
    res.setHeader('Access-Control-Allow-Origin', '*');

    return res.status(200).json(data);
  } catch (error) {
    console.error('FPL proxy error:', error);
    return res.status(500).json({
      error: 'Failed to fetch from FPL API',
      details: String(error),
    });
  }
}
