// The kept USP theme reaches the brief and the hero (owner decision 09/11/2026): the business reading's ladder keeps at
// least one theme (`business-reading.mjs checkUspThemesOf`), and the brief carries it to its reading, its hero and its
// markdown, checked again against the reviews the site may show (`hero-usp.mjs checkUspTheme`).
// Every business, person and text here is fictional (Harbour Sport Club fixture).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildBrief, heroUspOf, renderBriefMarkdown, validateBrief } from '../domain/brief.mjs'
import { checkBusinessReading, readingSourcesOf } from '../domain/business-reading.mjs'
import { renderAgentPrompt } from '../domain/agent-prompt.mjs'
import { readingWithoutHeldReviews, reviewsNamingHeld } from '../domain/held-reviews.mjs'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const g = HSC.profile.googlePlace
const SOURCES = readingSourcesOf({
  bio: HSC.profile.bio,
  posts: HSC.posts,
  reviews: g.reviews.map((r) => ({ ...r, source: 'google' }))
})
const QUOTE = 'Our kids take tennis lessons with the same team'
const FAMILY = {
  label: 'one team for the whole family',
  line: 'The same team coaches the whole family',
  accent: 'whole family',
  who: 'kids and adults',
  quotes: [{ quote: QUOTE, ref: 'review:1' }]
}
const GENERIC = {
  label: 'friendly coaches',
  line: 'Friendly and professional coaches',
  quotes: [{ quote: 'friendly, professional padel lessons', ref: 'review:1' }]
}
const ANSWER = {
  services: [{ name: 'Swimming Lessons', quote: 'Swimming Lessons', ref: 'bio' }],
  story: [{ text: 'European Coaching in Dubai', quote: 'European Coaching in Dubai', ref: 'bio' }],
  keyMessages: [{ label: 'European coaching', quotes: [{ quote: 'European Coaching in Dubai', ref: 'bio' }] }]
}
const readingOf = (answer) => ({
  method: 'model',
  ...checkBusinessReading(JSON.stringify(answer), SOURCES, { trade: 'fitness' })
})
const hscBrief = (answer) =>
  buildBrief({
    opportunity: HSC.opportunity,
    profile: { ...HSC.profile, businessReading: readingOf(answer) },
    googlePlace: g,
    sources: [],
    media: HSC.media,
    posts: HSC.posts,
    brand: HSC.brand,
    madeAt: HSC.madeAt
  })
const heroOf = (brief) => brief.sitemap[0].sections.find((s) => s.kind === 'hero')

test('the brief carries the kept USP theme with its rung and quotes, and the dropped ones with why', () => {
  const brief = hscBrief({ ...ANSWER, uspThemes: [FAMILY, GENERIC] })
  assert.deepEqual(validateBrief(brief), { ok: true, errors: [] })
  const [theme, ...others] = brief.reading.uspThemes
  assert.equal(others.length, 0)
  assert.equal(theme.line, 'The same team coaches the whole family')
  assert.equal(theme.basis, 'one-review')
  assert.equal(theme.who, 'kids and adults')
  assert.deepEqual(
    theme.quotes.map((x) => [x.quote, x.source.kind]),
    [[QUOTE, 'review']]
  )
  assert.ok(theme.quotes[0].source.ref, 'each quote keeps the ref of the text it was read in')
  assert.deepEqual(brief.reading.uspThemesDropped, [{ label: 'friendly coaches', why: 'generic_line' }])
})

test('a reading without USP themes gives no uspThemes key; the hero falls back to a theme read in code', () => {
  const brief = hscBrief(ANSWER)
  assert.equal('uspThemes' in brief.reading, false)
  assert.equal('uspThemesDropped' in brief.reading, false)
  assert.doesNotMatch(renderBriefMarkdown(brief), /What sets it apart/)
  // Two reviews of the fixture say children and adults learn with the same people (`REVIEW_THEMES` whole-family).
  const usp = heroOf(brief).usp
  assert.equal(usp.id, 'whole-family')
  assert.equal('basis' in usp, false)
  assert.equal(usp.evidence.length, 2)
  assert.ok(usp.evidence.every((e) => e.kind === 'review' && g.reviews.some((r) => r.text.includes(e.quote))))
})

test('the hero says the kept theme line, rests on its quotes only, and the brief and prompt ask for it', () => {
  const brief = hscBrief({ ...ANSWER, uspThemes: [FAMILY] })
  const usp = heroOf(brief).usp
  assert.equal(usp.kind, 'review-theme')
  assert.equal(usp.line, 'The same team coaches the whole family')
  assert.equal(usp.basis, 'one-review')
  assert.deepEqual(
    usp.evidence.map((e) => [e.kind, e.quote]),
    [['review', QUOTE]]
  )
  assert.ok(
    brief.acceptance.some((a) =>
      a.startsWith(
        `The home page's hero heading says "The same team coaches the whole family", word for word`
      )
    )
  )
  const md = renderBriefMarkdown(brief)
  assert.match(
    md,
    /## What sets it apart\n.*\n- "The same team coaches the whole family" \(said in one review, for "kids and adults"\)\n {2}- review by Google reviewer A: "Our kids take tennis lessons with the same team"/
  )
  assert.match(
    md,
    /- USP statement \(the hero's main heading, word for word; the copy above is its lead\): "The same team coaches the whole family" \(said in one review\)\n {4}- Rests on review by Google reviewer A: "Our kids take tennis lessons with the same team"/
  )
  const prompt = renderAgentPrompt({ revision: { cms: 'wordpress', brief, briefMarkdown: md } })
  assert.match(
    prompt,
    /hero's main heading is the brief's USP statement, word for word: "The same team coaches the whole family"/
  )
})

test('a theme that fails the USP gate is not the hero: its quote must be in a review the site may show', () => {
  const theme = readingOf({ ...ANSWER, uspThemes: [FAMILY] }).uspThemes[0]
  const input = {
    business: { trade: 'fitness' },
    reading: { services: [], uspThemes: [theme] },
    places: ['Dubai']
  }
  assert.equal(heroUspOf({ ...input, reviews: g.reviews }).line, 'The same team coaches the whole family')
  // The review it quotes is not one the site may show (held, or gone), and one review is too few for the themes read in
  // code: nothing passes, nothing is invented.
  assert.equal(heroUspOf({ ...input, reviews: g.reviews.slice(1) }), null)
  // Without its rung, one review is not enough: the theme read in code from two reviews is the USP instead.
  const unranked = heroUspOf({
    ...input,
    reading: { uspThemes: [{ ...theme, basis: undefined }] },
    reviews: g.reviews
  })
  assert.equal(unranked.id, 'whole-family')
  assert.notEqual(unranked.line, theme.line)
})

test('a USP theme drops the quote of a review that names someone held off the site, and goes when none is left', () => {
  const reading = readingOf({ ...ANSWER, uspThemes: [FAMILY] })
  const held = reviewsNamingHeld(g.reviews, ['Sam'])
  assert.equal(readingWithoutHeldReviews(reading, { names: ['Sam'], held }).uspThemes.length, 0)
  // Counter-case: nobody held, the theme stays whole.
  const kept = readingWithoutHeldReviews(reading, { names: ['Nobody Held'], held: [] }).uspThemes
  assert.deepEqual(
    kept.map((t) => t.quotes.map((x) => x.quote)),
    [[QUOTE]]
  )
})
