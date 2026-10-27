import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  interruptCause,
  isInterruptedTurn,
  readCutTimes,
  siteKeyFromPath
} from '../src/client/interrupted.mjs'

test('only a turn dsh closed as interrupted gets the card', () => {
  assert.equal(isInterruptedTurn({ end: { data: { reason: { kind: 'interrupted' } } } }), true)
  for (const kind of ['completed', 'cancelled', 'error']) {
    assert.equal(isInterruptedTurn({ end: { data: { reason: { kind } } } }), false)
  }
  assert.equal(isInterruptedTurn({ end: undefined }), false, 'a turn still open is not interrupted')
  assert.equal(isInterruptedTurn(undefined), false)
})

test('the site comes from the page path only, never from a cookie, so /new/ has none', () => {
  assert.equal(siteKeyFromPath('/qc-hano-wp-0923-01.tracy.site/s/abc'), 'qc-hano-wp-0923-01.tracy.site')
  assert.equal(siteKeyFromPath('/demo.tracy.test/'), 'demo.tracy.test')
  assert.equal(siteKeyFromPath('/new/'), null)
  assert.equal(siteKeyFromPath('/'), null)
})

// #1403 item 11: the card blamed "a Tracy update" for every interruption, a crash or a reboot too.
test('interruptCause: an update only when a deploy cut a turn of the chat while this one ran', () => {
  const turn = { start: { time: 10_000 }, end: { time: 50_000 } }
  assert.equal(interruptCause(turn, [20_000]), 'update')
  assert.equal(interruptCause(turn, [9_500]), 'update', 'the deploy writes its time to the second')
  assert.equal(interruptCause(turn, [50_000]), 'update')
  assert.equal(interruptCause(turn, []), 'restart')
  assert.equal(interruptCause(turn, [5_000, 60_000]), 'restart', 'cuts of other turns of the chat')
  assert.equal(interruptCause({ start: { time: 10_000 } }, [20_000]), 'update', 'no end yet: open after')
  assert.equal(interruptCause({ end: { time: 50_000 } }, [20_000]), 'restart', 'no start: nothing proves it')
  assert.equal(interruptCause(null, [20_000]), 'restart')
})

test('readCutTimes asks the held door with cut: true and keeps only numbers; anything else is none', async () => {
  const calls = []
  const answer = (status, body) => async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return new Response(JSON.stringify(body), { status })
  }
  const dshUrl = (p) => `/qaem643.tracy.site${p}`
  assert.deepEqual(
    await readCutTimes('session-1', {
      dshUrl,
      fetchImpl: answer(200, { ok: true, cutAt: [5_000, 'x', 7_000] })
    }),
    [5_000, 7_000]
  )
  assert.deepEqual(calls[0], {
    url: '/qaem643.tracy.site/api/tracy-site-tools/held',
    body: { sessionId: 'session-1', cut: true }
  })
  assert.deepEqual(await readCutTimes('session-1', { dshUrl, fetchImpl: answer(200, { ok: true }) }), [])
  assert.deepEqual(await readCutTimes('session-1', { dshUrl, fetchImpl: answer(403, { ok: false }) }), [])
  assert.deepEqual(
    await readCutTimes('session-1', {
      dshUrl,
      fetchImpl: async () => {
        throw new TypeError('offline')
      }
    }),
    []
  )
})
