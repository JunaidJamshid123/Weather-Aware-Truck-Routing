import { useUiStore } from '../store/uiStore';
import { MoonIcon, SunIcon } from './icons';

export function ThemeToggle() {
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Dark mode"
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => {
        setTheme(isDark ? 'light' : 'dark');
      }}
      className="relative inline-flex h-8 w-[3.75rem] shrink-0 items-center rounded-full border border-slate-200 bg-mist p-[3px] transition-colors hover:border-brand-600/40 focus-visible:ring-4 focus-visible:ring-brand-600/25 focus-visible:outline-none"
    >
      <SunIcon
        aria-hidden
        className={`absolute left-2 size-3.5 text-slate-400 transition-opacity ${isDark ? 'opacity-100' : 'opacity-0'}`}
      />
      <MoonIcon
        aria-hidden
        className={`absolute right-2 size-3.5 text-slate-400 transition-opacity ${isDark ? 'opacity-0' : 'opacity-100'}`}
      />
      <span
        aria-hidden
        className={`relative flex size-6 items-center justify-center rounded-full bg-surface text-brand-600 shadow-[0_1px_3px_rgb(15_30_46/0.25)] dark:bg-brand-600 dark:text-white transition-transform duration-300 ease-out-soft ${
          isDark ? 'translate-x-[1.75rem]' : ''
        }`}
      >
        {isDark ? <MoonIcon className="size-3.5" /> : <SunIcon className="size-3.5" />}
      </span>
    </button>
  );
}
