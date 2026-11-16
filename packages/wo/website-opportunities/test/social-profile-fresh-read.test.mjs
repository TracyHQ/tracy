// A social profile is read fresh, never from a stored answer, and a picture whose signed address expired says so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectSocialProfile } from '../domain/social-profile.mjs'
import { createMediaStore } from '../src/media-store.js'

const json = (body) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

const ANSWERS = {
  '/v1/instagram/profile': {
    data: {
      user: {
        id: '901',
        username: 'lantern.bakery',
        full_name: 'Lantern Bakery',
        biography: 'Sourdough every morning',
        profile_pic_url_hd: 'https://cdn.example/pp.jpg?oe=6A000000',
        edge_owner_to_timeline_media: { count: 1, edges: [{ node: { id: 'm1', shortcode: 'Q1' } }] }
      }
    }
  },
  '/v1/facebook/profile': {
    id: '902',
    name: 'Lantern Bakery',
    profilePicLarge: 'https://cdn.example/fb.jpg'
  },
  '/v1/facebook/profile/posts': { posts: [] },
  '/v1/tiktok/profile': { user: { id: '903', uniqueId: 'lanternbakery', nickname: 'Lantern Bakery' } },
  '/v3/tiktok/profile/videos': { aweme_list: [] }
}
const URLS = {
  instagram: 'https://www.instagram.com/lantern.bakery/',
  facebook: 'https://www.facebook.com/LanternBakery',
  tiktok: 'https://www.tiktok.com/@lanternbakery'
}

for (const network of ['instagram', 'facebook', 'tiktok'])
  test(`${network}: every provider call asks for a fresh read, no cached answer`, async () => {
    const calls = []
    const fetch = async (url) => {
      const u = new URL(String(url))
      calls.push({ path: u.pathname, params: Object.fromEntries(u.searchParams) })
      return json(ANSWERS[u.pathname] ?? {})
    }
    await collectSocialProfile(
      network,
      URLS[network],
      { limit: 5 },
      {
        fetch,
        now: () => Date.parse('2026-11-16T09:00:00Z'),
        order: ['scrapecreators'],
        keys: { scrapecreators: 'SC' },
        charge: async (_spec, run) => run()
      }
    )
    assert.ok(calls.length > 0)
    for (const c of calls)
      assert.equal(c.params.cache_max_age, undefined, `${c.path} asked for a cached answer`)
  })

function storeAnswering(got) {
  const domain = {
    classifyMedia: () => 'other',
    sha256Hex: () => 'f'.repeat(64),
    sniffMime: () => null,
    fetchLimited: async () => got
  }
  const { mediaRecord } = createMediaStore({
    objects: { put: async () => true },
    imageInfo: async () => ({}),
    domainDeps: {}
  })
  const owner = { fields: {}, keyPrefix: 'test' }
  return mediaRecord(domain, owner, {
    url: 'https://cdn.example/pp.jpg?oe=6A000000',
    kind: 'image',
    source: 'instagram'
  })
}

test('a 403 "URL signature expired" sets the picture aside as url_expired', async () => {
  const record = await storeAnswering({
    status: 403,
    bytes: new TextEncoder().encode('URL signature expired'),
    truncated: false
  })
  assert.equal(record.status, 'reference')
  assert.equal(record.reason, 'url_expired')
})

test('any other refusal stays download_failed', async () => {
  const record = await storeAnswering({
    status: 403,
    bytes: new TextEncoder().encode('Forbidden'),
    truncated: false
  })
  assert.equal(record.reason, 'download_failed')
})
