import { QueryClient } from '@tanstack/react-query';

// Retry only on network errors and 5xx responses.
// Retrying 4xx (including 401, 403, 404, 422, 429) is wasteful — the server
// will give the same answer immediately, adding latency and burning TBT budget.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  const status = (error as { response?: { status?: number } })?.response?.status;
  if (status !== undefined && status < 500) return false; // 4xx — don't retry
  return true;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      refetchOnWindowFocus: false,
      // Serve cached data instantly for 5 min before re-fetching in background.
      staleTime: 5 * 60 * 1000,
      // Keep unused cache entries for 10 min before garbage-collecting them.
      // This allows fast back-navigation without a loading spinner.
      gcTime: 10 * 60 * 1000,
    },
    mutations: {
      // Never retry mutations — they may have partial side-effects server-side.
      retry: false,
    },
  },
});

export default queryClient;