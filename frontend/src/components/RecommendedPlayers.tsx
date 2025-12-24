import { Dices, Shield, Info } from 'lucide-react'
import type { Player, Team } from '../types/fpl'
import type { ManagerGameweekData } from '../hooks/useFplData'
import { useRecommendedPlayers } from '../hooks/useRecommendedPlayers'
import * as styles from './RecommendedPlayers.module.css'

const PUNTS_INFO =
  "Low ownership differential picks (<40% in your league) with strong underlying stats and good upcoming fixtures. These players could give you an edge over your rivals. Then again, they might be low ownership because they're rubbish."

const DEFENSIVE_INFO =
  "Popular players (>50% ownership) in good form with favourable fixtures. Consider owning these to protect your rank. Remember: popularity doesn't equal quality - billions of flies love shit."

const DISCLAIMER = 'For entertainment only. Not financial advice. Always do your own research.'

function InfoTooltip({ text, disclaimer }: { text: string; disclaimer: string }) {
  return (
    <span className={styles.infoWrapper}>
      <Info size={14} className={styles.infoIcon} />
      <span className={styles.tooltip}>
        <span>{text}</span>
        <span className={styles.disclaimer}>{disclaimer}</span>
      </span>
    </span>
  )
}

interface Props {
  players: Player[]
  managerDetails: ManagerGameweekData[]
  teamsMap: Map<number, Team>
  currentGameweek: number
}

// Position colors: DEF = red, MID = blue, FWD = green
const POSITION_COLORS: Record<number, string> = {
  2: '#ef4444', // DEF - red
  3: '#3b82f6', // MID - blue
  4: '#22c55e', // FWD - green
}

function PositionDot({ elementType }: { elementType: number }) {
  const color = POSITION_COLORS[elementType] ?? '#6b7280'
  return <span className={styles.positionDot} style={{ backgroundColor: color }} />
}

function FixtureStars({ score }: { score: number }) {
  // Convert 0-1 score to 1-5 stars (higher score = easier = more stars)
  const stars = Math.round(score * 4) + 1

  return (
    <span className={styles.stars}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < stars ? styles.starFilled : styles.starEmpty}>
          ★
        </span>
      ))}
    </span>
  )
}

export function RecommendedPlayers({ players, managerDetails, teamsMap, currentGameweek }: Props) {
  const { punts, defensive, loading, error } = useRecommendedPlayers(
    players,
    managerDetails,
    teamsMap,
    currentGameweek
  )

  if (loading) {
    return (
      <div className={styles.RecommendedPlayers}>
        <div className={styles.card}>
          <div className={styles.loading}>Loading recommendations...</div>
        </div>
        <div className={styles.card}>
          <div className={styles.loading}>Loading recommendations...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.RecommendedPlayers}>
        <div className={styles.card}>
          <div className={styles.error}>{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.RecommendedPlayers}>
      {/* Punts Column */}
      <div className={styles.card}>
        <h3 className={styles.title}>
          <Dices size={16} color="#F59E0B" aria-hidden="true" />
          Punts
          <InfoTooltip text={PUNTS_INFO} disclaimer={DISCLAIMER} />
        </h3>

        {punts.length === 0 ? (
          <p className={styles.empty}>No punt recommendations</p>
        ) : (
          <div className={styles.list}>
            {punts.map(({ player, team, fixtureScore }) => (
              <div key={player.id} className={styles.row}>
                <PositionDot elementType={player.element_type} />
                <span className={styles.playerName}>{player.web_name}</span>
                <span className={styles.teamName}>{team.short_name}</span>
                <FixtureStars score={fixtureScore} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Defensive Options Column */}
      <div className={styles.card}>
        <h3 className={styles.title}>
          <Shield size={16} color="#14B8A6" aria-hidden="true" />
          Defensive Options
          <InfoTooltip text={DEFENSIVE_INFO} disclaimer={DISCLAIMER} />
        </h3>

        {defensive.length === 0 ? (
          <p className={styles.empty}>No defensive recommendations</p>
        ) : (
          <div className={styles.list}>
            {defensive.map(({ player, team, fixtureScore }) => (
              <div key={player.id} className={styles.row}>
                <PositionDot elementType={player.element_type} />
                <span className={styles.playerName}>{player.web_name}</span>
                <span className={styles.teamName}>{team.short_name}</span>
                <FixtureStars score={fixtureScore} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
