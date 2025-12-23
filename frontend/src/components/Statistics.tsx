import { useFplData } from '../hooks/useFplData'
import { Header } from './Header'
import { StatsCards } from './StatsCards'
import { BenchPoints } from './BenchPoints'
import { CaptainSuccess } from './CaptainSuccess'
import { ChipsRemaining } from './ChipsRemaining'
import { LeaguePositionChart } from './LeaguePositionChart'
import { PlayerOwnership } from './PlayerOwnership'
import * as styles from './Statistics.module.css'

export function Statistics() {
  const {
    managerDetails,
    currentGameweek,
    loading,
    error,
    bootstrap,
    playersMap,
    teamsMap,
  } = useFplData()

  if (loading) {
    return (
      <div className={styles.container}>
        <Header />
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading statistics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Header />
        <div className={styles.error}>
          <h3>Error loading data</h3>
          <p>{error}</p>
        </div>
      </div>
    )
  }

  if (!currentGameweek) {
    return (
      <div className={styles.container}>
        <Header />
        <div className={styles.error}>
          <h3>No data available</h3>
          <p>Could not load statistics.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <Header />
      <h1 className={styles.title}>Statistics</h1>
      <div className={styles.statsGrid}>
        <StatsCards managerDetails={managerDetails} />
        <BenchPoints managerDetails={managerDetails} currentGameweek={currentGameweek.id} />
        <CaptainSuccess
          managerDetails={managerDetails}
          currentGameweek={currentGameweek.id}
          gameweeks={bootstrap?.events ?? []}
          playersMap={playersMap}
        />
        <ChipsRemaining managerDetails={managerDetails} currentGameweek={currentGameweek.id} />
        <LeaguePositionChart managerDetails={managerDetails} currentGameweek={currentGameweek.id} />
        <PlayerOwnership
          managerDetails={managerDetails}
          playersMap={playersMap}
          teamsMap={teamsMap}
        />
      </div>
    </div>
  )
}
