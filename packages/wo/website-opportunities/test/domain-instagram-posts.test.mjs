// An Instagram page reads more than the 12 posts its profile answer embeds: the paged posts door, capped, deduped,
// with the embedded posts kept when the door fails. Shapes as measured on the door (12 a page, `more_available`,
// `next_max_id`); every business, caption and address below is invented.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectSocialProfile } from '../domain/social-profile.mjs'
import {
  INSTAGRAM_POST_PAGES_MAX,
  INSTAGRAM_POSTS_MAX,
  INSTAGRAM_PROFILE_REQUESTS_MAX,
  instagramPostOf
} from '../domain/instagram-posts.mjs'
import { ceilingCents } from '../src/cost-prices.js'

const IG = 'https://www.instagram.com/lantern.bakery/'
const OWNER = '7001'
const T0 = 1793000000 // seconds, newest post

/** One item of the posts door: post `n` (0 newest); every fifth a video, every seventh a carousel. */
function item(n) {
  const video = n % 5 === 4
  return {
    id: `${9000 + n}_${OWNER}`,
    code: `LB${n}`,
    media_type: video ? 2 : n % 7 === 6 ? 8 : 1,
    taken_at: T0 - n * 86400,
    caption: { text: `Lantern Bakery post ${n}: today's loaves.` },
    display_uri: `https://cdn.example.test/d${n}.jpg`,
    image_versions2: {
      candidates: [{ url: `https://cdn.example.test/c${n}.jpg`, width: 1080, height: 1350 }]
    },
    ...(video
      ? {
          video_url: `https://cdn.example.test/v${n}.mp4`,
          video_versions: [{ url: `https://cdn.example.test/v${n}.mp4`, type: 101, width: 720, height: 1280 }]
        }
      : { video_versions: null }),
    url: `https://www.instagram.com/p/LB${n}/`
  }
}
const page = (from, to, more) => ({
  success: true,
  credits_charged: 1,
  items: Array.from({ length: to - from }, (_, i) => item(from + i)),
  more_available: more,
  num_results: to - from,
  next_max_id: more ? `cursor-${to}` : null
})

/** The profile answer, embedding posts 0..11 the way the profile door does (GraphQL nodes, pk ids). */
const profile = (count = 77) => ({
  success: true,
  data: {
    user: {
      id: OWNER,
      username: 'lantern.bakery',
      full_name: 'Lantern Bakery',
      biography: 'Sourdough every morning',
      profile_pic_url_hd: 'https://cdn.example.test/pp.jpg',
      edge_followed_by: { count: 1200 },
      edge_owner_to_timeline_media: {
        count,
        edges: Array.from({ length: Math.min(12, count) }, (_, n) => ({
          node: {
            id: String(9000 + n),
            shortcode: `LB${n}`,
            display_url: `https://cdn.example.test/d${n}.jpg`,
            taken_at_timestamp: T0 - n * 86400,
            edge_media_to_caption: {
              edges: [{ node: { text: `Lantern Bakery post ${n}: today's loaves.` } }]
            }
          }
        }))
      }
    }
  }
})

/** The provider by path and cursor: `posts` maps a cursor (or '' for the first page) to an answer or an HTTP status. */
function world({ posts = {}, count } = {}) {
  const calls = []
  const fetch = async (url) => {
    const u = new URL(String(url))
    const params = Object.fromEntries(u.searchParams)
    calls.push({ path: u.pathname, params })
    const body =
      u.pathname === '/v1/instagram/profile'
        ? profile(count)
        : u.pathname === '/v2/instagram/user/posts'
          ? posts[params.next_max_id ?? '']
          : undefined
    if (typeof body === 'number' || body === undefined)
      return new Response(JSON.stringify({ success: false }), { status: body ?? 500 })
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  return { fetch, calls }
}

const read = (w, limit = 20) => {
  const charged = []
  return collectSocialProfile(
    'instagram',
    IG,
    { limit },
    {
      fetch: w.fetch,
      now: () => Date.parse('2026-11-17T09:00:00Z'),
      order: ['scrapecreators'],
      keys: { scrapecreators: 'SC' },
      charge: async (spec, run) => {
        charged.push(spec)
        return run()
      }
    }
  ).then((r) => ({ ...r, charged }))
}

test('three pages of the posts door: 36 posts, newest first, the cursor passed on, one charge for the read', async () => {
  const w = world({
    posts: { '': page(0, 12, true), 'cursor-12': page(12, 24, true), 'cursor-24': page(24, 36, true) }
  })
  const r = await read(w)
  assert.equal(r.status, 'complete')
  assert.equal(r.posts.length, INSTAGRAM_POSTS_MAX)
  assert.deepEqual(r.posts.slice(0, 2), [
    {
      id: '9000',
      url: 'https://www.instagram.com/p/LB0/',
      caption: "Lantern Bakery post 0: today's loaves.",
      postedAt: new Date(T0 * 1000).toISOString(),
      provider: 'scrapecreators'
    },
    {
      id: '9001',
      url: 'https://www.instagram.com/p/LB1/',
      caption: "Lantern Bakery post 1: today's loaves.",
      postedAt: new Date((T0 - 86400) * 1000).toISOString(),
      provider: 'scrapecreators'
    }
  ])
  const postsCalls = w.calls.filter((c) => c.path === '/v2/instagram/user/posts')
  assert.equal(postsCalls.length, INSTAGRAM_POST_PAGES_MAX)
  assert.deepEqual(
    postsCalls.map((c) => [c.params.handle, c.params.trim, c.params.next_max_id ?? null]),
    [
      ['lantern.bakery', 'true', null],
      ['lantern.bakery', 'true', 'cursor-12'],
      ['lantern.bakery', 'true', 'cursor-24']
    ]
  )
  assert.equal(w.calls.length, INSTAGRAM_PROFILE_REQUESTS_MAX)
  assert.ok(w.calls.every((c) => c.params.cache_max_age === undefined))
  assert.deepEqual(
    r.charged.map((c) => [c.provider, c.operation]),
    [['scrapecreators', 'instagram-profile-posts']]
  )
  // The picture is the largest candidate; a video post adds its video; the profile photo stays the logo candidate.
  assert.ok(r.media.some((m) => m.url === 'https://cdn.example.test/c0.jpg' && m.postId === '9000'))
  assert.ok(r.media.some((m) => m.url === 'https://cdn.example.test/v4.mp4' && m.kind === 'video'))
  assert.deepEqual(
    r.media.filter((m) => m.role).map((m) => m.role),
    ['profile']
  )
})

test('the paging stops where the page says there is no more, and never past the page cap', async () => {
  const w = world({
    posts: { '': page(0, 12, true), 'cursor-12': page(12, 20, false), 'cursor-20': page(20, 32, true) }
  })
  const r = await read(w)
  assert.equal(r.posts.length, 20)
  assert.equal(w.calls.filter((c) => c.path === '/v2/instagram/user/posts').length, 2)
})

test('the posts door failing on its first page leaves the profile and its embedded posts', async () => {
  const w = world({ posts: { '': 429 } })
  const r = await read(w)
  assert.equal(r.status, 'complete')
  assert.equal(r.profile.name, 'Lantern Bakery')
  assert.equal(r.posts.length, 12)
  assert.deepEqual(r.posts[0].url, 'https://www.instagram.com/p/LB0/')
})

test('a later page failing keeps the pages read; the embedded posts are never counted twice', async () => {
  const w = world({ posts: { '': page(0, 12, true), 'cursor-12': 500 } })
  const r = await read(w)
  assert.equal(r.posts.length, 12)
  assert.equal(new Set(r.posts.map((p) => p.id)).size, 12)
  assert.equal(new Set(r.media.map((m) => m.url)).size, r.media.length)
})

test('a post the door repeats across pages is kept once', async () => {
  const again = { ...page(11, 23, false) }
  const w = world({ posts: { '': page(0, 12, true), 'cursor-12': again } })
  const r = await read(w)
  assert.equal(r.posts.length, 23)
  assert.equal(new Set(r.posts.map((p) => p.id)).size, 23)
})

test('a page whose embedded posts are all it has asks the posts door nothing', async () => {
  const w = world({ count: 7 })
  const r = await read(w)
  assert.equal(r.posts.length, 7)
  assert.deepEqual(
    w.calls.map((c) => c.path),
    ['/v1/instagram/profile']
  )
})

test('a search checking a page (limit 1) reads the profile alone, priced as the profile alone', async () => {
  const w = world({ posts: { '': page(0, 12, true) } })
  const r = await read(w, 1)
  assert.equal(r.posts.length, 1)
  assert.deepEqual(
    w.calls.map((c) => c.path),
    ['/v1/instagram/profile']
  )
  assert.deepEqual(
    r.charged.map((c) => c.operation),
    ['instagram-profile']
  )
})

test('one door item: the media id without its owner part, the shortcode address, seconds as a date', () => {
  assert.deepEqual(instagramPostOf(item(4)), {
    post: {
      id: '9004',
      url: 'https://www.instagram.com/p/LB4/',
      caption: "Lantern Bakery post 4: today's loaves.",
      postedAt: new Date((T0 - 4 * 86400) * 1000).toISOString()
    },
    image: 'https://cdn.example.test/c4.jpg',
    video: 'https://cdn.example.test/v4.mp4'
  })
  assert.equal(instagramPostOf({}), null)
})

test('the price of an Instagram page read covers every request it may make; the profile alone stays one call', () => {
  assert.equal(ceilingCents('scrapecreators', 'instagram-profile-posts'), INSTAGRAM_PROFILE_REQUESTS_MAX)
  assert.equal(ceilingCents('scrapecreators', 'instagram-profile'), 1)
})
