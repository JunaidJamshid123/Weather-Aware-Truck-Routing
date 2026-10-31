import { render, screen } from '@testing-library/react';

import { PlanContext } from '../plan/planContext';
import { MapView } from './MapView';

vi.mock('./webgl', () => ({ isWebglSupported: () => false }));

describe('MapView without WebGL', () => {
  it('explains the problem instead of rendering a blank page', () => {
    render(
      <PlanContext.Provider
        value={{
          state: { status: 'idle' },
          submit: () => Promise.resolve(),
          retry: () => undefined,
        }}
      >
        <MapView />
      </PlanContext.Provider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/WebGL is unavailable/);
  });
});
