import { act, fireEvent, render, screen } from '@testing-library/react';

import type { Heatmap } from '../../api/types';
import { FORECAST_PLAY_STEP_MS } from '../../lib/constants';
import { formatWeekdayTime } from '../../lib/format';
import { useUiStore } from '../../store/uiStore';
import { ForecastSlider } from './ForecastSlider';

const HEATMAP: Heatmap = { start_time: '2026-11-02T14:00:00Z', hours: 49, points: [] };

describe('ForecastSlider', () => {
  it('describes the hour and its local time for screen readers', () => {
    render(<ForecastSlider heatmap={HEATMAP} />);
    const slider = screen.getByRole('slider', { name: 'Forecast hour after departure' });
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      `+0 hours, ${formatWeekdayTime(HEATMAP.start_time)}`,
    );

    fireEvent.change(slider, { target: { value: '12' } });
    expect(useUiStore.getState().forecastHour).toBe(12);
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      `+12 hours, ${formatWeekdayTime('2026-11-03T02:00:00Z')}`,
    );
    expect(screen.getByText(/Weather risk map for/)).toBeInTheDocument();
  });

  it('is a native, focusable range bounded to 0–48 h', () => {
    render(<ForecastSlider heatmap={HEATMAP} />);
    const slider = screen.getByRole('slider');
    slider.focus();
    expect(slider).toHaveFocus();
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveAttribute('max', '48');
  });

  it('plays one hour per step, stops at the end and pauses on drag', () => {
    vi.useFakeTimers();
    try {
      render(<ForecastSlider heatmap={{ ...HEATMAP, hours: 4 }} />);
      fireEvent.click(screen.getByRole('button', { name: 'Play forecast animation' }));
      act(() => {
        vi.advanceTimersByTime(FORECAST_PLAY_STEP_MS * 2);
      });
      expect(useUiStore.getState().forecastHour).toBe(2);

      act(() => {
        vi.advanceTimersByTime(FORECAST_PLAY_STEP_MS * 5);
      });
      expect(useUiStore.getState().forecastHour).toBe(3);
      expect(screen.getByRole('button', { name: 'Play forecast animation' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Play forecast animation' }));
      expect(useUiStore.getState().forecastHour).toBe(0); // Restarted from the end.
      fireEvent.pointerDown(screen.getByRole('slider'));
      act(() => {
        vi.advanceTimersByTime(FORECAST_PLAY_STEP_MS * 3);
      });
      expect(useUiStore.getState().forecastHour).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
