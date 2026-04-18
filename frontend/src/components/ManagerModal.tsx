import { type ReactNode, useMemo, useState } from 'react';

import { STARTING_XI_MAX_POSITION } from 'constants/positions';

import { PlayerDetails } from 'features/PlayerDetails';

import { useManagerPicks } from 'services/queries/useManagerPicks';

import { buildTeamFixtureMap, hasFixtureStarted, getOpponentInfo } from 'utils/autoSubs';
import { calculateLiveManagerPoints } from 'utils/liveScoring';
import { createPlayersMap, createTeamsMap, createLivePlayersMap } from 'utils/mappers';
import { getCaptainBadge } from 'utils/picks';

import * as styles from './ManagerModal.module.css';
import { Modal } from './Modal';
import { PitchLayout, type PitchPlayer as BasePitchPlayer } from './PitchLayout';
import { PitchPlayer } from './PitchPlayer';

import type { Player, BootstrapStatic, LiveGameweek, Fixture, SquadPick } from 'types/fpl';

interface Props {
  managerId: number | null;
  gameweek: number;
  onClose: () => void;
  bootstrap: BootstrapStatic | null;
  liveData: LiveGameweek | null;
  fixtures: Fixture[];
}

export function ManagerModal({
  managerId,
  gameweek,
  onClose,
  bootstrap,
  liveData,
  fixtures,
}: Props) {
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Use React Query hook for picks and manager info (cached, instant re-opens)
  const { picks, managerInfo, loading, error } = useManagerPicks(managerId, gameweek);

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

  // Memoize liveContext to prevent infinite re-renders in PlayerDetails
  const liveContext = useMemo(
    () => ({ gameweek, liveData, fixtures }),
    [gameweek, liveData, fixtures]
  );

  if (!managerId) return null;

  const isOpen = managerId !== null;

  // Calculate live points using same algorithm as standings table
  const getLivePoints = (): number => {
    if (!picks) return 0;
    const gwFixtures = fixtures.filter((f) => f.event === gameweek);
    const managerPicks = picks.picks.map((p) => ({
      playerId: p.element,
      position: p.position,
      multiplier: p.multiplier,
      isCaptain: p.is_captain,
      isViceCaptain: p.is_vice_captain,
    }));
    const result = calculateLiveManagerPoints(managerPicks, liveData, gwFixtures, 0, playersMap);
    return result.totalPoints;
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
      pick: SquadPick;
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
    const getPointsDisplay = (pick: SquadPick, player: Player): ReactNode => {
      const live = liveMap.get(player.id);
      const fixtureStarted = hasFixtureStarted(player.team, teamFixtureMap);
      const basePoints = live?.stats.total_points ?? 0;
      const points = pick.multiplier > 0 ? basePoints * pick.multiplier : basePoints;

      const teamFixtures = teamFixtureMap.get(player.team) ?? [];
      const upcomingOpponents = teamFixtures
        .filter((f) => !f.started && !f.finished)
        .map((f) => {
          const isHome = f.team_h === player.team;
          const opponentId = isHome ? f.team_a : f.team_h;
          const opponent = teamsMap.get(opponentId);
          if (!opponent) return null;
          const venue = isHome ? 'H' : 'A';
          return `${opponent.short_name} (${venue})`;
        })
        .filter((s): s is string => s !== null);

      // DGW mixed state: first game played, second upcoming
      if (fixtureStarted && upcomingOpponents.length > 0) {
        return (
          <>
            <div>{points}</div>
            <div>{upcomingOpponents.join(' ')}</div>
          </>
        );
      }

      if (fixtureStarted) return String(points);

      const opponents = getOpponentInfo(player.team, teamFixtureMap, teamsMap);
      if (opponents.length === 1) {
        return `${opponents[0].shortName} (${opponents[0].isHome ? 'H' : 'A'})`;
      }
      if (opponents.length > 1) {
        return opponents.map((o, i) => (
          <div key={i}>
            {o.shortName} ({o.isHome ? 'H' : 'A'})
          </div>
        ));
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
        liveContext={liveContext}
      />
    </>
  );
}
