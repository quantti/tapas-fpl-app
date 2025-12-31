import { Dices, Shield, Info, TrendingDown } from 'lucide-react'
import type { Player, Team } from '../types/fpl'
import type { ManagerGameweekData } from '../hooks/useFplData'
import { useRecommendedPlayers } from '../hooks/useRecommendedPlayers'
import { getPositionLabel, getPositionColor } from '../constants/positions'
import * as styles from './RecommendedPlayers.module.css'

const PUNTS_INFO =
  "Low ownership differential picks (<40% in your league) with strong underlying stats and good upcoming fixtures. These players could give you an edge over your rivals. Then again, they might be low ownership because they're rubbish."

const DEFENSIVE_INFO =
  "Popular players (>40% ownership) in good form with favourable fixtures. Consider owning these to protect your rank. Remember: popularity doesn't equal quality - billions of flies love shit."

const SELL_INFO =
  "Players with poor recent form and tough upcoming fixtures. If you own them, might be time to move on. Of course, they could also be about to haul - that's FPL for you."

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
  onPlayerClick?: (player: Player) => void
}

function PositionBadge({ elementType }: { elementType: number }) {
  return (
    <span
      className={styles.positionBadge}
      style={{ backgroundColor: getPositionColor(elementType) }}
    >
      {getPositionLabel(elementType)}
    </span>
  )
}

function ScoreStars({ score }: { score: number }) {
  // Convert 0-1 score to 1-5 stars (higher score = better recommendation)
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

export function RecommendedPlayers({
  players,
  managerDetails,
  teamsMap,
  currentGameweek,
  onPlayerClick,
}: Props) {
  const { punts, defensive, toSell, loading, error } = useRecommendedPlayers(
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
            {punts.map(({ player, team, score }) => (
              <button
                key={player.id}
                type="button"
                className={`${styles.row} ${onPlayerClick ? styles.clickable : ''}`}
                onClick={() => onPlayerClick?.(player)}
                disabled={!onPlayerClick}
              >
                <PositionBadge elementType={player.element_type} />
                <span className={styles.playerName}>{player.web_name}</span>
                <span className={styles.teamName}>{team.short_name}</span>
                <ScoreStars score={score} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right Column: Defensive Options + To Sell */}
      <div className={styles.rightColumn}>
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
              {defensive.map(({ player, team, score }) => (
                <button
                  key={player.id}
                  type="button"
                  className={`${styles.row} ${onPlayerClick ? styles.clickable : ''}`}
                  onClick={() => onPlayerClick?.(player)}
                  disabled={!onPlayerClick}
                >
                  <PositionBadge elementType={player.element_type} />
                  <span className={styles.playerName}>{player.web_name}</span>
                  <span className={styles.teamName}>{team.short_name}</span>
                  <ScoreStars score={score} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={styles.card}>
          <h3 className={styles.title}>
            <TrendingDown size={16} color="#EF4444" aria-hidden="true" />
            Time to Sell
            <InfoTooltip text={SELL_INFO} disclaimer={DISCLAIMER} />
          </h3>

          {toSell.length === 0 ? (
            <p className={styles.empty}>No sell recommendations</p>
          ) : (
            <div className={styles.list}>
              {toSell.map(({ player, team, score }) => (
                <button
                  key={player.id}
                  type="button"
                  className={`${styles.row} ${onPlayerClick ? styles.clickable : ''}`}
                  onClick={() => onPlayerClick?.(player)}
                  disabled={!onPlayerClick}
                >
                  <PositionBadge elementType={player.element_type} />
                  <span className={styles.playerName}>{player.web_name}</span>
                  <span className={styles.teamName}>{team.short_name}</span>
                  <ScoreStars score={score} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
