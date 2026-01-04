import { ArrowLeftRight } from 'lucide-react';
import { useMemo } from 'react';

import { Card } from 'components/Card';
import { CardHeader } from 'components/CardHeader';
import { CardRow, type ValueColor } from 'components/CardRow';

import { useFreeTransfers } from 'services/queries/useFreeTransfers';

import * as styles from './FreeTransfers.module.css';

import type { ManagerGameweekData } from 'services/queries/useFplData';

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
  managerDetails: ManagerGameweekData[];
  currentGameweek: number;
  deadlineTime?: string; // ISO datetime string
}

export function FreeTransfers({ managerDetails, currentGameweek, deadlineTime }: Props) {
  // Check if deadline has passed (transfers now apply to next GW)
  const deadlinePassed = useMemo(() => {
    if (!deadlineTime) return false;
    return new Date() > new Date(deadlineTime);
  }, [deadlineTime]);

  // Extract manager IDs and names for the hook (memoized to prevent re-renders)
  const managerIds = useMemo(
    () => managerDetails.map((m) => ({ id: m.managerId, teamName: m.teamName })),
    [managerDetails]
  );

  const { freeTransfers, loading, error } = useFreeTransfers(
    managerIds,
    currentGameweek,
    deadlinePassed
  );

  if (loading) {
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

  if (error) {
    return null; // Fail silently to not break page
  }

  if (freeTransfers.length === 0) {
    return null;
  }

  // Sort by rank (use original managerDetails order which is by rank)
  const managersWithFT = freeTransfers
    .map((ft) => {
      const manager = managerDetails.find((m) => m.managerId === ft.managerId);
      return { ...ft, rank: manager?.rank ?? 999 };
    })
    .sort((a, b) => a.rank - b.rank);

  return (
    <Card data-testid="free-transfers">
      <div className={styles.FreeTransfers}>
        <CardHeader icon={<ArrowLeftRight size={16} color="#8B5CF6" />}>Free Transfers</CardHeader>
        <div className={styles.list}>
          {managersWithFT.map((manager) => (
            <CardRow
              key={manager.managerId}
              label={manager.teamName}
              value={`${manager.freeTransfers} FT`}
              valueColor={getFreeTransferColor(manager.freeTransfers)}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}
