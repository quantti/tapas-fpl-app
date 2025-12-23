import { useMemo } from 'react'
import { Armchair } from 'lucide-react'
import { useBenchPoints } from '../hooks/useBenchPoints'
import type { ManagerGameweekData } from '../hooks/useFplData'
import * as styles from './BenchPoints.module.css'

interface Props {
  managerDetails: ManagerGameweekData[]
  currentGameweek: number
}

export function BenchPoints({ managerDetails, currentGameweek }: Props) {
  // Extract manager IDs and names for the hook
  const managerIds = useMemo(
    () => managerDetails.map((m) => ({ id: m.managerId, teamName: m.teamName })),
    [managerDetails]
  )

  const { benchPoints, loading, error } = useBenchPoints(managerIds, currentGameweek)

  // Sort by most bench points (descending) - these are "wasted" points
  const sortedData = useMemo(
    () => [...benchPoints].sort((a, b) => b.totalBenchPoints - a.totalBenchPoints),
    [benchPoints]
  )

  if (managerDetails.length === 0) return null

  const totalBenchPoints = sortedData.reduce((sum, d) => sum + d.totalBenchPoints, 0)

  return (
    <div className={styles.BenchPoints}>
      <h3 className={styles.title}>
        <Armchair size={16} color="#6B8CAE" /> Bench Points
        {!loading && <span className={styles.total}>{totalBenchPoints} pts</span>}
      </h3>
      {loading && <p className={styles.loading}>Loading...</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}
      {!loading && !error && (
        <div className={styles.list}>
          {sortedData.map((data, index) => (
            <div key={data.managerId} className={styles.row}>
              <span className={styles.rank}>{index + 1}</span>
              <span className={styles.name}>{data.teamName}</span>
              <span className={styles.value}>{data.totalBenchPoints}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
