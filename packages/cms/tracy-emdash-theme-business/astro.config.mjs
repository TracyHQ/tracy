// @ts-check
import { mkdirSync, readFileSync } from 'node:fs'
import templateConfig from './template.config.json' with { type: 'json' }
import node from '@astrojs/node'
import react from '@astrojs/react'
import auditLog from '@emdash-cms/plugin-audit-log'
import { formsPlugin } from '@emdash-cms/plugin-forms'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, fontProviders } from 'astro/config'
import emdash, { local } from 'emdash/astro'
import { sqlite } from 'emdash/db'
import { emdashSmtp } from 'emdash-smtp'
import { fileURLToPath } from 'node:url'
import { contentApi } from './tools/content-api/integration.mjs'
import { withLanguageSubsets } from './src/lib/font-subsets.mjs'
import { hreflangPlugin } from './src/lib/hreflang.ts'

// Fonts the design names (Archivo for UI/body, Newsreader for display). Astro downloads them at
// build time and serves them from the site itself; the browser never contacts Google.
const fonts = JSON.parse(readFileSync(new URL('./src/fonts.json', import.meta.url), 'utf8'))

// Runtime state lives under ./data (SQLite) and ./uploads (media). Both are gitignored: the
// template is source, a site is source + these two directories.
const DATA_DIR = process.env.SITE_DATA_DIR ?? './data'

// 🔒 CREATE THEM HERE, BECAUSE NOTHING ELSE CAN. Both directories are gitignored, so a clean
// checkout has neither, and SQLite does not create a missing parent: the server starts, then every
// single request fails with a message that names no directory --
//
//   EmDash middleware error: Error: unable to open database file
//     code: 'ERR_SQLITE_ERROR', errcode: 14, errstr: 'unable to open database file'
//   [500] /_emdash/api/setup/status
//
// `tools/bootstrap-site.sh` cannot own this: it runs against a site that is ALREADY SERVING (it
// waits for `/setup/status` first), so by the time it could mkdir, the failure has already
// happened. Measured 14/09: following README.md's "Development needs nothing" on a clean checkout
// gives 500 on every route, and bootstrap then exits 22 with twelve `curl: (22) ... 500` lines,
// none of which mention `data/`.
mkdirSync(DATA_DIR, { recursive: true })
mkdirSync('./uploads', { recursive: true })

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // EN at the root, RU under /ru. Prefixing the default locale would 404 the EmDash admin
  // (docs/guides/internationalization: "Do not prefix the default locale"), so the default
  // Astro strategy (prefix-other-locales) is kept on purpose.
  // No `fallback`: Astro's i18n fallback turns a 404 under /ru into a 302 to the EN path
  // (measured: /ru/nope -> 302 /nope), which hides real not-found answers. Every entry ships
  // in both locales, so EmDash's content fallback chain is not needed either.
  i18n: {
    defaultLocale: templateConfig.defaultLocale,
    locales: templateConfig.locales
  },
  image: { layout: 'constrained', responsiveStyles: true },
  integrations: [
    react(),
    ...(process.env.TRACY_CONTENT_API_SCALARS === '1'
      ? [contentApi({ root: new URL('./', import.meta.url) })]
      : []),
    emdash({
      database: sqlite({ url: `file:${DATA_DIR}/data.db` }),
      storage: local({ directory: './uploads', baseUrl: '/_emdash/api/media/file' }),
      // Public HTML identical for every visitor; the editor toolbar is decided in the browser.
      toolbar: 'client',
      plugins: [
        auditLog,
        formsPlugin({ defaultSpamProtection: 'honeypot' }),
        emdashSmtp(),
        hreflangPlugin(fileURLToPath(new URL('./src/lib/hreflang-plugin.ts', import.meta.url)))
      ]
    })
  ],
  // Every font is also cut in the subsets of the languages Tracy writes (`font-subsets.mjs`, LANG-2): a site built in
  // Vietnamese later must not draw its letters from a base letter and a loose accent.
  fonts: withLanguageSubsets(fonts).map((font) => ({ provider: fontProviders.google(), ...font })),
  vite: { plugins: [tailwindcss()] },
  devToolbar: { enabled: false }
})
