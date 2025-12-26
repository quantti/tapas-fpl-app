import { useMemo } from 'react'
import { Users } from 'lucide-react'
import type { ManagerGameweekData } from '../hooks/useFplData'
import type { Player, Team } from '../types/fpl'
import { Card } from './ui/Card'
import { CardHeader } from './ui/CardHeader'
import { PitchLayout, type PitchPlayer } from './PitchLayout'
import {
  calculateOwnership,
  buildTemplateTeam,
  getFormationString,
  type PlayerWithOwnership,
} from '../utils/templateTeam'
import * as styles from './LeagueTemplateTeam.module.css'

interface Props {
  managerDetails: ManagerGameweekData[]
  playersMap: Map<number, Player>
  teamsMap: Map<number, Team>
}

interface TemplatePlayer extends PitchPlayer {
  player: Player
  team: Team | undefined
  ownershipPercentage: number
}

const getShirtUrl = (teamCode: number): string => {
  return `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${teamCode}-110.webp`
}

export function LeagueTemplateTeam({ managerDetails, playersMap, teamsMap }: Props) {
  const templateTeam = useMemo(() => {
    if (managerDetails.length === 0) return null

    const ownership = calculateOwnership(managerDetails, playersMap, teamsMap)
    const selected = buildTemplateTeam(ownership)

    if (selected.length !== 11) return null

    return selected
  }, [managerDetails, playersMap, teamsMap])

  if (!templateTeam || templateTeam.length === 0) {
    return null
  }

  const formation = getFormationString(templateTeam)

  const pitchPlayers: TemplatePlayer[] = templateTeam.map((data: PlayerWithOwnership) => ({
    id: data.player.id,
    elementType: data.player.element_type,
    player: data.player,
    team: data.team,
    ownershipPercentage: data.ownershipPercentage,
  }))

  const renderPlayer = (data: TemplatePlayer) => (
    <div className={styles.player}>
      <div className={styles.playerShirt}>
        {data.team && (
          <img
            src={getShirtUrl(data.team.code)}
            alt={data.team.short_name}
            className={styles.shirtImage}
          />
        )}
      </div>
      <div className={styles.playerName}>{data.player.web_name}</div>
      <div className={styles.ownership}>{Math.round(data.ownershipPercentage)}%</div>
    </div>
  )

  return (
    <Card data-testid="league-template-team">
      <CardHeader
        icon={<Users size={16} color="#14B8A6" />}
        action={<span className={styles.formation}>{formation}</span>}
      >
        Template Team
      </CardHeader>
      <PitchLayout players={pitchPlayers} renderPlayer={renderPlayer} />
    </Card>
  )
}
