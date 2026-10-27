/**
 * The Find box's place suggestions: ≥ 3 typed characters, 300 ms after the last keystroke, one
 * session token per typing session, only the latest answer shown, and a missing Google key stops
 * suggesting for good. A picked city is searched by name; anything smaller at its point, labelled.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createApi } from '../src/client/api.ts'
import { searchBody } from '../src/client/find-input.ts'
import { locationNoteShown } from '../src/client/location.ts'
import {
  SUGGEST_DEBOUNCE_MS,
  createSuggester,
  isTypedChange,
  pickedArea,
  suggestQuery
} from '../src/client/place-suggest.ts'

const DN = {
  placeId: 'ChIJdn',
  text: 'Da Nang, Vietnam',
  mainText: 'Da Nang',
  secondaryText: 'Vietnam',
  types: ['locality', 'political']
}
const HC = {
  placeId: 'ChIJhc',
  text: 'Hai Chau, Da Nang, Vietnam',
  mainText: 'Hai Chau',
  secondaryText: 'Da Nang, Vietnam',
  types: ['sublocality_level_1', 'sublocality', 'political']
}

/** Hand-cranked timers: `tick()` fires what is due. */
function clock() {
  let now = 0
  let next = 1
  const due = new Map()
  return {
    setTimeout: (fn, ms) => {
      const id = next++
      due.set(id, { at: now + ms, fn })
      return id
    },
    clearTimeout: (id) => due.delete(id),
    tick(ms) {
      now += ms
      for (const [id, t] of Array.from(due))
        if (t.at <= now) {
          due.delete(id)
          t.fn()
        }
    }
  }
}

const flush = () => new Promise((r) => setImmediate(r))

function world(answer = () => ({ ok: true, status: 200, body: { suggestions: [DN] } })) {
  const timers = clock()
  const asked = []
  const shown = []
  let tokens = 0
  const s = createSuggester({
    ask: async (q, session) => {
      asked.push({ q, session })
      return answer(q, session)
    },
    onSuggestions: (list) => shown.push(list),
    newToken: () => `token-${++tokens}`,
    timers
  })
  return { s, timers, asked, shown }
}

test('suggestQuery: a place of 3+ characters; links and short text never ask', () => {
  assert.equal(suggestQuery('  da nang '), 'da nang')
  assert.equal(suggestQuery('da'), null)
  assert.equal(suggestQuery(' da '), null)
  assert.equal(suggestQuery('phohoa.vn'), null)
  assert.equal(suggestQuery('https://facebook.com/pho'), null)
  assert.equal(suggestQuery('Huế'), 'Huế')
})

test('isTypedChange: typing and pasting only, never the combobox resetting the box', () => {
  assert.equal(isTypedChange('input-change'), true)
  assert.equal(isTypedChange('input-paste'), true)
  for (const r of ['input-clear', 'none', 'item-press', 'escape-key', undefined])
    assert.equal(isTypedChange(r), false)
})

test('debounced: only the text 300 ms after the last keystroke is asked, with one session token', async () => {
  const { s, timers, asked, shown } = world()
  s.type('da ')
  timers.tick(100)
  s.type('da n')
  timers.tick(SUGGEST_DEBOUNCE_MS - 1)
  assert.equal(asked.length, 0)
  timers.tick(1)
  await flush()
  assert.deepEqual(asked, [{ q: 'da n', session: 'token-1' }])
  assert.deepEqual(shown.at(-1), [DN])
  s.type('da nang')
  timers.tick(SUGGEST_DEBOUNCE_MS)
  await flush()
  assert.equal(asked.at(-1).session, 'token-1', 'the same typing session')
  assert.equal(s.session(), 'token-1')
})

test('short text clears the list at once and asks nothing', async () => {
  const { s, timers, asked, shown } = world()
  s.type('da')
  timers.tick(SUGGEST_DEBOUNCE_MS)
  await flush()
  assert.equal(asked.length, 0)
  assert.deepEqual(shown, [[]])
})

test('a slow answer for old text never replaces a newer one', async () => {
  const pending = []
  const { s, timers, shown } = world(() => new Promise((resolve) => pending.push(resolve)))
  s.type('hoi')
  timers.tick(SUGGEST_DEBOUNCE_MS)
  s.type('hoi an')
  timers.tick(SUGGEST_DEBOUNCE_MS)
  await flush()
  pending[1]({ ok: true, status: 200, body: { suggestions: [DN] } })
  await flush()
  pending[0]({ ok: true, status: 200, body: { suggestions: [{ ...DN, placeId: 'old' }] } })
  await flush()
  assert.deepEqual(shown.at(-1), [DN])
})

test('reset (a pick or a search) drops what is in flight and starts a new session next time', async () => {
  const pending = []
  const { s, timers, asked, shown } = world(() => new Promise((resolve) => pending.push(resolve)))
  s.type('da nang')
  timers.tick(SUGGEST_DEBOUNCE_MS)
  s.reset()
  pending[0]({ ok: true, status: 200, body: { suggestions: [DN] } })
  await flush()
  assert.deepEqual(shown.at(-1), [])
  s.type('hoi an')
  timers.tick(SUGGEST_DEBOUNCE_MS)
  assert.equal(asked.at(-1).session, 'token-2')
})

test('no Google key (503 CREDENTIAL_MISSING): suggestions stop for good; other failures only empty the list', async () => {
  let code = 'PROVIDER_ERROR'
  const { s, timers, asked, shown } = world(() => ({ ok: false, status: 502, code }))
  s.type('da nang')
  timers.tick(SUGGEST_DEBOUNCE_MS)
  await flush()
  assert.deepEqual(shown.at(-1), [])
  code = 'CREDENTIAL_MISSING'
  s.type('hoi an')
  timers.tick(SUGGEST_DEBOUNCE_MS)
  await flush()
  s.type('hue city')
  timers.tick(SUGGEST_DEBOUNCE_MS)
  await flush()
  assert.equal(asked.length, 2)
})

test('malformed suggestions are dropped', async () => {
  const { s, timers, shown } = world(() => ({
    ok: true,
    status: 200,
    body: {
      suggestions: [
        DN,
        { placeId: 'x' },
        null,
        { text: 'no id' },
        { placeId: 'ChIJ2', text: 'Hue', mainText: 'Hue' }
      ]
    }
  }))
  s.type('hue')
  timers.tick(SUGGEST_DEBOUNCE_MS)
  await flush()
  assert.deepEqual(shown.at(-1), [
    DN,
    { placeId: 'ChIJ2', text: 'Hue', mainText: 'Hue', secondaryText: null, types: [] }
  ])
})

test('pickedArea: a district or street is searched at its resolved point, with its label; a failed resolve searches its text', async () => {
  const resolved = await pickedArea(
    async () => ({ ok: true, status: 200, body: { label: 'Hai Chau, Da Nang', lat: 16.06, lon: 108.22 } }),
    HC
  )
  assert.deepEqual(resolved, { kind: 'point', lat: 16.06, lon: 108.22, label: 'Hai Chau, Da Nang' })
  assert.deepEqual(await pickedArea(async () => ({ ok: false, status: 502, code: 'PROVIDER_ERROR' }), HC), {
    kind: 'place',
    query: 'Hai Chau, Da Nang, Vietnam'
  })
  assert.deepEqual(await pickedArea(async () => ({ ok: true, status: 200, body: { lat: 'x' } }), HC), {
    kind: 'place',
    query: 'Hai Chau, Da Nang, Vietnam'
  })
  // No types (an older server): the point, as before.
  const { types: _, ...untyped } = DN
  assert.equal(
    (await pickedArea(async () => ({ ok: true, status: 200, body: { lat: 1, lon: 2 } }), untyped)).kind,
    'point'
  )
})

test("pickedArea: a city, province or postal town is searched by name, never at Google's geometric centre", async () => {
  // Google puts Da Nang at 16.054, 108.072 (Ba Na hills, 16 km out); /search's geocoder puts it in town.
  for (const types of [
    ['locality', 'political'],
    ['administrative_area_level_1', 'political'],
    ['administrative_area_level_2'],
    ['postal_town']
  ]) {
    let resolves = 0
    const area = await pickedArea(
      async () => {
        resolves += 1
        return { ok: true, status: 200, body: { lat: 16.054, lon: 108.072 } }
      },
      { ...DN, types }
    )
    assert.deepEqual(area, { kind: 'place', query: 'Da Nang, Vietnam' }, types.join())
    assert.equal(resolves, 0, 'no Place Details call for a named area')
  }
})

test('searchBody: a labelled point sends lat/lon and the label as query', () => {
  assert.deepEqual(searchBody({ kind: 'point', lat: 16.05, lon: 108.2, label: 'Da Nang, Vietnam' }, 3000), {
    query: 'Da Nang, Vietnam',
    lat: 16.05,
    lon: 108.2,
    radiusM: 3000,
    depth: 'quick'
  })
})

test('api: suggest and resolve doors carry the session and language', async () => {
  const calls = []
  const api = createApi(async (url) => {
    calls.push(url)
    return { ok: true, status: 200, json: async () => ({ suggestions: [] }) }
  })
  await api.suggestPlaces('da nang', 'tok-1', 'vi')
  await api.resolvePlace('ChIJ dn', 'tok-1', 'en-US')
  assert.deepEqual(calls, [
    '/api/website-opportunities/places/suggest?q=da%20nang&session=tok-1&lang=vi',
    '/api/website-opportunities/places/suggest/ChIJ%20dn?session=tok-1&lang=en-US'
  ])
})

test('the location hint: the approximate one only while the box still holds that place (typing resets the rest to idle)', () => {
  const approx = { state: 'approx', lat: 25, lon: 55, label: 'Dubai, United Arab Emirates' }
  assert.equal(locationNoteShown(approx, 'Dubai, United Arab Emirates'), true)
  assert.equal(locationNoteShown(approx, 'da nang'), false, 'typing another place hides it')
  assert.equal(locationNoteShown(approx, ''), false)
  assert.equal(locationNoteShown({ state: 'denied' }, ''), true)
  assert.equal(locationNoteShown({ state: 'found', lat: 1, lon: 2 }, 'Hoi An'), true)
  assert.equal(locationNoteShown({ state: 'asking' }, 'x'), true)
  assert.equal(locationNoteShown({ state: 'idle' }, ''), false)
})

test('a restaurant suggestion searches its exact ID; a street address stays a direct text query, neither resolves a nearby centre', async () => {
  const resolve = async () => assert.fail('a business or address must not be turned into nearby search')
  assert.deepEqual(
    await pickedArea(resolve, {
      ...DN,
      placeId: 'ChIJgreen',
      text: 'Green Mesa, Al Fahidi',
      types: ['restaurant', 'establishment', 'point_of_interest']
    }),
    { kind: 'text', query: 'Green Mesa, Al Fahidi', placeId: 'ChIJgreen' }
  )
  assert.deepEqual(
    await pickedArea(resolve, { ...DN, text: '12 Al Fahidi Street', types: ['street_address'] }),
    { kind: 'text', query: '12 Al Fahidi Street' }
  )
})
