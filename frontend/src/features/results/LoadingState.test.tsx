import { act, render, renderHook, screen } from '@testing-library/react';

import { useTimeoutFlag } from '../../hooks/useTimeoutFlag';
import { COLD_START_NOTICE_MS } from '../../lib/constants';
import { LoadingState } from './LoadingState';

describe('cold-start notice', () => {
  it('turns on only after the request has been pending for 8 s, and resets after', () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = renderHook(
        ({ active }) => useTimeoutFlag(active, COLD_START_NOTICE_MS),
        { initialProps: { active: true } },
      );
      act(() => {
        vi.advanceTimersByTime(COLD_START_NOTICE_MS - 1);
      });
      expect(result.current).toBe(false);
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(result.current).toBe(true);
      rerender({ active: false });
      expect(result.current).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('explains a slow server while loading', () => {
    render(<LoadingState isSlow />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Server is waking up, this can take a moment.',
    );
  });
});
