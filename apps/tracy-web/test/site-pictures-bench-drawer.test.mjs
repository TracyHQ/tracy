// The drawer of the picture bench (#344), at the bench-run seam: a run whose plan may need a drawing does not start
// without a usable drawer door, nor run when the door changed; a frame the picker gives up on is drawn through the
// fake drawer door (gemini flash lite image through OpenRouter, scripted), and what each drawing cost is on its file row,
// in the manifest's drawer record and in the run's cost. Invented Kestrel Row Bike Workshop data, no real model.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { assignDoor, clearDoor, saveModels } from '../src/lib/llm-store.js'
import { startPictureRun } from '../src/site-pictures/bench-control.js'
import { filesOf, readRun } from '../src/site-pictures/bench-store.js'
import { fileDb } from './_db.mjs'
import {
  assignDrawerDoor,
  assignLookerDoor,
  brief,
  DRAW_COST,
  DRAWER_MODEL,
  drawReply,
  drawText,
  KIT_REF,
  kitIndex,
  photoFolder,
  storeDir
} from './_site-pictures-bench.mjs'
import {
  assignPickerDoor,
  drainPicker,
  PICKER_FRAMES,
  pickerPlan,
  reply,
  SECRET,
  startPickerRun
} from './_site-pictures-picker.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const kits = kitIndex()
after(kits.done)
const store = storeDir()
after(store.done)
const where = { index: kits.index, dir: store.dir }
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

const start = (pool) =>
  startPictureRun({
    pool,
    secret: SECRET,
    plan: pickerPlan(),
    planSource: { kind: 'file', name: 'p.json' },
    brief: brief(),
    briefSource: { kind: 'file', name: 'b.json' },
    kitRef: KIT_REF,
    startedBy: 'cli',
    photos: photoFolder(),
    storeDir: store.dir,
    index: kits.index
  })

test(
  'a run that may need a drawing does not start without a drawer that draws, nor run when it changed',
  opts,
  async () => {
    const { pool } = db
    await assignPickerDoor(pool)
    await assignLookerDoor(pool)
    const unset = await start(pool)
    assert.equal(unset.code, 'SITE_PICTURES_DRAWER_UNSET')
    assert.match(unset.reason, /"Picture drawer" door has no provider and model/)
    // A model the provider says cannot draw.
    await saveModels(pool, 'openrouter', [{ id: 'openai/gpt-6-luna', draws: false }])
    await assignDoor(
      pool,
      'pictureDrawer',
      { providerId: 'openrouter', model: 'openai/gpt-6-luna' },
      'o@t.test'
    )
    const lacks = await start(pool)
    assert.equal(lacks.code, 'SITE_PICTURES_DRAWER_MODEL_LACKS')
    assert.equal((await pool.query('select count(*)::int as n from site_picture_run')).rows[0].n, 0)
    // Started on the drawer door, which is stored on the run (never its key); changed before a worker claims the run.
    await assignDrawerDoor(pool)
    const started = await start(pool)
    assert.equal(started.ok, true, JSON.stringify(started))
    const { rows } = await pool.query('select door from site_picture_run where id = $1', [started.run.id])
    assert.equal(rows[0].door.drawer.model, DRAWER_MODEL)
    assert.doesNotMatch(JSON.stringify(rows[0].door), /sk-test/)
    await clearDoor(pool, 'pictureDrawer')
    await drainPicker(pool, { ...where, fetchImpl: async () => assert.fail('no call') })
    const run = await readRun(pool, started.run.id)
    assert.equal(run.status, 'failed')
    assert.match(run.error, /^SITE_PICTURES_DRAWER_UNSET/)
  }
)

test(
  'frames the picker gives up on are drawn, and every drawing is counted in the run cost',
  opts,
  async () => {
    const { pool } = db
    await assignPickerDoor(pool)
    const started = await startPickerRun(pool, where)
    const drawings = []
    const picker = async () =>
      json(
        reply({ picks: PICKER_FRAMES.map((frame) => ({ frame, photo: 'none', reason: 'nothing fits' })) })
          .body
      )
    const drawer = async (body) => {
      drawings.push(body)
      return drawReply(body)
    }
    await drainPicker(pool, { ...where, fetchImpl: picker, drawer })
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    const m = run.rounds[0].pictures
    // One drawing per frame, in parallel, each from the plan's words for that frame.
    assert.equal(drawings.length, PICKER_FRAMES.length)
    for (const f of PICKER_FRAMES)
      assert.ok(
        drawings.some((b) => drawText(b).includes(`the workshop, ${f}`)),
        f
      )
    assert.ok(drawings.every((b) => b.model === DRAWER_MODEL && b.modalities.includes('image')))
    // Recorded: the drawer's model, the template hash, the count and one record per call with its cost.
    assert.equal(m.drawer.model, DRAWER_MODEL)
    assert.match(m.drawer.promptSha256, /^[0-9a-f]{64}$/)
    assert.equal(m.drawer.count, PICKER_FRAMES.length)
    assert.ok(m.drawer.calls.every((c) => c.costUsd === DRAW_COST && !c.cached))
    assert.ok(Math.abs(m.cost.drawer - PICKER_FRAMES.length * DRAW_COST) < 1e-9)
    // Every drawn file has its row with what it cost.
    const files = new Map((await filesOf(pool, started.id)).map((f) => [f.sha256, f]))
    for (const e of m.frames.filter((x) => x.source === 'drawn'))
      assert.equal(files.get(e.sha256).costUsd, DRAW_COST)
    // The run's cost holds every role: the picker's turn and the drawings (the fake looks are free).
    assert.ok(
      Math.abs(run.costUsd - (run.rounds[0].costUsd + PICKER_FRAMES.length * DRAW_COST)) < 1e-9,
      `${run.costUsd}`
    )
  }
)
