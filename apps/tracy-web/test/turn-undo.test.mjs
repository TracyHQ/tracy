// Undo by chat turn — the decisions (`src/sites/turn-undo.js`), with no Postgres and no host: every
// fact is handed in as the store and the host would hand it. Plan `tasks/undo-change/plan.md` 1.5,
// contract `tasks/undo-change/api-contract.md`.
//
//   node --test apps/tracy-web/test/turn-undo.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fileOutcome,
  lookOutcome,
  looksToCheck,
  REASON_ORDER,
  revertOutcome,
  runUndo,
  shasToCheck,
  sortReasons,
  turnsView,
  undoneMarks,
  pairWrites,
  undoPlan
} from '../src/sites/turn-undo.js'

const S = 'sess-a1'
const T0 = Date.parse('2026-10-06T10:00:00Z')
const at = (minutes) => new Date(T0 + minutes * 60_000)
const ME = 'owner@x.y'
const sha = (n) => String(n).repeat(40).slice(0, 40)

/** One closed turn of session S. */
const turn = (n, { files = 0, opened = n * 10, closed = n * 10 + 5, actor = ME, state = 'closed' } = {}) => ({
  turn_id: `${S}:${n}`,
  session_id: S,
  turn: n,
  actor,
  title: `Request ${n}`,
  opened_at: at(opened),
  closed_at: state === 'closed' ? at(closed) : null,
  state,
  head_sha: files > 0 ? sha(n) : null,
  files
})

/** One Apply write of a turn and the audit row of the same statement. */
function write(
  turnId,
  applyId,
  minute,
  { action = 'content.update', target = { kind: 'post', id: '42' } } = {}
) {
  const when = at(minute)
  return {
    write: {
      id: minute,
      at: when,
      actor: ME,
      action,
      outcome: 'ok',
      target,
      via: 'apply',
      turn_id: turnId,
      session_id: S
    },
    audit: { at: when, actor: ME, action, detail: { ok: true, apply_id: applyId, turnId, sessionId: S } }
  }
}

/** Facts with sane defaults; `over` replaces any of them. */
function facts(over = {}) {
  return {
    platform: 'wordpress',
    now: T0 + 60 * 60_000,
    viewer: { email: ME, seesAll: true },
    toolsets: { code: true, content: true },
    turns: [],
    openTurns: [],
    moments: { turns: {}, truncated: false },
    writes: [],
    audits: [],
    laterWrites: [],
    laterCms: [],
    operations: [],
    check: { commits: [], conflict: null },
    ...over
  }
}

/** Two turns: 1 wrote content (apply-1), 2 committed one file. */
function twoTurns(over = {}) {
  const w = write(`${S}:1`, 'apply-1', 12)
  return facts({
    turns: [turn(1), turn(2, { files: 1 })],
    moments: {
      turns: {
        [`${S}:1`]: [],
        [`${S}:2`]: [{ sha: sha(2), at: 0, files: ['wp-content/themes/t/style.css'] }]
      }
    },
    writes: [w.write],
    audits: [w.audit],
    laterWrites: [w.write],
    check: { commits: [{ sha: sha(2), zones: { design: 1 } }], conflict: null },
    ...over
  })
}

const byTurn = (view, n) => view.turns.find((t) => t.turn === n)

test('reasons sort by the contract order, whatever order they were found in', () => {
  const shuffled = [...REASON_ORDER].reverse().map((code) => ({ code }))
  assert.deepEqual(
    sortReasons(shuffled).map((r) => r.code),
    REASON_ORDER
  )
  assert.equal(sortReasons([{ code: 'LATER_TURN_BLOCKED' }, { code: 'TURN_OPEN' }])[0].code, 'TURN_OPEN')
})

test('latest vs from-here: the newest turn that changed something is latest, older ones go back to here', () => {
  const view = turnsView(twoTurns())
  const t1 = byTurn(view, 1)
  const t2 = byTurn(view, 2)
  assert.equal(t2.undo.state, 'available')
  assert.equal(t2.undo.latest, true)
  assert.deepEqual(t2.undo.needs, { code: true, content: false })
  assert.deepEqual(t2.files, { count: 1, commits: [sha(2)], zones: { design: 1 } })
  assert.equal(t1.undo.state, 'available')
  assert.equal(t1.undo.latest, false)
  assert.deepEqual(t1.undo.needs, { code: true, content: true }, 'going back to 1 also undoes 2')
  assert.deepEqual(t1.content, [
    {
      applyId: 'apply-1',
      action: 'content.update',
      target: { kind: 'post', id: '42', title: null },
      at: at(12).toISOString()
    }
  ])
})

test('a turn that changed nothing is none, and the turn after a later one was undone is latest again', () => {
  const quiet = turn(3)
  const view = turnsView(
    twoTurns({
      turns: [turn(1), turn(2, { files: 1 }), quiet],
      operations: [
        { action: 'undo', status: 'succeeded', target_sha: sha(2).slice(0, 7), created_at: at(40) }
      ]
    })
  )
  assert.equal(byTurn(view, 3).undo.state, 'none')
  assert.equal(byTurn(view, 3).changed, false)
  assert.equal(byTurn(view, 2).undo.state, 'undone')
  assert.equal(byTurn(view, 1).undo.latest, true)
  assert.equal(
    byTurn(view, 1).undo.state,
    'available',
    'the undo of 2 is part of the run, not a restore after'
  )
})

test('content changed after the turn in the CMS admin blocks it; a cron row does not', () => {
  const cms = (actor, origin, minute) => ({
    source: 'wordpress-tracy-log',
    cms_actor: actor,
    resource_type: 'post',
    resource_id: '42',
    resource_title: 'Home',
    op: 'update',
    occurred_at: at(minute),
    origin: { source: origin }
  })
  const cron = turnsView(twoTurns({ laterCms: [cms(null, 'automatic', 30)] }))
  assert.equal(byTurn(cron, 2).undo.state, 'available')
  const admin = turnsView(twoTurns({ laterCms: [cms({ id: 3, name: 'Ann' }, 'cms-admin', 30)] }))
  const t2 = byTurn(admin, 2)
  assert.equal(t2.undo.state, 'blocked')
  assert.deepEqual(t2.undo.reasons[0], {
    code: 'CONTENT_CHANGED_AFTER',
    via: 'cms-admin',
    by: 'Ann',
    at: at(30).toISOString(),
    target: { kind: 'post', id: '42', title: 'Home' }
  })
  // An edit between turn 1 and turn 2 blocks going back to 1, not undoing 2.
  const between = turnsView(twoTurns({ laterCms: [cms({ id: 3, name: 'Ann' }, 'cms-admin', 18)] }))
  assert.equal(byTurn(between, 2).undo.state, 'available')
  assert.equal(byTurn(between, 1).undo.reasons[0].code, 'CONTENT_CHANGED_AFTER')
})

test("another conversation's Tracy write after the turn blocks it; this run's own writes and reverts do not", () => {
  const other = {
    id: 99,
    at: at(30),
    actor: 'eve@x.y',
    action: 'content.update',
    outcome: 'ok',
    target: { kind: 'post', id: '7' },
    via: 'apply',
    turn_id: 'sess-zz:4',
    session_id: 'sess-zz'
  }
  const blocked = turnsView(twoTurns({ laterWrites: [other] }))
  assert.deepEqual(byTurn(blocked, 2).undo.reasons[0], {
    code: 'CONTENT_CHANGED_AFTER',
    via: 'tracy',
    by: 'eve@x.y',
    at: at(30).toISOString(),
    target: { kind: 'post', id: '7', title: null }
  })
  // Turn 3 of the same conversation writes after 1: part of going back to 1, not a block.
  const w3 = write(`${S}:3`, 'apply-3', 32)
  const base = twoTurns()
  const mine = turnsView({
    ...base,
    turns: [...base.turns, turn(3)],
    writes: [...base.writes, w3.write],
    audits: [...base.audits, w3.audit],
    laterWrites: [...base.laterWrites, w3.write]
  })
  assert.equal(byTurn(mine, 1).undo.state, 'available')
  assert.equal(byTurn(mine, 3).undo.latest, true)
  // A revert (no turn) of apply-3 by this conversation: 3 is undone, and the revert blocks nothing.
  const revert = {
    write: { ...w3.write, id: 50, at: at(45), action: 'apply.revert', turn_id: null },
    audit: {
      at: at(45),
      actor: ME,
      action: 'apply.revert',
      detail: { ok: true, apply_id: 'apply-3', sessionId: S }
    }
  }
  const reverted = turnsView({
    ...base,
    turns: [...base.turns, turn(3)],
    writes: [...base.writes, w3.write],
    audits: [...base.audits, w3.audit, revert.audit],
    laterWrites: [...base.laterWrites, w3.write, revert.write]
  })
  assert.equal(byTurn(reverted, 3).undo.state, 'undone')
  assert.equal(byTurn(reverted, 2).undo.latest, true)
  assert.equal(byTurn(reverted, 1).undo.state, 'available')
})

test('a restore after the turn blocks it, unless it is the undo of a turn of the run', () => {
  const reset = { action: 'reset', status: 'succeeded', target_sha: sha(9), created_at: at(30) }
  const view = turnsView(twoTurns({ operations: [reset] }))
  assert.deepEqual(byTurn(view, 2).undo.reasons[0], {
    code: 'RESTORED_AFTER',
    at: at(30).toISOString(),
    action: 'reset'
  })
  const failed = turnsView(twoTurns({ operations: [{ ...reset, status: 'failed' }] }))
  assert.equal(byTurn(failed, 2).undo.state, 'available', 'a refused restore moved nothing')
})

test('files changed after: the host preflight conflict blocks that turn and every older one', () => {
  const view = turnsView(
    twoTurns({
      check: {
        commits: [{ sha: sha(2), zones: {} }],
        conflict: { sha: sha(2), code: 'CONFLICT', files: ['wp-content/themes/t/style.css'] }
      }
    })
  )
  assert.deepEqual(byTurn(view, 2).undo.reasons, [
    { code: 'FILES_CHANGED_AFTER', files: ['wp-content/themes/t/style.css'] }
  ])
  assert.deepEqual(byTurn(view, 1).undo.reasons, [
    { code: 'LATER_TURN_BLOCKED', turnId: `${S}:2`, blockedBy: 'FILES_CHANGED_AFTER' }
  ])
})

test('a turn open on the site blocks every turn, and outranks every other reason', () => {
  const open = { ...turn(9, { state: 'open', opened: 55 }), turn_id: 'sess-zz:9', actor: 'eve@x.y' }
  const view = turnsView(
    twoTurns({
      openTurns: [open],
      operations: [{ action: 'reset', status: 'succeeded', created_at: at(30) }]
    })
  )
  assert.equal(view.siteBusy, true)
  assert.deepEqual(byTurn(view, 2).undo.reasons[0], { code: 'TURN_OPEN', by: 'eve@x.y' })
  assert.equal(byTurn(view, 1).undo.reasons[0].code, 'TURN_OPEN')
  // Stale: opened more than 30 minutes ago, it no longer holds the site.
  const stale = turnsView(twoTurns({ openTurns: [{ ...open, opened_at: at(10) }] }))
  assert.equal(stale.siteBusy, false)
})

test('a missing toolset blocks with the toolset named; going back needs every toolset of the run', () => {
  const noCode = turnsView(twoTurns({ toolsets: { code: false, content: true } }))
  assert.deepEqual(byTurn(noCode, 2).undo.reasons, [{ code: 'MISSING_TOOLSET', toolset: 'code' }])
  const noContent = turnsView(twoTurns({ toolsets: { code: true, content: false } }))
  assert.equal(byTurn(noContent, 2).undo.state, 'available', 'turn 2 wrote files only')
  assert.deepEqual(byTurn(noContent, 1).undo.reasons, [{ code: 'MISSING_TOOLSET', toolset: 'content' }])
  const plan = undoPlan(noContent, `${S}:1`, 'from-here')
  assert.deepEqual(plan, { error: { status: 403, code: 'FORBIDDEN_WRITE', toolset: 'content' } })
})

test('EmDash: no undo at all', () => {
  const view = turnsView(twoTurns({ platform: 'emdash' }))
  assert.equal(view.cms, 'emdash')
  assert.deepEqual(byTurn(view, 2).undo.reasons, [{ code: 'NO_UNDO_ON_EMDASH' }])
})

test('NOT_RECORDED: files with no trailer commit, a write with no apply_id, a moment the host will not undo', () => {
  const w = write(`${S}:1`, null, 12)
  const view = turnsView(
    twoTurns({
      moments: { turns: {}, truncated: false },
      writes: [w.write],
      audits: [w.audit],
      check: { commits: [], conflict: null }
    })
  )
  assert.deepEqual(byTurn(view, 2).undo.reasons, [{ code: 'NOT_RECORDED', part: 'files' }])
  assert.equal(byTurn(view, 1).undo.reasons[0].code, 'NOT_RECORDED')
  assert.equal(byTurn(view, 1).undo.reasons[0].part, 'content')
  // A walk the host cut short proves nothing missing.
  const cut = turnsView(twoTurns({ moments: { turns: {}, truncated: true }, check: null }))
  assert.equal(byTurn(cut, 2).undo.reasons.length, 0)
  const refused = turnsView(
    twoTurns({ check: { commits: [], conflict: { sha: sha(2), code: 'NOT_UNDOABLE', files: [] } } })
  )
  assert.deepEqual(byTurn(refused, 2).undo.reasons, [{ code: 'NOT_RECORDED', part: 'files' }])
})

test('a member sees only their own turns; an owner sees everybody in the conversation', () => {
  const base = twoTurns()
  const shared = { ...base, turns: [turn(1, { actor: 'eve@x.y' }), turn(2, { files: 1 })] }
  assert.deepEqual(
    turnsView({ ...shared, viewer: { email: ME, seesAll: false } }).turns.map((t) => t.turn),
    [2]
  )
  assert.deepEqual(
    turnsView(shared).turns.map((t) => t.turn),
    [1, 2]
  )
})

test('undoPlan: newest turn first, each with its moments and its apply ids newest first', () => {
  const a = write(`${S}:1`, 'apply-a', 11)
  const b = write(`${S}:1`, 'apply-b', 13)
  const a2 = write(`${S}:1`, 'apply-a', 14, { target: { kind: 'post', id: '43' } })
  const view = turnsView(
    twoTurns({
      writes: [a.write, b.write, a2.write],
      audits: [a.audit, b.audit, a2.audit],
      moments: {
        turns: {
          [`${S}:1`]: [],
          [`${S}:2`]: [
            { sha: sha(3), files: ['b.css'] },
            { sha: sha(2), files: ['a.css'] }
          ]
        }
      }
    })
  )
  assert.deepEqual(undoPlan(view, `${S}:1`, 'from-here'), {
    steps: [
      { turnId: `${S}:2`, commits: [sha(3), sha(2)], applyIds: [], looks: [] },
      { turnId: `${S}:1`, commits: [], applyIds: ['apply-a', 'apply-b'], looks: [] }
    ]
  })
  assert.equal(byTurn(view, 1).content.length, 3, 'one entry per record written')
  assert.deepEqual(undoPlan(view, `${S}:1`, 'turn'), { error: { status: 409, code: 'NOT_LATEST' } })
  assert.deepEqual(undoPlan(view, `${S}:2`, 'turn').steps.length, 1)
  assert.equal(undoPlan(view, `${S}:9`, 'turn').error.code, 'TURN_UNKNOWN')
  assert.deepEqual(
    shasToCheck({
      turns: [turn(1), turn(2)],
      moments: { turns: { [`${S}:2`]: [{ sha: sha(3) }, { sha: sha(2) }] } },
      operations: []
    }),
    [sha(3), sha(2)]
  )
})

test('undoPlan: one apply id per write — a turn of many undoes them newest first, a tie in time by the later write', () => {
  const ids = ['wp-t-1', 'wp-t-2', 'wp-t-3']
  const rows = ids.map((id, i) =>
    write(`${S}:1`, id, 11 + (i === 2 ? 1 : 0), { target: { kind: 'post', id: `${40 + i}` } })
  )
  const view = turnsView(
    facts({
      turns: [turn(1)],
      moments: { turns: { [`${S}:1`]: [] } },
      writes: rows.map((r) => r.write),
      audits: rows.map((r) => r.audit),
      laterWrites: rows.map((r) => r.write)
    })
  )
  assert.deepEqual(undoPlan(view, `${S}:1`, 'turn').steps?.[0]?.applyIds, ['wp-t-3', 'wp-t-2', 'wp-t-1'])
})

test('undoPlan refuses a blocked turn with its reasons, and a turn with nothing left to undo', () => {
  const view = turnsView(twoTurns({ platform: 'emdash' }))
  assert.deepEqual(undoPlan(view, `${S}:2`, 'turn'), {
    error: { status: 409, code: 'BLOCKED', reasons: [{ code: 'NO_UNDO_ON_EMDASH' }] }
  })
  const quiet = turnsView(facts({ turns: [turn(1)] }))
  assert.equal(undoPlan(quiet, `${S}:1`, 'turn').error.code, 'NOTHING_TO_UNDO')
})

test('runUndo: in order, files before content, and it stops at the first step that did not succeed', async () => {
  const steps = [
    { turnId: 't2', commits: ['c2b', 'c2a'], applyIds: ['x2'] },
    { turnId: 't1', commits: [], applyIds: ['x1b', 'x1a'] }
  ]
  const calls = []
  const ok = await runUndo(steps, {
    undoCommit: async (s) => (calls.push(s), { status: 'undone', operationId: `op-${s}` }),
    revertApply: async (id) => (calls.push(id), { outcome: 'reverted' })
  })
  assert.deepEqual(calls, ['c2b', 'c2a', 'x2', 'x1b', 'x1a'])
  assert.equal(ok.complete, true)
  assert.deepEqual(ok.turns[0].files, { status: 'undone', operationIds: ['op-c2b', 'op-c2a'] })
  assert.deepEqual(ok.turns[1].files, { status: 'none', operationIds: [] })

  const seen = []
  const stopped = await runUndo(steps, {
    undoCommit: async (s) => (
      seen.push(s),
      s === 'c2a'
        ? { status: 'failed', code: 'CONFLICT', operationId: 'op' }
        : { status: 'undone', operationId: null }
    ),
    revertApply: async (id) => (seen.push(id), { outcome: 'reverted' })
  })
  assert.deepEqual(seen, ['c2b', 'c2a'], 'nothing after the failed moment, not even its own content')
  assert.equal(stopped.complete, false)
  assert.equal(stopped.turns.length, 1)
  assert.deepEqual(stopped.turns[0].files, { status: 'failed', code: 'CONFLICT', operationIds: ['op'] })

  const unsure = await runUndo(steps, {
    undoCommit: async () => ({ status: 'undone', operationId: null }),
    revertApply: async (id) =>
      id === 'x1b' ? { outcome: 'unsure', code: 'COMPONENT_UNREACHABLE' } : { outcome: 'reverted' }
  })
  assert.equal(unsure.complete, false)
  assert.deepEqual(unsure.turns[1].content, {
    reverted: [],
    failed: [],
    unsure: [{ applyId: 'x1b', code: 'COMPONENT_UNREACHABLE' }]
  })
})

test('revertOutcome: only ok:true is a revert; a clean no is failed; silence is unsure', () => {
  assert.deepEqual(revertOutcome({ status: 200, body: { ok: true } }), { outcome: 'reverted' })
  assert.deepEqual(revertOutcome({ status: 200, body: { ok: false, code: 'NO_RECEIPT' } }), {
    outcome: 'failed',
    code: 'NO_RECEIPT'
  })
  assert.deepEqual(revertOutcome({ status: 403, body: { code: 'TOOLSET_NOT_GRANTED' } }), {
    outcome: 'failed',
    code: 'TOOLSET_NOT_GRANTED'
  })
  assert.deepEqual(revertOutcome({ status: 409, body: { code: 'SITE_BUSY' } }), {
    outcome: 'failed',
    code: 'SITE_BUSY'
  })
  assert.deepEqual(revertOutcome({ status: 502, body: { code: 'COMPONENT_UNREACHABLE' } }), {
    outcome: 'unsure',
    code: 'COMPONENT_UNREACHABLE'
  })
  assert.deepEqual(revertOutcome({ status: 200, body: { done: 1 } }), {
    outcome: 'unsure',
    code: 'OUTCOME_UNKNOWN'
  })
  assert.deepEqual(revertOutcome({ status: 504, body: null }), { outcome: 'unsure', code: 'HTTP_504' })
  assert.deepEqual(revertOutcome({ thrown: true }), { outcome: 'unsure', code: 'UNREACHABLE' })
})

test('fileOutcome: a verified restore commit is undone; a refusal failed; anything that may have run unsure', () => {
  assert.deepEqual(fileOutcome({ status: 200, body: { ok: true, status: 'succeeded', operationId: 'o1' } }), {
    status: 'undone',
    operationId: 'o1'
  })
  assert.deepEqual(
    fileOutcome({
      status: 409,
      body: { code: 'CONFLICT', files: ['a'], status: 'failed', operationId: 'o2' }
    }),
    {
      status: 'failed',
      code: 'CONFLICT',
      operationId: 'o2'
    }
  )
  assert.equal(
    fileOutcome({ status: 202, body: { code: 'OPERATION_UNKNOWN', status: 'unknown' } }).status,
    'unsure'
  )
  assert.equal(
    fileOutcome({ status: 502, body: { code: 'FLEET_JOB_FAILED', status: 'unknown' } }).status,
    'unsure'
  )
  assert.equal(
    fileOutcome({ status: 502, body: { code: 'FLEET_JOB_FAILED', status: 'failed' } }).status,
    'failed'
  )
  assert.equal(
    fileOutcome({ status: 200, body: { ok: true, status: 'succeeded_noop' } }).code,
    'SUCCEEDED_NOOP'
  )
  assert.equal(fileOutcome({ status: 403, body: { code: 'FORBIDDEN_WRITE' } }).status, 'failed')
})

test('SHARED_CHANGE apply-id: an id of the undo set also written outside it blocks; inside the set it does not', () => {
  // apply-1 (turn 1) also has a write in another conversation's turn.
  const elsewhere = {
    at: at(30),
    action: 'content.update',
    detail: { ok: true, apply_id: 'apply-1', turnId: 'sess-zz:3' }
  }
  const base = twoTurns()
  const view = turnsView({ ...base, sharedAudits: [...base.audits, elsewhere] })
  assert.deepEqual(byTurn(view, 1).undo.reasons, [
    { code: 'SHARED_CHANGE', cause: 'apply-id', turnId: 'sess-zz:3' }
  ])
  assert.deepEqual(undoPlan(view, `${S}:1`, 'from-here').error, {
    status: 409,
    code: 'BLOCKED',
    reasons: [{ code: 'SHARED_CHANGE', cause: 'apply-id', turnId: 'sess-zz:3' }]
  })
  // The same id written by turns 1 and 2 of this conversation: undoing 2 alone splits it,
  // going back to 1 takes both halves — and is not LATER_TURN_BLOCKED by 2's split.
  const w1 = write(`${S}:1`, 'apply-x', 12)
  const w2 = write(`${S}:2`, 'apply-x', 22)
  const both = facts({
    turns: [turn(1), turn(2)],
    writes: [w1.write, w2.write],
    audits: [w1.audit, w2.audit],
    sharedAudits: [w1.audit, w2.audit]
  })
  const split = turnsView(both)
  assert.deepEqual(byTurn(split, 2).undo.reasons, [
    { code: 'SHARED_CHANGE', cause: 'apply-id', turnId: `${S}:1` }
  ])
  assert.equal(byTurn(split, 1).undo.state, 'available')
})

test('SHARED_CHANGE concurrent / unsealed: a turn of the undo set whose moments may hold other files', () => {
  const base = twoTurns()
  const concurrent = turnsView({ ...base, turns: [turn(1), { ...turn(2, { files: 1 }), concurrent: true }] })
  const reason = { code: 'SHARED_CHANGE', cause: 'concurrent', turnId: `${S}:2` }
  assert.deepEqual(byTurn(concurrent, 2).undo.reasons, [reason])
  assert.deepEqual(
    byTurn(concurrent, 1).undo.reasons,
    [reason],
    'judged on the set, not passed on as LATER_TURN_BLOCKED'
  )
  const unsealed = turnsView({
    ...base,
    turns: [turn(1), { ...turn(2, { files: 1 }), unsealed_start: true }]
  })
  assert.equal(byTurn(unsealed, 2).undo.reasons[0].cause, 'unsealed')
  // Local stand 24/10/2026: the first turn of a whole-site build laid the site down — nothing earlier to go back to.
  const build = {
    ...turn(1, { files: 1 }),
    turn_id: 'wo-demo-a1:1',
    session_id: 'wo-demo-a1',
    unsealed_start: true
  }
  const built = turnsView(
    facts({
      turns: [build],
      moments: { turns: { 'wo-demo-a1:1': [{ sha: sha(1), at: 0, files: ['index.php'] }] } },
      writes: [],
      audits: [],
      laterWrites: [],
      check: { commits: [{ sha: sha(1), zones: { design: 1 } }], conflict: null }
    })
  )
  assert.equal(byTurn(built, 1).undo.reasons[0]?.cause, 'built')
  // Without file moments the flag holds nothing of anybody else's.
  const contentOnly = turnsView({ ...base, turns: [{ ...turn(1), concurrent: true }, turn(2, { files: 1 })] })
  assert.equal(byTurn(contentOnly, 1).undo.state, 'available')
  // Priority: right after FILES_CHANGED_AFTER, before NOT_RECORDED.
  assert.deepEqual(
    sortReasons([{ code: 'NOT_RECORDED' }, { code: 'SHARED_CHANGE' }, { code: 'FILES_CHANGED_AFTER' }]).map(
      (r) => r.code
    ),
    ['FILES_CHANGED_AFTER', 'SHARED_CHANGE', 'NOT_RECORDED']
  )
})

test('undoneMarks: a turn fully undone is complete; one cut midway is stamped partial; one untouched is not stamped', () => {
  const steps = [
    { turnId: `${S}:3`, commits: ['c3a', 'c3b'], applyIds: ['ap3'] },
    { turnId: `${S}:2`, commits: ['c2a', 'c2b'], applyIds: [] },
    { turnId: `${S}:1`, commits: ['c1'], applyIds: [] }
  ]
  const none = { reverted: [], failed: [], unsure: [] }
  // Turn 3 all gone; turn 2 lost its newer moment, then the older one was refused; turn 1 never reached.
  const result = {
    complete: false,
    turns: [
      {
        turnId: `${S}:3`,
        files: { status: 'undone', operationIds: [] },
        content: { ...none, reverted: ['ap3'] }
      },
      { turnId: `${S}:2`, files: { status: 'failed', code: 'CONFLICT', operationIds: [] }, content: none }
    ]
  }
  assert.deepEqual(undoneMarks(steps, result, new Set(['c3a', 'c3b', 'c2a'])), [
    { turnId: `${S}:3`, complete: true, proven: true },
    { turnId: `${S}:2`, complete: false, proven: true }
  ])
  // Refused on its first moment: nothing of the turn changed, nothing stamped.
  const refused = {
    complete: false,
    turns: [
      { turnId: `${S}:1`, files: { status: 'failed', code: 'CONFLICT', operationIds: [] }, content: none }
    ]
  }
  assert.deepEqual(undoneMarks([steps[2]], refused, new Set()), [])
  // A moment that may have run, or a revert left unsure: stamped (the agent hears of it), partial, and
  // not proven — the Site changes row is undone only by proof.
  const unsure = {
    complete: false,
    turns: [
      { turnId: `${S}:1`, files: { status: 'unsure', code: 'HTTP_502', operationIds: [] }, content: none }
    ]
  }
  assert.deepEqual(undoneMarks([steps[2]], unsure, new Set()), [
    { turnId: `${S}:1`, complete: false, proven: false }
  ])
  // Content only, one revert failed after another went.
  const contentStep = [{ turnId: `${S}:4`, commits: [], applyIds: ['a', 'b'] }]
  const half = {
    complete: false,
    turns: [
      {
        turnId: `${S}:4`,
        files: { status: 'none', operationIds: [] },
        content: { reverted: ['a'], failed: [{ applyId: 'b', code: 'NOPE' }], unsure: [] }
      }
    ]
  }
  assert.deepEqual(undoneMarks(contentStep, half, new Set()), [
    { turnId: `${S}:4`, complete: false, proven: true }
  ])
})

// ── WordPress looks: the site's Additional CSS (`look-css`), put back by the host, not by Git ─────

/** One WordPress look write (or its revert) as `/changed` records it. */
const look = (turnId, undo, minute, { action = 'look.set', actor = ME, session = S } = {}) => ({
  id: 1000 + minute,
  at: at(minute),
  actor,
  action,
  outcome: 'ok',
  target: undo === null ? null : { kind: 'additional-css', id: undo },
  via: 'look-css',
  turn_id: turnId,
  session_id: session
})
const H = (n) => `h${n}`.padEnd(64, '0')
/** The host's check of look entries: `[before, after]` hashes each, and the site's Additional CSS now. */
const checked = (now, entries) => ({
  entries: Object.fromEntries(
    Object.entries(entries).map(([id, e]) =>
      e === 'unknown'
        ? [id, { unknown: true }]
        : [id, { before: e[0], after: e[1], now, reverted: e[2] === true }]
    )
  )
})

test('a WordPress look turn: changed, undoable with the code toolset, its look named; the plan puts it back', () => {
  const w = look(`${S}:1`, 'aaaaaa', 12)
  const view = turnsView(
    facts({ turns: [turn(1)], writes: [w], laterWrites: [w], looks: checked(H(1), { aaaaaa: [H(0), H(1)] }) })
  )
  const t1 = byTurn(view, 1)
  assert.equal(t1.changed, true)
  assert.deepEqual(t1.look, [{ undo: 'aaaaaa', at: at(12).toISOString() }])
  assert.deepEqual(t1.undo, {
    state: 'available',
    latest: true,
    reasons: [],
    needs: { code: true, content: false }
  })
  assert.deepEqual(undoPlan(view, `${S}:1`, 'turn'), {
    steps: [{ turnId: `${S}:1`, commits: [], applyIds: [], looks: ['aaaaaa'] }]
  })
  assert.deepEqual(looksToCheck([w]), ['aaaaaa'])
  const noCode = turnsView(facts({ turns: [turn(1)], writes: [w], toolsets: { code: false, content: true } }))
  assert.deepEqual(byTurn(noCode, 1).undo.reasons, [{ code: 'MISSING_TOOLSET', toolset: 'code' }])
})

test('a look already put back — a look.revert recorded after it, or the host saying so — is undone', () => {
  const w = look(`${S}:1`, 'aaaaaa', 12)
  const back = look(null, 'aaaaaa', 30, { action: 'look.revert' })
  const byRecord = turnsView(facts({ turns: [turn(1)], writes: [w], laterWrites: [w, back] }))
  assert.equal(byTurn(byRecord, 1).undo.state, 'undone')
  const byHost = turnsView(
    facts({
      turns: [turn(1)],
      writes: [w],
      laterWrites: [w],
      looks: checked(H(0), { aaaaaa: [H(0), H(1), true] })
    })
  )
  assert.equal(byTurn(byHost, 1).undo.state, 'undone')
  // A revert in a later turn of the chat is not a change of its own: that turn changed nothing.
  const inTurn = look(`${S}:2`, 'aaaaaa', 22, { action: 'look.revert' })
  const view = turnsView(facts({ turns: [turn(1), turn(2)], writes: [w, inTurn], laterWrites: [w, inTurn] }))
  assert.equal(byTurn(view, 1).undo.state, 'undone')
  assert.equal(byTurn(view, 2).undo.state, 'none')
})

test("LOOK_CHANGED_AFTER: another conversation's look write after the turn, or Additional CSS the host finds changed; the run's own later looks do not block", () => {
  const w1 = look(`${S}:1`, 'aaaaaa', 12)
  const w2 = look(`${S}:2`, 'bbbbbb', 22)
  const other = look('other:1', 'cccccc', 40, { actor: 'ann@x.y', session: 'other' })
  const blocked = turnsView(facts({ turns: [turn(1)], writes: [w1], laterWrites: [w1, other] }))
  assert.deepEqual(byTurn(blocked, 1).undo.reasons, [
    { code: 'LOOK_CHANGED_AFTER', via: 'tracy', by: 'ann@x.y', at: at(40).toISOString() }
  ])
  // Two looks of the chat, chained: 2 left H2 (the site's now), 1 left H1 = 2's before. Going back
  // to 1 walks both; nothing blocks.
  const chained = facts({
    turns: [turn(1), turn(2)],
    writes: [w1, w2],
    laterWrites: [w1, w2],
    looks: checked(H(2), { aaaaaa: [H(0), H(1)], bbbbbb: [H(1), H(2)] })
  })
  const view = turnsView(chained)
  assert.equal(byTurn(view, 1).undo.state, 'available')
  assert.deepEqual(
    undoPlan(view, `${S}:1`, 'from-here').steps.map((s) => s.looks),
    [['bbbbbb'], ['aaaaaa']]
  )
  // Someone saved Additional CSS in the Customizer after 2: the site holds H9, no record names it.
  const edited = turnsView({
    ...chained,
    looks: checked(H(9), { aaaaaa: [H(0), H(1)], bbbbbb: [H(1), H(2)] })
  })
  assert.deepEqual(byTurn(edited, 2).undo.reasons, [{ code: 'LOOK_CHANGED_AFTER', via: 'outside' }])
  assert.equal(byTurn(edited, 1).undo.reasons[0].code, 'LOOK_CHANGED_AFTER')
  // An edit BETWEEN the two looks: 2 can go, 1 cannot.
  const between = turnsView({
    ...chained,
    looks: checked(H(2), { aaaaaa: [H(0), H(1)], bbbbbb: [H(5), H(2)] })
  })
  assert.equal(byTurn(between, 2).undo.state, 'available')
  assert.deepEqual(byTurn(between, 1).undo.reasons, [{ code: 'LOOK_CHANGED_AFTER', via: 'outside' }])
  // The host could not be asked: no hash reason (the POST refuses to write without the check).
  assert.equal(byTurn(turnsView({ ...chained, looks: null }), 1).undo.state, 'available')
})

test('NOT_RECORDED look: a look write that named no undo id, or an entry the host no longer keeps', () => {
  const bare = look(`${S}:1`, null, 12)
  assert.deepEqual(byTurn(turnsView(facts({ turns: [turn(1)], writes: [bare] })), 1).undo.reasons, [
    { code: 'NOT_RECORDED', part: 'look' }
  ])
  const w = look(`${S}:1`, 'aaaaaa', 12)
  const pruned = turnsView(
    facts({ turns: [turn(1)], writes: [w], looks: checked(H(1), { aaaaaa: 'unknown' }) })
  )
  assert.deepEqual(byTurn(pruned, 1).undo.reasons, [{ code: 'NOT_RECORDED', part: 'look' }])
})

test('runUndo: files, then content, then looks, newest first; a look refused stops the run', async () => {
  const steps = [
    { turnId: 't2', commits: ['c2'], applyIds: ['x2'], looks: ['bbbbbb', 'aaaaaa'] },
    { turnId: 't1', commits: [], applyIds: [], looks: ['cccccc'] }
  ]
  const calls = []
  const deps = {
    undoCommit: async (s) => (calls.push(s), { status: 'undone', operationId: null }),
    revertApply: async (id) => (calls.push(id), { outcome: 'reverted' }),
    undoLook: async (id) => (calls.push(id), { status: 'undone' })
  }
  const ok = await runUndo(steps, deps)
  assert.deepEqual(calls, ['c2', 'x2', 'bbbbbb', 'aaaaaa', 'cccccc'])
  assert.equal(ok.complete, true)
  assert.deepEqual(ok.turns[0].look, { undone: ['bbbbbb', 'aaaaaa'], failed: [], unsure: [] })
  assert.deepEqual(undoneMarks(steps, ok, new Set(['c2'])), [
    { turnId: 't2', complete: true, proven: true },
    { turnId: 't1', complete: true, proven: true }
  ])
  const refused = await runUndo(steps, {
    ...deps,
    undoLook: async (id) =>
      id === 'aaaaaa' ? { status: 'failed', code: 'LOOK_UNDO_CHANGED_SINCE' } : { status: 'undone' }
  })
  assert.equal(refused.complete, false)
  assert.equal(refused.turns.length, 1, 'turn 1 never reached')
  assert.deepEqual(refused.turns[0].look, {
    undone: ['bbbbbb'],
    failed: [{ undo: 'aaaaaa', code: 'LOOK_UNDO_CHANGED_SINCE' }],
    unsure: []
  })
  assert.deepEqual(undoneMarks(steps, refused, new Set(['c2'])), [
    { turnId: 't2', complete: false, proven: true }
  ])
  // A look-only turn whose one look was refused: nothing of it changed, nothing stamped.
  const only = [{ turnId: 't1', commits: [], applyIds: [], looks: ['cccccc'] }]
  const none = await runUndo(only, {
    ...deps,
    undoLook: async () => ({ status: 'failed', code: 'LOOK_UNDO_USED' })
  })
  assert.deepEqual(undoneMarks(only, none, new Set()), [])
})

test('lookOutcome: only ok:true is undone; a clean refusal failed; a job that did not answer may have written', () => {
  const read = (o) => JSON.parse(o)
  assert.deepEqual(lookOutcome({ ok: true, output: '{"ok":true,"id":"aaaaaa"}' }, read), { status: 'undone' })
  assert.deepEqual(lookOutcome({ ok: true, output: '{"ok":false,"code":"LOOK_UNDO_CHANGED_SINCE"}' }, read), {
    status: 'failed',
    code: 'LOOK_UNDO_CHANGED_SINCE'
  })
  assert.deepEqual(lookOutcome({ ok: true, output: '{}' }, read), {
    status: 'unsure',
    code: 'FLEET_ANSWERED_UNREADABLY'
  })
  assert.deepEqual(lookOutcome({ ok: false, reason: 'timeout' }, read), {
    status: 'unsure',
    code: 'FLEET_JOB_PENDING'
  })
  assert.deepEqual(lookOutcome({ ok: false, reason: 'wp-cli in x-web-1: boom' }, read), {
    status: 'unsure',
    code: 'FLEET_JOB_FAILED'
  })
})

// ── a write the Apply door recorded as a create (#1259) ──
// `recordApply` keeps the audit row's `content.update` and rewrites the `site_write` row to
// `content.create`; pairing must still join the two to recover the apply id.
const created = (turnId, applyId, minute, target = { kind: 'page', id: '77' }) => {
  const w = write(turnId, applyId, minute, { target })
  return { write: { ...w.write, action: 'content.create' }, audit: w.audit }
}

test('a create-recorded write pairs with its content.update audit row and the turn offers undo', () => {
  const c = created(`${S}:1`, 'apply-c', 12)
  const paired = pairWrites([c.write], [c.audit])
  assert.equal(paired.get(c.write), c.audit)
  const view = turnsView(
    facts({
      turns: [turn(1)],
      writes: [c.write],
      audits: [c.audit],
      laterWrites: [c.write],
      moments: { turns: { [`${S}:1`]: [] }, truncated: false }
    })
  )
  const t = byTurn(view, 1)
  assert.equal(t.undo.state, 'available')
  assert.deepEqual(
    t.content.map((x) => [x.applyId, x.action, x.target.id]),
    [['apply-c', 'content.create', '77']]
  )
})

test('an update-only turn pairs exactly as before', () => {
  const u = write(`${S}:1`, 'apply-u', 12)
  assert.equal(pairWrites([u.write], [u.audit]).get(u.write), u.audit)
})

test('creates and updates in the same millisecond pair once each, in store order', () => {
  const c1 = created(`${S}:1`, 'a1', 12)
  const c2 = created(`${S}:1`, 'a2', 12, { kind: 'postmeta', id: '9' })
  const paired = pairWrites([c1.write, c2.write], [c1.audit, c2.audit])
  assert.equal(paired.get(c1.write), c1.audit)
  assert.equal(paired.get(c2.write), c2.audit)
})

test('the create rename is undone only for via apply, and never crosses turns, instants or actions', () => {
  const c = created(`${S}:1`, 'apply-c', 12)
  const other = { ...c.write, via: 'emdash-mcp' }
  assert.equal(pairWrites([other], [c.audit]).size, 0, 'only an apply write was renamed')
  const lateAudit = { ...c.audit, at: at(13) }
  assert.equal(pairWrites([c.write], [lateAudit]).size, 0)
  const otherTurn = { ...c.audit, detail: { ...c.audit.detail, turnId: `${S}:2` } }
  assert.equal(pairWrites([c.write], [otherTurn]).size, 0)
  const contract = { ...c.audit, action: 'content.contract' }
  assert.equal(pairWrites([c.write], [contract]).size, 0, 'a different action at the instant is not taken')
  assert.equal(pairWrites([c.write], []).size, 0, 'no audit row: still unrecorded')
})

test('a create and an update in one millisecond each take their own audit row, whatever the store order', () => {
  const u = write(`${S}:1`, 'a-upd', 12)
  const c = created(`${S}:1`, 'a-new', 12, { kind: 'postmeta', id: '9' })
  const contract = { ...u.audit, action: 'content.contract', detail: { ...u.audit.detail, apply_id: 'a-ct' } }
  for (const order of [
    [u, c],
    [c, u]
  ]) {
    const paired = pairWrites(
      order.map((x) => x.write),
      [contract, ...order.map((x) => x.audit)]
    )
    for (const x of order) assert.equal(paired.get(x.write), x.audit)
  }
})
