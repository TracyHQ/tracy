// The picks a stranger made on the sign-in-free /find page arrive in the address
// (tasks/plan-wo-public-find.md §2.4): read once, removed, then the signed-in search runs and the
// matching rows are preselected. Research is never started for the person.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { flowReducer, initialFlow, selectedCandidates } from '../src/client/flow.ts'
import { buildSignedInFindUrl, handedKey, openPublicPick, takePublicPick } from '../src/client/public-pick.ts'

const at = (search) => ({ pathname: '/new/', search, hash: '#x' })

test('the picks are read once and removed from the address, other parameters kept', () => {
  const urls = []
  const pick = takePublicPick({
    location: at(
      '?tab=tracy:website-opportunities&wo-view=find&wo-at=15.88,108.33&wo-radius=3000&wo-pick=ChIJ-a,ChIJ-b'
    ),
    replaceUrl: (url) => urls.push(url)
  })
  assert.deepEqual(pick, { lat: 15.88, lon: 108.33, radiusM: 3000, placeIds: ['ChIJ-a', 'ChIJ-b'] })
  assert.deepEqual(urls, ['/new/?tab=tracy%3Awebsite-opportunities&wo-view=find#x'])
})

test('an address with no picks is left alone', () => {
  const urls = []
  assert.equal(takePublicPick({ location: at('?wo-view=find'), replaceUrl: (url) => urls.push(url) }), null)
  assert.deepEqual(urls, [])
})

test('a broken link is removed but never searched; ids are checked, deduplicated and capped at 10', () => {
  for (const search of [
    '?wo-at=91,0&wo-radius=3000',
    '?wo-at=abc&wo-radius=3000',
    '?wo-at=1,2&wo-radius=0',
    '?wo-at=1,2&wo-radius=60000',
    '?wo-pick=a'
  ]) {
    const urls = []
    assert.equal(takePublicPick({ location: at(search), replaceUrl: (url) => urls.push(url) }), null, search)
    assert.equal(urls.length, 1, search)
    assert.ok(!urls[0].includes('wo-'), urls[0])
  }
  const ids = Array.from({ length: 12 }, (_, i) => `id${i}`)
  const pick = takePublicPick({
    location: at(`?wo-at=1,2&wo-radius=1000&wo-pick=${['bad<id', 'id0', ...ids].join(',')}`)
  })
  assert.deepEqual(pick.placeIds, ids.slice(0, 10))
})

const row = (providerId) => ({
  key: `google-places:${providerId}`,
  provider: 'google-places',
  providerId,
  name: providerId
})

test('preselect picks the rows whose place id matches and says how many', () => {
  let s = flowReducer(initialFlow(), { type: 'search-done', candidates: [row('a'), row('b'), row('c')] })
  s = flowReducer(s, { type: 'preselect', providerIds: ['c', 'gone', 'a'] })
  assert.deepEqual(
    selectedCandidates(s).map((r) => r.providerId),
    ['c', 'a']
  )
  assert.equal(s.search.preselected, 2)
  // The person can still change the picks, and a new search forgets the hand-over.
  s = flowReducer(s, { type: 'toggle', key: 'google-places:b' })
  assert.equal(selectedCandidates(s).length, 3)
  s = flowReducer(s, { type: 'search-start' })
  assert.equal(s.search.preselected, undefined)
})

const SESSION = '11111111-2222-4333-8444-555555555555'
/** An api with only the two doors a hand-over may use: any other call (research) throws. */
function doors({ labels = {}, found = {} } = {}) {
  const calls = []
  return {
    calls,
    api: {
      resolvePlace: async (placeId, session, lang) => {
        calls.push(['resolve', placeId, session, lang])
        return labels[placeId]
          ? { ok: true, status: 200, body: { label: labels[placeId], lat: 15.9, lon: 108.3 } }
          : { ok: false, status: 404, code: 'PLACE_NOT_FOUND' }
      },
      search: async (body) => {
        calls.push(['search', body])
        const row = found[body.placeId]
        return { ok: true, status: 200, body: { provider: 'google-places', candidates: row ? [row] : [] } }
      }
    }
  }
}

test('opening the picks runs the signed-in search, then preselects — and starts no research', async () => {
  const steps = []
  const { api, calls } = doors()
  await openPublicPick(
    { lat: 15.88, lon: 108.33, radiusM: 5000, placeIds: ['a', 'b'] },
    {
      search: async (area, radiusM) => {
        steps.push(['search', area, radiusM])
        return ['a', 'b', 'c']
      },
      api,
      session: () => SESSION,
      dispatch: (action) => steps.push(['dispatch', action])
    }
  )
  assert.deepEqual(steps, [
    ['search', { kind: 'point', lat: 15.88, lon: 108.33 }, 5000],
    ['dispatch', { type: 'preselect', providerIds: ['a', 'b'] }]
  ])
  assert.deepEqual(calls, [], 'every pick was in the results: no extra door')
  assert.equal(handedKey(1, 'en'), 'find.handed.one')
  assert.equal(handedKey(3, 'en'), 'find.handed.other')
  assert.equal(handedKey(1, 'zh'), 'find.handed.other')
})

test('a pick the signed-in search did not return is fetched by its id, added and selected', async () => {
  const chain = { provider: 'google-places', providerId: 'chain', name: 'KFC Hoi An', chain: true }
  const { api, calls } = doors({ labels: { chain: 'KFC Hoi An, 1 Tran Phu' }, found: { chain } })
  let s = flowReducer(initialFlow(), { type: 'search-done', candidates: [row('a'), row('b')] })
  await openPublicPick(
    { lat: 15.88, lon: 108.33, radiusM: 3000, placeIds: ['a', 'chain', 'b'] },
    {
      search: async () => ['a', 'b'],
      api,
      session: () => SESSION,
      lang: 'vi',
      dispatch: (action) => {
        s = flowReducer(s, action)
      }
    }
  )
  assert.deepEqual(calls[0], ['resolve', 'chain', SESSION, 'vi'])
  assert.equal(calls[1][0], 'search')
  // The name comes from the resolve answer, never from the address.
  assert.equal(calls[1][1].query, 'KFC Hoi An, 1 Tran Phu')
  assert.equal(calls[1][1].intent, 'place')
  assert.equal(calls[1][1].placeId, 'chain')
  assert.equal(calls.length, 2)
  assert.deepEqual(
    selectedCandidates(s).map((r) => r.providerId),
    ['a', 'chain', 'b']
  )
  assert.equal(s.search.preselected, 3)
})

test('a pick Google no longer knows is skipped; the others are still selected', async () => {
  const { api, calls } = doors()
  let s = flowReducer(initialFlow(), { type: 'search-done', candidates: [row('a')] })
  await openPublicPick(
    { lat: 1, lon: 2, radiusM: 1000, placeIds: ['a', 'gone'] },
    {
      search: async () => ['a'],
      api,
      session: () => SESSION,
      dispatch: (action) => (s = flowReducer(s, action))
    }
  )
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['resolve']
  )
  assert.equal(s.search.preselected, 1)
})

test('a failed or superseded signed-in search stops the hand-over', async () => {
  const { api, calls } = doors()
  const actions = []
  await openPublicPick(
    { lat: 1, lon: 2, radiusM: 1000, placeIds: ['a'] },
    { search: async () => null, api, session: () => SESSION, dispatch: (a) => actions.push(a) }
  )
  assert.deepEqual([calls, actions], [[], []])
})

test('the Continue address round-trips through takePublicPick and keeps utm_*', () => {
  const href = buildSignedInFindUrl({
    lat: 16.058953,
    lon: 108.219481,
    radiusM: 5000,
    picks: ['ChIJ-a', 'ChIJ-b'],
    search: '?utm_source=fb&utm_campaign=wo&lang=vi&wo-pick=injected'
  })
  const url = new URL(href, 'https://cowork.tracy.test')
  assert.equal(url.pathname, '/new/')
  assert.equal(url.searchParams.get('tab'), 'tracy:website-opportunities')
  assert.equal(url.searchParams.get('wo-view'), 'find')
  assert.equal(url.searchParams.get('utm_source'), 'fb')
  assert.equal(url.searchParams.get('utm_campaign'), 'wo')
  assert.equal(url.searchParams.get('lang'), null, 'only utm_* rides along')
  const back = takePublicPick({ location: { pathname: url.pathname, search: url.search } })
  assert.deepEqual(back, { lat: 16.05895, lon: 108.21948, radiusM: 5000, placeIds: ['ChIJ-a', 'ChIJ-b'] })
})

test('the builder refuses what the reader would drop instead of cutting it silently', () => {
  const ids = Array.from({ length: 11 }, (_, i) => `id${i}`)
  assert.throws(() => buildSignedInFindUrl({ lat: 1, lon: 2, radiusM: 1000, picks: ids }), /10/)
  assert.throws(() => buildSignedInFindUrl({ lat: 1, lon: 2, radiusM: 1000, picks: ['bad<id'] }), /place id/)
  assert.throws(() => buildSignedInFindUrl({ lat: 91, lon: 2, radiusM: 1000, picks: ['a'] }), /point/)
})

test('a capped toggle adds nothing past the cap, but still takes a pick away', () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(`p${i}`))
  let s = flowReducer(initialFlow(), { type: 'search-done', candidates: rows })
  for (const r of rows) s = flowReducer(s, { type: 'toggle', key: r.key, max: 10 })
  assert.equal(s.selected.length, 10)
  s = flowReducer(s, { type: 'toggle', key: rows[0].key, max: 10 })
  assert.equal(s.selected.length, 9)
})

test('Build demo hands over one place id: wo-build round-trips and is always one of the picks', () => {
  const href = buildSignedInFindUrl({ lat: 1, lon: 2, radiusM: 1000, picks: ['ChIJ-a'], build: 'ChIJ-b' })
  const url = new URL(href, 'https://cowork.tracy.test')
  assert.equal(url.searchParams.get('wo-build'), 'ChIJ-b')
  const urls = []
  const back = takePublicPick({
    location: { pathname: url.pathname, search: url.search },
    replaceUrl: (u) => urls.push(u)
  })
  assert.deepEqual(back, { lat: 1, lon: 2, radiusM: 1000, placeIds: ['ChIJ-a', 'ChIJ-b'], build: 'ChIJ-b' })
  assert.ok(!urls[0].includes('wo-build'), 'read once: a reload starts nothing')
  assert.throws(
    () => buildSignedInFindUrl({ lat: 1, lon: 2, radiusM: 1000, picks: ['a'], build: 'bad<id' }),
    /place id/
  )
  // A forged build that is not a place id is dropped, never acted on.
  const forged = takePublicPick({
    location: at('?wo-at=1,2&wo-radius=1000&wo-pick=a&wo-build=javascript:alert(1)')
  })
  assert.deepEqual(forged, { lat: 1, lon: 2, radiusM: 1000, placeIds: ['a'] })
})

test('opening a Build demo hand-over asks to build that place once, after the picks are selected', async () => {
  const steps = []
  const { api } = doors()
  await openPublicPick(
    { lat: 1, lon: 2, radiusM: 1000, placeIds: ['a'], build: 'a' },
    {
      search: async () => ['a'],
      api,
      session: () => SESSION,
      dispatch: (action) => steps.push(['dispatch', action.type]),
      onBuild: (placeId) => steps.push(['build', placeId])
    }
  )
  assert.deepEqual(steps, [
    ['dispatch', 'preselect'],
    ['build', 'a']
  ])
})
