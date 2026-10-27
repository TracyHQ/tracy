/**
 * The card's talk with the server (`turn-undo.mjs`): reading the turns door defensively, one read
 * per chat shared by every card, and the undo POST read into done / partial / refused / unsure —
 * silence is never a refusal (#802). The door is a fake `fetch`; no server is involved.
 *
 *   node --test packages/ui/tracy-chat-input/test/turn-undo.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createTurnsBook, outcomeKey, readTurnsAnswer, turnsUrl, undoTurn } from '../src/client/turn-undo.mjs'

const json = (status, body) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms))

test('the door: site key and session in the address', () => {
  assert.equal(turnsUrl('demo.tracy.site', 'session-1'), '/api/sites/demo.tracy.site/turns?session=session-1')
})

test('only a 2xx with a turns array is an answer; fields left out read as nothing', () => {
  assert.equal(readTurnsAnswer(404, { turns: [] }), null)
  assert.equal(readTurnsAnswer(200, '<html>'), null)
  assert.equal(readTurnsAnswer(200, { turns: 'no' }), null)
  const a = readTurnsAnswer(200, { turns: [{ turnId: 's:1', turn: 1, changed: true }, { bogus: true }] })
  assert.deepEqual(a, {
    cms: null,
    siteBusy: false,
    designSystem: null,
    turns: [
      {
        turnId: 's:1',
        turn: 1,
        title: null,
        openedAt: null,
        closedAt: null,
        changed: true,
        files: { count: 0, commits: [], zones: {} },
        content: [],
        look: [],
        undo: { state: 'none', latest: false, reasons: [], needs: { code: false, content: false } }
      }
    ]
  })
})

test('one read per chat and signal, however many cards ask; a new signal reads again', async () => {
  const calls = []
  const book = createTurnsBook({ fetchImpl: async (url) => (calls.push(url), json(200, { turns: [] })) })
  book.want('a.site', 's', '3:ended')
  book.want('a.site', 's', '3:ended')
  book.want('a.site', 's', '3:ended')
  await tick(5)
  assert.equal(calls.length, 1)
  assert.equal(book.get('a.site', 's')?.status, 'ready')
  book.want('a.site', 's', '4:running')
  await tick(5)
  assert.equal(calls.length, 2)
  await book.refresh('a.site', 's')
  assert.equal(calls.length, 3)
})

test('a failed read keeps the last answer; a late answer is dropped for the newer one', async () => {
  let n = 0
  /** @type {((r: Response) => void)[]} */
  const pending = []
  const book = createTurnsBook({
    fetchImpl: () => {
      n += 1
      if (n === 1) return Promise.resolve(json(200, { turns: [], cms: 'joomla' }))
      if (n === 2) return Promise.resolve(json(500, {}))
      return new Promise((resolve) => pending.push(resolve))
    }
  })
  book.want('a', 's', '1')
  await tick(5)
  book.want('a', 's', '2')
  await tick(5)
  assert.equal(book.get('a', 's')?.status, 'failed')
  assert.equal(book.get('a', 's')?.answer?.cms, 'joomla')
  book.want('a', 's', '3')
  book.want('a', 's', '4')
  await tick(5)
  pending[1](json(200, { turns: [], cms: 'wordpress' }))
  await tick(5)
  pending[0](json(200, { turns: [], cms: 'emdash' }))
  await tick(5)
  assert.equal(book.get('a', 's')?.answer?.cms, 'wordpress')
})

test('the undo POST carries the session, the turn and the scope', async () => {
  let seen
  await undoTurn({
    siteKey: 'a.site',
    sessionId: 's',
    turnId: 's:3',
    scope: 'from-here',
    idemKey: 'k',
    fetchImpl: async (url, init) => (
      (seen = { url, init }), json(200, { ok: true, complete: true, turns: [] })
    )
  })
  assert.equal(seen.url, '/api/sites/a.site/turns/undo')
  assert.equal(seen.init.method, 'POST')
  assert.equal(seen.init.headers['x-tracy-session'], 's')
  assert.deepEqual(JSON.parse(seen.init.body), {
    session: 's',
    turnId: 's:3',
    scope: 'from-here',
    idemKey: 'k'
  })
})

test('outcomes: done, partial, refused with its code, and every kind of silence as unsure', async () => {
  const run = (answer) =>
    undoTurn({ siteKey: 'a', sessionId: 's', turnId: 's:1', scope: 'turn', fetchImpl: async () => answer() })
  assert.deepEqual(await run(() => json(200, { ok: true, complete: true })), { kind: 'done' })
  assert.deepEqual(
    await run(() =>
      json(200, {
        ok: true,
        complete: false,
        turns: [{ files: { status: 'failed' }, content: { unsure: [] } }]
      })
    ),
    { kind: 'partial', unsure: false }
  )
  assert.deepEqual(
    await run(() =>
      json(200, {
        ok: true,
        complete: false,
        turns: [{ files: { status: 'undone' }, content: { unsure: [{ applyId: 'x' }] } }]
      })
    ),
    { kind: 'partial', unsure: true }
  )
  assert.deepEqual(await run(() => json(409, { code: 'BLOCKED', reasons: [] })), {
    kind: 'refused',
    code: 'BLOCKED'
  })
  assert.deepEqual(await run(() => json(403, { code: 'FORBIDDEN_WRITE', toolset: 'code' })), {
    kind: 'refused',
    code: 'FORBIDDEN_WRITE'
  })
  assert.deepEqual(await run(() => json(404, 'nope')), { kind: 'refused', code: 'HTTP_404' })
  assert.deepEqual(await run(() => json(502, '<html>bad gateway')), { kind: 'unsure', code: 'HTTP_502' })
  assert.deepEqual(await run(() => json(200, '<html>')), { kind: 'unsure', code: 'OUTCOME_UNKNOWN' })
  assert.deepEqual(await run(() => Promise.reject(new TypeError('offline'))), {
    kind: 'unsure',
    code: 'UNREACHABLE'
  })
})

test('the line an outcome leaves: none when the fresh read says it all', () => {
  assert.equal(outcomeKey({ kind: 'done' }), null)
  assert.equal(outcomeKey({ kind: 'refused', code: 'BLOCKED' }), null)
  assert.equal(outcomeKey({ kind: 'refused', code: 'NOT_LATEST' }), null)
  assert.equal(outcomeKey({ kind: 'refused', code: 'NOTHING_TO_UNDO' }), null)
  assert.equal(outcomeKey({ kind: 'refused', code: 'FORBIDDEN_WRITE' }), 'undo.result.role')
  assert.equal(outcomeKey({ kind: 'refused', code: 'SITE_BUSY' }), 'undo.result.busy')
  assert.equal(outcomeKey({ kind: 'refused', code: 'NOT_SIGNED_IN' }), 'undo.result.signedOut')
  assert.equal(outcomeKey({ kind: 'refused', code: 'TURN_UNKNOWN' }), 'undo.result.other')
  assert.equal(outcomeKey({ kind: 'partial', unsure: false }), 'undo.result.partial')
  assert.equal(outcomeKey({ kind: 'partial', unsure: true }), 'undo.result.partialUnsure')
  assert.equal(outcomeKey({ kind: 'unsure', code: 'UNREACHABLE' }), 'undo.result.unsure')
})

// ── One undo, every door told (toolbar contract §3) ─────────────────────────────────────────────

test('a done or partial undo is said once on the page with the turns the server named; nothing else is', async () => {
  const { TURN_UNDONE_EVENT, onTurnUndone } = await import('@tracy/core/turn-undo')
  assert.equal(TURN_UNDONE_EVENT, 'tracy:turn-undone')
  const target = new EventTarget()
  const heard = []
  const stop = onTurnUndone((d) => heard.push(d), target)
  const run = (answer, turnId = 's:2') =>
    undoTurn({
      siteKey: 'a.site',
      sessionId: 's',
      turnId,
      scope: 'turn',
      target,
      fetchImpl: async () => answer()
    })
  // The outcome callers read is the same as before: the turn ids ride the event, not the outcome.
  assert.deepEqual(
    await run(() => json(200, { ok: true, complete: true, turns: [{ turnId: 's:2' }, { turnId: 's:1' }] })),
    { kind: 'done' }
  )
  assert.deepEqual(
    await run(
      () => json(200, { ok: true, complete: false, turns: [{ files: { status: 'failed' } }] }),
      's:3'
    ),
    { kind: 'partial', unsure: false }
  )
  await run(() => json(409, { code: 'BLOCKED', reasons: [] }))
  await run(() => json(502, 'bad gateway'))
  await run(() => Promise.reject(new TypeError('offline')))
  assert.deepEqual(heard, [
    { sessionId: 's', siteKey: 'a.site', turnIds: ['s:2', 's:1'] },
    // The answer named no turn: the one pressed.
    { sessionId: 's', siteKey: 'a.site', turnIds: ['s:3'] }
  ])
  stop()
  await run(() => json(200, { ok: true, complete: true }))
  assert.equal(heard.length, 2, 'a stopped listener hears nothing')
})

test('a detail that is not one is dropped; site keys match by label, without case', async () => {
  const { readTurnUndone, sameSiteKey } = await import('@tracy/core/turn-undo')
  assert.equal(readTurnUndone(null), null)
  assert.equal(readTurnUndone({ sessionId: 's' }), null)
  assert.deepEqual(readTurnUndone({ sessionId: 's', siteKey: 'a', turnIds: ['x', 3, ''] }), {
    sessionId: 's',
    siteKey: 'a',
    turnIds: ['x']
  })
  assert.equal(sameSiteKey('Demo.tracy.site', 'demo'), true)
  assert.equal(sameSiteKey('demo.tracy.site', 'other.tracy.site'), false)
  assert.equal(sameSiteKey('', ''), false)
  assert.equal(sameSiteKey(null, 'demo'), false)
})
