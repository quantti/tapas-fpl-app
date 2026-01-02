import { Swords } from 'lucide-react'
import { useMemo, useState } from 'react'

import { Card } from 'components/Card'
import { CardHeader } from 'components/CardHeader'

import { useHeadToHeadComparison } from 'services/queries/useHeadToHeadComparison'

import { formatRank, getComparisonClass } from 'utils/comparison'

import * as styles from './HeadToHead.module.css'

import type { ManagerGameweekData } from 'services/queries/useFplData'
import type { ComparisonStats, TemplateOverlap } from 'services/queries/useHeadToHeadComparison'
import type { Gameweek, Player, Team } from 'types/fpl'
import type { CompareResult } from 'utils/comparison'

interface Props {
  managerDetails: ManagerGameweekData[]
  currentGameweek: number
  gameweeks: Gameweek[]
  playersMap: Map<number, Player>
  teamsMap: Map<number, Team>
}

/**
 * Get the label for points difference display
 */
function getLeadLabel(pointsDiff: number, teamAName: string, teamBName: string): string {
  if (pointsDiff > 0) return `${teamAName} leads by`
  if (pointsDiff < 0) return `${teamBName} leads by`
  return 'Tied!'
}

interface ComparisonContentProps {
  managerAId: number | null
  managerBId: number | null
  loading: boolean
  error: string | null
  managerA: ComparisonStats | null
  managerB: ComparisonStats | null
}

/**
 * Render the comparison content based on state
 */
function renderComparisonContent({
  managerAId,
  managerBId,
  loading,
  error,
  managerA,
  managerB,
}: ComparisonContentProps): React.ReactNode {
  if (!managerAId || !managerBId) {
    return <p className={styles.empty}>Select two managers to compare</p>
  }
  if (loading) {
    return <p className={styles.loading}>Loading comparison...</p>
  }
  if (error) {
    return <p className={styles.error}>{error}</p>
  }
  if (managerA && managerB) {
    return <ComparisonGrid managerA={managerA} managerB={managerB} />
  }
  return null
}

interface StatRowProps {
  label: string
  valueA: string | number
  valueB: string | number
  compareA: CompareResult
  compareB: CompareResult
}

/**
 * Matchup-style stat row: [Value A] [Label] [Value B]
 */
function StatRow({ label, valueA, valueB, compareA, compareB }: StatRowProps) {
  return (
    <div className={styles.statRow}>
      <span className={`${styles.statValue} ${styles.left} ${styles[compareA]}`}>{valueA}</span>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} ${styles.right} ${styles[compareB]}`}>{valueB}</span>
    </div>
  )
}

interface TemplateOverlapRowProps {
  overlapA: TemplateOverlap
  overlapB: TemplateOverlap
}

/**
 * Template overlap display with progress bars
 */
function TemplateOverlapRow({ overlapA, overlapB }: TemplateOverlapRowProps) {
  const compareA = getComparisonClass(overlapA.matchCount, overlapB.matchCount)
  const compareB = getComparisonClass(overlapB.matchCount, overlapA.matchCount)

  return (
    <div className={styles.templateOverlapSection}>
      <div className={styles.templateOverlapRow}>
        <div className={`${styles.templateSide} ${styles.left}`}>
          <div className={styles.templateStats}>
            <span className={`${styles.templateCount} ${styles[compareA]}`}>
              {overlapA.matchCount}/11
            </span>
            <span className={styles.templateLabel}>{overlapA.playstyleLabel}</span>
          </div>
          <div className={styles.progressBar}>
            {Array.from({ length: 11 }).map((_, i) => (
              <div
                key={i}
                className={`${styles.progressSegment} ${i < overlapA.matchCount ? styles.filled : ''}`}
              />
            ))}
          </div>
        </div>

        <span className={styles.statLabel}>Template</span>

        <div className={`${styles.templateSide} ${styles.right}`}>
          <div className={styles.templateStats}>
            <span className={`${styles.templateCount} ${styles[compareB]}`}>
              {overlapB.matchCount}/11
            </span>
            <span className={styles.templateLabel}>{overlapB.playstyleLabel}</span>
          </div>
          <div className={styles.progressBar}>
            {Array.from({ length: 11 }).map((_, i) => (
              <div
                key={i}
                className={`${styles.progressSegment} ${i < overlapB.matchCount ? styles.filled : ''}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

interface ComparisonGridProps {
  managerA: ComparisonStats
  managerB: ComparisonStats
}

function ComparisonGrid({ managerA, managerB }: ComparisonGridProps) {
  // Calculate point difference
  const pointsDiff = managerA.totalPoints - managerB.totalPoints

  return (
    <div className={styles.comparison}>
      {/* Header row with team names on sides */}
      <div className={styles.headerRow}>
        <span className={`${styles.teamName} ${styles.left}`}>{managerA.teamName}</span>
        <span className={styles.headerVs}>VS</span>
        <span className={`${styles.teamName} ${styles.right}`}>{managerB.teamName}</span>
      </div>

      {/* Season Overview */}
      <div className={styles.sectionTitle}>Season Overview</div>
      <StatRow
        label="Total Points"
        valueA={managerA.totalPoints}
        valueB={managerB.totalPoints}
        compareA={getComparisonClass(managerA.totalPoints, managerB.totalPoints)}
        compareB={getComparisonClass(managerB.totalPoints, managerA.totalPoints)}
      />
      <StatRow
        label="Overall Rank"
        valueA={formatRank(managerA.overallRank)}
        valueB={formatRank(managerB.overallRank)}
        compareA={getComparisonClass(managerA.overallRank, managerB.overallRank, true)}
        compareB={getComparisonClass(managerB.overallRank, managerA.overallRank, true)}
      />
      <StatRow
        label="League Rank"
        valueA={managerA.leagueRank}
        valueB={managerB.leagueRank}
        compareA={getComparisonClass(managerA.leagueRank, managerB.leagueRank, true)}
        compareB={getComparisonClass(managerB.leagueRank, managerA.leagueRank, true)}
      />
      <StatRow
        label="Last 5 GW Avg"
        valueA={managerA.last5Average.toFixed(1)}
        valueB={managerB.last5Average.toFixed(1)}
        compareA={getComparisonClass(managerA.last5Average, managerB.last5Average)}
        compareB={getComparisonClass(managerB.last5Average, managerA.last5Average)}
      />
      <div className={styles.diffRow}>
        <span className={styles.diffLabel}>
          {getLeadLabel(pointsDiff, managerA.teamName, managerB.teamName)}
        </span>
        <span className={styles.diffValue}>
          {pointsDiff !== 0 ? `${Math.abs(pointsDiff)} pts` : ''}
        </span>
      </div>

      {/* Transfers */}
      <div className={styles.sectionTitle}>Transfers</div>
      <StatRow
        label="Total Transfers"
        valueA={managerA.totalTransfers}
        valueB={managerB.totalTransfers}
        compareA="neutral"
        compareB="neutral"
      />
      <StatRow
        label="Remaining FT"
        valueA={managerA.remainingTransfers}
        valueB={managerB.remainingTransfers}
        compareA={getComparisonClass(managerA.remainingTransfers, managerB.remainingTransfers)}
        compareB={getComparisonClass(managerB.remainingTransfers, managerA.remainingTransfers)}
      />
      <StatRow
        label="Hits Taken"
        valueA={managerA.totalHits}
        valueB={managerB.totalHits}
        compareA={getComparisonClass(managerA.totalHits, managerB.totalHits, true)}
        compareB={getComparisonClass(managerB.totalHits, managerA.totalHits, true)}
      />
      <StatRow
        label="Points Lost"
        valueA={managerA.hitsCost !== 0 ? managerA.hitsCost : '0'}
        valueB={managerB.hitsCost !== 0 ? managerB.hitsCost : '0'}
        compareA={getComparisonClass(
          Math.abs(managerA.hitsCost),
          Math.abs(managerB.hitsCost),
          true
        )}
        compareB={getComparisonClass(
          Math.abs(managerB.hitsCost),
          Math.abs(managerA.hitsCost),
          true
        )}
      />

      {/* Captain */}
      <div className={styles.sectionTitle}>Captain</div>
      <StatRow
        label="Captain Points"
        valueA={managerA.captainPoints}
        valueB={managerB.captainPoints}
        compareA={getComparisonClass(managerA.captainPoints, managerB.captainPoints)}
        compareB={getComparisonClass(managerB.captainPoints, managerA.captainPoints)}
      />
      <StatRow
        label="Differential Picks"
        valueA={managerA.differentialCaptains}
        valueB={managerB.differentialCaptains}
        compareA="neutral"
        compareB="neutral"
      />

      {/* Chips */}
      <div className={styles.sectionTitle}>Chips (Current Half)</div>
      <StatRow
        label="Used"
        valueA={managerA.chipsUsed.length > 0 ? managerA.chipsUsed.join(', ') : '—'}
        valueB={managerB.chipsUsed.length > 0 ? managerB.chipsUsed.join(', ') : '—'}
        compareA="neutral"
        compareB="neutral"
      />
      <StatRow
        label="Remaining"
        valueA={managerA.chipsRemaining.length > 0 ? managerA.chipsRemaining.join(', ') : '—'}
        valueB={managerB.chipsRemaining.length > 0 ? managerB.chipsRemaining.join(', ') : '—'}
        compareA="neutral"
        compareB="neutral"
      />

      {/* Value */}
      <div className={styles.sectionTitle}>Value</div>
      <StatRow
        label="Squad Value"
        valueA={`£${managerA.squadValue.toFixed(1)}m`}
        valueB={`£${managerB.squadValue.toFixed(1)}m`}
        compareA={getComparisonClass(managerA.squadValue, managerB.squadValue)}
        compareB={getComparisonClass(managerB.squadValue, managerA.squadValue)}
      />
      <StatRow
        label="Bank"
        valueA={`£${managerA.bank.toFixed(1)}m`}
        valueB={`£${managerB.bank.toFixed(1)}m`}
        compareA={getComparisonClass(managerA.bank, managerB.bank)}
        compareB={getComparisonClass(managerB.bank, managerA.bank)}
      />

      {/* Template Overlap */}
      <div className={styles.sectionTitle}>Playstyle</div>
      <TemplateOverlapRow overlapA={managerA.templateOverlap} overlapB={managerB.templateOverlap} />
    </div>
  )
}

export function HeadToHead({
  managerDetails,
  currentGameweek,
  gameweeks,
  playersMap,
  teamsMap,
}: Props) {
  const [managerAId, setManagerAId] = useState<number | null>(null)
  const [managerBId, setManagerBId] = useState<number | null>(null)

  // Sort managers by league rank for dropdown
  const sortedManagers = useMemo(
    () => [...managerDetails].sort((a, b) => a.rank - b.rank),
    [managerDetails]
  )

  const { managerA, managerB, loading, error } = useHeadToHeadComparison({
    managerAId,
    managerBId,
    managerDetails,
    currentGameweek,
    gameweeks,
    playersMap,
    teamsMap,
  })

  const handleManagerAChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setManagerAId(value ? Number(value) : null)
  }

  const handleManagerBChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setManagerBId(value ? Number(value) : null)
  }

  if (managerDetails.length < 2) return null

  return (
    <Card>
      <div className={styles.HeadToHead}>
        <CardHeader icon={<Swords size={16} color="#9333ea" />}>Head-to-Head</CardHeader>

        <div className={styles.selectors}>
          <div className={styles.selectorGroup}>
            <label htmlFor="manager-a-select" className={styles.selectorLabel}>
              Manager A
            </label>
            <select
              id="manager-a-select"
              className={styles.dropdown}
              value={managerAId ?? ''}
              onChange={handleManagerAChange}
            >
              <option value="">Select manager...</option>
              {sortedManagers.map((m) => (
                <option key={m.managerId} value={m.managerId} disabled={m.managerId === managerBId}>
                  {m.rank}. {m.teamName}
                </option>
              ))}
            </select>
          </div>

          <span className={styles.vsLabel}>vs</span>

          <div className={styles.selectorGroup}>
            <label htmlFor="manager-b-select" className={styles.selectorLabel}>
              Manager B
            </label>
            <select
              id="manager-b-select"
              className={styles.dropdown}
              value={managerBId ?? ''}
              onChange={handleManagerBChange}
            >
              <option value="">Select manager...</option>
              {sortedManagers.map((m) => (
                <option key={m.managerId} value={m.managerId} disabled={m.managerId === managerAId}>
                  {m.rank}. {m.teamName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {renderComparisonContent({
          managerAId,
          managerBId,
          loading,
          error,
          managerA,
          managerB,
        })}
      </div>
    </Card>
  )
}
