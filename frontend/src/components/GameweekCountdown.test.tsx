import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { calculateTimeRemaining } from '../utils/countdown'

import { GameweekCountdown } from './GameweekCountdown'

// Test constants
const TEST_TIME_NOON = '2024-01-01T12:00:00Z'
const TEST_TIME_11AM = '2024-01-01T11:00:00Z'
const TEST_TIME_MIDNIGHT = '2024-01-01T00:00:00Z'

describe('GameweekCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders countdown when deadline is in the future', () => {
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now
    render(<GameweekCountdown deadline={futureDate.toISOString()} gameweekId={18} />)

    expect(screen.getByText('Next Deadline')).toBeInTheDocument()
    expect(screen.getByText('Gameweek 18')).toBeInTheDocument()
    expect(screen.getByText('Days')).toBeInTheDocument()
    expect(screen.getByText('Hours')).toBeInTheDocument()
    expect(screen.getByText('Minutes')).toBeInTheDocument()
    expect(screen.getByText('Seconds')).toBeInTheDocument()
  })

  it('returns null when deadline has passed', () => {
    const pastDate = new Date(Date.now() - 1000) // 1 second ago
    const { container } = render(
      <GameweekCountdown deadline={pastDate.toISOString()} gameweekId={18} />
    )

    expect(container.firstChild).toBeNull()
  })

  it('shows padded values for each time unit', () => {
    // 2 days, 5 hours, 30 minutes from now
    const futureDate = new Date(Date.now() + (2 * 24 + 5) * 60 * 60 * 1000 + 30 * 60 * 1000)
    render(<GameweekCountdown deadline={futureDate.toISOString()} gameweekId={18} />)

    // Days value should be 02
    expect(screen.getByText('02')).toBeInTheDocument()
    // Hours value should be 05
    expect(screen.getByText('05')).toBeInTheDocument()
  })

  it('displays all four time separators', () => {
    const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    render(<GameweekCountdown deadline={futureDate.toISOString()} gameweekId={18} />)

    // Should have 3 colon separators
    const separators = screen.getAllByText(':')
    expect(separators).toHaveLength(3)
  })

  it('shows correct gameweek number', () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60)
    render(<GameweekCountdown deadline={futureDate.toISOString()} gameweekId={25} />)

    expect(screen.getByText('Gameweek 25')).toBeInTheDocument()
  })

  it('updates countdown every second', () => {
    vi.setSystemTime(new Date(TEST_TIME_MIDNIGHT))
    const futureDeadline = new Date('2024-01-01T00:00:05Z').toISOString()

    render(<GameweekCountdown deadline={futureDeadline} gameweekId={20} />)

    // Initial: 5 seconds
    expect(screen.getByText('05')).toBeInTheDocument()

    // After 1 second: 4 seconds
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('04')).toBeInTheDocument()

    // After another second: 3 seconds
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('03')).toBeInTheDocument()
  })

  it('clears interval when countdown expires (memory leak prevention)', () => {
    vi.setSystemTime(new Date(TEST_TIME_MIDNIGHT))
    const futureDeadline = new Date('2024-01-01T00:00:02Z').toISOString()
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')

    const { container } = render(<GameweekCountdown deadline={futureDeadline} gameweekId={20} />)

    // Initial: 2 seconds remaining
    expect(screen.getByText('02')).toBeInTheDocument()

    // After 1 second: 1 second remaining
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('01')).toBeInTheDocument()

    // After another second: expired, component returns null
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(container.firstChild).toBeNull()

    // Verify interval was cleared (prevents memory leak)
    expect(clearIntervalSpy).toHaveBeenCalled()

    clearIntervalSpy.mockRestore()
  })

  it('does not start interval for already expired deadline', () => {
    vi.setSystemTime(new Date(TEST_TIME_NOON))
    const pastDeadline = new Date(TEST_TIME_11AM).toISOString()
    const setIntervalSpy = vi.spyOn(global, 'setInterval')

    const { container } = render(<GameweekCountdown deadline={pastDeadline} gameweekId={20} />)

    expect(container.firstChild).toBeNull()

    // Verify setInterval was NOT called for expired deadline
    expect(setIntervalSpy).not.toHaveBeenCalled()

    setIntervalSpy.mockRestore()
  })
})

describe('calculateTimeRemaining', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for past deadline', () => {
    vi.setSystemTime(new Date(TEST_TIME_NOON))
    const pastDeadline = new Date(TEST_TIME_11AM).toISOString()
    expect(calculateTimeRemaining(pastDeadline)).toBeNull()
  })

  it('returns time components for future deadline', () => {
    vi.setSystemTime(new Date(TEST_TIME_MIDNIGHT))
    // Deadline is 2 days, 3 hours, 4 minutes, 5 seconds in the future
    const futureDeadline = new Date('2024-01-03T03:04:05Z').toISOString()
    const result = calculateTimeRemaining(futureDeadline)

    expect(result).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
    })
  })

  it('handles deadline exactly at current time as expired', () => {
    vi.setSystemTime(new Date(TEST_TIME_NOON))
    const exactDeadline = new Date(TEST_TIME_NOON).toISOString()
    expect(calculateTimeRemaining(exactDeadline)).toBeNull()
  })
})
