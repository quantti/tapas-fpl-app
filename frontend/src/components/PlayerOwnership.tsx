import { useMemo } from 'react'
import { Users } from 'lucide-react'
import type { ManagerGameweekData } from '../hooks/useFplData'
import type { Player, Team } from '../types/fpl'
import * as styles from './PlayerOwnership.module.css'

interface Props {
  managerDetails: ManagerGameweekData[]
  playersMap: Map<number, Player>
  teamsMap: Map<number, Team>
}

interface PlayerOwnershipData {
  player: Player
  team: Team | undefined
  count: number
  percentage: number
}

export function PlayerOwnership({ managerDetails, playersMap, teamsMap }: Props) {
  const totalManagers = managerDetails.length

  const ownership = useMemo(() => {
    if (totalManagers === 0) return []

    // Aggregate ownership across all managers
    const ownershipMap = new Map<number, number>()

    for (const manager of managerDetails) {
      for (const pick of manager.picks) {
        const current = ownershipMap.get(pick.playerId) || 0
        ownershipMap.set(pick.playerId, current + 1)
      }
    }

    // Convert to array with player data
    const result: PlayerOwnershipData[] = []

    for (const [playerId, count] of ownershipMap) {
      const player = playersMap.get(playerId)
      if (player) {
        result.push({
          player,
          team: teamsMap.get(player.team),
          count,
          percentage: (count / totalManagers) * 100,
        })
      }
    }

    // Sort by ownership count (descending)
    result.sort((a, b) => b.count - a.count || a.player.web_name.localeCompare(b.player.web_name))

    return result
  }, [managerDetails, playersMap, teamsMap, totalManagers])

  if (totalManagers === 0) {
    return null
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>
        <Users size={16} aria-hidden="true" /> Player Ownership
      </h3>
      <div className={styles.list}>
        {ownership.map(({ player, team, count, percentage }) => (
          <div key={player.id} className={styles.row}>
            <span className={styles.player}>
              {player.web_name}
              <span className={styles.team}>({team?.short_name || '?'})</span>
            </span>
            <span className={styles.ownership}>
              <span className={styles.count}>
                {count}/{totalManagers}
              </span>
              <span className={styles.percentage}>{Math.round(percentage)}%</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
