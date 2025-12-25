import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Card content</Card>)
    expect(screen.getByText('Card content')).toBeInTheDocument()
  })

  it('applies custom className', () => {
    render(<Card className="custom-class">Content</Card>)
    const card = screen.getByText('Content').closest('div')
    expect(card).toHaveClass('custom-class')
  })

  it('sets data-scrollable attribute when scrollable', () => {
    render(
      <Card scrollable maxHeight={400}>
        Content
      </Card>
    )
    const card = screen.getByText('Content').closest('div')
    expect(card).toHaveAttribute('data-scrollable', 'true')
  })

  it('does not set data-scrollable when not scrollable', () => {
    render(<Card>Content</Card>)
    const card = screen.getByText('Content').closest('div')
    expect(card).not.toHaveAttribute('data-scrollable')
  })

  it('applies maxHeight style when scrollable', () => {
    render(
      <Card scrollable maxHeight={400}>
        Content
      </Card>
    )
    const card = screen.getByText('Content').closest('div')
    expect(card).toHaveStyle({ maxHeight: '400px' })
  })
})
