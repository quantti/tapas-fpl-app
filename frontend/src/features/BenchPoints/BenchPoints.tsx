import { Armchair } from 'lucide-react';
import { useMemo } from 'react';

import { Card } from 'components/Card';
import { CardHeader } from 'components/CardHeader';
import { CardRow } from 'components/CardRow';

import { useLeagueStats } from 'services/queries/useLeagueStats';

import * as styles from './BenchPoints.module.css';

interface Props {
  leagueId: number;
  currentGameweek: number;
}

export function BenchPoints({ leagueId, currentGameweek }: Props) {
  const { benchPoints, isLoading, error, isBackendUnavailable } = useLeagueStats(
    leagueId,
    currentGameweek
  );

  // Sort by most bench points (descending) - these are "wasted" points
  const sortedData = useMemo(
    () => [...benchPoints].sort((a, b) => b.benchPoints - a.benchPoints),
    [benchPoints]
  );

  // Don't render if no data or backend unavailable (silent fail)
  if (benchPoints.length === 0 || isBackendUnavailable) return null;

  const totalBenchPoints = sortedData.reduce((sum, d) => sum + d.benchPoints, 0);

  return (
    <Card>
      <CardHeader
        icon={<Armchair size={16} color="#6B8CAE" />}
        action={!isLoading && <span className={styles.total}>{totalBenchPoints} pts</span>}
      >
        Bench Points
      </CardHeader>
      {isLoading && <p className={styles.loading}>Loading...</p>}
      {!isLoading && error && <p className={styles.error}>{error}</p>}
      {!isLoading && !error && (
        <div className={styles.list}>
          {sortedData.map((data, index) => (
            <CardRow
              key={data.managerId}
              rank={index + 1}
              label={data.name}
              value={data.benchPoints}
              valueColor="warning"
            />
          ))}
        </div>
      )}
    </Card>
  );
}
