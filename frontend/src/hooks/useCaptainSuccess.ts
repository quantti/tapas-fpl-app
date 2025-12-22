import { useState, useEffect } from 'react'
import { fplApi } from '../services/api'
import type { LiveGameweek, Gameweek } from '../types/fpl'

export interface DifferentialPick {
  gameweek: number
  captainId: number
  captainName: string
  captainPoints: number
  templateId: number
  templateName: string
  templatePoints: number
  gain: number
  multiplier: number // 2 for normal, 3 for TC
}

interface ManagerDifferentialStats {
  managerId: number
  teamName: string
  differentialPicks: number // Times picked non-template captain
  differentialGain: number // Net points gained/lost from differential picks
  details: DifferentialPick[] // Per-GW breakdown
}

interface UseCaptainDifferentialReturn {
  stats: ManagerDifferentialStats[]
  loading: boolean
  error: string | null
}

/**
 * Tracks captain differential success - how managers perform when
 * picking a captain different from the most-captained player globally
 */
export function useCaptainDifferential(
  managerIds: { id: number; teamName: string }[],
  currentGameweek: number,
  gameweeks: Gameweek[],
  playersMap: Map<number, { id: number; web_name: string }>
): UseCaptainDifferentialReturn {
  const [stats, setStats] = useState<ManagerDifferentialStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (managerIds.length === 0 || currentGameweek <= 1 || gameweeks.length === 0 || playersMap.size === 0) {
      setLoading(false)
      setStats([])
      return
    }

    const fetchStats = async () => {
      try {
        setLoading(true)
        setError(null)

        // Gameweeks to analyze (all completed ones, excluding current)
        const completedGameweeks = Array.from(
          { length: currentGameweek - 1 },
          (_, i) => i + 1
        )

        // Build map of gameweek -> most captained player (template captain)
        const templateCaptainByGw = new Map<number, number>()
        for (const gw of gameweeks) {
          if (gw.id < currentGameweek && gw.most_captained) {
            templateCaptainByGw.set(gw.id, gw.most_captained)
          }
        }

        // Fetch live data for all completed gameweeks (for player points)
        const liveDataByGw = new Map<number, LiveGameweek>()
        const liveDataPromises = completedGameweeks.map(async (gw) => {
          const data = await fplApi.getLiveGameweek(gw)
          liveDataByGw.set(gw, data)
        })
        await Promise.all(liveDataPromises)

        // For each manager, calculate differential captain stats
        const managerStatsPromises = managerIds.map(async ({ id, teamName }) => {
          const details: DifferentialPick[] = []

          const picksPromises = completedGameweeks.map(async (gw) => {
            try {
              const picks = await fplApi.getEntryPicks(id, gw)
              const liveData = liveDataByGw.get(gw)
              const templateCaptainId = templateCaptainByGw.get(gw)

              if (!liveData || !templateCaptainId) return null

              // Find captain pick
              const captainPick = picks.picks.find((p) => p.is_captain)
              if (!captainPick) return null

              // Check if differential pick (different from template)
              const isDifferential = captainPick.element !== templateCaptainId
              if (!isDifferential) return null

              // Get multiplier (2 for normal, 3 for triple captain)
              const multiplier = picks.active_chip === '3xc' ? 3 : 2

              // Calculate gain/loss vs template
              const captainLive = liveData.elements.find((e) => e.id === captainPick.element)
              const templateLive = liveData.elements.find((e) => e.id === templateCaptainId)
              const captainPoints = captainLive?.stats.total_points ?? 0
              const templatePoints = templateLive?.stats.total_points ?? 0
              const gain = (captainPoints - templatePoints) * multiplier

              // Get player names
              const captainName = playersMap.get(captainPick.element)?.web_name ?? 'Unknown'
              const templateName = playersMap.get(templateCaptainId)?.web_name ?? 'Unknown'

              return {
                gameweek: gw,
                captainId: captainPick.element,
                captainName,
                captainPoints,
                templateId: templateCaptainId,
                templateName,
                templatePoints,
                gain,
                multiplier,
              } as DifferentialPick
            } catch {
              return null
            }
          })

          const results = await Promise.all(picksPromises)
          for (const result of results) {
            if (result) {
              details.push(result)
            }
          }

          // Sort details by gameweek
          details.sort((a, b) => a.gameweek - b.gameweek)

          const differentialPicks = details.length
          const differentialGain = details.reduce((sum, d) => sum + d.gain, 0)

          return { managerId: id, teamName, differentialPicks, differentialGain, details }
        })

        const results = await Promise.all(managerStatsPromises)
        setStats(results)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch captain stats')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [managerIds, currentGameweek, gameweeks, playersMap])

  return { stats, loading, error }
}
