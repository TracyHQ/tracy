/**
 * The Business brief table on Details (#517) as drawn: Fact, Value, Source and On the site, one row per fact, with
 * the field in plain words and a plain note on where it came from. Bundles the real component with React 18.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-business-brief-table.test.mjs
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-brief-table-'))
  const outfile = path.join(outDir, 'brief-table.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { BusinessBriefTable } from './business-brief-table.tsx'
        export { businessBriefRows } from './business-brief-model.ts'
        export { en } from './strings.ts'
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

const t = (key, params = {}) => {
  const text = lib.en[key]
  if (text === undefined) throw new Error(`missing string ${key}`)
  return text.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? `{${name}}`))
}
const profile = {
  sources: [
    { id: 'src_g', kind: 'google-places' },
    { id: 'src_w', kind: 'website' }
  ],
  evidence: [
    { id: 'ev_g', sourceId: 'src_g' },
    { id: 'ev_w', sourceId: 'src_w' }
  ],
  business: {
    phone: { id: 'f_phone', value: '+1 555 0100', evidenceRefs: ['ev_g', 'ev_w'] },
    serviceAreas: { id: 'f_area', value: ['North Bay'], evidenceRefs: ['ev_g'] }
  }
}
const decisions = [
  {
    factId: 'f_phone',
    field: 'phone',
    confidence: 'corroborated',
    onSite: true,
    decidedBy: 'rule',
    reasons: []
  },
  {
    factId: 'f_area',
    field: 'serviceAreas',
    confidence: 'single-source',
    onSite: false,
    decidedBy: 'rule',
    reasons: ['stale']
  }
]
const draw = (rows) =>
  lib.renderToStaticMarkup(lib.createElement(lib.BusinessBriefTable, { t, rows, onToggle: async () => true }))

test('the table has its four headings and one row per fact in plain words', () => {
  const html = draw(lib.businessBriefRows(profile, decisions, t, 'en'))
  for (const heading of ['Fact', 'Value', 'Source', 'On the site'])
    assert.match(html, new RegExp(`<th[^>]*>${heading}</th>`))
  assert.match(html, />Phone</)
  assert.match(html, />\+1 555 0100</)
  assert.match(html, />From Google and the website</)
  assert.match(html, />Service area</)
  assert.match(html, /Not on the site: the source is more than a year old\./)
  assert.doesNotMatch(html, /serviceAreas|Single source|Corroborated|Left off by rule/)
  // One switch per fact, on for the phone and off for the area.
  assert.equal((html.match(/role="switch"/g) ?? []).length, 2)
  assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 1)
})

test('no fact yet says the table fills in after research', () => {
  assert.match(draw([]), /Nothing to show yet\. The table fills in once research has run\./)
})
