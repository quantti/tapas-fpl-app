import { RefreshCw } from 'lucide-react'

import * as styles from './LeagueUpdating.module.css'

/**
 * Warning banner displayed when FPL is recalculating league tables.
 * Unlike FplUpdating (which replaces the page), this is a non-blocking
 * banner that warns users the standings may be stale.
 */
export function LeagueUpdating() {
  return (
    <div className={styles.LeagueUpdating} data-testid="league-updating">
      <RefreshCw size={16} className={styles.icon} />
      <span className={styles.message}>
        League tables are being recalculated. Standings may still show old data.
      </span>
    </div>
  )
}
