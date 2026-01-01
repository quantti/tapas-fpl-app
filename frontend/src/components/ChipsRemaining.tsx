import { Zap } from 'lucide-react'
import { useMemo } from 'react'

import { Card } from './Card'
import { CardHeader } from './CardHeader'
import * as styles from './ChipsRemaining.module.css'

import type { ManagerGameweekData } from '../services/queries/useFplData'

interface ChipUsage {
  name: string
  event: number
}

interface Props {
  managerDetails: ManagerGameweekData[]
  currentGameweek: number
  deadlineTime?: string
}

// Chips available in each half of the season (2025/26 rules: full reset at GW20)
const AVAILABLE_CHIPS = ['bboost', '3xc', 'freehit', 'wildcard']

const CHIP_LABELS: Record<string, string> = {
  bboost: 'BB',
  '3xc': 'TC',
  freehit: 'FH',
  wildcard: 'WC',
}

function getRemainingChips(chipsUsed: ChipUsage[], isSecondHalf: boolean): string[] {
  const remaining = [...AVAILABLE_CHIPS]

  // Filter chips by which half they were used in
  const relevantChips = chipsUsed.filter((chip) => {
    const usedInFirstHalf = chip.event < 20
    return isSecondHalf ? !usedInFirstHalf : usedInFirstHalf
  })

  for (const used of relevantChips) {
    const normalizedUsed = used.name.toLowerCase()
    const index = remaining.indexOf(normalizedUsed)
    if (index !== -1) {
      remaining.splice(index, 1)
    }
  }

  return remaining
}

export function ChipsRemaining({ managerDetails, currentGameweek, deadlineTime }: Props) {
  // Determine which half of the season we're in (2025/26 rules: full chip reset at GW20)
  // Second half starts when GW19 deadline passes (chips for GW20+ available)
  const isSecondHalf = useMemo(() => {
    if (currentGameweek >= 20) return true
    if (currentGameweek === 19 && deadlineTime) {
      return new Date() > new Date(deadlineTime)
    }
    return false
  }, [currentGameweek, deadlineTime])

  // Calculate remaining chips for each manager
  const managersWithChips = managerDetails
    .map((manager) => ({
      ...manager,
      remainingChips: getRemainingChips(manager.chipsUsed, isSecondHalf),
    }))
    .filter((manager) => manager.remainingChips.length > 0)
    .sort((a, b) => a.rank - b.rank)

  if (managersWithChips.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader icon={<Zap size={16} color="#FFE033" fill="#FFE033" />}>
        Chips Remaining
      </CardHeader>
      <div className={styles.list}>
        {managersWithChips.map((manager) => (
          <div key={manager.managerId} className={styles.row}>
            <span className={styles.teamName}>{manager.teamName}</span>
            <div className={styles.chips}>
              {manager.remainingChips.map((chip, index) => (
                <span key={`${chip}-${index}`} className={styles.chip}>
                  {CHIP_LABELS[chip] || chip}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
