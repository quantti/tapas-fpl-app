import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { Footprints, Shield } from 'lucide-react'
import { useMemo, useState } from 'react'

import FootballIcon from 'assets/football.svg?react'

import { POSITION_TYPES } from 'constants/positions'

import { metDefConThreshold } from 'utils/defcon'
import { createTeamsMap } from 'utils/mappers'
import { parseNumericString } from 'utils/playerStats'

import * as styles from './HistoryTable.module.css'

import type { PlayerHistory, Team } from 'types/fpl'

interface HistoryTableProps {
  data: PlayerHistory[]
  playerPosition: number
  teams: Team[]
}

const PREVIEW_COUNT = 5

export function HistoryTable({ data, playerPosition, teams }: HistoryTableProps) {
  const [showAll, setShowAll] = useState(false)

  // Create teams lookup map
  const teamsMap = useMemo(() => createTeamsMap(teams), [teams])

  // Determine if player is defensive (affects xStats column)
  const isDefensive =
    playerPosition === POSITION_TYPES.GOALKEEPER || playerPosition === POSITION_TYPES.DEFENDER

  // Column definitions
  const columns = useMemo<ColumnDef<PlayerHistory, unknown>[]>(
    () => [
      {
        id: 'gw',
        header: 'GW',
        accessorKey: 'round',
        cell: ({ getValue }) => getValue(),
      },
      {
        id: 'opponent',
        header: 'Opponent',
        accessorKey: 'opponent_team',
        cell: ({ row }) => {
          const opponent = teamsMap.get(row.original.opponent_team)
          const venue = row.original.was_home ? 'H' : 'A'
          return `${opponent?.short_name ?? '???'} (${venue})`
        },
      },
      {
        id: 'icons',
        header: '',
        cell: ({ row }) => {
          const gw = row.original
          const showCleanSheet = gw.clean_sheets > 0 && playerPosition !== 4
          const gotDefCon =
            playerPosition !== 4 &&
            metDefConThreshold(gw.defensive_contribution ?? 0, playerPosition)

          return (
            <div className={styles.icons}>
              {gw.goals_scored > 0 && (
                <span
                  className={styles.icon}
                  title={`${gw.goals_scored} goal${gw.goals_scored > 1 ? 's' : ''}`}
                >
                  {Array.from({ length: gw.goals_scored }, (_, i) => (
                    <FootballIcon key={i} width={12} height={12} />
                  ))}
                </span>
              )}
              {gw.assists > 0 && (
                <span
                  className={styles.icon}
                  title={`${gw.assists} assist${gw.assists > 1 ? 's' : ''}`}
                >
                  {Array.from({ length: gw.assists }, (_, i) => (
                    <Footprints key={i} size={12} color="#14B8A6" />
                  ))}
                </span>
              )}
              {showCleanSheet && (
                <span className={styles.icon} title="Clean sheet">
                  <Shield size={12} color="#3b82f6" fill="#3b82f6" />
                </span>
              )}
              {gotDefCon && (
                <span className={styles.icon} title="DefCon (+2)">
                  <Shield size={12} color="#14B8A6" fill="#14B8A6" />
                </span>
              )}
              {gw.bonus > 0 && (
                <span
                  className={styles.bonusCircle}
                  title={`${gw.bonus} bonus point${gw.bonus > 1 ? 's' : ''}`}
                >
                  {gw.bonus}
                </span>
              )}
            </div>
          )
        },
      },
      {
        id: 'pts',
        header: 'Pts',
        accessorKey: 'total_points',
        cell: ({ getValue }) => getValue(),
      },
      {
        id: 'min',
        header: 'Min',
        accessorKey: 'minutes',
        cell: ({ getValue }) => `${getValue()}'`,
      },
      {
        id: 'xstats',
        header: isDefensive ? 'xGC' : 'xGI',
        accessorFn: (row) =>
          isDefensive
            ? parseNumericString(row.expected_goals_conceded)
            : parseNumericString(row.expected_goal_involvements),
        cell: ({ getValue }) => (getValue() as number).toFixed(2),
      },
    ],
    [teamsMap, playerPosition, isDefensive]
  )

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: showAll ? data.length : PREVIEW_COUNT,
      },
    },
  })

  // Update page size when showAll changes
  useMemo(() => {
    table.setPageSize(showAll ? data.length : PREVIEW_COUNT)
  }, [showAll, data.length, table])

  const hasMore = data.length > PREVIEW_COUNT

  if (data.length === 0) {
    return <div className={styles.empty}>No recent history</div>
  }

  return (
    <div className={styles.HistoryTable}>
      <div className={`${styles.tableWrapper} ${showAll ? styles.expanded : ''}`}>
        <table className={styles.table}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className={styles.headerRow}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`${styles.headerCell} ${styles[`col${header.id.charAt(0).toUpperCase() + header.id.slice(1)}`] ?? ''}`}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={styles.row}>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`${styles.cell} ${styles[`col${cell.column.id.charAt(0).toUpperCase() + cell.column.id.slice(1)}`] ?? ''}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <button
          type="button"
          className={styles.showMoreButton}
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show less' : `Show more (${data.length - PREVIEW_COUNT} more)`}
        </button>
      )}
    </div>
  )
}
