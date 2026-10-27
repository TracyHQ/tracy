/**
 * Reading an opportunity for the screen: profile fields keep their sources and stale/conflict notes,
 * colours are only hex values the server sent, and the template picker offers only templates built
 * for the CMS the brief will use.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  brandColors,
  brandObservation,
  buildFailure,
  googlePlaceView,
  mediaRowView,
  mediaTile,
  pageSpeedView,
  profileFields,
  shownBuildId,
  socialStatsLines,
  suggestedLabelOf,
  tripadvisorListingView
} from '../src/client/detail-model.ts'
import { en as EN_STRINGS } from '../src/client/strings.ts'

test('profile fields come in a fixed order, plain or with their sources', () => {
  const rows = profileFields({
    phone: { value: '+84 235 123', sources: ['website', 'facebook'] },
    name: 'Pho Hoa',
    hours: { value: '7–22', sources: ['facebook'], stale: { seenAt: '2025-01-02' } },
    address: { value: '1 Tran Phu', sources: ['website'], conflict: true },
    ignored: 'x'
  })
  assert.deepEqual(
    rows.map((r) => r.field),
    ['name', 'address', 'phone', 'hours']
  )
  assert.deepEqual(rows[0], {
    field: 'name',
    value: 'Pho Hoa',
    sources: [],
    staleSince: null,
    conflict: false
  })
  assert.deepEqual(rows[2].sources, ['website', 'facebook'])
  assert.equal(rows[3].staleSince, '2025-01-02')
  assert.equal(rows[1].conflict, true)
})

test('empty or missing values are left out, never invented', () => {
  assert.deepEqual(profileFields({ name: '', phone: { value: null } }), [])
  assert.deepEqual(profileFields(null), [])
})

test('only hex colours are drawn', () => {
  assert.deepEqual(
    brandColors({ colors: [{ hex: '#C2532F', role: 'primary' }, { hex: 'red' }, { hex: '#abc' }, null] }),
    [
      { hex: '#c2532f', role: 'primary' },
      { hex: '#abc', role: null }
    ]
  )
  assert.deepEqual(brandColors(undefined), [])
})

// The detail door's real profile: flat fields, `evidence[field]` per value, `conflicts` naming fields.
const SERVER_PROFILE = {
  name: 'Pho Hoa',
  bio: null,
  phone: '+84 235 123',
  address: '1 Tran Phu',
  socials: { facebook: 'https://facebook.com/phohoa' },
  branch: 'Old Town',
  evidence: {
    name: [{ value: 'Pho Hoa', sources: ['google-maps', 'website'] }],
    bio: [],
    phone: [{ value: '+84 235 123', sources: ['facebook'] }],
    address: [
      { value: '1 Tran Phu', sources: ['google-maps'] },
      { value: '3 Le Loi', sources: ['facebook'] }
    ]
  },
  conflicts: ['address'],
  brand: { website: null, social: null, engine: { status: 'not_integrated' } }
}

test('the server profile keeps each value’s sources and marks the fields its sources disagree on', () => {
  const rows = profileFields(SERVER_PROFILE)
  assert.deepEqual(
    rows.map((r) => r.field),
    ['name', 'branch', 'address', 'phone']
  )
  assert.deepEqual(rows[0].sources, ['google-maps', 'website'])
  assert.equal(rows[1].value, 'Old Town')
  assert.deepEqual(rows[2], {
    field: 'address',
    value: '1 Tran Phu',
    sources: ['google-maps'],
    staleSince: null,
    conflict: true
  })
  assert.equal(rows[3].conflict, false)
  assert.deepEqual(rows[3].sources, ['facebook'])
})

test('colours come from the website observation first, else the social one, and say they are observed', () => {
  const website = { origin: 'website', official: false, colors: [{ hex: '#C2532F', role: 'primary' }] }
  const social = { origin: 'social', official: false, colors: [{ hex: '#112233', role: 'accent' }] }
  const engine = { status: 'not_integrated', reason: 'runs in a site workspace only' }
  assert.deepEqual(brandObservation({ website, social, engine }), {
    origin: 'website',
    colors: [{ hex: '#c2532f', role: 'primary' }],
    observedOnly: true
  })
  assert.equal(brandObservation({ website: null, social, engine }).origin, 'social')
  assert.equal(brandObservation({ website: null, social: null, engine }), null)
  assert.equal(brandObservation(null), null)
})

test('a stored photo is drawn; one kept only as a link points to its source, with its reason', () => {
  assert.deepEqual(
    mediaTile({
      id: 'm1',
      kind: 'image',
      category: 'food',
      status: 'stored',
      sourceUrl: 'https://x.vn/a.jpg'
    }),
    {
      id: 'm1',
      kind: 'image',
      category: 'food',
      stored: true,
      sourceUrl: 'https://x.vn/a.jpg',
      reasonKey: null,
      source: null,
      credit: null,
      width: null,
      height: null,
      hidden: null
    }
  )
  const ref = mediaTile({
    id: 'm2',
    kind: 'video',
    category: 'weird',
    status: 'reference',
    reason: 'too_large',
    sourceUrl: 'https://x.vn/v.mp4'
  })
  assert.equal(ref.stored, false)
  assert.equal(ref.category, 'other')
  assert.equal(ref.reasonKey, 'media.reason.too_large')
  // A source address that is not http(s) is never a link.
  assert.equal(
    mediaTile({ id: 'm3', kind: 'image', status: 'reference', reason: 'x', sourceUrl: 'javascript:1' })
      .sourceUrl,
    null
  )
  assert.equal(
    mediaTile({ id: 'm3', kind: 'image', status: 'reference', reason: 'x' }).reasonKey,
    'media.reason.other'
  )
  assert.equal(mediaTile({ kind: 'image' }), null)
})

test('sources, maps and chat apps are named by their own product names; a pasted link by a word', async () => {
  const { sourceLabel } = await import('../src/client/cms-label.ts')
  const t = (key) => `<${key}>`
  assert.deepEqual(
    ['website', 'url', 'google-maps', 'osm', 'tiktok', 'zalo', 'whatsapp', 'line', 'unknown'].map((s) =>
      sourceLabel(t, s)
    ),
    [
      '<source.website>',
      '<source.link>',
      'Google Maps',
      'OpenStreetMap',
      'TikTok',
      'Zalo',
      'WhatsApp',
      'LINE',
      'unknown'
    ]
  )
})

test('Google Place: amenities split into offered / not offered, booking yes/no/unknown, price as $, at most five reviews', () => {
  const view = googlePlaceView({
    placeId: 'ChIJ1',
    amenities: { servesCoffee: true, outdoorSeating: false, delivery: true, madeUp: true, liveMusic: 'yes' },
    reservable: false,
    priceLevel: 'PRICE_LEVEL_MODERATE',
    summaries: { editorial: 'Family pho since 1990', generative: '', reviews: 'Guests love the broth' },
    openingHours: ['Monday: 7:00 AM – 10:00 PM', ''],
    reviews: [
      { author: 'Lan', text: 'Best pho', rating: 5 },
      { author: 'Minh', text: 'Good' },
      { author: '', text: 'no author' },
      { author: 'C', text: 'c', rating: 4 },
      { author: 'D', text: 'd', rating: 4 },
      { author: 'E', text: 'e', rating: 3 },
      { author: 'F', text: 'f', rating: 2 }
    ],
    attribution: 'Google'
  })
  assert.deepEqual(view.offered, ['servesCoffee', 'delivery'])
  assert.deepEqual(view.notOffered, ['outdoorSeating'])
  assert.equal(view.reservable, false)
  assert.equal(view.price, '$$')
  assert.deepEqual(view.summaries, [
    { kind: 'editorial', text: 'Family pho since 1990' },
    { kind: 'reviews', text: 'Guests love the broth' }
  ])
  assert.deepEqual(view.openingHours, ['Monday: 7:00 AM – 10:00 PM'])
  assert.equal(view.reviews.length, 5)
  assert.deepEqual(view.reviews[0], {
    author: 'Lan',
    text: 'Best pho',
    rating: 5,
    authorUri: null,
    authorAvatarUrl: null
  })
  assert.deepEqual(view.reviews[1], {
    author: 'Minh',
    text: 'Good',
    rating: null,
    authorUri: null,
    authorAvatarUrl: null
  })
})

test('Google Place: booking unknown, free price kept as a word, nothing at all → no section', () => {
  const view = googlePlaceView({ placeId: 'x', amenities: { dineIn: true }, priceLevel: 'PRICE_LEVEL_FREE' })
  assert.equal(view.reservable, null)
  assert.equal(view.price, 'free')
  assert.equal(googlePlaceView({ placeId: 'x', amenities: {}, summaries: {}, reviews: [] }), null)
  assert.equal(googlePlaceView(null), null)
  assert.equal(googlePlaceView('nope'), null)
})

test('Current website (mobile): scores 0–100, LCP in seconds, unknowns stay null; no measurement date → no section', () => {
  assert.deepEqual(
    pageSpeedView({
      performance: 38,
      seo: 91,
      lcpMs: 4210,
      https: true,
      mobileFriendly: null,
      checkedAt: '2026-10-18T10:00:00Z'
    }),
    {
      performance: 38,
      seo: 91,
      lcpSeconds: 4.2,
      https: true,
      mobileFriendly: null,
      checkedAt: '2026-10-18T10:00:00Z'
    }
  )
  assert.deepEqual(pageSpeedView({ performance: 140, seo: null, https: 'yes', checkedAt: '2026-10-18' }), {
    performance: null,
    seo: null,
    lcpSeconds: null,
    https: null,
    mobileFriendly: null,
    checkedAt: '2026-10-18'
  })
  assert.equal(pageSpeedView({ performance: 50 }), null)
  assert.equal(pageSpeedView(undefined), null)
})

test('the Social section lists only pages the profile carries numbers for, in network order', () => {
  const now = Date.parse('2026-10-19T00:00:00Z')
  const lines = socialStatsLines(
    {
      socialStats: {
        instagram: {
          url: 'https://instagram.com/bep',
          followers: 1200,
          postsPerMonth: 4,
          coverage: 'complete'
        },
        facebook: {
          url: 'https://facebook.com/bep',
          followers: 8200,
          lastPostAt: '2026-10-09T00:00:00Z',
          stale: true
        },
        tiktok: { url: 'https://tiktok.com/@bep', status: 'not_found' },
        youtube: { followers: 5 },
        x: { url: 'https://x.com/bep', followers: 1 }
      }
    },
    now
  )
  assert.deepEqual(
    lines.map((l) => [l.network, l.followers, l.days, l.perMonth, l.stale]),
    [
      ['facebook', 8200, 10, null, true],
      ['instagram', 1200, null, 4, false]
    ]
  )
  assert.deepEqual(socialStatsLines({}, now), [], 'nothing stored yet: no section')
  assert.deepEqual(socialStatsLines(null, now), [])
})

test("the Build form is filled with the server's suggested site name, or left empty", () => {
  assert.equal(suggestedLabelOf({ suggestedLabel: 'pho-ba-2' }), 'pho-ba-2')
  assert.equal(suggestedLabelOf({ suggestedLabel: null }), '')
  assert.equal(suggestedLabelOf({ suggestedLabel: 42 }), '')
  assert.equal(suggestedLabelOf(null), '')
})

test('the revision page shows its live build, else its latest one, else none', () => {
  const builds = [
    { id: 'b3', state: 'failed' },
    { id: 'b2', state: 'provisioning' },
    { id: 'b1', state: 'refused' }
  ]
  assert.equal(shownBuildId(builds), 'b2', 'the one build that is not refused or failed')
  assert.equal(
    shownBuildId([
      { id: 'b3', state: 'failed' },
      { id: 'b1', state: 'refused' }
    ]),
    'b3'
  )
  assert.equal(shownBuildId([]), null)
  assert.equal(shownBuildId(undefined), null)
})

test('a failed build is retried through the demo action that made it, and says the host’s reason', () => {
  const failed = {
    build: {
      state: 'failed',
      requestId: 'req-1',
      receipt: {
        status: 201,
        demoActionId: 'action-1',
        failure: { code: 'PROVISION_FAILED', reason: '!! the restored WordPress never answered' }
      }
    }
  }
  assert.deepEqual(buildFailure(failed), {
    requestId: 'req-1',
    actionId: 'action-1',
    code: 'PROVISION_FAILED',
    reason: '!! the restored WordPress never answered'
  })
  assert.deepEqual(
    buildFailure({
      build: { state: 'refused', requestId: 'req-2', receipt: { body: { code: 'LABEL_TAKEN' } } }
    }),
    {
      requestId: 'req-2',
      actionId: null,
      code: 'LABEL_TAKEN',
      reason: null
    }
  )
  assert.equal(buildFailure({ build: { state: 'provisioning', requestId: 'req-3' } }), null)
  assert.equal(buildFailure({ build: { state: 'failed' } }), null, 'no request id: nothing to retry with')
})

test('demoRows: every demo newest first, numbered by age, with its CMS, template, state and the brief it came from', async () => {
  const { demoRows } = await import('../src/client/detail-model.ts')
  const rows = demoRows(
    [
      {
        id: 'b2',
        revisionId: 'r1',
        cms: 'emdash',
        template: { design: 'tracy-base', label: 'Tracy Base' },
        state: 'done',
        siteKey: 'two.test',
        createdAt: '2026-10-24T08:00:00Z'
      },
      {
        id: 'b1',
        revisionId: 'r1',
        cms: 'wordpress',
        template: { design: 'tracy-business' },
        state: 'deleted',
        siteKey: 'one.test',
        createdAt: '2026-10-22T08:00:00Z'
      },
      {
        id: 'b3',
        revisionId: 'r2',
        cms: 'joomla',
        template: null,
        state: 'failed',
        siteKey: null,
        createdAt: '2026-10-24T09:00:00Z'
      },
      { revisionId: 'r1' }
    ],
    [
      { id: 'r1', n: 1 },
      { id: 'r2', n: 2 }
    ]
  )
  assert.deepEqual(
    rows.map((r) => [r.id, r.n, r.cms, r.template, r.phase, r.briefN, r.siteKey]),
    [
      ['b3', 3, 'joomla', null, 'failed', 2, null],
      ['b2', 2, 'emdash', 'Tracy Base', 'done', 1, 'two.test'],
      ['b1', 1, 'wordpress', 'tracy-business', 'deleted', 1, 'one.test']
    ]
  )
  assert.deepEqual(demoRows(null, null), [])
})

test('briefStatus: the latest brief and whether the research still reads the same; nothing without a brief', async () => {
  const { briefStatus } = await import('../src/client/detail-model.ts')
  assert.deepEqual(briefStatus({ id: 'r2', n: 2, createdAt: '2026-10-24T08:00:00Z', current: false }), {
    id: 'r2',
    n: 2,
    createdAt: '2026-10-24T08:00:00Z',
    current: false
  })
  assert.equal(briefStatus({ id: 'r2', n: 2, current: true }).current, true)
  assert.equal(briefStatus({ id: 'r2', n: 2, current: null }).current, null, 'unknown stays unknown')
  assert.equal(briefStatus(null), null)
  assert.equal(briefStatus({ n: 2 }), null)
})

test('TripAdvisor Details keeps exact quotes with real author and source links, separate from Google', async () => {
  const { tripadvisorReviewView } = await import('../src/client/detail-model.ts')
  const raw = {
    id: '123',
    text: 'Wonderful pho with herbs.',
    author: 'Lan',
    rating: 5,
    url: 'https://www.tripadvisor.com/ShowUserReviews-d456-r123.html',
    authorUrl: 'https://www.tripadvisor.com/Profile/Lan'
  }
  assert.deepEqual(tripadvisorReviewView({ googlePlace: { reviews: [raw] } }), [])
  assert.deepEqual(
    tripadvisorReviewView({
      reviewSources: { tripadvisor: { reviews: [raw] } }
    }),
    [{ ...raw, authorAvatarUrl: null, photos: [] }]
  )
  for (const review of [
    { ...raw, url: 'javascript:alert(1)' },
    { ...raw, url: 'https://tripadvisor.com.evil.example/review' },
    { ...raw, author: '' },
    { ...raw, text: '' }
  ])
    assert.deepEqual(
      tripadvisorReviewView({
        reviewSources: { tripadvisor: { reviews: [review] } }
      }),
      []
    )
})

test('optional TripAdvisor quota and provider failures leave no empty or technical customer section', async () => {
  const { tripadvisorReviewView } = await import('../src/client/detail-model.ts')
  for (const profile of [
    null,
    {},
    { reviewSources: {} },
    {
      reviewSources: {
        tripadvisor: { status: 'failed', reason: 'HTTP_402', reviews: [] }
      }
    }
  ])
    assert.deepEqual(tripadvisorReviewView(profile), [])
  const raw = {
    id: '123',
    text: 'Our previous visit was lovely.',
    author: 'Lan',
    rating: null,
    url: 'https://www.tripadvisor.com/Restaurant_Review-d456.html',
    authorUrl: null
  }
  assert.deepEqual(
    tripadvisorReviewView({
      reviewSources: {
        tripadvisor: { reviews: [raw], lastError: { reason: 'HTTP_429' } }
      }
    }),
    [{ ...raw, authorAvatarUrl: null, photos: [] }]
  )
})

test('TripAdvisor review photos stay attached to their own quotation and prefer stored media; avatars stay separate', async () => {
  const { tripadvisorReviewView } = await import('../src/client/detail-model.ts')
  const url = 'https://www.tripadvisor.com/ShowUserReviews-d456-r123.html'
  const photo = 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/test.jpg'
  const avatar = 'https://media-cdn.tripadvisor.com/media/photo-o/avatar.jpg'
  const raw = {
    id: '123',
    text: 'A quiet terrace.',
    author: 'Lan',
    url,
    authorAvatarUrl: avatar,
    photos: [
      { url: photo, reviewId: '123', sourceUrl: url },
      { url: photo, reviewId: 'other-review', sourceUrl: url },
      { url: 'javascript:alert(1)', reviewId: '123', sourceUrl: url },
      { url: 'https://media-cdn.tripadvisor.com.evil.example/test.jpg', reviewId: '123', sourceUrl: url }
    ]
  }
  const profile = { reviewSources: { tripadvisor: { reviews: [raw] } } }
  const [view] = tripadvisorReviewView(profile, [
    { id: 'stored-photo', sourceUrl: photo, kind: 'image', stored: true }
  ])
  assert.equal(view.authorAvatarUrl, avatar)
  assert.deepEqual(view.photos, [{ url: photo, mediaId: 'stored-photo' }])
  assert.deepEqual(tripadvisorReviewView(profile)[0].photos, [{ url: photo, mediaId: null }])
  raw.authorAvatarUrl = 'https://example.com/tracker'
  assert.equal(tripadvisorReviewView(profile)[0].authorAvatarUrl, null)
})

test('Google review keeps its contributor profile and avatar without accepting foreign or executable links', () => {
  const raw = {
    author: 'Lan',
    text: 'Good food',
    authorUri: 'https://www.google.com/maps/contrib/123',
    authorAvatarUrl: 'https://lh3.googleusercontent.com/a/avatar'
  }
  const [review] = googlePlaceView({ reviews: [raw] }).reviews
  assert.equal(review.authorUri, raw.authorUri)
  assert.equal(review.authorAvatarUrl, raw.authorAvatarUrl)
  const [unsafe] = googlePlaceView({
    reviews: [
      {
        ...raw,
        authorUri: 'javascript:alert(1)',
        authorAvatarUrl: 'https://googleusercontent.com.evil.example/avatar'
      }
    ]
  }).reviews
  assert.equal(unsafe.authorUri, null)
  assert.equal(unsafe.authorAvatarUrl, null)
})

test('TripAdvisor listing provenance stays distinct from the selected Google branch', () => {
  const source = {
    name: 'Green Mesa',
    address: 'Hor Al Anz, Dubai',
    url: 'https://www.tripadvisor.com/8739769',
    match: { scope: 'brand' }
  }
  assert.deepEqual(
    tripadvisorListingView({ name: 'Green Mesa - Karama', reviewSources: { tripadvisor: source } }),
    { name: source.name, address: source.address, url: source.url }
  )
  assert.equal(
    tripadvisorListingView({ reviewSources: { tripadvisor: { ...source, url: 'javascript:alert(1)' } } }),
    null
  )
  assert.equal(tripadvisorListingView({ name: 'Green Mesa - Karama' }), null)
})

const tile = (id, extra = {}) =>
  mediaTile({
    id,
    kind: 'image',
    category: 'food',
    status: 'stored',
    sourceUrl: `https://x.vn/${id}.jpg`,
    ...extra
  })

test('the Media row: a found logo says its source, size and how it was recognised', () => {
  const brand = {
    website: { origin: 'website', colors: [{ hex: '#7a2e1f', role: 'primary' }] },
    logoResearch: {
      status: 'found',
      chosen: {
        mediaId: 'L1',
        via: 'social-profile',
        source: 'instagram',
        width: 320,
        height: 320,
        recognised: 'vision',
        hasAlpha: false
      },
      candidates: [{ mediaId: 'L1' }, { mediaId: 'L2' }]
    }
  }
  const row = mediaRowView({ profile: { brand }, media: [tile('L1')], sources: [] })
  assert.deepEqual(row.logo, {
    state: 'found',
    mediaId: 'L1',
    viaKey: 'media.logo.from.social-profile',
    source: 'instagram',
    width: 320,
    height: 320,
    small: true,
    recognised: 'vision',
    transparent: false,
    candidates: 2
  })
  assert.equal(row.colors.state, 'found')
  assert.deepEqual(row.colors.colors, [{ hex: '#7a2e1f', role: 'primary' }])
})

test('the Media row: a logo searched for and not found is "none", one never searched for is "not collected"', () => {
  const none = mediaRowView({
    profile: {
      brand: {
        website: null,
        social: null,
        logoResearch: { status: 'none', chosen: null, candidates: [{ mediaId: 'a' }] }
      }
    },
    media: [],
    sources: []
  })
  assert.deepEqual(none.logo, { state: 'none', candidates: 1 })
  assert.equal(none.colors.state, 'none')
  const before = mediaRowView({
    profile: { brand: { website: { origin: 'website', colors: [] }, social: null } },
    media: [],
    sources: []
  })
  assert.deepEqual(before.logo, { state: 'notCollected' })
  const never = mediaRowView({ profile: {}, media: [], sources: [] })
  assert.equal(never.logo.state, 'notCollected')
  assert.equal(never.colors.state, 'notCollected')
  // A chosen picture that is no longer stored cannot be drawn: say none rather than a broken picture.
  const gone = mediaRowView({
    profile: {
      brand: {
        logoResearch: {
          status: 'found',
          chosen: { mediaId: 'gone', via: 'icon', source: 'website' },
          candidates: []
        }
      }
    },
    media: [],
    sources: []
  })
  assert.equal(gone.logo.state, 'none')
})

test('the Media row: photos group by purpose in a fixed order with source and credit, PDFs are files, videos hide unless found or failed', () => {
  const media = [
    tile('a', { category: 'space', source: 'website' }),
    tile('b', {
      category: 'food',
      source: 'google-maps',
      credit: { provider: 'Google', authors: [{ displayName: 'Minh' }] }
    }),
    tile('c', { category: 'menu', source: 'google-maps' }),
    tile('d', { category: 'food', source: 'instagram' }),
    mediaTile({
      id: 'v',
      kind: 'video',
      status: 'stored',
      sourceUrl: 'https://x.vn/v.mp4',
      source: 'instagram'
    })
  ]
  const profile = {
    menus: [
      { url: 'https://x.vn/menu.pdf', source: 'website' },
      { url: 'https://x.vn/menu', source: 'website' }
    ],
    menuReads: [{ url: 'https://x.vn/menu.pdf', kind: 'pdf', status: 'complete', items: 12 }]
  }
  const row = mediaRowView({ profile, media, sources: [] })
  assert.deepEqual(
    row.photos.groups.map((g) => [g.category, g.tiles.map((t) => t.id)]),
    [
      ['food', ['b', 'd']],
      ['space', ['a']],
      ['menu', ['c']]
    ]
  )
  assert.equal(row.photos.groups[0].tiles[0].credit, 'Google: Minh')
  assert.equal(row.photos.groups[0].tiles[0].source, 'google-maps')
  assert.deepEqual(row.files, [
    { url: 'https://x.vn/menu.pdf', name: 'menu.pdf', source: 'website', items: 12 }
  ])
  assert.equal(row.videos.state, 'found')
  assert.equal(row.videos.tiles.length, 1)
  const empty = mediaRowView({ profile: {}, media: [], sources: [] })
  assert.equal(empty.photos.state, 'none')
  assert.equal(empty.videos.state, 'hidden')
  const failed = mediaRowView({
    profile: {},
    media: [],
    sources: [
      { source: 'instagram', status: 'failed' },
      { source: 'tripadvisor', status: 'failed' }
    ]
  })
  assert.equal(failed.videos.state, 'notCollected')
  const ta = mediaRowView({ profile: {}, media: [], sources: [{ source: 'tripadvisor', status: 'failed' }] })
  assert.equal(ta.videos.state, 'hidden')
})

test('the Media row counts what was found, shows the photographs and keeps the hidden ones for "Show them"', () => {
  const media = [
    tile('a'),
    tile('b', { category: 'space' }),
    tile('i1', { hidden: 'social-icon', source: 'website' }),
    tile('m', { hidden: 'map', source: 'website' }),
    tile('x', { hidden: 'bogus' })
  ]
  const row = mediaRowView({ profile: {}, media, sources: [] })
  assert.equal(row.photos.found, 5)
  assert.equal(row.photos.shown, 3)
  assert.deepEqual(
    row.photos.hidden.map((t) => [t.id, t.hidden]),
    [
      ['i1', 'social-icon'],
      ['m', 'map']
    ]
  )
  assert.deepEqual(
    row.photos.groups.map((g) => g.category),
    ['food', 'space']
  )
  const allHidden = mediaRowView({ profile: {}, media: [tile('i1', { hidden: 'tiny' })], sources: [] })
  assert.equal(allHidden.photos.state, 'none')
  assert.equal(allHidden.photos.hidden.length, 1)
})

test('Google amenities any trade can have read as amenities: restroom, accessibility, parking and payment', () => {
  const ids = [
    'restroom',
    'goodForWatchingSports',
    'curbsidePickup',
    'wheelchairAccessibleEntrance',
    'wheelchairAccessibleParking',
    'wheelchairAccessibleRestroom',
    'wheelchairAccessibleSeating',
    'freeParkingLot',
    'paidParkingLot',
    'freeStreetParking',
    'paidStreetParking',
    'valetParking',
    'freeGarageParking',
    'paidGarageParking',
    'acceptsCreditCards',
    'acceptsDebitCards',
    'acceptsCashOnly',
    'acceptsNfc'
  ]
  const view = googlePlaceView({
    amenities: { ...Object.fromEntries(ids.map((id) => [id, true])), acceptsCashOnly: false }
  })
  assert.deepEqual(
    view.offered,
    ids.filter((id) => id !== 'acceptsCashOnly')
  )
  assert.deepEqual(view.notOffered, ['acceptsCashOnly'])
  for (const id of ids) assert.equal(typeof EN_STRINGS[`amenity.${id}`], 'string', id)
})
