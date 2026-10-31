/** UI state reaches the map only through these expressions, so geometry is never re-uploaded. */
import type {
  CircleLayerSpecification,
  DataDrivenPropertyValueSpecification,
  ExpressionSpecification,
  HeatmapLayerSpecification,
  LineLayerSpecification,
} from 'maplibre-gl';

import { FALLBACK_ROUTE_COLOR, ROUTE_COLORS } from '../../lib/constants';
import {
  MAX_RISK_LEVEL,
  NO_TRAVEL_RING_COLOR,
  RISK_META,
  RISK_SCALE,
  UNKNOWN_RISK_COLOR,
} from '../../lib/risk';
import { heatmapHourProperty } from './geojson';

export const SOURCE_IDS = {
  routes: 'routes',
  checkpoints: 'checkpoints',
  heatmap: 'heatmap',
  trail: 'driver-trail',
};
export const LAYER_IDS = {
  riskCorridor: 'risk-corridor',
  heatmap: 'forecast-heatmap',
  routeCasing: 'route-casing',
  routeLine: 'route-line',
  trail: 'driver-trail',
  checkpoints: 'checkpoints',
} as const;

const DIMMED_OPACITY = 0.4;
const ROUTE_WIDTH_PX = 4;
const RECOMMENDED_EXTRA_PX = 1.5;
const SELECTED_EXTRA_PX = 2;
const CASING_EXTRA_PX = 3;
const CASING_COLOR = '#ffffff';

type LinePaint = NonNullable<LineLayerSpecification['paint']>;
type LineLayout = NonNullable<LineLayerSpecification['layout']>;
type CirclePaint = NonNullable<CircleLayerSpecification['paint']>;
type CircleLayout = NonNullable<CircleLayerSpecification['layout']>;
type HeatmapPaint = NonNullable<HeatmapLayerSpecification['paint']>;

const isSelected = (selectedRouteId: string | null): ExpressionSpecification => [
  '==',
  ['get', 'routeId'],
  selectedRouteId ?? '',
];

const routeColor = (): ExpressionSpecification =>
  [
    'match',
    ['get', 'routeId'],
    ...Object.entries(ROUTE_COLORS).flat(),
    FALLBACK_ROUTE_COLOR,
  ] as unknown as ExpressionSpecification;

const routeWidth = (selectedRouteId: string | null, extraPx = 0): ExpressionSpecification => [
  '+',
  ROUTE_WIDTH_PX + extraPx,
  ['case', ['get', 'isRecommended'], RECOMMENDED_EXTRA_PX, 0],
  ['case', isSelected(selectedRouteId), SELECTED_EXTRA_PX, 0],
];

export const routeLinePaint = (selectedRouteId: string | null): LinePaint => ({
  'line-color': routeColor(),
  'line-width': routeWidth(selectedRouteId),
  'line-opacity': ['case', isSelected(selectedRouteId), 1, DIMMED_OPACITY],
});

export const routeCasingPaint = (selectedRouteId: string | null): LinePaint => ({
  'line-color': CASING_COLOR,
  'line-width': routeWidth(selectedRouteId, CASING_EXTRA_PX),
  'line-opacity': ['case', isSelected(selectedRouteId), 0.95, DIMMED_OPACITY * 0.6],
});

/** Draw the selected route on top of the others. */
export const routeLayout = (selectedRouteId: string | null): LineLayout => ({
  'line-join': 'round',
  'line-cap': 'round',
  'line-sort-key': ['case', isSelected(selectedRouteId), 1, 0],
});

const riskColor = (): ExpressionSpecification =>
  [
    'match',
    ['get', 'riskLevel'],
    ...RISK_SCALE.flatMap((meta) => [meta.level, meta.color]),
    UNKNOWN_RISK_COLOR,
  ] as unknown as ExpressionSpecification;

const radiusByZoom = (
  selectedRouteId: string | null,
): DataDrivenPropertyValueSpecification<number> => [
  'interpolate',
  ['linear'],
  ['zoom'],
  4,
  ['case', isSelected(selectedRouteId), 4.5, 2.5],
  10,
  ['case', isSelected(selectedRouteId), 9, 5],
];

export const checkpointPaint = (selectedRouteId: string | null): CirclePaint => ({
  'circle-color': riskColor(),
  'circle-radius': radiusByZoom(selectedRouteId),
  'circle-opacity': ['case', isSelected(selectedRouteId), 1, 0.6],
  'circle-stroke-color': NO_TRAVEL_RING_COLOR,
  'circle-stroke-width': [
    'case',
    ['==', ['get', 'riskLevel'], RISK_META.NO_TRAVEL.level],
    2.5,
    ['case', isSelected(selectedRouteId), 1.5, 0.75],
  ],
  'circle-stroke-opacity': ['case', isSelected(selectedRouteId), 1, 0.6],
});

/** Selected route's checkpoints on top; within a route, worse risk on top. */
export const checkpointLayout = (selectedRouteId: string | null): CircleLayout => ({
  'circle-sort-key': ['+', ['case', isSelected(selectedRouteId), 10, 0], ['get', 'riskLevel']],
});

/** Scrubbing only swaps this expression: no setData, no network. Unknown (-1) clamps to 0. */
export const heatmapWeight = (hour: number): ExpressionSpecification => [
  '/',
  ['max', ['get', heatmapHourProperty(hour)], 0],
  MAX_RISK_LEVEL,
];

export const HEATMAP_COLOR_RAMP: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['heatmap-density'],
  0,
  'rgba(242, 194, 48, 0)',
  0.12,
  'rgba(242, 194, 48, 0.45)',
  0.35,
  'rgba(242, 140, 40, 0.7)',
  0.6,
  'rgba(215, 38, 61, 0.8)',
  0.9,
  'rgba(110, 10, 25, 0.88)',
];

export const heatmapPaint = (hour: number): HeatmapPaint => ({
  'heatmap-weight': heatmapWeight(hour),
  'heatmap-color': HEATMAP_COLOR_RAMP,
  // Continuous corridor when zoomed out, tight when zoomed in.
  'heatmap-radius': ['interpolate', ['exponential', 1.6], ['zoom'], 3, 11, 6, 26, 9, 60, 12, 120],
  'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 3, 1.3, 9, 1.8],
  // Fade out at street level so checkpoints stay readable.
  'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.9, 12, 0.15],
});

// Deep red rather than black, which would read as a hole in the map.
const NO_TRAVEL_GLOW_COLOR = '#5c0614';

// Indexed by risk level + 1, so -1 (no forecast) comes first.
const CORRIDOR_OPACITY = [0, 0.13, 0.24, 0.3, 0.36, 0.42] as const;

/** Band under the heatmap showing each point's level, including calm stretches it leaves blank. */
export const corridorPaint = (hour: number): CirclePaint => {
  const risk: ExpressionSpecification = ['get', heatmapHourProperty(hour)];
  return {
    'circle-color': [
      'match',
      risk,
      ...RISK_SCALE.flatMap((meta) => [
        meta.level,
        meta === RISK_META.NO_TRAVEL ? NO_TRAVEL_GLOW_COLOR : meta.color,
      ]),
      UNKNOWN_RISK_COLOR,
    ] as unknown as ExpressionSpecification,
    'circle-opacity': [
      'match',
      risk,
      ...RISK_SCALE.flatMap((meta) => [meta.level, CORRIDOR_OPACITY[meta.level + 1] ?? 0]),
      CORRIDOR_OPACITY[0],
    ] as unknown as ExpressionSpecification,
    'circle-radius': ['interpolate', ['exponential', 1.6], ['zoom'], 3, 7, 6, 18, 9, 44, 12, 90],
    'circle-blur': 1,
    'circle-pitch-alignment': 'map',
  };
};

// The road already driven, tinted to read against either basemap.
const TRAIL_COLORS = { light: 'rgba(15, 30, 46, 0.45)', dark: 'rgba(255, 255, 255, 0.38)' };
const TRAIL_CLEAR = 'rgba(0, 0, 0, 0)';

export type TrailTheme = keyof typeof TRAIL_COLORS;

export const trailLinePaint = (progress: number, theme: TrailTheme = 'light'): LinePaint => ({
  'line-gradient': trailGradient(progress, theme),
  'line-width': routeWidth('', SELECTED_EXTRA_PX),
});

/** Tints line-progress up to `progress`. */
export const trailGradient = (
  progress: number,
  theme: TrailTheme = 'light',
): ExpressionSpecification => [
  'step',
  ['line-progress'],
  TRAIL_COLORS[theme],
  Math.min(1, Math.max(1e-6, progress)),
  TRAIL_CLEAR,
];

export const TRAIL_LAYOUT: LineLayout = { 'line-join': 'round', 'line-cap': 'round' };
