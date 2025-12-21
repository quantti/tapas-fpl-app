import { useState, useEffect, useCallback, useRef } from 'react';
import { fplApi } from '../services/api';
import type {
  BootstrapStatic,
  LeagueStandings,
  Player,
  Team,
  Gameweek,
} from '../types/fpl';
import { LEAGUE_ID, LIVE_REFRESH_INTERVAL, IDLE_REFRESH_INTERVAL } from '../config';

export interface ManagerGameweekData {
  managerId: number;
  managerName: string;
  teamName: string;
  rank: number;
  lastRank: number;
  gameweekPoints: number;
  totalPoints: number;
  // Picks data
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
}

interface FplDataState {
  bootstrap: BootstrapStatic | null;
  standings: LeagueStandings | null;
  managerDetails: ManagerGameweekData[];
  currentGameweek: Gameweek | null;
  isLive: boolean;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

export function useFplData() {
  const [state, setState] = useState<FplDataState>({
    bootstrap: null,
    standings: null,
    managerDetails: [],
    currentGameweek: null,
    isLive: false,
    loading: true,
    error: null,
    lastUpdated: null,
  });

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const playersMapRef = useRef<Map<number, Player>>(new Map());
  const teamsMapRef = useRef<Map<number, Team>>(new Map());

  const fetchData = useCallback(async (isInitialLoad = false) => {
    if (LEAGUE_ID === 0) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: 'League ID not configured. Update LEAGUE_ID in src/config.ts',
      }));
      return;
    }

    try {
      if (isInitialLoad) {
        setState(prev => ({ ...prev, loading: true, error: null }));
      }

      // Fetch bootstrap data (contains players, teams, gameweeks)
      const bootstrap = await fplApi.getBootstrapStatic();

      // Build lookup maps
      playersMapRef.current = new Map(bootstrap.elements.map(p => [p.id, p]));
      teamsMapRef.current = new Map(bootstrap.teams.map(t => [t.id, t]));

      // Find current gameweek
      const currentGameweek = bootstrap.events.find(e => e.is_current) || null;

      // Check if games are live (any fixture currently in progress)
      const isLive = currentGameweek?.finished === false &&
        new Date(currentGameweek.deadline_time) < new Date();

      // Fetch league standings
      const standings = await fplApi.getLeagueStandings(LEAGUE_ID);

      // Fetch details for each manager in the league
      const managerDetails: ManagerGameweekData[] = [];

      if (currentGameweek) {
        // Fetch picks for each manager (limit to avoid rate limiting)
        const managers = standings.standings.results.slice(0, 20);

        for (const manager of managers) {
          try {
            const [picks, history, transfers] = await Promise.all([
              fplApi.getEntryPicks(manager.entry, currentGameweek.id),
              fplApi.getEntryHistory(manager.entry),
              fplApi.getEntryTransfers(manager.entry),
            ]);

            // Find captain and vice captain
            const captainPick = picks.picks.find(p => p.is_captain);
            const viceCaptainPick = picks.picks.find(p => p.is_vice_captain);

            // Get current week's transfers from history
            const currentHistory = history.current.find(h => h.event === currentGameweek.id);

            // Filter transfers to current gameweek
            const gwTransfers = transfers.filter(t => t.event === currentGameweek.id);

            // Map transfer player IDs to Player objects
            const transfersIn = gwTransfers
              .map(t => playersMapRef.current.get(t.element_in))
              .filter((p): p is Player => p !== undefined);
            const transfersOut = gwTransfers
              .map(t => playersMapRef.current.get(t.element_out))
              .filter((p): p is Player => p !== undefined);

            const transfersCost = currentHistory?.event_transfers_cost || 0;

            // Calculate total hits cost across all gameweeks
            const totalHitsCost = history.current.reduce(
              (sum, gw) => sum + (gw.event_transfers_cost || 0),
              0
            );

            managerDetails.push({
              managerId: manager.entry,
              managerName: manager.player_name,
              teamName: manager.entry_name,
              rank: manager.rank,
              lastRank: manager.last_rank,
              gameweekPoints: manager.event_total,
              totalPoints: manager.total,
              captain: captainPick ? playersMapRef.current.get(captainPick.element) || null : null,
              viceCaptain: viceCaptainPick ? playersMapRef.current.get(viceCaptainPick.element) || null : null,
              activeChip: picks.active_chip,
              transfersIn,
              transfersOut,
              transfersCost,
              totalHitsCost,
              teamValue: (picks.entry_history.value || 0) / 10,
              bank: (picks.entry_history.bank || 0) / 10,
            });
          } catch (err) {
            console.warn(`Failed to fetch data for manager ${manager.entry}:`, err);
          }
        }
      }

      setState(prev => ({
        ...prev,
        bootstrap,
        standings,
        managerDetails,
        currentGameweek,
        isLive,
        loading: false,
        error: null,
        lastUpdated: new Date(),
      }));

      // Schedule next refresh
      const interval = isLive ? LIVE_REFRESH_INTERVAL : IDLE_REFRESH_INTERVAL;
      refreshTimerRef.current = setTimeout(() => fetchData(false), interval);

    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load data',
      }));
    }
  }, []);

  // Manual refresh function
  const refresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    fetchData(false);
  }, [fetchData]);

  // Initial load
  useEffect(() => {
    fetchData(true);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, [fetchData]);

  return {
    ...state,
    refresh,
    playersMap: playersMapRef.current,
    teamsMap: teamsMapRef.current,
  };
}
