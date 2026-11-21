// The site writer's first draft in parts written at the same time (2026-11-15, #633): harness.parallelPages cuts the
// writing order into parts of about the same size, each part is a conversation of its own in flight at the same time,
// and the answers are merged into one site-copy/1 file, checked once; the fix rounds continue the last part's
// conversation. Off by default: a run that does not ask sends today's first message, byte for byte. The model is a fake
// that answers each request by the pages it names: no real model is called.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { PART_STRIDE } from '../src/lib/bench-run-parts.js'
import { runCli } from '../src/site-writer/bench-cli.js'
import { cancelWriterRun } from '../src/site-writer/bench-control.js'
import { readRun } from '../src/site-writer/bench-store.js'
import { createSiteWriterQueue } from '../src/site-writer/bench-worker.js'
import { assembleCopy, NOT_A_COPY_MESSAGE } from '../src/site-writer/copy-changes.js'
import { checkCopy } from '../src/site-writer/copy-check/check-copy.js'
import { indexInputs } from '../src/lib/site-copy/inputs-index.js'
import { pagesInWritingOrder, writerInput } from '../src/site-writer/writer-input.js'
import {
  notesOf,
  ownWordsByPart,
  pageWeights,
  partMessages,
  sharedNoteRuns,
  writingParts
} from '../src/site-writer/writer-parts.js'
import { firstUserMessage, fixedPart, mergeTurnAnswers } from '../src/site-writer/writer-turns.js'
import { fileDb } from './_db.mjs'
import {
  assignWriterDoor,
  balances,
  brief,
  copy as copyFixture,
  drain,
  KIT_REF,
  kit,
  kitIndex,
  plan,
  quiet,
  reply,
  SECRET,
  startRun,
  writerAnswer
} from './_site-writer-bench.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const kits = kitIndex()
after(kits.done)

// Where each entry of the invented plan belongs: block-1 and block-6 are shared, block-2 and block-3 are on the home
// page, block-5 on the about page.
const PAGE_OF_BLOCK = {
  'block-1': 'shared',
  'block-6': 'shared',
  'block-2': 'page-home',
  'block-3': 'page-home',
  'block-5': 'page-about'
}
const blockOf = (id) => id.split('.')[0]

/** The part of the passing answer that writes these pages, with a notebook entry per page. */
function answerFor(pages) {
  const all = writerAnswer()
  const on = (page) => pages.includes(page)
  return {
    slots: all.slots.filter((s) => on(PAGE_OF_BLOCK[blockOf(s.slot)])),
    alts: all.alts.filter((a) => on(PAGE_OF_BLOCK[blockOf(a.frame)])),
    seo: all.seo.filter((s) => on(s.page)),
    pages: all.pages.filter((p) => on(p.page)),
    notebook: pages.map((page) => ({
      page,
      points: [`point of ${page}`],
      openings: [`opening of ${page}`],
      calls: [`call of ${page}`],
      phrases: [`phrase of ${page}`]
    })),
    returns: []
  }
}

const input = () => writerInput({ plan: plan(), brief: brief(), kit: kit() })
// The invented site cut in two: the shared blocks, home and about, then the privacy page and the not-found page.
const TWO_PARTS = [
  ['shared', 'page-home', 'page-about'],
  ['legal:privacy', 'notFound']
]

const userTexts = (request) =>
  request.body.messages
    .filter((m) => m.role === 'user')
    .map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => p.text).join('')))
const pagesOf = (text) => /Write these pages now, in this order: (.*)\.\n/.exec(text)?.[1].split(', ') ?? null

/** What a request asks: a part's first draft, a part asked again for one JSON object, or a fix round. */
function routeOf(request) {
  const users = userTexts(request)
  const pages = pagesOf(users[0])
  const answered = request.body.messages.some((m) => m.role === 'assistant')
  if (!answered) return { kind: /# Writing part /.test(users[0]) ? 'part' : 'whole', pages }
  return { kind: users.at(-1) === NOT_A_COPY_MESSAGE ? 'again' : 'fix', pages }
}

const respond = (value, status = 200) =>
  new Response(JSON.stringify(reply(value).body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
const abortOf = (signal) =>
  new Promise((_, reject) => {
    const go = () => reject(signal.reason ?? new Error('aborted'))
    if (signal?.aborted) go()
    signal?.addEventListener('abort', go, { once: true })
  })

/**
 * A fake model answering each request by what it asks. With `together`, a part's answer waits until that many part
 * requests are in flight at once (or 5 s, recorded as a stall), so a run that sent its parts one after another stalls.
 * `on[kind]({ route, signal })` may answer a request itself (a value, a Response) or return nothing to fall through.
 */
function partsModel({ together = 0, on = {} } = {}) {
  const requests = []
  let arrived = 0
  let release
  const allIn = new Promise((resolve) => {
    release = resolve
  })
  let stalled = false
  const fetchImpl = async (url, init) => {
    const request = { url, body: JSON.parse(init.body) }
    requests.push(request)
    const route = routeOf(request)
    const own = await on[route.kind]?.({ route, signal: init.signal, request })
    if (own !== undefined) return own instanceof Response ? own : respond(own)
    if (route.kind === 'part' && together) {
      if (++arrived === together) release()
      let timer
      const late = new Promise((resolve) => {
        timer = setTimeout(() => {
          stalled = true
          resolve()
        }, 5000)
      })
      await Promise.race([allIn, late, abortOf(init.signal)]).finally(() => clearTimeout(timer))
    }
    if (route.kind === 'part' || route.kind === 'whole') return respond(answerFor(route.pages))
    throw new Error(`the fake model has no answer for a ${route.kind} request`)
  }
  return { fetchImpl, requests, stalled: () => stalled }
}

const turnRows = async (pool, runId) =>
  (
    await pool.query(
      'select n, round, state, resend_of, cost_usd, dispatched_at, answered_at, error from site_writer_turn where run_id = $1 order by n',
      [runId]
    )
  ).rows

async function until(read, what) {
  for (let i = 0; i < 250; i++) {
    const value = await read()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`timed out waiting for ${what}`)
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex')

// ---- The split and the merge (pure) ----

test('the split puts every page in exactly one part, in writing order, with the heaviest part as light as it can be', () => {
  const x = input()
  const order = pagesInWritingOrder(x.plan)
  const weights = pageWeights(x)
  assert.deepEqual([...weights.keys()], order)
  for (let k = 1; k <= 8; k++) {
    const parts = writingParts(x, k)
    assert.equal(parts.length, Math.min(k, order.length), `${k} parts`)
    assert.deepEqual(parts.flat(), order, 'joined in order, the parts are the writing order')
    assert.ok(
      parts.every((p) => p.length),
      'no part is empty'
    )
    // Every other way to cut the writing order into as many runs of pages has a heaviest part at least as heavy.
    const heaviest = (cut) => Math.max(...cut.map((p) => p.reduce((s, page) => s + weights.get(page), 0)))
    const cuts = (pages, n) =>
      n === 1
        ? [[pages]]
        : pages
            .slice(0, -1)
            .flatMap((_, i) =>
              cuts(pages.slice(i + 1), n - 1).map((rest) => [pages.slice(0, i + 1), ...rest])
            )
    const best = Math.min(...cuts(order, parts.length).map(heaviest))
    assert.equal(heaviest(parts), best, `${k} parts`)
  }
  assert.deepEqual(writingParts(x, 2), TWO_PARTS)
  assert.deepEqual(writingParts(x, 2), writingParts(input(), 2), 'the same input gives the same parts')
})

test('the merged parts are one copy with every slot of every page, written once, that passes the check', () => {
  const x = input()
  for (let k = 2; k <= 5; k++) {
    const parts = writingParts(x, k)
    const merged = mergeTurnAnswers(parts.map(answerFor))
    const index = indexInputs({ plan: plan(), kit: kit(), brief: brief() })
    const copy = assembleCopy(merged, { fingerprint: copyFixture().fingerprint, index })
    const result = checkCopy({ copy, plan: plan(), kit: kit(), brief: brief() })
    assert.equal(
      result.summary.fail,
      0,
      `${k} parts: ${JSON.stringify(result.rules.filter((r) => r.failures.length))}`
    )
    const written = copy.slots.map((s) => s.slot)
    assert.deepEqual(written.toSorted(), [...index.expected.keys()].toSorted(), 'every slot of every page')
    assert.equal(new Set(written).size, written.length, 'each written once')
    assert.deepEqual(
      merged.slots,
      parts.flatMap((pages) => answerFor(pages).slots),
      'every slot each part wrote, in part order, nothing changed'
    )
    assert.deepEqual(
      merged.slots.toSorted((x, y) => x.slot.localeCompare(y.slot)),
      writerAnswer().slots.toSorted((x, y) => x.slot.localeCompare(y.slot)),
      'the same slots as a whole-site answer'
    )
    assert.deepEqual(
      merged.notebook.map((n) => n.page),
      pagesInWritingOrder(plan())
    )
  }
})

test('each part gets the fixed part of a whole-site run, its pages, the others pages, the voice and the shared-out phrases', () => {
  const x = input()
  const parts = writingParts(x, 2)
  const messages = partMessages(x, parts)
  const fixed = fixedPart(x)
  assert.ok(firstUserMessage(x).startsWith(`${fixed}\n`))
  for (const [p, message] of messages.entries()) {
    assert.ok(message.startsWith(`${fixed}\n# Writing part ${p + 1} of 2`), 'the same fixed bytes first')
    assert.deepEqual(pagesOf(message), parts[p])
    assert.match(message, /Write every page in the site voice: plain and friendly/)
    const other = parts[1 - p].join(', ')
    assert.ok(message.includes(`- part ${2 - p}: ${other}`), 'names the pages the other part writes')
  }
  // The one own phrase is given to one part and the other is told not to use it.
  assert.deepEqual(ownWordsByPart(x.plan, parts), [['small group classes'], []])
  assert.match(messages[0], /Yours: "small group classes"\./)
  assert.match(messages[1], /The other parts are given "small group classes": do not use them\./)
  // Only the last part hears that the check's failures come back to it.
  assert.doesNotMatch(messages[0], /come back to you in this conversation/)
  assert.match(messages[1], /come back to you in this conversation/)
})

test('a phrase the notes of two parts share is kept by the first part and put in other words by the other', () => {
  const p = plan()
  // The about page's note and the home hero's note share "book a court online"; a fact's own words and a run holding
  // a word about the plan itself are not shared out.
  p.pages[1].blocks[0].copy[0].says =
    'coach name, then book a court online at 06:00 to 21:00, the brief names it'
  p.pages[0].blocks[0].copy[0].says = 'book a court online, open 06:00 to 21:00, the brief names it'
  const x = writerInput({ plan: p, brief: brief(), kit: kit() })
  const parts = [
    ['shared', 'page-home'],
    ['page-about', 'legal:privacy', 'notFound']
  ]
  assert.ok(notesOf(p, parts[1]).some((note) => note.startsWith('coach name')))
  const runs = sharedNoteRuns(x, parts)
  assert.deepEqual(runs[0].mine, ['book a court', 'a court online'])
  assert.deepEqual(runs[0].others, [])
  assert.deepEqual(runs[1].others, runs[0].mine)
  assert.ok(!runs.flatMap((r) => [...r.mine, ...r.others]).some((run) => /brief|21 00|06 00/.test(run)))
  const messages = partMessages(x, parts)
  assert.match(
    messages[1],
    /Another part keeps these, so put them in other words: "book a court", "a court online"\./
  )
  assert.match(
    messages[0],
    /Yours to keep \(the other parts are told to avoid them\): "book a court", "a court online"\./
  )
})

test('off by default: the first message is the same bytes as before parallel parts existed', () => {
  // Frozen on the commit before parallel parts (e6fedaee11): the whole-site first message of the invented site.
  assert.equal(
    sha256(firstUserMessage(input())),
    '4e6711ba1012a439809be751cdad4704c4c4bd2e92dccd93cfc923d1cdf4caa8'
  )
})

// ---- Runs (database) ----

// The first request of a run that does not ask for parts, as the worker sends it (the plan and the brief read back from
// the database, whose jsonb orders their keys): frozen on the commit before parallel parts (e6fedaee11), the whole
// request body and its one user message.
const BEFORE_PARTS = Object.freeze({
  body: '815a8a519905065efbdf73cc9f6ca93a9556c397d228dcade597027b4208cc23',
  firstUser: 'eec9bf630a016580ec53d7acbd05514c7acbefba6fec34f6ad2f40667c6057af'
})

test(
  "a run without parallel pages sends one request, byte for byte today's, and freezes no parallel setting",
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    for (const over of [{}, { parallelPages: 1 }]) {
      const started = await startRun(pool, kits.index, over)
      const model = partsModel()
      await drain(pool, {
        fetchImpl: model.fetchImpl,
        index: kits.index,
        balanceFetch: balances([]).fetchImpl
      })
      const run = await readRun(pool, started.id)
      assert.equal(run.status, 'succeeded', run.error)
      assert.equal('parallelPages' in run.harness, false)
      assert.equal(model.requests.length, 1)
      assert.equal(userTexts(model.requests[0]).length, 1)
      assert.equal(sha256(userTexts(model.requests[0])[0]), BEFORE_PARTS.firstUser)
      assert.equal(sha256(JSON.stringify(model.requests[0].body)), BEFORE_PARTS.body)
      assert.equal(run.rounds[0].reading.parallelParts, undefined)
    }
  }
)

test(
  'the split of a heavy "shared" is frozen with a run of parts that asks for it, and with no other run',
  opts,
  async () => {
    const { pool } = db
    const cases = [
      [{ parallelPages: 2, pagesPerTurn: 'all', splitShared: true }, true],
      [{ parallelPages: 2, pagesPerTurn: 'all' }, false],
      [{ parallelPages: 1, splitShared: true }, false]
    ]
    for (const [over, frozen] of cases) {
      const started = await startRun(pool, kits.index, over)
      const run = await readRun(pool, started.id)
      assert.equal(run.harness.splitShared === true, frozen, JSON.stringify(over))
    }
  }
)

test(
  'parallel pages: the parts are in flight at the same time, merged into one checked copy, their cost summed',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index, { parallelPages: 2 })
    const model = partsModel({ together: 2 })
    await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.harness.parallelPages, 2)
    assert.equal(model.stalled(), false, 'no part waited for the other to finish')
    assert.equal(model.requests.length, 2)
    assert.deepEqual(model.requests.map((r) => pagesOf(userTexts(r)[0])).toSorted(), TWO_PARTS.toSorted())
    for (const r of model.requests) {
      assert.equal(userTexts(r).length, 1, 'one user message: the fixed part and the part')
      assert.equal(r.body.messages.filter((m) => m.role === 'assistant').length, 0)
    }
    // Each part saved its call in its own range of turn numbers; both went out before either was answered.
    const turns = await turnRows(pool, started.id)
    assert.deepEqual(
      turns.map((t) => [t.n, t.round, t.state]),
      [
        [0, 0, 'answered'],
        [PART_STRIDE, 0, 'answered']
      ]
    )
    const latestOut = Math.max(...turns.map((t) => t.dispatched_at.getTime()))
    const firstBack = Math.min(...turns.map((t) => t.answered_at.getTime()))
    assert.ok(latestOut <= firstBack, 'both calls were in flight together')
    // One round, checked once on the merged copy.
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state, r.failureList]),
      [[0, 'checked', '']]
    )
    const copy = run.rounds[0].copy
    assert.equal(run.rounds[0].checkResult.summary.fail, 0)
    assert.deepEqual(
      copy.slots.filter((s) => s.owner === 'writer'),
      writerAnswer().slots
    )
    assert.deepEqual(
      run.rounds[0].reading.parallelParts.map((p) => [p.part, p.about, p.from]),
      [
        [0, TWO_PARTS[0], 0],
        [1, TWO_PARTS[1], PART_STRIDE]
      ]
    )
    // Cost: every call is priced and the run's and the round's cost are their sum.
    const sum = turns.reduce((s, t) => s + Number(t.cost_usd), 0)
    assert.ok(sum > 0)
    assert.equal(run.costUsd.toFixed(9), sum.toFixed(9))
    assert.equal(run.rounds[0].costUsd.toFixed(9), sum.toFixed(9))
    assert.equal(run.totals.turns, 2)
  }
)

test(
  'a fix round after parallel parts continues the last part, with the failure list as its next message',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index, { parallelPages: 2 })
    const thin = answerFor(TWO_PARTS[1])
    const notFound = thin.pages.find((p) => p.page === 'notFound')
    thin.pages = thin.pages.map((p) => (p.page === 'notFound' ? { ...p, title: '' } : p))
    const model = partsModel({
      together: 2,
      on: {
        part: ({ route }) => (route.pages.includes('notFound') ? thin : undefined),
        fix: () => ({ pages: [notFound] })
      }
    })
    await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state, r.failureList === '']),
      [
        [0, 'checked', false],
        [1, 'checked', true]
      ]
    )
    assert.equal(run.rounds[0].reading.conversationFrom, PART_STRIDE)
    const fix = model.requests.find((r) => routeOf(r).kind === 'fix')
    assert.deepEqual(
      fix.body.messages.map((m) => m.role),
      ['system', 'user', 'assistant', 'user']
    )
    assert.deepEqual(pagesOf(userTexts(fix)[0]), TWO_PARTS[1])
    assert.match(userTexts(fix)[1], /notFound/)
    const turns = await turnRows(pool, started.id)
    assert.deepEqual(
      turns.map((t) => [t.n, t.round]),
      [
        [0, 0],
        [PART_STRIDE, 0],
        [PART_STRIDE + 1, 1]
      ]
    )
  }
)

test(
  'a part whose answer is not one JSON object is asked once more in its own conversation',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index, { parallelPages: 2 })
    const model = partsModel({
      on: {
        part: ({ route }) => (route.pages.includes('shared') ? 'Here is the copy you asked for.' : undefined),
        again: ({ route }) => answerFor(route.pages)
      }
    })
    await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 3)
    const again = model.requests.find((r) => routeOf(r).kind === 'again')
    assert.deepEqual(pagesOf(userTexts(again)[0]), TWO_PARTS[0])
    assert.deepEqual(
      (await turnRows(pool, started.id)).map((t) => t.n),
      [0, 1, PART_STRIDE]
    )
    assert.equal(run.rounds[0].checkResult.summary.fail, 0)
  }
)

/** A worker whose process dies mid-round: `fetchImpl` decides when, `pool` may be a dying proxy. */
async function drainDying(pool, fetchImpl) {
  await createSiteWriterQueue({
    pool,
    secret: SECRET,
    fetchImpl,
    index: kits.index,
    balanceFetch: balances([]).fetchImpl,
    retry: { attempts: 1 },
    log: quiet
  })
    .drain()
    .catch(() => {})
  await db.pool.query(`update site_writer_run set lease_until = now() - interval '1 second'`)
}

const kill = (pool) => pool.query('update site_writer_run set lease_token = lease_token + 1')

test(
  'a parallel draft killed after one part was recorded resumes the other part alone, never resending the first',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index, { parallelPages: 2 })
    const recorded = async () =>
      (
        await pool.query('select reading from site_writer_round where run_id = $1 and round = 0', [
          started.id
        ])
      ).rows[0]?.reading?.parallelParts?.[0]
    const dying = partsModel({
      on: {
        part: async ({ route }) => {
          if (route.pages.includes('shared')) return undefined
          await until(recorded, 'the first part to be recorded')
          await kill(pool)
          throw new Error('killed')
        }
      }
    })
    await drainDying(pool, dying.fetchImpl)
    assert.deepEqual(
      (await turnRows(pool, started.id)).map((t) => [t.n, t.state]),
      [
        [0, 'answered'],
        [PART_STRIDE, 'dispatched']
      ]
    )

    const model = partsModel()
    await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 1)
    assert.deepEqual(pagesOf(userTexts(model.requests[0])[0]), TWO_PARTS[1])
    assert.deepEqual(
      (await turnRows(pool, started.id)).map((t) => [t.n, t.state, t.resend_of]),
      [
        [0, 'answered', null],
        [PART_STRIDE, 'abandoned', null],
        [PART_STRIDE + 1, 'answered', PART_STRIDE]
      ]
    )
    assert.equal(run.rounds[0].checkResult.summary.fail, 0)
  }
)

test(
  'a part answered but not yet recorded when the process died is read back from its saved turn, not sent again',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index, { parallelPages: 2 })
    // The process dies on the save that records the first part's answer on the round.
    let dead = false
    const dying = new Proxy(pool, {
      get: (target, key) =>
        key === 'query'
          ? async (sql, params) => {
              if (
                !dead &&
                /insert into site_writer_round/.test(sql) &&
                /parallelParts/.test(params?.[14] ?? '')
              ) {
                dead = true
                await kill(target)
                throw new Error('killed')
              }
              return target.query(sql, params)
            }
          : target[key]
    })
    // The second part is still waiting for its answer when the process dies.
    const model1 = partsModel({
      on: { part: ({ route, signal }) => (route.pages.includes('shared') ? undefined : abortOf(signal)) }
    })
    await drainDying(dying, model1.fetchImpl)
    assert.equal(dead, true)

    const model = partsModel()
    await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 1, 'only the part that had no answer is asked')
    assert.deepEqual(pagesOf(userTexts(model.requests[0])[0]), TWO_PARTS[1])
    const turns = await turnRows(pool, started.id)
    assert.deepEqual(
      turns.filter((t) => t.n < PART_STRIDE).map((t) => [t.n, t.state]),
      [[0, 'answered']]
    )
    assert.equal(run.rounds[0].checkResult.summary.fail, 0)
    assert.deepEqual(
      run.rounds[0].copy.slots.filter((s) => s.owner === 'writer'),
      writerAnswer().slots
    )
  }
)

test(
  'a cancel stops every part in flight and the run ends cancelled, with no further call',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index, { parallelPages: 2 })
    const model = partsModel({ on: { part: ({ signal }) => abortOf(signal) } })
    const draining = drain(pool, {
      fetchImpl: model.fetchImpl,
      index: kits.index,
      balanceFetch: balances([]).fetchImpl
    })
    await until(() => model.requests.length === 2, 'both parts in flight')
    const asked = await cancelWriterRun(pool, started.id)
    assert.equal(asked.ok, true, JSON.stringify(asked))
    await draining

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'cancelled')
    assert.equal(model.requests.length, 2)
    const turns = await turnRows(pool, started.id)
    assert.deepEqual(
      turns.map((t) => [t.n, t.state, t.error?.code]),
      [
        [0, 'failed', 'AGENT_ABORTED'],
        [PART_STRIDE, 'failed', 'AGENT_ABORTED']
      ]
    )
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state]),
      [[0, 'cancelled']]
    )
  }
)

test('a part that fails stops the other part, and the run fails with that failure', opts, async () => {
  const { pool } = db
  await assignWriterDoor(pool)
  const started = await startRun(pool, kits.index, { parallelPages: 2 })
  const model = partsModel({
    on: {
      part: ({ route, signal }) =>
        route.pages.includes('notFound')
          ? new Response(JSON.stringify({ error: { message: 'bad request' } }), {
              status: 400,
              headers: { 'content-type': 'application/json' }
            })
          : abortOf(signal)
    }
  })
  await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })

  const run = await readRun(pool, started.id)
  assert.equal(run.status, 'failed')
  assert.match(run.error, /^AGENT_/)
  assert.doesNotMatch(run.error, /ABORTED/)
  assert.equal(model.requests.length, 2)
  const turns = await turnRows(pool, started.id)
  assert.deepEqual(
    turns.map((t) => [t.n, t.state]),
    [
      [0, 'failed'],
      [PART_STRIDE, 'failed']
    ]
  )
  assert.equal(turns[0].error.code, 'AGENT_ABORTED')
  assert.deepEqual(
    run.rounds.map((r) => [r.round, r.state]),
    [[0, 'failed']]
  )
})

// ---- The command line ----

test(
  'run --parallel-pages freezes the number of parts; without it nothing is frozen; bad values are refused',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const dir = mkdtempSync(path.join(tmpdir(), 'site-writer-parallel-'))
    try {
      writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan()))
      writeFileSync(path.join(dir, 'brief.json'), JSON.stringify(brief()))
      const cli = async (...argv) => {
        const out = []
        const err = []
        const code = await runCli(argv, {
          pool,
          secret: SECRET,
          index: kits.index,
          cwd: dir,
          out: (line) => out.push(line),
          err: (line) => err.push(line)
        })
        return { code, out: out.join('\n'), err: err.join('\n') }
      }
      const START = ['run', '--plan-file', 'plan.json', '--kit', KIT_REF, '--brief-file', 'brief.json']
      const harnessOf = async (id) =>
        (await pool.query('select harness from site_writer_run where id = $1', [id])).rows[0].harness
      for (const bad of ['0', '9', 'two', '1.5'])
        assert.match(
          (await cli(...START, '--parallel-pages', bad)).err,
          /--parallel-pages takes a whole number from 1 to 8/
        )
      const mixed = await cli(...START, '--parallel-pages', '2', '--pages-per-turn', '2')
      assert.equal(mixed.code, 1)
      assert.match(mixed.err, /SITE_WRITER_HARNESS: .*pages per turn must be "all"/)
      const three = await cli(...START, '--parallel-pages', '3')
      assert.equal(three.code, 0, three.err)
      assert.equal((await harnessOf(three.out)).parallelPages, 3)
      await cli('cancel', three.out)
      const plain = await cli(...START)
      assert.equal(plain.code, 0, plain.err)
      assert.equal('parallelPages' in (await harnessOf(plain.out)), false)
      await assert.rejects(
        pool.query(
          `update site_writer_run set harness = jsonb_set(harness, '{parallelPages}', '2') where id = $1`,
          [plain.out]
        ),
        /immutable/
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
)
