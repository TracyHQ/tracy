/**
 * "Apply" in the Add site popup, as the runner sees it: the words are made while the site installs, the
 * poll door's `gate` holds the customer on "working" only while there is something left to write, and
 * every failure is soft. The engines are doubles; what each CMS's engine writes is tested beside it.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import {
  createBriefBuilds,
  LOST_ON_RESTART,
  LOST_PART,
  LOST_PLACING,
  LOST_WORK,
  STAGE
} from '../src/sites/brief-build.js'
import { recordedDoor } from '../src/sites/brief-engines/shared.js'
import { briefOf } from '../src/sites/brief-store.js'
import { createSite, deleteSite } from '../src/sites/store.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

const input = (over = {}) => ({
  siteKey: 'bakery.tracy.test',
  accountId: null,
  email: 'owner@example.test',
  label: 'bakery',
  platform: 'wordpress',
  quickstart: 'tracy-business/wp7',
  brief: { about: 'A family bakery', goal: 'sell', style: 'friendly' },
  ...over
})

const quiet = { info() {}, warn() {} }
const instant = () => Promise.resolve()

/** An engine double that records what it was told and answers as scripted. */
function engine({ prepare, apply } = {}) {
  const calls = { prepare: [], apply: [] }
  return {
    calls,
    prepare: async (ctx) => {
      calls.prepare.push(ctx)
      return prepare ? prepare(ctx) : { values: 3 }
    },
    apply: async (ctx, prepared) => {
      calls.apply.push({ ctx, prepared })
      return apply ? apply(ctx, prepared) : { wrote: 3, kept: 1 }
    }
  }
}

function builds(pool, engines, extra = {}) {
  return createBriefBuilds({
    pool,
    engines,
    normalize: async ({ brief }) => ({ name: 'Bakery', languages: ['en'], about: brief.about }),
    log: quiet,
    sleep: instant,
    pollMs: 1,
    recoverOnStart: false,
    ...extra
  })
}

/** Poll `gate` the way the poll door does, until the customer is no longer held. */
async function untilSettled(b, siteKey, tries = 200) {
  for (let i = 0; i < tries; i += 1) {
    const g = await b.gate(siteKey)
    if (!g.open) return g
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  throw new Error('still held')
}

test('a site made with no brief has no row, and the gate never holds it', dbOpts, async () => {
  const { pool } = db
  const b = builds(pool, { wordpress: engine() })
  assert.deepEqual(await b.gate('plain.tracy.test'), { open: false, step: null })
  assert.equal(await briefOf(pool, 'plain.tracy.test'), null)
})

test(
  'the words are made first, written when the site is up, and the customer is held until then',
  dbOpts,
  async () => {
    const { pool } = db
    const e = engine()
    const b = builds(pool, { wordpress: e })
    assert.deepEqual(await b.start(input()), { started: true })
    // The site is not up yet: the engine is told to prepare, and nothing has been written.
    for (let i = 0; i < 200 && e.calls.prepare.length === 0; i += 1)
      await new Promise((r) => setTimeout(r, 2))
    assert.equal(e.calls.prepare.length, 1)
    assert.equal(e.calls.apply.length, 0, 'apply waits for the site')
    assert.equal(e.calls.prepare[0].normalized.name, 'Bakery', 'the engine is handed what normalize read')
    assert.equal(e.calls.prepare[0].quickstart, 'tracy-business/wp7')

    // The host finishes: the door says so, and is told to keep the customer on "working".
    const first = await b.gate('bakery.tracy.test')
    assert.equal(first.open, true)
    assert.ok([STAGE.writing, STAGE.placing].includes(first.step))
    const done = await untilSettled(b, 'bakery.tracy.test')
    assert.equal(done.state, 'applied')
    assert.equal(e.calls.apply.length, 1)
    assert.deepEqual(e.calls.apply[0].prepared, { values: 3 }, 'apply is given exactly what prepare made')

    const row = await briefOf(pool, 'bakery.tracy.test')
    assert.equal(row.state, 'applied')
    assert.equal(row.stage, null)
    assert.equal(row.timings.wrote, 3)
    assert.equal(typeof row.timings.prepareMs, 'number')
    assert.equal(typeof row.timings.applyMs, 'number')
    assert.ok(row.timings.provisionedAt > 0)
  }
)

test(
  'a poll after the handover only says "working", and is silent for a site that was never handed over',
  dbOpts,
  async () => {
    const { pool } = db
    let release
    const hold = new Promise((resolve) => {
      release = resolve
    })
    const e = engine({ apply: async () => (await hold, { wrote: 1, kept: 0 }) })
    const b = builds(pool, { wordpress: e })
    assert.equal(await b.waiting('plain.tracy.test'), null, 'no row: nothing to wait for')
    await b.start(input())
    // The site has not been handed over yet (the poll door has not run `gate`): the poll does the handover.
    assert.equal(await b.waiting('bakery.tracy.test'), null)
    // The handover ran and `gate` marked the site up; the engine is writing and the customer is held.
    assert.equal((await b.gate('bakery.tracy.test')).open, true)
    for (let i = 0; i < 200 && e.calls.apply.length === 0; i += 1) await new Promise((r) => setTimeout(r, 2))
    const waiting = await b.waiting('bakery.tracy.test')
    assert.ok(waiting && [STAGE.writing, STAGE.placing].includes(waiting.step), JSON.stringify(waiting))
    // #1403 item 7: while the words are placed, the step the console shows even before the host is done.
    assert.equal(await b.placing('bakery.tracy.test'), STAGE.placing)
    assert.equal(await b.placing('plain.tracy.test'), null, 'no row: nothing is being placed')
    release()
    await untilSettled(b, 'bakery.tracy.test')
    assert.equal(
      await b.waiting('bakery.tracy.test'),
      null,
      'the work is over: the poll finishes the handover as usual'
    )
    assert.equal(await b.placing('bakery.tracy.test'), null, 'settled: nothing is being placed')
  }
)

// 🔒 THE WORDS ARE WRITTEN DURING THE HOST'S LAST SECONDS, NOT AFTER THEM. The host's job says "building the site folder" once
// the CMS is up and only the site's folder on the host is left (Joomla spends ~17 s there); the content door answers from then on.
test(
  'a site whose host job reaches its last step is written without waiting for `done` or for the wizard',
  dbOpts,
  async () => {
    const { pool } = db
    const e = engine()
    const steps = ['fetching webroot', 'enabling the content reader', 'building the site folder']
    let look = 0
    const paired = []
    const b = builds(
      pool,
      { wordpress: e },
      {
        jobPollMs: 1,
        hostJob: async () => ({ state: 'running', step: steps[Math.min(look++, steps.length - 1)] }),
        pairSite: async (siteKey, email) => void paired.push([siteKey, email])
      }
    )
    await b.start(input({ jobId: 'job-1', host: 'local' }))
    // No poll door at all: nobody calls `gate`.
    for (let i = 0; i < 300 && e.calls.apply.length === 0; i += 1) await new Promise((r) => setTimeout(r, 4))
    assert.equal(e.calls.apply.length, 1, 'apply ran before the host said done')
    assert.deepEqual(
      paired,
      [['bakery.tracy.test', 'owner@example.test']],
      'the content door was connected first, once'
    )
    assert.ok(look >= 3, 'the host was asked until it reached that step')
    await b.idle()
    const row = await briefOf(pool, 'bakery.tracy.test')
    assert.equal(row.state, 'applied')
    assert.equal(typeof row.timings.readyAt, 'number')
    assert.equal(
      row.timings.provisionedAt,
      undefined,
      'the wizard has not handed the site over: that stays its own mark'
    )
    // The wizard arrives later: the row is closed, the poll door finishes as usual.
    assert.deepEqual(await b.gate('bakery.tracy.test'), {
      open: false,
      step: null,
      state: 'applied',
      error: null
    })
  }
)

test(
  'a host job that is already done starts the work too, and one that failed stops it',
  dbOpts,
  async () => {
    const { pool } = db
    const done = engine()
    const b = builds(
      pool,
      { wordpress: done },
      { jobPollMs: 1, hostJob: async () => ({ state: 'done', step: 'ready' }), pairSite: async () => {} }
    )
    await b.start(input({ jobId: 'job-1', host: 'local' }))
    await b.idle()
    assert.equal(done.calls.apply.length, 1)

    const failed = engine()
    const c = builds(
      pool,
      { wordpress: failed },
      { jobPollMs: 1, hostJob: async () => ({ state: 'failed', step: 'x' }), pairSite: async () => {} }
    )
    await c.start(input({ siteKey: 'other.tracy.test', label: 'other', jobId: 'job-2', host: 'local' }))
    await c.idle()
    assert.equal(failed.calls.apply.length, 0, 'a failed install has nowhere to write')
    assert.equal((await briefOf(pool, 'other.tracy.test')).state, 'failed')
  }
)

test(
  'a site that cannot be paired early waits for the wizard’s handover, and a host that cannot say changes nothing',
  dbOpts,
  async () => {
    const { pool } = db
    const e = engine()
    let tried = 0
    const b = builds(
      pool,
      { wordpress: e },
      {
        jobPollMs: 1,
        hostJob: async () => ({ state: 'running', step: 'building the site folder' }),
        pairSite: async () => {
          tried += 1
          throw new Error('component not answering yet')
        }
      }
    )
    await b.start(input({ jobId: 'job-1', host: 'local' }))
    for (let i = 0; i < 100 && tried < 2; i += 1) await new Promise((r) => setTimeout(r, 4))
    assert.ok(tried >= 2, 'it tried again, and did not start')
    assert.equal(e.calls.apply.length, 0)
    // The poll door says done: that signal still starts the work, exactly as before.
    assert.equal((await b.gate('bakery.tracy.test')).open, true)
    await untilSettled(b, 'bakery.tracy.test')
    assert.equal(e.calls.apply.length, 1)

    // A host job that answers nothing, or throws: no early start, and no failure either.
    const quiet = engine()
    const c = builds(
      pool,
      { wordpress: quiet },
      {
        jobPollMs: 1,
        hostJob: async () => {
          throw new Error('host down')
        },
        pairSite: async () => {}
      }
    )
    await c.start(input({ siteKey: 'quiet.tracy.test', label: 'quiet', jobId: 'job-3', host: 'local' }))
    await new Promise((r) => setTimeout(r, 40))
    assert.equal(quiet.calls.apply.length, 0)
    assert.equal((await c.gate('quiet.tracy.test')).open, true)
    await untilSettled(c, 'quiet.tracy.test')
    assert.equal(quiet.calls.apply.length, 1)
  }
)

test('the same site started twice is one piece of work', dbOpts, async () => {
  const { pool } = db
  const e = engine()
  const b = builds(pool, { wordpress: e })
  assert.deepEqual(await b.start(input()), { started: true })
  assert.deepEqual(await b.start(input()), { started: false })
  await untilSettled(b, 'bakery.tracy.test')
  assert.equal(e.calls.prepare.length, 1)
})

// Measured 12/10/2026 on a local stand (Site questions check): a customer deleted a site and made one again under
// the same address with new answers; the new site kept the template's words, and the poll still said `applied`
// with the deleted site's notes, because the deleted site's row answered for the new one.
test(
  "a site deleted and made again under the same address is written from its own answers, not the deleted site's",
  dbOpts,
  async () => {
    const { pool } = db
    const e = engine()
    const b = builds(pool, { wordpress: e })
    const key = 'bakery.tracy.test'
    await createSite(pool, { siteKey: key, label: 'bakery', host: 'h1', platform: 'wordpress' })
    assert.deepEqual(await b.start(input({ brief: { about: 'Repro One' } })), { started: true })
    assert.equal((await untilSettled(b, key)).state, 'applied')

    await deleteSite(pool, key)
    await createSite(pool, { siteKey: key, label: 'bakery', host: 'h1', platform: 'wordpress' })
    assert.deepEqual(await b.start(input({ brief: { about: 'Repro Two' } })), { started: true })
    assert.equal((await untilSettled(b, key)).state, 'applied')
    assert.equal(e.calls.prepare.length, 2)
    assert.equal(e.calls.prepare[1].normalized.about, 'Repro Two')
    assert.equal((await briefOf(pool, key)).brief.about, 'Repro Two')
  }
)

test(
  "a site made again with no brief under a deleted site's address answers no brief at all",
  dbOpts,
  async () => {
    const { pool } = db
    const b = builds(pool, { wordpress: engine() })
    const key = 'bakery.tracy.test'
    await createSite(pool, { siteKey: key, label: 'bakery', host: 'h1', platform: 'wordpress' })
    await b.start(input())
    await untilSettled(b, key)

    await deleteSite(pool, key)
    await createSite(pool, { siteKey: key, label: 'bakery', host: 'h1', platform: 'wordpress' })
    assert.deepEqual(await b.gate(key), { open: false, step: null })
    assert.equal(await briefOf(pool, key), null)
  }
)

test(
  "a model that fails hands the site over with the template's own words, and says so",
  dbOpts,
  async () => {
    const { pool } = db
    const e = engine({
      prepare: () => {
        throw new Error('the model answered 503')
      }
    })
    const b = builds(pool, { wordpress: e })
    await b.start(input())
    const settled = await untilSettled(b, 'bakery.tracy.test')
    assert.equal(settled.state, 'failed')
    const row = await briefOf(pool, 'bakery.tracy.test')
    assert.equal(row.state, 'failed')
    assert.match(row.error, /503/)
    assert.equal(e.calls.apply.length, 0, 'nothing is written after a failed prepare')
  }
)

test('a write the site refuses is a soft failure too', dbOpts, async () => {
  const { pool } = db
  const e = engine({
    apply: () => {
      throw new Error('the site refused the write')
    }
  })
  const b = builds(pool, { wordpress: e })
  await b.start(input())
  const settled = await untilSettled(b, 'bakery.tracy.test')
  assert.equal(settled.state, 'failed')
  assert.match((await briefOf(pool, 'bakery.tracy.test')).error, /refused/)
})

// 🔒 A FAILED APPLY IS NOT A PLAIN FINISH (TCH #1013, measured 08/10/2026 on tamq-7q-tbwp3/4): the site's plugin did not
// carry its contract, Apply threw, only the brand landed, and the poll door answered a plain `done`. The settled gate
// carries the row's reason so the door can say it.
test('a failed Apply hands its reason to the gate that settles it', dbOpts, async () => {
  const { pool } = db
  const e = engine({
    apply: () => {
      throw new Error('the site is not bound to its content contract yet')
    }
  })
  const b = builds(pool, { wordpress: e })
  await b.start(input())
  const settled = await untilSettled(b, 'bakery.tracy.test')
  assert.equal(settled.state, 'failed')
  assert.match(String(settled.error), /not bound to its content contract/)
})

test(
  'an Apply that wrote nothing it had nothing to write from says so on the finished row and to the gate',
  dbOpts,
  async () => {
    const { pool } = db
    const b = builds(pool, { wordpress: engine({ apply: () => ({ wrote: 0, kept: 0 }) }) })
    await b.start(input({ brief: { about: '', goal: null, style: null } }))
    const settled = await untilSettled(b, 'bakery.tracy.test')
    const row = await briefOf(pool, 'bakery.tracy.test')
    assert.equal(row.state, 'applied')
    assert.match(String(row.error), /none of your text was written/i)
    assert.equal(settled.error, row.error)
  }
)

// TCH #1367 (production site jurgens, 13/10/2026): the text model refused every call, nothing of the description reached the
// site, and the row said `applied`. A description given and not one line written is a failure, said with the reason.
test(
  'an Apply that wrote nothing of a description it was given fails, with what happened',
  dbOpts,
  async () => {
    const { pool } = db
    const b = builds(pool, {
      wordpress: engine({
        prepare: (ctx) => {
          ctx.note('the text model did not answer, so the template keeps its own words')
          return {}
        },
        apply: () => ({ wrote: 0, kept: 12 })
      })
    })
    await b.start(input())
    const settled = await untilSettled(b, 'bakery.tracy.test')
    const row = await briefOf(pool, 'bakery.tracy.test')
    assert.equal(row.state, 'failed')
    assert.match(String(row.error), /none of your text was written/i)
    assert.match(String(row.error), /the text model did not answer/)
    assert.equal(settled.state, 'failed')
    assert.equal(row.timings.wrote, 0)
  }
)

// TCH #1367 (local stand, Tracy Business Joomla, 15/10/2026): the apply was cut at its deadline and the row said `failed`, yet
// the engine went on writing. The deadline fires the apply's own signal, and the door refuses every write after it.
test('an apply cut at its deadline writes nothing after it', dbOpts, async () => {
  const { pool } = db
  /** @type {string[]} */
  const wrote = []
  let late = null
  const b = builds(
    pool,
    {
      wordpress: engine({
        apply: async (ctx) => {
          const door = recordedDoor(ctx, async (call) => {
            wrote.push(call.params.apply_id)
            return { ok: true }
          })
          await door({ siteKey: ctx.siteKey, action: 'content.contract', params: { apply_id: 'first' } })
          await new Promise((resolve) => setTimeout(resolve, 120))
          late = door({ siteKey: ctx.siteKey, action: 'content.contract', params: { apply_id: 'late' } })
          await late.catch(() => {})
          return { wrote: 1, kept: 0 }
        }
      })
    },
    { limits: { applyMs: 40 } }
  )
  await b.start(input())
  const settled = await untilSettled(b, 'bakery.tracy.test')
  assert.equal(settled.state, 'failed')
  assert.match(String(settled.error), /took too long/)
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert.deepEqual(wrote, ['first'], 'nothing is written once the row says the apply stopped')
  // The late write can observe the completed run's abort after the deadline settled it.
  await assert.rejects(late, /took too long|the run is over/)
})

test('a finished Apply that wrote and said nothing carries no reason', dbOpts, async () => {
  const { pool } = db
  const b = builds(pool, { wordpress: engine() })
  await b.start(input())
  const settled = await untilSettled(b, 'bakery.tracy.test')
  assert.equal(settled.state, 'applied')
  assert.equal(settled.error, null)
})

test('notes an engine leaves ride on the finished row', dbOpts, async () => {
  const { pool } = db
  const b = builds(pool, {
    wordpress: engine({
      prepare: (ctx) => {
        ctx.note('2 of 9 pictures could not be drawn')
        return {}
      }
    })
  })
  await b.start(input())
  await untilSettled(b, 'bakery.tracy.test')
  const row = await briefOf(pool, 'bakery.tracy.test')
  assert.equal(row.state, 'applied')
  assert.match(row.error, /2 of 9 pictures/)
})

// 🔒 EVERY APPLY ID THE ENGINES WRITE UNDER IS KEPT ON THE ROW (ledger L08): one Apply writes under several (the contract's,
// the cleanup's, the tidy-up's, the languages', each picture's), and "undo the Apply" has to revert all of them.
test(
  'every apply id the writes named is kept on the row, in order, once each, a failed run included',
  dbOpts,
  async () => {
    const { pool } = db
    const b = builds(pool, {
      wordpress: engine({
        apply: async (ctx) => {
          ctx.applied('contract-a1')
          ctx.applied('residue-b2')
          ctx.applied('contract-a1')
          ctx.applied('media-brief-c3')
          return { wrote: 2, kept: 0 }
        }
      })
    })
    await b.start(kayaks())
    await settledWithin(b, 'kayaks.tracy.test', 2_000)
    const row = await briefOf(pool, 'kayaks.tracy.test')
    assert.equal(row.state, 'applied')
    assert.deepEqual(row.timings.applyIds, ['contract-a1', 'residue-b2', 'media-brief-c3'])
    assert.equal(typeof row.timings.applyMs, 'number', 'the timings are still there')

    const c = builds(pool, {
      wordpress: engine({
        apply: async (ctx) => {
          ctx.applied('contract-d4')
          throw new Error('the site would not take the cleanup')
        }
      })
    })
    await c.start(input({ siteKey: 'canoes.tracy.test', label: 'canoes' }))
    await settledWithin(c, 'canoes.tracy.test', 2_000)
    const failed = await briefOf(pool, 'canoes.tracy.test')
    assert.equal(failed.state, 'failed')
    assert.deepEqual(
      failed.timings.applyIds,
      ['contract-d4'],
      'what was written before the failure can be undone too'
    )
  }
)

// 🔒 THE BRAND STEP (plan D2): after `apply`, still `applying`, under its own apply id kept with the others; it runs when
// `apply` threw too, and its own failure is a note, never a failed build.
test(
  'the brand step runs after apply, before the row says applied, and its apply id is kept',
  dbOpts,
  async () => {
    const { pool } = db
    const seen = []
    const b = builds(
      pool,
      {
        wordpress: engine({
          apply: async (ctx) => {
            ctx.applied('contract-a1')
            return { wrote: 1, kept: 0 }
          }
        })
      },
      {
        brand: async (ctx, { applyId }) => {
          seen.push({ state: (await briefOf(pool, ctx.siteKey)).state, applyId, name: ctx.normalized.name })
          ctx.applied(applyId)
          ctx.note('logo: this design does not show a logo yet')
          return {
            written: ['site_logo'],
            skipped: [{ where: 'logo', reason: 'this design does not show a logo yet' }]
          }
        }
      }
    )
    await b.start(input())
    await untilSettled(b, 'bakery.tracy.test')
    const row = await briefOf(pool, 'bakery.tracy.test')
    assert.equal(row.state, 'applied')
    assert.equal(seen.length, 1)
    assert.equal(seen[0].state, 'applying')
    assert.equal(seen[0].name, 'Bakery')
    assert.match(seen[0].applyId, /^brand-\d+$/)
    assert.deepEqual(row.timings.applyIds, ['contract-a1', seen[0].applyId])
    assert.match(row.error, /does not show a logo yet/)
    assert.equal(typeof row.timings.brandMs, 'number')
  }
)

test('the brand step runs when apply threw, and a brand failure never fails the build', dbOpts, async () => {
  const { pool } = db
  let branded = 0
  const failing = builds(
    pool,
    {
      wordpress: engine({
        apply: () => {
          throw new Error('the site refused the words')
        }
      })
    },
    {
      brand: async () => {
        branded += 1
        return { written: [], skipped: [] }
      }
    }
  )
  await failing.start(input())
  await untilSettled(failing, 'bakery.tracy.test')
  assert.equal(branded, 1)
  assert.equal((await briefOf(pool, 'bakery.tracy.test')).state, 'failed')

  const broken = builds(
    pool,
    { wordpress: engine() },
    {
      brand: async () => {
        throw new Error('the store is down')
      }
    }
  )
  await broken.start(input({ siteKey: 'canoes.tracy.test', label: 'canoes' }))
  await untilSettled(broken, 'canoes.tracy.test')
  const row = await briefOf(pool, 'canoes.tracy.test')
  assert.equal(row.state, 'applied')
  assert.match(row.error, /could not be set: the store is down/)
})

test('a platform with no engine fails softly at once', dbOpts, async () => {
  const { pool } = db
  const b = builds(pool, {})
  await b.start(input({ platform: 'joomla' }))
  const settled = await untilSettled(b, 'bakery.tracy.test')
  assert.equal(settled.state, 'failed')
  assert.match((await briefOf(pool, 'bakery.tracy.test')).error, /no engine/)
})

test('a prepare that never ends is given up on, and the site is handed over', dbOpts, async () => {
  const { pool } = db
  const b = builds(
    pool,
    { wordpress: engine({ prepare: () => new Promise(() => {}) }) },
    { limits: { prepareMs: 20, prepareGraceMs: 20 } }
  )
  await b.start(input())
  const settled = await untilSettled(b, 'bakery.tracy.test')
  assert.equal(settled.state, 'failed')
  assert.match((await briefOf(pool, 'bakery.tracy.test')).error, /too long/)
})

// 🔒 ONCE THE SITE IS UP, THE WORDS GET THE GRACE FROM THEN, NOT FROM THE PRESS (ledger L07). The doc promises "+90 s after
// the site is up"; the deadline used to be fixed from the press (5 min + 90 s), so a site up in a minute could wait five more.
const kayaks = () =>
  input({
    siteKey: 'kayaks.tracy.test',
    label: 'kayaks',
    brief: { about: 'Kayak rentals on the river', goal: 'book', style: 'friendly' }
  })
/** Poll the way the wizard does until the row is no longer held, for at most `ms`. */
async function settledWithin(b, siteKey, ms) {
  const until = Date.now() + ms
  while (Date.now() < until) {
    const g = await b.gate(siteKey)
    if (!g.open) return g
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return { open: true, step: null, state: 'still held' }
}

test(
  'once the site is up, prepare is told to hand back what it has after the grace, and apply takes it',
  dbOpts,
  async () => {
    const { pool } = db
    let stopped = 0
    /** Whether the signal `apply` was given had fired when it ran. */
    let abortedAtApply = null
    const e = engine({
      apply: (ctx) => ((abortedAtApply = ctx.signal.aborted), { wrote: 1, kept: 0 }),
      // A prepare that honours its signal: told to stop, it hands back what is ready.
      prepare: (ctx) =>
        new Promise((resolve) => {
          ctx.signal.addEventListener(
            'abort',
            () => {
              stopped += 1
              resolve({ partial: true })
            },
            { once: true }
          )
        })
    })
    const b = builds(
      pool,
      { wordpress: e },
      { limits: { prepareMs: 4_000, prepareGraceMs: 60, prepareStopMs: 2_000 } }
    )
    const pressed = Date.now()
    await b.start(kayaks())
    assert.equal((await b.gate('kayaks.tracy.test')).open, true, 'the site is up at once')
    const settled = await settledWithin(b, 'kayaks.tracy.test', 1_500)
    assert.equal(settled.state, 'applied', 'written well before the deadline counted from the press')
    assert.ok(Date.now() - pressed < 1_500)
    assert.equal(stopped, 1)
    assert.deepEqual(e.calls.apply[0].prepared, { partial: true }, 'apply takes what was ready')
    const row = await briefOf(pool, 'kayaks.tracy.test')
    assert.ok(row.timings.wordsAfterUpMs >= 50, JSON.stringify(row.timings))
    assert.equal(
      abortedAtApply,
      false,
      'apply runs on the run’s own signal, not the one prepare was stopped with'
    )
  }
)

test(
  'a prepare that will not hand anything back is given up on soon after the site is up, and the site is handed over',
  dbOpts,
  async () => {
    const { pool } = db
    const b = builds(
      pool,
      { wordpress: engine({ prepare: () => new Promise(() => {}) }) },
      { limits: { prepareMs: 4_000, prepareGraceMs: 40, prepareStopMs: 40 } }
    )
    const pressed = Date.now()
    await b.start(kayaks())
    await b.gate('kayaks.tracy.test')
    const settled = await settledWithin(b, 'kayaks.tracy.test', 1_500)
    assert.equal(settled.state, 'failed')
    assert.ok(Date.now() - pressed < 1_500, 'not at the deadline counted from the press')
    assert.match((await briefOf(pool, 'kayaks.tracy.test')).error, /too long/)
  }
)

test(
  'an apply id this Apply did not mint (the install’s own receipt) is kept apart, so undo reverts only its own',
  dbOpts,
  async () => {
    const { pool } = db
    const b = builds(pool, {
      wordpress: engine({
        apply: async (ctx) => {
          ctx.applied('dtrim-seed', { reused: true })
          ctx.applied('contract-a1')
          ctx.applied('mlang-install-1', { reused: true })
          ctx.applied('residue-b2')
          return { wrote: 2, kept: 0 }
        }
      })
    })
    await b.start(kayaks())
    await b.gate('kayaks.tracy.test')
    await b.idle()
    const row = await briefOf(pool, 'kayaks.tracy.test')
    assert.equal(row.state, 'applied')
    assert.deepEqual(row.timings.applyIds, ['contract-a1', 'residue-b2'])
    assert.deepEqual(row.timings.reusedApplyIds, ['dtrim-seed', 'mlang-install-1'])
  }
)

// 🔒 A RUN THAT IS OVER WRITES NOTHING MORE ONTO THE ROW (review of L08): pressed again after a failure, the row belongs to the
// new run, and an engine of the old one still writing in the background must not put its apply ids on it.
test(
  'a run that is over is stopped, and an id its engine names late never lands on the row of the run that replaced it',
  dbOpts,
  async () => {
    const { pool } = db
    let late = () => {}
    const old = engine({
      apply: (ctx) => {
        ctx.applied('contract-old')
        late = () => ctx.applied('residue-late')
        return new Promise(() => {})
      }
    })
    const b = builds(pool, { wordpress: old }, { limits: { applyMs: 50 } })
    await b.start(kayaks())
    await b.gate('kayaks.tracy.test')
    await b.idle()
    const first = await briefOf(pool, 'kayaks.tracy.test')
    assert.equal(first.state, 'failed')
    assert.deepEqual(first.timings.applyIds, ['contract-old'])

    const fresh = engine({ apply: async (ctx) => (ctx.applied('contract-new'), { wrote: 1, kept: 0 }) })
    const c = builds(pool, { wordpress: fresh })
    assert.deepEqual(await c.start(kayaks()), { started: true }, 'pressed again')
    await c.gate('kayaks.tracy.test')
    await c.idle()
    late()
    await new Promise((resolve) => setTimeout(resolve, 60))
    const row = await briefOf(pool, 'kayaks.tracy.test')
    assert.equal(row.state, 'applied')
    assert.deepEqual(row.timings.applyIds, ['contract-new'], 'the old run’s late id is not this run’s')
    assert.equal(old.calls.apply[0].ctx.signal.aborted, true, 'the old run’s signal fired when it was over')
    assert.equal(old.calls.prepare[0].signal.aborted, true, 'so did the one its prepare was given')
  }
)

test('a host that could not install the site abandons the words', dbOpts, async () => {
  const { pool } = db
  const e = engine({ prepare: () => new Promise((resolve) => setTimeout(() => resolve({}), 30)) })
  const b = builds(pool, { wordpress: e })
  await b.start(input())
  await b.abandon('bakery.tracy.test', 'the build failed')
  await b.idle()
  const row = await briefOf(pool, 'bakery.tracy.test')
  assert.equal(row.state, 'failed')
  assert.equal(e.calls.apply.length, 0)
})

test('a build whose install failed and was pressed again has its words made again', dbOpts, async () => {
  const { pool } = db
  const e = engine()
  const b = builds(pool, { wordpress: e })
  assert.deepEqual(await b.start(input()), { started: true })
  await b.abandon('bakery.tracy.test', 'the build failed')
  await b.idle()
  assert.equal((await briefOf(pool, 'bakery.tracy.test')).state, 'failed')
  // The retry: the same address, a new install, and the same press.
  assert.deepEqual(await b.start(input()), { started: true })
  const settled = await untilSettled(b, 'bakery.tracy.test')
  assert.equal(settled.state, 'applied')
  assert.ok(e.calls.prepare.length >= 1, 'the second attempt made its words')
  assert.equal(e.calls.apply.length, 1, 'only the second attempt had a site to write into')
  assert.equal((await briefOf(pool, 'bakery.tracy.test')).error, null)
})

test('WO fill Retry queues once per action, atomically, even if the new fill fails', dbOpts, async () => {
  const { pool } = db
  await pool.query(
    `insert into site_brief(site_key,platform,brief,state)
     values ('bakery.tracy.test','wordpress','{}','failed')`
  )
  const e = engine({
    prepare: async () => {
      throw new Error('source unavailable')
    }
  })
  const a = builds(pool, { wordpress: e })
  const b = builds(pool, { wordpress: e })
  const attempt = input({ retryActionId: 'retry-action-one' })
  const results = await Promise.all([a.start(attempt), b.start(attempt)])
  assert.equal(results.filter((r) => r.started).length, 1)
  await Promise.all([a.idle(), b.idle()])
  const row = await briefOf(pool, attempt.siteKey)
  assert.equal(row.state, 'failed')
  assert.equal(row.timings.woRetryActionId, attempt.retryActionId)
  assert.deepEqual(await a.start(attempt), { started: false })
  assert.equal(e.calls.prepare.length, 1)
  assert.equal(e.calls.prepare[0].retryActionId, 'retry-action-one')
  assert.deepEqual(await a.start(input({ retryActionId: 'retry-action-two' })), { started: true })
  await a.idle()
  assert.equal(e.calls.prepare.length, 2)
  assert.equal((await briefOf(pool, attempt.siteKey)).timings.woRetryActionId, 'retry-action-two')
  assert.deepEqual(await a.start(input()), { started: true }, 'ordinary retries keep their existing behavior')
  await a.idle()
  assert.equal(e.calls.prepare.length, 3)
})

test('WO fill Retry never inserts a missing brief or restarts a replaced site’s brief', dbOpts, async () => {
  const { pool } = db
  const e = engine()
  const b = builds(pool, { wordpress: e })
  assert.deepEqual(await b.start(input({ retryActionId: 'retry-missing' })), { started: false })
  assert.equal((await pool.query('select * from site_brief')).rowCount, 0)
  await pool.query(
    `insert into site_brief(site_key,platform,brief,state,created_at)
     values ('bakery.tracy.test','wordpress','{}','failed',now()-interval '1 minute')`
  )
  await createSite(pool, { siteKey: 'bakery.tracy.test', label: 'bakery', host: 'h1', platform: 'wordpress' })
  assert.deepEqual(await b.start(input({ retryActionId: 'retry-replaced' })), { started: false })
  const old = (await pool.query('select state,timings from site_brief')).rows[0]
  assert.deepEqual(old, { state: 'failed', timings: {} })
  assert.equal(e.calls.prepare.length, 0)
})

test('an open row whose worker died with the process is not held for ever', dbOpts, async () => {
  const { pool } = db
  // A row written by a process that is gone: nobody in THIS process is running it.
  await pool.query(
    `insert into site_brief (site_key, platform, brief, state, updated_at)
     values ('orphan.tracy.test', 'wordpress', '{"about":"x"}'::jsonb, 'preparing', now() - interval '10 minutes')`
  )
  const b = builds(pool, { wordpress: engine() })
  const g = await b.gate('orphan.tracy.test')
  assert.deepEqual(g, { open: false, step: null, state: 'failed', error: LOST_WORK })
  assert.equal((await briefOf(pool, 'orphan.tracy.test')).error, LOST_WORK)
})

/**
 * TCH #887 (dev, e2e-jo.tracy.site, 04/10/2026): a deploy replaced tracy-web while the words were being PLACED. The worker had
 * already written the name, the hero and the services (and kept their apply ids on the row), yet the next process told the
 * customer "the site has the template's own words" — and a `failed` row is one a second press would write over.
 */
test(
  'a worker that died while placing words that reached the site says they are partly in, not that none are',
  dbOpts,
  async () => {
    const { pool } = db
    await pool.query(
      `insert into site_brief (site_key, platform, brief, state, stage, timings, updated_at)
     values ('placing.tracy.test', 'joomla', '{"about":"x"}'::jsonb, 'applying', $1,
             '{"provisionedAt": 1, "applyIds": ["brief-a", "brief-b"]}'::jsonb, now() - interval '10 minutes')`,
      [STAGE.placing]
    )
    const e = engine()
    const b = builds(pool, { joomla: e })
    const g = await b.gate('placing.tracy.test')
    assert.equal(g.open, false)
    assert.equal(g.state, 'applied', 'some of the words are in: the row does not say the build failed')
    assert.equal(g.error, LOST_PART)
    const row = await briefOf(pool, 'placing.tracy.test')
    assert.equal(row.state, 'applied')
    assert.deepEqual(row.timings.applyIds, ['brief-a', 'brief-b'], 'what was written can still be undone')
    // Pressed again (a reload, a retry of the same build): the words that are in are not written over.
    assert.deepEqual(await b.start(input({ siteKey: 'placing.tracy.test', platform: 'joomla' })), {
      started: false
    })
    await b.idle()
    assert.equal(e.calls.prepare.length + e.calls.apply.length, 0)
    assert.deepEqual((await briefOf(pool, 'placing.tracy.test')).timings.applyIds, ['brief-a', 'brief-b'])
  }
)

test(
  'a worker that died as placing began, before any write was kept, does not claim the site is untouched',
  dbOpts,
  async () => {
    const { pool } = db
    await pool.query(
      `insert into site_brief (site_key, platform, brief, state, stage, updated_at)
     values ('began.tracy.test', 'wordpress', '{"about":"x"}'::jsonb, 'applying', $1, now() - interval '10 minutes')`,
      [STAGE.placing]
    )
    const b = builds(pool, { wordpress: engine() })
    const g = await b.gate('began.tracy.test')
    assert.deepEqual(g, { open: false, step: null, state: 'failed', error: LOST_PLACING })
    assert.equal((await briefOf(pool, 'began.tracy.test')).timings.lostFrom, 'applying')
    assert.deepEqual(
      await b.start({ siteKey: 'began.tracy.test', platform: 'wordpress', brief: { about: 'Retry' } }),
      { started: false }
    )
    assert.equal((await briefOf(pool, 'began.tracy.test')).error, LOST_PLACING)
  }
)

// Review of #1181 (BR-1): a write that reused an apply id (a design trim's `dtrim-seed`) landed in the site as surely as
// one that minted its own; the row keeps it under `reusedApplyIds`, and that is evidence of writing too.
test(
  'a worker that died after a write that reused an apply id says the words are partly in',
  dbOpts,
  async () => {
    const { pool } = db
    await pool.query(
      `insert into site_brief (site_key, platform, brief, state, stage, timings, updated_at)
     values ('reused.tracy.test', 'emdash', '{"about":"x"}'::jsonb, 'applying', $1,
             '{"provisionedAt": 1, "reusedApplyIds": ["dtrim-seed"]}'::jsonb, now() - interval '10 minutes')`,
      [STAGE.placing]
    )
    const b = builds(pool, { emdash: engine() })
    const g = await b.gate('reused.tracy.test')
    assert.equal(g.state, 'applied', 'a reused apply id is a write that reached the site')
    assert.equal(g.error, LOST_PART)
    assert.deepEqual((await briefOf(pool, 'reused.tracy.test')).timings.reusedApplyIds, ['dtrim-seed'])
  }
)

test('a recent open row of another process is held, not taken over', dbOpts, async () => {
  const { pool } = db
  await pool.query(
    `insert into site_brief (site_key, platform, brief, state)
     values ('other.tracy.test', 'wordpress', '{"about":"x"}'::jsonb, 'preparing')`
  )
  const b = builds(pool, { wordpress: engine() })
  const g = await b.gate('other.tracy.test')
  assert.equal(g.open, true)
  assert.equal(g.step, STAGE.writing)
})

// SC-3 (dev 11/10/2026): the run's writes leave files on the webroot (pictures, a language pack), and
// nothing committed them, so the first look at Site changes sealed them as "source unknown". The run
// now holds the webroot like a chat turn: opened before its first write, its moment taken once it is done.
test(
  'a setup run holds the webroot: opened before its first write, its moment taken after the brand, once',
  dbOpts,
  async () => {
    const { pool } = db
    const order = []
    const e = engine({ apply: async () => (order.push('apply'), { wrote: 3, kept: 0 }) })
    const webroot = {
      open: async (ctx) => {
        order.push(`open:${ctx.runId}`)
      },
      close: async (ctx) => {
        order.push(`close:${ctx.runId}`)
      }
    }
    const b = builds(pool, { wordpress: e }, { webroot, brand: async () => (order.push('brand'), {}) })
    await b.start(input())
    const done = await untilSettled(b, 'bakery.tracy.test')
    assert.equal(done.state, 'applied')
    const run = e.calls.apply[0].ctx.runId
    assert.deepEqual(order, [`open:${run}`, 'apply', 'brand', `close:${run}`])
  }
)

test(
  'a failed apply still takes the moment: what landed is the run’s, not "source unknown"',
  dbOpts,
  async () => {
    const { pool } = db
    const order = []
    const e = engine({
      apply: async () => {
        order.push('apply')
        throw new Error('the site refused a write')
      }
    })
    const webroot = {
      open: async () => order.push('open'),
      close: async () => order.push('close')
    }
    const b = builds(pool, { wordpress: e }, { webroot })
    await b.start(input())
    const done = await untilSettled(b, 'bakery.tracy.test')
    assert.equal(done.state, 'failed')
    assert.deepEqual(order, ['open', 'apply', 'close'])
  }
)

test('a webroot that cannot be held is no reason to fail the site', dbOpts, async () => {
  const { pool } = db
  const e = engine()
  const webroot = {
    open: async () => {
      throw new Error('host down')
    },
    close: async () => {
      throw new Error('host down')
    }
  }
  const b = builds(pool, { wordpress: e }, { webroot })
  await b.start(input())
  const done = await untilSettled(b, 'bakery.tracy.test')
  assert.equal(done.state, 'applied')
  assert.equal(e.calls.apply.length, 1)
})

// Run 1–3 on wo2 (L3, 19/10/2026): tracy-web restarted while a site's words were being made; the row sat `preparing` for the
// 4 minutes of `staleMs`, and the demo's hand-off answered 409 all that time. A process that starts settles the rows a dead
// one left at once, without waiting for a poll to find them.
test('a process that starts settles at once the open rows a dead process left', dbOpts, async () => {
  const { pool } = db
  await pool.query(
    `insert into site_brief (site_key, platform, brief, state, stage, timings, updated_at) values
       ('dead-prep.tracy.test', 'wordpress', '{"about":"x"}'::jsonb, 'preparing', null, '{}'::jsonb, now() - interval '1 minute'),
       ('dead-apply.tracy.test', 'joomla', '{"about":"x"}'::jsonb, 'applying', $1, '{"applyIds": ["brief-a"]}'::jsonb,
        now() - interval '1 minute'),
       ('done.tracy.test', 'wordpress', '{"about":"x"}'::jsonb, 'applied', null, '{}'::jsonb, now() - interval '1 minute')`,
    [STAGE.placing]
  )
  const b = builds(pool, { wordpress: engine(), joomla: engine() }, { recoverOnStart: true })
  await b.recovered
  const prep = await briefOf(pool, 'dead-prep.tracy.test')
  assert.equal(prep.state, 'failed')
  assert.equal(prep.error, LOST_WORK)
  assert.equal(prep.timings.lost, LOST_ON_RESTART)
  const apply = await briefOf(pool, 'dead-apply.tracy.test')
  assert.equal(apply.state, 'applied', 'words that reached the site are not called failed')
  assert.equal(apply.error, LOST_PART)
  assert.equal((await briefOf(pool, 'done.tracy.test')).state, 'applied', 'a settled row is left alone')
})

test(
  'a row too fresh to judge at start is settled once it misses its heartbeat, and a beating one is left alone',
  dbOpts,
  async () => {
    const { pool } = db
    await pool.query(
      `insert into site_brief (site_key, platform, brief, state) values
         ('quiet.tracy.test', 'wordpress', '{"about":"x"}'::jsonb, 'preparing'),
         ('beating.tracy.test', 'wordpress', '{"about":"x"}'::jsonb, 'preparing')`
    )
    const b = builds(pool, { wordpress: engine() }, { recoverOnStart: true, limits: { lostAfterMs: 300 } })
    // Another live process keeps beating its row while this one waits.
    const beat = setInterval(
      () => void pool.query(`update site_brief set updated_at = now() where site_key = 'beating.tracy.test'`),
      50
    )
    try {
      await b.recovered
    } finally {
      clearInterval(beat)
    }
    assert.equal((await briefOf(pool, 'quiet.tracy.test')).state, 'failed')
    assert.equal((await briefOf(pool, 'beating.tracy.test')).state, 'preparing')
  }
)

test(
  'quickstart workflow cannot finish after a missing or skipped required brand write',
  dbOpts,
  async () => {
    for (const [index, brand] of [
      undefined,
      async () => ({ written: [], skipped: [{ where: 'name', reason: 'unsupported' }] }),
      async () => {
        throw Error('identity store unavailable')
      }
    ].entries()) {
      const siteKey = `strict-brand-${index}.tracy.test`
      const e = engine({
        prepare: async () => ({ workflow: 'quickstart-first/1' }),
        apply: async () => ({ workflow: 'quickstart-first/1', wrote: 1 })
      })
      e.normalize = async () => ({ workflow: 'quickstart-first/1' })
      const b = builds(db.pool, { wordpress: e }, { brand })
      await b.start(input({ siteKey, label: `strict-brand-${index}` }))
      await untilSettled(b, siteKey)
      const row = await briefOf(db.pool, siteKey)
      assert.equal(row.state, 'failed')
      assert.match(row.error, /BRAND_|identity store unavailable/)
    }
  }
)

test(
  'startup recovery with no saved apply ID prevents Create and WO retry from overwriting uncertain writes',
  dbOpts,
  async () => {
    const { pool } = db
    await pool.query(
      `insert into site_brief (site_key, platform, brief, state, stage, updated_at)
    values ('unknown-write.tracy.test', 'wordpress', '{"about":"Original"}', 'applying', $1, now() - interval '1 minute')`,
      [STAGE.placing]
    )
    const eng = engine()
    const b = builds(pool, { wordpress: eng }, { recoverOnStart: true })
    await b.recovered
    assert.equal((await briefOf(pool, 'unknown-write.tracy.test')).timings.lostFrom, 'applying')
    for (const extra of [{}, { retryActionId: 'wo-retry-unknown' }]) {
      assert.deepEqual(
        await b.start({
          siteKey: 'unknown-write.tracy.test',
          platform: 'wordpress',
          brief: { about: 'Retry' },
          ...extra
        }),
        { started: false }
      )
    }
    const row = await briefOf(pool, 'unknown-write.tracy.test')
    assert.equal(row.error, LOST_PLACING)
    assert.deepEqual(row.brief, { about: 'Original' })
  }
)
