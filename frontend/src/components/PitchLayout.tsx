import * as styles from './PitchLayout.module.css'

import type { ReactNode } from 'react'

export interface PitchPlayer {
  id: number
  elementType: number // 1=GK, 2=DEF, 3=MID, 4=FWD
}

interface BenchConfig<T> {
  players: T[]
  renderPlayer: (player: T) => ReactNode
}

interface PitchLayoutProps<T extends PitchPlayer, B = T> {
  players: T[]
  renderPlayer: (player: T) => ReactNode
  bench?: BenchConfig<B>
}

export function PitchLayout<T extends PitchPlayer, B = T>({
  players,
  renderPlayer,
  bench,
}: PitchLayoutProps<T, B>) {
  const goalkeepers = players.filter((p) => p.elementType === 1)
  const defenders = players.filter((p) => p.elementType === 2)
  const midfielders = players.filter((p) => p.elementType === 3)
  const forwards = players.filter((p) => p.elementType === 4)

  return (
    <>
      <div className={styles.PitchLayout} data-testid="pitch-layout">
        <div className={styles.row} data-testid="pitch-row-forwards">
          {forwards.map((player) => (
            <div key={player.id}>{renderPlayer(player)}</div>
          ))}
        </div>
        <div className={styles.row} data-testid="pitch-row-midfielders">
          {midfielders.map((player) => (
            <div key={player.id}>{renderPlayer(player)}</div>
          ))}
        </div>
        <div className={styles.row} data-testid="pitch-row-defenders">
          {defenders.map((player) => (
            <div key={player.id}>{renderPlayer(player)}</div>
          ))}
        </div>
        <div className={styles.row} data-testid="pitch-row-goalkeepers">
          {goalkeepers.map((player) => (
            <div key={player.id}>{renderPlayer(player)}</div>
          ))}
        </div>
      </div>

      {bench && bench.players.length > 0 && (
        <div className={styles.bench} data-testid="bench">
          <h4 className={styles.benchTitle} data-testid="bench-title">
            Bench
          </h4>
          <div className={styles.benchPlayers} data-testid="bench-players">
            {bench.players.map((player, index) => (
              <div key={index}>{bench.renderPlayer(player)}</div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
