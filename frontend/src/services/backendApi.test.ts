import { describe, expect, it } from 'vitest';

import {
  BackendApiError,
  validateComparisonResponse,
  validateLeagueChipsResponse,
  validateLeagueDashboardResponse,
  validateLeaguePositionsResponse,
  validateLeagueStatsResponse,
  validateTeamsResponse,
} from './backendApi';

describe('BackendApiError', () => {
  it('should create error with status and statusText', () => {
    const error = new BackendApiError(500, 'Internal Server Error');
    expect(error.status).toBe(500);
    expect(error.statusText).toBe('Internal Server Error');
    expect(error.message).toBe('Backend API error: 500 Internal Server Error');
  });

  it('should use detail message when provided', () => {
    const error = new BackendApiError(400, 'Bad Request', 'Invalid league ID');
    expect(error.message).toBe('Invalid league ID');
  });

  it('should identify 503 as service unavailable', () => {
    const error = new BackendApiError(503, 'Service Unavailable');
    expect(error.isServiceUnavailable).toBe(true);
  });

  it('should identify status 0 (network error) as service unavailable', () => {
    const error = new BackendApiError(0, 'Network Error');
    expect(error.isServiceUnavailable).toBe(true);
  });

  it('should not identify 500 as service unavailable', () => {
    const error = new BackendApiError(500, 'Internal Server Error');
    expect(error.isServiceUnavailable).toBe(false);
  });

  it('should not identify 404 as service unavailable', () => {
    const error = new BackendApiError(404, 'Not Found');
    expect(error.isServiceUnavailable).toBe(false);
  });
});

describe('validateTeamsResponse', () => {
  it('returns true for valid response', () => {
    const data = {
      season_id: 1,
      teams: [{ team_id: 1, avg_per_match: 10.5 }],
    };
    expect(validateTeamsResponse(data)).toBe(true);
  });

  it('returns true for empty teams array', () => {
    const data = { season_id: 1, teams: [] };
    expect(validateTeamsResponse(data)).toBe(true);
  });

  it('returns false for null input', () => {
    expect(validateTeamsResponse(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    const undef = undefined as unknown;
    expect(validateTeamsResponse(undef)).toBe(false);
  });

  it('returns false when teams is not an array', () => {
    const data = { season_id: 1, teams: 'not an array' };
    expect(validateTeamsResponse(data)).toBe(false);
  });

  it('returns false when teams is missing', () => {
    const data = { season_id: 1 };
    expect(validateTeamsResponse(data)).toBe(false);
  });

  it('returns false when first team lacks avg_per_match', () => {
    const data = { season_id: 1, teams: [{ team_id: 1 }] };
    expect(validateTeamsResponse(data)).toBe(false);
  });

  it('returns false when avg_per_match is not a number', () => {
    const data = {
      season_id: 1,
      teams: [{ team_id: 1, avg_per_match: 'ten' }],
    };
    expect(validateTeamsResponse(data)).toBe(false);
  });
});

describe('validateLeagueChipsResponse', () => {
  it('returns true for valid response', () => {
    const data = {
      league_id: 123,
      season_id: 1,
      current_gameweek: 10,
      current_half: 1,
      managers: [
        {
          manager_id: 1,
          name: 'Manager 1',
          first_half: { chips_used: [], chips_remaining: ['wildcard'] },
          second_half: { chips_used: [], chips_remaining: [] },
        },
      ],
    };
    expect(validateLeagueChipsResponse(data)).toBe(true);
  });

  it('returns true for empty managers array', () => {
    const data = {
      league_id: 123,
      current_gameweek: 10,
      managers: [],
    };
    expect(validateLeagueChipsResponse(data)).toBe(true);
  });

  it('returns false for null input', () => {
    expect(validateLeagueChipsResponse(null)).toBe(false);
  });

  it('returns false when league_id is missing', () => {
    const data = { current_gameweek: 10, managers: [] };
    expect(validateLeagueChipsResponse(data)).toBe(false);
  });

  it('returns false when league_id is not a number', () => {
    const data = { league_id: '123', current_gameweek: 10, managers: [] };
    expect(validateLeagueChipsResponse(data)).toBe(false);
  });

  it('returns false when current_gameweek is missing', () => {
    const data = { league_id: 123, managers: [] };
    expect(validateLeagueChipsResponse(data)).toBe(false);
  });

  it('returns false when managers is not an array', () => {
    const data = {
      league_id: 123,
      current_gameweek: 10,
      managers: 'not array',
    };
    expect(validateLeagueChipsResponse(data)).toBe(false);
  });

  it('returns false when first manager lacks manager_id', () => {
    const data = {
      league_id: 123,
      current_gameweek: 10,
      managers: [{ name: 'Manager 1', first_half: {} }],
    };
    expect(validateLeagueChipsResponse(data)).toBe(false);
  });

  it('returns false when first manager lacks first_half', () => {
    const data = {
      league_id: 123,
      current_gameweek: 10,
      managers: [{ manager_id: 1, name: 'Manager 1' }],
    };
    expect(validateLeagueChipsResponse(data)).toBe(false);
  });
});

describe('validateLeagueStatsResponse', () => {
  it('returns true for valid response', () => {
    const data = {
      league_id: 123,
      season_id: 1,
      current_gameweek: 10,
      bench_points: [{ manager_id: 1, name: 'Manager 1', bench_points: 50 }],
      free_transfers: [{ manager_id: 1, name: 'Manager 1', free_transfers: 2 }],
      captain_differential: [{ manager_id: 1, name: 'Manager 1', gain: 10 }],
    };
    expect(validateLeagueStatsResponse(data)).toBe(true);
  });

  it('returns true for empty arrays', () => {
    const data = {
      league_id: 123,
      current_gameweek: 10,
      bench_points: [],
      free_transfers: [],
      captain_differential: [],
    };
    expect(validateLeagueStatsResponse(data)).toBe(true);
  });

  it('returns false for null input', () => {
    expect(validateLeagueStatsResponse(null)).toBe(false);
  });

  it('returns false when league_id is missing', () => {
    const data = {
      current_gameweek: 10,
      bench_points: [],
      free_transfers: [],
      captain_differential: [],
    };
    expect(validateLeagueStatsResponse(data)).toBe(false);
  });

  it('returns false when current_gameweek is missing', () => {
    const data = {
      league_id: 123,
      bench_points: [],
      free_transfers: [],
      captain_differential: [],
    };
    expect(validateLeagueStatsResponse(data)).toBe(false);
  });

  it('returns false when bench_points is not an array', () => {
    const data = {
      league_id: 123,
      current_gameweek: 10,
      bench_points: 'not array',
      free_transfers: [],
      captain_differential: [],
    };
    expect(validateLeagueStatsResponse(data)).toBe(false);
  });

  it('returns false when free_transfers is not an array', () => {
    const data = {
      league_id: 123,
      current_gameweek: 10,
      bench_points: [],
      free_transfers: null,
      captain_differential: [],
    };
    expect(validateLeagueStatsResponse(data)).toBe(false);
  });

  it('returns false when captain_differential is missing', () => {
    const data = {
      league_id: 123,
      current_gameweek: 10,
      bench_points: [],
      free_transfers: [],
    };
    expect(validateLeagueStatsResponse(data)).toBe(false);
  });
});

describe('validateLeaguePositionsResponse', () => {
  it('returns true for valid response', () => {
    const data = {
      league_id: 123,
      season_id: 1,
      positions: [{ gameweek: 1, '1001': 1, '1002': 2 }],
      managers: [{ id: 1001, name: 'Manager 1', color: '#FF0000' }],
    };
    expect(validateLeaguePositionsResponse(data)).toBe(true);
  });

  it('returns true for empty arrays', () => {
    const data = {
      league_id: 123,
      positions: [],
      managers: [],
    };
    expect(validateLeaguePositionsResponse(data)).toBe(true);
  });

  it('returns false for null input', () => {
    expect(validateLeaguePositionsResponse(null)).toBe(false);
  });

  it('returns false when league_id is missing', () => {
    const data = { positions: [], managers: [] };
    expect(validateLeaguePositionsResponse(data)).toBe(false);
  });

  it('returns false when positions is not an array', () => {
    const data = { league_id: 123, positions: 'not array', managers: [] };
    expect(validateLeaguePositionsResponse(data)).toBe(false);
  });

  it('returns false when managers is not an array', () => {
    const data = { league_id: 123, positions: [], managers: {} };
    expect(validateLeaguePositionsResponse(data)).toBe(false);
  });

  it('returns false when first position lacks gameweek', () => {
    const data = {
      league_id: 123,
      positions: [{ '1001': 1 }],
      managers: [],
    };
    expect(validateLeaguePositionsResponse(data)).toBe(false);
  });

  it('returns false when gameweek is not a number', () => {
    const data = {
      league_id: 123,
      positions: [{ gameweek: 'one' }],
      managers: [],
    };
    expect(validateLeaguePositionsResponse(data)).toBe(false);
  });
});

describe('validateComparisonResponse', () => {
  const validManagerStats = {
    manager_id: 1001,
    name: 'Manager A',
    team_name: 'Team A FC',
    total_points: 1500,
    overall_rank: 100000,
    league_rank: 1,
    total_transfers: 25,
    total_hits: 2,
    hits_cost: -8,
    remaining_transfers: 2,
    captain_points: 300,
    differential_captains: 5,
    chips_used: ['wildcard'],
    chips_remaining: ['bboost', '3xc', 'freehit'],
    best_gameweek: { gw: 15, points: 85 },
    worst_gameweek: { gw: 3, points: 25 },
    starting_xi: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    league_template_overlap: {
      match_count: 8,
      match_percentage: 72.7,
      matching_player_ids: [1, 2, 3, 4, 5, 6, 7, 8],
      differential_player_ids: [9, 10, 11],
      playstyle_label: 'Balanced',
    },
    world_template_overlap: null,
    consistency_score: 15.2,
    bench_waste_rate: 8.5,
    hit_frequency: 12.0,
    last_5_average: 55.4,
  };

  const validResponse = {
    season_id: 1,
    manager_a: { ...validManagerStats },
    manager_b: { ...validManagerStats, manager_id: 1002, name: 'Manager B' },
    common_players: [1, 2, 3, 4, 5],
    head_to_head: { wins_a: 10, wins_b: 8, draws: 2 },
  };

  it('returns true for valid response', () => {
    expect(validateComparisonResponse(validResponse)).toBe(true);
  });

  it('returns true for response with null optional fields', () => {
    const data = {
      ...validResponse,
      manager_a: {
        ...validManagerStats,
        overall_rank: null,
        league_rank: null,
        best_gameweek: null,
        worst_gameweek: null,
      },
    };
    expect(validateComparisonResponse(data)).toBe(true);
  });

  it('returns true for empty common_players array', () => {
    const data = { ...validResponse, common_players: [] };
    expect(validateComparisonResponse(data)).toBe(true);
  });

  it('returns false for null input', () => {
    expect(validateComparisonResponse(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    const undef = undefined as unknown;
    expect(validateComparisonResponse(undef)).toBe(false);
  });

  it('returns false when season_id is missing', () => {
    const { season_id, ...rest } = validResponse;
    void season_id; // Suppress unused variable warning
    expect(validateComparisonResponse(rest)).toBe(false);
  });

  it('returns false when season_id is not a number', () => {
    const data = { ...validResponse, season_id: '1' };
    expect(validateComparisonResponse(data)).toBe(false);
  });

  it('returns false when manager_a is missing', () => {
    const { manager_a, ...rest } = validResponse;
    void manager_a;
    expect(validateComparisonResponse(rest)).toBe(false);
  });

  it('returns false when manager_a is not an object', () => {
    const data = { ...validResponse, manager_a: 'not an object' };
    expect(validateComparisonResponse(data)).toBe(false);
  });

  it('returns false when manager_b is missing', () => {
    const { manager_b, ...rest } = validResponse;
    void manager_b;
    expect(validateComparisonResponse(rest)).toBe(false);
  });

  it('returns false when common_players is not an array', () => {
    const data = { ...validResponse, common_players: 'not array' };
    expect(validateComparisonResponse(data)).toBe(false);
  });

  it('returns false when head_to_head is missing', () => {
    const { head_to_head, ...rest } = validResponse;
    void head_to_head;
    expect(validateComparisonResponse(rest)).toBe(false);
  });

  it('returns false when head_to_head is not an object', () => {
    const data = { ...validResponse, head_to_head: 'not an object' };
    expect(validateComparisonResponse(data)).toBe(false);
  });

  it('returns false when manager_a lacks manager_id', () => {
    const { manager_id, ...managerWithoutId } = validManagerStats;
    void manager_id;
    const data = { ...validResponse, manager_a: managerWithoutId };
    expect(validateComparisonResponse(data)).toBe(false);
  });

  it('returns false when manager_a.manager_id is not a number', () => {
    const data = {
      ...validResponse,
      manager_a: { ...validManagerStats, manager_id: '1001' },
    };
    expect(validateComparisonResponse(data)).toBe(false);
  });

  it('returns false when manager_a lacks total_points', () => {
    const { total_points, ...managerWithoutPoints } = validManagerStats;
    void total_points;
    const data = { ...validResponse, manager_a: managerWithoutPoints };
    expect(validateComparisonResponse(data)).toBe(false);
  });

  it('returns false when manager_a.total_points is not a number', () => {
    const data = {
      ...validResponse,
      manager_a: { ...validManagerStats, total_points: '1500' },
    };
    expect(validateComparisonResponse(data)).toBe(false);
  });

  it('returns false when manager_a lacks starting_xi', () => {
    const { starting_xi, ...managerWithoutXI } = validManagerStats;
    void starting_xi;
    const data = { ...validResponse, manager_a: managerWithoutXI };
    expect(validateComparisonResponse(data)).toBe(false);
  });

  it('returns false when manager_a.starting_xi is not an array', () => {
    const data = {
      ...validResponse,
      manager_a: { ...validManagerStats, starting_xi: 'not array' },
    };
    expect(validateComparisonResponse(data)).toBe(false);
  });
});

describe('validateLeagueDashboardResponse', () => {
  const validResponse = {
    league_id: 242017,
    gameweek: 21,
    season_id: 1,
    managers: [
      {
        entry_id: 123,
        manager_name: 'John Doe',
        team_name: 'FC Test',
        total_points: 1250,
        gw_points: 65,
        rank: 1,
        last_rank: 2,
        overall_rank: 50000,
        last_overall_rank: null,
        bank: 0.5,
        team_value: 102.3,
        transfers_made: 1,
        transfer_cost: 0,
        total_hits_cost: 4,
        chip_active: null,
        picks: [
          {
            position: 1,
            player_id: 427,
            player_name: 'Salah',
            team_id: 11,
            team_short_name: 'LIV',
            element_type: 3,
            is_captain: true,
            is_vice_captain: false,
            multiplier: 2,
            now_cost: 130,
            form: 8.5,
            points_per_game: 7.2,
            selected_by_percent: 45.3,
          },
        ],
        chips_used: ['wildcard_1'],
        transfers: [],
      },
    ],
  };

  it('returns true for valid response', () => {
    expect(validateLeagueDashboardResponse(validResponse)).toBe(true);
  });

  it('returns true for empty managers array', () => {
    const data = { ...validResponse, managers: [] };
    expect(validateLeagueDashboardResponse(data)).toBe(true);
  });

  it('returns false for null input', () => {
    expect(validateLeagueDashboardResponse(null)).toBe(false);
  });

  it('returns false for undefined input', () => {
    const undef = undefined as unknown;
    expect(validateLeagueDashboardResponse(undef)).toBe(false);
  });

  it('returns false when league_id is missing', () => {
    const { league_id, ...data } = validResponse;
    void league_id;
    expect(validateLeagueDashboardResponse(data)).toBe(false);
  });

  it('returns false when league_id is not a number', () => {
    const data = { ...validResponse, league_id: '242017' };
    expect(validateLeagueDashboardResponse(data)).toBe(false);
  });

  it('returns false when gameweek is missing', () => {
    const { gameweek, ...data } = validResponse;
    void gameweek;
    expect(validateLeagueDashboardResponse(data)).toBe(false);
  });

  it('returns false when gameweek is not a number', () => {
    const data = { ...validResponse, gameweek: '21' };
    expect(validateLeagueDashboardResponse(data)).toBe(false);
  });

  it('returns false when season_id is missing', () => {
    const { season_id, ...data } = validResponse;
    void season_id;
    expect(validateLeagueDashboardResponse(data)).toBe(false);
  });

  it('returns false when season_id is not a number', () => {
    const data = { ...validResponse, season_id: '1' };
    expect(validateLeagueDashboardResponse(data)).toBe(false);
  });

  it('returns false when managers is not an array', () => {
    const data = { ...validResponse, managers: 'not an array' };
    expect(validateLeagueDashboardResponse(data)).toBe(false);
  });

  it('returns false when managers is missing', () => {
    const { managers, ...data } = validResponse;
    void managers;
    expect(validateLeagueDashboardResponse(data)).toBe(false);
  });

  it('returns false when first manager lacks entry_id', () => {
    const { entry_id, ...managerWithoutId } = validResponse.managers[0];
    void entry_id;
    const data = { ...validResponse, managers: [managerWithoutId] };
    expect(validateLeagueDashboardResponse(data)).toBe(false);
  });

  it('returns false when first manager entry_id is not a number', () => {
    const data = {
      ...validResponse,
      managers: [{ ...validResponse.managers[0], entry_id: '123' }],
    };
    expect(validateLeagueDashboardResponse(data)).toBe(false);
  });

  it('returns false when first manager lacks picks array', () => {
    const { picks, ...managerWithoutPicks } = validResponse.managers[0];
    void picks;
    const data = { ...validResponse, managers: [managerWithoutPicks] };
    expect(validateLeagueDashboardResponse(data)).toBe(false);
  });

  it('returns false when first manager picks is not an array', () => {
    const data = {
      ...validResponse,
      managers: [{ ...validResponse.managers[0], picks: 'not an array' }],
    };
    expect(validateLeagueDashboardResponse(data)).toBe(false);
  });
});
