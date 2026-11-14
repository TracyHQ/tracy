/**
 * The site creation door asked for the step chain (#483): `POST /api/sites` with `workflow: STEP_CHAIN_WORKFLOW` and the
 * research revision it builds from, no brief. An enabled template starts the brief-build frame with that revision as the
 * brief; a revision that is not the caller's, a template not enabled or the switch off is refused before anything is
 * claimed. The host and the brief runner are doubles at the edge.
 *
 *   TEST_DATABASE_URL=… node --test --test-concurrency=1 apps/tracy-web/test/step-chain-create.test.mjs
 */
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintSession } from '../src/lib/session.js'
import { STEP_CHAIN_WORKFLOW } from '../src/lib/step-chain-switch.js'
import { dbSitesResolver } from '../src/sites/resolver.js'
import { fileDb } from './_db.mjs'
import { answerTeardown } from './_host-teardown.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const was = process.env.STEP_CHAIN_ENABLED
beforeEach(() => {
  process.env.STEP_CHAIN_ENABLED = '1'
})
afterEach(() => {
  if (was === undefined) delete process.env.STEP_CHAIN_ENABLED
  else process.env.STEP_CHAIN_ENABLED = was
})

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const env = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

/** The app at the edge; `chainDoors` answers which model doors are empty (none by default). */
function harness(pool, { chainDoors = async () => [] } = {}) {
  const provisions = []
  const started = []
  const fetchImpl = async (input, init) => {
    const teardown = answerTeardown(input, init)
    if (teardown) return teardown
    const u = new URL(String(input))
    if (u.pathname === '/_host/provision') {
      provisions.push(JSON.parse(init.body))
      return new Response(JSON.stringify({ jobId: `j-${provisions.length}` }), { status: 200 })
    }
    return new Response(null, { status: 404 })
  }
  const config = readConfig(env)
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    sites: dbSitesResolver(pool, config),
    host: { hostCall, hostJob },
    fetchImpl,
    chainDoors,
    briefs: {
      async start(input) {
        started.push(input)
        return { started: true }
      }
    }
  })
  const post = async (email, body) =>
    app.fetch(
      new Request('http://tracy.test/api/sites', {
        method: 'POST',
        headers: {
          cookie: `tracy_sess=${await mintSession(email, config.sessionSecret)}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify(body)
      })
    )
  return { post, provisions, started }
}

/** The three Joomla quickstarts the cases press, as published releases (ADR 0017). */
async function seedReleases(pool) {
  for (const [tag, label, card] of [
    ['quickstart/ja-boxing/j6', 'JA Boxing', 'ja-boxing'],
    ['quickstart/ja-diner/j6', 'JA Diner', 'ja-diner'],
    ['quickstart/ja-kinetic/j6', 'JA Kinetic', 'ja-kinetic']
  ])
    await pool.query(
      `insert into quickstart_releases (tag, release, setting, tracy, reason) values ($1, $2::jsonb, $3::jsonb, 'ready', null)`,
      [
        tag,
        JSON.stringify({ name: tag, kind: 'quickstart', github: 'published', publishedAt: null, assets: [] }),
        JSON.stringify({
          schemaVersion: 'tracy-setting/v1',
          platform: 'joomla',
          label,
          version: '1.0.11',
          cms: '6.1.1',
          card: { template: card },
          install: {
            webroot: { file: 'w.tar.gz', sha256: 'a'.repeat(64) },
            database: { file: 'd.sql.gz', sha256: 'b'.repeat(64) }
          }
        })
      ]
    )
}

/** A research revision of a fictional business, owned by `email`. */
async function revisionOf(pool, email) {
  await seedReleases(pool)
  const account = (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0]
    .id
  const opportunity = (
    await pool.query(
      `insert into wo_opportunity (account_id, name, provider, provider_id, candidate)
       values ($1, 'Harbour Padel', 'url', 'https://harbourpadel.example', '{}') returning id`,
      [account]
    )
  ).rows[0].id
  return (
    await pool.query(
      `insert into wo_revision (opportunity_id, account_id, n, brief, brief_md, asset_manifest)
       values ($1, $2, 1, '{"business":{"name":"Harbour Padel"}}', '', '[]') returning id`,
      [opportunity, account]
    )
  ).rows[0].id
}

const press = (revision, over = {}) => ({
  label: 'harbourpadel',
  platform: 'joomla',
  design: 'ja-boxing',
  quickstart: 'quickstart/ja-boxing/j6',
  workflow: STEP_CHAIN_WORKFLOW,
  researchRevisionId: revision,
  ...over
})

for (const design of ['ja-boxing', 'ja-diner'])
  test(
    `the enabled ${design} template starts the frame with the research revision as its brief`,
    opts,
    async () => {
      const { pool } = db
      const revision = await revisionOf(pool, 'owner@example.test')
      const h = harness(pool)
      const res = await h.post(
        'owner@example.test',
        press(revision, { design, quickstart: `quickstart/${design}/j6` })
      )
      assert.equal(res.status, 202, await res.text())
      assert.equal(h.provisions.length, 1, 'the base site is created from the quickstart')
      assert.equal(h.started.length, 1)
      assert.deepEqual(h.started[0].brief, {
        about: '',
        goal: null,
        style: null,
        workflow: STEP_CHAIN_WORKFLOW,
        researchRevisionId: revision
      })
      assert.equal(h.started[0].quickstart, `quickstart/${design}/j6`)
      assert.equal(h.provisions[0].quickstart, `quickstart/${design}/j6`)
    }
  )

test(
  'the step chain is refused, with nothing claimed, for another account’s revision, a template not enabled or the switch off',
  opts,
  async () => {
    const { pool } = db
    const revision = await revisionOf(pool, 'owner@example.test')
    await pool.query(`insert into account (email) values ('stranger@example.test')`)
    const h = harness(pool)
    const cases = [
      ['stranger@example.test', press(revision), 404, 'RESEARCH_REVISION_UNKNOWN'],
      [
        'owner@example.test',
        press(revision, { design: 'ja-kinetic', quickstart: 'quickstart/ja-kinetic/j6' }),
        409,
        'STEP_CHAIN_OFF'
      ],
      ['owner@example.test', press('not-a-revision'), 400, 'INVALID_RESEARCH_REVISION'],
      ['owner@example.test', press(revision, { brief: { about: 'typed' } }), 400, 'STEP_CHAIN_BRIEF_GIVEN']
    ]
    for (const [email, body, status, code] of cases) {
      const res = await h.post(email, body)
      assert.equal(res.status, status, `${code}: ${await res.clone().text()}`)
      assert.equal((await res.json()).code, code)
    }
    process.env.STEP_CHAIN_ENABLED = '0'
    for (const design of ['ja-boxing', 'ja-diner']) {
      const off = await h.post(
        'owner@example.test',
        press(revision, { design, quickstart: `quickstart/${design}/j6` })
      )
      assert.equal(off.status, 409)
      assert.equal((await off.json()).code, 'STEP_CHAIN_OFF')
    }
    assert.equal(h.provisions.length, 0)
    assert.equal(h.started.length, 0)
    assert.equal((await pool.query('select count(*)::int as n from site')).rows[0].n, 0)
  }
)

test(
  'an empty model door refuses the press before the base site is created or the frame starts',
  opts,
  async () => {
    const { pool } = db
    const revision = await revisionOf(pool, 'owner@example.test')
    let asked = 0
    const h = harness(pool, {
      chainDoors: async () => ((asked += 1), [{ door: 'siteWriter', state: 'unassigned' }])
    })
    const res = await h.post('owner@example.test', press(revision))
    assert.equal(res.status, 409, await res.clone().text())
    assert.equal((await res.json()).code, 'STEP_CHAIN_DOORS_EMPTY')
    assert.equal(asked, 1)
    assert.equal(h.provisions.length, 0, 'no base site is created')
    assert.equal(h.started.length, 0)
    assert.equal((await pool.query('select count(*)::int as n from site')).rows[0].n, 0)
  }
)

/** An approved build of a build chat draft (#610, `build_draft.build`), owned by `email`. */
async function approvedDraftOf(pool, email) {
  await seedReleases(pool)
  const account = (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0]
    .id
  const plan = { id: 'plan-harbour', revision: 3, facts: [{ kind: 'business.name', value: 'Harbour Padel' }] }
  const build = {
    id: '5d2c1b0a-9e8f-4a7b-8c6d-5e4f3a2b1c0d',
    plan: { id: plan.id, revision: plan.revision },
    approvedAt: '2026-11-14T10:00:00.000Z',
    snapshot: { plan, lastEdit: null, profile: {}, research: {} },
    site: null,
    refusal: null,
    endedAt: null
  }
  const draft = (
    await pool.query(
      `insert into build_draft (account_id, plan, build) values ($1, $2::jsonb, $3::jsonb) returning id`,
      [account, JSON.stringify(plan), JSON.stringify(build)]
    )
  ).rows[0].id
  return { draftId: draft, plan: build.plan }
}

const pressDraft = ({ draftId, plan }, over = {}) => ({
  label: 'harbourpadel',
  platform: 'joomla',
  design: 'ja-boxing',
  quickstart: 'quickstart/ja-boxing/j6',
  workflow: STEP_CHAIN_WORKFLOW,
  draftId,
  plan,
  ...over
})

test(
  'an approved build chat draft starts the frame with the draft and its plan, named by the plan',
  opts,
  async () => {
    const { pool } = db
    const draft = await approvedDraftOf(pool, 'owner@example.test')
    const h = harness(pool)
    const res = await h.post('owner@example.test', pressDraft(draft))
    assert.equal(res.status, 202, await res.clone().text())
    assert.equal(h.provisions.length, 1)
    assert.equal(h.started.length, 1)
    assert.equal(h.started[0].brief.workflow, STEP_CHAIN_WORKFLOW)
    assert.equal(h.started[0].brief.draftId, draft.draftId)
    assert.deepEqual(h.started[0].brief.plan, draft.plan)
    assert.equal(h.started[0].brief.researchRevisionId, undefined)
    assert.ok(h.started[0].accountId)
  }
)

test(
  'a draft that is not approved for that plan, or not the caller’s, is refused before anything is claimed',
  opts,
  async () => {
    const { pool } = db
    const draft = await approvedDraftOf(pool, 'owner@example.test')
    await pool.query(`insert into account (email) values ('stranger@example.test')`)
    const h = harness(pool)
    const cases = [
      ['stranger@example.test', pressDraft(draft), 404, 'BUILD_DRAFT_NOT_APPROVED'],
      [
        'owner@example.test',
        pressDraft({ ...draft, plan: { id: 'plan-harbour', revision: 2 } }),
        404,
        'BUILD_DRAFT_NOT_APPROVED'
      ],
      ['owner@example.test', pressDraft({ ...draft, draftId: 'nope' }), 400, 'INVALID_BUILD_DRAFT'],
      [
        'owner@example.test',
        pressDraft(draft, { researchRevisionId: draft.draftId }),
        400,
        'INVALID_BUILD_DRAFT'
      ]
    ]
    for (const [email, body, status, code] of cases) {
      const res = await h.post(email, body)
      assert.equal(res.status, status, `${code}: ${await res.clone().text()}`)
      assert.equal((await res.json()).code, code)
    }
    assert.equal(h.provisions.length, 0)
    assert.equal(h.started.length, 0)
  }
)
