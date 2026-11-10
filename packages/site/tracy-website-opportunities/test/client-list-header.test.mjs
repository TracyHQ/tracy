/**
 * My opportunities with header C and row style 2 (#537): the column titles over Rows, the Added cell, selection mode
 * (no checkbox and no bulk action outside it), the "..." menu, and the Columns menu gone for good. Bundles the real
 * components with React 18 and renders them to static markup.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-list-header.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..', '..', '..')
const store = path.join(repo, 'node_modules', '.pnpm')
const client = path.join(here, '..', 'src', 'client')
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-list-header-'))
  const outfile = path.join(outDir, 'list-header.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { MyPlaces } from './my-places.tsx'
        export { ListToolbar } from './list-toolbar.tsx'
        export { SelectionBar } from './list-select-bar.tsx'
        export { listMenu } from './list-menu-model.ts'
        export { pickState } from './list-select-mode.ts'
        export { addedAgo } from './added-ago.ts'
        export { placePieces } from './opportunity-pieces.ts'
        export { en } from './strings.ts'
      `,
      resolveDir: client,
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

const t = (key, params = {}) => {
  const text = lib.en[key]
  if (text === undefined) throw new Error(`missing string ${key}`)
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}
const NOW = Date.parse('2026-11-10T14:05:00Z')
const H = 3_600_000
const iso = (ms) => new Date(ms).toISOString()
const ROWS = [
  {
    id: 'opp-1',
    name: 'Sample Padel Club',
    createdAt: iso(NOW - 3 * H),
    stage: 'research',
    candidate: { name: 'Sample Padel Club', category: 'Sports club', address: '1 Example Road, Sampletown' }
  },
  {
    id: 'opp-2',
    name: 'Example Bakery',
    createdAt: iso(NOW - 75 * H),
    stage: 'research',
    candidate: { name: 'Example Bakery', category: 'Bakery', address: '2 Fake Street, Sampletown' }
  }
]
const pieces = () => ROWS.map((row) => lib.placePieces(row, t, { now: NOW, locale: 'en' }))
const added = () => new Map(ROWS.map((r) => [r.id, lib.addedAgo(r.createdAt, NOW, 'en-GB', 'UTC')]))
const places = (props) =>
  lib.renderToStaticMarkup(
    lib.createElement(lib.MyPlaces, {
      t,
      view: 'rows',
      places: pieces(),
      added: added(),
      selecting: false,
      selected: new Set(),
      busy: new Set(),
      onToggle() {},
      onOpen() {},
      onNext() {},
      ...props
    })
  )
const count = (html, needle) => html.split(needle).length - 1
const CHECKBOX = 'data-slot="checkbox"'

test('Added: relative words in hours, yesterday and days, then the short date; the exact time for the tooltip', () => {
  const at = (hoursAgo) => lib.addedAgo(iso(NOW - hoursAgo * H), NOW, 'en-GB', 'UTC')
  assert.deepEqual(at(3), { text: '3 hours ago', exact: '10 Nov 2026, 11:05' })
  assert.equal(at(0.2).text, '12 minutes ago')
  assert.equal(at(26).text, 'yesterday')
  assert.equal(at(75).text, '3 days ago')
  assert.deepEqual(at(9 * 24), { text: '1 Nov 2026', exact: '1 Nov 2026, 14:05' })
  assert.equal(lib.addedAgo(null, NOW, 'en'), null)
  assert.equal(lib.addedAgo('not a date', NOW, 'en'), null)
})

test('Rows: one header with the column titles, and each row shows Added with the exact date as its title', () => {
  const html = places()
  assert.equal(count(html, 'class="tracy-wo-my-head"'), 1)
  const titles = [...html.matchAll(/<span data-col="(\w+)">([^<]*)<\/span>/g)].map((m) => m[2])
  assert.deepEqual(titles, ['Place', 'Address', 'Progress', 'Added', 'Action'])
  assert.match(html, /<time title="10 Nov 2026, 11:05">3 hours ago<\/time>/)
  assert.match(html, /<time title="7 Nov 2026, 11:05">3 days ago<\/time>/)
  assert.match(html, /title="1 Example Road, Sampletown">1 Example Road, Sampletown</)
})

test('Selection mode: no checkbox outside it, one per row inside it, in Rows and in Cards', () => {
  assert.equal(count(places(), CHECKBOX), 0)
  assert.equal(count(places({ view: 'cards' }), CHECKBOX), 0)
  const on = places({ selecting: true, selected: new Set(['opp-1']) })
  assert.equal(count(on, CHECKBOX), 2)
  assert.match(on, /class="tracy-wo-my-table" data-selecting="true"/)
  assert.equal(count(on, 'data-selected="true"'), 1)
  assert.equal(count(places({ view: 'cards', selecting: true }), CHECKBOX), 2)
})

test('Cards: no column header, and the Added line reads "Added 3 hours ago"', () => {
  const html = places({ view: 'cards' })
  assert.equal(count(html, 'tracy-wo-my-head'), 0)
  assert.match(html, /<time title="10 Nov 2026, 11:05">Added 3 hours ago<\/time>/)
})

const toolbar = (props) =>
  lib.renderToStaticMarkup(
    lib.createElement(lib.ListToolbar, {
      t,
      attention: 0,
      attentionOn: false,
      text: '',
      onText() {},
      onAttention() {},
      menu: [],
      onSelect() {},
      onView() {},
      onCancelled() {},
      ...props
    })
  )

test('Toolbar: the search and the "..." menu; Attention only above zero or while on; no Columns, no step filter', () => {
  const quiet = toolbar()
  assert.match(quiet, /placeholder="Search by name"/)
  assert.match(quiet, /aria-label="More list options"/)
  assert.doesNotMatch(quiet, /Attention/)
  assert.doesNotMatch(quiet, /Columns|All steps|builds/)
  assert.equal(count(quiet, CHECKBOX), 0)
  const busy = toolbar({ attention: 2 })
  assert.match(busy, /aria-pressed="false"[^>]*>.*Attention.*>2<\/span>/)
  assert.match(toolbar({ attention: 0, attentionOn: true }), /aria-pressed="true"/)
})

test('Selection bar: select all, the count, Delete, Cancel research and Done; no build action', () => {
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.SelectionBar, {
      t,
      count: 2,
      pick: 'some',
      busy: false,
      deleteDisabled: false,
      cancelDisabled: true,
      onPickAll() {},
      onDelete() {},
      onCancelResearch() {},
      onDone() {}
    })
  )
  assert.equal(count(html, CHECKBOX), 1)
  assert.match(html, /aria-label="Select all"/)
  const words = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  assert.equal(words, '2 selected Delete Cancel research Done')
  assert.doesNotMatch(html, /Build/)
  assert.equal(lib.pickState(['a', 'b'], new Set(['a'])), 'some')
  assert.equal(lib.pickState(['a', 'b'], new Set(['a', 'b'])), 'all')
  assert.equal(lib.pickState(['a'], new Set()), 'none')
})

test('"..." menu: Select, the view switch, Show cancelled with its count, and the builds used today', () => {
  const menu = lib.listMenu(t, {
    view: 'rows',
    views: ['cards', 'rows'],
    cancelledOn: false,
    cancelledCount: 1,
    usage: { used: 4, limit: 20, resetsAt: '2026-11-11T00:00:00Z' },
    locale: 'en'
  })
  assert.deepEqual(menu, [
    { kind: 'select', label: 'Select' },
    {
      kind: 'views',
      label: 'View',
      value: 'rows',
      options: [
        { value: 'cards', label: 'Cards' },
        { value: 'rows', label: 'Rows' }
      ]
    },
    { kind: 'cancelled', label: 'Show cancelled', checked: false, count: 1 },
    { kind: 'quota', label: '4 of 20 builds used today' }
  ])
  const full = lib.listMenu(t, {
    view: 'cards',
    views: ['cards', 'rows', 'map'],
    cancelledOn: true,
    cancelledCount: 0,
    usage: { used: 20, limit: 20, resetsAt: '2026-11-11T00:00:00Z' },
    locale: 'en'
  })
  assert.deepEqual(
    full[1].options.map((o) => o.label),
    ['Cards', 'Rows', 'Map']
  )
  assert.equal(full[2].checked, true)
  assert.match(full[3].label, /^20 of 20 builds used today\. Resets at /)
  const unknown = lib.listMenu(t, {
    view: 'cards',
    views: ['cards'],
    cancelledOn: false,
    cancelledCount: null,
    usage: null,
    locale: 'en'
  })
  assert.equal(
    unknown.some((e) => e.kind === 'quota'),
    false
  )
})

test('Columns, the step filter, the order line and bulk build are gone from the list and its strings', () => {
  const list = readFileSync(path.join(client, 'list.tsx'), 'utf8')
  for (const gone of [
    'ColumnsMenu',
    'StageFilter',
    'secondaryLines',
    'readMyFields',
    'buildDemos',
    'list.order'
  ])
    assert.equal(list.includes(gone), false, gone)
  assert.equal(existsSync(path.join(client, 'stage-filter.tsx')), false)
  for (const key of ['my.columns.note', 'list.order', 'my.field.type', 'v3.buildSelected', 'filter.label'])
    assert.equal(key in lib.en, false, key)
})
