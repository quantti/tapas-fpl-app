import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GameweekCountdown } from './GameweekCountdown'

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
})
