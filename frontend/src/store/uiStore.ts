/** UI-only state; server data lives in TanStack Query. */
import { create } from 'zustand';

import { MAX_FORECAST_HOUR } from '../lib/constants';

export type CheckpointRef = { routeId: string; index: number };
export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'spotter-theme';

/** Saved choice, else the system preference. Storage can throw in privacy modes. */
function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Fall through to the system preference.
  }
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Not persisting is fine; the toggle still works this visit.
  }
}

type UiState = {
  selectedRouteId: string | null;
  /** Hours after departure, 0–48. */
  forecastHour: number;
  activeCheckpoint: CheckpointRef | null;
  isFollowingDriver: boolean;
  /** A viewing preference, so a new plan doesn't reset it. */
  theme: Theme;
};

type UiActions = {
  selectRoute: (routeId: string) => void;
  setForecastHour: (hour: number) => void;
  openCheckpoint: (checkpoint: CheckpointRef) => void;
  closeCheckpoint: () => void;
  setFollowingDriver: (isFollowing: boolean) => void;
  setTheme: (theme: Theme) => void;
  /** Selects the new plan's recommendation and rewinds the slider. */
  resetForPlan: (recommendedRouteId: string) => void;
};

const INITIAL_STATE: Omit<UiState, 'theme'> = {
  selectedRouteId: null,
  forecastHour: 0,
  activeCheckpoint: null,
  isFollowingDriver: false,
};

export const clampForecastHour = (hour: number): number =>
  Number.isFinite(hour) ? Math.min(MAX_FORECAST_HOUR, Math.max(0, Math.round(hour))) : 0;

export const useUiStore = create<UiState & UiActions>()((set) => ({
  ...INITIAL_STATE,
  theme: initialTheme(),
  selectRoute: (routeId) => {
    set((state) => ({
      selectedRouteId: routeId,
      // A popup for another route's checkpoint would point at a now-dimmed line.
      activeCheckpoint: state.activeCheckpoint?.routeId === routeId ? state.activeCheckpoint : null,
    }));
  },
  setForecastHour: (hour) => {
    set({ forecastHour: clampForecastHour(hour) });
  },
  openCheckpoint: (checkpoint) => {
    set({ activeCheckpoint: checkpoint, selectedRouteId: checkpoint.routeId });
  },
  closeCheckpoint: () => {
    set({ activeCheckpoint: null });
  },
  setFollowingDriver: (isFollowing) => {
    set({ isFollowingDriver: isFollowing });
  },
  setTheme: (theme) => {
    saveTheme(theme);
    set({ theme });
  },
  resetForPlan: (recommendedRouteId) => {
    set({ ...INITIAL_STATE, selectedRouteId: recommendedRouteId });
  },
}));

/** For tests. */
export const resetUiStore = (): void => {
  useUiStore.setState({ ...INITIAL_STATE, theme: 'light' });
};
