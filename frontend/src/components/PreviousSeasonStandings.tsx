import clsx from 'clsx';

import { CURRENT_SEASON_ID, LEAGUE_IDS, SEASON_LABELS } from 'src/config';

import { usePreviousSeasonStandings } from 'services/queries/usePreviousSeasonStandings';

import * as styles from './PreviousSeasonStandings.module.css';

/**
 * Previous season's final league table, shown during the off-season.
 * Winner row highlighted green, last place red.
 *
 * Renders nothing while loading or when the backend database is
 * unavailable (e.g. off-season pause) - the countdown still shows.
 */
export function PreviousSeasonStandings() {
  const seasonId = CURRENT_SEASON_ID - 1;
  const leagueId = LEAGUE_IDS[seasonId] ?? 0;
  const { standings, isLoading, error } = usePreviousSeasonStandings(leagueId, { seasonId });

  if (isLoading || error || standings.length === 0) return null;

  const maxPoints = standings[0].totalPoints;
  const minPoints = standings[standings.length - 1].totalPoints;
  const seasonLabel = SEASON_LABELS[seasonId] ?? `Season ${seasonId}`;

  return (
    <section className={styles.PreviousSeasonStandings}>
      <div className={styles.header}>
        <h3 className={styles.title}>Final Standings {seasonLabel}</h3>
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
          viewBox="0 0 200 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <marker
              id="arrow-red"
              markerWidth="14"
              markerHeight="10"
              refX="12"
              refY="5"
              orient="auto"
            >
              <polygon points="0 0, 14 5, 0 10" fill="var(--color-error)" />
            </marker>
          </defs>
          <path
            d="M 10,80 L 140,80 Q 170,80 170,50 L 170,15"
            stroke="var(--color-error)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#arrow-red)"
          />
        </svg>
      </div>
    </section>
  );
}
