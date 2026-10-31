import { useMemo } from 'react';
import { Layer, Source } from 'react-map-gl/maplibre';

import type { Heatmap } from '../../../api/types';
import { useForecastHour } from '../../forecast/useForecastHour';
import { buildHeatmapCollection, EMPTY_FEATURE_COLLECTION } from '../geojson';
import { corridorPaint, heatmapPaint, LAYER_IDS, SOURCE_IDS } from '../layerStyles';

/** All 49 hours live on one source; the slider only swaps paint expressions, never setData. */
export function HeatmapLayer({ heatmap }: { heatmap: Heatmap | null }) {
  const { deferredHour } = useForecastHour();
  const data = useMemo(
    () => (heatmap ? buildHeatmapCollection(heatmap) : EMPTY_FEATURE_COLLECTION),
    [heatmap],
  );
  const paint = useMemo(() => heatmapPaint(deferredHour), [deferredHour]);
  const bandPaint = useMemo(() => corridorPaint(deferredHour), [deferredHour]);

  return (
    <Source id={SOURCE_IDS.heatmap} type="geojson" data={data}>
      <Layer id={LAYER_IDS.riskCorridor} type="circle" paint={bandPaint} />
      <Layer id={LAYER_IDS.heatmap} type="heatmap" paint={paint} />
    </Source>
  );
}
