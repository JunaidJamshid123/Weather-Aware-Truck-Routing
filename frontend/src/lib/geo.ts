/** Minimal geodesy for form validation only; all route math lives in the backend. */

const EARTH_RADIUS_MI = 3958.7613;
const DEGREES_TO_RADIANS = Math.PI / 180;

export type LatLon = { lat: number; lon: number };

/** Great-circle distance in miles. */
export function haversineMi(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEGREES_TO_RADIANS;
  const dLon = (b.lon - a.lon) * DEGREES_TO_RADIANS;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEGREES_TO_RADIANS) *
      Math.cos(b.lat * DEGREES_TO_RADIANS) *
      Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h));
}
