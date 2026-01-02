import { ChipsRemaining } from 'components/ChipsRemaining';
import { FplUpdating } from 'components/FplUpdating';
import { LeagueTemplateTeam } from 'components/LeagueTemplateTeam';
import { LoadingState } from 'components/LoadingState';
import { PlayerOwnership } from 'components/PlayerOwnership';
import { StatsCards } from 'components/StatsCards';

import { BenchPoints } from 'features/BenchPoints';
import { CaptainSuccess } from 'features/CaptainSuccess';
import { FreeTransfers } from 'features/FreeTransfers';
import { LeaguePosition } from 'features/LeaguePosition';
import { PersonalStats } from 'features/PersonalStats';

import { useManagerId } from 'hooks/useManagerId';

import { useFplData } from 'services/queries/useFplData';

import * as styles from './Statistics.module.css';

export function Statistics() {
  const { managerId, isLoggedIn } = useManagerId();
  const {
    managerDetails,
    currentGameweek,
    isLoading,
    error,
    isApiUnavailable,
    bootstrap,
    playersMap,
    teamsMap,
  } = useFplData();

  // Show PersonalStats only if user is logged in AND in the mini-league
  const isUserInLeague = managerDetails.some((m) => m.managerId === managerId);
  const showPersonalStats = isLoggedIn && isUserInLeague;

  if (isLoading) {
    return (
      <div className={styles.Statistics}>
        <LoadingState message="Loading statistics..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.Statistics}>
        {isApiUnavailable ? (
          <FplUpdating />
        ) : (
          <div className={styles.error}>
            <h3>Error loading data</h3>
            <p>{error}</p>
          </div>
        )}
      </div>
    );
  }

  if (!currentGameweek) {
    return (
      <div className={styles.Statistics}>
        <div className={styles.error}>
          <h3>No data available</h3>
          <p>Could not load statistics.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.Statistics}>
      <h1 className={styles.title}>Statistics</h1>
      <div className={styles.statsGrid} data-testid="stats-grid">
        <StatsCards managerDetails={managerDetails} />
        {showPersonalStats && managerId && (
          <PersonalStats
            managerId={managerId}
            managerDetails={managerDetails}
            gameweeks={bootstrap?.events ?? []}
            playersMap={playersMap}
          />
        )}
        <BenchPoints managerDetails={managerDetails} currentGameweek={currentGameweek.id} />
        <CaptainSuccess
          managerDetails={managerDetails}
          currentGameweek={currentGameweek.id}
          gameweeks={bootstrap?.events ?? []}
          playersMap={playersMap}
        />
        <ChipsRemaining
          managerDetails={managerDetails}
          currentGameweek={currentGameweek.id}
          deadlineTime={currentGameweek.deadline_time}
        />
        <FreeTransfers
          managerDetails={managerDetails}
          currentGameweek={currentGameweek.id}
          deadlineTime={currentGameweek.deadline_time}
        />
        <LeaguePosition managerDetails={managerDetails} currentGameweek={currentGameweek.id} />
        <PlayerOwnership
          managerDetails={managerDetails}
          playersMap={playersMap}
          teamsMap={teamsMap}
        />
        <LeagueTemplateTeam
          managerDetails={managerDetails}
          playersMap={playersMap}
          teamsMap={teamsMap}
        />
      </div>
    </div>
  );
}
