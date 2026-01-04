import clsx from 'clsx';
import { Crown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Card } from 'components/Card';
import { CardHeader } from 'components/CardHeader';
import { CardRow } from 'components/CardRow';

import { useCaptainDifferential } from 'services/queries/useCaptainSuccess';

import * as styles from './CaptainSuccess.module.css';
import { CaptainDifferentialModal } from './components/DifferentialModal';

import type { DifferentialPick } from 'services/queries/useCaptainSuccess';
import type { ManagerGameweekData } from 'services/queries/useFplData';
import type { Gameweek, Player } from 'types/fpl';

interface Props {
  managerDetails: ManagerGameweekData[];
  currentGameweek: number;
  gameweeks: Gameweek[];
  playersMap: Map<number, Player>;
}

interface ModalState {
  isOpen: boolean;
  teamName: string;
  details: DifferentialPick[];
  totalGain: number;
}

export function CaptainSuccess({ managerDetails, currentGameweek, gameweeks, playersMap }: Props) {
  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    teamName: '',
    details: [],
    totalGain: 0,
  });

  const managerIds = useMemo(
    () => managerDetails.map((m) => ({ id: m.managerId, teamName: m.teamName })),
    [managerDetails]
  );

  const { stats, loading, error } = useCaptainDifferential(
    managerIds,
    currentGameweek,
    gameweeks,
    playersMap
  );

  // Sort by differential gain (highest first - best differential pickers)
  const sortedData = useMemo(
    () => [...stats].sort((a, b) => b.differentialGain - a.differentialGain),
    [stats]
  );

  if (managerDetails.length === 0) return null;

  // Check if anyone made differential picks
  const totalDifferentialPicks = sortedData.reduce((sum, d) => sum + d.differentialPicks, 0);

  return (
    <Card>
      <CardHeader icon={<Crown size={16} color="#FFD700" />}>Differential Captains</CardHeader>
      {loading && <p className={styles.loading}>Loading...</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}
      {!loading && !error && totalDifferentialPicks === 0 && (
        <p className={styles.empty}>No differential picks yet</p>
      )}
      {!loading && !error && totalDifferentialPicks > 0 && (
        <div className={styles.list}>
          {sortedData
            .filter((d) => d.differentialPicks > 0)
            .map((data, index) => (
              <CardRow
                key={data.managerId}
                rank={index + 1}
                label={data.teamName}
                onClick={() =>
                  setModal({
                    isOpen: true,
                    teamName: data.teamName,
                    details: data.details,
                    totalGain: data.differentialGain,
                  })
                }
              >
                <span className={styles.stats}>
                  <span className={styles.picks}>{data.differentialPicks}×</span>
                  <span
                    className={clsx(
                      styles.gain,
                      data.differentialGain >= 0 ? styles.positive : styles.negative
                    )}
                  >
                    {data.differentialGain >= 0 ? '+' : ''}
                    {data.differentialGain}
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
