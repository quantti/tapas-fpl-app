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
  selected_by_percent: '85.0',
  news: '',
  news_added: null,
  chance_of_playing_next_round: 100,
  chance_of_playing_this_round: 100,
  status: 'a',
  photo: '123456.png',
  form: '8.5',
  goals_scored: 20,
  assists: 5,
  expected_goals: '18.5',
  expected_assists: '4.2',
  ict_index: '350.0',
  minutes: 2500,
  bonus: 30,
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
  ui_shirt_specific: false,
  element_count: 50,
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
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 1.5,
      xaDelta: 0.8,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'above' as const,
      formDiff: 2.0,
      summary: null,
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer()}
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
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 1.5,
      xaDelta: 0.8,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'above' as const,
      formDiff: 2.0,
      summary: null,
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer()}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Manchester City')).toBeInTheDocument();
  });

  it('renders price and ownership', () => {
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 1.5,
      xaDelta: 0.8,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'above' as const,
      formDiff: 2.0,
      summary: null,
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer()}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('£15.0m')).toBeInTheDocument();
    expect(screen.getByText('85.0% owned')).toBeInTheDocument();
  });

  it('renders season stats', () => {
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 1.5,
      xaDelta: 0.8,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'above' as const,
      formDiff: 2.0,
      summary: null,
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer()}
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
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 1.5,
      xaDelta: 0.8,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'above' as const,
      formDiff: 2.0,
      summary: null,
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer()}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('8.5')).toBeInTheDocument(); // Form value
    expect(screen.getByText('+2.0')).toBeInTheDocument(); // Form diff indicator
  });

  it('renders xG and xA stats with deltas', () => {
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 1.5,
      xaDelta: 0.8,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'above' as const,
      formDiff: 2.0,
      summary: null,
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer()}
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
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 1.5,
      xaDelta: 0.8,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'above' as const,
      formDiff: 2.0,
      summary: null,
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer()}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('2500 mins')).toBeInTheDocument();
    expect(screen.getByText('30 bonus')).toBeInTheDocument();
  });

  it('renders player status badge - Available', () => {
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 1.5,
      xaDelta: 0.8,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'above' as const,
      formDiff: 2.0,
      summary: null,
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer({ status: 'a' })}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('renders player status badge - Doubtful with news', () => {
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 1.5,
      xaDelta: 0.8,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'above' as const,
      formDiff: 2.0,
      summary: null,
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer({
          status: 'd',
          news: 'Hamstring - 75% chance of playing',
        })}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Doubtful')).toBeInTheDocument();
    expect(screen.getByText('Hamstring - 75% chance of playing')).toBeInTheDocument();
  });

  it('renders player status badge - Unavailable', () => {
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 1.5,
      xaDelta: 0.8,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'above' as const,
      formDiff: 2.0,
      summary: null,
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer({
          status: 'i',
          news: 'Knee injury - Expected back January',
        })}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Knee injury - Expected back January')).toBeInTheDocument();
  });

  it('shows loading message for fixtures when summary is loading', () => {
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 1.5,
      xaDelta: 0.8,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'above' as const,
      formDiff: 2.0,
      summary: null,
      isLoadingSummary: true,
    });

    render(
      <PlayerDetails
        player={mockPlayer()}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    // Only fixtures tab is visible by default
    expect(screen.getByText('Loading fixtures...')).toBeInTheDocument();
  });

  it('shows empty state for fixtures when no upcoming', () => {
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 1.5,
      xaDelta: 0.8,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'above' as const,
      formDiff: 2.0,
      summary: {
        fixtures: [],
        history: [],
        history_past: [],
      },
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer()}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    // Only fixtures tab is visible by default
    expect(screen.getByText('No upcoming fixtures')).toBeInTheDocument();
  });

  it('renders negative xG delta correctly', () => {
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: -2.5,
      xaDelta: -1.0,
      xG90: 0.67,
      xA90: 0.15,
      xGI90: 0.82,
      pts90: 7.2,
      formVsAvg: 'below' as const,
      formDiff: -1.5,
      summary: null,
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer()}
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
    mockUsePlayerDetails.mockReturnValue({
      team: mockTeam(10, 'Manchester City', 'MCI'),
      elementType: mockElementType(4, 'Forward'),
      price: '£15.0m',
      xgDelta: 0,
      xaDelta: 0,
      xG90: 0,
      xA90: 0,
      xGI90: 0,
      pts90: 0,
      formVsAvg: 'same' as const,
      formDiff: 0,
      summary: null,
      isLoadingSummary: false,
    });

    render(
      <PlayerDetails
        player={mockPlayer()}
        teams={defaultTeams}
        elementTypes={defaultElementTypes}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('= avg')).toBeInTheDocument();
  });
});
