import { useMemo } from 'react'
import { useHistoricalData } from './useHistoricalData'
import type { Gameweek } from '../types/fpl'

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
 * picking a captain different from the most-captained player globally.
 *
 * Uses shared historical data hook for efficient caching
 * and deduplication of API requests.
 */
export function useCaptainDifferential(
  managerIds: { id: number; teamName: string }[],
  currentGameweek: number,
  gameweeks: Gameweek[],
  playersMap: Map<number, { id: number; web_name: string }>
): UseCaptainDifferentialReturn {
  // Use shared hook for historical data (deduplicated, cached)
  const { liveDataByGw, picksByManagerAndGw, completedGameweeks, isLoading, error } =
    useHistoricalData({
      managerIds,
      currentGameweek,
      enabled:
        managerIds.length > 0 && currentGameweek > 1 && gameweeks.length > 0 && playersMap.size > 0,
    })

  // Build map of gameweek -> most captained player (template captain)
  const templateCaptainByGw = useMemo(() => {
    const map = new Map<number, number>()
    for (const gw of gameweeks) {
      if (gw.id < currentGameweek && gw.most_captained) {
        map.set(gw.id, gw.most_captained)
      }
    }
    return map
  }, [gameweeks, currentGameweek])

  // Calculate differential captain stats from cached data
  const stats = useMemo(() => {
    if (
      isLoading ||
      managerIds.length === 0 ||
      completedGameweeks.length === 0 ||
      templateCaptainByGw.size === 0
    ) {
      return []
    }

    return managerIds.map(({ id, teamName }) => {
      const details: DifferentialPick[] = []

      for (const gw of completedGameweeks) {
        const picks = picksByManagerAndGw.get(`${id}-${gw}`)
        const liveData = liveDataByGw.get(gw)
        const templateCaptainId = templateCaptainByGw.get(gw)

        if (!picks || !liveData || !templateCaptainId) continue

        // Find captain pick
        const captainPick = picks.picks.find((p) => p.is_captain)
        if (!captainPick) continue

        // Check if differential pick (different from template)
        const isDifferential = captainPick.element !== templateCaptainId
        if (!isDifferential) continue

        // Get multiplier (2 for normal, 3 for triple captain)
        const multiplier = picks.activeChip === '3xc' ? 3 : 2

        // Calculate gain/loss vs template
        const captainLive = liveData.elements.find((e) => e.id === captainPick.element)
        const templateLive = liveData.elements.find((e) => e.id === templateCaptainId)
        const captainPoints = captainLive?.stats.total_points ?? 0
        const templatePoints = templateLive?.stats.total_points ?? 0
        const gain = (captainPoints - templatePoints) * multiplier

        // Get player names
        const captainName = playersMap.get(captainPick.element)?.web_name ?? 'Unknown'
        const templateName = playersMap.get(templateCaptainId)?.web_name ?? 'Unknown'

        details.push({
          gameweek: gw,
          captainId: captainPick.element,
          captainName,
          captainPoints,
          templateId: templateCaptainId,
          templateName,
          templatePoints,
          gain,
          multiplier,
        })
      }

      // Sort details by gameweek
      details.sort((a, b) => a.gameweek - b.gameweek)

      const differentialPicks = details.length
      const differentialGain = details.reduce((sum, d) => sum + d.gain, 0)

      return { managerId: id, teamName, differentialPicks, differentialGain, details }
    })
  }, [
    managerIds,
    completedGameweeks,
    liveDataByGw,
    picksByManagerAndGw,
    templateCaptainByGw,
    playersMap,
    isLoading,
  ])

  return {
    stats,
    loading: isLoading,
    error: error?.message ?? null,
  }
}
