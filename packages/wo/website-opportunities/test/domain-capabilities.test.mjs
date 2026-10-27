import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CAPABILITY_GROUPS,
  CAPABILITY_GROUP_IDS,
  FALLBACK_REASONS,
  PROVIDER_CREDENTIALS,
  defaultOrderOf,
  capabilityGroup,
  parseProviderOrder,
  resolveOrder,
  runInOrder
} from '../domain/capabilities.mjs'
import * as domain from '../domain/index.mjs'

test('the catalogue names the twelve capability groups of the shared contract, each with known providers', () => {
  // test-quality: contract the twelve group ids are the shared contract; a rename must fail here
  assert.deepEqual(CAPABILITY_GROUP_IDS, [
    'facebook',
    'instagram',
    'tiktok',
    'youtube',
    'website-content',
    'web-search',
    'tripadvisor',
    'google-reviews',
    'menu-links',
    'menu-photos',
    'menu-items',
    'map-discovery'
  ])
  for (const group of CAPABILITY_GROUPS) {
    assert.ok(group.label, group.id)
    assert.ok(group.providers.length > 0, group.id)
    const ids = group.providers.map((p) => p.id)
    assert.equal(new Set(ids).size, ids.length, `${group.id} has duplicate providers`)
    for (const p of group.providers) {
      assert.ok(p.label, `${group.id}/${p.id} label`)
      assert.ok(
        p.credential === null || PROVIDER_CREDENTIALS.includes(p.credential),
        `${group.id}/${p.id} credential`
      )
    }
  }
  assert.ok(Object.isFrozen(CAPABILITY_GROUPS))
  assert.ok('CAPABILITY_GROUPS' in domain && 'runInOrder' in domain)
})

test('RapidAPI adapters are told apart by listing', () => {
  const ids = (g) => CAPABILITY_GROUPS.find((x) => x.id === g).providers.map((p) => p.id)
  assert.deepEqual(ids('facebook'), ['scrapecreators', 'rapidapi-scraper3', 'apify'])
  assert.deepEqual(ids('instagram'), ['scrapecreators', 'rapidapi-looter2', 'rapidapi-stable', 'apify'])
  assert.deepEqual(ids('tiktok'), ['scrapecreators', 'rapidapi-api23', 'apify'])
})

test('the social groups default to the social stats chain: ScrapeCreators first, Apify last', () => {
  assert.deepEqual(defaultOrderOf('facebook'), ['scrapecreators', 'rapidapi-scraper3', 'apify'])
  assert.deepEqual(defaultOrderOf('instagram'), [
    'scrapecreators',
    'rapidapi-looter2',
    'rapidapi-stable',
    'apify'
  ])
  assert.deepEqual(defaultOrderOf('youtube'), [
    'youtube-official',
    'rapidapi-yt-api',
    'apify',
    'youtube-public'
  ])
})

test('map discovery follows the legacy mapDiscoveryProvider while undeclared', () => {
  assert.deepEqual(defaultOrderOf('map-discovery', { mapDiscoveryProvider: 'auto' }), [
    'google',
    'apify',
    'osm'
  ])
  assert.deepEqual(defaultOrderOf('map-discovery', { mapDiscoveryProvider: 'google' }), ['google', 'osm'])
  assert.deepEqual(defaultOrderOf('map-discovery', { mapDiscoveryProvider: 'apify' }), ['apify', 'osm'])
  assert.deepEqual(defaultOrderOf('map-discovery', { mapDiscoveryProvider: 'osm' }), ['osm'])
  assert.deepEqual(defaultOrderOf('map-discovery', {}), ['google', 'apify', 'osm'])
})

test('web search defaults to what research runs today: ScrapeCreators Google search; the old off switch still closes it', () => {
  assert.deepEqual(defaultOrderOf('web-search', {}), ['scrapecreators-google'])
  assert.deepEqual(defaultOrderOf('web-search', { webSearchProvider: 'auto' }), ['scrapecreators-google'])
  assert.deepEqual(defaultOrderOf('web-search', { webSearchProvider: 'off' }), [])
  // DeepSeek has no web search API: it is not a provider of this group.
  assert.deepEqual(
    capabilityGroup('web-search').providers.map((x) => x.id),
    ['scrapecreators-google', 'jina', 'firecrawl', 'serpapi-google-search']
  )
})

test('menu dishes list only what research can run: the menu text reader (no vision model yet)', () => {
  assert.deepEqual(
    capabilityGroup('menu-items').providers.map((x) => x.id),
    ['document-text', 'photo-vision']
  )
  // Photos are opt-in: an undeclared group still runs the text reader only.
  assert.deepEqual(defaultOrderOf('menu-items'), ['document-text'])
  assert.deepEqual(defaultOrderOf('menu-links', {}), ['website'])
  assert.deepEqual(defaultOrderOf('menu-photos', {}), ['serpapi-google-maps'])
})

test('resolveOrder: undeclared = default, [] = off, a list = exactly that list', () => {
  assert.deepEqual(resolveOrder({}, 'facebook'), {
    order: ['scrapecreators', 'rapidapi-scraper3', 'apify'],
    declared: false
  })
  assert.deepEqual(resolveOrder({ facebook: [] }, 'facebook'), { order: [], declared: true })
  assert.deepEqual(resolveOrder({ facebook: ['apify'] }, 'facebook'), { order: ['apify'], declared: true })
  assert.deepEqual(resolveOrder({ facebook: ['apify'] }, 'map-discovery', { mapDiscoveryProvider: 'osm' }), {
    order: ['osm'],
    declared: false
  })
  assert.throws(() => resolveOrder({}, 'myspace'), RangeError)
})

test('parseProviderOrder refuses what it cannot keep and never fills defaults in', () => {
  assert.deepEqual(parseProviderOrder({ facebook: ['apify', 'scrapecreators'], tiktok: [] }), {
    ok: true,
    order: { facebook: ['apify', 'scrapecreators'], tiktok: [] }
  })
  for (const bad of [
    null,
    [],
    'facebook',
    { myspace: ['apify'] },
    { facebook: 'apify' },
    { facebook: ['apify', 'apify'] },
    { facebook: ['looter2'] },
    { facebook: [7] }
  ]) {
    const r = parseProviderOrder(bad)
    assert.equal(r.ok, false, JSON.stringify(bad))
    assert.match(r.message, /\S/)
  }
})

const answer = (provider, status, extra = {}) => ({
  provider,
  status,
  data: status === 'skipped' ? null : { from: provider },
  ...extra
})

test('runInOrder: a key problem, quota, provider error or timeout falls to the next provider', async () => {
  for (const reason of FALLBACK_REASONS) {
    const tried = []
    const r = await runInOrder(['a', 'b'], async (id) => {
      tried.push(id)
      return id === 'a' ? answer('a', 'skipped', { reason }) : answer('b', 'complete')
    })
    assert.deepEqual(tried, ['a', 'b'], reason)
    assert.equal(r.answer.provider, 'b')
    assert.deepEqual(
      r.attempts.map((x) => [x.provider, x.status, x.reason ?? null]),
      [
        ['a', 'skipped', reason],
        ['b', 'complete', null]
      ]
    )
    assert.ok(!('data' in r.attempts[0]), 'attempts carry no data')
  }
})

test('runInOrder: not_found stops the chain; complete stops it; [] runs nothing', async () => {
  const tried = []
  const r = await runInOrder(['a', 'b'], async (id) => {
    tried.push(id)
    return answer(id, 'not_found')
  })
  assert.deepEqual(tried, ['a'])
  assert.equal(r.answer, null)
  assert.equal(r.decisive.status, 'not_found')

  const none = await runInOrder([], async () => assert.fail('nothing to run'))
  assert.equal(none.answer, null)
  assert.deepEqual(none.attempts, [])
})

test('runInOrder: a partial answer is kept, the next provider may complete it', async () => {
  const r = await runInOrder(
    ['a', 'b', 'c'],
    async (id) =>
      answer(
        id,
        id === 'a' ? 'partial' : id === 'b' ? 'skipped' : 'complete',
        id === 'b' ? { reason: 'quota' } : {}
      ),
    { continueOnPartial: true }
  )
  assert.deepEqual(
    r.answers.map((x) => x.provider),
    ['a', 'c']
  )
  assert.equal(r.answer.provider, 'c')
  const stops = await runInOrder(['a', 'b'], async (id) => answer(id, 'partial'))
  assert.deepEqual(
    stops.answers.map((x) => x.provider),
    ['a']
  )
})

test('runInOrder: a thrown error is not a provider answer and is not swallowed', async () => {
  await assert.rejects(
    runInOrder(['a', 'b'], async () => {
      throw new Error('budget')
    }),
    /budget/
  )
})
