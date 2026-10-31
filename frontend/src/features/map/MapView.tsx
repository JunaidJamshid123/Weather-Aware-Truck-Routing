import 'maplibre-gl/dist/maplibre-gl.css';

import { useCallback, useState } from 'react';
import type { MapLayerMouseEvent } from 'react-map-gl/maplibre';
import { Map } from 'react-map-gl/maplibre';

import { MAP_DARK_STYLE_URL, MAP_STYLE_URL, US_VIEW } from '../../lib/constants';
import { useUiStore } from '../../store/uiStore';
import { DriverLayer } from '../driver/DriverLayer';
import { ForecastSlider } from '../forecast/ForecastSlider';
import { useCurrentPlan } from '../plan/planContext';
import { CheckpointPopup } from './CheckpointPopup';
import { EndpointMarkers } from './EndpointMarkers';
import { checkpointRefFromProperties, routeIdFromProperties } from './geojson';
import { CheckpointLayer } from './layers/CheckpointLayer';
import { HeatmapLayer } from './layers/HeatmapLayer';
import { RouteLayers } from './layers/RouteLayers';
import { LAYER_IDS } from './layerStyles';
import { MapFallback } from './MapFallback';
import { MapToolbar } from './MapToolbar';
import { RiskLegend } from './RiskLegend';
import { useFitBounds } from './useFitBounds';
import { isWebglSupported } from './webgl';

const INTERACTIVE_LAYER_IDS = [LAYER_IDS.checkpoints, LAYER_IDS.routeLine];
const MAP_STYLE = { width: '100%', height: '100%' };

/** Never re-mounted; layers start with empty data so their stacking order never changes. */
export function MapView() {
  const plan = useCurrentPlan();
  const [cursor, setCursor] = useState('');
  const [isSupported] = useState(isWebglSupported);
  const theme = useUiStore((state) => state.theme);
  const selectedRouteId = useUiStore((state) => state.selectedRouteId);
  const selectedRoute =
    plan?.routes.find((route) => route.id === selectedRouteId) ?? plan?.routes[0] ?? null;

  // Checkpoints sit above routes, so a click on a dot wins over the line beneath it.
  const handleClick = useCallback((event: MapLayerMouseEvent) => {
    const properties = event.features?.[0]?.properties;
    const ref = checkpointRefFromProperties(properties);
    const routeId = routeIdFromProperties(properties);
    const { openCheckpoint, closeCheckpoint, selectRoute } = useUiStore.getState();
    if (ref) openCheckpoint(ref);
    else if (routeId) selectRoute(routeId);
    else closeCheckpoint();
  }, []);

  if (!isSupported) {
    return (
      <MapFallback message="Your browser can't display the map (WebGL is unavailable). Route details are still listed in the panel." />
    );
  }

  // The slider sits below the map on phones and floats over it on wider screens.
  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative min-h-0 flex-1">
        <Map
          reuseMaps
          mapStyle={theme === 'dark' ? MAP_DARK_STYLE_URL : MAP_STYLE_URL}
          initialViewState={US_VIEW}
          style={MAP_STYLE}
          interactiveLayerIds={INTERACTIVE_LAYER_IDS}
          cursor={cursor}
          onMouseEnter={() => {
            setCursor('pointer');
          }}
          onMouseLeave={() => {
            setCursor('');
          }}
          onClick={handleClick}
          dragRotate={false}
          pitchWithRotate={false}
          touchPitch={false}
          attributionControl={{ compact: true }}
          onLoad={collapseAttribution}
        >
          <HeatmapLayer heatmap={plan?.heatmap ?? null} />
          <RouteLayers routes={plan?.routes ?? null} />
          <DriverLayer plan={plan} />
          <CheckpointLayer routes={plan?.routes ?? null} />
          {selectedRoute && <EndpointMarkers route={selectedRoute} />}
          {plan && <CheckpointPopup plan={plan} />}
          <MapToolbar routes={plan?.routes ?? null} />
          <FitToPlan routes={plan?.routes ?? null} />
        </Map>
        <RiskLegend hasPlan={plan !== null} />
      </div>
      {plan && <ForecastSlider heatmap={plan.heatmap} route={selectedRoute} />}
    </div>
  );
}

/** MapLibre opens the compact attribution on load, where it covers routes on small maps. */
function collapseAttribution(event: { target: { getContainer: () => HTMLElement } }) {
  event.target
    .getContainer()
    .querySelector('.maplibregl-ctrl-attrib')
    ?.classList.remove('maplibregl-compact-show');
}

function FitToPlan({ routes }: { routes: Parameters<typeof useFitBounds>[0] }) {
  useFitBounds(routes);
  return null;
}
