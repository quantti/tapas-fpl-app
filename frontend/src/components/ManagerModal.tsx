import { useEffect, useMemo, useState } from 'react';

import { STARTING_XI_MAX_POSITION } from 'constants/positions';

import { PlayerDetails } from 'features/PlayerDetails';

import { fplApi } from 'services/api';

import { buildTeamFixtureMap, hasFixtureStarted, getOpponentInfo } from 'utils/autoSubs';
import { createPlayersMap, createTeamsMap, createLivePlayersMap } from 'utils/mappers';
import { getCaptainBadge } from 'utils/picks';

import * as styles from './ManagerModal.module.css';
import { Modal } from './Modal';
import { PitchLayout, type PitchPlayer as BasePitchPlayer } from './PitchLayout';
import { PitchPlayer } from './PitchPlayer';

import type { Player, BootstrapStatic, LiveGameweek, Fixture } from 'types/fpl';

interface Pick {
  element: number;
  position: number;
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

interface PicksResponse {
  picks: Pick[];
  active_chip: string | null;
  entry_history: {
    event: number;
    points: number;
    total_points: number;
    rank: number;
    event_transfers: number;
    event_transfers_cost: number;
  };
}

interface ManagerInfo {
  id: number;
  player_first_name: string;
  player_last_name: string;
  name: string;
}

interface PickForPoints {
  element: number;
  multiplier: number;
}

interface Props {
  managerId: number | null;
  gameweek: number;
  onClose: () => void;
  // Optional: pass pre-fetched data to avoid duplicate API calls
  bootstrap?: BootstrapStatic | null;
  liveData?: LiveGameweek | null;
  fixtures?: Fixture[];
  calculateTeamPoints?: (picks: PickForPoints[]) => number;
}

export function ManagerModal({
  managerId,
  gameweek,
  onClose,
  bootstrap: preloadedBootstrap,
  liveData: preloadedLiveData,
  fixtures: preloadedFixtures,
  calculateTeamPoints,
}: Props) {
  const [picks, setPicks] = useState<PicksResponse | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapStatic | null>(preloadedBootstrap ?? null);
  const [managerInfo, setManagerInfo] = useState<ManagerInfo | null>(null);
  // Only use local state for live data/fixtures if not provided via props
  // When provided, use props directly so we react to Dashboard's polling updates
  const [fetchedLiveData, setFetchedLiveData] = useState<LiveGameweek | null>(null);
  const [fetchedFixtures, setFetchedFixtures] = useState<Fixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Use preloaded data if available, otherwise fall back to fetched data
  const liveData = preloadedLiveData ?? fetchedLiveData;
  const fixtures = preloadedFixtures ?? fetchedFixtures;

  // Memoized maps - avoid recreating on every render (O(n) → O(1) lookups)
  const playersMap = useMemo(
    () => (bootstrap ? createPlayersMap(bootstrap.elements) : new Map()),
    [bootstrap]
  );

  const teamsMap = useMemo(
    () => (bootstrap ? createTeamsMap(bootstrap.teams) : new Map()),
    [bootstrap]
  );

  const liveMap = useMemo(
    () => (liveData ? createLivePlayersMap(liveData.elements) : new Map()),
    [liveData]
  );

  const teamFixtureMap = useMemo(() => {
    const gwFixtures = fixtures.filter((f) => f.event === gameweek);
    return buildTeamFixtureMap(gwFixtures);
  }, [fixtures, gameweek]);

  useEffect(() => {
    if (!managerId) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Only fetch data that wasn't provided via props
        const needsBootstrap = !preloadedBootstrap;
        const needsLiveData = !preloadedLiveData;
        const needsFixtures = !preloadedFixtures;

        // Build parallel fetch array - ALL fetches run concurrently
        const fetches: Promise<unknown>[] = [
          fplApi.getEntryPicks(managerId!, gameweek),
          fplApi.getEntry(managerId!),
        ];

        // Add optional fetches to run in parallel (not sequential)
        if (needsBootstrap) fetches.push(fplApi.getBootstrapStatic());
        if (needsLiveData) fetches.push(fplApi.getLiveGameweek(gameweek));
        if (needsFixtures) fetches.push(fplApi.getFixtures(gameweek));

        const results = await Promise.all(fetches);

        // Extract results (picks and manager are always first two)
        const [picksData, managerData, ...optionalResults] = results;
        setPicks(picksData as PicksResponse);
        setManagerInfo(managerData as ManagerInfo);

        // Extract optional results in order they were added
        let resultIndex = 0;
        if (needsBootstrap) {
          setBootstrap(optionalResults[resultIndex++] as BootstrapStatic);
        }
        if (needsLiveData) {
          setFetchedLiveData(optionalResults[resultIndex++] as LiveGameweek);
        }
        if (needsFixtures) {
          setFetchedFixtures(optionalResults[resultIndex++] as Fixture[]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load lineup');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [managerId, gameweek, preloadedBootstrap, preloadedLiveData, preloadedFixtures]);

  if (!managerId) return null;

  const isOpen = managerId !== null;

  // Get live points - use hook's calculation if available, fallback to API response
  const getLivePoints = (): number => {
    if (!picks) return 0;

    if (calculateTeamPoints) {
      const startingPicks = picks.picks.filter((p) => p.position <= STARTING_XI_MAX_POSITION);
      return calculateTeamPoints(startingPicks);
    }

    return picks.entry_history.points;
  };

  // Compute modal title - show team name and points when data is loaded
  const getModalTitle = () => {
    if (!picks || !managerInfo) {
      return 'Loading...';
    }
    return (
      <span className={styles.headerContent} data-testid="modal-header">
        <span className={styles.teamName}>{managerInfo.name}</span>
        <span className={styles.headerPoints}>
          <strong>{getLivePoints()}</strong> pts
          {picks.active_chip && <span className={styles.chip}>{picks.active_chip}</span>}
        </span>
      </span>
    );
  };

  const renderContent = () => {
    if (loading) {
      return <div className={styles.loading}>Loading lineup...</div>;
    }

    if (error) {
      return <div className={styles.error}>{error}</div>;
    }

    if (!picks || !bootstrap || !managerInfo) {
      return null;
    }

    // Build player data for PitchLayout (maps are memoized above)
    interface ManagerPitchPlayer extends BasePitchPlayer {
      pick: Pick;
      player: Player;
    }

    const startingPicks = picks.picks.filter((p) => p.position <= STARTING_XI_MAX_POSITION);
    const benchPicks = picks.picks.filter((p) => p.position > STARTING_XI_MAX_POSITION);

    const startingPlayers: ManagerPitchPlayer[] = startingPicks
      .map((pick) => {
        const player = playersMap.get(pick.element);
        if (!player) return null;
        return {
          id: player.id,
          elementType: player.element_type,
          pick,
          player,
        };
      })
      .filter((p): p is ManagerPitchPlayer => p !== null);

    const benchPlayers: ManagerPitchPlayer[] = benchPicks
      .map((pick) => {
        const player = playersMap.get(pick.element);
        if (!player) return null;
        return {
          id: player.id,
          elementType: player.element_type,
          pick,
          player,
        };
      })
      .filter((p): p is ManagerPitchPlayer => p !== null);

    // Get points display string for a player
    const getPointsDisplay = (pick: Pick, player: Player): string => {
      const live = liveMap.get(player.id);
      const fixtureStarted = hasFixtureStarted(player.team, teamFixtureMap);
      const basePoints = live?.stats.total_points ?? 0;
      const points = pick.multiplier > 0 ? basePoints * pick.multiplier : basePoints;

      if (fixtureStarted) return String(points);

      const opponentInfo = getOpponentInfo(player.team, teamFixtureMap, teamsMap);
      if (opponentInfo) {
        return `${opponentInfo.shortName} (${opponentInfo.isHome ? 'H' : 'A'})`;
      }
      return '–';
    };

    const renderPitchPlayer = (data: ManagerPitchPlayer, isBench = false) => {
      const team = teamsMap.get(data.player.team);
      const badge = getCaptainBadge(data.pick);

      return (
        <PitchPlayer
          key={data.id}
          name={data.player.web_name}
          shirtUrl={team ? PitchPlayer.getShirtUrl(team.code) : ''}
          teamShortName={team?.short_name ?? ''}
          stat={getPointsDisplay(data.pick, data.player)}
          badge={badge}
          isBench={isBench}
          onClick={() => setSelectedPlayer(data.player)}
        />
      );
    };

    return (
      <PitchLayout
        players={startingPlayers}
        renderPlayer={(p) => renderPitchPlayer(p)}
        bench={{
          players: benchPlayers,
          renderPlayer: (p) => renderPitchPlayer(p, true),
        }}
      />
    );
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={getModalTitle()}>
        <div className={styles.ManagerModal}>{renderContent()}</div>
      </Modal>
      <PlayerDetails
        player={selectedPlayer}
        teams={bootstrap?.teams ?? []}
        elementTypes={bootstrap?.element_types ?? []}
        onClose={() => setSelectedPlayer(null)}
      />
    </>
  );
}
