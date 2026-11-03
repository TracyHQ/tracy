// The icon step inside a picture run (#345 wired by the bench worker), at the bench-run seam: the invented Kestrel
// Row Bike Workshop plan with an icon frame, a fake ranking model behind the `pictureIconRanker` door, and a fake
// release webroot (a tar.gz made here) that holds the kit's demo icon, drawn by code. The run places a library icon
// ranked by the model and styled from the demo icon, and records the ranking's cost and time in the manifest; with no
// ranking door the shortlist order decides and the manifest says why. No real model is called.
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { assignDoor, saveProvider } from '../src/lib/llm-store.js'
import { readRun } from '../src/site-pictures/bench-store.js'
import { fileDb } from './_db.mjs'
import { kitIndex, plan, startRun, storeDir } from './_site-pictures-bench.mjs'
import { assignPickerDoor, drainPicker, reply, SECRET } from './_site-pictures-picker.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const kits = kitIndex()
after(kits.done)

const RANKER = 'openai/gpt-6-luna'

async function assignRankerDoor(pool) {
  await saveProvider(
    pool,
    { id: 'openrouter', presetId: 'openrouter', apiKey: 'sk-test-ranker-key', enabled: true },
    SECRET,
    'owner@tracy.test'
  )
  await assignDoor(pool, 'pictureIconRanker', { providerId: 'openrouter', model: RANKER }, 'owner@tracy.test')
}

/** A tar.gz of `files` (path -> bytes) under a webroot/ folder, as a release ships its site. */
function tarGz(files) {
  const blocks = []
  for (const [name, bytes] of files) {
    const header = Buffer.alloc(512)
    header.write(`webroot/${name}`, 0, 100, 'utf8')
    header.write('0000644\0', 100)
    header.write('0000000\0', 108)
    header.write('0000000\0', 116)
    header.write(`${bytes.length.toString(8).padStart(11, '0')}\0`, 124)
    header.write('00000000000\0', 136)
    header.write('        ', 148)
    header.write('0', 156)
    header.write('ustar\0', 257)
    header.write('00', 263)
    let sum = 0
    for (const b of header) sum += b
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
    blocks.push(header, bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512))
  }
  blocks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(blocks))
}

/** A demo icon drawn by code: a dark outline ring, about regular weight. */
const demoIcon = () =>
  sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><circle cx="64" cy="64" r="40" fill="none" stroke="#1d3557" stroke-width="10"/></svg>'
    )
  )
    .png()
    .toBuffer()

/** A plan with one icon frame and nothing for the picker. */
function iconPlan() {
  const p = plan()
  p.pages[1].blocks.push({
    block: 'block-9',
    seen: 'seen',
    decision: 'keep',
    why: 'fits',
    pictures: [
      {
        frame: 'block-9.1',
        kind: 'icon',
        match: 'specific',
        shows: 'a wrench for bike repair',
        mustInclude: ['wrench'],
        factIds: []
      }
    ]
  })
  return p
}

test(
  'an icon frame gets a library icon ranked by the text model and styled from the demo icon, with its cost and time',
  opts,
  async () => {
    const { pool } = db
    const store = storeDir()
    try {
      await assignRankerDoor(pool)
      const started = await startRun(
        pool,
        { index: kits.index, dir: store.dir },
        { plan: iconPlan(), secret: SECRET }
      )
      const asked = []
      let chosen = null
      const fetchImpl = async (url, init) => {
        const body = JSON.parse(init.body)
        asked.push({ url, body })
        const items = JSON.parse(body.messages.at(-1).content).items
        chosen = items[0].menu[1]
        return new Response(
          JSON.stringify({
            model: RANKER,
            choices: [{ message: { content: JSON.stringify({ items: { [items[0].id]: [chosen] } }) } }],
            usage: { prompt_tokens: 300, completion_tokens: 20, cost: 0.00012 }
          }),
          { headers: { 'content-type': 'application/json' } }
        )
      }
      const releases = []
      const webroot = async (release) => {
        releases.push(release)
        return { ok: true, bytes: tarGz([['images/demo/block-9.1.jpg', await demoIcon()]]) }
      }
      await drainPicker(pool, { index: kits.index, dir: store.dir, fetchImpl, webroot })

      const run = await readRun(pool, started.id)
      assert.equal(run.status, 'succeeded', run.error)
      assert.equal(asked.length, 1, 'one ranking call for the whole site')
      assert.equal(asked[0].body.model, RANKER)
      const manifest = run.rounds[0].pictures
      const icon = manifest.frames.find((e) => e.frame === 'block-9.1')
      assert.equal(icon.source, 'icon')
      assert.deepEqual(icon.icon, { light: chosen, dark: chosen })
      assert.match(icon.reason, /ranked by the text model/)
      assert.doesNotMatch(icon.reason, /no demo icon to measure/)
      assert.ok(icon.dark?.file)
      assert.equal(manifest.cost.iconRanking, 0.00012)
      // The run's cost holds every role (#343): the ranking call is added to the picker's turns (the looks are free).
      assert.ok(Math.abs(run.costUsd - (run.rounds.reduce((n, r) => n + r.costUsd, 0) + 0.00012)) < 1e-9)
      assert.ok(Number.isInteger(manifest.timing.iconRanking) && manifest.timing.iconRanking >= 0)
      assert.deepEqual(manifest.iconRanking, { model: RANKER, notes: [] })
      assert.equal(releases.length, 1)
      assert.equal(run.rounds[0].checkResult.summary.fail, 0)
    } finally {
      store.done()
    }
  }
)

test(
  'without a ranking door or a webroot the shortlist order decides and the manifest says why',
  opts,
  async () => {
    const { pool } = db
    const store = storeDir()
    try {
      // The picker still runs for the specific frame; nothing else is called.
      await assignPickerDoor(pool)
      const p = iconPlan()
      p.pages[1].blocks
        .at(-1)
        .pictures.push({ frame: 'block-9.0', kind: 'photo', match: 'specific', shows: 'a tyre' })
      const started = await startRun(pool, { index: kits.index, dir: store.dir }, { plan: p, secret: SECRET })
      const calls = []
      const fetchImpl = async (url, init) => {
        const body = JSON.parse(init.body)
        calls.push(body.model)
        const r = reply({ picks: [{ frame: 'block-9.0', photo: 'none', reason: 'no tyre in any photo' }] })
        return new Response(JSON.stringify(r.body), { headers: { 'content-type': 'application/json' } })
      }
      await drainPicker(pool, { index: kits.index, dir: store.dir, fetchImpl })
      const run = await readRun(pool, started.id)
      assert.equal(run.status, 'succeeded', run.error)
      assert.deepEqual(calls, ['deepseek-flash'], 'only the picker was called')
      const manifest = run.rounds[0].pictures
      const icon = manifest.frames.find((e) => e.frame === 'block-9.1')
      assert.equal(icon.source, 'icon')
      assert.match(icon.reason, /first of the shortlist/)
      assert.match(icon.reason, /no demo icon to measure/)
      assert.equal(manifest.cost.iconRanking, 0)
      assert.equal(manifest.iconRanking.model, null)
      assert.ok(manifest.iconRanking.notes.some((n) => /Picture icon ranker" door is unassigned/.test(n)))
      assert.ok(manifest.iconRanking.notes.some((n) => /demo icons are not measured/.test(n)))
    } finally {
      store.done()
    }
  }
)
