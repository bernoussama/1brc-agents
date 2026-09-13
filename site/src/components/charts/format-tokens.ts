/** Compact token count for bar labels and Y-axis ticks. */
export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`;
  }
  return value.toLocaleString();
}

/** Full token count for tooltips. */
export function formatTokenCountDetailed(value: number): string {
  return `${value.toLocaleString()} tokens`;
}
