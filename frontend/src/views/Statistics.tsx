import { useFplData } from '../hooks/useFplData'
import { Header } from '../components/Header'
import { StatsCards } from '../components/StatsCards'
import { BenchPoints } from '../components/BenchPoints'
import { CaptainSuccess } from '../components/CaptainSuccess'
import { ChipsRemaining } from '../components/ChipsRemaining'
import { FreeTransfers } from '../components/FreeTransfers'
import { LeaguePositionChart } from '../components/LeaguePositionChart'
import { PlayerOwnership } from '../components/PlayerOwnership'
import { LeagueTemplateTeam } from '../components/LeagueTemplateTeam'
import { FplUpdating } from '../components/FplUpdating'
import { LoadingState } from '../components/LoadingState'
import * as styles from './Statistics.module.css'

export function Statistics() {
  const {
    managerDetails,
    currentGameweek,
    isLoading,
    error,
    isApiUnavailable,
    bootstrap,
    playersMap,
    teamsMap,
  } = useFplData()

  if (isLoading) {
    return (
      <div className={styles.Statistics}>
        <Header />
        <LoadingState message="Loading statistics..." />
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.Statistics}>
        <Header />
        {isApiUnavailable ? (
          <FplUpdating />
        ) : (
          <div className={styles.error}>
            <h3>Error loading data</h3>
            <p>{error}</p>
          </div>
        )}
      </div>
    )
  }

  if (!currentGameweek) {
    return (
      <div className={styles.Statistics}>
        <Header />
        <div className={styles.error}>
          <h3>No data available</h3>
          <p>Could not load statistics.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.Statistics}>
      <Header />
      <h1 className={styles.title}>Statistics</h1>
      <div className={styles.statsGrid} data-testid="stats-grid">
        <StatsCards managerDetails={managerDetails} />
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
        <LeaguePositionChart managerDetails={managerDetails} currentGameweek={currentGameweek.id} />
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
  )
}
