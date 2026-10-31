import type { Plan, Route } from '../../api/types';
import { samplePlan } from '../../mocks/handlers';
import {
  buildCheckpointCollection,
  buildHeatmapCollection,
  buildRouteCollection,
  checkpointRefFromProperties,
  findCheckpoint,
  heatmapHourProperty,
  planBounds,
} from './geojson';

const firstRoute = samplePlan.routes[0]!;

function withCheckpointRisk(plan: Plan, riskLevel: number | null): Route[] {
  return plan.routes.map((route) => ({
    ...route,
    checkpoints: route.checkpoints.map((checkpoint) => ({
      ...checkpoint,
      risk_level: riskLevel,
    })),
  }));
}

describe('buildRouteCollection', () => {
  it('creates one LineString per route with [lon, lat] coordinates and ranking props', () => {
    const collection = buildRouteCollection(samplePlan.routes);
    expect(collection.features).toHaveLength(samplePlan.routes.length);
    const feature = collection.features[0]!;
    expect(feature.geometry.coordinates[0]).toEqual(firstRoute.geometry[0]);
    expect(feature.properties).toEqual({
      routeId: firstRoute.id,
      rank: 1,
      isRecommended: firstRoute.summary.is_recommended,
    });
  });
});

describe('buildCheckpointCollection', () => {
  it('includes every checkpoint of every route, tagged with its route', () => {
    const collection = buildCheckpointCollection(samplePlan.routes);
    const total = samplePlan.routes.reduce((sum, route) => sum + route.checkpoints.length, 0);
    expect(collection.features).toHaveLength(total);
    const first = collection.features[0]!;
    expect(first.geometry.coordinates).toEqual([
      firstRoute.checkpoints[0]!.lon,
      firstRoute.checkpoints[0]!.lat,
    ]);
    expect(first.properties.routeId).toBe(firstRoute.id);
  });

  it('copies the risk level, and maps unknown (null) to -1 rather than LOW', () => {
    const severe = buildCheckpointCollection(withCheckpointRisk(samplePlan, 3));
    expect(severe.features.every((f) => f.properties.riskLevel === 3)).toBe(true);
    const unknown = buildCheckpointCollection(withCheckpointRisk(samplePlan, null));
    expect(unknown.features.every((f) => f.properties.riskLevel === -1)).toBe(true);
  });
});

describe('buildHeatmapCollection', () => {
  it('flattens the 49 hourly risks into r0..r48 numeric properties', () => {
    const collection = buildHeatmapCollection(samplePlan.heatmap);
    expect(collection.features).toHaveLength(samplePlan.heatmap.points.length);
    const point = samplePlan.heatmap.points[0]!;
    const properties = collection.features[0]!.properties;
    expect(Object.keys(properties)).toHaveLength(49);
    expect(properties.r0).toBe(point.risk[0]);
    expect(properties.r48).toBe(point.risk[48]);
    expect(heatmapHourProperty(12)).toBe('r12');
  });

  it('keeps -1 for unknown hours (the paint expression clamps it)', () => {
    const collection = buildHeatmapCollection({
      start_time: '2026-11-02T14:00:00Z',
      hours: 2,
      points: [{ lat: 40, lon: -100, risk: [-1, 4] }],
    });
    expect(collection.features[0]!.properties).toEqual({ r0: -1, r1: 4 });
  });
});

describe('planBounds', () => {
  it('encloses every route vertex', () => {
    const bounds = planBounds(samplePlan.routes)!;
    const [[west, south], [east, north]] = bounds;
    for (const route of samplePlan.routes) {
      for (const [lon, lat] of route.geometry) {
        expect(lon).toBeGreaterThanOrEqual(west);
        expect(lon).toBeLessThanOrEqual(east);
        expect(lat).toBeGreaterThanOrEqual(south);
        expect(lat).toBeLessThanOrEqual(north);
      }
    }
  });

  it('is null with no routes', () => {
    expect(planBounds([])).toBeNull();
  });
});

describe('checkpoint lookup', () => {
  it('finds a checkpoint by route and index', () => {
    const found = findCheckpoint(samplePlan, { routeId: firstRoute.id, index: 2 });
    expect(found?.checkpoint.index).toBe(2);
    expect(found?.route.id).toBe(firstRoute.id);
    expect(findCheckpoint(samplePlan, { routeId: 'route-9', index: 0 })).toBeNull();
  });

  it('reads clicked feature properties defensively', () => {
    expect(checkpointRefFromProperties({ routeId: 'route-2', index: 4, riskLevel: 1 })).toEqual({
      routeId: 'route-2',
      index: 4,
    });
    expect(checkpointRefFromProperties({ routeId: 'route-2' })).toBeNull();
    expect(checkpointRefFromProperties(null)).toBeNull();
  });
});
