import clsx from 'clsx';
import { Zap, TrendingDown, Copyright } from 'lucide-react';
import { useMemo } from 'react';

import { formatDate } from '../config/locale';

import * as styles from './GameweekDetails.module.css';

import type { ManagerGameweekData } from 'services/queries/useFplData';
import type { Gameweek, Fixture } from 'types/fpl';

interface Props {
  gameweek: Gameweek;
  managerDetails: ManagerGameweekData[];
  fixtures: Fixture[];
}

export function GameweekDetails({ gameweek, managerDetails, fixtures }: Props) {
  const sortedManagers = [...managerDetails].sort((a, b) => b.gameweekPoints - a.gameweekPoints);

  const dateRange = useMemo(() => {
    const gwFixtures = fixtures.filter((f) => f.event === gameweek.id && f.kickoff_time);
    if (gwFixtures.length === 0) return null;

    const kickoffs = gwFixtures.map((f) => new Date(f.kickoff_time!).getTime());
    const firstDate = new Date(Math.min(...kickoffs));
    const lastDate = new Date(Math.max(...kickoffs));

    const formatOpts = { day: 'numeric', month: 'short' } as const;

    // Same day
    if (firstDate.toDateString() === lastDate.toDateString()) {
      return formatDate(firstDate.toISOString(), formatOpts);
    }

    // Same month
    if (firstDate.getMonth() === lastDate.getMonth()) {
      return `${firstDate.getDate()}-${formatDate(lastDate.toISOString(), formatOpts)}`;
    }

    // Different months
    return `${formatDate(firstDate.toISOString(), formatOpts)} - ${formatDate(lastDate.toISOString(), formatOpts)}`;
  }, [fixtures, gameweek.id]);

  return (
    <div className={styles.GameweekDetails}>
      <div className={styles.header}>
        <h2 className={styles.title}>Gameweek {gameweek.id}</h2>
        {dateRange && <span className={styles.deadline}>{dateRange}</span>}
      </div>

      {/* Top row: Chips and Hits side by side */}
      <div className={styles.topRow}>
        <div className={styles.miniSection}>
          <h3 className={styles.miniTitle}>
            <Zap size={16} color="#FFE033" fill="#FFE033" /> Chips
          </h3>
          {managerDetails.filter((m) => m.activeChip).length === 0 ? (
            <span className={styles.emptyMessage}>None</span>
          ) : (
            <div className={styles.tagList}>
              {managerDetails
                .filter((m) => m.activeChip)
                .map((m) => (
                  <div key={m.managerId} className={styles.tag}>
                    <span className={styles.tagBadge}>{formatChipShort(m.activeChip!)}</span>
                    <span className={styles.tagName}>{m.teamName}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className={styles.miniSection}>
          <h3 className={styles.miniTitle}>
            <TrendingDown size={16} color="var(--color-error)" /> Hits
          </h3>
          {managerDetails.filter((m) => m.transfersCost > 0).length === 0 ? (
            <span className={styles.emptyMessage}>None</span>
          ) : (
            <div className={styles.tagList}>
              {managerDetails
                .filter((m) => m.transfersCost > 0)
                .sort((a, b) => b.transfersCost - a.transfersCost)
                .map((m) => (
                  <div key={m.managerId} className={clsx(styles.tag, styles.hitTag)}>
                    <span className={styles.hitBadge}>-{m.transfersCost}</span>
                    <span className={styles.tagName}>{m.teamName}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Captains */}
      <div className={styles.captainsPanel}>
        <h3 className={styles.panelTitle}>
          <Copyright size={16} /> Captains
        </h3>
        <div className={styles.captainsList}>
          {sortedManagers.map((m) => (
            <div key={m.managerId} className={styles.captainRow}>
              <span className={styles.teamName}>{m.teamName}</span>
              <span className={styles.captainName}>{m.captain?.web_name || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function formatChipShort(chip: string): string {
  const chips: Record<string, string> = {
    bboost: 'BB',
    '3xc': 'TC',
    freehit: 'FH',
    wildcard: 'WC',
  };
  return chips[chip] || chip.toUpperCase();
}
