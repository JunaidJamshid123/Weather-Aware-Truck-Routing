import type { Route } from '../../api/types';
import { CheckIcon } from '../../components/icons';
import { routeColor } from '../../lib/constants';
import { formatAverageRisk, formatDateTime, formatDuration, formatMiles } from '../../lib/format';
import { RiskBadge } from './RiskBadge';

type RouteCardProps = {
  route: Route;
  isSelected: boolean;
  onSelect: (routeId: string) => void;
};

export function RouteCard({ route, isSelected, onSelect }: RouteCardProps) {
  const { summary } = route;
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={() => {
        onSelect(route.id);
      }}
      className={`group w-full rounded-2xl border bg-surface p-4 text-left transition-[border-color,box-shadow,transform] duration-200 focus-visible:ring-4 focus-visible:ring-brand-600/25 focus-visible:outline-none ${
        isSelected
          ? 'border-brand-600 shadow-[0_0_0_1px_var(--color-brand-600),0_10px_28px_-14px_rgb(0_128_131/0.55)]'
          : 'border-slate-200 shadow-card hover:-translate-y-px hover:border-slate-300'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="h-2 w-7 shrink-0 rounded-full"
          style={{ backgroundColor: routeColor(route.id) }}
        />
        <h3 className="font-bold text-ink">{route.label}</h3>
        {summary.is_recommended && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 ring-1 ring-brand-600/20">
            <CheckIcon className="size-3" strokeWidth={2.5} />
            Recommended
          </span>
        )}
        {summary.blocked && (
          <span className="rounded-full bg-night px-2 py-0.5 text-[11px] font-bold text-white">
            Blocked
          </span>
        )}
        <span className="ml-auto">
          <RiskBadge risk={summary.max_risk} size="sm" />
        </span>
      </div>

      <dl className="mt-3.5 grid grid-cols-3 gap-x-3 gap-y-3 rounded-xl bg-mist px-3 py-2.5 text-sm">
        <Stat label="Distance" value={formatMiles(summary.distance_mi)} />
        <Stat label="Drive time" value={formatDuration(summary.duration_s)} />
        <Stat label="Avg risk" value={formatAverageRisk(summary.avg_risk)} />
        <Stat
          label="Severe"
          value={formatMiles(summary.severe_miles)}
          isAlert={summary.severe_miles > 0}
        />
        <Stat
          label="High"
          value={formatMiles(summary.high_miles)}
          isAlert={summary.high_miles > 0}
        />
        {summary.no_travel_miles > 0 ? (
          <Stat label="No Travel" value={formatMiles(summary.no_travel_miles)} isAlert />
        ) : (
          <Stat label="Moderate" value={formatMiles(summary.moderate_miles)} />
        )}
      </dl>

      <p className="mt-3 text-sm leading-snug text-ink-soft">{summary.reason}</p>
      <p className="mt-1.5 text-xs text-slate-500">
        Arrives {formatDateTime(summary.arrival_time)}
        {summary.unknown_miles > 0 &&
          ` · Forecast unavailable for ${formatMiles(summary.unknown_miles)}`}
      </p>
    </button>
  );
}

type StatProps = { label: string; value: string; isAlert?: boolean };

function Stat({ label, value, isAlert = false }: StatProps) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd
        className={`mt-0.5 truncate font-bold tabular-nums ${isAlert ? 'text-coral-600' : 'text-ink'}`}
      >
        {value}
      </dd>
    </div>
  );
}
