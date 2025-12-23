import { useEffect, useState } from 'react'
import { fplApi } from '../services/api'
import type { Fixture, Team } from '../types/fpl'
import { formatDateTime } from '../config/locale'
import * as styles from './FixturesTest.module.css'

export function FixturesTest() {
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [teams, setTeams] = useState<Map<number, Team>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        // Load teams first for team names
        const bootstrap = await fplApi.getBootstrapStatic()
        const teamsMap = new Map(bootstrap.teams.map((t) => [t.id, t]))
        setTeams(teamsMap)

        // Load fixtures
        const fixtureData = await fplApi.getFixtures()
        // Show only upcoming fixtures (not finished, with kickoff time)
        const upcoming = fixtureData.filter((f) => !f.finished && f.kickoff_time).slice(0, 10)
        setFixtures(upcoming)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return (
      <div className={styles.FixturesTest}>
        <div className={styles.loading}>Loading fixtures...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.FixturesTest}>
        <div className={styles.error}>
          <div className={styles.errorTitle}>Error loading data</div>
          <p>{error}</p>
          <p className={styles.errorHint}>
            Make sure the worker is running: <code>cd worker && npm run dev</code>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.FixturesTest}>
      <div className={styles.header}>
        <h2 className={styles.title}>Upcoming Fixtures</h2>
      </div>

      <table className={styles.table}>
        <thead className={styles.tableHead}>
          <tr>
            <th className={styles.headerCell}>Home</th>
            <th className={`${styles.headerCell} ${styles.center}`}>Score</th>
            <th className={styles.headerCell}>Away</th>
            <th className={styles.headerCell}>Kickoff</th>
          </tr>
        </thead>
        <tbody className={styles.tableBody}>
          {fixtures.map((fixture) => {
            const homeTeam = teams.get(fixture.team_h)
            const awayTeam = teams.get(fixture.team_a)
            const kickoff = fixture.kickoff_time
              ? formatDateTime(fixture.kickoff_time, {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'TBD'
            const isLive = fixture.started && !fixture.finished

            return (
              <tr key={fixture.id} className={`${styles.row} ${isLive ? styles.live : ''}`}>
                <td className={styles.cell}>{homeTeam?.name || fixture.team_h}</td>
                <td className={`${styles.cell} ${styles.center}`}>
                  <span className={styles.score}>
                    {fixture.started
                      ? `${fixture.team_h_score ?? 0} - ${fixture.team_a_score ?? 0}`
                      : 'vs'}
                  </span>
                </td>
                <td className={styles.cell}>{awayTeam?.name || fixture.team_a}</td>
                <td className={`${styles.cell} ${styles.muted}`}>{kickoff}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
