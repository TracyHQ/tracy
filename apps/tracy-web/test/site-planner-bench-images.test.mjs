// Kit images in a site planner bench run (ADR 0041, #302), at the bench-run seam: a kit whose release zip does not
// match the hashes the kit lists fails the run before the first model call; an opened image is saved as a reference
// in the turn rows, never as bytes, and every later request (a resumed run, a fix round) carries the full bytes again,
// read back from the image cache. The model and GitHub are fakes.
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { zipSync } from 'fflate'
import { readRun } from '../src/site-planner/bench-store.js'
import { createSitePlannerQueue } from '../src/site-planner/bench-worker.js'
import { kitZipName } from '../src/site-planner/kit-images.js'
import { KIT_TOOL_NAMES, openKit } from '../src/site-planner/kit-source.js'
import { finalReply, scriptedModel, toolCallReply } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import {
  assignPlannerDoor,
  inventedImageBytes,
  KIT_REF,
  readyKitImages,
  SECRET,
  startRun
} from './_site-planner-bench.mjs'
import { plan } from './_site-plan-check.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const quiet = { error() {}, warn() {}, log() {} }
const openImage = (id) => toolCallReply({ calls: [[KIT_TOOL_NAMES.openImage, { id }]] })
const dataUrl = (id) => `data:image/jpeg;base64,${inventedImageBytes(id).toString('base64')}`

/** Every image_url sent in one request, in order. */
const sentImages = (request) =>
  request.body.messages.flatMap((m) =>
    Array.isArray(m.content)
      ? m.content.filter((p) => p.type === 'image_url').map((p) => p.image_url.url)
      : []
  )

/** One worker process runs what is queued; killOn: it dies while waiting for that request (1-based). */
async function drain(pool, model, kitImages, { killOn } = {}) {
  let count = 0
  const fetchImpl = async (url, init) => {
    if (++count === killOn) {
      await pool.query('update site_planner_run set lease_token = lease_token + 1')
      throw new Error('killed')
    }
    return model.fetchImpl(url, init)
  }
  await createSitePlannerQueue({ pool, secret: SECRET, fetchImpl, kitImages, log: quiet })
    .drain()
    .catch(() => {})
}

test(
  'a kit whose release zip does not match the kit hashes fails the run before any model call',
  opts,
  async () => {
    const { pool } = db
    const dir = mkdtempSync(path.join(tmpdir(), 'site-planner-images-'))
    try {
      await assignPlannerDoor(pool)
      const run = await startRun(pool)
      const kit = openKit(KIT_REF)
      // The release row Tracy copied from GitHub, with the kit zip as an asset; the zip holds invented bytes, so no
      // image matches the sha256 the real kit lists.
      const name = kitZipName(kit.doc)
      await pool.query(
        `insert into quickstart_releases (tag, release, setting, tracy, reason) values ($1, $2::jsonb, null, 'ready', null)`,
        [kit.release, JSON.stringify({ name: 'ja-boxing', kind: 'quickstart', assets: [{ name, id: 4242 }] })]
      )
      const zip = zipSync(
        Object.fromEntries(kit.doc.images.map((i) => [i.path, new Uint8Array(inventedImageBytes(i.id))]))
      )
      const github = []
      const model = scriptedModel([finalReply({ content: JSON.stringify(plan()) })])
      const fetchImpl = async (url, init) => {
        if (String(url).startsWith('https://api.github.com/')) {
          github.push(String(url))
          return new Response(zip, { status: 200 })
        }
        return model.fetchImpl(url, init)
      }
      await createSitePlannerQueue({
        pool,
        secret: SECRET,
        config: { github: null, releasesToken: 'read-only-token', readinessDir: dir },
        fetchImpl,
        log: quiet
      }).drain()

      const ended = await readRun(pool, run.id)
      assert.equal(ended.status, 'failed')
      assert.match(ended.error, /^SITE_PLANNER_KIT_IMAGE_MISMATCH: 110 image\(s\)/)
      assert.equal(model.requests.length, 0, 'a model call went out on an unusable kit')
      assert.deepEqual(ended.rounds, [])
      assert.equal(github.length, 1)
      assert.match(github[0], /\/releases\/assets\/4242$/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
)

test(
  'a run resumed after an opened image sends the full image again, read back from the cache',
  opts,
  async () => {
    const { pool } = db
    await assignPlannerDoor(pool)
    const started = await startRun(pool)
    // The first process: the planner opens an image, then the process dies while the next call waits for its answer.
    const first = readyKitImages()
    await drain(pool, scriptedModel([openImage('header-1440')]), first, { killOn: 2 })
    assert.deepEqual(first.calls.open, ['header-1440'])
    await pool.query(`update site_planner_run set lease_until = now() - interval '1 second' where id = $1`, [
      started.id
    ])

    // The turn rows hold a reference to the image, never its bytes.
    const { rows } = await pool.query('select sent from site_planner_turn where run_id = $1 order by n', [
      started.id
    ])
    const stored = JSON.stringify(rows.map((r) => r.sent))
    assert.doesNotMatch(stored, /base64|image_url/)
    assert.match(stored, /"type":"image_ref"/)
    assert.match(stored, /"image":"header-1440"/)

    // The next process resends the lost call: the image goes out in full, read back from the cache, not opened again.
    const second = readyKitImages()
    const model = scriptedModel([finalReply({ content: JSON.stringify(plan()) })])
    await drain(pool, model, second)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 1)
    assert.deepEqual(sentImages(model.requests[0]), [dataUrl('header-1440')])
    assert.deepEqual(second.calls.open, [])
    assert.deepEqual(second.calls.resolve, ['header-1440'])
  }
)

test(
  'a fix round replays the conversation with the full bytes of every image opened before',
  opts,
  async () => {
    const { pool } = db
    await assignPlannerDoor(pool)
    const started = await startRun(pool)
    const bad = plan()
    delete bad.site
    const images = readyKitImages()
    const model = scriptedModel([
      openImage('header-1440'),
      openImage('page-home-1440'),
      finalReply({ content: JSON.stringify(bad) }),
      finalReply({ content: JSON.stringify(plan()) })
    ])
    await drain(pool, model, images)
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.rounds.length, 2)
    // Every request after an image was opened carries it in full, round 0 and the fix round alike.
    assert.deepEqual(model.requests.map(sentImages), [
      [],
      [dataUrl('header-1440')],
      [dataUrl('header-1440'), dataUrl('page-home-1440')],
      [dataUrl('header-1440'), dataUrl('page-home-1440')]
    ])
    // Round 0 had the bytes in memory; the fix round read each image back once.
    assert.deepEqual(images.calls.open, ['header-1440', 'page-home-1440'])
    assert.deepEqual(images.calls.resolve, ['header-1440', 'page-home-1440'])
  }
)
