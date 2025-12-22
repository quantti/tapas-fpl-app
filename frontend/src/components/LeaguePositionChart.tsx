import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp } from 'lucide-react'
import { useLeaguePositionHistory } from '../hooks/useLeaguePositionHistory'
import type { ManagerGameweekData } from '../hooks/useFplData'
import * as styles from './LeaguePositionChart.module.css'

interface Props {
  managerDetails: ManagerGameweekData[]
  currentGameweek: number
}

const AXIS_STYLE = {
  tick: { fontSize: 11, fill: 'var(--color-text-muted)' },
  axisLine: { stroke: 'var(--color-border)' },
  tickLine: { stroke: 'var(--color-border)' },
}

export function LeaguePositionChart({ managerDetails, currentGameweek }: Props) {
  // Extract manager IDs and names for the hook
  const managers = useMemo(
    () => managerDetails.map((m) => ({ id: m.managerId, teamName: m.teamName })),
    [managerDetails]
  )

  const { data, loading, error } = useLeaguePositionHistory(managers, currentGameweek)

  if (managerDetails.length === 0) return null

  const managerCount = managerDetails.length

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>
        <TrendingUp size={16} color="#6366f1" /> League Position History
      </h3>
      {loading && <p className={styles.loading}>Loading history...</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}
      {!loading && !error && data && (
        <div className={styles.chartContainer}>
          <div
            className={styles.chartInner}
            style={{ minWidth: Math.max(600, data.positions.length * 25) }}
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={data.positions}
                margin={{ top: 20, right: 30, left: 30, bottom: 20 }}
              >
                <XAxis dataKey="gameweek" tickFormatter={(gw) => `GW${gw}`} {...AXIS_STYLE} />
                <YAxis
                  reversed
                  domain={[1, managerCount]}
                  ticks={Array.from({ length: managerCount }, (_, i) => i + 1)}
                  width={30}
                  {...AXIS_STYLE}
                />
                <Tooltip
                  content={(props) => {
                    const { active, payload, label } = props
                    if (!active || !payload?.length) return null
                    const sorted = [...payload].sort(
                      (a, b) => Number(a.value) - Number(b.value)
                    )
                    return (
                      <div className={styles.tooltip}>
                        <div className={styles.tooltipTitle}>Gameweek {label}</div>
                        {sorted.map((entry) => {
                            const manager = data.managers.find((m) => `m${m.id}` === entry.dataKey)
                            return (
                              <div
                                key={entry.dataKey}
                                className={styles.tooltipRow}
                                style={{ color: entry.color }}
                              >
                                <span className={styles.tooltipPosition}>{entry.value}.</span>
                                <span>{manager?.teamName}</span>
                              </div>
                            )
                          })}
                      </div>
                    )
                  }}
                />
                {data.managers.map((manager) => (
                  <Line
                    key={manager.id}
                    type="monotone"
                    dataKey={`m${manager.id}`}
                    stroke={manager.color}
                    strokeWidth={2}
                    dot={{ r: 3, fill: manager.color }}
                    activeDot={{ r: 5 }}
                    name={manager.teamName}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            {/* Legend below chart */}
            <div className={styles.legend}>
              {data.managers.map((manager) => (
                <div key={manager.id} className={styles.legendItem}>
                  <span className={styles.legendColor} style={{ backgroundColor: manager.color }} />
                  <span className={styles.legendName}>{manager.teamName}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
