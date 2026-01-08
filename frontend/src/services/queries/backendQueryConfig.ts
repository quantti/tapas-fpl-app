/**
 * Shared configuration for backend API queries (Fly.io).
 *
 * These settings are optimized for the Python backend which has:
 * - 2-3 second cold starts on Fly.io
 * - In-memory caching (5 min TTL)
 * - Historical data that doesn't change frequently
 */

import { CACHE_TIMES } from 'src/config';

import { BackendApiError } from 'services/backendApi';

/**
 * Retry function for backend queries.
 * - Don't retry on 503 (service unavailable) - backend is starting up, retrying won't help
 * - Retry up to 2 times on other errors
 */
export function backendRetry(failureCount: number, error: Error): boolean {
  // Don't retry on service unavailable (503 or network error)
  if (error instanceof BackendApiError && error.isServiceUnavailable) {
    return false;
  }
  return failureCount < 2;
}

/**
 * Retry delay with exponential backoff for Fly.io cold starts.
 * - 1s, 2s, 4s... up to 10s max
 */
export function backendRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 10000);
}

/**
 * Default query options for backend API hooks.
 * Spread into useQuery options.
 */
export const backendQueryDefaults = {
  staleTime: CACHE_TIMES.FIVE_MINUTES,
  gcTime: CACHE_TIMES.THIRTY_MINUTES,
  retry: backendRetry,
  retryDelay: backendRetryDelay,
} as const;
