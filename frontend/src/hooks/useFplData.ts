import { useState, useEffect, useCallback, useRef } from 'react'
import { fplApi } from '../services/api'
import type { BootstrapStatic, LeagueStandings, Player, Team, Gameweek } from '../types/fpl'
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
  // Chips data
  chipsUsed: string[]
}

interface FplDataState {
  bootstrap: BootstrapStatic | null
  standings: LeagueStandings | null
  managerDetails: ManagerGameweekData[]
  currentGameweek: Gameweek | null
  isLive: boolean
  awaitingUpdate: boolean
  loading: boolean
  error: string | null
  lastUpdated: Date | null
}

export function useFplData() {
  const [state, setState] = useState<FplDataState>({
    bootstrap: null,
    standings: null,
    managerDetails: [],
    currentGameweek: null,
    isLive: false,
    awaitingUpdate: false,
    loading: true,
    error: null,
    lastUpdated: null,
  })

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const playersMapRef = useRef<Map<number, Player>>(new Map())
  const teamsMapRef = useRef<Map<number, Team>>(new Map())

  const fetchData = useCallback(async (isInitialLoad = false) => {
    // Clear any existing timer to prevent memory leaks from multiple timers
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = undefined
    }

    try {
      if (isInitialLoad) {
        setState((prev) => ({ ...prev, loading: true, error: null }))
      }

      // Fetch bootstrap data (contains players, teams, gameweeks)
      const bootstrap = await fplApi.getBootstrapStatic()

      // Build lookup maps
      const playersMap = new Map(bootstrap.elements.map((p) => [p.id, p]))
      const teamsMap = new Map(bootstrap.teams.map((t) => [t.id, t]))
      playersMapRef.current = playersMap
      teamsMapRef.current = teamsMap

      // Find current gameweek
      const currentGameweek = bootstrap.events.find((e) => e.is_current) || null

      // Check if games are live (any fixture currently in progress)
      const isLive =
        currentGameweek?.finished === false && new Date(currentGameweek.deadline_time) < new Date()

      // Fetch league standings
      const standings = await fplApi.getLeagueStandings(LEAGUE_ID)

      // Fetch details for each manager in the league (parallelized)
      let managerDetails: ManagerGameweekData[] = []

      if (currentGameweek) {
        // Fetch picks for each manager (limit to avoid rate limiting)
        const managers = standings.standings.results.slice(0, 20)

        // Fetch all manager data in parallel
        const managerPromises = managers.map(async (manager) => {
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

            // Get current week's transfers from history
            const currentHistory = history.current.find((h) => h.event === currentGameweek.id)

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
              picks: managerPicks,
              captain: captainPick ? playersMap.get(captainPick.element) || null : null,
              viceCaptain: viceCaptainPick
                ? playersMap.get(viceCaptainPick.element) || null
                : null,
              activeChip: picks.active_chip,
              transfersIn,
              transfersOut,
              transfersCost,
              totalHitsCost,
              teamValue: (picks.entry_history.value || 0) / 10,
              bank: (picks.entry_history.bank || 0) / 10,
              chipsUsed: history.chips.map((c) => c.name),
            } as ManagerGameweekData
          } catch (err) {
            console.warn(`Failed to fetch data for manager ${manager.entry}:`, err)
            return null
          }
        })

        const results = await Promise.all(managerPromises)
        managerDetails = results.filter((r): r is ManagerGameweekData => r !== null)
      }

      // Detect "awaiting update" period: deadline passed but data not ready yet
      // This happens in the ~30-45 minutes after deadline when FPL is processing
      // Note: We only check if picks data failed to load (404 responses)
      // We do NOT check if all points are 0, because that's normal before first kickoff
      const deadlinePassed = currentGameweek
        ? new Date() > new Date(currentGameweek.deadline_time)
        : false
      const hasManagersInLeague = standings.standings.results.length > 0
      const picksDataMissing = managerDetails.length === 0 && hasManagersInLeague

      // awaitingUpdate is true when deadline passed but picks data couldn't be fetched
      // This indicates FPL API is still processing team selections (returns 404)
      const awaitingUpdate = deadlinePassed && picksDataMissing

      setState((prev) => ({
        ...prev,
        bootstrap,
        standings,
        managerDetails,
        currentGameweek,
        isLive,
        awaitingUpdate,
        loading: false,
        error: null,
        lastUpdated: new Date(),
      }))

      // Schedule next refresh
      const interval = isLive ? LIVE_REFRESH_INTERVAL : IDLE_REFRESH_INTERVAL
      refreshTimerRef.current = setTimeout(() => fetchData(false), interval)
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to load data',
      }))
    }
  }, [])

  // Manual refresh function
  const refresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }
    fetchData(false)
  }, [fetchData])

  // Initial load
  useEffect(() => {
    fetchData(true)

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [fetchData])

  return {
    ...state,
    refresh,
    playersMap: playersMapRef.current,
    teamsMap: teamsMapRef.current,
  }
}
