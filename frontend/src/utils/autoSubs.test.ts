import { describe, it, expect } from 'vitest';

import {
  buildTeamFixtureMap,
  isPlayerFixtureFinished,
  hasFixtureStarted,
  getOpponentInfo,
  hasContribution,
  countFormation,
  canSubstitute,
  calculateAutoSubs,
  POSITION_LIMITS,
} from './autoSubs';

import type { ManagerPick } from 'services/queries/useFplData';
import type { Fixture, LiveGameweek, LivePlayer, Player, Team } from 'types/fpl';

// Helper to create a minimal LivePlayer
function createLivePlayer(
  id: number,
  stats: Partial<LivePlayer['stats']> = {},
  explain: LivePlayer['explain'] = []
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
      influence: '0',
      creativity: '0',
      threat: '0',
      ict_index: '0',
      total_points: 0,
      in_dreamteam: false,
      ...stats,
    },
    explain,
  };
}

// Helper to create a minimal Player
function createPlayer(id: number, element_type: number, team: number, web_name: string): Player {
  return {
    id,
    first_name: 'Test',
    second_name: web_name,
    web_name,
    team,
    team_code: team,
    element_type,
    now_cost: 100,
    selected_by_percent: '10',
    total_points: 0,
    event_points: 0,
    points_per_game: '0',
    form: '0',
    status: 'a',
    news: '',
    news_added: null,
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
    influence: '0',
    creativity: '0',
    threat: '0',
    ict_index: '0',
    expected_goals: '0',
    expected_assists: '0',
    expected_goal_involvements: '0',
    expected_goals_conceded: '0',
  };
}

// Helper to create a minimal Fixture
function createFixture(
  id: number,
  team_h: number,
  team_a: number,
  finished_provisional = false,
  finished = false
): Fixture {
  return {
    id,
    code: id,
    event: 1,
    finished,
    finished_provisional,
    kickoff_time: '2024-01-01T15:00:00Z',
    minutes: finished_provisional ? 90 : 0,
    provisional_start_time: false,
    started: finished_provisional || finished,
    team_a,
    team_a_score: finished_provisional ? 1 : null,
    team_h,
    team_h_score: finished_provisional ? 1 : null,
    team_h_difficulty: 3,
    team_a_difficulty: 3,
    pulse_id: id,
    stats: [],
  };
}

// Helper to create a ManagerPick
function createPick(
  playerId: number,
  position: number,
  multiplier = 1,
  isCaptain = false,
  isViceCaptain = false
): ManagerPick {
  return { playerId, position, multiplier, isCaptain, isViceCaptain };
}

describe('buildTeamFixtureMap', () => {
  it('should map both home and away teams to their fixture', () => {
    const fixtures = [createFixture(1, 10, 20)];
    const map = buildTeamFixtureMap(fixtures);

    expect(map.get(10)).toBe(fixtures[0]);
    expect(map.get(20)).toBe(fixtures[0]);
  });

  it('should handle multiple fixtures', () => {
    const fixtures = [createFixture(1, 10, 20), createFixture(2, 30, 40)];
    const map = buildTeamFixtureMap(fixtures);

    expect(map.get(10)).toBe(fixtures[0]);
    expect(map.get(30)).toBe(fixtures[1]);
    expect(map.size).toBe(4);
  });
});

describe('isPlayerFixtureFinished', () => {
  it('should return true when fixture is finished_provisional', () => {
    const fixtures = [createFixture(1, 10, 20, true, false)];
    const map = buildTeamFixtureMap(fixtures);

    expect(isPlayerFixtureFinished(10, map)).toBe(true);
    expect(isPlayerFixtureFinished(20, map)).toBe(true);
  });

  it('should return true when fixture is finished', () => {
    const fixtures = [createFixture(1, 10, 20, false, true)];
    const map = buildTeamFixtureMap(fixtures);

    expect(isPlayerFixtureFinished(10, map)).toBe(true);
  });

  it('should return false when fixture not finished', () => {
    const fixtures = [createFixture(1, 10, 20, false, false)];
    const map = buildTeamFixtureMap(fixtures);

    expect(isPlayerFixtureFinished(10, map)).toBe(false);
  });

  it('should return false when team has no fixture', () => {
    const map = new Map<number, Fixture>();
    expect(isPlayerFixtureFinished(999, map)).toBe(false);
  });
});

describe('hasContribution', () => {
  it('should return true when player has minutes', () => {
    const player = createLivePlayer(1, { minutes: 90 }, [
      { fixture: 1, stats: [{ identifier: 'minutes', points: 2, value: 90 }] },
    ]);
    expect(hasContribution(player)).toBe(true);
  });

  it('should return true when player has 1 minute', () => {
    const player = createLivePlayer(1, { minutes: 1 }, [
      { fixture: 1, stats: [{ identifier: 'minutes', points: 1, value: 1 }] },
    ]);
    expect(hasContribution(player)).toBe(true);
  });

  it('should return true when player has yellow card but 0 minutes (bench card)', () => {
    const player = createLivePlayer(1, { minutes: 0, yellow_cards: 1, total_points: -1 }, [
      {
        fixture: 1,
        stats: [{ identifier: 'yellow_cards', points: -1, value: 1 }],
      },
    ]);
    expect(hasContribution(player)).toBe(true);
  });

  it('should return false when player has no events', () => {
    const player = createLivePlayer(1, { minutes: 0 }, []);
    expect(hasContribution(player)).toBe(false);
  });

  it('should return false when explain array has empty stats', () => {
    const player = createLivePlayer(1, { minutes: 0 }, [{ fixture: 1, stats: [] }]);
    expect(hasContribution(player)).toBe(false);
  });

  it('should return false when player has minutes=0 stat entry (FPL API edge case)', () => {
    // FPL API returns a minutes stat entry even for players who did not play
    // This should NOT count as contribution
    const player = createLivePlayer(1, { minutes: 0 }, [
      {
        fixture: 1,
        stats: [
          {
            identifier: 'minutes',
            points: 0,
            value: 0,
            points_modification: 0,
          },
        ],
      },
    ]);
    expect(hasContribution(player)).toBe(false);
  });
});

describe('countFormation', () => {
  it('should count active players by position', () => {
    const picks: ManagerPick[] = [
      createPick(1, 1, 1), // GK
      createPick(2, 2, 1), // DEF
      createPick(3, 3, 1), // DEF
      createPick(4, 4, 1), // DEF
      createPick(5, 5, 1), // MID
      createPick(6, 6, 1), // MID
      createPick(7, 7, 1), // MID
      createPick(8, 8, 1), // MID
      createPick(9, 9, 1), // FWD
      createPick(10, 10, 1), // FWD
      createPick(11, 11, 2), // FWD (captain)
    ];

    const playersMap = new Map<number, Player>([
      [1, createPlayer(1, 1, 10, 'GK1')],
      [2, createPlayer(2, 2, 10, 'DEF1')],
      [3, createPlayer(3, 2, 10, 'DEF2')],
      [4, createPlayer(4, 2, 10, 'DEF3')],
      [5, createPlayer(5, 3, 10, 'MID1')],
      [6, createPlayer(6, 3, 10, 'MID2')],
      [7, createPlayer(7, 3, 10, 'MID3')],
      [8, createPlayer(8, 3, 10, 'MID4')],
      [9, createPlayer(9, 4, 10, 'FWD1')],
      [10, createPlayer(10, 4, 10, 'FWD2')],
      [11, createPlayer(11, 4, 10, 'FWD3')],
    ]);

    const formation = countFormation(picks, playersMap);

    expect(formation[1]).toBe(1); // 1 GK
    expect(formation[2]).toBe(3); // 3 DEF
    expect(formation[3]).toBe(4); // 4 MID
    expect(formation[4]).toBe(3); // 3 FWD
  });

  it('should not count benched players (multiplier 0)', () => {
    const picks: ManagerPick[] = [
      createPick(1, 1, 1), // Active GK
      createPick(2, 12, 0), // Benched player
    ];

    const playersMap = new Map<number, Player>([
      [1, createPlayer(1, 1, 10, 'GK1')],
      [2, createPlayer(2, 2, 10, 'DEF1')],
    ]);

    const formation = countFormation(picks, playersMap);

    expect(formation[1]).toBe(1);
    expect(formation[2]).toBe(0);
  });
});

describe('canSubstitute', () => {
  it('should allow GK to replace GK', () => {
    const formation = { 1: 1, 2: 4, 3: 4, 4: 2 };
    expect(canSubstitute(1, 1, formation)).toBe(true);
  });

  it('should NOT allow outfield player to replace GK', () => {
    const formation = { 1: 1, 2: 4, 3: 4, 4: 2 };
    expect(canSubstitute(1, 2, formation)).toBe(false);
    expect(canSubstitute(1, 3, formation)).toBe(false);
    expect(canSubstitute(1, 4, formation)).toBe(false);
  });

  it('should NOT allow GK to replace outfield player', () => {
    const formation = { 1: 1, 2: 4, 3: 4, 4: 2 };
    expect(canSubstitute(2, 1, formation)).toBe(false);
    expect(canSubstitute(3, 1, formation)).toBe(false);
    expect(canSubstitute(4, 1, formation)).toBe(false);
  });

  it('should allow DEF to replace DEF', () => {
    const formation = { 1: 1, 2: 4, 3: 4, 4: 2 };
    expect(canSubstitute(2, 2, formation)).toBe(true);
  });

  it('should allow MID to replace DEF when DEF > 3', () => {
    const formation = { 1: 1, 2: 4, 3: 4, 4: 2 };
    // 4 DEF - 1 + 1 MID = 3 DEF, 5 MID - valid
    expect(canSubstitute(2, 3, formation)).toBe(true);
  });

  it('should NOT allow MID to replace DEF when DEF = 3', () => {
    const formation = { 1: 1, 2: 3, 3: 5, 4: 2 };
    // 3 DEF - 1 = 2 DEF - below minimum
    expect(canSubstitute(2, 3, formation)).toBe(false);
  });

  it('should NOT allow FWD to replace MID when MID = 2', () => {
    const formation = { 1: 1, 2: 4, 3: 2, 4: 4 };
    // 2 MID - 1 = 1 MID - below minimum
    expect(canSubstitute(3, 4, formation)).toBe(false);
  });

  it('should NOT allow DEF to replace FWD when FWD = 1', () => {
    const formation = { 1: 1, 2: 5, 3: 4, 4: 1 };
    // 1 FWD - 1 = 0 FWD - below minimum
    expect(canSubstitute(4, 2, formation)).toBe(false);
  });

  it('should NOT allow substitution that exceeds position max', () => {
    const formation = { 1: 1, 2: 5, 3: 3, 4: 2 };
    // 5 DEF + 1 = 6 DEF - above maximum of 5
    expect(canSubstitute(3, 2, formation)).toBe(false);
  });
});

describe('calculateAutoSubs', () => {
  // Standard 4-4-2 formation with bench
  function createStandardSquad() {
    const picks: ManagerPick[] = [
      // Starting XI
      createPick(1, 1, 1), // GK
      createPick(2, 2, 1), // DEF
      createPick(3, 3, 1), // DEF
      createPick(4, 4, 1), // DEF
      createPick(5, 5, 1), // DEF
      createPick(6, 6, 1), // MID
      createPick(7, 7, 1), // MID
      createPick(8, 8, 1), // MID
      createPick(9, 9, 1), // MID
      createPick(10, 10, 2, true), // FWD (captain)
      createPick(11, 11, 1, false, true), // FWD (VC)
      // Bench
      createPick(12, 12, 0), // Bench GK
      createPick(13, 13, 0), // Bench DEF
      createPick(14, 14, 0), // Bench MID
      createPick(15, 15, 0), // Bench FWD
    ];

    const playersMap = new Map<number, Player>([
      [1, createPlayer(1, 1, 10, 'GK1')],
      [2, createPlayer(2, 2, 10, 'DEF1')],
      [3, createPlayer(3, 2, 10, 'DEF2')],
      [4, createPlayer(4, 2, 20, 'DEF3')],
      [5, createPlayer(5, 2, 20, 'DEF4')],
      [6, createPlayer(6, 3, 10, 'MID1')],
      [7, createPlayer(7, 3, 10, 'MID2')],
      [8, createPlayer(8, 3, 20, 'MID3')],
      [9, createPlayer(9, 3, 20, 'MID4')],
      [10, createPlayer(10, 4, 10, 'FWD1')],
      [11, createPlayer(11, 4, 10, 'FWD2')],
      [12, createPlayer(12, 1, 30, 'BenchGK')],
      [13, createPlayer(13, 2, 30, 'BenchDEF')],
      [14, createPlayer(14, 3, 30, 'BenchMID')],
      [15, createPlayer(15, 4, 30, 'BenchFWD')],
    ]);

    return { picks, playersMap };
  }

  it('should return unchanged picks when no subs needed', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [
      createFixture(1, 10, 20, true), // All fixtures finished
      createFixture(2, 30, 40, true),
    ];

    // All players contributed
    const liveData: LiveGameweek = {
      elements: picks.map((p) =>
        createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ])
      ),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    expect(result.autoSubs).toHaveLength(0);
    expect(result.captainPromoted).toBe(false);
    // Multipliers unchanged
    expect(result.adjustedPicks[0].multiplier).toBe(1);
    expect(result.adjustedPicks[9].multiplier).toBe(2); // Captain
  });

  it('should sub in first bench player when starter has 0 minutes', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [createFixture(1, 10, 20, true), createFixture(2, 30, 40, true)];

    // Player 2 (DEF1) didn't play, bench DEF (13) played
    const liveData: LiveGameweek = {
      elements: [
        createLivePlayer(1, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]),
        createLivePlayer(2, { minutes: 0 }, []), // No contribution
        createLivePlayer(3, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]),
        createLivePlayer(4, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]),
        createLivePlayer(5, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]),
        createLivePlayer(6, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]),
        createLivePlayer(7, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]),
        createLivePlayer(8, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]),
        createLivePlayer(9, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]),
        createLivePlayer(10, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]),
        createLivePlayer(11, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]),
        createLivePlayer(12, { minutes: 0 }, []), // Bench GK didn't play
        createLivePlayer(13, { minutes: 90 }, [
          {
            fixture: 2,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]), // Bench DEF played
        createLivePlayer(14, { minutes: 90 }, [
          {
            fixture: 2,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]),
        createLivePlayer(15, { minutes: 90 }, [
          {
            fixture: 2,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]),
      ],
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    expect(result.autoSubs).toHaveLength(1);
    expect(result.autoSubs[0].playerOut.playerId).toBe(2);
    expect(result.autoSubs[0].playerIn.playerId).toBe(13); // First eligible bench (skips GK at 12)

    // Check multipliers adjusted
    const player2 = result.adjustedPicks.find((p) => p.playerId === 2);
    const player13 = result.adjustedPicks.find((p) => p.playerId === 13);
    expect(player2?.multiplier).toBe(0);
    expect(player13?.multiplier).toBe(1);
  });

  it('should respect bench order (12 -> 13 -> 14 -> 15)', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [createFixture(1, 10, 20, true), createFixture(2, 30, 40, true)];

    // Player 6 (MID) didn't play. Bench: 12=GK(can't), 13=DEF(played), 14=MID(played)
    // Should pick 13 (DEF) as it comes before 14 and formation allows
    const liveData: LiveGameweek = {
      elements: picks.map((p) => {
        if (p.playerId === 6) {
          return createLivePlayer(6, { minutes: 0 }, []); // MID1 no contribution
        }
        if (p.playerId === 12) {
          return createLivePlayer(12, { minutes: 0 }, []); // Bench GK no play
        }
        return createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]);
      }),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    expect(result.autoSubs).toHaveLength(1);
    expect(result.autoSubs[0].playerOut.playerId).toBe(6); // MID out
    expect(result.autoSubs[0].playerIn.playerId).toBe(13); // DEF in (first outfield bench)
  });

  it('should NOT sub player who has yellow card but 0 minutes', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [createFixture(1, 10, 20, true)];

    // Player 2 has yellow card from bench (0 minutes but has contribution)
    const liveData: LiveGameweek = {
      elements: picks.map((p) => {
        if (p.playerId === 2) {
          return createLivePlayer(2, { minutes: 0, yellow_cards: 1, total_points: -1 }, [
            {
              fixture: 1,
              stats: [{ identifier: 'yellow_cards', points: -1, value: 1 }],
            },
          ]);
        }
        return createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]);
      }),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    expect(result.autoSubs).toHaveLength(0); // No sub needed
  });

  it('should NOT sub in bench player who has no contribution', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [createFixture(1, 10, 20, true), createFixture(2, 30, 40, true)];

    // Player 2 (DEF) didn't play, and bench DEF (13) also didn't play
    // Should use bench MID (14) instead
    const liveData: LiveGameweek = {
      elements: picks.map((p) => {
        if (p.playerId === 2 || p.playerId === 12 || p.playerId === 13) {
          return createLivePlayer(p.playerId, { minutes: 0 }, []); // No contribution
        }
        return createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]);
      }),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    expect(result.autoSubs).toHaveLength(1);
    expect(result.autoSubs[0].playerIn.playerId).toBe(14); // MID (skipped 12=GK, 13=no contribution)
  });

  it('should handle GK substitution correctly (only GK can replace GK)', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [createFixture(1, 10, 20, true), createFixture(2, 30, 40, true)];

    // GK (1) didn't play, bench GK (12) played
    const liveData: LiveGameweek = {
      elements: picks.map((p) => {
        if (p.playerId === 1) {
          return createLivePlayer(1, { minutes: 0 }, []); // GK no contribution
        }
        return createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]);
      }),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    expect(result.autoSubs).toHaveLength(1);
    expect(result.autoSubs[0].playerOut.playerId).toBe(1); // Starting GK
    expect(result.autoSubs[0].playerIn.playerId).toBe(12); // Bench GK
  });

  it('should NOT sub GK with outfield player', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [createFixture(1, 10, 20, true), createFixture(2, 30, 40, true)];

    // GK (1) didn't play, bench GK (12) also didn't play
    // Should NOT use bench DEF (13) to replace GK
    const liveData: LiveGameweek = {
      elements: picks.map((p) => {
        if (p.playerId === 1 || p.playerId === 12) {
          return createLivePlayer(p.playerId, { minutes: 0 }, []); // No contribution
        }
        return createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]);
      }),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    expect(result.autoSubs).toHaveLength(0); // No valid sub available
  });

  it('should promote vice-captain when captain has no contribution', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [createFixture(1, 10, 20, true)];

    // Captain (10) didn't play, VC (11) played
    const liveData: LiveGameweek = {
      elements: picks.map((p) => {
        if (p.playerId === 10) {
          return createLivePlayer(10, { minutes: 0 }, []); // Captain no contribution
        }
        return createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]);
      }),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    expect(result.captainPromoted).toBe(true);
    expect(result.originalCaptainId).toBe(10);

    // VC should have captain multiplier (2)
    const vcPick = result.adjustedPicks.find((p) => p.playerId === 11);
    expect(vcPick?.multiplier).toBe(2);

    // Captain should have normal multiplier (1)
    const captainPick = result.adjustedPicks.find((p) => p.playerId === 10);
    expect(captainPick?.multiplier).toBe(1);
  });

  it('should NOT promote VC if VC also has no contribution', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [createFixture(1, 10, 20, true)];

    // Both captain (10) and VC (11) didn't play
    const liveData: LiveGameweek = {
      elements: picks.map((p) => {
        if (p.playerId === 10 || p.playerId === 11) {
          return createLivePlayer(p.playerId, { minutes: 0 }, []); // No contribution
        }
        return createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]);
      }),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    expect(result.captainPromoted).toBe(false);
  });

  it('should handle triple captain multiplier correctly', () => {
    const { picks, playersMap } = createStandardSquad();
    // Set captain to triple captain (multiplier 3)
    picks[9].multiplier = 3;

    const fixtures = [createFixture(1, 10, 20, true)];

    // Captain didn't play, VC played
    const liveData: LiveGameweek = {
      elements: picks.map((p) => {
        if (p.playerId === 10) {
          return createLivePlayer(10, { minutes: 0 }, []);
        }
        return createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]);
      }),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    expect(result.captainPromoted).toBe(true);
    // VC should have triple captain multiplier (3)
    const vcPick = result.adjustedPicks.find((p) => p.playerId === 11);
    expect(vcPick?.multiplier).toBe(3);
  });

  it('should give VC correct multiplier when captain is auto-subbed out', () => {
    // This tests a critical bug: when captain is auto-subbed out, their multiplier
    // becomes 0 BEFORE captain promotion runs. We must preserve the original
    // captain multiplier so VC gets 2 (or 3 for TC), not 0.
    const { picks, playersMap } = createStandardSquad();
    // Need fixtures for all teams: team 10 (captain), team 30 (bench DEF 13)
    const fixtures = [createFixture(1, 10, 20, true), createFixture(2, 30, 40, true)];

    // Captain (10, FWD on team 10) didn't play - will be auto-subbed out
    // VC (11, FWD) played - should get captain multiplier 2
    // First bench player (12, GK) didn't play
    // Second bench player (13, DEF on team 30) played - will sub in for captain
    const liveData: LiveGameweek = {
      elements: picks.map((p) => {
        if (p.playerId === 10 || p.playerId === 12) {
          return createLivePlayer(p.playerId, { minutes: 0 }, []); // No contribution
        }
        return createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]);
      }),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    // Captain should be subbed out (DEF can replace FWD if formation allows)
    expect(result.autoSubs).toHaveLength(1);
    expect(result.autoSubs[0].playerOut.playerId).toBe(10);
    expect(result.autoSubs[0].playerIn.playerId).toBe(13); // Bench DEF

    // VC should be promoted with multiplier 2 (NOT 0!)
    expect(result.captainPromoted).toBe(true);
    const vcPick = result.adjustedPicks.find((p) => p.playerId === 11);
    expect(vcPick?.multiplier).toBe(2);

    // Original captain should have multiplier 0 (subbed out)
    const captainPick = result.adjustedPicks.find((p) => p.playerId === 10);
    expect(captainPick?.multiplier).toBe(0);
  });

  it('should return unchanged picks when liveData is null', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [createFixture(1, 10, 20, true)];

    const result = calculateAutoSubs(picks, null, fixtures, playersMap);

    expect(result.autoSubs).toHaveLength(0);
    expect(result.adjustedPicks).toBe(picks);
  });

  it('should return unchanged picks when picks is empty', () => {
    const playersMap = new Map<number, Player>();
    const fixtures = [createFixture(1, 10, 20, true)];
    const liveData: LiveGameweek = { elements: [] };

    const result = calculateAutoSubs([], liveData, fixtures, playersMap);

    expect(result.autoSubs).toHaveLength(0);
    expect(result.adjustedPicks).toHaveLength(0);
  });

  it('should NOT sub player whose fixture has not finished', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [
      createFixture(1, 10, 20, false), // Not finished
    ];

    // Player 2 has 0 minutes but fixture not finished
    const liveData: LiveGameweek = {
      elements: picks.map((p) => {
        if (p.playerId === 2) {
          return createLivePlayer(2, { minutes: 0 }, []);
        }
        return createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]);
      }),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    expect(result.autoSubs).toHaveLength(0); // No sub until fixture finishes
  });

  it('should handle multiple subs correctly', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [createFixture(1, 10, 20, true), createFixture(2, 30, 40, true)];

    // Two players (2 and 3 - both DEF) didn't play
    // Should sub both with bench players 13 (DEF) and 14 (MID)
    const liveData: LiveGameweek = {
      elements: picks.map((p) => {
        if (p.playerId === 2 || p.playerId === 3 || p.playerId === 12) {
          return createLivePlayer(p.playerId, { minutes: 0 }, []);
        }
        return createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]);
      }),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    expect(result.autoSubs).toHaveLength(2);
    // First sub: DEF(2) -> BenchDEF(13)
    expect(result.autoSubs[0].playerOut.playerId).toBe(2);
    expect(result.autoSubs[0].playerIn.playerId).toBe(13);
    // Second sub: DEF(3) -> BenchMID(14)
    expect(result.autoSubs[1].playerOut.playerId).toBe(3);
    expect(result.autoSubs[1].playerIn.playerId).toBe(14);
  });

  it('should respect formation constraints when making multiple subs', () => {
    const { picks, playersMap } = createStandardSquad();
    const fixtures = [createFixture(1, 10, 20, true), createFixture(2, 30, 40, true)];

    // Three DEFs (2, 3, 4) didn't play
    // Can only sub in DEF (13) for one, then would violate min 3 DEF rule
    // Unless bench has more DEFs, which it doesn't
    const liveData: LiveGameweek = {
      elements: picks.map((p) => {
        if (p.playerId === 2 || p.playerId === 3 || p.playerId === 4 || p.playerId === 12) {
          return createLivePlayer(p.playerId, { minutes: 0 }, []);
        }
        return createLivePlayer(p.playerId, { minutes: 90 }, [
          {
            fixture: 1,
            stats: [{ identifier: 'minutes', points: 2, value: 90 }],
          },
        ]);
      }),
    };

    const result = calculateAutoSubs(picks, liveData, fixtures, playersMap);

    // Should make 2 subs:
    // DEF(2) -> BenchDEF(13) - keeps 3 DEF
    // DEF(3) -> BenchMID(14) - would make 2 DEF if not for BenchDEF already in
    // DEF(4) -> BenchFWD(15) - would make 1 DEF, invalid!
    // Actually with 4 DEF starting and 1 bench DEF:
    // After first sub: 4 DEF (3 original + 1 bench DEF)
    // After second sub: 3 DEF (MID replaces DEF) - valid
    // After third sub: 2 DEF - invalid
    expect(result.autoSubs.length).toBeLessThanOrEqual(2);
  });
});

describe('POSITION_LIMITS', () => {
  it('should have correct limits for all positions', () => {
    expect(POSITION_LIMITS[1]).toEqual({ min: 1, max: 1 });
    expect(POSITION_LIMITS[2]).toEqual({ min: 3, max: 5 });
    expect(POSITION_LIMITS[3]).toEqual({ min: 2, max: 5 });
    expect(POSITION_LIMITS[4]).toEqual({ min: 1, max: 3 });
  });
});

// Helper to create a minimal Team
function createTeam(id: number, short_name: string, code = id): Team {
  return {
    id,
    name: `Team ${id}`,
    short_name,
    code,
    strength: 3,
    strength_overall_home: 1000,
    strength_overall_away: 1000,
    strength_attack_home: 1000,
    strength_attack_away: 1000,
    strength_defence_home: 1000,
    strength_defence_away: 1000,
  };
}

describe('hasFixtureStarted', () => {
  it('should return true when fixture has started', () => {
    const fixture = createFixture(1, 10, 20, false, false);
    fixture.started = true;
    const map = buildTeamFixtureMap([fixture]);

    expect(hasFixtureStarted(10, map)).toBe(true);
    expect(hasFixtureStarted(20, map)).toBe(true);
  });

  it('should return true when fixture is finished (implies started)', () => {
    const fixture = createFixture(1, 10, 20, false, true);
    const map = buildTeamFixtureMap([fixture]);

    expect(hasFixtureStarted(10, map)).toBe(true);
  });

  it('should return true when fixture is finished_provisional (implies started)', () => {
    const fixture = createFixture(1, 10, 20, true, false);
    const map = buildTeamFixtureMap([fixture]);

    expect(hasFixtureStarted(10, map)).toBe(true);
  });

  it('should return false when fixture has not started', () => {
    const fixture = createFixture(1, 10, 20, false, false);
    fixture.started = false;
    const map = buildTeamFixtureMap([fixture]);

    expect(hasFixtureStarted(10, map)).toBe(false);
  });

  it('should return false when team has no fixture', () => {
    const map = new Map<number, Fixture>();
    expect(hasFixtureStarted(999, map)).toBe(false);
  });
});

describe('getOpponentInfo', () => {
  it('should return opponent info for home team', () => {
    const fixtures = [createFixture(1, 10, 20)];
    const teams = new Map([
      [10, createTeam(10, 'HOM')],
      [20, createTeam(20, 'AWY')],
    ]);
    const fixtureMap = buildTeamFixtureMap(fixtures);

    const result = getOpponentInfo(10, fixtureMap, teams);

    expect(result).toEqual({ shortName: 'AWY', isHome: true });
  });

  it('should return opponent info for away team', () => {
    const fixtures = [createFixture(1, 10, 20)];
    const teams = new Map([
      [10, createTeam(10, 'HOM')],
      [20, createTeam(20, 'AWY')],
    ]);
    const fixtureMap = buildTeamFixtureMap(fixtures);

    const result = getOpponentInfo(20, fixtureMap, teams);

    expect(result).toEqual({ shortName: 'HOM', isHome: false });
  });

  it('should return null when team has no fixture', () => {
    const fixtureMap = new Map<number, Fixture>();
    const teams = new Map<number, Team>();

    const result = getOpponentInfo(999, fixtureMap, teams);

    expect(result).toBeNull();
  });

  it('should return null when opponent team not found in teams map', () => {
    const fixtures = [createFixture(1, 10, 20)];
    const teams = new Map([[10, createTeam(10, 'HOM')]]); // Missing team 20
    const fixtureMap = buildTeamFixtureMap(fixtures);

    const result = getOpponentInfo(10, fixtureMap, teams);

    expect(result).toBeNull();
  });
});
