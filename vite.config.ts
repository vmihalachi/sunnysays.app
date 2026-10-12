import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig } from "vite-plus";
import { appData } from "./app-data";
import { socialAssetsPlugin } from "./og/render";
import { createVoices } from "./voice";
import {
  defaultLanguageCode,
  languages,
  type Language,
  type LanguageCode,
} from "./src/i18n/languages";

const root = __dirname;
const defaultLanguage: Language = languages.find(({ code }) => code === defaultLanguageCode)!;
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

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function flattenKeys(value: JsonValue, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];

  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function readPath(source: JsonValue, key: string): JsonValue | undefined {
  return key.split(".").reduce<JsonValue | undefined>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return current[part];
  }, source);
}

function assertSameLocaleKeys() {
  const baseKeys = new Set(flattenKeys(locales[defaultLanguage.code]));
  const problems = languages
    .filter((language) => language !== defaultLanguage)
    .flatMap(({ code }) => {
      const keys = new Set(flattenKeys(locales[code]));
      const missing = [...baseKeys].filter((key) => !keys.has(key));
      const extra = [...keys].filter((key) => !baseKeys.has(key));
      return [
        missing.length ? `Missing in ${code}.json: ${missing.join(", ")}` : "",
        extra.length ? `Missing in ${defaultLanguage.code}.json: ${extra.join(", ")}` : "",
      ].filter(Boolean);
    });
  if (problems.length) {
    throw new Error(["Locale files must share the same keys.", ...problems].join("\n"));
  }
}

function languageForPath(pathname: string): Language {
  return (
    languages.find(({ path }) => {
      // Widened: with one language the literal type is "/" and the check below reads as dead code.
      const prefix: string = path;
      return prefix !== "/" && (pathname === prefix || pathname.endsWith(`${prefix}index.html`));
    }) ?? defaultLanguage
  );
}

const siteUrl = "https://sunnysays.app";
/**
 * The Mac App Store listing. Set it to `https://apps.apple.com/app/id6820142690` (the Apple ID from App Store
 * Connect) once the app is approved; the URL 404s before that. Until then the page shows "Coming soon to the Mac
 * App Store" instead of a link.
 */
const appStoreUrl: string | null = null;
const contactEmail = "hello@sunnysays.app";

/** The privacy policy and terms, hand-translated at `<language path><page>/index.html`. */
const legalPages = ["privacy", "terms"] as const;
type LegalPage = (typeof legalPages)[number];

function legalPath(language: Language, page: LegalPage) {
  return `${language.path}${page}/`;
}

/** The legal page a built HTML file is (`/de/privacy/index.html` → German privacy), if any. */
function legalPageForPath(pathname: string) {
  for (const language of languages) {
    for (const page of legalPages) {
      const path = legalPath(language, page);
      if (pathname === path || pathname === `${path}index.html`) return { language, page };
    }
  }
  return undefined;
}

/** hreflang → absolute URL of one page in every language, plus x-default. */
function alternates(pathFor: (language: Language) => string): [string, string][] {
  return [
    ...languages.map((language): [string, string] => [
      language.code,
      `${siteUrl}${pathFor(language)}`,
    ]),
    ["x-default", `${siteUrl}${pathFor(defaultLanguage)}`],
  ];
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const globeIcon =
  '<svg class="globe" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/></svg>';

/** Nothing to switch between while the page is English only. */
function renderLanguageSwitcher(current: Language, label: string) {
  if (languages.length < 2) return "";
  const items = languages
    .map(
      (language) =>
        `<li><a href="${language.path}" lang="${language.code}" hreflang="${language.code}" data-lang="${language.code}"${
          language.code === current.code ? ' aria-current="page"' : ""
        }><span>${language.nativeName}</span><span class="language-code">${language.label}</span></a></li>`,
    )
    .join("");
  return `<details class="language-switcher"><summary aria-label="${escapeAttr(
    `${label}: ${current.nativeName}`,
  )}" title="${escapeAttr(label)}">${globeIcon}<span>${
    current.label
  }</span><svg class="caret" viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg></summary><ul class="language-menu">${items}</ul></details>`;
}

/** On the default page only: sends a first-time visitor to their browser's preferred language, once. */
function renderLangRedirectScript(language: Language) {
  if (language !== defaultLanguage || languages.length < 2) return "";
  const paths = Object.fromEntries(
    languages
      .filter((candidate) => candidate !== defaultLanguage)
      .map(({ code, path }) => [code.toLowerCase(), path]),
  );
  return `<script>try { if (!localStorage.getItem("lang")) { const paths = ${JSON.stringify(
    paths,
  )}; const wanted = (navigator.languages?.[0] || navigator.language || "").toLowerCase(); const base = wanted.split("-")[0]; const path = paths[wanted] || paths[base] || Object.entries(paths).find(([code]) => code.split("-")[0] === base)?.[1]; if (path) location.replace(path + location.hash); } } catch {}</script>`;
}

const appleIcon =
  '<svg class="store-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>';

function renderStoreButton(locale: any, big: boolean) {
  const size = big ? " button-big" : "";
  if (!appStoreUrl) {
    return `<span class="button button-soon${size}">${appleIcon}<span>${escapeHtml(
      locale.store.soon,
    )}</span></span>`;
  }
  return `<a class="button${size}" href="${escapeAttr(appStoreUrl)}">${appleIcon}<span>${escapeHtml(
    locale.store.mac,
  )}</span></a>`;
}

function generatedPlaceholder(key: string, language: Language): string | undefined {
  const locale = locales[language.code];
  if (key.startsWith("line.")) return escapeHtml(phrase(key.slice("line.".length), language));
  switch (key) {
    case "langRedirectScript":
      return renderLangRedirectScript(language);
    case "storeButton":
      return renderStoreButton(locale, false);
    case "storeButtonBig":
      return renderStoreButton(locale, true);
    case "contactEmail":
      return contactEmail;
    case "legalPrivacyUrl":
      return legalPath(language, "privacy");
    case "legalTermsUrl":
      return legalPath(language, "terms");
    case "runtimeJson":
      return JSON.stringify({
        ...locale.runtime,
        lines: pokeLines.map((id) => spokenLine(id, language)),
        shhLine: spokenLine("shh-good", language),
        callOverLine: spokenLine("call-still", language),
        // What Sunny says on switching voices, so the new one is heard at once.
        voiceLine: spokenLine("general-hi", language),
        scene: Object.fromEntries(sceneLines.map((id) => [id, spokenLine(id, language)])),
        voices: voice.voices(language.code),
        mouthFPS: voice.mouthFPS,
      }).replace(/</g, "\\u003c");
    case "jsonLd":
      return `<script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        name: "sunnysays",
        description: locale.meta.description,
        applicationCategory: "EntertainmentApplication",
        operatingSystem: "macOS",
        inLanguage: language.code,
        url: `${siteUrl}${language.path}`,
        image: `${siteUrl}/og-${language.code}.png`,
        ...(appStoreUrl ? { installUrl: appStoreUrl } : {}),
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        author: { "@type": "Person", name: "Vlad Mihalachi", url: "https://vmihalachi.com" },
      }).replace(/</g, "\\u003c")}</script>`;
    case "voiceSwitch":
      return renderVoiceSwitch(language, String(locale.hero.voiceLabel));
    case "languageSwitcher":
      return renderLanguageSwitcher(language, String(locale.nav.languageLabel));
    case "hreflangLinks":
      return alternates(({ path }) => path)
        .map(([hreflang, href]) => `<link rel="alternate" hreflang="${hreflang}" href="${href}" />`)
        .join("\n    ");
    case "ogLocale":
      return language.ogLocale;
    case "ogLocaleAlternates":
      return languages
        .filter(({ code }) => code !== language.code)
        .map(({ ogLocale }) => `<meta property="og:locale:alternate" content="${ogLocale}" />`)
        .join("\n    ");
    default:
      return undefined;
  }
}

function renderTemplate(html: string, language: Language) {
  const localeKey = language.code;
  const locale = locales[localeKey];
  const rendered = html.replace(/{{\s*([\w.-]+)\s*}}/g, (placeholder, key: string) => {
    const generated = generatedPlaceholder(key, language);
    if (generated !== undefined) return generated;

    const value = readPath(locale, key);
    if (value === undefined) {
      throw new Error(`Missing i18n key "${key}" for locale "${localeKey}"`);
    }
    if (typeof value === "object") {
      throw new Error(`i18n key "${key}" for locale "${localeKey}" must be a scalar`);
    }
    return String(value);
  });

  const unresolved = rendered.match(/{{[^}]+}}/g);
  if (unresolved) {
    throw new Error(`Unresolved i18n placeholders for ${localeKey}: ${unresolved.join(", ")}`);
  }

  return rendered;
}

function renderSitemap() {
  const pages: ((language: Language) => string)[] = [
    ({ path }) => path,
    ...legalPages.map((page) => (language: Language) => legalPath(language, page)),
  ];
  const urls = pages
    .flatMap((pathFor) => {
      const links = alternates(pathFor)
        .map(
          ([hreflang, href]) =>
            `<xhtml:link rel="alternate" hreflang="${hreflang}" href="${href}"/>`,
        )
        .join("");
      return languages.map(
        (language) => `<url><loc>${siteUrl}${pathFor(language)}</loc>${links}</url>`,
      );
    })
    .join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  ${urls}
</urlset>
`;
}

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}

/** CSP hashes for every inline script that runs (JSON and JSON-LD data blocks don't need one). */
function inlineScriptHashes(outDir: string) {
  const hashes = new Set<string>();
  for (const file of htmlFiles(outDir)) {
    const html = readFileSync(file, "utf8");
    for (const [, tag, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/\bsrc=/.test(tag) || /type="application\/(ld\+)?json"/.test(tag)) continue;
      hashes.add(`'sha256-${createHash("sha256").update(body).digest("base64")}'`);
    }
  }
  return [...hashes].sort();
}

/**
 * Writes the Cloudflare `_headers` file after the build, so the CSP can hash the final inline
 * scripts. `connect-src 'none'` backs up the page's own claim: it fetches nothing but its own files.
 * Trailing slashes and the 404 page are set in `wrangler.json` (`html_handling`, `not_found_handling`).
 */
function hostingConfigPlugin() {
  let outDir = "dist";
  return {
    name: "sunnysays-hosting-config",
    apply: "build" as const,
    configResolved(config: { root: string; build: { outDir: string } }) {
      outDir = resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const csp = [
        "default-src 'none'",
        `script-src 'self' ${inlineScriptHashes(outDir).join(" ")}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        // Sunny's recorded voice, same origin.
        "media-src 'self'",
        "font-src 'self'",
        "manifest-src 'self'",
        "connect-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; ");
      // Cloudflare merges every matching rule and joins repeated headers with commas, so a path
      // rule first detaches (`! Name`) the global header it replaces.
      const rules: [path: string, headers: string[]][] = [
        [
          "/*",
          [
            `Content-Security-Policy: ${csp}`,
            // Azure sent this by default; Cloudflare doesn't.
            "Strict-Transport-Security: max-age=10886400; includeSubDomains; preload",
            "X-Content-Type-Options: nosniff",
            "Referrer-Policy: no-referrer",
            "Permissions-Policy: camera=(), microphone=(), geolocation=(), browsing-topics=()",
            // Deploys replace every hashed asset, so HTML must always be revalidated.
            "Cache-Control: no-cache",
          ],
        ],
        ["/assets/*", ["! Cache-Control", "Cache-Control: public, max-age=31536000, immutable"]],
      ];
      writeFileSync(
        join(outDir, "_headers"),
        rules
          .map(([path, headers]) => [path, ...headers.map((h) => `  ${h}`)].join("\n"))
          .join("\n\n") + "\n",
      );
    },
  };
}

function localizedHtmlPlugin() {
  assertSameLocaleKeys();
  const templatePath = resolve(root, "index.html");

  return {
    name: "sunnysays-localized-html",
    transformIndexHtml: {
      order: "pre" as const,
      handler(html: string, ctx: { path: string }) {
        // Legal pages are hand-written per language; give them the canonical and hreflang links
        // the home page template has, so search engines treat them as translations, not duplicates.
        const legal = legalPageForPath(ctx.path);
        if (legal) {
          const links: Record<string, string>[] = [
            { rel: "canonical", href: `${siteUrl}${legalPath(legal.language, legal.page)}` },
            ...alternates((language) => legalPath(language, legal.page)).map(
              ([hreflang, href]) => ({ rel: "alternate", hreflang, href }),
            ),
          ];
          return {
            html,
            tags: links.map((attrs) => ({ tag: "link", attrs, injectTo: "head" as const })),
          };
        }

        const language = languageForPath(ctx.path);
        // 404.html is its own template; every home page renders from index.html.
        const isNotFound = ctx.path.endsWith("404.html");
        const template =
          language === defaultLanguage || isNotFound ? html : readFileSync(templatePath, "utf8");
        return renderTemplate(template, language);
      },
    },
    generateBundle(this: { emitFile: (file: object) => void }) {
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: renderSitemap() });
    },
  };
}

export default defineConfig({
  plugins: [
    localizedHtmlPlugin(),
    hostingConfigPlugin(),
    voice.plugin(),
    socialAssetsPlugin({
      ogDir: resolve(root, "og"),
      iconPath: resolve(root, "public/favicon.svg"),
      // The card's speech bubble is a real line, from the catalog like every other quote.
      locales: Object.fromEntries(
        languages.map((language) => [
          language.code,
          {
            ...locales[language.code],
            og: { ...locales[language.code].og, bubble: phrase("general-hi", language) },
          },
        ]),
      ),
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        ...Object.fromEntries(
          languages.map(({ code, path }) => [
            code === defaultLanguage.code ? "main" : code,
            resolve(root, `.${path}index.html`),
          ]),
        ),
        ...Object.fromEntries(
          languages.flatMap((language) =>
            legalPages.map((page) => [
              language === defaultLanguage ? page : `${language.code}-${page}`,
              resolve(root, `.${legalPath(language, page)}index.html`),
            ]),
          ),
        ),
        notFound: resolve(root, "404.html"),
      },
    },
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
});
