/** The only place UTC becomes local time; `timeZone` params keep tests deterministic. */
import { MS_PER_HOUR } from './constants';

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

export function formatMiles(miles: number): string {
  return `${miles.toLocaleString('en-US', { maximumFractionDigits: 1 })} mi`;
}

export function formatMileMarker(mile: number): string {
  return `Mile ${mile.toLocaleString('en-US', { maximumFractionDigits: 1 })}`;
}

/** "13 h 5 min", "45 min" or "< 1 min". */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / SECONDS_PER_MINUTE);
  if (totalMinutes < 1) return '< 1 min';
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

/** "Tue, Nov 3, 4:00 PM CST" */
export function formatDateTime(iso: string | Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(new Date(iso));
}

/** "Tue 4:00 PM" */
export function formatWeekdayTime(iso: string | Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')} ${part('hour')}:${part('minute')} ${part('dayPeriod')}`;
}

export function formatAverageRisk(averageRisk: number | null): string {
  return averageRisk === null ? 'Unknown' : `${averageRisk.toFixed(2)} / 4`;
}

export const formatWindMph = (mph: number): string => `${mph.toFixed(1)} mph`;
export const formatPrecipitation = (inchesPerHour: number): string =>
  `${inchesPerHour.toFixed(2)} in/hr`;

export const addHours = (iso: string, hours: number): Date =>
  new Date(new Date(iso).getTime() + hours * MS_PER_HOUR);

/** Default departure time. */
export function nextFullHour(now: Date): Date {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setTime(next.getTime() + MS_PER_HOUR);
  return next;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** Local `datetime-local` value, e.g. "2026-11-02T14:00". */
export function toDateTimeLocalValue(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** UTC ISO string without milliseconds. */
export function localInputToUtcIso(value: string): string {
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
