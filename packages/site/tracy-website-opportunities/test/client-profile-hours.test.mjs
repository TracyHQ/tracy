/**
 * "Opening hours" on the Details Profile card: the server's hours decision as a row, with Check this while one
 * source alone says open 24 hours every day, Checked once the person acted. Bundles the real component with
 * React 18 (the one dsh's page runs) and renders it to static markup.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-profile-hours.test.mjs
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-profile-hours-'))
  const outfile = path.join(outDir, 'profile-hours.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { ProfileHoursRow } from './profile-hours-row.tsx'
        export { hoursRowView, typedHours } from './profile-hours-model.ts'
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
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const ALL_DAY = DAYS.map((d) => `${d}: Open 24 hours`)
const OFFICE = ['Mo-Fr 09:00-18:00', 'Sa-Su closed']
// The server's decision for Harbour Sport Club (dev, 26/10/2026): Google alone says open 24 hours every day.
const DUBAI = { state: 'check', hours: [], claims: [{ source: 'google', hours: ALL_DAY }], allWeek: true }
const profile = (hoursCheck) => ({ hoursCheck })
const draw = (view) =>
  lib.renderToStaticMarkup(lib.createElement(lib.ProfileHoursRow, { t, view, onSave: async () => 'ok' }))

test('Harbour Sport Club: the hours Google gives, Check this, the note, Keep, Edit hours, Leave off the site', () => {
  const view = lib.hoursRowView(profile(DUBAI))
  assert.deepEqual(view, {
    hours: ALL_DAY,
    sourceHours: ALL_DAY,
    left: false,
    chip: 'check',
    source: 'google',
    sourceLabel: null,
    open: true
  })
  const html = draw(view)
  assert.match(html, /\[field\.hours\]/)
  assert.match(html, /Monday: Open 24 hours/)
  assert.match(html, /tracy-wo-name-chip is-check/)
  // The chip sits on the first hours line, as on the Name and Google rating rows, not beside the middle of the list.
  assert.match(html, /<span>Monday: Open 24 hours<\/span><span[^>]*tracy-wo-name-chip is-check/)
  assert.match(html, /\[hours\.note\{&quot;source&quot;:&quot;Google&quot;\}\]/)
  assert.match(html, /\[name\.keep\]/)
  assert.match(html, /\[hours\.edit\]/)
  assert.match(html, /\[hours\.leave\]/)
  assert.doesNotMatch(html, /\[name\.change\]/)
})

test('kept: the hours, Checked and Change, no note', () => {
  const view = lib.hoursRowView(profile({ ...DUBAI, state: 'chosen', choice: 'keep', hours: ALL_DAY }))
  assert.equal(view.chip, 'checked')
  assert.equal(view.open, false)
  const html = draw(view)
  assert.match(html, /Sunday: Open 24 hours/)
  assert.match(html, /tracy-wo-name-chip is-checked/)
  assert.match(html, /\[name\.change\]/)
  assert.doesNotMatch(html, /hours\.note|\[name\.keep\]/)
})

test('left off the site: no hours, said so, Checked; Keep stays possible after Change', () => {
  const view = lib.hoursRowView(profile({ ...DUBAI, state: 'chosen', choice: 'leave', hours: [] }))
  assert.equal(view.left, true)
  assert.deepEqual(view.hours, [])
  assert.deepEqual(view.sourceHours, ALL_DAY)
  const html = draw(view)
  assert.match(html, /\[hours\.left\]/)
  assert.doesNotMatch(html, /Open 24 hours/)
  assert.match(html, /\[name\.change\]/)
})

test('typed hours show as the site’s hours', () => {
  const view = lib.hoursRowView(profile({ ...DUBAI, state: 'chosen', choice: 'edit', hours: OFFICE }))
  assert.deepEqual(view.hours, OFFICE)
  assert.match(draw(view), /Mo-Fr 09:00-18:00/)
})

test('agreed hours show plainly; none and disagreeing sources draw no row', () => {
  const view = lib.hoursRowView(profile({ state: 'agreed', hours: OFFICE, claims: [], allWeek: false }))
  assert.equal(view.chip, null)
  const html = draw(view)
  assert.doesNotMatch(html, /tracy-wo-name-chip|\[name\.keep\]|\[hours\.edit\]/)
  assert.equal(lib.hoursRowView(profile({ state: 'none', hours: [], claims: [] })), null)
  assert.equal(lib.hoursRowView(profile({ state: 'conflict', hours: [], claims: [] })), null)
  assert.equal(lib.hoursRowView({}), null)
})

test('a listing site is named by its own name in the note', () => {
  const view = lib.hoursRowView(
    profile({ ...DUBAI, claims: [{ source: 'listing', label: 'magicpin', hours: ALL_DAY }] })
  )
  assert.match(draw(view), /\[hours\.note\{&quot;source&quot;:&quot;magicpin&quot;\}\]/)
})

test('typedHours: one line per group of days, blank lines dropped', () => {
  assert.deepEqual(lib.typedHours(' Mo-Fr 09:00-18:00 \n\nSa closed\n'), ['Mo-Fr 09:00-18:00', 'Sa closed'])
})
