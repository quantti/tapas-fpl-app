import { Coins, TrendingDown } from 'lucide-react';

import { Card } from './Card';
import { CardHeader } from './CardHeader';
import { RankedRow } from './RankedRow';
import * as styles from './StatsCards.module.css';

import type { ManagerGameweekData } from '../services/queries/useFplData';

interface Props {
  managerDetails: ManagerGameweekData[];
}

export function StatsCards({ managerDetails }: Props) {
  const sortedByValue = [...managerDetails].sort(
    (a, b) => b.teamValue + b.bank - (a.teamValue + a.bank)
  );
  const sortedByHits = [...managerDetails].sort((a, b) => b.totalHitsCost - a.totalHitsCost);

  return (
    <div className={styles.StatsCards}>
      <Card className={styles.card}>
        <CardHeader icon={<Coins size={16} color="#FFD700" />}>Finance</CardHeader>
        <table className={styles.financeTable}>
          <thead>
            <tr>
              <th className={styles.teamCol}>Team</th>
              <th className={styles.valueCol}>Squad</th>
              <th className={styles.valueCol}>Bank</th>
            </tr>
          </thead>
          <tbody>
            {sortedByValue.map((m) => (
              <tr key={m.managerId}>
                <td className={styles.teamCol}>{m.teamName}</td>
                <td className={styles.valueCol}>£{m.teamValue.toFixed(1)}m</td>
                <td className={styles.valueCol}>£{m.bank.toFixed(1)}m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className={styles.card}>
        <CardHeader icon={<TrendingDown size={16} color="var(--color-error)" />}>
          Total Hits
        </CardHeader>
        <div className={styles.list}>
          {sortedByHits.map((m, index) => (
            <RankedRow
              key={m.managerId}
              rank={index + 1}
              name={m.teamName}
              value={`-${m.totalHitsCost}`}
              valueColor="error"
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
