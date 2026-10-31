import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';

import type { PlanRequest } from '../../api/types';
import { API_BASE_URL } from '../../lib/constants';
import { renderWithProviders } from '../../test/render';
import { server } from '../../test/server';
import { ResultsPanel } from '../results/ResultsPanel';
import { TripForm } from './TripForm';

function renderForm() {
  return renderWithProviders(
    <>
      <TripForm />
      <ResultsPanel />
    </>,
  );
}

async function pickPlace(
  user: ReturnType<typeof userEvent.setup>,
  field: string,
  text: string,
  option: string,
) {
  const input = screen.getByRole('combobox', { name: field });
  await user.clear(input);
  await user.type(input, text);
  await user.click(await screen.findByRole('option', { name: option }));
}

function captureSubmittedPlans(): PlanRequest[] {
  const requests: PlanRequest[] = [];
  server.use(
    http.post(`${API_BASE_URL}/plan`, async ({ request }) => {
      requests.push((await request.json()) as PlanRequest);
      const { samplePlan } = await import('../../mocks/handlers');
      return HttpResponse.json(samplePlan);
    }),
  );
  return requests;
}

describe('TripForm', () => {
  it('submits {label, lat, lon} locations, a UTC departure and the chosen interval', async () => {
    const user = userEvent.setup();
    const requests = captureSubmittedPlans();
    renderForm();

    await pickPlace(user, 'Origin', 'dal', 'Dallas, TX, USA');
    await pickPlace(user, 'Destination', 'den', 'Denver, CO, USA');
    await user.clear(screen.getByLabelText('Load weight (lb)'));
    await user.type(screen.getByLabelText('Load weight (lb)'), '42000');
    await user.click(screen.getByRole('radio', { name: '10 mi' }));
    const departure = screen.getByLabelText<HTMLInputElement>('Departure (local time)').value;
    await user.click(screen.getByRole('button', { name: 'Plan routes' }));

    await waitFor(() => {
      expect(requests).toHaveLength(1);
    });
    expect(requests[0]).toEqual({
      origin: { label: 'Dallas, TX, USA', lat: 32.7767, lon: -96.797 },
      destination: { label: 'Denver, CO, USA', lat: 39.7392, lon: -104.9903 },
      departure_time: new Date(departure).toISOString().replace('.000Z', 'Z'),
      load_weight_lb: 42_000,
      checkpoint_interval_mi: 10,
    });
    expect(requests[0]?.departure_time).toMatch(/Z$/);
    expect(await screen.findByRole('heading', { name: /Route options/ })).toBeInTheDocument();
  });

  it('blocks submit until both locations are picked from suggestions', async () => {
    const user = userEvent.setup();
    const requests = captureSubmittedPlans();
    renderForm();

    await user.type(screen.getByRole('combobox', { name: 'Origin' }), 'Somewhere I typed');
    await user.click(screen.getByRole('button', { name: 'Plan routes' }));

    expect(
      await screen.findByText('Choose a starting point from the suggestions.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Choose a destination from the suggestions.')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('typing again after picking clears the selection', async () => {
    const user = userEvent.setup();
    captureSubmittedPlans();
    renderForm();

    await pickPlace(user, 'Origin', 'dal', 'Dallas, TX, USA');
    await user.type(screen.getByRole('combobox', { name: 'Origin' }), 'x');
    await user.click(screen.getByRole('button', { name: 'Plan routes' }));

    expect(
      await screen.findByText('Choose a starting point from the suggestions.'),
    ).toBeInTheDocument();
  });

  it('validates the load weight with a clear message', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.clear(screen.getByLabelText('Load weight (lb)'));
    await user.type(screen.getByLabelText('Load weight (lb)'), '90000');
    await user.click(screen.getByRole('button', { name: 'Plan routes' }));

    expect(
      await screen.findByText('Load cannot exceed 80,000 lb (federal gross limit).'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Load weight (lb)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows backend validation errors on the matching field', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${API_BASE_URL}/plan`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Please correct the highlighted fields.',
              details: { departure_time: ['Departure time cannot be in the past.'] },
            },
          },
          { status: 400 },
        ),
      ),
    );
    renderForm();

    await pickPlace(user, 'Origin', 'dal', 'Dallas, TX, USA');
    await pickPlace(user, 'Destination', 'den', 'Denver, CO, USA');
    await user.click(screen.getByRole('button', { name: 'Plan routes' }));

    expect(await screen.findByText('Departure time cannot be in the past.')).toBeInTheDocument();
    expect(screen.getByLabelText('Departure (local time)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('tells the user when no place matches', async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByRole('combobox', { name: 'Origin' }), 'zzzz');
    expect(await screen.findByText('No matching places in the US.')).toBeInTheDocument();
  });
});
