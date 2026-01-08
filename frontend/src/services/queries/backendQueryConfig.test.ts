import { describe, expect, it } from 'vitest';

import { CACHE_TIMES } from 'src/config';

import { BackendApiError } from 'services/backendApi';

import { backendQueryDefaults, backendRetry, backendRetryDelay } from './backendQueryConfig';

describe('backendRetry', () => {
  it('should not retry on 503 BackendApiError', () => {
    const error = new BackendApiError(503, 'Service Unavailable');
    expect(backendRetry(0, error)).toBe(false);
  });

  it('should not retry on network error (status 0)', () => {
    const error = new BackendApiError(0, 'Network Error');
    expect(backendRetry(0, error)).toBe(false);
  });

  it('should retry on first failure for non-503 errors', () => {
    const error = new Error('Random error');
    expect(backendRetry(0, error)).toBe(true);
  });

  it('should retry on second failure for non-503 errors', () => {
    const error = new Error('Random error');
    expect(backendRetry(1, error)).toBe(true);
  });

  it('should not retry after 2 failures', () => {
    const error = new Error('Random error');
    expect(backendRetry(2, error)).toBe(false);
  });

  it('should retry on 500 BackendApiError', () => {
    const error = new BackendApiError(500, 'Internal Server Error');
    expect(backendRetry(0, error)).toBe(true);
  });

  it('should retry on 404 BackendApiError', () => {
    const error = new BackendApiError(404, 'Not Found');
    expect(backendRetry(0, error)).toBe(true);
  });
});

describe('backendRetryDelay', () => {
  it('should return 1s for first attempt', () => {
    expect(backendRetryDelay(0)).toBe(1000);
  });

  it('should return 2s for second attempt', () => {
    expect(backendRetryDelay(1)).toBe(2000);
  });

  it('should return 4s for third attempt', () => {
    expect(backendRetryDelay(2)).toBe(4000);
  });

  it('should return 8s for fourth attempt', () => {
    expect(backendRetryDelay(3)).toBe(8000);
  });

  it('should cap delay at 10 seconds', () => {
    expect(backendRetryDelay(4)).toBe(10000);
    expect(backendRetryDelay(5)).toBe(10000);
    expect(backendRetryDelay(10)).toBe(10000);
  });
});

describe('backendQueryDefaults', () => {
  it('should have 5 minute stale time', () => {
    expect(backendQueryDefaults.staleTime).toBe(CACHE_TIMES.FIVE_MINUTES);
  });

  it('should have 30 minute gc time', () => {
    expect(backendQueryDefaults.gcTime).toBe(CACHE_TIMES.THIRTY_MINUTES);
  });

  it('should use backendRetry function', () => {
    expect(backendQueryDefaults.retry).toBe(backendRetry);
  });

  it('should use backendRetryDelay function', () => {
    expect(backendQueryDefaults.retryDelay).toBe(backendRetryDelay);
  });
});
