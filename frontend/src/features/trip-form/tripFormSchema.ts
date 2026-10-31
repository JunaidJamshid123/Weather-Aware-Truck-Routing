/** Mirrors the backend's rules so most mistakes are caught before a request. */
import { z } from 'zod';

import { locationSchema } from '../../api/schemas';
import type { FieldErrors, Location, PlanRequest } from '../../api/types';
import type { CheckpointIntervalMi } from '../../lib/constants';
import {
  DEFAULT_INTERVAL_MI,
  DEFAULT_LOAD_LB,
  MAX_DEPARTURE_LOOKAHEAD_DAYS,
  MAX_LOAD_LB,
  MIN_LOAD_LB,
  MIN_TRIP_DISTANCE_MI,
  MS_PER_DAY,
} from '../../lib/constants';
import { localInputToUtcIso, nextFullHour, toDateTimeLocalValue } from '../../lib/format';
import { haversineMi } from '../../lib/geo';

const pickedLocation = (message: string) =>
  locationSchema.nullable().refine((value): value is Location => value !== null, { message });

const startOfUtcHour = (now: Date): Date => {
  const start = new Date(now);
  start.setUTCMinutes(0, 0, 0);
  return start;
};

const latestDeparture = (now: Date): Date =>
  new Date(now.getTime() + MAX_DEPARTURE_LOOKAHEAD_DAYS * MS_PER_DAY);

/** `now` is a function so the rules stay correct however long the page stays open. */
export function buildTripFormSchema(now: () => Date = () => new Date()) {
  return z
    .object({
      origin: pickedLocation('Choose a starting point from the suggestions.'),
      destination: pickedLocation('Choose a destination from the suggestions.'),
      departure: z
        .string()
        .min(1, 'Choose a departure date and time.')
        .superRefine((value, ctx) => {
          if (value === '') return; // Already reported as missing.
          const departure = new Date(value);
          const current = now();
          if (Number.isNaN(departure.getTime())) {
            ctx.addIssue({ code: 'custom', message: 'Enter a valid date and time.' });
          } else if (departure < startOfUtcHour(current)) {
            ctx.addIssue({ code: 'custom', message: 'Departure cannot be in the past.' });
          } else if (departure > latestDeparture(current)) {
            ctx.addIssue({
              code: 'custom',
              message: `Departure must be within the next ${MAX_DEPARTURE_LOOKAHEAD_DAYS} days (forecast range).`,
            });
          }
        }),
      loadWeightLb: z
        .number({ invalid_type_error: 'Enter the load weight in pounds.' })
        .int('Use whole pounds.')
        .min(MIN_LOAD_LB, 'Load must be at least 1 lb.')
        .max(MAX_LOAD_LB, 'Load cannot exceed 80,000 lb (federal gross limit).'),
      intervalMi: z.union([z.literal(10), z.literal(25), z.literal(50)]),
    })
    .superRefine((values, ctx) => {
      // Zod still runs this when a field refinement failed, so a location may be null here.
      const { origin, destination } = values as {
        origin: Location | null;
        destination: Location | null;
      };
      if (origin && destination && haversineMi(origin, destination) < MIN_TRIP_DISTANCE_MI) {
        ctx.addIssue({
          code: 'custom',
          path: ['destination'],
          message: 'Origin and destination must be at least 1 mile apart.',
        });
      }
    });
}

type TripFormSchema = ReturnType<typeof buildTripFormSchema>;
export type TripFormInput = z.input<TripFormSchema>;
export type TripFormValues = z.output<TripFormSchema>;

export function defaultTripFormValues(now: Date): TripFormInput {
  return {
    origin: null,
    destination: null,
    departure: toDateTimeLocalValue(nextFullHour(now)),
    loadWeightLb: DEFAULT_LOAD_LB,
    intervalMi: DEFAULT_INTERVAL_MI satisfies CheckpointIntervalMi,
  };
}

/** Lets the native picker steer away from bad values. */
export function departureInputBounds(now: Date): { min: string; max: string } {
  const startOfLocalHour = new Date(now);
  startOfLocalHour.setMinutes(0, 0, 0);
  return {
    min: toDateTimeLocalValue(startOfLocalHour),
    max: toDateTimeLocalValue(latestDeparture(now)),
  };
}

export function toPlanRequest(values: TripFormValues): PlanRequest {
  return {
    origin: values.origin,
    destination: values.destination,
    departure_time: localInputToUtcIso(values.departure),
    load_weight_lb: values.loadWeightLb,
    checkpoint_interval_mi: values.intervalMi,
  };
}

type TripFormField = keyof TripFormInput;

const SERVER_FIELDS: Readonly<Record<string, TripFormField>> = {
  origin: 'origin',
  destination: 'destination',
  departure_time: 'departure',
  load_weight_lb: 'loadWeightLb',
  checkpoint_interval_mi: 'intervalMi',
};

/** Nested keys such as "origin.lat" map to their root field. */
export function serverFieldErrors(details: FieldErrors): [TripFormField, string][] {
  return Object.entries(details).flatMap(([key, messages]) => {
    const field = SERVER_FIELDS[key.split('.')[0] ?? key];
    const message = messages[0];
    return field && message ? [[field, message] as [TripFormField, string]] : [];
  });
}
