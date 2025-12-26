import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FplUpdating } from './FplUpdating'

describe('FplUpdating', () => {
  it('renders default message', () => {
    render(<FplUpdating />)

    expect(screen.getByText('FPL is updating')).toBeInTheDocument()
    expect(
      screen.getByText(/Fantasy Premier League is updating gameweek data/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/The app will automatically refresh when data is available/i)
    ).toBeInTheDocument()
  })

  it('accepts custom title and message', () => {
    render(<FplUpdating title="Custom Title" message="Custom message text." />)

    expect(screen.getByText('Custom Title')).toBeInTheDocument()
    expect(screen.getByText('Custom message text.')).toBeInTheDocument()
  })

  it('has correct test id', () => {
    render(<FplUpdating />)

    expect(screen.getByTestId('fpl-updating')).toBeInTheDocument()
  })
})
