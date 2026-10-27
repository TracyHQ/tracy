// The Tracy documentation site (tasks/todo-api-public.md Q6, S5, S7; served at the root of its own
// host since tasks/todo-desktop-update-policy.md H5).
//
// HOW IT IS SERVED decides every setting here. `apps/tracy-web` copies `dist/` into its image as
// `static/docs` and serves it at the ROOT of the docs host (`DOCS_ORIGIN`, `docs.tracy.ai`;
// `src/docs/route.js`) and nowhere else: `/docs/*` on Tracy's own hostname and on the API host
// answers a 302 to the same page there. So:
//   - `base: '/'` — every asset URL and internal link is a root path (`/_astro/…`, `/quickstart/`).
//     The static server maps `/<path>` to `dist/<path>`.
//   - `trailingSlash: 'always'` + directory output — a page is `dist/<slug>/index.html`, and links
//     end in `/`, which is what the server resolves first (a bare `/quickstart` is served too).
//   - `site` is the production docs host. It is used only for absolute URLs (canonical, sitemap,
//     Open Graph). It is a config value in a non-`src` file on purpose: the `origins` gate scans
//     `apps/*/src` for Tracy addresses, and this is the one place the documentation may name its own
//     public address.
//   - `passthroughImageService` — the site ships no raster images to optimise, and `sharp` is a
//     native dependency the build should not need (the image's build stage has no toolchain).
//
// LANGUAGES (S7, 29/09/2026). English is the source and lives at the root of `src/content/docs/`;
// every other language is a directory beside it (`vi/`, `zh-cn/`, …) holding the same relative
// paths. A directory DECLARES itself a translation by carrying `_sidebar.json` — its language tag,
// its name in the language switcher and its sidebar labels — and this file discovers the locales by
// reading those files, so adding a language is one new directory and no config edit. Two
// consequences worth knowing:
//   - The three generated pages (errors, compatibility, changelog) exist only in English: they are
//     tables read from code, and Starlight shows the English page under a "not yet available in your
//     language" notice, which is the honest state, not a bug.
//   - This file, `sidebar.mjs`, `scripts/generate.mjs` and the English tree stay under the `language` gate's "English
//     only" rule; the gate exempts exactly the directories that carry `_sidebar.json`
//     (`scripts/check-language.ts`, pass five). Locale text therefore never appears here — labels
//     come from the JSON, keyed by the page slug — so the config cannot leak a translation into the
//     English rule by accident.
//
// The Scalar reference (`/api/reference/`) is NOT part of this site: `tracy-web` serves it on the
// same host from the OpenAPI document it builds itself, and the host's gate hands those paths to it.
// The page `reference/index.mdx` embeds it in an iframe, same origin — one copy, so it is not localised.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import starlight from '@astrojs/starlight'
import { defineConfig, passthroughImageService } from 'astro/config'

import { copyRawChangelog, writeChangelogFeed } from './scripts/raw-changelog.mjs'
import { sidebar } from './sidebar.mjs'

const CONTENT = fileURLToPath(new URL('./src/content/docs/', import.meta.url))
const SITE = 'https://docs.tracy.ai'

/**
 * The changelog pages again as raw markdown, `/changelog/desktop/<X.Y>.md`, for the release
 * tooling's "docs deployed" check (E3/E8), and every release in one file,
 * `/changelog/desktop/changelog.json` (`scripts/raw-changelog.mjs`). After the build, so the output
 * directory exists and Astro does not clear it again.
 */
const rawChangelog = {
  name: 'tracy-raw-changelog',
  hooks: {
    'astro:build:done': ({ dir, logger }) => {
      const out = fileURLToPath(dir)
      for (const rel of copyRawChangelog(`${CONTENT}changelog/desktop/`, out))
        logger.info(`raw markdown ${rel}`)
      logger.info(`feed ${writeChangelogFeed(`${CONTENT}changelog/desktop/`, out, SITE)}`)
    }
  }
}

/**
 * A clip under a changelog Highlight plays by itself (`autoplay muted loop`, a moving screenshot).
 * Where the reader asked for less motion it does not: before it starts, autoplay is taken off and the
 * clip reloaded, so its poster shows and its controls play it on a press. CSS cannot stop a video,
 * hence this one script on every page (the docs pages have no other).
 */
const REDUCED_MOTION = `(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const hold = () => {
    if (!reduce.matches) return
    for (const video of document.querySelectorAll('video[autoplay]')) {
      video.removeAttribute('autoplay')
      video.autoplay = false
      video.load()
    }
  }
  document.addEventListener('DOMContentLoaded', hold)
  reduce.addEventListener('change', hold)
})()`

/** `{ de: { lang: 'de', label: 'Deutsch', labels: { quickstart: 'Schnellstart', … } }, … }` */
const TRANSLATIONS = Object.fromEntries(
  readdirSync(CONTENT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      try {
        const file = JSON.parse(readFileSync(`${CONTENT}${entry.name}/_sidebar.json`, 'utf8'))
        return [[entry.name, file]]
      } catch {
        return []
      }
    })
)

const locales = { root: { label: 'English', lang: 'en' } }
for (const [dir, { lang, label }] of Object.entries(TRANSLATIONS)) locales[dir] = { lang, label }

export default defineConfig({
  site: SITE,
  base: '/',
  trailingSlash: 'always',
  image: { service: passthroughImageService() },
  integrations: [
    starlight({
      title: 'Tracy Docs',
      description:
        'The Tracy desktop app, and the Tracy API: read and change a Tracy-hosted website (Joomla, WordPress, EmDash) through https://api.tracy.ai/v1 with a seat-bound API key.',
      customCss: ['./src/styles/custom.css'],
      head: [{ tag: 'script', content: REDUCED_MOTION }],
      defaultLocale: 'root',
      locales,
      // No edit link, no "last updated": the source repository is private, and the build has no
      // `.git` (the image build copies `dist/` alone).
      lastUpdated: false,
      credits: false,
      sidebar: sidebar(TRANSLATIONS)
    }),
    rawChangelog
  ]
})
