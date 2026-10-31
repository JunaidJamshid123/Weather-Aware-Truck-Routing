import {
  checkpointPaint,
  heatmapPaint,
  heatmapWeight,
  routeLayout,
  routeLinePaint,
} from './layerStyles';

describe('heatmap paint', () => {
  it('reads the selected hour and maps risk 0–4 to weight 0–1, clamping unknown to 0', () => {
    expect(heatmapWeight(0)).toEqual(['/', ['max', ['get', 'r0'], 0], 4]);
    expect(heatmapWeight(37)).toEqual(['/', ['max', ['get', 'r37'], 0], 4]);
  });

  it('only the weight changes between hours', () => {
    const { ['heatmap-weight']: weightA, ...restA } = heatmapPaint(3);
    const { ['heatmap-weight']: weightB, ...restB } = heatmapPaint(30);
    expect(weightA).not.toEqual(weightB);
    expect(restA).toEqual(restB);
  });

  it('fades out at street-level zoom so checkpoints stay readable', () => {
    expect(heatmapPaint(0)['heatmap-opacity']).toEqual([
      'interpolate',
      ['linear'],
      ['zoom'],
      10,
      0.9,
      12,
      0.15,
    ]);
  });
});

describe('route paint', () => {
  it('colors routes by id and highlights the selected one', () => {
    const paint = routeLinePaint('route-2');
    expect(paint['line-color']).toEqual([
      'match',
      ['get', 'routeId'],
      'route-1',
      '#2563eb',
      'route-2',
      '#7c3aed',
      'route-3',
      '#0891b2',
      '#475569',
    ]);
    expect(paint['line-opacity']).toEqual(['case', ['==', ['get', 'routeId'], 'route-2'], 1, 0.4]);
  });

  it('draws the selected route on top', () => {
    expect(routeLayout('route-3')['line-sort-key']).toEqual([
      'case',
      ['==', ['get', 'routeId'], 'route-3'],
      1,
      0,
    ]);
  });

  it('never matches a route when nothing is selected', () => {
    expect(routeLinePaint(null)['line-opacity']).toEqual([
      'case',
      ['==', ['get', 'routeId'], ''],
      1,
      0.4,
    ]);
  });
});

describe('checkpoint paint', () => {
  it('colors by risk level with grey for unknown', () => {
    expect(checkpointPaint(null)['circle-color']).toEqual([
      'match',
      ['get', 'riskLevel'],
      0,
      '#2e9e5b',
      1,
      '#f2c230',
      2,
      '#f28c28',
      3,
      '#d7263d',
      4,
      '#111111',
      '#9ca3af',
    ]);
  });
});
