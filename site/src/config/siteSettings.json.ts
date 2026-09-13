/**
 * * Global site settings.
 *
 * Single-language site (the i18n layer was removed). To internationalize, reintroduce a
 * locales list, per-locale data registries + helpers, and the `i18n` block in
 * astro.config.mjs — git history records the old shape.
 */

import { type SiteSettingsProps } from "./types/configDataTypes";

// the site's language: <html lang> attribute
export const siteLang = "en" as const;
// BCP-47 tag for Intl date formatting (formatDate), og:locale, and JSON-LD inLanguage
export const siteLocale = "en-US" as const;

// settings that don't change between pages.
// `satisfies` checks the shape while preserving the literal `true` (vs widening to boolean).
export const siteSettings = {
  useViewTransitions: true,
  // turn the decorative motion layer (scroll-reveal <Reveal>, etc.) on/off site-wide.
  // `prefers-reduced-motion` is always honored regardless (global guard in styles/motion/index.css).
  useAnimations: true,
} satisfies SiteSettingsProps;
