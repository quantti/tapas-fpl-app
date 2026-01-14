import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { usePlayerLiveStats } from './usePlayerLiveStats';

import type { LiveContext } from 'features/PlayerDetails/PlayerDetails';
import type { Fixture, LiveGameweek, LivePlayer } from 'types/fpl';

// Helper to create minimal fixture
function createFixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: 1,
    code: 1234567,
    event: 1,
    team_h: 1,
    team_a: 2,
    team_h_score: 0,
    team_a_score: 0,
    started: false,
    finished: false,
    finished_provisional: false,
    minutes: 0,
    kickoff_time: '2025-01-11T15:00:00Z',
    provisional_start_time: false,
    pulse_id: 1,
    team_h_difficulty: 3,
    team_a_difficulty: 3,
    stats: [],
    ...overrides,
  };
}

// Helper to create minimal LivePlayer
function createLivePlayer(overrides: Partial<LivePlayer> = {}): LivePlayer {
  return {
    id: 100,
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
    },
    explain: [{ fixture: 1, stats: [] }],
    ...overrides,
  };
}

// Helper to create LiveGameweek
function createLiveGameweek(elements: LivePlayer[]): LiveGameweek {
  return { elements };
}

// Helper to create LiveContext
function createLiveContext(
  gameweek: number,
  fixtures: Fixture[],
  elements: LivePlayer[] = []
): LiveContext {
  return {
    gameweek,
    liveData: createLiveGameweek(elements),
    fixtures,
  };
}

describe('usePlayerLiveStats', () => {
  describe('when no live context', () => {
    it('returns default stats with isLive false', () => {
      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1));

      expect(result.current.isLive).toBe(false);
      expect(result.current.fixture).toBeNull();
      expect(result.current.minutes).toBe(0);
    });

    it('returns default stats when player is null', () => {
      const context = createLiveContext(1, [createFixture()]);
      const { result } = renderHook(() => usePlayerLiveStats(null, 2, 1, context));

      expect(result.current.isLive).toBe(false);
    });
  });

  describe('when no live data', () => {
    it('returns default stats', () => {
      const context: LiveContext = {
        gameweek: 1,
        liveData: null,
        fixtures: [createFixture()],
      };
      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.isLive).toBe(false);
    });
  });

  describe('when fixture not found', () => {
    it('returns default stats when team has no fixture in gameweek', () => {
      const context = createLiveContext(
        1,
        [createFixture({ team_h: 5, team_a: 6 })], // Different teams
        [createLivePlayer({ id: 100 })]
      );
      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.isLive).toBe(false);
      expect(result.current.fixture).toBeNull();
    });

    it('returns default stats when gameweek does not match', () => {
      const context = createLiveContext(
        2, // Different gameweek
        [createFixture({ event: 1 })],
        [createLivePlayer({ id: 100 })]
      );
      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.isLive).toBe(false);
    });
  });

  describe('when fixture not started', () => {
    it('returns fixture but isLive false', () => {
      const fixture = createFixture({ started: false });
      const context = createLiveContext(1, [fixture], [createLivePlayer({ id: 100 })]);
      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.isLive).toBe(false);
      expect(result.current.fixture).toEqual(fixture);
    });
  });

  describe('when fixture started', () => {
    it('returns isLive true with player stats', () => {
      const fixture = createFixture({ started: true, minutes: 45 });
      const livePlayer = createLivePlayer({
        id: 100,
        stats: {
          ...createLivePlayer().stats,
          minutes: 45,
          goals_scored: 1,
          assists: 1,
          total_points: 9,
          bps: 34,
        },
      });
      const context = createLiveContext(1, [fixture], [livePlayer]);

      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.isLive).toBe(true);
      expect(result.current.minutes).toBe(45);
      expect(result.current.goals).toBe(1);
      expect(result.current.assists).toBe(1);
      expect(result.current.totalPoints).toBe(9);
      expect(result.current.bps).toBe(34);
    });

    it('returns isInProgress true for live fixture', () => {
      const fixture = createFixture({
        started: true,
        finished: false,
        finished_provisional: false,
        minutes: 67,
      });
      const context = createLiveContext(1, [fixture], [createLivePlayer({ id: 100 })]);

      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.isLive).toBe(true);
      expect(result.current.isInProgress).toBe(true);
    });

    it('returns isInProgress false for finished fixture', () => {
      const fixture = createFixture({
        started: true,
        finished: true,
        finished_provisional: true,
        minutes: 90,
      });
      const context = createLiveContext(1, [fixture], [createLivePlayer({ id: 100 })]);

      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.isLive).toBe(true);
      expect(result.current.isInProgress).toBe(false);
    });
  });

  describe('card tracking', () => {
    it('returns yellow card count', () => {
      const fixture = createFixture({ started: true });
      const livePlayer = createLivePlayer({
        id: 100,
        stats: { ...createLivePlayer().stats, yellow_cards: 1 },
      });
      const context = createLiveContext(1, [fixture], [livePlayer]);

      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.yellowCards).toBe(1);
    });

    it('returns red card count', () => {
      const fixture = createFixture({ started: true });
      const livePlayer = createLivePlayer({
        id: 100,
        stats: { ...createLivePlayer().stats, red_cards: 1 },
      });
      const context = createLiveContext(1, [fixture], [livePlayer]);

      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.redCards).toBe(1);
    });
  });

  describe('provisional bonus', () => {
    it('does not show provisional bonus before 60 minutes', () => {
      const fixture = createFixture({ started: true, minutes: 45 });
      const livePlayer = createLivePlayer({
        id: 100,
        stats: { ...createLivePlayer().stats, bps: 50 },
      });
      const context = createLiveContext(1, [fixture], [livePlayer]);

      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.showProvisionalBonus).toBe(false);
      expect(result.current.provisionalBonus).toBe(0);
    });

    it('shows provisional bonus after 60 minutes', () => {
      const fixture = createFixture({ started: true, minutes: 67 });
      // Create multiple players with different BPS to test bonus calculation
      const players = [
        createLivePlayer({ id: 100, stats: { ...createLivePlayer().stats, bps: 50 } }),
        createLivePlayer({
          id: 101,
          stats: { ...createLivePlayer().stats, bps: 40 },
          explain: [{ fixture: 1, stats: [] }],
        }),
        createLivePlayer({
          id: 102,
          stats: { ...createLivePlayer().stats, bps: 30 },
          explain: [{ fixture: 1, stats: [] }],
        }),
      ];
      const context = createLiveContext(1, [fixture], players);

      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.showProvisionalBonus).toBe(true);
      expect(result.current.provisionalBonus).toBe(3); // Highest BPS gets 3
    });

    it('shows provisional bonus when fixture finished', () => {
      const fixture = createFixture({ started: true, finished: true, minutes: 90 });
      const livePlayer = createLivePlayer({
        id: 100,
        stats: { ...createLivePlayer().stats, bps: 30 },
      });
      const context = createLiveContext(1, [fixture], [livePlayer]);

      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.showProvisionalBonus).toBe(true);
    });

    it('returns official bonus when available', () => {
      const fixture = createFixture({ started: true, finished: true });
      const livePlayer = createLivePlayer({
        id: 100,
        stats: { ...createLivePlayer().stats, bonus: 3 },
      });
      const context = createLiveContext(1, [fixture], [livePlayer]);

      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.officialBonus).toBe(3);
    });
  });

  describe('DefCon threshold', () => {
    it('returns metDefCon false for goalkeeper', () => {
      const fixture = createFixture({
        started: true,
        stats: [{ identifier: 'defensive_contribution', h: [{ element: 100, value: 15 }], a: [] }],
      });
      const context = createLiveContext(1, [fixture], [createLivePlayer({ id: 100 })]);

      // elementType 1 = Goalkeeper
      const { result } = renderHook(() => usePlayerLiveStats(100, 1, 1, context));

      expect(result.current.metDefCon).toBe(false);
    });

    it('returns metDefCon true when defender meets threshold (10+)', () => {
      const fixture = createFixture({
        started: true,
        stats: [{ identifier: 'defensive_contribution', h: [{ element: 100, value: 10 }], a: [] }],
      });
      const context = createLiveContext(1, [fixture], [createLivePlayer({ id: 100 })]);

      // elementType 2 = Defender (threshold 10)
      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.defensiveContribution).toBe(10);
      expect(result.current.metDefCon).toBe(true);
    });

    it('returns metDefCon false when defender below threshold', () => {
      const fixture = createFixture({
        started: true,
        stats: [{ identifier: 'defensive_contribution', h: [{ element: 100, value: 9 }], a: [] }],
      });
      const context = createLiveContext(1, [fixture], [createLivePlayer({ id: 100 })]);

      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.defensiveContribution).toBe(9);
      expect(result.current.metDefCon).toBe(false);
    });

    it('returns metDefCon true when midfielder meets threshold (12+)', () => {
      const fixture = createFixture({
        started: true,
        stats: [{ identifier: 'defensive_contribution', h: [{ element: 100, value: 12 }], a: [] }],
      });
      const context = createLiveContext(1, [fixture], [createLivePlayer({ id: 100 })]);

      // elementType 3 = Midfielder (threshold 12)
      const { result } = renderHook(() => usePlayerLiveStats(100, 3, 1, context));

      expect(result.current.metDefCon).toBe(true);
    });

    it('returns metDefCon for away team player', () => {
      const fixture = createFixture({
        started: true,
        team_h: 1,
        team_a: 2,
        stats: [{ identifier: 'defensive_contribution', h: [], a: [{ element: 100, value: 14 }] }],
      });
      const context = createLiveContext(1, [fixture], [createLivePlayer({ id: 100 })]);

      // Player is on away team (team 2)
      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 2, context));

      expect(result.current.defensiveContribution).toBe(14);
      expect(result.current.metDefCon).toBe(true);
    });
  });

  describe('explain stats', () => {
    it('flattens explain array into simple stats', () => {
      const fixture = createFixture({ started: true });
      const livePlayer = createLivePlayer({
        id: 100,
        explain: [
          {
            fixture: 1,
            stats: [
              { identifier: 'minutes', points: 2, value: 90 },
              { identifier: 'goals_scored', points: 5, value: 1 },
            ],
          },
        ],
      });
      const context = createLiveContext(1, [fixture], [livePlayer]);

      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 1, context));

      expect(result.current.explain).toHaveLength(2);
      expect(result.current.explain[0]).toEqual({ identifier: 'minutes', points: 2, value: 90 });
      expect(result.current.explain[1]).toEqual({
        identifier: 'goals_scored',
        points: 5,
        value: 1,
      });
    });
  });

  describe('team fixture matching', () => {
    it('finds fixture when player team is home', () => {
      const fixture = createFixture({ started: true, team_h: 3, team_a: 7 });
      const context = createLiveContext(1, [fixture], [createLivePlayer({ id: 100 })]);

      // Player is on home team (team 3)
      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 3, context));

      expect(result.current.isLive).toBe(true);
      expect(result.current.fixture).toEqual(fixture);
    });

    it('finds fixture when player team is away', () => {
      const fixture = createFixture({ started: true, team_h: 3, team_a: 7 });
      const context = createLiveContext(1, [fixture], [createLivePlayer({ id: 100 })]);

      // Player is on away team (team 7)
      const { result } = renderHook(() => usePlayerLiveStats(100, 2, 7, context));

      expect(result.current.isLive).toBe(true);
      expect(result.current.fixture).toEqual(fixture);
    });
  });
});
