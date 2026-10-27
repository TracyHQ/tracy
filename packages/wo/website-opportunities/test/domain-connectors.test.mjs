import { test } from 'node:test'
import assert from 'node:assert/strict'
import { connectorsFor } from '../domain/connectors.mjs'
import { apifyCollect, APIFY_ACTORS } from '../domain/apify.mjs'

const TOKEN = 'apify_api_SECRET123'
const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const json = (body, status = 201) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function recorder(respond) {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null })
    return respond(url, init)
  }
  return { fetch, calls }
}

test('without APIFY_TOKEN, facebook/instagram/tiktok are unavailable and collect() reports blocked', async () => {
  const c = connectorsFor({})
  assert.equal(c.website.available, true)
  assert.equal(c.youtube.available, true)
  for (const s of ['facebook', 'instagram', 'tiktok']) {
    assert.equal(c[s].available, false)
    assert.equal(c[s].reason, 'credential_missing')
    let fetched = false
    const r = await c[s].collect(
      'https://example.com/x',
      {},
      {
        fetch: async () => {
          fetched = true
        },
        resolve
      }
    )
    assert.equal(fetched, false, 'no network call without a credential')
    assert.equal(r.source, s)
    assert.equal(r.status, 'blocked')
    assert.equal(r.reason, 'credential_missing')
    assert.deepEqual(r.media, [])
  }
})

test('with APIFY_TOKEN every source is available', () => {
  const c = connectorsFor({ APIFY_TOKEN: TOKEN })
  for (const s of ['website', 'facebook', 'instagram', 'tiktok', 'youtube'])
    assert.equal(c[s].available, true, s)
})

const NOW = () => Date.parse('2026-10-18T09:00:00Z')

test('instagram calls the agreed actor and maps posts, carousels and videos to media', async () => {
  const { fetch, calls } = recorder(() =>
    json([
      {
        id: '1',
        shortCode: 'AAA',
        url: 'https://www.instagram.com/p/AAA/',
        caption: 'Egg coffee',
        timestamp: '2026-10-01T08:00:00.000Z',
        displayUrl: 'https://cdn.ig/1.jpg',
        ownerFullName: 'Brewlet Coffee',
        ownerUsername: 'brewletcoffeehoian'
      },
      {
        id: '2',
        url: 'https://www.instagram.com/p/BBB/',
        caption: 'Live music',
        timestamp: '2026-09-01T08:00:00.000Z',
        type: 'Video',
        displayUrl: 'https://cdn.ig/2.jpg',
        videoUrl: 'https://cdn.ig/2.mp4'
      },
      {
        id: '3',
        url: 'https://www.instagram.com/p/CCC/',
        type: 'Sidecar',
        images: ['https://cdn.ig/3a.jpg', 'https://cdn.ig/3b.jpg'],
        childPosts: [{ displayUrl: 'https://cdn.ig/3a.jpg' }]
      }
    ])
  )
  const r = await apifyCollect(
    'instagram',
    'brewletcoffeehoian',
    { limit: 10 },
    { fetch, resolve, token: TOKEN, now: NOW }
  )

  const u = new URL(calls[0].url)
  assert.equal(
    u.origin + u.pathname,
    `https://api.apify.com/v2/acts/${APIFY_ACTORS.instagram}/run-sync-get-dataset-items`
  )
  assert.equal(APIFY_ACTORS.instagram, 'apify~instagram-scraper')
  assert.equal(u.searchParams.get('token'), null, 'the token never goes into the URL')
  assert.ok(Number(u.searchParams.get('timeout')) >= 240)
  assert.equal(calls[0].init.headers.authorization, `Bearer ${TOKEN}`)
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(calls[0].body, {
    directUrls: ['https://www.instagram.com/brewletcoffeehoian/'],
    resultsType: 'posts',
    resultsLimit: 10,
    onlyPostsNewerThan: '2025-10-18'
  })
  // Apify itself stops the run at these, whatever the actor input says.
  assert.equal(u.searchParams.get('maxItems'), '10')
  assert.equal(u.searchParams.get('maxTotalChargeUsd'), '0.25')

  assert.equal(r.source, 'instagram')
  assert.equal(r.status, 'complete', 'fewer items than asked means the end was reached')
  assert.equal(r.cursor, null)
  assert.equal(r.profile.name, 'Brewlet Coffee')
  assert.equal(r.posts.length, 3)
  assert.deepEqual(r.posts[0], {
    id: '1',
    url: 'https://www.instagram.com/p/AAA/',
    caption: 'Egg coffee',
    postedAt: '2026-10-01T08:00:00.000Z'
  })
  const media = r.media.map((m) => `${m.kind}:${m.url}`)
  assert.deepEqual(media, [
    'image:https://cdn.ig/1.jpg',
    'image:https://cdn.ig/2.jpg',
    'video:https://cdn.ig/2.mp4',
    'image:https://cdn.ig/3a.jpg',
    'image:https://cdn.ig/3b.jpg'
  ])
  assert.equal(r.media[0].postId, '1')
  assert.equal(r.media[0].sourceUrl, 'https://www.instagram.com/p/AAA/')
  assert.equal(r.media[0].caption, 'Egg coffee')
  assert.deepEqual(r.coverage, { fetched: 3, until: '2026-09-01T08:00:00.000Z' })
})

test('pagination: asks offset+limit and keeps only the new items; a full page leaves a cursor', async () => {
  const items = Array.from({ length: 4 }, (_, i) => ({
    id: String(i),
    url: `https://www.tiktok.com/@phin/video/${i}`,
    text: `v${i}`,
    createTimeISO: '2026-10-01T00:00:00.000Z',
    videoMeta: { coverUrl: `https://cdn.tt/${i}.jpg` },
    mediaUrls: [`https://cdn.tt/${i}.mp4`],
    authorMeta: { nickName: 'Phin', signature: 'Coffee bio' }
  }))
  const { fetch, calls } = recorder((url, init) => json(items.slice(0, JSON.parse(init.body).resultsPerPage)))
  const r = await apifyCollect(
    'tiktok',
    'https://www.tiktok.com/@brewlet.coffee',
    { cursor: { offset: 2 }, limit: 2 },
    { fetch, resolve, token: TOKEN }
  )
  assert.deepEqual(calls[0].body, { profiles: ['brewlet.coffee'], resultsPerPage: 4 })
  assert.equal(APIFY_ACTORS.tiktok, 'clockworks~tiktok-scraper')
  assert.deepEqual(
    r.posts.map((p) => p.id),
    ['2', '3']
  )
  assert.equal(r.status, 'partial')
  assert.deepEqual(r.cursor, { offset: 4 })
  assert.equal(r.profile.bio, 'Coffee bio')
  assert.ok(r.media.some((m) => m.kind === 'video' && m.url === 'https://cdn.tt/2.mp4'))
})

test('facebook input and defensive media mapping', async () => {
  const { fetch, calls } = recorder(() =>
    json([
      {
        postId: 'p1',
        url: 'https://www.facebook.com/phin/posts/p1',
        text: 'New menu!',
        time: '2026-10-02T10:00:00.000Z',
        pageName: 'Brewlet Coffee',
        media: [
          { __typename: 'Photo', photo_image: { uri: 'https://cdn.fb/1.jpg' } },
          { __typename: 'Video', thumbnail: 'https://cdn.fb/v.jpg', videoUrl: 'https://cdn.fb/v.mp4' }
        ]
      },
      { postId: 'p2', text: 'no media', timestamp: 1759399200, media: 'unexpected shape' }
    ])
  )
  const r = await apifyCollect(
    'facebook',
    'https://www.facebook.com/phin',
    { limit: 5 },
    { fetch, resolve, token: TOKEN, now: NOW }
  )
  assert.deepEqual(calls[0].body, {
    startUrls: [{ url: 'https://www.facebook.com/phin' }],
    resultsLimit: 5,
    onlyPostsNewerThan: '2025-10-18'
  })
  assert.equal(APIFY_ACTORS.facebook, 'apify~facebook-posts-scraper')
  assert.deepEqual(
    r.media.map((m) => `${m.kind}:${m.url}`),
    ['image:https://cdn.fb/1.jpg', 'image:https://cdn.fb/v.jpg', 'video:https://cdn.fb/v.mp4']
  )
  assert.equal(r.posts.length, 2)
  assert.equal(r.posts[1].postedAt, '2025-10-02T10:00:00.000Z')
  assert.equal(r.profile.name, 'Brewlet Coffee')
})

test('HTTP errors map to the agreed statuses and keep the cursor where retryable', async () => {
  const cases = [
    [401, 'blocked', 'credential_invalid', null],
    [403, 'blocked', 'credential_invalid', null],
    [402, 'partial', 'quota', { offset: 6 }],
    [429, 'partial', 'rate_limited', { offset: 6 }],
    [408, 'partial', 'timeout', { offset: 6 }]
  ]
  for (const [code, status, reason, cursor] of cases) {
    const fetch = async () => json({ error: { message: `bad token ${TOKEN}` } }, code)
    const r = await apifyCollect(
      'instagram',
      'phin',
      { cursor: { offset: 6 }, limit: 3 },
      { fetch, resolve, token: TOKEN }
    )
    assert.equal(r.status, status, String(code))
    assert.equal(r.reason, reason, String(code))
    assert.deepEqual(r.cursor, cursor, String(code))
    assert.doesNotMatch(JSON.stringify(r), /SECRET123/)
  }
})

test('a client-side timeout is partial with the cursor kept, and the token is never echoed', async () => {
  const fetch = (url, init) =>
    new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)))
  const r = await apifyCollect(
    'instagram',
    'phin',
    { limit: 3 },
    { fetch, resolve, token: TOKEN, timeoutMs: 20 }
  )
  assert.equal(r.status, 'partial')
  assert.equal(r.reason, 'timeout')
  assert.deepEqual(r.cursor, { offset: 0 })

  const leaky = async (url, init) => {
    throw new Error(`connect failed, auth ${init.headers.authorization}`)
  }
  const r2 = await apifyCollect('instagram', 'phin', { limit: 3 }, { fetch: leaky, resolve, token: TOKEN })
  assert.doesNotMatch(JSON.stringify(r2), /SECRET123/)
  assert.match(r2.error, /\*\*\*/)
})

test('instagram error items: missing profile fails not_found, private/empty is blocked', async () => {
  const one = (item) => async () => json([item])
  const r1 = await apifyCollect(
    'instagram',
    'gone',
    {},
    {
      fetch: one({
        url: 'https://www.instagram.com/gone',
        username: 'gone',
        error: 'not_found',
        errorDescription: 'Profile does not exist'
      }),
      resolve,
      token: TOKEN
    }
  )
  assert.equal(r1.status, 'failed')
  assert.equal(r1.reason, 'not_found')
  assert.deepEqual(r1.media, [])
  const r2 = await apifyCollect(
    'instagram',
    'shy',
    {},
    {
      fetch: one({ error: 'no_items', errorDescription: 'Empty or private data for provided input' }),
      resolve,
      token: TOKEN
    }
  )
  assert.equal(r2.status, 'blocked')
  assert.equal(r2.reason, 'private_or_empty')
})

test('youtube via Apify: watch URL as video, thumbnail as image, channel profile', async () => {
  const { fetch, calls } = recorder(() =>
    json([
      {
        id: 'abc',
        title: 'Egg coffee',
        url: 'https://www.youtube.com/watch?v=abc',
        thumbnailUrl: 'https://i.ytimg.com/vi/abc/hq.jpg',
        date: '2026-09-30T00:00:00.000Z',
        channelName: 'Phin',
        channelDescription: 'Coffee',
        type: 'video'
      }
    ])
  )
  const r = await apifyCollect(
    'youtube',
    'https://www.youtube.com/@phin',
    { limit: 5 },
    { fetch, resolve, token: TOKEN }
  )
  assert.deepEqual(calls[0].body, { startUrls: [{ url: 'https://www.youtube.com/@phin' }], maxResults: 5 })
  assert.deepEqual(
    r.media.map((m) => `${m.kind}:${m.url}`),
    ['image:https://i.ytimg.com/vi/abc/hq.jpg', 'video:https://www.youtube.com/watch?v=abc']
  )
  assert.deepEqual(r.profile, { name: 'Phin', bio: 'Coffee' })
})

test('connectors route website collect through the crawler', async () => {
  const c = connectorsFor({})
  const fetch = async (url) =>
    url === 'https://phin.test/'
      ? new Response('<html><title>Phin</title></html>', { headers: { 'content-type': 'text/html' } })
      : new Response('', { status: 404 })
  const r = await c.website.collect('https://phin.test/', { limit: 5 }, { fetch, resolve })
  assert.equal(r.source, 'website')
  assert.equal(r.status, 'complete')
  assert.equal(r.pages[0].title, 'Phin')
})

test('the default asks for 20 recent posts, and a caller may lower the charge ceiling', async () => {
  const { fetch, calls } = recorder(() => json([]))
  await apifyCollect(
    'facebook',
    'https://www.facebook.com/phin',
    {},
    { fetch, resolve, token: TOKEN, now: NOW, maxChargeUsd: 0.1 }
  )
  const u = new URL(calls[0].url)
  assert.equal(calls[0].body.resultsLimit, 20)
  assert.equal(u.searchParams.get('maxItems'), '20')
  assert.equal(u.searchParams.get('maxTotalChargeUsd'), '0.1')
})

// B8 remainder (ai-flow audit 19/10/2026): a job reclaimed after a restart during a synchronous run paid for a
// second run, since the run id was known only once the call ended. Stand-ins only; the real API is never called.
function fakeApify({ items = [], status = 'SUCCEEDED', runs = new Map() } = {}) {
  let started = 0
  const { fetch, calls } = recorder((url, init) => {
    const u = new URL(url)
    if (init.method === 'POST' && u.pathname.endsWith('/runs')) {
      started += 1
      const id = `run-${started}`
      runs.set(id, { status, items })
      return json({ data: { id, defaultDatasetId: `ds-${id}`, status: 'READY' } }, 201)
    }
    const run = u.pathname.match(/^\/v2\/actor-runs\/([^/]+)$/)
    if (run)
      return runs.has(run[1])
        ? json({ data: { id: run[1], status: runs.get(run[1]).status } }, 200)
        : json({ error: { type: 'record-not-found' } }, 404)
    const ds = u.pathname.match(/^\/v2\/datasets\/ds-([^/]+)\/items$/)
    if (ds)
      return runs.has(ds[1])
        ? json(runs.get(ds[1]).items, 200)
        : json({ error: { type: 'record-not-found' } }, 404)
    return json({ error: 'unexpected' }, 500)
  })
  return { fetch, calls, runs, started: () => started }
}
const IG = [
  {
    id: '1',
    url: 'https://www.instagram.com/p/AAA/',
    displayUrl: 'https://cdn.ig/1.jpg',
    ownerFullName: 'Phin'
  }
]

test('with onRun: the run starts asynchronously, its id is recorded before the wait, then its dataset is read', async () => {
  const apify = fakeApify({ items: IG })
  const recorded = []
  const order = []
  const onRun = async (run) => {
    recorded.push(run)
    order.push(`record:${apify.calls.length}`)
  }
  const r = await apifyCollect(
    'instagram',
    'phin',
    { limit: 10 },
    { fetch: apify.fetch, resolve, token: TOKEN, now: NOW, onRun, maxChargeUsd: 0.1 }
  )
  assert.equal(r.status, 'complete')
  assert.equal(r.posts[0].id, '1')
  assert.deepEqual(recorded, [{ source: 'instagram', offset: 0, id: 'run-1', datasetId: 'ds-run-1' }])
  assert.deepEqual(order, ['record:1'], 'recorded right after the start, before any wait')
  const [start, wait, read] = apify.calls.map((c) => new URL(c.url))
  assert.equal(start.pathname, `/v2/acts/${APIFY_ACTORS.instagram}/runs`)
  assert.equal(start.searchParams.get('maxItems'), '10')
  assert.equal(start.searchParams.get('maxTotalChargeUsd'), '0.1')
  assert.equal(start.searchParams.get('token'), null)
  assert.equal(apify.calls[0].init.method, 'POST')
  assert.equal(apify.calls[0].body.directUrls[0], 'https://www.instagram.com/phin/')
  assert.equal(wait.pathname, '/v2/actor-runs/run-1')
  assert.ok(Number(wait.searchParams.get('waitForFinish')) > 0)
  assert.equal(read.pathname, '/v2/datasets/ds-run-1/items')
  for (const c of apify.calls) assert.equal(c.init.headers.authorization, `Bearer ${TOKEN}`)
})

test('a run an earlier holder recorded is read, not started again', async () => {
  const runs = new Map([['run-7', { status: 'SUCCEEDED', items: IG }]])
  const apify = fakeApify({ runs })
  const held = { source: 'instagram', offset: 0, id: 'run-7', datasetId: 'ds-run-7' }
  const r = await apifyCollect(
    'instagram',
    'phin',
    { limit: 10, run: held },
    { fetch: apify.fetch, resolve, token: TOKEN, now: NOW, onRun: async () => {} }
  )
  assert.equal(r.status, 'complete')
  assert.equal(r.posts.length, 1)
  assert.equal(apify.started(), 0, 'no second paid run')
  assert.equal(
    apify.calls.some((c) => c.init.method === 'POST'),
    false
  )
})

test('a held run for another offset, a missing one or one that failed is replaced by a new run', async () => {
  for (const [held, runs] of [
    [
      { source: 'instagram', offset: 20, id: 'run-7', datasetId: 'ds-run-7' },
      new Map([['run-7', { status: 'SUCCEEDED', items: [] }]])
    ],
    [
      { source: 'facebook', offset: 0, id: 'run-7', datasetId: 'ds-run-7' },
      new Map([['run-7', { status: 'SUCCEEDED', items: [] }]])
    ],
    [{ source: 'instagram', offset: 0, id: 'run-7', datasetId: 'ds-run-7' }, new Map()],
    [
      { source: 'instagram', offset: 0, id: 'run-7', datasetId: 'ds-run-7' },
      new Map([['run-7', { status: 'ABORTED', items: [] }]])
    ]
  ]) {
    const apify = fakeApify({ items: IG, runs })
    const recorded = []
    const r = await apifyCollect(
      'instagram',
      'phin',
      { limit: 10, run: held },
      { fetch: apify.fetch, resolve, token: TOKEN, now: NOW, onRun: async (x) => void recorded.push(x.id) }
    )
    assert.equal(r.status, 'complete', JSON.stringify(held))
    assert.equal(r.posts.length, 1)
    assert.equal(apify.started(), 1)
    assert.deepEqual(recorded, ['run-1'])
  }
})

test('a run still going at the deadline is partial with the cursor kept; a failed record never stops the read', async () => {
  const apify = fakeApify({ status: 'RUNNING' })
  const r = await apifyCollect(
    'instagram',
    'phin',
    { cursor: { offset: 6 }, limit: 3 },
    {
      fetch: apify.fetch,
      resolve,
      token: TOKEN,
      timeoutMs: 50,
      onRun: async () => {
        throw new Error('db down')
      }
    }
  )
  assert.equal(r.status, 'partial')
  assert.equal(r.reason, 'timeout')
  assert.deepEqual(r.cursor, { offset: 6 })
  const refused = await apifyCollect(
    'instagram',
    'phin',
    {},
    {
      fetch: async () => json({ error: { message: `bad ${TOKEN}` } }, 402),
      resolve,
      token: TOKEN,
      onRun: async () => {}
    }
  )
  assert.equal(refused.status, 'partial')
  assert.equal(refused.reason, 'quota')
  assert.doesNotMatch(JSON.stringify(refused), /SECRET123/)
})
