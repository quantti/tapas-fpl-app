import { Zap } from 'lucide-react';
import { useMemo } from 'react';

import { CHIP_LABELS, getRemainingChips } from 'utils/chips';

import { Card } from './Card';
import { CardHeader } from './CardHeader';
import { CardRow } from './CardRow';
import * as styles from './ChipsRemaining.module.css';

import type { ManagerGameweekData } from 'services/queries/useFplData';

interface Props {
  managerDetails: ManagerGameweekData[];
  currentGameweek: number;
  deadlineTime?: string;
}

export function ChipsRemaining({ managerDetails, currentGameweek, deadlineTime }: Props) {
  // Determine which half of the season we're in (2025/26 rules: full chip reset at GW20)
  // Second half starts when GW19 deadline passes (chips for GW20+ available)
  const isSecondHalf = useMemo(() => {
    if (currentGameweek >= 20) return true;
    if (currentGameweek === 19 && deadlineTime) {
      return new Date() > new Date(deadlineTime);
    }
    return false;
  }, [currentGameweek, deadlineTime]);

  // Calculate remaining chips for each manager
  const managersWithChips = managerDetails
    .map((manager) => ({
      ...manager,
      remainingChips: getRemainingChips(manager.chipsUsed, isSecondHalf),
    }))
    .filter((manager) => manager.remainingChips.length > 0)
    .sort((a, b) => a.rank - b.rank);

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
          <CardRow key={manager.managerId} label={manager.teamName}>
            <div className={styles.chips}>
              {manager.remainingChips.map((chip, index) => (
                <span key={`${chip}-${index}`} className={styles.chip}>
                  {CHIP_LABELS[chip] || chip}
                </span>
              ))}
            </div>
          </CardRow>
        ))}
      </div>
    </Card>
  );
}
