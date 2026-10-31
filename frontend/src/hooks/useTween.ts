import { useEffect, useLayoutEffect, useRef } from 'react';

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * rAF tween that bypasses React renders. One-step moves are linear so playback reads as constant
 * speed; bigger jumps ease out. The returned ref lets callers redraw the latest value.
 */
export function useTween(
  target: number,
  { durationMs, isInstant = false }: { durationMs: number; isInstant?: boolean },
  onFrame: (value: number) => void,
): { readonly current: number } {
  const valueRef = useRef(target);
  const onFrameRef = useRef(onFrame);
  useLayoutEffect(() => {
    onFrameRef.current = onFrame;
  });

  useEffect(() => {
    const from = valueRef.current;
    if (isInstant || from === target) {
      valueRef.current = target;
      onFrameRef.current(target);
      return undefined;
    }
    const ease = Math.abs(target - from) <= 1 ? (t: number) => t : easeOutCubic;
    let startedAt: number | null = null;
    let frame = requestAnimationFrame(function step(now) {
      startedAt ??= now;
      const t = Math.min(1, (now - startedAt) / durationMs);
      valueRef.current = from + (target - from) * ease(t);
      onFrameRef.current(valueRef.current);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [target, durationMs, isInstant]);

  return valueRef;
}
