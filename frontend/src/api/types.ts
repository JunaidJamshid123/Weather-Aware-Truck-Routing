/** Inferred from the zod schemas, so they can't drift from what is validated. */
import type { z } from 'zod';

import type {
  checkpointSchema,
  heatmapPointSchema,
  heatmapSchema,
  locationSchema,
  planSchema,
  routeSchema,
  routeSummarySchema,
  weatherSchema,
} from './schemas';

export type Location = z.infer<typeof locationSchema>;
export type Weather = z.infer<typeof weatherSchema>;
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type RouteSummary = z.infer<typeof routeSummarySchema>;
export type Route = z.infer<typeof routeSchema>;
export type HeatmapPoint = z.infer<typeof heatmapPointSchema>;
export type Heatmap = z.infer<typeof heatmapSchema>;
export type Plan = z.infer<typeof planSchema>;

export type PlanRequest = {
  origin: Location;
  destination: Location;
  /** UTC ISO 8601 with a Z suffix. */
  departure_time: string;
  load_weight_lb: number;
  checkpoint_interval_mi: number;
};

/** From a 400 response, keyed by request field name. */
export type FieldErrors = Readonly<Record<string, readonly string[]>>;
