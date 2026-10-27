/**
 * `/api/ops/usage*` (`src/ops/usage.js`, plan tasks/todo-do-dung-that.md U5–U6): the folds, by hand-made
 * rows, then the two doors on a real database — who may read them, what is left out, and the words
 * only for the readers named in `USAGE_TEXT_READERS`, each read written down.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { mintSession } from '../src/lib/session.js'
import {
  changeKind,
  kindsOf,
  MIN_FOR_P90,
  MIN_FOR_RATE,
  quantiles,
  rate,
  summarizeFunnel,
  summarizeTurns
} from '../src/ops/usage.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'

const HOUR = 3_600_000
const MIN = 60_000

describe('the folds', () => {
  test('changeKind: the verb or the MCP tool names the kind; a look path is a look whatever the verb', () => {
    const cases = [
      ['page.create', null, 'added'],
      ['content.create', 'apply', 'added'],
      ['content_create', 'emdash-mcp', 'added'],
      ['content.replace', 'apply', 'text'],
      ['content_update', 'emdash-mcp', 'text'],
      ['site.name', 'apply', 'text'],
      ['settings_update', 'emdash-mcp', 'text'],
      ['menu.update', 'apply', 'text'],
      ['media.upload', 'apply', 'image'],
      ['media_upload', 'emdash-mcp', 'image'],
      ['content.delete', 'apply', 'delete'],
      ['media_delete', 'emdash-mcp', 'delete'],
      ['look.set', 'apply', 'look'],
      ['bash', 'look-css', 'look'],
      ['schema_create_field', 'emdash-mcp', 'other'],
      ['apply.revert', 'apply', 'other']
    ]
    for (const [action, via, kind] of cases) assert.equal(changeKind(action, via), kind, `${action} ${via}`)
  })

  test('kindsOf: only successful writes; files only when no write explains them; nothing is empty', () => {
    const w = (action, outcome = 'ok') => ({ action, via: 'apply', outcome })
    assert.deepEqual(
      [...kindsOf([w('content.create'), w('content.replace'), w('page.create')], 0)],
      ['added', 'text']
    )
    assert.deepEqual([...kindsOf([w('media.upload', 'refused')], 0)], [])
    assert.deepEqual([...kindsOf([w('media.upload', 'refused')], 2)], ['files'])
    assert.deepEqual([...kindsOf([w('content.replace')], 2)], ['text'])
    assert.deepEqual([...kindsOf([], 0)], [])
  })

  test('quantiles and rate say nothing below their floor, and carry a Wilson interval above it', () => {
    const upTo = (n) => Array.from({ length: n }, (_, i) => i + 1)
    assert.deepEqual(quantiles(upTo(MIN_FOR_RATE - 1)), { n: MIN_FOR_RATE - 1, p50: null, p90: null })
    assert.deepEqual(quantiles(upTo(MIN_FOR_RATE)), { n: MIN_FOR_RATE, p50: 10, p90: null })
    assert.deepEqual(quantiles(upTo(MIN_FOR_P90)), { n: MIN_FOR_P90, p50: 50, p90: 90 })
    assert.deepEqual(rate(3, MIN_FOR_RATE - 1), {
      a: 3,
      b: MIN_FOR_RATE - 1,
      rate: null,
      low: null,
      high: null
    })
    assert.deepEqual(rate(15, 40), { a: 15, b: 40, rate: 0.375, low: 0.242, high: 0.53 })
    assert.deepEqual(rate(0, 20), { a: 0, b: 20, rate: 0, low: 0, high: 0.161 })
  })

  test('summarizeTurns: endings, changes, time, visual, and four signals kept apart, each on what is old enough', () => {
    const now = Date.parse('2026-10-17T05:00:00Z')
    const at = (msAgo) => new Date(now - msAgo)
    const turn = (over) => ({
      session_id: 's',
      turn: 1,
      state: 'closed',
      end_reason: 'completed',
      files: 0,
      head_sha: null,
      undone_at: null,
      rating: null,
      steps: null,
      calls: null,
      failed_calls: null,
      visual: null,
      ...over
    })
    const turns = [
      // A WordPress text edit two days ago: rated Good, seen, followed five minutes later by a turn that
      // wrote the same post again and was undone from the chat within the hour.
      turn({
        turn_id: 'a:1',
        session_id: 'a',
        site_key: 'wp.t',
        platform: 'wordpress',
        opened_at: at(48 * HOUR),
        closed_at: at(48 * HOUR - 30_000),
        rating: 'positive',
        visual: 'shown',
        steps: 3,
        calls: 4,
        failed_calls: 1
      }),
      turn({
        turn_id: 'a:2',
        session_id: 'a',
        turn: 2,
        site_key: 'wp.t',
        platform: 'wordpress',
        opened_at: at(48 * HOUR - 30_000 - 5 * MIN),
        closed_at: at(48 * HOUR - 30_000 - 6 * MIN),
        undone_at: at(47 * HOUR),
        rating: 'negative',
        visual: 'not_shown'
      }),
      // Joomla: a question answered after two refused calls; and a file edit undone from Site changes.
      turn({
        turn_id: 'b:1',
        session_id: 'b',
        site_key: 'jo.t',
        platform: 'joomla',
        opened_at: at(30 * HOUR),
        closed_at: at(30 * HOUR - 20_000),
        steps: 2,
        calls: 2,
        failed_calls: 2
      }),
      turn({
        turn_id: 'e:1',
        session_id: 'e',
        site_key: 'jo.t',
        platform: 'joomla',
        opened_at: at(26 * HOUR),
        closed_at: at(26 * HOUR - 40_000),
        files: 3,
        head_sha: 'abc'
      }),
      // EmDash: a model error, a turn still running, and a young change too new for the day-long signals.
      turn({
        turn_id: 'c:1',
        session_id: 'c',
        site_key: 'em.t',
        platform: 'emdash',
        opened_at: at(10 * HOUR),
        closed_at: at(10 * HOUR - 5000),
        end_reason: 'error'
      }),
      turn({
        turn_id: 'd:1',
        session_id: 'd',
        site_key: 'em.t',
        platform: 'emdash',
        opened_at: at(MIN),
        closed_at: null,
        state: 'open',
        end_reason: null
      }),
      turn({
        turn_id: 'f:1',
        session_id: 'f',
        site_key: 'em.t',
        platform: 'emdash',
        opened_at: at(6 * MIN),
        closed_at: at(5 * MIN)
      })
    ]
    const writes = [
      {
        turn_id: 'a:1',
        action: 'content.replace',
        via: 'apply',
        outcome: 'ok',
        at: at(48 * HOUR - 10_000),
        target: { kind: 'post', id: '5' }
      },
      {
        turn_id: 'a:2',
        action: 'content.update',
        via: 'apply',
        outcome: 'ok',
        at: at(48 * HOUR - 30_000 - 5 * MIN - 20_000),
        target: { kind: 'post', id: '5' }
      },
      {
        turn_id: 'f:1',
        action: 'content_update',
        via: 'emdash-mcp',
        outcome: 'ok',
        at: at(5 * MIN + 30_000),
        target: null
      }
    ]
    const out = summarizeTurns({
      turns,
      writes,
      undoneBySiteChanges: new Map([['e:1', now - 25 * HOUR]]),
      now
    })
    const all = out.all
    assert.equal(all.turns, 7)
    assert.deepEqual(Object.fromEntries(Object.entries(all.endings).filter(([, n]) => n > 0)), {
      completed: 5,
      error: 1,
      running: 1
    })
    assert.equal(all.changes.changed, 4)
    assert.equal(all.changes.text, 3)
    assert.equal(all.changes.files, 1)
    assert.equal(all.changes.unchangedCompleted, 1)
    assert.equal(all.changes.unchangedCompletedRefused, 1)
    assert.equal(all.changes.unchangedNotCompleted, 2, 'the error and the running turn')
    assert.equal(all.time.turn.n, 6, 'the running turn has no stop yet')
    assert.equal(all.time.firstWrite.n, 3)
    assert.equal(all.work.known, 2)
    assert.deepEqual(all.work.withFailedCalls, { a: 2, b: 2, rate: null, low: null, high: null })
    assert.deepEqual(Object.fromEntries(Object.entries(all.visual).filter(([, n]) => n > 0)), {
      changed: 4,
      shown: 1,
      not_shown: 1,
      unknown: 2
    })
    assert.deepEqual(
      [all.feedback.coverage.a, all.feedback.coverage.b, all.feedback.positive, all.feedback.negative],
      [2, 7, 1, 1]
    )
    // Undo within a day: of the three changes a day old (not f:1, five minutes old), a:2 from the chat
    // and e:1 from Site changes; a:1 was not undone.
    assert.deepEqual([all.undo.within24h.a, all.undo.within24h.b], [2, 3])
    assert.deepEqual([all.undo.fromChat, all.undo.fromSiteChanges], [1, 1])
    // Follow-up: only a:1 was followed within ten minutes; f:1 (five minutes old) and the running d:1
    // are not counted at all.
    assert.deepEqual([all.followUp.a, all.followUp.b], [1, 5])
    assert.deepEqual([all.rework.a, all.rework.b], [1, 2], 'a:1 reworked by a:2 on post 5; a:2 had no next')
    assert.equal(out.wordpress.turns, 2)
    assert.equal(out.joomla.changes.files, 1)
    assert.equal(out.emdash.endings.running, 1)
    assert.equal(out.unknown.turns, 0)
  })

  test('summarizeFunnel: openings reach Create by their id; build, Customize, first visit, first request, return', () => {
    const now = Date.parse('2026-10-17T05:00:00Z')
    const at = (msAgo) => new Date(now - msAgo)
    const out = summarizeFunnel({
      openings: [
        { wizard_id: 'w1', occurred_at: at(50 * HOUR) },
        { wizard_id: 'w2', occurred_at: at(49 * HOUR) },
        { wizard_id: 'w3', occurred_at: at(HOUR) },
        { wizard_id: 'w4', occurred_at: at(2 * HOUR) }
      ],
      creates: [
        { site_key: 'a.t', platform: 'wordpress', wizard_id: 'w1', occurred_at: at(50 * HOUR) },
        { site_key: 'b.t', platform: 'joomla', wizard_id: 'w4', occurred_at: at(2 * HOUR) },
        { site_key: 'c.t', platform: 'emdash', wizard_id: null, occurred_at: at(30 * HOUR) },
        { site_key: 'd.t', platform: 'emdash', wizard_id: null, occurred_at: at(HOUR) }
      ],
      results: new Map([
        ['a.t', { seconds: 300 }],
        ['b.t', { seconds: 0 }]
      ]),
      stuck: new Set(['c.t']),
      briefs: new Map([
        ['a.t', 'applied'],
        ['b.t', 'applying'],
        ['c.t', 'failed']
      ]),
      entries: new Map([
        ['a.t', [at(50 * HOUR - 10 * MIN), at(20 * HOUR)]],
        ['b.t', [at(HOUR)]]
      ]),
      firstTurns: new Map([['a.t', at(49 * HOUR)]]),
      enteredSince: at(60 * HOUR),
      now
    })
    assert.deepEqual(out.wizard, {
      opened: 4,
      reachedCreate: 2,
      pending: 1,
      leftBeforeCreate: 1,
      reachedCreateRate: { a: 1, b: 2, rate: null, low: null, high: null }
    })
    const all = out.byPlatform.all
    assert.equal(all.created, 4)
    assert.deepEqual(all.built, { done: 2, failed: 1, pending: 1 })
    assert.equal(all.ready.n, 1, 'the warm site is not a build time')
    assert.equal(all.warm, 1)
    assert.deepEqual(all.customize, { none: 1, applied: 1, failed: 1, inProgress: 1 })
    assert.deepEqual([all.entered.a, all.entered.b], [2, 4])
    assert.deepEqual(
      [all.firstRequestWithin24h.a, all.firstRequestWithin24h.b],
      [1, 2],
      'a.t and c.t are a day old'
    )
    assert.deepEqual([all.returnedAnotherDay.a, all.returnedAnotherDay.b], [1, 2])
    assert.equal(out.byPlatform.emdash.created, 2)
  })
})

test('summarizeFunnel: a site made before visits were recorded is not counted as never opened', () => {
  const now = Date.parse('2026-10-17T05:00:00Z')
  const at = (msAgo) => new Date(now - msAgo)
  const out = summarizeFunnel({
    openings: [],
    creates: [
      { site_key: 'old.t', platform: 'joomla', wizard_id: null, occurred_at: at(80 * HOUR) },
      { site_key: 'new.t', platform: 'joomla', wizard_id: null, occurred_at: at(30 * HOUR) }
    ],
    results: new Map(),
    stuck: new Set(),
    briefs: new Map(),
    entries: new Map([['new.t', [at(29 * HOUR)]]]),
    firstTurns: new Map(),
    enteredSince: at(40 * HOUR),
    now
  })
  const all = out.byPlatform.all
  assert.equal(all.created, 2)
  assert.deepEqual([all.entered.a, all.entered.b], [1, 1])
  assert.deepEqual([all.returnedAnotherDay.a, all.returnedAnotherDay.b], [0, 1])
  assert.deepEqual(
    [all.firstRequestWithin24h.a, all.firstRequestWithin24h.b],
    [0, 2],
    'chat requests were always kept'
  )
  const none = summarizeFunnel({
    openings: [],
    creates: [{ site_key: 'x.t', platform: 'wordpress', wizard_id: null, occurred_at: at(HOUR) }],
    results: new Map(),
    stuck: new Set(),
    briefs: new Map(),
    entries: new Map(),
    firstTurns: new Map(),
    enteredSince: null,
    now
  })
  assert.deepEqual([none.byPlatform.all.entered.a, none.byPlatform.all.entered.b], [0, 0])
})

// ── the doors ───────────────────────────────────────────────────────────────────────────────────

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const ORIGIN = 'https://cowork.tracy.test'
// The server's clock. Seed rows are stamped from it ($n::timestamptz), never from Postgres' now():
// the real clock drifts from a pinned instant during the day, and the clock-shift gate moves only Date.now().
const NOW = Date.parse('2026-10-17T05:00:00Z')
const AT = new Date(NOW)
const env = {
  TRACY_ORIGIN: ORIGIN,
  SITE_DOMAIN: 'tracy.test',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'demo',
  HOST_demo_ORIGIN: 'http://demo-host',
  HOST_demo_DSH_ORIGIN: 'http://demo-host',
  HOST_demo_SECRET: 'h',
  SEAT_demo_SECRET: 'k',
  USAGE_TEXT_READERS: 'reviewer@tracy.test'
}

function harness(pool) {
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    now: () => NOW,
    signalNow: () => NOW,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    log: { warn() {}, log() {}, error() {} }
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const get = async (path, cookie) =>
    app.fetch(new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {}, redirect: 'manual' }))
  return { get, cookieFor }
}

async function seedStaff(pool, email, role) {
  const account = (
    await pool.query(
      'insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id',
      [email]
    )
  ).rows[0].id
  const workspace =
    (await pool.query("select id from workspace where kind = 'tracy_admin' limit 1")).rows[0]?.id ??
    (
      await pool.query(
        "insert into workspace (display_name, kind) values ('Tracy', 'tracy_admin') returning id"
      )
    ).rows[0].id
  await pool.query(
    `insert into seat_workspace (workspace_id, account_id, role, granted_by, accepted_at)
     values ($1, $2, $3, $2, now())`,
    [workspace, account, role]
  )
}

async function seedTurns(pool) {
  await pool.query(
    `insert into site (site_key, label, host, platform, demo) values
       ('wp.tracy.test', 'wp', 'demo', 'wordpress', false),
       ('demo.tracy.test', 'demo', 'demo', 'joomla', true)`
  )
  const turn = (id, site, actor, title, rating) =>
    pool.query(
      `insert into site_turn (turn_id, site_key, session_id, turn, actor, title, source, opened_at, close_filed_at, closed_at,
                              state, end_reason, reply, rating)
       values ($1, $2, split_part($1, ':', 1), split_part($1, ':', 2)::int, $3, $4, 'panel',
               $6::timestamptz - interval '2 hours', $6::timestamptz - interval '119 minutes', $6::timestamptz - interval '119 minutes', 'closed', 'completed',
               'Done.', $5)`,
      [id, site, actor, title, rating, AT]
    )
  await pool.query("update site set created_at = $1::timestamptz - interval '10 days'", [AT])
  await turn('s1:1', 'wp.tracy.test', 'owner@x.y', 'Change the phone number', 'negative')
  await turn('s1:2', 'wp.tracy.test', 'owner@x.y', 'Add a prices page', null)
  await turn('s2:1', 'demo.tracy.test', 'owner@x.y', 'On a demo site', 'negative')
  await turn('s3:1', 'wp.tracy.test', 'staff@tracy.test', 'Staff trying it', 'negative')
}

test(
  'GET /api/ops/usage: staff only; demo sites and staff turns are left out; the words are never in it',
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    await seedStaff(pool, 'staff@tracy.test', 'developer')
    await seedTurns(pool)
    const outsider = await get('/api/ops/usage', await cookieFor('owner@x.y'))
    assert.equal(outsider.status, 403)
    const res = await get('/api/ops/usage?days=7', await cookieFor('staff@tracy.test'))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.days, 7)
    assert.equal(body.turns.all.turns, 2)
    assert.equal(body.turns.wordpress.turns, 2)
    assert.equal(body.turns.joomla.turns, 0, 'the demo site is not counted')
    assert.equal(body.turns.all.feedback.negative, 1)
    assert.equal(body.canReadText, false)
    const text = JSON.stringify(body)
    assert.ok(!text.includes('phone number') && !text.includes('Done.'), 'no customer chat text')
    assert.equal(body.customers[0].email, 'owner@x.y', 'metadata names the selected customer')
  }
)

test(
  'GET /api/ops/usage/turns: only the named readers; a random sample of one group; each read is audited',
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    await seedStaff(pool, 'staff@tracy.test', 'owner')
    await seedStaff(pool, 'reviewer@tracy.test', 'developer')
    await seedTurns(pool)
    assert.equal(
      (await get('/api/ops/usage/turns?group=bad', await cookieFor('staff@tracy.test'))).status,
      403
    )
    assert.equal((await get('/api/ops/usage/turns?group=bad', await cookieFor('owner@x.y'))).status, 403)
    const reviewer = await cookieFor('reviewer@tracy.test')
    assert.equal((await (await get('/api/ops/usage', reviewer)).json()).canReadText, true)
    assert.equal((await get('/api/ops/usage/turns?group=nope', reviewer)).status, 400)
    const res = await get('/api/ops/usage/turns?group=bad&days=7', reviewer)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(
      body.turns.map((t) => [t.turnId, t.request, t.platform, t.rating]),
      [['s1:1', 'Change the phone number', 'wordpress', 'negative']]
    )
    assert.ok(!JSON.stringify(body).includes('owner@x.y'), 'who typed is never sent')
    const { rows } = await pool.query("select actor, detail from audit where action = 'ops.usage.read-turns'")
    assert.deepEqual(rows, [
      { actor: 'reviewer@tracy.test', detail: { group: 'bad', days: 7, turns: ['s1:1'] } }
    ])
  }
)

test(
  'GET /api/ops/usage: Site changes undos — a moment undo is its turn’s; a restore and a tab row revert are counted by site; a chat revert is not counted twice',
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    await seedStaff(pool, 'staff@tracy.test', 'developer')
    await seedTurns(pool)
    // s1:1 changed the site (a write) and its moment is `abc`; the press in Site changes undid that moment.
    await pool.query(
      `update site_turn set head_sha = 'abc', close_filed_at = $1::timestamptz - interval '30 hours', closed_at = $1::timestamptz - interval '30 hours',
                    opened_at = $1::timestamptz - interval '31 hours' where turn_id = 's1:1'`,
      [AT]
    )
    await pool.query(
      `insert into site_write (site_key, turn_id, session_id, actor, action, outcome, via, at) values
       ('wp.tracy.test', 's1:1', 's1', 'owner@x.y', 'content.replace', 'ok', 'apply', $1::timestamptz - interval '30 hours'),
       ('wp.tracy.test', null, null, 'owner@x.y', 'apply.revert', 'ok', 'apply', $1::timestamptz - interval '1 hour'),
       ('wp.tracy.test', null, 's1', 'owner@x.y', 'apply.revert', 'ok', 'apply', $1::timestamptz - interval '1 hour')`,
      [AT]
    )
    await pool.query(
      `insert into site_operation (site_key, action, target_sha, actor_email, status, created_at) values
       ('wp.tracy.test', 'undo', 'abc', 'owner@x.y', 'succeeded', $1::timestamptz - interval '29 hours'),
       ('wp.tracy.test', 'reset', 'def', 'owner@x.y', 'succeeded', $1::timestamptz - interval '2 hours')`,
      [AT]
    )
    const body = await (await get('/api/ops/usage?days=7', await cookieFor('staff@tracy.test'))).json()
    assert.deepEqual(
      body.siteUndos,
      { restores: 1, rowReverts: 1 },
      'the chat revert carries its conversation'
    )
    const undo = body.turns.wordpress.undo
    assert.deepEqual([undo.within24h.a, undo.within24h.b, undo.fromChat, undo.fromSiteChanges], [1, 1, 0, 1])
  }
)

test(
  'GET /api/ops/usage: research model calls are a block of their own, staff left out, chat figures untouched',
  opts,
  async () => {
    const { pool } = db
    const { get, cookieFor } = harness(pool)
    await seedStaff(pool, 'staff@tracy.test', 'developer')
    await seedTurns(pool)
    const owner = (await pool.query("insert into account (email) values ('owner@x.y') returning id")).rows[0]
      .id
    const staff = (await pool.query("select id from account where email = 'staff@tracy.test'")).rows[0].id
    const charge = (purpose, payer, accountId, tokens) =>
      pool.query(
        `insert into wo_cost_ledger (budget_day, provider, operation, reserved_cents, actual_cents, state, created_at,
           purpose, payer, payer_account_id, tokens)
         values (current_date, 'vision', 'deepseek-flash', 3, 1, 'settled', $1::timestamptz - interval '1 hour',
           $2, $3, $4, $5::jsonb)`,
        [AT, purpose, payer, accountId, tokens ? JSON.stringify(tokens) : null]
      )
    const t = {
      version: 1,
      calls: 1,
      measured: 1,
      prompt: 800,
      completion: 3200,
      reasoning: 2900,
      total: 4000
    }
    await charge('menu-photos', 'account', owner, t)
    await charge('logo', 'public', null, null)
    await charge('menu-photos', 'account', staff, t)
    const body = await (await get('/api/ops/usage?days=7', await cookieFor('staff@tracy.test'))).json()
    assert.equal(body.research.kind, 'research')
    assert.equal(body.research.all.requests, 2, 'the staff seat is not a customer')
    assert.equal(body.research.all.measuredRequests, 1)
    assert.equal(body.research.all.tokens.total, 4000)
    assert.equal(body.research.byPayer.public.requests, 1)
    assert.equal(body.research.byPayer.public.tokens, null)
    assert.deepEqual(
      body.research.accounts.map((a) => a.email),
      ['owner@x.y']
    )
    assert.equal(body.turns.all.turns, 2, 'chat requests are not research requests')
  }
)
