import { Marker } from 'react-map-gl/maplibre';

import type { Route } from '../../api/types';
import { useCurrentEndpoints } from '../plan/planContext';

/** "Dallas, Texas, United States" → "Dallas". */
const shortName = (label: string): string => label.split(',')[0]?.trim() ?? label;

/** DOM markers rather than a layer, so they read as places, not data. */
export function EndpointMarkers({ route }: { route: Route }) {
  const endpoints = useCurrentEndpoints();
  const start = route.geometry[0];
  const end = route.geometry.at(-1);
  if (!start || !end) return null;

  return (
    <>
      <Marker longitude={start[0]} latitude={start[1]} anchor="center">
        <div className="relative" aria-hidden>
          <span className="block size-4 rounded-full border-[3px] border-white bg-brand-600 shadow-[0_0_0_4px_rgb(0_128_131/0.22),0_2px_6px_rgb(15_30_46/0.35)]" />
          <EndpointLabel kind="Start" name={endpoints ? shortName(endpoints.origin.label) : null} />
        </div>
      </Marker>
      <Marker longitude={end[0]} latitude={end[1]} anchor="bottom">
        <div className="relative pb-0.5" aria-hidden>
          <span className="flex size-7 rotate-45 items-center justify-center rounded-full rounded-br-none border-2 border-white bg-coral-500 shadow-[0_4px_10px_-2px_rgb(15_30_46/0.45)]">
            <span className="size-2.5 rounded-full bg-white" />
          </span>
          <EndpointLabel
            kind="Destination"
            name={endpoints ? shortName(endpoints.destination.label) : null}
          />
        </div>
      </Marker>
    </>
  );
}

function EndpointLabel({ kind, name }: { kind: string; name: string | null }) {
  return (
    <span className="pointer-events-none absolute top-1/2 left-full ml-2.5 -translate-y-1/2 rounded-lg bg-surface/95 px-2 py-1 leading-tight whitespace-nowrap shadow-card ring-1 ring-slate-900/5 dark:ring-white/10">
      <span className="block text-[9px] font-bold tracking-wider text-slate-400 uppercase">
        {kind}
      </span>
      {name && <span className="block text-xs font-bold text-ink">{name}</span>}
    </span>
  );
}
