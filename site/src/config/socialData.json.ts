import type { PixelIconName } from "@components/svg/pixel-icons";
import { socialUrl } from "@js/social";

import siteData from "./siteData.json";
import { type SocialPlatformProps } from "./types/configDataTypes";

/**
 * * Social platforms — one definition per platform, resolved against `siteData.sameAs`.
 *
 * Previously the footer, the home Contact section and the contact InfoCards each carried their own
 * platform list, so a platform's label, glyph and URL derivation existed in three places and a change
 * to any of them was a three-file edit. They live here now; a section still chooses WHICH platforms it
 * shows (that is genuinely per-section), but never how one resolves.
 *
 * `match` is the host substring(s) that identify the platform inside `sameAs`; `fallback` is where the
 * link points when `sameAs` has no match. **A buyer who leaves `sameAs` empty gets the fallbacks —
 * bare platform home pages, not profiles.** That is deliberate (a dead link to your own handle is
 * worse than a link to the platform), but it means filling `sameAs` is a launch task, not a nicety.
 * See the README's "Before you deploy".
 */
export const socialPlatforms = {
  github: {
    label: "GitHub",
    icon: "github",
    match: "github.com",
    fallback: "https://github.com/",
  },
  linkedin: {
    label: "LinkedIn",
    icon: "linkedin",
    match: "linkedin.com",
    fallback: "https://www.linkedin.com/",
  },
  // `author.twitter` wins when set, because a handle is more specific than a sameAs host match.
  twitter: {
    label: "Twitter/X",
    icon: "twitter",
    match: ["x.com", "twitter.com"],
    fallback: "https://x.com/",
  },
  youtube: {
    label: "YouTube",
    icon: "youtube",
    match: "youtube.com",
    fallback: "https://www.youtube.com/",
  },
  // No pixel glyph in the 18-icon set — used by InfoCards, which renders text values, not icons.
  discord: {
    label: "Discord",
    match: ["discord.gg", "discord.com"],
    fallback: "https://discord.gg/",
  },
} as const satisfies Record<string, SocialPlatformProps>;

export type SocialPlatform = keyof typeof socialPlatforms;

/** Platforms that have a pixel glyph, so a section can render one as an icon or a chip. */
export type IconSocialPlatform = {
  [K in SocialPlatform]: (typeof socialPlatforms)[K] extends { icon: PixelIconName } ? K : never;
}[SocialPlatform];

/**
 * * Resolve a platform's destination URL.
 *
 * The one derivation every section shares: the first matching `sameAs` entry, else the platform's
 * fallback. Twitter/X additionally prefers `siteData.author.twitter` when the buyer set a handle.
 *
 * @param platform a key of `socialPlatforms`
 * @returns an absolute URL, never empty
 */
export function socialHref(platform: SocialPlatform): string {
  const { match, fallback } = socialPlatforms[platform];
  if (platform === "twitter" && siteData.author.twitter) {
    return `https://x.com/${siteData.author.twitter}`;
  }
  return socialUrl(siteData.sameAs, match, fallback);
}

/** A platform's label + glyph + resolved href — the shape the footer row and home chips render. */
export function socialLink(platform: IconSocialPlatform): {
  name: PixelIconName;
  label: string;
  href: string;
} {
  const { label, icon } = socialPlatforms[platform];
  return { name: icon, label, href: socialHref(platform) };
}
