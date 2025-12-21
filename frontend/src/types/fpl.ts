// FPL API Types
// These are the main types returned by the FPL API

export interface Team {
  id: number
  name: string
  short_name: string
  code: number
  strength: number
  strength_overall_home: number
  strength_overall_away: number
  strength_attack_home: number
  strength_attack_away: number
  strength_defence_home: number
  strength_defence_away: number
}

export interface Player {
  id: number
  first_name: string
  second_name: string
  web_name: string
  team: number
  team_code: number
  element_type: number // 1=GK, 2=DEF, 3=MID, 4=FWD
  now_cost: number // price * 10
  selected_by_percent: string
  total_points: number
  points_per_game: string
  form: string
  status: string // 'a' = available, 'i' = injured, etc.
  news: string
  news_added: string | null
  minutes: number
  goals_scored: number
  assists: number
  clean_sheets: number
  goals_conceded: number
  own_goals: number
  penalties_saved: number
  penalties_missed: number
  yellow_cards: number
  red_cards: number
  saves: number
  bonus: number
  bps: number
  influence: string
  creativity: string
  threat: string
  ict_index: string
  expected_goals: string
  expected_assists: string
  expected_goal_involvements: string
  expected_goals_conceded: string
}

export interface Gameweek {
  id: number
  name: string
  deadline_time: string
  average_entry_score: number
  finished: boolean
  data_checked: boolean
  highest_scoring_entry: number
  highest_score: number
  is_previous: boolean
  is_current: boolean
  is_next: boolean
  chip_plays: { chip_name: string; num_played: number }[]
  most_selected: number
  most_transferred_in: number
  top_element: number
  top_element_info: { id: number; points: number }
  transfers_made: number
  most_captained: number
  most_vice_captained: number
}

export interface ElementType {
  id: number
  plural_name: string
  plural_name_short: string
  singular_name: string
  singular_name_short: string
  squad_select: number
  squad_min_play: number
  squad_max_play: number
}

export interface BootstrapStatic {
  events: Gameweek[]
  teams: Team[]
  elements: Player[]
  element_types: ElementType[]
  total_players: number
}

export interface Fixture {
  id: number
  code: number
  event: number | null // gameweek, null if unscheduled
  finished: boolean
  finished_provisional: boolean
  kickoff_time: string | null
  minutes: number
  provisional_start_time: boolean
  started: boolean
  team_a: number
  team_a_score: number | null
  team_h: number
  team_h_score: number | null
  team_h_difficulty: number
  team_a_difficulty: number
  pulse_id: number
  stats: FixtureStat[]
}

export interface FixtureStat {
  identifier: string
  a: { element: number; value: number }[]
  h: { element: number; value: number }[]
}

export interface Entry {
  id: number
  joined_time: string
  started_event: number
  favourite_team: number
  player_first_name: string
  player_last_name: string
  player_region_id: number
  player_region_name: string
  player_region_iso_code_short: string
  player_region_iso_code_long: string
  summary_overall_points: number
  summary_overall_rank: number
  summary_event_points: number
  summary_event_rank: number
  current_event: number
  leagues: {
    classic: League[]
    h2h: League[]
  }
  name: string
  name_change_blocked: boolean
  kit: string | null
  last_deadline_bank: number
  last_deadline_value: number
  last_deadline_total_transfers: number
}

export interface League {
  id: number
  name: string
  short_name: string | null
  created: string
  closed: boolean
  rank: number | null
  max_entries: number | null
  league_type: string
  scoring: string
  admin_entry: number | null
  start_event: number
  entry_can_leave: boolean
  entry_can_admin: boolean
  entry_can_invite: boolean
  has_cup: boolean
  cup_league: number | null
  cup_qualified: boolean | null
  entry_rank: number
  entry_last_rank: number
}

export interface LeagueStandings {
  league: {
    id: number
    name: string
    created: string
    closed: boolean
    max_entries: number | null
    league_type: string
    scoring: string
    admin_entry: number
    start_event: number
    code_privacy: string
    has_cup: boolean
    cup_league: number | null
    rank: number | null
  }
  standings: {
    has_next: boolean
    page: number
    results: LeagueEntry[]
  }
}

export interface LeagueEntry {
  id: number
  event_total: number
  player_name: string
  rank: number
  last_rank: number
  rank_sort: number
  total: number
  entry: number
  entry_name: string
}

export interface LiveGameweek {
  elements: LivePlayer[]
}

export interface LivePlayer {
  id: number
  stats: {
    minutes: number
    goals_scored: number
    assists: number
    clean_sheets: number
    goals_conceded: number
    own_goals: number
    penalties_saved: number
    penalties_missed: number
    yellow_cards: number
    red_cards: number
    saves: number
    bonus: number
    bps: number
    influence: string
    creativity: string
    threat: string
    ict_index: string
    total_points: number
    in_dreamteam: boolean
  }
  explain: {
    fixture: number
    stats: { identifier: string; points: number; value: number }[]
  }[]
}
