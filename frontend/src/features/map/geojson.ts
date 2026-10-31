/** Built once per plan; selection and the slider only change paint, never rebuild sources. */
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

import type { Checkpoint, Heatmap, Plan, Route } from '../../api/types';
import { UNKNOWN_RISK_LEVEL } from '../../lib/risk';
import type { CheckpointRef } from '../../store/uiStore';

export type RouteFeatureProperties = { routeId: string; rank: number; isRecommended: boolean };
export type CheckpointFeatureProperties = {
  routeId: string;
  index: number;
  /** -1 when the forecast is unavailable. */
  riskLevel: number;
};
/** Flat r0..r48 props so the slider can switch hours with a paint expression. */
export type HeatmapFeatureProperties = Record<string, number>;

export type LngLatBounds = [[west: number, south: number], [east: number, north: number]];

export const heatmapHourProperty = (hour: number): string => `r${hour}`;

export function buildRouteCollection(
  routes: readonly Route[],
): FeatureCollection<LineString, RouteFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: routes.map((route) => ({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: route.geometry },
      properties: {
        routeId: route.id,
        rank: route.summary.rank,
        isRecommended: route.summary.is_recommended,
      },
    })),
  };
}

export function buildCheckpointCollection(
  routes: readonly Route[],
): FeatureCollection<Point, CheckpointFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: routes.flatMap((route) =>
      route.checkpoints.map((checkpoint): Feature<Point, CheckpointFeatureProperties> => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [checkpoint.lon, checkpoint.lat] },
        properties: {
          routeId: route.id,
          index: checkpoint.index,
          riskLevel: checkpoint.risk_level ?? UNKNOWN_RISK_LEVEL,
        },
      })),
    ),
  };
}

export function buildHeatmapCollection(
  heatmap: Heatmap,
): FeatureCollection<Point, HeatmapFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: heatmap.points.map((point) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
      properties: Object.fromEntries(
        point.risk.map((risk, hour) => [heatmapHourProperty(hour), risk]),
      ),
    })),
  };
}

/** null when there is nothing to frame. */
export function planBounds(routes: readonly Route[]): LngLatBounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const route of routes) {
    for (const [lon, lat] of route.geometry) {
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return Number.isFinite(west)
    ? [
        [west, south],
        [east, north],
      ]
    : null;
}

export type CheckpointLookup = { route: Route; checkpoint: Checkpoint };

export function findCheckpoint(plan: Plan, ref: CheckpointRef): CheckpointLookup | null {
  const route = plan.routes.find((candidate) => candidate.id === ref.routeId);
  const checkpoint = route?.checkpoints.find((candidate) => candidate.index === ref.index);
  return route && checkpoint ? { route, checkpoint } : null;
}

/** null for anything that isn't a checkpoint feature. */
export function checkpointRefFromProperties(properties: unknown): CheckpointRef | null {
  if (typeof properties !== 'object' || properties === null) return null;
  const { routeId, index } = properties as Partial<CheckpointFeatureProperties>;
  return typeof routeId === 'string' && typeof index === 'number' ? { routeId, index } : null;
}

/** Checkpoint features also carry a routeId, so anything with an index is rejected. */
export function routeIdFromProperties(properties: unknown): string | null {
  if (typeof properties !== 'object' || properties === null || 'index' in properties) return null;
  const { routeId } = properties as Partial<RouteFeatureProperties>;
  return typeof routeId === 'string' ? routeId : null;
}

export const EMPTY_FEATURE_COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};
