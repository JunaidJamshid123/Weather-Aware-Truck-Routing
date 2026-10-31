/** Every response is parsed here, so contract drift fails loudly at the boundary. */
import { z } from 'zod';

import { RISK_NAMES } from '../lib/risk';

const isoUtc = z.string().datetime();
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const miles = z.number().nonnegative();
const riskLevel = z.number().int().min(0).max(4);

export const riskNameSchema = z.enum(RISK_NAMES);

export const locationSchema = z.object({
  label: z.string().min(1),
  lat: latitude,
  lon: longitude,
});

export const geocodeResponseSchema = z.object({ results: z.array(locationSchema) });

export const weatherSchema = z.object({
  wind_mph: z.number(),
  rain_in_hr: z.number(),
  snow_in_hr: z.number(),
});

export const checkpointSchema = z.object({
  index: z.number().int().nonnegative(),
  mile: miles,
  lat: latitude,
  lon: longitude,
  eta: isoUtc,
  weather: weatherSchema.nullable(),
  risk: riskNameSchema.nullable(),
  risk_level: riskLevel.nullable(),
  drivers: z.array(z.string()),
  load_override_applied: z.boolean(),
  owned_miles: miles,
});

export const routeSummarySchema = z.object({
  distance_mi: miles,
  duration_s: z.number().nonnegative(),
  arrival_time: isoUtc,
  severe_miles: miles,
  high_miles: miles,
  moderate_miles: miles,
  no_travel_miles: miles,
  unknown_miles: miles,
  avg_risk: z.number().min(0).max(4).nullable(),
  max_risk: riskNameSchema.nullable(),
  blocked: z.boolean(),
  rank: z.number().int().positive(),
  is_recommended: z.boolean(),
  reason: z.string(),
});

export const routeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  geometry: z.array(z.tuple([longitude, latitude])).min(2),
  summary: routeSummarySchema,
  checkpoints: z.array(checkpointSchema).min(1),
});

export const heatmapPointSchema = z.object({
  lat: latitude,
  lon: longitude,
  risk: z.array(z.number().int().min(-1).max(4)),
});

export const heatmapSchema = z.object({
  start_time: isoUtc,
  hours: z.number().int().positive(),
  points: z.array(heatmapPointSchema),
});

export const planSchema = z.object({
  departure_time: isoUtc,
  checkpoint_interval_mi: z.number().int().positive(),
  load_weight_lb: z.number().int().positive(),
  recommended_route_id: z.string().min(1),
  all_blocked: z.boolean(),
  warnings: z.array(z.string()),
  routes: z.array(routeSchema).min(1),
  heatmap: heatmapSchema,
});

export const errorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).nullish(),
  }),
});
