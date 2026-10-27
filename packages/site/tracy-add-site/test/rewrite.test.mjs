/** How the popup reads the rewrite door's answers; the door itself is tested in `apps/tracy-web`. */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { rewriteAbout } from '../src/client/rewrite.mjs'

const answering = (status, body) => async () =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })

test('a rewrite comes back trimmed', async () => {
  assert.deepEqual(await rewriteAbout('a bakery', answering(200, { text: '  A family bakery. ' })), {
    ok: true,
    text: 'A family bakery.'
  })
})

test('it posts the sentence as JSON to the relative door', async () => {
  let seen
  await rewriteAbout('a bakery', async (url, init) => {
    seen = { url, init }
    return new Response(JSON.stringify({ text: 'x' }), { status: 200 })
  })
  assert.equal(seen.url, '/api/sites/brief/rewrite')
  assert.equal(seen.init.method, 'POST')
  assert.deepEqual(JSON.parse(seen.init.body), { text: 'a bakery', question: '', again: false })
})

test('no model set is said as unavailable, an exhausted hour as limit', async () => {
  assert.deepEqual(await rewriteAbout('a bakery', answering(503, { code: 'MODEL_NOT_CONFIGURED' })), {
    ok: false,
    reason: 'unavailable'
  })
  assert.deepEqual(await rewriteAbout('a bakery', answering(429, { code: 'RATE_LIMITED' })), {
    ok: false,
    reason: 'limit'
  })
})

test('every other miss is failed: a refusal, an empty answer, junk, a dropped network', async () => {
  for (const fetchImpl of [
    answering(502, { code: 'REWRITE_UNUSABLE' }),
    answering(401, {}),
    answering(200, { text: '   ' }),
    answering(200, { words: 3 }),
    answering(200, 'not json'),
    async () => {
      throw new Error('offline')
    }
  ])
    assert.deepEqual(await rewriteAbout('a bakery', fetchImpl), { ok: false, reason: 'failed' })
})
