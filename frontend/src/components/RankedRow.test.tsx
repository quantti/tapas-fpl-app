import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { RankedRow } from './RankedRow'

describe('RankedRow', () => {
  it('renders rank, name, and value', () => {
    render(<RankedRow rank={1} name="Test Manager" value="100 pts" />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('Test Manager')).toBeInTheDocument()
    expect(screen.getByText('100 pts')).toBeInTheDocument()
  })

  it('renders numeric value', () => {
    render(<RankedRow rank={2} name="Manager" value={-12} />)
    expect(screen.getByText('-12')).toBeInTheDocument()
  })

  it('renders with default valueColor', () => {
    render(<RankedRow rank={1} name="Test" value="100" />)
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('renders with success valueColor', () => {
    render(<RankedRow rank={1} name="Test" value="+5" valueColor="success" />)
    expect(screen.getByText('+5')).toBeInTheDocument()
  })

  it('renders with warning valueColor', () => {
    render(<RankedRow rank={1} name="Test" value="50" valueColor="warning" />)
    expect(screen.getByText('50')).toBeInTheDocument()
  })

  it('renders with error valueColor', () => {
    render(<RankedRow rank={1} name="Test" value="-10" valueColor="error" />)
    expect(screen.getByText('-10')).toBeInTheDocument()
  })

  it('renders custom children instead of value', () => {
    render(
      <RankedRow rank={1} name="Test">
        <span data-testid="custom">Custom Content</span>
      </RankedRow>
    )
    expect(screen.getByTestId('custom')).toBeInTheDocument()
    expect(screen.queryByText('undefined')).not.toBeInTheDocument()
  })

  it('renders long names', () => {
    render(<RankedRow rank={1} name="Very Long Manager Name That Should Truncate" value="100" />)
    expect(screen.getByText('Very Long Manager Name That Should Truncate')).toBeInTheDocument()
  })
})
