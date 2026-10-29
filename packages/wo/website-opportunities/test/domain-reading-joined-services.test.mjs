// A service line that joins two offerings ("Tennis & Padel") keeps every offering the texts show (F10). The model may
// split the line or keep one part beside a post's wording ("Padel sessions"); code then makes sure no part the business
// lists itself is lost, and never adds a part no text names.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  checkBusinessReading,
  readBusinessByRules,
  readingSourcesOf,
  withListedServiceParts
} from '../domain/business-reading.mjs'
import { readBusiness } from '../src/business-reading.js'

const HSC = JSON.parse(
  readFileSync(new URL('./fixtures/sub-trade/harbour-sport-club.json', import.meta.url), 'utf8')
)
const SOURCES = readingSourcesOf({
  bio: HSC.profile.bio,
  posts: HSC.posts,
  reviews: HSC.profile.googlePlace.reviews.map((r) => ({ ...r, source: 'google' }))
})
const POST_PADEL = 'post:instagram:3700000000000000001'
const labels = (reading) => reading.services.map((s) => s.label)
const read = (services, sources = SOURCES) =>
  checkBusinessReading(JSON.stringify({ services }), sources, { trade: 'fitness' })

test('a bio line "Tennis & Padel" keeps Tennis when the model kept only a padel service', () => {
  const reading = read([
    { name: 'Padel sessions', quote: 'Join our padel sessions in Dubai!', ref: POST_PADEL },
    { name: 'Swimming Lessons', quote: 'Swimming Lessons', ref: 'bio' }
  ])
  assert.deepEqual(labels(reading), [
    'Padel sessions',
    'Swimming Lessons',
    'Tennis',
    'Customized fitness lessons'
  ])
  const tennis = reading.services.find((s) => s.label === 'Tennis')
  assert.equal(tennis.source.ref, 'bio')
  assert.equal(tennis.quote, 'Tennis & Padel')
  assert.equal(tennis.kind, 'service')
  // The posts that name tennis stand behind it as mentions, each a verbatim line of its own post.
  assert.ok(tennis.mentions.length >= 2, JSON.stringify(tennis.mentions))
  for (const m of tennis.mentions) {
    const post = SOURCES.find((s) => s.ref === m.source.ref)
    assert.equal(post.kind === 'bio', false)
    assert.ok(post.text.includes(m.quote))
    assert.match(m.quote, /tennis/i)
  }
})

test('both parts are kept when the model listed neither, and a part already covered is not repeated', () => {
  const none = read([{ name: 'Swimming Lessons', quote: 'Swimming Lessons', ref: 'bio' }])
  assert.deepEqual(labels(none), ['Swimming Lessons', 'Tennis', 'Padel', 'Customized fitness lessons'])
  const split = read([
    { name: 'Tennis', quote: 'Tennis & Padel', ref: 'bio' },
    { name: 'Padel', quote: 'Tennis & Padel', ref: 'bio' }
  ])
  assert.deepEqual(labels(split), ['Tennis', 'Padel', 'Customized fitness lessons'])
  // The model kept the joined label whole: nothing is added.
  const whole = read([{ name: 'Tennis & Padel', quote: 'Tennis & Padel', ref: 'bio' }])
  assert.deepEqual(labels(whole), ['Tennis & Padel', 'Customized fitness lessons'])
})

test('a part no text names is never invented, and a line that joins nothing adds nothing', () => {
  // A studio whose bio lists one offering on its own line, and whose posts name pilates twice: code splits only a
  // joined line the business lists, so neither the single line nor the posts' theme becomes a service by code.
  const sources = readingSourcesOf({
    bio: '🧘 Yoga Classes\n📍 Studio in Lisbon',
    posts: [
      { source: 'instagram', id: 'y1', caption: 'Pilates this Saturday morning.' },
      { source: 'instagram', id: 'y2', caption: 'More pilates next week.' }
    ]
  })
  assert.deepEqual(labels(read([], sources)), [])
  // A joined bio line of phone numbers is no service line.
  const odd = readingSourcesOf({ bio: '📱 +351 900 000 000 & +351 900 000 001' })
  assert.deepEqual(labels(read([], odd)), [])
  // A joined line names only its own parts: nothing beyond "Hair" and "Nails" is added.
  const salon = readingSourcesOf({ bio: '💇 Hair & Nails\n📍 Salon in Lisbon' })
  assert.deepEqual(labels(read([], salon)), ['Hair', 'Nails'])
})

test('applying it again changes nothing, and the rules reading (one joined item) is left as it is', () => {
  const once = read([{ name: 'Padel sessions', quote: 'Join our padel sessions in Dubai!', ref: POST_PADEL }])
  assert.deepEqual(withListedServiceParts(once.services, SOURCES), once.services)
  const rules = readBusinessByRules(SOURCES)
  assert.ok(labels(rules).includes('Tennis & Padel'))
  assert.deepEqual(withListedServiceParts(rules.services, SOURCES), rules.services)
})

test('a reading held from before gets the lost part back without a second model call', async () => {
  const answer = {
    services: [{ name: 'Padel sessions', quote: 'Join our padel sessions in Dubai!', ref: POST_PADEL }],
    primaryAction: { label: 'Request a lesson', channel: 'contact', basis: 'inferred', quotes: [] }
  }
  let calls = 0
  const fetchImpl = async () => {
    calls += 1
    return Response.json({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(answer) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 }
    })
  }
  const input = {
    bio: HSC.profile.bio,
    posts: HSC.posts,
    reviews: [],
    door: { state: 'ready', door: { url: 'https://model.test/chat', key: 'k', model: 'deepseek-v4-pro' } },
    charge: (_spec, call) => call(),
    fetchImpl,
    log: { warn() {} }
  }
  const first = await readBusiness(input)
  assert.equal(first.method, 'model')
  assert.ok(labels(first).includes('Tennis'))
  // The reading as it was stored before this rule: the joined line's second part missing.
  const held = { ...first, services: first.services.filter((s) => s.label !== 'Tennis') }
  const again = await readBusiness({ ...input, held })
  assert.equal(calls, 1, 'the held reading is kept, no second call')
  assert.deepEqual(labels(again).sort(), labels(first).sort())
})
