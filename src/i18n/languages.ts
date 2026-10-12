/**
 * Every language the landing page is published in, sorted alphabetically by native name (keep it that
 * way: this order drives the language dropdown). `defaultLanguageCode` is served at `/` and used as
 * x-default. To add a language: add an entry here in alphabetical order, create `src/i18n/<code>.json`
 * with the same keys as `en.json`, add a one-line `<path>/index.html` stub (the locale plugin renders it
 * from `/index.html`) and translated `<path>privacy/` and `<path>terms/` pages. On a first visit, browsers
 * whose preferred language matches `code` (or its base language) are sent to `path`.
 *
 * macos/scripts/l10n.py reads every quoted code in this file as a shipped landing language. Sunny's lines come
 * from the app's String Catalog, and are voiced wherever the voice manifest
 * (app-data/voice/manifest.json) has the language.
 */
export const languages = [
  { code: "de", path: "/de/", label: "DE", nativeName: "Deutsch", ogLocale: "de_DE" },
  { code: "en", path: "/", label: "EN", nativeName: "English", ogLocale: "en_US" },
  { code: "es", path: "/es/", label: "ES", nativeName: "Español", ogLocale: "es_ES" },
  { code: "fr", path: "/fr/", label: "FR", nativeName: "Français", ogLocale: "fr_FR" },
  { code: "it", path: "/it/", label: "IT", nativeName: "Italiano", ogLocale: "it_IT" },
  {
    code: "pt-BR",
    path: "/pt-br/",
    label: "PT",
    nativeName: "Português (Brasil)",
    ogLocale: "pt_BR",
  },
  { code: "ro", path: "/ro/", label: "RO", nativeName: "Română", ogLocale: "ro_RO" },
] as const;

export type Language = (typeof languages)[number];
export type LanguageCode = Language["code"];

export const defaultLanguageCode: LanguageCode = "en";
