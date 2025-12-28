import type { Fixture, LiveGameweek, LivePlayer, Player } from '../types/fpl'
import type { ManagerPick } from '../hooks/useFplData'
import type { AutoSubstitution, AutoSubResult, PlayerEligibility } from '../types/autoSubs'

// FPL formation constraints
export const POSITION_LIMITS = {
  1: { min: 1, max: 1 }, // GK: exactly 1
  2: { min: 3, max: 5 }, // DEF: 3-5
  3: { min: 2, max: 5 }, // MID: 2-5
  4: { min: 1, max: 3 }, // FWD: 1-3
} as const

export const STARTING_XI_MAX_POSITION = 11
export const BENCH_POSITIONS = [12, 13, 14, 15] as const

/**
 * Build a map of team ID -> fixture for quick lookup
 */
export function buildTeamFixtureMap(fixtures: Fixture[]): Map<number, Fixture> {
  const map = new Map<number, Fixture>()
  for (const fixture of fixtures) {
    map.set(fixture.team_h, fixture)
    map.set(fixture.team_a, fixture)
  }
  return map
}

/**
 * Check if a player's fixture has finished (provisionally or fully)
 */
export function isPlayerFixtureFinished(
  playerTeamId: number,
  teamFixtureMap: Map<number, Fixture>
): boolean {
  const fixture = teamFixtureMap.get(playerTeamId)
  if (!fixture) return false
  return fixture.finished_provisional || fixture.finished
}

/**
 * Check if a player has any contribution (scoring events in explain array).
 * A player has contributed if they have ANY scoring event, including:
 * - Minutes played (1+ minute)
 * - Yellow/red card (even from bench - rare but possible)
 * - Any other stat event
 *
 * This is safer than checking minutes > 0 alone because a player
 * can get a card from the bench without playing.
 *
 * NOTE: FPL API includes a `minutes` stat entry even for players who didn't play
 * (value: 0, points: 0). We must check for actual contribution via:
 * - points !== 0 (any stat that gave/deducted points), OR
 * - minutes > 0 (player actually played)
 */
export function hasContribution(livePlayer: LivePlayer): boolean {
  return livePlayer.explain.some((e) =>
    e.stats.some((stat) => stat.points !== 0 || (stat.identifier === 'minutes' && stat.value > 0))
  )
}

/**
 * Get player eligibility info for auto-sub calculation
 */
export function getPlayerEligibility(
  pick: ManagerPick,
  liveData: LiveGameweek,
  playersMap: Map<number, Player>,
  teamFixtureMap: Map<number, Fixture>
): PlayerEligibility | null {
  const player = playersMap.get(pick.playerId)
  if (!player) return null

  const livePlayer = liveData.elements.find((e) => e.id === pick.playerId)
  if (!livePlayer) return null

  const fixtureFinished = isPlayerFixtureFinished(player.team, teamFixtureMap)
  const contributed = hasContribution(livePlayer)

  return {
    playerId: pick.playerId,
    elementType: player.element_type,
    fixtureFinished,
    hasContribution: contributed,
    webName: player.web_name,
  }
}

/**
 * Count current formation from picks (only counting active players)
 */
export function countFormation(
  picks: ManagerPick[],
  playersMap: Map<number, Player>
): Record<number, number> {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }

  for (const pick of picks) {
    if (pick.multiplier > 0) {
      // Only count active players
      const player = playersMap.get(pick.playerId)
      if (player) {
        counts[player.element_type]++
      }
    }
  }

  return counts
}

/**
 * Check if a substitution is valid:
 * 1. GK can ONLY be replaced by GK
 * 2. Formation constraints must be maintained
 */
export function canSubstitute(
  outPlayerType: number,
  inPlayerType: number,
  currentFormation: Record<number, number>
): boolean {
  // GK rule: GK can only be replaced by another GK
  if (outPlayerType === 1 && inPlayerType !== 1) return false
  if (inPlayerType === 1 && outPlayerType !== 1) return false

  // Simulate the swap
  const newFormation = { ...currentFormation }
  newFormation[outPlayerType]--
  newFormation[inPlayerType]++

  // Check all position limits
  for (const [posType, count] of Object.entries(newFormation)) {
    const limits = POSITION_LIMITS[Number(posType) as keyof typeof POSITION_LIMITS]
    if (count < limits.min || count > limits.max) {
      return false
    }
  }

  return true
}

/**
 * Check if a bench player is eligible to substitute for a starter
 */
function isBenchPlayerEligible(
  benchEligibility: PlayerEligibility | undefined,
  starterEligibility: PlayerEligibility,
  currentFormation: Record<number, number>,
  usedBenchPlayers: Set<number>
): boolean {
  if (!benchEligibility) return false
  if (usedBenchPlayers.has(benchEligibility.playerId)) return false
  if (!benchEligibility.fixtureFinished || !benchEligibility.hasContribution) return false
  return canSubstitute(
    starterEligibility.elementType,
    benchEligibility.elementType,
    currentFormation
  )
}

/**
 * Find first eligible bench player for a starter needing substitution
 */
function findEligibleBenchPlayer(
  bench: ManagerPick[],
  starterEligibility: PlayerEligibility,
  eligibilityMap: Map<number, PlayerEligibility>,
  currentFormation: Record<number, number>,
  usedBenchPlayers: Set<number>
): { benchPick: ManagerPick; benchEligibility: PlayerEligibility } | null {
  for (const benchPick of bench) {
    const benchEligibility = eligibilityMap.get(benchPick.playerId)
    if (
      isBenchPlayerEligible(
        benchEligibility,
        starterEligibility,
        currentFormation,
        usedBenchPlayers
      )
    ) {
      return { benchPick, benchEligibility: benchEligibility! }
    }
  }
  return null
}

/**
 * Process captain promotion when captain didn't contribute but VC did
 */
function processCaptainPromotion(
  adjustedPicks: ManagerPick[],
  eligibilityMap: Map<number, PlayerEligibility>,
  originalCaptainMultiplier: number
): { captainPromoted: boolean; originalCaptainId?: number } {
  const captainPick = adjustedPicks.find((p) => p.isCaptain)
  const vcPick = adjustedPicks.find((p) => p.isViceCaptain)

  if (!captainPick || !vcPick) {
    return { captainPromoted: false }
  }

  const captainEligibility = eligibilityMap.get(captainPick.playerId)
  const vcEligibility = eligibilityMap.get(vcPick.playerId)

  const shouldPromote =
    captainEligibility?.fixtureFinished &&
    !captainEligibility.hasContribution &&
    vcEligibility?.fixtureFinished &&
    vcEligibility.hasContribution

  if (!shouldPromote) {
    return { captainPromoted: false }
  }

  const captainIndex = adjustedPicks.findIndex((p) => p.isCaptain)
  const vcIndex = adjustedPicks.findIndex((p) => p.isViceCaptain)

  if (captainIndex === -1 || vcIndex === -1) {
    return { captainPromoted: false }
  }

  // VC gets captain's original multiplier (2, or 3 for triple captain)
  adjustedPicks[vcIndex].multiplier = originalCaptainMultiplier

  // Original captain loses captain bonus (set to 1 if still playing, already 0 if subbed out)
  if (adjustedPicks[captainIndex].multiplier > 1) {
    adjustedPicks[captainIndex].multiplier = 1
  }

  return { captainPromoted: true, originalCaptainId: captainPick.playerId }
}

/**
 * Build eligibility map for all picks
 */
function buildEligibilityMap(
  picks: ManagerPick[],
  liveData: LiveGameweek,
  playersMap: Map<number, Player>,
  teamFixtureMap: Map<number, Fixture>
): Map<number, PlayerEligibility> {
  const eligibilityMap = new Map<number, PlayerEligibility>()
  for (const pick of picks) {
    const eligibility = getPlayerEligibility(pick, liveData, playersMap, teamFixtureMap)
    if (eligibility) {
      eligibilityMap.set(pick.playerId, eligibility)
    }
  }
  return eligibilityMap
}

/**
 * Calculate auto-substitutions for a manager's picks.
 *
 * Algorithm:
 * 1. Identify starters who didn't contribute (fixture finished, no events)
 * 2. Process bench in order: 12 -> 13 -> 14 -> 15
 * 3. For each non-contributing starter, find first eligible bench player
 * 4. Bench player is eligible if: contributed AND maintains valid formation
 * 5. Handle captain promotion if captain didn't contribute
 */
export function calculateAutoSubs(
  picks: ManagerPick[],
  liveData: LiveGameweek | null,
  fixtures: Fixture[],
  playersMap: Map<number, Player>
): AutoSubResult {
  if (!liveData || picks.length === 0) {
    return { adjustedPicks: picks, autoSubs: [], captainPromoted: false }
  }

  const teamFixtureMap = buildTeamFixtureMap(fixtures)
  const adjustedPicks = picks.map((p) => ({ ...p }))
  const originalCaptainMultiplier = picks.find((p) => p.isCaptain)?.multiplier ?? 2
  const eligibilityMap = buildEligibilityMap(picks, liveData, playersMap, teamFixtureMap)

  const starters = adjustedPicks.filter((p) => p.position <= STARTING_XI_MAX_POSITION)
  const bench = adjustedPicks
    .filter((p) => p.position > STARTING_XI_MAX_POSITION)
    .sort((a, b) => a.position - b.position)

  const startersNeedingSub = starters.filter((pick) => {
    const eligibility = eligibilityMap.get(pick.playerId)
    return eligibility?.fixtureFinished && !eligibility.hasContribution
  })

  const autoSubs: AutoSubstitution[] = []
  const usedBenchPlayers = new Set<number>()

  for (const starter of startersNeedingSub) {
    const starterEligibility = eligibilityMap.get(starter.playerId)
    if (!starterEligibility) continue

    const currentFormation = countFormation(adjustedPicks, playersMap)
    const match = findEligibleBenchPlayer(
      bench,
      starterEligibility,
      eligibilityMap,
      currentFormation,
      usedBenchPlayers
    )

    if (!match) continue

    const { benchPick, benchEligibility } = match
    usedBenchPlayers.add(benchPick.playerId)

    const starterIndex = adjustedPicks.findIndex((p) => p.playerId === starter.playerId)
    const benchIndex = adjustedPicks.findIndex((p) => p.playerId === benchPick.playerId)

    if (starterIndex !== -1 && benchIndex !== -1) {
      adjustedPicks[starterIndex].multiplier = 0
      adjustedPicks[benchIndex].multiplier = 1
    }

    autoSubs.push({
      playerOut: {
        playerId: starter.playerId,
        position: starter.position,
        elementType: starterEligibility.elementType,
        webName: starterEligibility.webName,
      },
      playerIn: {
        playerId: benchPick.playerId,
        position: benchPick.position,
        elementType: benchEligibility.elementType,
        webName: benchEligibility.webName,
      },
    })
  }

  const { captainPromoted, originalCaptainId } = processCaptainPromotion(
    adjustedPicks,
    eligibilityMap,
    originalCaptainMultiplier
  )

  return { adjustedPicks, autoSubs, captainPromoted, originalCaptainId }
}
