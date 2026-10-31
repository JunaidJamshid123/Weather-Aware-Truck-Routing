import { useCallback, useEffect, useState } from 'react';

import { FORECAST_PLAY_STEP_MS } from '../../lib/constants';
import { useUiStore } from '../../store/uiStore';

export function useForecastPlayback(maxHour: number): {
  isPlaying: boolean;
  toggle: () => void;
  pause: () => void;
} {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = setInterval(() => {
      const { forecastHour, setForecastHour } = useUiStore.getState();
      if (forecastHour >= maxHour) {
        setIsPlaying(false);
        return;
      }
      setForecastHour(forecastHour + 1);
    }, FORECAST_PLAY_STEP_MS);
    return () => {
      clearInterval(timer);
    };
  }, [isPlaying, maxHour]);

  const toggle = useCallback(() => {
    const { forecastHour, setForecastHour } = useUiStore.getState();
    // Playing from the end restarts from departure.
    if (!isPlaying && forecastHour >= maxHour) setForecastHour(0);
    setIsPlaying(!isPlaying);
  }, [isPlaying, maxHour]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  return { isPlaying, toggle, pause };
}
