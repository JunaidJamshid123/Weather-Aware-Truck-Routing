import { act, render, screen } from '@testing-library/react';

import { SplashScreen } from './SplashScreen';
import type { SplashTask } from './useSplashProgress';

function deferredTask(): { task: SplashTask; resolve: () => void; reject: () => void } {
  let resolve = (): void => undefined;
  let reject = (): void => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = () => {
      rej(new Error('offline'));
    };
  });
  return { task: () => promise, resolve, reject };
}

const flush = async (ms: number): Promise<void> => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const progressNow = (): number =>
  Number(screen.getByRole('progressbar').getAttribute('aria-valuenow'));

describe('SplashScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the brand, the headline and an accessible progress bar', () => {
    render(<SplashScreen onFinish={() => undefined} tasks={[]} />);
    expect(screen.getByText('Smarter Fleet. Safer Journeys.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Route Intelligence for a Safer Tomorrow',
    );
    expect(screen.getByRole('progressbar', { name: 'Loading Spotter AI' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
  });

  it('tracks real work, waits the minimum time, then finishes', async () => {
    const map = deferredTask();
    const backend = deferredTask();
    const onFinish = vi.fn();
    render(<SplashScreen onFinish={onFinish} tasks={[map.task, backend.task]} />);
    const initial = progressNow();
    expect(initial).toBeGreaterThan(0);

    map.resolve();
    await flush(10);
    expect(progressNow()).toBeGreaterThan(initial);
    expect(progressNow()).toBeLessThan(100);

    backend.reject(); // A sleeping backend must not block the app.
    await flush(10);
    expect(onFinish).not.toHaveBeenCalled(); // The minimum display time has not passed.

    await flush(1_800);
    expect(progressNow()).toBe(100);
    await flush(1_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('never holds the user longer than the maximum, even if work hangs', async () => {
    const hanging = deferredTask();
    const onFinish = vi.fn();
    render(<SplashScreen onFinish={onFinish} tasks={[hanging.task]} />);
    await flush(6_000);
    expect(onFinish).not.toHaveBeenCalled();
    await flush(1_500); // Past the 7 s cap: the splash starts leaving.
    await flush(1_000);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
