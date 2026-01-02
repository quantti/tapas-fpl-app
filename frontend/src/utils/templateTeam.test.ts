import { describe, it, expect } from 'vitest'

import {
  calculateOwnership,
  calculateWorldOwnership,
  buildTemplateTeam,
  getFormationString,
  type PlayerWithOwnership,
} from './templateTeam'

import type { ManagerGameweekData } from '../services/queries/useFplData'
import type { Player, Team } from '../types/fpl'

// Helper to create mock player
function createPlayer(overrides: Partial<Player> & { id: number; element_type: number }): Player {
  return {
    id: overrides.id,
    element_type: overrides.element_type,
    web_name: overrides.web_name ?? `Player${overrides.id}`,
    first_name: 'First',
    second_name: 'Last',
    team: overrides.team ?? 1,
    total_points: overrides.total_points ?? 50,
    now_cost: 50,
    selected_by_percent: overrides.selected_by_percent ?? '10.0',
    form: '5.0',
    points_per_game: '5.0',
    minutes: 900,
    goals_scored: 5,
    assists: 3,
    clean_sheets: 5,
    goals_conceded: 10,
    saves: 0,
    bonus: 10,
    status: 'a',
    chance_of_playing_next_round: 100,
    expected_goals: '3.5',
    expected_assists: '2.0',
    expected_goal_involvements: '5.5',
    expected_goals_conceded: '8.0',
    news: '',
    news_added: null,
    photo: '',
    squad_number: null,
    ict_index: '100.0',
  } as Player
}

// Helper to create mock team
function createTeam(id: number): Team {
  return {
    id,
    name: `Team ${id}`,
    short_name: `T${id}`,
    code: id,
    strength: 3,
    strength_overall_home: 1000,
    strength_overall_away: 1000,
    strength_attack_home: 1000,
    strength_attack_away: 1000,
    strength_defence_home: 1000,
    strength_defence_away: 1000,
  }
}

// Helper to create manager data with picks
function createManagerData(
  managerId: number,
  picks: Array<{ playerId: number; multiplier: number }>
): ManagerGameweekData {
  return {
    managerId,
    teamName: `Team ${managerId}`,
    picks: picks.map((p, idx) => ({
      playerId: p.playerId,
      position: idx + 1,
      multiplier: p.multiplier,
      isCaptain: p.multiplier === 2,
      isViceCaptain: false,
    })),
    transfersIn: [],
    transfersOut: [],
    activeChip: null,
  }
}

describe('templateTeam utilities', () => {
  describe('calculateOwnership', () => {
    it('returns empty map when no managers', () => {
      const result = calculateOwnership([], new Map(), new Map())
      expect(result.size).toBe(0)
    })

    it('calculates ownership percentage correctly', () => {
      const players = new Map<number, Player>([
        [1, createPlayer({ id: 1, element_type: 3 })],
        [2, createPlayer({ id: 2, element_type: 3 })],
      ])
      const teams = new Map<number, Team>([[1, createTeam(1)]])

      const managers = [
        createManagerData(1, [
          { playerId: 1, multiplier: 2 }, // Captain
          { playerId: 2, multiplier: 1 },
        ]),
        createManagerData(2, [
          { playerId: 1, multiplier: 1 },
          { playerId: 2, multiplier: 0 }, // Benched
        ]),
      ]

      const result = calculateOwnership(managers, players, teams)

      // Player 1: owned by both (100%)
      expect(result.get(1)?.ownershipPercentage).toBe(100)
      expect(result.get(1)?.ownershipCount).toBe(2)

      // Player 2: owned by only manager 1 (benched for manager 2)
      expect(result.get(2)?.ownershipPercentage).toBe(50)
      expect(result.get(2)?.ownershipCount).toBe(1)
    })

    it('excludes benched players (multiplier 0)', () => {
      const players = new Map<number, Player>([[1, createPlayer({ id: 1, element_type: 3 })]])
      const teams = new Map<number, Team>([[1, createTeam(1)]])

      const managers = [
        createManagerData(1, [{ playerId: 1, multiplier: 0 }]), // Benched
      ]

      const result = calculateOwnership(managers, players, teams)
      expect(result.size).toBe(0) // No ownership since player is benched
    })

    it('includes team information in ownership data', () => {
      const player = createPlayer({ id: 1, element_type: 3, team: 5 })
      const team = createTeam(5)
      const players = new Map<number, Player>([[1, player]])
      const teams = new Map<number, Team>([[5, team]])

      const managers = [createManagerData(1, [{ playerId: 1, multiplier: 1 }])]

      const result = calculateOwnership(managers, players, teams)
      expect(result.get(1)?.team).toEqual(team)
      expect(result.get(1)?.player).toEqual(player)
    })

    it('handles unknown players gracefully', () => {
      const players = new Map<number, Player>() // Empty
      const teams = new Map<number, Team>()

      const managers = [createManagerData(1, [{ playerId: 999, multiplier: 1 }])]

      const result = calculateOwnership(managers, players, teams)
      expect(result.size).toBe(0) // Player not found, excluded
    })
  })

  describe('calculateWorldOwnership', () => {
    it('returns empty map when no players', () => {
      const result = calculateWorldOwnership([], new Map())
      expect(result.size).toBe(0)
    })

    it('uses selected_by_percent as ownership percentage', () => {
      const players = [
        createPlayer({ id: 1, element_type: 3, selected_by_percent: '45.5' }),
        createPlayer({ id: 2, element_type: 3, selected_by_percent: '23.1' }),
      ]
      const teams = new Map<number, Team>([[1, createTeam(1)]])

      const result = calculateWorldOwnership(players, teams)

      expect(result.get(1)?.ownershipPercentage).toBe(45.5)
      expect(result.get(2)?.ownershipPercentage).toBe(23.1)
    })

    it('excludes players with 0% ownership', () => {
      const players = [
        createPlayer({ id: 1, element_type: 3, selected_by_percent: '0.0' }),
        createPlayer({ id: 2, element_type: 3, selected_by_percent: '10.0' }),
      ]
      const teams = new Map<number, Team>([[1, createTeam(1)]])

      const result = calculateWorldOwnership(players, teams)

      expect(result.has(1)).toBe(false) // 0% excluded
      expect(result.has(2)).toBe(true) // 10% included
    })

    it('sets ownershipCount to 0 (not applicable for global)', () => {
      const players = [createPlayer({ id: 1, element_type: 3, selected_by_percent: '50.0' })]
      const teams = new Map<number, Team>([[1, createTeam(1)]])

      const result = calculateWorldOwnership(players, teams)

      expect(result.get(1)?.ownershipCount).toBe(0)
    })

    it('includes team information in ownership data', () => {
      const player = createPlayer({ id: 1, element_type: 3, team: 5, selected_by_percent: '30.0' })
      const team = createTeam(5)
      const players = [player]
      const teams = new Map<number, Team>([[5, team]])

      const result = calculateWorldOwnership(players, teams)

      expect(result.get(1)?.team).toEqual(team)
      expect(result.get(1)?.player).toEqual(player)
    })

    it('handles invalid selected_by_percent gracefully', () => {
      const players = [
        createPlayer({ id: 1, element_type: 3, selected_by_percent: 'invalid' }),
        createPlayer({ id: 2, element_type: 3, selected_by_percent: '' }),
      ]
      const teams = new Map<number, Team>([[1, createTeam(1)]])

      const result = calculateWorldOwnership(players, teams)

      // Invalid values parsed as NaN, which becomes 0 via || 0, so excluded
      expect(result.size).toBe(0)
    })
  })

  describe('buildTemplateTeam', () => {
    // Create a full set of players for testing
    function createFullPlayerSet(): Map<number, PlayerWithOwnership> {
      const ownership = new Map<number, PlayerWithOwnership>()

      // 2 GKs
      ownership.set(1, {
        player: createPlayer({ id: 1, element_type: 1, total_points: 100 }),
        team: createTeam(1),
        ownershipCount: 4,
        ownershipPercentage: 100,
      })
      ownership.set(2, {
        player: createPlayer({ id: 2, element_type: 1, total_points: 80 }),
        team: createTeam(2),
        ownershipCount: 0,
        ownershipPercentage: 0,
      })

      // 5 DEFs
      for (let i = 3; i <= 7; i++) {
        ownership.set(i, {
          player: createPlayer({ id: i, element_type: 2, total_points: 100 - i * 5 }),
          team: createTeam(1),
          ownershipCount: 8 - i,
          ownershipPercentage: (8 - i) * 25, // 125, 100, 75, 50, 25
        })
      }

      // 5 MIDs
      for (let i = 8; i <= 12; i++) {
        ownership.set(i, {
          player: createPlayer({ id: i, element_type: 3, total_points: 150 - i * 5 }),
          team: createTeam(2),
          ownershipCount: 13 - i,
          ownershipPercentage: (13 - i) * 20, // 100, 80, 60, 40, 20
        })
      }

      // 3 FWDs
      for (let i = 13; i <= 15; i++) {
        ownership.set(i, {
          player: createPlayer({ id: i, element_type: 4, total_points: 200 - i * 10 }),
          team: createTeam(3),
          ownershipCount: 16 - i,
          ownershipPercentage: (16 - i) * 33.33, // ~100, ~67, ~33
        })
      }

      return ownership
    }

    it('returns empty array when no ownership data', () => {
      const result = buildTemplateTeam(new Map())
      expect(result).toEqual([])
    })

    it('returns empty array when insufficient players', () => {
      const ownership = new Map<number, PlayerWithOwnership>()
      // Only 1 GK, not enough players
      ownership.set(1, {
        player: createPlayer({ id: 1, element_type: 1 }),
        team: createTeam(1),
        ownershipCount: 4,
        ownershipPercentage: 100,
      })

      const result = buildTemplateTeam(ownership)
      expect(result).toEqual([])
    })

    it('builds valid 11-player team', () => {
      const ownership = createFullPlayerSet()
      const result = buildTemplateTeam(ownership)

      expect(result).toHaveLength(11)
    })

    it('picks exactly 1 goalkeeper', () => {
      const ownership = createFullPlayerSet()
      const result = buildTemplateTeam(ownership)

      const gks = result.filter((p) => p.player.element_type === 1)
      expect(gks).toHaveLength(1)
    })

    it('picks minimum 3 defenders', () => {
      const ownership = createFullPlayerSet()
      const result = buildTemplateTeam(ownership)

      const defs = result.filter((p) => p.player.element_type === 2)
      expect(defs.length).toBeGreaterThanOrEqual(3)
      expect(defs.length).toBeLessThanOrEqual(5)
    })

    it('picks minimum 2 midfielders', () => {
      const ownership = createFullPlayerSet()
      const result = buildTemplateTeam(ownership)

      const mids = result.filter((p) => p.player.element_type === 3)
      expect(mids.length).toBeGreaterThanOrEqual(2)
      expect(mids.length).toBeLessThanOrEqual(5)
    })

    it('picks minimum 1 forward', () => {
      const ownership = createFullPlayerSet()
      const result = buildTemplateTeam(ownership)

      const fwds = result.filter((p) => p.player.element_type === 4)
      expect(fwds.length).toBeGreaterThanOrEqual(1)
      expect(fwds.length).toBeLessThanOrEqual(3)
    })

    it('sorts players by position order (GK, DEF, MID, FWD)', () => {
      const ownership = createFullPlayerSet()
      const result = buildTemplateTeam(ownership)

      const positions = result.map((p) => p.player.element_type)

      // Find where each position ends
      const gkEnd = positions.findIndex((p) => p !== 1)
      const defEnd = positions.findIndex((p, i) => i > gkEnd && p !== 2)
      const midEnd = positions.findIndex((p, i) => i > defEnd && p !== 3)

      // Verify order: all GKs first, then DEFs, then MIDs, then FWDs
      expect(positions.slice(0, gkEnd).every((p) => p === 1)).toBe(true)
      expect(positions.slice(gkEnd, defEnd).every((p) => p === 2)).toBe(true)
      expect(positions.slice(defEnd, midEnd).every((p) => p === 3)).toBe(true)
      expect(positions.slice(midEnd).every((p) => p === 4)).toBe(true)
    })

    it('prioritizes higher ownership players', () => {
      const ownership = createFullPlayerSet()
      const result = buildTemplateTeam(ownership)

      // The highest ownership GK should be picked
      const gk = result.find((p) => p.player.element_type === 1)
      expect(gk?.player.id).toBe(1) // Highest ownership GK
    })

    it('uses total_points as tiebreaker for equal ownership', () => {
      const ownership = new Map<number, PlayerWithOwnership>()

      // 1 GK
      ownership.set(1, {
        player: createPlayer({ id: 1, element_type: 1 }),
        team: createTeam(1),
        ownershipCount: 4,
        ownershipPercentage: 100,
      })

      // 3 DEFs with equal ownership but different points
      ownership.set(2, {
        player: createPlayer({ id: 2, element_type: 2, total_points: 50 }),
        team: createTeam(1),
        ownershipCount: 4,
        ownershipPercentage: 100,
      })
      ownership.set(3, {
        player: createPlayer({ id: 3, element_type: 2, total_points: 100 }),
        team: createTeam(1),
        ownershipCount: 4,
        ownershipPercentage: 100, // Same ownership
      })
      ownership.set(4, {
        player: createPlayer({ id: 4, element_type: 2, total_points: 75 }),
        team: createTeam(1),
        ownershipCount: 4,
        ownershipPercentage: 100, // Same ownership
      })

      // 2 MIDs
      ownership.set(5, {
        player: createPlayer({ id: 5, element_type: 3 }),
        team: createTeam(1),
        ownershipCount: 4,
        ownershipPercentage: 100,
      })
      ownership.set(6, {
        player: createPlayer({ id: 6, element_type: 3 }),
        team: createTeam(1),
        ownershipCount: 4,
        ownershipPercentage: 100,
      })

      // 1 FWD
      ownership.set(7, {
        player: createPlayer({ id: 7, element_type: 4 }),
        team: createTeam(1),
        ownershipCount: 4,
        ownershipPercentage: 100,
      })

      const result = buildTemplateTeam(ownership)
      const defs = result.filter((p) => p.player.element_type === 2)

      // Higher total_points should come first
      expect(defs[0].player.total_points).toBe(100)
      expect(defs[1].player.total_points).toBe(75)
      expect(defs[2].player.total_points).toBe(50)
    })
  })

  describe('getFormationString', () => {
    it('returns correct formation string', () => {
      const players: PlayerWithOwnership[] = [
        // 1 GK
        {
          player: createPlayer({ id: 1, element_type: 1 }),
          team: createTeam(1),
          ownershipCount: 4,
          ownershipPercentage: 100,
        },
        // 4 DEFs
        ...Array.from({ length: 4 }, (_, i) => ({
          player: createPlayer({ id: i + 2, element_type: 2 }),
          team: createTeam(1),
          ownershipCount: 4,
          ownershipPercentage: 100,
        })),
        // 4 MIDs
        ...Array.from({ length: 4 }, (_, i) => ({
          player: createPlayer({ id: i + 6, element_type: 3 }),
          team: createTeam(1),
          ownershipCount: 4,
          ownershipPercentage: 100,
        })),
        // 2 FWDs
        ...Array.from({ length: 2 }, (_, i) => ({
          player: createPlayer({ id: i + 10, element_type: 4 }),
          team: createTeam(1),
          ownershipCount: 4,
          ownershipPercentage: 100,
        })),
      ]

      expect(getFormationString(players)).toBe('4-4-2')
    })

    it('returns 3-5-2 formation', () => {
      const players: PlayerWithOwnership[] = [
        {
          player: createPlayer({ id: 1, element_type: 1 }),
          team: createTeam(1),
          ownershipCount: 4,
          ownershipPercentage: 100,
        },
        // 3 DEFs
        ...Array.from({ length: 3 }, (_, i) => ({
          player: createPlayer({ id: i + 2, element_type: 2 }),
          team: createTeam(1),
          ownershipCount: 4,
          ownershipPercentage: 100,
        })),
        // 5 MIDs
        ...Array.from({ length: 5 }, (_, i) => ({
          player: createPlayer({ id: i + 5, element_type: 3 }),
          team: createTeam(1),
          ownershipCount: 4,
          ownershipPercentage: 100,
        })),
        // 2 FWDs
        ...Array.from({ length: 2 }, (_, i) => ({
          player: createPlayer({ id: i + 10, element_type: 4 }),
          team: createTeam(1),
          ownershipCount: 4,
          ownershipPercentage: 100,
        })),
      ]

      expect(getFormationString(players)).toBe('3-5-2')
    })

    it('returns 5-4-1 formation', () => {
      const players: PlayerWithOwnership[] = [
        {
          player: createPlayer({ id: 1, element_type: 1 }),
          team: createTeam(1),
          ownershipCount: 4,
          ownershipPercentage: 100,
        },
        // 5 DEFs
        ...Array.from({ length: 5 }, (_, i) => ({
          player: createPlayer({ id: i + 2, element_type: 2 }),
          team: createTeam(1),
          ownershipCount: 4,
          ownershipPercentage: 100,
        })),
        // 4 MIDs
        ...Array.from({ length: 4 }, (_, i) => ({
          player: createPlayer({ id: i + 7, element_type: 3 }),
          team: createTeam(1),
          ownershipCount: 4,
          ownershipPercentage: 100,
        })),
        // 1 FWD
        {
          player: createPlayer({ id: 11, element_type: 4 }),
          team: createTeam(1),
          ownershipCount: 4,
          ownershipPercentage: 100,
        },
      ]

      expect(getFormationString(players)).toBe('5-4-1')
    })

    it('returns 0-0-0 for empty array', () => {
      expect(getFormationString([])).toBe('0-0-0')
    })
  })
})
