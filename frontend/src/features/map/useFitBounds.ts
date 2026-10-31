import type { Map as MaplibreMap } from 'maplibre-gl';
import { useEffect, useMemo } from 'react';
import { useMap } from 'react-map-gl/maplibre';

import type { Route } from '../../api/types';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import {
  FIT_BOUNDS_DURATION_MS,
  FIT_BOUNDS_PADDING,
  FIT_BOUNDS_PADDING_COMPACT,
} from '../../lib/constants';
import type { LngLatBounds } from './geojson';
import { planBounds } from './geojson';

const COMPACT_MAP_WIDTH_PX = 640;

export function fitToBounds(map: MaplibreMap, bounds: LngLatBounds, isInstant: boolean): void {
  const isCompact = map.getContainer().clientWidth < COMPACT_MAP_WIDTH_PX;
  map.fitBounds(bounds, {
    padding: isCompact ? FIT_BOUNDS_PADDING_COMPACT : FIT_BOUNDS_PADDING,
    duration: isInstant ? 0 : FIT_BOUNDS_DURATION_MS,
  });
}

/** Once per plan, not on selection or slider changes. */
export function useFitBounds(routes: readonly Route[] | null): void {
  const { current: map } = useMap();
  const prefersReducedMotion = usePrefersReducedMotion();
  const bounds = useMemo(() => (routes ? planBounds(routes) : null), [routes]);

  useEffect(() => {
    if (!map || !bounds) return;
    fitToBounds(map.getMap(), bounds, prefersReducedMotion);
    // A motion-preference flip shouldn't move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, bounds]);
}
