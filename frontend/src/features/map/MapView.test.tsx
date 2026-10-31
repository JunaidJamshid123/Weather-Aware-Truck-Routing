// jsdom has no WebGL, so react-map-gl is stubbed to expose source data, paint and clicks.
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { Plan } from '../../api/types';
import { samplePlan } from '../../mocks/handlers';
import { useUiStore } from '../../store/uiStore';
import { PlanContext } from '../plan/planContext';
import { MapView } from './MapView';

type ClickHandler = (event: { features?: { properties: unknown }[] }) => void;
const mapProps: { onClick?: ClickHandler } = {};

vi.mock('./webgl', () => ({ isWebglSupported: () => true }));
vi.mock('react-map-gl/maplibre', () => ({
  Map: ({ children, onClick }: { children: ReactNode; onClick: ClickHandler }) => {
    mapProps.onClick = onClick;
    return <div data-testid="map">{children}</div>;
  },
  Source: ({
    id,
    data,
    children,
  }: {
    id: string;
    data: { features: unknown[] };
    children: ReactNode;
  }) => (
    <div data-testid={`source-${id}`} data-count={data.features.length}>
      {children}
    </div>
  ),
  Layer: ({ id, paint }: { id: string; paint: unknown }) => (
    <div data-testid={`layer-${id}`} data-paint={JSON.stringify(paint)} />
  ),
  Popup: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  Marker: ({ children }: { children: ReactNode }) => <div data-testid="marker">{children}</div>,
  useMap: () => ({ current: undefined }),
}));

function renderMap(plan: Plan | null) {
  const state = plan ? ({ status: 'success', plan } as const) : ({ status: 'idle' } as const);
  return render(
    <PlanContext.Provider
      value={{ state, submit: () => Promise.resolve(), retry: () => undefined }}
    >
      <MapView />
    </PlanContext.Provider>,
  );
}

const paintOf = (layerId: string): Record<string, unknown> =>
  JSON.parse(screen.getByTestId(`layer-${layerId}`).dataset.paint ?? '{}') as Record<
    string,
    unknown
  >;

describe('MapView', () => {
  it('starts with empty sources and the legend visible', () => {
    renderMap(null);
    expect(screen.getByTestId('source-routes')).toHaveAttribute('data-count', '0');
    expect(screen.getByRole('region', { name: 'Map legend' })).toHaveTextContent('No Travel');
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it('renders every route, checkpoint and heatmap point once a plan arrives', () => {
    renderMap(samplePlan);
    const checkpointCount = samplePlan.routes.reduce((n, r) => n + r.checkpoints.length, 0);
    expect(screen.getByTestId('source-routes')).toHaveAttribute(
      'data-count',
      String(samplePlan.routes.length),
    );
    expect(screen.getByTestId('source-checkpoints')).toHaveAttribute(
      'data-count',
      String(checkpointCount),
    );
    expect(screen.getByTestId('source-heatmap')).toHaveAttribute(
      'data-count',
      String(samplePlan.heatmap.points.length),
    );
  });

  it('moving the slider changes only the heatmap weight expression', () => {
    renderMap(samplePlan);
    expect(paintOf('forecast-heatmap')['heatmap-weight']).toEqual([
      '/',
      ['max', ['get', 'r0'], 0],
      4,
    ]);
    act(() => {
      useUiStore.getState().setForecastHour(17);
    });
    expect(paintOf('forecast-heatmap')['heatmap-weight']).toEqual([
      '/',
      ['max', ['get', 'r17'], 0],
      4,
    ]);
  });

  it('clicking a checkpoint opens its popup with ETA and arrival-time forecast', () => {
    renderMap(samplePlan);
    const route = samplePlan.routes[1]!;
    act(() => {
      mapProps.onClick?.({
        features: [{ properties: { routeId: route.id, index: 1, riskLevel: 0 } }],
      });
    });
    const popup = screen.getByRole('dialog');
    expect(popup).toHaveTextContent(route.label);
    expect(popup).toHaveTextContent('ETA');
    expect(popup).toHaveTextContent('Forecast at your arrival time');
    expect(useUiStore.getState().selectedRouteId).toBe(route.id);

    act(() => {
      mapProps.onClick?.({ features: [] });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the forecast slider for a plan', () => {
    renderMap(samplePlan);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } });
    expect(useUiStore.getState().forecastHour).toBe(5);
  });

  it('clicking a route line selects that route', () => {
    renderMap(samplePlan);
    const route = samplePlan.routes[2]!;
    act(() => {
      mapProps.onClick?.({
        features: [{ properties: { routeId: route.id, rank: 3, isRecommended: false } }],
      });
    });
    expect(useUiStore.getState().selectedRouteId).toBe(route.id);
  });

  it('pins the start and destination and draws the driven trail for the selected route', () => {
    act(() => {
      useUiStore.getState().resetForPlan(samplePlan.recommended_route_id);
    });
    renderMap(samplePlan);
    expect(screen.getAllByTestId('marker')).toHaveLength(2);
    expect(screen.getByText('Destination')).toBeInTheDocument();
    expect(screen.getByTestId('source-driver-trail')).toHaveAttribute('data-count', '1');
  });

  it('tells the driver story under the slider and toggles follow mode', () => {
    act(() => {
      useUiStore.getState().resetForPlan(samplePlan.recommended_route_id);
    });
    renderMap(samplePlan);
    act(() => {
      useUiStore.getState().setForecastHour(10);
    });
    expect(screen.getByText(/ mi of /)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Follow driver/ }));
    expect(useUiStore.getState().isFollowingDriver).toBe(true);
    expect(screen.getByRole('button', { name: /Following/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
