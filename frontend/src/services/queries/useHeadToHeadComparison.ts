import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import {
  backendApi,
  BackendApiError,
  type BackendManagerComparisonStats,
  type BackendTemplateOverlap,
  type ComparisonResponse,
} from '../backendApi';
import { queryKeys } from '../queryKeys';

export type PlaystyleLabel = 'Template' | 'Balanced' | 'Differential' | 'Maverick';

export interface TemplateOverlap {
  matchCount: number; // Players matching template (0-11)
  matchPercentage: number; // matchCount / 11 * 100
  matchingPlayerIds: number[];
  differentialPlayerIds: number[];
  playstyleLabel: PlaystyleLabel;
}

export interface GameweekExtreme {
  gw: number;
  points: number;
}

export interface ComparisonStats {
  managerId: number;
  teamName: string;
  // Season overview
  totalPoints: number;
  overallRank: number;
  leagueRank: number;
  last5Average: number; // Average points over last 5 GWs
  // Transfers
  totalTransfers: number;
  remainingTransfers: number; // FT available
  totalHits: number; // -4 per hit
  hitsCost: number; // total points lost
  // Captain
  captainPoints: number;
  differentialCaptains: number;
  // Chips (current half only)
  chipsUsed: string[]; // chip labels
  chipsRemaining: string[]; // chip labels
  // Value
  squadValue: number; // in millions (already divided)
  bank: number; // in millions
  // Template overlap
  leagueTemplateOverlap: TemplateOverlap;
  worldTemplateOverlap: TemplateOverlap;
  // Roster
  startingXI: number[]; // player IDs in starting XI
  // Gameweek extremes
  bestGameweek: GameweekExtreme | null;
  worstGameweek: GameweekExtreme | null;
  // Tier 1 analytics (new from backend)
  consistencyScore: number;
  benchWasteRate: number;
  hitFrequency: number;
}

export interface UseHeadToHeadComparisonParams {
  managerAId: number | null;
  managerBId: number | null;
  leagueId: number;
  seasonId?: number;
}

export interface RosterComparison {
  commonCount: number;
  commonPlayerIds: number[];
  managerAOnlyIds: number[];
  managerBOnlyIds: number[];
}

export interface HeadToHeadRecord {
  winsA: number;
  winsB: number;
  draws: number;
}

export interface UseHeadToHeadComparisonReturn {
  managerA: ComparisonStats | null;
  managerB: ComparisonStats | null;
  rosterComparison: RosterComparison | null;
  headToHead: HeadToHeadRecord | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Get playstyle label based on template match count
 * @param matchCount Number of players matching the league template (0-11)
 * @returns Playstyle category label
 */
export function getPlaystyleLabel(matchCount: number): PlaystyleLabel {
  if (matchCount >= 9) return 'Template';
  if (matchCount >= 6) return 'Balanced';
  if (matchCount >= 3) return 'Differential';
  return 'Maverick';
}

/**
 * Transform backend template overlap to frontend format
 */
function transformTemplateOverlap(backend: BackendTemplateOverlap | null): TemplateOverlap {
  if (!backend) {
    return {
      matchCount: 0,
      matchPercentage: 0,
      matchingPlayerIds: [],
      differentialPlayerIds: [],
      playstyleLabel: 'Maverick',
    };
  }
  return {
    matchCount: backend.match_count,
    matchPercentage: backend.match_percentage,
    matchingPlayerIds: backend.matching_player_ids,
    differentialPlayerIds: backend.differential_player_ids,
    playstyleLabel: backend.playstyle_label as PlaystyleLabel,
  };
}

/**
 * Transform backend manager stats to frontend ComparisonStats format
 */
function transformManagerStats(backend: BackendManagerComparisonStats): ComparisonStats {
  return {
    managerId: backend.manager_id,
    teamName: backend.team_name,
    // Season overview
    totalPoints: backend.total_points,
    overallRank: backend.overall_rank ?? 0,
    leagueRank: backend.league_rank ?? 0,
    last5Average: backend.last_5_average,
    // Transfers
    totalTransfers: backend.total_transfers,
    remainingTransfers: backend.remaining_transfers,
    totalHits: backend.total_hits,
    hitsCost: backend.hits_cost,
    // Captain
    captainPoints: backend.captain_points,
    differentialCaptains: backend.differential_captains,
    // Chips
    chipsUsed: backend.chips_used,
    chipsRemaining: backend.chips_remaining,
    // Value (backend returns in 0.1m units, divide by 10 for millions)
    squadValue: 0, // Note: Not returned by comparison endpoint (use from managerDetails)
    bank: 0, // Note: Not returned by comparison endpoint (use from managerDetails)
    // Template overlap
    leagueTemplateOverlap: transformTemplateOverlap(backend.league_template_overlap),
    worldTemplateOverlap: transformTemplateOverlap(backend.world_template_overlap),
    // Roster
    startingXI: backend.starting_xi,
    // Gameweek extremes
    bestGameweek: backend.best_gameweek
      ? { gw: backend.best_gameweek.gw, points: backend.best_gameweek.points }
      : null,
    worstGameweek: backend.worst_gameweek
      ? { gw: backend.worst_gameweek.gw, points: backend.worst_gameweek.points }
      : null,
    // Tier 1 analytics
    consistencyScore: backend.consistency_score,
    benchWasteRate: backend.bench_waste_rate,
    hitFrequency: backend.hit_frequency,
  };
}

/**
 * Build roster comparison from common players and starting XIs
 */
function buildRosterComparison(
  commonPlayers: number[],
  managerAXI: number[],
  managerBXI: number[]
): RosterComparison {
  const commonSet = new Set(commonPlayers);

  return {
    commonCount: commonPlayers.length,
    commonPlayerIds: commonPlayers,
    managerAOnlyIds: managerAXI.filter((id) => !commonSet.has(id)),
    managerBOnlyIds: managerBXI.filter((id) => !commonSet.has(id)),
  };
}

/**
 * Hook to fetch head-to-head comparison data from backend.
 * Replaces ~87 FPL API calls with a single backend call.
 */
export function useHeadToHeadComparison({
  managerAId,
  managerBId,
  leagueId,
  seasonId = 1,
}: UseHeadToHeadComparisonParams): UseHeadToHeadComparisonReturn {
  const enabled = managerAId !== null && managerBId !== null && managerAId !== managerBId;

  const { data, isLoading, error } = useQuery<ComparisonResponse, Error>({
    queryKey: queryKeys.managerComparison(managerAId ?? 0, managerBId ?? 0, leagueId, seasonId),
    queryFn: () => backendApi.getManagerComparison(managerAId!, managerBId!, leagueId, seasonId),
    enabled,
    staleTime: 60 * 1000, // 1 minute
    retry: (failureCount, err) => {
      // Don't retry on 4xx errors (bad request, not found)
      if (err instanceof BackendApiError && err.status >= 400 && err.status < 500) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const managerA = useMemo(() => {
    if (!data) return null;
    return transformManagerStats(data.manager_a);
  }, [data]);

  const managerB = useMemo(() => {
    if (!data) return null;
    return transformManagerStats(data.manager_b);
  }, [data]);

  const rosterComparison = useMemo(() => {
    if (!data) return null;
    return buildRosterComparison(
      data.common_players,
      data.manager_a.starting_xi,
      data.manager_b.starting_xi
    );
  }, [data]);

  const headToHead = useMemo(() => {
    if (!data) return null;
    return {
      winsA: data.head_to_head.wins_a,
      winsB: data.head_to_head.wins_b,
      draws: data.head_to_head.draws,
    };
  }, [data]);

  return {
    managerA,
    managerB,
    rosterComparison,
    headToHead,
    loading: isLoading,
    error: error ?? null,
  };
}
