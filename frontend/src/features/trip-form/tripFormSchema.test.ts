import type { TripFormInput } from './tripFormSchema';
import {
  buildTripFormSchema,
  defaultTripFormValues,
  departureInputBounds,
  serverFieldErrors,
  toPlanRequest,
} from './tripFormSchema';

const NOW = new Date('2026-11-02T14:20:00Z');
const schema = buildTripFormSchema(() => NOW);
const DALLAS = { label: 'Dallas, TX, USA', lat: 32.7767, lon: -96.797 };
const DENVER = { label: 'Denver, CO, USA', lat: 39.7392, lon: -104.9903 };

const valid = (overrides: Partial<TripFormInput> = {}): TripFormInput => ({
  origin: DALLAS,
  destination: DENVER,
  departure: localValue(new Date('2026-11-02T16:00:00Z')),
  loadWeightLb: 42_000,
  intervalMi: 25,
  ...overrides,
});

/** A datetime-local value for an instant, in the test runner's own zone. */
function localValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function errorsOf(input: TripFormInput): Record<string, string> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  return Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
  );
}

describe('tripFormSchema', () => {
  it('accepts a complete trip', () => {
    expect(schema.safeParse(valid()).success).toBe(true);
  });

  it('requires picked locations, not free text', () => {
    expect(errorsOf(valid({ origin: null, destination: null }))).toEqual({
      origin: 'Choose a starting point from the suggestions.',
      destination: 'Choose a destination from the suggestions.',
    });
  });

  it('rejects origin and destination less than a mile apart', () => {
    const nearby = { ...DALLAS, label: 'Downtown Dallas', lat: DALLAS.lat + 0.001 };
    expect(errorsOf(valid({ destination: nearby }))).toEqual({
      destination: 'Origin and destination must be at least 1 mile apart.',
    });
  });

  it('allows a departure earlier in the current hour, like the backend', () => {
    expect(errorsOf(valid({ departure: localValue(new Date('2026-11-02T14:00:00Z')) }))).toEqual(
      {},
    );
  });

  it('rejects past departures and those beyond the 5-day forecast range', () => {
    expect(errorsOf(valid({ departure: localValue(new Date('2026-11-02T13:59:00Z')) }))).toEqual({
      departure: 'Departure cannot be in the past.',
    });
    expect(errorsOf(valid({ departure: localValue(new Date('2026-11-07T14:21:00Z')) }))).toEqual({
      departure: 'Departure must be within the next 5 days (forecast range).',
    });
    expect(errorsOf(valid({ departure: '' }))).toEqual({
      departure: 'Choose a departure date and time.',
    });
  });

  it.each([
    [0, 'Load must be at least 1 lb.'],
    [80_001, 'Load cannot exceed 80,000 lb (federal gross limit).'],
    [1_000.5, 'Use whole pounds.'],
    [Number.NaN, 'Enter the load weight in pounds.'],
  ])('rejects load %s', (loadWeightLb, message) => {
    expect(errorsOf(valid({ loadWeightLb }))).toEqual({ loadWeightLb: message });
  });

  it('accepts the load limits themselves', () => {
    expect(schema.safeParse(valid({ loadWeightLb: 1 })).success).toBe(true);
    expect(schema.safeParse(valid({ loadWeightLb: 80_000 })).success).toBe(true);
  });
});

describe('form ↔ API mapping', () => {
  it('builds the backend request with a UTC departure and {label, lat, lon} locations', () => {
    const parsed = schema.parse(valid());
    expect(toPlanRequest(parsed)).toEqual({
      origin: DALLAS,
      destination: DENVER,
      departure_time: '2026-11-02T16:00:00Z',
      load_weight_lb: 42_000,
      checkpoint_interval_mi: 25,
    });
  });

  it('maps backend field errors onto form fields', () => {
    expect(
      serverFieldErrors({
        departure_time: ['Departure time cannot be in the past.'],
        'origin.lat': ['Ensure this value is less than or equal to 90.'],
        unknown_field: ['ignored'],
      }),
    ).toEqual([
      ['departure', 'Departure time cannot be in the past.'],
      ['origin', 'Ensure this value is less than or equal to 90.'],
    ]);
  });

  it('defaults to the next full hour, 25-mile checkpoints and no locations', () => {
    const defaults = defaultTripFormValues(new Date(2026, 10, 2, 9, 41));
    expect(defaults).toMatchObject({
      origin: null,
      destination: null,
      departure: '2026-11-02T10:00',
      intervalMi: 25,
    });
  });

  it('bounds the picker from the start of this hour to 5 days ahead', () => {
    expect(departureInputBounds(new Date(2026, 10, 2, 9, 41))).toEqual({
      min: '2026-11-02T09:00',
      max: '2026-11-07T09:41',
    });
  });
});
