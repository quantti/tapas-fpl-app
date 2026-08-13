import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { usePreviousSeasonStandings } from 'services/queries/usePreviousSeasonStandings';
import { PreviousSeasonStandings } from './PreviousSeasonStandings';

vi.mock('services/queries/usePreviousSeasonStandings', () => ({
  usePreviousSeasonStandings: vi.fn(),
}));
vi.mock('./PreviousSeasonStandings.module.css', () => ({
  PreviousSeasonStandings: 's',
  header: 'h',
  title: 't',
  table: 'tb',
  colRank: 'cr',
  colPoints: 'cp',
  rank: 'r',
  manager: 'm',
  points: 'p',
  winner: 'winner',
  last: 'last',
  annotation: 'a',
  relegatedText: 'rt',
  arrowSvg: 'as',
}));

const mockHook = vi.mocked(usePreviousSeasonStandings);
const base = { standings: [], isLoading: false, error: null };

const three = [
  { managerId: 2, managerName: 'B', teamName: 'TB', totalPoints: 2300 },
  { managerId: 1, managerName: 'A', teamName: 'TA', totalPoints: 2150 },
  { managerId: 3, managerName: 'C', teamName: 'TC', totalPoints: 1900 },
];

describe('PreviousSeasonStandings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders table sorted by rank', () => {
    mockHook.mockReturnValue({ ...base, standings: three });
    render(<PreviousSeasonStandings />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(4); // header + 3
    expect(rows[1]).toHaveTextContent('1');
    expect(rows[3]).toHaveTextContent('3');
  });

  it('highlights winner green, last red', () => {
    mockHook.mockReturnValue({ ...base, standings: three });
    render(<PreviousSeasonStandings />);
    const rows = screen.getAllByRole('row');
    expect(rows[1].className).toContain('winner');
    expect(rows[3].className).toContain('last');
  });

  it('shows relegated text', () => {
    mockHook.mockReturnValue({ ...base, standings: three });
    render(<PreviousSeasonStandings />);
    expect(screen.getByText('Relegated, exiles in Cadiz.')).toBeInTheDocument();
  });

  it('renders nothing when loading', () => {
    mockHook.mockReturnValue({ ...base, isLoading: true });
    const { container } = render(<PreviousSeasonStandings />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing on error', () => {
    mockHook.mockReturnValue({ ...base, error: 'fail' });
    const { container } = render(<PreviousSeasonStandings />);
    expect(container.firstChild).toBeNull();
  });
});
