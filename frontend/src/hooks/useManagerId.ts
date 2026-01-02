import { useContext } from 'react';

import { ManagerIdContext, type ManagerIdContextValue } from '../contexts/ManagerIdContext';

export type { ManagerIdContextValue };

/**
 * Hook to access the user's FPL manager ID from context.
 * Must be used within a ManagerIdProvider.
 */
export function useManagerId(): ManagerIdContextValue {
  const context = useContext(ManagerIdContext);
  if (!context) {
    throw new Error('useManagerId must be used within a ManagerIdProvider');
  }
  return context;
}
