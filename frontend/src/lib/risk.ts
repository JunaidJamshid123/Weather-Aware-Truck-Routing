/** Display metadata only; the backend decides risk levels. */

export const RISK_NAMES = ['LOW', 'MODERATE', 'HIGH', 'SEVERE', 'NO_TRAVEL'] as const;
export type RiskName = (typeof RISK_NAMES)[number];

export type RiskMeta = {
  name: RiskName;
  level: number;
  label: string;
  color: string;
  /** 0–1; LOW is faint, NO_TRAVEL is hot. */
  heatWeight: number;
};

export const MAX_RISK_LEVEL = RISK_NAMES.length - 1;

const RISK_COLORS: Record<RiskName, string> = {
  LOW: '#2e9e5b',
  MODERATE: '#f2c230',
  HIGH: '#f28c28',
  SEVERE: '#d7263d',
  NO_TRAVEL: '#111111',
};

const RISK_LABELS: Record<RiskName, string> = {
  LOW: 'Low',
  MODERATE: 'Moderate',
  HIGH: 'High',
  SEVERE: 'Severe',
  NO_TRAVEL: 'No Travel',
};

export const RISK_META: Readonly<Record<RiskName, RiskMeta>> = Object.fromEntries(
  RISK_NAMES.map((name, level) => [
    name,
    {
      name,
      level,
      label: RISK_LABELS[name],
      color: RISK_COLORS[name],
      heatWeight: level / MAX_RISK_LEVEL,
    },
  ]),
) as Record<RiskName, RiskMeta>;

export const RISK_SCALE: readonly RiskMeta[] = RISK_NAMES.map((name) => RISK_META[name]);

/** Missing forecasts are grey, never shown as LOW. */
export const UNKNOWN_RISK_COLOR = '#9ca3af';
export const UNKNOWN_RISK_LABEL = 'Forecast unavailable';
/** Keeps black NO_TRAVEL markers visible on dark map areas. */
export const NO_TRAVEL_RING_COLOR = '#ffffff';
/** "No forecast" in the API and our GeoJSON. */
export const UNKNOWN_RISK_LEVEL = -1;

export const riskMetaForLevel = (level: number | null): RiskMeta | null =>
  level === null ? null : (RISK_SCALE[level] ?? null);
