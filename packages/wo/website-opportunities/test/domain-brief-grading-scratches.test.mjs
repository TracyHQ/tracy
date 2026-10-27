// What a local grading of a site brief found wrong (#1791, 27/10/2026), each fixed and held here: the other name the
// business uses never reached the brief, the contact line disagreed with its call to action, a video without a size
// read 0 x 0, a page address passed as a quote, reviews naming held people were offered for the site, duplicate name
// conflicts and links, source rows that counted nothing, mixed casing, and dashes in the brief's own markdown.
// Every business, person and text here is fictional (Harbour Sport Club fixture).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as domain from '../domain/index.mjs'
import { renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { factDecisions } from '../domain/fact-assessment.mjs'
import { inSentence } from '../domain/plain-prose.mjs'
import { renderAgentPrompt, withheldLines } from '../domain/agent-prompt.mjs'
import { neutralFor } from '../domain/neutral-copy.mjs'
import { planSlotFill } from '../domain/slot-fill.mjs'
import { siteBusinessOf, siteNameOf } from '../domain/held-name.mjs'
import { pinnedCopy } from '../domain/pinned-copy.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { makeSiteBrief } from '../src/brief-research.js'
import { renderBriefWithReviews } from '../src/review-sources.js'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const IG = 'https://www.instagram.com/harbour.sportclub/'
const SERVICE_NAME = 'Padel & Tennis Coach'
const LOGO = {
  mediaId: HSC.brand.logoResearch.chosen.mediaId,
  via: 'social-profile',
  readsAs: 'HARBOUR SPORT CLUB EST. 2023',
  showsName: true,
  source: 'instagram'
}
const ALL_DAY = [
  'Monday: Open 24 hours',
  'Tuesday: Open 24 hours',
  'Wednesday: Open 24 hours',
  'Thursday: Open 24 hours',
  'Friday: Open 24 hours',
  'Saturday: Open 24 hours',
  'Sunday: Open 24 hours'
]
const g = { ...HSC.profile.googlePlace, openingHours: ALL_DAY, website: `${IG}?igsh=fixture` }
const post = (n) => `post:instagram:37000000000000000${String(n).padStart(2, '0')}`
const ANSWER = {
  services: [
    { name: 'Padel Sessions', quote: 'Join our padel sessions in Dubai!', ref: post(1) },
    { name: 'Swimming Lessons', quote: 'Swimming Lessons', ref: 'bio' },
    {
      name: 'Personalized Fitness Lessons',
      quote: 'Transform Your Body with Personalized Fitness Lessons!',
      ref: post(12)
    }
  ],
  audience: [{ label: 'all ages & levels', quote: 'For all ages & levels', ref: post(1) }],
  story: [{ text: 'European Coaching in Dubai', quote: 'European Coaching in Dubai', ref: 'bio' }],
  team: [{ name: 'Alex', role: 'coach', quote: 'padel coaching with Alex and Sam', ref: 'review:1' }],
  keyMessages: [
    { label: 'European coaching', quotes: [{ quote: 'European Coaching in Dubai', ref: 'bio' }] }
  ],
  subTrade: { id: 'coaching', quotes: [{ quote: 'European Coaching in Dubai', ref: 'bio' }] }
}
const reading = (answer = ANSWER) => ({
  method: 'model',
  ...checkBusinessReading(
    JSON.stringify(answer),
    readingSourcesOf({
      bio: HSC.profile.bio,
      posts: HSC.posts,
      reviews: g.reviews.map((r) => ({ ...r, source: 'google' }))
    }),
    { trade: 'fitness' }
  )
})
// The name Google and a directory agree on is the service; the logo and the Instagram handle say Harbour Sport Club.
const PROFILE = {
  ...HSC.profile,
  name: SERVICE_NAME,
  nameCheck: { name: SERVICE_NAME, state: 'agreed', current: SERVICE_NAME, suggested: SERVICE_NAME },
  nameClaims: [
    { source: 'google', name: SERVICE_NAME, via: 'name' },
    { source: 'instagram', name: 'harbour.sportclub', via: 'handle' },
    { source: 'listing', name: SERVICE_NAME, via: 'name', label: 'directory' }
  ],
  evidence: {
    name: [
      { value: SERVICE_NAME, sources: ['google-places', 'listing'] },
      { value: 'harbour.sportclub', sources: ['instagram'] }
    ]
  },
  links: [IG],
  googlePlace: g,
  businessReading: reading()
}
const instagram = {
  source: 'instagram',
  ref: IG,
  status: 'complete',
  reason: null,
  coverage: { fetched: 12 }
}
const googlePlaces = {
  source: 'google-places',
  ref: g.placeId,
  status: 'complete',
  reason: null,
  coverage: null
}
const facebookSearch = {
  source: 'facebook-search',
  ref: null,
  status: 'complete',
  reason: 'pending',
  coverage: null
}

function scratchBrief({ profile = {}, posts = HSC.posts } = {}) {
  const read = {
    profile: { ...PROFILE, ...profile },
    brand: { ...HSC.brand, logoResearch: { ...HSC.brand.logoResearch, chosen: LOGO } },
    sources: [instagram],
    attemptedSources: [instagram, googlePlaces, facebookSearch],
    media: HSC.media,
    posts
  }
  return makeSiteBrief(domain, read, { opportunity: HSC.opportunity, madeAt: HSC.madeAt })
}
const pageSection = (brief, slug, kind) =>
  brief.sitemap.find((p) => p.slug === slug)?.sections.find((s) => s.kind === kind)
// The markdown less its quoted strings: what Tracy wrote, not what a source said.
const generatedText = (md) => md.replace(/"(?:[^"\\\n]|\\.)*"/g, '""')

test('1. the name the business calls itself on its logo and Instagram reaches the brief, with its marks', () => {
  const brief = scratchBrief()
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  assert.equal(brief.facts.find((f) => f.field === 'name').onSite, false)
  const name = brief.missing.find((m) => m.field === 'name')
  assert.deepEqual(
    name.otherNames.map((n) => [n.name, n.evidence.map((e) => [e.source, e.quote])]),
    [
      [
        'Harbour Sport Club',
        [
          ['logo', 'HARBOUR SPORT CLUB EST. 2023'],
          ['instagram', 'harbour.sportclub']
        ]
      ]
    ]
  )
  assert.match(name.why, /also calls itself "Harbour Sport Club" \(logo: "HARBOUR SPORT CLUB EST\. 2023"/)
  const md = renderBriefMarkdown(brief)
  assert.match(
    md,
    /- Also calls itself: "Harbour Sport Club" \(logo "HARBOUR SPORT CLUB EST\. 2023"; instagram/
  )
  // Still no copy, SEO line, acceptance line or key message prints either name.
  for (const held of ['Harbour Sport Club', SERVICE_NAME]) {
    assert.ok(!JSON.stringify(brief.sitemap).includes(held), held)
    assert.ok(!brief.acceptance.some((a) => a.includes(held)), held)
    assert.ok(!JSON.stringify(brief.keyMessages ?? []).includes(held), held)
  }
})

test('2. the contact line names the channels on the site in the order of the call to action', () => {
  const brief = scratchBrief()
  const contact = pageSection(brief, 'contact', 'contact')
  assert.equal(contact.cta.label, 'Message on Instagram')
  assert.ok(
    contact.copy.startsWith(
      'By appointment. To book, message on Instagram (https://ig.me/m/harbour.sportclub), call +971 50 000 1234 or WhatsApp.'
    ),
    contact.copy
  )
  // Counter-case: hours with no doubt make no By appointment line.
  const office = scratchBrief({
    profile: { googlePlace: { ...g, openingHours: ['Monday: 9:00 AM – 5:00 PM'] } }
  })
  assert.ok(!pageSection(office, 'contact', 'contact').copy.includes('By appointment'))
  // Counter-case: no channel of its own, so the phone leads, as it does on the button.
  const plain = scratchBrief({ posts: [] })
  const plainContact = pageSection(plain, 'contact', 'contact')
  assert.equal(plainContact.cta.kind, 'phone')
  assert.ok(
    plainContact.copy.startsWith('By appointment. To book, call +971 50 000 1234 or WhatsApp.'),
    plainContact.copy
  )
})

test('3. a video without a known size says null, never 0 x 0, and still validates', () => {
  const brief = scratchBrief()
  const videos = brief.assets.filter((a) => a.kind === 'video')
  assert.ok(videos.length > 0)
  for (const v of videos) {
    assert.equal(v.width, null)
    assert.equal(v.height, null)
    assert.equal(v.orientation, 'unknown')
    // An unknown size says why (F08).
    assert.equal(v.sizeUnknownReason, 'not_measured')
  }
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  assert.match(
    renderBriefMarkdown(brief),
    /video, unlabelled, other, size unknown \(not_measured\), quality unknown/
  )
  const zero = { ...brief, assets: [{ ...videos[0], width: 0, height: 0 }] }
  assert.ok(validateBrief(zero).errors.some((e) => e.startsWith('assets[0].width')))
})

test("4. a DM channel quotes only the business's invitations; Google's website field never corroborates it", () => {
  const brief = scratchBrief()
  const dm = brief.facts.find((f) => f.field === 'contactChannels')
  assert.ok(dm.evidence.length >= 2)
  for (const e of dm.evidence) {
    assert.equal(e.source, 'instagram')
    assert.ok(e.quote && !/^https?:\/\//.test(e.quote), JSON.stringify(e))
  }
  // Two posts that invite DMs agree: corroborated by the business's own words.
  assert.equal(dm.confidence, 'corroborated')
  // One post alone is one source, whatever Google's website field lists.
  const one = scratchBrief({ posts: [HSC.posts[0]] })
  const single = one.facts.find((f) => f.field === 'contactChannels')
  assert.deepEqual(
    single.evidence.map((e) => e.quote),
    ['📩DM us today to book your spot!']
  )
  assert.equal(single.confidence, 'single-source')
  for (const e of pageSection(brief, 'contact', 'contact').evidence)
    assert.ok(!/^https?:\/\//.test(e.quote), e.quote)
})

test('5. a review naming someone held off the site is not offered for the site', () => {
  const brief = scratchBrief()
  assert.ok(brief.missing.some((m) => m.field === 'team' && m.withheld[0].values.includes('Alex')))
  assert.ok(brief.acceptance.includes('Nobody the brief holds off the site is named on it.'))
  const shown = brief.googlePlace.reviews
  assert.deepEqual(
    shown.map((r) => r.author),
    ['Google reviewer B']
  )
  assert.ok(shown.every((r) => !/\bAlex\b/.test(r.text)))
  assert.deepEqual(
    brief.googlePlace.heldReviews.map((r) => [r.author, r.namesHeld]),
    [
      ['Google reviewer A', ['Alex']],
      ['Google reviewer C', ['Alex']]
    ]
  )
  const md = renderBriefMarkdown(brief)
  const testimonials = md.split('\n').filter((l) => l.startsWith('> ') && l.includes(' on Google'))
  assert.equal(testimonials.length, 1)
  assert.ok(!testimonials.some((l) => l.includes('Alex')))
  assert.match(md, /Not for the site: the review by Google reviewer A names Alex/)
  // The app's review sources (Google Maps, TripAdvisor) hold such a review back the same way.
  const maps = {
    placeId: g.placeId,
    url: 'https://maps.example/harbour',
    reviews: [
      { text: 'Alex is a brilliant coach.', author: 'Maps reviewer A', url: 'https://maps.example/r/1' },
      { text: 'Great padel lessons.', author: 'Maps reviewer B', url: 'https://maps.example/r/2' }
    ]
  }
  const withMaps = scratchBrief({ profile: { reviewSources: { googleMaps: maps } } })
  assert.deepEqual(
    withMaps.reviewSources.googleMaps.reviews.map((r) => r.author),
    ['Maps reviewer B']
  )
  assert.deepEqual(withMaps.reviewSources.googleMaps.heldReviews[0].namesHeld, ['Alex'])
  const full = renderBriefWithReviews(domain, withMaps)
  assert.ok(!full.includes('"Alex is a brilliant coach."'))
})

test('6. one name conflict per other name, and no link of no kind repeating the Instagram page', () => {
  const doc = placeProfileFromResearch({
    identity: { id: 'o1', provider: 'google-places', providerId: g.placeId, name: SERVICE_NAME },
    profile: { ...PROFILE },
    brand: { logoResearch: { chosen: LOGO } },
    posts: [],
    sources: [instagram],
    madeAt: HSC.madeAt
  })
  const names = doc.conflicts.filter((c) => c.target === 'business.name')
  assert.deepEqual(
    names.map((c) => c.values.map((v) => v.value)),
    [[SERVICE_NAME, 'Harbour Sport Club']]
  )
  assert.equal(
    doc.links
      .filter((l) => l.value.url === IG)
      .map((l) => l.value.kind)
      .join(','),
    'instagram'
  )
  // Counter-case: a handle with no logo or display name behind it is still its own conflict.
  const bare = placeProfileFromResearch({
    identity: { id: 'o1', provider: 'google-places', providerId: g.placeId, name: SERVICE_NAME },
    profile: { ...PROFILE },
    brand: {},
    posts: [],
    sources: [instagram],
    madeAt: HSC.madeAt
  })
  assert.deepEqual(
    bare.conflicts.filter((c) => c.target === 'business.name').map((c) => c.values.map((v) => v.value)),
    [[SERVICE_NAME, 'harbour.sportclub']]
  )
  assert.ok(factDecisions(doc).size > 0)
})

test('7. Google Places reports what it gave, and a complete search never reads as pending', () => {
  const brief = scratchBrief()
  const by = new Map(brief.sources.map((s) => [s.source, s]))
  const photos = HSC.media.filter((m) => m.source === 'google-places' && m.kind === 'image').length
  assert.deepEqual(by.get('google-places').coverage, {
    fetched: 1 + g.reviews.length + photos,
    reviews: g.reviews.length,
    photos
  })
  assert.equal(by.get('instagram').coverage.fetched, 12)
  assert.equal(by.get('facebook-search').status, 'complete')
  assert.notEqual(by.get('facebook-search').reason, 'pending')
  assert.equal(by.get('facebook-search').reason, 'unconfirmed-page')
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  assert.match(
    renderBriefMarkdown(brief),
    new RegExp(
      `- google-places: complete, fetched ${1 + g.reviews.length + photos} \\(3 reviews, ${photos} photos\\)`
    )
  )
})

test('8. services joined into prose read in sentence case; quotes keep their capitals', () => {
  const brief = scratchBrief()
  assert.equal(
    brief.reading.about,
    'This coaching team offers European Coaching in Dubai: padel sessions, swimming lessons, personalized fitness lessons and tennis, for all ages & levels.'
  )
  const services = brief.reading.services.map((s) => s.label)
  assert.ok(services.includes('Personalized Fitness Lessons'), 'the service keeps its own name')
  assert.ok(
    brief.reading.services.some((s) => s.quote === 'Transform Your Body with Personalized Fitness Lessons!')
  )
  assert.equal(inSentence('Padel Sessions', 'Join our padel sessions in Dubai!'), 'padel sessions')
  assert.equal(inSentence('Padel in Dubai', 'We teach Padel in Dubai every day'), 'padel in Dubai')
  assert.match(pageSection(brief, 'home', 'hero').copy, /^European Coaching in Dubai: [a-z ,]+\.$/)
  assert.equal(inSentence('PT Sessions', 'PT Sessions'), 'PT sessions')
})

test('9. the brief markdown carries no em or en dash outside the quotes it holds', () => {
  const brief = scratchBrief({
    profile: {
      reviewSources: {
        googleMaps: {
          placeId: g.placeId,
          url: 'https://maps.example/harbour',
          reviews: [
            { text: 'Great padel lessons.', author: 'Maps reviewer B', url: 'https://maps.example/r/2' }
          ]
        }
      }
    }
  })
  const md = renderBriefWithReviews(domain, brief)
  assert.ok(/[–—]/u.test(md), 'the fixture quotes dashes, which stay as quoted')
  const left = generatedText(md)
    .split('\n')
    .filter((l) => /[–—]/u.test(l))
  assert.deepEqual(left, [])
})

// A second grading of the same brief (27/10/2026) found five more, each fixed and held here.

test('A. By appointment is recorded as inferred from implausible hours, never cited with an hours excerpt', () => {
  const brief = scratchBrief()
  const contact = pageSection(brief, 'contact', 'contact')
  assert.deepEqual(contact.inferred, [{ text: 'By appointment.', reason: 'implausible-all-week-hours' }])
  // No hours excerpt stands as the contact section's quote: a builder reading it finds no hours to display.
  for (const e of contact.evidence) assert.ok(!/Open 24 hours/i.test(e.quote ?? ''), JSON.stringify(e))
  assert.ok(!contact.evidence.some((e) => /hours/i.test(e.source)), JSON.stringify(contact.evidence))
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  const md = renderBriefMarkdown(brief)
  const block = md.slice(md.indexOf('- contact: "By appointment.'))
  const contactLines = block.split('\n').slice(
    0,
    block.split('\n').findIndex((l, i) => i > 0 && !l.startsWith('  '))
  )
  assert.ok(!contactLines.some((l) => l.includes('Open 24 hours')), contactLines.join('\n'))
  assert.ok(
    contactLines.some((l) =>
      l.includes('Inferred by Tracy, not a quote: "By appointment." (implausible-all-week-hours')
    ),
    contactLines.join('\n')
  )
  // Counter-case: hours with no doubt infer nothing.
  const office = scratchBrief({
    profile: { googlePlace: { ...g, openingHours: ['Monday: 9:00 AM – 5:00 PM'] } }
  })
  assert.equal(pageSection(office, 'contact', 'contact').inferred, undefined)
})

test('B. the contact text names each channel once, in the order of the call to action', () => {
  const contact = pageSection(scratchBrief(), 'contact', 'contact')
  const count = (needle) => contact.copy.split(needle).length - 1
  assert.equal(count('https://ig.me/m/harbour.sportclub'), 1, contact.copy)
  assert.equal(count('Instagram'), 1, contact.copy)
  assert.equal(count('+971 50 000 1234'), 1, contact.copy)
  assert.equal(count('WhatsApp'), 1, contact.copy)
  const at = (needle) => contact.copy.indexOf(needle)
  assert.ok(at('Instagram') < at('+971 50 000 1234') && at('+971 50 000 1234') < at('WhatsApp'), contact.copy)
})

test('D. a fully title-cased quote lowercases only common words; a place name keeps its capital', () => {
  assert.equal(inSentence('Tennis Lessons In Dubai', 'Tennis Lessons In Dubai'), 'tennis lessons in Dubai')
  assert.equal(
    inSentence('Personalized Fitness Lessons', 'Transform Your Body with Personalized Fitness Lessons!'),
    'personalized fitness lessons'
  )
  // A word Tracy cannot tell is common stays as written.
  assert.equal(inSentence('Harbour Swim Squad', 'Harbour Swim Squad'), 'Harbour swim Squad')
  assert.equal(inSentence('Padel Sessions', 'Padel Sessions'), 'padel sessions')
})

test('E. the other name is held from the site text, while the logo may still show it', () => {
  const brief = scratchBrief()
  const name = brief.missing.find((m) => m.field === 'name')
  const values = name.withheld.flatMap((w) => w.values)
  assert.ok(values.includes('Harbour Sport Club'), JSON.stringify(name.withheld))
  assert.ok(values.includes(SERVICE_NAME), JSON.stringify(name.withheld))
  const lines = withheldLines(brief).join('\n')
  assert.match(lines, /Harbour Sport Club/)
  assert.match(
    lines,
    /may still show inside the logo picture; it is written nowhere in the text, the page title/
  )
})

// A third look at the same brief (27/10/2026): the brand still named the held business name.

test('F. while the business name is held, the brand names nobody and points to the held name', () => {
  const brief = scratchBrief()
  assert.equal(brief.facts.find((f) => f.field === 'name').onSite, false)
  assert.equal(brief.brand.name, null)
  assert.deepEqual(brief.brand.nameHeld, { missing: 'name', reasons: ['name-differs-from-own-marks'] })
  const brand = JSON.stringify(brief.brand)
  for (const held of [SERVICE_NAME, 'Harbour Sport Club', 'harbour.sportclub'])
    assert.ok(!brand.includes(held), held)
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  const md = renderBriefMarkdown(brief)
  const brandBlock = md.slice(md.indexOf('## Brand'), md.indexOf('## Integrations'))
  assert.match(
    brandBlock,
    /- Name: none while the business name is held \(see Missing: name, and the other names it lists\)/
  )
  assert.ok(!brandBlock.includes(SERVICE_NAME))
})

test("F. the place profile's brand name follows the held business name, so no site fill falls back to it", () => {
  const doc = placeProfileFromResearch({
    identity: { id: 'o1', provider: 'google-places', providerId: g.placeId, name: SERVICE_NAME },
    profile: { ...PROFILE },
    brand: { logoResearch: { chosen: LOGO } },
    posts: [],
    sources: [instagram],
    madeAt: HSC.madeAt
  })
  const decisions = factDecisions(doc)
  assert.equal(decisions.get(doc.business.name.id).onSite, false)
  assert.ok(doc.brand.name, 'the profile records a brand name')
  const brandName = decisions.get(doc.brand.name.id)
  assert.equal(brandName.onSite, false)
  assert.ok(brandName.reasons.includes('name-differs-from-own-marks'), JSON.stringify(brandName))
  const slotRoles = {
    schemaVersion: 'tracy-quickstart-slot-roles/v1',
    groups: [{ id: 'hero.0', entityKind: 'business', allowedKinds: ['business'], itemIndex: 0 }],
    bindings: [{ slotKey: 'hero.name', groupId: 'hero.0', role: 'business.name', mode: 'verbatim' }]
  }
  const fill = (onSite) =>
    planSlotFill({
      slotRoles,
      profile: doc,
      assessment: [...decisions].map(([factId, d]) => ({ factId, onSite: onSite(factId, d) })),
      locale: 'en',
      neutralFor
    }).manifest.find((w) => w.slotKey === 'hero.name')
  // Even an assessment that keeps the brand name on (one frozen before this rule) never lends it to a held business name.
  for (const onSite of [(_, d) => d.onSite, (id, d) => (id === doc.brand.name.id ? true : d.onSite)]) {
    const slot = fill(onSite)
    assert.ok(!slot?.value, JSON.stringify(slot))
  }
})

// A fourth look (27/10/2026): the site builders still read the held name from the brief's business.

test('G. while the business name is held, the site is named by the neutral identity the brief already uses', () => {
  const brief = scratchBrief()
  const home = brief.sitemap.find((p) => p.slug === 'home')
  // The brief's own name-free identity: the home page title it made without the name (`seoOf`).
  assert.equal(home.seo.title, 'Coaching team in Dubai')
  assert.equal(siteNameOf(brief), 'Coaching team in Dubai')
  const business = siteBusinessOf(brief)
  assert.equal(business.name, 'Coaching team in Dubai')
  assert.equal(business.phone, brief.business.phone, 'the rest of the business stays')
  const shown = JSON.stringify({ ...business, socials: undefined })
  for (const held of [SERVICE_NAME, 'Harbour Sport Club', 'harbour.sportclub'])
    assert.ok(!shown.includes(held), held)
  assert.equal(
    brief.business.name,
    SERVICE_NAME,
    'the brief itself still records the held name for the owner'
  )
  // The legacy pinned copy's hero title is the same neutral identity.
  assert.equal(pinnedCopy(brief)['hero.title']?.value ?? null, 'Coaching team in Dubai')
  // The agent demo's prompt names the site the same way; only its withheld lines name the held name, as held.
  const prompt = renderAgentPrompt({ revision: { id: 'r', n: 1, cms: 'wordpress', brief } })
  assert.match(prompt.split('\n')[0], /Build the demo website for "Coaching team in Dubai"/)
  for (const l of prompt.split('\n').filter((l) => l.includes(SERVICE_NAME)))
    assert.match(l, /withheld|held|not on the site|written nowhere|Do not|never/i, l)
  // Counter-case: a name on the site is the site's name.
  const named = { ...brief, facts: brief.facts.map((f) => (f.field === 'name' ? { ...f, onSite: true } : f)) }
  assert.equal(siteNameOf(named), SERVICE_NAME)
  assert.equal(siteBusinessOf(named), named.business)
})
