import { Award, Circle, Hand, Shield, Square, Trophy, XCircle } from 'lucide-react';
import { useMemo } from 'react';

import {
  extractAllFixtureRewards,
  type FixtureRewards,
  type PlayerReward,
  type PlayerStat,
} from 'utils/fixtureRewards';

import * as styles from './GameRewards.module.css';

import type { Fixture, Player, Team, LiveGameweek } from 'types/fpl';

interface Props {
  fixtures: Fixture[];
  playersMap: Map<number, Player>;
  teamsMap: Map<number, Team>;
  liveData?: LiveGameweek;
}

// Medal colors for bonus points tiers
const MEDAL_COLORS: Record<number, string> = {
  3: '#FFD700', // Gold
  2: '#C0C0C0', // Silver
  1: '#CD7F32', // Bronze
};

function groupBonusByPoints(bonus: PlayerReward[]): Map<number, PlayerReward[]> {
  const grouped = new Map<number, PlayerReward[]>();
  for (const reward of bonus) {
    const existing = grouped.get(reward.points) ?? [];
    existing.push(reward);
    grouped.set(reward.points, existing);
  }
  return grouped;
}

function formatScore(fixture: Fixture): string {
  if (!fixture.started) {
    return 'vs';
  }
  return `${fixture.team_h_score ?? 0}-${fixture.team_a_score ?? 0}`;
}

function formatMatchStatus(fixture: Fixture): string {
  if (!fixture.started) {
    return '';
  }
  if (fixture.finished) {
    return 'FT';
  }
  if (fixture.finished_provisional) {
    return 'FT';
  }
  // Show minutes for live match
  return `${fixture.minutes}'`;
}

function formatPlayerNames(stats: PlayerStat[]): string {
  // Group by player and show count if multiple (e.g., "Salah ×2")
  const counts = new Map<string, number>();
  for (const stat of stats) {
    const current = counts.get(stat.webName) ?? 0;
    counts.set(stat.webName, current + stat.value);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
    .join(', ');
}

function StatRow({
  icon,
  iconColor,
  label,
  stats,
}: {
  icon: React.ReactNode;
  iconColor?: string;
  label: string;
  stats: PlayerStat[];
}) {
  if (stats.length === 0) return null;

  return (
    <div className={styles.statRow}>
      <span className={styles.statIcon} style={iconColor ? { color: iconColor } : undefined}>
        {icon}
      </span>
      <span className={styles.statLabel}>{label}:</span>
      <span className={styles.statPlayers}>{formatPlayerNames(stats)}</span>
    </div>
  );
}

function FixtureCard({ rewards }: { rewards: FixtureRewards }) {
  const bonusGrouped = groupBonusByPoints(rewards.bonus);
  const hasRewards = rewards.bonus.length > 0 || rewards.defcon.length > 0;
  const showRewards = rewards.status === 'rewards_available';

  const hasMatchEvents =
    rewards.goals.length > 0 ||
    rewards.assists.length > 0 ||
    rewards.ownGoals.length > 0 ||
    rewards.yellowCards.length > 0 ||
    rewards.redCards.length > 0 ||
    rewards.penaltiesMissed.length > 0 ||
    rewards.penaltiesSaved.length > 0;

  const matchStatus = formatMatchStatus(rewards.fixture);

  return (
    <div className={styles.fixtureCard}>
      <div className={styles.fixtureHeader}>
        <span className={styles.teamName}>{rewards.homeTeamName}</span>
        <div className={styles.scoreContainer}>
          <span className={styles.score}>{formatScore(rewards.fixture)}</span>
          {matchStatus && <span className={styles.matchStatus}>{matchStatus}</span>}
        </div>
        <span className={styles.teamName}>{rewards.awayTeamName}</span>
      </div>

      {rewards.status === 'not_started' && <div className={styles.statusMessage}>Not started</div>}

      {rewards.fixture.started && !hasMatchEvents && !hasRewards && (
        <div className={styles.statusMessage}>No events yet</div>
      )}

      {hasMatchEvents && (
        <div className={styles.matchEvents}>
          <StatRow
            icon={<Circle size={12} fill="currentColor" />}
            iconColor="#10B981"
            label="Goals"
            stats={rewards.goals}
          />
          <StatRow
            icon={<Circle size={12} />}
            iconColor="#6366F1"
            label="Assists"
            stats={rewards.assists}
          />
          <StatRow
            icon={<XCircle size={14} />}
            iconColor="#EF4444"
            label="Own Goals"
            stats={rewards.ownGoals}
          />
          <StatRow
            icon={<Square size={12} fill="currentColor" />}
            iconColor="#EAB308"
            label="Yellow"
            stats={rewards.yellowCards}
          />
          <StatRow
            icon={<Square size={12} fill="currentColor" />}
            iconColor="#DC2626"
            label="Red"
            stats={rewards.redCards}
          />
          <StatRow
            icon={<XCircle size={14} />}
            iconColor="#F97316"
            label="Pen Missed"
            stats={rewards.penaltiesMissed}
          />
          <StatRow
            icon={<Hand size={14} />}
            iconColor="#22C55E"
            label="Pen Saved"
            stats={rewards.penaltiesSaved}
          />
        </div>
      )}

      {showRewards && hasRewards && (
        <div className={styles.rewardsList}>
          {[3, 2, 1].map((points) => {
            const players = bonusGrouped.get(points);
            if (!players || players.length === 0) return null;
            return (
              <div key={points} className={styles.bonusRow}>
                <Award size={16} color={MEDAL_COLORS[points]} />
                <span className={styles.bonusPoints}>{points}:</span>
                <span className={styles.playerNames}>
                  {players.map((p) => p.webName).join(', ')}
                </span>
              </div>
            );
          })}

          {rewards.defcon.length > 0 && (
            <div className={styles.defconRow}>
              <Shield size={16} color="#14B8A6" fill="#14B8A6" />
              <span className={styles.defconLabel}>DefCon:</span>
              <span className={styles.playerNames}>
                {rewards.defcon.map((p) => p.webName).join(', ')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function GameRewards({ fixtures, playersMap, teamsMap, liveData }: Props) {
  // Memoize teams map transformation to prevent unnecessary recalculations
  // Handles empty teamsMap gracefully - useMemo must be called before any early returns
  const teamsMapForRewards = useMemo(
    () =>
      teamsMap && teamsMap.size > 0
        ? new Map(
            Array.from(teamsMap.entries()).map(([id, team]) => [
              id,
              { name: team.name, short_name: team.short_name },
            ])
          )
        : new Map(),
    [teamsMap]
  );

  // Defensive check for undefined or empty maps
  if (!playersMap || !teamsMap || playersMap.size === 0 || teamsMap.size === 0) {
    return null;
  }

  const allRewards = extractAllFixtureRewards(fixtures, playersMap, teamsMapForRewards, liveData);

  if (allRewards.length === 0) {
    return null;
  }

  return (
    <div className={styles.GameRewards}>
      <h3 className={styles.title}>
        <Trophy size={16} color="#FFD700" />
        Game Scores
      </h3>
      <div className={styles.fixtureGrid}>
        {allRewards.map((rewards) => (
          <FixtureCard key={rewards.fixture.id} rewards={rewards} />
        ))}
      </div>
    </div>
  );
}
