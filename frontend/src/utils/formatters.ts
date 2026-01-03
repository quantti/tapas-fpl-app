import type { Player } from 'types/fpl';

/**
 * Gets the display name for a player.
 * Prefers web_name, falls back to "first_name second_name"
 */
export function getPlayerDisplayName(player: Player | undefined | null): string {
  if (!player) return '?';
  return player.web_name || `${player.first_name} ${player.second_name}`;
}
