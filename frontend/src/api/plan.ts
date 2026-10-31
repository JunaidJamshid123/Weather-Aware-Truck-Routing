import { apiRequest } from './client';
import { planSchema } from './schemas';
import type { Plan, PlanRequest } from './types';

/** Up to three ranked routes with checkpoint risk and a 0–48 h heatmap. */
export function fetchPlan(request: PlanRequest, signal?: AbortSignal): Promise<Plan> {
  return apiRequest('/plan', planSchema, { method: 'POST', body: request, signal });
}
