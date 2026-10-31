/**
 * Truck position by forecast hour, precomputed per route so each frame is two binary searches.
 * Time maps to mile via checkpoint ETAs, so the risk "here" is exactly the risk the driver meets.
 */
import type { Route } from '../../api/types';
import { haversineMi } from '../../lib/geo';
import { MS_PER_HOUR } from '../../lib/constants';
import { UNKNOWN_RISK_LEVEL } from '../../lib/risk';

export type TripStatus = 'waiting' | 'driving' | 'arrived';

export type TripTrack = {
  routeId: string;
  coordinates: readonly (readonly [number, number])[];
  /** Great-circle miles at each vertex. */
  cumulativeMi: readonly number[];
  /** Normalised Mercator length at each vertex, matching MapLibre's line-progress. */
  progressAt: readonly number[];
  /** Sorted by mile; hours are relative to the trip start. */
  checkpointHours: readonly number[];
  checkpointMiles: readonly number[];
  checkpointIndexes: readonly number[];
  checkpointRisk: readonly number[];
  distanceMi: number;
  departureHour: number;
  arrivalHour: number;
};

export type TrackPosition = {
  lngLat: [number, number];
  mile: number;
  /** Line-progress (0–1) for the trail gradient. */
  progress: number;
  /** Degrees clockwise from screen-up, measured in Mercator space as the map draws it. */
  bearing: number;
  status: TripStatus;
  /** The checkpoint whose stretch of road the truck is on. */
  checkpointIndex: number;
  /** -1 when there is no forecast. */
  riskLevel: number;
};

const DEGREES_TO_RADIANS = Math.PI / 180;
// Fallback for out-of-range reads; the index clamps make it unreachable.
const ORIGIN = [0, 0] as const;

/** Unscaled Web Mercator, enough for lengths and bearings. */
function mercator([lon, lat]: readonly [number, number]): [number, number] {
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * DEGREES_TO_RADIANS) / 2));
  return [lon * DEGREES_TO_RADIANS, y];
}

const hoursBetween = (fromMs: number, iso: string): number =>
  (Date.parse(iso) - fromMs) / MS_PER_HOUR;

export function buildTripTrack(route: Route, startTime: string): TripTrack {
  const startMs = Date.parse(startTime);
  const coordinates = route.geometry;

  const cumulativeMi = [0];
  const mercatorLength = [0];
  for (let i = 1; i < coordinates.length; i += 1) {
    const [lon0, lat0] = coordinates[i - 1] ?? ORIGIN;
    const [lon1, lat1] = coordinates[i] ?? ORIGIN;
    cumulativeMi.push(
      (cumulativeMi[i - 1] ?? 0) + haversineMi({ lat: lat0, lon: lon0 }, { lat: lat1, lon: lon1 }),
    );
    const [x0, y0] = mercator([lon0, lat0]);
    const [x1, y1] = mercator([lon1, lat1]);
    mercatorLength.push((mercatorLength[i - 1] ?? 0) + Math.hypot(x1 - x0, y1 - y0));
  }
  const totalMercator = mercatorLength.at(-1) ?? 0;

  const checkpoints = [...route.checkpoints].sort((a, b) => a.mile - b.mile);
  return {
    routeId: route.id,
    coordinates,
    cumulativeMi,
    progressAt: mercatorLength.map((length) => (totalMercator > 0 ? length / totalMercator : 0)),
    checkpointHours: checkpoints.map((checkpoint) => hoursBetween(startMs, checkpoint.eta)),
    checkpointMiles: checkpoints.map((checkpoint) => checkpoint.mile),
    checkpointIndexes: checkpoints.map((checkpoint) => checkpoint.index),
    checkpointRisk: checkpoints.map((checkpoint) => checkpoint.risk_level ?? UNKNOWN_RISK_LEVEL),
    distanceMi: route.summary.distance_mi,
    departureHour: checkpoints[0] ? hoursBetween(startMs, checkpoints[0].eta) : 0,
    arrivalHour: hoursBetween(startMs, route.summary.arrival_time),
  };
}

/** Largest i with values[i] <= target (0 when target is below the first value). */
function floorIndex(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((values[mid] ?? Infinity) <= target) low = mid;
    else high = mid - 1;
  }
  return low;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const fraction = (from: number, to: number, value: number): number =>
  to > from ? Math.min(1, Math.max(0, (value - from) / (to - from))) : 0;

function mileAtHour(track: TripTrack, hour: number): number {
  const { checkpointHours: hours, checkpointMiles: miles } = track;
  if (hour <= (hours[0] ?? 0)) return miles[0] ?? 0;
  const i = floorIndex(hours, hour);
  if (i >= hours.length - 1) return track.distanceMi;
  return lerp(miles[i] ?? 0, miles[i + 1] ?? 0, fraction(hours[i] ?? 0, hours[i + 1] ?? 0, hour));
}

/** Nearest checkpoint to `mile` along the route. */
function nearestCheckpoint(track: TripTrack, mile: number): number {
  const miles = track.checkpointMiles;
  const i = floorIndex(miles, mile);
  const next = Math.min(i + 1, miles.length - 1);
  return Math.abs((miles[next] ?? 0) - mile) < Math.abs(mile - (miles[i] ?? 0)) ? next : i;
}

// Heading spans this many miles either side so road wiggles don't jitter it.
const HEADING_SPAN_MI = 4;

type PointOnLine = { lngLat: [number, number]; progress: number };

function pointAtMile(track: TripTrack, mile: number): PointOnLine {
  // The backend's miles and our great-circle sum differ slightly; scale to match.
  const totalMi = track.cumulativeMi.at(-1) ?? 0;
  const clamped = Math.min(track.distanceMi, Math.max(0, mile));
  const targetMi = track.distanceMi > 0 ? (clamped / track.distanceMi) * totalMi : 0;
  const i = Math.min(floorIndex(track.cumulativeMi, targetMi), track.coordinates.length - 2);
  const t = fraction(track.cumulativeMi[i] ?? 0, track.cumulativeMi[i + 1] ?? 0, targetMi);
  const from = track.coordinates[i] ?? ORIGIN;
  const to = track.coordinates[i + 1] ?? ORIGIN;
  return {
    lngLat: [lerp(from[0], to[0], t), lerp(from[1], to[1], t)],
    progress: lerp(track.progressAt[i] ?? 0, track.progressAt[i + 1] ?? 0, t),
  };
}

function screenBearing(a: readonly [number, number], b: readonly [number, number]): number {
  const [x0, y0] = mercator(a);
  const [x1, y1] = mercator(b);
  return (Math.atan2(x1 - x0, y1 - y0) / DEGREES_TO_RADIANS + 360) % 360;
}

export function positionAtHour(track: TripTrack, hour: number): TrackPosition {
  const status: TripStatus =
    hour < track.departureHour ? 'waiting' : hour >= track.arrivalHour ? 'arrived' : 'driving';
  const mile = mileAtHour(track, hour);
  const point = pointAtMile(track, mile);
  const behind = pointAtMile(
    track,
    Math.min(mile, track.distanceMi - HEADING_SPAN_MI) - HEADING_SPAN_MI,
  );
  const ahead = pointAtMile(track, Math.max(mile, HEADING_SPAN_MI) + HEADING_SPAN_MI);
  const checkpoint = nearestCheckpoint(track, mile);

  return {
    ...point,
    mile,
    bearing: screenBearing(behind.lngLat, ahead.lngLat),
    status,
    checkpointIndex: track.checkpointIndexes[checkpoint] ?? 0,
    riskLevel: track.checkpointRisk[checkpoint] ?? UNKNOWN_RISK_LEVEL,
  };
}

/** Risk per whole hour, or null while not on the road. */
export function riskTimeline(track: TripTrack, maxHour: number): (number | null)[] {
  return Array.from({ length: maxHour + 1 }, (_, hour) => {
    const position = positionAtHour(track, hour);
    return position.status === 'driving' ? position.riskLevel : null;
  });
}
