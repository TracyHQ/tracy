// LLM usage of Website Opportunities research: who it counts against (`payer`), what it was for
// (`purpose`) and the tokens the provider reported (`tokens`, NULL when none), kept apart from the
// chat panel's `site_turn` tokens on /ops › Beta › Usage (plan tasks/plan-wo-research-usage.md).
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { createCostLedger, withCharge } from 'website-opportunities/src/cost-ledger.js'
import { joinPlace, admitPublicResearch } from 'website-opportunities/src/place-jobs.js'
import { payerOfPlaceJob } from 'website-opportunities/src/place-executor.js'
import { modelTokensOf } from 'website-opportunities/src/wo-model-tokens.js'
import { refreshPlace, requeuePlaceFor } from 'website-opportunities/src/wo-places-store.js'
import { readResearchUsage, summarizeResearchUsage } from '../src/lib/ops-usage-research.js'
import { principalOf } from '../src/lib/wo-principal.js'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const JOB = '00000000-0000-4000-8000-00000000000a'

// ── tokens ───────────────────────────────────────────────────────────────────────────────────────

test('provider usage becomes one snapshot; reasoning stays inside completion', () => {
  assert.deepEqual(
    modelTokensOf([
      {
        prompt_tokens: 1000,
        completion_tokens: 400,
        total_tokens: 1400,
        completion_tokens_details: { reasoning_tokens: 300 }
      }
    ]),
    { version: 1, calls: 1, measured: 1, prompt: 1000, completion: 400, reasoning: 300, total: 1400 }
  )
})

test('no usage reported is NULL, never zero; a partial batch says how many calls were measured', () => {
  assert.equal(modelTokensOf([null]), null)
  assert.equal(modelTokensOf([]), null)
  assert.equal(modelTokensOf([{}]), null)
  assert.deepEqual(modelTokensOf([{ prompt_tokens: 10, completion_tokens: 5 }, null]), {
    version: 1,
    calls: 2,
    measured: 1,
    prompt: 10,
    completion: 5,
    reasoning: null,
    total: 15
  })
  // A total the provider did not send is not made up from half a report.
  assert.equal(modelTokensOf([{ prompt_tokens: 10 }]).total, null)
  // A provider that reports zero is kept as zero.
  assert.equal(modelTokensOf([{ prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }]).total, 0)
})

// ── ledger ───────────────────────────────────────────────────────────────────────────────────────

const ledgerOf = (pool) =>
  createCostLedger({
    pool,
    now: () => Date.parse('2026-10-23T10:00:00Z'),
    caps: async () => ({ dailyCapCents: 1000, jobCapCents: 1000 })
  })

async function account(pool, email) {
  return (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0].id
}

test(
  'a model charge keeps its payer, purpose and reported tokens, and never touches account_id',
  opts,
  async () => {
    const { pool } = db
    const who = await account(pool, 'owner@example.com')
    await withCharge(
      ledgerOf(pool),
      {
        provider: 'vision',
        operation: 'deepseek-flash',
        maxCents: 2,
        jobId: JOB,
        purpose: 'menu-photos',
        payer: { kind: 'account', accountId: who },
        actualCents: () => 1,
        tokens: (r) => modelTokensOf([r.usage])
      },
      async () => ({ usage: { prompt_tokens: 900, completion_tokens: 3000, total_tokens: 3900 } })
    )
    const row = (await pool.query('select * from wo_cost_ledger')).rows[0]
    assert.equal(row.account_id, null)
    assert.equal(row.payer, 'account')
    assert.equal(row.payer_account_id, who)
    assert.equal(row.purpose, 'menu-photos')
    assert.equal(row.tokens.total, 3900)
    assert.equal(row.actual_cents, 1)
  }
)

test('an answer without usage leaves tokens NULL; a public run has no account', opts, async () => {
  const { pool } = db
  await withCharge(
    ledgerOf(pool),
    {
      provider: 'vision',
      operation: 'deepseek-flash',
      maxCents: 2,
      jobId: JOB,
      purpose: 'logo',
      payer: { kind: 'public' },
      tokens: (r) => modelTokensOf([r.usage])
    },
    async () => ({ usage: null })
  )
  const row = (await pool.query('select * from wo_cost_ledger')).rows[0]
  assert.equal(row.tokens, null)
  assert.equal(row.payer, 'public')
  assert.equal(row.payer_account_id, null)
})

test(
  'the database refuses zero-filled or inconsistent token snapshots and unknown payers',
  opts,
  async () => {
    const { pool } = db
    const insert = (tokens, payer = null) =>
      pool.query(
        `insert into wo_cost_ledger (budget_day, provider, operation, reserved_cents, tokens, payer)
       values ('2026-10-23','vision','m',1,$1::jsonb,$2)`,
        [tokens == null ? null : JSON.stringify(tokens), payer]
      )
    await assert.rejects(insert({ version: 1, calls: 1, measured: 2, total: 1 }))
    await assert.rejects(insert({ version: 1, calls: 1, measured: 0, total: 0 }))
    await assert.rejects(insert({ version: 1, calls: 'x', measured: 1.5, total: 1 }), /check constraint/)
    await assert.rejects(insert(null, 'somebody'))
    await insert(null, null)
  }
)

// ── who started the shared run ──────────────────────────────────────────────────────────────────

async function place(pool) {
  return (await pool.query("insert into wo_place (display_name) values ('Cafe') returning id")).rows[0].id
}

async function join(pool, placeId, options) {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const joined = await joinPlace(client, placeId, options)
    await client.query('commit')
    return joined
  } finally {
    client.release()
  }
}

test('the account that created the run pays; one who joins it later does not', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'a@example.com')
  const b = await account(pool, 'b@example.com')
  const p = await place(pool)
  const first = await join(pool, p, { starter: { kind: 'account', accountId: a } })
  const second = await join(pool, p, { starter: { kind: 'account', accountId: b } })
  assert.equal(second.job.id, first.job.id)
  const job = (await pool.query('select * from wo_place_job where id=$1', [first.job.id])).rows[0]
  assert.deepEqual(payerOfPlaceJob(job), { kind: 'account', accountId: a })
})

test('a stopped run started again is paid by whoever started it again', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'a@example.com')
  const b = await account(pool, 'b@example.com')
  const p = await place(pool)
  const first = await join(pool, p, { starter: { kind: 'account', accountId: a } })
  await pool.query("update wo_place_job set state='paused' where id=$1", [first.job.id])
  const again = await join(pool, p, { starter: { kind: 'account', accountId: b } })
  assert.equal(again.job.id, first.job.id)
  assert.deepEqual(payerOfPlaceJob(again.job), { kind: 'account', accountId: b })
})

test('a restart with no known starter keeps the payer already recorded', opts, async () => {
  const { pool } = db
  const a = await account(pool, 'a@example.com')
  const p = await place(pool)
  const first = await join(pool, p, { starter: { kind: 'account', accountId: a } })
  await pool.query("update wo_place_job set state='paused' where id=$1", [first.job.id])
  const again = await join(pool, p, {})
  assert.deepEqual(payerOfPlaceJob(again.job), { kind: 'account', accountId: a })
})

test(
  "an operator retry of a customer opportunity is the owner's research; a plain refresh is the operator's",
  opts,
  async () => {
    const { pool } = db
    const owner = await account(pool, 'owner@example.com')
    const op = await account(pool, 'ops@tracy.test')
    const p = await place(pool)
    const opp = (
      await pool.query(
        `insert into wo_opportunity (account_id, name, provider, provider_id, place_id)
       values ($1, 'Cafe', 'google-places', 'x', $2) returning id`,
        [owner, p]
      )
    ).rows[0].id
    const client = await pool.connect()
    try {
      await client.query('begin')
      const job = await requeuePlaceFor(client, p, opp, { actor: 'ops@tracy.test', action: 'retry' })
      await client.query('commit')
      assert.deepEqual(payerOfPlaceJob(job), { kind: 'account', accountId: owner })
    } finally {
      client.release()
    }
    const p2 = await place(pool)
    await refreshPlace(pool, p2, { actor: 'ops@tracy.test', caps: null, nowMs: Date.now(), principalOf })
    const job = (await pool.query('select * from wo_place_job where place_id=$1', [p2])).rows[0]
    assert.deepEqual(payerOfPlaceJob(job), { kind: 'operator', accountId: op })
  }
)

test('a public /find run is the public bucket; a campaign run has no person', opts, async () => {
  const { pool } = db
  const p = await place(pool)
  const answer = await admitPublicResearch(pool, {
    placeId: p,
    providerId: 'google:x',
    ipBucket: 'ip',
    now: Date.parse('2026-10-23T10:00:00Z'),
    limits: { perDay: 10, perAddressDay: 10, budgetCents: 1000, jobCapCents: 10 }
  })
  assert.ok(answer.receipt)
  const job = (await pool.query('select * from wo_place_job where place_id=$1', [p])).rows[0]
  assert.deepEqual(payerOfPlaceJob(job), { kind: 'public' })
  assert.deepEqual(payerOfPlaceJob({ started_by: null, prefetch_campaign_id: 'c1' }), { kind: 'campaign' })
  // A run from before the migration is unknown, not "nobody".
  assert.equal(payerOfPlaceJob({ started_by: null, prefetch_campaign_id: null }), null)
})

// ── /ops › Usage ────────────────────────────────────────────────────────────────────────────────

const row = (over = {}) => ({
  created_at: '2026-10-23T10:00:00Z',
  purpose: 'menu-photos',
  payer: 'account',
  email: 'owner@example.com',
  tokens: { version: 1, calls: 1, measured: 1, prompt: 100, completion: 50, reasoning: 20, total: 150 },
  cents: 1,
  ...over
})

test('research figures: counts, measured coverage, cents, and no median under 20', () => {
  const r = summarizeResearchUsage([row(), row({ tokens: null }), row({ purpose: 'logo' })], {
    audience: 'all',
    staff: new Set()
  })
  assert.equal(r.kind, 'research')
  assert.equal(r.all.requests, 3)
  assert.equal(r.all.measuredRequests, 2)
  assert.deepEqual(r.all.tokens, { total: 300, prompt: 200, completion: 100, reasoning: 40 })
  assert.equal(r.all.cents, 3)
  assert.deepEqual(r.all.perRequest, { n: 2, median: null, p90: null })
  assert.equal(r.byPurpose['menu-photos'].requests, 2)
  assert.equal(r.byPurpose.logo.requests, 1)
})

test("the finished demo's look check is its own purpose, not 'other'", () => {
  const r = summarizeResearchUsage([row({ purpose: 'demo-look' })], { audience: 'all', staff: new Set() })
  assert.equal(r.byPurpose['demo-look']?.requests, 1)
  assert.equal(r.byPurpose.other, undefined)
})

test('the median needs 20 measured requests and p90 needs 100', () => {
  const rows = Array.from({ length: 20 }, (_, i) =>
    row({
      tokens: { version: 1, calls: 1, measured: 1, prompt: i, completion: 0, reasoning: null, total: i + 1 }
    })
  )
  const r = summarizeResearchUsage(rows, { audience: 'all', staff: new Set() })
  assert.equal(r.all.perRequest.median, 10)
  assert.equal(r.all.perRequest.p90, null)
  assert.equal(r.all.tokens.reasoning, null)
})

test('no measured request: tokens are null, not zero', () => {
  const r = summarizeResearchUsage([row({ tokens: null })], { audience: 'all', staff: new Set() })
  assert.equal(r.all.tokens, null)
})

test('staff are left out of the customers view; the public bucket is its own line', () => {
  const rows = [
    row({ email: 'staff@tracy.test' }),
    row({ email: 'owner@example.com' }),
    row({ payer: 'public', email: null }),
    row({ payer: 'campaign', email: null }),
    row({ payer: null, email: null })
  ]
  const r = summarizeResearchUsage(rows, { audience: 'customers', staff: new Set(['staff@tracy.test']) })
  assert.equal(r.all.requests, 2)
  assert.equal(r.byPayer.account.requests, 1)
  assert.equal(r.byPayer.public.requests, 1)
  assert.equal(r.byPayer.campaign, undefined)
  assert.deepEqual(
    r.accounts.map((a) => a.email),
    ['owner@example.com']
  )
  const all = summarizeResearchUsage(rows, { audience: 'all', staff: new Set(['staff@tracy.test']) })
  assert.equal(all.all.requests, 5)
  assert.equal(all.byPayer.campaign.requests, 1)
  assert.equal(all.byPayer.unrecorded.requests, 1)
  const staff = summarizeResearchUsage(rows, { audience: 'staff', staff: new Set(['staff@tracy.test']) })
  assert.deepEqual(
    staff.accounts.map((a) => a.email),
    ['staff@tracy.test']
  )
  assert.equal(staff.byPayer.public, undefined)
})

test(
  'the reader returns ledger model rows of the window with the payer email; released calls are not counted',
  opts,
  async () => {
    const { pool } = db
    const who = await account(pool, 'owner@example.com')
    const insert = (state, at, extra = '') =>
      pool.query(
        `insert into wo_cost_ledger (budget_day, provider, operation, reserved_cents, actual_cents, state, created_at,
         purpose, payer, payer_account_id${extra ? ', tokens' : ''})
       values ('2026-10-23','vision','deepseek-flash',3,1,$1,$2,'menu-photos','account',$3${extra ? `,'${extra}'::jsonb` : ''})`,
        [state, at, who]
      )
    await insert('settled', '2026-10-23T10:00:00Z', '{"version":1,"calls":1,"measured":1,"total":7}')
    await insert('released', '2026-10-23T10:00:00Z')
    await insert('settled', '2026-09-01T10:00:00Z')
    await pool.query(
      `insert into wo_cost_ledger (budget_day, provider, operation, reserved_cents, state, created_at)
     values ('2026-10-23','google','place-details',3,'settled','2026-10-23T10:00:00Z')`
    )
    const rows = await readResearchUsage(pool, {
      start: new Date('2026-10-20T00:00:00Z'),
      observedEnd: new Date('2026-10-24T00:00:00Z')
    })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].email, 'owner@example.com')
    assert.equal(rows[0].cents, 1)
    assert.equal(rows[0].tokens.total, 7)
  }
)

// ── no OpenRouter in research ───────────────────────────────────────────────────────────────────

test('research model calls share the vision resolver without naming a provider or reading environment keys', () => {
  const dir = new URL('../../../packages/wo/website-opportunities/src/', import.meta.url)
  const research = [
    'research-vision.js',
    'menu-photo-reading.js',
    'place-logo.js',
    'place-executor.js',
    'place-jobs.js'
  ]
  for (const name of research) {
    const text = readFileSync(new URL(name, dir), 'utf8')
    assert.doesNotMatch(text, /openrouter/i, name)
    assert.doesNotMatch(text, /TRACY_VISION_|process\.env/, name)
  }
  assert.match(
    readFileSync(new URL('research-vision.js', dir), 'utf8'),
    /lookupDoor\(pool, 'vision', secret\)/
  )
  assert.ok(readdirSync(dir).includes('place-logo.js'))
})
