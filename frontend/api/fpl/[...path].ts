import type { VercelRequest, VercelResponse } from '@vercel/node';

const FPL_API_BASE = 'https://fantasy.premierleague.com/api';

/**
 * Tiered Cache TTLs based on endpoint type (same as Cloudflare Worker)
 */
function getCacheTTL(path: string): number {
  // Bootstrap static - players, teams, gameweeks
  if (path.includes('bootstrap-static')) {
    return 5 * 60; // 5 minutes
  }

  // Fixtures - match schedule
  if (path.includes('fixtures')) {
    return 15 * 60; // 15 minutes
  }

  // Live gameweek data
  if (path.match(/event\/\d+\/live/)) {
    return 2 * 60; // 2 minutes
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

  // Build query string from remaining params (exclude path-related params)
  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key !== 'path' && !key.includes('path') && value) {
      queryParams.set(key, Array.isArray(value) ? value[0] : value);
    }
  }
  const queryString = queryParams.toString();

  // FPL API requires trailing slash
  const fplUrl = `${FPL_API_BASE}/${path}/${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await fetch(fplUrl, {
      headers: {
        'User-Agent': 'TapasFPL/1.0',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'FPL API error',
        status: response.status,
      });
    }

    const data = await response.json();

    // Set cache headers
    const ttl = getCacheTTL(path);
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
