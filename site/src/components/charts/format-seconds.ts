/** Format milliseconds as seconds with an "s" suffix. */
export function formatSecondsFromMs(ms: number): string {
  const seconds = ms / 1000;
  return `${seconds.toLocaleString(undefined, { maximumFractionDigits: 1 })}s`;
}

/** Y-axis ticks from millisecond scale values. */
export function formatYAxisSecondsFromMs(ms: number): string {
  const seconds = ms / 1000;
  return `${seconds.toLocaleString(undefined, { maximumFractionDigits: seconds < 10 ? 1 : 0 })}s`;
}
