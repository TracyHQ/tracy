import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { zipSync } from 'fflate'
import { runAgent } from '../src/lib/agent-over-door.js'
import { createKitImages } from '../src/lib/template-kit-images.js'
import { SITE_WRITER_STEP } from '../src/site-writer/bench-worker.js'
import {
  withWriterVisualReview,
  writerVisualRequirements,
  WRITER_VISUAL_POLICY
} from '../src/site-writer/visual-review.js'
import { DOOR, scriptedModel, toolCallReply, finalReply } from './_agent-over-door-fake.mjs'

const ref = 'test-writer/j6/1.0.0'
const bytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64'
)
const sha = createHash('sha256').update(bytes).digest('hex')
const ids = ['hero-1440', 'hero-390']
const kit = {
  site: {},
  pages: [],
  blocks: [{ id: 'hero', images: { 1440: ids[0], 390: ids[1] }, slots: [] }],
  images: ids.map((id) => ({ id, path: `images/${id}.png`, sha256: sha }))
}
const plan = { pages: [{ id: 'home', decision: 'keep', blocks: [{ block: 'hero', decision: 'keep' }] }] }
const result = () => ({ rules: [], summary: { pass: 0, fail: 0, skip: 0 } })
const coverage = (history, over = {}) =>
  withWriterVisualReview(result(), { plan, kit, kitRef: ref, history, runId: 'current', ...over }).rules.at(
    -1
  )
const row = { id: 'current', plan, kit: { ref }, harness: { visualReview: WRITER_VISUAL_POLICY } }

async function actualWriting(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'writer-image-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const archive = zipSync(Object.fromEntries(ids.map((id) => [`images/${id}.png`, bytes])))
  const source = createKitImages({ dir, fetchZip: async () => ({ ok: true, bytes: archive }) })
  const ready = await source.ensure({ ref, release: 'test-release', doc: kit })
  assert.equal(ready.ok, true)
  const request = SITE_WRITER_STEP.agentRequest({
    row,
    ready: { kit: { doc: kit }, images: ready.images, firstUser: 'Write the copy.' },
    history: []
  })
  const fake = scriptedModel([
    toolCallReply({ calls: ids.map((id) => ['open_kit_image', { id }]) }),
    finalReply({ content: '{}' })
  ])
  const ran = await runAgent({
    ...request,
    door: DOOR,
    system: 'Test writer.',
    fetchImpl: fake.fetchImpl,
    toolImages: 'user-message'
  })
  return { ran, fake, request }
}

test('writer opens hashed desktop and mobile kit files and delivers their actual pixels to an answered writing turn', async (t) => {
  const { ran, fake, request } = await actualWriting(t)
  assert.deepEqual(
    request.tools.map((tool) => tool.name),
    ['open_kit_image']
  )
  const sent = fake.requests[1].body.messages.flatMap((message) =>
    Array.isArray(message.content) ? message.content : []
  )
  assert.equal(sent.filter((part) => part.type === 'image_url').length, 2)
  assert.ok(
    sent
      .filter((part) => part.type === 'image_url')
      .every((part) => part.image_url.url.startsWith('data:image/png;base64,'))
  )
  assert.equal(coverage(ran.turns).status, 'pass')
  assert.deepEqual(new Set(coverage(ran.turns).coverage.reviewed), new Set(ids))
  assert.match(request.firstUser, /1440 and 390/)
})

test('writer refuses unviewed, unanswered, forged and other-run image evidence', async (t) => {
  const { ran } = await actualWriting(t)
  assert.equal(coverage([]).status, 'fail')
  assert.equal(coverage(ran.turns.slice(0, 1)).status, 'fail')
  assert.equal(coverage(ran.turns.map((turn) => ({ ...turn, run_id: 'another-run' }))).status, 'fail')
  for (const patch of [{ kit: 'another-kit' }, { sha256: 'f'.repeat(64) }]) {
    const history = structuredClone(ran.turns)
    for (const turn of history)
      for (const message of turn.sent ?? [])
        for (const part of Array.isArray(message.content) ? message.content : [])
          if (part.type === 'image_ref') Object.assign(part.ref, patch)
    assert.equal(coverage(history).status, 'fail')
  }
  const history = structuredClone(ran.turns)
  history.at(-1).state = 'dispatched'
  assert.equal(coverage(history).status, 'fail')
})

test('writer image requirements reject missing mobile captures and hashes while historical requests keep their original input', () => {
  const missing = structuredClone(kit)
  delete missing.blocks[0].images['390']
  assert.match(writerVisualRequirements(plan, missing).declarations.join(' '), /390/)
  const unhashed = structuredClone(kit)
  delete unhashed.images[0].sha256
  assert.equal(coverage([], { kit: unhashed }).status, 'fail')
  const old = SITE_WRITER_STEP.agentRequest({
    row: { harness: {} },
    ready: { firstUser: 'Original text.' },
    history: []
  })
  assert.deepEqual(old, { firstUser: 'Original text.', tools: [] })
})
