import { describe, it, expect } from 'vitest';

import {
  calculateProvisionalBonus,
  calculateLivePoints,
  isFixtureLive,
  hasGamesInProgress,
  allFixturesFinished,
  hasAnyFixtureStarted,
  shouldShowProvisionalBonus,
} from './liveScoring';

import type { Fixture, LivePlayer } from 'types/fpl';

describe('calculateProvisionalBonus', () => {
  it('should award 3, 2, 1 bonus to top 3 BPS scores', () => {
    const bpsScores = [
      { playerId: 1, bps: 50 },
      { playerId: 2, bps: 40 },
      { playerId: 3, bps: 30 },
      { playerId: 4, bps: 20 },
    ];

    const result = calculateProvisionalBonus(bpsScores);

    expect(result.get(1)).toBe(3);
    expect(result.get(2)).toBe(2);
    expect(result.get(3)).toBe(1);
    expect(result.get(4)).toBeUndefined();
  });

  it('should handle tie for first place (both get 3, third gets 1)', () => {
    const bpsScores = [
      { playerId: 1, bps: 50 },
      { playerId: 2, bps: 50 },
      { playerId: 3, bps: 30 },
    ];

    const result = calculateProvisionalBonus(bpsScores);

    expect(result.get(1)).toBe(3);
    expect(result.get(2)).toBe(3);
    expect(result.get(3)).toBe(1);
  });

  it('should handle tie for second place (first gets 3, tied get 2)', () => {
    const bpsScores = [
      { playerId: 1, bps: 50 },
      { playerId: 2, bps: 40 },
      { playerId: 3, bps: 40 },
    ];

    const result = calculateProvisionalBonus(bpsScores);

    expect(result.get(1)).toBe(3);
    expect(result.get(2)).toBe(2);
    expect(result.get(3)).toBe(2);
  });

  it('should handle tie for third place (first 3, second 2, tied thirds get 1)', () => {
    const bpsScores = [
      { playerId: 1, bps: 50 },
      { playerId: 2, bps: 40 },
      { playerId: 3, bps: 30 },
      { playerId: 4, bps: 30 },
    ];

    const result = calculateProvisionalBonus(bpsScores);

    expect(result.get(1)).toBe(3);
    expect(result.get(2)).toBe(2);
    expect(result.get(3)).toBe(1);
    expect(result.get(4)).toBe(1);
  });

  it('should handle three-way tie for first (all get 3)', () => {
    const bpsScores = [
      { playerId: 1, bps: 50 },
      { playerId: 2, bps: 50 },
      { playerId: 3, bps: 50 },
    ];

    const result = calculateProvisionalBonus(bpsScores);

    expect(result.get(1)).toBe(3);
    expect(result.get(2)).toBe(3);
    expect(result.get(3)).toBe(3);
  });

  it('should return empty map for empty input', () => {
    const result = calculateProvisionalBonus([]);
    expect(result.size).toBe(0);
  });

  it('should handle single player', () => {
    const bpsScores = [{ playerId: 1, bps: 50 }];

    const result = calculateProvisionalBonus(bpsScores);

    expect(result.get(1)).toBe(3);
  });

  it('should handle two players', () => {
    const bpsScores = [
      { playerId: 1, bps: 50 },
      { playerId: 2, bps: 40 },
    ];

    const result = calculateProvisionalBonus(bpsScores);

    expect(result.get(1)).toBe(3);
    expect(result.get(2)).toBe(2);
  });
});

describe('calculateLivePoints', () => {
  it('should calculate total points from live player stats', () => {
    const livePlayer: LivePlayer = {
      id: 1,
      stats: {
        minutes: 90,
        goals_scored: 2,
        assists: 1,
        clean_sheets: 0,
        goals_conceded: 2,
        own_goals: 0,
        penalties_saved: 0,
        penalties_missed: 0,
        yellow_cards: 0,
        red_cards: 0,
        saves: 0,
        bonus: 0,
        bps: 50,
        influence: '50.0',
        creativity: '30.0',
        threat: '40.0',
        ict_index: '12.0',
        total_points: 15,
        in_dreamteam: false,
      },
      explain: [],
    };

    // total_points from API already includes base points, should use that
    const result = calculateLivePoints(livePlayer, 1); // multiplier 1

    expect(result).toBe(15);
  });

  it('should apply captain multiplier (2x)', () => {
    const livePlayer: LivePlayer = {
      id: 1,
      stats: {
        minutes: 90,
        goals_scored: 1,
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
        bps: 30,
        influence: '30.0',
        creativity: '20.0',
        threat: '30.0',
        ict_index: '8.0',
        total_points: 8,
        in_dreamteam: false,
      },
      explain: [],
    };

    const result = calculateLivePoints(livePlayer, 2); // captain

    expect(result).toBe(16); // 8 * 2
  });

  it('should apply triple captain multiplier (3x)', () => {
    const livePlayer: LivePlayer = {
      id: 1,
      stats: {
        minutes: 90,
        goals_scored: 1,
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
        bps: 30,
        influence: '30.0',
        creativity: '20.0',
        threat: '30.0',
        ict_index: '8.0',
        total_points: 8,
        in_dreamteam: false,
      },
      explain: [],
    };

    const result = calculateLivePoints(livePlayer, 3); // triple captain

    expect(result).toBe(24); // 8 * 3
  });
});

describe('isFixtureLive', () => {
  it('should return true when fixture has started but not finished', () => {
    const fixture: Partial<Fixture> = {
      started: true,
      finished: false,
      finished_provisional: false,
    };

    expect(isFixtureLive(fixture as Fixture)).toBe(true);
  });

  it('should return false when fixture has not started', () => {
    const fixture: Partial<Fixture> = {
      started: false,
      finished: false,
      finished_provisional: false,
    };

    expect(isFixtureLive(fixture as Fixture)).toBe(false);
  });

  it('should return false when fixture is finished', () => {
    const fixture: Partial<Fixture> = {
      started: true,
      finished: true,
      finished_provisional: true,
    };

    expect(isFixtureLive(fixture as Fixture)).toBe(false);
  });

  it('should return false when fixture is provisionally finished', () => {
    const fixture: Partial<Fixture> = {
      started: true,
      finished: false,
      finished_provisional: true,
    };

    expect(isFixtureLive(fixture as Fixture)).toBe(false);
  });
});

describe('shouldShowProvisionalBonus', () => {
  it('should return true when fixture has started and minutes >= 60', () => {
    const fixture: Partial<Fixture> = {
      started: true,
      finished: false,
      minutes: 65,
    };

    expect(shouldShowProvisionalBonus(fixture as Fixture)).toBe(true);
  });

  it('should return false when fixture has started but minutes < 60', () => {
    const fixture: Partial<Fixture> = {
      started: true,
      finished: false,
      minutes: 45,
    };

    expect(shouldShowProvisionalBonus(fixture as Fixture)).toBe(false);
  });

  it('should return true when fixture is finished (bonus is confirmed)', () => {
    const fixture: Partial<Fixture> = {
      started: true,
      finished: true,
      minutes: 90,
    };

    expect(shouldShowProvisionalBonus(fixture as Fixture)).toBe(true);
  });

  it('should return false when fixture has not started', () => {
    const fixture: Partial<Fixture> = {
      started: false,
      finished: false,
      minutes: 0,
    };

    expect(shouldShowProvisionalBonus(fixture as Fixture)).toBe(false);
  });
});

describe('hasGamesInProgress', () => {
  const makeFixture = (started: boolean, finished_provisional: boolean): Fixture =>
    ({ started, finished_provisional }) as Fixture;

  it('should return true when any fixture is in progress', () => {
    const fixtures = [
      makeFixture(true, false), // in progress
      makeFixture(true, true), // finished
    ];
    expect(hasGamesInProgress(fixtures)).toBe(true);
  });

  it('should return false when all fixtures are finished', () => {
    const fixtures = [makeFixture(true, true), makeFixture(true, true)];
    expect(hasGamesInProgress(fixtures)).toBe(false);
  });

  it('should return false when no fixtures have started', () => {
    const fixtures = [makeFixture(false, false), makeFixture(false, false)];
    expect(hasGamesInProgress(fixtures)).toBe(false);
  });

  it('should return false for empty array', () => {
    expect(hasGamesInProgress([])).toBe(false);
  });
});

describe('allFixturesFinished', () => {
  const makeFixture = (finished_provisional: boolean): Fixture =>
    ({ finished_provisional }) as Fixture;

  it('should return true when all fixtures are finished', () => {
    const fixtures = [makeFixture(true), makeFixture(true)];
    expect(allFixturesFinished(fixtures)).toBe(true);
  });

  it('should return false when any fixture is not finished', () => {
    const fixtures = [makeFixture(true), makeFixture(false)];
    expect(allFixturesFinished(fixtures)).toBe(false);
  });

  it('should return false for empty array', () => {
    expect(allFixturesFinished([])).toBe(false);
  });
});

describe('hasAnyFixtureStarted', () => {
  const makeFixture = (started: boolean): Fixture => ({ started }) as Fixture;

  it('should return true when any fixture has started', () => {
    const fixtures = [makeFixture(false), makeFixture(true)];
    expect(hasAnyFixtureStarted(fixtures)).toBe(true);
  });

  it('should return false when no fixtures have started', () => {
    const fixtures = [makeFixture(false), makeFixture(false)];
    expect(hasAnyFixtureStarted(fixtures)).toBe(false);
  });

  it('should return false for empty array', () => {
    expect(hasAnyFixtureStarted([])).toBe(false);
  });
});
