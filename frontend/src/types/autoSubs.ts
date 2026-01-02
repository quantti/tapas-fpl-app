import type { ManagerPick } from '../services/queries/useFplData';

/**
 * Represents a single auto-substitution that occurred or would occur
 */
export interface AutoSubstitution {
  /** The player being subbed OUT (didn't play/contribute) */
  playerOut: {
    playerId: number;
    position: number; // Original squad position (1-11)
    elementType: number; // 1=GK, 2=DEF, 3=MID, 4=FWD
    webName: string;
  };
  /** The player being subbed IN (from bench) */
  playerIn: {
    playerId: number;
    position: number; // Original bench position (12-15)
    elementType: number;
    webName: string;
  };
}

/**
 * Result of calculating auto-substitutions for a manager
 */
export interface AutoSubResult {
  /** Updated picks with adjusted multipliers */
  adjustedPicks: ManagerPick[];
  /** List of auto-subs that occurred */
  autoSubs: AutoSubstitution[];
  /** Whether vice-captain was promoted to captain */
  captainPromoted: boolean;
  /** Original captain's player ID (if promoted) */
  originalCaptainId?: number;
}

/**
 * Player eligibility info for auto-sub calculation
 */
export interface PlayerEligibility {
  playerId: number;
  elementType: number; // Position type (1=GK, 2=DEF, 3=MID, 4=FWD)
  fixtureFinished: boolean; // Their fixture is done
  hasContribution: boolean; // Had any scoring events (minutes, cards, etc.)
  webName: string;
}
