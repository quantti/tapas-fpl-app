import type { Gameweek } from '../types/fpl';
import type { ManagerGameweekData } from '../hooks/useFplData';
import * as styles from './GameweekDetails.module.css';

interface Props {
  gameweek: Gameweek;
  managerDetails: ManagerGameweekData[];
}

export function GameweekDetails({ gameweek, managerDetails }: Props) {
  const sortedManagers = [...managerDetails].sort((a, b) => b.gameweekPoints - a.gameweekPoints);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Gameweek {gameweek.id}</h2>
        <span className={styles.deadline}>
          {new Date(gameweek.deadline_time).toLocaleDateString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })}
        </span>
      </div>

      {/* Top row: Chips and Hits side by side */}
      <div className={styles.topRow}>
        <div className={styles.miniSection}>
          <h3 className={styles.miniTitle}>🎯 Chips</h3>
          {managerDetails.filter(m => m.activeChip).length === 0 ? (
            <span className={styles.emptyMessage}>None</span>
          ) : (
            <div className={styles.tagList}>
              {managerDetails
                .filter(m => m.activeChip)
                .map(m => (
                  <div key={m.managerId} className={styles.tag}>
                    <span className={styles.tagBadge}>{formatChipShort(m.activeChip!)}</span>
                    <span className={styles.tagName}>{m.teamName}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className={styles.miniSection}>
          <h3 className={styles.miniTitle}>💸 Hits</h3>
          {managerDetails.filter(m => m.transfersCost > 0).length === 0 ? (
            <span className={styles.emptyMessage}>None</span>
          ) : (
            <div className={styles.tagList}>
              {managerDetails
                .filter(m => m.transfersCost > 0)
                .sort((a, b) => b.transfersCost - a.transfersCost)
                .map(m => (
                  <div key={m.managerId} className={`${styles.tag} ${styles.hitTag}`}>
                    <span className={styles.hitBadge}>-{m.transfersCost}</span>
                    <span className={styles.tagName}>{m.teamName}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Main row: Transfers and Captains side by side */}
      <div className={styles.mainRow}>
        <div className={styles.transfersPanel}>
          <h3 className={styles.panelTitle}>🔄 Transfers</h3>
          {managerDetails.filter(m => m.transfersIn.length > 0).length === 0 ? (
            <p className={styles.emptyMessage}>No transfers this GW</p>
          ) : (
            <div className={styles.transfersList}>
              {managerDetails
                .filter(m => m.transfersIn.length > 0)
                .map(m => (
                  <div key={m.managerId} className={styles.transferItem}>
                    <span className={styles.transferTeam}>{m.teamName}</span>
                    <div className={styles.transferMoves}>
                      {m.transfersIn.map((playerIn, idx) => (
                        <span key={playerIn.id} className={styles.transferMove}>
                          <span className={styles.out}>{m.transfersOut[idx]?.web_name || '?'}</span>
                          <span className={styles.arrow}>→</span>
                          <span className={styles.in}>{playerIn.web_name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className={styles.captainsPanel}>
          <h3 className={styles.panelTitle}>©️ Captains</h3>
          <div className={styles.captainsList}>
            {sortedManagers.map(m => (
              <div key={m.managerId} className={styles.captainRow}>
                <span className={styles.teamName}>{m.teamName}</span>
                <span className={styles.captainName}>{m.captain?.web_name || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row: Team values and Total Hits */}
      <div className={styles.bottomRow}>
        <div className={styles.valuesPanel}>
          <h3 className={styles.panelTitle}>💰 Team Values</h3>
          <div className={styles.valuesList}>
            {[...sortedManagers]
              .sort((a, b) => (b.teamValue + b.bank) - (a.teamValue + a.bank))
              .map((m, index) => (
                <div key={m.managerId} className={styles.valueRow}>
                  <span className={styles.valueRank}>{index + 1}</span>
                  <span className={styles.valueName}>{m.teamName}</span>
                  <span className={styles.valueAmount}>£{(m.teamValue + m.bank).toFixed(1)}m</span>
                </div>
              ))}
          </div>
        </div>

        <div className={styles.hitsPanel}>
          <h3 className={styles.panelTitle}>🔥 Total Hits</h3>
          <div className={styles.hitsList}>
            {[...managerDetails]
              .sort((a, b) => b.totalHitsCost - a.totalHitsCost)
              .map((m, index) => (
                <div key={m.managerId} className={styles.hitsRow}>
                  <span className={styles.hitsRank}>{index + 1}</span>
                  <span className={styles.hitsName}>{m.teamName}</span>
                  <span className={styles.hitsAmount}>-{m.totalHitsCost}</span>
                </div>
              ))}
          </div>
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
