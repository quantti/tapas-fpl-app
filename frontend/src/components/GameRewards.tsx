import { useMemo } from 'react'
import { Award, Shield, Trophy } from 'lucide-react'
import type { Fixture, Player, Team, LiveGameweek } from '../types/fpl'
import {
  extractAllFixtureRewards,
  type FixtureRewards,
  type PlayerReward,
} from '../utils/fixtureRewards'
import * as styles from './GameRewards.module.css'

interface Props {
  fixtures: Fixture[]
  playersMap: Map<number, Player>
  teamsMap: Map<number, Team>
  liveData?: LiveGameweek
}

// Medal colors for bonus points tiers
const MEDAL_COLORS: Record<number, string> = {
  3: '#FFD700', // Gold
  2: '#C0C0C0', // Silver
  1: '#CD7F32', // Bronze
}

function groupBonusByPoints(bonus: PlayerReward[]): Map<number, PlayerReward[]> {
  const grouped = new Map<number, PlayerReward[]>()
  for (const reward of bonus) {
    const existing = grouped.get(reward.points) ?? []
    existing.push(reward)
    grouped.set(reward.points, existing)
  }
  return grouped
}

function formatScore(fixture: Fixture): string {
  if (!fixture.started) {
    return 'vs'
  }
  return `${fixture.team_h_score ?? 0}-${fixture.team_a_score ?? 0}`
}

function FixtureCard({ rewards }: { rewards: FixtureRewards }) {
  const bonusGrouped = groupBonusByPoints(rewards.bonus)
  const hasRewards = rewards.bonus.length > 0 || rewards.defcon.length > 0
  const showRewards = rewards.status === 'rewards_available'

  return (
    <div className={styles.fixtureCard}>
      <div className={styles.fixtureHeader}>
        <span className={styles.teamName}>{rewards.homeTeamName}</span>
        <span className={styles.score}>{formatScore(rewards.fixture)}</span>
        <span className={styles.teamName}>{rewards.awayTeamName}</span>
      </div>

      {rewards.status === 'not_started' && <div className={styles.statusMessage}>Not started</div>}

      {rewards.status === 'in_progress' && <div className={styles.statusMessage}>In progress</div>}

      {showRewards && !hasRewards && <div className={styles.statusMessage}>No rewards yet</div>}

      {showRewards && hasRewards && (
        <div className={styles.rewardsList}>
          {[3, 2, 1].map((points) => {
            const players = bonusGrouped.get(points)
            if (!players || players.length === 0) return null
            return (
              <div key={points} className={styles.bonusRow}>
                <Award size={16} color={MEDAL_COLORS[points]} />
                <span className={styles.bonusPoints}>{points}:</span>
                <span className={styles.playerNames}>
                  {players.map((p) => p.webName).join(', ')}
                </span>
              </div>
            )
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
  )
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
  )

  // Defensive check for undefined or empty maps
  if (!playersMap || !teamsMap || playersMap.size === 0 || teamsMap.size === 0) {
    return null
  }

  const allRewards = extractAllFixtureRewards(fixtures, playersMap, teamsMapForRewards, liveData)

  if (allRewards.length === 0) {
    return null
  }

  return (
    <div className={styles.GameRewards}>
      <h3 className={styles.title}>
        <Trophy size={16} color="#FFD700" />
        Game Rewards
      </h3>
      <div className={styles.fixtureGrid}>
        {allRewards.map((rewards) => (
          <FixtureCard key={rewards.fixture.id} rewards={rewards} />
        ))}
      </div>
    </div>
  )
}
