import type { Fixture, Player } from '../types/fpl'
import { shouldShowProvisionalBonus } from './liveScoring'

// FPL position element_types: 1=GK, 2=DEF, 3=MID, 4=FWD
type OutfieldPosition = 2 | 3 | 4

// DefCon thresholds by position (FPL 2025/26 rules)
// Defenders: 10+ CBIT (Clearances, Blocks, Interceptions, Tackles)
// Midfielders/Forwards: 12+ CBITr (includes ball Recoveries)
const DEFCON_THRESHOLDS: Record<OutfieldPosition, number> = {
  2: 10, // Defenders: 10+ CBIT
  3: 12, // Midfielders: 12+ CBITr
  4: 12, // Forwards: 12+ CBITr
}

// DefCon awards 2 bonus points when threshold is met (capped at 2)
const DEFCON_BONUS_POINTS = 2

export interface PlayerReward {
  playerId: number
  webName: string
  points: number
}

export type FixtureStatus = 'not_started' | 'in_progress' | 'rewards_available'

export interface FixtureRewards {
  fixture: Fixture
  homeTeamName: string
  awayTeamName: string
  bonus: PlayerReward[] // points: 1, 2, or 3 based on BPS ranking
  defcon: PlayerReward[] // points: always 2 for meeting threshold
  status: FixtureStatus
  // showRewards removed - derive via: status === 'rewards_available'
}

/**
 * Extract stat entries from fixture for a given identifier
 */
function getStatEntries(
  fixture: Fixture,
  identifier: string
): { element: number; value: number }[] {
  // Defensive check for missing stats array (can happen with mock data or partial API responses)
  if (!fixture.stats || !Array.isArray(fixture.stats)) return []
  const stat = fixture.stats.find((s) => s.identifier === identifier)
  if (!stat) return []
  return [...stat.h, ...stat.a]
}

/**
 * Map stat entries to player rewards with names
 */
function mapToPlayerRewards(
  entries: { element: number; value: number }[],
  playersMap: Map<number, Player>
): PlayerReward[] {
  return entries
    .map((entry) => {
      const player = playersMap.get(entry.element)
      return {
        playerId: entry.element,
        webName: player?.web_name ?? `#${entry.element}`,
        points: entry.value,
      }
    })
    .sort((a, b) => b.points - a.points) // Sort by points descending
}

/**
 * Filter DefCon entries to only include players who met their position's threshold
 * and map to rewards with the fixed bonus point value
 */
function isOutfieldPosition(elementType: number): elementType is OutfieldPosition {
  return elementType === 2 || elementType === 3 || elementType === 4
}

function filterAndMapDefconRewards(
  entries: { element: number; value: number }[],
  playersMap: Map<number, Player>
): PlayerReward[] {
  return entries
    .filter((entry) => {
      const player = playersMap.get(entry.element)
      if (!player) return false

      // Only outfield players (DEF/MID/FWD) can earn DefCon points
      if (!isOutfieldPosition(player.element_type)) return false

      const threshold = DEFCON_THRESHOLDS[player.element_type]
      return entry.value >= threshold
    })
    .map((entry) => {
      const player = playersMap.get(entry.element)
      return {
        playerId: entry.element,
        webName: player?.web_name ?? `#${entry.element}`,
        points: DEFCON_BONUS_POINTS, // Fixed bonus points, not raw CBITR value
      }
    })
    .sort((a, b) => a.webName.localeCompare(b.webName)) // Sort alphabetically
}

/**
 * Determine fixture display status
 */
function getFixtureStatus(fixture: Fixture): FixtureStatus {
  if (!fixture.started) {
    return 'not_started'
  }
  if (shouldShowProvisionalBonus(fixture)) {
    return 'rewards_available'
  }
  return 'in_progress'
}

/**
 * Extract bonus and defensive contribution rewards from a single fixture
 */
export function extractFixtureRewards(
  fixture: Fixture,
  playersMap: Map<number, Player>,
  teamsMap: Map<number, { name: string; short_name: string }>
): FixtureRewards {
  const homeTeam = teamsMap.get(fixture.team_h)
  const awayTeam = teamsMap.get(fixture.team_a)

  const status = getFixtureStatus(fixture)
  const shouldShowRewards = status === 'rewards_available'

  // Only extract rewards if we should show them
  const bonusEntries = shouldShowRewards ? getStatEntries(fixture, 'bonus') : []
  const defconEntries = shouldShowRewards ? getStatEntries(fixture, 'defensive_contribution') : []

  return {
    fixture,
    homeTeamName: homeTeam?.short_name ?? `Team ${fixture.team_h}`,
    awayTeamName: awayTeam?.short_name ?? `Team ${fixture.team_a}`,
    bonus: mapToPlayerRewards(bonusEntries, playersMap),
    defcon: filterAndMapDefconRewards(defconEntries, playersMap),
    status,
  }
}

/**
 * Extract rewards for all fixtures in a gameweek
 */
export function extractAllFixtureRewards(
  fixtures: Fixture[],
  playersMap: Map<number, Player>,
  teamsMap: Map<number, { name: string; short_name: string }>
): FixtureRewards[] {
  return fixtures
    .filter((f) => f.event !== null) // Only fixtures with assigned gameweek
    .sort((a, b) => {
      // Sort by kickoff time, then by ID
      if (a.kickoff_time && b.kickoff_time) {
        return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime()
      }
      return a.id - b.id
    })
    .map((fixture) => extractFixtureRewards(fixture, playersMap, teamsMap))
}
