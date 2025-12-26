import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fplApi } from '../services/api'
import type { Player, Fixture, Team } from '../types/fpl'
import type { ManagerGameweekData } from './useFplData'

export interface RecommendedPlayer {
  player: Player
  team: Team
  score: number
  fixtureScore: number
  leagueOwnership: number
}

interface UseRecommendedPlayersReturn {
  punts: RecommendedPlayer[]
  defensive: RecommendedPlayer[]
  toSell: RecommendedPlayer[]
  loading: boolean
  error: string | null
}

// Position-specific scoring weights for punts
// DEF: clean sheets & low xGC matter most
// MID: balanced xG + xA
// FWD: xG matters more than xA
type PositionWeights = {
  xG: number
  xA: number
  xGC: number
  cs: number
  form: number
  fix: number
}

const PUNT_WEIGHTS: Record<number, PositionWeights> = {
  2: { xG: 0.1, xA: 0.1, xGC: 0.2, cs: 0.15, form: 0.25, fix: 0.2 }, // DEF
  3: { xG: 0.2, xA: 0.2, xGC: 0, cs: 0, form: 0.25, fix: 0.15 }, // MID
  4: { xG: 0.35, xA: 0.1, xGC: 0, cs: 0, form: 0.3, fix: 0.15 }, // FWD
}

// Defensive options: template players - more form-focused
const DEFENSIVE_WEIGHTS: Record<number, PositionWeights> = {
  2: { xG: 0.05, xA: 0.05, xGC: 0.15, cs: 0.15, form: 0.35, fix: 0.25 }, // DEF
  3: { xG: 0.1, xA: 0.1, xGC: 0, cs: 0, form: 0.45, fix: 0.25 }, // MID
  4: { xG: 0.2, xA: 0.05, xGC: 0, cs: 0, form: 0.5, fix: 0.25 }, // FWD
}

// To sell: players to get rid of - primarily POOR FORM
// Form is the dominant factor - we want players who've been bad recently
// Fixtures are minor - good form players with tough fixtures shouldn't be sold
const SELL_WEIGHTS: Record<number, PositionWeights> = {
  2: { xG: 0.05, xA: 0.05, xGC: 0.15, cs: 0.15, form: 0.55, fix: 0.05 }, // DEF
  3: { xG: 0.15, xA: 0.15, xGC: 0, cs: 0, form: 0.65, fix: 0.05 }, // MID
  4: { xG: 0.2, xA: 0.1, xGC: 0, cs: 0, form: 0.65, fix: 0.05 }, // FWD
}

// Fixture weights: nearer gameweeks matter more
const FIXTURE_WEIGHTS = [0.35, 0.25, 0.2, 0.12, 0.08]

// Exported for testing
export function calculateLeagueOwnership(
  players: Player[],
  managerDetails: ManagerGameweekData[]
): Map<number, number> {
  const ownershipMap = new Map<number, number>()

  if (managerDetails.length === 0) {
    return ownershipMap
  }

  const counts = new Map<number, number>()
  for (const manager of managerDetails) {
    for (const pick of manager.picks) {
      counts.set(pick.playerId, (counts.get(pick.playerId) ?? 0) + 1)
    }
  }

  const managerCount = managerDetails.length
  for (const player of players) {
    const count = counts.get(player.id) ?? 0
    ownershipMap.set(player.id, count / managerCount)
  }

  return ownershipMap
}

// Exported for testing
export function calculateFixtureScore(teamId: number, fixtures: Fixture[], currentGW: number): number {
  const upcoming = fixtures
    .filter((f) => f.event !== null && f.event > currentGW && f.event <= currentGW + 5)
    .sort((a, b) => (a.event ?? 0) - (b.event ?? 0))

  if (upcoming.length === 0) return 0.5

  return upcoming.reduce((sum, f, i) => {
    const isHome = f.team_h === teamId
    const difficulty = isHome ? f.team_h_difficulty : f.team_a_difficulty
    // Convert 1-5 difficulty to 0-1 ease score (5 = hardest = 0, 1 = easiest = 1)
    const easeScore = (5 - difficulty) / 4
    return sum + easeScore * (FIXTURE_WEIGHTS[i] ?? 0)
  }, 0)
}

// Exported for testing
export function getPercentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0.5
  const sorted = [...allValues].sort((a, b) => a - b)
  const rank = sorted.filter((v) => v < value).length
  return rank / sorted.length
}

// Helper: Check if player is eligible for recommendations
function isEligibleOutfieldPlayer(player: Player): boolean {
  return player.element_type !== 1 && player.status === 'a' && player.minutes >= 450
}

// Helper: Calculate per-90 stats for a player
interface PlayerStats {
  xG90: number
  xA90: number
  xGC90: number
  cs90: number
  form: number
}

function calculatePlayerStats(player: Player): PlayerStats {
  const minutes90 = player.minutes / 90
  return {
    xG90: minutes90 > 0 ? (Number.parseFloat(player.expected_goals) || 0) / minutes90 : 0,
    xA90: minutes90 > 0 ? (Number.parseFloat(player.expected_assists) || 0) / minutes90 : 0,
    xGC90: minutes90 > 0 ? (Number.parseFloat(player.expected_goals_conceded) || 0) / minutes90 : 0,
    cs90: minutes90 > 0 ? player.clean_sheets / minutes90 : 0,
    form: Number.parseFloat(player.form) || 0,
  }
}

// Helper: Calculate percentiles for player stats
interface Percentiles {
  xG90: number[]
  xA90: number[]
  xGC90: number[]
  cs90: number[]
  form: number[]
}

interface PlayerPercentiles {
  xG90Pct: number
  xA90Pct: number
  xGC90Pct: number
  cs90Pct: number
  formPct: number
}

function calculatePlayerPercentiles(
  stats: PlayerStats,
  percentiles: Percentiles,
  invertXGC: boolean
): PlayerPercentiles {
  return {
    xG90Pct: getPercentile(stats.xG90, percentiles.xG90),
    xA90Pct: getPercentile(stats.xA90, percentiles.xA90),
    xGC90Pct: invertXGC
      ? 1 - getPercentile(stats.xGC90, percentiles.xGC90)
      : getPercentile(stats.xGC90, percentiles.xGC90),
    cs90Pct: getPercentile(stats.cs90, percentiles.cs90),
    formPct: getPercentile(stats.form, percentiles.form),
  }
}

// Helper: Calculate "buy" score (for punts and defensive)
function calculateBuyScore(pct: PlayerPercentiles, weights: PositionWeights, fixtureScore: number): number {
  return (
    pct.xG90Pct * weights.xG +
    pct.xA90Pct * weights.xA +
    pct.xGC90Pct * weights.xGC +
    pct.cs90Pct * weights.cs +
    pct.formPct * weights.form +
    fixtureScore * weights.fix
  )
}

// Helper: Calculate "sell" score (inverted - higher = worse player)
function calculateSellScore(pct: PlayerPercentiles, weights: PositionWeights, fixtureScore: number): number {
  return (
    (1 - pct.xG90Pct) * weights.xG +
    (1 - pct.xA90Pct) * weights.xA +
    pct.xGC90Pct * weights.xGC + // High xGC is bad (not inverted in pct)
    (1 - pct.cs90Pct) * weights.cs +
    (1 - pct.formPct) * weights.form +
    (1 - fixtureScore) * weights.fix
  )
}

export function useRecommendedPlayers(
  players: Player[],
  managerDetails: ManagerGameweekData[],
  teamsMap: Map<number, Team>,
  currentGameweek: number
): UseRecommendedPlayersReturn {
  // Fetch all fixtures for fixture difficulty calculation
  const fixturesQuery = useQuery({
    queryKey: ['fixtures-all'],
    queryFn: () => fplApi.getFixtures(),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: players.length > 0 && currentGameweek > 0,
  })

  // Calculate league ownership
  const leagueOwnership = useMemo(
    () => calculateLeagueOwnership(players, managerDetails),
    [players, managerDetails]
  )

  // Calculate fixture scores for all teams
  const teamFixtureScores = useMemo(() => {
    const fixtures = fixturesQuery.data ?? []
    const scores = new Map<number, number>()
    for (const [teamId] of teamsMap) {
      scores.set(teamId, calculateFixtureScore(teamId, fixtures, currentGameweek))
    }
    return scores
  }, [teamsMap, fixturesQuery.data, currentGameweek])

  // Build percentile arrays for outfield players only
  const percentiles = useMemo(() => {
    const outfieldPlayers = players.filter(
      (p) => p.element_type !== 1 && p.minutes >= 450 && p.status === 'a'
    )
    const defenders = outfieldPlayers.filter((p) => p.element_type === 2)

    const xG90: number[] = []
    const xA90: number[] = []
    const xGC90: number[] = [] // For defenders
    const cs90: number[] = [] // Clean sheets per 90 for defenders
    const form: number[] = []

    for (const player of outfieldPlayers) {
      const minutes90 = player.minutes / 90
      if (minutes90 > 0) {
        xG90.push((Number.parseFloat(player.expected_goals) || 0) / minutes90)
        xA90.push((Number.parseFloat(player.expected_assists) || 0) / minutes90)
      }
      form.push(Number.parseFloat(player.form) || 0)
    }

    // Defender-specific stats
    for (const player of defenders) {
      const minutes90 = player.minutes / 90
      if (minutes90 > 0) {
        xGC90.push((Number.parseFloat(player.expected_goals_conceded) || 0) / minutes90)
        cs90.push(player.clean_sheets / minutes90)
      }
    }

    return { xG90, xA90, xGC90, cs90, form }
  }, [players])

  // Calculate PUNTS - low ownership differential picks
  const punts = useMemo(() => {
    const candidates: RecommendedPlayer[] = []

    for (const player of players) {
      if (!isEligibleOutfieldPlayer(player)) continue

      const ownership = leagueOwnership.get(player.id) ?? 0
      if (ownership >= 0.4) continue

      const team = teamsMap.get(player.team)
      if (!team) continue

      const fixtureScore = teamFixtureScores.get(player.team) ?? 0.5
      const stats = calculatePlayerStats(player)
      const pct = calculatePlayerPercentiles(stats, percentiles, true)
      const weights = PUNT_WEIGHTS[player.element_type] ?? PUNT_WEIGHTS[3]
      const score = calculateBuyScore(pct, weights, fixtureScore)

      candidates.push({ player, team, score, fixtureScore, leagueOwnership: ownership })
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, 20)
  }, [players, leagueOwnership, teamsMap, teamFixtureScores, percentiles])

  // Calculate DEFENSIVE OPTIONS - template picks with moderate ownership
  const defensive = useMemo(() => {
    const candidates: RecommendedPlayer[] = []

    for (const player of players) {
      if (!isEligibleOutfieldPlayer(player)) continue

      const ownership = leagueOwnership.get(player.id) ?? 0
      if (ownership <= 0.4 || ownership >= 1) continue

      const team = teamsMap.get(player.team)
      if (!team) continue

      const fixtureScore = teamFixtureScores.get(player.team) ?? 0.5
      const stats = calculatePlayerStats(player)
      const pct = calculatePlayerPercentiles(stats, percentiles, true)
      const weights = DEFENSIVE_WEIGHTS[player.element_type] ?? DEFENSIVE_WEIGHTS[3]
      const score = calculateBuyScore(pct, weights, fixtureScore)

      candidates.push({ player, team, score, fixtureScore, leagueOwnership: ownership })
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, 10)
  }, [players, leagueOwnership, teamsMap, teamFixtureScores, percentiles])

  // Calculate TO SELL - underperforming owned players
  const toSell = useMemo(() => {
    const candidates: RecommendedPlayer[] = []

    for (const player of players) {
      if (!isEligibleOutfieldPlayer(player)) continue

      const ownership = leagueOwnership.get(player.id) ?? 0
      if (ownership === 0) continue

      const team = teamsMap.get(player.team)
      if (!team) continue

      const fixtureScore = teamFixtureScores.get(player.team) ?? 0.5
      const stats = calculatePlayerStats(player)
      // For sell: don't invert xGC (high xGC = bad = higher sell score)
      const pct = calculatePlayerPercentiles(stats, percentiles, false)
      const weights = SELL_WEIGHTS[player.element_type] ?? SELL_WEIGHTS[3]
      const score = calculateSellScore(pct, weights, fixtureScore)

      // Only include if genuinely bad (score > 0.5 = worse than average)
      if (score <= 0.5) continue

      candidates.push({ player, team, score, fixtureScore, leagueOwnership: ownership })
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, 10)
  }, [players, leagueOwnership, teamsMap, teamFixtureScores, percentiles])

  return {
    punts,
    defensive,
    toSell,
    loading: fixturesQuery.isLoading,
    error: fixturesQuery.error?.message ?? null,
  }
}
