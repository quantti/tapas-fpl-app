import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { CardRow } from './CardRow';

describe('CardRow', () => {
  describe('with rank', () => {
    it('renders rank, label, and value', () => {
      render(<CardRow rank={1} label="Test Manager" value="100 pts" />);
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('Test Manager')).toBeInTheDocument();
      expect(screen.getByText('100 pts')).toBeInTheDocument();
    });

    it('renders numeric value', () => {
      render(<CardRow rank={2} label="Manager" value={-12} />);
      expect(screen.getByText('-12')).toBeInTheDocument();
    });
  });

  describe('without rank', () => {
    it('renders label and value without rank', () => {
      render(<CardRow label="Test Manager" value="2 FT" />);
      expect(screen.getByText('Test Manager')).toBeInTheDocument();
      expect(screen.getByText('2 FT')).toBeInTheDocument();
      expect(screen.queryByText('1')).not.toBeInTheDocument();
    });
  });

  describe('value colors', () => {
    it('renders with default valueColor', () => {
      render(<CardRow label="Test" value="100" />);
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('renders with success valueColor', () => {
      render(<CardRow label="Test" value="+5" valueColor="success" />);
      expect(screen.getByText('+5')).toBeInTheDocument();
    });

    it('renders with warning valueColor', () => {
      render(<CardRow label="Test" value="50" valueColor="warning" />);
      expect(screen.getByText('50')).toBeInTheDocument();
    });

    it('renders with error valueColor', () => {
      render(<CardRow label="Test" value="-10" valueColor="error" />);
      expect(screen.getByText('-10')).toBeInTheDocument();
    });

    it('renders with muted valueColor', () => {
      render(<CardRow label="Test" value="N/A" valueColor="muted" />);
      expect(screen.getByText('N/A')).toBeInTheDocument();
    });

    it('renders with gold valueColor', () => {
      render(<CardRow label="Test" value="5 FT" valueColor="gold" />);
      expect(screen.getByText('5 FT')).toBeInTheDocument();
    });
  });

  describe('custom children', () => {
    it('renders custom children instead of value', () => {
      render(
        <CardRow rank={1} label="Test">
          <span data-testid="custom">Custom Content</span>
        </CardRow>
      );
      expect(screen.getByTestId('custom')).toBeInTheDocument();
    });

    it('renders custom children without rank', () => {
      render(
        <CardRow label="Test">
          <div data-testid="chips">Chip badges here</div>
        </CardRow>
      );
      expect(screen.getByTestId('chips')).toBeInTheDocument();
    });
  });

  describe('clickable behavior', () => {
    it('renders as button when onClick is provided', () => {
      render(<CardRow label="Test" value="100" onClick={() => {}} />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('renders as div when not clickable', () => {
      render(<CardRow label="Test" value="100" />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('calls onClick when clicked', async () => {
      const user = userEvent.setup();
      const handleClick = vi.fn();
      render(<CardRow label="Test" value="100" onClick={handleClick} />);

      await user.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledOnce();
    });

    it('renders chevron when clickable', () => {
      const { container } = render(<CardRow label="Test" value="100" onClick={() => {}} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('does not render chevron when not clickable', () => {
      const { container } = render(<CardRow label="Test" value="100" />);
      const svg = container.querySelector('svg');
      expect(svg).not.toBeInTheDocument();
    });
  });

  describe('text truncation', () => {
    it('renders long labels', () => {
      render(<CardRow label="Very Long Manager Name That Should Truncate" value="100" />);
      expect(screen.getByText('Very Long Manager Name That Should Truncate')).toBeInTheDocument();
    });
  });

  describe('children vs value precedence', () => {
    it('renders children instead of value when both provided', () => {
      render(
        <CardRow label="Test" value="ignored">
          <span data-testid="custom">Custom Content</span>
        </CardRow>
      );
      expect(screen.getByTestId('custom')).toBeInTheDocument();
      expect(screen.queryByText('ignored')).not.toBeInTheDocument();
    });
  });
});
