/**
 * What `DELETE /api/sites/:key` answered, as the My Sites client reads it (#801).
 *
 * The door takes the site's row off the book first and reports the rest beside it:
 * `{ removed, host, hostReason?, repo, sessions, sessionsReason?, seats }`
 * (`apps/tracy-web/src/sites/route.js`). The client used to read only `res.ok`, so a teardown that
 * left the host stack or the repository behind looked like a clean delete. Pinned here: every
 * answer that is not a confirmed, complete delete is told apart, and none of them reads as success.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { deleteOutcomeOf, readDeleteAnswer, REASON_MAX } from '../src/client/delete-response.ts'

const CLEAN = { removed: true, host: true, repo: true, sessions: true, seats: true }

/** A `Response` stand-in: just what `readDeleteAnswer` reads. */
const answer = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: typeof body === 'function' ? body : async () => body
})

test('every part confirmed is a complete delete', () => {
  assert.deepEqual(deleteOutcomeOf(CLEAN), { kind: 'complete' })
})

test('a host stack that did not go is a partial delete carrying the reason', () => {
  assert.deepEqual(deleteOutcomeOf({ ...CLEAN, host: false, hostReason: 'TEARDOWN_FAILED: exit 1' }), {
    kind: 'partial',
    issues: [{ part: 'host', state: 'failed', reason: 'TEARDOWN_FAILED: exit 1' }]
  })
  assert.deepEqual(deleteOutcomeOf({ ...CLEAN, host: false, hostReason: 'TEARDOWN_NOT_CONFIRMED' }), {
    kind: 'partial',
    issues: [{ part: 'host', state: 'failed', reason: 'TEARDOWN_NOT_CONFIRMED' }]
  })
  // No reason sent: the reason stays unknown, it is not invented.
  assert.deepEqual(deleteOutcomeOf({ ...CLEAN, host: false }), {
    kind: 'partial',
    issues: [{ part: 'host', state: 'failed', reason: null }]
  })
})

test('a repository GitHub did not confirm is a partial delete, with no invented reason', () => {
  assert.deepEqual(deleteOutcomeOf({ ...CLEAN, repo: 'failed' }), {
    kind: 'partial',
    issues: [{ part: 'repo', state: 'failed', reason: null }]
  })
})

test('no repository, and a repository kept on purpose, are not failures', () => {
  // `deleteRepoFor` (`apps/tracy-web/src/github/route.js`): false = the site had no repo,
  // 'kept' = a repo Tracy did not create, left untouched by design.
  assert.deepEqual(deleteOutcomeOf({ ...CLEAN, repo: false }), { kind: 'complete' })
  assert.deepEqual(deleteOutcomeOf({ ...CLEAN, repo: 'kept' }), { kind: 'complete' })
})

test('sessions and seats the agent did not confirm are disclosed, each with what was sent', () => {
  assert.deepEqual(
    deleteOutcomeOf({ ...CLEAN, sessions: false, sessionsReason: 'SESSION_ACTIVE', seats: false }),
    {
      kind: 'partial',
      issues: [
        { part: 'sessions', state: 'failed', reason: 'SESSION_ACTIVE' },
        { part: 'seats', state: 'failed', reason: null }
      ]
    }
  )
})

test('every failed part is listed, in one fixed order', () => {
  const outcome = deleteOutcomeOf({
    removed: true,
    seats: false,
    sessions: false,
    repo: 'failed',
    host: false,
    hostReason: 'TEARDOWN_FAILED'
  })
  assert.deepEqual(
    outcome.issues.map((i) => i.part),
    ['host', 'repo', 'sessions', 'seats']
  )
})

test('a part the answer does not report, or reports in a shape nobody defined, is unknown and never success', () => {
  assert.deepEqual(deleteOutcomeOf({ removed: true }), {
    kind: 'partial',
    issues: [
      { part: 'host', state: 'unknown', reason: null },
      { part: 'repo', state: 'unknown', reason: null },
      { part: 'sessions', state: 'unknown', reason: null },
      { part: 'seats', state: 'unknown', reason: null }
    ]
  })
  for (const odd of ['true', 1, 0, null, {}, [], 'done', 'KEPT', undefined]) {
    for (const part of ['host', 'repo', 'sessions', 'seats']) {
      // `false` and 'kept'/'failed' mean something for `repo` only; nothing else is in any contract.
      const outcome = deleteOutcomeOf({ ...CLEAN, [part]: odd })
      assert.deepEqual(
        outcome,
        { kind: 'partial', issues: [{ part, state: 'unknown', reason: null }] },
        `${part}: ${JSON.stringify(odd)}`
      )
    }
  }
  // 'kept' and 'failed' are repository words: on another part they are not an outcome.
  assert.equal(deleteOutcomeOf({ ...CLEAN, host: 'kept' }).issues[0].state, 'unknown')
  assert.equal(deleteOutcomeOf({ ...CLEAN, seats: 'failed' }).issues[0].state, 'unknown')
})

test('a reason of the confirmed part is not shown, and a reason that is not text is unknown', () => {
  assert.deepEqual(deleteOutcomeOf({ ...CLEAN, hostReason: 'stale', sessionsReason: 'stale' }), {
    kind: 'complete'
  })
  for (const odd of [{ a: 1 }, ['x'], 42, true, null, '', '   ']) {
    assert.deepEqual(
      deleteOutcomeOf({ ...CLEAN, host: false, hostReason: odd }).issues,
      [{ part: 'host', state: 'failed', reason: null }],
      JSON.stringify(odd)
    )
  }
})

test('a reason is kept as the text it is, trimmed, and cut when it runs on', () => {
  const html = '<img src=x onerror=alert(1)>'
  assert.equal(deleteOutcomeOf({ ...CLEAN, host: false, hostReason: `  ${html}  ` }).issues[0].reason, html)
  const long = 'x'.repeat(REASON_MAX + 500)
  const cut = deleteOutcomeOf({ ...CLEAN, host: false, hostReason: long }).issues[0].reason
  assert.equal(cut.length, REASON_MAX + 1)
  assert.ok(cut.endsWith('…'))
})

test('an answer that does not say the row was removed is an unknown result', () => {
  for (const body of [
    null,
    undefined,
    '',
    'ok',
    42,
    true,
    [],
    [CLEAN],
    {},
    { host: true, repo: true, sessions: true, seats: true },
    { ...CLEAN, removed: false },
    { ...CLEAN, removed: 'true' },
    { ...CLEAN, removed: 1 }
  ]) {
    assert.deepEqual(deleteOutcomeOf(body), { kind: 'unknown' }, JSON.stringify(body))
  }
})

test('reading the response: a success body is classified', async () => {
  assert.deepEqual(await readDeleteAnswer(answer(200, CLEAN)), { kind: 'complete' })
  assert.deepEqual(await readDeleteAnswer(answer(200, { ...CLEAN, repo: 'failed' })), {
    kind: 'partial',
    issues: [{ part: 'repo', state: 'failed', reason: null }]
  })
})

test('reading the response: a success with no readable body is an unknown result', async () => {
  const rejects = async () => {
    throw new SyntaxError('Unexpected end of JSON input')
  }
  assert.deepEqual(await readDeleteAnswer(answer(200, rejects)), { kind: 'unknown' })
  assert.deepEqual(await readDeleteAnswer(answer(204, rejects)), { kind: 'unknown' })
  assert.deepEqual(await readDeleteAnswer(answer(200, 'not an object')), { kind: 'unknown' })
})

test('reading the response: a 202 is a delete that was taken and is not finished — never "complete", never a list of parts, whatever its body', async () => {
  for (const body of [
    { code: 'DELETE_PENDING', removed: false, jobId: 'j1' },
    // Not read for its parts: the row is still there, so none of them went.
    CLEAN,
    {},
    'not an object',
    async () => {
      throw new SyntaxError('Unexpected end of JSON input')
    }
  ])
    assert.deepEqual(await readDeleteAnswer(answer(202, body)), { kind: 'pending' })
})

test('reading the response: a host that could not take the site off it is a refusal by name — the site is still there to delete again', async () => {
  assert.deepEqual(
    await readDeleteAnswer(
      answer(409, { code: 'TEARDOWN_FAILED', removed: false, host: false, retry: true })
    ),
    { kind: 'refused', status: 409, code: 'TEARDOWN_FAILED' }
  )
})

test('reading the response: a refusal stays a refusal, with its code when it has one', async () => {
  assert.deepEqual(await readDeleteAnswer(answer(403, { code: 'NOT_SITE_OWNER' })), {
    kind: 'refused',
    status: 403,
    code: 'NOT_SITE_OWNER'
  })
  assert.deepEqual(await readDeleteAnswer(answer(429, { code: 'RATE_LIMITED' })), {
    kind: 'refused',
    status: 429,
    code: 'RATE_LIMITED'
  })
  assert.deepEqual(await readDeleteAnswer(answer(404, { code: 'SITE_UNKNOWN' })), {
    kind: 'refused',
    status: 404,
    code: 'SITE_UNKNOWN'
  })
  // A refusal whose body is unreadable, not an object, or carries a code that is not text.
  const rejects = async () => {
    throw new SyntaxError('bad')
  }
  for (const body of [rejects, null, 'forbidden', [], { code: 7 }, { removed: true, host: false }]) {
    assert.deepEqual(await readDeleteAnswer(answer(403, body)), {
      kind: 'refused',
      status: 403,
      code: undefined
    })
  }
})

test('reading the response: a server error may have changed something, so it is an unknown result', async () => {
  // The door revokes seats and asks the host before it deletes the row; a 500 or a gateway's 502/504
  // says nothing about how far it got.
  for (const status of [500, 502, 503, 504]) {
    assert.deepEqual(await readDeleteAnswer(answer(status, { code: 'INTERNAL' })), { kind: 'unknown' })
  }
})
