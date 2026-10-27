// What the preload answers dsh's `__DSH_LOCALE__.read()` with (src/locale-bootstrap.js): the OS
// languages, and the language the person PICKED in Settings › Language — never null while a pick
// stands, because dsh with a native bootstrap stops reading its own stored pick (see the module).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import mod from '../src/locale-bootstrap.js'

const { localeBootstrap } = mod

test('no pick: the OS languages, preference null (dsh follows the device)', () => {
  assert.deepEqual(localeBootstrap({ languages: ['de-AT', 'en-US'], cookie: '' }), {
    languages: ['de-AT', 'en-US'],
    preference: null
  })
})

test('a pick stands: it is handed back as the preference, so the device never overrides it', () => {
  assert.deepEqual(localeBootstrap({ languages: ['de-AT'], cookie: 'a=1; tracy_lang=fr; b=2' }), {
    languages: ['de-AT'],
    preference: 'fr'
  })
  assert.equal(localeBootstrap({ languages: [], cookie: 'tracy_lang=zh' }).preference, 'zh')
})

test('a cookie that names no interface language is no pick', () => {
  for (const cookie of ['tracy_lang=ja', 'tracy_lang=', 'tracy_lang=<b>', 'xtracy_lang=fr', undefined])
    assert.equal(localeBootstrap({ languages: [], cookie }).preference, null, String(cookie))
})

test('languages are strings only, and never more than 32 of them', () => {
  const many = Array.from({ length: 40 }, (_, i) => `x${i}`)
  assert.deepEqual(localeBootstrap({ languages: ['en', 4, null, 'vi'], cookie: '' }).languages, ['en', 'vi'])
  assert.equal(localeBootstrap({ languages: many, cookie: '' }).languages.length, 32)
  assert.deepEqual(localeBootstrap({ languages: undefined, cookie: '' }).languages, [])
})
