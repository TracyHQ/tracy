/**
 * The demo progress cells (`src/client/demo-progress.tsx`): a failed demo action always draws its reason, whatever
 * an older check of the same build said. Bundles the real component with React 18 and renders static markup.
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-demo-progress-'))
  const outfile = path.join(outDir, 'demo-progress.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { ProgressCell, Steps } from './demo-progress.tsx'
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

const t = (key) => `[${key}]`
const row = {
  id: 'o1',
  demoAction: { id: 'a1', state: 'failed', step: 'check', error: 'DEMO_STEP_TIMEOUT' },
  latestBuild: { id: 'b1', state: 'done', done: true, qa: 'passed' },
  latestRevision: { id: 'r1', cms: 'wordpress' }
}

test('a failed action over a build whose older check passed draws its reason, in the list cell and the steps', () => {
  for (const Component of [lib.ProgressCell, lib.Steps]) {
    const html = lib.renderToStaticMarkup(lib.createElement(Component, { t, row, locale: 'en', now: 0 }))
    assert.match(html, /\[reason\.demo_step_timeout\]/, Component.name)
    assert.doesNotMatch(html, /\[v3\.demoReady\]/, Component.name)
  }
})

test('a Retry still running over an older passed check draws its progress, not Demo ready', () => {
  const running = { ...row, demoAction: { id: 'a2', state: 'queued', step: 'build', error: null } }
  for (const Component of [lib.ProgressCell, lib.Steps]) {
    const html = lib.renderToStaticMarkup(
      lib.createElement(Component, { t, row: running, locale: 'en', now: 0 })
    )
    assert.doesNotMatch(html, /\[v3\.demoReady\]/, Component.name)
  }
  const cell = lib.renderToStaticMarkup(
    lib.createElement(lib.ProgressCell, { t, row: running, locale: 'en', now: 0 })
  )
  assert.match(cell, /\[v3\.step\.build\]/)
  assert.match(cell, /\[v3\.building\]/)
})

test('a build waiting for its photos to be labelled says how far it is, in the list cell and the steps', () => {
  const tp = (key, params) => (params ? `[${key} ${params.looked}/${params.total}]` : `[${key}]`)
  const waiting = {
    id: 'o2',
    demoAction: { id: 'a3', state: 'queued', step: 'brief', error: null, photos: { looked: 180, total: 300 } }
  }
  for (const Component of [lib.ProgressCell, lib.Steps]) {
    const html = lib.renderToStaticMarkup(
      lib.createElement(Component, { t: tp, row: waiting, locale: 'en', now: 0 })
    )
    assert.match(html, /\[demo\.photosPending 180\/300\]/, Component.name)
  }
  const done = { ...waiting, demoAction: { ...waiting.demoAction, photos: undefined } }
  const cell = lib.renderToStaticMarkup(
    lib.createElement(lib.ProgressCell, { t: tp, row: done, locale: 'en', now: 0 })
  )
  assert.doesNotMatch(cell, /photosPending/)
})
