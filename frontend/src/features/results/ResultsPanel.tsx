import type { ComponentType, SVGProps } from 'react';

import { ClockIcon, PinIcon, RouteIcon } from '../../components/icons';
import { usePlan } from '../plan/planContext';
import { ErrorAlert } from './ErrorAlert';
import { LoadingState } from './LoadingState';
import { RecommendationBanner } from './RecommendationBanner';
import { RouteList } from './RouteList';
import { WarningList } from './WarningList';

export function ResultsPanel() {
  const { state, retry } = usePlan();
  switch (state.status) {
    case 'idle':
      return <IdleGuide />;
    case 'loading':
      return <LoadingState isSlow={state.isSlow} />;
    case 'error':
      return <ErrorAlert error={state.error} onRetry={retry} />;
    case 'success':
      return (
        <div className="space-y-4">
          <RecommendationBanner plan={state.plan} />
          <WarningList warnings={state.plan.warnings} />
          <RouteList routes={state.plan.routes} />
        </div>
      );
  }
}

type Step = { title: string; text: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

const STEPS: readonly Step[] = [
  { title: 'Up to three routes', text: 'Truck-legal options, ranked by risk.', Icon: RouteIcon },
  {
    title: 'Weather at your ETA',
    text: 'Each checkpoint shows the forecast for the moment you reach it.',
    Icon: PinIcon,
  },
  { title: '48-hour outlook', text: 'Scrub the risk map hour by hour.', Icon: ClockIcon },
];

function IdleGuide() {
  return (
    <section aria-label="What you will get" className="card divide-y divide-slate-100">
      {STEPS.map(({ title, text, Icon }) => (
        <div key={title} className="flex gap-3 p-3.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Icon className="size-5" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">{title}</p>
            <p className="text-xs leading-relaxed text-slate-500">{text}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
