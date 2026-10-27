// ADR 0036 decisions 2/3/8: the open Website Opportunities layer runs on a database without the demo
// build tables. With no builder, a row's stage and attention come from its research alone, and Find
// answers its candidates without a demo status.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { migrate } from '../src/db/index.js'
import { findResearchOf, withResearch } from 'website-opportunities/src/find-research.js'
import {
  countMatching,
  countStages,
  latestJobIdsMatching,
  listOpportunities
} from 'website-opportunities/src/store.js'
import { scratchPool } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

let scratch = null
let account = null
before(async () => {
  if (!process.env.TEST_DATABASE_URL) return
  scratch = await scratchPool()
  await migrate(scratch.pool)
  await scratch.pool.query('drop table wo_demo_action, wo_build, wo_revision cascade')
  account = (await scratch.pool.query(`insert into account (email) values ('open@tracy.test') returning id`))
    .rows[0].id
})
after(() => scratch?.close())

let seq = 0
async function seed(jobs) {
  const created = new Date(Date.UTC(2026, 0, 1) + ++seq * 1000)
  const { rows } = await scratch.pool.query(
    `insert into wo_opportunity (account_id, name, provider, provider_id, candidate, created_at)
     values ($1, $2, 'osm', $3, '{}'::jsonb, $4) returning id`,
    [account, `Place ${seq}`, `node/${seq}`, created]
  )
  for (const [i, state] of jobs.entries())
    await scratch.pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id, state, created_at)
       values ($1, $2, 'research', $3, $4, $5)`,
      [account, rows[0].id, `r-${seq}-${i}`, state, new Date(created.getTime() + i + 1)]
    )
  return rows[0].id
}

test('with no build tables and no builder, stage and attention come from research only', opts, async () => {
  const fresh = await seed([])
  const failed = await seed(['failed'])
  const researched = await seed(['completed'])
  const paused = await seed(['completed', 'paused'])
  const cancelled = await seed(['cancelled'])
  const { rows, nextCursor } = await listOpportunities(scratch.pool, account)
  const byId = new Map(rows.map((r) => [r.id, [r.stage, r.attention]]))
  assert.deepEqual(Object.fromEntries(byId), {
    [fresh]: ['research', false],
    [failed]: ['research', true],
    [researched]: ['demo', false],
    [paused]: ['demo', true],
    [cancelled]: ['cancelled', false]
  })
  assert.equal(nextCursor, null)
  assert.deepEqual(await countStages(scratch.pool, account), {
    all: 5,
    research: 1,
    demo: 1,
    outreach: 0,
    cancelled: 1,
    attention: 2
  })
  const page = await listOpportunities(scratch.pool, account, { stage: 'demo', attention: true, limit: 1 })
  assert.deepEqual(
    page.rows.map((r) => r.id),
    [paused]
  )
  assert.equal(await countMatching(scratch.pool, account, { attention: true }), 2)
  assert.equal((await latestJobIdsMatching(scratch.pool, account, { stage: 'cancelled' }, 10)).length, 1)
})

test('with no build tables and no builder, Find reads research and offers no demo', opts, async () => {
  const id = await seed(['completed'])
  await scratch.pool.query(`insert into wo_profile (opportunity_id, profile) values ($1, '{"name":"P"}')`, [
    id
  ])
  const candidate = { provider: 'osm', providerId: `node/${seq}`, name: 'P' }
  const [row] = await findResearchOf(scratch.pool, [candidate], account)
  const found = withResearch(candidate, row)
  assert.equal(found.status, 'researched')
  assert.deepEqual(found.findAction, { kind: 'build', opportunityId: id })
})
