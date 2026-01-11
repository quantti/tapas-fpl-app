import { useQuery } from '@tanstack/react-query';

import { fplApi } from '../api';
import { queryKeys } from '../queryKeys';

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

interface UseManagerPicksReturn {
  picks: PicksResponse | null;
  managerInfo: ManagerInfo | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch manager picks and info with React Query caching.
 * Data is cached for 30 seconds (picks) and 5 minutes (manager info),
 * so re-opening a modal for the same manager is instant.
 */
export function useManagerPicks(managerId: number | null, gameweek: number): UseManagerPicksReturn {
  const picksQuery = useQuery({
    queryKey: queryKeys.entryPicks(managerId ?? 0, gameweek),
    queryFn: () => fplApi.getEntryPicks(managerId!, gameweek),
    enabled: managerId !== null && gameweek > 0,
    staleTime: 30 * 1000, // 30 seconds - picks might update during live GW
  });

  const managerQuery = useQuery({
    queryKey: ['manager-info', managerId],
    queryFn: () => fplApi.getEntry(managerId!),
    enabled: managerId !== null,
    staleTime: 5 * 60 * 1000, // 5 minutes - manager info rarely changes
  });

  // Combine errors
  const error = picksQuery.error || managerQuery.error;
  const getErrorMessage = (): string | null => {
    if (!error) return null;
    if (error instanceof Error) return error.message;
    return String(error);
  };

  return {
    picks: (picksQuery.data as PicksResponse) ?? null,
    managerInfo: (managerQuery.data as ManagerInfo) ?? null,
    loading: picksQuery.isLoading || managerQuery.isLoading,
    error: getErrorMessage(),
  };
}
