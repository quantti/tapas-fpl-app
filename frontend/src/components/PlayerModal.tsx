import { useState } from 'react'
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Footprints,
  Shield,
} from 'lucide-react'
import FootballIcon from '../assets/football.svg?react'
import { Modal } from './Modal'
import {
  usePlayerDetails,
  getFdrColor,
  getUpcomingFixtures,
  getRecentHistory,
  getPlayerPhotoUrl,
} from '../hooks/usePlayerDetails'
import { getPositionLabel, getPositionColor } from '../constants/positions'
import {
  getDefConThreshold,
  calculatePlayerSeasonDefCon,
  metDefConThreshold,
} from '../utils/defcon'
import type { Player, Team, ElementType } from '../types/fpl'
import * as styles from './PlayerModal.module.css'

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
    <div className={`${styles.fdrBadge} ${styles[fdrClass]}`}>
      <span className={styles.fdrGw}>GW{gameweek}</span>
      <span className={styles.fdrTeam}>{teamShortName}</span>
      <span className={styles.fdrVenue}>{isHome ? 'H' : 'A'}</span>
    </div>
  )
}

type TabId = 'fixtures' | 'history'

const HISTORY_PREVIEW_COUNT = 5

interface TabContentProps {
  upcomingFixtures: ReturnType<typeof getUpcomingFixtures>
  fullHistory: ReturnType<typeof getRecentHistory>
  isLoadingSummary: boolean
  teamsMap: Map<number, Team>
  playerPosition: number
}

function TabContent({
  upcomingFixtures,
  fullHistory,
  isLoadingSummary,
  teamsMap,
  playerPosition,
}: TabContentProps) {
  const [activeTab, setActiveTab] = useState<TabId>('fixtures')
  const [showAllHistory, setShowAllHistory] = useState(false)

  // Determine which history items to display
  const hasMoreHistory = fullHistory.length > HISTORY_PREVIEW_COUNT
  const displayHistory = showAllHistory ? fullHistory : fullHistory.slice(0, HISTORY_PREVIEW_COUNT)

  return (
    <div className={styles.tabSection}>
      <div className={styles.tabButtons}>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === 'fixtures' ? styles.active : ''}`}
          onClick={() => setActiveTab('fixtures')}
        >
          Fixtures
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${activeTab === 'history' ? styles.active : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>

      <div className={styles.tabContent}>
        {activeTab === 'fixtures' && (
          <>
            {isLoadingSummary ? (
              <div className={styles.sectionLoading}>Loading fixtures...</div>
            ) : upcomingFixtures.length === 0 ? (
              <div className={styles.empty}>No upcoming fixtures</div>
            ) : (
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
            ) : fullHistory.length === 0 ? (
              <div className={styles.empty}>No recent history</div>
            ) : (
              <>
                <div
                  className={`${styles.historyList} ${showAllHistory ? styles.historyListExpanded : ''}`}
                >
                  {displayHistory.map((gw) => {
                    const opponent = teamsMap.get(gw.opponent_team)
                    const showCleanSheet = gw.clean_sheets > 0 && playerPosition !== 4
                    // DefCon icon only for DEF/MID (FWD too rare)
                    const gotDefCon =
                      playerPosition !== 4 &&
                      metDefConThreshold(gw.defensive_contribution ?? 0, playerPosition)
                    return (
                      <div key={`${gw.round}-${gw.fixture}`} className={styles.historyItem}>
                        <span className={styles.gwLabel}>GW{gw.round}</span>
                        <span className={styles.gwOpponent}>
                          {opponent?.short_name ?? '???'} ({gw.was_home ? 'H' : 'A'})
                        </span>
                        <span className={styles.gwStats}>
                          <span className={styles.gwIcons}>
                            {gw.goals_scored > 0 && (
                              <span
                                className={styles.gwIcon}
                                title={`${gw.goals_scored} goal${gw.goals_scored > 1 ? 's' : ''}`}
                              >
                                {Array.from({ length: gw.goals_scored }, (_, i) => (
                                  <FootballIcon key={i} width={12} height={12} />
                                ))}
                              </span>
                            )}
                            {gw.assists > 0 && (
                              <span
                                className={styles.gwIcon}
                                title={`${gw.assists} assist${gw.assists > 1 ? 's' : ''}`}
                              >
                                {Array.from({ length: gw.assists }, (_, i) => (
                                  <Footprints key={i} size={12} color="#14B8A6" />
                                ))}
                              </span>
                            )}
                            {showCleanSheet && (
                              <span className={styles.gwIcon} title="Clean sheet">
                                <Shield size={12} color="#3b82f6" fill="#3b82f6" />
                              </span>
                            )}
                            {gotDefCon && (
                              <span className={styles.gwIcon} title="DefCon (+2)">
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
                          </span>
                          <span className={styles.gwPoints}>{gw.total_points} pts</span>
                          <span className={styles.gwMinutes}>{gw.minutes}'</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
                {hasMoreHistory && (
                  <button
                    type="button"
                    className={styles.showMoreButton}
                    onClick={() => setShowAllHistory(!showAllHistory)}
                  >
                    {showAllHistory
                      ? 'Show less'
                      : `Show more (${fullHistory.length - HISTORY_PREVIEW_COUNT} more)`}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export function PlayerModal({ player, teams, elementTypes, onClose }: Props) {
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

  const teamsMap = new Map(teams.map((t) => [t.id, t]))

  const renderContent = () => {
    if (!details) {
      return <div className={styles.loading}>Loading player details...</div>
    }

    const {
      team,
      price,
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
    const isGoalkeeper = player.element_type === 1
    const isDefender = player.element_type === 2
    const upcomingFixtures = getUpcomingFixtures(summary, 10)
    const fullHistory = getRecentHistory(summary, 100) // Get all history, TabContent handles limiting

    // Pre-compute deltas for use in display and legends
    const xgiDelta =
      player.goals_scored +
      player.assists -
      Number.parseFloat(player.expected_goal_involvements || '0')
    const xgcDelta =
      player.goals_conceded - Number.parseFloat(player.expected_goals_conceded || '0')

    // Calculate DefCon points from history using shared utility
    const defConThreshold = getDefConThreshold(player.element_type)
    const defConStats = calculatePlayerSeasonDefCon(summary?.history ?? [], player.element_type)
    const defConTotal = defConStats.total
    const defConPerGame = defConStats.perGame

    return (
      <>
        {/* Header Section */}
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
              <span className={styles.price}>{price}</span>
              <span className={styles.ownership}>{player.selected_by_percent}% owned</span>
            </div>
            <StatusBadge status={player.status} news={player.news} />
          </div>
        </div>

        {/* Stats Grid - position-specific */}
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
                {Number.parseFloat(player.expected_goals_conceded || '0').toFixed(1)}
              </div>
              <div className={styles.statPer90}>{xGC90.toFixed(2)}/90</div>
            </div>
          )}

          {/* xG - MID and FWD only */}
          {!isGoalkeeper && !isDefender && (
            <div className={styles.statCard}>
              <div className={styles.statLabel}>xG</div>
              <div className={styles.statValue}>
                {Number.parseFloat(player.expected_goals || '0').toFixed(1)}
              </div>
              <div className={styles.statPer90}>{xG90.toFixed(2)}/90</div>
            </div>
          )}

          {/* xA - MID and FWD only */}
          {!isGoalkeeper && !isDefender && (
            <div className={styles.statCard}>
              <div className={styles.statLabel}>xA</div>
              <div className={styles.statValue}>
                {Number.parseFloat(player.expected_assists || '0').toFixed(1)}
              </div>
              <div className={styles.statPer90}>{xA90.toFixed(2)}/90</div>
            </div>
          )}

          {/* xGI - DEF, MID, FWD (not GK) */}
          {!isGoalkeeper && (
            <div className={styles.statCard}>
              <div className={styles.statLabel}>xGI</div>
              <div className={styles.statValue}>
                {Number.parseFloat(player.expected_goal_involvements || '0').toFixed(1)}
              </div>
              <div className={styles.statPer90}>{xGI90.toFixed(2)}/90</div>
            </div>
          )}

          {/* DefCon - DEF and MID only (FWD too rare to be useful) */}
          {defConThreshold !== null && player.element_type !== 4 && (
            <div className={styles.statCard}>
              <div className={styles.statLabel}>DefCon</div>
              <div className={styles.statValue}>{defConTotal}</div>
              <div className={styles.statPer90}>{defConPerGame.toFixed(1)}/gm</div>
            </div>
          )}
        </div>

        {/* Performance Deltas */}
        <div className={styles.deltasRow}>
          <div className={styles.deltaItems}>
            {/* MID/FWD: Goals vs xG, Assists vs xA */}
            {!isGoalkeeper && !isDefender && (
              <>
                <span className={styles.deltaItem}>
                  <span className={styles.deltaLabel}>Goals vs xG</span>
                  <span
                    className={`${styles.deltaValue} ${xgDelta >= 0 ? styles.positive : styles.negative}`}
                  >
                    {xgDelta >= 0 ? '+' : ''}
                    {xgDelta.toFixed(1)}
                  </span>
                </span>
                <span className={styles.deltaItem}>
                  <span className={styles.deltaLabel}>Assists vs xA</span>
                  <span
                    className={`${styles.deltaValue} ${xaDelta >= 0 ? styles.positive : styles.negative}`}
                  >
                    {xaDelta >= 0 ? '+' : ''}
                    {xaDelta.toFixed(1)}
                  </span>
                </span>
              </>
            )}
            {/* DEF: G+A vs xGI */}
            {isDefender && (
              <span className={styles.deltaItem}>
                <span className={styles.deltaLabel}>G+A vs xGI</span>
                <span
                  className={`${styles.deltaValue} ${xgiDelta >= 0 ? styles.positive : styles.negative}`}
                >
                  {xgiDelta >= 0 ? '+' : ''}
                  {xgiDelta.toFixed(1)}
                </span>
              </span>
            )}
            {/* GK/DEF: GC vs xGC (inverted - less conceded is good) */}
            {(isGoalkeeper || isDefender) && (
              <span className={styles.deltaItem}>
                <span className={styles.deltaLabel}>GC vs xGC</span>
                <span
                  className={`${styles.deltaValue} ${xgcDelta <= 0 ? styles.positive : styles.negative}`}
                >
                  {xgcDelta >= 0 ? '+' : ''}
                  {xgcDelta.toFixed(1)}
                </span>
              </span>
            )}
          </div>
          <div className={styles.deltaLegend}>
            {isGoalkeeper ? (
              xgcDelta > 0 ? (
                `conceded ${Math.abs(xgcDelta).toFixed(1)} more than expected`
              ) : xgcDelta < 0 ? (
                `conceded ${Math.abs(xgcDelta).toFixed(1)} fewer than expected`
              ) : (
                'conceding as expected'
              )
            ) : isDefender ? (
              <>
                {xgiDelta > 0
                  ? `${Math.abs(xgiDelta).toFixed(1)} more G+A than expected`
                  : xgiDelta < 0
                    ? `${Math.abs(xgiDelta).toFixed(1)} fewer G+A than expected`
                    : 'G+A as expected'}
                {' · '}
                {xgcDelta > 0
                  ? `conceded ${Math.abs(xgcDelta).toFixed(1)} more`
                  : xgcDelta < 0
                    ? `conceded ${Math.abs(xgcDelta).toFixed(1)} fewer`
                    : 'conceding as expected'}
              </>
            ) : (
              <>
                {xgDelta > 0
                  ? `scored ${Math.abs(xgDelta).toFixed(1)} more than xG`
                  : xgDelta < 0
                    ? `scored ${Math.abs(xgDelta).toFixed(1)} fewer than xG`
                    : 'scoring as expected'}
                {' · '}
                {xaDelta > 0
                  ? `${Math.abs(xaDelta).toFixed(1)} more assists than xA`
                  : xaDelta < 0
                    ? `${Math.abs(xaDelta).toFixed(1)} fewer assists than xA`
                    : 'assisting as expected'}
              </>
            )}
          </div>
          <div className={styles.seasonRow}>
            <span className={styles.deltaLabel}>Season</span>
            <span className={styles.deltaValue}>
              {isGoalkeeper ? (
                <>{player.clean_sheets} CS</>
              ) : isDefender ? (
                <>
                  {player.clean_sheets} CS · {player.goals_scored + player.assists} G+A
                </>
              ) : (
                <>
                  {player.goals_scored}G {player.assists}A
                </>
              )}
            </span>
          </div>
        </div>

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
          teamsMap={teamsMap}
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
