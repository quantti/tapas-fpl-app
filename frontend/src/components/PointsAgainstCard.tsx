import { Shield } from 'lucide-react';
import { useMemo, useState } from 'react';

import { usePointsAgainst } from 'services/queries/usePointsAgainst';

import { Card } from './Card';
import { CardHeader } from './CardHeader';
import { LoadingState } from './LoadingState';
import * as styles from './PointsAgainstCard.module.css';

import type { TeamPointsAgainst } from 'services/backendApi';

type SortField = 'total' | 'home' | 'away' | 'avg';

/**
 * Displays FPL Points Against for all Premier League teams.
 *
 * Points Against tracks how many total FPL fantasy points have been
 * scored against each team. Teams that concede more FPL points are
 * easier captain targets (weaker defenses from an FPL perspective).
 *
 * Uses sortable columns to help identify captain targets and avoid
 * players facing strong defenses.
 */
export function PointsAgainstCard() {
  const { teams, isLoading, error, isBackendUnavailable } = usePointsAgainst();
  const [sortField, setSortField] = useState<SortField>('total');

  // Sort teams by selected field (highest first = weakest defense)
  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) => {
      switch (sortField) {
        case 'total':
          return b.total_points - a.total_points;
        case 'home':
          return b.home_points - a.home_points;
        case 'away':
          return b.away_points - a.away_points;
        case 'avg':
          return b.avg_per_match - a.avg_per_match;
        default:
          return 0;
      }
    });
  }, [teams, sortField]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader icon={<Shield size={16} color="#EF4444" />}>Points Against</CardHeader>
        <LoadingState message="Loading points against data..." />
      </Card>
    );
  }

  if (isBackendUnavailable) {
    return (
      <Card>
        <CardHeader icon={<Shield size={16} color="#EF4444" />}>Points Against</CardHeader>
        <div className={styles.PointsAgainstCard}>
          <div className={styles.unavailable}>
            <p>Points Against data is temporarily unavailable.</p>
            <p className={styles.hint}>Database connection required.</p>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader icon={<Shield size={16} color="#EF4444" />}>Points Against</CardHeader>
        <div className={styles.PointsAgainstCard}>
          <div className={styles.error}>
            <p>Failed to load Points Against data.</p>
            <p className={styles.hint}>Try refreshing the page.</p>
          </div>
        </div>
      </Card>
    );
  }

  if (teams.length === 0) {
    return (
      <Card>
        <CardHeader icon={<Shield size={16} color="#EF4444" />}>Points Against</CardHeader>
        <div className={styles.PointsAgainstCard}>
          <div className={styles.empty}>
            <p>No data available yet.</p>
            <p className={styles.hint}>Data collection may not have run.</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader icon={<Shield size={16} color="#EF4444" />}>Points Against</CardHeader>
      <div className={styles.PointsAgainstCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table} aria-label="Points conceded by team">
            <thead>
              <tr>
                <th scope="col" className={styles.teamHeader}>
                  Team
                </th>
                <SortableHeader
                  field="total"
                  label="Total"
                  currentSort={sortField}
                  onSort={setSortField}
                />
                <SortableHeader
                  field="home"
                  label="Home"
                  currentSort={sortField}
                  onSort={setSortField}
                />
                <SortableHeader
                  field="away"
                  label="Away"
                  currentSort={sortField}
                  onSort={setSortField}
                />
                <SortableHeader
                  field="avg"
                  label="Avg"
                  currentSort={sortField}
                  onSort={setSortField}
                />
              </tr>
            </thead>
            <tbody>
              {sortedTeams.map((team, index) => (
                <TeamRow key={team.team_id} team={team} rank={index + 1} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

interface SortableHeaderProps {
  field: SortField;
  label: string;
  currentSort: SortField;
  onSort: (field: SortField) => void;
}

function SortableHeader({ field, label, currentSort, onSort }: SortableHeaderProps) {
  const isActive = currentSort === field;

  return (
    <th scope="col" className={styles.sortableHeader} data-active={isActive || undefined}>
      <button type="button" className={styles.sortButton} onClick={() => onSort(field)}>
        {label}
        {isActive && <span className={styles.sortIndicator}>▼</span>}
      </button>
    </th>
  );
}

interface TeamRowProps {
  team: TeamPointsAgainst;
  rank: number;
}

function TeamRow({ team, rank }: TeamRowProps) {
  // Color intensity based on rank (1 = worst defense = most red)
  const getIntensity = (r: number) => {
    if (r <= 5) return 'high'; // Top 5 worst defenses
    if (r <= 10) return 'medium';
    if (r <= 15) return 'low';
    return 'none'; // Best 5 defenses
  };

  const intensity = getIntensity(rank);

  return (
    <tr className={styles.row} data-intensity={intensity}>
      <td className={styles.teamCell}>
        <span className={styles.rank}>{rank}</span>
        <span className={styles.teamName}>{team.short_name}</span>
      </td>
      <td className={styles.valueCell}>{team.total_points}</td>
      <td className={styles.valueCell}>{team.home_points}</td>
      <td className={styles.valueCell}>{team.away_points}</td>
      <td className={styles.valueCell}>{team.avg_per_match.toFixed(1)}</td>
    </tr>
  );
}
