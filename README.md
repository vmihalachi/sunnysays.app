# sunnysays.app

The landing page of [sunnysays](https://sunnysays.app), a little sunflower named Sunny that lives in your menu bar (Mac) or notification area (Windows) and says things.

The app itself lives in a private repository; this page is open source. It's plain HTML, CSS and a little
JavaScript, built with [Vite+](https://viteplus.dev/) into one page per language, with no third-party scripts,
fonts or requests (`connect-src 'none'`).

## Build

```sh
vp install
vp dev      # http://localhost:5173
vp check    # format, lint, type check
vp build    # dist/
```

- `index.html` is a template: `{{key}}` placeholders are filled from `src/i18n/<language>.json`, and the build
  fails when a language is missing a key. The plumbing (the pages per language, the legal pages' links, the
  sitemap, the `_headers` with its CSP, the social cards and icons) is
  [`@laching/landing`](https://www.npmjs.com/package/@laching/landing) from npm; `vite.config.ts` holds this
  page's data: the languages and URLs, Sunny's lines and voices, the JSON-LD and the social card's bubble.
- `app-data/` holds what the page takes from the app: Sunny's lines in every language (`lines.json`) and the
  recordings of the ones it says (`voice/`). In the app repository this repo is mounted at `landing/`, and a
  build there rewrites the snapshot from the app's String Catalog and voices (`app-data.ts`); commit it here
  when it changes.
- `og/` holds the social card's template and font, rendered at build time.

## Deploy

`.github/workflows/deploy.yml` checks and builds every push and pull request, and deploys `master` to a
Cloudflare Worker serving static assets (`wrangler.json`, with the headers and CSP in the generated
`_headers`).

## License

The code is MIT; the copy, character, art and recordings are not. See [LICENSE](LICENSE).
