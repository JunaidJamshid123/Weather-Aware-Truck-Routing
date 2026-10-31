import { useDeferredValue } from 'react';

import { useUiStore } from '../../store/uiStore';

/** `hour` drives the thumb; `deferredHour` drives the map so dragging never blocks input. */
export function useForecastHour(): {
  hour: number;
  deferredHour: number;
  setHour: (hour: number) => void;
} {
  const hour = useUiStore((state) => state.forecastHour);
  const setHour = useUiStore((state) => state.setForecastHour);
  const deferredHour = useDeferredValue(hour);
  return { hour, deferredHour, setHour };
}
