import { useEffect, useState } from 'react';

import { SpotterLogo } from '../../components/SpotterLogo';
import { SplashDecor } from './SplashDecor';
import { SplashFeatures } from './SplashFeatures';
import { SplashLoader } from './SplashLoader';
import { SplashPhoto } from './SplashPhoto';
import { SPLASH_TASKS } from './splashTasks';
import type { SplashTask } from './useSplashProgress';
import { useSplashProgress } from './useSplashProgress';

const MIN_DURATION_MS = 1_800;
const MAX_DURATION_MS = 7_000;
/** Let the bar visibly reach 100 % before fading. */
const READY_HOLD_MS = 350;
export const SPLASH_EXIT_MS = 550;

type SplashScreenProps = {
  onFinish: () => void;
  tasks?: readonly SplashTask[];
};

export function SplashScreen({ onFinish, tasks = SPLASH_TASKS }: SplashScreenProps) {
  const { progress, isReady } = useSplashProgress(tasks, {
    minDurationMs: MIN_DURATION_MS,
    maxDurationMs: MAX_DURATION_MS,
  });
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (!isReady) return undefined;
    const leaveTimer = setTimeout(() => {
      setIsLeaving(true);
    }, READY_HOLD_MS);
    const finishTimer = setTimeout(onFinish, READY_HOLD_MS + SPLASH_EXIT_MS);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(finishTimer);
    };
  }, [isReady, onFinish]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Spotter AI is loading"
      className={`fixed inset-0 z-[100] overflow-hidden bg-white transition-[opacity,transform] ease-out-soft ${
        isLeaving ? 'pointer-events-none scale-[1.015] opacity-0' : 'opacity-100'
      }`}
      style={{ transitionDuration: `${SPLASH_EXIT_MS}ms` }}
    >
      {/* Everything stays in normal flow with fluid sizes, so nothing overlaps at any aspect. */}
      <div className="relative flex h-full flex-col">
        <SplashPhoto />
        <SplashDecor />
        <div className="relative flex shrink-0 px-6 pt-2 sm:px-10 split:min-h-0 split:flex-1 split:items-center split:px-[6.5vw] split:pt-6">
          <div className="stagger flex w-full flex-col split:max-w-[min(46rem,54vw)]">
            <SpotterLogo size="lg" tagline="Smarter Fleet. Safer Journeys." />
            <span
              aria-hidden
              className="splash-accent block h-1.5 w-16 rounded-full bg-linear-to-r from-coral-500 to-coral-400/70"
            />
            <h1 className="splash-title font-extrabold tracking-[-0.03em] text-ink">
              Route Intelligence <br />
              for a <span className="text-brand-600">Safer</span> Tomorrow
            </h1>
            <p className="splash-subtitle font-semibold text-ink-soft/75">
              Plan. Forecast. Deliver.
            </p>
            <div className="splash-features">
              <SplashFeatures />
            </div>
          </div>
        </div>

        <div className="splash-loader-area relative flex shrink-0 justify-center px-6">
          <SplashLoader progress={progress} />
        </div>
      </div>
    </div>
  );
}
