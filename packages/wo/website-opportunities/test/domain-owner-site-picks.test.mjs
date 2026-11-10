// The owner's choices for the site itself (#537, `domain/owner-site-picks.mjs`), read where the brief reads them: the
// social links typed for the site, the team the owner added or changed, the photos, videos and reviews kept off, the
// bands switched off, and the owner's own uploads ranking as the business's own photos. A fictional place.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildBrief, validateBrief } from '../domain/brief.mjs'
import { readingCardOf } from '../domain/business-reading.mjs'
import {
  SOCIAL_NETWORKS,
  bandsOf,
  nextTeamEdits,
  profileWithReviewPicks,
  readSocialLink,
  readTeamEdit,
  reviewKeyOf,
  siteSocialsOf,
  withReviewKeys,
  withTeamEdits
} from '../domain/owner-site-picks.mjs'
import { assetOriginOf, publisherRankOf } from '../domain/pictures/asset-origin.mjs'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const g = HSC.profile.googlePlace
const PHOTO = '0f5e2a6c-1b7d-4c8e-9a3f-5d6e7f8a9b0c'
const READ_TEAM = [
  {
    id: 'te_coach1',
    label: 'Mira Holm',
    quote: 'Coach Mira Holm',
    source: { kind: 'bio', ref: 'bio' },
    reviewsOnly: false
  }
]
const reading = {
  method: 'model',
  services: [],
  audience: [],
  team: READ_TEAM,
  story: [],
  serviceAreas: [],
  facts: [],
  keyMessages: []
}
const briefWith = (candidate = {}, { media = HSC.media, businessReading } = {}) =>
  buildBrief({
    opportunity: { ...HSC.opportunity, candidate: { ...HSC.opportunity.candidate, ...candidate } },
    profile: { ...HSC.profile, ...(businessReading !== undefined ? { businessReading } : {}) },
    googlePlace: g,
    sources: [],
    media,
    posts: HSC.posts,
    brand: HSC.brand,
    madeAt: HSC.madeAt
  })
const ids = (brief) => new Set(brief.assets.map((a) => a.id))
const slotIds = (brief) => new Set(brief.sitemap.flatMap((p) => p.sections.flatMap((s) => s.assetIds ?? [])))

test('a social link is normalised per network, never judged by the research link rules', () => {
  assert.deepEqual(readSocialLink({ network: 'instagram', action: 'set', handle: '@harbour.sport' }), {
    network: 'instagram',
    url: 'https://www.instagram.com/harbour.sport'
  })
  assert.equal(
    readSocialLink({ network: 'x', action: 'set', url: 'https://twitter.com/harbour' }).url,
    'https://twitter.com/harbour'
  )
  assert.equal(
    readSocialLink({ network: 'telegram', action: 'set', handle: 'harbourclub' }).url,
    'https://t.me/harbourclub'
  )
  // A LinkedIn page is refused as a research source (`UNSUPPORTED_LINK`) but is a link the site shows.
  assert.equal(
    readSocialLink({
      network: 'linkedin',
      action: 'set',
      url: 'https://www.linkedin.com/company/harbour-sport'
    }).url,
    'https://www.linkedin.com/company/harbour-sport'
  )
  assert.deepEqual(readSocialLink({ network: 'whatsapp', action: 'set', number: '+971 50 123 4567' }), {
    network: 'whatsapp',
    url: 'https://wa.me/971501234567'
  })
  assert.equal(
    readSocialLink({ network: 'whatsapp', action: 'set', url: 'https://wa.me/971501234567' }).url,
    'https://wa.me/971501234567'
  )
  assert.deepEqual(
    readSocialLink({ network: 'other', action: 'set', url: 'https://linktr.example/hsc', label: 'Links' }),
    {
      network: 'other',
      url: 'https://linktr.example/hsc',
      label: 'Links'
    }
  )
  assert.equal(
    readSocialLink({ network: 'whatsapp', action: 'set', number: '050 123' }).error,
    'INVALID_PHONE'
  )
  assert.equal(
    readSocialLink({ network: 'facebook', action: 'set', url: 'https://example.com/page' }).error,
    'INVALID_URL'
  )
  assert.equal(readSocialLink({ network: 'linkedin', action: 'set', handle: 'harbour' }).error, 'INVALID_URL')
  assert.equal(
    readSocialLink({ network: 'facebook', action: 'set', url: 'ftp://facebook.com/x' }).error,
    'INVALID_URL'
  )
  assert.equal(
    readSocialLink({ network: 'other', action: 'set', url: 'https://a.example' }).error,
    'INVALID_LABEL'
  )
  assert.equal(
    readSocialLink({ network: 'website', action: 'set', url: 'https://a.example' }).error,
    'INVALID_NETWORK'
  )
  assert.equal(readSocialLink({ network: 'facebook', action: 'add' }).error, 'INVALID_ACTION')
  assert.deepEqual(readSocialLink({ network: 'facebook', action: 'remove' }), {
    network: 'facebook',
    remove: true
  })
  assert.ok(SOCIAL_NETWORKS.every((n) => n.id && n.label && n.placeholder))
})

test('the brief shows the owner links with a label for every preset network, and a socials fact off keeps research links off', () => {
  const siteSocials = {
    linkedin: { url: 'https://www.linkedin.com/company/harbour-sport', at: 'x' },
    whatsapp: { url: 'https://wa.me/971501234567', at: 'x' },
    other: { url: 'https://linktr.example/hsc', label: 'Links', at: 'x' }
  }
  const on = briefWith({ siteSocials })
  assert.deepEqual(validateBrief(on), { ok: true, errors: [] })
  assert.equal(on.business.socials.instagram, 'https://www.instagram.com/harbour.sportclub/')
  assert.equal(on.business.socials.linkedin, 'https://www.linkedin.com/company/harbour-sport')
  assert.equal(on.business.socials.whatsapp, 'https://wa.me/971501234567')
  assert.deepEqual(on.business.socialLabels, { other: 'Links' })
  assert.ok(on.integrations.some((i) => i.kind === 'social' && i.url.includes('linkedin.com')))
  assert.ok(on.integrations.some((i) => i.kind === 'social' && i.url.includes('linktr.example')))
  // The owner's off on the researched Instagram link: it leaves the brief (#537 R16 fix).
  const fact = on.facts.find((f) => f.field === 'socials')
  assert.ok(fact, 'the fixture states its Instagram link as a fact')
  const off = briefWith({ siteSocials, factOverrides: { [fact.id]: { onSite: false, at: 'x' } } })
  assert.equal(off.business.socials.instagram, undefined)
  assert.equal(off.business.socials.linkedin, 'https://www.linkedin.com/company/harbour-sport')
  // The Socials band off: no link at all.
  const band = briefWith({ siteSocials, factOverrides: { band_socials: { onSite: false, at: 'x' } } })
  assert.deepEqual(band.business.socials, {})
  assert.ok(!band.integrations.some((i) => i.kind === 'social'))
  assert.deepEqual(siteSocialsOf({ x: { url: 'nope' }, threads: { url: 'https://www.threads.net/@a' } }), {
    threads: 'https://www.threads.net/@a'
  })
})

test('team edits: an added person with a photo, a renamed researched person keeping their fact, and remove', () => {
  assert.equal(readTeamEdit({ action: 'add' }).error, 'INVALID_LABEL')
  assert.equal(readTeamEdit({ action: 'add', label: 'x'.repeat(81) }).error, 'INVALID_LABEL')
  assert.equal(readTeamEdit({ action: 'add', label: 'Ana', role: 'r'.repeat(61) }).error, 'INVALID_ROLE')
  assert.equal(readTeamEdit({ action: 'add', label: 'Ana', photoMediaId: 'nope' }).error, 'INVALID_PHOTO')
  assert.equal(readTeamEdit({ action: 'update', id: 'te_coach1' }).error, 'INVALID_ACTION')
  assert.equal(readTeamEdit({ action: 'remove', id: 'Bad id' }).error, 'INVALID_MEMBER')
  const add = nextTeamEdits(
    null,
    readTeamEdit({ action: 'add', label: 'Ana Ruiz', role: 'Front desk', photoMediaId: PHOTO }),
    {
      newId: 'te_own1'
    }
  )
  const renamed = nextTeamEdits(
    add.teamEdits,
    readTeamEdit({ action: 'update', id: 'te_coach1', label: 'Mira H.', role: 'Head coach' }),
    {
      researchIds: ['te_coach1']
    }
  )
  assert.equal(
    nextTeamEdits(renamed.teamEdits, { action: 'update', id: 'te_nobody', label: 'x' }).error,
    'MEMBER_NOT_FOUND'
  )
  const edits = renamed.teamEdits
  const merged = withTeamEdits(reading, edits)
  assert.deepEqual(
    merged.team.map((p) => [p.id, p.label, p.role ?? null, p.owner === true]),
    [
      ['te_coach1', 'Mira H.', 'Head coach', false],
      ['te_own1', 'Ana Ruiz', 'Front desk', true]
    ]
  )
  const card = readingCardOf(merged, null)
  assert.equal(card.team[1].owner, true)
  assert.equal(card.team[1].photoMediaId, PHOTO)
  // No reading yet, an added person: a reading of the owner's own.
  assert.equal(withTeamEdits(null, add.teamEdits).method, 'owner')
  // The brief: the added person shows with their photo, an asset of the brief; the renamed one by the new name.
  const media = [
    ...HSC.media,
    {
      id: PHOTO,
      kind: 'image',
      category: 'people',
      sha256: 'f'.repeat(64),
      source: 'owner',
      width: 1200,
      height: 900
    }
  ]
  const brief = briefWith({ teamEdits: edits }, { media, businessReading: reading })
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  const team = brief.reading.team
  assert.deepEqual(
    team.map((p) => p.label),
    ['Mira H.', 'Ana Ruiz']
  )
  assert.equal(team[1].source.kind, 'owner')
  assert.equal(team[1].photoAssetId, PHOTO)
  const section = brief.sitemap.find((p) => p.slug === 'about').sections.find((s) => s.kind === 'team')
  assert.deepEqual(section.assetIds, [PHOTO])
  assert.ok(section.copy.includes('Ana Ruiz (Front desk)'))
  // Removing the added person deletes them; removing a researched one goes through the reading picks.
  const gone = nextTeamEdits(edits, { action: 'remove', id: 'te_own1' })
  assert.equal(gone.teamEdits.added.length, 0)
  assert.equal(
    nextTeamEdits(edits, { action: 'remove', id: 'te_coach1' }, { researchIds: ['te_coach1'] })
      .removeFromReading,
    true
  )
})

test('a photo or review the owner hid fills no slot; the bands switched off blank what they feed', () => {
  const plain = briefWith()
  const shown = [...slotIds(plain)]
  assert.ok(shown.length > 1)
  const hiddenId = shown[0]
  const hid = briefWith({ mediaPicks: { hidden: [hiddenId] } })
  assert.ok(!ids(hid).has(hiddenId))
  assert.ok(!slotIds(hid).has(hiddenId))
  // Reviews: one hidden by its key, then the band off.
  assert.ok(plain.googlePlace.reviews.length >= 2)
  const key = reviewKeyOf(g.reviews[0])
  assert.match(key, /^rv_[a-z0-9]+$/)
  assert.equal(reviewKeyOf({ id: 'ta-123', text: 'x' }), 'ta-123')
  const lessReviews = briefWith({ reviewPicks: { hidden: [key] } })
  assert.equal(lessReviews.googlePlace.reviews.length, plain.googlePlace.reviews.length - 1)
  assert.ok(!lessReviews.googlePlace.reviews.some((r) => r.text === g.reviews[0].text))
  const noReviews = briefWith({ factOverrides: { band_reviews: { onSite: false, at: 'x' } } })
  assert.deepEqual(noReviews.googlePlace.reviews, [])
  // Media off: no photo or video in any section, only the logo stays an asset; Missing says why.
  const noMedia = briefWith({ factOverrides: { band_media: { onSite: false, at: 'x' } } })
  assert.equal(slotIds(noMedia).size, 0)
  assert.ok(
    noMedia.assets.every((a) => [HSC.brand.logo, HSC.brand.logoResearch?.chosen?.mediaId].includes(a.id))
  )
  assert.ok(noMedia.missing.some((m) => m.field === 'images' && /owner left Photos/.test(m.why)))
  assert.ok(!noMedia.sitemap.some((p) => p.slug === 'gallery'))
  // Brand off: no brand observation; key messages off: none.
  assert.equal(briefWith({ factOverrides: { band_brand: { onSite: false, at: 'x' } } }).brand, null)
  assert.equal(
    briefWith({ factOverrides: { band_keyMessages: { onSite: false, at: 'x' } } }).keyMessages,
    undefined
  )
  for (const b of [hid, lessReviews, noReviews, noMedia])
    assert.deepEqual(validateBrief(b), { ok: true, errors: [] })
  assert.deepEqual(bandsOf({ band_media: { onSite: false } }), {
    brand: true,
    keyMessages: true,
    reviews: true,
    media: false,
    socials: true
  })
})

test('the Details view marks each review with its key; review sites keep only the reviews shown', () => {
  const profile = {
    googlePlace: { reviews: [{ author: 'A', text: 'Great', publishTime: '2026-01-01T00:00:00Z' }] },
    reviewSources: {
      tripadvisor: {
        reviews: [
          { id: 'ta-1', text: 'Fine' },
          { id: 'ta-2', text: 'Ok' }
        ]
      }
    }
  }
  const marked = withReviewKeys(profile, { reviewPicks: { hidden: ['ta-2'] } })
  assert.equal(marked.googlePlace.reviews[0].ownerHidden, false)
  assert.equal(marked.reviewSources.tripadvisor.reviews[1].key, 'ta-2')
  assert.equal(marked.reviewSources.tripadvisor.reviews[1].ownerHidden, true)
  const kept = profileWithReviewPicks(profile, { reviewPicks: { hidden: ['ta-2'] } })
  assert.deepEqual(
    kept.reviewSources.tripadvisor.reviews.map((r) => r.id),
    ['ta-1']
  )
  const none = profileWithReviewPicks(profile, { factOverrides: { band_reviews: { onSite: false } } })
  assert.deepEqual(none.reviewSources.tripadvisor.reviews, [])
})

test("the owner's uploads rank with the business's own photos", () => {
  const upload = { source: 'owner', kind: 'image' }
  assert.equal(assetOriginOf(upload).uploaderRole, 'owner')
  assert.equal(publisherRankOf(upload), 0)
  assert.equal(publisherRankOf({ source: 'google-maps' }), 1)
})
