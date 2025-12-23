import { useState, useEffect, useCallback, useRef } from 'react'
import { fplApi } from '../services/api'
import type { LiveGameweek, Fixture } from '../types/fpl'
import { calculateProvisionalBonus, shouldShowProvisionalBonus } from '../utils/liveScoring'

interface UseLiveScoringReturn {
  liveData: LiveGameweek | null
  fixtures: Fixture[]
  loading: boolean
  error: string | null
  lastUpdated: Date | null
  getPlayerLivePoints: (playerId: number) => number
  getProvisionalBonus: (playerId: number, fixtureId: number) => number
  refresh: () => Promise<void>
}

const DEFAULT_POLL_INTERVAL = 60000 // 60 seconds

export function useLiveScoring(
  gameweek: number,
  isLive: boolean,
  pollInterval: number = DEFAULT_POLL_INTERVAL
): UseLiveScoringReturn {
  const [liveData, setLiveData] = useState<LiveGameweek | null>(null)
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [loading, setLoading] = useState(isLive)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Use ref to track interval for cleanup
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const [live, fixtureData] = await Promise.all([
        fplApi.getLiveGameweek(gameweek),
        fplApi.getFixtures(gameweek),
      ])
      console.log('[useLiveScoring] fetched', fixtureData.length, 'fixtures')
      setLiveData(live)
      setFixtures(fixtureData)
      setLastUpdated(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch live data')
    } finally {
      setLoading(false)
    }
  }, [gameweek])

  // Fetch on mount and set up polling when live
  useEffect(() => {
    // Don't fetch if gameweek is 0 (invalid/not loaded yet)
    if (gameweek === 0) {
      console.log('[useLiveScoring] gameweek is 0, skipping fetch')
      return
    }

    console.log('[useLiveScoring] fetching for gameweek', gameweek)
    // Always fetch once to get fixture status (needed for countdown)
    fetchData()

    // Only set up polling when live
    if (isLive) {
      intervalRef.current = setInterval(fetchData, pollInterval)
    }

    // Cleanup on unmount or when dependencies change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [gameweek, isLive, fetchData, pollInterval])

  const getPlayerLivePoints = useCallback(
    (playerId: number): number => {
      if (!liveData) return 0
      const player = liveData.elements.find((p) => p.id === playerId)
      return player?.stats.total_points ?? 0
    },
    [liveData]
  )

  const getProvisionalBonus = useCallback(
    (playerId: number, fixtureId: number): number => {
      if (!liveData || !fixtures.length) return 0

      const fixture = fixtures.find((f) => f.id === fixtureId)
      if (!fixture || !shouldShowProvisionalBonus(fixture)) {
        return 0
      }

      // Get BPS scores for players in this fixture
      const playersInFixture = liveData.elements.filter((p) =>
        p.explain.some((e) => e.fixture === fixtureId)
      )

      const bpsScores = playersInFixture.map((p) => ({
        playerId: p.id,
        bps: p.stats.bps,
      }))

      const bonusMap = calculateProvisionalBonus(bpsScores)
      return bonusMap.get(playerId) ?? 0
    },
    [liveData, fixtures]
  )

  const refresh = useCallback(async () => {
    setLoading(true)
    await fetchData()
  }, [fetchData])

  return {
    liveData,
    fixtures,
    loading,
    error,
    lastUpdated,
    getPlayerLivePoints,
    getProvisionalBonus,
    refresh,
  }
}
