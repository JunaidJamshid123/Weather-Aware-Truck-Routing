import { useEffect, useState } from 'react';

/** Failures count as done. */
export type SplashTask = () => Promise<unknown>;

type SplashTiming = {
  minDurationMs: number;
  maxDurationMs: number;
};

// 0 looks frozen, and 100% is reserved for truly ready.
const PROGRESS_FLOOR = 0.08;
const PROGRESS_CEILING = 0.92;

export function useSplashProgress(
  tasks: readonly SplashTask[],
  { minDurationMs, maxDurationMs }: SplashTiming,
): { progress: number; isReady: boolean } {
  const [completed, setCompleted] = useState(0);
  const [hasMinElapsed, setHasMinElapsed] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  useEffect(() => {
    let isActive = true;
    const markDone = (): void => {
      if (isActive) setCompleted((count) => count + 1);
    };
    for (const task of tasks) {
      task().then(markDone, markDone);
    }
    const minTimer = setTimeout(() => {
      setHasMinElapsed(true);
    }, minDurationMs);
    const maxTimer = setTimeout(() => {
      setHasTimedOut(true);
    }, maxDurationMs);
    return () => {
      isActive = false;
      setCompleted(0);
      clearTimeout(minTimer);
      clearTimeout(maxTimer);
    };
  }, [tasks, minDurationMs, maxDurationMs]);

  const total = Math.max(tasks.length, 1);
  const isReady = (completed >= tasks.length && hasMinElapsed) || hasTimedOut;
  const progress = isReady
    ? 1
    : PROGRESS_FLOOR + (PROGRESS_CEILING - PROGRESS_FLOOR) * Math.min(completed / total, 1);
  return { progress, isReady };
}
