import { useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/maplibre';

import type { Route } from '../../../api/types';
import { useUiStore } from '../../../store/uiStore';
import { buildCheckpointCollection, EMPTY_FEATURE_COLLECTION } from '../geojson';
import { checkpointLayout, checkpointPaint, LAYER_IDS, SOURCE_IDS } from '../layerStyles';

/** One GPU circle layer for every route, not DOM markers. */
export function CheckpointLayer({ routes }: { routes: readonly Route[] | null }) {
  const selectedRouteId = useUiStore((state) => state.selectedRouteId);
  const data = useMemo(
    () => (routes ? buildCheckpointCollection(routes) : EMPTY_FEATURE_COLLECTION),
    [routes],
  );
  const layout = useMemo(() => checkpointLayout(selectedRouteId), [selectedRouteId]);
  const paint = useMemo(() => checkpointPaint(selectedRouteId), [selectedRouteId]);

  return (
    <Source id={SOURCE_IDS.checkpoints} type="geojson" data={data}>
      <Layer id={LAYER_IDS.checkpoints} type="circle" layout={layout} paint={paint} />
    </Source>
  );
}
