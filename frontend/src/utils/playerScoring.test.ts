import { describe, it, expect } from 'vitest';

import { POSITION_TYPES } from 'constants/positions';

import {
  isEligibleOutfieldPlayer,
  calculatePlayerStats,
  getPercentile,
  calculatePlayerPercentiles,
  calculateBuyScore,
  calculateSellScore,
  calculateFixtureScore,
  calculateLeagueOwnership,
  PUNT_WEIGHTS,
  DEFENSIVE_WEIGHTS,
  SELL_WEIGHTS,
  FIXTURE_WEIGHTS,
  type PlayerStats,
  type PlayerPercentiles,
  type PercentilesData,
} from './playerScoring';

import type { Player, Fixture } from 'types/fpl';

// ============================================================================
// Test Helpers
// ============================================================================

const makePlayer = (overrides: Partial<Player> = {}): Player =>
  ({
    id: 1,
    web_name: 'Test',
    team: 1,
    element_type: POSITION_TYPES.MIDFIELDER,
    status: 'a',
    minutes: 900,
    form: '5.0',
    expected_goals: '4.5',
    expected_assists: '2.7',
    expected_goals_conceded: '0.9',
    clean_sheets: 3,
    goals_scored: 5,
    assists: 3,
    ...overrides,
  }) as Player;

const makeFixture = (
  event: number | null,
  teamH: number,
  teamA: number,
  teamHDiff: number,
  teamADiff: number
): Fixture =>
  ({
    id: Math.random(),
    event,
    team_h: teamH,
    team_a: teamA,
    team_h_difficulty: teamHDiff,
    team_a_difficulty: teamADiff,
    started: false,
    finished: false,
    finished_provisional: false,
    kickoff_time: '2025-01-01T15:00:00Z',
  }) as Fixture;

// ============================================================================
// isEligibleOutfieldPlayer
// ============================================================================

describe('isEligibleOutfieldPlayer', () => {
  it('returns true for available midfielder with enough minutes', () => {
    const player = makePlayer({
      element_type: POSITION_TYPES.MIDFIELDER,
      status: 'a',
      minutes: 450,
    });
    expect(isEligibleOutfieldPlayer(player)).toBe(true);
  });

  it('returns true for available defender with enough minutes', () => {
    const player = makePlayer({
      element_type: POSITION_TYPES.DEFENDER,
      status: 'a',
      minutes: 900,
    });
    expect(isEligibleOutfieldPlayer(player)).toBe(true);
  });

  it('returns true for available forward with enough minutes', () => {
    const player = makePlayer({
      element_type: POSITION_TYPES.FORWARD,
      status: 'a',
      minutes: 500,
    });
    expect(isEligibleOutfieldPlayer(player)).toBe(true);
  });

  it('returns false for goalkeeper', () => {
    const player = makePlayer({
      element_type: POSITION_TYPES.GOALKEEPER,
      status: 'a',
      minutes: 900,
    });
    expect(isEligibleOutfieldPlayer(player)).toBe(false);
  });

  it('returns false for unavailable player (injured)', () => {
    const player = makePlayer({ status: 'i', minutes: 900 });
    expect(isEligibleOutfieldPlayer(player)).toBe(false);
  });

  it('returns false for unavailable player (doubtful)', () => {
    const player = makePlayer({ status: 'd', minutes: 900 });
    expect(isEligibleOutfieldPlayer(player)).toBe(false);
  });

  it('returns false for unavailable player (suspended)', () => {
    const player = makePlayer({ status: 's', minutes: 900 });
    expect(isEligibleOutfieldPlayer(player)).toBe(false);
  });

  it('returns false for player with less than 450 minutes', () => {
    const player = makePlayer({ status: 'a', minutes: 449 });
    expect(isEligibleOutfieldPlayer(player)).toBe(false);
  });

  it('returns true for player with exactly 450 minutes', () => {
    const player = makePlayer({ status: 'a', minutes: 450 });
    expect(isEligibleOutfieldPlayer(player)).toBe(true);
  });
});

// ============================================================================
// calculatePlayerStats
// ============================================================================

describe('calculatePlayerStats', () => {
  it('calculates per-90 stats correctly', () => {
    // 900 minutes = 10 x 90
    const player = makePlayer({
      minutes: 900,
      expected_goals: '5.0', // 5.0 / 10 = 0.5 per 90
      expected_assists: '3.0', // 3.0 / 10 = 0.3 per 90
      expected_goals_conceded: '10.0', // 10.0 / 10 = 1.0 per 90
      clean_sheets: 4, // 4 / 10 = 0.4 per 90
      form: '6.5',
    });
    const stats = calculatePlayerStats(player);

    expect(stats.xG90).toBeCloseTo(0.5, 2);
    expect(stats.xA90).toBeCloseTo(0.3, 2);
    expect(stats.xGC90).toBeCloseTo(1.0, 2);
    expect(stats.cs90).toBeCloseTo(0.4, 2);
    expect(stats.form).toBe(6.5);
  });

  it('returns zeros for player with 0 minutes', () => {
    const player = makePlayer({
      minutes: 0,
      expected_goals: '5.0',
      expected_assists: '3.0',
      expected_goals_conceded: '10.0',
      clean_sheets: 4,
      form: '0.0',
    });
    const stats = calculatePlayerStats(player);

    expect(stats.xG90).toBe(0);
    expect(stats.xA90).toBe(0);
    expect(stats.xGC90).toBe(0);
    expect(stats.cs90).toBe(0);
    expect(stats.form).toBe(0);
  });

  it('handles string form values', () => {
    const player = makePlayer({ form: '7.8' });
    const stats = calculatePlayerStats(player);
    expect(stats.form).toBe(7.8);
  });
});

// ============================================================================
// getPercentile
// ============================================================================

describe('getPercentile', () => {
  it('returns 0.5 for empty array', () => {
    expect(getPercentile(5, [])).toBe(0.5);
  });

  it('returns 0 for value at minimum', () => {
    expect(getPercentile(1, [1, 2, 3, 4, 5])).toBe(0);
  });

  it('returns correct percentile for value in middle', () => {
    // 3 is greater than 2 values (1, 2) out of 5 = 0.4
    expect(getPercentile(3, [1, 2, 3, 4, 5])).toBe(0.4);
  });

  it('returns high percentile for value at maximum', () => {
    // 5 is greater than 4 values out of 5 = 0.8
    expect(getPercentile(5, [1, 2, 3, 4, 5])).toBe(0.8);
  });

  it('handles duplicate values', () => {
    expect(getPercentile(3, [1, 2, 3, 3, 5])).toBe(0.4);
  });

  it('returns 0 for value below all values', () => {
    expect(getPercentile(0, [1, 2, 3, 4, 5])).toBe(0);
  });

  it('returns 1.0 for value above all values', () => {
    expect(getPercentile(10, [1, 2, 3, 4, 5])).toBe(1);
  });

  it('handles single value array', () => {
    expect(getPercentile(5, [5])).toBe(0);
    expect(getPercentile(10, [5])).toBe(1);
  });

  it('handles negative values', () => {
    expect(getPercentile(-1, [-2, -1, 0])).toBeCloseTo(0.333, 2);
  });

  it('handles unsorted input array', () => {
    expect(getPercentile(3, [5, 1, 3, 2, 4])).toBe(0.4);
  });
});

// ============================================================================
// calculatePlayerPercentiles
// ============================================================================

describe('calculatePlayerPercentiles', () => {
  const percentiles: PercentilesData = {
    xG90: [0.1, 0.2, 0.3, 0.4, 0.5],
    xA90: [0.05, 0.1, 0.15, 0.2, 0.25],
    xGC90: [0.5, 1.0, 1.5, 2.0, 2.5],
    cs90: [0.1, 0.2, 0.3, 0.4, 0.5],
    form: [2, 4, 5, 6, 8],
  };

  it('calculates percentiles correctly without xGC inversion', () => {
    const stats: PlayerStats = {
      xG90: 0.3, // at 40th percentile
      xA90: 0.15, // at 40th percentile
      xGC90: 1.5, // at 40th percentile
      cs90: 0.3, // at 40th percentile
      form: 5, // at 40th percentile
    };

    const result = calculatePlayerPercentiles(stats, percentiles, false);

    expect(result.xG90Pct).toBe(0.4);
    expect(result.xA90Pct).toBe(0.4);
    expect(result.xGC90Pct).toBe(0.4); // not inverted
    expect(result.cs90Pct).toBe(0.4);
    expect(result.formPct).toBe(0.4);
  });

  it('inverts xGC percentile when invertXGC is true', () => {
    const stats: PlayerStats = {
      xG90: 0.3,
      xA90: 0.15,
      xGC90: 1.5, // 40th percentile, inverted = 60th
      cs90: 0.3,
      form: 5,
    };

    const result = calculatePlayerPercentiles(stats, percentiles, true);

    expect(result.xGC90Pct).toBe(0.6); // 1 - 0.4 = 0.6
  });

  it('handles top percentile values', () => {
    const stats: PlayerStats = {
      xG90: 0.6, // above all = 100th percentile
      xA90: 0.3,
      xGC90: 0.2, // below all = 0th percentile
      cs90: 0.6,
      form: 10,
    };

    const result = calculatePlayerPercentiles(stats, percentiles, false);

    expect(result.xG90Pct).toBe(1);
    expect(result.xGC90Pct).toBe(0);
  });
});

// ============================================================================
// calculateBuyScore
// ============================================================================

describe('calculateBuyScore', () => {
  it('returns weighted sum of percentiles and fixture score', () => {
    const pct: PlayerPercentiles = {
      xG90Pct: 0.8,
      xA90Pct: 0.7,
      xGC90Pct: 0.6,
      cs90Pct: 0.5,
      formPct: 0.9,
    };
    const weights = PUNT_WEIGHTS[3]; // MID: xG:0.2, xA:0.2, xGC:0, cs:0, form:0.25, fix:0.15

    const score = calculateBuyScore(pct, weights, 0.75);

    // (0.8 * 0.2) + (0.7 * 0.2) + (0.6 * 0) + (0.5 * 0) + (0.9 * 0.25) + (0.75 * 0.15)
    // = 0.16 + 0.14 + 0 + 0 + 0.225 + 0.1125 = 0.6375
    expect(score).toBeCloseTo(0.6375, 4);
  });

  it('uses DEF weights for defenders', () => {
    const pct: PlayerPercentiles = {
      xG90Pct: 0.5,
      xA90Pct: 0.5,
      xGC90Pct: 0.8, // good for DEF (low xGC)
      cs90Pct: 0.9, // good for DEF
      formPct: 0.7,
    };
    const weights = PUNT_WEIGHTS[2]; // DEF: xG:0.1, xA:0.1, xGC:0.2, cs:0.15, form:0.25, fix:0.2

    const score = calculateBuyScore(pct, weights, 0.6);

    // (0.5 * 0.1) + (0.5 * 0.1) + (0.8 * 0.2) + (0.9 * 0.15) + (0.7 * 0.25) + (0.6 * 0.2)
    // = 0.05 + 0.05 + 0.16 + 0.135 + 0.175 + 0.12 = 0.69
    expect(score).toBeCloseTo(0.69, 4);
  });

  it('uses FWD weights for forwards', () => {
    const pct: PlayerPercentiles = {
      xG90Pct: 0.95, // very important for FWD
      xA90Pct: 0.6,
      xGC90Pct: 0.5,
      cs90Pct: 0.5,
      formPct: 0.8,
    };
    const weights = PUNT_WEIGHTS[4]; // FWD: xG:0.35, xA:0.1, xGC:0, cs:0, form:0.3, fix:0.15

    const score = calculateBuyScore(pct, weights, 0.5);

    // (0.95 * 0.35) + (0.6 * 0.1) + 0 + 0 + (0.8 * 0.3) + (0.5 * 0.15)
    // = 0.3325 + 0.06 + 0.24 + 0.075 = 0.7075
    expect(score).toBeCloseTo(0.7075, 4);
  });

  it('returns 0 for all-zero percentiles with zero fixture score', () => {
    const pct: PlayerPercentiles = {
      xG90Pct: 0,
      xA90Pct: 0,
      xGC90Pct: 0,
      cs90Pct: 0,
      formPct: 0,
    };

    const score = calculateBuyScore(pct, PUNT_WEIGHTS[3], 0);
    expect(score).toBe(0);
  });

  it('returns sum of all weights for all-1.0 percentiles', () => {
    const pct: PlayerPercentiles = {
      xG90Pct: 1,
      xA90Pct: 1,
      xGC90Pct: 1,
      cs90Pct: 1,
      formPct: 1,
    };
    // MID weights: 0.2 + 0.2 + 0 + 0 + 0.25 + 0.15 = 0.8 (not including xGC and cs)
    // MID weights that apply: xG:0.2, xA:0.2, form:0.25, fix:0.15 = 0.8
    const score = calculateBuyScore(pct, PUNT_WEIGHTS[3], 1);

    // All weights: 0.2 + 0.2 + 0 + 0 + 0.25 + 0.15 = 0.8
    expect(score).toBeCloseTo(0.8, 4);
  });
});

// ============================================================================
// calculateSellScore
// ============================================================================

describe('calculateSellScore', () => {
  it('inverts percentiles for sell score', () => {
    const pct: PlayerPercentiles = {
      xG90Pct: 0.2, // bad xG → (1 - 0.2) = 0.8 contribution
      xA90Pct: 0.3, // bad xA → (1 - 0.3) = 0.7 contribution
      xGC90Pct: 0.8, // bad (high xGC) → 0.8 contribution (not inverted)
      cs90Pct: 0.2, // bad CS → (1 - 0.2) = 0.8 contribution
      formPct: 0.1, // bad form → (1 - 0.1) = 0.9 contribution
    };
    const weights = SELL_WEIGHTS[3]; // MID: xG:0.15, xA:0.15, xGC:0, cs:0, form:0.65, fix:0.05

    const score = calculateSellScore(pct, weights, 0.8); // good fixtures → (1 - 0.8) = 0.2

    // (0.8 * 0.15) + (0.7 * 0.15) + 0 + 0 + (0.9 * 0.65) + (0.2 * 0.05)
    // = 0.12 + 0.105 + 0.585 + 0.01 = 0.82
    expect(score).toBeCloseTo(0.82, 4);
  });

  it('returns low score for good player (should NOT sell)', () => {
    const pct: PlayerPercentiles = {
      xG90Pct: 0.9, // great xG → (1 - 0.9) = 0.1 contribution
      xA90Pct: 0.85,
      xGC90Pct: 0.1, // good (low xGC)
      cs90Pct: 0.9,
      formPct: 0.95, // great form
    };

    const score = calculateSellScore(pct, SELL_WEIGHTS[3], 0.7);
    // Low score means don't sell
    expect(score).toBeLessThan(0.3);
  });

  it('returns high score for bad player (SHOULD sell)', () => {
    const pct: PlayerPercentiles = {
      xG90Pct: 0.1, // terrible xG
      xA90Pct: 0.15,
      xGC90Pct: 0.9, // bad (high xGC)
      cs90Pct: 0.1,
      formPct: 0.05, // terrible form
    };

    const score = calculateSellScore(pct, SELL_WEIGHTS[3], 0.2);
    // High score means sell
    expect(score).toBeGreaterThan(0.8);
  });
});

// ============================================================================
// calculateFixtureScore
// ============================================================================

describe('calculateFixtureScore', () => {
  it('returns 0.5 when no upcoming fixtures', () => {
    expect(calculateFixtureScore(1, [], 17)).toBe(0.5);
  });

  it('returns 0.5 when all fixtures are in past', () => {
    const fixtures = [makeFixture(15, 1, 2, 3, 3), makeFixture(16, 3, 1, 3, 3)];
    expect(calculateFixtureScore(1, fixtures, 17)).toBe(0.5);
  });

  it('calculates score for home fixture', () => {
    // Team 1 at home, difficulty 1 (easiest) = ease score 1.0
    const fixtures = [makeFixture(18, 1, 2, 1, 5)];
    const score = calculateFixtureScore(1, fixtures, 17);
    expect(score).toBeCloseTo(0.35, 2); // 1.0 * 0.35
  });

  it('calculates score for away fixture', () => {
    // Team 1 away, difficulty 5 (hardest) = ease score 0.0
    const fixtures = [makeFixture(18, 2, 1, 1, 5)];
    const score = calculateFixtureScore(1, fixtures, 17);
    expect(score).toBeCloseTo(0, 2);
  });

  it('weighs nearer fixtures more heavily', () => {
    const fixtures = [
      makeFixture(18, 1, 2, 5, 1), // home, hard
      makeFixture(22, 1, 3, 1, 5), // home, easy
    ];
    const score = calculateFixtureScore(1, fixtures, 17);
    expect(score).toBeCloseTo(0.25, 2);
  });

  it('ignores fixtures beyond 5 gameweeks', () => {
    const fixtures = [
      makeFixture(18, 1, 2, 1, 5), // included
      makeFixture(23, 1, 3, 5, 1), // excluded (GW 23 > 17 + 5)
    ];
    const score = calculateFixtureScore(1, fixtures, 17);
    expect(score).toBeCloseTo(0.35, 2);
  });

  it('handles null event values', () => {
    const fixtures = [makeFixture(null, 1, 2, 3, 3), makeFixture(18, 1, 3, 1, 5)];
    const score = calculateFixtureScore(1, fixtures, 17);
    expect(score).toBeCloseTo(0.35, 2);
  });

  it('calculates full 5-fixture run correctly', () => {
    const fixtures = [
      makeFixture(18, 1, 2, 3, 3),
      makeFixture(19, 1, 3, 3, 3),
      makeFixture(20, 1, 4, 3, 3),
      makeFixture(21, 1, 5, 3, 3),
      makeFixture(22, 1, 6, 3, 3),
    ];
    const score = calculateFixtureScore(1, fixtures, 17);
    expect(score).toBeCloseTo(0.5, 2);
  });
});

// ============================================================================
// calculateLeagueOwnership
// ============================================================================

describe('calculateLeagueOwnership', () => {
  const makeManager = (id: number, playerIds: number[]) => ({
    entry: id,
    picks: playerIds.map((pid) => ({ playerId: pid })),
  });

  it('returns empty map for empty managers', () => {
    const players = [makePlayer({ id: 1 }), makePlayer({ id: 2 })];
    const result = calculateLeagueOwnership(players, []);
    expect(result.size).toBe(0);
  });

  it('returns 1.0 for player owned by all managers', () => {
    const players = [makePlayer({ id: 1 })];
    const managers = [makeManager(1, [1]), makeManager(2, [1]), makeManager(3, [1])];
    const result = calculateLeagueOwnership(players, managers);
    expect(result.get(1)).toBe(1);
  });

  it('returns 0 for player owned by no managers', () => {
    const players = [makePlayer({ id: 1 }), makePlayer({ id: 2 })];
    const managers = [makeManager(1, [1]), makeManager(2, [1])];
    const result = calculateLeagueOwnership(players, managers);
    expect(result.get(2)).toBe(0);
  });

  it('calculates fractional ownership correctly', () => {
    const players = [makePlayer({ id: 1 })];
    const managers = [
      makeManager(1, [1]),
      makeManager(2, [1]),
      makeManager(3, [2]),
      makeManager(4, [2]),
    ];
    const result = calculateLeagueOwnership(players, managers);
    expect(result.get(1)).toBe(0.5);
  });

  it('handles single manager', () => {
    const players = [makePlayer({ id: 1 }), makePlayer({ id: 2 })];
    const managers = [makeManager(1, [1])];
    const result = calculateLeagueOwnership(players, managers);
    expect(result.get(1)).toBe(1);
    expect(result.get(2)).toBe(0);
  });

  it('handles multiple players per manager', () => {
    const players = [makePlayer({ id: 1 }), makePlayer({ id: 2 }), makePlayer({ id: 3 })];
    const managers = [makeManager(1, [1, 2, 3]), makeManager(2, [1, 2])];
    const result = calculateLeagueOwnership(players, managers);
    expect(result.get(1)).toBe(1);
    expect(result.get(2)).toBe(1);
    expect(result.get(3)).toBe(0.5);
  });
});

// ============================================================================
// Weight Config Validation
// ============================================================================

describe('Weight configurations', () => {
  // Note: MID/FWD weights intentionally don't sum to 1.0 because they don't use
  // defensive stats (xGC=0, cs=0). Only DEF uses all six weight dimensions.

  it('PUNT_WEIGHTS has correct structure for all positions', () => {
    // DEF uses all weights including xGC and cs
    expect(PUNT_WEIGHTS[2].xGC).toBe(0.2);
    expect(PUNT_WEIGHTS[2].cs).toBe(0.15);

    // MID/FWD don't use defensive stats
    expect(PUNT_WEIGHTS[3].xGC).toBe(0);
    expect(PUNT_WEIGHTS[3].cs).toBe(0);
    expect(PUNT_WEIGHTS[4].xGC).toBe(0);
    expect(PUNT_WEIGHTS[4].cs).toBe(0);

    // All positions have form and fixture weights
    for (const pos of [2, 3, 4]) {
      expect(PUNT_WEIGHTS[pos].form).toBeGreaterThan(0);
      expect(PUNT_WEIGHTS[pos].fix).toBeGreaterThan(0);
    }
  });

  it('DEFENSIVE_WEIGHTS has correct structure for all positions', () => {
    // DEF uses all weights
    expect(DEFENSIVE_WEIGHTS[2].xGC).toBe(0.15);
    expect(DEFENSIVE_WEIGHTS[2].cs).toBe(0.15);

    // MID/FWD don't use defensive stats
    expect(DEFENSIVE_WEIGHTS[3].xGC).toBe(0);
    expect(DEFENSIVE_WEIGHTS[3].cs).toBe(0);
    expect(DEFENSIVE_WEIGHTS[4].xGC).toBe(0);
    expect(DEFENSIVE_WEIGHTS[4].cs).toBe(0);

    // Form is highest weight for defensive options
    for (const pos of [2, 3, 4]) {
      expect(DEFENSIVE_WEIGHTS[pos].form).toBeGreaterThanOrEqual(0.35);
    }
  });

  it('SELL_WEIGHTS prioritizes form over fixtures', () => {
    // Form should be dominant factor for sell recommendations
    for (const pos of [2, 3, 4]) {
      expect(SELL_WEIGHTS[pos].form).toBeGreaterThan(SELL_WEIGHTS[pos].fix);
      expect(SELL_WEIGHTS[pos].form).toBeGreaterThanOrEqual(0.55);
    }
  });

  it('FIXTURE_WEIGHTS sum to 1.0', () => {
    const sum = FIXTURE_WEIGHTS.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 2);
  });
});
