/**
 * Centralized query key factory for TanStack Query.
 *
 * Benefits:
 * - Type-safe query keys
 * - Single source of truth for cache invalidation
 * - Prevents typos in query key strings
 * - Easier refactoring
 *
 * Usage:
 *   queryKey: queryKeys.bootstrap
 *   queryKey: queryKeys.managerDetails(managerId, gameweekId)
 */
export const queryKeys = {
  // Static data (rarely changes)
  bootstrap: ['bootstrap'] as const,
  eventStatus: ['eventStatus'] as const,
  fixturesAll: ['fixtures-all'] as const,

  // League data
  standings: (leagueId: number) => ['standings', leagueId] as const,

  // Manager data
  entry: (managerId: number) => ['entry', managerId] as const,
  managerDetails: (managerId: number, gameweekId: number | undefined) =>
    ['managerDetails', managerId, gameweekId] as const,
  entryHistory: (managerId: number) => ['entryHistory', managerId] as const,
  entryPicks: (managerId: number, gameweek: number) => ['entryPicks', managerId, gameweek] as const,

  // Gameweek data
  liveGameweek: (gameweek: number) => ['liveGameweek', gameweek] as const,
  fixtures: (gameweek: number) => ['fixtures', gameweek] as const,

  // Player data
  playerSummary: (playerId: number | undefined) => ['playerSummary', playerId] as const,

  // Analytics (from backend API)
  pointsAgainst: (seasonId: number) => ['pointsAgainst', seasonId] as const,
  pointsAgainstTeamHistory: (teamId: number, seasonId: number) =>
    ['pointsAgainstTeamHistory', teamId, seasonId] as const,
  pointsAgainstStatus: ['pointsAgainstStatus'] as const,

  // Chips (from backend API)
  leagueChips: (leagueId: number, gameweek: number, seasonId: number) =>
    ['leagueChips', leagueId, gameweek, seasonId] as const,

  // History (from backend API)
  leagueStats: (leagueId: number, gameweek: number, seasonId: number) =>
    ['leagueStats', leagueId, gameweek, seasonId] as const,
  leaguePositions: (leagueId: number, seasonId: number) =>
    ['leaguePositions', leagueId, seasonId] as const,

  // Manager comparison (from backend API)
  managerComparison: (managerA: number, managerB: number, leagueId: number, seasonId: number) =>
    ['managerComparison', managerA, managerB, leagueId, seasonId] as const,

  // Recommendations (from backend API)
  leagueRecommendations: (leagueId: number, seasonId: number) =>
    ['leagueRecommendations', leagueId, seasonId] as const,

  // Dashboard consolidation (from backend API)
  leagueDashboard: (leagueId: number, gameweek: number, seasonId: number) =>
    ['leagueDashboard', leagueId, gameweek, seasonId] as const,
} as const;

// Type exports for use in tests or other utilities
export type QueryKeys = typeof queryKeys;
