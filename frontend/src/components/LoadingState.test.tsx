import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { LoadingState } from './LoadingState';

describe('LoadingState', () => {
  it('renders a spinner', () => {
    render(<LoadingState />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders with default message', () => {
    render(<LoadingState />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders with custom message', () => {
    render(<LoadingState message="Fetching data..." />);
    expect(screen.getByText('Fetching data...')).toBeInTheDocument();
  });

  it('renders without message when message is empty', () => {
    render(<LoadingState message="" />);
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });

  it('passes size prop to Spinner', () => {
    render(<LoadingState size="lg" />);
    // Spinner renders with role="status"
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders centered container', () => {
    const { container } = render(<LoadingState />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.tagName).toBe('DIV');
  });

  it('accepts custom className on wrapper', () => {
    const { container } = render(<LoadingState className="custom-wrapper" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-wrapper');
  });
});
