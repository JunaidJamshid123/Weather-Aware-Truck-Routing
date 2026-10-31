import type { RiskName } from '../../lib/risk';
import { RISK_META, UNKNOWN_RISK_COLOR, UNKNOWN_RISK_LABEL } from '../../lib/risk';

/** Dot plus label, so colour is never the only signal. */
export function RiskBadge({ risk, size = 'md' }: { risk: RiskName | null; size?: 'sm' | 'md' }) {
  const meta = risk === null ? null : RISK_META[risk];
  const isNoTravel = risk === 'NO_TRAVEL';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap ring-1 ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      } ${isNoTravel ? 'bg-night text-white ring-night' : 'bg-surface text-ink ring-slate-200'}`}
    >
      <span
        aria-hidden
        className={`size-2 shrink-0 rounded-full ${isNoTravel ? 'ring-2 ring-white' : ''}`}
        style={{ backgroundColor: meta?.color ?? UNKNOWN_RISK_COLOR }}
      />
      {meta?.label ?? UNKNOWN_RISK_LABEL}
    </span>
  );
}
