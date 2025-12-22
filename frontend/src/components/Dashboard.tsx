import { useFplData } from '../hooks/useFplData'
import { LeagueStandings } from './LeagueStandings'
import { GameweekDetails } from './GameweekDetails'
import { ChipsRemaining } from './ChipsRemaining'
import * as styles from './Dashboard.module.css'

export function Dashboard() {
  const {
    standings,
    managerDetails,
    currentGameweek,
    isLive,
    loading,
    error,
    lastUpdated,
    refresh,
  } = useFplData()

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading league data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h3>Error loading data</h3>
          <p>{error}</p>
          <button onClick={refresh} className={styles.retryButton}>
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!standings || !currentGameweek) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <h3>No data available</h3>
          <p>Could not load league standings.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* Status Bar */}
      <div className={styles.statusBar}>
        <div className={styles.statusInfo}>
          <span className={styles.gameweekLabel}>GW{currentGameweek.id}</span>
          {isLive && <span className={styles.liveIndicator}>● Live</span>}
          {lastUpdated && (
            <span className={styles.lastUpdated}>Updated {formatTimeAgo(lastUpdated)}</span>
          )}
        </div>
        <button onClick={refresh} className={styles.refreshButton}>
          ↻ Refresh
        </button>
      </div>

      {/* Main Content */}
      <div className={styles.grid}>
        <div className={styles.mainColumn}>
          <LeagueStandings standings={standings} managerDetails={managerDetails} isLive={isLive} gameweek={currentGameweek.id} />
        </div>
        <div className={styles.sideColumn}>
          <GameweekDetails gameweek={currentGameweek} managerDetails={managerDetails} />
          <ChipsRemaining managerDetails={managerDetails} currentGameweek={currentGameweek.id} />
        </div>
      </div>
    </div>
  )
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)

  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return date.toLocaleDateString()
}
