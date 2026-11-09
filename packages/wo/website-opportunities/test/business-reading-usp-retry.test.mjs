// The reading's one USP retry (owner rule 09/11/2026): when every theme the model proposed is dropped, or none was, one
// short call on the reviews and the bio asks again for one theme, told what was dropped and why, and its answer passes
// the same ladder. Measured on dev the same day: the only theme quoted a review-only person and nothing was left.
// A stub model answers each call in turn; every business and person below is made up.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readBusiness } from '../src/business-reading.js'
import { USP_RETRY_SYSTEM, uspRetryPrompt, withUspRetry } from '../domain/business-reading.mjs'

const REVIEWS = [
  { author: 'R. One', text: 'Coach Wendel adapts every lesson to our different levels.' },
  { author: 'R. Two', text: 'They come to our house every Saturday, so easy.' },
  { author: 'R. Three', text: 'Good lessons, nice pool.' }
]
const RESEARCH = {
  name: 'Tidewater Swim Club',
  bio: 'Swimming lessons in Port Marlow',
  posts: [{ id: 'p1', source: 'instagram', caption: 'Summer timetable is out.' }],
  reviews: REVIEWS
}
const DOOR = {
  state: 'ready',
  door: { url: 'https://api.model.test/chat/completions', key: 'test-key', model: 'stub-model', effort: null }
}
const FIRST = {
  services: [{ name: 'Swimming lessons', quote: 'Swimming lessons in Port Marlow', ref: 'bio' }],
  team: [{ name: 'Wendel', role: 'coach', quote: 'Coach Wendel adapts every lesson', ref: 'review:1' }],
  uspThemes: [
    {
      label: 'coach adapts to different levels',
      line: 'Lessons adapted one to one to your level',
      quotes: [{ quote: 'Coach Wendel adapts every lesson to our different levels.', ref: 'review:1' }]
    }
  ]
}
const AT_HOME = {
  uspThemes: [
    {
      label: 'lessons at your home',
      line: 'We come to you, at your home',
      quotes: [{ quote: 'They come to our house every Saturday, so easy.', ref: 'review:2' }]
    }
  ]
}

/** A model that answers each call with the next content. */
function stubModel(...contents) {
  const seen = []
  const fetchImpl = async (_url, init) => {
    seen.push(JSON.parse(init.body))
    const content = contents[Math.min(seen.length - 1, contents.length - 1)]
    return Response.json({
      id: `call-${seen.length}`,
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 300, completion_tokens: 80 }
    })
  }
  return { fetchImpl, seen }
}

const read = (provider, held = null) =>
  readBusiness({
    ...RESEARCH,
    trade: 'fitness',
    door: DOOR,
    held,
    charge: (_spec, call) => call(),
    fetchImpl: provider.fetchImpl,
    log: { warn() {} }
  })

test('every theme dropped: one retry on the reviews and bio, told why, keeps a one-review theme', async () => {
  const provider = stubModel(FIRST, AT_HOME)
  const reading = await read(provider)
  assert.equal(provider.seen.length, 2)
  const retry = provider.seen[1].messages
  assert.equal(retry[0].content, USP_RETRY_SYSTEM)
  assert.match(retry[1].content, /"coach adapts to different levels": its quote or line named a person/)
  // Reviews and the bio only: no post reaches the retry.
  assert.match(retry[1].content, /\[bio\]/)
  assert.match(retry[1].content, /\[review:2\]/)
  assert.doesNotMatch(retry[1].content, /Summer timetable/)
  assert.deepEqual(
    reading.uspThemes.map((t) => [t.line, t.basis]),
    [['We come to you, at your home', 'one-review']]
  )
  assert.equal(reading.uspThemesReason, undefined)
  assert.equal(reading.uspRetry, 'kept')
  assert.deepEqual(reading.uspThemesDropped, [
    { label: 'coach adapts to different levels', why: 'names_person' }
  ])
  // Counter-case: a first pass that keeps a theme asks nothing more.
  const once = stubModel({ ...FIRST, uspThemes: AT_HOME.uspThemes })
  const kept = await read(once)
  assert.equal(once.seen.length, 1)
  assert.equal(kept.uspRetry, undefined)
})

test('the retry rejected too: no theme, reason rejected, its themes recorded as retry_rejected, no third call', async () => {
  const provider = stubModel(FIRST, FIRST)
  const reading = await read(provider)
  assert.equal(provider.seen.length, 2)
  assert.equal(reading.uspThemes, null)
  assert.equal(reading.uspThemesReason, 'rejected')
  assert.equal(reading.uspRetry, 'rejected')
  assert.deepEqual(reading.uspThemesDropped, [
    { label: 'coach adapts to different levels', why: 'names_person' },
    { label: 'coach adapts to different levels', why: 'retry_rejected', detail: 'names_person' }
  ])
  // A held reading whose retry already ran is kept as it is: no call at all.
  const again = stubModel(AT_HOME)
  const held = await read(again, reading)
  assert.equal(again.seen.length, 0)
  assert.equal(held.uspThemes, null)
})

test('a held reading with no theme and no retry gets the retry alone, not the whole reading again', async () => {
  const first = await read(stubModel(FIRST, FIRST))
  const { uspRetry: _r, ...older } = first
  const provider = stubModel(AT_HOME)
  const reading = await read(provider, older)
  assert.equal(provider.seen.length, 1)
  assert.equal(provider.seen[0].messages[0].content, USP_RETRY_SYSTEM)
  assert.equal(reading.uspThemes[0].line, 'We come to you, at your home')
})

test('a retry that proposes nothing is recorded once, and the prompt says no theme was proposed before', () => {
  const sources = [{ ref: 'bio', kind: 'bio', text: 'Swimming lessons in Port Marlow' }]
  assert.match(uspRetryPrompt(sources, { dropped: [] }), /No theme was proposed before/)
  const out = withUspRetry(
    { team: [], uspThemes: null, uspThemesReason: 'not_proposed' },
    '{"uspThemes": []}',
    sources
  )
  assert.deepEqual(out.uspThemesDropped, [
    { label: 'no theme proposed', why: 'retry_rejected', detail: 'not_proposed' }
  ])
  assert.equal(out.uspThemesReason, 'rejected')
})
