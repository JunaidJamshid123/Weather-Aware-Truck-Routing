import { useMemo } from 'react';
import { Popup } from 'react-map-gl/maplibre';

import type { Plan } from '../../api/types';
import {
  formatDateTime,
  formatMileMarker,
  formatPrecipitation,
  formatWindMph,
} from '../../lib/format';
import { useUiStore } from '../../store/uiStore';
import { RiskBadge } from '../results/RiskBadge';
import { findCheckpoint } from './geojson';

const POPUP_OFFSET_PX = 12;

/** A single popup for the whole map, driven by the store. */
export function CheckpointPopup({ plan }: { plan: Plan }) {
  const activeCheckpoint = useUiStore((state) => state.activeCheckpoint);
  const closeCheckpoint = useUiStore((state) => state.closeCheckpoint);
  const found = useMemo(
    () => (activeCheckpoint ? findCheckpoint(plan, activeCheckpoint) : null),
    [plan, activeCheckpoint],
  );
  if (!found) return null;
  const { route, checkpoint } = found;
  const { weather } = checkpoint;

  return (
    <Popup
      longitude={checkpoint.lon}
      latitude={checkpoint.lat}
      anchor="bottom"
      offset={POPUP_OFFSET_PX}
      closeOnClick={false}
      onClose={closeCheckpoint}
      maxWidth="280px"
    >
      <div className="w-60 text-ink">
        <p className="pr-6 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
          {route.label} · {formatMileMarker(checkpoint.mile)}
        </p>
        <p className="mt-1 text-[15px] leading-snug font-extrabold">
          ETA {formatDateTime(checkpoint.eta)}
        </p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500">Forecast at your arrival time</span>
          <RiskBadge risk={checkpoint.risk} size="sm" />
        </div>
        {weather ? (
          <dl className="mt-2.5 grid grid-cols-3 gap-1.5 text-xs">
            <Reading label="Wind" value={formatWindMph(weather.wind_mph)} />
            <Reading label="Rain" value={formatPrecipitation(weather.rain_in_hr)} />
            <Reading label="Snow" value={formatPrecipitation(weather.snow_in_hr)} />
          </dl>
        ) : (
          <p className="mt-2.5 rounded-lg bg-mist px-2.5 py-2 text-xs text-ink-soft">
            No forecast is available for this time and place.
          </p>
        )}
        {checkpoint.load_override_applied && (
          <p className="mt-2 rounded-lg bg-coral-50 px-2.5 py-1.5 text-xs font-semibold text-coral-600">
            Heavy load: risk raised by wind
          </p>
        )}
      </div>
    </Popup>
  );
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-mist px-2 py-1.5">
      <dt className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-0.5 font-bold whitespace-nowrap tabular-nums">{value}</dd>
    </div>
  );
}
