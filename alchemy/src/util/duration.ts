export type DurationUnit =
  | "ns"
  | "us"
  | "µs"
  | "ms"
  | "s"
  | "m"
  | "h"
  | "d"
  | "w"
  | "y";

export const durationUnits: Record<DurationUnit, number> = {
  ns: 0.000001,
  us: 0.001,
  µs: 0.001,
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  y: 365 * 24 * 60 * 60 * 1000,
};

const ALL_UNITS = Object.fromEntries(
  Object.keys(durationUnits).map((unit) => [unit as DurationUnit, true]),
) as Partial<Record<DurationUnit, boolean>>;

/**
 * Format a duration value with appropriate decimal handling
 */
function formatDurationValue(
  value: number,
  unit: DurationUnit,
  decimalPlaces: number,
  shouldShowDecimals = false,
): string {
  if (value % 1 === 0 || !shouldShowDecimals) {
    return `${Math.floor(value)}${unit}`;
  }

  return `${value.toFixed(decimalPlaces).replace(/\.?0+$/, "")}${unit}`;
}

/**
 * Duration value supporting both number (seconds) and string format (value + unit)
 * Units: ms (milliseconds), s (seconds), m (minutes), h (hours)
 * Examples: 30, "30s", "1m", "500ms", "2h"
 */
export type DurationString = `${number}${DurationUnit}`;

/**
 * Format a duration string.
 * @param duration The duration to format.
 * @param unit The unit to use for the duration.
 * @returns
 */
export function formatDuration(
  duration: number,
  opts: {
    /**
     * The unit to convert to.
     */
    to: DurationUnit | Partial<Record<DurationUnit, boolean>>;

    /**
     * The unit to convert from.
     * @default "ms"
     */
    from?: DurationUnit;

    /**
     * The decimal places to round to.
     * @default 2
     */
    decimalPlaces?: number;
  } = {
    to: ALL_UNITS,
    from: "ms",
    decimalPlaces: 2,
  },
) {
  let { to, from = "ms", decimalPlaces = 2 } = opts;
  if (typeof to === "string") {
    to = { [to as DurationUnit]: true };
  }

  // Convert duration to milliseconds
  let value = duration * durationUnits[from];

  // Handle specific unit requests
  const units: DurationUnit[] = [
    "y",
    "w",
    "d",
    "h",
    "m",
    "s",
    "ms",
    "us",
    "µs",
    "ns",
  ];
  const requestedUnits = units.filter((unit) => to[unit]);

  if (requestedUnits.length === 0) {
    return "";
  }

  // For single unit requests, show that unit with decimals if needed
  if (requestedUnits.length === 1) {
    const unit = requestedUnits[0];
    const unitMs = durationUnits[unit];
    const unitValue = value / unitMs;
    return formatDurationValue(unitValue, unit, decimalPlaces, true);
  }

  // For multiple unit requests
  return formatDurationMulti(value, decimalPlaces);
}

/**
 * Format duration for multiple units
 */
function formatDurationMulti(value: number, decimalPlaces: number): string {
  const units: DurationUnit[] = [
    "y",
    "w",
    "d",
    "h",
    "m",
    "s",
    "ms",
    "us",
    "µs",
    "ns",
  ];
  let formatted = "";

  for (const unit of units) {
    const unitMs = durationUnits[unit];

    if (value >= unitMs) {
      const unitValue = Math.floor(value / unitMs);
      formatted += `${formatted ? " " : ""}${unitValue}${unit}`;
      value %= unitMs;

      // If there's no remainder, we're done
      if (value === 0) break;
    }
  }

  // If we still have a remainder and no units were shown, show it in the smallest unit
  if (formatted === "" && value > 0) {
    formatted = formatDurationValue(
      value / durationUnits.ms,
      "ms",
      decimalPlaces,
      true,
    );
  }

  return formatted || "0ms";
}

/**
 * Parse a duration string to a specified unit.
 * @param durationString The duration string to parse (e.g., "1m 30s", "0.02m", "1ms")
 * @param to The unit to convert to (defaults to "ms")
 * @returns The duration in the specified unit
 * @example
 * parseDuration("1m 30s") // 90000 (milliseconds)
 * parseDuration("0.02m", "s") // 1.2 (seconds)
 * parseDuration("1ms", "us") // 1000 (microseconds)
 */
export function parseDuration(
  durationString: string,
  to: DurationUnit = "ms",
): number {
  if (!durationString || typeof durationString !== "string") {
    throw new Error("Duration string must be a non-empty string");
  }

  // Split by spaces to handle multiple units
  const parts = durationString.trim().split(/\s+/);

  let totalMs = 0;

  for (const part of parts) {
    if (!part) continue;

    // Match pattern: number + optional decimal + unit
    const match = part.match(/^(\d+(?:\.\d+)?)([a-zµ]+)$/i);
    if (!match) {
      // Try alternative pattern for units like "us" or "µs"
      const altMatch = part.match(/^(\d+(?:\.\d+)?)(us|µs)$/i);
      if (altMatch) {
        const [, numberStr, unit] = altMatch;
        const value = Number.parseFloat(numberStr);

        if (Number.isNaN(value)) {
          throw new Error(`Invalid number in duration: "${numberStr}"`);
        }

        const unitMs = durationUnits[unit.toLowerCase() as DurationUnit];
        if (unitMs === undefined) {
          throw new Error(`Unknown duration unit: "${unit}"`);
        }

        totalMs += value * unitMs;
        continue;
      }
      throw new Error(`Invalid duration format: "${part}"`);
    }

    const [, numberStr, unit] = match;
    const value = Number.parseFloat(numberStr);

    if (Number.isNaN(value)) {
      throw new Error(`Invalid number in duration: "${numberStr}"`);
    }

    // Convert to milliseconds
    const unitMs = durationUnits[unit.toLowerCase() as DurationUnit];
    if (unitMs === undefined) {
      throw new Error(`Unknown duration unit: "${unit}"`);
    }

    totalMs += value * unitMs;
  }

  // Convert to target unit
  const targetUnitMs = durationUnits[to];
  if (targetUnitMs === undefined) {
    throw new Error(`Unknown target unit: "${to}"`);
  }

  const result = totalMs / targetUnitMs;
  return Math.round(result * 1000000) / 1000000; // Round to 6 decimal places to avoid floating point issues
}
