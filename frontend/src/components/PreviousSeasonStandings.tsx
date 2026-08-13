import clsx from 'clsx';

import { CURRENT_SEASON_ID, LEAGUE_IDS, SEASON_LABELS } from 'src/config';
import { usePreviousSeasonStandings } from 'services/queries/usePreviousSeasonStandings';

import * as styles from './PreviousSeasonStandings.module.css';

export function PreviousSeasonStandings() {
  const seasonId = CURRENT_SEASON_ID - 1;
  const leagueId = LEAGUE_IDS[seasonId] ?? 0;
  const { standings, isLoading, error } = usePreviousSeasonStandings(leagueId, { seasonId });

  if (isLoading || error || standings.length === 0) return null;

  const maxPoints = standings[0].totalPoints;
  const minPoints = standings[standings.length - 1].totalPoints;

  return (
    <section className={styles.PreviousSeasonStandings}>
      <div className={styles.header}>
        <h3 className={styles.title}>Final Standings {SEASON_LABELS[seasonId]}</h3>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.colRank}>#</th>
            <th>Team</th>
            <th>Manager</th>
            <th className={styles.colPoints}>Points</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((entry, index) => (
            <tr
              key={entry.managerId}
              className={clsx({
                [styles.winner]: entry.totalPoints === maxPoints,
                [styles.last]: standings.length > 1 && entry.totalPoints === minPoints,
              })}
            >
              <td className={styles.rank}>{index + 1}</td>
              <td>{entry.teamName}</td>
              <td className={styles.manager}>{entry.managerName}</td>
              <td className={styles.points}>{entry.totalPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.annotation}>
        <span className={styles.relegatedText}>Relegated, exiles in Cadiz.</span>
        <svg
          className={styles.arrowSvg}
          viewBox="0 0 40 32"
          width="34"
          height="28"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6,26 H23 Q32,26 32,17 V13"
            stroke="var(--color-error)"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M32,7 L27,15 H38 Z" fill="var(--color-error)" />
        </svg>
      </div>
    </section>
  );
}
