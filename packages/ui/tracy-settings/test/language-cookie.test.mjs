/**
 * `language-cookie.ts` (#753): an explicit pick in Settings › Language writes `tracy_lang` in the
 * id tracy-web reads (`zh`, not dsh's `zh-CN`); an id outside the interface languages writes
 * nothing. Bundled with esbuild the same way `settings-modal-render.test.mjs` bundles the page.
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
  outDir = mkdtempSync(path.join(tmpdir(), 'ts-lang-cookie-'))
  const outfile = path.join(outDir, 'cookie.cjs')
  await require('esbuild').build({
    entryPoints: [path.join(here, '..', 'src', 'client', 'language-cookie.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})

after(() => {
  rmSync(outDir, { recursive: true, force: true })
  delete globalThis.document
})

test('dsh ids map to the ids tracy-web reads; unknown ids map to nothing', () => {
  assert.equal(lib.languageCookieValue('zh-CN'), 'zh')
  assert.equal(lib.languageCookieValue('de'), 'de')
  assert.equal(lib.languageCookieValue('VI'), 'vi')
  assert.equal(lib.languageCookieValue('ja'), null)
  assert.equal(lib.languageCookieValue(''), null)
})

test('a pick writes the cookie with the attributes tracy-web expects; an unknown id writes nothing', () => {
  const writes = []
  globalThis.document = {
    set cookie(value) {
      writes.push(value)
    }
  }
  lib.rememberLanguagePick('zh-CN')
  lib.rememberLanguagePick('klingon')
  // "Follow device" (#756) deletes it with the same path, so the sign-in page follows the device again.
  lib.clearLanguageCookie()
  assert.deepEqual(writes, [
    'tracy_lang=zh; path=/; max-age=31536000; samesite=lax',
    'tracy_lang=; path=/; max-age=0; samesite=lax'
  ])
})

test('while following the device a cookie left by an older pick is stale; an explicit choice never is', () => {
  assert.equal(lib.hasStaleLanguageCookie(undefined, 'a=1; tracy_lang=vi; b=2'), true)
  assert.equal(lib.hasStaleLanguageCookie(undefined, 'tracy_lang=de'), true)
  assert.equal(lib.hasStaleLanguageCookie(undefined, 'a=1; not_tracy_lang=vi'), false)
  assert.equal(lib.hasStaleLanguageCookie(undefined, ''), false)
  assert.equal(lib.hasStaleLanguageCookie('vi', 'tracy_lang=vi'), false)
})

test('the heal deletes a stale cookie once and never writes a value', () => {
  const writes = []
  let jar = 'tracy_lang=vi'
  globalThis.document = {
    get cookie() {
      return jar
    },
    set cookie(value) {
      writes.push(value)
      if (value.startsWith('tracy_lang=;')) jar = ''
    }
  }
  lib.clearStaleLanguageCookie(undefined)
  lib.clearStaleLanguageCookie(undefined)
  // An explicit choice keeps its cookie.
  jar = 'tracy_lang=de'
  lib.clearStaleLanguageCookie('de')
  assert.deepEqual(writes, ['tracy_lang=; path=/; max-age=0; samesite=lax'])
})
