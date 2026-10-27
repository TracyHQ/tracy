/**
 * The one next action of a row, run the same way from the Action column, the Inspector header and the
 * Details page (`src/client/row-actions.ts`): which door each action calls, and what the screen does
 * after (refresh, open the Brief page with its name field, or go to the site).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { runAction } from '../src/client/row-actions.ts'
import { createRequestIds } from '../src/client/request-ids.ts'

function fakeApi(answer = { ok: true, status: 200, body: {} }) {
  const calls = []
  const record =
    (name) =>
    async (...args) => {
      calls.push([name, ...args])
      return typeof answer === 'function' ? answer(name) : answer
    }
  return {
    calls,
    api: {
      buildDemo: record('buildDemo'),
      cancel: record('cancel'),
      resume: record('resume'),
      research: record('research')
    }
  }
}

const row = (over = {}) => ({
  id: 'o1',
  name: 'Pho Hoa',
  job: null,
  latestRevision: null,
  sites: [],
  ...over
})
let n = 0
const ids = () => createRequestIds(() => `req-${++n}`)

test('cancel and resume act on the row’s latest job', async () => {
  const { api, calls } = fakeApi()
  assert.deepEqual(await runAction(api, ids(), 'cancel', row({ job: { id: 'j1', state: 'running' } })), {
    kind: 'done'
  })
  assert.deepEqual(await runAction(api, ids(), 'resume', row({ job: { id: 'j2', state: 'paused' } })), {
    kind: 'done'
  })
  assert.deepEqual(calls, [
    ['cancel', 'j1'],
    ['resume', 'j2']
  ])
})

test('start research sends a fresh request id; a refusal comes back as its code', async () => {
  const { api, calls } = fakeApi({ ok: false, status: 409, code: 'JOB_ACTIVE' })
  const outcome = await runAction(api, ids(), 'start', row())
  assert.deepEqual(outcome, { kind: 'failed', code: 'JOB_ACTIVE' })
  assert.equal(calls[0][0], 'research')
  assert.equal(calls[0][1], 'o1')
  assert.match(calls[0][2], /^req-\d+$/)
})

test('Build demo submits one durable action; a lost receipt replays its request id', async () => {
  let accepted = false
  const { api, calls } = fakeApi(() =>
    accepted ? { ok: true, status: 202, body: {} } : { ok: false, status: 503, code: 'UNREACHABLE' }
  )
  const requestIds = ids()
  const pick = async () => ({ cms: 'wordpress', quickstart: 'ja-test/wp', design: 'ja-test' })
  assert.equal((await runAction(api, requestIds, 'build', row(), pick)).kind, 'failed')
  accepted = true
  assert.equal((await runAction(api, requestIds, 'build', row(), pick)).kind, 'done')
  assert.equal(calls[0][0], 'buildDemo')
  assert.equal(calls[0][2], calls[1][2])
  await runAction(api, requestIds, 'retry-demo', row({ demoAction: { id: 'failed-action' } }))
  assert.equal(calls[2][3], 'failed-action')
  assert.notEqual(calls[2][2], calls[0][2])
  assert.deepEqual(await runAction(api, requestIds, 'send-demo', row()), { kind: 'send-demo' })
})

test('open the site goes to the site in Tracy; a row without one fails quietly', async () => {
  const { api } = fakeApi()
  assert.deepEqual(
    await runAction(
      api,
      ids(),
      'open-site',
      row({ latestBuild: { id: 'b1', siteKey: 'pho.tracy.site', done: true } })
    ),
    {
      kind: 'navigate',
      href: '/pho.tracy.site/'
    }
  )
  assert.deepEqual(await runAction(api, ids(), 'open-site', row({ sites: ['old.tracy.site'] })), {
    kind: 'navigate',
    href: '/old.tracy.site/'
  })
  assert.deepEqual(await runAction(api, ids(), 'open-site', row()), { kind: 'failed', code: 'NOT_FOUND' })
})

test('build waits for the shared picker, forwards its CMS/template, and cancellation makes no request', async () => {
  const { api, calls } = fakeApi()
  const picked = { cms: 'joomla', quickstart: 'ja-essence/j5', design: 'ja-essence' }
  assert.deepEqual(await runAction(api, ids(), 'build', row(), async () => null), { kind: 'done' })
  assert.equal(calls.length, 0)
  await runAction(api, ids(), 'build', row(), async () => picked)
  assert.deepEqual(calls[0].slice(3), [undefined, picked])
  await runAction(
    api,
    ids(),
    'retry-demo',
    row({ demoAction: { id: 'old-action' } }),
    undefined,
    async () => {
      throw Error('Retry must not open the picker')
    }
  )
  assert.deepEqual(calls[1].slice(3), ['old-action', undefined])
})

test('missing picker refuses safely and changing a choice gets a new request identity', async () => {
  const { api, calls } = fakeApi({ ok: false, status: 503, code: 'UNREACHABLE' })
  const requestIds = ids()
  const failed = await runAction(api, requestIds, 'build', row(), async () => {
    throw Error('unavailable')
  })
  assert.equal(failed.kind, 'failed')
  assert.equal(calls.length, 0)
  await runAction(api, requestIds, 'build', row(), async () => ({
    cms: 'joomla',
    design: 'a',
    quickstart: 'a/jo'
  }))
  await runAction(api, requestIds, 'build', row(), async () => ({
    cms: 'wordpress',
    design: 'b',
    quickstart: 'b/wp'
  }))
  assert.notEqual(calls[0][2], calls[1][2])
})

test('build opens the picker with the opportunity’s trade ranking; no door or a refusal opens it ungrouped', async () => {
  const ranking = { trade: 'fitness', recommended: ['ja-boxing'], generic: ['ja-morgan'] }
  const picked = { cms: 'joomla', quickstart: 'ja-boxing/j6', design: 'ja-boxing' }
  const seen = []
  const pick = async (given) => {
    seen.push(given)
    return picked
  }
  const { api, calls } = fakeApi()
  const asked = []
  api.templateRanking = async (idsAsked) => {
    asked.push(idsAsked)
    return { ok: true, status: 200, body: { ranking } }
  }
  await runAction(api, ids(), 'build', row(), pick)
  assert.deepEqual(asked, [['o1']])
  assert.deepEqual(seen, [ranking])
  assert.deepEqual(calls.at(-1).slice(3), [undefined, picked])

  api.templateRanking = async () => ({ ok: false, status: 404, code: 'NOT_FOUND' })
  await runAction(api, ids(), 'build', row(), pick)
  api.templateRanking = async () => {
    throw new Error('offline')
  }
  await runAction(api, ids(), 'build', row(), pick)
  delete api.templateRanking
  await runAction(api, ids(), 'build', row(), pick)
  assert.deepEqual(seen.slice(1), [null, null, null])
})
