import { ChevronRight, CircleChevronUp, CircleChevronDown } from 'lucide-react'
import type { LeagueStandings as LeagueStandingsType, LiveGameweek, Fixture } from '../types/fpl'
import type { ManagerGameweekData } from '../hooks/useFplData'
import { calculateLiveManagerPoints } from '../utils/liveScoring'
import * as styles from './LeagueStandings.module.css'

interface Props {
  standings: LeagueStandingsType
  managerDetails: ManagerGameweekData[]
  isLive: boolean
  liveData?: LiveGameweek | null
  fixtures?: Fixture[]
  onManagerClick?: (managerId: number) => void
}

function getRankChange(
  current: number,
  last: number
): { direction: 'up' | 'down' | 'same'; diff: number } {
  if (last === 0 || current === last) return { direction: 'same', diff: 0 }
  return current < last
    ? { direction: 'up', diff: last - current }
    : { direction: 'down', diff: current - last }
}

export function LeagueStandings({
  standings,
  managerDetails,
  isLive,
  liveData,
  fixtures = [],
  onManagerClick,
}: Props) {
  const detailsMap = new Map(managerDetails.map((m) => [m.managerId, m]))

  // Check if any games are actually in progress
  const hasGamesInProgress = fixtures.some((f) => f.started && !f.finished)

  // Calculate live points for each manager when live
  const livePointsMap = new Map<number, { points: number; bonus: number }>()
  if (isLive && liveData) {
    for (const manager of managerDetails) {
      const livePoints = calculateLiveManagerPoints(
        manager.picks,
        liveData,
        fixtures,
        manager.transfersCost
      )
      livePointsMap.set(manager.managerId, {
        points: livePoints.netPoints,
        bonus: livePoints.provisionalBonus,
      })
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>{standings.league.name}</h2>
        {hasGamesInProgress && <span className={styles.liveBadge}>LIVE</span>}
      </div>

      <table className={styles.table}>
        <thead className={styles.tableHead}>
          <tr>
            <th className={`${styles.headerCell} ${styles.colRank}`}>#</th>
            <th className={`${styles.headerCell} ${styles.colManager}`}>Manager</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colGw}`}>GW</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colTotal}`}>Total</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colCaptain}`}>C</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colChip}`}></th>
          </tr>
        </thead>
        <tbody className={styles.tableBody}>
          {standings.standings.results.map((entry) => {
            const details = detailsMap.get(entry.entry)
            const rankChange = getRankChange(entry.rank, entry.last_rank)

            return (
              <tr key={entry.entry} className={styles.row}>
                <td className={`${styles.cell} ${styles.colRank}`}>
                  <div className={styles.rank}>
                    <span className={styles.rankNumber}>{entry.rank}</span>
                    {rankChange.direction !== 'same' && (
                      <span className={`${styles.rankChange} ${styles[rankChange.direction]}`}>
                        {rankChange.direction === 'up' ? (
                          <CircleChevronUp size={14} />
                        ) : (
                          <CircleChevronDown size={14} />
                        )}
                        {rankChange.diff}
                      </span>
                    )}
                  </div>
                </td>
                <td className={`${styles.cell} ${styles.colManager}`}>
                  <div className={styles.manager}>
                    <button
                      type="button"
                      className={styles.teamName}
                      onClick={() => onManagerClick?.(entry.entry)}
                    >
                      {entry.entry_name}
                      <ChevronRight size={14} className={styles.teamNameIcon} />
                    </button>
                    <span className={styles.playerName}>{entry.player_name}</span>
                  </div>
                </td>
                <td className={`${styles.cell} ${styles.center} ${styles.colGw}`}>
                  {isLive && livePointsMap.has(entry.entry) ? (
                    <span className={styles.gwPoints}>
                      {livePointsMap.get(entry.entry)!.points}
                      {livePointsMap.get(entry.entry)!.bonus > 0 && (
                        <span className={styles.provisionalBonus}>
                          +{livePointsMap.get(entry.entry)!.bonus}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className={styles.gwPoints}>{entry.event_total}</span>
                  )}
                </td>
                <td className={`${styles.cell} ${styles.center} ${styles.colTotal}`}>
                  <span className={styles.totalPoints}>{entry.total}</span>
                </td>
                <td className={`${styles.cell} ${styles.center} ${styles.colCaptain}`}>
                  {details?.captain ? (
                    <span className={styles.captain}>{details.captain.web_name}</span>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </td>
                <td className={`${styles.cell} ${styles.center} ${styles.colChip}`}>
                  {details?.activeChip ? (
                    <span className={styles.chip}>{formatChip(details.activeChip)}</span>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function formatChip(chip: string): string {
  const chips: Record<string, string> = {
    bboost: 'BB',
    '3xc': 'TC',
    freehit: 'FH',
    wildcard: 'WC',
  }
  return chips[chip] || chip.toUpperCase()
}
