import type { CSSProperties } from 'react';
import { useMemo } from 'react';

import type { Heatmap, Route } from '../../api/types';
import { CrosshairIcon } from '../../components/icons';
import { DRIVER_AVATAR_URL, MAX_FORECAST_HOUR } from '../../lib/constants';
import { addHours, formatDateTime, formatMiles, formatWeekdayTime } from '../../lib/format';
import { riskMetaForLevel, UNKNOWN_RISK_COLOR } from '../../lib/risk';
import { useUiStore } from '../../store/uiStore';
import type { TripTrack } from '../driver/tripTrack';
import { buildTripTrack, positionAtHour, riskTimeline } from '../driver/tripTrack';
import { useForecastHour } from './useForecastHour';
import { useForecastPlayback } from './useForecastPlayback';

// A CSS variable so off-road hours stay quiet in both themes.
const OFF_ROAD_COLOR = 'var(--color-slate-200)';

/** Scrubs the heatmap 0–48 h after departure; purely local, never hits the network. */
export function ForecastSlider({
  heatmap,
  route = null,
}: {
  heatmap: Heatmap;
  route?: Route | null;
}) {
  const { hour, setHour } = useForecastHour();
  const maxHour = Math.min(MAX_FORECAST_HOUR, heatmap.hours - 1);
  const { isPlaying, toggle, pause } = useForecastPlayback(maxHour);
  const time = addHours(heatmap.start_time, hour);
  const shortTime = formatWeekdayTime(time);
  const track = useMemo(
    () => (route ? buildTripTrack(route, heatmap.start_time) : null),
    [route, heatmap.start_time],
  );

  return (
    <section
      aria-label="Forecast timeline"
      className="relative shrink-0 border-t border-slate-200/80 bg-surface px-4 py-3 sm:absolute sm:right-16 sm:bottom-6 sm:left-1/2 sm:w-[min(38rem,calc(100%-8rem))] sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-white/70 sm:bg-surface/90 dark:sm:border-slate-200/70 sm:shadow-float sm:backdrop-blur-md"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="truncate text-xs text-slate-500">
          Weather risk map for <span className="font-bold text-ink">{formatDateTime(time)}</span>
        </p>
        <output className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 tabular-nums">
          +{hour}h · {shortTime}
        </output>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={isPlaying}
          aria-label={isPlaying ? 'Pause forecast animation' : 'Play forecast animation'}
          className="btn-icon"
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="min-w-0 flex-1">
          {track && <JourneyRibbon track={track} maxHour={maxHour} />}
          <input
            type="range"
            min={0}
            max={maxHour}
            step={1}
            value={hour}
            onPointerDown={pause}
            onChange={(event) => {
              pause();
              setHour(Number(event.target.value));
            }}
            aria-label="Forecast hour after departure"
            aria-valuetext={`+${hour} hours, ${shortTime}`}
            className="forecast-range w-full"
            style={{ '--fill': `${(hour / Math.max(1, maxHour)) * 100}%` } as CSSProperties}
          />
          <div
            className="mt-0.5 flex justify-between text-[10px] font-semibold tracking-wide text-slate-400 uppercase"
            aria-hidden
          >
            <span>Departure</span>
            <span>+{Math.round(maxHour / 2)}h</span>
            <span>+{maxHour}h</span>
          </div>
        </div>
      </div>
      {track && route && <DriverStatus track={track} route={route} hour={hour} />}
    </section>
  );
}

/** Hourly risk at the driver's position; grey is off the road, the coral tick is arrival. */
function JourneyRibbon({ track, maxHour }: { track: TripTrack; maxHour: number }) {
  const timeline = useMemo(() => riskTimeline(track, maxHour).slice(0, maxHour), [track, maxHour]);
  const arrivalPercent = (Math.max(0, track.arrivalHour) / maxHour) * 100;

  return (
    <div aria-hidden className="relative mx-[9px] mb-1" title="Risk on your route, hour by hour">
      <div className="flex h-1.5 overflow-hidden rounded-full">
        {timeline.map((level, hourIndex) => (
          <span
            key={hourIndex}
            className="flex-1"
            style={{
              backgroundColor:
                level === null
                  ? OFF_ROAD_COLOR
                  : (riskMetaForLevel(level < 0 ? null : level)?.color ?? UNKNOWN_RISK_COLOR),
            }}
          />
        ))}
      </div>
      {arrivalPercent <= 100 && (
        <span
          className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full bg-coral-500 ring-2 ring-white"
          style={{ left: `${arrivalPercent}%` }}
        />
      )}
    </div>
  );
}

function DriverStatus({ track, route, hour }: { track: TripTrack; route: Route; hour: number }) {
  const isFollowing = useUiStore((state) => state.isFollowingDriver);
  const setFollowing = useUiStore((state) => state.setFollowingDriver);
  const position = positionAtHour(track, hour);
  const meta =
    position.status === 'driving'
      ? riskMetaForLevel(position.riskLevel < 0 ? null : position.riskLevel)
      : null;
  const percent = Math.round((position.mile / Math.max(1, track.distanceMi)) * 100);

  let detail;
  if (position.status === 'waiting') detail = 'Waiting to depart';
  else if (position.status === 'arrived') {
    detail = `Arrived ${formatWeekdayTime(route.summary.arrival_time)}`;
  } else {
    detail = (
      <>
        {formatMiles(Math.round(position.mile))} of {formatMiles(Math.round(track.distanceMi))}
        {' · '}
        <span className="font-semibold" style={{ color: meta?.color ?? UNKNOWN_RISK_COLOR }}>
          {meta ? `${meta.label} risk` : 'No forecast'}
        </span>
      </>
    );
  }

  return (
    <div className="mt-2.5 flex items-center gap-3 border-t border-slate-200/70 pt-2.5">
      <img
        src={DRIVER_AVATAR_URL}
        alt=""
        className="size-7 shrink-0 rounded-full border-2 border-surface"
        style={{ boxShadow: `0 0 0 2px ${meta?.color ?? OFF_ROAD_COLOR}` }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-slate-500">
          <span className="font-bold text-ink">{route.label}</span> · {detail}
        </p>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200/80" aria-hidden>
          <div
            className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setFollowing(!isFollowing);
        }}
        aria-pressed={isFollowing}
        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition-colors focus-visible:ring-4 focus-visible:ring-brand-600/25 focus-visible:outline-none ${
          isFollowing
            ? 'border-brand-600 bg-brand-600 text-white shadow-brand'
            : 'border-slate-200 bg-surface text-ink-soft hover:border-brand-600/40 hover:text-brand-700'
        }`}
      >
        <CrosshairIcon className="size-3.5" />
        {isFollowing ? 'Following' : 'Follow driver'}
      </button>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <path d="M4 2.5v11l9-5.5z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor" />
    </svg>
  );
}
