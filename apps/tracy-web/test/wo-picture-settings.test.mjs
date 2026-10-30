import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { picturePolicy } from '../src/lib/wo-picture-policy.js'
import { createSitePictures } from '../src/opportunities-build/site-pictures.js'

// The object store and database are local doubles; the production manifest, hash, label and cap paths run unchanged.
function fixture(policy) {
  const data = Array.from({ length: 12 }, (_, i) => Buffer.from(`stored picture ${i}`))
  const rows = data.map((bytes, i) => ({
    id: `picture-${i}`,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    object_key: String(i),
    mime: 'image/jpeg',
    width: 1200,
    height: 800,
    caption: '',
    alt: '',
    dhash: i.toString(16).repeat(16),
    labels: { features: {} }
  }))
  const build = {
    id: 'build',
    account_id: 'account',
    opportunity_id: 'opportunity',
    asset_manifest: rows.map((r) => ({ id: r.id, sha256: r.sha256, kind: 'image' })),
    brief: { picturePolicy: picturePolicy(policy) }
  }
  // `wo_media_analysis` by (sha256, model, key): where a build keeps the labels it paid for (item 27).
  const analyses = new Map()
  const pool = {
    query: async (sql, params = []) => {
      if (sql.startsWith('select account_id'))
        return { rows: [{ account_id: 'account', build_id: 'creation' }] }
      if (sql.startsWith('select id from account')) return { rows: [{ id: 'account' }] }
      if (sql.includes('from wo_build b join')) return { rows: [build] }
      // Fresh row objects each read, as a database gives: what one build attaches in memory never reaches the next.
      if (sql.includes('from wo_media where')) return { rows: rows.map((r) => structuredClone(r)) }
      if (sql.startsWith('update wo_media ')) return { rows: [] }
      // The shared label cache (`media-analysis.js`): claim, settle and read the done labels of one (model, key).
      if (sql.startsWith('insert into wo_media_analysis')) {
        const [shas, model, key] = params
        const claimed = []
        for (const sha of shas) {
          const id = `${sha}|${model}|${key}`
          if (analyses.get(id)?.state === 'done') continue
          analyses.set(id, { state: 'pending', result: null })
          claimed.push({ media_sha256: sha })
        }
        return { rows: claimed }
      }
      if (sql.startsWith('update wo_media_analysis set state = $4')) {
        const [sha, model, key, state, result] = params
        const id = `${sha}|${model}|${key}`
        if (analyses.get(id)?.state === 'pending')
          analyses.set(id, { state, result: result === null ? null : JSON.parse(result) })
        return { rows: [] }
      }
      if (sql.startsWith('select media_sha256') && sql.includes('from wo_media_analysis')) {
        const [shas, model, key] = params
        return {
          rows: shas
            .map((sha) => ({
              media_sha256: sha,
              model,
              version: key,
              ...analyses.get(`${sha}|${model}|${key}`)
            }))
            .filter((r) => r.state === 'done')
        }
      }
      assert.fail(`Unexpected query: ${sql}`)
    }
  }
  const calls = [],
    resolved = []
  const reader = createSitePictures({
    pool,
    objects: { get: async (key) => new Response(data[Number(key)]) },
    measure: async () => assert.fail('features already measured'),
    visionFor: async () => {
      resolved.push(true)
      return {
        door: { model: 'test-model' },
        key: 'test-model|v1',
        maxPictures: 200,
        label: async ({ pictures }) => {
          calls.push(pictures.map((p) => p.id))
          return {
            labels: new Map(pictures.map((p) => [p.id, { subject: 'food' }])),
            usage: { calls: 1, promptTokens: 12, completionTokens: 12 },
            failed: 0
          }
        }
      }
    },
    log: { warn: (message) => assert.fail(message) }
  })
  return { reader, calls, resolved, rows, analyses }
}

test('a frozen ten-picture setting limits actual vision egress despite a larger model default, then reuses labels', async () => {
  const { reader, calls } = fixture({ maxVisionPictures: 10 })
  const who = { siteKey: 'test.tracy.test', email: 'test@example.test' }
  const first = await reader.forSite(who)
  assert.equal(calls[0].length, 10)
  assert.equal(first.pictures.filter((p) => p.vision).length, 10)
  await reader.forSite(who)
  await reader.forSite(who)
  assert.equal(calls.length, 1)
})

test('disabled curation makes no provider lookup or call and ignores cached vision labels', async () => {
  const { reader, calls, resolved, rows } = fixture({ visionEnabled: false })
  rows[0].labels.vision = { key: 'test-model|v1', labels: { subject: 'poster' } }
  const result = await reader.forSite({ siteKey: 'test.tracy.test', email: 'test@example.test' })
  assert.equal(result.pictures.length, 12)
  assert.ok(result.pictures.every((p) => p.vision === null))
  assert.equal(result.vision, null)
  assert.deepEqual(calls, [])
  assert.deepEqual(resolved, [])
})

test('a metered invocation override bypasses the generic ledger and never changes the reader default', async () => {
  const { reader, calls, resolved } = fixture({ maxVisionPictures: 10 })
  const requests = ['request-from-root'],
    booking = { door: 'vision', model: 'root-model' }
  let billed = 0
  const override = {
    metered: true,
    door: { model: 'unpriced-model-owned-by-root' },
    key: 'root|v1',
    booking,
    label: async ({ pictures }) => {
      billed++
      return {
        labels: new Map(pictures.map((p) => [p.id, { subject: 'interior' }])),
        usage: { calls: 1, promptTokens: 1, completionTokens: 2, requests },
        failed: 0
      }
    }
  }
  const who = { siteKey: 'test.tracy.test', email: 'test@example.test' }
  const result = await reader.forSite({ ...who, strict: true, visionOverride: override })
  assert.equal(billed, 1)
  assert.deepEqual(resolved, [])
  assert.deepEqual(result.vision.requests, requests)
  assert.deepEqual(result.vision.booking, booking)
  assert.equal(result.pictures.filter((p) => p.vision?.subject === 'interior').length, 10)
  await reader.forSite({ ...who, visionOverride: null })
  assert.deepEqual(resolved, [])
  await reader.forSite(who)
  assert.equal(resolved.length, 1)
  assert.equal(calls.length, 1)
})

test('strict root overrides propagate uncertain work and Stop without caching a successful label', async () => {
  for (const stop of [false, true]) {
    const { reader, rows, analyses } = fixture({ maxVisionPictures: 10 })
    const controller = new AbortController()
    const failure = new Error(stop ? 'STOPPED' : 'ATTEMPT_UNCERTAIN')
    await assert.rejects(
      reader.forSite({
        siteKey: 'test.tracy.test',
        email: 'test@example.test',
        strict: true,
        signal: controller.signal,
        visionOverride: {
          metered: true,
          door: { model: 'root-model' },
          key: 'root|v1',
          label: async ({ pictures, signal }) => {
            assert.equal(signal, controller.signal)
            if (!stop) throw failure
            controller.abort(failure)
            return {
              labels: new Map(pictures.map((p) => [p.id, { subject: 'food' }])),
              usage: { calls: 1, promptTokens: 1, completionTokens: 1 },
              failed: 0
            }
          }
        }
      }),
      (error) => error === failure
    )
    assert.ok(rows.every((r) => !r.labels.vision))
    // Every claim went back unanswered: no label of an uncertain or stopped call is kept for a later build.
    assert.ok(analyses.size > 0)
    assert.ok([...analyses.values()].every((a) => a.state === 'failed' && a.result === null))
  }
})

test('an override cannot bypass the revision curation switch', async () => {
  const { reader } = fixture({ visionEnabled: false })
  const result = await reader.forSite({
    siteKey: 'test.tracy.test',
    email: 'test@example.test',
    strict: true,
    visionOverride: {
      metered: true,
      door: { model: 'root-model' },
      key: 'root|v1',
      label: async () => assert.fail('disabled revision must not spend')
    }
  })
  assert.equal(result.vision, null)
})
