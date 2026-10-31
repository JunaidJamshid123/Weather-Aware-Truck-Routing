import type { RenderResult } from '@testing-library/react';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';

import { Providers } from '../app/providers';
import { createQueryClient } from '../app/queryClient';

/** Fresh providers, so each test gets an isolated query cache. */
export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(<Providers client={createQueryClient()}>{ui}</Providers>);
}
