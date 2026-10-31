import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false },
      // Plans cost upstream quota; the user retries explicitly.
      mutations: { retry: false },
    },
  });
}
