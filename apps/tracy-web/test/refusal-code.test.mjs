// The refusal code the `site.edit` / `site.undo` ops signal records (`refusalCodeOf`, `src/sites/refusal-code.js`),
// and the signal's field filter keeping it. No Postgres: the reading and an in-memory signal.
//
//   node --test apps/tracy-web/test/refusal-code.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOpsSignal } from '../src/lib/ops-signal.js'
import { REFUSAL_CODE_MAX, refusalCodeOf } from '../src/sites/refusal-code.js'

test('the code is read from each of the three refusal shapes', () => {
  assert.equal(refusalCodeOf({ code: 'WRITE_LEASE_HELD' }), 'WRITE_LEASE_HELD', 'Tracy: {code}')
  // The Claude Cowork engine (`Engine::err`): `error` is the code itself (prod, 19/10/2026: six refused
  // `content.update` calls recorded `refusal: null`).
  assert.equal(
    refusalCodeOf({ ok: false, error: 'field_not_editable', message: 'post_title is locked' }),
    'field_not_editable',
    'engine: {ok:false, error:"<code>"}'
  )
  assert.equal(
    refusalCodeOf({ error: { code: 'CONTENT_NOT_FOUND', message: 'No post 7' } }),
    'CONTENT_NOT_FOUND',
    'Content API: {error:{code}}'
  )
})

test('an answer that names no code is null', () => {
  for (const body of [
    null,
    undefined,
    'refused',
    { ok: true },
    { ok: false },
    { ok: false, error: '' },
    { ok: false, error: { message: 'no code' } },
    { code: 42 },
    { error: 42 }
  ])
    assert.equal(refusalCodeOf(body), null, JSON.stringify(body))
})

test('a code is bounded and carries no control characters', () => {
  const long = refusalCodeOf({ ok: false, error: 'X'.repeat(500) })
  assert.equal(long?.length, REFUSAL_CODE_MAX)
  assert.equal(refusalCodeOf({ ok: false, error: 'bad\ncode\u0000' }), 'bad code')
})

test('a refused edit and a refused undo both keep their code through the signal field filter', async () => {
  const signal = createOpsSignal({ pool: null, config: { environment: 'dev' }, log: { warn() {} } })
  const answer = { ok: false, error: 'field_not_editable', message: 'post_title is locked' }
  const edit = await signal.record('site.edit', {
    data: {
      action: 'content.update',
      ok: false,
      refusal: refusalCodeOf(answer),
      from_comment: null,
      moment: 'a-1'
    }
  })
  assert.deepEqual(edit.data, {
    action: 'content.update',
    ok: false,
    refusal: 'field_not_editable',
    from_comment: null
  })
  const undo = await signal.record('site.undo', {
    data: { action: 'apply.revert', ok: false, refusal: refusalCodeOf(answer), moment: 'a-1' }
  })
  assert.deepEqual(undo.data, { moment: 'a-1', ok: false, refusal: 'field_not_editable' })
})

test('S-B2: successful undo keeps its explicit success through the signal field filter', async () => {
  const signal = createOpsSignal({ pool: null, config: { environment: 'dev' }, log: { warn() {} } })
  const undo = await signal.record('site.undo', { data: { moment: 'restored-1', ok: true } })
  assert.deepEqual(undo.data, { moment: 'restored-1', ok: true })
})
