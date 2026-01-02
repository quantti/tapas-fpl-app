import { POSITION_LABELS } from 'constants/positions'

import type { EntryPicksResponse, LiveGameweek, LivePlayer, Player } from 'types/fpl'

export interface PositionBreakdown {
  position: string
  points: number
  percentage: number
}

export type PointsByPosition = Record<number, number>

/**
 * Determine if a player was in the final team after auto-subs
 */
export function wasInFinalTeam(
  pick: { element: number; multiplier: number },
  subbedOut: Set<number>,
  subbedIn: Set<number>
): boolean {
  const wasStarter = pick.multiplier > 0
  const wasSubbedOut = subbedOut.has(pick.element)
  const wasSubbedIn = subbedIn.has(pick.element)

  return (wasStarter && !wasSubbedOut) || wasSubbedIn
}

/**
 * Calculate effective multiplier (subbed-in players get 1x, others keep their multiplier)
 */
export function getEffectiveMultiplier(
  pick: { element: number; multiplier: number },
  subbedIn: Set<number>
): number {
  return subbedIn.has(pick.element) ? 1 : pick.multiplier
}

/**
 * Calculate points by position for a single gameweek
 */
export function calculateGameweekPositionPoints(
  picksData: EntryPicksResponse,
  liveData: LiveGameweek,
  playersMap: Map<number, Player>
): PointsByPosition {
  const pointsByPosition: PointsByPosition = { 1: 0, 2: 0, 3: 0, 4: 0 }

  const subbedOut = new Set(picksData.automatic_subs.map((s) => s.element_out))
  const subbedIn = new Set(picksData.automatic_subs.map((s) => s.element_in))
  const livePlayersMap = new Map<number, LivePlayer>(liveData.elements.map((e) => [e.id, e]))

  for (const pick of picksData.picks) {
    if (!wasInFinalTeam(pick, subbedOut, subbedIn)) continue

    const player = playersMap.get(pick.element)
    const livePlayer = livePlayersMap.get(pick.element)
    if (!player || !livePlayer) continue

    const multiplier = getEffectiveMultiplier(pick, subbedIn)
    const points = livePlayer.stats.total_points * multiplier

    pointsByPosition[player.element_type] += points
  }

  return pointsByPosition
}

/**
 * Aggregate points by position across multiple gameweeks
 */
export function aggregatePositionPoints(gameweekPoints: PointsByPosition[]): PointsByPosition {
  const total: PointsByPosition = { 1: 0, 2: 0, 3: 0, 4: 0 }

  for (const gw of gameweekPoints) {
    total[1] += gw[1]
    total[2] += gw[2]
    total[3] += gw[3]
    total[4] += gw[4]
  }

  return total
}

/**
 * Convert points by position to breakdown with percentages
 */
export function toPositionBreakdown(pointsByPosition: PointsByPosition): PositionBreakdown[] {
  const total = Object.values(pointsByPosition).reduce((a, b) => a + b, 0)

  return [1, 2, 3, 4].map((pos) => ({
    position: POSITION_LABELS[pos],
    points: pointsByPosition[pos],
    percentage: total > 0 ? Math.round((pointsByPosition[pos] / total) * 100) : 0,
  }))
}
