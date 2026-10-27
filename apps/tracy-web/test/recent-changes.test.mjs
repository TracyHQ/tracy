// The site's recent changes (`src/sites/recent-changes.js`) — what `apply.list` with no apply_id answers
// at the Apply door (ladder DL15 on dsl2jo, 14/10/2026). No Postgres: the rows are handed in as the
// store reads them, and the store's own query is read through a pool that records it.
//
//   node --test apps/tracy-web/test/recent-changes.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  RECENT_CHANGES_DAYS,
  RECENT_CHANGES_MAX,
  recentChangeRows,
  recentChanges,
  recentChangesNext
} from '../src/sites/recent-changes.js'

const T0 = Date.parse('2026-10-14T06:10:00Z')
const at = (minutes) => new Date(T0 + minutes * 60_000)

/**
 * One relayed write as the Apply door records it: the `audit` row and the `site_write` row of the same
 * statement (same instant, same turn).
 */
function relayed(
  applyId,
  minute,
  { action = 'content.update', target = null, session = 'session-dl14' } = {}
) {
  const when = at(minute)
  const turnId = `${session}:1`
  return {
    audit: {
      id: minute,
      at: when,
      actor: 'owner@x.y',
      action,
      detail: { ok: true, apply_id: applyId, sessionId: session, turnId, writeClass: true, outcome: 'ok' }
    },
    write: {
      id: minute,
      at: when,
      actor: 'owner@x.y',
      action,
      outcome: 'ok',
      target,
      via: 'apply',
      turn_id: turnId
    }
  }
}

/** A successful revert of `applyId`, as its audit row. */
const revert = (applyId, minute) => ({
  id: 1000 + minute,
  at: at(minute),
  actor: 'owner@x.y',
  action: 'apply.revert',
  detail: { ok: true, apply_id: applyId, sessionId: 'session-dl15', writeClass: true, outcome: 'ok' }
})

/** DL14's three changes: the site name, the call button's module, an article (undone later). */
function dl14() {
  const name = relayed('identity-1', 1, { action: 'site.identity', target: { fields: ['sitename'] } })
  const button = relayed('call-button', 2, { target: { kind: 'module', id: '110', fields: ['content'] } })
  const article = relayed('article-19', 3, {
    target: { kind: 'article', id: '19', fields: ['introtext', 'images'] }
  })
  return {
    audits: [revert('article-19', 5), article.audit, button.audit, name.audit],
    writes: [article.write, button.write, name.write]
  }
}

test('🔒 DL15: a new conversation’s list names every recorded change, newest first, the site name among them', () => {
  const listed = recentChanges({ ...dl14(), sessionId: 'session-dl15' })
  assert.deepEqual(
    listed.changes.map((c) => c.apply_id),
    ['article-19', 'call-button', 'identity-1']
  )
  const name = listed.changes.find((c) => c.apply_id === 'identity-1')
  assert.deepEqual(name, {
    apply_id: 'identity-1',
    at: at(1).toISOString(),
    thisConversation: false,
    changed: [{ action: 'site.identity', fields: ['sitename'] }]
  })
  assert.deepEqual(listed.changes.find((c) => c.apply_id === 'call-button').changed, [
    { action: 'content.update', kind: 'module', id: '110', fields: ['content'] }
  ])
  assert.equal(listed.more, false)
  assert.equal(listed.days, RECENT_CHANGES_DAYS)
})

test('a change undone after its last write is marked undone; one written again after the undo is not', () => {
  const rows = dl14()
  const listed = recentChanges({ ...rows, sessionId: null })
  assert.equal(listed.changes.find((c) => c.apply_id === 'article-19').undone, true)
  assert.equal(listed.changes.find((c) => c.apply_id === 'identity-1').undone, undefined)
  const again = relayed('article-19', 9, { target: { kind: 'article', id: '19', fields: ['introtext'] } })
  const later = recentChanges({
    audits: [again.audit, ...rows.audits],
    writes: [again.write, ...rows.writes]
  })
  assert.equal(later.changes[0].apply_id, 'article-19')
  assert.equal(later.changes[0].undone, undefined, 'written again after the undo: it stands')
})

test('the asking conversation’s own changes are marked; one apply id over many writes is one entry', () => {
  const a = relayed('hero', 1, { target: { kind: 'module', id: '7', fields: ['title'] } })
  const b = relayed('hero', 2, { target: { kind: 'module', id: '8', fields: ['title'] } })
  const c = relayed('hero', 3, { target: { kind: 'module', id: '7', fields: ['title'] } })
  const listed = recentChanges({
    audits: [c.audit, b.audit, a.audit],
    writes: [c.write, b.write, a.write],
    sessionId: 'session-dl14'
  })
  assert.equal(listed.changes.length, 1)
  assert.equal(listed.changes[0].thisConversation, true)
  assert.equal(listed.changes[0].at, at(3).toISOString())
  assert.deepEqual(
    listed.changes[0].changed.map((x) => x.id),
    ['7', '8'],
    'the same aim is named once'
  )
})

test('a write the site_write row cannot be paired with is still listed, by its action alone', () => {
  const lone = relayed('contract-1', 4, { action: 'content.contract' })
  const listed = recentChanges({ audits: [lone.audit], writes: [] })
  assert.deepEqual(listed.changes[0].changed, [{ action: 'content.contract' }])
})

test('the list is bounded: the newest changes, and a flag that more exist', () => {
  const rows = Array.from({ length: RECENT_CHANGES_MAX + 3 }, (_, i) => relayed(`id-${i}`, i))
  const listed = recentChanges({ audits: rows.map((r) => r.audit), writes: rows.map((r) => r.write) })
  assert.equal(listed.changes.length, RECENT_CHANGES_MAX)
  assert.equal(listed.changes[0].apply_id, `id-${RECENT_CHANGES_MAX + 2}`)
  assert.equal(listed.more, true)
})

test('the next says how one is undone, and with nothing on record that there is nothing to undo by receipt', () => {
  assert.match(recentChangesNext(recentChanges(dl14())), /apply\.revert \{apply_id\} undoes one/)
  assert.match(recentChangesNext(recentChanges(dl14())), /never guess/)
  const none = recentChanges({ audits: [], writes: [] })
  assert.deepEqual(none.changes, [])
  assert.match(recentChangesNext(none), /no change to undo by receipt/)
})

test('🔒 the store reads only a conversation’s or a key’s successful changes, and a viewer’s own', async () => {
  /** @type {Array<{ sql: string, params: unknown[] }>} */
  const queries = []
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params })
      return { rows: [] }
    }
  }
  await recentChangeRows(/** @type {any} */ (pool), {
    siteKey: 'dsl2jo.tracy.test',
    actor: 'viewer@x.y'
  })
  assert.equal(queries.length, 2)
  const [audits, writes] = queries
  assert.match(audits.sql, /from audit/)
  // A build's own writes carry no sessionId: they are not "a change you made".
  assert.match(audits.sql, /detail->>'sessionId' is not null/)
  assert.match(audits.sql, /detail->>'writeClass' = 'true'/)
  assert.match(audits.sql, /detail->>'ok' = 'true'/)
  assert.match(audits.sql, /action = 'apply\.revert'/)
  // the window is the database's clock, as the rows' `at` is (a server clock ahead of it found nothing)
  assert.match(audits.sql, /at >= now\(\) - \(\$2::int \* interval '1 day'\)/)
  assert.deepEqual(audits.params, ['dsl2jo.tracy.test', 30, 'viewer@x.y'])
  assert.match(writes.sql, /from site_write/)
  assert.match(writes.sql, /via = 'apply'/)
  assert.match(writes.sql, /at >= now\(\) - \(\$2::int \* interval '1 day'\)/)
  assert.deepEqual(writes.params, ['dsl2jo.tracy.test', 30, 'viewer@x.y'])
})
