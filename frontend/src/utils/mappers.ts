import type { LivePlayer, Player, Team } from 'types/fpl';

/**
 * Creates a Map from player ID to Player object for O(1) lookups
 */
export function createPlayersMap(players: Player[]): Map<number, Player> {
  return new Map(players.map((p) => [p.id, p]));
}

/**
 * Creates a Map from team ID to Team object for O(1) lookups
 */
export function createTeamsMap(teams: Team[]): Map<number, Team> {
  return new Map(teams.map((t) => [t.id, t]));
}

/**
 * Creates a Map from player ID to LivePlayer object for O(1) lookups
 * Used for live gameweek data
 */
export function createLivePlayersMap(players: LivePlayer[]): Map<number, LivePlayer> {
  return new Map(players.map((p) => [p.id, p]));
}
