import { pingHealth } from '../../api/health';
import type { SplashTask } from './useSplashProgress';

const BACKEND_WARMUP_TIMEOUT_MS = 6_000;

/** Real start-up work: preload the map and font, and wake a sleeping free-tier backend. */
export const SPLASH_TASKS: readonly SplashTask[] = [
  () => import('../map/MapView'),
  () => document.fonts.ready,
  () => pingHealth(BACKEND_WARMUP_TIMEOUT_MS),
];
