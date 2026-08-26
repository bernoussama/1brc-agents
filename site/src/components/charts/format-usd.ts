/** Format USD for chart labels and tooltips. */
export function formatUsd(value: number): string {
  if (value >= 100) {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (value >= 10) {
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
  }
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Y-axis ticks for USD amounts. */
export function formatYAxisUsd(value: number): string {
  return formatUsd(value);
}

/** Tooltip copy when a metric is unavailable. */
export function formatUsdDetailed(value: number): string {
  return formatUsd(value);
}
