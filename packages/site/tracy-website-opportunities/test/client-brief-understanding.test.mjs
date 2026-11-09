/**
 * The brief view as drawn (#520): "How Tracy understands {business}" with only the cards the brief covers, the raw
 * brief behind a Full brief control that starts closed; and Site name on Tracy as the Business brief's first row
 * (#519). Bundles the real components with React 18. The business is made up.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-brief-understanding.test.mjs
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-brief-view-'))
  const outfile = path.join(outDir, 'brief-view.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { BusinessBriefTable } from './business-brief-table.tsx'
        export { BriefUnderstanding } from './brief-understanding.tsx'
        export { SiteNameRow } from './site-name-row.tsx'
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
const brief = {
  business: { name: 'Harbour Lane Bakery', phone: '+1 555 0100' },
  reading: {
    method: 'model',
    services: [{ id: 's1', label: 'Sourdough bread', quote: 'x', source: { kind: 'website' } }],
    audience: [],
    team: [],
    story: []
  }
}
const markdown = '# Site brief: Harbour Lane Bakery\n\n## Business\n- Phone: +1 555 0100'
const view = (props) =>
  lib.renderToStaticMarkup(lib.createElement(lib.BriefUnderstanding, { t, brief, markdown, ...props }))

test('the view is titled by the business and shows only the cards the brief covers', () => {
  const html = view()
  assert.match(html, />How Tracy understands Harbour Lane Bakery</)
  assert.match(html, />What they offer</)
  assert.match(html, />Sourdough bread</)
  assert.match(html, />How to reach them</)
  for (const omitted of ['Who they are', 'What makes them stand out', 'Who they serve'])
    assert.doesNotMatch(html, new RegExp(omitted))
})

test('the raw brief sits behind Full brief, closed until opened', () => {
  const html = view()
  assert.match(html, /<details[^>]*><summary[^>]*>Full brief<\/summary>/)
  assert.doesNotMatch(html, /<details[^>]*\bopen/)
  assert.match(html, /# Site brief: Harbour Lane Bakery/)
})

test('a brief with nothing readable says so and still offers the full brief', () => {
  const html = view({ brief: {} })
  assert.match(html, />How Tracy understands this business</)
  assert.match(html, /Tracy has not read enough about this business yet/)
  assert.match(html, />Full brief</)
})

test('Site name on Tracy is the first row of the Business brief, even before research has run', () => {
  const api = { siteLabel: () => new Promise(() => {}) }
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.BusinessBriefTable, {
      t,
      rows: [],
      firstRow: lib.createElement(lib.SiteNameRow, { t, api, opportunityId: 'o1' }),
      onToggle: async () => true
    })
  )
  assert.match(html, /<tbody><tr class="tracy-wo-site-name"><th scope="row">Site name on Tracy<\/th>/)
  assert.match(html, /The address of the demo, and of the site when the business takes it over\./)
  assert.match(html, /Nothing to show yet\./)
})
