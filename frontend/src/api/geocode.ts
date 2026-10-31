import { GEOCODE_RESULT_COUNT } from '../lib/constants';
import { apiRequest } from './client';
import { geocodeResponseSchema } from './schemas';
import type { Location } from './types';

export async function fetchGeocode(query: string, signal?: AbortSignal): Promise<Location[]> {
  const params = new URLSearchParams({ q: query, size: String(GEOCODE_RESULT_COUNT) });
  const response = await apiRequest(`/geocode?${params.toString()}`, geocodeResponseSchema, {
    signal,
  });
  return response.results;
}

/** So "Dallas " and "dallas" share a cache entry. */
export const normalizeGeocodeQuery = (text: string): string =>
  text.trim().replace(/\s+/g, ' ').toLowerCase();
