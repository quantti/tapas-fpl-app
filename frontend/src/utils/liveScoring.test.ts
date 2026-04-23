import { describe, it, expect } from 'vitest';

import {
  calculateProvisionalBonus,
  calculateLivePoints,
  isFixtureLive,
  hasGamesInProgress,
  allFixturesFinished,
  hasAnyFixtureStarted,
  shouldShowProvisionalBonus,
  getFixtureBpsScores,
  buildProvisionalBonusMap,
  calculateLiveManagerPoints,
} from './liveScoring';

import type { ManagerPick } from 'services/queries/useFplData';
import type { Fixture, LiveGameweek, LivePlayer } from 'types/fpl';

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

describe('getFixtureBpsScores', () => {
  it('extracts per-fixture BPS for both home and away players', () => {
    const fixture = {
      id: 1,
      stats: [
        {
          identifier: 'bps',
          h: [
            { element: 100, value: 25 },
            { element: 101, value: 10 },
          ],
          a: [
            { element: 200, value: 30 },
            { element: 201, value: 5 },
          ],
        },
      ],
    } as Fixture;

    const result = getFixtureBpsScores(fixture);

    expect(result).toEqual(
      expect.arrayContaining([
        { playerId: 100, bps: 25 },
        { playerId: 101, bps: 10 },
        { playerId: 200, bps: 30 },
        { playerId: 201, bps: 5 },
      ])
    );
    expect(result).toHaveLength(4);
  });

  it('returns empty array when no bps stat present', () => {
    const fixture = {
      id: 1,
      stats: [{ identifier: 'goals_scored', h: [], a: [] }],
    } as unknown as Fixture;

    expect(getFixtureBpsScores(fixture)).toEqual([]);
  });

  it('returns empty array when fixture has no stats', () => {
    const fixture = { id: 1, stats: [] } as unknown as Fixture;
    expect(getFixtureBpsScores(fixture)).toEqual([]);
  });
});

describe('buildProvisionalBonusMap — DGW', () => {
  // Player X (id=100) plays BOTH fixtures (DGW). F1 BPS=10, F2 BPS=30. Aggregate=40.
  // Player Y (id=101) plays ONLY F1. BPS=25.
  // Player Z (id=200) plays ONLY F2. BPS=35.
  // Correct per-fixture result:
  //   F1: Y(25) > X(10) → Y=3, X=2
  //   F2: Z(35) > X(30) → Z=3, X=2
  //   X total = 4, Y = 3, Z = 3
  // Buggy aggregate-BPS result would give X=3+3=6 (X(40) > Y(25) in F1, X(40) > Z(35) in F2).
  const dgwFixtures: Fixture[] = [
    {
      id: 1,
      started: true,
      finished: true,
      finished_provisional: true,
      minutes: 90,
      stats: [
        {
          identifier: 'bps',
          h: [
            { element: 100, value: 10 },
            { element: 101, value: 25 },
          ],
          a: [],
        },
      ],
    } as unknown as Fixture,
    {
      id: 2,
      started: true,
      finished: true,
      finished_provisional: true,
      minutes: 90,
      stats: [
        {
          identifier: 'bps',
          h: [
            { element: 100, value: 30 },
            { element: 200, value: 35 },
          ],
          a: [],
        },
      ],
    } as unknown as Fixture,
  ];

  it('ranks DGW players by per-fixture BPS, not aggregate', () => {
    const result = buildProvisionalBonusMap(dgwFixtures);

    // DGW player X: 2 (2nd in F1) + 2 (2nd in F2) = 4
    expect(result.get(100)).toBe(4);
    // Y: 3 (top in F1)
    expect(result.get(101)).toBe(3);
    // Z: 3 (top in F2)
    expect(result.get(200)).toBe(3);
  });

  it('skips fixtures where official bonus is already awarded', () => {
    // F1 is finished with official bonus; F2 is in progress without official.
    // Player 100 is top BPS in F1 (already got official bonus) and top BPS in F2
    // (should still get provisional for F2).
    const fixtures: Fixture[] = [
      {
        id: 1,
        started: true,
        finished: true,
        finished_provisional: true,
        minutes: 90,
        stats: [
          {
            identifier: 'bps',
            h: [
              { element: 100, value: 40 },
              { element: 101, value: 20 },
            ],
            a: [],
          },
          {
            identifier: 'bonus',
            h: [{ element: 100, value: 3 }],
            a: [],
          },
        ],
      } as unknown as Fixture,
      {
        id: 2,
        started: true,
        finished: false,
        finished_provisional: false,
        minutes: 75,
        stats: [
          {
            identifier: 'bps',
            h: [
              { element: 100, value: 30 },
              { element: 200, value: 10 },
            ],
            a: [],
          },
        ],
      } as unknown as Fixture,
    ];

    const result = buildProvisionalBonusMap(fixtures);

    // Player 100 must NOT be awarded F1 provisional (already official).
    // Player 100 SHOULD get F2 provisional (top BPS, no official yet) = 3.
    expect(result.get(100)).toBe(3);
    // Player 101 in F1 only, official bonus awarded for someone else, 101 not top.
    expect(result.get(101)).toBeUndefined();
    // Player 200 in F2: 2nd BPS → 2.
    expect(result.get(200)).toBe(2);
  });
});

describe('calculateLiveManagerPoints — bonus across fixture lifecycle', () => {
  // Helpers kept local to this describe for clarity.
  function makeFixture(overrides: Partial<Fixture> = {}): Fixture {
    return {
      id: 1,
      started: false,
      finished: false,
      finished_provisional: false,
      minutes: 0,
      stats: [],
      ...overrides,
    } as Fixture;
  }

  function makeLivePlayer(
    id: number,
    stats: Partial<LivePlayer['stats']> = {},
    explainFixtures: number[] = [1]
  ): LivePlayer {
    return {
      id,
      stats: {
        minutes: 0,
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
        bps: 0,
        total_points: 0,
        ...stats,
      } as LivePlayer['stats'],
      explain: explainFixtures.map((fid) => ({ fixture: fid, stats: [] })),
    } as LivePlayer;
  }

  function makePick(playerId: number, multiplier = 1): ManagerPick {
    return {
      playerId,
      position: 1,
      multiplier,
      isCaptain: multiplier === 2 || multiplier === 3,
      isViceCaptain: false,
    };
  }

  function liveGw(players: LivePlayer[]): LiveGameweek {
    return { elements: players };
  }

  describe('Normal gameweek (single fixture)', () => {
    it('fixture not started → no points, no provisional', () => {
      const fixtures = [makeFixture({ id: 1, started: false })];
      const live = liveGw([makeLivePlayer(100)]);

      const result = calculateLiveManagerPoints([makePick(100)], live, fixtures);

      expect(result.basePoints).toBe(0);
      expect(result.provisionalBonus).toBe(0);
      expect(result.totalPoints).toBe(0);
    });

    it('in progress, minutes < 60 → base points only, no provisional', () => {
      const fixtures = [
        makeFixture({
          id: 1,
          started: true,
          minutes: 45,
          stats: [{ identifier: 'bps', h: [{ element: 100, value: 30 }], a: [] }],
        }),
      ];
      const live = liveGw([makeLivePlayer(100, { total_points: 6, bps: 30 })]);

      const result = calculateLiveManagerPoints([makePick(100)], live, fixtures);

      expect(result.basePoints).toBe(6);
      expect(result.provisionalBonus).toBe(0);
      expect(result.totalPoints).toBe(6);
    });

    it('in progress, minutes ≥ 60, no official bonus → base + provisional from BPS', () => {
      const fixtures = [
        makeFixture({
          id: 1,
          started: true,
          minutes: 75,
          stats: [
            {
              identifier: 'bps',
              h: [
                { element: 100, value: 40 },
                { element: 101, value: 30 },
                { element: 102, value: 20 },
              ],
              a: [],
            },
          ],
        }),
      ];
      const live = liveGw([
        makeLivePlayer(100, { total_points: 8, bps: 40 }),
        makeLivePlayer(101, { total_points: 6, bps: 30 }),
        makeLivePlayer(102, { total_points: 2, bps: 20 }),
      ]);

      const result = calculateLiveManagerPoints([makePick(100)], live, fixtures);

      expect(result.basePoints).toBe(8);
      expect(result.provisionalBonus).toBe(3);
      expect(result.totalPoints).toBe(11);
    });

    it('finished_provisional, no official bonus yet → base + provisional', () => {
      const fixtures = [
        makeFixture({
          id: 1,
          started: true,
          finished: false,
          finished_provisional: true,
          minutes: 90,
          stats: [
            {
              identifier: 'bps',
              h: [
                { element: 100, value: 40 },
                { element: 101, value: 20 },
              ],
              a: [],
            },
          ],
        }),
      ];
      const live = liveGw([
        makeLivePlayer(100, { total_points: 8, bps: 40 }),
        makeLivePlayer(101, { total_points: 2, bps: 20 }),
      ]);

      const result = calculateLiveManagerPoints([makePick(100)], live, fixtures);

      expect(result.basePoints).toBe(8);
      expect(result.provisionalBonus).toBe(3);
      expect(result.totalPoints).toBe(11);
    });

    it('finished with official bonus awarded → base (incl. official) only, no provisional on top', () => {
      // Player 100 got 3 official bonus; stats.total_points already includes it.
      const fixtures = [
        makeFixture({
          id: 1,
          started: true,
          finished: true,
          finished_provisional: true,
          minutes: 90,
          stats: [
            {
              identifier: 'bps',
              h: [
                { element: 100, value: 40 },
                { element: 101, value: 20 },
              ],
              a: [],
            },
            {
              identifier: 'bonus',
              h: [{ element: 100, value: 3 }],
              a: [],
            },
          ],
        }),
      ];
      const live = liveGw([
        makeLivePlayer(100, { total_points: 11, bps: 40, bonus: 3 }),
        makeLivePlayer(101, { total_points: 2, bps: 20 }),
      ]);

      const result = calculateLiveManagerPoints([makePick(100)], live, fixtures);

      expect(result.basePoints).toBe(11);
      expect(result.provisionalBonus).toBe(0);
      expect(result.totalPoints).toBe(11);
    });
  });

  describe('Double gameweek', () => {
    it('both fixtures in progress (≥60 min), no official bonus → base + provisional from each fixture summed', () => {
      // Player X plays both F1 and F2. Top BPS in each.
      const fixtures = [
        makeFixture({
          id: 1,
          started: true,
          minutes: 75,
          stats: [
            {
              identifier: 'bps',
              h: [
                { element: 100, value: 40 },
                { element: 200, value: 20 },
              ],
              a: [],
            },
          ],
        }),
        makeFixture({
          id: 2,
          started: true,
          minutes: 75,
          stats: [
            {
              identifier: 'bps',
              h: [
                { element: 100, value: 35 },
                { element: 300, value: 15 },
              ],
              a: [],
            },
          ],
        }),
      ];
      const live = liveGw([
        makeLivePlayer(100, { total_points: 10, bps: 75 }, [1, 2]),
        makeLivePlayer(200, { bps: 20 }),
        makeLivePlayer(300, { bps: 15 }, [2]),
      ]);

      const result = calculateLiveManagerPoints([makePick(100)], live, fixtures);

      expect(result.basePoints).toBe(10);
      expect(result.provisionalBonus).toBe(6); // 3 (F1 top) + 3 (F2 top)
      expect(result.totalPoints).toBe(16);
    });

    it('DGW F1 finished with official bonus, F2 in progress → base (incl. F1 official) + F2 provisional', () => {
      // Player 100 got 3 official bonus in F1; leads F2 BPS.
      const fixtures = [
        makeFixture({
          id: 1,
          started: true,
          finished: true,
          finished_provisional: true,
          minutes: 90,
          stats: [
            {
              identifier: 'bps',
              h: [
                { element: 100, value: 40 },
                { element: 200, value: 20 },
              ],
              a: [],
            },
            {
              identifier: 'bonus',
              h: [{ element: 100, value: 3 }],
              a: [],
            },
          ],
        }),
        makeFixture({
          id: 2,
          started: true,
          minutes: 75,
          stats: [
            {
              identifier: 'bps',
              h: [
                { element: 100, value: 35 },
                { element: 300, value: 15 },
              ],
              a: [],
            },
          ],
        }),
      ];
      // total_points = F1 base (8) + F1 official bonus (3) + F2 base (5) = 16
      // stats.bonus = 3 (from F1)
      const live = liveGw([
        makeLivePlayer(100, { total_points: 16, bps: 75, bonus: 3 }, [1, 2]),
        makeLivePlayer(200, { bps: 20 }),
        makeLivePlayer(300, { bps: 15 }, [2]),
      ]);

      const result = calculateLiveManagerPoints([makePick(100)], live, fixtures);

      // base includes F1 official; provisional is F2 only (3).
      expect(result.basePoints).toBe(16);
      expect(result.provisionalBonus).toBe(3);
      expect(result.totalPoints).toBe(19);
    });

    it('DGW both fixtures finished with official bonus → base only, no provisional on top', () => {
      const fixtures = [
        makeFixture({
          id: 1,
          started: true,
          finished: true,
          finished_provisional: true,
          minutes: 90,
          stats: [
            {
              identifier: 'bps',
              h: [
                { element: 100, value: 40 },
                { element: 200, value: 20 },
              ],
              a: [],
            },
            { identifier: 'bonus', h: [{ element: 100, value: 3 }], a: [] },
          ],
        }),
        makeFixture({
          id: 2,
          started: true,
          finished: true,
          finished_provisional: true,
          minutes: 90,
          stats: [
            {
              identifier: 'bps',
              h: [
                { element: 100, value: 35 },
                { element: 300, value: 15 },
              ],
              a: [],
            },
            { identifier: 'bonus', h: [{ element: 100, value: 3 }], a: [] },
          ],
        }),
      ];
      // total_points = 8 + 3 (F1 bonus) + 5 + 3 (F2 bonus) = 19; stats.bonus = 6
      const live = liveGw([
        makeLivePlayer(100, { total_points: 19, bps: 75, bonus: 6 }, [1, 2]),
        makeLivePlayer(200, { bps: 20 }),
        makeLivePlayer(300, { bps: 15 }, [2]),
      ]);

      const result = calculateLiveManagerPoints([makePick(100)], live, fixtures);

      expect(result.basePoints).toBe(19);
      expect(result.provisionalBonus).toBe(0);
      expect(result.totalPoints).toBe(19);
    });

    it('DGW F1 finished with official, F2 not started → base only (provisional is 0)', () => {
      const fixtures = [
        makeFixture({
          id: 1,
          started: true,
          finished: true,
          finished_provisional: true,
          minutes: 90,
          stats: [
            {
              identifier: 'bps',
              h: [{ element: 100, value: 40 }],
              a: [],
            },
            { identifier: 'bonus', h: [{ element: 100, value: 3 }], a: [] },
          ],
        }),
        makeFixture({ id: 2, started: false, minutes: 0, stats: [] }),
      ];
      const live = liveGw([makeLivePlayer(100, { total_points: 11, bps: 40, bonus: 3 }, [1, 2])]);

      const result = calculateLiveManagerPoints([makePick(100)], live, fixtures);

      expect(result.basePoints).toBe(11);
      expect(result.provisionalBonus).toBe(0);
      expect(result.totalPoints).toBe(11);
    });
  });
});
