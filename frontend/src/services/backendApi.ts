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

// History API types - League Stats
export interface BenchPointsStat {
  manager_id: number;
  name: string;
  bench_points: number;
}

export interface FreeTransferStat {
  manager_id: number;
  name: string;
  free_transfers: number;
}

export interface CaptainDifferentialDetail {
  gameweek: number;
  captain_id: number;
  captain_name: string;
  captain_points: number;
  template_id: number;
  template_name: string;
  template_points: number;
  gain: number; // Can be negative
  multiplier: number; // 2 for normal, 3 for TC
}

export interface CaptainDifferentialStat {
  manager_id: number;
  name: string;
  differential_picks: number;
  gain: number; // Can be negative
  details: CaptainDifferentialDetail[];
}

export interface LeagueStatsResponse {
  league_id: number;
  season_id: number;
  current_gameweek: number;
  bench_points: BenchPointsStat[];
  free_transfers: FreeTransferStat[];
  captain_differential: CaptainDifferentialStat[];
}

// History API types - Manager Comparison
export interface BackendTemplateOverlap {
  match_count: number;
  match_percentage: number;
  matching_player_ids: number[];
  differential_player_ids: number[];
  playstyle_label: string; // "Template", "Balanced", "Differential", "Maverick"
}

export interface BackendGameweekExtreme {
  gw: number;
  points: number;
}

export interface BackendManagerComparisonStats {
  manager_id: number;
  name: string;
  team_name: string;
  total_points: number;
  overall_rank: number | null;
  league_rank: number | null;
  total_transfers: number;
  total_hits: number;
  hits_cost: number;
  remaining_transfers: number;
  captain_points: number;
  differential_captains: number;
  chips_used: string[];
  chips_remaining: string[];
  best_gameweek: BackendGameweekExtreme | null;
  worst_gameweek: BackendGameweekExtreme | null;
  starting_xi: number[];
  league_template_overlap: BackendTemplateOverlap | null;
  world_template_overlap: BackendTemplateOverlap | null;
  // Tier 1 analytics
  consistency_score: number;
  bench_waste_rate: number;
  hit_frequency: number;
  last_5_average: number;
  // Tier 2 analytics
  form_momentum: string; // "improving", "stable", "declining"
  recovery_rate: number;
  // Tier 3 analytics (xG-based)
  luck_index: number | null;
  captain_xp_delta: number | null;
  squad_xp: number | null;
}

export interface BackendHeadToHead {
  wins_a: number;
  wins_b: number;
  draws: number;
}

export interface ComparisonResponse {
  season_id: number;
  manager_a: BackendManagerComparisonStats;
  manager_b: BackendManagerComparisonStats;
  common_players: number[];
  head_to_head: BackendHeadToHead;
}

// Recommendations API types
export interface RecommendedPlayerData {
  id: number;
  name: string;
  team: number;
  position: number;
  price: number;
  ownership: number; // 0-100 percentage
  score: number; // 0-1 normalized score
  xg90: number;
  xa90: number;
  form: number;
  sell_score?: number; // Only for time_to_sell category
}

export interface LeagueRecommendationsResponse {
  league_id: number;
  season_id: number;
  punts: RecommendedPlayerData[];
  defensive: RecommendedPlayerData[];
  time_to_sell: RecommendedPlayerData[];
}

// History API types - League Positions
export interface ManagerMetadata {
  id: number;
  name: string;
  color: string;
}

export interface GameweekPosition {
  gameweek: number;
  [managerId: string]: number; // Dynamic keys: manager_id -> rank
}

export interface LeaguePositionsResponse {
  league_id: number;
  season_id: number;
  positions: GameweekPosition[];
  managers: ManagerMetadata[];
}

// Set and Forget API types
export interface SetAndForgetManager {
  manager_id: number;
  total_points: number;
  actual_points: number;
  difference: number;
  auto_subs_made: number;
  captain_points_gained: number;
}

export interface LeagueSetAndForgetResponse {
  league_id: number;
  season_id: number;
  current_gameweek: number;
  managers: SetAndForgetManager[];
}

// Dashboard API types
export interface DashboardPick {
  position: number;
  player_id: number;
  player_name: string;
  team_id: number;
  team_short_name: string;
  element_type: number;
  is_captain: boolean;
  is_vice_captain: boolean;
  multiplier: number;
  now_cost: number;
  form: number;
  points_per_game: number;
  selected_by_percent: number;
}

export interface DashboardTransfer {
  player_in_id: number;
  player_in_name: string;
  player_out_id: number;
  player_out_name: string;
}

export interface DashboardManager {
  entry_id: number;
  manager_name: string;
  team_name: string;
  total_points: number;
  gw_points: number;
  rank: number;
  last_rank: number | null;
  overall_rank: number | null;
  last_overall_rank: number | null;
  bank: number;
  team_value: number;
  transfers_made: number;
  transfer_cost: number;
  total_hits_cost: number;
  chip_active: string | null;
  picks: DashboardPick[];
  chips_used: string[];
  transfers: DashboardTransfer[];
}

export interface LeagueDashboardResponse {
  league_id: number;
  gameweek: number;
  season_id: number;
  managers: DashboardManager[];
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
 * @internal Exported for testing only
 */
export function validateTeamsResponse(data: unknown): data is PointsAgainstResponse {
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

/**
 * Validate LeagueChipsResponse has expected shape.
 * @internal Exported for testing only
 */
export function validateLeagueChipsResponse(data: unknown): data is LeagueChipsResponse {
  if (!data || typeof data !== 'object') return false;
  const response = data as Record<string, unknown>;
  if (typeof response.league_id !== 'number') return false;
  if (typeof response.current_gameweek !== 'number') return false;
  if (!Array.isArray(response.managers)) return false;

  // Validate first manager has expected structure (if array not empty)
  if (response.managers.length > 0) {
    const manager = response.managers[0] as Record<string, unknown>;
    if (typeof manager.manager_id !== 'number') return false;
    if (!manager.first_half || typeof manager.first_half !== 'object') return false;
  }
  return true;
}

/**
 * Validate LeagueStatsResponse has expected shape.
 * @internal Exported for testing only
 */
export function validateLeagueStatsResponse(data: unknown): data is LeagueStatsResponse {
  if (!data || typeof data !== 'object') return false;
  const response = data as Record<string, unknown>;
  if (typeof response.league_id !== 'number') return false;
  if (typeof response.current_gameweek !== 'number') return false;
  if (!Array.isArray(response.bench_points)) return false;
  if (!Array.isArray(response.free_transfers)) return false;
  if (!Array.isArray(response.captain_differential)) return false;
  return true;
}

/**
 * Validate LeaguePositionsResponse has expected shape.
 * @internal Exported for testing only
 */
export function validateLeaguePositionsResponse(data: unknown): data is LeaguePositionsResponse {
  if (!data || typeof data !== 'object') return false;
  const response = data as Record<string, unknown>;
  if (typeof response.league_id !== 'number') return false;
  if (!Array.isArray(response.positions)) return false;
  if (!Array.isArray(response.managers)) return false;

  // Validate first position entry has gameweek (if array not empty)
  if (response.positions.length > 0) {
    const position = response.positions[0] as Record<string, unknown>;
    if (typeof position.gameweek !== 'number') return false;
  }
  return true;
}

/**
 * Validate ComparisonResponse has expected shape.
 * @internal Exported for testing only
 */
export function validateComparisonResponse(data: unknown): data is ComparisonResponse {
  if (!data || typeof data !== 'object') return false;
  const response = data as Record<string, unknown>;
  if (typeof response.season_id !== 'number') return false;
  if (!response.manager_a || typeof response.manager_a !== 'object') return false;
  if (!response.manager_b || typeof response.manager_b !== 'object') return false;
  if (!Array.isArray(response.common_players)) return false;
  if (!response.head_to_head || typeof response.head_to_head !== 'object') return false;

  // Validate manager_a has required fields
  const managerA = response.manager_a as Record<string, unknown>;
  if (typeof managerA.manager_id !== 'number') return false;
  if (typeof managerA.total_points !== 'number') return false;
  if (!Array.isArray(managerA.starting_xi)) return false;

  return true;
}

/**
 * Validate LeagueDashboardResponse has expected shape.
 * @internal Exported for testing only
 */
export function validateLeagueDashboardResponse(data: unknown): data is LeagueDashboardResponse {
  if (!data || typeof data !== 'object') return false;
  const response = data as Record<string, unknown>;
  if (typeof response.league_id !== 'number') return false;
  if (typeof response.gameweek !== 'number') return false;
  if (typeof response.season_id !== 'number') return false;
  if (!Array.isArray(response.managers)) return false;

  // Validate first manager has expected structure (if array not empty)
  if (response.managers.length > 0) {
    const manager = response.managers[0] as Record<string, unknown>;
    if (typeof manager.entry_id !== 'number') return false;
    if (!Array.isArray(manager.picks)) return false;
  }
  return true;
}

/**
 * Validate LeagueRecommendationsResponse has expected shape.
 * @internal Exported for testing only
 */
export function validateLeagueRecommendationsResponse(
  data: unknown
): data is LeagueRecommendationsResponse {
  if (!data || typeof data !== 'object') return false;
  const response = data as Record<string, unknown>;
  if (typeof response.league_id !== 'number') return false;
  if (!Array.isArray(response.punts)) return false;
  if (!Array.isArray(response.defensive)) return false;
  if (!Array.isArray(response.time_to_sell)) return false;

  // Validate first punt has expected structure (if array not empty)
  if (response.punts.length > 0) {
    const player = response.punts[0] as Record<string, unknown>;
    if (typeof player.id !== 'number') return false;
    if (typeof player.score !== 'number') return false;
  }
  return true;
}

/**
 * Validate LeagueSetAndForgetResponse has expected shape.
 * @internal Exported for testing only
 */
export function validateLeagueSetAndForgetResponse(
  data: unknown
): data is LeagueSetAndForgetResponse {
  if (!data || typeof data !== 'object') return false;
  const response = data as Record<string, unknown>;
  if (typeof response.league_id !== 'number') return false;
  if (typeof response.current_gameweek !== 'number') return false;
  if (!Array.isArray(response.managers)) return false;

  // Validate first manager has expected structure (if array not empty)
  if (response.managers.length > 0) {
    const manager = response.managers[0] as Record<string, unknown>;
    if (typeof manager.manager_id !== 'number') return false;
    if (typeof manager.total_points !== 'number') return false;
    if (typeof manager.difference !== 'number') return false;
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
  getLeagueChips: async (
    leagueId: number,
    currentGameweek: number,
    { seasonId = 1, sync = false }: { seasonId?: number; sync?: boolean } = {}
  ): Promise<LeagueChipsResponse> => {
    const data = await fetchBackend<LeagueChipsResponse>(
      `/api/v1/chips/league/${leagueId}?current_gameweek=${currentGameweek}&season_id=${seasonId}&sync=${sync}`
    );
    if (!validateLeagueChipsResponse(data)) {
      throw new BackendApiError(200, 'OK', 'Invalid response shape from chips endpoint');
    }
    return data;
  },

  /**
   * Get aggregated statistics for all managers in a league.
   * Returns bench points, free transfers, and captain differentials.
   * Replaces ~100+ individual FPL API calls with a single backend call.
   */
  getLeagueStats: async (
    leagueId: number,
    currentGameweek: number,
    seasonId = 1
  ): Promise<LeagueStatsResponse> => {
    const data = await fetchBackend<LeagueStatsResponse>(
      `/api/v1/history/league/${leagueId}/stats?current_gameweek=${currentGameweek}&season_id=${seasonId}`
    );
    if (!validateLeagueStatsResponse(data)) {
      throw new BackendApiError(200, 'OK', 'Invalid response shape from stats endpoint');
    }
    return data;
  },

  /**
   * Get league position history for bump chart visualization.
   * Returns positions for each manager at each gameweek, plus metadata with colors.
   */
  getLeaguePositions: async (leagueId: number, seasonId = 1): Promise<LeaguePositionsResponse> => {
    const data = await fetchBackend<LeaguePositionsResponse>(
      `/api/v1/history/league/${leagueId}/positions?season_id=${seasonId}`
    );
    if (!validateLeaguePositionsResponse(data)) {
      throw new BackendApiError(200, 'OK', 'Invalid response shape from positions endpoint');
    }
    return data;
  },

  /**
   * Get head-to-head comparison between two managers.
   * Returns detailed stats, template overlap, and analytics for both managers.
   * Replaces ~87 individual FPL API calls with a single backend call.
   */
  getManagerComparison: async (
    managerA: number,
    managerB: number,
    leagueId: number,
    seasonId = 1
  ): Promise<ComparisonResponse> => {
    const params = new URLSearchParams({
      manager_a: String(managerA),
      manager_b: String(managerB),
      league_id: String(leagueId),
      season_id: String(seasonId),
    });
    const data = await fetchBackend<ComparisonResponse>(`/api/v1/history/comparison?${params}`);
    if (!validateComparisonResponse(data)) {
      throw new BackendApiError(200, 'OK', 'Invalid response shape from comparison endpoint');
    }
    return data;
  },

  /**
   * Get player recommendations for a league.
   * Returns punts (low ownership differentials), defensive (safe picks), and time to sell.
   * Replaces heavy frontend calculation with backend computation.
   */
  getLeagueRecommendations: async (
    leagueId: number,
    { seasonId = 1, limit = 20 }: { seasonId?: number; limit?: number } = {}
  ): Promise<LeagueRecommendationsResponse> => {
    const data = await fetchBackend<LeagueRecommendationsResponse>(
      `/api/v1/recommendations/league/${leagueId}?season_id=${seasonId}&limit=${limit}`
    );
    if (!validateLeagueRecommendationsResponse(data)) {
      throw new BackendApiError(200, 'OK', 'Invalid response shape from recommendations endpoint');
    }
    return data;
  },

  /**
   * Get consolidated dashboard data for a league.
   * Returns all manager data (picks, chips, transfers, standings) in a single call.
   * Replaces ~64 FPL API calls with one backend request.
   */
  getLeagueDashboard: async (
    leagueId: number,
    gameweek: number,
    seasonId = 1
  ): Promise<LeagueDashboardResponse> => {
    const data = await fetchBackend<LeagueDashboardResponse>(
      `/api/v1/dashboard/league/${leagueId}?gameweek=${gameweek}&season_id=${seasonId}`
    );
    if (!validateLeagueDashboardResponse(data)) {
      throw new BackendApiError(200, 'OK', 'Invalid response shape from dashboard endpoint');
    }
    return data;
  },

  /**
   * Get Set and Forget points comparison for a league.
   * Calculates hypothetical points if each manager kept their GW1 squad all season.
   * Returns managers sorted by difference (best set-and-forget performance first).
   */
  getLeagueSetAndForget: async (
    leagueId: number,
    currentGameweek: number,
    seasonId = 1
  ): Promise<LeagueSetAndForgetResponse> => {
    const data = await fetchBackend<LeagueSetAndForgetResponse>(
      `/api/v1/set-and-forget/league/${leagueId}?current_gameweek=${currentGameweek}&season_id=${seasonId}`
    );
    if (!validateLeagueSetAndForgetResponse(data)) {
      throw new BackendApiError(200, 'OK', 'Invalid response shape from set-and-forget endpoint');
    }
    return data;
  },
};
