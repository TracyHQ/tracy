// Durable writer queue integration with an isolated PostgreSQL database and scripted model boundary.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { zipSync } from 'fflate'
import { createKitImages } from '../src/lib/template-kit-images.js'
import { readRun } from '../src/site-writer/bench-store.js'
import { createSiteWriterQueue } from '../src/site-writer/bench-worker.js'
import { WRITER_VISUAL_POLICY } from '../src/site-writer/visual-review.js'
import { scriptedModel, toolCallReply, finalReply, usageOf } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import {
  assignWriterDoor,
  balances,
  kit,
  kitIndex,
  quiet,
  SECRET,
  startRun,
  writerAnswer
} from './_site-writer-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
)
const sha = createHash('sha256').update(bytes).digest('hex')

async function setup(t) {
  const doc = kit()
  doc.blocks = doc.blocks.map((block) => ({
    ...block,
    images: { 1440: `${block.id}-1440`, 390: `${block.id}-390` }
  }))
  const ids = doc.blocks.flatMap((block) => Object.values(block.images))
  doc.images = ids.map((id) => ({ id, path: `images/${id}.png`, sha256: sha }))
  const own = kitIndex({ kitDoc: doc })
  t.after(own.done)
  const dir = await mkdtemp(path.join(tmpdir(), 'writer-queue-images-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const archive = zipSync(Object.fromEntries(ids.map((id) => [`images/${id}.png`, bytes])))
  const images = createKitImages({ dir, fetchZip: async () => ({ ok: true, bytes: archive }) })
  await assignWriterDoor(db.pool, { provider: 'openrouter', model: 'vendor/test-model' })
  const started = await startRun(db.pool, own.index, { requireVisualReview: true })
  const drain = async (model) =>
    createSiteWriterQueue({
      pool: db.pool,
      secret: SECRET,
      index: own.index,
      kitImages: images,
      fetchImpl: model.fetchImpl,
      balanceFetch: balances([]).fetchImpl,
      retry: { attempts: 1 },
      log: quiet
    }).drain()
  return { ids, started, drain }
}
const answer = () => finalReply({ content: JSON.stringify(writerAnswer()), usage: usageOf({ cost: 0.001 }) })

test(
  'a strict writer queue freezes image policy and passes only after answered responsive image delivery',
  opts,
  async (t) => {
    const { ids, started, drain } = await setup(t)
    const model = scriptedModel([
      toolCallReply({ calls: ids.map((id) => ['open_kit_image', { id }]), usage: usageOf({ cost: 0.001 }) }),
      answer()
    ])
    await drain(model)
    const run = await readRun(db.pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.harness.visualReview, WRITER_VISUAL_POLICY)
    assert.equal(run.door.images, true)
    const visual = run.rounds[0].checkResult.rules.find((rule) => rule.id === 'WV01')
    assert.equal(visual.status, 'pass')
    assert.ok(visual.coverage.required.length > 0)
    assert.deepEqual(visual.coverage.missing, [])
    assert.ok(
      model.requests[1].body.messages.some(
        (message) =>
          Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url')
      )
    )
  }
)

test(
  'a strict writer queue keeps blocking visual failures for valid copy without actual image delivery',
  opts,
  async (t) => {
    const { started, drain } = await setup(t)
    const model = scriptedModel([answer(), answer(), answer()])
    await drain(model)
    const run = await readRun(db.pool, started.id)
    assert.match(run.standingFailures, /WV01/)
    assert.equal(run.rounds.at(-1).checkResult.summary.fail, 1)
    assert.ok(
      run.rounds.every(
        (round) => round.checkResult.rules.find((rule) => rule.id === 'WV01').status === 'fail'
      )
    )
  }
)
