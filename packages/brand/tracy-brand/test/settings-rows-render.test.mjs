/**
 * Settings › General rows Tracy draws in place of dsh's (Akemi, 02/10/2026, option B of the settings
 * review), rendered to markup: Appearance as three window thumbnails with the persisted preference
 * pressed, and Font size as a minus/value/plus stepper that stops at the theme service's bounds.
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
// react-dom is not a dependency of this package; @tracy/core carries it, and pnpm resolves both
// packages' react to the same copy, so the render below has one React.
const coreModules = path.resolve(here, '..', '..', '..', 'core', 'tracy-core', 'node_modules')
const require = createRequire(import.meta.url)
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'tb-rows-'))
  const outfile = path.join(outDir, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { renderToStaticMarkup } from 'react-dom/server'
        import { AppearanceRow } from './appearance-row'
        import { FontSizeRow } from './rows'
        import { en } from './strings'
        const t = (key) => en[key]
        export function appearance(preference) {
          const theme = { getPreference: () => preference, setTheme: () => {}, subscribe: () => () => {} }
          return renderToStaticMarkup(createElement(AppearanceRow, { t, theme }))
        }
        export function fontSize(px) {
          const theme = { getFontSize: () => px, setFontSize: () => {}, subscribe: () => () => {}, min: 12, max: 17 }
          return renderToStaticMarkup(createElement(FontSizeRow, { t, theme }))
        }
      `,
      resolveDir: clientDir,
      loader: 'tsx'
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    nodePaths: [coreModules],
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

/** @param {string} html */
const pressed = (html) =>
  [
    ...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>[\s\S]*?<span class="tb-th-cap">([^<]+)/g)
  ].map((m) => `${m[2]}:${m[1]}`)

test('Appearance shows Light, Dark and System thumbnails with the persisted preference pressed', () => {
  assert.deepEqual(pressed(lib.appearance('system')), ['Light:false', 'Dark:false', 'System:true'])
  assert.deepEqual(pressed(lib.appearance('dark')), ['Light:false', 'Dark:true', 'System:false'])
})

test('Appearance draws System as a split preview, half light and half dark', () => {
  const html = lib.appearance('light')
  assert.equal((html.match(/tb-pv-split/g) ?? []).length, 1)
  const split = html.slice(html.indexOf('tb-pv-split'))
  assert.match(split, /tb-pv-win"[\s\S]*tb-pv-win tb-pv-dark/)
  assert.match(html, /role="group" aria-labelledby="[^"]+"/)
})

test('Font size is a stepper showing the current size, not a number field', () => {
  const html = lib.fontSize(14)
  assert.doesNotMatch(html, /type="number"/)
  assert.match(html, /<output[^>]*>14(<!-- -->)? px<\/output>/)
  assert.match(html, /aria-label="Decrease font size"/)
  assert.match(html, /aria-label="Increase font size"/)
  assert.doesNotMatch(html, /disabled/)
})

test('Font size stepper stops at the theme bounds', () => {
  assert.match(lib.fontSize(12), /aria-label="Decrease font size" disabled=""/)
  assert.match(lib.fontSize(17), /aria-label="Increase font size" disabled=""/)
})
