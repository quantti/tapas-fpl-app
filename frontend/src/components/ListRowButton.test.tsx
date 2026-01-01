import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

import { ListRowButton } from './ListRowButton'

describe('ListRowButton', () => {
  it('renders children', () => {
    render(<ListRowButton onClick={() => {}}>Click me</ListRowButton>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('renders as a button element', () => {
    render(<ListRowButton onClick={() => {}}>Content</ListRowButton>)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<ListRowButton onClick={handleClick}>Click me</ListRowButton>)

    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('renders chevron icon', () => {
    render(<ListRowButton onClick={() => {}}>Content</ListRowButton>)
    // Lucide icons render as SVG
    const svg = screen.getByRole('button').querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(
      <ListRowButton onClick={() => {}} className="custom-class">
        Content
      </ListRowButton>
    )
    expect(screen.getByRole('button')).toHaveClass('custom-class')
  })

  it('renders complex children', () => {
    render(
      <ListRowButton onClick={() => {}}>
        <span data-testid="name">Manager Name</span>
        <span data-testid="value">100 pts</span>
      </ListRowButton>
    )
    expect(screen.getByTestId('name')).toBeInTheDocument()
    expect(screen.getByTestId('value')).toBeInTheDocument()
  })
})
