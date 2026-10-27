/**
 * The SETUP checklist on the left of the panel (`src/client/SetupRail.tsx`), after Orca's Getting
 * Started rail: one row per step, a ✓ for a done step or its number, the current step highlighted,
 * a "done/total" count beside the heading. Static markup, no bridge.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-onboard-rail-'))
  const outfile = path.join(outDir, 'rail.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { SetupRail } from './SetupRail'
        import { en } from './strings'
        const t = (key) => String(en[key] ?? key)
        export function rail(step, done) {
          return renderToStaticMarkup(createElement(SetupRail, { t, step, done, onJump: () => {} }))
        }
      `,
      resolveDir: path.join(here, '..', 'src', 'client'),
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

const rows = (html) =>
  [...html.matchAll(/<button[^>]*data-rail-step="(\d)"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => ({
    step: Number(m[1]),
    current: /aria-current="step"/.test(m[0]),
    done: /data-done="true"/.test(m[0]),
    mark: /<svg/.test(m[2]) ? '✓' : (m[2].match(/tv-ob-rail-num">(\d)</)?.[1] ?? '?'),
    text: m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/^\d/, '')
      .replace(/&amp;/g, '&')
  }))

test('the heading SETUP with the done count, four rows named after the steps', () => {
  const html = lib.rail(1, [true, false, true, false])
  assert.match(html, /tv-ob-rail-title">Setup</)
  assert.match(html, /tv-ob-rail-count">2\/4</)
  assert.deepEqual(
    rows(html).map((r) => r.text),
    ['Sign in', 'Pick your AI account', 'Appearance & language', 'Notifications']
  )
})

test('a done step shows ✓, an open one its number; the current step is highlighted', () => {
  const r = rows(lib.rail(1, [true, false, true, false]))
  assert.deepEqual(
    r.map((x) => [x.mark, x.current, x.done]),
    [
      ['✓', false, true],
      ['2', true, false],
      ['✓', false, true],
      ['4', false, false]
    ]
  )
})
