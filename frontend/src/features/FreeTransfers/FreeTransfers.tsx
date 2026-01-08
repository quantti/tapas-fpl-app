import { ArrowLeftRight } from 'lucide-react';
import { useMemo } from 'react';

import { Card } from 'components/Card';
import { CardHeader } from 'components/CardHeader';
import { CardRow, type ValueColor } from 'components/CardRow';

import { useLeagueStats } from 'services/queries/useLeagueStats';

import * as styles from './FreeTransfers.module.css';

/**
 * Returns color based on free transfer count:
 * 1 FT = gray (minimum)
 * 2 FT = yellow (normal)
 * 3 FT = green (banked)
 * 4+ FT = gold (max banked)
 */
function getFreeTransferColor(ft: number): ValueColor {
  if (ft <= 1) return 'muted';
  if (ft === 2) return 'warning';
  if (ft === 3) return 'success';
  return 'gold'; // 4 or 5
}

interface Props {
  leagueId: number;
  currentGameweek: number;
}

export function FreeTransfers({ leagueId, currentGameweek }: Props) {
  const { freeTransfers, isLoading, error, isBackendUnavailable } = useLeagueStats(
    leagueId,
    currentGameweek
  );

  // Sort by free transfers count (descending - most FTs first)
  const sortedData = useMemo(
    () => [...freeTransfers].sort((a, b) => b.free_transfers - a.free_transfers),
    [freeTransfers]
  );

  if (isLoading) {
    return (
      <Card>
        <div className={styles.FreeTransfers}>
          <CardHeader icon={<ArrowLeftRight size={16} color="#8B5CF6" />}>
            Free Transfers
          </CardHeader>
          <div className={styles.loading}>Loading...</div>
        </div>
      </Card>
    );
  }

  // Don't render if error, no data, or backend unavailable (silent fail)
  if (error || freeTransfers.length === 0 || isBackendUnavailable) {
    return null;
  }

  return (
    <Card data-testid="free-transfers">
      <div className={styles.FreeTransfers}>
        <CardHeader icon={<ArrowLeftRight size={16} color="#8B5CF6" />}>Free Transfers</CardHeader>
        <div className={styles.list}>
          {sortedData.map((manager) => (
            <CardRow
              key={manager.manager_id}
              label={manager.name}
              value={`${manager.free_transfers} FT`}
              valueColor={getFreeTransferColor(manager.free_transfers)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
