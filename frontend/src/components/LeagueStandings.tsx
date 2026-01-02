import clsx from 'clsx';
import { ChevronRight, CircleChevronUp, CircleChevronDown, ArrowRightLeft } from 'lucide-react';
import { useMemo } from 'react';

import {
  calculateLiveManagerPoints,
  hasGamesInProgress,
  hasAnyFixtureStarted,
} from '../utils/liveScoring';

import * as styles from './LeagueStandings.module.css';

import type { ManagerGameweekData } from '../services/queries/useFplData';
import type { AutoSubResult } from '../types/autoSubs';
import type {
  LeagueStandings as LeagueStandingsType,
  LiveGameweek,
  Fixture,
  Player,
} from '../types/fpl';

interface Props {
  standings: LeagueStandingsType;
  managerDetails: ManagerGameweekData[];
  isLive: boolean;
  liveData?: LiveGameweek | null;
  fixtures?: Fixture[];
  onManagerClick?: (managerId: number) => void;
  playersMap?: Map<number, Player>; // For auto-substitution calculation
}

function getRankChange(
  current: number,
  last: number
): { direction: 'up' | 'down' | 'same'; diff: number } {
  if (last === 0 || current === last) return { direction: 'same', diff: 0 };
  return current < last
    ? { direction: 'up', diff: last - current }
    : { direction: 'down', diff: current - last };
}

export function LeagueStandings({
  standings,
  managerDetails,
  isLive,
  liveData,
  fixtures = [],
  onManagerClick,
  playersMap,
}: Props) {
  const detailsMap = useMemo(
    () => new Map(managerDetails.map((m) => [m.managerId, m])),
    [managerDetails]
  );

  // Check if any games are actually in progress (for live badge)
  const gamesInProgress = hasGamesInProgress(fixtures);

  // Check if any fixtures have started this gameweek (for showing rank changes)
  const gamesStarted = hasAnyFixtureStarted(fixtures);

  // Calculate live points and totals for each manager, then sort by live total
  const sortedResults = useMemo(() => {
    const results = standings.standings.results.map((entry) => {
      const details = detailsMap.get(entry.entry);

      // If live and we have manager picks, calculate live points
      if (isLive && liveData && details) {
        // Calculate live player points (raw points + provisional bonus)
        // Note: hitsCost is NOT used here because:
        // - event_total from standings = raw GW points (no hits)
        // - total from standings = cumulative WITH hits
        // - Our display should match event_total = raw points
        // Pass playersMap to enable auto-substitution calculation
        const livePoints = calculateLiveManagerPoints(
          details.picks,
          liveData,
          fixtures,
          0,
          playersMap
        );

        // Live GW points = raw player points (NO hit subtraction)
        // This matches FPL's display and the event_total field
        const liveGwPoints = livePoints.totalPoints;

        // Live total = previous total + live GW points
        // entry.total already has all hits factored in
        // entry.event_total is raw points, so subtracting it gives us "total minus current raw"
        // Adding our live raw calculation gives the correct total
        const previousTotal = entry.total - entry.event_total;
        const liveTotal = previousTotal + liveGwPoints;

        return {
          ...entry,
          liveGwPoints,
          provisionalBonus: livePoints.provisionalBonus,
          liveTotal,
          isLive: true,
          autoSubResult: livePoints.autoSubResult,
        };
      }

      // Not live or no details - use static values
      return {
        ...entry,
        liveGwPoints: entry.event_total,
        provisionalBonus: 0,
        liveTotal: entry.total,
        isLive: false,
        autoSubResult: undefined as AutoSubResult | undefined,
      };
    });

    // Sort by live total descending when live
    if (isLive && liveData) {
      results.sort((a, b) => b.liveTotal - a.liveTotal);
    }

    return results;
  }, [standings.standings.results, detailsMap, isLive, liveData, fixtures, playersMap]);

  return (
    <div className={styles.LeagueStandings}>
      <div className={styles.header}>
        <h2 className={styles.title}>{standings.league.name}</h2>
        {gamesInProgress && <span className={styles.liveBadge}>LIVE</span>}
      </div>

      <table className={styles.table} data-testid="standings-table">
        <thead className={styles.tableHead}>
          <tr>
            <th className={clsx(styles.headerCell, styles.colRank)}>#</th>
            <th className={clsx(styles.headerCell, styles.colManager)}>Team & Manager</th>
            <th className={clsx(styles.headerCell, styles.center, styles.colGw)}>GW</th>
            <th className={clsx(styles.headerCell, styles.center, styles.colTotal)}>Total</th>
            <th className={clsx(styles.headerCell, styles.center, styles.colOverallRank)}>OR</th>
            <th className={clsx(styles.headerCell, styles.center, styles.colCaptain)}>C</th>
            <th className={clsx(styles.headerCell, styles.center, styles.colChip)}></th>
          </tr>
        </thead>
        <tbody className={styles.tableBody}>
          {sortedResults.map((entry, index) => {
            const details = detailsMap.get(entry.entry);
            // When live, rank is the current position in sorted array (1-indexed)
            // When not live, use the API rank
            const displayRank = isLive && liveData ? index + 1 : entry.rank;
            const rankChange = getRankChange(displayRank, entry.last_rank);

            return (
              <tr key={entry.entry} className={styles.row}>
                <td className={clsx(styles.cell, styles.colRank)}>
                  <div className={styles.rank}>
                    <span className={styles.rankNumber}>{displayRank}</span>
                    {gamesStarted && rankChange.direction !== 'same' && (
                      <span className={clsx(styles.rankChange, styles[rankChange.direction])}>
                        {rankChange.direction === 'up' ? (
                          <CircleChevronUp size={14} />
                        ) : (
                          <CircleChevronDown size={14} />
                        )}
                        {rankChange.diff}
                      </span>
                    )}
                  </div>
                </td>
                <td className={clsx(styles.cell, styles.colManager)}>
                  <div className={styles.manager}>
                    <button
                      type="button"
                      className={styles.teamName}
                      data-testid="team-name-button"
                      onClick={() => onManagerClick?.(entry.entry)}
                    >
                      {entry.entry_name}
                      <ChevronRight size={14} className={styles.teamNameIcon} />
                    </button>
                    <span className={styles.playerName}>{entry.player_name}</span>
                  </div>
                </td>
                <td className={clsx(styles.cell, styles.center, styles.colGw)}>
                  <span className={styles.gwPoints}>
                    {entry.liveGwPoints}
                    {entry.provisionalBonus > 0 && (
                      <span className={styles.provisionalBonus}>(+{entry.provisionalBonus})</span>
                    )}
                    {entry.autoSubResult && entry.autoSubResult.autoSubs.length > 0 && (
                      <span
                        className={styles.autoSubIndicator}
                        title={formatAutoSubs(entry.autoSubResult)}
                      >
                        <ArrowRightLeft size={12} />
                        {entry.autoSubResult.autoSubs.length}
                      </span>
                    )}
                  </span>
                </td>
                <td className={clsx(styles.cell, styles.center, styles.colTotal)}>
                  <span className={styles.totalPoints}>{entry.liveTotal}</span>
                </td>
                <td className={clsx(styles.cell, styles.center, styles.colOverallRank)}>
                  {details?.overallRank ? (
                    <div className={styles.overallRank}>
                      <span className={styles.overallRankNumber}>
                        {details.overallRank.toLocaleString()}
                      </span>
                      {gamesStarted &&
                        details.lastOverallRank > 0 &&
                        (() => {
                          const orChange = getRankChange(
                            details.overallRank,
                            details.lastOverallRank
                          );
                          if (orChange.direction === 'same') return null;
                          return (
                            <span className={clsx(styles.rankChange, styles[orChange.direction])}>
                              {orChange.direction === 'up' ? (
                                <CircleChevronUp size={12} />
                              ) : (
                                <CircleChevronDown size={12} />
                              )}
                            </span>
                          );
                        })()}
                    </div>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </td>
                <td className={clsx(styles.cell, styles.center, styles.colCaptain)}>
                  {details?.captain ? (
                    <span className={styles.captain}>{details.captain.web_name}</span>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </td>
                <td className={clsx(styles.cell, styles.center, styles.colChip)}>
                  {details?.activeChip ? (
                    <span className={styles.chip}>{formatChip(details.activeChip)}</span>
                  ) : (
                    <span className={styles.muted}>—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatChip(chip: string): string {
  const chips: Record<string, string> = {
    bboost: 'BB',
    '3xc': 'TC',
    freehit: 'FH',
    wildcard: 'WC',
  };
  return chips[chip] || chip.toUpperCase();
}

function formatAutoSubs(autoSubResult: AutoSubResult): string {
  const subs = autoSubResult.autoSubs.map(
    (sub) => `${sub.playerOut.webName} → ${sub.playerIn.webName}`
  );
  const lines = [...subs];
  if (autoSubResult.captainPromoted) {
    lines.push('Vice-captain promoted to captain');
  }
  return lines.join('\n');
}
