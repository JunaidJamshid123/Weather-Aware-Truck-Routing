/** Every failure, including contract drift, becomes an ApiError with a user-safe message. */
import type { z } from 'zod';

import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../lib/constants';
import { errorBodySchema } from './schemas';
import type { FieldErrors } from './types';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: FieldErrors;

  constructor(code: string, message: string, status = 0, details: FieldErrors = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

// Tells our timeout apart from the caller cancelling a superseded request.
const TIMEOUT_REASON = Symbol('request-timeout');

export const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function apiRequest<T>(
  path: string,
  schema: z.ZodType<T>,
  { method = 'GET', body, signal, timeoutMs = REQUEST_TIMEOUT_MS }: RequestOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(TIMEOUT_REASON);
  }, timeoutMs);
  const forwardAbort = (): void => {
    controller.abort();
  };
  signal?.addEventListener('abort', forwardAbort, { once: true });
  if (signal?.aborted) controller.abort();

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await readJson(response);
    if (!response.ok) throw toApiError(response.status, payload);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError(
        'invalid_response',
        'The server sent data this app does not understand. Please try again later.',
        response.status,
        { response: parsed.error.issues.slice(0, 5).map((issue) => issue.path.join('.')) },
      );
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.reason === TIMEOUT_REASON) {
      throw new ApiError('timeout', 'The server took too long to respond. Please try again.');
    }
    if (isAbortError(error) || signal?.aborted) throw error;
    throw new ApiError(
      'network_error',
      "Can't reach the server. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function toApiError(status: number, payload: unknown): ApiError {
  const parsed = errorBodySchema.safeParse(payload);
  if (!parsed.success) {
    return new ApiError('http_error', `The server answered with an error (${status}).`, status);
  }
  const { code, message, details } = parsed.data.error;
  return new ApiError(code, message, status, normalizeDetails(details));
}

/** Keeps only `field: string[]` entries, the shape the form understands. */
function normalizeDetails(details: Record<string, unknown> | null | undefined): FieldErrors {
  const fields: Record<string, string[]> = {};
  for (const [field, value] of Object.entries(details ?? {})) {
    const messages = (Array.isArray(value) ? value : [value]).filter(
      (item): item is string => typeof item === 'string',
    );
    if (messages.length > 0) fields[field] = messages;
  }
  return fields;
}
