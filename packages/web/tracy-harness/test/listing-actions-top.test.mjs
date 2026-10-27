/**
 * The Listing section's presses sit on its heading row, top right (Akemi, 10/10/2026): Update/Save
 * listing and Regenerate/Create listing beside the "Listing" heading, what holds Save back right under
 * them, then the status strips, then the editor. No press row is left at the foot of the section, and
 * the old "Preview only · nothing saved" tag is gone (the save press wears its own unsaved dot).
 *
 * Rendered to static markup from `DemoCardEditor` with a minimal model; the save and generate presses
 * are plain placeholders here, since `DesignInspirationBody` builds them.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { opsI18nPlugin } from './support/ops-i18n-esbuild.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.join(here, '..')
const repoRoot = path.resolve(pkgRoot, '..', '..', '..')
const require = createRequire(import.meta.url)
const rootRequire = createRequire(path.join(repoRoot, 'package.json'))

let lib

before(async () => {
  const built = await rootRequire('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { DemoCardEditor } from './cms/DemoCardEditor'`,
      resolveDir: path.join(pkgRoot, 'src'),
      loader: 'tsx'
    },
    absWorkingDir: pkgRoot,
    bundle: true,
    plugins: [opsI18nPlugin()],
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    define: { 'import.meta.url': '"http://harness.test/assets/"' },
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    external: ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/server'],
    write: false,
    logLevel: 'silent'
  })
  const mod = { exports: {} }
  new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require)
  lib = mod.exports
})

const noop = () => {}

function render({ checklist = [], otherRules = [], warnings = [], locked = false } = {}) {
  const { createElement: h, renderToStaticMarkup, DemoCardEditor } = lib
  const model = {
    card: { layouts: [], categories: [] },
    name: 'Tracy Business',
    template: null,
    shots: [],
    categories: [],
    platforms: ['wordpress'],
    reason: null,
    writable: true,
    locked,
    checklist,
    otherRules,
    warnings,
    edit: noop,
    layoutAt: noop,
    setPath: noop,
    addPage: noop,
    commitPagePath: noop,
    removePage: noop,
    movePage: noop,
    shootPage: async () => null,
    rowProblems: [],
    pageShoot: {},
    focusKey: null,
    hasDemo: true,
    saveButton: h('button', { 'data-card-save': '' }, 'Update listing'),
    generateButton: h('button', { 'data-card-generate': '' }, 'Regenerate listing'),
    uploadShot: async () => null
  }
  return renderToStaticMarkup(
    h(DemoCardEditor, { model, status: h('div', { 'data-card-status': 'Listed' }, 'Listed.') })
  )
}

test('the presses sit on the Listing heading row, before the status strips and the editor', () => {
  const html = render()
  const heading = html.indexOf('>Listing</h3>')
  const save = html.indexOf('data-card-save')
  const generate = html.indexOf('data-card-generate')
  const status = html.indexOf('data-card-status')
  const edit = html.indexOf('Edit listing')
  assert.ok(heading >= 0, 'the Listing heading is drawn by the editor')
  assert.ok(heading < save && save < generate, 'Update then Regenerate follow the heading')
  assert.ok(generate < status && status < edit, 'the presses come before the status strip and the form')
  assert.equal(html.match(/data-card-save/g).length, 1, 'no second press row at the foot')
})

test('the old unsaved tag and the help line are gone from the Templates page', () => {
  const html = render()
  assert.doesNotMatch(html, /Preview only/)
  assert.doesNotMatch(html, /data-card-help/)
})

test('what Save needs is a short checklist under the presses, before the status strip', () => {
  const html = render({
    checklist: [
      { label: 'Category', ok: false },
      { label: 'Blurb', ok: true }
    ],
    warnings: ['No mobile picture.']
  })
  const generate = html.indexOf('data-card-generate')
  const check = html.indexOf('data-card-check="todo"')
  const warning = html.indexOf('No mobile picture.')
  const status = html.indexOf('data-card-status')
  assert.ok(generate < check && check < status, 'the checklist sits between the presses and the strip')
  assert.ok(generate < warning && warning < status, 'warnings too')
  assert.match(html, /data-card-check="done"/)
  assert.doesNotMatch(html, /sm:text-end/, 'left aligned, not loose right aligned lines')
})

test('no notes block when nothing holds Save back', () => {
  assert.doesNotMatch(render({ checklist: [{ label: 'Category', ok: true }] }), /data-card-notes/)
})

test('waiting for the demo: one muted line, no checklist, the form hidden', () => {
  const html = render({ locked: true, checklist: [{ label: 'Category', ok: false }] })
  assert.match(html, /data-card-locked=""[^>]*>Waiting for the demo site\.</)
  assert.doesNotMatch(html, /data-card-notes/)
  assert.match(html, /<div class="grid[^"]*" hidden="">/)
})
