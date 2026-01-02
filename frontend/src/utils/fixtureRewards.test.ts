import { describe, it, expect } from 'vitest';

import { extractFixtureRewards, extractAllFixtureRewards } from './fixtureRewards';

import type { Fixture, Player, LiveGameweek, LivePlayer } from '../types/fpl';

// Helper to create a mock player
function createMockPlayer(id: number, webName: string, elementType: number): Player {
  return {
    id,
    web_name: webName,
    element_type: elementType,
    first_name: '',
    second_name: webName,
    team: 1,
    now_cost: 100,
    selected_by_percent: '10.0',
    total_points: 50,
    minutes: 900,
    status: 'a',
    news: '',
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
    form: '5.0',
    points_per_game: '5.0',
    influence: '100.0',
    creativity: '100.0',
    threat: '100.0',
    ict_index: '300.0',
    expected_goals: '2.0',
    expected_assists: '1.0',
    expected_goal_involvements: '3.0',
    expected_goals_conceded: '1.0',
    expected_goals_per_90: 0.2,
    expected_assists_per_90: 0.1,
    expected_goal_involvements_per_90: 0.3,
    expected_goals_conceded_per_90: 0.1,
    starts: 10,
    starts_per_90: 1.0,
    clean_sheets_per_90: 0.3,
    goals_conceded_per_90: 0.5,
    saves_per_90: 0,
  };
}

// Helper to create a mock fixture
function createMockFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 1,
    code: 123,
    event: 1,
    team_h: 1,
    team_a: 2,
    team_h_score: 2,
    team_a_score: 1,
    kickoff_time: '2024-01-01T15:00:00Z',
    started: true,
    finished: true,
    finished_provisional: true,
    minutes: 90,
    provisional_start_time: false,
    team_h_difficulty: 3,
    team_a_difficulty: 3,
    stats: [],
    ...overrides,
  };
}

// Helper to create teams map
function createTeamsMap(): Map<number, { name: string; short_name: string }> {
  return new Map([
    [1, { name: 'Arsenal', short_name: 'ARS' }],
    [2, { name: 'Chelsea', short_name: 'CHE' }],
    [3, { name: 'Liverpool', short_name: 'LIV' }],
  ]);
}

describe('fixtureRewards', () => {
  describe('DefCon threshold filtering', () => {
    it('should include defender with 10+ CBIT (threshold met)', () => {
      const playersMap = new Map<number, Player>([
        [100, createMockPlayer(100, 'Saliba', 2)], // DEF
      ]);

      const fixture = createMockFixture({
        stats: [
          {
            identifier: 'defensive_contribution',
            h: [{ element: 100, value: 10 }],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.defcon).toHaveLength(1);
      expect(result.defcon[0].playerId).toBe(100);
      expect(result.defcon[0].points).toBe(2);
    });

    it('should exclude defender with 9 CBIT (below threshold)', () => {
      const playersMap = new Map<number, Player>([
        [100, createMockPlayer(100, 'Saliba', 2)], // DEF
      ]);

      const fixture = createMockFixture({
        stats: [
          {
            identifier: 'defensive_contribution',
            h: [{ element: 100, value: 9 }],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.defcon).toHaveLength(0);
    });

    it('should include midfielder with 12+ CBITr (threshold met)', () => {
      const playersMap = new Map<number, Player>([
        [101, createMockPlayer(101, 'Rice', 3)], // MID
      ]);

      const fixture = createMockFixture({
        stats: [
          {
            identifier: 'defensive_contribution',
            h: [{ element: 101, value: 12 }],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.defcon).toHaveLength(1);
      expect(result.defcon[0].playerId).toBe(101);
      expect(result.defcon[0].points).toBe(2);
    });

    it('should exclude midfielder with 11 CBITr (below threshold)', () => {
      const playersMap = new Map<number, Player>([
        [101, createMockPlayer(101, 'Rice', 3)], // MID
      ]);

      const fixture = createMockFixture({
        stats: [
          {
            identifier: 'defensive_contribution',
            h: [{ element: 101, value: 11 }],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.defcon).toHaveLength(0);
    });

    it('should include forward with 12+ CBITr (threshold met)', () => {
      const playersMap = new Map<number, Player>([
        [102, createMockPlayer(102, 'Isak', 4)], // FWD
      ]);

      const fixture = createMockFixture({
        stats: [
          {
            identifier: 'defensive_contribution',
            h: [{ element: 102, value: 15 }],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.defcon).toHaveLength(1);
      expect(result.defcon[0].points).toBe(2);
    });

    it('should exclude goalkeeper from DefCon (no threshold defined)', () => {
      const playersMap = new Map<number, Player>([
        [103, createMockPlayer(103, 'Raya', 1)], // GK
      ]);

      const fixture = createMockFixture({
        stats: [
          {
            identifier: 'defensive_contribution',
            h: [{ element: 103, value: 20 }],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.defcon).toHaveLength(0);
    });

    it('should handle multiple players meeting different thresholds', () => {
      const playersMap = new Map<number, Player>([
        [100, createMockPlayer(100, 'Saliba', 2)], // DEF - needs 10
        [101, createMockPlayer(101, 'Gabriel', 2)], // DEF - needs 10
        [102, createMockPlayer(102, 'Rice', 3)], // MID - needs 12
        [103, createMockPlayer(103, 'Partey', 3)], // MID - needs 12
      ]);

      const fixture = createMockFixture({
        stats: [
          {
            identifier: 'defensive_contribution',
            h: [
              { element: 100, value: 10 }, // DEF meets threshold
              { element: 101, value: 8 }, // DEF below threshold
              { element: 102, value: 12 }, // MID meets threshold
              { element: 103, value: 11 }, // MID below threshold
            ],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.defcon).toHaveLength(2);
      const playerIds = result.defcon.map((p) => p.playerId);
      expect(playerIds).toContain(100);
      expect(playerIds).toContain(102);
      expect(playerIds).not.toContain(101);
      expect(playerIds).not.toContain(103);
    });

    it('should sort DefCon players alphabetically', () => {
      const playersMap = new Map<number, Player>([
        [100, createMockPlayer(100, 'Saliba', 2)],
        [101, createMockPlayer(101, 'Gabriel', 2)],
        [102, createMockPlayer(102, 'White', 2)],
      ]);

      const fixture = createMockFixture({
        stats: [
          {
            identifier: 'defensive_contribution',
            h: [
              { element: 100, value: 10 },
              { element: 101, value: 10 },
              { element: 102, value: 10 },
            ],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.defcon.map((p) => p.webName)).toEqual(['Gabriel', 'Saliba', 'White']);
    });
  });

  describe('Bonus points', () => {
    it('should map bonus points correctly from stats', () => {
      const playersMap = new Map<number, Player>([
        [200, createMockPlayer(200, 'Saka', 3)],
        [201, createMockPlayer(201, 'Havertz', 3)],
        [202, createMockPlayer(202, 'Martinelli', 3)],
      ]);

      const fixture = createMockFixture({
        stats: [
          {
            identifier: 'bonus',
            h: [
              { element: 200, value: 3 },
              { element: 201, value: 2 },
              { element: 202, value: 1 },
            ],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.bonus).toHaveLength(3);
      expect(result.bonus[0]).toEqual({ playerId: 200, webName: 'Saka', points: 3 });
      expect(result.bonus[1]).toEqual({ playerId: 201, webName: 'Havertz', points: 2 });
      expect(result.bonus[2]).toEqual({ playerId: 202, webName: 'Martinelli', points: 1 });
    });

    it('should sort bonus by points descending', () => {
      const playersMap = new Map<number, Player>([
        [200, createMockPlayer(200, 'Saka', 3)],
        [201, createMockPlayer(201, 'Havertz', 3)],
      ]);

      const fixture = createMockFixture({
        stats: [
          {
            identifier: 'bonus',
            h: [
              { element: 201, value: 1 },
              { element: 200, value: 3 },
            ],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.bonus[0].points).toBe(3);
      expect(result.bonus[1].points).toBe(1);
    });

    it('should combine home and away bonus stats', () => {
      const playersMap = new Map<number, Player>([
        [200, createMockPlayer(200, 'Saka', 3)],
        [201, createMockPlayer(201, 'Sterling', 3)],
      ]);

      const fixture = createMockFixture({
        stats: [
          {
            identifier: 'bonus',
            h: [{ element: 200, value: 3 }],
            a: [{ element: 201, value: 2 }],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.bonus).toHaveLength(2);
    });
  });

  describe('Fixture status', () => {
    it('should return not_started for unstarted fixtures', () => {
      const fixture = createMockFixture({
        started: false,
        finished: false,
        finished_provisional: false,
      });

      const result = extractFixtureRewards(fixture, new Map(), createTeamsMap());

      expect(result.status).toBe('not_started');
      expect(result.bonus).toHaveLength(0);
      expect(result.defcon).toHaveLength(0);
    });

    it('should return in_progress for fixture under 60 minutes', () => {
      const fixture = createMockFixture({
        started: true,
        finished: false,
        finished_provisional: false,
        minutes: 45,
      });

      const result = extractFixtureRewards(fixture, new Map(), createTeamsMap());

      expect(result.status).toBe('in_progress');
      expect(result.bonus).toHaveLength(0);
      expect(result.defcon).toHaveLength(0);
    });

    it('should return rewards_available for fixture 60+ minutes', () => {
      const playersMap = new Map<number, Player>([[200, createMockPlayer(200, 'Saka', 3)]]);

      const fixture = createMockFixture({
        started: true,
        finished: false,
        finished_provisional: false,
        minutes: 60,
        stats: [
          {
            identifier: 'bonus',
            h: [{ element: 200, value: 3 }],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.status).toBe('rewards_available');
      expect(result.bonus).toHaveLength(1);
    });

    it('should return rewards_available for finished fixture', () => {
      const playersMap = new Map<number, Player>([[200, createMockPlayer(200, 'Saka', 3)]]);

      const fixture = createMockFixture({
        started: true,
        finished: true,
        finished_provisional: true,
        minutes: 90,
        stats: [
          {
            identifier: 'bonus',
            h: [{ element: 200, value: 3 }],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.status).toBe('rewards_available');
      expect(result.bonus).toHaveLength(1);
    });
  });

  describe('Team names', () => {
    it('should use short team names from teamsMap', () => {
      const fixture = createMockFixture({
        team_h: 1,
        team_a: 2,
      });

      const result = extractFixtureRewards(fixture, new Map(), createTeamsMap());

      expect(result.homeTeamName).toBe('ARS');
      expect(result.awayTeamName).toBe('CHE');
    });

    it('should fallback to team ID when team not in map', () => {
      const fixture = createMockFixture({
        team_h: 99,
        team_a: 98,
      });

      const result = extractFixtureRewards(fixture, new Map(), createTeamsMap());

      expect(result.homeTeamName).toBe('Team 99');
      expect(result.awayTeamName).toBe('Team 98');
    });
  });

  describe('Unknown players', () => {
    it('should use element ID as fallback for unknown players', () => {
      const fixture = createMockFixture({
        stats: [
          {
            identifier: 'bonus',
            h: [{ element: 999, value: 3 }],
            a: [],
          },
        ],
      });

      const result = extractFixtureRewards(fixture, new Map(), createTeamsMap());

      expect(result.bonus[0].webName).toBe('#999');
    });
  });

  describe('extractAllFixtureRewards', () => {
    it('should sort fixtures by kickoff time', () => {
      const fixtures = [
        createMockFixture({ id: 2, kickoff_time: '2024-01-01T17:30:00Z' }),
        createMockFixture({ id: 1, kickoff_time: '2024-01-01T15:00:00Z' }),
        createMockFixture({ id: 3, kickoff_time: '2024-01-01T20:00:00Z' }),
      ];

      const result = extractAllFixtureRewards(fixtures, new Map(), createTeamsMap());

      expect(result.map((r) => r.fixture.id)).toEqual([1, 2, 3]);
    });

    it('should filter out fixtures without assigned gameweek', () => {
      const fixtures = [
        createMockFixture({ id: 1, event: 1 }),
        createMockFixture({ id: 2, event: null }),
        createMockFixture({ id: 3, event: 2 }),
      ];

      const result = extractAllFixtureRewards(fixtures, new Map(), createTeamsMap());

      expect(result).toHaveLength(2);
      expect(result.map((r) => r.fixture.id)).toEqual([1, 3]);
    });
  });

  describe('Provisional bonus from BPS (live matches)', () => {
    // Helper to create mock LivePlayer
    function createMockLivePlayer(id: number, bps: number, fixtureId: number): LivePlayer {
      return {
        id,
        stats: {
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
          bps,
          influence: '0',
          creativity: '0',
          threat: '0',
          ict_index: '0',
          total_points: 0,
          in_dreamteam: false,
        },
        explain: [{ fixture: fixtureId, stats: [] }],
      };
    }

    it('should calculate provisional bonus from BPS when no confirmed bonus', () => {
      const playersMap = new Map<number, Player>([
        [200, createMockPlayer(200, 'Saka', 3)],
        [201, createMockPlayer(201, 'Havertz', 3)],
        [202, createMockPlayer(202, 'Martinelli', 3)],
      ]);

      // Fixture at 60+ minutes with empty bonus stats
      const fixture = createMockFixture({
        id: 1,
        started: true,
        finished: false,
        finished_provisional: false,
        minutes: 75,
        stats: [], // No confirmed bonus
      });

      // Live data with BPS scores
      const liveData: LiveGameweek = {
        elements: [
          createMockLivePlayer(200, 45, 1), // Highest BPS -> 3 bonus
          createMockLivePlayer(201, 38, 1), // Second -> 2 bonus
          createMockLivePlayer(202, 30, 1), // Third -> 1 bonus
        ],
      };

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap(), liveData);

      expect(result.status).toBe('rewards_available');
      expect(result.bonus).toHaveLength(3);
      expect(result.bonus[0]).toEqual({ playerId: 200, webName: 'Saka', points: 3 });
      expect(result.bonus[1]).toEqual({ playerId: 201, webName: 'Havertz', points: 2 });
      expect(result.bonus[2]).toEqual({ playerId: 202, webName: 'Martinelli', points: 1 });
    });

    it('should handle BPS ties (same bonus for tied players, skip tiers)', () => {
      const playersMap = new Map<number, Player>([
        [200, createMockPlayer(200, 'Saka', 3)],
        [201, createMockPlayer(201, 'Havertz', 3)],
        [202, createMockPlayer(202, 'Martinelli', 3)],
      ]);

      const fixture = createMockFixture({
        id: 1,
        started: true,
        finished: false,
        minutes: 80,
        stats: [],
      });

      // Two players tied for highest BPS
      // FPL rule: both get 3 bonus, third gets 1 (2nd place tier is skipped)
      const liveData: LiveGameweek = {
        elements: [
          createMockLivePlayer(200, 45, 1), // Tied for first -> 3 bonus
          createMockLivePlayer(201, 45, 1), // Tied for first -> 3 bonus
          createMockLivePlayer(202, 30, 1), // Third -> 1 bonus (skips 2)
        ],
      };

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap(), liveData);

      expect(result.bonus).toHaveLength(3);
      // Both tied players get 3 bonus
      const sakaBonus = result.bonus.find((b) => b.playerId === 200);
      const havertzBonus = result.bonus.find((b) => b.playerId === 201);
      const martinelliBonus = result.bonus.find((b) => b.playerId === 202);
      expect(sakaBonus?.points).toBe(3);
      expect(havertzBonus?.points).toBe(3);
      // Third player gets 1 bonus (2nd tier is skipped when two tie for 1st)
      expect(martinelliBonus?.points).toBe(1);
    });

    it('should prefer confirmed bonus over provisional when available', () => {
      const playersMap = new Map<number, Player>([
        [200, createMockPlayer(200, 'Saka', 3)],
        [201, createMockPlayer(201, 'Havertz', 3)],
      ]);

      // Fixture with confirmed bonus in stats
      const fixture = createMockFixture({
        id: 1,
        started: true,
        finished: true,
        finished_provisional: true,
        minutes: 90,
        stats: [
          {
            identifier: 'bonus',
            h: [
              { element: 200, value: 3 },
              { element: 201, value: 2 },
            ],
            a: [],
          },
        ],
      });

      // Live data with DIFFERENT BPS that would give different provisional
      const liveData: LiveGameweek = {
        elements: [
          createMockLivePlayer(201, 50, 1), // Would be first by BPS
          createMockLivePlayer(200, 30, 1), // Would be second by BPS
        ],
      };

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap(), liveData);

      // Should use confirmed bonus (Saka=3, Havertz=2), not provisional (Havertz=3, Saka=2)
      expect(result.bonus[0]).toEqual({ playerId: 200, webName: 'Saka', points: 3 });
      expect(result.bonus[1]).toEqual({ playerId: 201, webName: 'Havertz', points: 2 });
    });

    it('should not calculate provisional bonus for fixture under 60 minutes', () => {
      const playersMap = new Map<number, Player>([[200, createMockPlayer(200, 'Saka', 3)]]);

      const fixture = createMockFixture({
        id: 1,
        started: true,
        finished: false,
        minutes: 45, // Under 60 minutes
        stats: [],
      });

      const liveData: LiveGameweek = {
        elements: [createMockLivePlayer(200, 45, 1)],
      };

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap(), liveData);

      expect(result.status).toBe('in_progress');
      expect(result.bonus).toHaveLength(0);
    });

    it('should filter players by fixture ID when calculating provisional bonus', () => {
      const playersMap = new Map<number, Player>([
        [200, createMockPlayer(200, 'Saka', 3)],
        [201, createMockPlayer(201, 'Salah', 3)], // Different fixture
      ]);

      const fixture = createMockFixture({
        id: 1,
        started: true,
        finished: false,
        minutes: 75,
        stats: [],
      });

      // Salah is in a different fixture (id: 2)
      const liveData: LiveGameweek = {
        elements: [
          createMockLivePlayer(200, 45, 1), // In our fixture
          createMockLivePlayer(201, 60, 2), // In different fixture
        ],
      };

      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap(), liveData);

      // Only Saka should get bonus (Salah is filtered out)
      expect(result.bonus).toHaveLength(1);
      expect(result.bonus[0].playerId).toBe(200);
    });

    it('should return empty bonus when no liveData provided and no confirmed bonus', () => {
      const playersMap = new Map<number, Player>([[200, createMockPlayer(200, 'Saka', 3)]]);

      const fixture = createMockFixture({
        id: 1,
        started: true,
        finished: false,
        minutes: 75,
        stats: [], // No confirmed bonus
      });

      // No liveData provided
      const result = extractFixtureRewards(fixture, playersMap, createTeamsMap());

      expect(result.status).toBe('rewards_available');
      expect(result.bonus).toHaveLength(0); // Can't calculate without liveData
    });
  });
});
