import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assessProfile } from '../domain/fact-assessment.mjs'
import { neutralFor } from '../domain/neutral-copy.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { validatePlaceProfile } from '../domain/place-profile.mjs'
import { planSlotFill, provisionalAssessment } from '../domain/slot-fill.mjs'

// Google and Tripadvisor reviews, ratings and reviewer avatars may show on a demo, verbatim.
const AT = '2026-10-20T00:00:00.000Z'
const AVATAR = 'https://lh3.googleusercontent.com/a/guest'

function ratedPlace() {
  const doc = placeProfileFromResearch({
    identity: { namespace: 'google', externalId: 'rated', name: 'Rated Cafe' },
    madeAt: AT,
    profile: {
      name: 'Rated Cafe',
      googlePlace: { primaryType: 'cafe' },
      reviewSources: {
        googleMaps: {
          url: 'https://maps.google.com/?cid=1',
          rating: 4.6,
          reviewCount: 210,
          fetchedAt: AT,
          reviews: [
            {
              text: 'Best phin in town.',
              author: 'Lan',
              rating: 5,
              publishTime: AT,
              authorAvatarUrl: AVATAR
            },
            { text: 'Friendly staff.', author: 'Minh', publishTime: AT }
          ]
        },
        tripadvisor: { url: 'https://tripadvisor.test/r', rating: 4.5, reviewCount: 88, fetchedAt: AT }
      }
    },
    // The Tripadvisor rating read a second time, from its own collected page.
    sources: [
      {
        source: 'tripadvisor',
        ref: 'https://tripadvisor.test/r',
        status: 'complete',
        collected_at: AT,
        collected: { profile: { rating: 4.5 } }
      }
    ]
  })
  const checked = validatePlaceProfile(doc)
  assert.equal(checked.ok, true, JSON.stringify(checked.errors))
  return doc
}

const QUOTE_ROLES = ['quote.text', 'quote.author_name', 'quote.author_image', 'quote.rating_or_source']
function sidecar() {
  const groups = []
  const bindings = []
  for (const i of [0, 1]) {
    groups.push({ id: `quote.${i}`, entityKind: 'quote', allowedKinds: ['quote'], itemIndex: i })
    for (const role of QUOTE_ROLES)
      bindings.push({ slotKey: `${role}.${i}`, groupId: `quote.${i}`, role, mode: 'copy' })
  }
  for (const i of [0, 1, 2, 3, 4]) {
    groups.push({ id: `stat.${i}`, entityKind: 'stat_item', allowedKinds: ['stat_item'], itemIndex: i })
    bindings.push(
      { slotKey: `stat.value.${i}`, groupId: `stat.${i}`, role: 'stat.value', mode: 'verbatim' },
      { slotKey: `stat.context.${i}`, groupId: `stat.${i}`, role: 'stat.context', mode: 'copy' }
    )
  }
  return { schemaVersion: 'tracy-quickstart-slot-roles/v1', groups, bindings }
}
const byKey = (plan) => Object.fromEntries(plan.writes.map((w) => [w.slotKey, w]))

const paths = {
  provisional: (profile) => provisionalAssessment(profile),
  frozen: (profile) => assessProfile(profile, { origin: 'research', at: '2026-10-26T00:00:00.000Z' })
}

for (const [name, assess] of Object.entries(paths))
  test(`${name}: a Google review fills one testimonial card with its own text, author, avatar and stars`, () => {
    const profile = ratedPlace()
    const plan = planSlotFill({ slotRoles: sidecar(), profile, assessment: assess(profile), neutralFor })
    const w = byKey(plan)
    const lan = profile.quotes.find((q) => q.value.author === 'Lan')
    assert.equal(w['quote.text.0'].value, 'Best phin in town.')
    assert.equal(w['quote.author_name.0'].value, 'Lan')
    assert.deepEqual(w['quote.author_image.0'].value, { url: AVATAR })
    assert.equal(w['quote.rating_or_source.0'].value, '5/5 · Google')
    for (const role of QUOTE_ROLES) assert.equal(w[`${role}.0`].entityId, lan.id, role)
    // The second reviewer has no avatar: the card never borrows the first one's.
    assert.equal(w['quote.author_name.1'].value, 'Minh')
    assert.equal(w['quote.author_image.1'].state, 'empty')
    assert.equal(w['quote.rating_or_source.1'].value, 'Google')
  })

for (const [name, assess] of Object.entries(paths))
  test(`${name}: Google and Tripadvisor ratings and counts fill stat cards once each, named by their platform`, () => {
    const profile = ratedPlace()
    const plan = planSlotFill({ slotRoles: sidecar(), profile, assessment: assess(profile), neutralFor })
    const w = byKey(plan)
    const shown = [0, 1, 2, 3].map((i) => [w[`stat.value.${i}`].value, w[`stat.context.${i}`].value])
    // Profile order: the collected Tripadvisor page first, then each review source's figures.
    assert.deepEqual(shown, [
      ['4.5', 'Tripadvisor'],
      ['4.6', 'Google'],
      ['210', 'Google'],
      ['88', 'Tripadvisor']
    ])
    assert.equal(w['stat.value.4'].state, 'neutral', 'the Tripadvisor rating read twice is one statistic')
  })

for (const [name, assess] of Object.entries(paths))
  test(`${name}: a fact still restricted to its platform never reaches a slot, even when accepted by hand`, () => {
    const profile = ratedPlace()
    for (const f of [...profile.quotes, ...profile.claims.statistics]) f.value.restrictions = ['not-on-demo']
    for (const assessment of [assess(profile), assess(profile).map((a) => ({ ...a, status: 'accepted' }))]) {
      const w = byKey(planSlotFill({ slotRoles: sidecar(), profile, assessment, neutralFor }))
      assert.equal(w['quote.text.0'].state, 'empty')
      assert.equal(w['stat.value.0'].state, 'neutral')
      assert.equal(
        Object.values(w).some((x) => x.state === 'sourced'),
        false
      )
    }
  })

test('a sender passes a platform review on with its https page, never one it wrote itself', () => {
  const profile = ratedPlace()
  const review = profile.quotes.find((q) => q.value.author === 'Lan')
  const own = structuredClone(review)
  own.id = 'fact_own_testimonial'
  own.value = { kind: 'testimonial', text: 'We are the best.', restrictions: [] }
  profile.quotes.push(own)
  const unsourced = structuredClone(review)
  unsourced.id = 'fact_sender_review'
  profile.sources.push({ id: 'source_sender', kind: 'sender-statement' })
  profile.evidence.push({
    id: 'evidence_sender',
    sourceId: 'source_sender',
    locator: { kind: 'jsonPath', value: '$.x' },
    extraction: { method: 'test', version: '1' }
  })
  unsourced.evidenceRefs = ['evidence_sender']
  profile.quotes.push(unsourced)
  const status = Object.fromEntries(
    assessProfile(profile, { origin: 'sender', at: '2026-10-26T00:00:00.000Z' }).map((a) => [a.factId, a])
  )
  assert.equal(status[review.id].status, 'accepted')
  assert.deepEqual(status[review.id].reasonCodes, ['platform-cited'])
  assert.equal(status[own.id].status, 'withheld')
  assert.equal(status[unsourced.id].status, 'withheld')
  const rating = profile.claims.statistics.find((f) => f.value.label === 'rating')
  assert.equal(status[rating.id].status, 'accepted')
})

// Facebook, Instagram and TikTok follower and like counts show on a demo too.
function socialPlace({ rated = false } = {}) {
  const page = (source, ref, profile) => ({
    source,
    ref,
    status: 'complete',
    collected_at: AT,
    collected: { profile }
  })
  const doc = placeProfileFromResearch({
    identity: { namespace: 'google', externalId: 'social', name: 'Social Cafe' },
    madeAt: AT,
    profile: {
      name: 'Social Cafe',
      googlePlace: { primaryType: 'cafe' },
      ...(rated
        ? {
            reviewSources: {
              googleMaps: { url: 'https://maps.google.com/?cid=2', rating: 4.8, fetchedAt: AT }
            }
          }
        : {})
    },
    sources: [
      page('facebook', 'https://facebook.com/social', { likes: 3100, followers: 0 }),
      page('instagram', 'https://instagram.com/social', { followers: 12400 }),
      page('tiktok', 'https://tiktok.com/@social', { followers: 900 })
    ]
  })
  assert.equal(validatePlaceProfile(doc).ok, true)
  return doc
}
function statCards(n) {
  const groups = []
  const bindings = []
  for (let i = 0; i < n; i += 1) {
    groups.push({ id: `stat.${i}`, entityKind: 'stat_item', allowedKinds: ['stat_item'], itemIndex: i })
    bindings.push(
      { slotKey: `value.${i}`, groupId: `stat.${i}`, role: 'stat.value', mode: 'verbatim' },
      { slotKey: `label.${i}`, groupId: `stat.${i}`, role: 'stat.label', mode: 'copy' }
    )
  }
  return { schemaVersion: 'tracy-quickstart-slot-roles/v1', groups, bindings }
}
const shownStats = (plan, n) =>
  Array.from({ length: n }, (_, i) => {
    const w = byKey(plan)
    return [w[`value.${i}`].value, w[`label.${i}`].value, w[`label.${i}`].state]
  })

for (const [name, assess] of Object.entries(paths))
  test(`${name}: Instagram followers and Facebook likes fill stat cards with their number and platform label`, () => {
    const profile = socialPlace()
    const plan = planSlotFill({ slotRoles: statCards(3), profile, assessment: assess(profile), neutralFor })
    // Followers first, most first; a zero follower count is no figure.
    assert.deepEqual(shownStats(plan, 3), [
      ['12,400', 'Instagram followers', 'sourced'],
      ['900', 'TikTok followers', 'sourced'],
      ['3,100', 'Facebook likes', 'sourced']
    ])
    const ig = profile.claims.statistics.find((f) => f.value.amount === 12400)
    assert.deepEqual(byKey(plan)['label.0'].factRefs, [ig.id])
    assert.deepEqual(byKey(plan)['value.0'].factRefs, [ig.id])
    const vi = planSlotFill({
      slotRoles: statCards(1),
      profile,
      assessment: assess(profile),
      locale: 'vi',
      neutralFor
    })
    assert.deepEqual(shownStats(vi, 1), [['12.400', 'Người theo dõi trên Instagram', 'sourced']])
  })

test('a Google rating comes before any follower count', () => {
  const profile = socialPlace({ rated: true })
  const plan = planSlotFill({
    slotRoles: statCards(2),
    profile,
    assessment: provisionalAssessment(profile),
    neutralFor
  })
  assert.deepEqual(shownStats(plan, 2), [
    ['4.8', 'Google rating', 'sourced'],
    ['12,400', 'Instagram followers', 'sourced']
  ])
})

// The social-stats cache measures the place's own profiles; its latest count is the one a demo prints.
test('a social-stats measurement becomes the platform statistic, and a newer read replaces an older one', () => {
  const doc = placeProfileFromResearch({
    identity: { namespace: 'google', externalId: 'cached', name: 'Cached Cafe' },
    profile: { name: 'Cached Cafe', googlePlace: { primaryType: 'cafe' } },
    sources: [
      {
        source: 'instagram',
        ref: 'https://instagram.com/cached',
        status: 'complete',
        collected_at: '2026-01-01T00:00:00.000Z',
        collected: { profile: { followers: 9000 } }
      },
      {
        source: 'facebook',
        ref: 'https://facebook.com/cached',
        status: 'complete',
        collected_at: '2026-10-01T00:00:00.000Z',
        collected: { profile: { followers: 700 } }
      }
    ],
    socialStats: [
      {
        network: 'instagram',
        url: 'https://instagram.com/cached',
        followers: 12400,
        fetchedAt: '2026-10-20T00:00:00.000Z',
        provider: 'instagram/looter2'
      },
      {
        network: 'facebook',
        url: 'https://facebook.com/cached',
        followers: 650,
        fetchedAt: '2026-09-01T00:00:00.000Z',
        provider: 'facebook/scraper3'
      },
      {
        network: 'youtube',
        url: 'https://youtube.com/@cached',
        followers: 300,
        fetchedAt: '2026-10-20T00:00:00.000Z',
        provider: 'youtube/yt-api'
      }
    ]
  })
  assert.equal(validatePlaceProfile(doc).ok, true)
  assert.deepEqual(
    doc.claims.statistics.map((f) => [f.value.scope, f.value.label, f.value.amount, f.value.asOf]),
    [
      ['https://facebook.com/cached', 'followers', 700, '2026-10-01T00:00:00.000Z'],
      ['https://instagram.com/cached', 'followers', 12400, '2026-10-20T00:00:00.000Z'],
      ['https://youtube.com/@cached', 'subscribers', 300, '2026-10-20T00:00:00.000Z']
    ]
  )
  const ig = doc.claims.statistics.find((f) => f.value.amount === 12400)
  const evidence = doc.evidence.find((e) => e.id === ig.evidenceRefs[0])
  assert.deepEqual(evidence.extraction, { method: 'social-stats', version: 'instagram/looter2' })
  const plan = planSlotFill({
    slotRoles: statCards(3),
    profile: doc,
    assessment: provisionalAssessment(doc),
    neutralFor
  })
  assert.deepEqual(shownStats(plan, 3), [
    ['12,400', 'Instagram followers', 'sourced'],
    ['700', 'Facebook followers', 'sourced'],
    ['300', 'YouTube subscribers', 'sourced']
  ])
})

test('Tracy Base EmDash 0.5.6: each landing quote card is one review, its author and platform; the spare card and the team stay empty', async () => {
  const { readFileSync } = await import('node:fs')
  const slotRoles = JSON.parse(
    readFileSync(
      new URL('../../../cms/tracy-emdash-theme-base/contracts/0.5.6/slot-roles.json', import.meta.url),
      'utf8'
    )
  )
  const profile = ratedPlace()
  const plan = planSlotFill({ slotRoles, profile, assessment: provisionalAssessment(profile), neutralFor })
  const w = byKey(plan)
  const card = (i) =>
    ['quote', 'name', 'role'].map((sub) => w[`landing.landing.testimonials_quotes[${i}].${sub}`].value)
  assert.deepEqual(card(0), ['Best phin in town.', 'Lan', 'Google'])
  assert.deepEqual(card(1), ['Friendly staff.', 'Minh', 'Google'])
  const lan = profile.quotes.find((q) => q.value.author === 'Lan')
  for (const sub of ['quote', 'name', 'role'])
    assert.equal(w[`landing.landing.testimonials_quotes[0].${sub}`].entityId, lan.id, sub)
  assert.deepEqual(card(2), ['', '', ''], 'a third card with no review keeps its place, empty')
  // A guest is never shown as one of the business's people.
  for (const i of [0, 1, 2])
    assert.equal(w[`home.home.team_quotes[${i}].name`].state, 'empty', `team card ${i}`)
})

// A profile's post count from the social-stats cache is a figure too, after ratings, reviews, followers and likes.
test('a cached post count becomes "Instagram posts", printed after the follower and like counts, in each site language', () => {
  const doc = placeProfileFromResearch({
    identity: { namespace: 'google', externalId: 'posts', name: 'Posting Cafe' },
    profile: { name: 'Posting Cafe', googlePlace: { primaryType: 'cafe' } },
    sources: [
      {
        source: 'facebook',
        ref: 'https://facebook.com/posting',
        status: 'complete',
        collected_at: AT,
        collected: { profile: { likes: 3100 } }
      }
    ],
    socialStats: [
      {
        network: 'instagram',
        url: 'https://instagram.com/posting',
        followers: 12400,
        posts: 130,
        fetchedAt: AT,
        provider: 'instagram/apify'
      },
      // A profile measured with no follower count still has its posts.
      {
        network: 'tiktok',
        url: 'https://tiktok.com/@posting',
        followers: null,
        posts: 42,
        fetchedAt: AT,
        provider: 'tiktok/apify'
      }
    ]
  })
  assert.equal(validatePlaceProfile(doc).ok, true)
  const posts = doc.claims.statistics.find((f) => f.value.label === 'posts' && f.value.amount === 130)
  assert.ok(posts, 'the post count is a statistic of the profile')
  assert.equal(posts.value.scope, 'https://instagram.com/posting')
  const plan = planSlotFill({
    slotRoles: statCards(4),
    profile: doc,
    assessment: provisionalAssessment(doc),
    neutralFor
  })
  assert.deepEqual(shownStats(plan, 4), [
    ['12,400', 'Instagram followers', 'sourced'],
    ['3,100', 'Facebook likes', 'sourced'],
    ['130', 'Instagram posts', 'sourced'],
    ['42', 'TikTok posts', 'sourced']
  ])
  assert.deepEqual(byKey(plan)['label.2'].factRefs, [posts.id])
  const words = {
    vi: 'Bài đăng trên Instagram',
    de: 'Instagram-Beiträge',
    fr: 'Publications sur Instagram',
    ja: 'Instagramの投稿'
  }
  for (const [locale, label] of Object.entries(words)) {
    const one = planSlotFill({
      slotRoles: statCards(3),
      profile: doc,
      assessment: provisionalAssessment(doc),
      locale,
      neutralFor
    })
    assert.equal(byKey(one)['label.2'].value, label, locale)
  }
})
