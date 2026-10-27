/**
 * Find places opens on results without asking again (`src/client/find-memory.ts`): the first visit
 * locates the person and searches there; later visits show the last search (a day) or search the
 * remembered place (a week); nothing is asked when the device remembers neither.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  LAST_SEARCH_KEY,
  PLACE_KEY,
  openingStep,
  readLastSearch,
  readPlace,
  writeLastSearch,
  writePlace
} from '../src/client/find-memory.ts'

const memory = (initial = {}) => {
  const data = { ...initial }
  return { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = String(v)), data }
}
const HOUR = 3_600_000
const DAY = 24 * HOUR
const place = { lat: 21.03, lon: 105.85, label: 'Hanoi, Hanoi, VN' }

test('a place is remembered for 90 days, then forgotten', () => {
  const store = memory()
  writePlace(store, place, 0)
  assert.deepEqual(readPlace(store, 89 * DAY), place)
  assert.equal(readPlace(store, 91 * DAY), null)
})

test('the last search is remembered for a day', () => {
  const store = memory()
  const entry = { place, radius: 3000, answer: { candidates: [{ providerId: 'p1', name: 'Pho' }] } }
  writeLastSearch(store, entry, 0)
  assert.deepEqual(readLastSearch(store, 23 * HOUR), entry)
  assert.equal(readLastSearch(store, 25 * HOUR), null)
})

test('broken, foreign or blocked storage reads as nothing remembered', () => {
  assert.equal(readPlace(memory({ [PLACE_KEY]: 'not json' }), 0), null)
  assert.equal(readPlace(memory({ [PLACE_KEY]: '{"at":0,"place":{"lat":"x"}}' }), 0), null)
  assert.equal(readLastSearch(memory({ [LAST_SEARCH_KEY]: '{"at":0}' }), 0), null)
  const broken = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    }
  }
  assert.equal(readPlace(broken, 0), null)
  writePlace(broken, place, 0)
  assert.equal(readPlace(null, 0), null)
})

test('openingStep: last results first, then the remembered place, then locate; never over a search already on screen', () => {
  const last = { place, radius: 3000, answer: { candidates: [] } }
  assert.deepEqual(openingStep({ shown: false, last, place }), { kind: 'restore', last })
  assert.deepEqual(openingStep({ shown: false, last: null, place }), { kind: 'search', place })
  assert.deepEqual(openingStep({ shown: false, last: null, place: null }), { kind: 'locate' })
  assert.deepEqual(openingStep({ shown: true, last, place }), { kind: 'none' })
})

/** A store that refuses any value longer than `limit` characters, as a nearly full origin does. */
const tight = (limit) => {
  const store = memory()
  return {
    ...store,
    setItem: (k, v) => {
      if (String(v).length > limit) throw new DOMException('quota', 'QuotaExceededError')
      store.setItem(k, v)
    }
  }
}

const bigAnswer = () => ({
  center: { lat: 25.07, lon: 55.3, label: 'Dubai' },
  provider: 'google-places',
  candidates: Array.from({ length: 60 }, (_, i) => ({
    provider: 'google-places',
    providerId: `p${i}`,
    name: `Place ${i}`,
    website: `https://p${i}.example`,
    photo: { name: `places/p${i}/photos/${'x'.repeat(300)}`, credit: 'Someone' },
    siteCheck: { status: 'done', performance: 40, emails: ['a@b.c'], socials: {} },
    social: { facebook: { status: 'done', followers: 100, url: `https://facebook.com/p${i}` } },
    score: {
      score: 50,
      grade: 'B',
      pending: false,
      reasons: [
        ['web.slow', 25, { performance: 40 }],
        ['demand.reviews', 10]
      ]
    }
  }))
})

test('the last search is kept whole when it fits; a store that refuses it gets the lighter form, which still restores', async () => {
  const { writeLastSearch: write, readLastSearch: read } = await import('../src/client/find-memory.ts')
  const entry = { place, radius: 3000, answer: bigAnswer() }
  const roomy = memory()
  assert.equal(write(roomy, entry, 0), 'whole')
  assert.equal(read(roomy, HOUR).answer.candidates[0].siteCheck.status, 'done')

  const wholeSize = JSON.stringify({ at: 0, ...entry }).length
  const store = tight(Math.floor(wholeSize * 0.7))
  assert.equal(write(store, entry, 0), 'light')
  const back = read(store, HOUR)
  assert.equal(back.answer.candidates.length, 60)
  assert.equal(back.answer.candidates[0].name, 'Place 0')
  assert.equal(back.answer.candidates[0].photo.name.startsWith('places/p0/'), true)
  // Checks, stats and the score are what the page asks again for after a restore.
  assert.equal(back.answer.candidates[0].siteCheck, undefined)
  assert.equal(back.answer.candidates[0].score, undefined)
})

test('a store that refuses even the lighter form reports it and remembers no search', async () => {
  const { writeLastSearch: write, readLastSearch: read } = await import('../src/client/find-memory.ts')
  const store = tight(100)
  assert.equal(write(store, { place, radius: 3000, answer: bigAnswer() }, 0), 'none')
  assert.equal(read(store, HOUR), null)
})

test('named search intent and exact ID survive cached results and their later repeat, without retaining an autocomplete session', () => {
  const store = memory()
  const selected = {
    ...place,
    label: 'Green Mesa, Al Fahidi',
    search: { kind: 'text', query: 'Green Mesa, Al Fahidi', placeId: 'ChIJgreen' }
  }
  writePlace(store, selected, 0)
  writeLastSearch(store, { place: selected, radius: 3000, answer: { candidates: [] } }, 0)
  assert.deepEqual(
    openingStep({ shown: false, last: readLastSearch(store, HOUR), place: readPlace(store, HOUR) }).last.place
      .search,
    selected.search
  )
  const repeat = openingStep({
    shown: false,
    last: readLastSearch(store, 25 * HOUR),
    place: readPlace(store, 25 * HOUR)
  })
  assert.deepEqual(repeat.place.search, selected.search)
})
