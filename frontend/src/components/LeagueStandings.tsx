import { useMemo } from 'react'
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
  gameweekFinished?: boolean // Official FPL update complete (not just finished_provisional)
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
  gameweekFinished = false,
}: Props) {
  const detailsMap = useMemo(
    () => new Map(managerDetails.map((m) => [m.managerId, m])),
    [managerDetails]
  )

  // Check if any games are actually in progress
  // Use finished_provisional as it updates immediately; finished waits for bonus confirmation
  const hasGamesInProgress = fixtures.some((f) => f.started && !f.finished_provisional)

  // Calculate live points and totals for each manager, then sort by live total
  const sortedResults = useMemo(() => {
    const results = standings.standings.results.map((entry) => {
      const details = detailsMap.get(entry.entry)

      // If live and we have manager picks, calculate live points
      if (isLive && liveData && details) {
        const livePoints = calculateLiveManagerPoints(
          details.picks,
          liveData,
          fixtures,
          details.transfersCost
        )

        // Live total = previous total (before this GW) + live GW points
        // entry.total already includes entry.event_total, so subtract it first
        const previousTotal = entry.total - entry.event_total
        const liveTotal = previousTotal + livePoints.netPoints

        return {
          ...entry,
          liveGwPoints: livePoints.netPoints,
          provisionalBonus: livePoints.provisionalBonus,
          liveTotal,
          isLive: true,
        }
      }

      // Not live or no details - use static values
      return {
        ...entry,
        liveGwPoints: entry.event_total,
        provisionalBonus: 0,
        liveTotal: entry.total,
        isLive: false,
      }
    })

    // Sort by live total descending when live
    if (isLive && liveData) {
      results.sort((a, b) => b.liveTotal - a.liveTotal)
    }

    return results
  }, [standings.standings.results, detailsMap, isLive, liveData, fixtures])

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
            <th className={`${styles.headerCell} ${styles.colManager}`}>Team & Manager</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colGw}`}>GW</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colTotal}`}>Total</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colOverallRank}`}>OR</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colCaptain}`}>C</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colChip}`}></th>
          </tr>
        </thead>
        <tbody className={styles.tableBody}>
          {sortedResults.map((entry, index) => {
            const details = detailsMap.get(entry.entry)
            // When live, rank is the current position in sorted array (1-indexed)
            // When not live, use the API rank
            const displayRank = isLive && liveData ? index + 1 : entry.rank
            const rankChange = getRankChange(displayRank, entry.last_rank)

            return (
              <tr key={entry.entry} className={styles.row}>
                <td className={`${styles.cell} ${styles.colRank}`}>
                  <div className={styles.rank}>
                    <span className={styles.rankNumber}>{displayRank}</span>
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
                  <span className={styles.gwPoints}>
                    {entry.liveGwPoints}
                    {entry.provisionalBonus > 0 && (
                      <span className={styles.provisionalBonus}>+{entry.provisionalBonus}</span>
                    )}
                  </span>
                </td>
                <td className={`${styles.cell} ${styles.center} ${styles.colTotal}`}>
                  <span className={styles.totalPoints}>{entry.liveTotal}</span>
                </td>
                <td className={`${styles.cell} ${styles.center} ${styles.colOverallRank}`}>
                  {details?.overallRank ? (
                    <div className={styles.overallRank}>
                      <span className={styles.overallRankNumber}>
                        {details.overallRank.toLocaleString()}
                      </span>
                      {gameweekFinished && details.lastOverallRank > 0 && (() => {
                        const orChange = getRankChange(details.overallRank, details.lastOverallRank)
                        if (orChange.direction === 'same') return null
                        return (
                          <span className={`${styles.rankChange} ${styles[orChange.direction]}`}>
                            {orChange.direction === 'up' ? (
                              <CircleChevronUp size={12} />
                            ) : (
                              <CircleChevronDown size={12} />
                            )}
                          </span>
                        )
                      })()}
                    </div>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
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
