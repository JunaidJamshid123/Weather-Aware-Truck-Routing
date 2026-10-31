export function SplashLoader({ progress }: { progress: number }) {
  const percent = Math.round(progress * 100);
  return (
    <div className="flex w-[min(25rem,78vw)] flex-col items-center">
      <svg
        viewBox="0 0 40 40"
        className="size-9 animate-spin [animation-duration:1.1s]"
        aria-hidden
      >
        <circle cx="20" cy="20" r="16" fill="none" strokeWidth="3.5" className="stroke-slate-200" />
        <path
          d="M20 4a16 16 0 0 1 16 16"
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          className="stroke-brand-600"
        />
      </svg>
      <p className="mt-3 text-sm font-semibold text-ink-soft">Loading Spotter AI…</p>
      <div
        role="progressbar"
        aria-label="Loading Spotter AI"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/90"
      >
        <div
          className="h-full rounded-full bg-linear-to-r from-brand-700 to-brand-500 transition-[width] duration-700 ease-out-soft"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
