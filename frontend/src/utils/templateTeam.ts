import { POSITION_TYPES } from '../constants/positions';

import type { ManagerGameweekData } from '../services/queries/useFplData';
import type { Player, Team } from '../types/fpl';

/**
 * Build ownership map from global FPL ownership percentages (selected_by_percent)
 * Used for world template team calculation
 */
export function calculateWorldOwnership(
  players: Player[],
  teamsMap: Map<number, Team>
): Map<number, PlayerWithOwnership> {
  const result = new Map<number, PlayerWithOwnership>();

  for (const player of players) {
    // Only include available players with meaningful ownership
    const ownershipPct = Number.parseFloat(player.selected_by_percent) || 0;
    if (ownershipPct > 0) {
      result.set(player.id, {
        player,
        team: teamsMap.get(player.team),
        ownershipCount: 0, // Not applicable for global ownership
        ownershipPercentage: ownershipPct,
      });
    }
  }

  return result;
}

export interface PlayerWithOwnership {
  player: Player;
  team: Team | undefined;
  ownershipCount: number;
  ownershipPercentage: number;
}

// FPL formation limits
const POSITION_LIMITS = {
  1: { min: 1, max: 1 }, // GK
  2: { min: 3, max: 5 }, // DEF
  3: { min: 2, max: 5 }, // MID
  4: { min: 1, max: 3 }, // FWD
};

/**
 * Calculate player ownership across all managers
 */
export function calculateOwnership(
  managerDetails: ManagerGameweekData[],
  playersMap: Map<number, Player>,
  teamsMap: Map<number, Team>
): Map<number, PlayerWithOwnership> {
  const totalManagers = managerDetails.length;
  if (totalManagers === 0) return new Map();

  const ownershipCount = new Map<number, number>();

  for (const manager of managerDetails) {
    for (const pick of manager.picks) {
      // Only count starting XI (multiplier > 0), not benched players
      if (pick.multiplier > 0) {
        ownershipCount.set(pick.playerId, (ownershipCount.get(pick.playerId) || 0) + 1);
      }
    }
  }

  const result = new Map<number, PlayerWithOwnership>();

  for (const [playerId, count] of ownershipCount) {
    const player = playersMap.get(playerId);
    if (player) {
      result.set(playerId, {
        player,
        team: teamsMap.get(player.team),
        ownershipCount: count,
        ownershipPercentage: (count / totalManagers) * 100,
      });
    }
  }

  return result;
}

/**
 * Greedy formation algorithm: pick highest ownership players while maintaining valid formation
 *
 * Algorithm:
 * 1. Pick top 1 GK (required)
 * 2. Pick top 3 DEF (minimum)
 * 3. Pick top 2 MID (minimum)
 * 4. Pick top 1 FWD (minimum)
 * 5. Fill remaining 4 spots greedily with highest ownership from DEF/MID/FWD (respecting max limits)
 */
export function buildTemplateTeam(
  ownership: Map<number, PlayerWithOwnership>
): PlayerWithOwnership[] {
  if (ownership.size === 0) return [];

  // Group by position and sort by ownership descending
  const byPosition = new Map<number, PlayerWithOwnership[]>();
  for (const data of ownership.values()) {
    const pos = data.player.element_type;
    if (!byPosition.has(pos)) {
      byPosition.set(pos, []);
    }
    byPosition.get(pos)!.push(data);
  }

  // Sort each position by ownership (descending), then by total_points (descending) for ties
  for (const players of byPosition.values()) {
    players.sort((a, b) => {
      if (b.ownershipPercentage !== a.ownershipPercentage) {
        return b.ownershipPercentage - a.ownershipPercentage;
      }
      return b.player.total_points - a.player.total_points;
    });
  }

  const gks = byPosition.get(1) || [];
  const defs = byPosition.get(2) || [];
  const mids = byPosition.get(3) || [];
  const fwds = byPosition.get(4) || [];

  // Check we have enough players
  if (
    gks.length < POSITION_LIMITS[1].min ||
    defs.length < POSITION_LIMITS[2].min ||
    mids.length < POSITION_LIMITS[3].min ||
    fwds.length < POSITION_LIMITS[4].min
  ) {
    return [];
  }

  // Step 1: Pick minimums
  const selected = {
    gk: gks.slice(0, POSITION_LIMITS[1].min),
    def: defs.slice(0, POSITION_LIMITS[2].min),
    mid: mids.slice(0, POSITION_LIMITS[3].min),
    fwd: fwds.slice(0, POSITION_LIMITS[4].min),
  };

  // Current counts
  const counts = {
    def: selected.def.length,
    mid: selected.mid.length,
    fwd: selected.fwd.length,
  };

  // Step 2: Fill remaining 4 spots greedily
  const remaining = 11 - 1 - counts.def - counts.mid - counts.fwd; // 11 - 1 GK - 3 DEF - 2 MID - 1 FWD = 4

  // Create pool of remaining candidates (not yet selected, respecting max limits)
  interface Candidate {
    data: PlayerWithOwnership;
    position: 'def' | 'mid' | 'fwd';
  }

  const candidates: Candidate[] = [];

  // Add remaining DEFs (up to max limit)
  for (let i = counts.def; i < Math.min(defs.length, POSITION_LIMITS[2].max); i++) {
    candidates.push({ data: defs[i], position: 'def' });
  }

  // Add remaining MIDs (up to max limit)
  for (let i = counts.mid; i < Math.min(mids.length, POSITION_LIMITS[3].max); i++) {
    candidates.push({ data: mids[i], position: 'mid' });
  }

  // Add remaining FWDs (up to max limit)
  for (let i = counts.fwd; i < Math.min(fwds.length, POSITION_LIMITS[4].max); i++) {
    candidates.push({ data: fwds[i], position: 'fwd' });
  }

  // Sort candidates by ownership (descending)
  candidates.sort((a, b) => b.data.ownershipPercentage - a.data.ownershipPercentage);

  // Position to element type mapping
  const positionToElementType: Record<'def' | 'mid' | 'fwd', 2 | 3 | 4> = {
    def: 2,
    mid: 3,
    fwd: 4,
  };

  // Greedily pick remaining spots
  let spotsToFill = remaining;
  for (const candidate of candidates) {
    if (spotsToFill <= 0) break;

    // Check if we can still add to this position
    const elementType = positionToElementType[candidate.position];
    if (counts[candidate.position] < POSITION_LIMITS[elementType].max) {
      selected[candidate.position].push(candidate.data);
      counts[candidate.position]++;
      spotsToFill--;
    }
  }

  // Combine all selected players in position order: GK, DEF, MID, FWD
  return [...selected.gk, ...selected.def, ...selected.mid, ...selected.fwd];
}

/**
 * Get the formation string (e.g., "4-4-2")
 */
export function getFormationString(players: PlayerWithOwnership[]): string {
  const def = players.filter((p) => p.player.element_type === POSITION_TYPES.DEFENDER).length;
  const mid = players.filter((p) => p.player.element_type === POSITION_TYPES.MIDFIELDER).length;
  const fwd = players.filter((p) => p.player.element_type === POSITION_TYPES.FORWARD).length;
  return `${def}-${mid}-${fwd}`;
}
