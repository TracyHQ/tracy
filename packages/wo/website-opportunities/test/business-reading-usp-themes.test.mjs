// The business reading's model proposes what customers say sets the business apart (spec TracyHQ/tracy#189): the code
// keeps only a theme on verbatim quotes of two different reviews with a specific line, and the hero headline says it.
// Without a model the hero falls back to the themes read in code. A stub model; every business below is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readBusiness } from '../src/business-reading.js'
import { checkUspThemesOf } from '../domain/business-reading.mjs'
import { checkUspTheme, findUsp } from '../domain/hero-usp.mjs'

const REVIEWS = [
  { author: 'R. One', text: 'The same coaches teach my son and me. We both improved fast.' },
  { author: 'R. Two', text: 'My daughter and my husband train with the same coaches. Lovely team.' },
  { author: 'R. Three', text: 'They come to our house every Saturday, so easy.' }
]
const RESEARCH = {
  name: 'Tidewater Swim Club',
  bio: 'Swimming lessons in Port Marlow',
  posts: [],
  reviews: REVIEWS
}
const DOOR = {
  state: 'ready',
  door: { url: 'https://api.model.test/chat/completions', key: 'test-key', model: 'stub-model', effort: null }
}

/** One valid theme, one with an invented quote, one on a single review. */
const ANSWER = {
  services: [{ name: 'Swimming lessons', quote: 'Swimming lessons in Port Marlow', ref: 'bio' }],
  uspThemes: [
    {
      label: 'the same coaches teach the whole family',
      line: 'The same coaches for the whole family',
      accent: 'whole family',
      who: 'kids and adults',
      quotes: [
        { quote: 'The same coaches teach my son and me.', ref: 'review:1' },
        { quote: 'My daughter and my husband train with the same coaches.', ref: 'review:2' }
      ]
    },
    {
      label: 'coaches with world titles',
      line: 'Coached by a former world champion',
      quotes: [
        { quote: 'Our coach is a former world champion.', ref: 'review:1' },
        { quote: 'My daughter and my husband train with the same coaches.', ref: 'review:2' }
      ]
    },
    {
      label: 'lessons at your home',
      line: 'We come to you, at your home',
      quotes: [{ quote: 'They come to our house every Saturday, so easy.', ref: 'review:3' }]
    }
  ]
}

function stubModel(content = JSON.stringify(ANSWER)) {
  const seen = []
  const fetchImpl = async (_url, init) => {
    seen.push(JSON.parse(init.body))
    return Response.json({
      id: 'reading-usp',
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content } }],
      usage: { prompt_tokens: 900, completion_tokens: 400 }
    })
  }
  return { fetchImpl, seen }
}

const read = (door, provider) =>
  readBusiness({
    ...RESEARCH,
    trade: 'fitness',
    door,
    charge: (_spec, call) => call(),
    fetchImpl: provider.fetchImpl,
    log: { warn() {} }
  })

test('the model is asked for USP themes, and only the one on verbatim quotes of two reviews is kept', async () => {
  const provider = stubModel()
  const reading = await read(DOOR, provider)
  assert.match(provider.seen[0].messages[0].content, /uspThemes/)
  assert.equal(reading.method, 'model')
  assert.deepEqual(
    reading.uspThemes.map((t) => t.label),
    ['the same coaches teach the whole family']
  )
  const [theme] = reading.uspThemes
  assert.equal(theme.accent, 'whole family')
  assert.deepEqual(
    theme.quotes.map((q) => q.source.ref),
    ['review:1', 'review:2']
  )
})

test('the hero takes the kept model theme, checked again against the brief reviews', async () => {
  const reading = await read(DOOR, stubModel())
  const brief = {
    business: { trade: 'fitness', subTrade: { id: 'coaching' } },
    reading: { uspThemes: reading.uspThemes },
    googlePlace: { reviews: REVIEWS.map((r) => ({ rating: 5, text: r.text })) }
  }
  const found = findUsp(brief, { places: ['Port Marlow'] })
  assert.equal(found.usp.kind, 'review-theme')
  assert.deepEqual(found.usp.headlines, ['The same coaches for the whole family'])
  assert.equal(found.usp.accent, 'whole family')
  // A model theme stood: the themes read in code are not weighed.
  assert.ok(!found.weighed.some((w) => w.label === 'one team for the whole family, children and adults'))
  // A review the brief holds back (no text) takes its quote away: the theme no longer stands on two reviews.
  const held = { ...brief, googlePlace: { reviews: [{ rating: 5, text: REVIEWS[0].text }] } }
  assert.equal(findUsp(held).weighed[0].pass, false)
})

test('without a model the reading has no USP themes, and the hero falls back to the themes read in code', async () => {
  const provider = stubModel()
  const reading = await read({ state: 'not_configured' }, provider)
  assert.equal(provider.seen.length, 0)
  assert.equal(reading.uspThemes, null)
  assert.equal(reading.uspThemesReason, 'rules_not_configured')
  const brief = {
    business: { trade: 'fitness', subTrade: { id: 'coaching' } },
    reading,
    googlePlace: { reviews: REVIEWS.map((r) => ({ rating: 5, text: r.text })) }
  }
  assert.equal(findUsp(brief).usp.id, 'whole-family')
})

// The ladder (owner decision 09/11/2026): two reviews, else one review, else the business's own words; always verbatim.
const TEXTS = [
  {
    ref: 'bio',
    kind: 'bio',
    text: 'Swim lessons in Port Marlow. We come to your home pool, every lesson one to one.'
  },
  { ref: 'post:1', kind: 'post', text: 'Certified coaches only, since 2012.' },
  {
    ref: 'review:1',
    kind: 'review',
    author: 'Ada Quill',
    text: 'The same coaches teach my son and me. Coach Wendel came to our house.'
  },
  {
    ref: 'review:2',
    kind: 'review',
    author: 'Ben Marsh',
    text: 'My daughter and my husband train with the same coaches.'
  },
  {
    ref: 'review:3',
    kind: 'review',
    author: 'Cy Toft',
    text: 'They come to our house every Saturday, so easy.'
  }
]
const BY_REF = new Map(TEXTS.map((t) => [t.ref, t]))
// The review-only names a reading holds (`reviewOnlyNamesOf`): the reviewers, and a coach only reviews name.
const NAMES = [['ada', 'quill'], ['ben', 'marsh'], ['toft'], ['wendel']]
const FAMILY = {
  label: 'the same coaches teach the whole family',
  line: 'The same coaches for the whole family',
  accent: 'whole family',
  quotes: [
    { quote: 'The same coaches teach my son and me.', ref: 'review:1' },
    { quote: 'My daughter and my husband train with the same coaches.', ref: 'review:2' }
  ]
}
const AT_HOME = {
  label: 'lessons at your home',
  line: 'We come to you, at your home',
  quotes: [{ quote: 'They come to our house every Saturday, so easy.', ref: 'review:3' }]
}
const OWNER = {
  label: 'one to one lessons in your pool',
  line: 'One to one lessons at your home pool',
  quotes: [{ quote: 'We come to your home pool, every lesson one to one.', ref: 'bio' }]
}
const ladder = (themes) => checkUspThemesOf(themes, BY_REF, { names: NAMES, others: ['fitness'] })

test('rung 1: a theme two reviews state wins, and the lower rungs are recorded as dropped', () => {
  const out = ladder([AT_HOME, FAMILY, OWNER])
  assert.deepEqual(
    out.kept.map((t) => [t.label, t.basis ?? null]),
    [['the same coaches teach the whole family', null]]
  )
  assert.deepEqual(out.droppedThemes, [
    { label: 'lessons at your home', why: 'one_review' },
    { label: 'one to one lessons in your pool', why: 'owner_only' }
  ])
})

test('rung 2: with no theme two reviews share, a theme one review states is kept with basis one-review', () => {
  const out = ladder([AT_HOME, OWNER])
  assert.deepEqual(
    out.kept.map((t) => [t.label, t.basis]),
    [['lessons at your home', 'one-review']]
  )
  assert.deepEqual(
    out.kept[0].quotes.map((q) => q.source.ref),
    ['review:3']
  )
  assert.deepEqual(out.droppedThemes, [{ label: 'one to one lessons in your pool', why: 'owner_only' }])
})

test("rung 3: with no review theme, the business's own words carry it, with basis owner", () => {
  const out = ladder([OWNER])
  assert.equal(out.kept.length, 1)
  assert.equal(out.kept[0].basis, 'owner')
  assert.equal(out.kept[0].quotes[0].quote, 'We come to your home pool, every lesson one to one.')
  assert.equal(out.kept[0].quotes[0].source.kind, 'bio')
  assert.deepEqual(out.droppedThemes, [])
})

test('a quote naming a review-only person drops that quote only; the theme stands on what is left', () => {
  const named = {
    ...FAMILY,
    quotes: [{ quote: 'Coach Wendel came to our house.', ref: 'review:1' }, ...FAMILY.quotes]
  }
  const out = ladder([named])
  assert.equal(out.kept.length, 1)
  assert.equal(out.kept[0].basis, undefined)
  assert.ok(out.kept[0].quotes.every((q) => !/Wendel/.test(q.quote)))
  assert.equal(out.kept[0].quotes.length, 2)
  // Left with one review, the same theme stands one rung lower.
  const once = ladder([{ ...FAMILY, quotes: [named.quotes[0], FAMILY.quotes[0]] }])
  assert.equal(once.kept[0].basis, 'one-review')
})

test('every theme dropped says why: an invented quote, a generic line, a named person', () => {
  const out = ladder([
    { ...FAMILY, label: 'invented', quotes: [{ quote: 'They won the world title.', ref: 'review:2' }] },
    { ...AT_HOME, label: 'generic', line: 'Friendly and professional coaches' },
    { ...AT_HOME, label: 'named', quotes: [{ quote: 'Coach Wendel came to our house.', ref: 'review:1' }] }
  ])
  assert.deepEqual(out.kept, [])
  assert.deepEqual(out.droppedThemes, [
    { label: 'invented', why: 'quote_not_found' },
    { label: 'generic', why: 'generic_line' },
    { label: 'named', why: 'names_person' }
  ])
})

test('the reading records the dropped themes, and keeps uspThemesReason only when nothing stands', async () => {
  const answer = (themes) =>
    JSON.stringify({
      services: [{ name: 'Swimming lessons', quote: 'Swimming lessons in Port Marlow', ref: 'bio' }],
      uspThemes: themes
    })
  const one = await read(DOOR, stubModel(answer([ANSWER.uspThemes[2]])))
  assert.equal(one.uspThemes[0].basis, 'one-review')
  assert.equal(one.uspThemesReason, undefined)
  const none = await read(DOOR, stubModel(answer([ANSWER.uspThemes[1]])))
  assert.equal(none.uspThemes, null)
  assert.equal(none.uspThemesReason, 'rejected')
  // The one USP retry (the same stub answers it the same way) is recorded after the first pass.
  assert.deepEqual(none.uspThemesDropped, [
    { label: 'coaches with world titles', why: 'quote_not_found' },
    { label: 'coaches with world titles', why: 'retry_rejected', detail: 'quote_not_found' }
  ])
})

test('the prompt asks for the ladder: reviews first, one review next, the business own words last', async () => {
  const provider = stubModel()
  await read(DOOR, provider)
  const system = provider.seen[0].messages[0].content
  assert.match(system, /at least 2 different reviews/)
  assert.match(system, /a single review/)
  assert.match(system, /what the business says about itself in its bio or posts/)
})

test('the hero accepts a one-review or an owner theme the reading kept, quoting only its own quotes', () => {
  const brief = {
    business: { trade: 'fitness', subTrade: { id: 'coaching' } },
    googlePlace: {
      reviews: TEXTS.filter((t) => t.kind === 'review').map((r) => ({ rating: 5, text: r.text }))
    }
  }
  const [oneReview] = ladder([AT_HOME]).kept
  const one = checkUspTheme(oneReview, brief)
  assert.equal(one.pass, true)
  assert.deepEqual(
    one.evidence.map((e) => e.quote),
    ['They come to our house every Saturday, so easy.']
  )
  // Without the basis, the same single review is not enough.
  assert.equal(checkUspTheme({ ...oneReview, basis: undefined }, brief).pass, false)
  const [owner] = ladder([OWNER]).kept
  const own = checkUspTheme(owner, brief)
  assert.equal(own.pass, true)
  assert.deepEqual(own.evidence, [
    { kind: 'owner', source: 'bio', quote: 'We come to your home pool, every lesson one to one.' }
  ])
  // An owner theme whose quote is a review is refused.
  const borrowed = { ...owner, quotes: [{ quote: AT_HOME.quotes[0].quote, source: { kind: 'review' } }] }
  assert.equal(checkUspTheme(borrowed, brief).pass, false)
  const found = findUsp({ ...brief, reading: { uspThemes: [owner] } }, { places: ['Port Marlow'] })
  assert.equal(found.usp.headlines[0], 'One to one lessons at your home pool')
})
