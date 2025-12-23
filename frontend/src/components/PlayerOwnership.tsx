import { useMemo, useState } from 'react'
import { Users, ChevronRight } from 'lucide-react'
import type { ManagerGameweekData } from '../hooks/useFplData'
import type { Player, Team } from '../types/fpl'
import { PlayerOwnershipModal } from './PlayerOwnershipModal'
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
  ownerTeamNames: string[]
}

interface ModalState {
  isOpen: boolean
  playerName: string
  teamNames: string[]
}

export function PlayerOwnership({ managerDetails, playersMap, teamsMap }: Props) {
  const totalManagers = managerDetails.length

  const [modal, setModal] = useState<ModalState>({
    isOpen: false,
    playerName: '',
    teamNames: [],
  })

  const ownership = useMemo(() => {
    if (totalManagers === 0) return []

    // Aggregate ownership across all managers, tracking team names
    const ownershipMap = new Map<number, { count: number; teamNames: string[] }>()

    for (const manager of managerDetails) {
      for (const pick of manager.picks) {
        const current = ownershipMap.get(pick.playerId) || { count: 0, teamNames: [] }
        ownershipMap.set(pick.playerId, {
          count: current.count + 1,
          teamNames: [...current.teamNames, manager.teamName],
        })
      }
    }

    // Convert to array with player data
    const result: PlayerOwnershipData[] = []

    for (const [playerId, data] of ownershipMap) {
      const player = playersMap.get(playerId)
      if (player) {
        result.push({
          player,
          team: teamsMap.get(player.team),
          count: data.count,
          percentage: (data.count / totalManagers) * 100,
          ownerTeamNames: data.teamNames,
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

  const handlePlayerClick = (playerName: string, teamNames: string[]) => {
    setModal({
      isOpen: true,
      playerName,
      teamNames,
    })
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>
        <Users size={16} color="#14B8A6" aria-hidden="true" /> Player Ownership
      </h3>
      <div className={styles.list}>
        {ownership.map(({ player, team, count, percentage, ownerTeamNames }) => {
          const isClickable = percentage < 100

          if (isClickable) {
            return (
              <button
                key={player.id}
                type="button"
                className={styles.rowClickable}
                onClick={() => handlePlayerClick(player.web_name, ownerTeamNames)}
              >
                <span className={styles.player}>
                  {player.web_name}
                  <span className={styles.team}>({team?.short_name || '?'})</span>
                  <ChevronRight size={14} className={styles.chevron} />
                </span>
                <span className={styles.ownership}>
                  <span className={styles.count}>
                    {count}/{totalManagers}
                  </span>
                  <span className={styles.percentage}>{Math.round(percentage)}%</span>
                </span>
              </button>
            )
          }

          return (
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
          )
        })}
      </div>
      <PlayerOwnershipModal
        isOpen={modal.isOpen}
        onClose={() => setModal((prev) => ({ ...prev, isOpen: false }))}
        playerName={modal.playerName}
        teamNames={modal.teamNames}
      />
    </div>
  )
}
