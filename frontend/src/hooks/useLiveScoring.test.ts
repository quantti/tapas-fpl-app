import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useLiveScoring } from './useLiveScoring'
import { fplApi } from '../services/api'
import type { LiveGameweek, Fixture } from '../types/fpl'

// Mock the API
vi.mock('../services/api', () => ({
  fplApi: {
    getLiveGameweek: vi.fn(),
    getFixtures: vi.fn(),
  },
}))

const mockLiveData: LiveGameweek = {
  elements: [
    {
      id: 1,
      stats: {
        minutes: 90,
        goals_scored: 2,
        assists: 1,
        clean_sheets: 0,
        goals_conceded: 2,
        own_goals: 0,
        penalties_saved: 0,
        penalties_missed: 0,
        yellow_cards: 0,
        red_cards: 0,
        saves: 0,
        bonus: 3,
        bps: 65,
        influence: '50.0',
        creativity: '30.0',
        threat: '40.0',
        ict_index: '12.0',
        total_points: 18,
        in_dreamteam: true,
      },
      explain: [{ fixture: 1, stats: [{ identifier: 'goals_scored', points: 10, value: 2 }] }],
    },
    {
      id: 2,
      stats: {
        minutes: 90,
        goals_scored: 0,
        assists: 2,
        clean_sheets: 1,
        goals_conceded: 0,
        own_goals: 0,
        penalties_saved: 0,
        penalties_missed: 0,
        yellow_cards: 0,
        red_cards: 0,
        saves: 0,
        bonus: 2,
        bps: 55,
        influence: '40.0',
        creativity: '50.0',
        threat: '20.0',
        ict_index: '11.0',
        total_points: 12,
        in_dreamteam: false,
      },
      explain: [{ fixture: 1, stats: [{ identifier: 'assists', points: 6, value: 2 }] }],
    },
  ],
}

const mockFixtures: Fixture[] = [
  {
    id: 1,
    code: 123,
    event: 17,
    team_h: 1,
    team_a: 2,
    team_h_score: 2,
    team_a_score: 1,
    started: true,
    finished: false,
    finished_provisional: false,
    minutes: 75,
    kickoff_time: '2024-12-21T15:00:00Z',
    provisional_start_time: false,
    team_h_difficulty: 3,
    team_a_difficulty: 3,
    pulse_id: 123,
    stats: [],
  },
]

// Tests that don't need fake timers - use real async/await
describe('useLiveScoring - basic functionality', () => {
  beforeEach(() => {
    vi.mocked(fplApi.getLiveGameweek).mockResolvedValue(mockLiveData)
    vi.mocked(fplApi.getFixtures).mockResolvedValue(mockFixtures)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch live data on mount when isLive is true', async () => {
    const { result } = renderHook(() => useLiveScoring(17, true))

    await waitFor(() => {
      expect(result.current.liveData).toBeDefined()
    })

    expect(fplApi.getLiveGameweek).toHaveBeenCalledWith(17)
  })

  it('should fetch once even when isLive is false (for countdown)', async () => {
    const { result } = renderHook(() => useLiveScoring(17, false))

    // Should still fetch once to get fixture status for countdown
    await waitFor(() => {
      expect(result.current.fixtures.length).toBeGreaterThan(0)
    })

    expect(fplApi.getLiveGameweek).toHaveBeenCalledTimes(1)
    expect(fplApi.getFixtures).toHaveBeenCalledTimes(1)
  })

  it('should provide player live points map', async () => {
    const { result } = renderHook(() => useLiveScoring(17, true))

    // Wait for actual data to be loaded, not just defined
    await waitFor(() => {
      expect(result.current.liveData?.elements?.length).toBeGreaterThan(0)
    })

    const playerPoints = result.current.getPlayerLivePoints(1)
    expect(playerPoints).toBe(18) // total_points from mock
  })

  it('should return 0 for players not in live data', async () => {
    const { result } = renderHook(() => useLiveScoring(17, true))

    await waitFor(() => {
      expect(result.current.liveData).toBeDefined()
    })

    const playerPoints = result.current.getPlayerLivePoints(999)
    expect(playerPoints).toBe(0)
  })

  it('should track loading state', async () => {
    const { result } = renderHook(() => useLiveScoring(17, true))

    // Initially loading
    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })
  })

  it('should handle API errors gracefully', async () => {
    vi.mocked(fplApi.getLiveGameweek).mockRejectedValueOnce(new Error('API Error'))

    const { result } = renderHook(() => useLiveScoring(17, true))

    await waitFor(() => {
      expect(result.current.error).toBe('API Error')
    })

    expect(result.current.loading).toBe(false)
  })

  it('should provide last updated timestamp', async () => {
    const { result } = renderHook(() => useLiveScoring(17, true))

    // Wait for lastUpdated to actually be a Date (not null/undefined)
    await waitFor(() => {
      expect(result.current.lastUpdated).toBeInstanceOf(Date)
    })
  })

  it('should allow manual refresh', async () => {
    const { result } = renderHook(() => useLiveScoring(17, true))

    await waitFor(() => {
      expect(result.current.liveData).toBeDefined()
    })
    expect(fplApi.getLiveGameweek).toHaveBeenCalledTimes(1)

    // Manually trigger refresh
    await act(async () => {
      await result.current.refresh()
    })

    expect(fplApi.getLiveGameweek).toHaveBeenCalledTimes(2)
  })
})

// Tests that require fake timers for polling behavior
describe('useLiveScoring - polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(fplApi.getLiveGameweek).mockResolvedValue(mockLiveData)
    vi.mocked(fplApi.getFixtures).mockResolvedValue(mockFixtures)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('should poll at specified interval when isLive is true', async () => {
    renderHook(() => useLiveScoring(17, true, 30000)) // 30 second interval

    // Initial fetch happens immediately on mount - flush promises with advanceTimersByTimeAsync(0)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fplApi.getLiveGameweek).toHaveBeenCalledTimes(1)

    // Advance time by 30 seconds - should trigger another fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(fplApi.getLiveGameweek).toHaveBeenCalledTimes(2)

    // Advance another 30 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000)
    })
    expect(fplApi.getLiveGameweek).toHaveBeenCalledTimes(3)
  })

  it('should stop polling when isLive changes to false', async () => {
    const { rerender } = renderHook(({ isLive }) => useLiveScoring(17, isLive), {
      initialProps: { isLive: true },
    })

    // Initial fetch happens immediately on mount
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fplApi.getLiveGameweek).toHaveBeenCalledTimes(1)

    // Change isLive to false - will trigger one more fetch but no polling
    await act(async () => {
      rerender({ isLive: false })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fplApi.getLiveGameweek).toHaveBeenCalledTimes(2) // One more fetch when isLive changes

    // Advance time - should not make any more calls (no polling when not live)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(fplApi.getLiveGameweek).toHaveBeenCalledTimes(2) // No additional calls
  })
})

// Tests for provisional bonus calculation
describe('useLiveScoring - provisional bonus', () => {
  beforeEach(() => {
    vi.mocked(fplApi.getLiveGameweek).mockResolvedValue(mockLiveData)
    vi.mocked(fplApi.getFixtures).mockResolvedValue(mockFixtures)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should calculate provisional bonus from BPS when fixture >= 60 minutes', async () => {
    const { result } = renderHook(() => useLiveScoring(17, true))

    // Wait for both liveData AND fixtures to be populated (they fetch in parallel)
    await waitFor(() => {
      expect(result.current.liveData).toBeDefined()
      expect(result.current.fixtures.length).toBeGreaterThan(0)
    })

    // Player 1 has BPS 65, Player 2 has BPS 55
    // Player 1 should get 3 provisional bonus, Player 2 should get 2
    const bonus1 = result.current.getProvisionalBonus(1, 1) // fixtureId 1
    const bonus2 = result.current.getProvisionalBonus(2, 1)

    expect(bonus1).toBe(3)
    expect(bonus2).toBe(2)
  })

  it('should return 0 provisional bonus for fixture < 60 minutes', async () => {
    const earlyFixtures: Fixture[] = [
      {
        ...mockFixtures[0],
        minutes: 45,
      },
    ]
    vi.mocked(fplApi.getFixtures).mockResolvedValue(earlyFixtures)

    const { result } = renderHook(() => useLiveScoring(17, true))

    await waitFor(() => {
      expect(result.current.liveData).toBeDefined()
    })

    const bonus = result.current.getProvisionalBonus(1, 1)
    expect(bonus).toBe(0)
  })
})
