import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectSocialProfile, PROFILE_TIERS } from '../domain/social-profile.mjs'
import { fetchSocialStats, SOCIAL_CHAINS, statsTiersOf } from '../domain/social-stats/chain.mjs'
import { defaultOrderOf } from '../domain/capabilities.mjs'
import { connectorsFor } from '../domain/connectors.mjs'
import { APIFY_ACTORS } from '../domain/apify.mjs'

const NOW = () => Date.parse('2026-10-23T09:00:00Z')
const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const FB = 'https://www.facebook.com/SundriftDubai'
const IG = 'https://www.instagram.com/sundrift.dubai/'

const FB_PROFILE = {
  success: true,
  id: '100064',
  name: 'Sundrift',
  pageIntro: 'Modern Emirati kitchen',
  category: 'Restaurant',
  phone: '+971 4 000 0000',
  address: 'Jumeirah Beach Rd, Dubai',
  website: 'https://sundrift.example',
  email: 'hi@sundrift.example',
  rating: 4.6,
  ratingCount: 213,
  likeCount: 3900,
  followerCount: 4000,
  priceRange: '$$',
  profilePicLarge: 'https://scontent.fb/profile.jpg',
  coverPhoto: { photo: { image: { uri: 'https://scontent.fb/cover.jpg' } } }
}
const FB_POSTS = {
  success: true,
  cursor: null,
  posts: [
    {
      id: 'p1',
      url: 'https://www.facebook.com/SundriftDubai/posts/p1',
      text: 'Iftar menu is back',
      publishTime: 1792000000,
      image: 'https://scontent.fb/p1.jpg'
    },
    {
      id: 'p2',
      url: 'https://www.facebook.com/SundriftDubai/posts/p2',
      text: 'Live oud on Friday',
      publishTime: 1791000000
    }
  ]
}
const IG_PROFILE = {
  success: true,
  data: {
    user: {
      id: '555',
      username: 'sundrift.dubai',
      full_name: 'Sundrift Dubai',
      biography: 'Emirati kitchen · Jumeirah',
      external_url: 'https://sundrift.example',
      category_name: 'Restaurant',
      business_phone_number: '+97140000000',
      profile_pic_url_hd: 'https://cdn.ig/pp.jpg',
      edge_followed_by: { count: 90025 },
      edge_owner_to_timeline_media: {
        count: 1163,
        page_info: { has_next_page: true },
        edges: [
          {
            node: {
              id: 'm1',
              shortcode: 'AAA',
              display_url: 'https://cdn.ig/1.jpg',
              taken_at_timestamp: 1792000000,
              edge_media_to_caption: { edges: [{ node: { text: 'Machboos night' } }] }
            }
          },
          {
            node: {
              id: 'm2',
              shortcode: 'BBB',
              display_url: 'https://cdn.ig/2.jpg',
              is_video: true,
              video_url: 'https://cdn.ig/2.mp4',
              taken_at_timestamp: 1791000000
            }
          }
        ]
      }
    }
  }
}

/** ScrapeCreators answers from a table; Apify answers `apify` (status, body). Every request is recorded. */
function world({ sc = {}, apify = [401, { error: { type: 'user-or-token-not-found' } }] } = {}) {
  const calls = []
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url))
    calls.push({
      host: u.host,
      path: u.pathname,
      params: Object.fromEntries(u.searchParams),
      headers: init.headers
    })
    if (u.host === 'api.scrapecreators.com') {
      const answer = sc[u.pathname]
      if (!answer) return json({ success: false, message: 'not stubbed' }, 500)
      return Array.isArray(answer) ? json(answer[1], answer[0]) : json(answer)
    }
    if (u.host === 'api.apify.com') return json(apify[1], apify[0])
    throw new Error(`unexpected host ${u.host}`)
  }
  return { fetch, calls }
}

function charger() {
  const charged = []
  return {
    charged,
    charge: async (spec, run) => {
      charged.push(spec)
      return run()
    }
  }
}

const deps = (w, extra = {}) => ({ fetch: w.fetch, resolve, now: NOW, ...extra })

test('Apify credential_invalid, ScrapeCreators answering: the Facebook profile carries the page facts', async () => {
  const w = world({ sc: { '/v1/facebook/profile': FB_PROFILE, '/v1/facebook/profile/posts': FB_POSTS } })
  const { charged, charge } = charger()
  const r = await collectSocialProfile(
    'facebook',
    FB,
    { limit: 20 },
    deps(w, {
      order: ['apify', 'scrapecreators'],
      keys: { apify: 'APIFY_BAD', scrapecreators: 'SC' },
      charge
    })
  )
  assert.equal(r.status, 'complete')
  assert.equal(r.provider, 'scrapecreators')
  assert.deepEqual(r.attempts, [
    { provider: 'apify', status: 'skipped', reason: 'credential_invalid' },
    { provider: 'scrapecreators', status: 'complete' }
  ])
  assert.deepEqual(r.coverage.attempts, r.attempts)
  const p = r.profile
  assert.equal(p.name, 'Sundrift')
  assert.equal(p.bio, 'Modern Emirati kitchen')
  assert.deepEqual(
    [p.rating, p.ratingCount, p.likes, p.followers, p.phone, p.address, p.website, p.category],
    [
      4.6,
      213,
      3900,
      4000,
      '+971 4 000 0000',
      'Jumeirah Beach Rd, Dubai',
      'https://sundrift.example',
      'Restaurant'
    ]
  )
  assert.deepEqual(p.photos, ['https://scontent.fb/profile.jpg', 'https://scontent.fb/cover.jpg'])
  assert.equal(r.posts.length, 2)
  assert.deepEqual(r.posts[0], {
    id: 'p1',
    url: 'https://www.facebook.com/SundriftDubai/posts/p1',
    caption: 'Iftar menu is back',
    postedAt: new Date(1792000000 * 1000).toISOString(),
    provider: 'scrapecreators'
  })
  assert.ok(
    r.media.some(
      (m) =>
        m.url === 'https://scontent.fb/p1.jpg' &&
        m.kind === 'image' &&
        m.postId === 'p1' &&
        m.provider === 'scrapecreators'
    )
  )
  assert.ok(r.media.some((m) => m.url === 'https://scontent.fb/cover.jpg'))
  // Each provider is charged at its own price: Apify for the actor, ScrapeCreators for its two calls.
  assert.deepEqual(
    charged.map((c) => [c.provider, c.operation]),
    [
      ['apify', APIFY_ACTORS.facebook],
      ['scrapecreators', 'facebook-profile']
    ]
  )
  assert.ok(
    w.calls.filter((c) => c.host === 'api.scrapecreators.com').every((c) => c.headers['x-api-key'] === 'SC')
  )
})

test('Instagram through ScrapeCreators: followers, posts and bio in the same names as social stats', async () => {
  const w = world({ sc: { '/v1/instagram/profile': IG_PROFILE } })
  const { charge } = charger()
  const r = await collectSocialProfile(
    'instagram',
    IG,
    { limit: 20 },
    deps(w, { order: defaultOrderOf('instagram'), keys: { scrapecreators: 'SC' }, charge })
  )
  assert.equal(r.provider, 'scrapecreators')
  assert.equal(r.profile.name, 'Sundrift Dubai')
  assert.equal(r.profile.bio, 'Emirati kitchen · Jumeirah')
  assert.equal(r.profile.followers, 90025)
  assert.equal(r.profile.posts, 1163)
  assert.equal(r.profile.handle, 'sundrift.dubai')
  assert.equal(r.profile.website, 'https://sundrift.example')
  assert.deepEqual(
    r.posts.map((x) => [x.url, x.caption ?? null]),
    [
      ['https://www.instagram.com/p/AAA/', 'Machboos night'],
      ['https://www.instagram.com/p/BBB/', null]
    ]
  )
  assert.deepEqual(
    r.media.filter((m) => m.postId).map((m) => `${m.kind}:${m.url}`),
    ['image:https://cdn.ig/1.jpg', 'image:https://cdn.ig/2.jpg', 'video:https://cdn.ig/2.mp4']
  )
})

test('no ScrapeCreators key: skipped without a call, Apify answers as before', async () => {
  const w = world({
    apify: [
      201,
      [
        {
          postId: 'a1',
          url: 'https://www.facebook.com/x/posts/a1',
          text: 'Hello',
          time: '2026-10-01T08:00:00Z',
          pageName: 'Sundrift'
        }
      ]
    ]
  })
  const { charged, charge } = charger()
  const r = await collectSocialProfile(
    'facebook',
    FB,
    { limit: 20 },
    deps(w, { order: defaultOrderOf('facebook'), keys: { apify: 'APIFY' }, charge })
  )
  assert.equal(r.provider, 'apify')
  assert.equal(r.profile.name, 'Sundrift')
  assert.equal(r.posts.length, 1)
  assert.deepEqual(
    r.attempts.map((a) => [a.provider, a.status, a.reason ?? null]),
    [
      ['scrapecreators', 'skipped', 'credential_missing'],
      ['apify', 'partial', null]
    ]
  )
  assert.equal(w.calls.filter((c) => c.host === 'api.scrapecreators.com').length, 0)
  assert.deepEqual(
    charged.map((c) => c.provider),
    ['apify']
  )
})

test('ScrapeCreators out of credit (402) falls to Apify', async () => {
  const w = world({
    sc: { '/v1/facebook/profile': [402, { success: false, message: 'Out of credits' }] },
    apify: [201, [{ postId: 'a1', text: 'Hi', time: '2026-10-01T08:00:00Z', pageName: 'Sundrift' }]]
  })
  const { charge } = charger()
  const r = await collectSocialProfile(
    'facebook',
    FB,
    {},
    deps(w, { order: defaultOrderOf('facebook'), keys: { apify: 'A', scrapecreators: 'SC' }, charge })
  )
  assert.equal(r.provider, 'apify')
  assert.deepEqual(r.attempts[0], { provider: 'scrapecreators', status: 'skipped', reason: 'quota' })
})

test('both refuse the key: the source is blocked credential_invalid, as before', async () => {
  const w = world({ sc: { '/v1/facebook/profile': [401, { success: false }] } })
  const { charge } = charger()
  const r = await collectSocialProfile(
    'facebook',
    FB,
    {},
    deps(w, { order: defaultOrderOf('facebook'), keys: { apify: 'A', scrapecreators: 'SC' }, charge })
  )
  assert.equal(r.status, 'blocked')
  assert.equal(r.reason, 'credential_invalid')
  assert.deepEqual(r.posts, [])
  assert.deepEqual(
    r.attempts.map((a) => a.reason),
    ['credential_invalid', 'credential_invalid']
  )
  assert.deepEqual(r.coverage.attempts, r.attempts, 'the source row keeps why each provider gave nothing')
})

test('no key anywhere: blocked credential_missing, nothing charged', async () => {
  const w = world()
  const { charged, charge } = charger()
  const r = await collectSocialProfile(
    'instagram',
    IG,
    {},
    deps(w, { order: defaultOrderOf('instagram'), keys: {}, charge })
  )
  assert.equal(r.status, 'blocked')
  assert.equal(r.reason, 'credential_missing')
  assert.equal(w.calls.length, 0)
  assert.deepEqual(charged, [])
})

test('a page ScrapeCreators says is gone stops the chain: Apify is not paid to look again', async () => {
  const w = world({ sc: { '/v1/facebook/profile': [404, { success: false }] } })
  const { charged, charge } = charger()
  const r = await collectSocialProfile(
    'facebook',
    FB,
    {},
    deps(w, { order: defaultOrderOf('facebook'), keys: { apify: 'A', scrapecreators: 'SC' }, charge })
  )
  assert.equal(r.status, 'failed')
  assert.equal(r.reason, 'not_found')
  assert.deepEqual(
    charged.map((c) => c.provider),
    ['scrapecreators']
  )
})

test('a page without posts is kept as partial data and the next provider is asked for the rest', async () => {
  const w = world({
    sc: { '/v1/facebook/profile': FB_PROFILE, '/v1/facebook/profile/posts': [500, { success: false }] },
    apify: [
      201,
      [
        {
          postId: 'a1',
          url: 'https://www.facebook.com/x/posts/a1',
          text: 'From Apify',
          time: '2026-10-01T08:00:00Z',
          pageName: 'Sundrift (Apify)'
        }
      ]
    ]
  })
  const { charge } = charger()
  const r = await collectSocialProfile(
    'facebook',
    FB,
    {},
    deps(w, { order: defaultOrderOf('facebook'), keys: { apify: 'A', scrapecreators: 'SC' }, charge })
  )
  assert.equal(r.profile.name, 'Sundrift', "the first provider's fields win")
  assert.equal(r.profile.rating, 4.6)
  assert.deepEqual(
    r.posts.map((x) => [x.caption, x.provider]),
    [['From Apify', 'apify']]
  )
  assert.deepEqual(r.providers, ['scrapecreators', 'apify'])
  assert.equal(r.attempts[0].status, 'partial')
})

test('an operator order of [] switches the network off without a call', async () => {
  const w = world()
  const r = await collectSocialProfile(
    'facebook',
    FB,
    {},
    deps(w, { order: [], keys: { apify: 'A', scrapecreators: 'SC' }, charge: charger().charge })
  )
  assert.equal(r.status, 'skipped')
  assert.equal(r.reason, 'switched_off')
  assert.equal(w.calls.length, 0)
})

test('a paid provider never runs unmetered', async () => {
  const w = world({ sc: { '/v1/facebook/profile': FB_PROFILE, '/v1/facebook/profile/posts': FB_POSTS } })
  await assert.rejects(
    collectSocialProfile(
      'facebook',
      FB,
      {},
      deps(w, { order: ['scrapecreators'], keys: { scrapecreators: 'SC' } })
    ),
    /charge/
  )
  assert.equal(w.calls.length, 0)
})

test('profile and stats walk the same order', async () => {
  for (const network of ['facebook', 'instagram', 'tiktok', 'youtube']) {
    assert.deepEqual(statsTiersOf(network, defaultOrderOf(network)), SOCIAL_CHAINS[network], network)
    for (const tier of Object.keys(PROFILE_TIERS[network]))
      assert.ok(defaultOrderOf(network).includes(tier), `${network}/${tier}`)
  }
  // An operator who puts Apify first gets Apify first in both.
  const order = ['apify', 'scrapecreators']
  const asked = []
  const providers = Object.fromEntries(
    ['facebook/apify', 'facebook/scrapecreators'].map((id) => [
      id,
      {
        network: 'facebook',
        provider: id.split('/')[1],
        credential: id.endsWith('apify') ? 'apify' : 'scrapecreators',
        async fetchProfile() {
          asked.push(id)
          return { network: 'facebook', provider: id.split('/')[1], followers: 1 }
        }
      }
    ])
  )
  const stats = await fetchSocialStats(
    { network: 'facebook', url: FB },
    { order, providers, keys: { scrapecreators: 'SC' }, apifyToken: 'A' }
  )
  assert.equal(stats.provider, 'apify')
  assert.deepEqual(asked, ['facebook/apify'])
  const w = world({
    apify: [201, [{ postId: 'a1', text: 'Hi', time: '2026-10-01T08:00:00Z', pageName: 'S' }]]
  })
  const profile = await collectSocialProfile(
    'facebook',
    FB,
    {},
    deps(w, { order, keys: { apify: 'A', scrapecreators: 'SC' }, charge: charger().charge })
  )
  assert.equal(profile.attempts[0].provider, 'apify')
})

test('a cursor left by a provider resumes that provider only', async () => {
  const w = world({
    apify: [
      201,
      [
        { postId: 'a1', text: 'one', time: '2026-10-01T08:00:00Z' },
        { postId: 'a2', text: 'two', time: '2026-10-02T08:00:00Z' }
      ]
    ]
  })
  const { charged, charge } = charger()
  const r = await collectSocialProfile(
    'facebook',
    FB,
    { cursor: { offset: 1, provider: 'apify' }, limit: 1 },
    deps(w, { order: defaultOrderOf('facebook'), keys: { apify: 'A', scrapecreators: 'SC' }, charge })
  )
  assert.deepEqual(
    charged.map((c) => c.provider),
    ['apify']
  )
  assert.equal(w.calls.filter((c) => c.host === 'api.scrapecreators.com').length, 0)
  assert.deepEqual(
    r.posts.map((x) => x.caption),
    ['two']
  )
})

test('connectorsFor takes the order and keys: ScrapeCreators alone makes Facebook available', async () => {
  const c = connectorsFor(
    { SCRAPECREATORS_API_KEY: 'SC' },
    { order: { facebook: ['scrapecreators', 'apify'] } }
  )
  assert.equal(c.facebook.available, true)
  assert.equal(c.facebook.provider, 'scrapecreators')
  const off = connectorsFor({ SCRAPECREATORS_API_KEY: 'SC', APIFY_TOKEN: 'A' }, { order: { facebook: [] } })
  assert.equal(off.facebook.available, false)
  assert.equal(off.facebook.reason, 'switched_off')
  const w = world({ sc: { '/v1/facebook/profile': FB_PROFILE, '/v1/facebook/profile/posts': FB_POSTS } })
  const r = await c.facebook.collect(FB, { limit: 20 }, deps(w, { charge: charger().charge }))
  assert.equal(r.profile.rating, 4.6)
})

test('callers without an order keep Apify-only collection with the reservation around collect()', async () => {
  const c = connectorsFor({ APIFY_TOKEN: 'A' })
  assert.equal(c.facebook.provider, 'apify')
  const w = world({
    apify: [201, [{ postId: 'a1', text: 'Hi', time: '2026-10-01T08:00:00Z', pageName: 'Sundrift' }]]
  })
  const r = await c.facebook.collect(FB, { limit: 20 }, deps(w))
  assert.equal(r.provider, 'apify')
  assert.equal(r.posts.length, 1)
  // A ScrapeCreators key given to such a caller is still never spent unmetered.
  const sc = connectorsFor({ SCRAPECREATORS_API_KEY: 'SC' })
  await assert.rejects(sc.facebook.collect(FB, {}, deps(world())), /charge/)
})

test("the page's own profile photo is marked as such, so it can be tried as the logo", async () => {
  const w = world({
    sc: {
      '/v1/instagram/profile': IG_PROFILE,
      '/v1/facebook/profile': FB_PROFILE,
      '/v1/facebook/profile/posts': FB_POSTS
    }
  })
  const { charge } = charger()
  const ig = await collectSocialProfile(
    'instagram',
    IG,
    { limit: 20 },
    deps(w, { order: defaultOrderOf('instagram'), keys: { scrapecreators: 'SC' }, charge })
  )
  assert.deepEqual(
    ig.media.filter((m) => m.role).map((m) => [m.url, m.role]),
    [['https://cdn.ig/pp.jpg', 'profile']]
  )
  const fb = await collectSocialProfile(
    'facebook',
    FB,
    { limit: 20 },
    deps(w, { order: ['scrapecreators'], keys: { scrapecreators: 'SC' }, charge })
  )
  assert.deepEqual(
    fb.media.filter((m) => m.role).map((m) => m.role),
    ['profile', 'cover']
  )
})

test('Facebook logo: the profile picture file, never the photo page link (ScrapeCreators answer as measured 24/10)', async () => {
  const { readFile } = await import('node:fs/promises')
  const page = JSON.parse(
    await readFile(new URL('./fixtures/scrapecreators/facebook-profile.json', import.meta.url), 'utf8')
  )
  const w = world({ sc: { '/v1/facebook/profile': page, '/v1/facebook/profile/posts': FB_POSTS } })
  const r = await collectSocialProfile(
    'facebook',
    FB,
    { limit: 20 },
    deps(w, { order: ['scrapecreators'], keys: { scrapecreators: 'SC' }, charge: charger().charge })
  )
  const logo = r.media.find((m) => m.role === 'profile')
  assert.equal(logo?.url, page.profilePicLarge)
  assert.ok(!r.media.some((m) => m.url.includes('facebook.com/photo')), 'a photo page is not an image')
  assert.deepEqual(r.profile.photos, [page.profilePicLarge, page.coverPhoto.photo.image.uri])
  // Smaller sizes stand in when the larger is missing; an older `profilePicture` is the last resort.
  const medium = { ...page, profilePicLarge: undefined }
  const w2 = world({ sc: { '/v1/facebook/profile': medium, '/v1/facebook/profile/posts': FB_POSTS } })
  const r2 = await collectSocialProfile(
    'facebook',
    FB,
    { limit: 20 },
    deps(w2, { order: ['scrapecreators'], keys: { scrapecreators: 'SC' }, charge: charger().charge })
  )
  assert.equal(r2.media.find((m) => m.role === 'profile')?.url, page.profilePicMedium)
  const old = {
    ...page,
    profilePicLarge: undefined,
    profilePicMedium: undefined,
    profilePicSmall: undefined,
    profilePicture: 'https://scontent.xx.fbcdn.net/old.jpg'
  }
  const w3 = world({ sc: { '/v1/facebook/profile': old, '/v1/facebook/profile/posts': FB_POSTS } })
  const r3 = await collectSocialProfile(
    'facebook',
    FB,
    { limit: 20 },
    deps(w3, { order: ['scrapecreators'], keys: { scrapecreators: 'SC' }, charge: charger().charge })
  )
  assert.equal(r3.media.find((m) => m.role === 'profile')?.url, 'https://scontent.xx.fbcdn.net/old.jpg')
})
