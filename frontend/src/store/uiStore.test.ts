import { clampForecastHour, useUiStore } from './uiStore';

const actions = () => useUiStore.getState();

describe('uiStore', () => {
  it('a new plan selects its recommendation and rewinds the slider and popup', () => {
    actions().setForecastHour(30);
    actions().openCheckpoint({ routeId: 'route-1', index: 3 });
    actions().resetForPlan('route-2');
    expect(useUiStore.getState()).toMatchObject({
      selectedRouteId: 'route-2',
      forecastHour: 0,
      activeCheckpoint: null,
    });
  });

  it('opening a checkpoint selects its route', () => {
    actions().resetForPlan('route-1');
    actions().openCheckpoint({ routeId: 'route-3', index: 5 });
    expect(useUiStore.getState().selectedRouteId).toBe('route-3');
    expect(useUiStore.getState().activeCheckpoint).toEqual({ routeId: 'route-3', index: 5 });
  });

  it('selecting another route closes a popup that belongs to the old one', () => {
    actions().openCheckpoint({ routeId: 'route-1', index: 2 });
    actions().selectRoute('route-2');
    expect(useUiStore.getState().activeCheckpoint).toBeNull();
  });

  it('re-selecting the same route keeps its popup open', () => {
    actions().openCheckpoint({ routeId: 'route-1', index: 2 });
    actions().selectRoute('route-1');
    expect(useUiStore.getState().activeCheckpoint).toEqual({ routeId: 'route-1', index: 2 });
  });

  it('closes the popup', () => {
    actions().openCheckpoint({ routeId: 'route-1', index: 2 });
    actions().closeCheckpoint();
    expect(useUiStore.getState().activeCheckpoint).toBeNull();
  });

  it.each([
    [-3, 0],
    [12.4, 12],
    [12.6, 13],
    [99, 48],
    [Number.NaN, 0],
  ])('clamps forecast hour %s to %s', (input, expected) => {
    expect(clampForecastHour(input)).toBe(expected);
    actions().setForecastHour(input);
    expect(useUiStore.getState().forecastHour).toBe(expected);
  });

  it('remembers the colour scheme and keeps it across new plans', () => {
    actions().setTheme('dark');
    actions().resetForPlan('route-1');
    expect(useUiStore.getState().theme).toBe('dark');
    expect(window.localStorage.getItem('spotter-theme')).toBe('dark');
  });
});
