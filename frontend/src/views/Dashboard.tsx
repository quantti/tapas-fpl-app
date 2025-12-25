import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Circle, ArrowRight, ArrowLeft } from 'lucide-react'
import { useFplData } from '../hooks/useFplData'
import { useLiveScoring } from '../hooks/useLiveScoring'
import { LeagueStandings } from '../components/LeagueStandings'
import { GameweekDetails } from '../components/GameweekDetails'
import { ManagerModal } from '../components/ManagerModal'
import { GameweekCountdown } from '../components/GameweekCountdown'
import { Header } from '../components/Header'
import * as styles from './Dashboard.module.css'

export function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { standings, managerDetails, currentGameweek, isLive, loading, error, bootstrap } =
    useFplData()

  // Fetch live scoring data when games are in progress
  const { liveData, fixtures } = useLiveScoring(currentGameweek?.id ?? 0, isLive)

  // Check if any games are actually in progress (not just deadline passed)
  // Use finished_provisional as it updates immediately; finished waits for bonus confirmation
  const hasGamesInProgress = fixtures.some((f) => f.started && !f.finished_provisional)

  // Get next gameweek for countdown (after all current GW games finished)
  const nextGameweek = useMemo(() => {
    const events = bootstrap?.events
    if (!events || !currentGameweek) return null

    // Don't show countdown during GW38 (season end)
    if (currentGameweek.id === 38) return null

    // Check if all fixtures for current GW are finished
    const allGamesFinished = fixtures.length > 0 && fixtures.every((f) => f.finished_provisional)
    if (!allGamesFinished) return null

    // Find the next gameweek
    return events.find((e) => e.is_next) ?? null
  }, [bootstrap, currentGameweek, fixtures])

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
      <div className={styles.Dashboard}>
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading league data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.Dashboard}>
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
      <div className={styles.Dashboard}>
        <div className={styles.error}>
          <h3>No data available</h3>
          <p>Could not load league standings.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.Dashboard}>
      <Header />

      {/* Status Bar - only shown when live */}
      {hasGamesInProgress && (
        <div className={styles.statusBar}>
          <span className={styles.liveIndicator}>
            <Circle size={8} fill="currentColor" /> Live
          </span>
        </div>
      )}

      {/* Countdown Banner - full width above main grid */}
      {nextGameweek && (
        <GameweekCountdown deadline={nextGameweek.deadline_time} gameweekId={nextGameweek.id} />
      )}

      {/* Main Content */}
      <div className={styles.grid} data-testid="dashboard-grid">
        <div className={styles.mainColumn}>
          <LeagueStandings
            standings={standings}
            managerDetails={managerDetails}
            isLive={isLive}
            liveData={liveData}
            fixtures={fixtures}
            onManagerClick={handleManagerClick}
            gameweekFinished={currentGameweek.finished}
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
        <div className={styles.transfersCard} data-testid="transfers-card">
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
