import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';

import { API_BASE_URL } from '../lib/constants';
import { server } from '../test/server';
import { ApiError, apiRequest, isAbortError } from './client';
import { fetchGeocode, normalizeGeocodeQuery } from './geocode';
import { fetchPlan } from './plan';

const okSchema = z.object({ status: z.literal('ok') });

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the request to fail.');
}

describe('apiRequest', () => {
  it('parses a valid response through the schema', async () => {
    await expect(apiRequest('/health', okSchema)).resolves.toEqual({ status: 'ok' });
  });

  it('turns the uniform backend error body into an ApiError with field details', async () => {
    server.use(
      http.post(`${API_BASE_URL}/plan`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation_error',
              message: 'Departure time cannot be in the past.',
              details: { departure_time: ['Departure time cannot be in the past.'], extra: 5 },
            },
          },
          { status: 400 },
        ),
      ),
    );
    const error = await captureError(apiRequest('/plan', okSchema, { method: 'POST', body: {} }));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: 'validation_error',
      status: 400,
      message: 'Departure time cannot be in the past.',
      details: { departure_time: ['Departure time cannot be in the past.'] },
    });
  });

  it('never exposes a raw body when the error is not in the expected shape', async () => {
    server.use(
      http.get(
        `${API_BASE_URL}/health`,
        () => new HttpResponse('<html>Bad gateway</html>', { status: 502 }),
      ),
    );
    const error = await captureError(apiRequest('/health', okSchema));
    expect(error).toMatchObject({
      code: 'http_error',
      message: 'The server answered with an error (502).',
    });
  });

  it('fails loudly on contract drift', async () => {
    server.use(http.get(`${API_BASE_URL}/health`, () => HttpResponse.json({ status: 'maybe' })));
    const error = await captureError(apiRequest('/health', okSchema));
    expect(error).toMatchObject({ code: 'invalid_response' });
  });

  it('reports network failures in plain language', async () => {
    server.use(http.get(`${API_BASE_URL}/health`, () => HttpResponse.error()));
    const error = await captureError(apiRequest('/health', okSchema));
    expect(error).toMatchObject({ code: 'network_error' });
  });

  it('times out slow requests', async () => {
    server.use(
      http.get(`${API_BASE_URL}/health`, async () => {
        await delay('infinite');
        return HttpResponse.json({ status: 'ok' });
      }),
    );
    const error = await captureError(apiRequest('/health', okSchema, { timeoutMs: 20 }));
    expect(error).toMatchObject({
      code: 'timeout',
      message: 'The server took too long to respond. Please try again.',
    });
  });

  it('rethrows caller cancellation untouched so it can be ignored', async () => {
    server.use(
      http.get(`${API_BASE_URL}/health`, async () => {
        await delay('infinite');
        return HttpResponse.json({ status: 'ok' });
      }),
    );
    const controller = new AbortController();
    const request = apiRequest('/health', okSchema, { signal: controller.signal });
    controller.abort();
    const error = await captureError(request);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(isAbortError(error)).toBe(true);
  });
});

describe('endpoints', () => {
  it('fetches and validates a plan', async () => {
    const plan = await fetchPlan({
      origin: { label: 'A', lat: 47.6, lon: -122.3 },
      destination: { label: 'B', lat: 44.9, lon: -93.2 },
      departure_time: '2026-11-02T14:00:00Z',
      load_weight_lb: 42_000,
      checkpoint_interval_mi: 50,
    });
    expect(plan.routes.length).toBeGreaterThan(0);
    expect(plan.heatmap.points[0]?.risk).toHaveLength(49);
  });

  it('sends geocode queries with the result size', async () => {
    let requestedUrl = '';
    server.use(
      http.get(`${API_BASE_URL}/geocode`, ({ request }) => {
        requestedUrl = request.url;
        return HttpResponse.json({ results: [] });
      }),
    );
    await fetchGeocode('dallas');
    expect(new URL(requestedUrl).searchParams.get('q')).toBe('dallas');
    expect(new URL(requestedUrl).searchParams.get('size')).toBe('5');
  });

  it('normalizes queries so equivalent text shares a cache key', () => {
    expect(normalizeGeocodeQuery('  New   York ')).toBe('new york');
  });
});
