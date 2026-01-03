import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { CACHE_TIMES } from 'src/config';

import App from './App.tsx';
import './index.css';

// Configure React Query with sensible defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh for 5 minutes by default
      staleTime: CACHE_TIMES.FIVE_MINUTES,
      // Keep unused data in cache for 30 minutes
      gcTime: CACHE_TIMES.THIRTY_MINUTES,
      // Don't refetch on window focus for this app
      refetchOnWindowFocus: false,
      // Retry failed requests once
      retry: 1,
    },
  },
});

// Disable browser scroll restoration to prevent scroll jumps on reload
// (browser tries to restore scroll before React renders, causing layout shift)
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

createRoot(document.querySelector('#root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>
);
