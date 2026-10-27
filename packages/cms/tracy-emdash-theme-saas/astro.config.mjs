// @ts-check
import { mkdirSync, readFileSync } from 'node:fs'
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
import { hreflangPlugin } from './src/lib/hreflang.ts'
import { contentApi } from './tools/content-api/integration.mjs'
import { withLanguageSubsets } from './src/lib/font-subsets.mjs'

// The three families the design names (Space Grotesk headings, IBM Plex Sans body, JetBrains Mono
// labels). Astro downloads them at build time and serves them from the site itself.
const fonts = JSON.parse(readFileSync(new URL('./src/fonts.json', import.meta.url), 'utf8'))

// Runtime state lives under ./data (SQLite) and ./uploads (media), both gitignored. SQLite does not
// create a missing parent directory, and a clean checkout has neither — so they are created here,
// before the first request can fail with "unable to open database file" (same trap as Tracy Business).
const DATA_DIR = process.env.SITE_DATA_DIR ?? './data'
mkdirSync(DATA_DIR, { recursive: true })
mkdirSync('./uploads', { recursive: true })

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // One locale, unprefixed. No `fallback`: it would turn real not-found answers into redirects.
  i18n: {
    defaultLocale: 'en',
    locales: ['en']
  },
  image: { layout: 'constrained', responsiveStyles: true },
  integrations: [
    react(),
    // Tracy's Content API reader (`tools/content-api`), on when the image says so (Dockerfile:
    // TRACY_CONTENT_API_SCALARS, 1 unless a build turns it off).
    ...(process.env.TRACY_CONTENT_API_SCALARS === '1'
      ? [contentApi({ root: new URL('./', import.meta.url) })]
      : []),
    emdash({
      database: sqlite({ url: `file:${DATA_DIR}/data.db` }),
      storage: local({ directory: './uploads', baseUrl: '/_emdash/api/media/file' }),
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
