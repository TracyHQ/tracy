/**
 * "Services", "Who it is for" and "Team" on the Details Profile card (#1780): the reading of a business's bio, posts and
 * reviews as rows, each item with where it is from and its quote on open, Remove, and a person named only in reviews
 * off the site until Show on the site. Bundles the real component with React 18 (the one dsh's page runs) and renders
 * it to static markup.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-profile-reading.test.mjs
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-profile-reading-'))
  const outfile = path.join(outDir, 'profile-reading.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { ProfileReadingRows } from './profile-reading-rows.tsx'
        export { readingActions, readingRowsView } from './profile-reading-model.ts'
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
const item = (id, label, quote, source, extra = {}) => ({
  id,
  label,
  quote,
  source,
  removed: false,
  ...extra
})
// The server's card for Harbour Sport Club (#1780 fixture): services from the bio and posts, two coaches from a review.
const CARD = {
  method: 'model',
  trade: 'fitness',
  services: [
    item('se_1', 'Padel sessions', 'Join our padel sessions in Dubai!', {
      kind: 'post',
      url: 'https://www.instagram.com/p/HSCpost0001/'
    }),
    item('se_2', 'Swimming lessons', 'Swimming Lessons', { kind: 'bio' }, { removed: true })
  ],
  audience: [item('au_1', 'all ages and levels', 'For all ages & levels', { kind: 'post' })],
  team: [
    item(
      'te_1',
      'Alex',
      'padel coaching with Alex and Sam',
      { kind: 'review' },
      {
        role: 'coach',
        reviewsOnly: true,
        onSite: false
      }
    ),
    item(
      'te_2',
      'Sam',
      'padel coaching with Alex and Sam',
      { kind: 'review' },
      {
        reviewsOnly: true,
        onSite: true
      }
    )
  ],
  story: []
}
const draw = (view) =>
  lib.renderToStaticMarkup(lib.createElement(lib.ProfileReadingRows, { t, view, onPick: async () => true }))

test('three rows: Services, Who it is for, Team; each item with its source, its quote on open', () => {
  const view = lib.readingRowsView({ readingCard: CARD })
  assert.equal(view.servicesLabel, 'services')
  assert.equal(view.rules, false)
  const html = draw(view)
  const rows = [...html.matchAll(/<dt[^>]*>\[(field\.[a-z]+)\]<\/dt>/g)].map((m) => m[1])
  assert.deepEqual(rows, ['field.services', 'field.audience', 'field.team'])
  assert.match(html, /<details><summary>.*Padel sessions.*\[reading\.from\.post\]/)
  assert.match(html, /<blockquote[^>]*>“Join our padel sessions in Dubai!”<\/blockquote>/)
  assert.match(html, /href="https:\/\/www\.instagram\.com\/p\/HSCpost0001\/"[^>]*>\[reading\.openPost\]/)
  assert.match(html, /Alex<span class="tracy-wo-muted"> · coach<\/span>/)
})

test('Remove, Restore, and a person named only in reviews off the site until shown', () => {
  const view = lib.readingRowsView({ readingCard: CARD })
  const [padel, swim] = view.services
  const [alex, sam] = view.team
  assert.deepEqual(lib.readingActions(padel), ['remove'])
  assert.deepEqual(lib.readingActions(swim), ['restore'])
  assert.deepEqual(lib.readingActions(alex), ['show', 'remove'])
  assert.deepEqual(lib.readingActions(sam), ['hide', 'remove'])
  const html = draw(view)
  assert.match(html, /is-removed">Swimming lessons/)
  assert.match(html, /\[reading\.removed\]/)
  assert.match(html, /\[reading\.reviewsOnly\]/)
  assert.equal((html.match(/\[reading\.reviewsOnly\]/g) ?? []).length, 1, 'Sam is shown, Alex is not')
})

test('an unknown trade says What it offers; rules say the model did not run; nothing read is no row', () => {
  const view = lib.readingRowsView({ readingCard: { ...CARD, trade: 'unknown', method: 'rules', team: [] } })
  const html = draw(view)
  assert.match(html, /\[field\.offerings\]/)
  assert.doesNotMatch(html, /\[field\.team\]/)
  assert.match(html, /\[reading\.rules\]/)
  assert.equal(
    lib.readingRowsView({ readingCard: { method: 'model', services: [], audience: [], team: [] } }),
    null
  )
  assert.equal(lib.readingRowsView({}), null)
  // An item without a quote is never shown.
  assert.equal(
    lib.readingRowsView({
      readingCard: { method: 'model', services: [{ id: 'x', label: 'Yoga', source: { kind: 'post' } }] }
    }),
    null
  )
})

test('a Service area row after Team: the business own words, with its quote and Remove; never the address', () => {
  const card = {
    ...CARD,
    serviceAreas: [
      item('se_area1', 'Locations across Dubai', 'Locations across Dubai', {
        kind: 'post',
        url: 'https://www.instagram.com/p/HSCpost0001/'
      })
    ]
  }
  const view = lib.readingRowsView({ readingCard: card })
  assert.deepEqual(
    view.serviceAreas.map((a) => a.label),
    ['Locations across Dubai']
  )
  assert.deepEqual(lib.readingActions(view.serviceAreas[0]), ['remove'])
  const html = draw(view)
  const rows = [...html.matchAll(/<dt[^>]*>\[(field\.[a-zA-Z]+)\]<\/dt>/g)].map((m) => m[1])
  assert.deepEqual(rows, ['field.services', 'field.audience', 'field.team', 'field.serviceAreas'])
  assert.match(html, /<blockquote[^>]*>“Locations across Dubai”<\/blockquote>/)
  // A card with only a service area still shows.
  assert.equal(
    lib.readingRowsView({ readingCard: { method: 'rules', services: [], audience: [], team: [], ...card } })
      .serviceAreas.length,
    1
  )
})
