/**
 * What each of a build's photos shows (`demo-photo-labels.js`), labelled once and kept where the quickstart-first
 * pictures keep theirs: an account's own photo on its `wo_media` row, a place's shared photo in `wo_media_analysis`.
 *
 *   node --test apps/tracy-web/test/wo-demo-photo-labels.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { visionKey } from '../src/lib/picture-vision.js'
import { createDemoPhotoLabels, visionLabelOf } from '../src/opportunities-build/demo-photo-labels.js'

function fakePool() {
  const sql = []
  return {
    sql,
    query: async (text, params) => {
      sql.push({ text: text.replace(/\s+/g, ' ').trim(), params })
      if (/insert into wo_media_analysis/.test(text))
        return { rows: params[0].map((sha) => ({ media_sha256: sha })) }
      return { rows: [] }
    }
  }
}
const door = { url: 'https://vision.test', key: 'k', model: 'deepseek-chat' }

test('a held label is used as it is; the rest are labelled once and kept where each kind of photo keeps it', async () => {
  const pool = fakePool()
  const sent = []
  const labels = createDemoPhotoLabels({
    pool,
    visionFor: async () => door,
    label: async ({ pictures }) => {
      sent.push(pictures.map((p) => p.id))
      return {
        labels: new Map(pictures.map((p) => [p.id, { subject: p.id === 'own-2' ? 'people' : 'food' }])),
        usage: { calls: 1, promptTokens: 10, completionTokens: 5, requests: [] },
        failed: 0
      }
    }
  })
  const rows = [
    {
      id: 'own-1',
      sha256: 'a',
      labels: {
        vision: { key: visionKey({ model: door.model }), model: door.model, labels: { subject: 'interior' } }
      }
    },
    { id: 'own-2', sha256: 'b', labels: {} },
    { id: 'place-1', sha256: 'c', labels: null }
  ]
  const origins = new Map([
    ['own-1', 'own'],
    ['own-2', 'own'],
    ['place-1', 'place']
  ])
  const out = await labels(rows, origins, async () => Buffer.from('x'), { payer: null, buildId: 'b1' })
  assert.deepEqual(Object.fromEntries(out), {
    'own-1': { subject: 'interior' },
    'own-2': { subject: 'people' },
    'place-1': { subject: 'food' }
  })
  assert.deepEqual(sent, [['own-2', 'place-1']], 'the held label is not asked again')
  assert.ok(pool.sql.some((q) => /insert into wo_media_analysis/.test(q.text) && q.params[0].includes('c')))
  assert.ok(pool.sql.some((q) => /update wo_media_analysis set state/.test(q.text) && q.params[3] === 'done'))
  assert.ok(pool.sql.some((q) => /update wo_media set labels/.test(q.text) && q.params[0] === 'own-2'))
  assert.deepEqual(visionLabelOf(rows[0]), { subject: 'interior' })
})

test('no vision door, a failing model or no bytes label nothing and never throw', async () => {
  const rows = [{ id: 'own-2', sha256: 'b', labels: {} }]
  const origins = new Map([['own-2', 'own']])
  const none = createDemoPhotoLabels({ pool: fakePool(), visionFor: async () => null })
  assert.equal((await none(rows, origins, async () => Buffer.from('x'))).size, 0)
  const failing = createDemoPhotoLabels({
    pool: fakePool(),
    visionFor: async () => door,
    label: async () => {
      throw new Error('vision 500')
    }
  })
  assert.equal((await failing(rows, origins, async () => Buffer.from('x'))).size, 0)
  const noBytes = createDemoPhotoLabels({
    pool: fakePool(),
    visionFor: async () => door,
    label: async () => assert.fail('nothing to send')
  })
  assert.equal((await noBytes(rows, origins, async () => null)).size, 0)
})

test('a large gallery fetches only the next vision batch and continues after a failed batch', async () => {
  const rows = Array.from({ length: 19 }, (_, i) => ({ id: `own-${i}`, sha256: `sha-${i}`, labels: {} }))
  const origins = new Map(rows.map((r) => [r.id, 'own']))
  let waiting = 0
  let calls = 0
  const charged = []
  const labels = createDemoPhotoLabels({
    pool: fakePool(),
    visionFor: async () => door,
    chargeable: async (spec, fn) => {
      charged.push(spec.maxCents)
      return fn()
    },
    label: async ({ pictures, concurrency }) => {
      calls += 1
      assert.ok(waiting <= 8, 'originals for the next batch must wait until this call completes')
      assert.equal(concurrency, 1)
      waiting = 0
      if (calls === 2) throw new Error('temporary model failure')
      return {
        labels: new Map(pictures.map((p) => [p.id, { subject: 'food' }])),
        usage: { requests: [] }
      }
    }
  })
  const out = await labels(rows, origins, async () => {
    waiting += 1
    return Buffer.from('original')
  })
  assert.equal(calls, 3)
  assert.equal(charged.length, 3)
  assert.equal(out.size, 11, 'a failed batch must not discard successful labels or stop later batches')
  assert.equal(out.has('own-8'), false)
  assert.equal(out.has('own-18'), true)
})

test('shared photo leases are claimed only when their batch is ready to label', async () => {
  const pool = fakePool()
  const query = pool.query
  let outstanding = 0
  let batches = 0
  pool.query = async (sql, params) => {
    if (/insert into wo_media_analysis/.test(sql)) {
      assert.equal(outstanding, 0, 'the previous batch must be persisted before the next lease starts')
      outstanding += params[0].length
      assert.ok(outstanding <= 8)
      batches += 1
    } else if (/update wo_media_analysis set state/.test(sql)) outstanding -= 1
    return query(sql, params)
  }
  const rows = Array.from({ length: 17 }, (_, i) => ({ id: `place-${i}`, sha256: `sha-${i}` }))
  const labels = createDemoPhotoLabels({
    pool,
    visionFor: async () => door,
    label: async ({ pictures }) => ({
      labels: new Map(pictures.map((p) => [p.id, { subject: 'food' }])),
      usage: { requests: [] }
    })
  })
  const out = await labels(rows, new Map(rows.map((r) => [r.id, 'place'])), async () => Buffer.from('x'))
  assert.equal(out.size, 17)
  assert.equal(batches, 3)
  assert.equal(outstanding, 0)
})

test('labels from before image-input verification are not reused or exposed', async () => {
  const row = {
    id: 'old',
    labels: { vision: { model: door.model, key: `${door.model}|p2|s1|512q70`, labels: { subject: 'food' } } }
  }
  assert.equal(visionLabelOf(row), null)
  const labels = createDemoPhotoLabels({ pool: fakePool(), visionFor: async () => null })
  assert.equal((await labels([row], new Map(), async () => Buffer.from('x'))).size, 0)
})
