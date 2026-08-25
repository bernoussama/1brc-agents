/** Format median milliseconds for chart tooltips and bar labels. */
export function formatMs(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
