import { haversineMi } from './geo';
import { MAX_RISK_LEVEL, RISK_META, RISK_NAMES, RISK_SCALE, riskMetaForLevel } from './risk';

describe('RISK_META', () => {
  it('orders levels 0–4 like the backend enum', () => {
    expect(RISK_SCALE.map((meta) => [meta.name, meta.level])).toEqual([
      ['LOW', 0],
      ['MODERATE', 1],
      ['HIGH', 2],
      ['SEVERE', 3],
      ['NO_TRAVEL', 4],
    ]);
  });

  it('uses the specified palette', () => {
    expect(RISK_NAMES.map((name) => RISK_META[name].color)).toEqual([
      '#2e9e5b',
      '#f2c230',
      '#f28c28',
      '#d7263d',
      '#111111',
    ]);
  });

  it('maps heat weight linearly from 0 (LOW) to 1 (NO_TRAVEL)', () => {
    expect(RISK_META.LOW.heatWeight).toBe(0);
    expect(RISK_META.HIGH.heatWeight).toBe(0.5);
    expect(RISK_META.NO_TRAVEL.heatWeight).toBe(1);
    expect(MAX_RISK_LEVEL).toBe(4);
  });

  it('has a human label for every level', () => {
    expect(RISK_META.NO_TRAVEL.label).toBe('No Travel');
    expect(RISK_SCALE.every((meta) => meta.label.length > 0)).toBe(true);
  });

  it('resolves levels, treating null and out-of-range as unknown', () => {
    expect(riskMetaForLevel(3)?.name).toBe('SEVERE');
    expect(riskMetaForLevel(null)).toBeNull();
    expect(riskMetaForLevel(-1)).toBeNull();
    expect(riskMetaForLevel(9)).toBeNull();
  });
});

describe('haversineMi', () => {
  it('matches the known Dallas–Denver great-circle distance within 0.5%', () => {
    const miles = haversineMi({ lat: 32.7767, lon: -96.797 }, { lat: 39.7392, lon: -104.9903 });
    expect(miles).toBeGreaterThan(663 * 0.995);
    expect(miles).toBeLessThan(663 * 1.005);
  });

  it('is zero for the same point', () => {
    expect(haversineMi({ lat: 40, lon: -100 }, { lat: 40, lon: -100 })).toBe(0);
  });
});
