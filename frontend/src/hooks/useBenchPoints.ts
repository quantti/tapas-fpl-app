import { useMemo } from 'react'
import { useHistoricalData } from './useHistoricalData'

interface ManagerBenchPoints {
  managerId: number
  teamName: string
  totalBenchPoints: number
}

interface UseBenchPointsReturn {
  benchPoints: ManagerBenchPoints[]
  loading: boolean
  error: string | null
}

/**
 * Calculates cumulative bench points for all managers
 * across all completed gameweeks (excluding current gameweek).
 *
 * Uses shared historical data hook for efficient caching
 * and deduplication of API requests.
 */
export function useBenchPoints(
  managerIds: { id: number; teamName: string }[],
  currentGameweek: number
): UseBenchPointsReturn {
  // Use shared hook for historical data (deduplicated, cached)
  const { liveDataByGw, picksByManagerAndGw, completedGameweeks, isLoading, error } =
    useHistoricalData({
      managerIds,
      currentGameweek,
      enabled: managerIds.length > 0 && currentGameweek > 1,
    })

  // Calculate bench points from cached data
  const benchPoints = useMemo(() => {
    if (isLoading || managerIds.length === 0 || completedGameweeks.length === 0) {
      return []
    }

    return managerIds.map(({ id, teamName }) => {
      let totalBenchPoints = 0

      for (const gw of completedGameweeks) {
        const picks = picksByManagerAndGw.get(`${id}-${gw}`)
        const liveData = liveDataByGw.get(gw)

        if (!picks || !liveData) continue

        // Skip bench boost weeks - those points actually counted
        if (picks.activeChip === 'bboost') continue

        // Bench players are positions 12-15 (multiplier=0)
        const benchPicks = picks.picks.filter((p) => p.position > 11)

        for (const pick of benchPicks) {
          const playerLive = liveData.elements.find((e) => e.id === pick.element)
          totalBenchPoints += playerLive?.stats.total_points ?? 0
        }
      }

      return { managerId: id, teamName, totalBenchPoints }
    })
  }, [managerIds, completedGameweeks, liveDataByGw, picksByManagerAndGw, isLoading])

  return {
    benchPoints,
    loading: isLoading,
    error: error?.message ?? null,
  }
}
