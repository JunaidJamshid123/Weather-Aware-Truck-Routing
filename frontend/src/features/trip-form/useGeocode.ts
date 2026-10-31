import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { fetchGeocode, normalizeGeocodeQuery } from '../../api/geocode';
import type { Location } from '../../api/types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { GEOCODE_DEBOUNCE_MS, GEOCODE_MIN_CHARS, MS_PER_DAY } from '../../lib/constants';

export type GeocodeResult = {
  suggestions: Location[];
  isSearching: boolean;
  hasError: boolean;
  /** False until the debounced text is long enough to search. */
  isQueryable: boolean;
};

/** Keyed on normalized text, so stale requests cancel and repeats come from a 24 h cache. */
export function useGeocode(text: string, enabled: boolean): GeocodeResult {
  const query = useDebouncedValue(normalizeGeocodeQuery(text), GEOCODE_DEBOUNCE_MS);
  const isQueryable = enabled && query.length >= GEOCODE_MIN_CHARS;
  const result = useQuery({
    queryKey: ['geocode', query],
    queryFn: ({ signal }) => fetchGeocode(query, signal),
    enabled: isQueryable,
    staleTime: MS_PER_DAY,
    gcTime: MS_PER_DAY,
    placeholderData: keepPreviousData,
  });
  return {
    suggestions: isQueryable ? (result.data ?? []) : [],
    isSearching: isQueryable && result.isFetching,
    hasError: isQueryable && result.isError,
    isQueryable,
  };
}
