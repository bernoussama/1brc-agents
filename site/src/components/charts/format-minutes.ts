/** Format agent wall time (seconds) as minutes with an "m" suffix. */
export function formatMinutesFromSeconds(seconds: number): string {
  const minutes = seconds / 60;
  return `${minutes.toLocaleString(undefined, { maximumFractionDigits: 1 })}m`;
}

/** Y-axis ticks from second-scale values. */
export function formatYAxisMinutesFromSeconds(seconds: number): string {
  return formatMinutesFromSeconds(seconds);
}
