import { describe, expect, it } from 'vitest';

import {
  BackendApiError,
  validateLeagueChipsResponse,
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
    const data = { season_id: 1, teams: [{ team_id: 1, avg_per_match: 'ten' }] };
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
    const data = { league_id: 123, current_gameweek: 10, managers: 'not array' };
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
