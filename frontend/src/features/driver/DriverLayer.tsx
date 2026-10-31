import type { Map as MaplibreMap } from 'maplibre-gl';
import { Marker as MaplibreMarker } from 'maplibre-gl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Layer, Source, useMap } from 'react-map-gl/maplibre';

import type { Plan } from '../../api/types';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import { useTween } from '../../hooks/useTween';
import { DRIVER_AVATAR_URL, FORECAST_PLAY_STEP_MS } from '../../lib/constants';
import { addHours, formatWeekdayTime } from '../../lib/format';
import { riskMetaForLevel, UNKNOWN_RISK_COLOR } from '../../lib/risk';
import { useUiStore } from '../../store/uiStore';
import { useForecastHour } from '../forecast/useForecastHour';
import { buildRouteCollection, EMPTY_FEATURE_COLLECTION } from '../map/geojson';
import {
  LAYER_IDS,
  SOURCE_IDS,
  TRAIL_LAYOUT,
  trailGradient,
  trailLinePaint,
} from '../map/layerStyles';
import type { TrackPosition, TripTrack } from './tripTrack';
import { buildTripTrack, positionAtHour } from './tripTrack';
import { useFollowCamera } from './useFollowCamera';

const IDLE_RING_COLOR = '#94a3b8';
const ARRIVED_RING_COLOR = '#008083';

/**
 * The marker is moved imperatively on requestAnimationFrame because react-map-gl's Marker resets
 * its position on re-render; the trail advances via a line-gradient paint change.
 */
export function DriverLayer({ plan }: { plan: Plan | null }) {
  const { current: mapRef } = useMap();
  const selectedRouteId = useUiStore((state) => state.selectedRouteId);
  const route = plan?.routes.find((candidate) => candidate.id === selectedRouteId) ?? null;
  const startTime = plan?.heatmap.start_time ?? null;
  const track = useMemo(
    () => (route && startTime ? buildTripTrack(route, startTime) : null),
    [route, startTime],
  );
  const trailData = useMemo(
    () => (route ? buildRouteCollection([route]) : EMPTY_FEATURE_COLLECTION),
    [route],
  );
  const trailPaint = useMemo(() => trailLinePaint(0), []);

  return (
    <>
      <Source id={SOURCE_IDS.trail} type="geojson" data={trailData} lineMetrics>
        <Layer id={LAYER_IDS.trail} type="line" layout={TRAIL_LAYOUT} paint={trailPaint} />
      </Source>
      {mapRef && track && startTime && (
        <DriverMarker map={mapRef.getMap()} track={track} startTime={startTime} />
      )}
    </>
  );
}

function DriverMarker({
  map,
  track,
  startTime,
}: {
  map: MaplibreMap;
  track: TripTrack;
  startTime: string;
}) {
  const { deferredHour } = useForecastHour();
  const prefersReducedMotion = usePrefersReducedMotion();
  const openCheckpoint = useUiStore((state) => state.openCheckpoint);
  const theme = useUiStore((state) => state.theme);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const [element] = useState(() => {
    const div = document.createElement('div');
    div.className = 'driver-marker';
    return div;
  });
  const markerRef = useRef<MaplibreMarker | null>(null);
  const headingRef = useRef<HTMLSpanElement>(null);
  const positionRef = useRef<TrackPosition | null>(null);

  useEffect(() => {
    const marker = new MaplibreMarker({ element, anchor: 'center' })
      .setLngLat(positionRef.current?.lngLat ?? [0, 0])
      .addTo(map);
    markerRef.current = marker;
    return () => {
      marker.remove();
      markerRef.current = null;
    };
  }, [map, element]);

  const draw = useCallback(
    (hour: number) => {
      const position = positionAtHour(track, hour);
      positionRef.current = position;
      markerRef.current?.setLngLat(position.lngLat);
      if (headingRef.current) headingRef.current.style.transform = `rotate(${position.bearing}deg)`;
      if (map.getLayer(LAYER_IDS.trail)) {
        map.setPaintProperty(
          LAYER_IDS.trail,
          'line-gradient',
          trailGradient(position.progress, themeRef.current),
        );
      }
    },
    [map, track],
  );

  const tween = useTween(
    deferredHour,
    { durationMs: FORECAST_PLAY_STEP_MS, isInstant: prefersReducedMotion },
    draw,
  );

  // New route: jump straight to the current time.
  useEffect(() => {
    draw(tween.current);
  }, [draw, tween]);

  // A basemap switch re-adds the trail at progress 0; restore it once the layer is back.
  useEffect(() => {
    const restoreTrail = () => {
      const position = positionRef.current;
      if (!position || !map.getLayer(LAYER_IDS.trail)) return;
      const wanted = trailGradient(position.progress, themeRef.current);
      const current: unknown = map.getPaintProperty(LAYER_IDS.trail, 'line-gradient');
      if (JSON.stringify(current) !== JSON.stringify(wanted)) {
        map.setPaintProperty(LAYER_IDS.trail, 'line-gradient', wanted);
      }
    };
    map.on('styledata', restoreTrail);
    return () => {
      map.off('styledata', restoreTrail);
    };
  }, [map]);

  useFollowCamera(map, positionRef);

  // Text and colours change once per whole hour; only the position animates per frame.
  const position = positionAtHour(track, deferredHour);
  const meta = riskMetaForLevel(position.riskLevel < 0 ? null : position.riskLevel);
  const ringColor =
    position.status === 'driving'
      ? (meta?.color ?? UNKNOWN_RISK_COLOR)
      : position.status === 'arrived'
        ? ARRIVED_RING_COLOR
        : IDLE_RING_COLOR;
  const status =
    position.status === 'waiting'
      ? `Departs ${formatWeekdayTime(addHours(startTime, track.departureHour))}`
      : position.status === 'arrived'
        ? 'Arrived'
        : `Mile ${Math.round(position.mile).toLocaleString('en-US')} · ${meta?.label ?? 'No forecast'}`;

  return createPortal(
    <button
      type="button"
      onClick={() => {
        openCheckpoint({ routeId: track.routeId, index: position.checkpointIndex });
      }}
      aria-label={`Driver: ${status}. Show the forecast here.`}
      className="group relative block size-[52px] cursor-pointer rounded-full focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
    >
      {position.status === 'driving' && (
        <span
          aria-hidden
          className="driver-beacon absolute inset-0 rounded-full"
          style={{ backgroundColor: ringColor }}
        />
      )}
      <span
        ref={headingRef}
        aria-hidden
        className={`absolute -inset-[11px] ${position.status === 'driving' ? '' : 'hidden'}`}
      >
        <span
          className="absolute top-0 left-1/2 -translate-x-1/2 border-x-[6px] border-b-[9px] border-x-transparent drop-shadow-sm"
          style={{ borderBottomColor: ringColor }}
        />
      </span>
      <span
        aria-hidden
        className="absolute inset-0 rounded-full bg-white transition-shadow duration-300"
        style={{
          boxShadow: `0 0 0 3px ${ringColor}, 0 6px 18px -4px rgb(15 30 46 / 0.45)`,
        }}
      />
      <img
        src={DRIVER_AVATAR_URL}
        alt=""
        draggable={false}
        className="absolute inset-[3px] size-[46px] rounded-full object-cover transition-transform duration-200 group-hover:scale-105"
      />
      {/* Hidden at the ends, where the endpoint pins already say it. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute bottom-full left-1/2 mb-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-night/90 py-1 pr-2.5 pl-2 text-[11px] font-bold whitespace-nowrap text-white shadow-float backdrop-blur-sm transition-opacity duration-200 ${
          position.status === 'driving' ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <span className="size-2 rounded-full" style={{ backgroundColor: ringColor }} />
        {status}
      </span>
    </button>,
    element,
  );
}
