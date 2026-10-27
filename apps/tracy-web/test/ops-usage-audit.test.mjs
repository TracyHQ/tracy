import assert from 'node:assert/strict'
import { test } from 'node:test'
import { summarizeFunnel, summarizeTurns } from '../src/ops/usage.js'

const now = Date.parse('2026-10-22T12:00:00Z')
const at = (offset) => new Date(now + offset)
const hour = 3_600_000
const turn = (patch = {}) => ({
  turn_id: 'a:1',
  site_key: 'a',
  session_id: 'a',
  turn: 1,
  platform: 'joomla',
  opened_at: at(-48 * hour),
  close_filed_at: at(-48 * hour + 30_000),
  closed_at: at(-48 * hour + 120_000),
  state: 'closed',
  end_reason: 'completed',
  files: 0,
  ...patch
})
const fold = (turns, writes = [], undos = new Map()) =>
  summarizeTurns({ turns, writes, undoneBySiteChanges: undos, now }).all
const write = (patch = {}) => ({
  turn_id: 'a:1',
  outcome: 'ok',
  action: 'content.update',
  at: at(-48 * hour + 10_000),
  target: { kind: 'post', id: '1' },
  ...patch
})

test('U01: duration uses stored closure, never background-job filing', () => {
  const rows = Array.from({ length: 20 }, (_, i) => turn({ turn_id: `a:${i}`, session_id: `a${i}` }))
  assert.equal(fold(rows).time.turn.p50, 120)
  assert.equal(fold([turn({ closed_at: null })]).time.turn.n, 0)
})
test('U01: follow-up uses actual closure and rejects earlier timestamps', () => {
  assert.equal(
    fold([turn(), turn({ turn_id: 'a:2', turn: 2, opened_at: at(-48 * hour + 11 * 60_000) })]).followUp.a,
    1
  )
  assert.equal(
    fold([turn(), turn({ turn_id: 'a:2', turn: 2, opened_at: at(-48 * hour + 60_000) })]).followUp.a,
    0
  )
})
test('U01: neither undo nor rework accepts an event before closure', () => {
  const data = fold([turn({ undone_at: at(-48 * hour + 60_000) })], [write()])
  assert.equal(data.undo.within24h.a, 0)
  assert.equal(fold([turn()], [write()], new Map([['a:1', now - 48 * hour + 60_000]])).undo.within24h.a, 0)
})
test('U05: unconfirmed change outcomes remain unknown', () => {
  const result = fold([turn()], [write({ outcome: 'unknown' })])
  assert.equal(result.changes.unchangedCompleted, 0)
  assert.equal(result.changes.outcomeUnknown, 1)
})
test('U06: an answer cut short is separate from a finished request', () => {
  const result = fold([turn({ end_reason: 'max-tokens' })])
  assert.equal(result.changes.unchangedCompleted, 0)
  assert.equal(result.changes.unchangedCut, 1)
})
const funnel = (patch = {}) =>
  summarizeFunnel({
    openings: [],
    creates: [{ site_key: 'a', platform: 'joomla', occurred_at: at(-72 * hour) }],
    results: new Map(),
    stuck: new Set(),
    briefs: new Map(),
    entries: new Map(),
    firstTurns: new Map(),
    enteredSince: at(-100 * hour),
    now,
    ...patch
  }).byPlatform.all

test('U03: one first visit on the next day is not a return', () => {
  assert.equal(funnel({ entries: new Map([['a', [at(-48 * hour)]]]) }).returnedAnotherDay.a, 0)
  assert.equal(
    funnel({ entries: new Map([['a', [at(-48 * hour), at(-24 * hour)]]]) }).returnedAnotherDay.a,
    1
  )
})
test('U07: missing or invalid build duration never means instant readiness', () => {
  for (const seconds of [null, undefined, -1, ''])
    assert.equal(funnel({ results: new Map([['a', { seconds }]]) }).warm, 0)
  assert.equal(funnel({ results: new Map([['a', { seconds: 0 }]]) }).warm, 1)
})
test('U02: a first request before creation is never a new-site activation', () => {
  assert.equal(funnel({ firstTurns: new Map([['a', at(-73 * hour)]]) }).firstRequestWithin24h.a, 0)
})

test('independent audit: follow-ups and reworks belong to the same site incarnation and conversation', () => {
  const first = turn({ site_instance: at(-100 * hour), session_id: 'shared-label' })
  for (const patch of [
    { site_key: 'another-site', site_instance: first.site_instance },
    { site_key: first.site_key, site_instance: at(-49 * hour) }
  ]) {
    const next = turn({
      ...patch,
      turn_id: 'other:2',
      session_id: first.session_id,
      turn: 2,
      opened_at: at(-48 * hour + 3 * 60_000)
    })
    const result = fold([first, next], [write(), write({ turn_id: next.turn_id })])
    assert.equal(result.followUp.a, 0, 'another site or incarnation is not a follow-up')
    assert.equal(result.rework.a, 0, 'another site or incarnation cannot rework this site’s item')
  }
})
