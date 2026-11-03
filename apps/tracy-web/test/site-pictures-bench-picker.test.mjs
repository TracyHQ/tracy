// The picker of the picture bench (#342), at the bench-run seam: one call for the whole site with a fake picker door
// (DeepSeek Flash on DeepSeek's own API, scripted), on the invented Kestrel Row Bike Workshop plan, brief, kit and
// code generated photos. The picker sees the owner photos once as small thumbnails tagged with codes, never a demo
// picture of the kit; its picks are cut, checked and recorded with the prompt hash, cost and balance. Fix rounds send
// back only the failing frames of the picker, at most two; an invalid pick is sent back once, valid ones are applied; a
// frame the picker answers "none" waits for the drawer. A run killed in a fix round resumes and shows the thumbnails
// again.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { startPictureRun } from '../src/site-pictures/bench-control.js'
import { runFiles } from '../src/site-pictures/bench-export.js'
import { filesOf, inputsOf, readRun } from '../src/site-pictures/bench-store.js'
import { PICKER_PROMPT_FILE, picturePrompts } from '../src/site-pictures/picture-prompts.js'
import { scriptedModel } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import { brief, kitIndex, KIT_REF, photoFolder, storeDir } from './_site-pictures-bench.mjs'
import {
  assignPickerDoor,
  balances,
  drainPicker,
  lastUserText,
  PICKER_FRAMES,
  pickerPlan,
  pickerView,
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

const byFrame = (manifest) => new Map([...manifest.frames, ...manifest.siteSettings].map((e) => [e.frame, e]))
const assets = new Map(brief().assets.map((a) => [a.id, a]))
const pick = (frame, photo, reason = `photo ${photo} shows the workshop`) => ({ frame, photo, reason })

test(
  'the picker sees owner thumbnails once and no demo picture, and its picks are cut, checked and recorded',
  opts,
  async () => {
    const { pool } = db
    await assignPickerDoor(pool)
    const started = await startPickerRun(pool, where)
    let view = null
    const model = scriptedModel([])
    const answering = async (url, init) => {
      model.requests.push({ url, body: JSON.parse(init.body) })
      view = pickerView(model.requests[0])
      const [hero, feature, about] = PICKER_FRAMES.map((f) => view.frames.get(f).photos)
      const featureCode = feature.find((c) => c !== hero[0])
      const answer = {
        picks: [pick('block-2.0', hero[0]), pick('block-6.1', featureCode), pick('block-5.1', about[0])]
      }
      const r = reply(answer)
      return new Response(JSON.stringify(r.body), { headers: { 'content-type': 'application/json' } })
    }
    await drainPicker(pool, { ...where, fetchImpl: answering, balanceFetch: balances(['10.00', '9.99']) })

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 1, 'one call for the whole site')
    const body = model.requests[0].body
    // The system prompt is the picker prompt; its hash is recorded on the run and in the manifest's fingerprint.
    assert.equal(body.messages[0].content, picturePrompts().text)
    const pickerSha = createHash('sha256').update(readFileSync(PICKER_PROMPT_FILE)).digest('hex')
    assert.equal((await inputsOf(pool, started.id)).prompts.picker, pickerSha)
    assert.equal(run.promptSha256, picturePrompts().sha256)
    // Only the frames that need a specific picture, each with the plan's words and its shortlist of codes.
    assert.deepEqual([...view.frames.keys()], PICKER_FRAMES)
    for (const f of view.frames.values()) {
      assert.match(f.shows, /the workshop/)
      assert.ok(f.photos.length > 0)
      for (const code of f.photos)
        assert.ok(
          view.labels.some((l) => l.code === code),
          code
        )
    }
    // Every shown photo exactly once, as a thumbnail no longer than 512 px; nothing of the kit's demo pictures.
    assert.equal(view.images.length, view.labels.length)
    assert.equal(new Set(view.labels.map((l) => l.code)).size, view.labels.length)
    for (const [i, url] of view.images.entries()) {
      const meta = await sharp(Buffer.from(url.split(',')[1], 'base64')).metadata()
      assert.ok(Math.max(meta.width, meta.height) <= 512)
      assert.deepEqual([meta.width, meta.height], [view.labels[i].width, view.labels[i].height])
    }
    const sent = JSON.stringify(body)
    assert.ok(!sent.includes('images/demo/'), 'no demo picture path is sent')
    assert.ok(!sent.includes(kits.index.values().next().value.dir), 'nothing of the kit folder is sent')
    // Never a portrait of a person, a photo with lettering, a blurry photo or a video in a shortlist.
    assert.ok(view.labels.length <= 5)

    const round = run.rounds[0]
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state, r.failureList]),
      [[0, 'checked', '']]
    )
    const manifest = round.pictures
    assert.equal(round.checkResult.summary.fail, 0)
    const e = byFrame(manifest)
    // Each pick placed the photo its code names: the label's thumbnail has the photo's own shape.
    for (const p of manifest.picks) {
      const entry = e.get(p.frame)
      assert.equal(entry.source, 'owner-photo')
      assert.equal(entry.asset, p.asset)
      assert.match(entry.reason, /shows the workshop/)
      const label = view.labels.find((l) => l.code === p.photo)
      const a = assets.get(p.asset)
      assert.equal(label.height, Math.round((512 * a.height) / a.width), `${p.photo} is ${p.asset}`)
    }
    assert.deepEqual(
      manifest.picks.map((p) => p.frame),
      PICKER_FRAMES
    )
    // Twins follow the picked frames.
    assert.deepEqual(
      [e.get('block-6.9').source, e.get('block-6.9').sha256],
      ['twin', e.get('block-6.1').sha256]
    )
    assert.deepEqual(
      [e.get('block-5.2').source, e.get('block-5.2').sha256],
      ['twin', e.get('block-5.1').sha256]
    )
    assert.deepEqual(manifest.pending, [])
    assert.equal(manifest.fingerprint.prompts.picker, pickerSha)
    // The chosen files are on disk, each with its row.
    const rows = new Set((await filesOf(pool, started.id)).map((r) => r.sha256))
    for (const f of PICKER_FRAMES) assert.ok(rows.has(e.get(f).sha256), f)

    // Cost per call and the balance before and after: a model was read.
    assert.deepEqual(run.balance.before.infos, [{ currency: 'USD', total: 10 }])
    assert.deepEqual(run.balance.after.infos, [{ currency: 'USD', total: 9.99 }])
    const { rows: turns } = await pool.query(
      'select cost_usd, message, request from site_picture_turn where run_id = $1',
      [started.id]
    )
    assert.equal(turns.length, 1)
    assert.ok(Number(turns[0].cost_usd) > 0)
    assert.ok(run.costUsd > 0)
    // The thinking is saved with the answer, and the thumbnails as references, never the bytes.
    assert.equal(turns[0].message.reasoning_content, 'looking at the thumbnails')
    assert.equal(turns[0].request.wire, 'deepseek-native')
  }
)

test(
  'only failing frames go back: invalid picks are returned, valid ones applied, and after two rounds the ladder draws',
  opts,
  async () => {
    const { pool } = db
    await assignPickerDoor(pool)
    const started = await startPickerRun(pool, where)
    let hero = null
    const answers = [
      // Round 0: a valid hero, a code outside the feature's list, and "none" for the about section.
      (view) => {
        hero = view.frames.get('block-2.0').photos[0]
        return {
          picks: [
            pick('block-2.0', hero),
            pick('block-6.1', 'P99'),
            pick('block-5.1', 'none', 'no photo shows it')
          ]
        }
      },
      // The rejected pick, corrected, but to the hero's photo: shown twice on the home page.
      () => ({ picks: [pick('block-6.1', hero)] }),
      () => ({ picks: [pick('block-6.1', hero)] }),
      () => ({ picks: [pick('block-6.1', hero)] })
    ]
    const requests = []
    const answering = async (_url, init) => {
      requests.push({ body: JSON.parse(init.body) })
      const answer = answers[requests.length - 1](pickerView(requests[0]))
      return new Response(JSON.stringify(reply(answer).body), {
        headers: { 'content-type': 'application/json' }
      })
    }
    await drainPicker(pool, { ...where, fetchImpl: answering })

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(requests.length, 4, 'round 0, its corrected pick, then two fix rounds')
    // The invalid pick was sent back alone, once.
    const second = lastUserText(requests[1])
    assert.match(second, /2 of your changes were applied\. 1 could not be applied/)
    assert.match(second, /P99 is not in its photos list/)
    const [r0, r1, r2] = run.rounds
    assert.equal(r0.reading.changesApplied, 3)
    // Valid picks applied: the hero holds its photo; the about section the picker left is drawn (#344), its twin follows.
    const e0 = byFrame(r0.pictures)
    assert.equal(e0.get('block-2.0').source, 'owner-photo')
    assert.equal(e0.get('block-5.1').source, 'drawn')
    assert.deepEqual(
      [e0.get('block-5.2').source, e0.get('block-5.2').sha256],
      ['twin', e0.get('block-5.1').sha256]
    )
    assert.deepEqual(r0.pictures.pending, [])
    // Round 0 failed on the repeat; only the picker's failing frame went back.
    assert.match(r0.failureList, /^P06 \|.*\| block-6\.1 \|/m)
    assert.doesNotMatch(r0.failureList, /block-5\.1 \|/)
    assert.doesNotMatch(r0.checkResult.notForPicker, /block-5\.1 \|/)
    for (const req of [requests[2], requests[3]]) {
      const lines = lastUserText(req).split('\n\nThe frames above')[0].trim().split('\n')
      assert.ok(lines.length > 0)
      for (const line of lines) assert.equal(line.split(' | ')[2], 'block-6.1', line)
    }
    assert.deepEqual(
      run.rounds.map((r) => r.round),
      [0, 1, 2]
    )
    assert.equal(r1.state, 'checked')
    assert.equal(r2.state, 'checked')
    // The last round has no picker round after it: the frame still failing the check climbs the ladder and is drawn.
    assert.match(r1.failureList, /^P06 \|.*block-6\.1/m)
    const e2 = byFrame(r2.pictures)
    assert.equal(e2.get('block-6.1').source, 'drawn')
    assert.deepEqual(
      r2.pictures.ladder.find((l) => l.frame === 'block-6.1').steps.map((x) => [x.rung, x.outcome]),
      [
        ['placed', 'failed the check'],
        ['draw', 'placed']
      ]
    )
    assert.equal(r2.failureList, '')
    assert.equal(run.standingFailures, null)
  }
)

test('a run whose frames the picker cannot fill draws them and ends without another call', opts, async () => {
  const { pool } = db
  await assignPickerDoor(pool)
  const started = await startPickerRun(pool, where)
  const model = scriptedModel([reply({ picks: PICKER_FRAMES.map((f) => pick(f, 'none', 'nothing fits')) })])
  await drainPicker(pool, { ...where, fetchImpl: model.fetchImpl })
  const run = await readRun(pool, started.id)
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(model.requests.length, 1)
  assert.equal(run.rounds.length, 1)
  // Every frame the picker left is drawn (#344), its twins follow, and nothing waits.
  const manifest = run.rounds[0].pictures
  const e = byFrame(manifest)
  for (const f of PICKER_FRAMES) assert.equal(e.get(f).source, 'drawn', f)
  assert.equal(e.get('block-5.2').source, 'twin')
  assert.deepEqual(manifest.pending, [])
  assert.equal(manifest.drawer.count, PICKER_FRAMES.length)
  // Nothing went back to the picker, and nothing is left failing.
  assert.equal(run.standingFailures, null)
  assert.equal(run.rounds[0].failureList, '')
  assert.equal(run.rounds[0].checkResult.notForPicker, '')
  // `get` writes no list of failures not for the picker when there is none.
  const written = new Map(runFiles({ ...run, ...(await inputsOf(pool, run.id)) }, [], []))
  assert.equal(written.has('failures-not-for-picker.txt'), false)
})

test('a plan with frames for the picker does not start without the picker door', opts, async () => {
  const { pool } = db
  const refused = await startPictureRun({
    pool,
    secret: SECRET,
    plan: pickerPlan(),
    planSource: { kind: 'file', name: 'kestrel-plan.json' },
    brief: brief(),
    briefSource: { kind: 'file', name: 'kestrel-brief.json' },
    kitRef: KIT_REF,
    startedBy: 'cli',
    photos: photoFolder(),
    storeDir: store.dir,
    index: kits.index
  })
  assert.equal(refused.ok, false)
  assert.equal(refused.code, 'SITE_PICTURES_DOOR_UNSET')
  assert.equal((await pool.query('select count(*)::int as n from site_picture_run')).rows[0].n, 0)
})

test(
  'a run killed in its fix round resumes from the saved turns and shows the thumbnails again',
  opts,
  async () => {
    const { pool } = db
    await assignPickerDoor(pool)
    const started = await startPickerRun(pool, where)
    let hero = null
    let calls = 0
    const first = []
    const dying = async (_url, init) => {
      calls += 1
      first.push({ body: JSON.parse(init.body) })
      if (calls === 2) {
        await pool.query('update site_picture_run set lease_token = lease_token + 1')
        throw new Error('killed')
      }
      const view = pickerView(first[0])
      hero = view.frames.get('block-2.0').photos[0]
      const answer = { picks: PICKER_FRAMES.map((f) => pick(f, f === 'block-5.1' ? 'none' : hero)) }
      return new Response(JSON.stringify(reply(answer).body), {
        headers: { 'content-type': 'application/json' }
      })
    }
    await drainPicker(pool, { ...where, fetchImpl: dying })
    await pool.query(`update site_picture_run set lease_until = now() - interval '1 second' where id = $1`, [
      started.id
    ])
    const second = scriptedModel([reply({ picks: [pick('block-6.1', 'none', 'nothing else fits')] })])
    await drainPicker(pool, { ...where, fetchImpl: second.fetchImpl })

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.attempts, 2)
    assert.equal(second.requests.length, 1, 'only the lost fix round call is sent again')
    const images = second.requests[0].body.messages
      .filter((m) => m.role === 'user' && Array.isArray(m.content))
      .flatMap((m) => m.content.filter((p) => p.type === 'image_url'))
    assert.equal(images.length, pickerView(first[0]).images.length)
    assert.deepEqual(
      images.map((p) => p.image_url.url),
      pickerView(first[0]).images
    )
    const e = byFrame(run.rounds.at(-1).pictures)
    assert.equal(e.get('block-2.0').source, 'owner-photo')
    assert.equal(e.get('block-6.1').source, 'drawn', 'the feature the picker gave up on is drawn')
  }
)
