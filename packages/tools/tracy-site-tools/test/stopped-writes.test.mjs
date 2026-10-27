import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyWriteTarget,
  createStoppedWrites,
  stoppedWritesNotice,
  writeOutcome
} from '../src/host/stopped-writes.mjs'

test('writeOutcome: landed, refused, unknown and not sent are told apart', () => {
  assert.equal(writeOutcome({ ok: true }), 'ok')
  assert.equal(writeOutcome({ ok: false, code: 'TURN_STOPPED' }), 'not-sent')
  assert.equal(writeOutcome({ ok: false, code: 'SITE_BUSY' }), 'not-sent')
  assert.equal(writeOutcome({ ok: false, code: 'COMPONENT_UNREACHABLE' }), 'unknown')
  assert.equal(writeOutcome({ ok: false, code: 'PARTIAL' }), 'unknown')
  assert.equal(writeOutcome({ ok: false, httpStatus: 504 }), 'unknown')
  assert.equal(writeOutcome({ ok: false, error: 'bad_params' }), 'refused')
  assert.equal(writeOutcome(null), 'unknown')
})

test('applyWriteTarget keeps names only, never a value', () => {
  assert.deepEqual(applyWriteTarget({ kind: 'post', id: 42, fields: { post_title: 'secret words' } }), {
    kind: 'post',
    id: '42'
  })
  assert.deepEqual(applyWriteTarget({ slot: 'hero.title', path: '/about', value: 'x' }), {
    slot: 'hero.title',
    page: '/about'
  })
  assert.equal(applyWriteTarget({ fields: { a: 1 } }), null)
})

test('the ledger keeps only calls the Stop cut: sent at the Stop, then the outcome', async () => {
  const reports = []
  const ledger = createStoppedWrites({
    newId: (() => {
      let n = 0
      return () => `w${++n}`
    })(),
    report: async (who, writes) => void reports.push({ turn: who.turnId, writes })
  })
  const who = { key: '_conversation', label: 'site1', sessionId: 's', turnId: 's:2' }
  // A call that returns before any Stop: nothing reported, even if the turn is stopped later.
  const calm = new AbortController()
  const c1 = ledger.startCall(calm.signal)
  ledger.begin(c1, who, { action: 'content.update', target: null, via: 'apply' })('ok')
  ledger.endCall(c1)
  calm.abort()
  assert.deepEqual(reports, [])
  // A call cut by the Stop while a write is on the wire.
  const stop = new AbortController()
  const c2 = ledger.startCall(stop.signal)
  ledger.begin(c2, who, { action: 'content.update', target: { kind: 'post', id: '1' }, via: 'apply' })('ok')
  const finish = ledger.begin(c2, who, {
    action: 'content.update',
    target: { kind: 'post', id: '2' },
    via: 'apply'
  })
  stop.abort()
  assert.deepEqual(
    reports.at(-1).writes.map((w) => [w.target.id, w.outcome]),
    [
      ['1', 'ok'],
      ['2', 'sent']
    ]
  )
  finish('unknown')
  assert.deepEqual(
    reports.at(-1).writes.map((w) => [w.target.id, w.outcome]),
    [['2', 'unknown']]
  )
  // Nothing more is begun after the Stop.
  ledger.begin(c2, who, { action: 'content.update', target: null, via: 'apply' })('ok')
  assert.equal(reports.length, 2)
  await ledger.settled('s')
})

test('the notice names what landed and what may have, and nothing for writes that changed nothing', () => {
  assert.equal(stoppedWritesNotice([{ action: 'content.update', outcome: 'refused' }]), null)
  assert.equal(stoppedWritesNotice([{ action: 'content.update', outcome: 'not-sent' }]), null)
  const said = stoppedWritesNotice([
    { action: 'content.update', target: { kind: 'post', id: '1' }, outcome: 'ok' },
    { action: 'content_update', target: { kind: 'pages', id: 'ab' }, outcome: 'sent' },
    { action: 'media.delete', outcome: 'not-sent' }
  ])
  assert.ok(said)
  assert.match(said.text, /These landed[^\n]*\n- content\.update post 1/)
  assert.match(said.text, /unknown outcome[^\n]*\n- content_update pages ab/)
  assert.doesNotMatch(said.text, /media\.delete/)
})
