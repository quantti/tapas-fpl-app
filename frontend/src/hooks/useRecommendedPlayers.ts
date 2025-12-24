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
  loading: boolean
  error: string | null
}

// Position-specific scoring weights for punts
// DEF: clean sheets & low xGC matter most
// MID: balanced xG + xA
// FWD: xG matters more than xA
type PositionWeights = { xG: number; xA: number; xGC: number; cs: number; form: number; fix: number }

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

// Fixture weights: nearer gameweeks matter more
const FIXTURE_WEIGHTS = [0.35, 0.25, 0.2, 0.12, 0.08]

function calculateLeagueOwnership(
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

function calculateFixtureScore(teamId: number, fixtures: Fixture[], currentGW: number): number {
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

function getPercentile(value: number, allValues: number[]): number {
  if (allValues.length === 0) return 0.5
  const sorted = [...allValues].sort((a, b) => a - b)
  const rank = sorted.filter((v) => v < value).length
  return rank / sorted.length
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

  // Calculate PUNTS
  const punts = useMemo(() => {
    const candidates: RecommendedPlayer[] = []

    for (const player of players) {
      // Filter: exclude GKs
      if (player.element_type === 1) continue

      // Filter: must be available
      if (player.status !== 'a') continue

      // Filter: minimum minutes
      if (player.minutes < 450) continue

      const ownership = leagueOwnership.get(player.id) ?? 0

      // Filter: ownership < 40%
      if (ownership >= 0.4) continue

      const team = teamsMap.get(player.team)
      if (!team) continue

      const fixtureScore = teamFixtureScores.get(player.team) ?? 0.5
      const minutes90 = player.minutes / 90

      // Calculate per-90 stats (guard against NaN from invalid strings)
      const xG90 = minutes90 > 0 ? (Number.parseFloat(player.expected_goals) || 0) / minutes90 : 0
      const xA90 = minutes90 > 0 ? (Number.parseFloat(player.expected_assists) || 0) / minutes90 : 0
      const xGC90 = minutes90 > 0 ? (Number.parseFloat(player.expected_goals_conceded) || 0) / minutes90 : 0
      const cs90 = minutes90 > 0 ? player.clean_sheets / minutes90 : 0
      const formValue = Number.parseFloat(player.form) || 0

      // Calculate percentiles
      const xG90Pct = getPercentile(xG90, percentiles.xG90)
      const xA90Pct = getPercentile(xA90, percentiles.xA90)
      const formPct = getPercentile(formValue, percentiles.form)
      // For xGC, lower is better - so invert the percentile
      const xGC90Pct = 1 - getPercentile(xGC90, percentiles.xGC90)
      const cs90Pct = getPercentile(cs90, percentiles.cs90)

      // Get position-specific weights
      const w = PUNT_WEIGHTS[player.element_type] ?? PUNT_WEIGHTS[3]
      const score =
        xG90Pct * w.xG +
        xA90Pct * w.xA +
        xGC90Pct * w.xGC +
        cs90Pct * w.cs +
        formPct * w.form +
        fixtureScore * w.fix

      candidates.push({
        player,
        team,
        score,
        fixtureScore,
        leagueOwnership: ownership,
      })
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, 10)
  }, [players, leagueOwnership, teamsMap, teamFixtureScores, percentiles])

  // Calculate DEFENSIVE OPTIONS
  const defensive = useMemo(() => {
    const candidates: RecommendedPlayer[] = []

    for (const player of players) {
      // Filter: exclude GKs
      if (player.element_type === 1) continue

      // Filter: must be available
      if (player.status !== 'a') continue

      // Filter: minimum minutes
      if (player.minutes < 450) continue

      const ownership = leagueOwnership.get(player.id) ?? 0

      // Filter: ownership > 40% and < 100%
      if (ownership <= 0.4 || ownership >= 1) continue

      const team = teamsMap.get(player.team)
      if (!team) continue

      const fixtureScore = teamFixtureScores.get(player.team) ?? 0.5
      const minutes90 = player.minutes / 90

      // Calculate per-90 stats
      const xG90 = minutes90 > 0 ? (Number.parseFloat(player.expected_goals) || 0) / minutes90 : 0
      const xA90 = minutes90 > 0 ? (Number.parseFloat(player.expected_assists) || 0) / minutes90 : 0
      const xGC90 = minutes90 > 0 ? (Number.parseFloat(player.expected_goals_conceded) || 0) / minutes90 : 0
      const cs90 = minutes90 > 0 ? player.clean_sheets / minutes90 : 0
      const formValue = Number.parseFloat(player.form) || 0

      // Calculate percentiles
      const xG90Pct = getPercentile(xG90, percentiles.xG90)
      const xA90Pct = getPercentile(xA90, percentiles.xA90)
      const formPct = getPercentile(formValue, percentiles.form)
      const xGC90Pct = 1 - getPercentile(xGC90, percentiles.xGC90)
      const cs90Pct = getPercentile(cs90, percentiles.cs90)

      // Get position-specific weights
      const w = DEFENSIVE_WEIGHTS[player.element_type] ?? DEFENSIVE_WEIGHTS[3]
      const score =
        xG90Pct * w.xG +
        xA90Pct * w.xA +
        xGC90Pct * w.xGC +
        cs90Pct * w.cs +
        formPct * w.form +
        fixtureScore * w.fix

      candidates.push({
        player,
        team,
        score,
        fixtureScore,
        leagueOwnership: ownership,
      })
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, 10)
  }, [players, leagueOwnership, teamsMap, teamFixtureScores, percentiles])

  return {
    punts,
    defensive,
    loading: fixturesQuery.isLoading,
    error: fixturesQuery.error?.message ?? null,
  }
}
