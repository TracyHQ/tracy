// The looker of the picture bench (#343), at the bench-run seam: every finished picture is checked by a fake looker
// door (openai/gpt-6-luna through OpenRouter, scripted), one fresh call per picture, at most four at a time, seeing
// only the picture at display size and the plan's words. Its rejections go back to the fake picker (DeepSeek Flash) in
// the next fix round, for those frames only, with their fault names; its seen sentence is stored on every entry; alt
// notes are filled only when a writer copy file is given. Invented Kestrel Row Bike Workshop data, code generated
// photos, no real model.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import sharp from 'sharp'
import { withCmsLine } from '../src/lib/cms-line.js'
import { assignDoor, clearDoor } from '../src/lib/llm-store.js'
import { startPictureRun } from '../src/site-pictures/bench-control.js'
import { readRun } from '../src/site-pictures/bench-store.js'
import { picturePrompts } from '../src/site-pictures/picture-prompts.js'
import { fileDb } from './_db.mjs'
import {
  brief,
  KIT_REF,
  kitIndex,
  assignLookerDoor,
  LOOKER_MODEL as LOOKER,
  photoFolder,
  plan,
  startRun,
  storeDir
} from './_site-pictures-bench.mjs'
import {
  assignPickerDoor,
  drainPicker,
  lastUserText,
  pickerView,
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

const SEEN = 'A mechanic trues a bicycle wheel on a repair stand in a workshop.'
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const entries = (m) => [...m.frames, ...m.siteSettings]
const byFrame = (m) => new Map(entries(m).map((e) => [e.frame, e]))

// The frame a look is about: the picker plan writes the frame id into the words it shows.
const shownFrame = (body) =>
  /"shows": "the workshop, (block-[\d.]+)"/.exec(body.messages[1].content[0].text)?.[1]

/** A fake looker: `judge(body, n)` gives { verdict, faults, seen }, or { raw } sent as is; it counts calls in flight. */
function fakeLooker(judge) {
  const calls = []
  let inFlight = 0
  let most = 0
  const answer = async (body) => {
    inFlight++
    most = Math.max(most, inFlight)
    await new Promise((r) => setTimeout(r, 15))
    calls.push(body)
    const said = judge(body, calls.length)
    inFlight--
    return json({
      model: LOOKER,
      choices: [{ message: { role: 'assistant', content: said.raw ?? JSON.stringify(said) } }],
      usage: { prompt_tokens: 900, completion_tokens: 40, cost: 0.0002 }
    })
  }
  return { calls, answer, most: () => most }
}

const pass = { verdict: 'pass', faults: [], seen: SEEN }

test(
  'a rejection sends the frame back to the picker with its fault names, and every seen sentence is stored',
  opts,
  async () => {
    const { pool } = db
    await assignPickerDoor(pool)
    const started = await startPickerRun(pool, where)
    const looker = fakeLooker((body) => {
      // The hero is rejected while it holds the first photo the picker chose for it.
      const rejected = shownFrame(body) === 'block-2.0' && !heroChanged
      return rejected
        ? {
            verdict: 'fail',
            faults: ['wrong subject', 'stray lettering', 'blurry'],
            seen: 'A shop sign over a door.'
          }
        : pass
    })
    let heroChanged = false
    const picker = []
    const fetchImpl = async (url, init) => {
      const body = JSON.parse(init.body)
      picker.push({ body })
      const view = pickerView(picker[0])
      const [hero, feature, about] = ['block-2.0', 'block-6.1', 'block-5.1'].map(
        (f) => view.frames.get(f).photos
      )
      if (picker.length === 1)
        return json(
          reply({
            picks: [
              { frame: 'block-2.0', photo: hero[0], reason: 'the secret picker reason' },
              { frame: 'block-6.1', photo: feature.find((c) => c !== hero[0]), reason: 'a wheel' },
              { frame: 'block-5.1', photo: about[0], reason: 'the bench' }
            ]
          }).body
        )
      heroChanged = true
      return json(
        reply({ picks: [{ frame: 'block-2.0', photo: 'none', reason: 'no other photo fits' }] }).body
      )
    }
    await drainPicker(pool, { ...where, fetchImpl, looker: looker.answer })

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(picker.length, 2, 'round 0, then one fix round for the rejected frame')
    const [r0, r1] = run.rounds
    // Round 0: the rejection is a failure of the hero only, with the fault names from the fixed list.
    assert.match(
      r0.failureList,
      /^L01 \| The looker passes every finished picture \| block-2\.0 \| .*wrong subject, stray lettering/m
    )
    assert.equal(r0.failureList.split('\n').filter((l) => l.startsWith('L01')).length, 1)
    assert.ok(r0.checkResult.rules.find((r) => r.id === 'L01').notes.some((n) => /blurry/.test(n)))
    // The fix round sends back that frame alone, with its fault names.
    const fix = lastUserText(picker[1])
    assert.match(fix, /block-2\.0 \| the looker rejected the picture \(wrong subject, stray lettering\)/)
    for (const line of fix.split('\n\nThe frames above')[0].trim().split('\n'))
      assert.equal(line.split(' | ')[2], 'block-2.0', line)
    // Each look is a fresh call: the looker prompt, one user message with the plan's words and one picture at display
    // size; never the picker's reason.
    for (const body of looker.calls) {
      assert.equal(body.model, LOOKER)
      assert.equal(body.messages.length, 2)
      assert.equal(body.messages[0].content, withCmsLine(picturePrompts().looker, 'joomla'))
      const [text, image] = body.messages[1].content
      assert.doesNotMatch(text.text, /secret picker reason|the bench|P\d/)
      assert.match(text.text, /"avoid"/)
      const bytes = Buffer.from(image.image_url.url.split(',')[1], 'base64')
      const meta = await sharp(bytes).metadata()
      if (shownFrame(body) === 'block-2.0')
        assert.ok(meta.width <= 600 && meta.height <= 300, `${meta.width}`)
    }
    assert.ok(looker.most() > 1 && looker.most() <= 4, `at most four at a time, found ${looker.most()}`)
    // Seen and verdict stored per frame; twins take their source's look.
    const m0 = byFrame(r0.pictures)
    assert.deepEqual(m0.get('block-2.0').looker, {
      verdict: 'fail',
      faults: ['wrong subject', 'stray lettering'],
      seen: 'A shop sign over a door.'
    })
    assert.equal(m0.get('block-6.1').seen, SEEN)
    assert.equal(m0.get('block-6.1').looker.verdict, 'pass')
    const twin = entries(r0.pictures).find((e) => e.source === 'twin' && e.twinOf === 'block-6.1')
    if (twin) assert.equal(twin.seen, SEEN)
    // Cost and time per call under the looker role; a picture already looked at is not paid again.
    const looked = r0.pictures.looker
    assert.equal(looked.model, LOOKER)
    assert.equal(looked.promptSha256, picturePrompts().roles.looker)
    assert.ok(looked.calls.every((c) => c.costUsd === 0.0002 && Number.isInteger(c.ms) && !c.cached))
    assert.ok(Math.abs(r0.pictures.cost.looker - looked.calls.length * 0.0002) < 1e-12)
    assert.equal(
      r0.pictures.timing.looker,
      looked.calls.reduce((n, c) => n + c.ms, 0)
    )
    assert.ok(
      r1.pictures.looker.calls.some((c) => c.cached),
      'round 1 reads the kept looks'
    )
    assert.equal(r1.failureList.includes('L01'), false)
    // The run's cost holds every role: the picker's turns, the looks paid for (cached looks are not paid again) and the
    // drawing of the hero the picker gave up on (#344).
    const looks = [r0, r1].flatMap((r) => r.pictures.looker.calls).filter((c) => !c.cached).length * 0.0002
    assert.ok(looks > 0)
    assert.equal(r1.pictures.drawer.count, 1)
    const drawn = [r0, r1].flatMap((r) => r.pictures.drawer.calls).filter((c) => !c.cached)
    assert.equal(drawn.length, 1)
    const paid = looks + drawn[0].costUsd
    assert.ok(Math.abs(run.costUsd - (r0.costUsd + r1.costUsd + paid)) < 1e-9, `${run.costUsd}`)
    // No copy file: no alt notes, and the manifest says the alt check is deferred to the site check (step 11).
    assert.deepEqual(r1.pictures.altNotes, [])
    assert.equal(r1.pictures.altCheck.status, 'deferred')

    // Side check: DeepSeek's fix round request (no tools) does not carry the earlier reasoning_content; the shared
    // wire drops it on purpose (lib/agent-over-door-wire.js, DeepSeek's thinking mode docs).
    const assistant = picker[1].body.messages.find((m) => m.role === 'assistant')
    assert.ok(assistant, 'the fix round continues the conversation')
    assert.equal(assistant.reasoning_content, undefined)
    assert.equal(picker[1].body.tools, undefined)
  }
)

/** Start a run with the looker door as it stands (no door assigned by the helper); returns the refusal or the run. */
const start = (pool, over = {}) =>
  startPictureRun({
    pool,
    secret: SECRET,
    plan: plan(),
    planSource: { kind: 'file', name: 'p.json' },
    brief: brief(),
    briefSource: { kind: 'file', name: 'b.json' },
    kitRef: KIT_REF,
    startedBy: 'cli',
    photos: photoFolder(),
    storeDir: store.dir,
    index: kits.index,
    ...over
  })

const copyFile = (alts) => ({
  value: {
    version: 'site-copy/1',
    fingerprint: {},
    slots: [],
    alts,
    seo: [],
    pages: [],
    notebook: [],
    returns: []
  },
  source: { kind: 'file', name: 'kestrel-copy.json' }
})

test(
  'alt notes are filled only when a copy file is given, by word overlap with the seen sentence',
  opts,
  async () => {
    const { pool } = db
    const looker = fakeLooker(() => pass)
    const fetchImpl = async (url) => {
      throw new Error(`only the looker is called, not ${url}`)
    }
    const plain = await startRun(pool, where)
    await drainPicker(pool, { ...where, fetchImpl, looker: looker.answer })
    const first = await readRun(pool, plain.id)
    assert.equal(first.status, 'succeeded', first.error)
    const placed = entries(first.rounds[0].pictures).filter((e) => e.seen)
    assert.ok(placed.length >= 2)
    assert.deepEqual(first.rounds[0].pictures.altNotes, [])

    const [a, b] = placed.map((e) => e.frame)
    const withCopy = await startRun(pool, where, {
      copy: copyFile([
        { frame: a, text: 'Mechanic truing a bicycle wheel on the stand' },
        { frame: b, text: 'Two hikers on a snowy mountain ridge' }
      ])
    })
    await drainPicker(pool, { ...where, fetchImpl, looker: looker.answer })
    const second = await readRun(pool, withCopy.id)
    const notes = new Map(second.rounds[0].pictures.altNotes.map((n) => [n.frame, n]))
    assert.equal(notes.size, 2)
    assert.equal(second.rounds[0].pictures.altCheck.status, 'compared')
    assert.equal(notes.get(a).agrees, true)
    assert.deepEqual(notes.get(a).shared, ['mechanic', 'tru', 'bicycle', 'wheel', 'stand'])
    assert.equal(notes.get(a).seen, SEEN)
    assert.equal(notes.get(b).agrees, false)
    assert.match(notes.get(b).note, /rewrite the alt/)
  }
)

test('a copy file that is not site-copy/1 is refused at the start', opts, async () => {
  const { pool } = db
  const refused = await start(pool, {
    copy: { value: { version: 'site-plan/3' }, source: { kind: 'file', name: 'c.json' } }
  })
  assert.equal(refused.code, 'SITE_PICTURES_COPY_SHAPE')
})

test('a run does not start without a usable looker door, nor run when it changed', opts, async () => {
  const { pool } = db
  // Unset: refused at the start, nothing queued.
  const unset = await start(pool)
  assert.equal(unset.code, 'SITE_PICTURES_LOOKER_UNSET')
  assert.match(unset.reason, /"Picture looker" door has no provider and model/)
  // The picker's maker: refused.
  await assignPickerDoor(pool)
  await assignDoor(
    pool,
    'pictureLooker',
    { providerId: 'deepseek', model: 'deepseek-flash' },
    'owner@tracy.test'
  )
  const same = await start(pool, { plan: pickerPlan() })
  assert.equal(same.code, 'SITE_PICTURES_LOOKER_SAME_MAKER')
  // Started, then the door is cleared before a worker claims the run: the run fails and says why.
  const started = await startRun(pool, where)
  assert.equal((await readRun(pool, started.id)).status, 'queued')
  await clearDoor(pool, 'pictureLooker')
  await drainPicker(pool, { ...where, fetchImpl: async () => assert.fail('no call') })
  const run = await readRun(pool, started.id)
  assert.equal(run.status, 'failed')
  assert.match(run.error, /^SITE_PICTURES_LOOKER_UNSET/)
})

test(
  'an unreadable look is asked once more, and still unreadable fails the picture as "look unreadable"',
  opts,
  async () => {
    const { pool } = db
    const asked = new Map()
    const looker = fakeLooker((body) => {
      const key = body.messages[1].content[1].image_url.url
      const n = (asked.get(key) ?? 0) + 1
      asked.set(key, n)
      // The first picture never answers in form; every other one answers in form the second time.
      if ([...asked.keys()][0] === key) return { raw: 'I think it is fine.' }
      return n === 1 ? { raw: 'no json here' } : pass
    })
    const started = await startRun(pool, where)
    await drainPicker(pool, {
      ...where,
      fetchImpl: async () => assert.fail('no call'),
      looker: looker.answer
    })
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    const r0 = run.rounds[0]
    const looked = entries(r0.pictures).filter((e) => e.looker && e.source !== 'twin')
    assert.ok(looked.length >= 2)
    for (const n of asked.values()) assert.equal(n, 2, 'every picture asked exactly twice')
    const unreadable = looked.filter((e) => e.looker.faults.includes('look unreadable'))
    assert.equal(unreadable.length, 1)
    assert.equal(unreadable[0].looker.verdict, 'fail')
    assert.match(unreadable[0].looker.problem, /asked again/)
    assert.ok(looked.filter((e) => e !== unreadable[0]).every((e) => e.looker.verdict === 'pass'))
    const rule = r0.checkResult.rules.find((r) => r.id === 'L01')
    assert.equal(rule.status, 'fail')
    assert.match(rule.failures[0].detail, /could not look at the picture \(look unreadable\)/)
    // Both calls of every picture are counted on the run.
    assert.ok(Math.abs(run.costUsd - looker.calls.length * 0.0002) < 1e-9, `${run.costUsd}`)
    assert.equal(r0.pictures.looker.calls.length, looked.length)
  }
)

test(
  'the command line takes a writer copy file with --copy-file and stores its alts on the run',
  opts,
  async () => {
    const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const path = await import('node:path')
    const { runCli } = await import('../src/site-pictures/bench-cli.js')
    const { inputsOf } = await import('../src/site-pictures/bench-store.js')
    const cwd = mkdtempSync(path.join(tmpdir(), 'site-pictures-looker-cli-'))
    try {
      writeFileSync(path.join(cwd, 'plan.json'), JSON.stringify(plan()))
      writeFileSync(path.join(cwd, 'brief.json'), JSON.stringify(brief()))
      writeFileSync(
        path.join(cwd, 'copy.json'),
        JSON.stringify(copyFile([{ frame: 'block-2.0', text: 'A wheel' }]).value)
      )
      writeFileSync(path.join(cwd, 'plan-as-copy.json'), JSON.stringify(plan()))
      mkdirSync(path.join(cwd, 'photos'))
      for (const [name, bytes] of photoFolder().files) writeFileSync(path.join(cwd, 'photos', name), bytes)
      const cli = async (extra) => {
        const out = []
        const err = []
        const args = ['run', '--plan-file', 'plan.json', '--kit', KIT_REF, '--brief-file', 'brief.json']
        const code = await runCli([...args, '--photos', 'photos', ...extra], {
          pool: db.pool,
          secret: SECRET,
          cwd,
          storeDir: store.dir,
          index: kits.index,
          out: (l) => out.push(l),
          err: (l) => err.push(l)
        })
        return { code, out, err }
      }
      await assignLookerDoor(db.pool)
      const bad = await cli(['--copy-file', 'plan-as-copy.json'])
      assert.equal(bad.code, 1)
      assert.match(bad.err.join('\n'), /SITE_PICTURES_COPY_SHAPE/)
      const good = await cli(['--copy-file', 'copy.json'])
      assert.equal(good.code, 0, good.err.join('\n'))
      const { copy } = await inputsOf(db.pool, good.out[0])
      assert.deepEqual(copy.source, { kind: 'file', name: 'copy.json' })
      assert.deepEqual(copy.alts, [{ frame: 'block-2.0', text: 'A wheel' }])
      assert.match(copy.sha256, /^[0-9a-f]{64}$/)
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  }
)

test(
  'the picker and looker prompts open with the CMS line of the kit, WordPress or Joomla',
  opts,
  async () => {
    const { pool } = db
    for (const platform of ['wordpress', 'joomla']) {
      await db.reset()
      const own = kitIndex({ platform })
      try {
        const here = { index: own.index, dir: store.dir }
        await assignPickerDoor(pool)
        const started = await startPickerRun(pool, here)
        const picker = []
        const looker = fakeLooker(() => pass)
        const fetchImpl = async (url, init) => {
          picker.push(JSON.parse(init.body))
          const view = pickerView({ body: picker[0] })
          const [hero, feature, about] = ['block-2.0', 'block-6.1', 'block-5.1'].map(
            (f) => view.frames.get(f).photos
          )
          const picks = [
            { frame: 'block-2.0', photo: hero[0], reason: 'a' },
            { frame: 'block-6.1', photo: feature.find((c) => c !== hero[0]), reason: 'b' },
            { frame: 'block-5.1', photo: about[0], reason: 'c' }
          ]
          return json(reply({ picks }).body)
        }
        await drainPicker(pool, { ...here, fetchImpl, looker: looker.answer })
        const run = await readRun(pool, started.id)
        assert.equal(run.status, 'succeeded', run.error)
        assert.equal(picker[0].messages[0].content, withCmsLine(picturePrompts().text, platform))
        assert.ok(looker.calls.length > 0)
        for (const body of looker.calls)
          assert.equal(body.messages[0].content, withCmsLine(picturePrompts().looker, platform))
      } finally {
        own.done()
      }
    }
  }
)

test('a kit with no platform fails the picture run before any model call', opts, async () => {
  const { pool } = db
  const own = kitIndex({ platform: '' })
  try {
    const here = { index: own.index, dir: store.dir }
    await assignPickerDoor(pool)
    const started = await startPickerRun(pool, here)
    const calls = []
    const fetchImpl = async (url, init) => {
      calls.push(url)
      return json({})
    }
    await drainPicker(pool, { ...here, fetchImpl })
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'failed')
    assert.match(run.error, /SITE_PICTURES_KIT_PLATFORM/)
    assert.equal(calls.length, 0)
  } finally {
    own.done()
  }
})
