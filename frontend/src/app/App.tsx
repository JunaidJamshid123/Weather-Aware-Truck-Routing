import { lazy, Suspense, useCallback, useState } from 'react';

import { SpotterLogo } from '../components/SpotterLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { ResultsPanel } from '../features/results/ResultsPanel';
import { SplashScreen } from '../features/splash/SplashScreen';
import { TripForm } from '../features/trip-form/TripForm';
import { useUiStore } from '../store/uiStore';

// The heaviest chunk; the splash preloads it.
const MapView = lazy(() =>
  import('../features/map/MapView').then((module) => ({ default: module.MapView })),
);

export function App() {
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const theme = useUiStore((state) => state.theme);
  const hideSplash = useCallback(() => {
    setIsSplashVisible(false);
  }, []);

  return (
    <>
      {/* Renders under the splash so tiles load early; data-theme here keeps the splash light. */}
      <div
        data-theme={theme}
        aria-hidden={isSplashVisible || undefined}
        className="flex h-dvh flex-col overflow-hidden bg-mist transition-colors duration-300 md:flex-row"
      >
        <aside className="relative order-2 flex min-h-0 flex-1 flex-col border-t border-slate-200/80 bg-surface md:order-1 md:w-[420px] md:flex-none md:border-t-0 md:border-r">
          <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4 md:px-6">
            <SpotterLogo />
            <ThemeToggle />
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="space-y-6 px-5 py-5 md:px-6">
              <section aria-labelledby="plan-heading">
                <h1 id="plan-heading" className="text-xl font-extrabold tracking-tight text-ink">
                  Plan a safer trip
                </h1>
                <p className="mt-1 mb-5 text-sm text-slate-500">
                  Compare truck routes by the weather you will meet at each checkpoint.
                </p>
                <TripForm />
              </section>
              <ResultsPanel />
            </div>
            <footer className="px-5 pb-5 text-[11px] leading-relaxed text-slate-400 md:px-6">
              Routing © openrouteservice.org · Map data © OpenStreetMap contributors · Weather by
              Open-Meteo.com
            </footer>
          </div>
        </aside>
        <main className="relative order-1 h-[62dvh] shrink-0 md:order-2 md:h-full md:flex-1">
          <h2 className="sr-only">Route map</h2>
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-slate-100" />}>
            <MapView />
          </Suspense>
        </main>
      </div>
      {isSplashVisible && <SplashScreen onFinish={hideSplash} />}
    </>
  );
}
