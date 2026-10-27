/**
 * The AI accounts row of the account menu rendered to markup (`src/client/AiAccountsRow.tsx`
 * `AiAccountsRowView`): the section's name, then the connected vendors' marks; nothing connected →
 * every allowed vendor's mark greyed and "Not connected"; nothing known → the name alone. A vendor
 * with no mark in `vendor-marks.tsx` gets the first letter of its name. Bundled with esbuild the way
 * `chip-render.test.mjs` does it.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.join(here, '..', 'src', 'client')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-ai-accounts-row-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { AiAccountsRowView } from './AiAccountsRow'
        import { en } from './strings'
        const t = (key, params = {}) => String(en[key] ?? key).replace(/\\{(\\w+)\\}/g, (_, k) => String(params[k] ?? ''))
        export function view(stack) {
          return renderToStaticMarkup(createElement(AiAccountsRowView, { t, stack, onOpen: () => {} }))
        }
      `,
      resolveDir: clientDir,
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** @param {string} html */
const text = (html) => html.replace(/<[^>]+>/g, '')
/** @param {string} html */
const marks = (html) => [...html.matchAll(/data-vendor-mark="([^"]+)"/g)].map((m) => m[1])

test('nothing known yet: the row is the section name alone, no marks, no claim', () => {
  const html = lib.view(undefined)
  assert.equal(text(html), 'AI accounts')
  assert.deepEqual(marks(html), [])
  assert.match(html, /role="menuitem"/)
})

test('connected vendors: their marks in order, each named, and no "Not connected"', () => {
  const html = lib.view({
    connected: true,
    vendors: [
      { id: 'codex', name: 'ChatGPT Codex' },
      { id: 'claude', name: 'Claude' }
    ]
  })
  assert.deepEqual(marks(html), ['codex', 'claude'])
  assert.equal(text(html), 'AI accounts')
  assert.match(html, /title="ChatGPT Codex"/)
  assert.match(html, /<svg/)
})

test('nothing connected: every allowed vendor greyed, and the words "Not connected"', () => {
  const html = lib.view({
    connected: false,
    vendors: [
      { id: 'claude', name: 'Claude' },
      { id: 'grok', name: 'Grok' }
    ]
  })
  assert.deepEqual(marks(html), ['claude', 'grok'])
  assert.equal(text(html), 'AI accountsNot connected')
  assert.match(html, /data-vendor-stack="none"/)
})

test('a vendor with no mark shows the first letter of its name, never a borrowed logo', () => {
  const html = lib.view({ connected: true, vendors: [{ id: 'cursor', name: 'Cursor' }] })
  assert.deepEqual(marks(html), ['cursor'])
  assert.match(html, /data-vendor-mark="cursor"[^>]*>C</)
  assert.doesNotMatch(html, /data-vendor-mark="cursor"[^>]*><svg/)
})

test('Copilot, Antigravity and Kimi draw their marks; Cursor and Kiro keep the letter', () => {
  const html = lib.view({
    connected: true,
    vendors: [
      { id: 'copilot', name: 'GitHub Copilot' },
      { id: 'antigravity', name: 'Antigravity' },
      { id: 'kimi', name: 'Kimi' },
      { id: 'cursor', name: 'Cursor' },
      { id: 'kiro', name: 'Kiro' }
    ]
  })
  for (const id of ['copilot', 'antigravity', 'kimi']) {
    assert.match(html, new RegExp(`data-vendor-mark="${id}"[^>]*><svg`), id)
  }
  assert.match(html, /data-vendor-mark="cursor"[^>]*>C</)
  assert.match(html, /data-vendor-mark="kiro"[^>]*>K</)
})

test('GLM and Qwen draw their one-colour marks in the same 24px box as Kimi', () => {
  const html = lib.view({
    connected: true,
    vendors: [
      { id: 'kimi', name: 'Kimi' },
      { id: 'glm', name: 'GLM' },
      { id: 'qwen', name: 'Qwen' }
    ]
  })
  for (const id of ['glm', 'qwen']) {
    const mark = html.slice(html.indexOf(`data-vendor-mark="${id}"`))
    const svg = mark.slice(0, mark.indexOf('</svg>'))
    assert.match(svg, /><svg[^>]*viewBox="0 0 24 24"/, id)
    assert.match(svg, /fill="currentColor"/, `${id} paints in the theme colour`)
    assert.doesNotMatch(svg, /url\(#|fill="#/, `${id} has no colour of its own`)
  }
})
