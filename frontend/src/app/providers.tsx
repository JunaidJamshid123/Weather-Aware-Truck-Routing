import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { PlanProvider } from '../features/plan/PlanProvider';
import { createQueryClient } from './queryClient';

export function Providers({ children, client }: { children: ReactNode; client?: QueryClient }) {
  const [queryClient] = useState(() => client ?? createQueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <PlanProvider>{children}</PlanProvider>
    </QueryClientProvider>
  );
}
