import { useState } from 'react'

import { FplUpdating } from '../components/FplUpdating'
import { Header } from '../components/Header'
import { LoadingState } from '../components/LoadingState'
import { PlayerDetails } from '../features/PlayerDetails'
import { Recommendations } from '../features/Recommendations'
import { useFplData } from '../services/queries/useFplData'

import * as styles from './Analytics.module.css'

import type { Player } from '../types/fpl'

export function Analytics() {
  const {
    managerDetails,
    currentGameweek,
    isLoading,
    error,
    isApiUnavailable,
    bootstrap,
    teamsMap,
  } = useFplData()
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)

  if (isLoading) {
    return (
      <div className={styles.Analytics}>
        <Header />
        <LoadingState message="Loading analytics..." />
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
        <Recommendations
          players={bootstrap?.elements ?? []}
          managerDetails={managerDetails}
          teamsMap={teamsMap}
          currentGameweek={currentGameweek.id}
          onPlayerClick={setSelectedPlayer}
        />
      </section>

      <PlayerDetails
        player={selectedPlayer}
        teams={bootstrap?.teams ?? []}
        elementTypes={bootstrap?.element_types ?? []}
        onClose={() => setSelectedPlayer(null)}
      />
    </div>
  )
}
