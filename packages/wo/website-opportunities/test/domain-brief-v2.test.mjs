// Brief schema 2 (#1791), read where a builder reads it: every stated fact in one envelope with how sure Tracy is and
// one on-site decision, `missing` a view over what is off the site, key messages on the facts they rest on, and the
// owner's on/off choices (keyed by fact id) surviving a second brief of the same research.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { renderAgentPrompt } from '../domain/agent-prompt.mjs'
import { buildBrief, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const g = HSC.profile.googlePlace
const HSC_SOURCES = readingSourcesOf({
  bio: HSC.profile.bio,
  posts: HSC.posts,
  reviews: g.reviews.map((r) => ({ ...r, source: 'google' }))
})
const POST_PADEL = 'post:instagram:3700000000000000001'
const HSC_ANSWER = {
  services: [{ name: 'Swimming Lessons', quote: 'Swimming Lessons', ref: 'bio' }],
  audience: [{ label: 'all ages & levels', quote: 'For all ages & levels', ref: POST_PADEL }],
  story: [{ text: 'European Coaching in Dubai', quote: 'European Coaching in Dubai', ref: 'bio' }],
  serviceAreas: [{ text: 'Locations across Dubai', quote: 'Locations across Dubai', ref: POST_PADEL }],
  keyMessages: [
    { label: 'European coaching', quotes: [{ quote: 'European Coaching in Dubai', ref: 'bio' }] },
    { label: 'All ages & levels', quotes: [{ quote: 'For all ages & levels', ref: POST_PADEL }] },
    // A quote no text holds: code drops it.
    { label: 'Private courts', quotes: [{ quote: 'our private courts', ref: 'bio' }] }
  ]
}
const readingOf = (answer, sources = HSC_SOURCES) => ({
  method: 'model',
  ...checkBusinessReading(JSON.stringify(answer), sources, { trade: 'fitness' })
})
const dscBrief = ({ candidate = {}, answer = HSC_ANSWER } = {}) =>
  buildBrief({
    opportunity: { ...HSC.opportunity, candidate: { ...HSC.opportunity.candidate, ...candidate } },
    profile: { ...HSC.profile, businessReading: readingOf(answer) },
    googlePlace: g,
    sources: [],
    media: HSC.media,
    posts: HSC.posts,
    brand: HSC.brand,
    madeAt: HSC.madeAt
  })
const fieldOf = (brief, field, label) =>
  brief.facts.find((f) => f.field === field && (!label || f.value?.label === label))

test('Harbour Sport Club: one envelope per fact, the inferred WhatsApp on, Google’s 4-review rating off', () => {
  const brief = dscBrief()
  assert.equal(brief.schemaVersion, 2)
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  for (const f of brief.facts)
    assert.deepEqual(Object.keys(f), [
      'id',
      'field',
      'value',
      'evidence',
      'confidence',
      'onSite',
      'decidedBy',
      'reasons'
    ])
  const wa = fieldOf(brief, 'whatsapp')
  assert.equal(wa.confidence, 'inferred')
  assert.equal(wa.onSite, true)
  assert.equal(brief.contact.whatsapp.factId, wa.id)
  const rating = fieldOf(brief, 'googleRating', 'rating')
  assert.equal(rating.onSite, false)
  assert.ok(rating.reasons.includes('few-reviews'))
  // `missing` is a view over the facts off the site: the rating with every way a page could write it.
  const held = brief.missing.find((m) => m.field === 'googleRating')
  assert.ok(held.withheld[0].values.includes('5.0 ★'))
  assert.equal(brief.googlePlace.rating ?? null, null)
  // The phone is stated once (Google): single source.
  assert.equal(fieldOf(brief, 'phone').confidence, 'single-source')
})

test('key messages: kept on their quotes and tied to the facts they rest on, led with in the prompt', () => {
  const brief = dscBrief()
  assert.deepEqual(
    brief.keyMessages.map((m) => m.label),
    ['European coaching', 'All ages & levels']
  )
  for (const m of brief.keyMessages) {
    assert.ok(m.factRefs.length > 0)
    for (const id of m.factRefs) assert.ok(brief.facts.some((f) => f.id === id && f.onSite))
  }
  const md = renderBriefMarkdown(brief)
  assert.match(md, /## Key messages \(lead with these, in this order\)\n.*\n1\. "European coaching"/)
  assert.match(md, /## Facts and where they show/)
  assert.match(md, /- whatsapp: "https:\/\/wa\.me\/971500001234" · inferred .* · on the site/)
  assert.match(md, /- googleRating: 5 \(rating\) · single source \(google\) · off the site: .*few-reviews/)
  const prompt = renderAgentPrompt({ revision: { id: 'r1', n: 1, cms: 'joomla', brief, brief_md: md } })
  assert.match(
    prompt,
    /Lead the home page's hero and intro with the brief's key messages, in their order: "European coaching", "All ages & levels"/
  )
})

test('the owner’s choices win, survive a second brief of the same research, and reorder or reword key messages', () => {
  const first = dscBrief()
  const rating = fieldOf(first, 'googleRating', 'rating')
  const count = fieldOf(first, 'googleRating', 'reviewCount')
  const wa = fieldOf(first, 'whatsapp')
  const [a, b] = first.keyMessages.map((m) => m.id)
  const candidate = {
    factOverrides: {
      [rating.id]: { onSite: true, at: '2026-10-27T09:00:00.000Z' },
      [count.id]: { onSite: true, at: '2026-10-27T09:00:00.000Z' },
      [wa.id]: { onSite: false, at: '2026-10-27T09:00:00.000Z' },
      fact_gone: { onSite: true }
    },
    keyMessagePicks: { removed: [], order: [b, a], labels: { [a]: 'Coaches from Europe' } }
  }
  const second = dscBrief({ candidate })
  assert.deepEqual(validateBrief(second), { ok: true, errors: [] })
  const shownRating = fieldOf(second, 'googleRating', 'rating')
  assert.equal(shownRating.id, rating.id)
  assert.equal(shownRating.onSite, true)
  assert.equal(shownRating.decidedBy, 'owner')
  assert.equal(second.googlePlace.rating, 5)
  assert.ok(!second.missing.some((m) => m.field === 'googleRating'))
  // The WhatsApp switched off: no button, and the number is named as withheld.
  assert.equal(second.contact, undefined)
  assert.ok(second.missing.find((m) => m.field === 'whatsapp').withheld[0].values.includes(wa.value.url))
  assert.deepEqual(
    second.keyMessages.map((m) => [m.label, m.decidedBy]),
    [
      ['All ages & levels', 'rule'],
      ['Coaches from Europe', 'owner']
    ]
  )
})

test('a key message resting only on facts off the site is dropped; thin evidence gives none', () => {
  // A point only reviews make, naming coaches who are named only in reviews (off the site by rule).
  const answer = {
    team: [{ name: 'Alex', role: '', quote: 'padel coaching with Alex', ref: 'review:1' }],
    keyMessages: [
      {
        label: 'Alex',
        quotes: [
          { quote: 'padel coaching with Alex', ref: 'review:1' },
          { quote: 'recommend Alex', ref: 'review:3' }
        ]
      }
    ]
  }
  const brief = dscBrief({ answer })
  assert.equal(fieldOf(brief, 'team').onSite, false)
  assert.equal(brief.keyMessages, undefined)
  assert.match(
    renderBriefMarkdown(brief),
    /- team: "Alex" · single source \(google\) · off the site: .*review-only-person/
  )
  // A business with nothing quotable: no key message at all.
  const thin = buildBrief({
    opportunity: { id: 'o-thin', name: 'Quiet Barber', candidate: { trade: 'beauty' } },
    profile: {
      name: 'Quiet Barber',
      businessReading: { method: 'model', ...checkBusinessReading('{}', []) }
    },
    madeAt: '2026-10-27T08:00:00.000Z'
  })
  assert.equal(thin.keyMessages, undefined)
  assert.deepEqual(validateBrief(thin), { ok: true, errors: [] })
})

test('two sources stating the same phone corroborate it; disagreeing sources do not', () => {
  const gym = (evidence) =>
    buildBrief({
      opportunity: {
        id: 'o-gym',
        name: 'Iron Works',
        candidate: { trade: 'fitness', provider: 'google-places', providerId: 'g1' }
      },
      profile: {
        name: 'Iron Works',
        phone: '+1 555 0100',
        provenance: { phone: { source: 'google-places' } },
        evidence,
        googlePlace: { placeId: 'g1', primaryType: 'gym', types: ['gym'] }
      },
      sources: [
        { source: 'google-places', ref: 'g1', status: 'complete' },
        { source: 'website', ref: 'https://ironworks.test/', status: 'complete' }
      ],
      madeAt: '2026-10-27T08:00:00.000Z'
    })
  const agree = gym({ phone: [{ value: '+1 555 0100', sources: ['google-places', 'website'] }] })
  assert.equal(fieldOf(agree, 'phone').confidence, 'corroborated')
  assert.equal(fieldOf(agree, 'phone').evidence.length, 2)
  const differ = gym({
    phone: [
      { value: '+1 555 0100', sources: ['google-places'] },
      { value: '+1 555 0199', sources: ['website'] }
    ]
  })
  assert.notEqual(fieldOf(differ, 'phone').confidence, 'corroborated')
  // Stated once: single source.
  assert.equal(fieldOf(gym(undefined), 'phone').confidence, 'single-source')
})

test('a schema 1 brief stored before the change still validates and renders, its own flags read as before', () => {
  const v2 = dscBrief()
  const { facts: _f, keyMessages: _k, ...rest } = v2
  const v1 = {
    ...rest,
    schemaVersion: 1,
    contact: {
      whatsapp: {
        number: '+971 50 000 1234',
        href: 'https://wa.me/971500001234',
        verified: false,
        basis: 'uae-mobile'
      }
    },
    agentDemoSnapshot: { at: HSC.madeAt, profile: {}, sources: [] }
  }
  assert.deepEqual(validateBrief(v1), { ok: true, errors: [] })
  const md = renderBriefMarkdown(v1)
  assert.match(md, /WhatsApp: "\+971 50 000 1234" \(inferred from a UAE mobile number, not verified\)/)
  assert.doesNotMatch(md, /## Facts and where they show|## Key messages/)
  // A schema 1 brief carrying facts is refused: they exist from schema 2 on.
  assert.match(validateBrief({ ...v1, facts: [] }).errors.join('\n'), /facts/)
})

test('a bakery keeps a key message on its own words, tied to the story fact it rests on', () => {
  const bio = 'Crumb Bakery. Fresh sourdough baked every morning in Al Quoz.'
  const sources = readingSourcesOf({ bio, posts: [], reviews: [] })
  const answer = {
    story: [
      {
        text: 'Fresh sourdough baked every morning',
        quote: 'Fresh sourdough baked every morning',
        ref: 'bio'
      }
    ],
    keyMessages: [
      { label: 'Fresh sourdough', quotes: [{ quote: 'Fresh sourdough baked every morning', ref: 'bio' }] }
    ]
  }
  const brief = buildBrief({
    opportunity: { id: 'o-bakery', name: 'Crumb Bakery', candidate: { trade: 'food' } },
    profile: {
      name: 'Crumb Bakery',
      bio,
      businessReading: {
        method: 'model',
        ...checkBusinessReading(JSON.stringify(answer), sources, { trade: 'food' })
      }
    },
    madeAt: '2026-10-27T08:00:00.000Z'
  })
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  assert.equal(brief.keyMessages?.length, 1, JSON.stringify(brief.keyMessages))
  // Tied to the fact of the reading item it quotes from the same text, not to every fact sharing its words (the bio).
  const story = brief.facts.find(
    (f) => f.field === 'story' && f.value?.text === 'Fresh sourdough baked every morning'
  )
  assert.ok(story?.onSite, JSON.stringify(brief.facts))
  assert.deepEqual(brief.keyMessages[0].factRefs, [story.id])
  assert.equal(brief.keyMessages[0].label, 'Fresh sourdough')
})

test('a key message ties only facts quoted from its own source, and never carries a withheld value to the builder', () => {
  const answer = {
    ...HSC_ANSWER,
    team: [{ name: 'Alex', role: 'coach', quote: 'padel coaching with Alex', ref: 'review:1' }],
    keyMessages: [
      // "Dubai" is in the address too: only the bio's own story item counts.
      { label: 'European coaching', quotes: [{ quote: 'European Coaching in Dubai', ref: 'bio' }] },
      // A coach named only in reviews is off the site: the message quoting her never reaches the builder.
      {
        label: 'Coaching with Alex',
        quotes: [
          { quote: 'padel coaching with Alex', ref: 'review:1' },
          { quote: 'recommend Alex', ref: 'review:3' }
        ]
      }
    ]
  }
  const brief = dscBrief({ answer })
  const address = fieldOf(brief, 'address')
  assert.deepEqual(
    brief.keyMessages.map((m) => m.label),
    ['European coaching']
  )
  assert.ok(!brief.keyMessages[0].factRefs.includes(address.id))
  assert.deepEqual(
    brief.keyMessages[0].factRefs.map((id) => brief.facts.find((f) => f.id === id).field),
    ['story']
  )
  const md = renderBriefMarkdown(brief)
  const prompt = renderAgentPrompt({ revision: { id: 'r1', n: 1, cms: 'joomla', brief, brief_md: md } })
  assert.doesNotMatch(prompt + md, /Coaching with Alex/)
})
