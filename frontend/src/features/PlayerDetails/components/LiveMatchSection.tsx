import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

import * as styles from './LiveMatchSection.module.css';

import type { PlayerLiveStats } from 'hooks/usePlayerLiveStats';

interface Props {
  stats: PlayerLiveStats;
}

/**
 * Format identifier for display (e.g., 'goals_scored' -> 'Goals')
 */
function formatStatName(identifier: string): string {
  const mapping: Record<string, string> = {
    minutes: 'Minutes',
    goals_scored: 'Goals',
    assists: 'Assists',
    clean_sheets: 'Clean Sheet',
    goals_conceded: 'Goals Conceded',
    own_goals: 'Own Goals',
    penalties_saved: 'Penalties Saved',
    penalties_missed: 'Penalties Missed',
    yellow_cards: 'Yellow Card',
    red_cards: 'Red Card',
    saves: 'Saves',
    bonus: 'Bonus',
    bps: 'BPS',
  };
  return mapping[identifier] ?? identifier.replace(/_/g, ' ');
}

/**
 * Stats where showing a count/multiplier makes sense (e.g., "2 goals")
 * Minutes and bonus don't need multipliers shown
 */
const COUNTABLE_STATS = new Set([
  'goals_scored',
  'assists',
  'goals_conceded',
  'own_goals',
  'penalties_saved',
  'penalties_missed',
  'saves',
]);

/**
 * LiveMatchSection - Pure presentation component for live match stats.
 *
 * Shows match status, live points, in-game events (goals/assists/cards),
 * provisional bonus, and DefCon indicator when a player's match has started.
 */
export function LiveMatchSection({ stats }: Props) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Don't render if player isn't in a started match
  if (!stats.isLive) {
    return null;
  }

  const {
    isInProgress,
    minutes,
    totalPoints,
    goals,
    assists,
    yellowCards,
    redCards,
    officialBonus,
    provisionalBonus,
    showProvisionalBonus,
    metDefCon,
    explain,
  } = stats;

  // Determine which bonus to show
  const bonusToShow = officialBonus > 0 ? officialBonus : provisionalBonus;
  const isProvisionalBonus = officialBonus === 0 && provisionalBonus > 0;

  // Filter explain stats to show meaningful ones (non-zero points)
  const meaningfulStats = explain.filter((s) => s.points !== 0);

  return (
    <section className={styles.LiveMatchSection} data-testid="live-match-section">
      {/* Header row: Status badge + minutes + points */}
      <div className={styles.header}>
        <div className={styles.statusGroup}>
          {isInProgress ? (
            <span className={styles.liveBadge}>LIVE</span>
          ) : (
            <span className={styles.ftBadge}>FT</span>
          )}
          <span className={styles.minutes}>{minutes}&apos;</span>
        </div>
        <span className={styles.points}>
          <strong>{totalPoints}</strong> pts
        </span>
      </div>

      {/* Stats row: Events + BPS + Bonus + DefCon */}
      <div className={styles.statsRow}>
        {/* In-game events */}
        <div className={styles.events}>
          {goals > 0 && (
            <span className={styles.event} title={`${goals} goal${goals > 1 ? 's' : ''}`}>
              <span className={styles.eventIcon}>⚽</span>
              {goals > 1 && <span className={styles.eventCount}>{goals}</span>}
            </span>
          )}
          {assists > 0 && (
            <span className={styles.event} title={`${assists} assist${assists > 1 ? 's' : ''}`}>
              <span className={styles.assistIcon}>A</span>
              {assists > 1 && <span className={styles.eventCount}>{assists}</span>}
            </span>
          )}
          {yellowCards > 0 && (
            <span className={styles.event} title="Yellow card">
              <span className={styles.yellowCard} />
            </span>
          )}
          {redCards > 0 && (
            <span className={styles.event} title="Red card">
              <span className={styles.redCard} />
            </span>
          )}
        </div>

        {/* Bonus badge (provisional or official) */}
        {showProvisionalBonus && bonusToShow > 0 && (
          <span
            className={`${styles.bonusBadge} ${isProvisionalBonus ? styles.provisional : ''}`}
            title={isProvisionalBonus ? 'Provisional bonus' : 'Bonus points'}
          >
            B{bonusToShow}
          </span>
        )}

        {/* DefCon badge */}
        {metDefCon && (
          <span className={styles.defconBadge} title="DefCon threshold met">
            DC
          </span>
        )}
      </div>

      {/* Expandable point breakdown */}
      {meaningfulStats.length > 0 && (
        <div className={styles.breakdown}>
          <button
            type="button"
            className={styles.expandButton}
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
          >
            Point breakdown
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {isExpanded && (
            <ul className={styles.breakdownList}>
              {meaningfulStats.map((stat, index) => (
                <li key={`${stat.identifier}-${index}`} className={styles.breakdownItem}>
                  <span className={styles.breakdownName}>{formatStatName(stat.identifier)}</span>
                  <span className={styles.breakdownValue}>
                    {COUNTABLE_STATS.has(stat.identifier) && stat.value > 1 && `${stat.value}× `}
                    <strong className={stat.points > 0 ? styles.positive : styles.negative}>
                      {stat.points > 0 ? '+' : ''}
                      {stat.points}
                    </strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
