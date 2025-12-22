import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Circle } from 'lucide-react'
import { useFplData } from '../hooks/useFplData'
import { useLiveScoring } from '../hooks/useLiveScoring'
import { LeagueStandings } from './LeagueStandings'
import { GameweekDetails } from './GameweekDetails'
import { ChipsRemaining } from './ChipsRemaining'
import { StatsCards } from './StatsCards'
import { PlayerOwnership } from './PlayerOwnership'
import { BenchPoints } from './BenchPoints'
import { CaptainSuccess } from './CaptainSuccess'
import { ManagerModal } from './ManagerModal'
import { ThemeToggle } from './ThemeToggle'
import * as styles from './Dashboard.module.css'

export function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    standings,
    managerDetails,
    currentGameweek,
    isLive,
    loading,
    error,
    bootstrap,
    playersMap,
    teamsMap,
  } = useFplData()

  // Fetch live scoring data when games are in progress
  const { liveData, fixtures } = useLiveScoring(currentGameweek?.id ?? 0, isLive)

  // Check if any games are actually in progress (not just deadline passed)
  const hasGamesInProgress = fixtures.some((f) => f.started && !f.finished)

  // Modal state from URL for shareability
  const selectedManagerId = searchParams.get('manager')
    ? Number(searchParams.get('manager'))
    : null

  const handleManagerClick = useCallback(
    (managerId: number) => {
      setSearchParams({ manager: String(managerId) })
    },
    [setSearchParams]
  )

  const handleCloseModal = useCallback(() => {
    setSearchParams({})
  }, [setSearchParams])

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
          <p className={styles.errorHint}>Data will refresh automatically. Please wait.</p>
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
          {hasGamesInProgress && (
            <span className={styles.liveIndicator}>
              <Circle size={8} fill="currentColor" /> Live
            </span>
          )}
        </div>
        <ThemeToggle />
      </div>

      {/* Main Content */}
      <div className={styles.grid}>
        <div className={styles.mainColumn}>
          <LeagueStandings
            standings={standings}
            managerDetails={managerDetails}
            isLive={isLive}
            liveData={liveData}
            fixtures={fixtures}
            onManagerClick={handleManagerClick}
          />
        </div>
        <div className={styles.sideColumn}>
          <GameweekDetails gameweek={currentGameweek} managerDetails={managerDetails} fixtures={fixtures} />
        </div>
      </div>

      {/* Bottom Stats */}
      <div className={styles.bottomSection}>
        <StatsCards managerDetails={managerDetails} />
        <BenchPoints
          managerDetails={managerDetails}
          currentGameweek={currentGameweek.id}
        />
        <CaptainSuccess
          managerDetails={managerDetails}
          currentGameweek={currentGameweek.id}
          gameweeks={bootstrap?.events ?? []}
          playersMap={playersMap}
        />
        <ChipsRemaining managerDetails={managerDetails} currentGameweek={currentGameweek.id} />
        <PlayerOwnership
          managerDetails={managerDetails}
          playersMap={playersMap}
          teamsMap={teamsMap}
        />
      </div>

      {/* Manager Modal */}
      <ManagerModal
        managerId={selectedManagerId}
        gameweek={currentGameweek.id}
        onClose={handleCloseModal}
        bootstrap={bootstrap}
        liveData={liveData}
        fixtures={fixtures}
      />
    </div>
  )
}
