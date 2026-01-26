import { GhostIcon } from 'lucide-react';

import { Card } from 'components/Card';
import { CardHeader } from 'components/CardHeader';

import * as styles from './SetAndForget.module.css';
import { useSetAndForget, type SetAndForgetManagerCamel } from './useSetAndForget';

interface Props {
  leagueId: number;
  currentGameweek: number;
  /** Map of manager ID to team name for display */
  managerNames: Map<number, string>;
}

function formatDifference(diff: number): string {
  if (diff > 0) return `+${diff}`;
  return String(diff);
}

function getDifferenceClass(diff: number): string {
  if (diff > 0) return styles.positive;
  if (diff < 0) return styles.negative;
  return styles.neutral;
}

function ManagerRow({
  manager,
  name,
  rank,
}: {
  manager: SetAndForgetManagerCamel;
  name: string;
  rank: number;
}) {
  return (
    <tr className={styles.row}>
      <td className={styles.rank}>{rank}</td>
      <td className={styles.name}>{name}</td>
      <td className={styles.points}>{manager.actualPoints}</td>
      <td className={styles.points}>{manager.totalPoints}</td>
      <td className={`${styles.difference} ${getDifferenceClass(manager.difference)}`}>
        {formatDifference(manager.difference)}
      </td>
    </tr>
  );
}

export function SetAndForget({ leagueId, currentGameweek, managerNames }: Props) {
  const { managers, isLoading, error, isBackendUnavailable } = useSetAndForget(
    leagueId,
    currentGameweek
  );

  if (isLoading) {
    return (
      <Card>
        <div className={styles.SetAndForget}>
          <CardHeader icon={<GhostIcon size={16} color="#9CA3AF" />}>Set and Forget</CardHeader>
          <div className={styles.loading}>Loading...</div>
        </div>
      </Card>
    );
  }

  if (error || managers.length === 0 || isBackendUnavailable) {
    return null;
  }

  return (
    <Card data-testid="set-and-forget">
      <div className={styles.SetAndForget}>
        <CardHeader
          icon={<GhostIcon size={16} color="#9CA3AF" />}
          tooltip="Hypothetical points if you kept your GW1 squad all season with no transfers"
        >
          Set and Forget
        </CardHeader>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.headerRank}>#</th>
                <th className={styles.headerName}>Manager</th>
                <th className={styles.headerPoints}>Actual</th>
                <th className={styles.headerPoints}>S&amp;F</th>
                <th className={styles.headerDiff}>+/-</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((manager, index) => (
                <ManagerRow
                  key={manager.managerId}
                  manager={manager}
                  name={managerNames.get(manager.managerId) ?? `Manager ${manager.managerId}`}
                  rank={index + 1}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className={styles.caption}>
          Positive = transfers cost you points. Negative = transfers helped.
        </p>
      </div>
    </Card>
  );
}
