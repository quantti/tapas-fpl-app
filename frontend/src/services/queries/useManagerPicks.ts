import { useQuery } from '@tanstack/react-query';

import { fplApi } from '../api';
import { queryKeys } from '../queryKeys';

import type { EntryPicksResponse, Entry, ManagerInfo } from 'types/fpl';

interface UseManagerPicksReturn {
  picks: EntryPicksResponse | null;
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
  const picksQuery = useQuery<EntryPicksResponse, Error>({
    queryKey: queryKeys.entryPicks(managerId ?? 0, gameweek),
    queryFn: () => fplApi.getEntryPicks(managerId!, gameweek),
    enabled: managerId !== null && gameweek > 0,
    staleTime: 30 * 1000, // 30 seconds - picks might update during live GW
  });

  const managerQuery = useQuery<Entry, Error>({
    queryKey: queryKeys.entry(managerId ?? 0),
    queryFn: () => fplApi.getEntry(managerId!),
    enabled: managerId !== null,
    staleTime: 5 * 60 * 1000, // 5 minutes - manager info rarely changes
  });

  // Combine errors - prioritize picks error
  const error = picksQuery.error || managerQuery.error;
  const getErrorMessage = (): string | null => {
    if (!error) return null;
    if (error instanceof Error) return error.message;
    return String(error);
  };

  // Extract only the fields we need from Entry (ManagerInfo type)
  const extractManagerInfo = (entry: Entry | undefined): ManagerInfo | null => {
    if (!entry) return null;
    return {
      id: entry.id,
      player_first_name: entry.player_first_name,
      player_last_name: entry.player_last_name,
      name: entry.name,
    };
  };

  return {
    picks: picksQuery.data ?? null,
    managerInfo: extractManagerInfo(managerQuery.data),
    loading: picksQuery.isLoading || managerQuery.isLoading,
    error: getErrorMessage(),
  };
}
