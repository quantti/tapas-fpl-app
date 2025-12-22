import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import { fplApi } from '../services/api'

interface ManagerInfo {
  id: number
  teamName: string
}

interface GameweekPosition {
  gameweek: number
  [managerId: string]: number | string // managerId -> position, plus 'gameweek' key
}

interface PositionHistoryData {
  positions: GameweekPosition[]
  managers: { id: number; teamName: string; color: string }[]
}

interface UseLeaguePositionHistoryReturn {
  data: PositionHistoryData | null
  loading: boolean
  error: string | null
}

// 12 distinct colors for the chart lines
const CHART_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#ef4444', // red
  '#3b82f6', // blue
  '#f97316', // orange
  '#84cc16', // lime
  '#06b6d4', // cyan
  '#a855f7', // purple
]

/**
 * Fetches historical data and calculates league position at each gameweek.
 * League position is determined by sorting managers by total_points at each GW.
 */
export function useLeaguePositionHistory(
  managers: ManagerInfo[],
  currentGameweek: number
): UseLeaguePositionHistoryReturn {
  // Fetch entry history for each manager
  const historyQueries = useQueries({
    queries: managers.map((manager) => ({
      queryKey: ['entryHistory', manager.id] as const,
      queryFn: () => fplApi.getEntryHistory(manager.id),
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      enabled: managers.length > 0 && currentGameweek > 0,
    })),
  })

  const loading = historyQueries.some((q) => q.isLoading)
  const error = historyQueries.find((q) => q.error)?.error

  // Calculate positions from history data
  const data = useMemo(() => {
    if (loading || managers.length === 0) return null

    // Build a map of managerId -> gameweek -> total_points
    const pointsMap = new Map<number, Map<number, number>>()

    for (let i = 0; i < managers.length; i++) {
      const history = historyQueries[i]?.data
      if (!history) continue

      const managerPoints = new Map<number, number>()
      for (const gw of history.current) {
        managerPoints.set(gw.event, gw.total_points)
      }
      pointsMap.set(managers[i].id, managerPoints)
    }

    // Find the range of gameweeks we have data for
    const allGameweeks = new Set<number>()
    for (const managerPoints of pointsMap.values()) {
      for (const gw of managerPoints.keys()) {
        allGameweeks.add(gw)
      }
    }

    const sortedGameweeks = [...allGameweeks].sort((a, b) => a - b)
    if (sortedGameweeks.length === 0) return null

    // For each gameweek, calculate league positions by sorting total_points
    const positions: GameweekPosition[] = sortedGameweeks.map((gw) => {
      // Get all managers' points at this gameweek
      const managerPointsAtGw = managers
        .map((m) => ({
          id: m.id,
          points: pointsMap.get(m.id)?.get(gw) ?? 0,
        }))
        .sort((a, b) => b.points - a.points) // Sort descending by points

      // Assign positions (1-indexed)
      const positionData: GameweekPosition = { gameweek: gw }
      for (const [index, m] of managerPointsAtGw.entries()) {
        positionData[`m${m.id}`] = index + 1
      }

      return positionData
    })

    // Assign colors to managers
    const managersWithColors = managers.map((m, i) => ({
      ...m,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }))

    return { positions, managers: managersWithColors }
  }, [managers, historyQueries, loading])

  return {
    data,
    loading,
    error: error ? (error instanceof Error ? error.message : String(error)) : null,
  }
}
