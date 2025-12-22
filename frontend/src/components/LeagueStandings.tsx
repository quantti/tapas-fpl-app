import { Link } from 'react-router-dom'
import type { LeagueStandings as LeagueStandingsType } from '../types/fpl'
import type { ManagerGameweekData } from '../hooks/useFplData'
import * as styles from './LeagueStandings.module.css'

interface Props {
  standings: LeagueStandingsType
  managerDetails: ManagerGameweekData[]
  isLive: boolean
  gameweek: number
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

export function LeagueStandings({ standings, managerDetails, isLive, gameweek }: Props) {
  const detailsMap = new Map(managerDetails.map((m) => [m.managerId, m]))

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>{standings.league.name}</h2>
        {isLive && <span className={styles.liveBadge}>LIVE</span>}
      </div>

      <table className={styles.table}>
        <thead className={styles.tableHead}>
          <tr>
            <th className={`${styles.headerCell} ${styles.colRank}`}>#</th>
            <th className={`${styles.headerCell} ${styles.colManager}`}>Manager</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colGw}`}>GW</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colTotal}`}>Total</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colCaptain}`}>Captain</th>
            <th className={`${styles.headerCell} ${styles.center} ${styles.colChip}`}>Chip</th>
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
                        {rankChange.direction === 'up' ? '▲' : '▼'}{rankChange.diff}
                      </span>
                    )}
                  </div>
                </td>
                <td className={`${styles.cell} ${styles.colManager}`}>
                  <div className={styles.manager}>
                    <Link to={`/manager/${entry.entry}/${gameweek}`} className={styles.teamName}>
                      {entry.entry_name}
                    </Link>
                    <span className={styles.playerName}>{entry.player_name}</span>
                  </div>
                </td>
                <td className={`${styles.cell} ${styles.center} ${styles.colGw}`}>
                  <span className={styles.gwPoints}>{entry.event_total}</span>
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
