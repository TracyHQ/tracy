#!/usr/bin/env node
/**
 * The grid card carries the Demo column's two lines under Website (tasks/todo-wo-demo-retention.md,
 * "Demo column": "Grid/mobile card: the same 2 lines under Website"). Stand wo2 measured the desktop grid without
 * them (tasks/evidence-wo-demo-retention/stand-wo2.md, bug 2). Bundles the card with esbuild and renders
 * it to static markup.
 *
 *   node --test packages/ui/tracy-wo-views/test/place-card-demo.test.mjs
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
const require = createRequire(path.join(repo, 'package.json'))

function fromStore(prefix, name) {
  const hit = existsSync(store) ? readdirSync(store).find((d) => d.startsWith(prefix)) : undefined
  const dir = hit && path.join(store, hit, 'node_modules', name)
  if (!dir || !existsSync(dir)) throw new Error(`${prefix}* is not in ${store}; run pnpm install`)
  return dir
}

let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-card-demo-'))
  const outfile = path.join(outDir, 'card.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { PlaceCard } from './place-card.tsx'
        export { ReviewsCell } from './cells/reviews.tsx'
        export { PlacesGrid } from './places-grid.tsx'
      `,
      resolveDir: path.join(here, '..', 'src'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    alias: {
      react: fromStore('react@19.2.8', 'react'),
      'react-dom': fromStore('react-dom@19.2.8_react@19.2.8', 'react-dom')
    },
    loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const t = (key) => key
const row = {
  key: 'osm:n/1',
  provider: 'osm',
  name: 'Pho Ba',
  providerId: 'n/1',
  kind: 'restaurant',
  chain: false,
  chainSuspect: false,
  status: 'new',
  website: 'https://phoba.vn',
  score: { score: 60, grade: 'B', pending: false, reasons: [] }
}
const actions = { onToggle() {} }

test('a grid card draws the Demo line right after Website when the consumer gives one', () => {
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.PlacesGrid, {
      t,
      rows: [row],
      selected: new Set(),
      actions,
      card: { demo: { label: 'Demo', cell: () => lib.createElement('span', null, '13 days left') } }
    })
  )
  const web = html.indexOf('<dt>columns.web</dt>')
  const demo = html.indexOf('<dt>Demo</dt>')
  const google = html.indexOf('<dt>columns.google</dt>')
  assert.ok(web >= 0 && demo > web && google > demo, 'Website, then Demo, then Google')
  assert.match(html.slice(demo, google), /13 days left/)
})

test('My opportunities cuts the facts (facts: false) and still gets the Demo line', () => {
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.PlaceCard, {
      t,
      row,
      selected: false,
      actions,
      options: {
        facts: false,
        demo: { label: 'Demo', cell: () => lib.createElement('span', null, 'Frozen') }
      }
    })
  )
  assert.equal(html.includes('<dt>columns.web</dt>'), false)
  assert.match(html, /<dt>Demo<\/dt><dd><span>Frozen<\/span><\/dd>/)
})

test('without a Demo line (Find places), the card is as before', () => {
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.PlaceCard, { t, row, selected: false, actions })
  )
  assert.equal(html.includes('<dt>Demo</dt>'), false)
  assert.ok(html.includes('<dt>columns.web</dt>'))
})

test('Find shows a relative research age instead of an unexplained New badge', () => {
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.PlaceCard, {
      t: (key, p) => (key === 'cell.status.researchedAgo' ? `Researched ${p.ago}` : key),
      row: {
        ...row,
        research: { researchedAt: new Date(Date.now() - 2 * 86400000).toISOString(), canBuild: true }
      },
      selected: false,
      actions,
      locale: 'en'
    })
  )
  assert.match(html, /Researched 2 days ago/)
  assert.equal(html.includes('cell.status.new'), false)
})

const reviewText = (key, values) =>
  ({ 'cell.reviews.google': 'Google', 'cell.reviews.tripadvisor': 'Tripadvisor' })[key] ??
  (key === 'cell.google.reviews' ? `${values.count} reviews` : key)
test('Reviews keeps Google and verified Tripadvisor ratings and totals separate', () => {
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.ReviewsCell, {
      t: reviewText,
      row: {
        ...row,
        rating: 4.4,
        reviews: 1107,
        tripadvisor: {
          rating: 4,
          reviews: 238,
          url: 'https://www.tripadvisor.com/12345',
          checkedAt: '2026-10-21T10:00:00Z'
        }
      },
      locale: 'en'
    })
  )
  for (const value of ['Google', 'Tripadvisor', '4.4', '4.0', '1,107 reviews', '238 reviews'])
    assert.ok(html.includes(value), value)
  assert.equal(html.includes('1,345'), false)
})
test('Reviews with Google alone never invents a Tripadvisor count or zero placeholder', () => {
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.ReviewsCell, {
      t: reviewText,
      row: { ...row, rating: 4.4, reviews: 1107 },
      locale: 'en'
    })
  )
  assert.equal(html.includes('Tripadvisor'), false)
  assert.equal(html.includes('0 reviews'), false)
  assert.ok(html.includes('Google'))
})
