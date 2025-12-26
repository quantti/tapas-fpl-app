import type { ReactNode } from 'react'
import * as styles from './PitchPlayer.module.css'

interface Props {
  name: string
  shirtUrl: string
  teamShortName: string
  stat: ReactNode
  badge?: 'C' | 'V'
  isBench?: boolean
  testId?: string
}

const getShirtUrl = (teamCode: number): string => {
  return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-110.webp`
}

export function PitchPlayer({
  name,
  shirtUrl,
  teamShortName,
  stat,
  badge,
  isBench = false,
  testId = 'player',
}: Props) {
  return (
    <div
      className={`${styles.PitchPlayer}${isBench ? ` ${styles['-bench']}` : ''}`}
      data-testid={testId}
    >
      <div className={styles.shirt}>
        <img
          src={shirtUrl}
          alt={teamShortName}
          className={styles.shirtImage}
          data-testid="shirt-image"
        />
        {badge && <span className={styles.badge}>{badge}</span>}
      </div>
      <div className={styles.name} data-testid="player-name">
        {name}
      </div>
      <div className={styles.stat}>{stat}</div>
    </div>
  )
}

// Utility function for consumers
PitchPlayer.getShirtUrl = getShirtUrl
