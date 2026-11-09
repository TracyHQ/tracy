/**
 * The Progress card of Details and its one line strip on a sub-page (`src/client/stepper.tsx`, layout C with stepper
 * style D). Bundles the real component with React 18 (the one dsh's page runs) and renders it to static markup.
 *
 *   node --test packages/site/tracy-website-opportunities/test/client-progress-card.test.mjs
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-progress-'))
  const outfile = path.join(outDir, 'progress.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { Stepper } from './stepper.tsx'
        export { stepperView } from './stepper-model.ts'
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
const RESEARCHED = { state: 'done', researchedAt: '2026-11-09T08:00:00Z', done: true }
const draw = (input, strip = false) =>
  lib.renderToStaticMarkup(
    lib.createElement(lib.Stepper, {
      t,
      view: lib.stepperView(input),
      locale: 'en-US',
      busy: false,
      strip,
      onAction: () => undefined
    })
  )
const states = (html) => [...html.matchAll(/class="tracy-wo-step" data-state="(\w+)"/g)].map((m) => m[1])

test('a new place: Research is current with its line and Start research inside the card, the rest upcoming', () => {
  const html = draw({ research: { state: 'not_started', researchedAt: null, done: false }, demo: 'none' })
  assert.match(html, /\[progress\.title\]/)
  assert.deepEqual(states(html), ['current', 'future', 'future'])
  assert.match(html, /\[stepper\.research\.notStarted\]/)
  assert.equal((html.match(/<button/g) ?? []).length, 1)
  assert.match(html, /<button[^>]*>\[job\.start\]<\/button>/)
})

test('brief ready: two steps done with their date, Build demo the one action', () => {
  const html = draw({
    research: RESEARCHED,
    brief: { id: 'b1', n: 1, createdAt: '2026-11-09T09:00:00Z' },
    demo: 'none'
  })
  assert.deepEqual(states(html), ['done', 'done', 'current'])
  assert.equal((html.match(/\[stepper\.doneOn\{&quot;date&quot;:&quot;Nov 9&quot;\}\]/g) ?? []).length, 2)
  assert.match(html, /\[v3\.buildDemo\]/)
})

test('a running job reads Running, disabled; a ready demo leaves no button at all', () => {
  const running = draw({
    research: RESEARCHED,
    briefJob: { id: 'j', state: 'running', step: 'reading' },
    demo: 'none'
  })
  assert.match(running, /<button[^>]*disabled[^>]*>.*\[stepper\.running\]/)
  const done = draw({ research: RESEARCHED, brief: { id: 'b1', n: 1 }, demo: 'ready' })
  assert.deepEqual(states(done), ['done', 'done', 'done'])
  assert.doesNotMatch(done, /<button/)
})

test('the strip of a sub-page: the three names on one line and the same one action', () => {
  const html = draw({ research: RESEARCHED, brief: null, demo: 'none' }, true)
  assert.match(html, /tracy-wo-progress-strip/)
  assert.deepEqual(states(html), ['done', 'current', 'future'])
  assert.match(html, /\[brief\.make\]/)
  assert.doesNotMatch(html, /stepper\.brief\.ready/)
})

test('a stopped step says why it stopped, once, with Try again', () => {
  const html = draw({ research: { state: 'failed', researchedAt: null, done: false }, demo: 'none' })
  assert.match(html, /\[stepper\.research\.failed\]/)
  assert.doesNotMatch(html, /\[stepper\.stopped\]/)
  assert.match(html, /\[action\.tryAgain\]/)
})
