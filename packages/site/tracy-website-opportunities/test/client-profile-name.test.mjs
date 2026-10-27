/**
 * "Name on the site" on the Details Profile card: the server's name decision as a row, with Check this while the
 * sources disagree, Checked once the person acted, and what each source says. Bundles the real component with
 * React 18 (the one dsh's page runs) and renders it to static markup.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-profile-name.test.mjs
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-profile-name-'))
  const outfile = path.join(outDir, 'profile-name.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { ProfileNameRow } from './profile-name-row.tsx'
        export { nameKey, nameOnSite, nameRowView } from './profile-name-model.ts'
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
// The server's decision for Harbour Sport Club (dev, 26/10/2026), as `GET /api/website-opportunities/:id` answers it.
const DUBAI = {
  name: 'Harbour Sport Club',
  state: 'check',
  suggested: 'Harbour Sport Club',
  current: 'Padel & Tennis Coach',
  disagree: true,
  options: [
    { name: 'Harbour Sport Club', sources: [{ source: 'instagram' }, { source: 'logo' }] },
    {
      name: 'Padel & Tennis Coach',
      sources: [{ source: 'google' }, { source: 'listing', label: 'magicpin' }]
    }
  ]
}
const profile = (nameCheck) => ({ name: nameCheck.name, nameCheck })
const draw = (view) =>
  lib.renderToStaticMarkup(lib.createElement(lib.ProfileNameRow, { t, view, onSave: async () => true }))

test('unchecked and the sources disagree: Check this, what each source says (its own marks first), Keep, Use the other name, Edit', () => {
  const view = lib.nameRowView(profile(DUBAI))
  assert.deepEqual(view, {
    name: 'Harbour Sport Club',
    chip: 'check',
    lines: [
      {
        name: 'Harbour Sport Club',
        sources: [
          { key: 'logo', label: null },
          { key: 'instagram', label: null }
        ]
      },
      {
        name: 'Padel & Tennis Coach',
        sources: [
          { key: 'google', label: null },
          { key: 'listing', label: 'magicpin' }
        ]
      }
    ],
    other: 'Padel & Tennis Coach',
    open: true
  })
  const html = draw(view)
  assert.match(html, /\[name\.label\]/)
  assert.match(html, /tracy-wo-name-chip is-check/)
  assert.match(html, /\[name\.chip\.check\]/)
  assert.match(
    html,
    /\[name\.say\.many\{&quot;sources&quot;:&quot;\[name\.source\.logo\] and Instagram&quot;,&quot;name&quot;:&quot;Harbour Sport Club&quot;\}\]/
  )
  assert.match(html, /Google Maps and magicpin/)
  assert.match(html, /\[name\.keep\]/)
  assert.match(html, /\[name\.use\{&quot;name&quot;:&quot;Padel &amp; Tennis Coach&quot;\}\]/)
  assert.match(html, /\[name\.edit\]/)
  assert.doesNotMatch(html, /\[name\.change\]/)
})

test('after the person picked: Checked and Change, the sources no longer spelled out', () => {
  const view = lib.nameRowView(
    profile({
      ...DUBAI,
      name: 'Padel & Tennis Coach',
      state: 'chosen',
      chosen: { name: 'Padel & Tennis Coach', by: 'picked' }
    })
  )
  assert.equal(view.chip, 'checked')
  assert.equal(view.open, false)
  assert.equal(view.lines[0].name, 'Padel & Tennis Coach')
  assert.equal(view.other, 'Harbour Sport Club')
  const html = draw(view)
  assert.match(html, /tracy-wo-name-chip is-checked/)
  assert.match(html, /\[name\.change\]/)
  assert.doesNotMatch(html, /\[name\.keep\]|name\.say/)
})

test('a typed name against the sources reads Checked too', () => {
  const view = lib.nameRowView(
    profile({ ...DUBAI, state: 'chosen', chosen: { name: 'Harbour Sport Club', by: 'typed' } })
  )
  assert.equal(view.chip, 'checked')
})

test('sources that agree: the name alone, no chip and no actions', () => {
  const agreed = {
    name: 'Taco Corner No. 7',
    state: 'agreed',
    suggested: 'Taco Corner No. 7',
    current: 'Taco Corner No. 7',
    disagree: false,
    options: [{ name: 'Taco Corner No. 7', sources: [{ source: 'google' }, { source: 'website' }] }]
  }
  const view = lib.nameRowView(profile(agreed))
  assert.equal(view.chip, null)
  assert.equal(view.open, false)
  assert.equal(view.other, null)
  const html = draw(view)
  assert.doesNotMatch(html, /name-chip|name\.keep|name\.change|name\.say/)
  assert.match(html, /Taco Corner No\. 7/)
})

test('no decision on the profile: no row; the title falls back to the opportunity name', () => {
  assert.equal(lib.nameRowView({ name: 'Old' }), null)
  assert.equal(lib.nameRowView(null), null)
  assert.equal(lib.nameOnSite({ name: 'Old' }, 'Row name'), 'Row name')
  assert.equal(lib.nameOnSite(profile(DUBAI), 'Padel & Tennis Coach'), 'Harbour Sport Club')
  assert.equal(lib.nameOnSite(null, null), '')
})

test('nameKey compares names as the server does', () => {
  assert.equal(lib.nameKey('harbour.sportclub'), lib.nameKey('Harbour Sport Club'))
  assert.equal(lib.nameKey('Padel & Tennis Coach'), lib.nameKey('padel and tennis coach'))
})
