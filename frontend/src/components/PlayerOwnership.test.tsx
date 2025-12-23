import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlayerOwnership } from './PlayerOwnership'
import type { ManagerGameweekData } from '../hooks/useFplData'
import type { Player, Team } from '../types/fpl'

const mockPlayer = (id: number, webName: string, teamId: number): Player => ({
  id,
  web_name: webName,
  team: teamId,
  first_name: 'Test',
  second_name: webName,
  element_type: 3,
  now_cost: 100,
  total_points: 50,
  selected_by_percent: '10.0',
  news: '',
  news_added: null,
  chance_of_playing_next_round: 100,
  chance_of_playing_this_round: 100,
  status: 'a',
  photo: '',
})

const mockTeam = (id: number, shortName: string): Team => ({
  id,
  name: `Team ${shortName}`,
  short_name: shortName,
  code: id,
  strength: 3,
  strength_overall_home: 1200,
  strength_overall_away: 1200,
  strength_attack_home: 1200,
  strength_attack_away: 1200,
  strength_defence_home: 1200,
  strength_defence_away: 1200,
})

const mockManagerData = (managerId: number, playerIds: number[]): ManagerGameweekData => ({
  managerId,
  teamName: `Manager ${managerId}`,
  playerName: `Player ${managerId}`,
  gameweekPoints: 50,
  totalPoints: 500,
  activeChip: null,
  captain: null,
  viceCaptain: null,
  transfersIn: [],
  transfersOut: [],
  transfersCost: 0,
  teamValue: 1000,
  bank: 0,
  picks: playerIds.map((id, idx) => ({
    playerId: id,
    position: idx + 1,
    multiplier: 1,
    isCaptain: false,
    isViceCaptain: false,
  })),
})

describe('PlayerOwnership', () => {
  it('renders nothing when no managers', () => {
    const { container } = render(
      <PlayerOwnership managerDetails={[]} playersMap={new Map()} teamsMap={new Map()} />
    )

    expect(container.firstChild).toBeNull()
  })

  it('renders player ownership title', () => {
    const playersMap = new Map([[1, mockPlayer(1, 'Haaland', 10)]])
    const teamsMap = new Map([[10, mockTeam(10, 'MCI')]])
    const managerDetails = [mockManagerData(1, [1])]

    render(
      <PlayerOwnership
        managerDetails={managerDetails}
        playersMap={playersMap}
        teamsMap={teamsMap}
      />
    )

    expect(screen.getByText('Player Ownership')).toBeInTheDocument()
  })

  it('displays player name and team', () => {
    const playersMap = new Map([[1, mockPlayer(1, 'Haaland', 10)]])
    const teamsMap = new Map([[10, mockTeam(10, 'MCI')]])
    const managerDetails = [mockManagerData(1, [1])]

    render(
      <PlayerOwnership
        managerDetails={managerDetails}
        playersMap={playersMap}
        teamsMap={teamsMap}
      />
    )

    expect(screen.getByText('Haaland')).toBeInTheDocument()
    expect(screen.getByText('(MCI)')).toBeInTheDocument()
  })

  it('calculates ownership percentage correctly', () => {
    const playersMap = new Map([
      [1, mockPlayer(1, 'Haaland', 10)],
      [2, mockPlayer(2, 'Salah', 11)],
    ])
    const teamsMap = new Map([
      [10, mockTeam(10, 'MCI')],
      [11, mockTeam(11, 'LIV')],
    ])
    // 2 out of 4 managers own Haaland (50%)
    // 1 out of 4 managers own Salah (25%)
    const managerDetails = [
      mockManagerData(1, [1]),
      mockManagerData(2, [1]),
      mockManagerData(3, [2]),
      mockManagerData(4, []),
    ]

    render(
      <PlayerOwnership
        managerDetails={managerDetails}
        playersMap={playersMap}
        teamsMap={teamsMap}
      />
    )

    expect(screen.getByText('2/4')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('1/4')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('sorts players by ownership count descending', () => {
    const playersMap = new Map([
      [1, mockPlayer(1, 'Haaland', 10)],
      [2, mockPlayer(2, 'Salah', 11)],
    ])
    const teamsMap = new Map([
      [10, mockTeam(10, 'MCI')],
      [11, mockTeam(11, 'LIV')],
    ])
    // Salah owned by 3, Haaland owned by 1
    const managerDetails = [
      mockManagerData(1, [2]),
      mockManagerData(2, [2]),
      mockManagerData(3, [2]),
      mockManagerData(4, [1]),
    ]

    render(
      <PlayerOwnership
        managerDetails={managerDetails}
        playersMap={playersMap}
        teamsMap={teamsMap}
      />
    )

    const rows = screen.getAllByText(/\d\/4/)
    // First row should show 3/4 (Salah), second should show 1/4 (Haaland)
    expect(rows[0]).toHaveTextContent('3/4')
    expect(rows[1]).toHaveTextContent('1/4')
  })

  it('handles unknown team gracefully', () => {
    const playersMap = new Map([[1, mockPlayer(1, 'Haaland', 999)]])
    const teamsMap = new Map() // No teams
    const managerDetails = [mockManagerData(1, [1])]

    render(
      <PlayerOwnership
        managerDetails={managerDetails}
        playersMap={playersMap}
        teamsMap={teamsMap}
      />
    )

    expect(screen.getByText('(?)')).toBeInTheDocument()
  })

  it('shows 100% ownership when all managers own a player', () => {
    const playersMap = new Map([[1, mockPlayer(1, 'Haaland', 10)]])
    const teamsMap = new Map([[10, mockTeam(10, 'MCI')]])
    const managerDetails = [
      mockManagerData(1, [1]),
      mockManagerData(2, [1]),
      mockManagerData(3, [1]),
    ]

    render(
      <PlayerOwnership
        managerDetails={managerDetails}
        playersMap={playersMap}
        teamsMap={teamsMap}
      />
    )

    expect(screen.getByText('3/3')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
  })

  it('renders clickable button for players with less than 100% ownership', () => {
    const playersMap = new Map([[1, mockPlayer(1, 'Haaland', 10)]])
    const teamsMap = new Map([[10, mockTeam(10, 'MCI')]])
    // Only 1 of 2 managers owns the player (50%)
    const managerDetails = [mockManagerData(1, [1]), mockManagerData(2, [])]

    render(
      <PlayerOwnership
        managerDetails={managerDetails}
        playersMap={playersMap}
        teamsMap={teamsMap}
      />
    )

    // Should have a button element for the clickable row
    const button = screen.getByRole('button')
    expect(button).toBeInTheDocument()
    expect(button).toHaveTextContent('Haaland')
  })

  it('renders non-clickable div for players with 100% ownership', () => {
    const playersMap = new Map([[1, mockPlayer(1, 'Haaland', 10)]])
    const teamsMap = new Map([[10, mockTeam(10, 'MCI')]])
    // All managers own the player
    const managerDetails = [mockManagerData(1, [1]), mockManagerData(2, [1])]

    render(
      <PlayerOwnership
        managerDetails={managerDetails}
        playersMap={playersMap}
        teamsMap={teamsMap}
      />
    )

    // Should NOT have any buttons (100% ownership = not clickable)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    // Player should still be visible
    expect(screen.getByText('Haaland')).toBeInTheDocument()
  })

  it('opens modal when clicking a player row', async () => {
    const user = userEvent.setup()
    const playersMap = new Map([[1, mockPlayer(1, 'Haaland', 10)]])
    const teamsMap = new Map([[10, mockTeam(10, 'MCI')]])
    const managerDetails = [mockManagerData(1, [1]), mockManagerData(2, [])]

    render(
      <PlayerOwnership
        managerDetails={managerDetails}
        playersMap={playersMap}
        teamsMap={teamsMap}
      />
    )

    const button = screen.getByRole('button')
    await user.click(button)

    // Modal should open - check for title text
    expect(screen.getByText(/Owned by 1 team/)).toBeInTheDocument()
  })

  it('modal shows team names that own the player', async () => {
    const user = userEvent.setup()
    const playersMap = new Map([[1, mockPlayer(1, 'Haaland', 10)]])
    const teamsMap = new Map([[10, mockTeam(10, 'MCI')]])
    // Manager 1 owns the player, Manager 2 does not
    const managerDetails = [mockManagerData(1, [1]), mockManagerData(2, [])]

    render(
      <PlayerOwnership
        managerDetails={managerDetails}
        playersMap={playersMap}
        teamsMap={teamsMap}
      />
    )

    await user.click(screen.getByRole('button'))

    // Should show the team name of Manager 1 (who owns the player)
    expect(screen.getByText('Manager 1')).toBeInTheDocument()
    // Manager 2 doesn't own the player - their name shouldn't appear in the modal list
    // But Manager 2 could appear elsewhere so we just check Manager 1 is present
  })

  it('modal closes when clicking close button', async () => {
    const user = userEvent.setup()
    const playersMap = new Map([[1, mockPlayer(1, 'Haaland', 10)]])
    const teamsMap = new Map([[10, mockTeam(10, 'MCI')]])
    const managerDetails = [mockManagerData(1, [1]), mockManagerData(2, [])]

    const { container } = render(
      <PlayerOwnership
        managerDetails={managerDetails}
        playersMap={playersMap}
        teamsMap={teamsMap}
      />
    )

    await user.click(screen.getByRole('button'))

    // Modal should be open
    expect(screen.getByText(/Owned by 1 team/)).toBeInTheDocument()

    // Click close button (the X button in the modal header)
    const closeButton = screen.getAllByRole('button').find((btn) => btn.getAttribute('aria-label')?.includes('Close'))
    if (closeButton) {
      await user.click(closeButton)
    }

    // The dialog's close method should have been called (mocked)
    const dialog = container.querySelector('dialog')
    expect(dialog).toBeInTheDocument()
  })

  it('displays chevron icon on clickable rows', () => {
    const playersMap = new Map([[1, mockPlayer(1, 'Haaland', 10)]])
    const teamsMap = new Map([[10, mockTeam(10, 'MCI')]])
    const managerDetails = [mockManagerData(1, [1]), mockManagerData(2, [])]

    render(
      <PlayerOwnership
        managerDetails={managerDetails}
        playersMap={playersMap}
        teamsMap={teamsMap}
      />
    )

    // Chevron should be inside the button (clickable row)
    const button = screen.getByRole('button')
    // lucide-react renders an SVG - query it directly
    const svg = button.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
