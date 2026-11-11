/**
 * The header of the Find businesses and Added businesses tabs (#537, option A): the title, the one description
 * line, and the optional slot at the right end of the title row. Rendered to static markup with React 18.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-page-header.test.mjs
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-page-header-'))
  const outfile = path.join(outDir, 'page-header.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { PageHeader } from './page-header.tsx'
        export { PAGE_HEADER_CSS } from './page-header-css.ts'
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

const html = (props, ...kids) => lib.renderToStaticMarkup(lib.createElement(lib.PageHeader, props, ...kids))

test('title and description, no slot element when there is no child', () => {
  const out = html({ title: 'Find businesses', description: lib.en['find.desc'] })
  assert.match(out, /<h2 class="tracy-wo-pghead-title">Find businesses<\/h2>/)
  assert.match(out, /<p class="tracy-wo-pghead-desc">Search an area for businesses without a website/)
  assert.doesNotMatch(out, /pghead-slot/)
})

test('the slot comes after the description so it drops under it on narrow widths', () => {
  const out = html(
    { title: lib.en['list.title'], description: lib.en['list.desc'] },
    lib.createElement('button', null, 'Tools')
  )
  assert.ok(out.indexOf('pghead-desc') < out.indexOf('pghead-slot'))
  assert.match(out, /<div class="tracy-wo-pghead-slot"><button>Tools<\/button><\/div>/)
})

test('the English copy of both tabs, and the 720px drop in the CSS', () => {
  assert.equal(lib.en['list.title'], 'Added businesses')
  assert.equal(lib.en['find.title'], 'Find businesses')
  assert.match(lib.en['list.desc'], /^The businesses you added and where each one stands/)
  assert.match(lib.PAGE_HEADER_CSS, /@container \(max-width: 720px\)/)
  assert.doesNotMatch(lib.PAGE_HEADER_CSS, /[–—]/)
})
