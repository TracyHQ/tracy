// The Design system tab's library door and try-on helpers (Akemi's decisions 12/10/2026: U3 A try on
// then Keep or Undo, U4 A / U5 A the card's own picture and name, U10 A the font line).
//
//   node --test packages/design/tracy-design-inspiration/test/design-system-library.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { applyStateOf } from '../src/client/design-system-door.mjs'
import {
  fetchLibrary,
  fontPartsOf,
  libraryRowsOf,
  liveSiteUrlOf,
  switchStepsOf,
  systemOf,
  undoTargetOf
} from '../src/client/design-system-library.mjs'
import { en } from '../src/client/strings.ts'

const row = (over = {}) => ({
  id: 'refero:a1rb',
  kind: 'refero',
  name: 'Airbnb',
  description: 'Warm, rounded, photo first.',
  group: 'Travel',
  image: '/shots/airbnb.jpg',
  fonts: [{ use: 'Inter', for: 'Airbnb Cereal' }],
  ok: true,
  ...over
})

const answer = (status, body) => async (url, init) => {
  answer.last = { url, init }
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

test('the library door is asked root-absolute with the cookie; only Refero rows are kept', async () => {
  const f = answer(200, {
    systems: [
      row(),
      row({ id: 'refero:1f2e', image: null }),
      // OpenDesign is no longer offered (Akemi, 12/10/2026): an older server's row is dropped.
      row({ id: 'od:stripe', kind: 'od', name: 'Stripe' }),
      { id: 'x' }
    ]
  })
  const r = await fetchLibrary(f)
  assert.equal(answer.last.url, '/api/design-system/library')
  assert.equal(answer.last.init.credentials, 'same-origin')
  assert.equal(r.ok, true)
  assert.deepEqual(
    r.systems.map((s) => [s.id, s.kind, s.image]),
    [
      ['refero:a1rb', 'refero', '/shots/airbnb.jpg'],
      ['refero:1f2e', 'refero', null]
    ]
  )
})

test('a server without the door answers 404: the tab can tell and says so', async () => {
  const r = await fetchLibrary(answer(404, null))
  assert.deepEqual(r, { ok: false, code: 'HTTP_404', status: 404 })
  const down = await fetchLibrary(async () => {
    throw new Error('offline')
  })
  assert.equal(down.ok, false)
  assert.equal(down.code, 'NETWORK')
})

test('only ok rows are listed, minus the refused, searched over name, description and group', () => {
  const systems = [
    systemOf(row()),
    systemOf(row({ id: 'refero:57r1', name: 'Stripe', description: 'Crisp fintech', group: 'Finance' })),
    systemOf(row({ id: 'refero:bad', name: 'Bad', ok: false })),
    systemOf(row({ id: 'refero:9a', name: 'Linear', group: 'Software' }))
  ]
  assert.deepEqual(
    libraryRowsOf(systems, [], '').map((s) => s.id),
    ['refero:a1rb', 'refero:57r1', 'refero:9a']
  )
  assert.deepEqual(
    libraryRowsOf(systems, ['refero:57r1'], '').map((s) => s.id),
    ['refero:a1rb', 'refero:9a']
  )
  assert.deepEqual(
    libraryRowsOf(systems, [], 'fintech').map((s) => s.id),
    ['refero:57r1']
  )
  assert.deepEqual(
    libraryRowsOf(systems, [], 'software').map((s) => s.id),
    ['refero:9a']
  )
})

test('the font line names the stand-in and the original, several joined, a font used as is named alone', () => {
  const say = (parts) => parts.map((p) => en[p.key].replace(/\{(\w+)\}/g, (_, k) => p.params[k])).join(', ')
  assert.equal(
    say(fontPartsOf([{ use: 'Inter', for: 'Airbnb Cereal' }])),
    'Inter stands in for Airbnb Cereal'
  )
  assert.equal(
    say(
      fontPartsOf([
        { use: 'Inter', for: 'Söhne' },
        { use: 'Fraunces', for: 'Tiempos' },
        { use: 'Inter', for: 'Söhne' }
      ])
    ),
    'Inter stands in for Söhne, Fraunces stands in for Tiempos'
  )
  assert.equal(say(fontPartsOf([{ use: 'Lora', for: null }])), 'Lora')
  assert.deepEqual(fontPartsOf([]), [])
  assert.deepEqual(fontPartsOf(undefined), [])
})

test('try on: first press applies; another card undoes the try first; the tried card again does nothing', () => {
  assert.deepEqual(switchStepsOf(null, 'od:airbnb'), ['apply'])
  const trial = { before: null, current: { id: 'od:airbnb', name: 'Airbnb' }, applyId: 'a1b2c3d4e5f6' }
  assert.deepEqual(switchStepsOf(trial, 'od:stripe'), ['undo', 'apply'])
  assert.deepEqual(switchStepsOf(trial, 'od:airbnb'), [])
  assert.deepEqual(switchStepsOf({ ...trial, applyId: null }, 'od:stripe'), ['apply'])
})

test("the bar's way back names the look from before the first try, or the template's own", () => {
  const current = { id: 'od:stripe', name: 'Stripe' }
  assert.deepEqual(undoTargetOf({ before: { id: 'od:airbnb', name: 'Airbnb' }, current, applyId: 'x' }), {
    key: 'ds.try.back',
    params: { name: 'Airbnb' }
  })
  assert.equal(undoTargetOf({ before: null, current, applyId: 'x' }).key, 'ds.try.back.none')
})

test("the live frame opens the site's served address, fresh after each change, and nothing guessed", () => {
  assert.equal(liveSiteUrlOf('https://bloom.tracy.site/', 0), 'https://bloom.tracy.site/')
  assert.equal(liveSiteUrlOf('https://bloom.tracy.site/', 2), 'https://bloom.tracy.site/?tracy_ds=2')
  assert.equal(liveSiteUrlOf(null, 1), null)
  assert.equal(liveSiteUrlOf('', 1), null)
  assert.equal(liveSiteUrlOf('javascript:alert(1)', 1), null)
})

test('a library id that the site wears already turns Try on off', () => {
  const read = {
    canApply: true,
    supported: true,
    worn: { id: 'airbnb', slotId: 'od:airbnb', name: 'Airbnb' }
  }
  assert.equal(applyStateOf({ read, picked: 'od:airbnb', busy: false }).reasonKey, 'ds.alreadyWorn')
  assert.equal(applyStateOf({ read, picked: 'airbnb', busy: false }).reasonKey, 'ds.alreadyWorn')
  assert.equal(applyStateOf({ read, picked: 'refero:9a', busy: false }).enabled, true)
})

test('every new key the tab says has English words', () => {
  for (const key of [
    'ds.tryOn',
    'ds.tryingOn',
    'ds.try.title',
    'ds.try.back',
    'ds.try.back.none',
    'ds.keep',
    'ds.kept',
    'ds.live.title',
    'ds.try.trying',
    'ds.try.loading',
    'ds.try.noAddress',
    'ds.fonts',
    'ds.font.swap',
    'ds.font.same'
  ])
    assert.equal(typeof en[key], 'string', key)
})

test('the popups say "your site", never the site’s name (Akemi, 12/10/2026)', () => {
  assert.equal(en['ds.preview.on'], 'On your site')
  assert.equal(en['ds.tryOn'], 'Try on your site')
  for (const [key, words] of Object.entries(en))
    if (key.startsWith('ds.')) assert.ok(!words.includes('{site}'), `${key}: ${words}`)
})
