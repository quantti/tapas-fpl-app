import { Zap } from 'lucide-react';

import { useLeagueChips } from 'services/queries/useLeagueChips';

import { CHIP_LABELS } from 'utils/chips';

import { Card } from './Card';
import { CardHeader } from './CardHeader';
import { CardRow } from './CardRow';
import * as styles from './ChipsRemaining.module.css';

interface Props {
  leagueId: number;
  currentGameweek: number;
}

export function ChipsRemaining({ leagueId, currentGameweek }: Props) {
  const { managers, currentHalf, isLoading, isBackendUnavailable } = useLeagueChips(
    leagueId,
    currentGameweek,
    { sync: true } // Sync fresh chip data on first load
  );

  // Don't render while loading or if backend is unavailable
  if (isLoading || isBackendUnavailable) {
    return null;
  }

  // Get remaining chips for the current half
  const managersWithChips = managers
    .map((manager) => {
      const halfData = currentHalf === 2 ? manager.second_half : manager.first_half;
      return {
        managerId: manager.manager_id,
        name: manager.name,
        remainingChips: halfData.chips_remaining,
      };
    })
    .filter((manager) => manager.remainingChips.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (managersWithChips.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader icon={<Zap size={16} color="#FFE033" fill="#FFE033" />}>
        Chips Remaining
      </CardHeader>
      <div className={styles.list}>
        {managersWithChips.map((manager) => (
          <CardRow key={manager.managerId} label={manager.name}>
            <div className={styles.chips}>
              {manager.remainingChips.map((chip, index) => (
                <span key={`${chip}-${index}`} className={styles.chip}>
                  {CHIP_LABELS[chip] || chip.toUpperCase()}
                </span>
              ))}
            </div>
          </CardRow>
        ))}
      </div>
    </Card>
  );
}
