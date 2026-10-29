/**
 * The Build waits for the photo labelling (item 27): while it moves, no brief is made and the demo action keeps the
 * progress the person sees ("Looking at photos 180/300"); once it settles or stalls, the brief is made and says how it
 * ended. A fictional restaurant (the Copper Ladle Kitchen, 300 photos) and a fake labeller; no database.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { waitForPhotoLabels } from '../src/opportunities-build/revisions.js'

function fakeDb() {
  const writes = []
  return { writes, query: async (sql, params) => (writes.push({ sql, params }), { rows: [], rowCount: 1 }) }
}

const action = () => ({
  id: '00000000-0000-4000-8000-0000000000c1',
  account_id: '00000000-0000-4000-8000-0000000000a1',
  opportunity_id: '00000000-0000-4000-8000-0000000000b1',
  selection: { cms: 'joomla' }
})

test('while photos are looked at, the build waits and the action keeps the progress', async () => {
  const db = fakeDb()
  const asked = []
  const photoLabelling = {
    gate: async (who) => {
      asked.push(who)
      return {
        pending: true,
        retryAt: 1_000 + 5_000,
        progress: { state: 'running', total: 300, looked: 180, failed: 0, linked: 176, lastAt: 900 }
      }
    }
  }
  const a = action()
  const out = await waitForPhotoLabels(db, { action: a, now: () => 1_000, photoLabelling })
  assert.equal(out.pending, true)
  assert.equal(out.retryAt, 6_000)
  assert.deepEqual([out.photoLabelling.looked, out.photoLabelling.total], [180, 300])
  assert.equal(asked[0].waitingSince, null, 'the first wait starts the clock')
  const saved = JSON.parse(db.writes[0].params[1]).photoLabelling
  assert.deepEqual([saved.state, saved.looked, saved.total], ['running', 180, 300])
  assert.equal(saved.waitingSince, new Date(1_000).toISOString())
  // The next poll hands the gate the time the wait started, so a labelling that never moves still ends the wait.
  await waitForPhotoLabels(db, { action: a, now: () => 2_000, photoLabelling })
  assert.equal(asked[1].waitingSince, 1_000)
})

test('a stalled labelling lets the build go on and says how it ended', async () => {
  const db = fakeDb()
  const out = await waitForPhotoLabels(db, {
    action: action(),
    now: () => 1_000,
    photoLabelling: {
      gate: async () => ({
        ready: true,
        progress: { state: 'stalled', total: 300, looked: 120, failed: 0, linked: 120, lastAt: 0 }
      })
    }
  })
  assert.equal(out.pending, undefined)
  assert.deepEqual([out.waited.state, out.waited.looked], ['stalled', 120])
})

test('without a labeller the build never waits', async () => {
  const out = await waitForPhotoLabels(fakeDb(), { action: action(), now: () => 1, photoLabelling: null })
  assert.deepEqual(out, { waited: null })
})

test('the demo action tells the page how far the photo labelling is, only while it waits', async () => {
  const { demoActionShape } = await import('../src/opportunities-build/demo-actions.js')
  const base = {
    id: 'a',
    opportunity_id: 'o',
    revision_id: 'r',
    status: 'queued',
    step: 'brief',
    accepted_at: 't',
    updated_at: 't',
    selection: { photoLabelling: { state: 'running', looked: 180, total: 300 } }
  }
  assert.deepEqual(demoActionShape(base).photos, { looked: 180, total: 300 })
  const settled = { ...base, selection: { photoLabelling: { state: 'done', looked: 300, total: 300 } } }
  assert.equal(demoActionShape(settled).photos, undefined)
})
