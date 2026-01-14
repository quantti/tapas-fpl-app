import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { LiveMatchSection } from './LiveMatchSection';

import type { PlayerLiveStats } from 'hooks/usePlayerLiveStats';

// Helper to create mock stats
const createMockStats = (overrides: Partial<PlayerLiveStats> = {}): PlayerLiveStats => ({
  isLive: true,
  isInProgress: true,
  fixture: null,
  minutes: 65,
  totalPoints: 8,
  goals: 1,
  assists: 1,
  yellowCards: 0,
  redCards: 0,
  bps: 25,
  officialBonus: 0,
  provisionalBonus: 2,
  showProvisionalBonus: true,
  defensiveContribution: 0,
  metDefCon: false,
  explain: [
    { identifier: 'minutes', value: 65, points: 2 },
    { identifier: 'goals_scored', value: 1, points: 4 },
    { identifier: 'assists', value: 1, points: 3 },
  ],
  ...overrides,
});

describe('LiveMatchSection', () => {
  describe('rendering', () => {
    it('returns null when not live', () => {
      const stats = createMockStats({ isLive: false });
      const { container } = render(<LiveMatchSection stats={stats} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders live badge when match is in progress', () => {
      const stats = createMockStats({ isInProgress: true });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });

    it('renders FT badge when match is finished', () => {
      const stats = createMockStats({ isInProgress: false });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByText('FT')).toBeInTheDocument();
    });

    it('displays minutes played', () => {
      const stats = createMockStats({ minutes: 72 });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByText("72'")).toBeInTheDocument();
    });

    it('displays total points', () => {
      const stats = createMockStats({ totalPoints: 12 });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('pts')).toBeInTheDocument();
    });
  });

  describe('event icons', () => {
    it('shows goal icon when player scored', () => {
      const stats = createMockStats({ goals: 1 });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByTitle('1 goal')).toBeInTheDocument();
    });

    it('shows goal count when multiple goals', () => {
      const stats = createMockStats({ goals: 2 });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByTitle('2 goals')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('shows assist icon when player assisted', () => {
      const stats = createMockStats({ assists: 1 });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByTitle('1 assist')).toBeInTheDocument();
    });

    it('shows yellow card when player booked', () => {
      const stats = createMockStats({ yellowCards: 1 });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByTitle('Yellow card')).toBeInTheDocument();
    });

    it('shows red card when player sent off', () => {
      const stats = createMockStats({ redCards: 1 });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByTitle('Red card')).toBeInTheDocument();
    });

    it('does not show icons when no events', () => {
      const stats = createMockStats({ goals: 0, assists: 0, yellowCards: 0, redCards: 0 });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.queryByText('⚽')).not.toBeInTheDocument();
      expect(screen.queryByTitle(/goal/i)).not.toBeInTheDocument();
      expect(screen.queryByTitle(/assist/i)).not.toBeInTheDocument();
      expect(screen.queryByTitle(/card/i)).not.toBeInTheDocument();
    });
  });

  describe('bonus badge', () => {
    it('shows provisional bonus when showProvisionalBonus is true', () => {
      const stats = createMockStats({
        provisionalBonus: 3,
        officialBonus: 0,
        showProvisionalBonus: true,
      });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByText('B3')).toBeInTheDocument();
    });

    it('shows official bonus over provisional', () => {
      const stats = createMockStats({
        provisionalBonus: 2,
        officialBonus: 3,
        showProvisionalBonus: true,
      });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByText('B3')).toBeInTheDocument();
    });

    it('does not show bonus badge when no bonus', () => {
      const stats = createMockStats({
        provisionalBonus: 0,
        officialBonus: 0,
        showProvisionalBonus: true,
      });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.queryByText(/^B\d$/)).not.toBeInTheDocument();
    });
  });

  describe('DefCon badge', () => {
    it('shows DC badge when DefCon threshold met', () => {
      const stats = createMockStats({ metDefCon: true });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByText('DC')).toBeInTheDocument();
    });

    it('does not show DC badge when threshold not met', () => {
      const stats = createMockStats({ metDefCon: false });
      render(<LiveMatchSection stats={stats} />);
      expect(screen.queryByText('DC')).not.toBeInTheDocument();
    });
  });

  describe('point breakdown', () => {
    it('shows expand button when there are stats', () => {
      const stats = createMockStats();
      render(<LiveMatchSection stats={stats} />);
      expect(screen.getByText('Point breakdown')).toBeInTheDocument();
    });

    it('expands to show stat breakdown when clicked', async () => {
      const user = userEvent.setup();
      const stats = createMockStats();
      render(<LiveMatchSection stats={stats} />);

      // Initially hidden
      expect(screen.queryByText('Goals')).not.toBeInTheDocument();

      // Click to expand
      await user.click(screen.getByText('Point breakdown'));

      // Now visible
      expect(screen.getByText('Goals')).toBeInTheDocument();
      expect(screen.getByText('Assists')).toBeInTheDocument();
      expect(screen.getByText('Minutes')).toBeInTheDocument();
    });

    it('collapses when clicked again', async () => {
      const user = userEvent.setup();
      const stats = createMockStats();
      render(<LiveMatchSection stats={stats} />);

      // Expand
      await user.click(screen.getByText('Point breakdown'));
      expect(screen.getByText('Goals')).toBeInTheDocument();

      // Collapse
      await user.click(screen.getByText('Point breakdown'));
      expect(screen.queryByText('Goals')).not.toBeInTheDocument();
    });

    it('shows multiplier for countable stats with value > 1', async () => {
      const user = userEvent.setup();
      const stats = createMockStats({
        explain: [{ identifier: 'goals_scored', value: 2, points: 8 }],
      });
      render(<LiveMatchSection stats={stats} />);

      await user.click(screen.getByText('Point breakdown'));
      expect(screen.getByText('2×')).toBeInTheDocument();
    });

    it('does not show multiplier for minutes', async () => {
      const user = userEvent.setup();
      const stats = createMockStats({
        explain: [{ identifier: 'minutes', value: 90, points: 2 }],
      });
      render(<LiveMatchSection stats={stats} />);

      await user.click(screen.getByText('Point breakdown'));
      expect(screen.queryByText('90×')).not.toBeInTheDocument();
    });
  });
});
