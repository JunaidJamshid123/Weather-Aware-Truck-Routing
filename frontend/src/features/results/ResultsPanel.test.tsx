import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useEffect } from 'react';

import type { Plan, PlanRequest } from '../../api/types';
import { ALL_BLOCKED_MESSAGE, API_BASE_URL } from '../../lib/constants';
import { samplePlan } from '../../mocks/handlers';
import { useUiStore } from '../../store/uiStore';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { usePlan } from '../plan/planContext';
import { ResultsPanel } from './ResultsPanel';

const REQUEST: PlanRequest = {
  origin: { label: 'Seattle, WA, USA', lat: 47.6062, lon: -122.3321 },
  destination: { label: 'Minneapolis, MN, USA', lat: 44.9778, lon: -93.265 },
  departure_time: '2026-11-02T14:00:00Z',
  load_weight_lb: 42_000,
  checkpoint_interval_mi: 50,
};

// Stands in for the form.
function AutoSubmit() {
  const { submit } = usePlan();
  useEffect(() => {
    submit(REQUEST).catch(() => undefined);
  }, [submit]);
  return null;
}

function renderResults(plan: Plan = samplePlan) {
  server.use(http.post(`${API_BASE_URL}/plan`, () => HttpResponse.json(plan)));
  return renderWithProviders(
    <>
      <AutoSubmit />
      <ResultsPanel />
    </>,
  );
}

describe('ResultsPanel', () => {
  it('lists ranked routes with the recommendation badge and every reason', async () => {
    renderResults();
    const list = await screen.findByRole('list');
    const cards = within(list).getAllByRole('button');
    expect(cards).toHaveLength(samplePlan.routes.length);

    const recommended = samplePlan.routes.find((r) => r.id === samplePlan.recommended_route_id)!;
    expect(cards[0]).toHaveTextContent(recommended.label);
    expect(within(cards[0]!).getByText('Recommended')).toBeInTheDocument();
    for (const route of samplePlan.routes) {
      expect(within(list).getByText(route.summary.reason)).toBeInTheDocument();
    }
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(recommended.summary.reason);
  });

  it('selects the recommended route on arrival, and a click selects another', async () => {
    const user = userEvent.setup();
    renderResults();
    const cards = within(await screen.findByRole('list')).getAllByRole('button');
    expect(cards[0]).toHaveAttribute('aria-pressed', 'true');
    expect(useUiStore.getState().selectedRouteId).toBe(samplePlan.recommended_route_id);

    await user.click(cards[1]!);
    expect(cards[1]).toHaveAttribute('aria-pressed', 'true');
    expect(cards[0]).toHaveAttribute('aria-pressed', 'false');
    expect(useUiStore.getState().selectedRouteId).toBe(samplePlan.routes[1]!.id);
  });

  it('shows the all-blocked banner instead of repeating it as a warning', async () => {
    renderResults({
      ...samplePlan,
      all_blocked: true,
      warnings: [ALL_BLOCKED_MESSAGE, 'Only 2 distinct routes found for this trip.'],
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(ALL_BLOCKED_MESSAGE);
    expect(screen.getAllByText(ALL_BLOCKED_MESSAGE)).toHaveLength(1);
    expect(screen.getByText('Only 2 distinct routes found for this trip.')).toBeInTheDocument();
  });

  it('shows unknown-weather miles on the card', async () => {
    const [first, ...rest] = samplePlan.routes;
    renderResults({
      ...samplePlan,
      routes: [{ ...first!, summary: { ...first!.summary, unknown_miles: 120 } }, ...rest],
    });
    expect(await screen.findByText(/Forecast unavailable for 120 mi/)).toBeInTheDocument();
  });

  it('shows the backend message with a Retry that re-sends the request', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.post(`${API_BASE_URL}/plan`, () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json(
              {
                error: {
                  code: 'upstream_unavailable',
                  message: 'The routing provider is temporarily unavailable.',
                  details: {},
                },
              },
              { status: 502 },
            )
          : HttpResponse.json(samplePlan);
      }),
    );
    renderWithProviders(
      <>
        <AutoSubmit />
        <ResultsPanel />
      </>,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The routing provider is temporarily unavailable.');
    expect(alert).not.toHaveTextContent('{');
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Route options/ })).toBeInTheDocument();
    });
    expect(calls).toBe(2);
  });
});
