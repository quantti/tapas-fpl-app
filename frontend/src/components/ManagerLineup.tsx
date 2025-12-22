import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { fplApi } from '../services/api'
import type { Player, BootstrapStatic } from '../types/fpl'
import * as styles from './ManagerLineup.module.css'

interface Pick {
  element: number
  position: number
  multiplier: number
  is_captain: boolean
  is_vice_captain: boolean
}

interface PicksResponse {
  picks: Pick[]
  active_chip: string | null
  entry_history: {
    event: number
    points: number
    total_points: number
    rank: number
    event_transfers: number
    event_transfers_cost: number
  }
}

interface ManagerInfo {
  id: number
  player_first_name: string
  player_last_name: string
  name: string
}

export function ManagerLineup() {
  const { managerId, gameweek } = useParams<{ managerId: string; gameweek: string }>()
  const [picks, setPicks] = useState<PicksResponse | null>(null)
  const [bootstrap, setBootstrap] = useState<BootstrapStatic | null>(null)
  const [managerInfo, setManagerInfo] = useState<ManagerInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      if (!managerId || !gameweek) return

      try {
        setLoading(true)
        setError(null)

        const [bootstrapData, picksData, managerData] = await Promise.all([
          fplApi.getBootstrapStatic(),
          fplApi.getEntryPicks(Number(managerId), Number(gameweek)),
          fplApi.getEntry(Number(managerId)),
        ])

        setBootstrap(bootstrapData)
        setPicks(picksData)
        setManagerInfo(managerData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load lineup')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [managerId, gameweek])

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading lineup...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>{error}</div>
        <Link to="/" className={styles.backLink}>
          ← Back to standings
        </Link>
      </div>
    )
  }

  if (!picks || !bootstrap || !managerInfo) {
    return null
  }

  const playersMap = new Map(bootstrap.elements.map((p) => [p.id, p]))
  const teamsMap = new Map(bootstrap.teams.map((t) => [t.id, t]))

  // Split into starting XI (positions 1-11) and bench (12-15)
  const startingPicks = picks.picks.filter((p) => p.position <= 11)
  const benchPicks = picks.picks.filter((p) => p.position > 11)

  // Group starting XI by position type
  const getPlayerPosition = (player: Player) => {
    // 1=GKP, 2=DEF, 3=MID, 4=FWD
    return player.element_type
  }

  const startingPlayers = startingPicks
    .map((pick) => ({
      pick,
      player: playersMap.get(pick.element),
    }))
    .filter((p) => p.player)

  const goalkeepers = startingPlayers.filter((p) => getPlayerPosition(p.player!) === 1)
  const defenders = startingPlayers.filter((p) => getPlayerPosition(p.player!) === 2)
  const midfielders = startingPlayers.filter((p) => getPlayerPosition(p.player!) === 3)
  const forwards = startingPlayers.filter((p) => getPlayerPosition(p.player!) === 4)

  const benchPlayers = benchPicks
    .map((pick) => ({
      pick,
      player: playersMap.get(pick.element),
    }))
    .filter((p) => p.player)

  const renderPlayer = (
    pick: Pick,
    player: Player,
    showPoints = true
  ) => {
    const team = teamsMap.get(player.team)
    const points = player.event_points * pick.multiplier

    return (
      <div key={pick.element} className={styles.player}>
        <div className={styles.playerShirt}>
          {pick.is_captain && <span className={styles.badge}>C</span>}
          {pick.is_vice_captain && <span className={styles.badge}>V</span>}
        </div>
        <div className={styles.playerName}>{player.web_name}</div>
        <div className={styles.playerTeam}>{team?.short_name}</div>
        {showPoints && <div className={styles.playerPoints}>{points}</div>}
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <Link to="/" className={styles.backLink}>
        ← Back to standings
      </Link>

      <div className={styles.header}>
        <h1 className={styles.teamName}>{managerInfo.name}</h1>
        <p className={styles.managerName}>
          {managerInfo.player_first_name} {managerInfo.player_last_name}
        </p>
        <div className={styles.stats}>
          <span className={styles.stat}>
            <strong>{picks.entry_history.points}</strong> pts
          </span>
          {picks.active_chip && (
            <span className={styles.chip}>{picks.active_chip}</span>
          )}
        </div>
      </div>

      <div className={styles.pitch}>
        <div className={styles.row}>
          {forwards.map(({ pick, player }) => renderPlayer(pick, player!))}
        </div>
        <div className={styles.row}>
          {midfielders.map(({ pick, player }) => renderPlayer(pick, player!))}
        </div>
        <div className={styles.row}>
          {defenders.map(({ pick, player }) => renderPlayer(pick, player!))}
        </div>
        <div className={styles.row}>
          {goalkeepers.map(({ pick, player }) => renderPlayer(pick, player!))}
        </div>
      </div>

      <div className={styles.bench}>
        <h3 className={styles.benchTitle}>Bench</h3>
        <div className={styles.benchPlayers}>
          {benchPlayers.map(({ pick, player }) => renderPlayer(pick, player!, true))}
        </div>
      </div>
    </div>
  )
}
