import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { CACHE_TIMES, LEAGUE_ID, LIVE_REFRESH_INTERVAL, IDLE_REFRESH_INTERVAL } from 'src/config';

import { createPlayersMap, createTeamsMap } from 'utils/mappers';

import { fplApi, FplApiError } from '../api';
import { queryKeys } from '../queryKeys';

import { useLeagueDashboard, type DashboardManagerCamel } from './useLeagueDashboard';
import { useLiveManagerDetails } from './useLiveManagerDetails';

import type { Player, Team } from 'types/fpl';

export interface ManagerPick {
  playerId: number;
  position: number; // 1-15 (1-11 starting, 12-15 bench)
  multiplier: number; // 0=benched, 1=normal, 2=captain, 3=triple captain
  isCaptain: boolean;
  isViceCaptain: boolean;
}

export interface ManagerGameweekData {
  managerId: number;
  managerName: string;
  teamName: string;
  rank: number;
  lastRank: number;
  gameweekPoints: number;
  totalPoints: number;
  // Overall FPL rank (not league rank)
  overallRank: number;
  lastOverallRank: number; // Previous gameweek's overall rank (for arrows)
  // Picks data - full squad for live scoring
  picks: ManagerPick[];
  captain: Player | null;
  viceCaptain: Player | null;
  activeChip: string | null;
  // Transfer data
  transfersIn: Player[];
  transfersOut: Player[];
  transfersCost: number;
  totalHitsCost: number;
  teamValue: number;
  bank: number;
  // Chips data - includes event number for 2025/26 half-season tracking
  chipsUsed: { name: string; event: number }[];
}

/**
 * Transforms dashboard manager data to the ManagerGameweekData format.
 * This enables the new consolidated endpoint to work with existing components.
 */
function transformDashboardManager(
  manager: DashboardManagerCamel,
  playersMap: Map<number, Player>
): ManagerGameweekData {
  // Find captain and vice captain from picks
  const captainPick = manager.picks.find((p) => p.isCaptain);
  const viceCaptainPick = manager.picks.find((p) => p.isViceCaptain);

  // Parse chips_used strings like "wildcard_1" to {name, event} format
  const chipsUsed = manager.chipsUsed.map((chip) => {
    const match = chip.match(/^(.+)_(\d+)$/);
    if (match) {
      return { name: match[1], event: Number.parseInt(match[2], 10) };
    }
    return { name: chip, event: 0 };
  });

  // Map transfers to Player objects using bootstrap data
  const transfersIn = manager.transfers
    .map((t) => playersMap.get(t.playerInId))
    .filter((p): p is Player => p !== undefined);
  const transfersOut = manager.transfers
    .map((t) => playersMap.get(t.playerOutId))
    .filter((p): p is Player => p !== undefined);

  return {
    managerId: manager.entryId,
    managerName: manager.managerName,
    teamName: manager.teamName,
    rank: manager.rank,
    lastRank: manager.lastRank ?? 0,
    gameweekPoints: manager.gwPoints,
    totalPoints: manager.totalPoints,
    overallRank: manager.overallRank ?? 0,
    lastOverallRank: manager.lastOverallRank ?? 0,
    picks: manager.picks.map((p) => ({
      playerId: p.playerId,
      position: p.position,
      multiplier: p.multiplier,
      isCaptain: p.isCaptain,
      isViceCaptain: p.isViceCaptain,
    })),
    captain: captainPick ? (playersMap.get(captainPick.playerId) ?? null) : null,
    viceCaptain: viceCaptainPick ? (playersMap.get(viceCaptainPick.playerId) ?? null) : null,
    activeChip: manager.chipActive,
    transfersIn,
    transfersOut,
    transfersCost: manager.transferCost,
    totalHitsCost: manager.totalHitsCost,
    teamValue: manager.teamValue,
    bank: manager.bank,
    chipsUsed,
  };
}

/**
 * Main data fetching hook for FPL dashboard.
 * Uses React Query for automatic caching, deduplication, and background refetching.
 */
export function useFplData() {
  // 1. Fetch bootstrap data (players, teams, gameweeks)
  // This is the core static data - refetch every 5 minutes
  const bootstrapQuery = useQuery({
    queryKey: queryKeys.bootstrap,
    queryFn: () => fplApi.getBootstrapStatic(),
    staleTime: CACHE_TIMES.FIVE_MINUTES,
    gcTime: CACHE_TIMES.THIRTY_MINUTES,
  });

  const bootstrap = bootstrapQuery.data ?? null;

  // Build lookup maps from bootstrap data
  const { playersMap, teamsMap } = useMemo(() => {
    if (!bootstrap) {
      return {
        playersMap: new Map<number, Player>(),
        teamsMap: new Map<number, Team>(),
      };
    }
    return {
      playersMap: createPlayersMap(bootstrap.elements),
      teamsMap: createTeamsMap(bootstrap.teams),
    };
  }, [bootstrap]);

  // Find current gameweek
  const currentGameweek = useMemo(() => {
    if (!bootstrap) return null;
    return bootstrap.events.find((e) => e.is_current) || null;
  }, [bootstrap]);

  // Check if games are live (deadline passed and gameweek not finished)
  const isLive = useMemo(() => {
    if (!currentGameweek) return false;
    return (
      currentGameweek.finished === false && new Date(currentGameweek.deadline_time) < new Date()
    );
  }, [currentGameweek]);

  // 2. Fetch event status (league recalculation state)
  // Polls frequently during live games to detect when leagues are updating
  const eventStatusQuery = useQuery({
    queryKey: queryKeys.eventStatus,
    queryFn: () => fplApi.getEventStatus(),
    staleTime: isLive ? 30 * 1000 : 60 * 1000,
    refetchInterval: isLive ? LIVE_REFRESH_INTERVAL : IDLE_REFRESH_INTERVAL,
    enabled: !!bootstrap,
  });

  const leaguesUpdating = eventStatusQuery.data?.leagues === 'Updating';

  // 3. Fetch league standings
  // Refetch more frequently during live games
  const standingsQuery = useQuery({
    queryKey: queryKeys.standings(LEAGUE_ID),
    queryFn: () => fplApi.getLeagueStandings(LEAGUE_ID),
    staleTime: isLive ? 30 * 1000 : 60 * 1000, // 30s live, 1min idle
    refetchInterval: isLive ? LIVE_REFRESH_INTERVAL : IDLE_REFRESH_INTERVAL,
    enabled: !!bootstrap, // Only fetch after bootstrap is ready
  });

  const standings = standingsQuery.data ?? null;

  // 4. Fetch manager details - use different sources for live vs historical
  //
  // Live gameweek: Fetch directly from FPL API for real-time data
  // This is necessary because our backend database may not have the latest
  // picks/captains/chips until the data collection runs.
  //
  // Historical gameweek: Use backend consolidated endpoint (faster, 1 call)
  // BUT: Fall back to FPL API if backend returns empty data (data not collected yet)

  // Backend dashboard - try first when NOT live (historical data)
  const dashboardQuery = useLeagueDashboard(LEAGUE_ID, currentGameweek?.id ?? 0, {
    enabled: !isLive && !!currentGameweek && playersMap.size > 0,
    isLive: false,
  });

  // Transform dashboard managers to ManagerGameweekData format (for non-live)
  const dashboardManagers = useMemo(() => {
    return dashboardQuery.managers.map((m) => transformDashboardManager(m, playersMap));
  }, [dashboardQuery.managers, playersMap]);

  // Check if backend data is empty (not yet collected for this gameweek)
  const backendDataEmpty =
    !isLive && !dashboardQuery.isLoading && dashboardQuery.managers.length === 0;

  // Live manager details - used when live OR when backend data is empty (fallback)
  const liveManagerDetails = useLiveManagerDetails(
    standings,
    currentGameweek?.id ?? 0,
    playersMap,
    {
      enabled: (isLive || backendDataEmpty) && !!standings && playersMap.size > 0,
    }
  );

  // Use live data when live OR when backend returns empty, otherwise use backend data
  const managerDetails =
    isLive || backendDataEmpty ? liveManagerDetails.managers : dashboardManagers;

  // Detect "awaiting update" period
  const awaitingUpdate = useMemo(() => {
    if (!currentGameweek || !standings) return false;
    const deadlinePassed = new Date() > new Date(currentGameweek.deadline_time);
    const hasManagersInLeague = standings.standings.results.length > 0;
    const picksDataMissing = managerDetails.length === 0 && hasManagersInLeague;
    return deadlinePassed && picksDataMissing;
  }, [currentGameweek, standings, managerDetails]);

  // Compute loading state - account for fallback to live data when backend is empty
  const usingLiveData = isLive || backendDataEmpty;
  const isLoading =
    bootstrapQuery.isLoading ||
    standingsQuery.isLoading ||
    (usingLiveData ? liveManagerDetails.isLoading : dashboardQuery.isLoading);

  // Compute error state - preserve actual error object for 503 detection
  // Check both FPL API errors and backend/live API errors
  const fplError = bootstrapQuery.error || standingsQuery.error;
  const dataError = usingLiveData ? liveManagerDetails.error : dashboardQuery.error;
  const error = fplError?.message || dataError || null;
  const isApiUnavailable =
    (fplError instanceof FplApiError && fplError.isServiceUnavailable) ||
    (!usingLiveData && dashboardQuery.isBackendUnavailable);

  // Compute last updated time
  const lastUpdated = (() => {
    const timestamps = [
      bootstrapQuery.dataUpdatedAt,
      standingsQuery.dataUpdatedAt,
      dashboardQuery.dataUpdatedAt,
    ].filter((t) => t > 0);

    return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
  })();

  // Manual refresh function - invalidates all queries
  const refresh = () => {
    bootstrapQuery.refetch();
    eventStatusQuery.refetch();
    standingsQuery.refetch();
    if (usingLiveData) {
      liveManagerDetails.refetch();
    } else {
      dashboardQuery.refetch();
    }
  };

  return {
    bootstrap,
    standings,
    managerDetails,
    currentGameweek,
    isLive,
    leaguesUpdating,
    awaitingUpdate,
    isLoading,
    error,
    isApiUnavailable,
    lastUpdated,
    refresh,
    playersMap,
    teamsMap,
  };
}
