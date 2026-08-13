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
    </section>
  );
}
