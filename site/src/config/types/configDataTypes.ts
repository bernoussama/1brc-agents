/**
 * * Types for the typed config data files in src/config/.
 * Add interfaces here as you add data files (faq, testimonials, team, …).
 */

// --------------------------------------------------------
// site data (meta / branding)
export interface SiteDataProps {
  name: string;
  title: string;
  description: string;
  // used for blog post / article metadata
  author: {
    name: string;
    email: string;
    twitter: string; // for twitter card attribution, e.g. "@handle" minus the @
  };
  // fallback social/OG image when a page has none
  defaultImage: {
    src: string;
    alt: string;
  };
  // social/profile URLs for the site's Organization JSON-LD (`sameAs`). Empty is fine.
  sameAs?: readonly string[];
}

// --------------------------------------------------------
// primary navigation (the header link set). See src/config/navData.json.ts.
export interface NavItemProps {
  label: string; // Title-case; uppercased in the UI (Press Start 2P)
  href: string; // trailing-slash route (astro.config `trailingSlash: "always"`)
}

// --------------------------------------------------------
// social platforms (label + glyph + how the URL resolves). See src/config/socialData.json.ts.
export interface SocialPlatformProps {
  label: string; // accessible name / chip label, e.g. "Twitter/X"
  // pixel-icon glyph name; omitted for a platform with no glyph in the 18-icon set (Discord)
  icon?: string;
  // host substring(s) identifying this platform inside siteData.sameAs
  match: string | readonly string[];
  // where the link points when sameAs has no match — a platform home page, not a profile
  fallback: string;
}

// --------------------------------------------------------
// legal pages (terms, privacy), keyed by document
export interface LegalSection {
  heading: string;
  // each entry renders as its own <p>
  body: string[];
}

export interface LegalPageProps {
  title: string;
  description: string; // meta description (SEO)
  lastUpdated: string; // ISO date (YYYY-MM-DD); formatted at render via formatDate
  intro: string;
  sections: LegalSection[];
}

// the two documents each locale's legalData file must provide
export type LegalData = Record<"terms" | "privacy", LegalPageProps>;

// --------------------------------------------------------
// portfolio data (buyer-customized copy + values). See src/config/portfolioData.json.ts.
// Only the facts a buyer is expected to make their own — identity, biography, experience/stat values,
// the home intro, and the contact prompt. Presentational labels (SYS_SPECS, "Role:", stat colours)
// stay in their components. First-person singular voice throughout (one developer's portfolio).
export interface PortfolioDataProps {
  profile: {
    tagline: string; // About-hero badge, e.g. "Dev 01"
    heading: string; // About-hero H1
    role: string; // DevProfile ROLE value
    years: string; // DevProfile YRS value
    bio: readonly string[]; // About-hero biography, one <p> per entry
    shortBio: string; // home About-section bio
    meta: { location: string; role: string; favorite: string }; // home About-section meta values
    skills: readonly { label: string; pct: number }[]; // DevProfile HP-style skill bars
  };
  // Retro scoreboard values (home Stats strip + About-hero strip). Display text only; each strip's
  // per-stat colours live in its component and pair by order.
  stats: {
    home: readonly string[];
    profile: readonly string[];
  };
  home: { tagline: string; heading: string; intro: string }; // home hero
  contact: { prompt: string }; // home Contact-section prompt
}

// --------------------------------------------------------
// site settings
export interface SiteSettingsProps {
  useViewTransitions?: boolean;
  // master switch for the decorative motion layer (scroll-reveal via <Reveal>, etc.).
  // Independent of `prefers-reduced-motion`, which is always honored by the global guard in motion/index.css.
  useAnimations?: boolean;
}
