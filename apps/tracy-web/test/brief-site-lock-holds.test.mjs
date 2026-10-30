/**
 * Which sites a brief build holds (`briefBuildHoldsSite`, #189): the rows are written by the real writers on the real
 * schema. Since migration 165 a site brief is template-free and the workflow lives on the build's frozen choice
 * (`wo_build.choice.quickstartWorkflow`), never on the revision's brief, so a reader of the brief never finds a brief build
 * and the rebuilding lock is never taken (R12, 30/10/2026). Fictional businesses of two trades.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { fileDb } from './_db.mjs'
import { insertBuild } from '../src/opportunities-build/build-store.js'
import { briefBuildHoldsSite } from '../src/opportunities-build/build-site-lock.js'
import { BRIEF_BUILD } from '../src/opportunities-build/brief-build-path.js'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

/** A template-free brief revision as the brief writer leaves it: business facts, no CMS, no workflow. */
async function revisionOf(pool, name) {
  const account = (
    await pool.query('insert into account (email) values ($1) returning id', [`${name}@example.test`])
  ).rows[0].id
  const opp = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id) values ($1, $2, 'osm', $3) returning id`,
      [account, name, `n/${name}`]
    )
  ).rows[0].id
  const brief = { business: { name, phone: '555 0142' }, acceptance: [] }
  const rev = (
    await pool.query(
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md) values ($1, $2, 1, $3::jsonb, $4) returning id`,
      [opp, account, JSON.stringify(brief), name]
    )
  ).rows[0].id
  return { account, rev }
}

/** One build of `workflow` on `siteKey`, written by the build store's own writer. */
async function buildOn(pool, siteKey, name, workflow) {
  const { account, rev } = await revisionOf(pool, name)
  await pool.query(
    `insert into site (site_key, label, host, platform) values ($1, $2, 'fleet-1', 'joomla')`,
    [siteKey, siteKey.split('.')[0]]
  )
  const choice = {
    cms: 'joomla',
    cmsSource: 'default',
    template: { platform: 'joomla', quickstart: 'fixture', design: 'fixture', version: '1' },
    ...(workflow ? { quickstartWorkflow: workflow } : {})
  }
  const { row } = await insertBuild(pool, {
    accountId: account,
    revisionId: rev,
    requestId: `req-${name}`,
    buildId: crypto.randomUUID(),
    choice
  })
  await pool.query(`update wo_build set site_key = $2, state = 'provisioning' where id = $1`, [
    row.id,
    siteKey
  ])
  return row
}

const TRADES = [
  { name: 'Harbour Bike Repair', siteKey: 'harbour-bikes.tracy.test' },
  { name: 'Juniper Pottery Studio', siteKey: 'juniper-pottery.tracy.test' }
]

for (const { name, siteKey } of TRADES) {
  test(`${name}: a brief build, whose workflow is on its choice, holds its site`, opts, async () => {
    await buildOn(db.pool, siteKey, name, BRIEF_BUILD)
    assert.equal(await briefBuildHoldsSite(db.pool, siteKey), true)
  })

  test(
    `${name}: a quickstart-first build does not hold its site, nor does a deleted brief build`,
    opts,
    async () => {
      const build = await buildOn(db.pool, siteKey, name, 'quickstart-first/1')
      assert.equal(await briefBuildHoldsSite(db.pool, siteKey), false)
      await db.pool.query(
        `update wo_build set choice = choice || jsonb_build_object('quickstartWorkflow', $2::text), state = 'deleted'
        where id = $1`,
        [build.id, BRIEF_BUILD]
      )
      assert.equal(await briefBuildHoldsSite(db.pool, siteKey), false)
    }
  )
}
