import { useEffect, useState } from 'react';

/** True once `active` has stayed true for `delayMs`; resets when it turns false. */
export function useTimeoutFlag(active: boolean, delayMs: number): boolean {
  const [hasElapsed, setHasElapsed] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(() => {
      setHasElapsed(true);
    }, delayMs);
    return () => {
      clearTimeout(timer);
      setHasElapsed(false);
    };
  }, [active, delayMs]);
  return active && hasElapsed;
}
