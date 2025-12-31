import { describe, expect, it } from 'vitest'
import type { LivePlayer, Player, Team } from '../types/fpl'
import { createLivePlayersMap, createPlayersMap, createTeamsMap } from './mappers'

describe('createPlayersMap', () => {
  it('creates a map from player id to player', () => {
    const players = [
      { id: 1, web_name: 'Salah' },
      { id: 2, web_name: 'Haaland' },
      { id: 3, web_name: 'Saka' },
    ] as Player[]

    const map = createPlayersMap(players)

    expect(map.get(1)?.web_name).toBe('Salah')
    expect(map.get(2)?.web_name).toBe('Haaland')
    expect(map.get(3)?.web_name).toBe('Saka')
  })

  it('returns empty map for empty array', () => {
    const map = createPlayersMap([])

    expect(map.size).toBe(0)
  })

  it('returns undefined for non-existent id', () => {
    const players = [{ id: 1, web_name: 'Salah' }] as Player[]

    const map = createPlayersMap(players)

    expect(map.get(999)).toBeUndefined()
  })

  it('handles duplicate ids by keeping last occurrence', () => {
    const players = [
      { id: 1, web_name: 'First' },
      { id: 1, web_name: 'Second' },
    ] as Player[]

    const map = createPlayersMap(players)

    expect(map.size).toBe(1)
    expect(map.get(1)?.web_name).toBe('Second')
  })
})

describe('createTeamsMap', () => {
  it('creates a map from team id to team', () => {
    const teams = [
      { id: 1, name: 'Arsenal', short_name: 'ARS' },
      { id: 2, name: 'Liverpool', short_name: 'LIV' },
    ] as Team[]

    const map = createTeamsMap(teams)

    expect(map.get(1)?.name).toBe('Arsenal')
    expect(map.get(2)?.short_name).toBe('LIV')
  })

  it('returns empty map for empty array', () => {
    const map = createTeamsMap([])

    expect(map.size).toBe(0)
  })

  it('returns undefined for non-existent id', () => {
    const teams = [{ id: 1, name: 'Arsenal' }] as Team[]

    const map = createTeamsMap(teams)

    expect(map.get(999)).toBeUndefined()
  })
})

describe('createLivePlayersMap', () => {
  it('creates a map from player id to live player', () => {
    const players = [
      { id: 1, stats: { total_points: 10 } },
      { id: 2, stats: { total_points: 5 } },
    ] as LivePlayer[]

    const map = createLivePlayersMap(players)

    expect(map.get(1)?.stats.total_points).toBe(10)
    expect(map.get(2)?.stats.total_points).toBe(5)
  })

  it('returns empty map for empty array', () => {
    const map = createLivePlayersMap([])

    expect(map.size).toBe(0)
  })

  it('returns undefined for non-existent id', () => {
    const players = [{ id: 1, stats: {} }] as LivePlayer[]

    const map = createLivePlayersMap(players)

    expect(map.get(999)).toBeUndefined()
  })
})
