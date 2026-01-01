import { Armchair } from 'lucide-react'
import { useMemo } from 'react'

import { Card } from 'components/Card'
import { CardHeader } from 'components/CardHeader'
import { RankedRow } from 'components/RankedRow'

import { useBenchPoints } from 'services/queries/useBenchPoints'

import * as styles from './BenchPoints.module.css'

import type { ManagerGameweekData } from 'services/queries/useFplData'

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
    <Card>
      <CardHeader
        icon={<Armchair size={16} color="#6B8CAE" />}
        action={!loading && <span className={styles.total}>{totalBenchPoints} pts</span>}
      >
        Bench Points
      </CardHeader>
      {loading && <p className={styles.loading}>Loading...</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}
      {!loading && !error && (
        <div className={styles.list}>
          {sortedData.map((data, index) => (
            <RankedRow
              key={data.managerId}
              rank={index + 1}
              name={data.teamName}
              value={data.totalBenchPoints}
              valueColor="warning"
            />
          ))}
        </div>
      )}
    </Card>
  )
}
