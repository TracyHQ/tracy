import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { EVENT_ID } from '../src/lib/shard-shapes.js'
import {
  enqueueShardEvent,
  eventIdOf,
  outcomeOf,
  SHARD_EVENT_KINDS,
  shardEvents
} from '../src/shard/events-outbox.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { warn() {}, error() {} }

/** A master that answers each event with the next scripted answer: a status, or {status, body}. */
function scriptedLink(answers) {
  const sent = []
  return {
    sent,
    sendEvent: async (event) => {
      sent.push(event)
      const next = answers.shift() ?? 200
      const { status, body } =
        typeof next === 'number' ? { status: next, body: next < 300 ? { ok: true } : null } : next
      return { ok: status >= 200 && status < 300, status, body }
    }
  }
}
const CLOCK_SKEW = { status: 403, body: { code: 'SIGNATURE_INVALID', why: 'clock' } }

test(
  'only the four kinds of the contract; one key is one event, whoever writes it and however often',
  opts,
  async () => {
    assert.deepEqual([...SHARD_EVENT_KINDS].sort(), [
      'account.created',
      'site.created',
      'site.deleted',
      'site.renamed'
    ])
    const a = await enqueueShardEvent(db.pool, {
      kind: 'site.created',
      data: { siteKey: 'shop.tracy.ai' },
      key: 'shop.tracy.ai@1'
    })
    const b = await enqueueShardEvent(db.pool, {
      kind: 'site.created',
      data: { siteKey: 'shop.tracy.ai' },
      key: 'shop.tracy.ai@1'
    })
    assert.equal(a, b)
    assert.equal(a, eventIdOf('site.created', 'shop.tracy.ai@1'))
    assert.match(a, EVENT_ID)
    assert.equal((await db.pool.query('select count(*)::int as n from shard_event_outbox')).rows[0].n, 1)
    for (const kind of [
      'site.exploded',
      'domain.added',
      'domain.removed',
      'email.changed',
      'account.deleted'
    ])
      await assert.rejects(
        enqueueShardEvent(db.pool, { kind, data: {}, key: 'x' }),
        /unknown shard event kind/,
        kind
      )
  }
)

test('which answers are tried again and which stop the event for good (contract §5)', () => {
  const retry = [
    { ok: false, status: 0, body: null },
    { ok: false, status: 500, body: null },
    { ok: false, status: 502, body: null },
    { ok: false, status: 408, body: null },
    { ok: false, status: 429, body: null },
    { ok: false, ...CLOCK_SKEW },
    { ok: false, status: 404, body: null }
  ]
  const dead = [
    { ok: false, status: 400, body: { code: 'BAD_EVENT' } },
    { ok: false, status: 403, body: { code: 'SIGNATURE_INVALID', why: 'signature' } },
    { ok: false, status: 403, body: { code: 'SIGNATURE_INVALID', why: 'replay' } },
    { ok: false, status: 403, body: { code: 'SCOPE' } },
    { ok: false, status: 409, body: { code: 'LABEL_TAKEN' } }
  ]
  for (const answer of retry) assert.equal(outcomeOf(answer), 'retry', JSON.stringify(answer))
  for (const answer of dead) assert.equal(outcomeOf(answer), 'dead', JSON.stringify(answer))
  assert.equal(outcomeOf({ ok: true, status: 200, body: { ok: true, duplicate: true } }), 'sent')
})

test(
  'a master that fails or is out of clock gets the event again and once; a refusal stops it for good, with alerts',
  opts,
  async () => {
    let clock = Date.now()
    const alerts = []
    const link = scriptedLink([502, CLOCK_SKEW, 200, { status: 409, body: { code: 'LABEL_TAKEN' } }])
    const events = shardEvents({
      pool: db.pool,
      link,
      now: () => clock,
      log: quiet,
      alert: (a) => alerts.push(a)
    })
    await events.emit('site.created', { siteKey: 'a.tracy.ai', label: 'a', platform: 'wordpress' }, 'a@1')
    assert.deepEqual(await events.pump(), { sent: 0, retried: 1, dead: 0 })
    assert.deepEqual(await events.pump(), { sent: 0, retried: 0, dead: 0 }, 'not due again yet')
    clock += 16_000
    assert.deepEqual(await events.pump(), { sent: 0, retried: 1, dead: 0 }, '403 clock is tried again')
    clock += 31_000
    assert.deepEqual(await events.pump(), { sent: 1, retried: 0, dead: 0 })
    assert.equal(link.sent.length, 3)
    assert.deepEqual(link.sent[2], {
      eventId: eventIdOf('site.created', 'a@1'),
      kind: 'site.created',
      at: link.sent[2].at,
      data: { siteKey: 'a.tracy.ai', label: 'a', platform: 'wordpress' }
    })
    assert.match(link.sent[2].at, /^\d{4}-\d{2}-\d{2}T.*Z$/)
    await events.emit('site.deleted', { siteKey: 'b.tracy.ai', label: 'b' }, 'b@1')
    assert.deepEqual(await events.pump(), { sent: 0, retried: 0, dead: 1 })
    clock += 3_600_000
    assert.deepEqual(await events.pump(), { sent: 0, retried: 0, dead: 0 })
    assert.deepEqual(await events.counts(), { pending: 0, dead: 1 })
    assert.deepEqual(
      alerts.map((a) => [a.what, a.kind, a.status]),
      [
        ['retry', 'site.created', 502],
        ['dead', 'site.deleted', 409]
      ],
      'one alert when an event first fails, one for every dead event'
    )
  }
)

test('an account invited here is reported to the master once, as an invitation', opts, async () => {
  const link = scriptedLink([])
  const events = shardEvents({ pool: db.pool, link, now: () => Date.now() + 120_000, log: quiet })
  await db.pool.query("insert into account (email) values ('invited@b.c')")
  assert.equal(await events.sweepMirrors(), 1)
  assert.equal(await events.sweepMirrors(), 0)
  await events.pump()
  assert.deepEqual(
    link.sent.map((e) => [e.kind, e.data]),
    [['account.created', { email: 'invited@b.c', source: 'invitation' }]]
  )
})
