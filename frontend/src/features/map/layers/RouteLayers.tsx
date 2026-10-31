import { useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/maplibre';

import type { Route } from '../../../api/types';
import { useUiStore } from '../../../store/uiStore';
import { buildRouteCollection, EMPTY_FEATURE_COLLECTION } from '../geojson';
import {
  LAYER_IDS,
  routeCasingPaint,
  routeLayout,
  routeLinePaint,
  SOURCE_IDS,
} from '../layerStyles';

/** One source for all routes; selection only changes paint, never the data. */
export function RouteLayers({ routes }: { routes: readonly Route[] | null }) {
  const selectedRouteId = useUiStore((state) => state.selectedRouteId);
  const data = useMemo(
    () => (routes ? buildRouteCollection(routes) : EMPTY_FEATURE_COLLECTION),
    [routes],
  );
  const layout = useMemo(() => routeLayout(selectedRouteId), [selectedRouteId]);
  const casingPaint = useMemo(() => routeCasingPaint(selectedRouteId), [selectedRouteId]);
  const linePaint = useMemo(() => routeLinePaint(selectedRouteId), [selectedRouteId]);

  return (
    <Source id={SOURCE_IDS.routes} type="geojson" data={data}>
      <Layer id={LAYER_IDS.routeCasing} type="line" layout={layout} paint={casingPaint} />
      <Layer id={LAYER_IDS.routeLine} type="line" layout={layout} paint={linePaint} />
    </Source>
  );
}
