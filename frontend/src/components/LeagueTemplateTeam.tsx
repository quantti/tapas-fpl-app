import { useMemo } from 'react'
import { Users } from 'lucide-react'
import type { ManagerGameweekData } from '../hooks/useFplData'
import type { Player, Team } from '../types/fpl'
import { Card } from './ui/Card'
import { CardHeader } from './ui/CardHeader'
import { PitchLayout, type PitchPlayer as BasePitchPlayer } from './PitchLayout'
import { PitchPlayer } from './PitchPlayer'
import {
  calculateOwnership,
  buildTemplateTeam,
  type PlayerWithOwnership,
} from '../utils/templateTeam'

interface Props {
  managerDetails: ManagerGameweekData[]
  playersMap: Map<number, Player>
  teamsMap: Map<number, Team>
}

interface TemplatePlayer extends BasePitchPlayer {
  player: Player
  team: Team | undefined
  ownershipPercentage: number
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

  const pitchPlayers: TemplatePlayer[] = templateTeam.map((data: PlayerWithOwnership) => ({
    id: data.player.id,
    elementType: data.player.element_type,
    player: data.player,
    team: data.team,
    ownershipPercentage: data.ownershipPercentage,
  }))

  const renderPlayer = (data: TemplatePlayer) => (
    <PitchPlayer
      key={data.id}
      name={data.player.web_name}
      shirtUrl={data.team ? PitchPlayer.getShirtUrl(data.team.code) : ''}
      teamShortName={data.team?.short_name ?? ''}
      stat={`${Math.round(data.ownershipPercentage)}%`}
    />
  )

  return (
    <Card data-testid="league-template-team">
      <CardHeader icon={<Users size={16} color="#14B8A6" />}>Tapas and Tackles Template</CardHeader>
      <PitchLayout players={pitchPlayers} renderPlayer={renderPlayer} />
    </Card>
  )
}
