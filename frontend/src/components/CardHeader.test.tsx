import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { CardHeader } from './CardHeader'

describe('CardHeader', () => {
  it('renders children as title', () => {
    render(<CardHeader>Bench Points</CardHeader>)
    expect(screen.getByRole('heading', { name: /bench points/i })).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(<CardHeader icon={<span data-testid="icon">🪑</span>}>Title</CardHeader>)
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })

  it('renders action when provided', () => {
    render(<CardHeader action={<span>Total: 100</span>}>Title</CardHeader>)
    expect(screen.getByText('Total: 100')).toBeInTheDocument()
  })

  it('renders without icon or action', () => {
    render(<CardHeader>Simple Title</CardHeader>)
    expect(screen.getByText('Simple Title')).toBeInTheDocument()
  })

  it('renders all three parts together', () => {
    render(
      <CardHeader
        icon={<span data-testid="icon">📊</span>}
        action={<span data-testid="action">Action</span>}
      >
        Title
      </CardHeader>
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
    expect(screen.getByText('Title')).toBeInTheDocument()
    expect(screen.getByTestId('action')).toBeInTheDocument()
  })
})
