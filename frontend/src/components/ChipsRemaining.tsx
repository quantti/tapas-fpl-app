import { Zap } from 'lucide-react'
import type { ManagerGameweekData } from '../hooks/useFplData'
import * as styles from './ChipsRemaining.module.css'

interface Props {
  managerDetails: ManagerGameweekData[]
  currentGameweek: number
}

// Chips available in each half of the season
const FIRST_HALF_CHIPS = ['bboost', '3xc', 'freehit', 'wildcard']
const SECOND_HALF_CHIPS = ['bboost', '3xc', 'freehit', 'wildcard']

const CHIP_LABELS: Record<string, string> = {
  bboost: 'BB',
  '3xc': 'TC',
  freehit: 'FH',
  wildcard: 'WC',
}

function getRemainingChips(chipsUsed: string[], currentGameweek: number): string[] {
  // Before GW20, only first half chips are available
  // From GW20 onwards, both sets are available
  const availableChips =
    currentGameweek >= 20 ? [...FIRST_HALF_CHIPS, ...SECOND_HALF_CHIPS] : [...FIRST_HALF_CHIPS]

  const remaining = [...availableChips]

  for (const used of chipsUsed) {
    const normalizedUsed = used.toLowerCase()
    const index = remaining.indexOf(normalizedUsed)
    if (index !== -1) {
      remaining.splice(index, 1)
    }
  }

  return remaining
}

export function ChipsRemaining({ managerDetails, currentGameweek }: Props) {
  // Calculate remaining chips for each manager
  const managersWithChips = managerDetails
    .map((manager) => ({
      ...manager,
      remainingChips: getRemainingChips(manager.chipsUsed, currentGameweek),
    }))
    .filter((manager) => manager.remainingChips.length > 0)
    .sort((a, b) => a.rank - b.rank)

  if (managersWithChips.length === 0) {
    return null
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>
        <Zap size={16} color="#FFE033" fill="#FFE033" /> Chips Remaining
      </h3>
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
    </div>
  )
}
