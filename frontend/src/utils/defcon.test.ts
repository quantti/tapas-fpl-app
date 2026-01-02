import { describe, it, expect } from 'vitest';

import {
  DEFCON_THRESHOLDS,
  DEFCON_BONUS_POINTS,
  isOutfieldPosition,
  getDefConThreshold,
  metDefConThreshold,
  calculatePlayerSeasonDefCon,
} from './defcon';

import type { PlayerHistory } from '../types/fpl';

// Helper to create mock PlayerHistory entry
function createMockHistory(overrides: Partial<PlayerHistory> = {}): PlayerHistory {
  return {
    element: 1,
    fixture: 1,
    opponent_team: 2,
    total_points: 6,
    was_home: true,
    kickoff_time: '2024-01-01T15:00:00Z',
    team_h_score: 2,
    team_a_score: 1,
    round: 1,
    minutes: 90,
    goals_scored: 0,
    assists: 0,
    clean_sheets: 0,
    goals_conceded: 0,
    own_goals: 0,
    penalties_saved: 0,
    penalties_missed: 0,
    yellow_cards: 0,
    red_cards: 0,
    saves: 0,
    bonus: 0,
    bps: 20,
    influence: '10.0',
    creativity: '10.0',
    threat: '10.0',
    ict_index: '30.0',
    value: 50,
    transfers_balance: 0,
    selected: 1000,
    transfers_in: 100,
    transfers_out: 50,
    defensive_contribution: 0,
    starts: 1,
    expected_goals: '0.1',
    expected_assists: '0.1',
    expected_goal_involvements: '0.2',
    expected_goals_conceded: '0.5',
    ...overrides,
  };
}

describe('DefCon Constants', () => {
  describe('DEFCON_THRESHOLDS', () => {
    it('has correct threshold for defenders (10)', () => {
      expect(DEFCON_THRESHOLDS[2]).toBe(10);
    });

    it('has correct threshold for midfielders (12)', () => {
      expect(DEFCON_THRESHOLDS[3]).toBe(12);
    });

    it('has correct threshold for forwards (12)', () => {
      expect(DEFCON_THRESHOLDS[4]).toBe(12);
    });
  });

  describe('DEFCON_BONUS_POINTS', () => {
    it('is 2 points', () => {
      expect(DEFCON_BONUS_POINTS).toBe(2);
    });
  });
});

describe('isOutfieldPosition', () => {
  it('returns false for goalkeeper (1)', () => {
    expect(isOutfieldPosition(1)).toBe(false);
  });

  it('returns true for defender (2)', () => {
    expect(isOutfieldPosition(2)).toBe(true);
  });

  it('returns true for midfielder (3)', () => {
    expect(isOutfieldPosition(3)).toBe(true);
  });

  it('returns true for forward (4)', () => {
    expect(isOutfieldPosition(4)).toBe(true);
  });

  it('returns false for invalid position (0)', () => {
    expect(isOutfieldPosition(0)).toBe(false);
  });

  it('returns false for invalid position (5)', () => {
    expect(isOutfieldPosition(5)).toBe(false);
  });
});

describe('getDefConThreshold', () => {
  it('returns null for goalkeeper (1)', () => {
    expect(getDefConThreshold(1)).toBeNull();
  });

  it('returns 10 for defender (2)', () => {
    expect(getDefConThreshold(2)).toBe(10);
  });

  it('returns 12 for midfielder (3)', () => {
    expect(getDefConThreshold(3)).toBe(12);
  });

  it('returns 12 for forward (4)', () => {
    expect(getDefConThreshold(4)).toBe(12);
  });

  it('returns null for invalid position', () => {
    expect(getDefConThreshold(0)).toBeNull();
    expect(getDefConThreshold(5)).toBeNull();
    expect(getDefConThreshold(-1)).toBeNull();
  });
});

describe('metDefConThreshold', () => {
  describe('for goalkeeper (1)', () => {
    it('always returns false regardless of defensive contribution', () => {
      expect(metDefConThreshold(0, 1)).toBe(false);
      expect(metDefConThreshold(10, 1)).toBe(false);
      expect(metDefConThreshold(20, 1)).toBe(false);
    });
  });

  describe('for defender (2) - threshold 10', () => {
    it('returns false when below threshold', () => {
      expect(metDefConThreshold(0, 2)).toBe(false);
      expect(metDefConThreshold(9, 2)).toBe(false);
    });

    it('returns true when at threshold', () => {
      expect(metDefConThreshold(10, 2)).toBe(true);
    });

    it('returns true when above threshold', () => {
      expect(metDefConThreshold(11, 2)).toBe(true);
      expect(metDefConThreshold(15, 2)).toBe(true);
    });
  });

  describe('for midfielder (3) - threshold 12', () => {
    it('returns false when below threshold', () => {
      expect(metDefConThreshold(0, 3)).toBe(false);
      expect(metDefConThreshold(11, 3)).toBe(false);
    });

    it('returns true when at threshold', () => {
      expect(metDefConThreshold(12, 3)).toBe(true);
    });

    it('returns true when above threshold', () => {
      expect(metDefConThreshold(13, 3)).toBe(true);
      expect(metDefConThreshold(20, 3)).toBe(true);
    });
  });

  describe('for forward (4) - threshold 12', () => {
    it('returns false when below threshold', () => {
      expect(metDefConThreshold(0, 4)).toBe(false);
      expect(metDefConThreshold(11, 4)).toBe(false);
    });

    it('returns true when at threshold', () => {
      expect(metDefConThreshold(12, 4)).toBe(true);
    });

    it('returns true when above threshold', () => {
      expect(metDefConThreshold(13, 4)).toBe(true);
    });
  });
});

describe('calculatePlayerSeasonDefCon', () => {
  describe('for goalkeeper', () => {
    it('returns zero values regardless of history', () => {
      const history = [
        createMockHistory({ defensive_contribution: 15 }),
        createMockHistory({ defensive_contribution: 20 }),
      ];

      const result = calculatePlayerSeasonDefCon(history, 1);

      expect(result.total).toBe(0);
      expect(result.games).toBe(0);
      expect(result.perGame).toBe(0);
    });
  });

  describe('for defender (threshold 10)', () => {
    it('returns zero for empty history', () => {
      const result = calculatePlayerSeasonDefCon([], 2);

      expect(result.total).toBe(0);
      expect(result.games).toBe(0);
      expect(result.perGame).toBe(0);
    });

    it('counts games meeting threshold correctly', () => {
      const history = [
        createMockHistory({ round: 1, defensive_contribution: 10 }), // meets
        createMockHistory({ round: 2, defensive_contribution: 9 }), // below
        createMockHistory({ round: 3, defensive_contribution: 15 }), // meets
        createMockHistory({ round: 4, defensive_contribution: 5 }), // below
        createMockHistory({ round: 5, defensive_contribution: 10 }), // meets
      ];

      const result = calculatePlayerSeasonDefCon(history, 2);

      expect(result.games).toBe(3); // 3 games met threshold
      expect(result.total).toBe(6); // 3 games * 2 points
      expect(result.perGame).toBeCloseTo(1.2); // 6 / 5 games
    });

    it('handles all games meeting threshold', () => {
      const history = [
        createMockHistory({ round: 1, defensive_contribution: 10 }),
        createMockHistory({ round: 2, defensive_contribution: 12 }),
        createMockHistory({ round: 3, defensive_contribution: 11 }),
      ];

      const result = calculatePlayerSeasonDefCon(history, 2);

      expect(result.games).toBe(3);
      expect(result.total).toBe(6);
      expect(result.perGame).toBe(2); // 6 / 3
    });

    it('handles no games meeting threshold', () => {
      const history = [
        createMockHistory({ round: 1, defensive_contribution: 5 }),
        createMockHistory({ round: 2, defensive_contribution: 8 }),
        createMockHistory({ round: 3, defensive_contribution: 9 }),
      ];

      const result = calculatePlayerSeasonDefCon(history, 2);

      expect(result.games).toBe(0);
      expect(result.total).toBe(0);
      expect(result.perGame).toBe(0);
    });

    it('handles undefined defensive_contribution as 0', () => {
      const history = [
        createMockHistory({ round: 1, defensive_contribution: undefined as unknown as number }),
        createMockHistory({ round: 2, defensive_contribution: 10 }),
      ];

      const result = calculatePlayerSeasonDefCon(history, 2);

      expect(result.games).toBe(1); // only GW2 meets threshold
      expect(result.total).toBe(2);
    });
  });

  describe('for midfielder (threshold 12)', () => {
    it('counts games with higher threshold correctly', () => {
      const history = [
        createMockHistory({ round: 1, defensive_contribution: 10 }), // below (12 threshold)
        createMockHistory({ round: 2, defensive_contribution: 12 }), // meets
        createMockHistory({ round: 3, defensive_contribution: 15 }), // meets
      ];

      const result = calculatePlayerSeasonDefCon(history, 3);

      expect(result.games).toBe(2); // 2 games met threshold
      expect(result.total).toBe(4); // 2 * 2 points
      expect(result.perGame).toBeCloseTo(1.33, 1); // 4 / 3
    });
  });

  describe('for forward (threshold 12)', () => {
    it('uses same threshold as midfielder', () => {
      const history = [
        createMockHistory({ round: 1, defensive_contribution: 11 }), // below
        createMockHistory({ round: 2, defensive_contribution: 12 }), // meets
      ];

      const result = calculatePlayerSeasonDefCon(history, 4);

      expect(result.games).toBe(1);
      expect(result.total).toBe(2);
      expect(result.perGame).toBe(1); // 2 / 2
    });
  });
});
