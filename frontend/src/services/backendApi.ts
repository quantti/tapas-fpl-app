/**
 * Backend API client for analytics endpoints (Points Against, etc.)
 *
 * The backend runs on Fly.io and provides computed analytics data
 * stored in Supabase PostgreSQL.
 */

// Backend API base URL - Fly.io in production, can override for local dev
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://tapas-fpl-backend.fly.dev';

/**
 * Custom error class for backend API errors.
 */
export class BackendApiError extends Error {
  readonly status: number;
  readonly statusText: string;

  constructor(status: number, statusText: string, detail?: string) {
    super(detail || `Backend API error: ${status} ${statusText}`);
    this.name = 'BackendApiError';
    this.status = status;
    this.statusText = statusText;
  }

  get isServiceUnavailable(): boolean {
    return this.status === 503 || this.status === 0; // 0 = network error
  }
}

// Types matching backend response format
export interface TeamPointsAgainst {
  team_id: number;
  team_name: string;
  short_name: string;
  matches_played: number;
  total_points: number;
  home_points: number;
  away_points: number;
  avg_per_match: number;
}

export interface PointsAgainstResponse {
  season_id: number;
  teams: TeamPointsAgainst[];
}

export interface FixturePointsAgainst {
  fixture_id: number;
  gameweek: number;
  total_points: number;
  home_points: number;
  away_points: number;
  is_home: boolean;
  opponent_id: number;
}

export interface TeamHistoryResponse {
  team_id: number;
  season_id: number;
  fixtures: FixturePointsAgainst[];
}

export interface CollectionStatusResponse {
  season_id?: number;
  latest_gameweek?: number;
  total_players_processed?: number;
  status: string;
  last_full_collection?: string | null;
  last_incremental_update?: string | null;
  error_message?: string | null;
  message?: string; // For not_initialized status
}

// Chips API types
export interface ChipUsedData {
  chip_type: string;
  gameweek: number;
  points_gained: number | null;
}

export interface HalfChipsData {
  chips_used: ChipUsedData[];
  chips_remaining: string[];
}

export interface ManagerChipsData {
  manager_id: number;
  name: string;
  first_half: HalfChipsData;
  second_half: HalfChipsData;
}

export interface LeagueChipsResponse {
  league_id: number;
  season_id: number;
  current_gameweek: number;
  current_half: number;
  managers: ManagerChipsData[];
}

async function fetchBackend<T>(endpoint: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${BACKEND_URL}${endpoint}`);
  } catch (error) {
    // Network-level errors (offline, CORS, DNS, timeout)
    const message = error instanceof Error ? error.message : 'Unable to reach backend service';
    if (import.meta.env.DEV) {
      console.warn(`Backend API network error: ${message}`, { endpoint });
    }
    throw new BackendApiError(0, 'Network Error', message);
  }

  if (!response.ok) {
    let detail: string | undefined;
    try {
      const errorBody = await response.json();
      detail = errorBody.detail;
    } catch {
      // Response body may not be JSON or may be empty
    }
    if (import.meta.env.DEV) {
      console.warn(`Backend API error: ${response.status} ${response.statusText}`, {
        endpoint,
        detail,
      });
    }
    throw new BackendApiError(response.status, response.statusText, detail);
  }

  try {
    const data = await response.json();
    return data as T;
  } catch {
    throw new BackendApiError(response.status, response.statusText, 'Invalid response format');
  }
}

/**
 * Validate that the teams array has the expected shape.
 * Throws if data is malformed to prevent runtime errors.
 */
function validateTeamsResponse(data: unknown): data is PointsAgainstResponse {
  if (!data || typeof data !== 'object') return false;
  const response = data as Record<string, unknown>;
  if (!Array.isArray(response.teams)) return false;

  // Validate first team has required numeric fields (if array not empty)
  if (response.teams.length > 0) {
    const team = response.teams[0] as Record<string, unknown>;
    if (typeof team.avg_per_match !== 'number') return false;
  }
  return true;
}

export const backendApi = {
  /**
   * Get points conceded by all teams for the season.
   * Teams are sorted by total points (highest = weakest defense).
   */
  getPointsAgainst: async (seasonId = 1): Promise<PointsAgainstResponse> => {
    const data = await fetchBackend<PointsAgainstResponse>(
      `/api/v1/points-against?season_id=${seasonId}`
    );
    if (!validateTeamsResponse(data)) {
      throw new BackendApiError(200, 'OK', 'Invalid response shape from backend');
    }
    return data;
  },

  /**
   * Get fixture-by-fixture points conceded by a specific team.
   * Useful for showing trends over the season.
   */
  getTeamHistory: (teamId: number, seasonId = 1) =>
    fetchBackend<TeamHistoryResponse>(
      `/api/v1/points-against/${teamId}/history?season_id=${seasonId}`
    ),

  /**
   * Get the status of the Points Against data collection.
   */
  getCollectionStatus: () =>
    fetchBackend<CollectionStatusResponse>('/api/v1/points-against/status'),

  /**
   * Get chip usage for all managers in a league.
   * When sync=true, fetches fresh data from FPL API and stores it.
   */
  getLeagueChips: (
    leagueId: number,
    currentGameweek: number,
    { seasonId = 1, sync = false }: { seasonId?: number; sync?: boolean } = {}
  ) =>
    fetchBackend<LeagueChipsResponse>(
      `/api/v1/chips/league/${leagueId}?current_gameweek=${currentGameweek}&season_id=${seasonId}&sync=${sync}`
    ),
};
