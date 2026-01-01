import clsx from 'clsx'
import { ArrowLeftRight } from 'lucide-react'
import { useMemo } from 'react'

import { Card } from 'components/Card'
import { CardHeader } from 'components/CardHeader'

import { useFreeTransfers } from 'services/queries/useFreeTransfers'

import * as styles from './FreeTransfers.module.css'

import type { ManagerGameweekData } from 'services/queries/useFplData'

interface Props {
  managerDetails: ManagerGameweekData[]
  currentGameweek: number
  deadlineTime?: string // ISO datetime string
}

export function FreeTransfers({ managerDetails, currentGameweek, deadlineTime }: Props) {
  // Check if deadline has passed (transfers now apply to next GW)
  const deadlinePassed = useMemo(() => {
    if (!deadlineTime) return false
    return new Date() > new Date(deadlineTime)
  }, [deadlineTime])

  // Extract manager IDs and names for the hook (memoized to prevent re-renders)
  const managerIds = useMemo(
    () => managerDetails.map((m) => ({ id: m.managerId, teamName: m.teamName })),
    [managerDetails]
  )

  const { freeTransfers, loading, error } = useFreeTransfers(
    managerIds,
    currentGameweek,
    deadlinePassed
  )

  if (loading) {
    return (
      <Card>
        <div className={styles.FreeTransfers}>
          <CardHeader icon={<ArrowLeftRight size={16} color="#8B5CF6" />}>
            Free Transfers
          </CardHeader>
          <div className={styles.loading}>Loading...</div>
        </div>
      </Card>
    )
  }

  if (error) {
    return null // Fail silently to not break page
  }

  if (freeTransfers.length === 0) {
    return null
  }

  // Sort by rank (use original managerDetails order which is by rank)
  const managersWithFT = freeTransfers
    .map((ft) => {
      const manager = managerDetails.find((m) => m.managerId === ft.managerId)
      return { ...ft, rank: manager?.rank ?? 999 }
    })
    .sort((a, b) => a.rank - b.rank)

  return (
    <Card data-testid="free-transfers">
      <div className={styles.FreeTransfers}>
        <CardHeader icon={<ArrowLeftRight size={16} color="#8B5CF6" />}>Free Transfers</CardHeader>
        <div className={styles.list}>
          {managersWithFT.map((manager) => (
            <div key={manager.managerId} className={styles.row}>
              <span className={styles.teamName}>{manager.teamName}</span>
              <span className={clsx(styles.ftCount, manager.freeTransfers === 2 && styles.maxFt)}>
                {manager.freeTransfers} FT
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
