import { useState } from 'react'
import { useFplData } from '../hooks/useFplData'
import { Header } from '../components/Header'
import { RecommendedPlayers } from '../components/RecommendedPlayers'
import { PlayerModal } from '../components/PlayerModal'
import { FplUpdating } from '../components/FplUpdating'
import type { Player } from '../types/fpl'
import * as styles from './Analytics.module.css'

export function Analytics() {
  const { managerDetails, currentGameweek, loading, error, isApiUnavailable, bootstrap, teamsMap } =
    useFplData()
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)

  if (loading) {
    return (
      <div className={styles.Analytics}>
        <Header />
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.Analytics}>
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
      <div className={styles.Analytics}>
        <Header />
        <div className={styles.error}>
          <h3>No data available</h3>
          <p>Could not load analytics.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.Analytics}>
      <Header />
      <h1 className={styles.title}>Analytics</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recommendations</h2>
        <RecommendedPlayers
          players={bootstrap?.elements ?? []}
          managerDetails={managerDetails}
          teamsMap={teamsMap}
          currentGameweek={currentGameweek.id}
          onPlayerClick={setSelectedPlayer}
        />
      </section>

      <PlayerModal
        player={selectedPlayer}
        teams={bootstrap?.teams ?? []}
        elementTypes={bootstrap?.element_types ?? []}
        onClose={() => setSelectedPlayer(null)}
      />
    </div>
  )
}
