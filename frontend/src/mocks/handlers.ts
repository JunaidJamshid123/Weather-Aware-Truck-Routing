/** Shared by offline development (browser) and tests (node). */
import { delay, http, HttpResponse } from 'msw';

import { planSchema } from '../api/schemas';
import type { Location } from '../api/types';
import { API_BASE_URL } from '../lib/constants';
import planSample from './plan.sample.json';

/** A real backend response, parsed with the live schema so it can't drift unnoticed. */
export const samplePlan = planSchema.parse(planSample);

export const SAMPLE_PLACES: readonly Location[] = [
  { label: 'Seattle, WA, USA', lat: 47.6062, lon: -122.3321 },
  { label: 'Minneapolis, MN, USA', lat: 44.9778, lon: -93.265 },
  { label: 'Dallas, TX, USA', lat: 32.7767, lon: -96.797 },
  { label: 'Denver, CO, USA', lat: 39.7392, lon: -104.9903 },
  { label: 'Chicago, IL, USA', lat: 41.8781, lon: -87.6298 },
  { label: 'Atlanta, GA, USA', lat: 33.749, lon: -84.388 },
  { label: 'Los Angeles, CA, USA', lat: 34.0522, lon: -118.2437 },
  { label: 'Kansas City, MO, USA', lat: 39.0997, lon: -94.5786 },
];

export const handlers = [
  http.get(`${API_BASE_URL}/health`, () => HttpResponse.json({ status: 'ok' })),
  http.get(`${API_BASE_URL}/geocode`, ({ request }) => {
    const query = new URL(request.url).searchParams.get('q')?.toLowerCase() ?? '';
    const results = SAMPLE_PLACES.filter((place) => place.label.toLowerCase().includes(query));
    return HttpResponse.json({ results });
  }),
  http.post(`${API_BASE_URL}/plan`, async () => {
    // Real plans take seconds; a short delay keeps loading states visible while developing.
    await delay();
    return HttpResponse.json(samplePlan);
  }),
];
