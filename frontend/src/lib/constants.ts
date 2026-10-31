/** Business limits mirror the backend's validation. */

const PRODUCTION_API_BASE_URL = 'https://weather-aware-truck-routing-5xyz.onrender.com/api';
const LOCAL_API_BASE_URL = 'http://localhost:8000/api';

/** VITE_API_BASE_URL wins; otherwise production builds use the hosted API. */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.PROD ? PRODUCTION_API_BASE_URL : LOCAL_API_BASE_URL);
export const MAP_STYLE_URL: string =
  import.meta.env.VITE_MAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/positron';
export const MAP_DARK_STYLE_URL: string =
  import.meta.env.VITE_MAP_DARK_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/dark';
/** Point at any image in /public to swap the avatar. */
export const DRIVER_AVATAR_URL: string = import.meta.env.VITE_DRIVER_AVATAR_URL ?? '/driver.svg';

export const CHECKPOINT_INTERVALS_MI = [10, 25, 50] as const;
export type CheckpointIntervalMi = (typeof CHECKPOINT_INTERVALS_MI)[number];
export const DEFAULT_INTERVAL_MI: CheckpointIntervalMi = 25;

export const MIN_LOAD_LB = 1;
export const MAX_LOAD_LB = 80_000;
export const DEFAULT_LOAD_LB = 40_000;
/** Above these loads, strong wind raises the risk. */
export const SEVERE_WIND_LOAD_LB = 40_000;
export const NO_TRAVEL_WIND_LOAD_LB = 30_000;
export const MAX_DEPARTURE_LOOKAHEAD_DAYS = 5;
export const MIN_TRIP_DISTANCE_MI = 1;

export const GEOCODE_MIN_CHARS = 3;
export const GEOCODE_DEBOUNCE_MS = 300;
export const GEOCODE_RESULT_COUNT = 5;

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

export const REQUEST_TIMEOUT_MS = 60 * MS_PER_SECOND;
/** Free hosting sleeps when idle; after this long we explain the wait. */
export const COLD_START_NOTICE_MS = 8 * MS_PER_SECOND;

export const MAX_FORECAST_HOUR = 48;
export const FORECAST_PLAY_STEP_MS = 400;

/** Must match the backend's ALL_BLOCKED_WARNING so the banner and warnings don't repeat it. */
export const ALL_BLOCKED_MESSAGE =
  'Every route has a No Travel segment. Delay or reconsider this trip.';

/** Cool hues that never clash with the risk palette. */
export const ROUTE_COLORS: Readonly<Record<string, string>> = {
  'route-1': '#2563eb',
  'route-2': '#7c3aed',
  'route-3': '#0891b2',
};
export const FALLBACK_ROUTE_COLOR = '#475569';

export const routeColor = (routeId: string): string =>
  ROUTE_COLORS[routeId] ?? FALLBACK_ROUTE_COLOR;

export const US_VIEW = { longitude: -98.5, latitude: 39.5, zoom: 3.4 } as const;
/** Keeps routes clear of the legend, slider and zoom buttons. */
export const FIT_BOUNDS_PADDING = { top: 72, bottom: 210, left: 230, right: 140 } as const;
export const FIT_BOUNDS_PADDING_COMPACT = { top: 84, bottom: 36, left: 36, right: 88 } as const;
export const FIT_BOUNDS_DURATION_MS = 600;
