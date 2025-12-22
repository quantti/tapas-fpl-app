import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Circle, ArrowRight, ArrowLeft } from 'lucide-react'
import { useFplData } from '../hooks/useFplData'
import { useLiveScoring } from '../hooks/useLiveScoring'
import { LeagueStandings } from './LeagueStandings'
import { GameweekDetails } from './GameweekDetails'
import { ChipsRemaining } from './ChipsRemaining'
import { StatsCards } from './StatsCards'
import { PlayerOwnership } from './PlayerOwnership'
import { BenchPoints } from './BenchPoints'
import { CaptainSuccess } from './CaptainSuccess'
import { LeaguePositionChart } from './LeaguePositionChart'
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
  // Use finished_provisional as it updates immediately; finished waits for bonus confirmation
  const hasGamesInProgress = fixtures.some((f) => f.started && !f.finished_provisional)

  // Modal state from URL for shareability
  const selectedManagerId = searchParams.get('manager') ? Number(searchParams.get('manager')) : null

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
          <GameweekDetails
            gameweek={currentGameweek}
            managerDetails={managerDetails}
            fixtures={fixtures}
          />
        </div>
      </div>

      {/* Transfers - Full width grid */}
      {managerDetails.some((m) => m.transfersIn.length > 0) && (
        <div className={styles.transfersCard}>
          <h3 className={styles.transfersTitle}>
            <span className={styles.transferIcon}>
              <ArrowRight size={12} color="var(--color-success)" />
              <ArrowLeft size={12} color="var(--color-error)" />
            </span>
            Transfers
          </h3>
          <div className={styles.transfersFlow}>
            {managerDetails
              .filter((m) => m.transfersIn.length > 0)
              .map((m) => (
                <div key={m.managerId} className={styles.transferItem}>
                  <span className={styles.transferTeam}>{m.teamName}</span>
                  <div className={styles.transferMoves}>
                    {m.transfersIn.map((playerIn, idx) => (
                      <span key={playerIn.id} className={styles.transferMove}>
                        <span className={styles.playerOut}>
                          {m.transfersOut[idx]?.web_name || '?'}
                        </span>
                        <span className={styles.arrow}>→</span>
                        <span className={styles.playerIn}>{playerIn.web_name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Bottom Stats */}
      <div className={styles.bottomSection}>
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
