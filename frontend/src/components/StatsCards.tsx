import type { ManagerGameweekData } from '../hooks/useFplData'
import * as styles from './StatsCards.module.css'

interface Props {
  managerDetails: ManagerGameweekData[]
}

export function StatsCards({ managerDetails }: Props) {
  const sortedByValue = [...managerDetails].sort(
    (a, b) => b.teamValue + b.bank - (a.teamValue + a.bank)
  )
  const sortedByHits = [...managerDetails].sort((a, b) => b.totalHitsCost - a.totalHitsCost)

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h3 className={styles.title}>💰 Team Values</h3>
        <div className={styles.list}>
          {sortedByValue.map((m, index) => (
            <div key={m.managerId} className={styles.row}>
              <span className={styles.rank}>{index + 1}</span>
              <span className={styles.name}>{m.teamName}</span>
              <span className={styles.value}>£{(m.teamValue + m.bank).toFixed(1)}m</span>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.title}>🔥 Total Hits</h3>
        <div className={styles.list}>
          {sortedByHits.map((m, index) => (
            <div key={m.managerId} className={styles.row}>
              <span className={styles.rank}>{index + 1}</span>
              <span className={styles.name}>{m.teamName}</span>
              <span className={`${styles.value} ${styles.negative}`}>-{m.totalHitsCost}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
