import { useState } from 'react';

import { DRIVER_AVATAR_URL } from '../../lib/constants';
import {
  NO_TRAVEL_RING_COLOR,
  RISK_META,
  RISK_SCALE,
  UNKNOWN_RISK_COLOR,
  UNKNOWN_RISK_LABEL,
} from '../../lib/risk';

export function RiskLegend({ hasPlan }: { hasPlan: boolean }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <section
      aria-label="Map legend"
      className="glass absolute top-2 right-14 left-2 px-2.5 py-2 text-[10px] text-ink-soft sm:top-3 sm:right-auto sm:left-3 sm:w-60 sm:px-3 sm:py-2.5 sm:text-xs"
    >
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
        }}
        aria-expanded={isOpen}
        className="-mx-1 hidden w-[calc(100%+0.5rem)] items-center justify-between rounded-md px-1 py-0.5 text-[11px] font-bold tracking-wide text-ink uppercase hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600/40 focus-visible:outline-none sm:flex"
      >
        Weather risk
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className={`size-3.5 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
        >
          <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>
      {/* A wrapping strip on phones; a foldable two-column key on wider screens. */}
      <div className={isOpen ? 'sm:mt-2' : 'sm:hidden'}>
        <ul className="flex flex-wrap gap-x-2.5 gap-y-1 font-semibold sm:grid sm:grid-cols-2 sm:gap-x-3 sm:gap-y-1.5 sm:font-medium">
          {RISK_SCALE.map((meta) => (
            <LegendItem
              key={meta.name}
              color={meta.color}
              label={meta.label}
              hasRing={meta === RISK_META.NO_TRAVEL}
            />
          ))}
          <LegendItem color={UNKNOWN_RISK_COLOR} label={UNKNOWN_RISK_LABEL} isWide />
        </ul>
        {hasPlan && (
          <div className="mt-2.5 hidden border-t border-slate-200/80 pt-2.5 sm:block">
            <div className="grid grid-cols-2 gap-x-3">
              <p className="flex items-center gap-2">
                <img
                  src={DRIVER_AVATAR_URL}
                  alt=""
                  className="size-4 rounded-full ring-2 ring-brand-600"
                />
                Driver
              </p>
              <p className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="h-1.5 w-4 rounded-full bg-[#1e3a6b] dark:bg-slate-400"
                />
                Driven road
              </p>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-slate-500">
              Glow is risk at the slider time; dots are risk when you arrive.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function LegendItem({
  color,
  label,
  hasRing = false,
  isWide = false,
}: {
  color: string;
  label: string;
  hasRing?: boolean;
  isWide?: boolean;
}) {
  return (
    <li className={`flex items-center gap-1.5 sm:gap-2 ${isWide ? 'sm:col-span-2' : ''}`}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full sm:size-2.5"
        style={{
          backgroundColor: color,
          boxShadow: hasRing ? `0 0 0 2px ${NO_TRAVEL_RING_COLOR}, 0 0 0 3px ${color}` : undefined,
        }}
      />
      {label}
    </li>
  );
}
