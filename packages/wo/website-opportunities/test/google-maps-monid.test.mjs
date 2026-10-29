// Monid's Google reviews (litescrape /google/reviews): the HTTP run/poll/download, the review shape, and how its
// reviews join the ones WO already holds. Fixtures are trimmed answers captured 29/10/2026, reviewers made synthetic.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { defaultOrderOf, parseProviderOrder, resolveOrder } from '../domain/capabilities.mjs'
import { ceilingCents } from '../src/cost-prices.js'
import {
  MONID_ROUTE,
  googleReviewIdOf,
  monidDownloadUrl,
  monidGoogleReviewsCall,
  monidRetryable,
  monidSupplement,
  normalizeMonidReviews,
  withMonidReviews
} from '../src/google-maps-monid.js'
import { monidAttemptOf, monidReviewsOn } from '../src/google-maps-monid-research.js'
import { capabilityOfCharge } from '../src/provider-report.js'
import { sourceDue } from '../src/places.js'

const fixture = (name) => JSON.parse(readFileSync(new URL(`fixtures/monid/${name}`, import.meta.url), 'utf8'))
const HIDEOUT = fixture('litescrape-reviews-hideout.json')
const OISHII = fixture('litescrape-reviews-oishii.json')
const ENVELOPE = fixture('run-download-link.json')
const HIDEOUT_ID = HIDEOUT.search_parameters.place_id
const OISHII_ID = OISHII.search_parameters.place_id

/** A Monid that answers the run, then each poll in turn, then the download; records every request. */
function fakeMonid({ run, polls = [], download = null }) {
  const seen = []
  const fetch = async (url, init = {}) => {
    seen.push({ url: String(url), init })
    assert.equal(init.redirect, 'error')
    const u = new URL(url)
    if (u.hostname === 'api.monid.ai' && u.pathname === '/v1/run') return answer(run)
    if (u.hostname === 'api.monid.ai' && u.pathname.startsWith('/v1/runs/')) return answer(polls.shift())
    return answer(download)
  }
  return { fetch, seen }
}
const answer = (body) =>
  body instanceof Response ? body : new Response(JSON.stringify(body), { status: 200 })
const clock = () => {
  let t = Date.parse('2026-10-29T10:00:00Z')
  return { now: () => t, sleep: async (ms) => void (t += ms) }
}
const call = (fake, placeId = HIDEOUT_ID, extra = {}) =>
  monidGoogleReviewsCall({ placeId }, { key: 'test-monid', fetch: fake.fetch, ...clock(), ...extra })

test('an inline answer: one POST with the pinned route and the key, the reviews normalized, the cost kept', async () => {
  const fake = fakeMonid({
    run: { runId: 'run-1', status: 'COMPLETED', output: OISHII, cost: { value: 0.00015 } }
  })
  const result = await call(fake, OISHII_ID)
  assert.equal(fake.seen.length, 1)
  const [{ url, init }] = fake.seen
  assert.equal(url, 'https://api.monid.ai/v1/run')
  assert.equal(init.method, 'POST')
  assert.equal(init.headers.authorization, 'Bearer test-monid')
  assert.deepEqual(JSON.parse(init.body), {
    provider: 'litescrape',
    endpoint: '/google/reviews',
    input: { queryParams: { place_id: OISHII_ID, num: 100 } }
  })
  assert.equal(result.runId, 'run-1')
  assert.equal(result.costUsd, 0.00015)
  assert.deepEqual(result.placeInfo, { title: 'Oishii Sushi Bar', rating: 4.3, reviews: 9 })
  // The fixture's review with no text is left out.
  assert.equal(result.reviews.length, OISHII.reviews.length - 1)
  assert.ok(result.reviews.every((r) => r.provider === 'monid' && r.route === MONID_ROUTE))
  assert.ok(result.reviews.every((r) => r.fetchedAt === result.fetchedAt))
})

test('RUNNING is polled until COMPLETED, then the signed download is fetched without the key', async () => {
  const fake = fakeMonid({
    run: { runId: 'run-2', status: 'RUNNING' },
    polls: [
      { runId: 'run-2', status: 'RUNNING' },
      { runId: 'run-2', status: 'COMPLETED', output: ENVELOPE }
    ],
    download: HIDEOUT
  })
  const result = await call(fake)
  assert.deepEqual(
    fake.seen.map((s) => new URL(s.url).host + new URL(s.url).pathname),
    [
      'api.monid.ai/v1/run',
      'api.monid.ai/v1/runs/run-2',
      'api.monid.ai/v1/runs/run-2',
      'sfs.monid.ai/o-test-signed-object'
    ]
  )
  assert.equal(fake.seen[1].init.headers.authorization, 'Bearer test-monid')
  assert.equal(fake.seen[3].init.headers.authorization, undefined)
  assert.equal(result.costUsd, null)
  assert.equal(result.reviews.length, HIDEOUT.reviews.length)
})

test('a poll that outlives its budget is a retryable TIMEOUT, never a settled failure', async () => {
  const fake = fakeMonid({
    run: { runId: 'run-3', status: 'RUNNING' },
    polls: Array.from({ length: 100 }, () => ({ runId: 'run-3', status: 'RUNNING' }))
  })
  await assert.rejects(call(fake), (error) => error.code === 'TIMEOUT' && monidRetryable(error))
  // 60 s budget at 1.5 s a poll: a bounded number of requests.
  assert.ok(fake.seen.length <= 41, String(fake.seen.length))
})

test('HTTP and application failures map to codes; only a timeout, 429 and 5xx are retried', async () => {
  const status = (code) => fakeMonid({ run: new Response('{"error":{"code":"x"}}', { status: code }) })
  for (const [http, code, retry] of [
    [401, 'HTTP_401', false],
    [402, 'HTTP_402', false],
    [403, 'HTTP_403', false],
    [429, 'HTTP_429', true],
    [500, 'PROVIDER_ERROR', true],
    [503, 'PROVIDER_ERROR', true],
    [404, 'APPLICATION_ERROR', false]
  ])
    await assert.rejects(call(status(http)), (e) => e.code === code && monidRetryable(e) === retry, `${http}`)
  await assert.rejects(call(fakeMonid({ run: { error: { code: 'BAD', message: 'no' } } })), {
    code: 'APPLICATION_ERROR'
  })
  await assert.rejects(
    call(fakeMonid({ run: { runId: 'r', status: 'RUNNING' }, polls: [{ runId: 'r', status: 'FAILED' }] })),
    { code: 'APPLICATION_ERROR' }
  )
  await assert.rejects(monidGoogleReviewsCall({ placeId: HIDEOUT_ID }, { key: '' }), {
    code: 'CREDENTIAL_MISSING'
  })
  await assert.rejects(monidGoogleReviewsCall({ placeId: 'bad id/..' }, { key: 'k' }), {
    code: 'INVALID_LOCATION'
  })
})

test('a wrong shape, another place, or a download link off monid.ai is refused before anything is kept', async () => {
  const done = (output) => fakeMonid({ run: { runId: 'r', status: 'COMPLETED', output } })
  await assert.rejects(call(done({ ...OISHII, reviews: 'nope' }), OISHII_ID), { code: 'INVALID_RESPONSE' })
  await assert.rejects(call(done({ ...OISHII, place_info: null }), OISHII_ID), { code: 'INVALID_RESPONSE' })
  await assert.rejects(call(done(OISHII), HIDEOUT_ID), { code: 'INVALID_RESPONSE' })
  await assert.rejects(call(fakeMonid({ run: { status: 'COMPLETED', output: OISHII } }), OISHII_ID), {
    code: 'INVALID_RESPONSE'
  })
  for (const link of [
    'http://sfs.monid.ai/x',
    'https://user:pw@sfs.monid.ai/x',
    'https://127.0.0.1/x',
    'https://localhost/x',
    'https://evil.test/x',
    'https://monid.ai.evil.test/x',
    'https://sfs.monid.ai:8443/x'
  ]) {
    assert.equal(monidDownloadUrl(link), null, link)
    const fake = done({ data: { download_link: link } })
    await assert.rejects(call(fake), { code: 'INVALID_RESPONSE' }, link)
    assert.equal(fake.seen.length, 1, `${link} was never fetched`)
  }
})

test('normalized reviews carry the Maps shape, provenance, owner replies, sub-scores and photos', () => {
  const reviews = normalizeMonidReviews(HIDEOUT.reviews, HIDEOUT_ID, {
    fetchedAt: '2026-10-29T10:00:00.000Z'
  })
  const raw = HIDEOUT.reviews[0]
  const first = reviews[0]
  assert.deepEqual(Object.keys(first).sort(), [
    'attribution',
    'author',
    'authorAvatarUrl',
    'authorUrl',
    'contributorId',
    'date',
    'fetchedAt',
    'googlePlaceId',
    'googleReviewId',
    'id',
    'ownerResponse',
    'photos',
    'provider',
    'rating',
    'route',
    'source',
    'subratings',
    'text',
    'url'
  ])
  assert.equal(first.source, 'google-maps')
  assert.equal(first.attribution, 'Google')
  assert.equal(first.googleReviewId, raw.review_id)
  assert.equal(first.text, raw.extracted_snippet.original)
  assert.equal(first.url, raw.link)
  assert.equal(first.authorUrl, `https://www.google.com/maps/contrib/${raw.user.contributor_id}`)
  assert.equal(first.date, raw.iso_date)
  assert.deepEqual(first.ownerResponse, { text: raw.response.snippet, date: raw.response.iso_date })
  assert.deepEqual(first.subratings, raw.subratings)
  assert.equal(first.photos.length, raw.images.length)
  assert.ok(first.photos.every((p) => p.reviewId === first.id && p.sourceUrl === first.url))
  const plain = reviews.find((r) => !r.ownerResponse)
  assert.ok(plain, 'a review without an owner reply keeps ownerResponse null')
  // Only Google's own image hosts become photos; a review with no text, author or link is left out.
  const odd = normalizeMonidReviews(
    [
      { ...raw, images: ['https://evil.test/a.jpg'] },
      { ...raw, review_id: 'otherReviewId1', snippet: ' ', extracted_snippet: { original: '' } },
      { ...raw, review_id: 'otherReviewId2', link: undefined },
      { ...raw, review_id: 'otherReviewId3', user: { name: '' } },
      { ...raw, review_id: 'otherReviewId4', snippet: 'x'.repeat(10_001), extracted_snippet: null }
    ],
    HIDEOUT_ID
  )
  assert.equal(odd.length, 1)
  assert.deepEqual(odd[0].photos, [])
  // The same review twice in one answer is kept once.
  assert.equal(normalizeMonidReviews([raw, raw], HIDEOUT_ID).length, 1)
})

test('a Google review id is read off both link shapes: Monid’s and Place Details’', () => {
  const id = HIDEOUT.reviews[0].review_id
  assert.equal(
    googleReviewIdOf(
      `https://www.google.com/maps/reviews/data=!4m8!14m7!1m6!2m5!1s${id}!2m1!1s0x0:0x8974196ab8161854!3m1!1s2@1:x%7C%7C?hl=en`
    ),
    id
  )
  assert.equal(
    googleReviewIdOf(
      `https://www.google.com/maps/reviews/data=!4m6!14m5!1m4!2m3!1s${id}!2m1!1s0x3e5f6526b3102cb7:0x8974196ab8161854`
    ),
    id
  )
  assert.equal(googleReviewIdOf('https://www.google.com/maps/place/x'), null)
})

test('dedupe: by Google review id or link first, then contributor + exact words; a shared name alone is kept', () => {
  const [a, b, c, d] = normalizeMonidReviews(HIDEOUT.reviews, HIDEOUT_ID)
  const placesLink = `https://www.google.com/maps/reviews/data=!4m6!14m5!1m4!2m3!1s${a.googleReviewId}!2m1!1s0x3e5f:0x89`
  const held = [
    // Place Details: same review, a different link shape.
    { author: a.author, text: 'edited since', googleMapsUri: placesLink, authorUri: 'x' },
    // SerpApi: the same link.
    { author: 'Someone', text: 'other words', url: b.url },
    // Same contributor, same words, no id or link.
    {
      author: 'Renamed',
      text: c.text,
      authorUri: `https://www.google.com/maps/contrib/${c.contributorId}/reviews`
    },
    // Same author NAME as d, different words and no shared contributor: not proof of a duplicate.
    { author: d.author, text: 'Completely different words.' }
  ]
  const kept = monidSupplement([a, b, c, d], held)
  assert.deepEqual(
    kept.map((r) => r.id),
    [d.id]
  )
})

test('merge: held SerpApi reviews stay first and untouched; a refresh replaces the old Monid set whole', () => {
  const [a, b, c] = normalizeMonidReviews(HIDEOUT.reviews, HIDEOUT_ID)
  const serp = {
    id: 'serp1',
    provider: 'serpapi',
    author: 'Lan',
    text: 'SerpApi words',
    url: 'https://www.google.com/maps/reviews/data=serp1'
  }
  const first = withMonidReviews([serp], [a, b], [])
  assert.deepEqual(
    first.map((r) => r.id),
    ['serp1', a.id, b.id]
  )
  // Next fetch returns only c: a and b leave, the SerpApi review stays.
  const second = withMonidReviews(first, [c], [])
  assert.deepEqual(
    second.map((r) => r.id),
    ['serp1', c.id]
  )
  // A Place Details review that is the same as c drops c.
  assert.deepEqual(
    withMonidReviews(first, [c], [{ googleMapsUri: c.url, text: c.text, author: c.author }]).map((r) => r.id),
    ['serp1']
  )
  assert.equal(second.filter((r) => r.provider === 'monid').length, 1, 'provenance is queryable by provider')
})

test('off by default: Monid is in the catalogue but not in the default order; a declared order turns it on', () => {
  assert.deepEqual(defaultOrderOf('google-reviews'), ['google-places', 'serpapi-google-maps'])
  assert.equal(resolveOrder({}, 'google-reviews').order.includes('monid-google-reviews'), false)
  const declared = parseProviderOrder({
    'google-reviews': ['google-places', 'serpapi-google-maps', 'monid-google-reviews']
  })
  assert.equal(declared.ok, true)
  const settings = { providerOrder: declared.order }
  assert.equal(monidReviewsOn({ keys: { monid: 'k' }, settings: {} }), false, 'undeclared: off')
  assert.equal(monidReviewsOn({ keys: {}, settings }), false, 'no key: skipped')
  assert.equal(monidReviewsOn({ keys: { monid: 'k' }, settings }), true)
  assert.equal(
    monidReviewsOn({
      keys: { monid: 'k' },
      settings: { providerOrder: { 'google-reviews': ['google-places'] } }
    }),
    false
  )
})

test('cost: a Monid call is reserved at a one-cent ceiling and counted under Google reviews', () => {
  assert.equal(ceilingCents('monid', 'google-reviews'), 1)
  assert.deepEqual(capabilityOfCharge('monid', 'google-reviews'), {
    group: 'google-reviews',
    provider: 'monid-google-reviews'
  })
})

test('the last try reads as a source row: due when never tried, fresh for 30 days, a failure waits a day', () => {
  const now = Date.parse('2026-10-29T10:00:00Z')
  const day = 86_400_000
  assert.equal(sourceDue(monidAttemptOf(null), now), true)
  const fetched = new Date(now - day).toISOString()
  assert.equal(
    sourceDue(monidAttemptOf({ collected: { monid: { attemptedAt: fetched, fetchedAt: fetched } } }), now),
    false
  )
  const old = new Date(now - 31 * day).toISOString()
  assert.equal(
    sourceDue(monidAttemptOf({ collected: { monid: { attemptedAt: old, fetchedAt: old } } }), now),
    true
  )
  const failed = {
    collected: {
      monid: { attemptedAt: new Date(now - 3600_000).toISOString(), lastError: { reason: 'HTTP_401' } }
    }
  }
  assert.equal(sourceDue(monidAttemptOf(failed), now), false)
  assert.equal(sourceDue(monidAttemptOf(failed), now + day), true)
})

test('size: 100 normalized reviews stay within what the full answers measured', () => {
  // Measured 29/10/2026 on four full answers: 223–383 KB of JSON (89–171 KB pg_column_size), ~500 characters of
  // text and up to 5.4 photos a review. Stretch the fixture to that and hold the line above it.
  const base = normalizeMonidReviews(HIDEOUT.reviews, HIDEOUT_ID, { fetchedAt: '2026-10-29T10:00:00.000Z' })
  const many = Array.from({ length: 100 }, (_, i) => {
    const review = base[i % base.length]
    const photo = review.photos[0] ?? {
      url: 'https://lh3.googleusercontent.com/x',
      reviewId: review.id,
      sourceUrl: review.url
    }
    return { ...review, id: `id${i}`, text: 'x'.repeat(500), photos: Array.from({ length: 6 }, () => photo) }
  })
  const bytes = Buffer.byteLength(JSON.stringify(many))
  assert.ok(bytes < 450_000, String(bytes))
})

test('Monid reviews stay fresh 90 days; the other sources keep their 30', async () => {
  const { MONID_MAX_AGE_MS } = await import('../src/google-maps-monid-research.js')
  const day = 86_400_000
  const now = Date.parse('2026-12-01T00:00:00Z')
  const row = (ageDays) => ({
    attempted_at: new Date(now - ageDays * day).toISOString(),
    collected_at: new Date(now - ageDays * day).toISOString(),
    last_error: null
  })
  assert.equal(sourceDue(row(60), now, null, { maxAgeMs: MONID_MAX_AGE_MS }), false)
  assert.equal(sourceDue(row(95), now, null, { maxAgeMs: MONID_MAX_AGE_MS }), true)
  assert.equal(sourceDue(row(60), now), true)
})

test('the brief quotes the 30 longest Monid reviews and caps their photo lines', async () => {
  const { renderBriefWithReviews } = await import('../src/review-sources.js')
  const monid = Array.from({ length: 100 }, (_, i) => ({
    id: `m${i}`,
    provider: 'monid',
    text: 'x'.repeat(10 + i),
    author: `A${i}`,
    url: `https://maps.example/r${i}`,
    photos: [{ url: `https://img.example/${i}.jpg`, sourceUrl: `https://maps.example/r${i}` }]
  }))
  const held = { id: 'g1', provider: 'serpapi', text: 'held', author: 'H', url: 'https://maps.example/g1' }
  const domain = { renderBriefMarkdown: () => '# brief' }
  const out = renderBriefWithReviews(domain, {
    reviewSources: { googleMaps: { placeId: 'p', url: 'https://maps.example/p', reviews: [held, ...monid] } }
  })
  assert.equal((out.match(/on Google;/g) ?? []).length, 31)
  assert.ok(out.includes('"held"'))
  assert.ok(out.includes('x'.repeat(109)))
  assert.ok(!out.includes(`"${'x'.repeat(10)}"`))
  assert.equal((out.match(/Attached review photo/g) ?? []).length, 30)
})
