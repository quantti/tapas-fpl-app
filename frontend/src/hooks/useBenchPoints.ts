import { useState, useEffect } from 'react'
import { fplApi } from '../services/api'
import type { LiveGameweek } from '../types/fpl'

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
 * Fetches and calculates cumulative bench points for all managers
 * across all completed gameweeks (excluding current gameweek)
 */
export function useBenchPoints(
  managerIds: { id: number; teamName: string }[],
  currentGameweek: number
): UseBenchPointsReturn {
  const [benchPoints, setBenchPoints] = useState<ManagerBenchPoints[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (managerIds.length === 0 || currentGameweek <= 1) {
      setLoading(false)
      setBenchPoints([])
      return
    }

    const fetchBenchPoints = async () => {
      try {
        setLoading(true)
        setError(null)

        // Gameweeks to analyze (all completed ones, excluding current)
        const completedGameweeks = Array.from(
          { length: currentGameweek - 1 },
          (_, i) => i + 1
        )

        // Fetch live data for all completed gameweeks (for player points)
        const liveDataByGw = new Map<number, LiveGameweek>()
        const liveDataPromises = completedGameweeks.map(async (gw) => {
          const data = await fplApi.getLiveGameweek(gw)
          liveDataByGw.set(gw, data)
        })
        await Promise.all(liveDataPromises)

        // For each manager, fetch their picks for all completed gameweeks
        // and calculate total bench points
        const managerBenchPointsPromises = managerIds.map(async ({ id, teamName }) => {
          let totalBenchPoints = 0

          const picksPromises = completedGameweeks.map(async (gw) => {
            try {
              const picks = await fplApi.getEntryPicks(id, gw)
              const liveData = liveDataByGw.get(gw)

              if (!liveData) return 0

              // Skip bench boost weeks - those points actually counted
              if (picks.active_chip === 'bboost') return 0

              // Bench players are positions 12-15 (multiplier=0)
              const benchPicks = picks.picks.filter((p) => p.position > 11)

              return benchPicks.reduce((sum, pick) => {
                const playerLive = liveData.elements.find((e) => e.id === pick.element)
                return sum + (playerLive?.stats.total_points ?? 0)
              }, 0)
            } catch {
              // Manager might not have existed in this gameweek
              return 0
            }
          })

          const gwBenchPoints = await Promise.all(picksPromises)
          totalBenchPoints = gwBenchPoints.reduce((a, b) => a + b, 0)

          return { managerId: id, teamName, totalBenchPoints }
        })

        const results = await Promise.all(managerBenchPointsPromises)
        setBenchPoints(results)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch bench points')
      } finally {
        setLoading(false)
      }
    }

    fetchBenchPoints()
  }, [managerIds, currentGameweek])

  return { benchPoints, loading, error }
}
