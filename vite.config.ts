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
const locales = Object.fromEntries(
  languages.map(({ code }) => [
    code,
    JSON.parse(readFileSync(resolve(root, `src/i18n/${code}.json`), "utf8")),
  ]),
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

/** A line as the page's script gets it: the text, plus each recorded voice's clip where the language has one. */
function spokenLine(id: string, language: Language) {
  const voices = voice.clips(language.code, id);
  return { text: phrase(id, language), ...(voices ? { voices } : {}) };
}

/**
 * The voice switch under Sunny, on pages whose language has recorded voices: one option per voice, named
 * like the app's Settings › Voice picker (the String Catalog's `Male` / `Female`).
 */
function renderVoiceSwitch(language: Language, label: string) {
  const voices = voice.voices(language.code);
  if (voices.length < 2) return "";
  const options = voices
    .map(
      (name, index) =>
        `<button type="button" role="radio" data-voice="${name}" aria-checked="${index === 0}" tabindex="${
          index === 0 ? 0 : -1
        }">${escapeHtml(catalogString(name[0].toUpperCase() + name.slice(1), language))}</button>`,
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
 * Sunny's lines come from the app's String Catalog (`phrase.<id>`, plus the `Male` / `Female` voice names),
 * never from the landing's own JSON, so the page quotes exactly what the app says, in every language the
 * catalog has. They're voiced wherever the voice manifest has the language. Both come through `app-data/`
 * (app-data.ts).
 */
const data = appData({
  landingRoot: root,
  keys: [...new Set(spokenIds)].map((id) => `phrase.${id}`).concat(["Male", "Female"]),
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
  contactEmail: "hello@sunnysays.app",
  languages,
  defaultLanguageCode,
  locales,
  placeholders: (key, language, locale) => {
    if (key.startsWith("line.")) return escapeHtml(phrase(key.slice("line.".length), language));
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
