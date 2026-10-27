// The follow-up of a host job its door stopped waiting for (`src/sites/door-follow-up.js`, ledger
// L31), held without the doors: the work is done once however many callers race for it, a row whose
// work throws stays owed and is tried again (and given up after the bound), and a host that does not
// answer is asked once per sweep. The doors themselves are tested in `sites-route.test.mjs`.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import {
  FOLLOW_UP_MAX_MS,
  fileFollowUp,
  closeUnfiledMoment,
  followThrough,
  handOver,
  onTurnClosed,
  SEAL_LEAD_MAX_MS,
  sealProvesStart,
  settleFollowUps
} from '../src/sites/door-follow-up.js'
import { jobAnswer } from '../src/sites/operations.js'
import { openTurn } from '../src/sites/turns.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const SITE = 'lantern.localhost'
const SHA = 'b'.repeat(40)
const MOMENT = JSON.stringify({
  ok: true,
  committed: true,
  files: 2,
  head: SHA,
  sha: SHA,
  paths: ['a.css', 'b.php']
})

/** The database's clock: the sweep compares the `now` it is handed with rows the database stamped. */
async function dbNow(pool) {
  return (await pool.query('select now() as now')).rows[0].now.getTime()
}

/** A site, a turn open on it, and one moment job owed for that turn, on `host`. */
async function owedMoment(pool, jobId, { host = 'local', turnId = 'session-f:1', endReason = null } = {}) {
  await pool.query(
    `insert into site (site_key, label, host) values ($1, 'lantern', 'local') on conflict (site_key) do nothing`,
    [SITE]
  )
  await openTurn(pool, { turnId, siteKey: SITE, actor: 'owner@x.y', title: 'Fix it', source: 'panel' }).catch(
    () => {}
  )
  await fileFollowUp(pool, {
    jobId,
    siteKey: SITE,
    host,
    kind: 'webroot-moment',
    door: 'moment',
    turnId,
    payload: {
      title: 'Fix it',
      actor: 'owner@x.y',
      reply: null,
      endReason,
      usage: { version: 1, totalTokens: 65, lastSeq: 10 }
    },
    waitMs: 10_000
  })
}

const audits = async (pool) =>
  (await pool.query("select 1 from audit where action = 'site.moment'")).rows.length
const owed = async (pool) => (await pool.query('select job_id from site_job_follow_up order by job_id')).rows
const turnFiles = async (pool) =>
  (await pool.query("select files from site_turn where turn_id = 'session-f:1'")).rows[0].files

/** Make every insert into `audit` fail until the returned function is called. */
async function refuseAudit(pool) {
  await pool.query(`create or replace function l31_refuse() returns trigger language plpgsql as $$
    begin raise exception 'audit refused (test)'; end $$`)
  await pool.query(
    'create trigger l31_refuse before insert on audit for each row execute function l31_refuse()'
  )
  return () => pool.query('drop trigger if exists l31_refuse on audit')
}

test('the job row and its follow-up are written together, in one statement', opts, async () => {
  const { pool } = db
  await owedMoment(pool, 'j-filed')
  const { rows } = await pool.query(
    `select j.site_key, j.host, j.kind, f.door from job j join site_job_follow_up f on f.job_id = j.id where j.id = 'j-filed'`
  )
  assert.deepEqual(rows, [{ site_key: SITE, host: 'local', kind: 'webroot-moment', door: 'moment' }])
})

test('two callers racing to follow one job through: one audit line, one close', opts, async () => {
  const { pool } = db
  await owedMoment(pool, 'j-race')
  const answer = { state: 'done', output: MOMENT }
  const done = await Promise.all([
    followThrough(pool, 'j-race', 'moment', answer),
    followThrough(pool, 'j-race', 'moment', answer)
  ])
  assert.equal(done.filter(Boolean).length, 1, 'exactly one of them did the work')
  assert.equal(await audits(pool), 1)
  assert.equal(await turnFiles(pool), 2, 'the files counted once')
  assert.equal(
    (await pool.query("select token_usage from site_turn where turn_id='session-f:1'")).rows[0].token_usage
      .totalTokens,
    65
  )
  assert.deepEqual(await owed(pool), [])
})

test('work that throws leaves the job owed, and it is done when tried again', opts, async () => {
  const { pool } = db
  await owedMoment(pool, 'j-throw')
  const allow = await refuseAudit(pool)
  try {
    await assert.rejects(
      followThrough(pool, 'j-throw', 'moment', { state: 'done', output: MOMENT }),
      /audit refused/
    )
    assert.deepEqual(await owed(pool), [{ job_id: 'j-throw' }], 'rolled back with the work')
    assert.equal(await turnFiles(pool), 0)
  } finally {
    await allow()
  }
  assert.ok(await followThrough(pool, 'j-throw', 'moment', { state: 'done', output: MOMENT }))
  assert.equal(await audits(pool), 1)
  assert.equal(await turnFiles(pool), 2)
})

test(
  'the sweep: a row whose work keeps throwing is tried again, then given up after the bound, said once',
  opts,
  async () => {
    const { pool } = db
    await owedMoment(pool, 'j-poison')
    await pool.query(`update job set state = 'done', detail = $1::jsonb`, [
      JSON.stringify({ state: 'done', output: MOMENT })
    ])
    await handOver(pool, 'j-poison')
    /** @type {string[]} */
    const warned = []
    const log = { info() {}, warn: (line) => warned.push(String(line)) }
    const pollJob = async () => assert.fail('an ended job row is not asked about again')
    const allow = await refuseAudit(pool)
    const base = await dbNow(pool)
    try {
      await settleFollowUps(pool, { pollJob, log, now: () => base + 60_000 })
      assert.deepEqual(await owed(pool), [{ job_id: 'j-poison' }], 'still owed, tried again later')
      assert.ok(warned.some((line) => /audit refused/.test(line)))
      await settleFollowUps(pool, { pollJob, log, now: () => base + FOLLOW_UP_MAX_MS + 60_000 })
      assert.deepEqual(await owed(pool), [], 'given up after the bound')
      assert.equal(warned.filter((line) => /given up/.test(line)).length, 1, 'said once')
      await settleFollowUps(pool, { pollJob, log, now: () => base + FOLLOW_UP_MAX_MS + 120_000 })
      assert.equal(warned.filter((line) => /given up/.test(line)).length, 1)
    } finally {
      await allow()
    }
    assert.equal(await audits(pool), 0)
  }
)

test(
  'the sweep asks a host that did not answer once per run, and holds each row it takes',
  opts,
  async () => {
    const { pool } = db
    await owedMoment(pool, 'j-dead-1', { host: 'dead' })
    await owedMoment(pool, 'j-dead-2', { host: 'dead', turnId: 'session-f:2' })
    await owedMoment(pool, 'j-live', { host: 'local', turnId: 'session-f:3' })
    for (const id of ['j-dead-1', 'j-dead-2', 'j-live']) await handOver(pool, id)
    const at = (await dbNow(pool)) + 60_000
    /** @type {Record<string, number>} */
    const asked = {}
    /** @type {boolean[]} */
    const held = []
    const pollJob = async ({ host, jobId }) => {
      asked[host] = (asked[host] ?? 0) + 1
      // While a row is being looked at, its next look is pushed out: another replica does not take it.
      const { rows } = await pool.query('select next_at from site_job_follow_up where job_id = $1', [jobId])
      held.push(rows[0].next_at.getTime() > at)
      return host === 'dead'
        ? { ok: false, status: 0, body: null }
        : { ok: true, status: 200, body: { state: 'running' } }
    }
    await settleFollowUps(pool, { pollJob, log: { info() {}, warn() {} }, now: () => at })
    assert.deepEqual(asked, { dead: 1, local: 1 })
    assert.deepEqual(held, [true, true])
    assert.deepEqual(await owed(pool), [{ job_id: 'j-dead-1' }, { job_id: 'j-dead-2' }, { job_id: 'j-live' }])
  }
)

// ── A late seal that proves the turn's start (09/10/2026, dskeepjo turn T4b) ───────────────────────
// The Joomla seal took 15.3 s on the host and sealed nothing (`"sealed":null,"outside":[]`); the door
// had marked the turn `unsealed_start` at 12 s, and its Undo was refused as "mixed with another
// request". These are the host's own job records from the stand, times in epoch ms.

const CLEAN_SEAL = {
  ok: true,
  head: 'a52a69e0123969d2dfee8766b5e1b5bd21909df0',
  sealed: null,
  skipped: null,
  outside: []
}
const T4B = { answer: CLEAN_SEAL, createdAt: 1791570660534, updatedAt: 1791570675835, lead: 40 }
/** A `job` row of the site as the ledger holds it once polled: the host's record in `detail`. */
const job = (kind, createdAt, updatedAt, output = '{"ok":true}', state = 'done') => ({
  kind,
  state,
  detail: { createdAt, updatedAt, state, output }
})
const committed = (yes) =>
  JSON.stringify({
    ok: true,
    committed: yes,
    files: yes ? 1 : 0,
    head: 'h',
    sha: yes ? 'c'.repeat(40) : null
  })

test("a late seal that sealed nothing, asked for at once, with nothing committing in its window proves the turn's start", () => {
  const others = [
    // The last undo's restore ended 75 s before the seal was asked for.
    job('webroot-restore-undo', 1791570580783, 1791570585900),
    // The CMS log pull at the turn's open ran inside the seal's window; it never commits.
    job('cms-log-pull', 1791570672610, 1791570673148),
    // The turn's own moment, asked for after the seal had ended.
    job('webroot-moment', 1791570730231, 1791570739213, committed(true)),
    job('webroot-moment', 1791570730231, 1791570731000, committed(true), 'running')
  ]
  assert.equal(sealProvesStart(T4B, others, jobAnswer), true)
  assert.equal(sealProvesStart(T4B, [], jobAnswer), true)
})

test('a late seal proves nothing when it sealed or skipped something, or its door or its times cannot be trusted', () => {
  const no = (seal) => assert.equal(sealProvesStart({ ...T4B, ...seal }, [], jobAnswer), false)
  // What the agent wrote first may sit in that seal.
  no({ answer: { ...CLEAN_SEAL, sealed: { sha: 'a'.repeat(40), files: ['x.php'] } } })
  // Another conversation's turn was open: nothing was sealed, what was dirty may be anyone's.
  no({ answer: { ...CLEAN_SEAL, skipped: 'turn-open' } })
  // An older host that does not say what it sealed; a failed or unreadable seal.
  no({ answer: { ok: true, head: 'h' } })
  no({ answer: { ok: false } })
  no({ answer: null })
  // The door took longer than the bound to ask the host: a write may have come before the seal's record.
  no({ lead: SEAL_LEAD_MAX_MS + 1 })
  no({ lead: undefined })
  no({ lead: -1 })
  // No host times for the seal itself.
  no({ createdAt: undefined })
  no({ updatedAt: null })
  no({ createdAt: T4B.updatedAt + 1 })
  assert.equal(sealProvesStart({ ...T4B, lead: SEAL_LEAD_MAX_MS }, [], jobAnswer), true)
})

test("a late seal proves nothing when something that commits ran while it waited — the previous turn's late moment above all", () => {
  const no = (other) => assert.equal(sealProvesStart(T4B, [other], jobAnswer), false)
  const yes = (other) => assert.equal(sealProvesStart(T4B, [other], jobAnswer), true)
  const inside = [T4B.createdAt - 5_000, T4B.createdAt + 8_000]
  // The previous turn's moment ran on into the seal's window and committed: the agent's first write may
  // be in it (uiweekwp 09/10: that moment ended 20 s after the next turn opened).
  no(job('webroot-moment', ...inside, committed(true)))
  // The same moment with nothing to commit took nothing with it.
  yes(job('webroot-moment', ...inside, committed(false)))
  // Another seal that sealed nothing likewise; one that sealed did commit.
  yes(job('webroot-seal-outside', ...inside, JSON.stringify(CLEAN_SEAL)))
  no(
    job('webroot-seal-outside', ...inside, JSON.stringify({ ...CLEAN_SEAL, sealed: { sha: 'f'.repeat(40) } }))
  )
  // A look at Changes seals what is dirty; a restore commits; a kind nobody listed may commit.
  no(job('webroot-changes', ...inside))
  no(job('webroot-restore-undo', ...inside))
  no(job('webroot-something-new', ...inside))
  // A failed moment, an unreadable one, a job still running in the window, one never polled.
  no(job('webroot-moment', ...inside, 'another webroot job holds this site', 'failed'))
  no(job('webroot-moment', ...inside, 'garbled'))
  no(job('webroot-moment', inside[0], inside[1], committed(false), 'running'))
  no({ kind: 'webroot-moment', state: 'running', detail: null })
  no({ kind: 'webroot-moment', state: 'done', detail: { output: committed(false) } })
  // Ended just before the seal was asked for, or asked for just after it ended: outside the window.
  yes(job('webroot-moment', T4B.createdAt - 9_000, T4B.createdAt - 1, committed(true)))
  yes(job('webroot-moment', T4B.updatedAt + 1, T4B.updatedAt + 9_000, committed(true)))
})

test(
  'handing a seal over marks its turn as started unsealed in the same statement; a moment hand-over marks nothing',
  opts,
  async () => {
    const { pool } = db
    await owedMoment(pool, 'j-moment')
    await fileFollowUp(pool, {
      jobId: 'j-seal',
      siteKey: SITE,
      host: 'local',
      kind: 'webroot-seal-outside',
      door: 'seal',
      turnId: 'session-f:1',
      payload: { lead: 5 },
      waitMs: 12_000
    })
    const unsealed = async () =>
      (await pool.query("select unsealed_start from site_turn where turn_id = 'session-f:1'")).rows[0]
        .unsealed_start
    await handOver(pool, 'j-moment')
    assert.equal(await unsealed(), false)
    await handOver(pool, 'j-seal')
    assert.equal(await unsealed(), true)
    // A seal the sweep already followed through is not handed over: its verdict stands.
    await pool.query("update site_turn set unsealed_start = false where turn_id = 'session-f:1'")
    await followThrough(pool, 'j-seal', 'seal', { state: 'done', output: JSON.stringify(CLEAN_SEAL) })
    await handOver(pool, 'j-seal')
    assert.equal(await unsealed(), false)
  }
)

// A demo stayed on "Building…" for hours: its agent ended with an error, the moment job failed (the site had no
// webroot yet), and the follow-up was dropped without closing the turn — so its end reason was never kept.
test(
  'a moment job that failed, expired or answered unreadably still closes its turn, with how it ended and no commit',
  opts,
  async () => {
    const { pool } = db
    const closed = []
    const unhook = onTurnClosed((turn) => closed.push(turn.turnId))
    try {
      const answers = [
        { state: 'failed', output: 'webroot-git: no webroot at /var/www/lantern' },
        { state: 'expired' },
        { state: 'done', output: 'not a json line' },
        { state: 'done', output: JSON.stringify({ ok: false, why: 'locked' }) }
      ]
      for (const [i, answer] of answers.entries()) {
        const turnId = `session-g${i}:1`
        await owedMoment(pool, `j-ended-${i}`, { turnId, endReason: 'error' })
        assert.ok(await followThrough(pool, `j-ended-${i}`, 'moment', answer))
        const { rows } = await pool.query(
          'select state, end_reason, head_sha, files from site_turn where turn_id = $1',
          [turnId]
        )
        assert.deepEqual(
          rows[0],
          { state: 'closed', end_reason: 'error', head_sha: null, files: 0 },
          `closed after ${answer.state}`
        )
      }
      assert.equal(await audits(pool), 0, 'no audit line claims a moment the host did not record')
      assert.deepEqual(await owed(pool), [])
      await new Promise((resolve) => setImmediate(resolve))
      assert.deepEqual(closed.sort(), ['session-g0:1', 'session-g1:1', 'session-g2:1', 'session-g3:1'])
    } finally {
      unhook()
    }
  }
)

test(
  'a moment the host refused to take closes its turn with how it ended, and says so once committed',
  opts,
  async () => {
    const { pool } = db
    await pool.query(
      `insert into site (site_key, label, host) values ($1, 'lantern', 'local') on conflict (site_key) do nothing`,
      [SITE]
    )
    await openTurn(pool, {
      turnId: 'session-r:1',
      siteKey: SITE,
      actor: 'owner@x.y',
      title: 'Fix it',
      source: 'panel'
    })
    const closed = []
    const unhook = onTurnClosed((turn) => closed.push(turn.turnId))
    try {
      await closeUnfiledMoment(pool, {
        siteKey: SITE,
        turnId: 'session-r:1',
        payload: { title: 'Fix it', reply: null, endReason: 'aborted', work: null, usage: null }
      })
      await new Promise((resolve) => setImmediate(resolve))
    } finally {
      unhook()
    }
    const { rows } = await pool.query(
      "select state, end_reason, head_sha, files from site_turn where turn_id = 'session-r:1'"
    )
    assert.deepEqual(rows[0], { state: 'closed', end_reason: 'aborted', head_sha: null, files: 0 })
    assert.deepEqual(closed, ['session-r:1'])
    assert.equal(await audits(pool), 0)
  }
)
