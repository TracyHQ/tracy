/**
 * Delete on My opportunities, without the screen (`src/client/delete-model.ts`): the rows a press deletes, how many
 * live demo sites the confirmation names, which door the press uses, and the rows left after it.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  deleteAsk,
  deleteFailedKey,
  deleteOpportunities,
  hasLiveDemo,
  withoutRows
} from '../src/client/delete-model.ts'
import { createRequestIds } from '../src/client/request-ids.ts'

const live = { siteKey: 'harbor-demo', deletedAt: null }
const ROWS = [
  { id: 'a', name: 'Harbor Bakery', demo: live },
  { id: 'b', name: 'Lantern Noodles', demo: { siteKey: 'lantern-demo', deletedAt: '2026-11-01T00:00:00Z' } },
  { id: 'c', name: 'Juniper Cafe', latestBuild: { siteKey: 'juniper-demo', state: 'done' } },
  { id: 'd', name: 'Copper Grill' }
]

test('a live demo site: the Demo column’s site not deleted, else the latest build’s', () => {
  assert.deepEqual(ROWS.map(hasLiveDemo), [true, false, true, false])
  assert.equal(hasLiveDemo({ id: 'e', latestBuild: { siteKey: 'x', state: 'deleted' } }), false)
})

test('the confirmation: picked rows in screen order, how many have a live demo, a name for one row', () => {
  assert.equal(deleteAsk(ROWS, new Set()), null)
  assert.deepEqual(deleteAsk(ROWS, new Set(['d', 'a', 'b', 'c'])), {
    ids: ['a', 'b', 'c', 'd'],
    withSite: 2,
    name: null
  })
  assert.deepEqual(deleteAsk(ROWS, new Set(['a'])), { ids: ['a'], withSite: 1, name: 'Harbor Bakery' })
  assert.deepEqual(deleteAsk(ROWS, new Set(['gone'])), null, 'a pick no longer on screen asks nothing')
})

test('the rows left after a delete keep their order', () => {
  assert.deepEqual(
    withoutRows(ROWS, ['b', 'd']).map((r) => r.id),
    ['a', 'c']
  )
})

function fakeApi({ remove, bulk }) {
  const calls = []
  return {
    calls,
    api: {
      remove: async (id) => {
        calls.push(['remove', id])
        return remove(id)
      },
      bulk: async (action, requestId, selection) => {
        calls.push(['bulk', action, requestId, selection])
        return bulk(action, requestId, selection)
      }
    }
  }
}

let n = 0
const ids = () => createRequestIds(() => `req-${++n}-0000`)

test('one row goes through its own door; NOT_FOUND counts as gone', async () => {
  const { api, calls } = fakeApi({
    remove: async () => ({
      ok: true,
      status: 200,
      body: { ok: true, deleted: { id: 'a', siteRemoved: true } }
    }),
    bulk: async () => assert.fail('no bulk for one row')
  })
  assert.deepEqual(await deleteOpportunities(api, ids(), ['a']), {
    ok: true,
    deleted: ['a'],
    failed: 0,
    sitesRemoved: 1
  })
  assert.deepEqual(calls, [['remove', 'a']])
  const missing = fakeApi({
    remove: async () => ({ ok: false, status: 404, code: 'NOT_FOUND' }),
    bulk: async () => assert.fail()
  })
  assert.deepEqual((await deleteOpportunities(missing.api, ids(), ['a'])).deleted, ['a'])
  const busy = fakeApi({
    remove: async () => ({ ok: false, status: 409, code: 'DEMO_TEARDOWN_FAILED' }),
    bulk: async () => assert.fail()
  })
  const refused = await deleteOpportunities(busy.api, ids(), ['a'])
  assert.deepEqual(refused, { ok: false, code: 'DEMO_TEARDOWN_FAILED' })
  assert.equal(deleteFailedKey(refused.code), 'delete.siteBusy')
  assert.equal(deleteFailedKey('NETWORK'), 'action.failed')
})

test('several rows go through the bulk door; a failed press keeps its request id for the retry', async () => {
  const requestIds = ids()
  let fail = true
  const { api, calls } = fakeApi({
    remove: async () => assert.fail('no single door for many rows'),
    bulk: async () =>
      fail
        ? { ok: false, status: 0, code: 'NETWORK' }
        : {
            ok: true,
            status: 200,
            body: {
              results: [
                { opportunityId: 'a', ok: true, siteRemoved: true },
                { opportunityId: 'b', ok: false, code: 'NOT_FOUND' },
                { opportunityId: 'c', ok: false, code: 'DEMO_TEARDOWN_FAILED' }
              ],
              deleted: 1,
              sitesRemoved: 1,
              failed: 1
            }
          }
  })
  assert.deepEqual(await deleteOpportunities(api, requestIds, ['a', 'b', 'c']), {
    ok: false,
    code: 'NETWORK'
  })
  fail = false
  const outcome = await deleteOpportunities(api, requestIds, ['a', 'b', 'c'])
  assert.deepEqual(outcome, { ok: true, deleted: ['a', 'b'], failed: 1, sitesRemoved: 1 })
  assert.equal(calls[0][1], 'delete')
  assert.deepEqual(calls[0][3], { opportunityIds: ['a', 'b', 'c'] })
  assert.equal(calls[1][2], calls[0][2], 'the retry sends the same request id')
})
