// The business reading's model proposes what customers say sets the business apart (spec TracyHQ/tracy#189): the code
// keeps only a theme on verbatim quotes of two different reviews with a specific line, and the hero headline says it.
// Without a model the hero falls back to the themes read in code. A stub model; every business below is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readBusiness } from '../src/business-reading.js'
import { findUsp } from '../domain/hero-usp.mjs'

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
