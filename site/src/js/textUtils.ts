import { siteLocale } from "@config/siteSettings.json";

/**
 * * returns a formatted date string in the site's locale (siteLocale in siteSettings)
 * @param date: date to format
 */
export function formatDate(date: string | number | Date): string {
  return new Date(date).toLocaleDateString(siteLocale, {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
