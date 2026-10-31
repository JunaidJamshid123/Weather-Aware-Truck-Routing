import type { ComponentType, SVGProps } from 'react';

import { CloudBoltIcon, PinIcon, RouteIcon, ShieldCheckIcon } from '../../components/icons';

type Feature = { label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

const FEATURES: readonly Feature[] = [
  { label: 'Driver Safety', Icon: ShieldCheckIcon },
  { label: 'Route Options', Icon: RouteIcon },
  { label: 'Checkpoint ETAs', Icon: PinIcon },
  { label: '48h Weather', Icon: CloudBoltIcon },
];

/** 2×2 chips in narrow portrait, otherwise four viewport-scaled tiles (see index.css). */
export function SplashFeatures() {
  return (
    <ul className="splash-tiles grid grid-cols-2 gap-2.5">
      {FEATURES.map(({ label, Icon }) => (
        <li
          key={label}
          className="splash-tile flex min-w-0 items-center gap-2.5 rounded-2xl border border-slate-200/70 bg-white/85 px-3 py-3 shadow-card backdrop-blur-sm"
        >
          <Icon className="splash-tile-icon shrink-0 text-brand-600" />
          <span className="splash-tile-label leading-tight font-semibold text-ink">{label}</span>
        </li>
      ))}
    </ul>
  );
}
