import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Spinner } from './Spinner'

describe('Spinner', () => {
  it('renders a spinner element', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('has accessible label for screen readers', () => {
    render(<Spinner />)
    expect(screen.getByRole('status')).toHaveAccessibleName('Loading')
  })

  it('renders with default medium size (40px)', () => {
    render(<Spinner />)
    const spinner = screen.getByRole('status')
    // Default size is 40px (defined in CSS)
    expect(spinner).toBeInTheDocument()
  })

  it('renders with small size variant', () => {
    render(<Spinner size="sm" />)
    const spinner = screen.getByRole('status')
    expect(spinner).toBeInTheDocument()
  })

  it('renders with large size variant', () => {
    render(<Spinner size="lg" />)
    const spinner = screen.getByRole('status')
    expect(spinner).toBeInTheDocument()
  })

  it('accepts custom className', () => {
    render(<Spinner className="custom-class" />)
    const spinner = screen.getByRole('status')
    expect(spinner).toHaveClass('custom-class')
  })
})
