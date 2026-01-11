import type {
  BootstrapStatic,
  ElementSummary,
  Entry,
  Fixture,
  LeagueStandings,
  LiveGameweek,
} from 'types/fpl';

// API base URL - uses Vercel serverless functions (same origin in production)
// In development, can use local backend or direct to production
const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Custom error class for FPL API errors.
 * Preserves the HTTP status code for smart error handling (e.g., 503 detection).
 */
export class FplApiError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string) {
    super(`API error: ${status} ${statusText}`);
    this.name = 'FplApiError';
    this.status = status;
    this.statusText = statusText;
  }

  /**
   * Returns true if FPL API is updating (503 Service Unavailable).
   * This typically happens for 30-60 minutes between gameweeks.
   */
  get isServiceUnavailable(): boolean {
    return this.status === 503;
  }
}

async function fetchApi<T>(endpoint: string): Promise<T> {
  // Remove leading slash for path construction
  const path = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  const response = await fetch(`${API_BASE}/api/fpl/${path}`);

  if (!response.ok) {
    throw new FplApiError(response.status, response.statusText);
  }

  return response.json();
}

export const fplApi = {
  /**
   * Get all static game data - players, teams, gameweeks, settings
   * This is the most important endpoint - cache it!
   */
  getBootstrapStatic: () => fetchApi<BootstrapStatic>('/bootstrap-static'),

  /**
   * Get all fixtures for the season
   * Optionally filter by gameweek
   */
  getFixtures: (gameweek?: number) => {
    const endpoint = gameweek !== undefined ? `/fixtures?event=${gameweek}` : '/fixtures';
    return fetchApi<Fixture[]>(endpoint);
  },

  /**
   * Get a manager's team info
   */
  getEntry: (teamId: number) => fetchApi<Entry>(`/entry/${teamId}`),

  /**
   * Get a manager's history (points per gameweek, past seasons)
   */
  getEntryHistory: (teamId: number) =>
    fetchApi<{
      current: {
        event: number;
        points: number;
        total_points: number;
        rank: number;
        overall_rank: number;
        event_transfers: number;
        event_transfers_cost: number;
        value: number;
        bank: number;
      }[];
      past: { season_name: string; total_points: number; rank: number }[];
      chips: { name: string; time: string; event: number }[];
    }>(`/entry/${teamId}/history`),

  /**
   * Get a manager's picks for a specific gameweek
   */
  getEntryPicks: (teamId: number, gameweek: number) =>
    fetchApi<{
      active_chip: string | null;
      automatic_subs: {
        entry: number;
        element_in: number;
        element_out: number;
        event: number;
      }[];
      entry_history: {
        event: number;
        points: number;
        total_points: number;
        rank: number;
        overall_rank: number;
        value: number;
        bank: number;
        event_transfers: number;
        event_transfers_cost: number;
      };
      picks: {
        element: number;
        position: number;
        multiplier: number;
        is_captain: boolean;
        is_vice_captain: boolean;
      }[];
    }>(`/entry/${teamId}/event/${gameweek}/picks`),

  /**
   * Get classic league standings
   */
  getLeagueStandings: (leagueId: number, page = 1) =>
    fetchApi<LeagueStandings>(`/leagues-classic/${leagueId}/standings?page_standings=${page}`),

  /**
   * Get live gameweek data (player points during matches)
   */
  getLiveGameweek: (gameweek: number) => fetchApi<LiveGameweek>(`/event/${gameweek}/live`),

  /**
   * Get detailed player info including fixture history and upcoming
   */
  getPlayerSummary: (playerId: number) => fetchApi<ElementSummary>(`/element-summary/${playerId}`),

  /**
   * Get all transfers made by a manager this season
   */
  getEntryTransfers: (teamId: number) =>
    fetchApi<
      {
        element_in: number;
        element_in_cost: number;
        element_out: number;
        element_out_cost: number;
        entry: number;
        event: number;
        time: string;
      }[]
    >(`/entry/${teamId}/transfers`),

  /**
   * Get event status - indicates processing state for bonus points and leagues
   * Useful for detecting if the gameweek data is still being processed
   */
  getEventStatus: () =>
    fetchApi<{
      status: {
        bonus_added: boolean;
        date: string;
        event: number;
        points: string;
      }[];
      leagues: string;
    }>('/event-status'),
};
