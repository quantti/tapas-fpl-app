import { TrendingDown, TrendingUp, User } from 'lucide-react'
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

import { Card } from 'components/Card'
import { CardHeader } from 'components/CardHeader'

import { POSITION_COLORS } from 'constants/positions'

import * as styles from './PersonalStats.module.css'
import { usePersonalStats } from './usePersonalStats'
import { usePositionBreakdown } from './usePositionBreakdown'

import type { ManagerGameweekData } from 'services/queries/useFplData'
import type { Gameweek, Player } from 'types/fpl'

interface Props {
  managerId: number
  managerDetails: ManagerGameweekData[]
  gameweeks: Gameweek[]
  playersMap: Map<number, Player>
}

const COLORS = {
  user: 'var(--color-primary)',
  league: 'var(--color-success)',
  world: 'var(--color-text-muted)',
}

const AXIS_STYLE = {
  tick: { fontSize: 11, fill: 'var(--color-text-muted)' },
  axisLine: { stroke: 'var(--color-border)' },
  tickLine: { stroke: 'var(--color-border)' },
}

export function PersonalStats({ managerId, managerDetails, gameweeks, playersMap }: Props) {
  const { data, isLoading, error } = usePersonalStats({
    managerId,
    managerDetails,
    gameweeks,
    enabled: true,
  })

  // Calculate completed gameweeks for position breakdown
  const completedGameweeks = useMemo(
    () => gameweeks.filter((gw) => gw.finished).map((gw) => gw.id),
    [gameweeks]
  )

  const { data: positionBreakdown, isLoading: positionLoading } = usePositionBreakdown({
    managerId,
    playersMap,
    completedGameweeks,
    enabled: completedGameweeks.length > 0,
  })

  if (isLoading) {
    return (
      <Card className={styles.card}>
        <CardHeader icon={<User size={16} color="var(--color-primary)" />}>
          Your Statistics
        </CardHeader>
        <p className={styles.loading}>Loading your stats...</p>
      </Card>
    )
  }

  if (error || !data) {
    return (
      <Card className={styles.card}>
        <CardHeader icon={<User size={16} color="var(--color-primary)" />}>
          Your Statistics
        </CardHeader>
        <p className={styles.error}>{error || 'Could not load your statistics'}</p>
      </Card>
    )
  }

  if (data.weeklyData.length === 0) {
    return (
      <Card className={styles.card}>
        <CardHeader icon={<User size={16} color="var(--color-primary)" />}>
          Your Statistics
        </CardHeader>
        <p className={styles.empty}>No completed gameweeks yet</p>
      </Card>
    )
  }

  return (
    <Card className={styles.card}>
      <CardHeader icon={<User size={16} color="var(--color-primary)" />}>
        Your Statistics
      </CardHeader>

      {/* Best/Worst GW Mini Cards */}
      <div className={styles.miniCards}>
        {data.bestGameweek && (
          <div className={`${styles.miniCard} ${styles.best}`}>
            <TrendingUp size={16} />
            <div className={styles.miniCardContent}>
              <span className={styles.miniCardLabel}>Best</span>
              <span className={styles.miniCardValue}>
                GW{data.bestGameweek.gw} — {data.bestGameweek.points} pts
              </span>
            </div>
          </div>
        )}
        {data.worstGameweek && (
          <div className={`${styles.miniCard} ${styles.worst}`}>
            <TrendingDown size={16} />
            <div className={styles.miniCardContent}>
              <span className={styles.miniCardLabel}>Worst</span>
              <span className={styles.miniCardValue}>
                GW{data.worstGameweek.gw} — {data.worstGameweek.points} pts
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Weekly Performance Chart */}
      <div className={styles.chartSection}>
        <h3 className={styles.chartTitle}>Weekly Performance</h3>
        <div className={styles.chartContainer}>
          <div
            className={styles.chartInner}
            style={{ minWidth: Math.max(600, data.weeklyData.length * 50) }}
          >
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.weeklyData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <XAxis dataKey="gameweek" tickFormatter={(gw) => `${gw}`} {...AXIS_STYLE} />
                <YAxis {...AXIS_STYLE} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    return (
                      <div className={styles.tooltip}>
                        <div className={styles.tooltipTitle}>Gameweek {label}</div>
                        {payload.map((entry) => (
                          <div key={entry.dataKey} className={styles.tooltipRow}>
                            <span
                              className={styles.tooltipDot}
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className={styles.tooltipLabel}>{entry.name}:</span>
                            <span className={styles.tooltipValue}>{entry.value} pts</span>
                          </div>
                        ))}
                      </div>
                    )
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className={styles.legendText}>{value}</span>}
                />
                <Bar dataKey="userPoints" name="You" fill={COLORS.user} radius={[2, 2, 0, 0]} />
                <Bar
                  dataKey="leagueAverage"
                  name="League Avg"
                  fill={COLORS.league}
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  dataKey="worldAverage"
                  name="World Avg"
                  fill={COLORS.world}
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Season Totals */}
      <div className={styles.totals}>
        <div className={styles.totalItem}>
          <span className={styles.totalLabel}>Your Total</span>
          <span className={styles.totalValue}>{data.totalPoints}</span>
        </div>
        <div className={styles.totalItem}>
          <span className={styles.totalLabel}>League Avg</span>
          <span className={styles.totalValue} style={{ color: COLORS.league }}>
            {data.leagueAverageTotal}
          </span>
        </div>
        <div className={styles.totalItem}>
          <span className={styles.totalLabel}>World Avg</span>
          <span className={styles.totalValue} style={{ color: COLORS.world }}>
            {data.worldAverageTotal}
          </span>
        </div>
      </div>

      {/* Position Breakdown */}
      {positionBreakdown && !positionLoading && (
        <div className={styles.positionSection}>
          <h3 className={styles.chartTitle}>Points by Position</h3>
          <div className={styles.positionGrid}>
            {positionBreakdown.map((item, index) => (
              <div key={item.position} className={styles.positionItem}>
                <span
                  className={styles.positionLabel}
                  style={{ color: POSITION_COLORS[index + 1] }}
                >
                  {item.position}
                </span>
                <span className={styles.positionPoints}>{item.points}</span>
                <span className={styles.positionPercentage}>{item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
