import { z } from 'zod';

import { apiRequest } from './client';

const healthSchema = z.object({ status: z.literal('ok') });

/** Also wakes a sleeping free-tier backend before the first real request. */
export function pingHealth(timeoutMs: number): Promise<unknown> {
  return apiRequest('/health', healthSchema, { timeoutMs });
}
