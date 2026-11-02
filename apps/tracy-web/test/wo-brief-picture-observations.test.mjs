/**
 * After the brief's photographs are labelled, one text call turns what the sharp, own, on-topic ones show into held facts:
 * the model is shown labels only, never a photo; a guest's or a blurry photo is never shown; a failed call or a refused
 * budget leaves no fact and never throws. Fixtures are fictional: the Willowmere Racquet House does not exist.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { observeWithModel } from '../src/lib/picture-observations.js'
import { observeBriefPictures } from '../src/opportunities-build/brief-picture-observations.js'

const DOOR = { url: 'https://vision.test/chat', key: 'k', model: 'model-x' }
const passThrough = async (_spec, fn) => fn()
const image = (id, source = 'website', extra = {}) => ({
  id,
  kind: 'image',
  width: 2000,
  height: 1200,
  source,
  labels: null,
  ...extra
})
const MEDIA = [
  image('wm-01'),
  image('wm-02'),
  image('wm-03', 'google-places', { credit: 'A Visitor' }),
  image('wm-04'),
  { id: 'wm-05', kind: 'video', source: 'website' }
]
const LABELS = new Map([
  ['wm-01', { labels: { content: 'venue-exterior', caption: 'An orange clay court.', quality: 'good' } }],
  [
    'wm-02',
    { labels: { content: 'people-in-action', caption: 'A coach and children on clay.', quality: 'good' } }
  ],
  [
    'wm-03',
    { labels: { content: 'venue-exterior', caption: 'A court from the stands.', isOwnPhoto: false } }
  ],
  ['wm-04', { labels: { content: 'venue-exterior', caption: 'A pool.', quality: 'blurry' } }]
])

test('the observable photos go to the model as labels, and its answer comes back held', async () => {
  const asked = []
  const observe = async ({ prompt }) => {
    asked.push(prompt)
    return {
      answer: JSON.stringify({
        facts: [
          { field: 'facility', value: 'clay courts', assetIds: ['wm-01', 'wm-02', 'wm-03'] },
          { field: 'activity', value: 'coaching for children', assetIds: ['wm-02'] },
          { field: 'facility', value: 'outdoor pool', assetIds: ['wm-04'] }
        ]
      }),
      usage: { calls: 1, promptTokens: 10, completionTokens: 5, requests: [] }
    }
  }
  const got = await observeBriefPictures({
    media: MEDIA,
    labels: LABELS,
    door: DOOR,
    observe,
    chargeable: passThrough
  })
  assert.equal(asked.length, 1)
  assert.match(asked[0], /Photo id: wm-01/)
  assert.doesNotMatch(asked[0], /wm-03|wm-04|wm-05/)
  assert.deepEqual(got.facts, [
    { field: 'facility', value: 'clay courts', assetIds: ['wm-01', 'wm-02'] },
    { field: 'activity', value: 'coaching for children', assetIds: ['wm-02'] }
  ])
  assert.deepEqual(got.note, {
    photos: 2,
    dropped: { not_own_photo: 1, blurry: 1, unlabelled: 1 },
    status: 'observed',
    facts: 2
  })
})

test('nothing observable: no call; a failed call or a refused budget: no fact, no throw', async () => {
  let calls = 0
  const observe = async () => {
    calls += 1
    throw Object.assign(new Error('down'), { code: 'http_error' })
  }
  const none = await observeBriefPictures({
    media: [MEDIA[4]],
    labels: LABELS,
    door: DOOR,
    observe,
    chargeable: passThrough
  })
  assert.equal(calls, 0)
  assert.equal(none.note.status, 'none')
  const failed = await observeBriefPictures({
    media: MEDIA,
    labels: LABELS,
    door: DOOR,
    observe,
    chargeable: passThrough
  })
  assert.deepEqual([failed.facts, failed.note.status, failed.note.reason], [[], 'failed', 'http_error'])
  const refused = await observeBriefPictures({
    media: MEDIA,
    labels: LABELS,
    door: DOOR,
    observe,
    chargeable: async () => {
      throw Object.assign(new Error('budget'), { code: 'BUDGET_REFUSED' })
    }
  })
  assert.equal(refused.note.reason, 'BUDGET_REFUSED')
})

test('the model call sends words only, on the vision door, and returns its text and usage', async () => {
  let sent = null
  const fetchImpl = async (url, init) => {
    sent = { url, body: JSON.parse(init.body) }
    return new Response(
      JSON.stringify({
        id: 'r1',
        choices: [{ message: { content: '{"facts": []}' } }],
        usage: { prompt_tokens: 7, completion_tokens: 3 }
      }),
      { status: 200 }
    )
  }
  const got = await observeWithModel({ door: DOOR, prompt: 'hello', fetchImpl })
  assert.equal(sent.url, DOOR.url)
  assert.equal(sent.body.model, 'model-x')
  assert.deepEqual(sent.body.messages, [{ role: 'user', content: 'hello' }])
  assert.equal(got.answer, '{"facts": []}')
  assert.deepEqual([got.usage.promptTokens, got.usage.completionTokens], [7, 3])
  await assert.rejects(
    observeWithModel({ door: DOOR, prompt: 'x', fetchImpl: async () => new Response('no', { status: 500 }) }),
    /observation call failed/
  )
})
