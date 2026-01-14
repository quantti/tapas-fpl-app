import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import * as usePlayerDetailsModule from 'services/queries/usePlayerDetails';

import { PlayerDetails } from './PlayerDetails';

import type { Player, Team, ElementType } from 'types/fpl';

// Mock the usePlayerDetails hook
vi.mock('services/queries/usePlayerDetails', async () => {
  const actual = await vi.importActual('services/queries/usePlayerDetails');
  return {
    ...actual,
    usePlayerDetails: vi.fn(),
  };
});

const mockPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 1,
  web_name: 'Haaland',
  first_name: 'Erling',
  second_name: 'Haaland',
  team: 10,
  team_code: 10,
  element_type: 4,
  now_cost: 150,
  total_points: 200,
  event_points: 10,
  points_per_game: '8.0',
  selected_by_percent: '85.0',
  news: '',
  news_added: null,
  status: 'a',
  photo: '123456.png',
  form: '8.5',
  goals_scored: 20,
  assists: 5,
  clean_sheets: 0,
  goals_conceded: 0,
  own_goals: 0,
  penalties_saved: 0,
  penalties_missed: 0,
  yellow_cards: 2,
  red_cards: 0,
  saves: 0,
  bps: 450,
  influence: '500.0',
  creativity: '200.0',
  threat: '600.0',
  expected_goals: '18.5',
  expected_assists: '4.2',
  expected_goal_involvements: '22.7',
  expected_goals_conceded: '0.0',
  ict_index: '350.0',
  minutes: 2500,
  bonus: 30,
  defensive_contribution: 0,
  ...overrides,
});

const mockTeam = (id: number, name: string, shortName: string): Team => ({
  id,
  name,
  short_name: shortName,
  code: id,
  strength: 4,
  strength_overall_home: 1300,
  strength_overall_away: 1300,
  strength_attack_home: 1300,
  strength_attack_away: 1300,
  strength_defence_home: 1300,
  strength_defence_away: 1300,
});

const mockElementType = (id: number, singularName: string): ElementType => ({
  id,
  singular_name: singularName,
  singular_name_short: singularName.substring(0, 3).toUpperCase(),
  plural_name: `${singularName}s`,
  plural_name_short: `${singularName.substring(0, 3).toUpperCase()}s`,
  squad_select: 1,
  squad_min_play: 0,
  squad_max_play: 1,
});

const defaultTeams: Team[] = [
  mockTeam(10, 'Manchester City', 'MCI'),
  mockTeam(11, 'Liverpool', 'LIV'),
  mockTeam(12, 'Arsenal', 'ARS'),
];

const defaultElementTypes: ElementType[] = [
  mockElementType(1, 'Goalkeeper'),
  mockElementType(2, 'Defender'),
  mockElementType(3, 'Midfielder'),
  mockElementType(4, 'Forward'),
];

const mockUsePlayerDetails = vi.mocked(usePlayerDetailsModule.usePlayerDetails);

// Helper to create mock PlayerDetails return value
const mockDetails = (
  player: Player,
  overrides: Partial<usePlayerDetailsModule.PlayerDetails> = {}
): usePlayerDetailsModule.PlayerDetails => ({
  player,
  team: mockTeam(10, 'Manchester City', 'MCI'),
  positionName: 'Forward',
  price: '£15.0m',
  priceChange: 0,
  priceChangeFormatted: '',
  xgDelta: 1.5,
  xaDelta: 0.8,
  xG90: 0.67,
  xA90: 0.15,
  xGI90: 0.82,
  xGC90: 0,
  pts90: 7.2,
  formVsAvg: 'above' as const,
  formDiff: 2.0,
  summary: null,
  isLoadingSummary: false,
  ...overrides,
});

describe('PlayerDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when player is null', () => {
    mockUsePlayerDetails.mockReturnValue(null);

    const { container } = render(
      <PlayerDetails
        player={null}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders loading state when details are loading', () => {
    mockUsePlayerDetails.mockReturnValue(null);

    render(
      <PlayerDetails
        player={mockPlayer()}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Loading player details...')).toBeInTheDocument();
  });

  it('renders player header with name and position badge', () => {
    const player = mockPlayer();
    mockUsePlayerDetails.mockReturnValue(mockDetails(player));

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    // Player name appears in modal title (h2) and in header section (span)
    const haalandElements = screen.getAllByText('Haaland');
    expect(haalandElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('FWD')).toBeInTheDocument();
  });

  it('renders team name', () => {
    const player = mockPlayer();
    mockUsePlayerDetails.mockReturnValue(mockDetails(player));

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Manchester City')).toBeInTheDocument();
  });

  it('renders price and ownership', () => {
    const player = mockPlayer();
    mockUsePlayerDetails.mockReturnValue(mockDetails(player));

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('£15.0m')).toBeInTheDocument();
    expect(screen.getByText('85.0% owned')).toBeInTheDocument();
  });

  it('renders season stats', () => {
    const player = mockPlayer();
    mockUsePlayerDetails.mockReturnValue(mockDetails(player));

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('200')).toBeInTheDocument(); // Points total
    expect(screen.getByText(/20G/)).toBeInTheDocument(); // Goals in season row
    expect(screen.getByText(/5A/)).toBeInTheDocument(); // Assists in season row
  });

  it('renders form with trend indicator', () => {
    const player = mockPlayer();
    mockUsePlayerDetails.mockReturnValue(mockDetails(player));

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('8.5')).toBeInTheDocument(); // Form value
    expect(screen.getByText('+2.0')).toBeInTheDocument(); // Form diff indicator
  });

  it('renders xG and xA stats with deltas', () => {
    const player = mockPlayer();
    mockUsePlayerDetails.mockReturnValue(mockDetails(player));

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    // xG section
    expect(screen.getByText('xG')).toBeInTheDocument();
    expect(screen.getByText('18.5')).toBeInTheDocument();
    expect(screen.getByText('+1.5')).toBeInTheDocument();

    // xA section
    expect(screen.getByText('xA')).toBeInTheDocument();
    expect(screen.getByText('4.2')).toBeInTheDocument();
    expect(screen.getByText('+0.8')).toBeInTheDocument();
  });

  it('renders additional stats (minutes, bonus)', () => {
    const player = mockPlayer();
    mockUsePlayerDetails.mockReturnValue(mockDetails(player));

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('2500 mins')).toBeInTheDocument();
    expect(screen.getByText('30 bonus')).toBeInTheDocument();
  });

  it('renders player status badge - Available', () => {
    const player = mockPlayer({ status: 'a' });
    mockUsePlayerDetails.mockReturnValue(mockDetails(player));

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('renders player status badge - Doubtful with news', () => {
    const player = mockPlayer({
      status: 'd',
      news: 'Hamstring - 75% chance of playing',
    });
    mockUsePlayerDetails.mockReturnValue(mockDetails(player));

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Doubtful')).toBeInTheDocument();
    expect(screen.getByText('Hamstring - 75% chance of playing')).toBeInTheDocument();
  });

  it('renders player status badge - Unavailable', () => {
    const player = mockPlayer({
      status: 'i',
      news: 'Knee injury - Expected back January',
    });
    mockUsePlayerDetails.mockReturnValue(mockDetails(player));

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Knee injury - Expected back January')).toBeInTheDocument();
  });

  it('shows loading message for fixtures when summary is loading', () => {
    const player = mockPlayer();
    mockUsePlayerDetails.mockReturnValue(mockDetails(player, { isLoadingSummary: true }));

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    // Only fixtures tab is visible by default
    expect(screen.getByText('Loading fixtures...')).toBeInTheDocument();
  });

  it('shows empty state for fixtures when no upcoming', () => {
    const player = mockPlayer();
    mockUsePlayerDetails.mockReturnValue(
      mockDetails(player, {
        summary: {
          fixtures: [],
          history: [],
          history_past: [],
        },
      })
    );

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    // Only fixtures tab is visible by default
    expect(screen.getByText('No upcoming fixtures')).toBeInTheDocument();
  });

  it('renders negative xG delta correctly', () => {
    const player = mockPlayer();
    mockUsePlayerDetails.mockReturnValue(
      mockDetails(player, {
        xgDelta: -2.5,
        xaDelta: -1.0,
        formVsAvg: 'below' as const,
        formDiff: -1.5,
      })
    );

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('-2.5')).toBeInTheDocument();
    expect(screen.getByText('-1.0')).toBeInTheDocument();
    expect(screen.getByText('-1.5')).toBeInTheDocument();
  });

  it('renders form indicator as "= avg" when form is average', () => {
    const player = mockPlayer();
    mockUsePlayerDetails.mockReturnValue(
      mockDetails(player, {
        xgDelta: 0,
        xaDelta: 0,
        xG90: 0,
        xA90: 0,
        xGI90: 0,
        xGC90: 0,
        pts90: 0,
        formVsAvg: 'same' as const,
        formDiff: 0,
      })
    );

    render(
      <PlayerDetails
        player={player}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('= avg')).toBeInTheDocument();
  });
});
