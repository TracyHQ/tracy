// A business's sub-trade decides the words its brief speaks in (`sub-trades.mjs`). Harbour Sport Club (dev, 26/10/2026)
// is a coaching team teaching tennis, padel and swimming at venues across Dubai; Google files it as `sports_club`, so
// its brief called it a gym ("Who the gym is for", "book a class"). The fixture is its real research; three small
// businesses of the same trade (a gym, a yoga studio, a club with its own courts) prove the rule is not tuned to it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildBrief, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { renderAgentPrompt } from '../domain/agent-prompt.mjs'
import {
  businessReadingPrompt,
  checkBusinessReading,
  readingFactsOf,
  readingSourcesOf
} from '../domain/business-reading.mjs'
import { decideSubTrade, SUB_TRADES, subTradeOfGoogleTypes } from '../domain/sub-trades.mjs'
import { otherKindWords, SUB_TRADE_WORDS, tradeWords } from '../domain/trade-words.mjs'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const LOGO = HSC.brand.logo
const GYM_WORDS = /\bgym\b|\bgym's\b|\bclass\b|\bclasses\b|\bschedule\b|gym floor/i

/** The reading inputs of a business, as the research step hands them over (`place-executor.js readBusinessOf`). */
function inputsOf(b) {
  const g = b.profile.googlePlace
  return {
    sources: readingSourcesOf({
      bio: b.profile.bio,
      posts: b.posts,
      reviews: (g?.reviews ?? []).map((r) => ({ ...r, source: 'google' }))
    }),
    facts: readingFactsOf({
      googleTypes: [g?.primaryType, ...(g?.types ?? [])],
      categories: b.instagramCategory ? [{ source: 'instagram', text: b.instagramCategory }] : []
    })
  }
}

/** The reading a model answer leaves once code has checked it, with the trade the research gave. */
function readingOf(b, answer, trade = 'fitness') {
  const { sources, facts } = inputsOf(b)
  return { method: 'model', ...checkBusinessReading(JSON.stringify(answer), sources, { trade, facts }) }
}

const briefOf = (b, reading) =>
  buildBrief({
    opportunity: b.opportunity,
    profile: { ...b.profile, ...(reading ? { businessReading: reading } : {}) },
    googlePlace: b.profile.googlePlace,
    sources: [],
    media: b.media ?? [],
    posts: b.posts,
    brand: b.brand ?? null,
    madeAt: b.madeAt
  })

/** The brief's own words: every line but the quoted source text (`> …`), which is the business's, not the brief's. */
const ownLines = (md) =>
  md
    .split('\n')
    .filter((l) => !l.startsWith('>'))
    .join('\n')
    // A CSS class of the template is no trade word.
    .replaceAll('`tracy-sec-<name>` class', '')

const HSC_POST_LESSONS = 'post:instagram:3700000000000000004'
const HSC_ANSWER = {
  services: [{ name: 'Swimming Lessons', quote: 'Swimming Lessons', ref: 'bio' }],
  audience: [],
  team: [],
  story: [{ text: 'European Coaching in Dubai', quote: 'European Coaching in Dubai', ref: 'bio' }],
  serviceAreas: [],
  subTrade: {
    id: 'coaching',
    quotes: [
      { quote: 'Personal Coach', ref: 'category:instagram' },
      { quote: 'European Coaching in Dubai', ref: 'bio' },
      { quote: 'DM for lessons!', ref: HSC_POST_LESSONS }
    ]
  }
}

test('the reading prompt lists the trade’s kinds of business and the facts the pick may quote', () => {
  const { sources, facts } = inputsOf(HSC)
  const prompt = businessReadingPrompt(sources, { name: 'Harbour Sport Club', trade: 'fitness', facts })
  for (const c of SUB_TRADES.fitness) assert.match(prompt, new RegExp(`^- ${c.id}: `, 'm'))
  assert.match(prompt, /\[google:types\] \(google-types\)\n"sports_club, association_or_organization"/)
  assert.match(prompt, /\[category:instagram\] \(category on instagram\)\n"Personal Coach"/)
  // A trade without sub-trades asks for none.
  assert.doesNotMatch(businessReadingPrompt(sources, { trade: 'retail', facts }), /Kinds of business/)
})

test('a model pick whose quotes all stand becomes the sub-trade, with its quotes and sources', () => {
  const reading = readingOf(HSC, HSC_ANSWER)
  assert.equal(reading.subTrade.id, 'coaching')
  assert.deepEqual(
    reading.subTrade.quotes.map((q) => [q.quote, q.source.ref]),
    [
      ['Personal Coach', 'category:instagram'],
      ['European Coaching in Dubai', 'bio'],
      ['DM for lessons!', HSC_POST_LESSONS]
    ]
  )
  const brief = briefOf(HSC, reading)
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  assert.equal(brief.business.trade, 'fitness')
  assert.equal(brief.business.subTrade.id, 'coaching')
  assert.equal(brief.business.subTrade.method, 'model')
})

test('a pick with a quote that is not in its source is dropped: the Google type table decides', () => {
  const forged = {
    ...HSC_ANSWER,
    subTrade: {
      id: 'coaching',
      quotes: [
        { quote: 'Personal Coach', ref: 'category:instagram' },
        { quote: 'Private tennis lessons at your villa', ref: 'bio' }
      ]
    }
  }
  const reading = readingOf(HSC, forged)
  assert.equal(reading.subTrade, undefined)
  assert.equal(reading.subTradeDropped, 'unquoted')
  // The same forged pick on a business Google files as a gym: the table says gym.
  const gym = { ...GYM, posts: [] }
  const gymReading = readingOf(gym, {
    subTrade: { id: 'coaching', quotes: [{ quote: 'private tennis lessons', ref: 'bio' }] }
  })
  assert.equal(gymReading.subTradeDropped, 'unquoted')
  assert.deepEqual(briefOf(gym, gymReading).business.subTrade, { id: 'gym', method: 'table', quotes: [] })
})

test('the name alone is never evidence, and an id off the trade’s list is dropped', () => {
  const byName = readingOf(HSC, {
    subTrade: { id: 'club', quotes: [{ quote: 'Harbour Sport Club', ref: 'name' }] }
  })
  assert.equal(byName.subTradeDropped, 'unquoted')
  assert.equal(readingOf(HSC, { subTrade: { id: 'dentist', quotes: [] } }).subTradeDropped, 'unknown-id')
})

test('sports_club with no usable model answer keeps the fitness words', () => {
  assert.equal(subTradeOfGoogleTypes('fitness', HSC.profile.googlePlace), null)
  for (const reading of [
    null,
    { method: 'rules', services: [], audience: [], team: [], story: [], serviceAreas: [] }
  ]) {
    const brief = briefOf(HSC, reading)
    assert.deepEqual(brief.business.subTrade, { id: null, method: 'trade', quotes: [] })
    assert.match(renderBriefMarkdown(brief), /Content from the gym's own posts/)
  }
})

test('Harbour Sport Club as coaching: no gym, class or schedule word in the brief or the build prompt', () => {
  const brief = briefOf(HSC, readingOf(HSC, HSC_ANSWER))
  const md = renderBriefMarkdown(brief)
  const own = ownLines(md)
  assert.doesNotMatch(own, GYM_WORDS, own.match(new RegExp(`.*(${GYM_WORDS.source}).*`, 'gim'))?.join('\n'))
  assert.match(own, /## Content from the coaching team's own posts/)
  assert.match(
    own,
    /- Kind of business: "coaching" \(read from the business's own texts: category: "Personal Coach"/
  )
  const prompt = renderAgentPrompt({
    revision: { id: 'r1', n: 1, cms: 'wordpress', brief, brief_md: md },
    sections: { pages: { home: ['team', 'dishes'] }, actions: { team: 'team', dishes: 'dishes' } },
    pictures: { placed: [], people: [{ at: 'home', slot: 'team-1' }] }
  })
  // The one line that names the template's words is the line that forbids them.
  const forbid = prompt
    .split('\n')
    .find((l) => l.includes('The template was made for another kind of business'))
  assert.match(forbid, /"class", "classes" stay nowhere/)
  assert.match(forbid, /a button, a menu entry, a footer menu heading/)
  assert.match(forbid, /"lesson", "lessons", "Book a lesson"/)
  const promptOwn = ownLines(prompt.replace(forbid, ''))
  assert.doesNotMatch(
    promptOwn,
    GYM_WORDS,
    promptOwn.match(new RegExp(`.*(${GYM_WORDS.source}).*`, 'gim'))?.join('\n')
  )
  assert.match(promptOwn, /lessons/)
})

// Three other fitness businesses, each with the evidence a model would quote, and what Google says of them.
const small = (name, primaryType, types, bio, posts, category) => ({
  opportunity: {
    id: `o-${name}`,
    name,
    candidate: { provider: 'google-places', providerId: name, trade: 'fitness', primaryType }
  },
  instagramCategory: category,
  profile: {
    name,
    bio,
    phone: '+1 555 0100',
    address: '1 Main Street',
    socials: {},
    provenance: { phone: { source: 'google-places' } },
    googlePlace: { placeId: name, primaryType, types: [primaryType, ...types], reviews: [] }
  },
  posts: posts.map((caption, i) => ({
    id: `p${i}`,
    source: 'instagram',
    url: `https://www.instagram.com/p/${i}/`,
    caption
  })),
  madeAt: '2026-10-27T08:00:00.000Z'
})
const GYM = small(
  'Iron Works',
  'gym',
  ['health'],
  'Open gym floor, free weights and one to one coaching',
  ['New squat racks on the gym floor'],
  'Gym/Physical Fitness Center'
)
const YOGA = small(
  'Lotus Room',
  'yoga_studio',
  [],
  'Hatha and vinyasa yoga classes every day',
  ['Sunrise flow class at 7am'],
  'Yoga Studio'
)
const COURTS = small(
  'Westside Racquet Club',
  'sports_club',
  [],
  'Six clay courts and a 25m pool for our members',
  ['Court 3 resurfaced this week'],
  'Sports Club'
)

const CASES = [
  { b: GYM, id: 'gym', quote: 'Open gym floor', noun: 'gym' },
  { b: YOGA, id: 'studio', quote: 'yoga classes every day', noun: 'studio' },
  { b: COURTS, id: 'club', quote: 'Six clay courts and a 25m pool', noun: 'club' }
]

for (const c of CASES)
  test(`${c.b.profile.name}: the model's quoted pick gives its own words (${c.id})`, () => {
    const reading = readingOf(c.b, { subTrade: { id: c.id, quotes: [{ quote: c.quote, ref: 'bio' }] } })
    const brief = briefOf(c.b, reading)
    assert.deepEqual(brief.business.subTrade.id, c.id)
    assert.equal(brief.business.subTrade.method, 'model')
    assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
    assert.match(renderBriefMarkdown(brief), new RegExp(`keeps the ${c.noun}'s words`))
    assert.equal(tradeWords('fitness', c.id), SUB_TRADE_WORDS.fitness[c.id])
  })

test('without a model, Google types settle a gym and a yoga studio, never a sports club', () => {
  assert.deepEqual(decideSubTrade({ trade: 'fitness', googlePlace: GYM.profile.googlePlace }).id, 'gym')
  assert.deepEqual(decideSubTrade({ trade: 'fitness', googlePlace: YOGA.profile.googlePlace }).id, 'studio')
  assert.deepEqual(decideSubTrade({ trade: 'fitness', googlePlace: COURTS.profile.googlePlace }), {
    id: null,
    method: 'trade',
    quotes: []
  })
  assert.equal(decideSubTrade({ trade: 'beauty', googlePlace: { primaryType: 'barber_shop' } }).id, 'barber')
  assert.equal(decideSubTrade({ trade: 'health', googlePlace: { primaryType: 'veterinary_care' } }).id, 'vet')
  // A trade without sub-trades has none, and its brief carries none.
  assert.equal(decideSubTrade({ trade: 'retail', googlePlace: { primaryType: 'store' } }), null)
  assert.equal(decideSubTrade({ trade: 'food' }), null)
})

test('every sub-trade has its own word set, of the shape of its trade’s', () => {
  for (const [trade, list] of Object.entries(SUB_TRADES))
    for (const { id } of list) {
      const w = SUB_TRADE_WORDS[trade][id]
      assert.ok(w, `${trade}.${id}`)
      assert.deepEqual(Object.keys(w).sort(), [...Object.keys(tradeWords(trade)), 'subTrade'].sort())
      assert.equal(w.itemKind, tradeWords(trade).itemKind)
    }
  // An unknown sub-trade, or one of another trade, is ignored.
  assert.equal(tradeWords('fitness', 'dentist'), tradeWords('fitness'))
})

test('the gallery, like the hero, holds photographs only: no logo, no profile picture', () => {
  const brief = briefOf(HSC, null)
  const gallery = brief.sitemap.flatMap((p) => p.sections).find((s) => s.kind === 'gallery')
  assert.ok(gallery.assetIds.length >= 4)
  assert.ok(!gallery.assetIds.includes(LOGO), 'the logo is not in the gallery')
  const profilePictures = HSC.media.filter((m) => /\/t51\.\d+-19\//.test(m.sourceUrl ?? '')).map((m) => m.id)
  assert.ok(profilePictures.length > 0)
  for (const id of profilePictures)
    assert.ok(!gallery.assetIds.includes(id), `profile picture ${id} in the gallery`)
  for (const s of brief.sitemap.flatMap((p) => p.sections))
    assert.ok(!s.assetIds.includes(LOGO), `${s.kind} holds the logo`)
  // The logo is still an asset of the brief: it is shown as the logo.
  assert.ok(brief.assets.some((a) => a.id === LOGO))
})

test('a profile picture that is no logo stays out of the gallery too', () => {
  const pic = (id, url) => ({
    id,
    kind: 'image',
    category: 'other',
    width: 800,
    height: 600,
    sourceUrl: url,
    sha256: id
  })
  const media = [
    pic('avatar', 'https://scontent.cdninstagram.com/v/t51.2885-19/1_n.jpg'),
    pic('fb-avatar', 'https://scontent.xx.fbcdn.net/v/t39.30808-1/2_n.jpg'),
    ...['a', 'b', 'c', 'd'].map((x) => pic(x, `https://scontent.cdninstagram.com/v/t51.2885-15/${x}_n.jpg`))
  ]
  const brief = briefOf({ ...GYM, media, brand: null }, null)
  const gallery = brief.sitemap.flatMap((p) => p.sections).find((s) => s.kind === 'gallery')
  assert.deepEqual(gallery.assetIds, ['a', 'b', 'c', 'd'])
})

test('the template’s words of another kind of business are named only where the business does not use them', () => {
  assert.deepEqual(otherKindWords('fitness', 'coaching'), ['class', 'classes'])
  assert.deepEqual(otherKindWords('fitness', 'club'), ['class', 'classes'])
  assert.deepEqual(otherKindWords('beauty', 'spa'), [])
  assert.deepEqual(otherKindWords('beauty', 'barber'), [])
  // Counter-cases: a business that speaks the template's words, and one whose sub-trade nothing decided.
  assert.deepEqual(otherKindWords('fitness', 'gym'), [])
  assert.deepEqual(otherKindWords('fitness', 'studio'), [])
  assert.deepEqual(otherKindWords('fitness', null), [])
  assert.deepEqual(otherKindWords('food', 'gym'), [])
  const promptOf = (b, id) => {
    const reading = readingOf(b, {
      subTrade: { id, quotes: [{ quote: CASES.find((c) => c.id === id).quote, ref: 'bio' }] }
    })
    const brief = briefOf(b, reading)
    return renderAgentPrompt({
      revision: { id: 'r1', n: 1, cms: 'joomla', brief, brief_md: renderBriefMarkdown(brief) }
    })
  }
  assert.match(
    promptOf(COURTS, 'club'),
    /its words "class", "classes" stay nowhere.*"activity", "activities", "Book a session"/
  )
  assert.doesNotMatch(promptOf(YOGA, 'studio'), /made for another kind of business/)
  assert.doesNotMatch(promptOf(GYM, 'gym'), /made for another kind of business/)
})
