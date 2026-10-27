/**
 * `@tracy/dsh-settings/language-row`: Settings › Language as another plugin mounts it (the desktop
 * first-run screen, `@tracy/dsh-onboard`). The face over dsh's locale service writes the same cookie
 * Settings writes, the menu panel carries the caller's scope, and the row's CSS works outside
 * Settings' `.ts-overlay`.
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
const manifest = JSON.parse(require('node:fs').readFileSync(path.join(here, '..', 'package.json'), 'utf8'))
let outDir = ''
/** @type {any} */
let lib

before(async () => {
  outDir = mkdtempSync(path.join(tmpdir(), 'ts-lang-row-export-'))
  const outfile = path.join(outDir, 'row.cjs')
  await require('esbuild').build({
    entryPoints: [path.join(here, '..', manifest.exports['./language-row'])],
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
  delete globalThis.document
})

test('languageFace: a pick goes to dsh and writes tracy_lang; Follow device clears both', () => {
  const calls = []
  const writes = []
  globalThis.document = {
    set cookie(value) {
      writes.push(value)
    }
  }
  const locale = {
    getSnapshot: () => ({ active: 'en', locales: [] }),
    subscribe: () => () => {},
    setLocale: (id) => calls.push(['set', id]),
    clearPreference: () => calls.push(['clear'])
  }
  const face = lib.languageFace(locale)
  face.setLocale('vi')
  face.clearPreference()
  assert.deepEqual(calls, [['set', 'vi'], ['clear']])
  assert.deepEqual(writes, [
    'tracy_lang=vi; path=/; max-age=31536000; samesite=lax',
    'tracy_lang=; path=/; max-age=0; samesite=lax'
  ])
  assert.equal(face.getSnapshot().active, 'en')
})

test('LANGUAGE_ROW_CSS styles the row, the button and the menu without Settings around them', () => {
  const css = lib.LANGUAGE_ROW_CSS
  for (const rule of [
    '.ts-row {',
    '.ts-row-title {',
    '.ts-select {',
    '.ts-select-chevron {',
    '.ts-lang-menu {'
  ]) {
    assert.ok(css.includes(rule), `has ${rule}`)
  }
  assert.ok(!css.includes('.ts-overlay'), 'no rule needs the Settings dialog')
  assert.ok(!css.includes('`'), 'no backtick in the CSS string')
})
