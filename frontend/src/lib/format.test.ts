import {
  addHours,
  formatAverageRisk,
  formatDateTime,
  formatDuration,
  formatMileMarker,
  formatMiles,
  formatPrecipitation,
  formatWeekdayTime,
  formatWindMph,
  localInputToUtcIso,
  nextFullHour,
  toDateTimeLocalValue,
} from './format';

describe('formatMiles', () => {
  it.each([
    [0, '0 mi'],
    [12.34, '12.3 mi'],
    [1656.4, '1,656.4 mi'],
    [25, '25 mi'],
  ])('%s → %s', (miles, expected) => {
    expect(formatMiles(miles)).toBe(expected);
  });

  it('formats mile markers', () => {
    expect(formatMileMarker(125.44)).toBe('Mile 125.4');
  });
});

describe('formatDuration', () => {
  it.each([
    [0, '< 1 min'],
    [29, '< 1 min'],
    [45 * 60, '45 min'],
    [3600, '1 h'],
    [68_177, '18 h 56 min'],
    [3599.6, '1 h'],
  ])('%s s → %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected);
  });
});

describe('local time formatting', () => {
  const iso = '2026-11-03T22:00:00Z';

  it('converts UTC to the given zone with its abbreviation', () => {
    expect(formatDateTime(iso, 'America/Chicago')).toBe('Tue, Nov 3, 4:00 PM CST');
    expect(formatDateTime(iso, 'America/Los_Angeles')).toBe('Tue, Nov 3, 2:00 PM PST');
  });

  it('handles DST: the same UTC hour reads differently before the November change', () => {
    expect(formatDateTime('2026-10-31T21:00:00Z', 'America/Chicago')).toBe(
      'Sat, Oct 31, 4:00 PM CDT',
    );
  });

  it('formats the compact slider time', () => {
    expect(formatWeekdayTime(iso, 'America/Chicago')).toBe('Tue 4:00 PM');
  });

  it('adds hours to an ISO instant', () => {
    expect(addHours(iso, 12).toISOString()).toBe('2026-11-04T10:00:00.000Z');
  });
});

describe('risk and weather values', () => {
  it('shows average risk on the 0–4 scale, or Unknown', () => {
    expect(formatAverageRisk(0.131)).toBe('0.13 / 4');
    expect(formatAverageRisk(null)).toBe('Unknown');
  });

  it('labels units', () => {
    expect(formatWindMph(12.05)).toBe('12.1 mph');
    expect(formatPrecipitation(0.1)).toBe('0.10 in/hr');
  });
});

describe('departure input helpers', () => {
  it('rounds up to the next full hour', () => {
    const next = nextFullHour(new Date(2026, 10, 2, 14, 25, 30));
    expect(next).toEqual(new Date(2026, 10, 2, 15, 0, 0, 0));
  });

  it('moves a full hour forward by one hour', () => {
    expect(nextFullHour(new Date(2026, 10, 2, 14, 0, 0))).toEqual(new Date(2026, 10, 2, 15));
  });

  it('round-trips a local datetime-local value to UTC ISO', () => {
    const local = new Date(2026, 10, 2, 9, 5);
    const value = toDateTimeLocalValue(local);
    expect(value).toBe('2026-11-02T09:05');
    expect(localInputToUtcIso(value)).toBe(local.toISOString().replace('.000Z', 'Z'));
    expect(localInputToUtcIso(value)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});
