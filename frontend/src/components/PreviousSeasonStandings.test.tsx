import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { usePreviousSeasonStandings } from 'services/queries/usePreviousSeasonStandings';

import { PreviousSeasonStandings } from './PreviousSeasonStandings';

vi.mock('services/queries/usePreviousSeasonStandings', () => ({
  usePreviousSeasonStandings: vi.fn(),
}));

// Mock CSS module with plain class names so highlight classes can be asserted
vi.mock('./PreviousSeasonStandings.module.css', () => ({
  PreviousSeasonStandings: 'PreviousSeasonStandings',
  header: 'header',
  title: 'title',
  table: 'table',
  colRank: 'colRank',
  colTeam: 'colTeam',
  colManager: 'colManager',
  colPoints: 'colPoints',
  rank: 'rank',
  team: 'team',
  manager: 'manager',
  points: 'points',
  winner: 'winner',
  last: 'last',
  annotation: 'annotation',
  relegatedText: 'relegatedText',
  arrowSvg: 'arrowSvg',
}));

const mockHook = vi.mocked(usePreviousSeasonStandings);

const baseReturn = {
  standings: [],
  isLoading: false,
  error: null,
  isBackendUnavailable: false,
};

const threeManagers = [
  { managerId: 2, managerName: 'Manager B', teamName: 'Team B', totalPoints: 2300 },
  { managerId: 1, managerName: 'Manager A', teamName: 'Team A', totalPoints: 2150 },
  { managerId: 3, managerName: 'Manager C', teamName: 'Team C', totalPoints: 1900 },
];

describe('PreviousSeasonStandings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders final standings with season label', () => {
    mockHook.mockReturnValue({ ...baseReturn, standings: threeManagers });

    render(<PreviousSeasonStandings />);

    expect(screen.getByText('Final Standings 2025/26')).toBeInTheDocument();
    expect(screen.getByText('Team B')).toBeInTheDocument();
    expect(screen.getByText('Manager A')).toBeInTheDocument();
    expect(screen.getByText('2300')).toBeInTheDocument();
  });

  it('renders ranks in order', () => {
    mockHook.mockReturnValue({ ...baseReturn, standings: threeManagers });

    render(<PreviousSeasonStandings />);

    const rows = screen.getAllByRole('row');
    // 1 header row + 3 data rows
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveTextContent('1');
    expect(rows[1]).toHaveTextContent('Team B');
    expect(rows[3]).toHaveTextContent('3');
    expect(rows[3]).toHaveTextContent('Team C');
  });

  it('highlights winner green and last place red', () => {
    mockHook.mockReturnValue({ ...baseReturn, standings: threeManagers });

    render(<PreviousSeasonStandings />);

    const rows = screen.getAllByRole('row');
    expect(rows[1].className).toContain('winner');
    expect(rows[1].className).not.toContain('last');
    expect(rows[2].className).not.toContain('winner');
    expect(rows[2].className).not.toContain('last');
    expect(rows[3].className).toContain('last');
  });

  it('does not highlight last place when only one manager', () => {
    mockHook.mockReturnValue({ ...baseReturn, standings: [threeManagers[0]] });

    render(<PreviousSeasonStandings />);

    const rows = screen.getAllByRole('row');
    expect(rows[1].className).toContain('winner');
    expect(rows[1].className).not.toContain('last');
  });

  it('renders nothing while loading', () => {
    mockHook.mockReturnValue({ ...baseReturn, isLoading: true });

    const { container } = render(<PreviousSeasonStandings />);

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing on error (e.g. backend DB paused)', () => {
    mockHook.mockReturnValue({
      ...baseReturn,
      error: 'Database not available',
      isBackendUnavailable: true,
    });

    const { container } = render(<PreviousSeasonStandings />);

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when standings are empty', () => {
    mockHook.mockReturnValue({ ...baseReturn, standings: [] });

    const { container } = render(<PreviousSeasonStandings />);

    expect(container.firstChild).toBeNull();
  });
});
