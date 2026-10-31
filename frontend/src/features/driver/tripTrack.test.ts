import type { Route } from '../../api/types';
import { samplePlan } from '../../mocks/handlers';
import { buildTripTrack, positionAtHour, riskTimeline } from './tripTrack';

const START = '2026-11-01T05:00:00Z';

// Straight road due east along the equator: 3 checkpoints, 2 h end to end.
const ROUTE: Route = {
  id: 'route-1',
  label: 'Fastest',
  geometry: [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  summary: {
    distance_mi: 138.2,
    duration_s: 7200,
    arrival_time: '2026-11-01T07:00:00Z',
    severe_miles: 0,
    high_miles: 0,
    moderate_miles: 0,
    no_travel_miles: 0,
    unknown_miles: 0,
    avg_risk: 0,
    max_risk: 'LOW',
    blocked: false,
    rank: 1,
    is_recommended: true,
    reason: '',
  },
  checkpoints: [0, 1, 2].map((index) => ({
    index,
    mile: index * 69.1,
    lat: 0,
    lon: index,
    eta: new Date(Date.parse(START) + index * 3_600_000).toISOString(),
    weather: null,
    risk: null,
    risk_level: index === 1 ? 2 : index === 2 ? null : 0,
    drivers: [],
    load_override_applied: false,
    owned_miles: 69.1,
  })),
};

describe('tripTrack', () => {
  const track = buildTripTrack(ROUTE, START);

  it('starts at the origin and ends at the destination', () => {
    expect(positionAtHour(track, 0)).toMatchObject({ lngLat: [0, 0], mile: 0, status: 'driving' });
    const end = positionAtHour(track, 5);
    expect(end.status).toBe('arrived');
    expect(end.lngLat[0]).toBeCloseTo(2);
    expect(end.progress).toBeCloseTo(1);
  });

  it('interpolates along the road by the checkpoint ETAs', () => {
    const halfway = positionAtHour(track, 1.5);
    expect(halfway.mile).toBeCloseTo(103.65);
    expect(halfway.lngLat[0]).toBeCloseTo(1.5);
    expect(halfway.progress).toBeCloseTo(0.75);
    expect(halfway.bearing).toBeCloseTo(90);
  });

  it('reports the risk of the checkpoint owning that stretch', () => {
    expect(positionAtHour(track, 0.2).riskLevel).toBe(0);
    expect(positionAtHour(track, 0.8)).toMatchObject({ riskLevel: 2, checkpointIndex: 1 });
    expect(positionAtHour(track, 1.9).riskLevel).toBe(-1);
  });

  it('waits at the origin until the departure time', () => {
    const late = buildTripTrack(ROUTE, '2026-11-01T04:00:00Z');
    expect(positionAtHour(late, 0.5)).toMatchObject({ status: 'waiting', mile: 0 });
  });

  it('builds an hourly risk timeline that is null off the road', () => {
    expect(riskTimeline(track, 3)).toEqual([0, 2, null, null]);
  });

  it('stays on real route geometry for a full plan', () => {
    const route = samplePlan.routes[0];
    if (!route) throw new Error('sample plan has no routes');
    const real = buildTripTrack(route, samplePlan.heatmap.start_time);
    const mid = positionAtHour(real, 10);
    expect(mid.status).toBe('driving');
    expect(mid.mile).toBeGreaterThan(0);
    expect(mid.mile).toBeLessThan(route.summary.distance_mi);
    expect(mid.progress).toBeGreaterThan(0);
    expect(mid.progress).toBeLessThan(1);
  });
});
