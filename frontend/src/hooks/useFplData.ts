import { useMemo } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { fplApi, FplApiError } from '../services/api'
import type { Player, Team } from '../types/fpl'
import { LEAGUE_ID, LIVE_REFRESH_INTERVAL, IDLE_REFRESH_INTERVAL } from '../config'

export interface ManagerPick {
  playerId: number
  position: number // 1-15 (1-11 starting, 12-15 bench)
  multiplier: number // 0=benched, 1=normal, 2=captain, 3=triple captain
  isCaptain: boolean
  isViceCaptain: boolean
}

export interface ManagerGameweekData {
  managerId: number
  managerName: string
  teamName: string
  rank: number
  lastRank: number
  gameweekPoints: number
  totalPoints: number
  // Overall FPL rank (not league rank)
  overallRank: number
  lastOverallRank: number // Previous gameweek's overall rank (for arrows)
  // Picks data - full squad for live scoring
  picks: ManagerPick[]
  captain: Player | null
  viceCaptain: Player | null
  activeChip: string | null
  // Transfer data
  transfersIn: Player[]
  transfersOut: Player[]
  transfersCost: number
  totalHitsCost: number
  teamValue: number
  bank: number
  // Chips data - includes event number for 2025/26 half-season tracking
  chipsUsed: { name: string; event: number }[]
}

/**
 * Main data fetching hook for FPL dashboard.
 * Uses React Query for automatic caching, deduplication, and background refetching.
 */
export function useFplData() {
  // 1. Fetch bootstrap data (players, teams, gameweeks)
  // This is the core static data - refetch every 5 minutes
  const bootstrapQuery = useQuery({
    queryKey: ['bootstrap'],
    queryFn: () => fplApi.getBootstrapStatic(),
    staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  })

  const bootstrap = bootstrapQuery.data ?? null

  // Build lookup maps from bootstrap data
  const { playersMap, teamsMap } = useMemo(() => {
    if (!bootstrap) {
      return {
        playersMap: new Map<number, Player>(),
        teamsMap: new Map<number, Team>(),
      }
    }
    return {
      playersMap: new Map(bootstrap.elements.map((p) => [p.id, p])),
      teamsMap: new Map(bootstrap.teams.map((t) => [t.id, t])),
    }
  }, [bootstrap])

  // Find current gameweek
  const currentGameweek = useMemo(() => {
    if (!bootstrap) return null
    return bootstrap.events.find((e) => e.is_current) || null
  }, [bootstrap])

  // Check if games are live (deadline passed and gameweek not finished)
  const isLive = useMemo(() => {
    if (!currentGameweek) return false
    return (
      currentGameweek.finished === false && new Date(currentGameweek.deadline_time) < new Date()
    )
  }, [currentGameweek])

  // 2. Fetch event status (league recalculation state)
  // Polls frequently during live games to detect when leagues are updating
  const eventStatusQuery = useQuery({
    queryKey: ['eventStatus'],
    queryFn: () => fplApi.getEventStatus(),
    staleTime: isLive ? 30 * 1000 : 60 * 1000,
    refetchInterval: isLive ? LIVE_REFRESH_INTERVAL : IDLE_REFRESH_INTERVAL,
    enabled: !!bootstrap,
  })

  const leaguesUpdating = eventStatusQuery.data?.leagues === 'Updating'

  // 3. Fetch league standings
  // Refetch more frequently during live games
  const standingsQuery = useQuery({
    queryKey: ['standings', LEAGUE_ID],
    queryFn: () => fplApi.getLeagueStandings(LEAGUE_ID),
    staleTime: isLive ? 30 * 1000 : 60 * 1000, // 30s live, 1min idle
    refetchInterval: isLive ? LIVE_REFRESH_INTERVAL : IDLE_REFRESH_INTERVAL,
    enabled: !!bootstrap, // Only fetch after bootstrap is ready
  })

  const standings = standingsQuery.data ?? null

  // Get manager list from standings (limit to 20)
  const managers = useMemo(() => {
    if (!standings) return []
    return standings.standings.results.slice(0, 20)
  }, [standings])

  // 4. Fetch manager details (picks, history, transfers) in parallel
  // Each manager requires 3 API calls, so we use useQueries
  const managerQueries = useQueries({
    queries: managers.map((manager) => ({
      queryKey: ['managerDetails', manager.entry, currentGameweek?.id] as const,
      queryFn: async (): Promise<ManagerGameweekData | null> => {
        if (!currentGameweek) return null

        try {
          const [picks, history, transfers] = await Promise.all([
            fplApi.getEntryPicks(manager.entry, currentGameweek.id),
            fplApi.getEntryHistory(manager.entry),
            fplApi.getEntryTransfers(manager.entry),
          ])

          // Find captain and vice captain
          const captainPick = picks.picks.find((p) => p.is_captain)
          const viceCaptainPick = picks.picks.find((p) => p.is_vice_captain)

          // Map picks to our format for live scoring
          const managerPicks: ManagerPick[] = picks.picks.map((p) => ({
            playerId: p.element,
            position: p.position,
            multiplier: p.multiplier,
            isCaptain: p.is_captain,
            isViceCaptain: p.is_vice_captain,
          }))

          // Get current and previous week's history for overall rank comparison
          const currentHistory = history.current.find((h) => h.event === currentGameweek.id)
          const previousHistory = history.current.find((h) => h.event === currentGameweek.id - 1)

          // Filter transfers to current gameweek
          const gwTransfers = transfers.filter((t) => t.event === currentGameweek.id)

          // Map transfer player IDs to Player objects
          const transfersIn = gwTransfers
            .map((t) => playersMap.get(t.element_in))
            .filter((p): p is Player => p !== undefined)
          const transfersOut = gwTransfers
            .map((t) => playersMap.get(t.element_out))
            .filter((p): p is Player => p !== undefined)

          const transfersCost = currentHistory?.event_transfers_cost || 0

          // Calculate total hits cost across all gameweeks
          const totalHitsCost = history.current.reduce(
            (sum, gw) => sum + (gw.event_transfers_cost || 0),
            0
          )

          return {
            managerId: manager.entry,
            managerName: manager.player_name,
            teamName: manager.entry_name,
            rank: manager.rank,
            lastRank: manager.last_rank,
            gameweekPoints: manager.event_total,
            totalPoints: manager.total,
            overallRank: currentHistory?.overall_rank ?? 0,
            lastOverallRank: previousHistory?.overall_rank ?? 0,
            picks: managerPicks,
            captain: captainPick ? playersMap.get(captainPick.element) || null : null,
            viceCaptain: viceCaptainPick ? playersMap.get(viceCaptainPick.element) || null : null,
            activeChip: picks.active_chip,
            transfersIn,
            transfersOut,
            transfersCost,
            totalHitsCost,
            teamValue: (picks.entry_history.value || 0) / 10,
            bank: (picks.entry_history.bank || 0) / 10,
            chipsUsed: history.chips.map((c) => ({ name: c.name, event: c.event })),
          }
        } catch (err) {
          console.warn(`Failed to fetch data for manager ${manager.entry}:`, err)
          return null
        }
      },
      staleTime: isLive ? 30 * 1000 : 60 * 1000,
      refetchInterval: isLive ? LIVE_REFRESH_INTERVAL : IDLE_REFRESH_INTERVAL,
      enabled: !!currentGameweek && !!playersMap.size,
    })),
  })

  // Combine manager details results
  const managerDetails = useMemo(() => {
    return managerQueries.map((q) => q.data).filter((d): d is ManagerGameweekData => d !== null)
  }, [managerQueries])

  // Detect "awaiting update" period
  const awaitingUpdate = useMemo(() => {
    if (!currentGameweek || !standings) return false
    const deadlinePassed = new Date() > new Date(currentGameweek.deadline_time)
    const hasManagersInLeague = standings.standings.results.length > 0
    const picksDataMissing = managerDetails.length === 0 && hasManagersInLeague
    return deadlinePassed && picksDataMissing
  }, [currentGameweek, standings, managerDetails])

  // Compute loading state
  const loading =
    bootstrapQuery.isLoading || standingsQuery.isLoading || managerQueries.some((q) => q.isLoading)

  // Compute error state - preserve actual error object for 503 detection
  const errorObject =
    bootstrapQuery.error || standingsQuery.error || managerQueries.find((q) => q.error)?.error
  const error = errorObject?.message || null
  const isApiUnavailable = errorObject instanceof FplApiError && errorObject.isServiceUnavailable

  // Compute last updated time
  const lastUpdated = useMemo(() => {
    const timestamps = [
      bootstrapQuery.dataUpdatedAt,
      standingsQuery.dataUpdatedAt,
      ...managerQueries.map((q) => q.dataUpdatedAt),
    ].filter((t) => t > 0)

    return timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null
  }, [bootstrapQuery.dataUpdatedAt, standingsQuery.dataUpdatedAt, managerQueries])

  // Manual refresh function - invalidates all queries
  const refresh = () => {
    bootstrapQuery.refetch()
    eventStatusQuery.refetch()
    standingsQuery.refetch()
    for (const q of managerQueries) {
      q.refetch()
    }
  }

  return {
    bootstrap,
    standings,
    managerDetails,
    currentGameweek,
    isLive,
    leaguesUpdating,
    awaitingUpdate,
    loading,
    error,
    isApiUnavailable,
    lastUpdated,
    refresh,
    playersMap,
    teamsMap,
  }
}
