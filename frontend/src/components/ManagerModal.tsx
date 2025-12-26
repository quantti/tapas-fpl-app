import { useEffect, useState } from 'react'
import { Modal } from './Modal'
import { PitchLayout, type PitchPlayer as BasePitchPlayer } from './PitchLayout'
import { PitchPlayer } from './PitchPlayer'
import { fplApi } from '../services/api'
import type { Player, BootstrapStatic, LiveGameweek, Fixture } from '../types/fpl'
import * as styles from './ManagerModal.module.css'

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

interface Props {
  managerId: number | null
  gameweek: number
  onClose: () => void
  // Optional: pass pre-fetched data to avoid duplicate API calls
  bootstrap?: BootstrapStatic | null
  liveData?: LiveGameweek | null
  fixtures?: Fixture[]
}

export function ManagerModal({
  managerId,
  gameweek,
  onClose,
  bootstrap: preloadedBootstrap,
  liveData: preloadedLiveData,
  fixtures: preloadedFixtures,
}: Props) {
  const [picks, setPicks] = useState<PicksResponse | null>(null)
  const [bootstrap, setBootstrap] = useState<BootstrapStatic | null>(preloadedBootstrap ?? null)
  const [managerInfo, setManagerInfo] = useState<ManagerInfo | null>(null)
  const [liveData, setLiveData] = useState<LiveGameweek | null>(preloadedLiveData ?? null)
  const [fixtures, setFixtures] = useState<Fixture[]>(preloadedFixtures ?? [])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!managerId) {
      setLoading(false)
      return
    }

    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        // Always fetch live data and fixtures for accurate points
        // Bootstrap can be reused from Dashboard
        const needsBootstrap = !preloadedBootstrap

        // Fetch all required data in parallel
        const [live, fixtureData, picksData, managerData] = await Promise.all([
          fplApi.getLiveGameweek(gameweek),
          fplApi.getFixtures(gameweek),
          fplApi.getEntryPicks(managerId!, gameweek),
          fplApi.getEntry(managerId!),
        ])

        // Fetch bootstrap separately if needed (different return type)
        if (needsBootstrap) {
          const bootstrapData = await fplApi.getBootstrapStatic()
          setBootstrap(bootstrapData)
        }

        setLiveData(live)
        setFixtures(fixtureData)
        setPicks(picksData as PicksResponse)
        setManagerInfo(managerData as ManagerInfo)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load lineup')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [managerId, gameweek, preloadedBootstrap])

  if (!managerId) return null

  const isOpen = managerId !== null

  // Compute modal title - show team name and points when data is loaded
  const getModalTitle = () => {
    if (!picks || !managerInfo) {
      return 'Loading...'
    }
    return (
      <span className={styles.headerContent} data-testid="modal-header">
        <span className={styles.teamName}>{managerInfo.name}</span>
        <span className={styles.headerPoints}>
          <strong>{picks.entry_history.points}</strong> pts
          {picks.active_chip && <span className={styles.chip}>{picks.active_chip}</span>}
        </span>
      </span>
    )
  }

  const renderContent = () => {
    if (loading) {
      return <div className={styles.loading}>Loading lineup...</div>
    }

    if (error) {
      return <div className={styles.error}>{error}</div>
    }

    if (!picks || !bootstrap || !managerInfo) {
      return null
    }

    const playersMap = new Map(bootstrap.elements.map((p) => [p.id, p]))
    const teamsMap = new Map(bootstrap.teams.map((t) => [t.id, t]))
    const liveMap = liveData ? new Map(liveData.elements.map((e) => [e.id, e])) : new Map()

    // Filter fixtures to only current gameweek
    const gwFixtures = fixtures.filter((f) => f.event === gameweek)
    const teamFixtureMap = new Map<number, Fixture>()
    for (const fixture of gwFixtures) {
      teamFixtureMap.set(fixture.team_h, fixture)
      teamFixtureMap.set(fixture.team_a, fixture)
    }

    const hasFixtureStarted = (teamId: number): boolean => {
      const fixture = teamFixtureMap.get(teamId)
      return fixture ? fixture.started || fixture.finished : false
    }

    // Get shirt image URL from team code
    const getShirtUrl = (teamCode: number): string => {
      return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-110.webp`
    }

    // Get opponent info for a player's fixture
    const getOpponentInfo = (teamId: number): { shortName: string; isHome: boolean } | null => {
      const fixture = teamFixtureMap.get(teamId)
      if (!fixture) return null

      const isHome = fixture.team_h === teamId
      const opponentId = isHome ? fixture.team_a : fixture.team_h
      const opponent = teamsMap.get(opponentId)

      return opponent ? { shortName: opponent.short_name, isHome } : null
    }

    // Build player data for PitchLayout
    interface ManagerPitchPlayer extends BasePitchPlayer {
      pick: Pick
      player: Player
    }

    const startingPicks = picks.picks.filter((p) => p.position <= 11)
    const benchPicks = picks.picks.filter((p) => p.position > 11)

    const startingPlayers: ManagerPitchPlayer[] = startingPicks
      .map((pick) => {
        const player = playersMap.get(pick.element)
        if (!player) return null
        return {
          id: player.id,
          elementType: player.element_type,
          pick,
          player,
        }
      })
      .filter((p): p is ManagerPitchPlayer => p !== null)

    const benchPlayers: ManagerPitchPlayer[] = benchPicks
      .map((pick) => {
        const player = playersMap.get(pick.element)
        if (!player) return null
        return {
          id: player.id,
          elementType: player.element_type,
          pick,
          player,
        }
      })
      .filter((p): p is ManagerPitchPlayer => p !== null)

    // Get points display string for a player
    const getPointsDisplay = (pick: Pick, player: Player): string => {
      const live = liveMap.get(player.id)
      const fixtureStarted = hasFixtureStarted(player.team)
      const basePoints = live?.stats.total_points ?? 0
      const points = pick.multiplier > 0 ? basePoints * pick.multiplier : basePoints

      if (fixtureStarted) return String(points)

      const opponentInfo = getOpponentInfo(player.team)
      if (opponentInfo) {
        return `${opponentInfo.shortName} (${opponentInfo.isHome ? 'H' : 'A'})`
      }
      return '–'
    }

    const renderPitchPlayer = (data: ManagerPitchPlayer, isBench = false) => {
      const team = teamsMap.get(data.player.team)
      const badge = data.pick.is_captain ? 'C' : data.pick.is_vice_captain ? 'V' : undefined

      return (
        <PitchPlayer
          key={data.id}
          name={data.player.web_name}
          shirtUrl={team ? getShirtUrl(team.code) : ''}
          teamShortName={team?.short_name ?? ''}
          stat={getPointsDisplay(data.pick, data.player)}
          badge={badge}
          isBench={isBench}
        />
      )
    }

    return (
      <PitchLayout
        players={startingPlayers}
        renderPlayer={(p) => renderPitchPlayer(p)}
        bench={{
          players: benchPlayers,
          renderPlayer: (p) => renderPitchPlayer(p, true),
        }}
      />
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={getModalTitle()}>
      <div className={styles.ManagerModal}>{renderContent()}</div>
    </Modal>
  )
}
