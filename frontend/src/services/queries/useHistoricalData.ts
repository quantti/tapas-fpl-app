import { useQueries } from '@tanstack/react-query'

import { CACHE_TIMES } from '../../config'
import { fplApi } from '../api'
import { queryKeys } from '../queryKeys'

import type { LiveGameweek } from '../../types/fpl'

export interface ManagerPicks {
  managerId: number
  gameweek: number
  activeChip: string | null
  picks: {
    element: number
    position: number
    multiplier: number
    is_captain: boolean
    is_vice_captain: boolean
  }[]
}

interface UseHistoricalDataParams {
  managerIds: { id: number; teamName: string }[]
  currentGameweek: number
  enabled?: boolean
}

interface UseHistoricalDataReturn {
  liveDataByGw: Map<number, LiveGameweek>
  picksByManagerAndGw: Map<string, ManagerPicks> // key: `${managerId}-${gw}`
  completedGameweeks: number[]
  isLoading: boolean
  error: Error | null
}

/**
 * Shared hook for fetching historical gameweek data.
 * Uses React Query for automatic deduplication and caching.
 *
 * Key optimization: Completed gameweeks are immutable, so we use
 * staleTime: Infinity to never refetch them.
 */
export function useHistoricalData({
  managerIds,
  currentGameweek,
  enabled = true,
}: UseHistoricalDataParams): UseHistoricalDataReturn {
  // Calculate completed gameweeks (all except current)
  const completedGameweeks =
    currentGameweek > 1 ? Array.from({ length: currentGameweek - 1 }, (_, i) => i + 1) : []

  // Fetch live data for all completed gameweeks
  // These are immutable - staleTime: Infinity means we never refetch
  const liveQueries = useQueries({
    queries: completedGameweeks.map((gw) => ({
      queryKey: queryKeys.liveGameweek(gw),
      queryFn: () => fplApi.getLiveGameweek(gw),
      staleTime: Infinity, // Completed GWs never change
      gcTime: CACHE_TIMES.ONE_HOUR,
      enabled: enabled && completedGameweeks.length > 0,
    })),
  })

  // Fetch picks for each manager for each completed gameweek
  // Also immutable - manager picks for past GWs don't change
  const picksQueries = useQueries({
    queries:
      enabled && completedGameweeks.length > 0 && managerIds.length > 0
        ? managerIds.flatMap((manager) =>
            completedGameweeks.map((gw) => ({
              queryKey: queryKeys.entryPicks(manager.id, gw),
              queryFn: async () => {
                try {
                  const data = await fplApi.getEntryPicks(manager.id, gw)
                  return {
                    managerId: manager.id,
                    gameweek: gw,
                    activeChip: data.active_chip,
                    picks: data.picks,
                  } as ManagerPicks
                } catch {
                  // Manager might not have existed in this gameweek
                  return null
                }
              },
              staleTime: Infinity, // Past picks never change
              gcTime: CACHE_TIMES.ONE_HOUR,
              enabled: enabled && completedGameweeks.length > 0,
            }))
          )
        : [],
  })

  // Build maps for easy lookup
  const liveDataByGw = new Map<number, LiveGameweek>()
  for (const query of liveQueries) {
    if (query.data) {
      // Find which gameweek this data belongs to by checking the query
      const gw = completedGameweeks[liveQueries.indexOf(query)]
      if (gw !== undefined) {
        liveDataByGw.set(gw, query.data)
      }
    }
  }

  const picksByManagerAndGw = new Map<string, ManagerPicks>()
  for (const query of picksQueries) {
    if (query.data) {
      const key = `${query.data.managerId}-${query.data.gameweek}`
      picksByManagerAndGw.set(key, query.data)
    }
  }

  // Calculate loading state
  const isLoading = liveQueries.some((q) => q.isLoading) || picksQueries.some((q) => q.isLoading)

  // Find first error if any
  const error =
    liveQueries.find((q) => q.error)?.error || picksQueries.find((q) => q.error)?.error || null

  return {
    liveDataByGw,
    picksByManagerAndGw,
    completedGameweeks,
    isLoading,
    error: error as Error | null,
  }
}
