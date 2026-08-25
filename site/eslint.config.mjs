import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import astro from "eslint-plugin-astro";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },

  // Astro + jsx-a11y for .astro files
  ...astro.configs.recommended,
  ...astro.configs["jsx-a11y-recommended"],
  {
    files: ["**/*.astro"],
    rules: {
      // ImageMetadata and other Astro types are globally available
      "no-undef": "off",
    },
  },

  {
    // UI primitives (and the svg/icons primitive) intentionally export their `tv()` config
    // from the .astro frontmatter so consumers can compose/extend it (the astro-boiler
    // primitive contract — see src/components/ui/README.md). The export is a static config,
    // importable at build time.
    files: ["src/components/ui/**/*.astro", "src/components/svg/**/*.astro"],
    rules: {
      "astro/no-exports-from-components": "off",
    },
  },

  {
    // `scripts/` is no longer ignored: it holds one file, the test runner, and it lints clean.
    // The blanket ignore existed for the one-shot removal scripts, which ran and were deleted.
    ignores: ["dist/**", ".astro/**", "**/*.d.ts"],
  },
]);
