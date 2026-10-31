const SKELETON_CARDS = [0, 1, 2];
const SKELETON_STATS = [0, 1, 2, 3, 4, 5];

export function LoadingState({ isSlow }: { isSlow: boolean }) {
  return (
    <div className="space-y-3" aria-busy="true">
      <p
        className="flex items-center gap-2 text-sm font-medium text-ink-soft"
        role="status"
        aria-live="polite"
      >
        <span aria-hidden className="relative flex size-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-500/60" />
          <span className="relative inline-flex size-2.5 rounded-full bg-brand-600" />
        </span>
        {isSlow
          ? 'Server is waking up, this can take a moment.'
          : 'Finding routes and checking the forecast along each one…'}
      </p>
      {SKELETON_CARDS.map((card) => (
        <div key={card} className="card animate-pulse p-4">
          <div className="flex items-center gap-2.5">
            <div className="h-2 w-7 rounded-full bg-slate-200" />
            <div className="h-4 w-28 rounded-md bg-slate-200" />
            <div className="ml-auto h-5 w-16 rounded-full bg-slate-100" />
          </div>
          <div className="mt-3.5 grid grid-cols-3 gap-3 rounded-xl bg-mist p-3">
            {SKELETON_STATS.map((stat) => (
              <div key={stat} className="space-y-1.5">
                <div className="h-2.5 w-12 rounded bg-slate-200/80" />
                <div className="h-3.5 w-16 rounded bg-slate-200" />
              </div>
            ))}
          </div>
          <div className="mt-3 h-3 w-3/4 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
