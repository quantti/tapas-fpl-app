import clsx from 'clsx'
import { CheckCircle, AlertCircle, XCircle, TrendingUp, TrendingDown } from 'lucide-react'
import { useState, useMemo } from 'react'

import { Modal } from 'components/Modal'

import { getPositionLabel, getPositionColor, POSITION_TYPES } from 'constants/positions'

import {
  usePlayerDetails,
  getFdrColor,
  getUpcomingFixtures,
  getRecentHistory,
  getPlayerPhotoUrl,
} from 'services/queries/usePlayerDetails'

import { getDefConThreshold, calculatePlayerSeasonDefCon } from 'utils/defcon'
import { createTeamsMap } from 'utils/mappers'
import {
  parseNumericString,
  formatDelta,
  getDeltaClass,
  getGoalsDeltaLegend,
  getAssistsDeltaLegend,
  getGoalsConcededDeltaLegend,
  getGoalInvolvementsDeltaLegend,
  getSeasonSummary,
} from 'utils/playerStats'

import { HistoryTable } from './components/HistoryTable'
import * as styles from './PlayerDetails.module.css'

import type { Player, Team, ElementType } from 'types/fpl'

interface Props {
  player: Player | null
  teams: Team[]
  elementTypes: ElementType[]
  onClose: () => void
}

function StatusBadge({ status, news }: { status: string; news: string }) {
  const getStatusInfo = () => {
    switch (status) {
      case 'a':
        return { icon: CheckCircle, color: 'var(--color-success)', label: 'Available' }
      case 'd':
        return { icon: AlertCircle, color: 'var(--color-warning)', label: 'Doubtful' }
      case 'i':
      case 'u':
        return { icon: XCircle, color: 'var(--color-error)', label: 'Unavailable' }
      default:
        return { icon: AlertCircle, color: 'var(--color-text-muted)', label: 'Unknown' }
    }
  }

  const { icon: Icon, color, label } = getStatusInfo()

  return (
    <div className={styles.status}>
      <Icon size={14} color={color} />
      <span style={{ color }}>{label}</span>
      {news && <span className={styles.news}>{news}</span>}
    </div>
  )
}

function FormIndicator({
  formVsAvg,
  formDiff,
}: {
  formVsAvg: 'above' | 'below' | 'same'
  formDiff: number
}) {
  if (formVsAvg === 'same') {
    return <span className={styles.formSame}>= avg</span>
  }

  const isAbove = formVsAvg === 'above'
  const Icon = isAbove ? TrendingUp : TrendingDown
  const color = isAbove ? 'var(--color-success)' : 'var(--color-error)'
  const sign = isAbove ? '+' : ''

  return (
    <span className={styles.formIndicator} style={{ color }}>
      <Icon size={14} />
      {sign}
      {formDiff.toFixed(1)}
    </span>
  )
}

function FdrBadge({
  gameweek,
  difficulty,
  teamShortName,
  isHome,
}: {
  gameweek: number
  difficulty: number
  teamShortName: string
  isHome: boolean
}) {
  const fdrClass = getFdrColor(difficulty)

  return (
    <div className={clsx(styles.fdrBadge, styles[fdrClass])}>
      <span className={styles.fdrGw}>GW{gameweek}</span>
      <span className={styles.fdrTeam}>{teamShortName}</span>
      <span className={styles.fdrVenue}>{isHome ? 'H' : 'A'}</span>
    </div>
  )
}

// --- Sub-components ---

interface PlayerHeaderProps {
  player: Player
  team: Team
  price: string
  priceChange: number
  priceChangeFormatted: string
}

function PlayerHeader({
  player,
  team,
  price,
  priceChange,
  priceChangeFormatted,
}: PlayerHeaderProps) {
  return (
    <div className={styles.header}>
      <img
        src={getPlayerPhotoUrl(player.photo)}
        alt={player.web_name}
        className={styles.photo}
        onError={(e) => {
          // Fallback to shirt if photo fails
          e.currentTarget.src = `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${player.team_code}-110.webp`
        }}
      />
      <div className={styles.headerInfo}>
        <div className={styles.nameRow}>
          <span className={styles.playerName}>{player.web_name}</span>
          <span
            className={styles.positionBadge}
            style={{ backgroundColor: getPositionColor(player.element_type) }}
          >
            {getPositionLabel(player.element_type)}
          </span>
        </div>
        <div className={styles.teamRow}>
          <span className={styles.teamName}>{team.name}</span>
        </div>
        <div className={styles.priceRow}>
          <span className={styles.price}>
            {price}
            {priceChangeFormatted && (
              <span
                className={clsx(
                  styles.priceChange,
                  priceChange > 0 ? styles.positive : styles.negative
                )}
                title={`Price change since season start`}
              >
                {priceChangeFormatted}
              </span>
            )}
          </span>
          <span className={styles.ownership}>{player.selected_by_percent}% owned</span>
        </div>
        <StatusBadge status={player.status} news={player.news} />
      </div>
    </div>
  )
}

interface PlayerStatsGridProps {
  player: Player
  pts90: number
  formVsAvg: 'above' | 'below' | 'same'
  formDiff: number
  xGC90: number
  xG90: number
  xA90: number
  xGI90: number
  defConTotal: number
  defConPerGame: number
  defConThreshold: number | null
}

function PlayerStatsGrid({
  player,
  pts90,
  formVsAvg,
  formDiff,
  xGC90,
  xG90,
  xA90,
  xGI90,
  defConTotal,
  defConPerGame,
  defConThreshold,
}: PlayerStatsGridProps) {
  const isGoalkeeper = player.element_type === POSITION_TYPES.GOALKEEPER
  const isDefender = player.element_type === POSITION_TYPES.DEFENDER

  return (
    <div className={styles.statsGrid}>
      {/* Points - all positions */}
      <div className={styles.statCard}>
        <div className={styles.statLabel}>Points</div>
        <div className={styles.statValue}>{player.total_points}</div>
        <div className={styles.statPer90}>{pts90.toFixed(1)}/90</div>
      </div>

      {/* Form - all positions */}
      <div className={styles.statCard}>
        <div className={styles.statLabel}>Form</div>
        <div className={styles.statValue}>{player.form}</div>
        <FormIndicator formVsAvg={formVsAvg} formDiff={formDiff} />
      </div>

      {/* xGC - GK and DEF only */}
      {(isGoalkeeper || isDefender) && (
        <div className={styles.statCard}>
          <div className={styles.statLabel}>xGC</div>
          <div className={styles.statValue}>
            {parseNumericString(player.expected_goals_conceded).toFixed(1)}
          </div>
          <div className={styles.statPer90}>{xGC90.toFixed(2)}/90</div>
        </div>
      )}

      {/* xG - MID and FWD only */}
      {!isGoalkeeper && !isDefender && (
        <div className={styles.statCard}>
          <div className={styles.statLabel}>xG</div>
          <div className={styles.statValue}>
            {parseNumericString(player.expected_goals).toFixed(1)}
          </div>
          <div className={styles.statPer90}>{xG90.toFixed(2)}/90</div>
        </div>
      )}

      {/* xA - MID and FWD only */}
      {!isGoalkeeper && !isDefender && (
        <div className={styles.statCard}>
          <div className={styles.statLabel}>xA</div>
          <div className={styles.statValue}>
            {parseNumericString(player.expected_assists).toFixed(1)}
          </div>
          <div className={styles.statPer90}>{xA90.toFixed(2)}/90</div>
        </div>
      )}

      {/* xGI - DEF, MID, FWD (not GK) */}
      {!isGoalkeeper && (
        <div className={styles.statCard}>
          <div className={styles.statLabel}>xGI</div>
          <div className={styles.statValue}>
            {parseNumericString(player.expected_goal_involvements).toFixed(1)}
          </div>
          <div className={styles.statPer90}>{xGI90.toFixed(2)}/90</div>
        </div>
      )}

      {/* DefCon - DEF and MID only (FWD too rare to be useful) */}
      {defConThreshold !== null && player.element_type !== POSITION_TYPES.FORWARD && (
        <div className={styles.statCard}>
          <div className={styles.statLabel}>DefCon</div>
          <div className={styles.statValue}>{defConTotal}</div>
          <div className={styles.statPer90}>{defConPerGame.toFixed(1)}/gm</div>
        </div>
      )}
    </div>
  )
}

interface PerformanceDeltasProps {
  player: Player
  xgDelta: number
  xaDelta: number
  xgiDelta: number
  xgcDelta: number
}

function PerformanceDeltas({
  player,
  xgDelta,
  xaDelta,
  xgiDelta,
  xgcDelta,
}: PerformanceDeltasProps) {
  const isGoalkeeper = player.element_type === POSITION_TYPES.GOALKEEPER
  const isDefender = player.element_type === POSITION_TYPES.DEFENDER

  return (
    <div className={styles.deltasRow}>
      <div className={styles.deltaItems}>
        {/* MID/FWD: Goals vs xG, Assists vs xA */}
        {!isGoalkeeper && !isDefender && (
          <>
            <span className={styles.deltaItem}>
              <span className={styles.deltaLabel}>Goals vs xG</span>
              <span className={clsx(styles.deltaValue, styles[getDeltaClass(xgDelta)])}>
                {formatDelta(xgDelta)}
              </span>
            </span>
            <span className={styles.deltaItem}>
              <span className={styles.deltaLabel}>Assists vs xA</span>
              <span className={clsx(styles.deltaValue, styles[getDeltaClass(xaDelta)])}>
                {formatDelta(xaDelta)}
              </span>
            </span>
          </>
        )}
        {/* DEF: G+A vs xGI */}
        {isDefender && (
          <span className={styles.deltaItem}>
            <span className={styles.deltaLabel}>G+A vs xGI</span>
            <span className={clsx(styles.deltaValue, styles[getDeltaClass(xgiDelta)])}>
              {formatDelta(xgiDelta)}
            </span>
          </span>
        )}
        {/* GK/DEF: GC vs xGC (inverted - less conceded is good) */}
        {(isGoalkeeper || isDefender) && (
          <span className={styles.deltaItem}>
            <span className={styles.deltaLabel}>GC vs xGC</span>
            <span className={clsx(styles.deltaValue, styles[getDeltaClass(xgcDelta, true)])}>
              {formatDelta(xgcDelta)}
            </span>
          </span>
        )}
      </div>
      <div className={styles.deltaLegend}>
        {isGoalkeeper && getGoalsConcededDeltaLegend(xgcDelta)}
        {isDefender && (
          <>
            {getGoalInvolvementsDeltaLegend(xgiDelta)}
            {' · '}
            {getGoalsConcededDeltaLegend(xgcDelta)}
          </>
        )}
        {!isGoalkeeper && !isDefender && (
          <>
            {getGoalsDeltaLegend(xgDelta)}
            {' · '}
            {getAssistsDeltaLegend(xaDelta)}
          </>
        )}
      </div>
      <div className={styles.seasonRow}>
        <span className={styles.deltaLabel}>Season</span>
        <span className={styles.deltaValue}>{getSeasonSummary(player.element_type, player)}</span>
      </div>
    </div>
  )
}

// --- Tab Content ---

type TabId = 'fixtures' | 'history'

interface TabContentProps {
  upcomingFixtures: ReturnType<typeof getUpcomingFixtures>
  fullHistory: ReturnType<typeof getRecentHistory>
  isLoadingSummary: boolean
  teams: Team[]
  playerPosition: number
}

function TabContent({
  upcomingFixtures,
  fullHistory,
  isLoadingSummary,
  teams,
  playerPosition,
}: TabContentProps) {
  const [activeTab, setActiveTab] = useState<TabId>('fixtures')

  // Create teamsMap for fixtures lookup
  const teamsMap = useMemo(() => createTeamsMap(teams), [teams])

  return (
    <div className={styles.tabSection}>
      <div className={styles.tabButtons}>
        <button
          type="button"
          className={clsx(styles.tabButton, activeTab === 'fixtures' && styles.active)}
          onClick={() => setActiveTab('fixtures')}
        >
          Fixtures
        </button>
        <button
          type="button"
          className={clsx(styles.tabButton, activeTab === 'history' && styles.active)}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>

      <div className={styles.tabContent}>
        {activeTab === 'fixtures' && (
          <>
            {isLoadingSummary && <div className={styles.sectionLoading}>Loading fixtures...</div>}
            {!isLoadingSummary && upcomingFixtures.length === 0 && (
              <div className={styles.empty}>No upcoming fixtures</div>
            )}
            {!isLoadingSummary && upcomingFixtures.length > 0 && (
              <div className={styles.fixtureList}>
                {upcomingFixtures.map((fixture) => {
                  const opponent = teamsMap.get(fixture.is_home ? fixture.team_a : fixture.team_h)
                  return (
                    <FdrBadge
                      key={fixture.id}
                      gameweek={fixture.event}
                      difficulty={fixture.difficulty}
                      teamShortName={opponent?.short_name ?? '???'}
                      isHome={fixture.is_home}
                    />
                  )
                })}
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && (
          <>
            {isLoadingSummary ? (
              <div className={styles.sectionLoading}>Loading history...</div>
            ) : (
              <HistoryTable data={fullHistory} playerPosition={playerPosition} teams={teams} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function PlayerDetails({ player, teams, elementTypes, onClose }: Props) {
  const details = usePlayerDetails({
    player,
    teams,
    elementTypes,
    enabled: player !== null,
  })

  const isOpen = player !== null

  if (!isOpen || !player) {
    return null
  }

  const renderContent = () => {
    if (!details) {
      return <div className={styles.loading}>Loading player details...</div>
    }

    const {
      team,
      price,
      priceChange,
      priceChangeFormatted,
      xgDelta,
      xaDelta,
      xG90,
      xA90,
      xGI90,
      xGC90,
      pts90,
      formVsAvg,
      formDiff,
      summary,
      isLoadingSummary,
    } = details
    const upcomingFixtures = getUpcomingFixtures(summary, 10)
    const fullHistory = getRecentHistory(summary, 100) // Get all history, TabContent handles limiting

    // Pre-compute deltas for use in display and legends
    const xgiDelta =
      player.goals_scored + player.assists - parseNumericString(player.expected_goal_involvements)
    const xgcDelta = player.goals_conceded - parseNumericString(player.expected_goals_conceded)

    // Calculate DefCon points from history using shared utility
    const defConThreshold = getDefConThreshold(player.element_type)
    const defConStats = calculatePlayerSeasonDefCon(summary?.history ?? [], player.element_type)
    const defConTotal = defConStats.total
    const defConPerGame = defConStats.perGame

    return (
      <>
        <PlayerHeader
          player={player}
          team={team}
          price={price}
          priceChange={priceChange}
          priceChangeFormatted={priceChangeFormatted}
        />

        <PlayerStatsGrid
          player={player}
          pts90={pts90}
          formVsAvg={formVsAvg}
          formDiff={formDiff}
          xGC90={xGC90}
          xG90={xG90}
          xA90={xA90}
          xGI90={xGI90}
          defConTotal={defConTotal}
          defConPerGame={defConPerGame}
          defConThreshold={defConThreshold}
        />

        <PerformanceDeltas
          player={player}
          xgDelta={xgDelta}
          xaDelta={xaDelta}
          xgiDelta={xgiDelta}
          xgcDelta={xgcDelta}
        />

        {/* Additional Stats */}
        <div className={styles.additionalStats}>
          <span>{player.minutes} mins</span>
          <span>{player.bonus} bonus</span>
        </div>

        {/* Tabbed Fixtures/History */}
        <TabContent
          upcomingFixtures={upcomingFixtures}
          fullHistory={fullHistory}
          isLoadingSummary={isLoadingSummary}
          teams={teams}
          playerPosition={player.element_type}
        />
      </>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={player.web_name}>
      <div className={styles.PlayerModal} data-testid="player-modal">
        {renderContent()}
      </div>
    </Modal>
  )
}
