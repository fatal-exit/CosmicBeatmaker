import {
  isLoopBars,
  LOOP_RATE_DEFINITIONS,
  type LoopBars,
} from "../../domain/composition";

const COMMON_RATE_BARS = new Set<LoopBars>([0.5, 1, 2, 4]);

function compactRateLabel(bars: LoopBars): string {
  if (bars === 0.25) return "¼";
  if (bars === 0.5) return "½";
  if (bars === 1.5) return "1½";
  return String(bars);
}

export function formatOrbitRate(bars: LoopBars): string {
  const unit = bars === 0.25 || bars === 0.5 || bars === 1 ? "bar" : "bars";
  return `${compactRateLabel(bars)} ${unit}`;
}

export function formatOrbitLoop(bars: LoopBars): string {
  return `${compactRateLabel(bars)}-bar loop`;
}

export function formatBarCount(bars: number): string {
  return `${bars} ${bars === 1 ? "bar" : "bars"}`;
}

export const ORBIT_RATE_OPTIONS = LOOP_RATE_DEFINITIONS.map(({ bars }) => ({
  bars,
  compactLabel: compactRateLabel(bars),
  label: formatOrbitRate(bars),
  common: COMMON_RATE_BARS.has(bars),
}));

export const COMMON_ORBIT_RATE_OPTIONS = ORBIT_RATE_OPTIONS.filter(
  ({ common }) => common,
);

export const DEEP_ORBIT_RATE_OPTIONS = ORBIT_RATE_OPTIONS.filter(
  ({ common }) => !common,
);

export function parseOrbitRate(value: string): LoopBars | undefined {
  const bars = Number(value);
  return isLoopBars(bars) ? bars : undefined;
}
