/**
 * The line under the Language row on "Appearance & language" (`src/client/language-note.ts`): only
 * while the language follows the device, and only when the device's language is not one Tracy
 * offers (named in its own language) or could not be read. The mock's `DET` cases: vi-VN and de-AT
 * are offered (no line), ja-JP is not, a failed read, and a saved pick (no line).
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
  outDir = mkdtempSync(path.join(tmpdir(), 'tracy-onboard-lang-'))
  const outfile = path.join(outDir, 'note.cjs')
  await require('esbuild').build({
    entryPoints: [path.join(here, '..', 'src', 'client', 'language-note.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true })
})

const LOCALES = [
  ['en', 'English'],
  ['vi', 'Tiếng Việt'],
  ['de', 'Deutsch'],
  ['it', 'Italiano'],
  ['fr', 'Français'],
  ['nl', 'Nederlands'],
  ['zh-CN', '简体中文'],
  ['es', 'Español']
].map(([id, label]) => ({ id, label }))
const following = (active) => ({ active, locales: LOCALES })

test('the device language is offered (vi-VN, de-AT, zh-Hans-CN): no line', () => {
  assert.equal(lib.languageNote(following('vi'), ['vi-VN', 'en-US']), null)
  assert.equal(lib.languageNote(following('de'), ['de-AT']), null)
  assert.equal(lib.languageNote(following('zh-CN'), ['zh-Hans-CN']), null)
})

test('not offered (ja-JP): the line names it in its own language, and the language used instead', () => {
  assert.deepEqual(lib.languageNote(following('en'), ['ja-JP']), {
    kind: 'unsupported',
    system: '日本語',
    fallback: 'English'
  })
})

test('Traditional Chinese is not taken as the Simplified pack, as dsh decides', () => {
  assert.equal(lib.languageNote(following('en'), ['zh-TW']).kind, 'unsupported')
})

test('a later device language that is offered still counts (ja, then fr → French is used)', () => {
  assert.equal(lib.languageNote(following('fr'), ['ja-JP', 'fr-FR']), null)
})

test('unreadable (no answer, or an empty list): the failed line', () => {
  assert.deepEqual(lib.languageNote(following('en'), null), { kind: 'failed', fallback: 'English' })
  assert.deepEqual(lib.languageNote(following('en'), []), { kind: 'failed', fallback: 'English' })
})

test('a saved pick: no line, whatever the device says', () => {
  assert.equal(lib.languageNote({ ...following('fr'), preference: 'fr' }, ['ja-JP']), null)
  assert.equal(lib.languageNote({ ...following('fr'), preference: 'fr' }, null), null)
})

test('deviceLanguages: the app bridge first, else the browser list; a failing bridge is unreadable', async () => {
  const bridge = { __DSH_LOCALE__: { read: async () => ({ languages: ['de-AT'], preference: null }) } }
  assert.deepEqual(await lib.deviceLanguages(bridge), ['de-AT'])
  assert.equal(
    await lib.deviceLanguages({
      __DSH_LOCALE__: {
        read: async () => {
          throw new Error('ipc')
        }
      }
    }),
    null
  )
  assert.deepEqual(await lib.deviceLanguages({ navigator: { languages: ['ja-JP'], language: 'ja-JP' } }), [
    'ja-JP',
    'ja-JP'
  ])
  assert.equal(await lib.deviceLanguages({}), null)
})
