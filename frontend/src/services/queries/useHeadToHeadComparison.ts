import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getChipsForCurrentHalf } from 'utils/chips';
import { buildTemplateTeam, calculateOwnership, calculateWorldOwnership } from 'utils/templateTeam';

import { fplApi } from '../api';
import { queryKeys } from '../queryKeys';

import { calculateFreeTransfers } from './useFreeTransfers';
import { useHistoricalData } from './useHistoricalData';

import type { ManagerGameweekData } from './useFplData';
import type { Gameweek, Player, Team } from 'types/fpl';

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
}

export interface UseHeadToHeadComparisonParams {
  managerAId: number | null;
  managerBId: number | null;
  managerDetails: ManagerGameweekData[];
  currentGameweek: number;
  gameweeks: Gameweek[];
  playersMap: Map<number, Player>;
  teamsMap: Map<number, Team>;
}

export interface RosterComparison {
  commonCount: number;
  commonPlayerIds: number[];
  managerAOnlyIds: number[];
  managerBOnlyIds: number[];
}

export interface UseHeadToHeadComparisonReturn {
  managerA: ComparisonStats | null;
  managerB: ComparisonStats | null;
  rosterComparison: RosterComparison | null;
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

export function useHeadToHeadComparison({
  managerAId,
  managerBId,
  managerDetails,
  currentGameweek,
  gameweeks,
  playersMap,
  teamsMap,
}: UseHeadToHeadComparisonParams): UseHeadToHeadComparisonReturn {
  // Get deadline time for current gameweek (needed for chip half calculation and FT)
  const deadlineTime = gameweeks.find((gw) => gw.id === currentGameweek)?.deadline_time;

  // Check if deadline has passed (affects FT calculation - you get +1 after deadline)
  const deadlinePassed = deadlineTime ? new Date() > new Date(deadlineTime) : false;

  // Get manager data from already-fetched managerDetails
  const managerAData = managerDetails.find((m) => m.managerId === managerAId) ?? null;
  const managerBData = managerDetails.find((m) => m.managerId === managerBId) ?? null;

  // Manager IDs for historical data fetching
  const selectedManagerIds = useMemo(() => {
    const ids: { id: number; teamName: string }[] = [];
    if (managerAData) ids.push({ id: managerAData.managerId, teamName: managerAData.teamName });
    if (managerBData) ids.push({ id: managerBData.managerId, teamName: managerBData.teamName });
    return ids;
  }, [managerAData, managerBData]);

  // Calculate league template team (most owned starting XI in league)
  const leagueTemplatePlayerIds = useMemo(() => {
    if (managerDetails.length === 0 || playersMap.size === 0) return new Set<number>();

    const ownership = calculateOwnership(managerDetails, playersMap, teamsMap);
    const templateTeam = buildTemplateTeam(ownership);
    return new Set(templateTeam.map((p) => p.player.id));
  }, [managerDetails, playersMap, teamsMap]);

  // Calculate world template team (most owned starting XI globally)
  const worldTemplatePlayerIds = useMemo(() => {
    if (playersMap.size === 0) return new Set<number>();

    const players = Array.from(playersMap.values());
    const ownership = calculateWorldOwnership(players, teamsMap);
    const templateTeam = buildTemplateTeam(ownership);
    return new Set(templateTeam.map((p) => p.player.id));
  }, [playersMap, teamsMap]);

  // Calculate template overlap for a manager against a given template
  const calculateTemplateOverlap = useMemo(() => {
    return (managerData: ManagerGameweekData, templatePlayerIds: Set<number>): TemplateOverlap => {
      // Get manager's starting XI (multiplier > 0)
      const startingXI = managerData.picks.filter((p) => p.multiplier > 0).map((p) => p.playerId);

      const matchingPlayerIds: number[] = [];
      const differentialPlayerIds: number[] = [];

      for (const playerId of startingXI) {
        if (templatePlayerIds.has(playerId)) {
          matchingPlayerIds.push(playerId);
        } else {
          differentialPlayerIds.push(playerId);
        }
      }

      const matchCount = matchingPlayerIds.length;
      return {
        matchCount,
        matchPercentage: (matchCount / 11) * 100,
        matchingPlayerIds,
        differentialPlayerIds,
        playstyleLabel: getPlaystyleLabel(matchCount),
      };
    };
  }, []);

  // Fetch entry history for total transfers count
  const historyQueries = useQueries({
    queries: selectedManagerIds.map((manager) => ({
      queryKey: queryKeys.entryHistory(manager.id),
      queryFn: () => fplApi.getEntryHistory(manager.id),
      staleTime: 60 * 1000,
      enabled: selectedManagerIds.length > 0,
    })),
  });

  // Use historical data for captain calculations
  const {
    liveDataByGw,
    picksByManagerAndGw,
    completedGameweeks,
    isLoading: historicalLoading,
    error: historicalError,
  } = useHistoricalData({
    managerIds: selectedManagerIds,
    currentGameweek,
    enabled: selectedManagerIds.length > 0 && currentGameweek > 1 && playersMap.size > 0,
  });

  // Build template captain map (most captained per GW)
  const templateCaptainByGw = useMemo(() => {
    const map = new Map<number, number>();
    for (const gw of gameweeks) {
      if (gw.id < currentGameweek && gw.most_captained) {
        map.set(gw.id, gw.most_captained);
      }
    }
    return map;
  }, [gameweeks, currentGameweek]);

  // Calculate captain stats for a manager
  const calculateCaptainStats = useMemo(() => {
    return (managerId: number): { captainPoints: number; differentialCaptains: number } => {
      let captainPoints = 0;
      let differentialCaptains = 0;

      for (const gw of completedGameweeks) {
        const picks = picksByManagerAndGw.get(`${managerId}-${gw}`);
        const liveData = liveDataByGw.get(gw);
        const templateCaptainId = templateCaptainByGw.get(gw);

        if (!picks || !liveData) continue;

        const captainPick = picks.picks.find((p) => p.is_captain);
        if (!captainPick) continue;

        // Calculate captain points
        const multiplier = picks.activeChip === '3xc' ? 3 : 2;
        const captainLive = liveData.elements.find((e) => e.id === captainPick.element);
        captainPoints += (captainLive?.stats.total_points ?? 0) * multiplier;

        // Check if differential
        if (templateCaptainId && captainPick.element !== templateCaptainId) {
          differentialCaptains++;
        }
      }

      return { captainPoints, differentialCaptains };
    };
  }, [completedGameweeks, picksByManagerAndGw, liveDataByGw, templateCaptainByGw]);

  // Build comparison stats for a manager
  const buildStats = useMemo(() => {
    return (
      managerData: ManagerGameweekData | null,
      historyIndex: number
    ): ComparisonStats | null => {
      if (!managerData) return null;

      const historyQuery = historyQueries[historyIndex];
      // Guard: Don't return partial data while history is loading
      // This prevents race condition where 0 values flash before real data arrives
      if (!historyQuery?.data) return null;

      const history = historyQuery.data;

      // Total transfers from history
      const totalTransfers = history.current.reduce((sum, gw) => sum + gw.event_transfers, 0);

      // Calculate last 5 GW average (sorted by event descending, take last 5)
      const sortedGws = [...history.current].sort((a, b) => b.event - a.event);
      const last5Gws = sortedGws.slice(0, 5);
      const last5Average =
        last5Gws.length > 0
          ? last5Gws.reduce((sum, gw) => sum + gw.points, 0) / last5Gws.length
          : 0;

      // Calculate remaining free transfers
      const remainingTransfers = calculateFreeTransfers(
        history.current,
        history.chips,
        currentGameweek,
        deadlinePassed
      );

      // Captain stats from historical data
      const { captainPoints, differentialCaptains } = calculateCaptainStats(managerData.managerId);

      // Chips for current half
      const { used: chipsUsed, remaining: chipsRemaining } = getChipsForCurrentHalf(
        managerData.chipsUsed,
        currentGameweek,
        deadlineTime
      );

      // Starting XI player IDs
      const startingXI = managerData.picks.filter((p) => p.multiplier > 0).map((p) => p.playerId);

      // Best and worst gameweeks
      let bestGameweek: GameweekExtreme | null = null;
      let worstGameweek: GameweekExtreme | null = null;

      if (history.current.length > 0) {
        const sortedByPoints = [...history.current].sort((a, b) => b.points - a.points);
        const best = sortedByPoints[0];
        const worst = sortedByPoints[sortedByPoints.length - 1];
        bestGameweek = { gw: best.event, points: best.points };
        worstGameweek = { gw: worst.event, points: worst.points };
      }

      return {
        managerId: managerData.managerId,
        teamName: managerData.teamName,
        // Season overview
        totalPoints: managerData.totalPoints,
        overallRank: managerData.overallRank,
        leagueRank: managerData.rank,
        last5Average,
        // Transfers
        totalTransfers,
        remainingTransfers,
        totalHits: Math.abs(managerData.totalHitsCost) / 4, // Convert cost to count
        hitsCost: managerData.totalHitsCost,
        // Captain
        captainPoints,
        differentialCaptains,
        // Chips
        chipsUsed,
        chipsRemaining,
        // Value (already divided by 10 in useFplData)
        squadValue: managerData.teamValue,
        bank: managerData.bank,
        // Template overlap
        leagueTemplateOverlap: calculateTemplateOverlap(managerData, leagueTemplatePlayerIds),
        worldTemplateOverlap: calculateTemplateOverlap(managerData, worldTemplatePlayerIds),
        // Roster
        startingXI,
        // Gameweek extremes
        bestGameweek,
        worstGameweek,
      };
    };
  }, [
    historyQueries,
    calculateCaptainStats,
    calculateTemplateOverlap,
    leagueTemplatePlayerIds,
    worldTemplatePlayerIds,
    currentGameweek,
    deadlineTime,
    deadlinePassed,
  ]);

  // Build final comparison data
  const managerA = useMemo(() => buildStats(managerAData, 0), [buildStats, managerAData]);

  const managerB = useMemo(() => buildStats(managerBData, 1), [buildStats, managerBData]);

  // Calculate roster comparison (common and unique players)
  const rosterComparison = useMemo((): RosterComparison | null => {
    if (!managerA || !managerB) return null;

    const setA = new Set(managerA.startingXI);
    const setB = new Set(managerB.startingXI);

    const commonPlayerIds: number[] = [];
    const managerAOnlyIds: number[] = [];
    const managerBOnlyIds: number[] = [];

    for (const id of managerA.startingXI) {
      if (setB.has(id)) {
        commonPlayerIds.push(id);
      } else {
        managerAOnlyIds.push(id);
      }
    }

    for (const id of managerB.startingXI) {
      if (!setA.has(id)) {
        managerBOnlyIds.push(id);
      }
    }

    return {
      commonCount: commonPlayerIds.length,
      commonPlayerIds,
      managerAOnlyIds,
      managerBOnlyIds,
    };
  }, [managerA, managerB]);

  const historyLoading = historyQueries.some((q) => q.isLoading);
  const historyError = historyQueries.find((q) => q.error)?.error ?? null;

  return {
    managerA,
    managerB,
    rosterComparison,
    loading: historyLoading || historicalLoading,
    error: historyError ?? historicalError ?? null,
  };
}
