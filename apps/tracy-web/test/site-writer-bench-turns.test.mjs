// Writing turns of a site writer bench run (#330), at the bench-run seam: pages per turn is a frozen run setting that
// splits the writing order (shared parts, home, menu pages, legal pages, notFound) into turns. Each turn is sent as a
// fresh request holding only the fixed part, the pages of that turn and the copy notebook of the earlier turns, never
// their text; the partial answers are merged into one site-copy/1 file, checked once after the last turn. A run
// killed mid-round resumes at the next unsent turn. The model is the scripted fake: no real model is called.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { readRun } from '../src/site-writer/bench-store.js'
import { createSiteWriterQueue } from '../src/site-writer/bench-worker.js'
import { scriptedModel } from './_agent-over-door-fake.mjs'
import { fileDb } from './_db.mjs'
import {
  assignWriterDoor,
  balances,
  drain,
  kitIndex,
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

const TURNS_OF_TWO = [['shared', 'page-home'], ['page-about', 'legal:privacy'], ['notFound']]
const userTexts = (request) =>
  request.body.messages
    .filter((m) => m.role === 'user')
    .map((m) => (typeof m.content === 'string' ? m.content : m.content.map((p) => p.text).join('')))
const notebookOf = (text) => {
  const line = text.split('The copy notebook so far:\n\n')[1].split('\n')[0]
  return line.startsWith('(empty') ? [] : JSON.parse(line)
}

test(
  'two pages per turn: three turns in writing order, each a fresh request with the earlier notebook only',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index, { pagesPerTurn: 2 })
    const model = scriptedModel(TURNS_OF_TWO.map((pages) => reply(answerFor(pages))))
    await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(run.harness.pagesPerTurn, 2)
    assert.equal(model.requests.length, 3)
    const firstOf = (request) => userTexts(request)[0]
    model.requests.forEach((request, i) => {
      // One user message: the fixed part and this turn, nothing of the earlier turns' conversation.
      assert.equal(userTexts(request).length, 1)
      assert.equal(
        request.body.messages.filter((m) => m.role === 'assistant').length,
        0,
        'no earlier answer is sent again'
      )
      assert.match(firstOf(request), /^# The fixed part of this run/)
      assert.match(firstOf(request), new RegExp(`# Writing turn ${i + 1} of 3`))
      assert.match(
        firstOf(request),
        new RegExp(`Write these pages now, in this order: ${TURNS_OF_TWO[i].join(', ')}\\.`)
      )
    })
    // A later turn carries the notebook of every earlier turn, and no text the earlier turns wrote.
    assert.deepEqual(notebookOf(firstOf(model.requests[0])), [])
    assert.deepEqual(
      notebookOf(firstOf(model.requests[1])).map((n) => n.page),
      ['shared', 'page-home']
    )
    assert.deepEqual(
      notebookOf(firstOf(model.requests[2])).map((n) => n.page),
      ['shared', 'page-home', 'page-about', 'legal:privacy']
    )
    const homeHeading = answerFor(['page-home']).slots[0].text
    assert.ok(!firstOf(model.requests[2]).includes(homeHeading), 'earlier copy is not resent')
    // The fixed part is the same bytes in every turn, so the provider's prefix cache reuses it.
    const fixed = (request) => firstOf(request).split('# Writing turn')[0]
    assert.equal(fixed(model.requests[1]), fixed(model.requests[0]))
    assert.equal(fixed(model.requests[2]), fixed(model.requests[0]))

    // One round, checked once, on the merged copy: valid, every page written, the notebook of every turn.
    assert.deepEqual(
      run.rounds.map((r) => [r.round, r.state, r.failureList]),
      [[0, 'checked', '']]
    )
    const copy = run.rounds[0].copy
    assert.equal(copy.version, 'site-copy/1')
    assert.equal(run.rounds[0].checkResult.summary.fail, 0)
    assert.deepEqual(
      copy.slots.filter((s) => s.owner === 'writer'),
      TURNS_OF_TWO.flatMap((pages) => answerFor(pages).slots)
    )
    assert.deepEqual(
      copy.notebook.map((n) => n.page),
      ['shared', 'page-home', 'page-about', 'legal:privacy', 'notFound']
    )
    assert.equal(run.totals.turns, 3)
  }
)

test('one page per turn writes five turns and a valid copy', opts, async () => {
  const { pool } = db
  await assignWriterDoor(pool)
  const started = await startRun(pool, kits.index, { pagesPerTurn: 1 })
  const order = ['shared', 'page-home', 'page-about', 'legal:privacy', 'notFound']
  const model = scriptedModel(order.map((page) => reply(answerFor([page]))))
  await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })

  const run = await readRun(pool, started.id)
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(model.requests.length, 5)
  assert.deepEqual(
    run.rounds.map((r) => [r.round, r.state, r.checkResult.summary.fail]),
    [[0, 'checked', 0]]
  )
})

test('the whole site in one turn (the default) sends one request, as before', opts, async () => {
  const { pool } = db
  await assignWriterDoor(pool)
  const started = await startRun(pool, kits.index)
  const model = scriptedModel([reply(writerAnswer())])
  await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })

  const run = await readRun(pool, started.id)
  assert.equal(run.status, 'succeeded', run.error)
  assert.equal(run.harness.pagesPerTurn, 'all')
  assert.equal(model.requests.length, 1)
  assert.match(userTexts(model.requests[0])[0], /# Writing turn 1 of 1/)
  assert.equal(run.rounds[0].answer, JSON.stringify(writerAnswer()))
  assert.equal(run.rounds[0].checkResult.summary.fail, 0)
})

test('pages per turn is checked at the start and frozen with the run', opts, async () => {
  const { pool } = db
  await assignWriterDoor(pool)
  const { startWriterRun } = await import('../src/site-writer/bench-control.js')
  const { brief, plan } = await import('./_site-writer-bench.mjs')
  for (const pagesPerTurn of [0, -1, 1.5, 'some'])
    assert.equal(
      (
        await startWriterRun({
          pool,
          secret: SECRET,
          plan: plan(),
          planSource: { kind: 'file', name: 'p.json' },
          brief: brief(),
          briefSource: { kind: 'file', name: 'b.json' },
          kitRef: 'demo-gym/j6/1.0.0',
          startedBy: 'cli',
          index: kits.index,
          pagesPerTurn
        })
      ).code,
      'SITE_WRITER_HARNESS',
      String(pagesPerTurn)
    )
  const started = await startRun(pool, kits.index, { pagesPerTurn: 3 })
  assert.equal((await readRun(pool, started.id)).harness.pagesPerTurn, 3)
  await assert.rejects(
    pool.query(
      `update site_writer_run set harness = jsonb_set(harness, '{pagesPerTurn}', '1') where id = $1`,
      [started.id]
    ),
    /immutable/
  )
})

/** One worker; the process dies while waiting for request `killOn` (1-based), which was dispatched and saved. */
async function drainKilled(pool, model, { killOn }) {
  let count = 0
  const fetchImpl = async (url, init) => {
    if (++count === killOn) {
      await pool.query('update site_writer_run set lease_token = lease_token + 1')
      throw new Error('killed')
    }
    return model.fetchImpl(url, init)
  }
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
  await pool.query(`update site_writer_run set lease_until = now() - interval '1 second'`)
}

test(
  'a run killed while waiting for its second turn resumes at that turn and never resends the first',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index, { pagesPerTurn: 2 })
    await drainKilled(pool, scriptedModel([reply(answerFor(TURNS_OF_TWO[0]))]), { killOn: 2 })

    const model = scriptedModel(TURNS_OF_TWO.slice(1).map((pages) => reply(answerFor(pages))))
    await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })

    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 2)
    assert.match(userTexts(model.requests[0])[0], /# Writing turn 2 of 3/)
    assert.deepEqual(
      notebookOf(userTexts(model.requests[0])[0]).map((n) => n.page),
      ['shared', 'page-home']
    )
    assert.equal(userTexts(model.requests[0]).length, 1)
    assert.match(userTexts(model.requests[1])[0], /# Writing turn 3 of 3/)
    const { rows } = await pool.query(
      'select n, state, resend_of from site_writer_turn where run_id = $1 order by n',
      [started.id]
    )
    assert.deepEqual(
      rows.map((t) => [t.n, t.state, t.resend_of]),
      [
        [0, 'answered', null],
        [1, 'abandoned', null],
        [2, 'answered', 1],
        [3, 'answered', null]
      ]
    )
    assert.equal(run.rounds[0].checkResult.summary.fail, 0)
  }
)

test(
  'a run killed after a turn was answered but before it was recorded reads that answer back, not resending it',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index, { pagesPerTurn: 2 })
    // The process dies on the save that records the first turn's answer on the round.
    let dead = false
    const dying = new Proxy(pool, {
      get: (target, key) =>
        key === 'query'
          ? async (sql, params) => {
              if (
                !dead &&
                /insert into site_writer_round/.test(sql) &&
                /writingTurns/.test(params?.[14] ?? '')
              ) {
                dead = true
                await target.query('update site_writer_run set lease_token = lease_token + 1')
                throw new Error('killed')
              }
              return target.query(sql, params)
            }
          : target[key]
    })
    await createSiteWriterQueue({
      pool: dying,
      secret: SECRET,
      fetchImpl: scriptedModel([reply(answerFor(TURNS_OF_TWO[0]))]).fetchImpl,
      index: kits.index,
      balanceFetch: balances([]).fetchImpl,
      retry: { attempts: 1 },
      log: quiet
    })
      .drain()
      .catch(() => {})
    assert.equal(dead, true)
    await pool.query(`update site_writer_run set lease_until = now() - interval '1 second'`)

    const model = scriptedModel(TURNS_OF_TWO.slice(1).map((pages) => reply(answerFor(pages))))
    await drain(pool, { fetchImpl: model.fetchImpl, index: kits.index, balanceFetch: balances([]).fetchImpl })
    const run = await readRun(pool, started.id)
    assert.equal(run.status, 'succeeded', run.error)
    assert.equal(model.requests.length, 2)
    assert.match(userTexts(model.requests[0])[0], /# Writing turn 2 of 3/)
    assert.equal(run.rounds[0].checkResult.summary.fail, 0)
  }
)

test(
  'a fix round after several turns continues the last turn, with the failure list as its next message',
  opts,
  async () => {
    const { pool } = db
    await assignWriterDoor(pool)
    const started = await startRun(pool, kits.index, { pagesPerTurn: 2 })
    const last = answerFor(TURNS_OF_TWO[2])
    const thin = { ...last, pages: [{ ...last.pages[0], title: '' }] }
    const fixed = { pages: [last.pages[0]] }
    const model = scriptedModel([
      reply(answerFor(TURNS_OF_TWO[0])),
      reply(answerFor(TURNS_OF_TWO[1])),
      reply(thin),
      reply(fixed)
    ])
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
    const fix = model.requests[3].body.messages
    assert.deepEqual(
      fix.map((m) => m.role),
      ['system', 'user', 'assistant', 'user']
    )
    assert.match(userTexts(model.requests[3])[0], /# Writing turn 3 of 3/)
    assert.match(userTexts(model.requests[3])[1], /notFound/)
  }
)
