import type { Fixture, LivePlayer, LiveGameweek } from '../types/fpl'
import type { ManagerPick } from '../hooks/useFplData'

export interface BpsScore {
  playerId: number
  bps: number
}

export interface LiveManagerPoints {
  basePoints: number // Points without provisional bonus
  provisionalBonus: number // Provisional bonus points (before official)
  totalPoints: number // basePoints + provisionalBonus
  hitsCost: number // Transfer hits deducted
  netPoints: number // totalPoints - hitsCost
}

/**
 * Group sorted BPS scores by BPS value to handle ties.
 */
function groupByBps(sorted: BpsScore[]): BpsScore[][] {
  const groups: BpsScore[][] = []
  let currentGroup: BpsScore[] = []
  let currentBps = -1

  for (const score of sorted) {
    if (score.bps !== currentBps) {
      if (currentGroup.length > 0) {
        groups.push(currentGroup)
      }
      currentGroup = [score]
      currentBps = score.bps
    } else {
      currentGroup.push(score)
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  return groups
}

/**
 * Calculate provisional bonus points from BPS scores.
 * Top 3 BPS scores get 3/2/1 bonus points respectively.
 * Ties result in equal bonus (both players in tie get same points).
 */
export function calculateProvisionalBonus(bpsScores: BpsScore[]): Map<number, number> {
  const result = new Map<number, number>()

  if (bpsScores.length === 0) {
    return result
  }

  // Sort by BPS descending and group by score
  const sorted = [...bpsScores].sort((a, b) => b.bps - a.bps)
  const groups = groupByBps(sorted)

  // Award bonus points: 3 for 1st, 2 for 2nd, 1 for 3rd
  const bonusPoints = [3, 2, 1]
  let bonusIndex = 0
  let positionCount = 0

  for (const group of groups) {
    if (bonusIndex >= bonusPoints.length) break

    const bonus = bonusPoints[bonusIndex]

    for (const player of group) {
      result.set(player.playerId, bonus)
      positionCount++
    }

    // Move to next bonus tier based on how many positions we've filled
    // If 1st place tie (2 players), both get 3, next gets 1 (skip 2)
    // If 2nd place tie (2 players), first gets 3, both get 2, no 1 awarded
    if (positionCount >= 3) {
      break
    }
    bonusIndex = positionCount
  }

  return result
}

/**
 * Calculate live points for a player including captain multiplier.
 */
export function calculateLivePoints(livePlayer: LivePlayer, multiplier: number): number {
  // The API's total_points already includes all scoring
  return livePlayer.stats.total_points * multiplier
}

/**
 * Check if a fixture is currently live (in play).
 */
export function isFixtureLive(fixture: Fixture): boolean {
  return fixture.started && !fixture.finished && !fixture.finished_provisional
}

/**
 * Check if we should show provisional bonus for a fixture.
 * Show after 60 minutes of play or when finished.
 */
export function shouldShowProvisionalBonus(fixture: Fixture): boolean {
  if (!fixture.started) {
    return false
  }
  if (fixture.finished) {
    return true
  }
  return fixture.minutes >= 60
}

/**
 * Calculate live points for a manager's team.
 * Includes live player points with multipliers and provisional bonus.
 *
 * @param picks - Manager's 15 picks with positions and multipliers
 * @param liveData - Live gameweek data with all player stats
 * @param fixtures - Current gameweek fixtures for bonus calculation
 * @param hitsCost - Transfer hits cost for this gameweek
 */
export function calculateLiveManagerPoints(
  picks: ManagerPick[],
  liveData: LiveGameweek | null,
  fixtures: Fixture[],
  hitsCost: number = 0
): LiveManagerPoints {
  if (!liveData || picks.length === 0) {
    return {
      basePoints: 0,
      provisionalBonus: 0,
      totalPoints: 0,
      hitsCost,
      netPoints: -hitsCost,
    }
  }

  // Create lookup map for live player data
  const livePlayersMap = new Map(liveData.elements.map((p) => [p.id, p]))

  // Build provisional bonus map for all fixtures that qualify
  const provisionalBonusMap = buildProvisionalBonusMap(liveData, fixtures)

  let basePoints = 0
  let provisionalBonus = 0

  // Calculate points for starting XI (multiplier > 0)
  // Position 1-11 are starters, 12-15 are bench
  // But we use multiplier to determine who plays (handles auto-subs)
  for (const pick of picks) {
    if (pick.multiplier === 0) continue // Benched, skip

    const livePlayer = livePlayersMap.get(pick.playerId)
    if (!livePlayer) continue

    // Add base points (total_points includes official bonus if awarded)
    const playerPoints = livePlayer.stats.total_points * pick.multiplier
    basePoints += playerPoints

    // Add provisional bonus if:
    // 1. Official bonus not yet awarded (stats.bonus === 0)
    // 2. Player has provisional bonus from BPS ranking
    if (livePlayer.stats.bonus === 0) {
      const playerProvisionalBonus = provisionalBonusMap.get(pick.playerId) ?? 0
      provisionalBonus += playerProvisionalBonus * pick.multiplier
    }
  }

  const totalPoints = basePoints + provisionalBonus
  const netPoints = totalPoints - hitsCost

  return {
    basePoints,
    provisionalBonus,
    totalPoints,
    hitsCost,
    netPoints,
  }
}

/**
 * Build a map of player ID -> provisional bonus for all qualifying fixtures.
 * A fixture qualifies for provisional bonus if it's >= 60 minutes or finished.
 */
function buildProvisionalBonusMap(
  liveData: LiveGameweek,
  fixtures: Fixture[]
): Map<number, number> {
  const result = new Map<number, number>()

  for (const fixture of fixtures) {
    if (!shouldShowProvisionalBonus(fixture)) continue

    // Get all players in this fixture by checking their explain array
    const playersInFixture = liveData.elements.filter((p) =>
      p.explain.some((e) => e.fixture === fixture.id)
    )

    // Calculate provisional bonus for this fixture
    const bpsScores: BpsScore[] = playersInFixture.map((p) => ({
      playerId: p.id,
      bps: p.stats.bps,
    }))

    const fixtureBonus = calculateProvisionalBonus(bpsScores)

    // Merge into result (a player only plays in one fixture per GW)
    for (const [playerId, bonus] of fixtureBonus) {
      result.set(playerId, bonus)
    }
  }

  return result
}
