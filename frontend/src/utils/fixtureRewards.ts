import { DEFCON_THRESHOLDS, DEFCON_BONUS_POINTS, isOutfieldPosition } from './defcon';
import {
  shouldShowProvisionalBonus,
  calculateProvisionalBonus,
  type BpsScore,
} from './liveScoring';

import type { Fixture, Player, LiveGameweek } from 'types/fpl';

export interface PlayerReward {
  playerId: number;
  webName: string;
  points: number;
}

export interface PlayerStat {
  playerId: number;
  webName: string;
  value: number;
}

export type FixtureStatus = 'not_started' | 'in_progress' | 'rewards_available';

export interface FixtureRewards {
  fixture: Fixture;
  homeTeamName: string;
  awayTeamName: string;
  bonus: PlayerReward[]; // points: 1, 2, or 3 based on BPS ranking
  defcon: PlayerReward[]; // points: always 2 for meeting threshold
  status: FixtureStatus;
  // Match events
  goals: PlayerStat[];
  assists: PlayerStat[];
  ownGoals: PlayerStat[];
  yellowCards: PlayerStat[];
  redCards: PlayerStat[];
  penaltiesMissed: PlayerStat[];
  penaltiesSaved: PlayerStat[];
  saves: PlayerStat[];
}

/**
 * Extract stat entries from fixture for a given identifier
 */
function getStatEntries(
  fixture: Fixture,
  identifier: string
): { element: number; value: number }[] {
  // Defensive check for missing stats array (can happen with mock data or partial API responses)
  if (!fixture.stats || !Array.isArray(fixture.stats)) return [];
  const stat = fixture.stats.find((s) => s.identifier === identifier);
  if (!stat) return [];
  return [...stat.h, ...stat.a];
}

/**
 * Map stat entries to player rewards with names
 */
function mapToPlayerRewards(
  entries: { element: number; value: number }[],
  playersMap: Map<number, Player>
): PlayerReward[] {
  return entries
    .map((entry) => {
      const player = playersMap.get(entry.element);
      return {
        playerId: entry.element,
        webName: player?.web_name ?? `#${entry.element}`,
        points: entry.value,
      };
    })
    .sort((a, b) => b.points - a.points); // Sort by points descending
}

/**
 * Map stat entries to player stats with names
 */
function mapToPlayerStats(
  entries: { element: number; value: number }[],
  playersMap: Map<number, Player>
): PlayerStat[] {
  return entries
    .map((entry) => {
      const player = playersMap.get(entry.element);
      return {
        playerId: entry.element,
        webName: player?.web_name ?? `#${entry.element}`,
        value: entry.value,
      };
    })
    .sort((a, b) => b.value - a.value); // Sort by value descending
}

/**
 * Filter DefCon entries to only include players who met their position's threshold
 * and map to rewards with the fixed bonus point value
 */
function filterAndMapDefconRewards(
  entries: { element: number; value: number }[],
  playersMap: Map<number, Player>
): PlayerReward[] {
  return entries
    .filter((entry) => {
      const player = playersMap.get(entry.element);
      if (!player) return false;

      // Only outfield players (DEF/MID/FWD) can earn DefCon points
      if (!isOutfieldPosition(player.element_type)) return false;

      const threshold = DEFCON_THRESHOLDS[player.element_type];
      return entry.value >= threshold;
    })
    .map((entry) => {
      const player = playersMap.get(entry.element);
      return {
        playerId: entry.element,
        webName: player?.web_name ?? `#${entry.element}`,
        points: DEFCON_BONUS_POINTS, // Fixed bonus points, not raw CBITR value
      };
    })
    .sort((a, b) => a.webName.localeCompare(b.webName)); // Sort alphabetically
}

/**
 * Determine fixture display status
 */
function getFixtureStatus(fixture: Fixture): FixtureStatus {
  if (!fixture.started) {
    return 'not_started';
  }
  if (shouldShowProvisionalBonus(fixture)) {
    return 'rewards_available';
  }
  return 'in_progress';
}

/**
 * Calculate provisional bonus from live BPS data for a fixture.
 * Used when fixture.stats.bonus is not yet populated (live matches).
 */
function calculateProvisionalBonusForFixture(
  fixture: Fixture,
  liveData: LiveGameweek,
  playersMap: Map<number, Player>
): PlayerReward[] {
  // Get all players in this fixture by checking their explain array
  const playersInFixture = liveData.elements.filter((p) =>
    p.explain.some((e) => e.fixture === fixture.id)
  );

  if (playersInFixture.length === 0) return [];

  // Build BPS scores array
  const bpsScores: BpsScore[] = playersInFixture.map((p) => ({
    playerId: p.id,
    bps: p.stats.bps,
  }));

  // Calculate provisional bonus (3/2/1 for top BPS scores)
  const bonusMap = calculateProvisionalBonus(bpsScores);

  // Convert to PlayerReward array
  const rewards: PlayerReward[] = [];
  for (const [playerId, bonus] of bonusMap) {
    if (bonus > 0) {
      const player = playersMap.get(playerId);
      rewards.push({
        playerId,
        webName: player?.web_name ?? `#${playerId}`,
        points: bonus,
      });
    }
  }

  return rewards.sort((a, b) => b.points - a.points);
}

/**
 * Extract bonus and defensive contribution rewards from a single fixture.
 * When liveData is provided and fixture.stats.bonus is empty, calculates
 * provisional bonus from BPS scores (for live matches >= 60 minutes).
 */
export function extractFixtureRewards(
  fixture: Fixture,
  playersMap: Map<number, Player>,
  teamsMap: Map<number, { name: string; short_name: string }>,
  liveData?: LiveGameweek
): FixtureRewards {
  const homeTeam = teamsMap.get(fixture.team_h);
  const awayTeam = teamsMap.get(fixture.team_a);

  const status = getFixtureStatus(fixture);
  const shouldShowRewards = status === 'rewards_available';
  const matchStarted = fixture.started;

  // Only extract rewards if we should show them
  const defconEntries = shouldShowRewards ? getStatEntries(fixture, 'defensive_contribution') : [];

  // Get bonus: prefer confirmed stats, fallback to provisional from BPS
  let bonus: PlayerReward[] = [];
  if (shouldShowRewards) {
    const bonusEntries = getStatEntries(fixture, 'bonus');
    if (bonusEntries.length > 0) {
      // Confirmed bonus available
      bonus = mapToPlayerRewards(bonusEntries, playersMap);
    } else if (liveData) {
      // No confirmed bonus - calculate provisional from BPS
      bonus = calculateProvisionalBonusForFixture(fixture, liveData, playersMap);
    }
  }

  // Extract match events (only after match started)
  const goals = matchStarted
    ? mapToPlayerStats(getStatEntries(fixture, 'goals_scored'), playersMap)
    : [];
  const assists = matchStarted
    ? mapToPlayerStats(getStatEntries(fixture, 'assists'), playersMap)
    : [];
  const ownGoals = matchStarted
    ? mapToPlayerStats(getStatEntries(fixture, 'own_goals'), playersMap)
    : [];
  const yellowCards = matchStarted
    ? mapToPlayerStats(getStatEntries(fixture, 'yellow_cards'), playersMap)
    : [];
  const redCards = matchStarted
    ? mapToPlayerStats(getStatEntries(fixture, 'red_cards'), playersMap)
    : [];
  const penaltiesMissed = matchStarted
    ? mapToPlayerStats(getStatEntries(fixture, 'penalties_missed'), playersMap)
    : [];
  const penaltiesSaved = matchStarted
    ? mapToPlayerStats(getStatEntries(fixture, 'penalties_saved'), playersMap)
    : [];
  const saves = matchStarted ? mapToPlayerStats(getStatEntries(fixture, 'saves'), playersMap) : [];

  return {
    fixture,
    homeTeamName: homeTeam?.short_name ?? `Team ${fixture.team_h}`,
    awayTeamName: awayTeam?.short_name ?? `Team ${fixture.team_a}`,
    bonus,
    defcon: filterAndMapDefconRewards(defconEntries, playersMap),
    status,
    goals,
    assists,
    ownGoals,
    yellowCards,
    redCards,
    penaltiesMissed,
    penaltiesSaved,
    saves,
  };
}

/**
 * Extract rewards for all fixtures in a gameweek.
 * When liveData is provided, provisional bonus is calculated from BPS for live matches.
 */
export function extractAllFixtureRewards(
  fixtures: Fixture[],
  playersMap: Map<number, Player>,
  teamsMap: Map<number, { name: string; short_name: string }>,
  liveData?: LiveGameweek
): FixtureRewards[] {
  return fixtures
    .filter((f) => f.event !== null) // Only fixtures with assigned gameweek
    .sort((a, b) => {
      // Sort by kickoff time, then by ID
      if (a.kickoff_time && b.kickoff_time) {
        return new Date(a.kickoff_time).getTime() - new Date(b.kickoff_time).getTime();
      }
      return a.id - b.id;
    })
    .map((fixture) => extractFixtureRewards(fixture, playersMap, teamsMap, liveData));
}
