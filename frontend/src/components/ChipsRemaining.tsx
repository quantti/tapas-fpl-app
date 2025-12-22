import type { ManagerGameweekData } from '../hooks/useFplData'
import * as styles from './ChipsRemaining.module.css'

interface Props {
  managerDetails: ManagerGameweekData[]
}

// All available chips in FPL (wildcard can be used twice per season)
const ALL_CHIPS = ['bboost', '3xc', 'freehit', 'wildcard', 'wildcard']

const CHIP_LABELS: Record<string, string> = {
  bboost: 'BB',
  '3xc': 'TC',
  freehit: 'FH',
  wildcard: 'WC',
}

function getRemainingChips(chipsUsed: string[]): string[] {
  const remaining = [...ALL_CHIPS]

  for (const used of chipsUsed) {
    const index = remaining.indexOf(used)
    if (index !== -1) {
      remaining.splice(index, 1)
    }
  }

  return remaining
}

export function ChipsRemaining({ managerDetails }: Props) {
  // Calculate remaining chips for each manager
  const managersWithChips = managerDetails
    .map((manager) => ({
      ...manager,
      remainingChips: getRemainingChips(manager.chipsUsed),
    }))
    .filter((manager) => manager.remainingChips.length > 0)
    .sort((a, b) => a.rank - b.rank)

  if (managersWithChips.length === 0) {
    return null
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Chips Remaining</h3>
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
