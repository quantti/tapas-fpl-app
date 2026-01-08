import clsx from 'clsx';
import { Crown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Card } from 'components/Card';
import { CardHeader } from 'components/CardHeader';
import { CardRow } from 'components/CardRow';

import { useLeagueStats } from 'services/queries/useLeagueStats';

import { transformKeys } from 'utils/caseTransform';

import * as styles from './CaptainSuccess.module.css';
import { CaptainDifferentialModal } from './components/DifferentialModal';

import type { CaptainDifferentialDetail, CaptainDifferentialStat } from 'services/backendApi';
import type { CamelCaseKeys } from 'utils/caseTransform';

interface Props {
  leagueId: number;
  currentGameweek: number;
}

/** Frontend camelCase version of backend types */
type DifferentialPick = CamelCaseKeys<CaptainDifferentialDetail>;
type DifferentialStat = CamelCaseKeys<CaptainDifferentialStat>;

interface ModalState {
  isOpen: boolean;
  teamName: string;
  details: DifferentialPick[];
  totalGain: number;
}

export function CaptainSuccess({ leagueId, currentGameweek }: Props) {
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    teamName: '',
    details: [],
    totalGain: 0,
  });

  const { captainDifferential, isLoading, error, isBackendUnavailable } = useLeagueStats(
    leagueId,
    currentGameweek
  );

  // Transform backend snake_case to frontend camelCase
  const data: DifferentialStat[] = useMemo(
    () => transformKeys(captainDifferential),
    [captainDifferential]
  );

  // Sort by differential gain (highest first - best differential pickers)
  const sortedData = useMemo(() => [...data].sort((a, b) => b.gain - a.gain), [data]);

  // Check if anyone made differential picks
  const totalDifferentialPicks = sortedData.reduce((sum, d) => sum + d.differentialPicks, 0);

  return (
    <Card>
      <CardHeader icon={<Crown size={16} color="#FFD700" />}>Differential Captains</CardHeader>
      {isLoading && <p className={styles.loading}>Loading...</p>}
      {!isLoading && error && <p className={styles.error}>{error}</p>}
      {!isLoading && isBackendUnavailable && (
        <p className={styles.empty}>Backend unavailable - check back later</p>
      )}
      {!isLoading && !error && !isBackendUnavailable && totalDifferentialPicks === 0 && (
        <p className={styles.empty}>No differential picks yet</p>
      )}
      {!isLoading && !error && !isBackendUnavailable && totalDifferentialPicks > 0 && (
        <div className={styles.list}>
          {sortedData
            .filter((d) => d.differentialPicks > 0)
            .map((stat, index) => (
              <CardRow
                key={stat.managerId}
                rank={index + 1}
                label={stat.name}
                onClick={() =>
                  setModal({
                    isOpen: true,
                    teamName: stat.name,
                    details: stat.details,
                    totalGain: stat.gain,
                  })
                }
              >
                <span className={styles.stats}>
                  <span className={styles.picks}>{stat.differentialPicks}×</span>
                  <span
                    className={clsx(
                      styles.gain,
                      stat.gain >= 0 ? styles.positive : styles.negative
                    )}
                  >
                    {stat.gain >= 0 ? '+' : ''}
                    {stat.gain}
                  </span>
                </span>
              </CardRow>
            ))}
        </div>
      )}
      <CaptainDifferentialModal
        isOpen={modal.isOpen}
        onClose={() => setModal((prev) => ({ ...prev, isOpen: false }))}
        teamName={modal.teamName}
        details={modal.details}
        totalGain={modal.totalGain}
      />
    </Card>
  );
}
