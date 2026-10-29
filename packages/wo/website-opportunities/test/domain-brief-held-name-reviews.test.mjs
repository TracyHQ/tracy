// A fifth look at a brief that holds the business name and the people only reviews name (#1791, 28/10/2026): the
// brief's business name and heading still printed the held name, and the kind of business quoted reviews that name a
// held person. Every business, person and text here is fictional (Harbour Sport Club fixture).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import * as domain from '../domain/index.mjs'
import { renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { renderAgentPrompt } from '../domain/agent-prompt.mjs'
import { siteNameOf } from '../domain/held-name.mjs'
import {
  factsWithoutHeldQuotes,
  heldReviewsSplit,
  isHeldReviewQuote,
  readingWithoutHeldReviews,
  reviewsNamingHeld
} from '../domain/held-reviews.mjs'
import { makeSiteBrief } from '../src/brief-research.js'
import { renderBriefWithReviews } from '../src/review-sources.js'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const IG = 'https://www.instagram.com/harbour.sportclub/'
const SERVICE_NAME = 'Padel & Tennis Coach'
const NEUTRAL = 'Coaching team in Dubai'
const g = HSC.profile.googlePlace
// Reviews A and C name Alex, a coach only reviews name: both are held. Review B names nobody.
const [REVIEW_A, REVIEW_B, REVIEW_C] = g.reviews
const ANSWER = {
  services: [{ name: 'Swimming Lessons', quote: 'Swimming Lessons', ref: 'bio' }],
  story: [{ text: 'European Coaching in Dubai', quote: 'European Coaching in Dubai', ref: 'bio' }],
  team: [{ name: 'Alex', role: 'coach', quote: 'padel coaching with Alex and Sam', ref: 'review:1' }],
  keyMessages: [
    { label: 'European coaching', quotes: [{ quote: 'European Coaching in Dubai', ref: 'bio' }] }
  ],
  // As the dev brief read it: the bio, a held review naming the coach and a held review's other words.
  subTrade: {
    id: 'coaching',
    quotes: [
      { quote: 'European Coaching in Dubai', ref: 'bio' },
      { quote: 'padel coaching with Alex and Sam', ref: 'review:1' },
      { quote: 'Her background in competitive tennis shows', ref: 'review:3' }
    ]
  }
}
const reading = () => ({
  method: 'model',
  ...checkBusinessReading(
    JSON.stringify(ANSWER),
    readingSourcesOf({
      bio: HSC.profile.bio,
      posts: HSC.posts,
      reviews: g.reviews.map((r) => ({ ...r, source: 'google' }))
    }),
    { trade: 'fitness' }
  )
})
const PROFILE = {
  ...HSC.profile,
  name: SERVICE_NAME,
  nameCheck: { name: SERVICE_NAME, state: 'agreed', current: SERVICE_NAME, suggested: SERVICE_NAME },
  nameClaims: [
    { source: 'google', name: SERVICE_NAME, via: 'name' },
    { source: 'instagram', name: 'harbour.sportclub', via: 'handle' }
  ],
  links: [IG],
  googlePlace: g,
  businessReading: reading()
}
const LOGO = {
  mediaId: HSC.brand.logoResearch.chosen.mediaId,
  via: 'social-profile',
  readsAs: 'HARBOUR SPORT CLUB EST. 2023',
  showsName: true,
  source: 'instagram'
}
const instagram = {
  source: 'instagram',
  ref: IG,
  status: 'complete',
  reason: null,
  coverage: { fetched: 12 }
}

function heldBrief(profile = {}) {
  const make = (opportunity) =>
    makeSiteBrief(
      domain,
      {
        profile: { ...PROFILE, ...profile },
        brand: { ...HSC.brand, logoResearch: { ...HSC.brand.logoResearch, chosen: LOGO } },
        sources: [instagram],
        media: HSC.media,
        posts: HSC.posts
      },
      { opportunity, madeAt: HSC.madeAt }
    )
  // Alex, a coach two reviews name, is shown by rule since 29/10/2026 (`brief-people.mjs`): the owner's own choice holds
  // him off here, so these tests still read the held path.
  return make(ownerHoldsAlex(make(HSC.opportunity)))
}

/** The opportunity with the owner's choice to keep Alex off the site. */
function ownerHoldsAlex(first) {
  const alex = first.facts.find((f) => f.field === 'team' && f.value?.name === 'Alex')
  if (!alex) return HSC.opportunity
  const factOverrides = { [alex.id]: { onSite: false, at: '2026-10-27T09:00:00.000Z' } }
  return { ...HSC.opportunity, candidate: { ...HSC.opportunity.candidate, factOverrides } }
}

// The sentences of the held reviews, each long enough to be a quote of its own.
const HELD_SENTENCES = [REVIEW_A, REVIEW_C].flatMap((r) =>
  r.text
    .split(/(?<=[.!?])\s+|\n+/)
    .flatMap((s) => s.split(/,\s*/))
    .map((s) => s.trim().replace(/[.!?]$/, ''))
    .filter((s) => s.split(/\s+/).length >= 4)
)
const fold = (t) => String(t).replace(/\s+/g, ' ').toLowerCase()
/** Whether a text quotes a held review: it holds one of its sentences, or it is a quote found inside one. */
const quotesHeld = (s) => {
  const t = fold(s)
  if (HELD_SENTENCES.some((h) => t.includes(fold(h)))) return true
  return t.split(' ').length >= 4 && [REVIEW_A, REVIEW_C].some((r) => fold(r.text).includes(t))
}
/** Every string in a value, with its path. */
function strings(value, path = '', out = []) {
  if (typeof value === 'string') out.push([path, value])
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out)
  return out
}
test('a quote is from a held review when it names a held person, cites a held review or is part of one', () => {
  const held = [{ ...REVIEW_A, namesHeld: ['Alex'] }]
  const review = (quote, author) => ({ quote, source: { kind: 'review', author, ref: 'review:1' } })
  assert.equal(isHeldReviewQuote(review('Both coaches are patient', 'Google reviewer A'), { held }), true)
  assert.equal(isHeldReviewQuote(review('patient', 'Someone else'), { held }), false)
  assert.equal(isHeldReviewQuote(review('Both coaches are patient', 'Someone else'), { held }), true)
  assert.equal(isHeldReviewQuote(review('Alex is great', 'Someone else'), { names: ['Alex'] }), true)
  // Owner text is never a held review, whatever words a guest repeats.
  const bio = { quote: 'padel lessons', source: { kind: 'bio', ref: 'bio' } }
  assert.equal(isHeldReviewQuote(bio, { names: ['Alex'], held }), false)
})

test("a fact's evidence keeps its source but no held review's words; owner text and usable reviews keep theirs", () => {
  const opts = { names: ['Alex'], held: reviewsNamingHeld(g.reviews, ['Alex']) }
  const fact = (id, ...evidence) => ({ id, field: 'team', value: { name: id }, evidence, onSite: false })
  const facts = [
    fact('a', { source: 'google', ref: 'place', quote: 'padel coaching with Alex and Sam' }),
    fact('b', { source: 'instagram', ref: IG, quote: 'European Coaching in Dubai' }),
    fact('c', { source: 'google', ref: 'place', quote: 'Lovely coaches who teach my two daughters tennis' })
  ]
  assert.deepEqual(
    factsWithoutHeldQuotes(facts, opts).map((f) => f.evidence),
    [
      [{ source: 'google', ref: 'place' }],
      [{ source: 'instagram', ref: IG, quote: 'European Coaching in Dubai' }],
      [{ source: 'google', ref: 'place', quote: 'Lovely coaches who teach my two daughters tennis' }]
    ]
  )
  assert.equal(factsWithoutHeldQuotes(facts, {}), facts)
  // The contract lets a held person's team entry carry no quote, and every other reading item still needs one.
  const schema = JSON.parse(readFileSync(new URL('../domain/brief-schema.json', import.meta.url), 'utf8'))
  assert.ok(!schema.$defs.teamItem.required.includes('quote'))
  assert.ok(schema.$defs.readingItem.required.includes('quote'))
})

test('a held review is named, never quoted: its split keeps no text', () => {
  const split = heldReviewsSplit(g.reviews, ['Alex'])
  assert.deepEqual(
    split.reviews.map((r) => r.author),
    ['Google reviewer B']
  )
  assert.deepEqual(
    split.heldReviews.map((r) => [r.author, r.namesHeld, 'text' in r]),
    [
      ['Google reviewer A', ['Alex'], false],
      ['Google reviewer C', ['Alex'], false]
    ]
  )
})

test('the reading less held reviews keeps owner text and usable reviews only', () => {
  const quote = (q, ref, author) => ({
    quote: q,
    source: author ? { kind: 'review', ref, author, source: 'google' } : { kind: 'bio', ref }
  })
  const item = (label, q) => ({ id: label, label, ...q })
  const read = {
    method: 'model',
    services: [item('Swimming Lessons', quote('Swimming Lessons', 'bio'))],
    audience: [
      item('families', quote('Our kids take tennis lessons with the same team', 'review:1', REVIEW_A.author)),
      item('parents of girls', quote('teach my two daughters tennis', 'review:2', REVIEW_B.author))
    ],
    team: [item('Alex', quote('padel coaching with Alex and Sam', 'review:1', REVIEW_A.author))],
    keyMessages: [
      { label: 'European coaching', quotes: [quote('European Coaching in Dubai', 'bio')] },
      {
        label: 'patient coaches',
        basis: 'praise',
        quotes: [quote('Both coaches are patient, well organised', 'review:1', REVIEW_A.author)]
      }
    ],
    subTrade: {
      id: 'coaching',
      quotes: [
        quote('European Coaching in Dubai', 'bio'),
        quote('padel coaching with Alex and Sam', 'review:1', REVIEW_A.author),
        quote('Lovely coaches who teach my two daughters tennis', 'review:2', REVIEW_B.author)
      ]
    }
  }
  const r = readingWithoutHeldReviews(read, { names: ['Alex'], held: reviewsNamingHeld(g.reviews, ['Alex']) })
  assert.deepEqual(
    r.subTrade.quotes.map((x) => x.quote),
    ['European Coaching in Dubai', 'Lovely coaches who teach my two daughters tennis']
  )
  assert.deepEqual(
    r.audience.map((a) => a.label),
    ['parents of girls']
  )
  assert.deepEqual(
    r.keyMessages.map((m) => m.label),
    ['European coaching']
  )
  assert.deepEqual(
    r.services.map((s) => s.label),
    ['Swimming Lessons']
  )
  // The held person's own entry stays, named and where it was read, never with the held review's words.
  assert.deepEqual(
    r.team.map((p) => [p.label, p.source.author, 'quote' in p]),
    [['Alex', REVIEW_A.author, false]]
  )
  // Without held names or reviews, the reading is as it was.
  assert.equal(readingWithoutHeldReviews(read, {}), read)
})

test('3. the kind of business and every other quote pick evidence from owner text and usable reviews only', () => {
  const brief = heldBrief()
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  assert.equal(brief.business.subTrade.id, 'coaching')
  assert.deepEqual(
    brief.business.subTrade.quotes.map((x) => x.quote),
    ['European Coaching in Dubai']
  )
  const md = renderBriefMarkdown(brief)
  assert.match(
    md,
    /- Kind of business: "coaching" \(read from the business's own texts: bio: "European Coaching in Dubai"\)/
  )
  // The whole brief, its markdown with the review sources and the agent prompt quote no held review.
  // Held entries included (#1791, 28/10/2026): a held person's fact and team entry name them and where they were read,
  // never with a held review's words, so every string of the brief JSON is checked.
  const json = strings(brief).filter(([, s]) => quotesHeld(s))
  assert.deepEqual(json, [])
  const heldFacts = brief.facts.filter((f) => f.field === 'team' && f.onSite === false)
  assert.deepEqual(
    heldFacts.map((f) => [f.value.name, f.evidence.length > 0, f.evidence.some((e) => 'quote' in e)]),
    [['Alex', true, false]]
  )
  assert.deepEqual(
    brief.reading.team.map((p) => [p.label, p.factId === heldFacts[0].id, 'quote' in p]),
    [['Alex', true, false]]
  )
  const full = renderBriefWithReviews(domain, brief)
  const prompt = renderAgentPrompt({ revision: { id: 'r', n: 1, cms: 'wordpress', brief } })
  for (const [what, text] of [
    ['markdown', full],
    ['prompt', prompt]
  ])
    for (const l of text.split('\n')) assert.ok(!quotesHeld(l), `${what}: ${l}`)
  // The usable review still reaches the testimonials, word for word.
  assert.ok(full.includes(JSON.stringify(REVIEW_B.text)))
})

test('2. while the name is held, the business name and the heading are the neutral identity', () => {
  const brief = heldBrief()
  assert.equal(brief.facts.find((f) => f.field === 'name').onSite, false)
  assert.equal(brief.business.name, NEUTRAL)
  assert.equal(siteNameOf(brief), NEUTRAL)
  // The held name stays only where the brief marks it held: its fact (off the site) and its Missing entry.
  const named = strings(brief).filter(([, s]) => s.includes(SERVICE_NAME))
  for (const [path] of named) assert.match(path, /^(facts\[\d+\]|missing\[\d+\])\./, `held name at ${path}`)
  assert.ok(brief.facts.some((f) => f.field === 'name' && f.value === SERVICE_NAME && f.onSite === false))
  const md = renderBriefMarkdown(brief)
  const [heading] = md.split('\n')
  assert.equal(heading, `# Site brief: "${NEUTRAL}" (business name withheld)`)
  assert.match(
    md,
    /- Name: withheld until the owner confirms it \(see Missing: name\); the site goes by "Coaching team in Dubai" and writes no business name in the copy, page title or meta description/
  )
  // In the markdown the held name shows only where it is said to be held.
  for (const l of md.split('\n').filter((l) => l.includes(SERVICE_NAME)))
    assert.match(l, /off the site|write no business name|Sources call the business|^\s+- google:/, l)
})

test('2. a brief stored with the held name as its business name renders the neutral identity too', () => {
  const brief = heldBrief()
  const stored = { ...brief, business: { ...brief.business, name: SERVICE_NAME } }
  const md = renderBriefMarkdown(stored)
  assert.equal(md.split('\n')[0], `# Site brief: "${NEUTRAL}" (business name withheld)`)
  assert.ok(!md.split('\n').some((l) => l.startsWith('- Name:') && l.includes(SERVICE_NAME)))
})

test('2. counter-case: a name on the site is the business name and the heading', () => {
  const brief = heldBrief()
  const named = {
    ...brief,
    business: { ...brief.business, name: SERVICE_NAME },
    facts: brief.facts.map((f) => (f.field === 'name' ? { ...f, onSite: true } : f))
  }
  const md = renderBriefMarkdown(named)
  assert.equal(md.split('\n')[0], `# Site brief: "${SERVICE_NAME}"`)
  assert.match(md, new RegExp(`- Name: "${SERVICE_NAME}"\\n`))
})

test('4. nameHeld is an object {missing, reasons} wherever the brief says the name is held', () => {
  const brief = heldBrief()
  assert.deepEqual(brief.brand.nameHeld, { missing: 'name', reasons: ['name-differs-from-own-marks'] })
  const md = renderBriefMarkdown(brief)
  assert.match(md, /- Name: none while the business name is held/)
  // Counter-case: no nameHeld on a brand whose name is on the site.
  const named = renderBriefMarkdown({ ...brief, brand: { ...brief.brand, nameHeld: undefined, name: 'X' } })
  assert.ok(!/- Name: none while the business name is held/.test(named))
})
