import type { ReactNode } from 'react'
import * as styles from './PitchLayout.module.css'

export interface PitchPlayer {
  id: number
  elementType: number // 1=GK, 2=DEF, 3=MID, 4=FWD
}

interface PitchLayoutProps<T extends PitchPlayer> {
  players: T[]
  renderPlayer: (player: T) => ReactNode
}

export function PitchLayout<T extends PitchPlayer>({ players, renderPlayer }: PitchLayoutProps<T>) {
  const goalkeepers = players.filter((p) => p.elementType === 1)
  const defenders = players.filter((p) => p.elementType === 2)
  const midfielders = players.filter((p) => p.elementType === 3)
  const forwards = players.filter((p) => p.elementType === 4)

  return (
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
  )
}
