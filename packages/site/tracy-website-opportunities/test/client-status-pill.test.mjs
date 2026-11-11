/**
 * The one status pill (`src/client/status-pill.tsx`, #537 option A1): each state draws its own glyph and the
 * stylesheet gives each state its Tracy token, a tinted fill and no border. Bundles the real component with React 18
 * and renders it to static markup.
 *
 *   node --test --test-concurrency=1 packages/site/tracy-website-opportunities/test/client-status-pill.test.mjs
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
  outDir = mkdtempSync(path.join(process.env.TRACY_TEST_ARTIFACT_DIR || tmpdir(), 'wo-pill-'))
  const outfile = path.join(outDir, 'pill.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        export { createElement } from 'react'
        export { renderToStaticMarkup } from 'react-dom/server'
        export { StatusPill, PILL_GLYPH } from './status-pill.tsx'
        export { STATUS_PILL_CSS } from './status-pill-css.ts'
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

const draw = (props) => lib.renderToStaticMarkup(lib.createElement(lib.StatusPill, props))

test('each state maps to its glyph: spinner, check, cross, triangle, eye-off, ring, none for info', () => {
  assert.deepEqual(lib.PILL_GLYPH, {
    running: 'spinner',
    done: 'check',
    failed: 'x',
    attention: 'triangle',
    neutral: 'ring',
    off: 'eye-off',
    info: null
  })
  const icon = {
    running: 'loader-circle',
    done: 'check',
    failed: 'x',
    attention: 'triangle-alert',
    off: 'eye-off'
  }
  for (const [state, name] of Object.entries(icon)) {
    const html = draw({ state, label: 'Words' })
    assert.match(html, new RegExp(`^<span class="tracy-wo-pill" data-pill="${state}" data-glyph="">`), state)
    assert.match(html, new RegExp(`<svg[^>]*class="lucide lucide-${name} tracy-wo-pill-glyph"`), state)
    assert.match(html, /<span class="tracy-wo-pill-text">Words<\/span><\/span>$/, state)
  }
  // Running spins; nothing else does.
  assert.match(draw({ state: 'running', label: 'Running' }), /data-spin=""/)
  assert.doesNotMatch(draw({ state: 'done', label: 'Done' }), /data-spin/)
  // Neutral is a hollow ring of its own.
  assert.match(
    draw({ state: 'neutral', label: 'Waiting' }),
    /<svg aria-hidden="true" class="tracy-wo-pill-glyph" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"><\/circle><\/svg>/
  )
  // Info has no glyph and no glyph padding.
  assert.equal(
    draw({ state: 'info', label: 'Step 1 of 3' }),
    '<span class="tracy-wo-pill" data-pill="info"><span class="tracy-wo-pill-text">Step 1 of 3</span></span>'
  )
})

test('a glyph override replaces the state glyph, null removes it, and the title and placement class pass through', () => {
  const lock = lib.createElement('svg', { 'data-lock': '' })
  const html = draw({
    state: 'neutral',
    label: 'Locked',
    glyph: lock,
    title: 'Approve first',
    className: 'x-place'
  })
  assert.match(
    html,
    /^<span class="tracy-wo-pill x-place" data-pill="neutral" data-glyph="" title="Approve first"><svg data-lock=""><\/svg>/
  )
  assert.doesNotMatch(html, /<circle/)
  assert.equal(
    draw({ state: 'failed', label: 3, glyph: null }),
    '<span class="tracy-wo-pill" data-pill="failed"><span class="tracy-wo-pill-text">3</span></span>'
  )
})

test('the stylesheet: 22px, 11px 500, round, no border, tinted fill; each state on its token; failed always pure red', () => {
  const css = lib.STATUS_PILL_CSS
  const base = css.match(/\.tracy-wo-pill \{[^}]*\}/)[0]
  for (const rule of [
    'height: 22px',
    'padding: 0 8px',
    'gap: 5px',
    'border: 0',
    'border-radius: 999px',
    'font-size: 11px',
    'font-weight: 500'
  ])
    assert.ok(base.includes(rule), rule)
  assert.match(base, /background: color-mix\(in oklab, var\(--wo-pill-c\) 12%/)
  assert.match(css, /\.tracy-wo-pill\[data-glyph\] \{ padding-left: 6px; \}/)
  assert.match(css, /\.tracy-wo-pill > svg \{ flex: none; width: 14px; height: 14px; \}/)
  assert.match(css, /stroke-width: 2;/)
  const token = { running: '--primary', done: '--success', attention: '--warning', failed: '--destructive' }
  for (const [state, name] of Object.entries(token))
    assert.match(
      css,
      new RegExp(`\\.tracy-wo-pill\\[data-pill='${state}'\\] \\{ --wo-pill-c: var\\(${name}\\);`),
      state
    )
  assert.match(
    css,
    /\[data-pill='failed'\] \{ --wo-pill-c: var\(--destructive\); color: var\(--destructive\); \}/
  )
  assert.match(
    css,
    /\[data-pill='neutral'\], \.tracy-wo-pill\[data-pill='off'\], \.tracy-wo-pill\[data-pill='info'\] \{ background: color-mix\(in oklab, var\(--foreground\) 7%/
  )
  // Dark follows dsh's own signal, with a stronger tint and the token itself as the text.
  assert.match(
    css,
    /\[data-ds-dark-theme\] \.tracy-wo-pill, \.dark \.tracy-wo-pill \{ background: color-mix\(in oklab, var\(--wo-pill-c\) 16%[^}]*color: var\(--wo-pill-c\); \}/
  )
  // Tracy tokens only: no hand-typed colour, no dsh alias, no halo.
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b|rgb\(|oklch\(|--dsw[-]alias|box-shadow|`/i)
})
