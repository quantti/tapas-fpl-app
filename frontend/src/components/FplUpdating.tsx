import { RefreshCw } from 'lucide-react'

import * as styles from './FplUpdating.module.css'

interface Props {
  title?: string
  message?: string
}

/**
 * Friendly message displayed when FPL API returns 503 (Service Unavailable).
 * This typically happens for 30-60 minutes between gameweeks while FPL updates their data.
 */
export function FplUpdating({
  title = 'FPL is updating',
  message = 'Fantasy Premier League is updating gameweek data. This usually takes 30-60 minutes after the last match finishes.',
}: Props) {
  return (
    <div className={styles.FplUpdating} data-testid="fpl-updating">
      <RefreshCw size={48} className={styles.icon} />
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      <p className={styles.hint}>The app will automatically refresh when data is available.</p>
    </div>
  )
}
