/**
 * Starting a build for a press nobody is watching.
 *
 * 🔒 WHAT THIS GUARDS. The Build form sends the questionnaire it was served to the `start` door, so
 * the server judges the answers with the same evaluator the form used and writes the set's identity
 * into `brief.json`. The PRESS road exists for when that page is gone — a reload, a navigation, the
 * provision sweep — and it was carrying the answers without the questions they belong to. A build
 * finished that way produced a brief that could not say WHICH questionnaire it answered, so an
 * administrator's later Use silently became the meaning of a build already running, and the
 * hidden-answer rule was never applied by the server on exactly the road with no browser to apply
 * it in. Measured 23/09/2026 while building a real WordPress site end to end.
 *
 * No network: the seat door and fetch are doubles, and what is asserted is the request body.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildPluginFor, startBuildAtDoor } from '../src/lib/build-door.js'

const HOST = { dshOrigin: 'http://dsh.invalid', seatSecret: 'shh' }
const seatDoor = { mintSeatSession: async () => 'token-1' }

/** Captures the `start` call and answers 200 to everything. */
function recorder() {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null })
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }
  return { calls, fetchImpl }
}

const SNAPSHOT = {
  set: { id: 'tracy-business/wp7#gen-abc', revision: 2, contentHash: 'a'.repeat(64) },
  questions: [
    { id: 'name', kind: 'text', label: 'Name', required: true },
    { id: 'pages', kind: 'multi', label: 'Pages', options: ['home', 'services'] },
    {
      id: 'services-details',
      kind: 'longtext',
      label: 'Services',
      showWhen: { all: [{ question: 'pages', has: 'services' }] }
    }
  ]
}

const press = (over = {}) => ({ id: 'press-1', answers: { name: 'Northgate' }, ...over })

const start = (input = {}) =>
  startBuildAtDoor({
    host: HOST,
    siteKey: 'q03-wordpress.tracy.test',
    label: 'q03-wordpress',
    platform: 'wordpress',
    email: 'owner@example.com',
    sessionId: 'session-1',
    seatDoor,
    ...input
  })

test('the press carries the questionnaire to the start door, beside the answers it judges', async () => {
  const { calls, fetchImpl } = recorder()
  const result = await start({ press: press({ questionnaire: SNAPSHOT }), fetchImpl })
  assert.equal(result.ok, true)
  const started = calls.find((c) => c.url.includes('/start'))
  assert.ok(started, 'the door was asked to start')
  assert.deepEqual(started.body.questionnaire, SNAPSHOT)
  assert.equal(started.body.questionnaire.set.contentHash, SNAPSHOT.set.contentHash)
  assert.deepEqual(started.body.answers, { name: 'Northgate' })
})

test('a press with no questionnaire sends no field at all — not an empty one', async () => {
  // A press written before this shape existed, and a template build that asks nothing, both land
  // here. The door reads a missing snapshot as "judge nothing"; an empty object would be a
  // questionnaire with no questions, which judges every answer away.
  const { calls, fetchImpl } = recorder()
  await start({ press: press(), fetchImpl })
  const started = calls.find((c) => c.url.includes('/start'))
  assert.equal(Object.hasOwn(started.body, 'questionnaire'), false)
})

test('the plugin that serves each platform, and nothing for one nobody builds', () => {
  assert.equal(buildPluginFor('wordpress'), 'tracy-site-build-wordpress')
  assert.equal(buildPluginFor('joomla'), 'tracy-site-build-joomla')
  assert.equal(buildPluginFor('emdash'), 'tracy-site-build-emdash')
  assert.equal(buildPluginFor('drupal'), null)
})
