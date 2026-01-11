import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { fplApi } from '../api';

import { useManagerPicks } from './useManagerPicks';

import type { EntryPicksResponse, Entry } from 'types/fpl';

// Create a wrapper with QueryClientProvider for testing hooks that use TanStack Query
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

// Mock the API
vi.mock('../api', () => ({
  fplApi: {
    getEntryPicks: vi.fn(),
    getEntry: vi.fn(),
  },
}));

const mockPicksResponse: EntryPicksResponse = {
  active_chip: null,
  automatic_subs: [],
  entry_history: {
    event: 17,
    points: 65,
    total_points: 1245,
    rank: 1234567,
    overall_rank: 500000,
    value: 1025,
    bank: 5,
    event_transfers: 1,
    event_transfers_cost: 0,
  },
  picks: [
    {
      element: 1,
      position: 1,
      multiplier: 1,
      is_captain: false,
      is_vice_captain: false,
    },
    {
      element: 2,
      position: 2,
      multiplier: 1,
      is_captain: false,
      is_vice_captain: false,
    },
    {
      element: 3,
      position: 3,
      multiplier: 1,
      is_captain: false,
      is_vice_captain: false,
    },
    {
      element: 4,
      position: 4,
      multiplier: 1,
      is_captain: false,
      is_vice_captain: false,
    },
    {
      element: 5,
      position: 5,
      multiplier: 1,
      is_captain: false,
      is_vice_captain: false,
    },
    {
      element: 6,
      position: 6,
      multiplier: 1,
      is_captain: false,
      is_vice_captain: false,
    },
    {
      element: 7,
      position: 7,
      multiplier: 1,
      is_captain: false,
      is_vice_captain: false,
    },
    {
      element: 8,
      position: 8,
      multiplier: 2,
      is_captain: true,
      is_vice_captain: false,
    },
    {
      element: 9,
      position: 9,
      multiplier: 1,
      is_captain: false,
      is_vice_captain: true,
    },
    {
      element: 10,
      position: 10,
      multiplier: 1,
      is_captain: false,
      is_vice_captain: false,
    },
    {
      element: 11,
      position: 11,
      multiplier: 1,
      is_captain: false,
      is_vice_captain: false,
    },
    {
      element: 12,
      position: 12,
      multiplier: 0,
      is_captain: false,
      is_vice_captain: false,
    },
    {
      element: 13,
      position: 13,
      multiplier: 0,
      is_captain: false,
      is_vice_captain: false,
    },
    {
      element: 14,
      position: 14,
      multiplier: 0,
      is_captain: false,
      is_vice_captain: false,
    },
    {
      element: 15,
      position: 15,
      multiplier: 0,
      is_captain: false,
      is_vice_captain: false,
    },
  ],
};

const mockEntry: Entry = {
  id: 12345,
  joined_time: '2024-07-01T00:00:00Z',
  started_event: 1,
  favourite_team: 14,
  player_first_name: 'John',
  player_last_name: 'Doe',
  player_region_id: 225,
  player_region_name: 'England',
  player_region_iso_code_short: 'EN',
  player_region_iso_code_long: 'ENG',
  summary_overall_points: 1245,
  summary_overall_rank: 500000,
  summary_event_points: 65,
  summary_event_rank: 2000000,
  current_event: 17,
  leagues: { classic: [], h2h: [] },
  name: "John's XI",
  name_change_blocked: false,
  kit: null,
  last_deadline_bank: 5,
  last_deadline_value: 1025,
  last_deadline_total_transfers: 10,
};

describe('useManagerPicks - basic functionality', () => {
  beforeEach(() => {
    vi.mocked(fplApi.getEntryPicks).mockResolvedValue(mockPicksResponse);
    vi.mocked(fplApi.getEntry).mockResolvedValue(mockEntry);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch picks and manager info in parallel', async () => {
    const { result } = renderHook(() => useManagerPicks(12345, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.picks).toBeDefined();
      expect(result.current.managerInfo).toBeDefined();
    });

    expect(fplApi.getEntryPicks).toHaveBeenCalledWith(12345, 17);
    expect(fplApi.getEntry).toHaveBeenCalledWith(12345);
  });

  it('should return null values when managerId is null', () => {
    const { result } = renderHook(() => useManagerPicks(null, 17), {
      wrapper: createWrapper(),
    });

    expect(result.current.picks).toBeNull();
    expect(result.current.managerInfo).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(fplApi.getEntryPicks).not.toHaveBeenCalled();
    expect(fplApi.getEntry).not.toHaveBeenCalled();
  });

  it('should not fetch when gameweek is 0', () => {
    const { result } = renderHook(() => useManagerPicks(12345, 0), {
      wrapper: createWrapper(),
    });

    // Picks query disabled, but manager query should still work
    expect(result.current.picks).toBeNull();
    expect(fplApi.getEntryPicks).not.toHaveBeenCalled();
  });

  it('should not fetch when gameweek is negative', () => {
    const { result } = renderHook(() => useManagerPicks(12345, -1), {
      wrapper: createWrapper(),
    });

    expect(result.current.picks).toBeNull();
    expect(fplApi.getEntryPicks).not.toHaveBeenCalled();
  });
});

describe('useManagerPicks - loading states', () => {
  beforeEach(() => {
    vi.mocked(fplApi.getEntryPicks).mockResolvedValue(mockPicksResponse);
    vi.mocked(fplApi.getEntry).mockResolvedValue(mockEntry);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading while either query is pending', async () => {
    const { result } = renderHook(() => useManagerPicks(12345, 17), {
      wrapper: createWrapper(),
    });

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('should show not loading when both queries complete', async () => {
    const { result } = renderHook(() => useManagerPicks(12345, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.picks).toBeDefined();
    expect(result.current.managerInfo).toBeDefined();
  });
});

describe('useManagerPicks - error handling', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return picksQuery error when picks fetch fails', async () => {
    vi.mocked(fplApi.getEntryPicks).mockRejectedValue(new Error('Picks API Error'));
    vi.mocked(fplApi.getEntry).mockResolvedValue(mockEntry);

    const { result } = renderHook(() => useManagerPicks(12345, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Picks API Error');
    });
  });

  it('should return managerQuery error when manager fetch fails', async () => {
    vi.mocked(fplApi.getEntryPicks).mockResolvedValue(mockPicksResponse);
    vi.mocked(fplApi.getEntry).mockRejectedValue(new Error('Entry API Error'));

    const { result } = renderHook(() => useManagerPicks(12345, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Entry API Error');
    });
  });

  it('should prioritize picksQuery error when both fail', async () => {
    vi.mocked(fplApi.getEntryPicks).mockRejectedValue(new Error('Picks Error'));
    vi.mocked(fplApi.getEntry).mockRejectedValue(new Error('Entry Error'));

    const { result } = renderHook(() => useManagerPicks(12345, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Picks Error');
    });
  });

  it('should handle non-Error objects in error response', async () => {
    vi.mocked(fplApi.getEntryPicks).mockRejectedValue('String error');
    vi.mocked(fplApi.getEntry).mockResolvedValue(mockEntry);

    const { result } = renderHook(() => useManagerPicks(12345, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBe('String error');
    });
  });
});

describe('useManagerPicks - data transformation', () => {
  beforeEach(() => {
    vi.mocked(fplApi.getEntryPicks).mockResolvedValue(mockPicksResponse);
    vi.mocked(fplApi.getEntry).mockResolvedValue(mockEntry);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should extract only required fields for managerInfo', async () => {
    const { result } = renderHook(() => useManagerPicks(12345, 17), {
      wrapper: createWrapper(),
    });

    // Wait for actual data, not just "defined"
    await waitFor(() => {
      expect(result.current.managerInfo?.id).toBe(12345);
    });

    // Should only have the 4 ManagerInfo fields
    expect(result.current.managerInfo).toEqual({
      id: 12345,
      player_first_name: 'John',
      player_last_name: 'Doe',
      name: "John's XI",
    });
  });

  it('should return full picks response unchanged', async () => {
    const { result } = renderHook(() => useManagerPicks(12345, 17), {
      wrapper: createWrapper(),
    });

    // Wait for actual data to be loaded
    await waitFor(() => {
      expect(result.current.picks?.picks.length).toBeGreaterThan(0);
    });

    expect(result.current.picks?.picks.length).toBe(15);
    expect(result.current.picks?.entry_history.points).toBe(65);
    expect(result.current.picks?.active_chip).toBeNull();
  });

  it('should return active chip when set', async () => {
    const picksWithChip = { ...mockPicksResponse, active_chip: 'bboost' };
    vi.mocked(fplApi.getEntryPicks).mockResolvedValue(picksWithChip);

    const { result } = renderHook(() => useManagerPicks(12345, 17), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.picks?.active_chip).toBe('bboost');
    });
  });
});
