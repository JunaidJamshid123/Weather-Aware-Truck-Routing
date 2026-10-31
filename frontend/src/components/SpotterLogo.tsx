type LogoSize = 'sm' | 'lg';

const SIZES: Record<LogoSize, { mark: string; word: string; divider: string; gap: string }> = {
  sm: { mark: 'h-7', word: 'text-[19px]', divider: 'h-6', gap: 'gap-2.5' },
  // Fluid splash sizes from index.css.
  lg: {
    mark: 'splash-logo-mark',
    word: 'splash-logo-word',
    divider: 'splash-logo-divider',
    gap: 'splash-logo-gap',
  },
};

export function SpotterMark({ className = 'h-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 44" className={`w-auto shrink-0 ${className}`} aria-hidden>
      <circle cx="9.5" cy="9.5" r="9.5" className="fill-coral-500" />
      <circle cx="9.5" cy="33.5" r="9.5" className="fill-brand-600" />
      <circle cx="32" cy="33.5" r="9.5" className="fill-brand-200" />
      <circle cx="54.5" cy="33.5" r="9.5" className="fill-brand-200" />
    </svg>
  );
}

type SpotterLogoProps = { size?: LogoSize; tagline?: string };

export function SpotterLogo({ size = 'sm', tagline }: SpotterLogoProps) {
  const s = SIZES[size];
  return (
    <span className={`inline-flex items-center ${s.gap}`}>
      <SpotterMark className={s.mark} />
      <span aria-hidden className={`w-px self-center bg-ink/70 ${s.divider}`} />
      <span className="flex flex-col">
        <span className={`leading-none font-extrabold tracking-[-0.025em] text-ink ${s.word}`}>
          Spotter <span className="text-brand-600">AI</span>
        </span>
        {tagline && (
          <span
            className={`font-medium text-ink-soft/80 ${size === 'lg' ? 'splash-tagline' : 'mt-1 text-xs'}`}
          >
            {tagline}
          </span>
        )}
      </span>
    </span>
  );
}
