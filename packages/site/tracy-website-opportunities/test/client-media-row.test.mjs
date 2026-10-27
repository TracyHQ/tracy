/**
 * The Media row of the place profile draws each part in one of three states: data, searched and not there
 * (grey), not collected yet (amber, the logo with its Retry). Video hides when there is none.
 * Bundles the real component with React 18 (the one dsh's page runs) and renders it to static markup.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-media-row.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const require = createRequire(import.meta.url)

function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}

let outDir = ''
let lib
before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-media-row-'))
  const outfile = path.join(outDir, 'media-row.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { MediaRow } from './media-row.tsx'
        export { mediaRowView, mediaTile } from './detail-model.ts'
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: {
      react: fromStore('react@18.3.1', 'react'),
      'react-dom': fromStore('react-dom@18.2.0_react@18.3.1', 'react-dom')
    },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"development"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const t = (key, params) => `[${key}${params ? JSON.stringify(params) : ''}]`
const retry = { busy: false, failed: false, onPress: () => {} }
const draw = (input, over = {}, food = false) =>
  lib.renderToStaticMarkup(
    lib.createElement(lib.MediaRow, {
      t,
      view: lib.mediaRowView(input),
      retryLogo: { ...retry, ...over },
      food
    })
  )
const tile = (id, extra = {}) =>
  lib.mediaTile({
    id,
    kind: 'image',
    category: 'food',
    status: 'stored',
    sourceUrl: `https://x.vn/${id}.jpg`,
    ...extra
  })

test('data: the logo shows its picture, source and how it was recognised; colors and grouped photos with source and credit', () => {
  const html = draw({
    profile: {
      brand: {
        website: { origin: 'website', colors: [{ hex: '#7a2e1f', role: 'primary' }] },
        logoResearch: {
          status: 'found',
          chosen: {
            mediaId: 'L1',
            via: 'social-profile',
            source: 'instagram',
            width: 320,
            height: 320,
            recognised: 'vision'
          },
          candidates: []
        }
      }
    },
    media: [
      tile('L1'),
      tile('p1', {
        source: 'google-maps',
        credit: { provider: 'Google', authors: [{ displayName: 'Minh' }] }
      })
    ],
    sources: []
  })
  assert.match(html, /<img src="[^"]*\/media\/L1"/)
  assert.match(html, /\[media\.logo\.from\.social-profile\{&quot;source&quot;:&quot;Instagram&quot;\}\]/)
  assert.match(html, /\[media\.logo\.recognised\.vision\]/)
  assert.match(html, /\[media\.logo\.smallNote\{&quot;width&quot;:320,&quot;height&quot;:320\}\]/)
  assert.match(html, /background-color:#7a2e1f/)
  assert.match(html, /Google Maps · Google: Minh/)
  assert.doesNotMatch(html, /tracy-wo-warn/)
  // The logo is not repeated in the gallery.
  assert.equal((html.match(/media\/L1"/g) ?? []).length, 1)
})

test('not collected yet: amber, with a Retry on the logo only', () => {
  const html = draw({ profile: {}, media: [], sources: [] })
  assert.match(html, /tracy-wo-warn">\[score\.notCollected\]/)
  assert.equal((html.match(/\[media\.logo\.retry\]/g) ?? []).length, 1)
  const busy = draw({ profile: {}, media: [], sources: [] }, { busy: true })
  assert.match(busy, /<button[^>]*disabled=""[^>]*>\[media\.logo\.retry\]/)
  assert.match(
    draw({ profile: {}, media: [], sources: [] }, { failed: true }),
    /role="alert">\[media\.retryFailed\]/
  )
})

test('not available: grey, and a missing logo says what the demo will do and can be searched again', () => {
  const noLogo = {
    profile: {
      brand: { website: null, social: null, logoResearch: { status: 'none', chosen: null, candidates: [] } }
    },
    media: [],
    sources: []
  }
  const html = draw(noLogo)
  assert.match(html, /tracy-wo-muted">\[reason\.not_found\]/)
  // Any trade: the business name; a food business keeps the restaurant name (#1780).
  assert.match(html, /\[media\.logo\.noneNote\.any\]/)
  assert.match(draw(noLogo, {}, true), /\[media\.logo\.noneNote\]/)
  assert.match(html, /\[media\.logo\.retry\]/)
  assert.doesNotMatch(html, /\[media\.logo\.from/)
})

test('files are listed with their source; video hides when none, shows as not collected when a video source failed', () => {
  const withPdf = draw({
    profile: { menus: [{ url: 'https://x.vn/menu.pdf', source: 'website' }] },
    media: [],
    sources: []
  })
  assert.match(withPdf, /href="https:\/\/x\.vn\/menu\.pdf"/)
  assert.match(withPdf, /\[media\.file\.pdf\]/)
  assert.doesNotMatch(withPdf, /\[media\.video\]/)
  const failed = draw({ profile: {}, media: [], sources: [{ source: 'instagram', status: 'failed' }] })
  assert.match(failed, /\[media\.video\]/)
  const found = draw({
    profile: {},
    media: [lib.mediaTile({ id: 'v1', kind: 'video', status: 'stored', source: 'instagram' })],
    sources: []
  })
  assert.match(found, /<video src="[^"]*\/media\/v1"/)
})

test('pictures that are not photographs are counted and hidden behind "Show them", never drawn among the photos', () => {
  const media = [
    tile('a'),
    tile('ic', { source: 'website', hidden: 'social-icon' }),
    tile('mp', { source: 'website', hidden: 'map' })
  ]
  const html = draw({ profile: {}, media, sources: [] })
  assert.match(html, /\[media\.counts\{&quot;found&quot;:3,&quot;shown&quot;:1\}\]/)
  assert.match(html, /\[media\.hiddenLine\{&quot;count&quot;:2\}\]/)
  assert.match(html, /aria-expanded="false"[^>]*>\[media\.showHidden\]/)
  assert.doesNotMatch(html, /media\/ic"/)
  assert.doesNotMatch(html, /media\/mp"/)
  assert.match(html, /media\/a"/)
  assert.doesNotMatch(draw({ profile: {}, media: [tile('a')], sources: [] }), /media\.hiddenLine/)
})
