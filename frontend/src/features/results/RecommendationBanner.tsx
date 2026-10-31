import type { Plan } from '../../api/types';
import { AlertIcon, ShieldCheckIcon } from '../../components/icons';
import { ALL_BLOCKED_MESSAGE } from '../../lib/constants';
import { formatDuration, formatMiles } from '../../lib/format';

export function RecommendationBanner({ plan }: { plan: Plan }) {
  const recommended = plan.routes.find((route) => route.id === plan.recommended_route_id);

  if (plan.all_blocked) {
    return (
      <div
        role="alert"
        className="flex gap-3 rounded-2xl bg-linear-to-br from-coral-600 to-coral-500 p-4 text-white shadow-[0_10px_24px_-12px_rgb(226_48_75/0.7)]"
      >
        <AlertIcon className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-bold">{ALL_BLOCKED_MESSAGE}</p>
          {recommended && (
            <p className="mt-1 text-sm text-white/90">
              Least risky option: {recommended.label} ({recommended.summary.reason}).
            </p>
          )}
        </div>
      </div>
    );
  }
  if (!recommended) return null;

  const { summary } = recommended;
  return (
    <div
      role="status"
      className="relative overflow-hidden rounded-2xl bg-linear-to-br from-brand-600 to-brand-800 p-4 text-white shadow-brand"
    >
      <div aria-hidden className="absolute -top-10 -right-8 size-32 rounded-full bg-white/10" />
      <div aria-hidden className="absolute -right-2 -bottom-14 size-24 rounded-full bg-white/5" />
      <div className="relative flex gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <ShieldCheckIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.12em] text-white/70 uppercase">
            Recommended route
          </p>
          <p className="mt-0.5 text-lg leading-tight font-extrabold">{recommended.label}</p>
          <p className="mt-1 text-sm text-white/85">{summary.reason}</p>
          <p className="mt-2.5 text-xs font-semibold text-white/80">
            {formatMiles(summary.distance_mi)} · {formatDuration(summary.duration_s)}
          </p>
        </div>
      </div>
    </div>
  );
}
