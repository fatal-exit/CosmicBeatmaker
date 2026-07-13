/**
 * Supported orbit periods expressed in exact quarter-bar units. Keep this as
 * the single catalog used by validation, rate ordering, and super-loop math.
 */
export const LOOP_RATE_DEFINITIONS = [
  { bars: 0.25, quarterBarUnits: 1 },
  { bars: 0.5, quarterBarUnits: 2 },
  { bars: 1, quarterBarUnits: 4 },
  { bars: 1.5, quarterBarUnits: 6 },
  { bars: 2, quarterBarUnits: 8 },
  { bars: 3, quarterBarUnits: 12 },
  { bars: 4, quarterBarUnits: 16 },
  { bars: 6, quarterBarUnits: 24 },
  { bars: 8, quarterBarUnits: 32 },
] as const;

export type SupportedLoopBars = (typeof LOOP_RATE_DEFINITIONS)[number]["bars"];

export const LOOP_BAR_RATES: readonly SupportedLoopBars[] =
  LOOP_RATE_DEFINITIONS.map(({ bars }) => bars);

export const QUARTER_BAR_UNITS_PER_BAR = 4 as const;

const quarterBarUnitsByRate = new Map<number, number>(
  LOOP_RATE_DEFINITIONS.map(({ bars, quarterBarUnits }) => [
    bars,
    quarterBarUnits,
  ]),
);

export function isLoopBars(value: unknown): value is SupportedLoopBars {
  return typeof value === "number" && quarterBarUnitsByRate.has(value);
}

export function loopBarsToQuarterBarUnits(loopBars: SupportedLoopBars): number {
  const units = quarterBarUnitsByRate.get(loopBars);
  if (units === undefined) {
    throw new Error(`Unsupported loop rate: ${String(loopBars)} bars.`);
  }
  return units;
}

export function loopBarRateIndex(loopBars: SupportedLoopBars): number {
  const index = LOOP_BAR_RATES.indexOf(loopBars);
  if (index < 0) {
    throw new Error(`Unsupported loop rate: ${String(loopBars)} bars.`);
  }
  return index;
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

export function greatestCommonDivisor(left: number, right: number): number {
  assertPositiveSafeInteger(left, "GCD left operand");
  assertPositiveSafeInteger(right, "GCD right operand");
  let dividend = left;
  let divisor = right;
  while (divisor !== 0) {
    const remainder = dividend % divisor;
    dividend = divisor;
    divisor = remainder;
  }
  return dividend;
}

/** Exact integer LCM with overflow protection; no floating approximation. */
export function leastCommonMultipleIntegers(values: readonly number[]): number {
  if (values.length === 0) {
    throw new Error("LCM requires at least one integer period.");
  }

  let result = values[0];
  assertPositiveSafeInteger(result, "LCM period");
  for (const value of values.slice(1)) {
    assertPositiveSafeInteger(value, "LCM period");
    const next = (result / greatestCommonDivisor(result, value)) * value;
    if (!Number.isSafeInteger(next)) {
      throw new Error("LCM exceeds the safe integer timing range.");
    }
    result = next;
  }
  return result;
}

export function superLoopBarsForRates(
  rates: readonly SupportedLoopBars[],
): number {
  const quarterBarUnits = leastCommonMultipleIntegers(
    rates.map(loopBarsToQuarterBarUnits),
  );
  return quarterBarUnits / QUARTER_BAR_UNITS_PER_BAR;
}

/** The complete supported planet-rate catalog always resynchronizes by bar 24. */
export const MAX_SUPPORTED_RATE_SUPER_LOOP_BARS =
  superLoopBarsForRates(LOOP_BAR_RATES);
