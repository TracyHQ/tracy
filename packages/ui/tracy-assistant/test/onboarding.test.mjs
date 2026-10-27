import assert from 'node:assert/strict'
import { test } from 'node:test'
import { draftActions, draftIsCurrent, latestDraftTurn, prepareDraft } from '../src/client/onboarding.ts'
import { HELP_KIND } from '../src/client/help.ts'
const turn = { variant: 'turn', sessionId: 's1', userTurnId: '12', status: 'done' }
const row = (data) => ({ kind: HELP_KIND, data })
const press = { action: 'create', platform: 'joomla' }
const response = (extra = {}, status = 200) =>
  new Response(JSON.stringify({ draft: { version: 1, sourceRevision: '12', intent: 'create', ...extra } }), {
    status
  })
test('queued corrections and newer replies invalidate a previous action', () => {
  assert.equal(draftIsCurrent([row(turn)], turn), true)
  assert.equal(
    draftIsCurrent([row(turn), row({ ...turn, userTurnId: undefined, status: 'queued' })], turn),
    false
  )
  assert.equal(draftIsCurrent([row(turn), row({ ...turn, userTurnId: '13' })], turn), false)
  assert.equal(
    draftIsCurrent([row(turn), row({ ...turn, sessionId: 's2', status: 'streaming' })], turn),
    true
  )
})
test('only the revision and action are sent; a returned draft must match both', async () => {
  const draft = await prepareDraft(
    turn,
    press,
    () => true,
    async (path, init) => {
      assert.equal(path, '/api/assistant/onboarding-draft')
      assert.deepEqual(JSON.parse(init.body), {
        intent: 'create',
        platform: 'joomla',
        session: 's1',
        sourceRevision: '12'
      })
      return response()
    }
  )
  assert.equal(draft.sourceRevision, '12')
  for (const bad of [{ version: 2 }, { sourceRevision: '11' }, { intent: 'import' }])
    await assert.rejects(
      prepareDraft(
        turn,
        press,
        () => true,
        async () => response(bad)
      ),
      /DRAFT_FAILED/
    )
})
test('a correction before or during extraction prevents opening; errors allow a retry', async () => {
  let calls = 0
  await assert.rejects(
    prepareDraft(
      turn,
      press,
      () => false,
      async () => {
        calls++
        return response()
      }
    ),
    /DRAFT_CHANGED/
  )
  assert.equal(calls, 0)
  let current = true
  await assert.rejects(
    prepareDraft(
      turn,
      press,
      () => current,
      async () => {
        current = false
        return response()
      }
    ),
    /DRAFT_CHANGED/
  )
  await assert.rejects(
    prepareDraft(
      turn,
      press,
      () => true,
      async () => new Response(JSON.stringify({ code: 'DRAFT_AMBIGUOUS' }), { status: 409 })
    ),
    /DRAFT_AMBIGUOUS/
  )
  assert.equal(
    (
      await prepareDraft(
        turn,
        press,
        () => true,
        async () => response()
      )
    ).version,
    1
  )
})

test('an old action after an advisory follow-up uses the latest revision, with no action repeated', async () => {
  const latest = { ...turn, userTurnId: '14', answer: 'Yes, Joomla supports that.' }
  const rows = [row(turn), row(latest)]
  const source = latestDraftTurn(rows, turn.sessionId)
  assert.equal(source.userTurnId, '14')
  await prepareDraft(
    source,
    press,
    () => draftIsCurrent(rows, source),
    async (_path, init) => {
      assert.equal(JSON.parse(init.body).sourceRevision, '14')
      return response({ sourceRevision: '14' })
    }
  )
})

test('actions from different replies cannot reopen an older flow after the latest click', async () => {
  const waiting = []
  const prepare = draftActions(() => new Promise((resolve) => waiting.push(resolve)))
  const first = prepare(turn, press, () => true)
  const rejected = assert.rejects(first, /DRAFT_CHANGED/)
  const second = prepare(turn, { action: 'import' }, () => true)
  waiting[1](response({ intent: 'import' }))
  assert.equal((await second).intent, 'import')
  waiting[0](response())
  await rejected
})
