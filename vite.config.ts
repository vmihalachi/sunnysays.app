import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { appleIcon, companionLanding, escapeAttr, escapeHtml, scriptJson } from "@laching/landing";
import { defineConfig } from "vite-plus";
import { appData } from "./app-data";
import { createVoices } from "./voice";
import {
  defaultLanguageCode,
  languages,
  type Language,
  type LanguageCode,
} from "./src/i18n/languages";

const root = __dirname;

/**
 * The one-letter words that never end a line on the page ("à / la lumière", "y / nadie"), per language. Sunny's
 * lines come from the catalog, which the app shares, and the locale files get new strings from the localization
 * workflow, so the join happens here, on the page's copy, wherever the text comes from.
 */
const oneLetterWords: Partial<Record<LanguageCode, readonly string[]>> = {
  "pt-BR": ["a", "o", "e", "é", "à"],
  es: ["y", "a", "o", "e", "u"],
  fr: ["à", "y", "a"],
  it: ["e", "a", "o", "è", "i"],
  ro: ["a", "o", "e", "ș-i"],
};

/** Text as the page shows it in a language: its one-letter words kept with the next word. */
function keepOneLetterWords(text: string, code: LanguageCode): string {
  const words = oneLetterWords[code];
  if (!words) return text;
  // A whole word only, not the "a" of "s-a" or "l'a"; the space after it becomes a no-break space (U+00A0).
  const oneLetter = new RegExp(`(?<![\\p{L}\\p{N}'’-])(${words.join("|")}) (?=\\S)`, "giu");
  // Then a one-letter part before a hyphen ("M-ai", "N-am", "garde-à-vous") keeps the rest of its word on
  // its line: a word joiner (U+2060) after the hyphen, as in "într-un". This runs second, so the "a" of
  // "S-a" is never taken for a word of its own above. Text that already has the join is left as it is.
  const hyphenated = /(?<![\p{L}\p{N}])(\p{L})-(?=\p{L})/gu;
  return text
    .replace(oneLetter, `$1${String.fromCodePoint(0xa0)}`)
    .replace(hyphenated, `$1-${String.fromCodePoint(0x2060)}`);
}

/** A locale file's strings, each kept by `keepOneLetterWords`. */
function keepOneLetterWordsIn(value: unknown, code: LanguageCode): unknown {
  if (typeof value === "string") return keepOneLetterWords(value, code);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, keepOneLetterWordsIn(entry, code)]),
    );
  return value;
}

/**
 * Each language's locale file, its page copy joined like Sunny's lines. `locale` (the `lang` attribute and the
 * social card's file name), `meta` (the head's tags and the URL) and `og` (the social card, whose lines never
 * wrap) stay as written.
 */
const asWritten = new Set(["locale", "meta", "og"]);
const locales = Object.fromEntries(
  languages.map(({ code }) => {
    const locale = JSON.parse(readFileSync(resolve(root, `src/i18n/${code}.json`), "utf8"));
    const shown = Object.entries(locale).map(([key, value]) => [
      key,
      asWritten.has(key) ? value : keepOneLetterWordsIn(value, code),
    ]);
    return [code, Object.fromEntries(shown)];
  }),
) as Record<LanguageCode, any>;

function catalogString(key: string, language: Language): string {
  const value = data.lines[key]?.[language.code];
  if (!value)
    throw new Error(`No ${key} in the String Catalog (app-data/lines.json) for ${language.code}`);
  return value;
}

function phrase(id: string, language: Language): string {
  return catalogString(`phrase.${id}`, language);
}

/** A line of Sunny's as the page shows it: the catalog text, its one-letter words kept with the next word. */
function shownPhrase(id: string, language: Language): string {
  return keepOneLetterWords(phrase(id, language), language.code);
}

/** A line as the page's script gets it: the text, plus each recorded voice's clip where the language has one. */
function spokenLine(id: string, language: Language) {
  const voices = voice.clips(language.code, id);
  return { text: shownPhrase(id, language), ...(voices ? { voices } : {}) };
}

/**
 * The voice switch under Sunny, on pages whose language has more than one recorded voice: one option per
 * voice, the default first, named like the app's voice pickers (the String Catalog's `voice.<id>`).
 */
function renderVoiceSwitch(language: Language, label: string) {
  const voices = voice.voices(language.code);
  if (voices.length < 2) return "";
  const options = voices
    .map(
      (name, index) =>
        `<button type="button" role="radio" data-voice="${name}" aria-checked="${index === 0}" tabindex="${
          index === 0 ? 0 : -1
        }">${escapeHtml(catalogString(`voice.${name}`, language))}</button>`,
    )
    .join("");
  return `<div class="voice-switch" role="radiogroup" aria-label="${escapeAttr(label)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>${options}</div>`;
}

/**
 * What Sunny says when the hero's toggles change its day (main.js): coming back, a low battery, dark mode and
 * late at night.
 */
const sceneLines = ["back-chair", "battery-light", "dark-glow", "night-stars"];

/** The lines the hero's Sunny says when poked, in the order it cycles through them (shuffled at runtime). */
const pokeLines = [
  "poke-here",
  "poke-petals",
  "poke-pressed",
  "poke-always",
  "poke-yours",
  "general-believe",
  "general-photosynthesis",
  "general-bee",
  "general-roots",
  "general-fluffle",
  "general-clouds",
  "general-still-yellow",
  "general-printer",
  "general-tuesdays",
  "general-good-day",
  "night-stars",
  "morning-coffee",
  "afternoon-peak",
];

/** The lines Sunny says on the page besides the poke and scene lines. */
const otherLines = ["shh-good", "call-still", "general-hi"];
const spokenIds = [...pokeLines, ...sceneLines, ...otherLines];

/**
 * Sunny's lines come from the app's String Catalog (`phrase.<id>`, plus each voice's name, `voice.<id>`),
 * never from the landing's own JSON, so the page quotes exactly what the app says, in every language the
 * catalog has. They're voiced wherever the voice manifest has the language. Both come through `app-data/`
 * (app-data.ts).
 */
const data = appData({
  landingRoot: root,
  keys: [...new Set(spokenIds)].map((id) => `phrase.${id}`),
  clipIds: [...new Set(spokenIds)],
});
const voice = createVoices(data.voiceDir);

const siteUrl = "https://sunnysays.app";
/**
 * The Mac App Store listing. Set it to `https://apps.apple.com/app/id6820142690` (the Apple ID from App Store
 * Connect) once the app is approved; the URL 404s before that. Until then the page shows "Coming soon to the Mac
 * App Store" instead of a link.
 */
const appStoreUrl: string | null = null;
/** The Microsoft Store listing (`https://apps.microsoft.com/detail/<product ID>` from Partner Center), the same way. */
const microsoftStoreUrl: string | null = null;

const windowsIcon =
  '<svg class="store-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="currentColor"><rect x="1" y="1" width="10.5" height="10.5"/><rect x="12.5" y="1" width="10.5" height="10.5"/><rect x="1" y="12.5" width="10.5" height="10.5"/><rect x="12.5" y="12.5" width="10.5" height="10.5"/></g></svg>';

/** One store's button: a link once there's a listing, a dashed "coming soon" before. */
function storeLink(
  store: string,
  url: string | null,
  icon: string,
  label: string,
  soon: string,
  big: boolean,
) {
  const size = big ? " button-big" : "";
  return url
    ? `<a class="button${size}" data-store="${store}" href="${escapeAttr(url)}">${icon}<span>${escapeHtml(label)}</span></a>`
    : `<span class="button button-soon${size}" data-store="${store}">${icon}<span>${escapeHtml(soon)}</span></span>`;
}

/** Both stores' buttons; `main.js` puts the visitor's own first. */
function storeButtons(locale: any, big: boolean) {
  const { store } = locale;
  return `<div class="store-buttons">${storeLink("mac", appStoreUrl, appleIcon, store.mac, store.soon, big)}${storeLink("windows", microsoftStoreUrl, windowsIcon, store.windows, store.windowsSoon, big)}</div>`;
}

/**
 * The page's plumbing (every language's home page from `index.html`, the legal pages' links, the sitemap, the
 * `_headers` with its CSP, the social cards and icons) is Laching's (`@laching/landing`); what's here is
 * sunnysays' data: its languages and URLs, Sunny's lines and voices, and the card's bubble.
 */
const landing = companionLanding({
  root,
  siteUrl,
  appStoreUrl,
  storeButton: storeButtons,
  // What `laching-landing check` holds the legal pages to, in every language: both stores (the store buttons'
  // listings, null until live) and both platforms, named as the pages write them. They change no page.
  stores: { apple: appStoreUrl, microsoft: microsoftStoreUrl },
  platforms: ["Mac", "Windows"],
  contactEmail: "hello@sunnysays.app",
  languages,
  defaultLanguageCode,
  locales,
  // The footer's `{{moreFrom}}`: the same three apps go in each of their landings, and Laching leaves out the one
  // whose `url` is this site's `siteUrl`, so sunnysays needs no tagline here. The words are `footer` in the locales.
  moreFrom: {
    apps: [
      {
        name: "mybackhurts",
        url: "https://mybackhurts.app",
        tagline: (locale) => String(locale.footer.taglines.mybackhurts),
      },
      {
        name: "Mister Pagliacci",
        url: "https://pagliacci.app",
        tagline: (locale) => String(locale.footer.taglines.pagliacci),
      },
      { name: "sunnysays", url: "https://sunnysays.app" },
    ],
    label: (locale) => String(locale.footer.moreFrom),
    builtOn: {
      url: "https://vmihalachi.github.io/laching/",
      label: (locale) => String(locale.footer.builtOn),
    },
  },
  placeholders: (key, language, locale) => {
    if (key.startsWith("line."))
      return escapeHtml(shownPhrase(key.slice("line.".length), language));
    switch (key) {
      case "runtimeJson":
        return scriptJson({
          ...locale.runtime,
          lines: pokeLines.map((id) => spokenLine(id, language)),
          shhLine: spokenLine("shh-good", language),
          callOverLine: spokenLine("call-still", language),
          // What Sunny says on switching voices, so the new one is heard at once.
          voiceLine: spokenLine("general-hi", language),
          scene: Object.fromEntries(sceneLines.map((id) => [id, spokenLine(id, language)])),
          voices: voice.voices(language.code),
          mouthFPS: voice.mouthFPS,
        });
      case "voiceSwitch":
        return renderVoiceSwitch(language, String(locale.hero.voiceLabel));
      default:
        return undefined;
    }
  },
  jsonLd: (language, locale) => ({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "sunnysays",
    description: locale.meta.description,
    applicationCategory: "EntertainmentApplication",
    operatingSystem: "macOS, Windows",
    inLanguage: language.code,
    url: `${siteUrl}${language.path}`,
    image: `${siteUrl}/og-${language.code}.png`,
    ...(appStoreUrl ? { installUrl: appStoreUrl } : {}),
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Person", name: "Vlad Mihalachi", url: "https://vmihalachi.com" },
  }),
  og: {
    dir: resolve(root, "og"),
    iconPath: resolve(root, "public/favicon.svg"),
    fontFamily: "Fredoka",
    iconBackground: "#FFF8E7",
    // resvg's shaper turns Fredoka's "fl" into a wrong glyph ("sunflower" → "sunfbwer").
    breakFLigatures: true,
    // The card's speech bubble is a real line, from the catalog like every other quote.
    copy: (language, locale) => ({ ...locale.og, bubble: phrase("general-hi", language) }),
  },
  // Sunny's recorded voice, same origin.
  csp: { mediaSrc: "'self'" },
  extraPlugins: [voice.plugin()],
});

export default defineConfig({
  ...landing,
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
