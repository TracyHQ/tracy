// Website Opportunities doors (tasks/spec-website-opportunities-contracts.md §4): owner isolation,
// the operator switch, the account's Default CMS, immutable revisions, and builds that go through
// `POST /api/sites` exactly once per request id with the revision's CMS. The domain is the real
// package (`packages/wo/website-opportunities/domain`) with the network-facing parts replaced.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { sealSecret } from '../src/lib/secret-box.js'
import { mintSession } from '../src/lib/session.js'
import { saveWoOpsSettings } from 'website-opportunities/src/wo-settings.js'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { chooseTemplate } from '../src/opportunities-build/revisions.js'
import { settleEndedBuilds } from '../src/opportunities-build/builds.js'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

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

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const CARDS = [
  {
    id: 'tracy-business',
    label: 'Tracy Business',
    // Generic is read in the description (26/10/2026): a name alone no longer makes a template fit any business.
    card: { blurb: 'A business website for any company: services, team and contact.' },
    platforms: [
      { platform: 'joomla', tag: 'tracy-business/j6', version: '1.2.0' },
      { platform: 'wordpress', tag: 'tracy-business/wp', version: '1.0.0' }
    ]
  },
  {
    id: 'ja-restaurant',
    label: 'JA Restaurant',
    card: { blurb: 'A restaurant template' },
    platforms: [{ platform: 'joomla', tag: 'ja-restaurant/j6', version: '2.0.1' }]
  }
]

const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }]

async function world({ cards = CARDS, resolve = PUBLIC, objects, extraEnv = {}, domainOverrides = {} } = {}) {
  /** Every URL the app's own fetch was asked for (providers, crawls): the test world has no network. */
  const fetched = []
  const { pool } = db
  const config = readConfig({ ...env, ...extraEnv })
  const real = await websiteOpportunitiesDomain()
  const domain = {
    ...real,
    geocode: async () => ({ label: 'Hoi An', lat: 15.88, lon: 108.33 }),
    approxLocationOf: async (ip) => {
      approxAsked.push(ip)
      return {
        lat: 25.07,
        lon: 55.3,
        label: 'Dubai, United Arab Emirates',
        country: 'AE',
        accuracy: 'city',
        provider: 'ipinfo'
      }
    },
    discoverRestaurants: async (area, deps) => {
      discoverAsked.push({ area, deps })
      return {
        provider: state.discoverProvider ?? 'osm',
        candidates: state.candidates ?? [
          { provider: 'osm', providerId: 'node/1', name: 'Pho Ba', lat: 15.88, lon: 108.33, socials: {} }
        ]
      }
    },
    ...domainOverrides
  }
  const discoverAsked = []
  const forwarded = []
  const approxAsked = []
  const sessionsMade = []
  const qaAsked = []
  const prompts = []
  const state = { cards }
  const request = async (path, init = {}) => {
    forwarded.push({ path, init })
    if (path === '/api/templates') return Response.json({ readAt: null, templates: state.cards })
    if (path.startsWith('/api/sites/questions?')) {
      if (state.questionsDown) return Response.json({ code: 'DOWN' }, { status: 503 })
      return Response.json({
        set: { contentHash: 'c'.repeat(64) },
        questions: [
          { id: 'name', kind: 'text' },
          { id: 'about', kind: 'longtext' },
          {
            id: 'pages',
            kind: 'multi',
            feeds: ['site.pages'],
            options: ['home', 'about', 'pricing', 'contact'],
            locked: ['home']
          }
        ]
      })
    }
    if (path === '/api/sites') {
      if (state.refuseCreate) {
        state.refuseCreate = false
        return Response.json({ code: 'FLEET_REFUSED' }, { status: 502 })
      }
      const body = JSON.parse(init.body)
      if (!/^[a-z0-9-]+$/.test(body.label)) return Response.json({ code: 'INVALID_LABEL' }, { status: 400 })
      const owner = (await pool.query('select account_id from wo_build where build_id=$1', [body.buildId]))
        .rows[0]?.account_id
      if (owner)
        await pool.query(
          `insert into site_creation(account_id,build_id,payload_hash,state,job_id)
        values($1,$2,'test','provisioning','job-1') on conflict(account_id,build_id) do update set state='provisioning'`,
          [owner, body.buildId]
        )
      return Response.json(
        { siteKey: `${body.label}.localhost`, label: body.label, buildId: body.buildId, jobId: 'job-1' },
        { status: 201 }
      )
    }
    if (/^\/api\/sites\/[^/]+\/jobs\/job-1$/.test(path)) {
      const result = state.siteJobBody ?? { state: state.siteJob ?? 'done' }
      if (result.state === 'done')
        await pool.query(
          `update site_creation set state='done' where build_id in(select build_id::text from wo_build where site_key=$1)`,
          [decodeURIComponent(path.split('/')[3])]
        )
      return Response.json(result)
    }
    if (/^\/api\/sites\/[^/]+\/apply$/.test(path))
      return Response.json(state.refuseUploads ? { ok: false, error: 'bad_params' } : { ok: true })
    return Response.json({ code: 'UNEXPECTED' }, { status: 500 })
  }
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    websiteOpportunitiesDomain: async () => domain,
    websiteOpportunitiesRequest: request,
    ...(objects ? { websiteOpportunitiesObjects: objects } : {}),
    websiteOpportunitiesDemoQa: async (site, payload) => {
      qaAsked.push({ site, payload })
      if (state.qaHold) await state.qaHold
      if (state.qaAnswer) return state.qaAnswer
      return {
        ok: true,
        status: 200,
        body: {
          checks: [{ id: 'pages-load', pass: true, measured: '1/1', expected: 'x', detail: [] }],
          baseline: {
            cssRules: { 't.css': { rules: 10, sentinel: '.x{}', page: '/' } },
            pictures: { files: [], shas: [] },
            texts: []
          },
          pages: ['/', '/menu'],
          durationMs: 5
        }
      }
    },
    websiteOpportunitiesSessionAhead: async (site, email, held) => {
      sessionsMade.push({ site: site.site_key, email })
      return state.noSession ? null : held
    },
    websiteOpportunitiesPrompt: async (site, email, sessionId, requestId, text) => {
      prompts.push({ site: site.site_key, email, sessionId, requestId, text })
      return !state.promptRefused
    },
    dnsResolve: resolve,
    fetchImpl: async (u) => {
      fetched.push(String(u))
      return Response.json({ code: 'NO_NETWORK' }, { status: 500 })
    }
  })
  // Since 24/10/2026 a brief names no template and the build door from a revision is gone. These cases kept their
  // two steps (a brief "with" a template, then Build): the template asked for is remembered per opportunity and
  // the build goes through the real door, `POST /:id/demo/build`, with that choice as the selection.
  const asked = new Map()
  const call = async (email, method, path, body, extra = {}) => {
    const brief =
      method === 'POST' && path.match(/^\/api\/website-opportunities\/([0-9a-f-]{36})\/revisions$/)
    if (brief && body && 'template' in body) {
      asked.set(brief[1], body.template)
      const { template: _template, ...rest } = body
      body = rest
    }
    const build = method === 'POST' && path.match(/^\/api\/website-opportunities\/revisions\/([^/]+)\/build$/)
    if (build) return buildThroughAction(email, build[1], body ?? {}, extra)
    // `manual: true` (test-only): the demo action stops at the provisioned site, as a manual build does.
    if (method === 'POST' && body?.manual === true && path.endsWith('/demo/build')) {
      const { manual: _manual, ...rest } = body
      const answer = await rawCall(email, method, path, rest, extra)
      if (answer.status === 202)
        await pool.query('update wo_demo_action set automatic = false where id = any($1::uuid[])', [
          answer.body.actions.map((a) => a.id)
        ])
      return answer
    }
    return rawCall(email, method, path, body, extra)
  }
  async function buildThroughAction(email, revisionId, body, extra) {
    const rev = /^[0-9a-f-]{36}$/.test(revisionId)
      ? (await pool.query('select opportunity_id, account_id from wo_revision where id = $1', [revisionId]))
          .rows[0]
      : null
    if (!rev) return rawCall(email, 'POST', `${BASE}/revisions/${revisionId}/build`, body, extra)
    const template = asked.get(rev.opportunity_id)
    const pref = (await pool.query('select cms from wo_preference where account_id = $1', [rev.account_id]))
      .rows[0]
    const ops =
      (await pool.query('select settings from wo_ops_setting where id = true')).rows[0]?.settings ?? {}
    const cms = pref?.cms ?? ops.defaultCms ?? 'joomla'
    const card = template && state.cards.find((c) => c.id === template.design)
    const platform = card?.platforms?.find((p) => p.tag === template.quickstart)?.platform
    const selection = template
      ? { cms: platform ?? cms, design: template.design, quickstart: template.quickstart }
      : { cms }
    const answer = await rawCall(
      email,
      'POST',
      `${BASE}/${rev.opportunity_id}/demo/build`,
      {
        requestId: body.actionId ?? body.requestId,
        selection,
        ...(typeof body.label === 'string' ? { label: body.label } : {})
      },
      extra
    )
    // The old door stopped at the provisioned site unless asked for more (`automatic`).
    if (answer.status === 202 && body.automatic !== true)
      await pool.query('update wo_demo_action set automatic = false where id = any($1::uuid[])', [
        answer.body.actions.map((a) => a.id)
      ])
    return answer
  }
  const rawCall = async (email, method, path, body, extra = {}) => {
    const headers = { origin: 'http://tracy.test:8080', ...extra }
    if (email) headers.cookie = `tracy_sess=${await mintSession(email, config.sessionSecret)}`
    if (body !== undefined) headers['content-type'] = 'application/json'
    const res = await app.fetch(
      new Request(`http://tracy.test:8080${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
    const text = await res.text()
    let parsed = text
    try {
      parsed = JSON.parse(text)
    } catch {}
    return { status: res.status, body: parsed, headers: res.headers }
  }
  // Most cases below inspect provisioned-site behavior. Explicitly drive the asynchronous worker
  // after acceptance; the durable-action suite separately asserts 202 precedes every side effect.
  const runBuild = async (...args) => {
    const accepted = await call(...args)
    if (accepted.status !== 202) return accepted
    await pool.query(`update wo_demo_action set next_at=null where id=any($1::uuid[])`, [
      accepted.body.actions.map((action) => action.id)
    ])
    await app.demoRunner.tick()
    await app.demoRunner.drain()
    const made = accepted.body.actions?.[0]
    const builtRow = made
      ? (
          await pool.query(
            `select b.id from wo_build b join wo_demo_action a on a.account_id = b.account_id
               and a.build_request_id = b.request_id where a.id = $1`,
            [made.id]
          )
        ).rows[0]
      : null
    const id = accepted.body.build?.id ?? builtRow?.id
    const read = id ? await call(args[0], 'GET', `${BASE}/builds/${id}`) : null
    const actionId = accepted.body.actions?.[0]?.id
    const action = actionId
      ? (await pool.query('select status,error from wo_demo_action where id=$1', [actionId])).rows[0]
      : null
    return {
      ...accepted,
      body: { ...accepted.body, ...(read?.status === 200 ? { build: read.body.build } : {}), work: action }
    }
  }
  const setSwitch = (on) =>
    pool.query(
      `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
       on conflict (id) do update set overrides = excluded.overrides`,
      [JSON.stringify({ 'website-opportunities': on })]
    )
  await setSwitch(true)
  // The world's templates are Joomla and WordPress: its operator chose Joomla (the deployment default is EmDash).
  await saveOps(pool)
  return {
    app,
    pool,
    call,
    runBuild,
    setSwitch,
    fetched,
    forwarded,
    state,
    domain,
    approxAsked,
    sessionsMade,
    qaAsked,
    discoverAsked,
    prompts
  }
}

const A = 'a@tracy.test'
const B = 'b@tracy.test'
const BASE = '/api/website-opportunities'
/** What a build was built with (`wo_build.choice`), by its request id. */
const choiceOf = async (pool, requestId) =>
  (await pool.query('select choice from wo_build where request_id = $1', [requestId])).rows[0]?.choice

async function opportunity(call, email = A) {
  const res = await call(email, 'POST', BASE, {
    candidate: { provider: 'osm', providerId: 'node/1', name: 'Pho Ba', lat: 15.88, lon: 108.33, socials: {} }
  })
  assert.equal(res.status, 201)
  return res.body.opportunity
}

test('no session: 401 NOT_SIGNED_IN', opts, async () => {
  const { call } = await world()
  const res = await call(null, 'GET', BASE)
  assert.equal(res.status, 401)
  assert.equal(res.body.code, 'NOT_SIGNED_IN')
})

test(
  'switch off: every door that starts work answers FEATURE_OFF; my records stay readable',
  opts,
  async () => {
    const { call, setSwitch } = await world()
    const opp = await opportunity(call)
    const rev = await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})
    assert.equal(rev.status, 201)
    await setSwitch(false)
    for (const [method, path, body] of [
      ['GET', `${BASE}/settings`],
      ['PUT', `${BASE}/settings`, { cms: 'wordpress' }],
      ['GET', `${BASE}/capabilities`],
      ['POST', `${BASE}/search`, { query: 'Hoi An' }],
      ['POST', BASE, { url: 'https://example.com/' }],
      ['POST', `${BASE}/${opp.id}/research`, { requestId: 'req-00000001' }],
      ['POST', `${BASE}/${opp.id}/revisions`, {}],
      ['POST', `${BASE}/revisions/${rev.body.revision.id}/build`, { requestId: 'build-0001', label: 'phoba' }]
    ]) {
      const res = await call(A, method, path, body)
      assert.equal(res.status, 404, `${method} ${path}`)
      assert.equal(res.body.code, 'FEATURE_OFF', `${method} ${path}`)
    }
    const list = await call(A, 'GET', BASE)
    assert.equal(list.status, 200)
    assert.equal(list.body.opportunities.length, 1)
    assert.equal((await call(A, 'GET', `${BASE}/${opp.id}`)).status, 200)
    assert.equal((await call(A, 'GET', `${BASE}/revisions/${rev.body.revision.id}`)).status, 200)
  }
)

test(
  'settings: a new account takes the deployment’s Default CMS; a change is per account and persists',
  opts,
  async () => {
    const { call } = await world()
    const first = await call(A, 'GET', `${BASE}/settings`)
    assert.equal(first.status, 200)
    assert.equal(first.body.cms, 'joomla')
    assert.equal(first.body.cmsSource, 'default')
    // EmDash takes the restaurant's pictures too (`sites/emdash-media.js`): only a missing template keeps it off.
    assert.equal(first.body.options.find((o) => o.cms === 'emdash').reason, 'NO_TEMPLATE_FOR_CMS')
    assert.deepEqual(
      first.body.options.map((o) => [o.cms, o.available]),
      [
        ['joomla', true],
        ['wordpress', true],
        ['emdash', false]
      ]
    )
    const put = await call(A, 'PUT', `${BASE}/settings`, { cms: 'wordpress' })
    assert.equal(put.status, 200)
    assert.equal(put.body.cms, 'wordpress')
    assert.equal(put.body.cmsSource, 'account')
    assert.equal((await call(A, 'GET', `${BASE}/settings`)).body.cms, 'wordpress')
    assert.equal((await call(B, 'GET', `${BASE}/settings`)).body.cms, 'joomla', 'B is not changed by A')
    const bad = await call(A, 'PUT', `${BASE}/settings`, { cms: 'drupal' })
    assert.equal(bad.status, 422)
    assert.equal(bad.body.code, 'INVALID_CMS')
    const unavailable = await call(A, 'PUT', `${BASE}/settings`, { cms: 'emdash' })
    assert.equal(unavailable.status, 422)
    assert.equal(unavailable.body.code, 'CMS_UNAVAILABLE')
  }
)

test(
  'capabilities: social sources say credential_missing without a token, the website is available',
  opts,
  async () => {
    const { call } = await world()
    const res = await call(A, 'GET', `${BASE}/capabilities`)
    assert.equal(res.status, 200)
    assert.equal(res.body.contract.version, 1)
    assert.equal(res.body.sources.website.available, true)
    assert.deepEqual(res.body.sources.facebook, { available: false, reason: 'credential_missing' })
    assert.equal(res.body.discovery.osm, true)
  }
)

test(
  "approx-location: Cloudflare headers first, then the client address, then a local stand's own network",
  opts,
  async () => {
    const { call, approxAsked, setSwitch } = await world()
    const viaCf = await call(A, 'GET', `${BASE}/approx-location`, undefined, {
      'cf-iplatitude': '25.2',
      'cf-iplongitude': '55.27',
      'cf-ipcity': 'Dubai',
      'cf-ipcountry': 'AE'
    })
    assert.equal(viaCf.status, 200)
    assert.deepEqual(viaCf.body, {
      lat: 25.2,
      lon: 55.27,
      label: 'Dubai, AE',
      country: 'AE',
      accuracy: 'city',
      provider: 'cloudflare'
    })
    assert.deepEqual(approxAsked, [])
    const viaIp = await call(A, 'GET', `${BASE}/approx-location`, undefined, {
      'cf-connecting-ip': '94.200.1.2'
    })
    assert.equal(viaIp.body.label, 'Dubai, United Arab Emirates')
    const local = await call(A, 'GET', `${BASE}/approx-location`)
    assert.equal(local.status, 200)
    // A private or missing address is never sent out; this test origin is a .test stand, so it asks about itself.
    assert.deepEqual(approxAsked, ['94.200.1.2', null])
    assert.equal((await call(null, 'GET', `${BASE}/approx-location`)).status, 401)
    await setSwitch(false)
    assert.equal((await call(A, 'GET', `${BASE}/approx-location`)).body.code, 'FEATURE_OFF')
  }
)

test('search answers deduplicated candidates; a radius over 50 km is refused', opts, async () => {
  const { call } = await world()
  const res = await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An', radiusM: 3000 })
  assert.equal(res.status, 200)
  assert.equal(res.body.center.label, 'Hoi An')
  assert.equal(res.body.candidates[0].name, 'Pho Ba')
  assert.equal((await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An', radiusM: 50000 })).status, 200)
  const wide = await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An', radiusM: 50001 })
  assert.equal(wide.status, 400)
  assert.equal(wide.body.code, 'INVALID_SEARCH')
})

test('create: the same candidate twice is one opportunity (201 then 200)', opts, async () => {
  const { call } = await world()
  const first = await opportunity(call)
  const again = await call(A, 'POST', BASE, {
    candidate: { provider: 'osm', providerId: 'node/1', name: 'Pho Ba', socials: {} }
  })
  assert.equal(again.status, 200)
  assert.equal(again.body.opportunity.id, first.id)
})

test('create from a URL: a private, loopback or rebinding address is refused (SSRF)', opts, async () => {
  const privateDns = async () => [{ address: '10.0.0.5', family: 4 }]
  const { call } = await world({ resolve: privateDns })
  for (const address of [
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data',
    'https://intranet.example/'
  ]) {
    const res = await call(A, 'POST', BASE, { url: address })
    assert.equal(res.status, 422, address)
    assert.equal(res.body.code, 'URL_BLOCKED', address)
  }
  const pub = await world()
  const ok = await pub.call(A, 'POST', BASE, { url: 'https://www.instagram.com/phoba/' })
  assert.equal(ok.status, 201)
  assert.equal(ok.body.opportunity.candidate.socials.instagram, 'https://www.instagram.com/phoba')
})

test('owner isolation: account B gets 404 on everything of account A', opts, async () => {
  const { pool, call, runBuild } = await world()
  const opp = await opportunity(call)
  const job = (await call(A, 'POST', `${BASE}/${opp.id}/research`, { requestId: 'req-00000001' })).body.job
  const rev = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
  const build = (
    await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, {
      requestId: 'build-0001',
      label: 'phoba'
    })
  ).body.build
  const account = (await pool.query('select id from account where email = $1', [A])).rows[0].id
  const media = (
    await pool.query(
      `insert into wo_media (account_id, opportunity_id, sha256, object_key, kind, source, source_url, mime)
       values ($1, $2, $3, 'opportunities/x/y/z.jpg', 'image', 'website', 'https://x.test/a.jpg', 'image/jpeg') returning id`,
      [account, opp.id, 'a'.repeat(64)]
    )
  ).rows[0]
  await call(B, 'GET', `${BASE}/settings`) // B has an account now
  for (const [method, path, body] of [
    ['GET', `${BASE}/${opp.id}`],
    ['POST', `${BASE}/${opp.id}/research`, { requestId: 'req-b-0000001' }],
    ['POST', `${BASE}/${opp.id}/revisions`, {}],
    ['POST', `${BASE}/jobs/${job.id}/cancel`],
    ['POST', `${BASE}/jobs/${job.id}/resume`],
    ['GET', `${BASE}/media/${media.id}`],
    ['GET', `${BASE}/revisions/${rev.id}`],
    ['POST', `${BASE}/revisions/${rev.id}/build`, { requestId: 'build-b-0001', label: 'stolen' }],
    ['GET', `${BASE}/builds/${build.id}`]
  ]) {
    const res = await call(B, method, path, body)
    assert.equal(res.status, 404, `${method} ${path}`)
  }
  assert.deepEqual((await call(B, 'GET', BASE)).body.opportunities, [])
})

test(
  'research: the same requestId is the same job; a second one while active is JOB_ACTIVE',
  opts,
  async () => {
    const { call } = await world()
    const opp = await opportunity(call)
    const first = await call(A, 'POST', `${BASE}/${opp.id}/research`, { requestId: 'req-00000001' })
    assert.equal(first.status, 202)
    assert.equal(first.body.job.state, 'queued')
    const same = await call(A, 'POST', `${BASE}/${opp.id}/research`, { requestId: 'req-00000001' })
    assert.equal(same.body.job.id, first.body.job.id)
    const other = await call(A, 'POST', `${BASE}/${opp.id}/research`, { requestId: 'req-00000002' })
    assert.equal(other.status, 409)
    assert.equal(other.body.code, 'JOB_ACTIVE')
    const cancelled = await call(A, 'POST', `${BASE}/jobs/${first.body.job.id}/cancel`)
    assert.equal(cancelled.body.job.state, 'cancelled')
    const resumed = await call(A, 'POST', `${BASE}/jobs/${first.body.job.id}/resume`)
    assert.equal(resumed.body.job.state, 'queued')
  }
)

// Local stand 24/10/2026: an agent build was accepted on a paused research and built from 0 sources.
test(
  'an agent build waits for its research: none or a paused one is refused, nothing accepted',
  opts,
  async () => {
    const { pool, call } = await world()
    const opp = await opportunity(call)
    const build = (requestId) =>
      call(A, 'POST', `${BASE}/${opp.id}/demo/build`, {
        requestId,
        workflow: 'agent-demo/1',
        chatMode: 'client-send/1',
        selection: { cms: 'joomla', design: 'ja-restaurant', quickstart: 'quickstart/ja-restaurant/j6' }
      })
    const none = await build('agent-noresearch')
    assert.equal(none.status, 409)
    assert.equal(none.body.code, 'RESEARCH_NOT_DONE')
    const row = (await pool.query('select account_id from wo_opportunity where id=$1', [opp.id])).rows[0]
    await pool.query(
      `insert into wo_job (account_id, opportunity_id, kind, request_id, state) values ($1, $2, 'research', 'r-paused', 'paused')`,
      [row.account_id, opp.id]
    )
    const paused = await build('agent-paused')
    assert.equal(paused.body.code, 'RESEARCH_NOT_DONE')
    assert.equal(paused.body.research.state, 'paused')
    assert.equal(
      (await pool.query('select id from wo_demo_action where opportunity_id=$1', [opp.id])).rowCount,
      0
    )
  }
)

test(
  'a brief is a research snapshot: the same research answers it again, and a Settings change only reaches the next build',
  opts,
  async () => {
    const { pool, call, runBuild } = await world()
    const opp = await opportunity(call)
    const r1 = await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})
    assert.equal(r1.status, 201, JSON.stringify(r1.body))
    assert.equal(r1.body.revision.n, 1)
    for (const k of ['cms', 'cmsSource', 'template']) assert.equal(k in r1.body.revision, false, k)
    assert.equal('cms' in r1.body.revision.brief, false)
    const same = await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})
    assert.equal(same.status, 200)
    assert.equal(same.body.revision.id, r1.body.revision.id)
    const first = await runBuild(A, 'POST', `${BASE}/${opp.id}/demo/build`, {
      requestId: 'snap-0001',
      selection: { cms: 'joomla' },
      manual: true
    })
    assert.equal(first.status, 202, JSON.stringify(first.body))
    const c1 = await choiceOf(pool, 'snap-0001')
    assert.equal(c1.cms, 'joomla')
    // The default pin is not offered here, so a restaurant template is preferred when the CMS offers one.
    assert.equal(c1.template.design, 'ja-restaurant')
    assert.equal(c1.template.reason, 'pin-missing:tracy-base/j6;restaurant-match')
    await call(A, 'PUT', `${BASE}/settings`, { cms: 'wordpress' })
    const second = await runBuild(A, 'POST', `${BASE}/${opp.id}/demo/build`, {
      requestId: 'snap-0002',
      selection: { cms: 'wordpress' },
      manual: true
    })
    assert.equal(second.status, 202, JSON.stringify(second.body))
    const c2 = await choiceOf(pool, 'snap-0002')
    assert.equal(c2.cms, 'wordpress')
    assert.equal(c2.template.design, 'tracy-business')
    assert.equal((await choiceOf(pool, 'snap-0001')).cms, 'joomla', 'the first build keeps its choice')
    // One brief fed both demos.
    const briefs = (await pool.query('select distinct revision_id from wo_build')).rows
    assert.deepEqual(briefs, [{ revision_id: r1.body.revision.id }])
    const md = await call(A, 'GET', `${BASE}/revisions/${r1.body.revision.id}?format=md`)
    assert.match(md.headers.get('content-type'), /text\/markdown/)
    assert.match(md.body, /Pho Ba/)
    assert.doesNotMatch(md.body, /^- CMS:/m)
    await assert.rejects(
      pool.query("update wo_revision set brief = '{}' where id = $1", [r1.body.revision.id]),
      /immutable/
    )
  }
)

test('build: acceptance queues the action and does no work; the same request replays it', opts, async () => {
  const { pool, call, forwarded, fetched } = await world()
  const opp = await opportunity(call)
  const requestId = 'frozen-build-0001'
  const body = { requestId, label: 'wo-quality-baseline', selection: { cms: 'joomla' } }
  // Acceptance reads the offered templates to resolve the choice; nothing else leaves.
  const work = () => forwarded.filter((f) => f.path !== '/api/templates').length
  const forwardedBefore = work()
  const accepted = await call(A, 'POST', `${BASE}/${opp.id}/demo/build`, body)
  assert.equal(accepted.status, 202, JSON.stringify(accepted.body))
  const action = (await pool.query('select * from wo_demo_action')).rows[0]
  assert.equal(action.opportunity_id, opp.id)
  assert.equal(action.label, 'wo-quality-baseline')
  assert.equal(action.request_id, requestId)
  assert.equal(action.build_request_id, requestId)
  assert.equal(action.status, 'queued')
  assert.equal(action.lease_until, null)
  assert.equal(action.selection.cms, 'joomla')
  assert.equal(action.selection.design, 'ja-restaurant')
  // The worker makes the brief and the build; acceptance makes neither.
  assert.equal((await pool.query('select count(*)::int n from wo_build')).rows[0].n, 0)
  assert.equal((await pool.query('select count(*)::int n from wo_revision')).rows[0].n, 0)
  const replay = await call(A, 'POST', `${BASE}/${opp.id}/demo/build`, body)
  assert.equal(replay.status, 202)
  assert.deepEqual(replay.body.actions, accepted.body.actions)
  assert.equal((await pool.query('select count(*)::int n from wo_demo_action')).rows[0].n, 1)
  assert.equal(work(), forwardedBefore, 'acceptance does not provision, fill or hand off')
  assert.deepEqual(fetched, [], 'acceptance does not call a model or external provider')
})

test(
  'build: the server sends the revision CMS, ignores the client CMS, and a retry is one site',
  opts,
  async () => {
    const { call, runBuild, forwarded } = await world()
    const opp = await opportunity(call)
    const rev = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
    const press = () =>
      runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, {
        requestId: 'build-0001',
        label: 'phoba',
        cms: 'wordpress',
        platform: 'emdash'
      })
    const first = await press()
    assert.equal(first.status, 202, JSON.stringify(first.body))
    const creates = forwarded.filter((f) => f.path === '/api/sites')
    assert.equal(creates.length, 1)
    const sent = JSON.parse(creates[0].init.body)
    assert.equal(sent.platform, 'joomla')
    assert.equal(sent.quickstart, 'ja-restaurant/j6')
    assert.equal(sent.design, 'ja-restaurant')
    assert.match(sent.buildId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert.equal(sent.brief.answers.name, 'Pho Ba')
    assert.ok(sent.brief.answers.about.length <= 300 && sent.brief.answers.about.startsWith('Pho Ba'))
    assert.match(creates[0].init.headers.cookie, /^tracy_sess=/)
    assert.equal(first.body.build.siteKey, 'phoba.localhost')
    assert.equal(first.body.build.receipt.status, 201)

    const again = await press()
    assert.equal(again.body.build.id, first.body.build.id)
    assert.equal(forwarded.filter((f) => f.path === '/api/sites').length, 1, 'no second create')
    const read = await call(A, 'GET', `${BASE}/builds/${first.body.build.id}`)
    assert.equal(read.status, 200)
    assert.equal(read.body.build.siteKey, 'phoba.localhost')
  }
)

test('build: a template withdrawn after acceptance is refused before anything is created', opts, async () => {
  const { app, pool, call, state, forwarded } = await world()
  const opp = await opportunity(call)
  const accepted = await call(A, 'POST', `${BASE}/${opp.id}/demo/build`, {
    requestId: 'build-0002',
    label: 'a2',
    selection: { cms: 'joomla', design: 'ja-restaurant', quickstart: 'ja-restaurant/j6' }
  })
  assert.equal(accepted.status, 202, JSON.stringify(accepted.body))
  state.cards = CARDS.filter((c) => c.id !== 'ja-restaurant')
  await pool.query('update wo_demo_action set next_at = null')
  await app.demoRunner.tick()
  await app.demoRunner.drain()
  const action = (await pool.query('select status, error from wo_demo_action')).rows[0]
  assert.deepEqual(action, { status: 'failed', error: 'TEMPLATE_UNAVAILABLE' })
  assert.equal((await pool.query('select count(*)::int n from wo_build')).rows[0].n, 0)
  assert.equal(forwarded.filter((f) => f.path === '/api/sites').length, 0)
})

test(
  'crash after provision: a build with no receipt is reconciled from site_creation, never created twice',
  opts,
  async () => {
    const { pool, call, runBuild, forwarded } = await world()
    const opp = await opportunity(call)
    const rev = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
    const accountId = (await pool.query('select id from account where email = $1', [A])).rows[0].id
    const { deterministicBuildId } = await import('../src/opportunities-build/builds.js')
    const buildId = deterministicBuildId(accountId, rev.id, 'build-crash1')
    // The process wrote its row, the create door made the site, and the process died before the receipt.
    const row = (
      await pool.query(
        `insert into wo_build (account_id, revision_id, request_id, build_id, choice, choice_key) values ($1, $2, 'build-crash1', $3, '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture') returning id`,
        [accountId, rev.id, buildId]
      )
    ).rows[0]
    await pool.query(
      `insert into site (site_key, label, host, platform) values ('phoba.localhost', 'phoba', 'local', 'joomla')`
    )
    await pool.query(
      `insert into site_creation (account_id, build_id, payload_hash, state, site_key, job_id)
     values ($1, $2, 'h', 'provisioning', 'phoba.localhost', 'job-1')`,
      [accountId, buildId]
    )
    const read = await call(A, 'GET', `${BASE}/builds/${row.id}`)
    assert.equal(read.body.build.siteKey, 'phoba.localhost')
    assert.equal(read.body.build.state, 'done')
    assert.deepEqual(read.body.siteJob, { id: 'job-1', state: 'done' })
    const retry = await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, {
      requestId: 'build-crash1',
      label: 'phoba'
    })
    assert.equal(retry.status, 202)
    assert.equal(retry.body.build.id, row.id)
    assert.equal(forwarded.filter((f) => f.path === '/api/sites').length, 0)
  }
)

test(
  'build: no label → the server names the site after the place, and a taken name gets -2',
  opts,
  async () => {
    const { pool, call, runBuild, forwarded } = await world()
    const opp = await opportunity(call)
    const rev = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
    const read = await call(A, 'GET', `${BASE}/revisions/${rev.id}`)
    assert.equal(read.body.suggestedLabel, 'pho-ba')
    await pool.query(
      `insert into site (site_key, label, host, platform) values ('pho-ba.localhost', 'pho-ba', 'local', 'joomla')`
    )
    const again = await call(A, 'GET', `${BASE}/revisions/${rev.id}`)
    assert.equal(again.body.suggestedLabel, 'pho-ba-2')
    const built = await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, { requestId: 'build-auto1' })
    assert.equal(built.status, 202, JSON.stringify(built.body))
    const sent = JSON.parse(forwarded.filter((f) => f.path === '/api/sites')[0].init.body)
    assert.equal(sent.label, 'pho-ba-2')
    assert.equal(built.body.build.label, 'pho-ba-2')
    assert.equal(built.body.build.siteKey, 'pho-ba-2.localhost')
    // One live demo per (brief, choice): the same choice builds again once the first demo is removed.
    await pool.query('update wo_build set demo_deleted_at = now()')
    const rev2 = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
    const blank = await runBuild(A, 'POST', `${BASE}/revisions/${rev2.id}/build`, {
      requestId: 'build-auto2',
      label: '  '
    })
    assert.equal(
      blank.body.build.label,
      'pho-ba-2',
      'a blank label is no label; the site row is not written by this fake'
    )
  }
)

test(
  'build: a label sent is kept, a retry without one keeps the first choice, a bad one is refused',
  opts,
  async () => {
    const { app, pool, call, runBuild, forwarded, state } = await world()
    const opp = await opportunity(call)
    const rev = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
    const typed = await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, {
      requestId: 'build-typed',
      label: 'my-pho'
    })
    assert.equal(typed.body.build.label, 'my-pho')
    assert.equal(
      JSON.parse(forwarded.filter((f) => f.path === '/api/sites').at(-1).init.body).label,
      'my-pho'
    )

    // One live demo per (brief, choice): the second build of the same choice follows the first one's removal.
    await pool.query('update wo_build set demo_deleted_at = now()')
    const rev2 = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
    state.refuseCreate = true
    const refused = await runBuild(A, 'POST', `${BASE}/revisions/${rev2.id}/build`, {
      requestId: 'build-retry'
    })
    assert.equal(refused.status, 202)
    assert.equal(refused.body.work.error, 'FLEET_REFUSED')
    assert.equal(refused.body.build.label, 'pho-ba')
    // Somebody takes the name before the worker asks again: the same build still asks for the name it chose.
    await pool.query(
      `insert into site (site_key, label, host, platform) values ('pho-ba.localhost', 'pho-ba', 'local', 'joomla')`
    )
    await pool.query('update wo_demo_action set next_at = null')
    await app.demoRunner.tick()
    await app.demoRunner.drain()
    const asked = forwarded.filter((f) => f.path === '/api/sites').map((f) => JSON.parse(f.init.body))
    assert.equal(asked.at(-1).label, 'pho-ba')
    assert.equal(asked.at(-1).buildId, asked.at(-2).buildId, 'the same build is asked again')

    await pool.query('update wo_build set demo_deleted_at = now()')
    const rev3 = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
    const bad = await runBuild(A, 'POST', `${BASE}/revisions/${rev3.id}/build`, {
      requestId: 'build-bad1',
      label: 'Bad name!'
    })
    assert.equal(bad.status, 202)
    assert.equal(bad.body.work.error, 'INVALID_LABEL')
    const wrongType = await call(A, 'POST', `${BASE}/${opp.id}/demo/build`, {
      requestId: 'build-bad2',
      selection: { cms: 'joomla' },
      label: 42
    })
    assert.equal(wrongType.status, 400)
    assert.equal(wrongType.body.code, 'INVALID_LABEL')
  }
)

test(
  'handoff: the stored pictures go onto the ready site one by one, once, and the prompt names their paths',
  opts,
  async () => {
    const objects = { get: async () => new Response(Buffer.from('jpegbytes')), publicUrl: async () => null }
    const { call, runBuild, pool, forwarded, state, sessionsMade, prompts } = await world({ objects })
    const opp = await opportunity(call)
    const account = (await pool.query('select id from account where email = $1', [A])).rows[0].id
    for (const ch of ['a', 'b'])
      await pool.query(
        `insert into wo_media (account_id, opportunity_id, sha256, object_key, kind, category, source, source_url, mime, bytes)
         values ($1, $2, $3, $4, 'image', 'food', 'website', 'https://x.test/p.jpg', 'image/jpeg', 9)`,
        [account, opp.id, ch.repeat(64), `opportunities/${account}/${opp.id}/${ch}.jpg`]
      )
    const rev = (
      await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {
        template: { quickstart: 'ja-restaurant/j6', design: 'ja-restaurant' }
      })
    ).body.revision
    // A revision stored before Google reviews left the markdown: the prompt is rendered from the JSON.
    // Revisions are immutable by trigger; this stands in for one the older code wrote.
    await pool.query(
      `set local session_replication_role = replica;
       update wo_revision
          set brief_md = brief_md || E'\\n> "A stale Google review quoted as fact." — Roger H on Google (5/5)\\n'
        where id = '${rev.id}'`
    )
    const stored = await pool.query('select brief_md from wo_revision where id = $1', [rev.id])
    assert.match(stored.rows[0].brief_md, /A stale Google review/)
    const build = (
      await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, {
        requestId: 'build-0001',
        label: 'phoba'
      })
    ).body.build
    state.siteJob = 'running'
    const early = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(early.status, 409)
    assert.equal(early.body.code, 'SITE_NOT_READY')
    state.siteJob = 'done'
    state.refuseUploads = true
    const refused = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(refused.status, 502)
    assert.equal(refused.body.code, 'HANDOFF_UPLOAD_FAILED')
    state.refuseUploads = false
    forwarded.length = 0
    const refusedSession = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(refusedSession.status, 503)
    assert.equal(refusedSession.body.code, 'HANDOFF_SESSION_FAILED')
    const first = await call(A, 'GET', `${BASE}/builds/${build.id}/handoff`)
    const uploads = forwarded.filter((f) => f.path.endsWith('/apply'))
    assert.equal(uploads.length, 2)
    const sent = JSON.parse(uploads[0].init.body)
    assert.equal(sent.action, 'media.upload')
    assert.match(sent.params.path, /^images\/tracy-content\/[0-9a-f]{64}\.jpg$/)
    assert.equal(Buffer.from(sent.params.content_b64, 'base64').toString(), 'jpegbytes')
    assert.equal(Object.keys(first.body.handoff.placed).length, 2)
    assert.match(first.body.handoff.prompt, /images\/tracy-content\/[0-9a-f]{64}\.jpg/)
    assert.match(first.body.handoff.prompt, /Never invent prices/)
    assert.match(first.body.handoff.prompt, /^# Site brief: /m)
    assert.doesNotMatch(first.body.handoff.prompt, /A stale Google review/)
    // No site row means fail closed: pictures are receipted but no prompt or fallback page is offered.
    assert.equal(prompts.length, 0)
    assert.equal(first.body.handoff.promptSent, undefined)
    await pool.query('insert into site (site_key, label, host, platform) values ($1, $2, $3, $4)', [
      first.body.site.key,
      'handoff',
      'local',
      'joomla'
    ])
    const again = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(again.status, 200)
    // The prompt reaches the agent only through an open chat: the site's own one, made as the press's owner.
    assert.equal(again.body.next, `/${encodeURIComponent(again.body.site.key)}/s/wo-demo-${build.id}`)
    assert.deepEqual(sessionsMade.at(-1), { site: again.body.site.key, email: A })
    assert.equal(
      forwarded.filter((f) => f.path.endsWith('/apply')).length,
      2,
      'a second press uploads nothing again'
    )
    // The server queued the prompt into that chat itself: no page has to open for the agent to start.
    assert.equal(prompts.length, 1)
    assert.equal(prompts[0].sessionId, `wo-demo-${build.id}`)
    assert.equal(prompts[0].email, A)
    assert.equal(prompts[0].requestId, `wo-handoff:${build.id}:wo-demo-${build.id}`)
    assert.equal(prompts[0].text, again.body.handoff.prompt)
    assert.equal(again.body.handoff.promptSent.sessionId, `wo-demo-${build.id}`)
    assert.ok(Date.parse(again.body.handoff.promptSent.at))
    // A third press reconciles the held chat without making a new one or sending the prompt again.
    const third = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(third.status, 200)
    assert.equal(third.body.next, again.body.next)
    assert.equal(prompts.length, 1, 'one prompt per chat')
    assert.equal(third.body.handoff.promptSent.sessionId, `wo-demo-${build.id}`)
    assert.equal((await call(B, 'POST', `${BASE}/builds/${build.id}/handoff`)).status, 404)
    const read = (await call(A, 'GET', `${BASE}/builds/${build.id}/handoff`)).body.handoff
    assert.equal(read.state, 'ready')
    assert.equal(read.promptSent.sessionId, `wo-demo-${build.id}`)
  }
)

test(
  'handoff: a refused prompt fails closed; the next press uses the same session and request id',
  opts,
  async () => {
    const objects = { get: async () => new Response(Buffer.from('jpegbytes')), publicUrl: async () => null }
    const { call, runBuild, pool, state, prompts } = await world({ objects })
    const opp = await opportunity(call)
    const account = (await pool.query('select id from account where email = $1', [A])).rows[0].id
    await pool.query(
      `insert into wo_media (account_id, opportunity_id, sha256, object_key, kind, category, source, source_url, mime, bytes)
     values ($1, $2, $3, $4, 'image', 'food', 'website', 'https://x.test/p.jpg', 'image/jpeg', 9)`,
      [account, opp.id, 'c'.repeat(64), `opportunities/${account}/${opp.id}/c.jpg`]
    )
    const rev = (
      await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {
        template: { quickstart: 'ja-restaurant/j6', design: 'ja-restaurant' }
      })
    ).body.revision
    const build = (
      await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, {
        requestId: 'build-0002',
        label: 'phobb'
      })
    ).body.build
    state.siteJob = 'done'
    await pool.query('insert into site (site_key, label, host, platform) values ($1, $2, $3, $4)', [
      `phobb.localhost`,
      'phobb',
      'local',
      'joomla'
    ])
    state.promptRefused = true
    const first = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(first.status, 503, JSON.stringify(first.body))
    assert.equal(first.body.code, 'HANDOFF_PROMPT_FAILED')
    assert.equal(prompts.length, 1)
    state.promptRefused = false
    const second = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(prompts.length, 2)
    assert.equal(prompts[1].sessionId, prompts[0].sessionId, 'the retry reuses the refused chat')
    assert.equal(prompts[1].requestId, prompts[0].requestId, 'the retry reuses the refused request id')
    assert.equal(second.body.handoff.promptSent.sessionId, prompts[1].sessionId)
  }
)

test(
  'handoff: the QA baseline is read off the site once, before the agent, and both reads answer the qa',
  opts,
  async () => {
    const objects = { get: async () => new Response(Buffer.from('jpegbytes')), publicUrl: async () => null }
    const { call, runBuild, pool, qaAsked } = await world({ objects })
    const opp = await opportunity(call)
    const rev = (
      await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {
        template: { quickstart: 'ja-restaurant/j6', design: 'ja-restaurant' }
      })
    ).body.revision
    const build = (
      await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, {
        requestId: 'build-qa01',
        label: 'phoqa'
      })
    ).body.build
    // No site row yet: no target to read, so no QA.
    const bare = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(bare.status, 503, JSON.stringify(bare.body))
    assert.equal(bare.body.code, 'HANDOFF_SESSION_FAILED')
    assert.equal(bare.body.qa, undefined)
    assert.equal(qaAsked.length, 0)
    await pool.query(
      `insert into site (site_key, label, host, platform, port) values ($1, 'phoqa', 'local', 'joomla', 52019)`,
      [build.siteKey]
    )
    const first = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(first.status, 200)
    assert.equal(qaAsked.length, 1)
    assert.equal(qaAsked[0].site.port, 52019)
    // The test's deps.websiteOpportunitiesDemoQa replaces the host call, so the payload has no `host`: the
    // wiring that names the site (`app.js`) is read in website-opportunities-demo-qa.test.mjs.
    assert.deepEqual(qaAsked[0].payload.pages, ['/'])
    assert.equal(qaAsked[0].payload.discover, true)
    assert.equal(qaAsked[0].payload.baseline, undefined, 'the baseline read has no baseline to compare with')
    assert.equal(first.body.qa.state, 'pending')
    assert.equal(first.body.qa.sessionId, `wo-demo-${build.id}`)
    assert.deepEqual(first.body.qa.pages, ['/', '/menu'])
    assert.equal(first.body.qa.baselineTaken, true)
    assert.equal(first.body.qa.baseline, undefined, 'the baseline itself stays on the server')
    const row = (await pool.query('select qa from wo_build where id = $1', [build.id])).rows[0].qa
    assert.equal(row.baseline.cssRules['t.css'].rules, 10)
    assert.equal(row.by, A)
    // A second press keeps the first baseline: the agent may already have changed the site.
    await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(qaAsked.length, 1)
    const handoff = await call(A, 'GET', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(handoff.body.qa.state, 'pending')
    assert.equal(handoff.body.qa.baseline, undefined)
    const read = await call(A, 'GET', `${BASE}/builds/${build.id}`)
    assert.deepEqual(read.body.build.qa, { state: 'pending', repairs: 0, rounds: 0, reason: null })
  }
)

/** A provisioned demo with one stored picture, its site row, ready to hand off. */
async function readyDemo(w, label) {
  const { call, runBuild, pool, state } = w
  const opp = await opportunity(call)
  const account = (await pool.query('select id from account where email = $1', [A])).rows[0].id
  await pool.query(
    `insert into wo_media (account_id, opportunity_id, sha256, object_key, kind, category, source, source_url, mime, bytes)
     values ($1, $2, $3, $4, 'image', 'food', 'website', 'https://x.test/p.jpg', 'image/jpeg', 9)`,
    [account, opp.id, 'd'.repeat(64), `opportunities/${account}/${opp.id}/d.jpg`]
  )
  const rev = (
    await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {
      template: { quickstart: 'ja-restaurant/j6', design: 'ja-restaurant' }
    })
  ).body.revision
  const build = (
    await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, { requestId: `build-${label}`, label })
  ).body.build
  state.siteJob = 'done'
  await pool.query('insert into site (site_key, label, host, platform) values ($1, $2, $3, $4)', [
    `${label}.localhost`,
    label,
    'local',
    'joomla'
  ])
  return build
}

// B1 (ai-flow audit 19/10/2026): a baseline read off a home that never opened came back empty, and QA passed.
test(
  'handoff: a baseline the host could not read sends no prompt and the page gets none; a later press reads it and sends it',
  opts,
  async () => {
    const objects = { get: async () => new Response(Buffer.from('jpegbytes')), publicUrl: async () => null }
    const w = await world({ objects })
    const { call, state, prompts, pool } = w
    const build = await readyDemo(w, 'phobl')
    state.qaAnswer = {
      ok: true,
      status: 200,
      body: {
        checks: [],
        baseline: {
          cssRules: {},
          pictures: { files: [], shas: [] },
          texts: [],
          read: [],
          unread: [{ path: '/', why: 'did not open' }]
        },
        pages: ['/']
      }
    }
    const first = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(first.status, 503, JSON.stringify(first.body))
    assert.equal(first.body.code, 'HANDOFF_BASELINE_FAILED')
    assert.equal(first.body.next.includes('/s/'), false, 'no chat to open: nothing was sent to it')
    assert.equal(first.body.qa.state, 'baseline')
    assert.equal(first.body.qa.baselineTaken, false)
    assert.equal(prompts.length, 0, 'no agent works on a demo the gate cannot judge')
    const held = (await pool.query('select handoff from wo_build where id = $1', [build.id])).rows[0]
    assert.equal(held.handoff.promptSent, undefined)
    const page = await call(A, 'GET', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(page.body.handoff.state, 'ready')
    assert.equal(page.body.handoff.prompt, undefined, 'the page has no prompt to send either')
    state.qaAnswer = null
    const second = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(second.status, 200, JSON.stringify(second.body))
    assert.equal(second.body.qa.state, 'pending')
    assert.equal(second.body.qa.baselineTaken, true)
    assert.equal(prompts.length, 1)
    assert.equal(prompts[0].sessionId, second.body.qa.sessionId)
    assert.equal(second.body.handoff.promptSent.sessionId, second.body.qa.sessionId)
    assert.match(second.body.next, new RegExp(`/s/${second.body.qa.sessionId}$`))
    const row = (await pool.query('select handoff from wo_build where id = $1', [build.id])).rows[0]
    assert.equal(row.handoff.promptSent.sessionId, second.body.qa.sessionId)
    assert.equal(typeof row.handoff.prompt, 'string')
  }
)

// B2: a press that outlived the proxy's 100 s, pressed again, made a second chat and sent the prompt twice.
test(
  'handoff: a second press while the first still runs is told so — one chat, one baseline, one prompt',
  opts,
  async () => {
    const objects = { get: async () => new Response(Buffer.from('jpegbytes')), publicUrl: async () => null }
    const w = await world({ objects })
    const { call, state, prompts, qaAsked, sessionsMade } = w
    const build = await readyDemo(w, 'phobm')
    let release
    state.qaHold = new Promise((r) => (release = r))
    const first = call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    for (let i = 0; i < 100 && qaAsked.length === 0; i++) await new Promise((r) => setTimeout(r, 20))
    assert.equal(qaAsked.length, 1)
    const second = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(second.status, 409)
    assert.equal(second.body.code, 'HANDOFF_IN_PROGRESS')
    release()
    state.qaHold = null
    const done = await first
    assert.equal(done.status, 200, JSON.stringify(done.body))
    assert.equal(sessionsMade.length, 1)
    assert.equal(qaAsked.length, 1)
    assert.equal(prompts.length, 1)
    assert.equal(prompts[0].sessionId, done.body.qa.sessionId)
  }
)

// B5: pressing again after the QA verdict rewrote the hand-off to `ready` and erased the verdict. A demo given
// to a person is resumed by an explicit Retry (a demo action), never by pressing the hand-off again.
test('handoff: a press after the QA verdict keeps it, uploads nothing and sends nothing', opts, async () => {
  const objects = { get: async () => new Response(Buffer.from('jpegbytes')), publicUrl: async () => null }
  const w = await world({ objects })
  const { call, pool, prompts, forwarded } = w
  const build = await readyDemo(w, 'phobn')
  const first = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
  assert.equal(first.status, 200)
  assert.equal(prompts.length, 1)
  await pool.query(
    `update wo_build set handoff = jsonb_set(handoff, '{state}', '"needs-review"'),
       qa = qa || '{"state": "failed", "reason": "still failing after 2 repairs"}'::jsonb where id = $1`,
    [build.id]
  )
  forwarded.length = 0
  const again = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
  assert.equal(again.status, 409, JSON.stringify(again.body))
  assert.equal(again.body.code, 'QA_NEEDS_REVIEW')
  assert.equal(forwarded.filter((f) => f.path.endsWith('/apply')).length, 0)
  assert.equal(prompts.length, 1)
  const row = (await pool.query('select handoff, qa from wo_build where id = $1', [build.id])).rows[0]
  assert.equal(row.handoff.state, 'needs-review')
  assert.equal(typeof row.handoff.prompt, 'string')
  assert.equal(row.qa.reason, 'still failing after 2 repairs')
  // A passed demo: the press answers the verdict and opens its chat, and changes nothing.
  await pool.query(
    `update wo_build set handoff = jsonb_set(handoff, '{state}', '"completed"'),
       qa = qa || '{"state": "passed", "reason": null}'::jsonb where id = $1`,
    [build.id]
  )
  const passed = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
  assert.equal(passed.status, 200, JSON.stringify(passed.body))
  assert.equal(passed.body.handoff.state, 'completed')
  assert.equal(passed.body.qa.state, 'passed')
  assert.match(passed.body.next, new RegExp(`/s/${row.qa.sessionId}$`))
  assert.equal(forwarded.filter((f) => f.path.endsWith('/apply')).length, 0)
  assert.equal(prompts.length, 1)
})

test(
  'handoff: it waits for the site’s brief to finish, uploads only what the build did not place, and names what it placed',
  opts,
  async () => {
    const objects = { get: async () => new Response(Buffer.from('jpegbytes')), publicUrl: async () => null }
    const { call, runBuild, pool, forwarded, state } = await world({ objects })
    const opp = await opportunity(call)
    const account = (await pool.query('select id from account where email = $1', [A])).rows[0].id
    const ids = []
    for (const ch of ['a', 'b'])
      ids.push(
        (
          await pool.query(
            `insert into wo_media (account_id, opportunity_id, sha256, object_key, kind, category, source, source_url, mime, bytes)
             values ($1, $2, $3, $4, 'image', 'food', 'website', 'https://x.test/p.jpg', 'image/jpeg', 9) returning id`,
            [account, opp.id, ch.repeat(64), `opportunities/${account}/${opp.id}/${ch}.jpg`]
          )
        ).rows[0].id
      )
    const rev = (
      await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {
        template: { quickstart: 'ja-restaurant/j6', design: 'ja-restaurant' }
      })
    ).body.revision
    const build = (
      await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, {
        requestId: 'build-0002',
        label: 'phoba'
      })
    ).body.build
    state.siteJob = 'done'
    const { site_key: siteKey } = (
      await pool.query('select site_key from wo_build where id = $1', [build.id])
    ).rows[0]
    await pool.query(
      `insert into site_brief (site_key, account_id, platform, brief, state) values ($1, $2, 'joomla', '{}'::jsonb, 'applying')`,
      [siteKey, account]
    )
    const writing = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(writing.status, 409)
    assert.equal(writing.body.code, 'SITE_NOT_READY')
    assert.equal(writing.body.brief, 'applying')
    await pool.query(`update site_brief set state = 'applied' where site_key = $1`, [siteKey])
    await pool.query('update wo_build set pictures = $2::jsonb where id = $1', [
      build.id,
      JSON.stringify({
        plan: {
          placements: [{ groupId: 'images/joomlart/slideshow/slide-1.jpg', mediaId: ids[0], origin: 'real' }],
          unfilled: [
            { groupId: 'images/joomlart/food/fd-2.jpg', routes: ['menu'], reason: 'no picture fits' }
          ]
        },
        receipts: {
          'images/joomlart/slideshow/slide-1.jpg': { state: 'verified', path: 'images/tracy-content/aaa.jpg' }
        },
        report: { demoLeft: [], never: [{ file: 'images/joomlart/logo.png', reason: 'a logo or mark' }] }
      })
    ])
    forwarded.length = 0
    await pool.query(
      `insert into site(site_key,label,host,platform) values($1,'phoba','local','joomla') on conflict do nothing`,
      [build.siteKey]
    )
    const done = await call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(done.status, 200, JSON.stringify(done.body))
    assert.equal(forwarded.filter((f) => f.path.endsWith('/apply')).length, 1)
    assert.deepEqual(Object.keys(done.body.handoff.placed), [ids[1]])
    assert.equal(done.body.handoff.placedByBuild, 1)
    assert.match(done.body.handoff.prompt, /slide-1\.jpg ← \/images\/tracy-content\/aaa\.jpg/)
    assert.match(done.body.handoff.prompt, /fd-2\.jpg on menu: no picture fits/)
  }
)

test(
  'build: the create door gets its own Site questions answered from the brief, or just the about line',
  opts,
  async () => {
    const { call, runBuild, forwarded, state, pool } = await world()
    const opp = await opportunity(call)
    const rev = (
      await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {
        template: { quickstart: 'ja-restaurant/j6', design: 'ja-restaurant' }
      })
    ).body.revision
    const started = await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, {
      requestId: 'build-0001',
      label: 'phoba'
    })
    const asked = forwarded.find((f) => f.path.startsWith('/api/sites/questions?'))
    assert.match(asked.path, /platform=joomla/)
    assert.match(asked.path, /quickstart=ja-restaurant%2Fj6/)
    const sent = JSON.parse(forwarded.find((f) => f.path === '/api/sites').init.body)
    assert.equal(sent.brief.questionnaire, 'c'.repeat(64))
    assert.equal(sent.brief.answers.name, 'Pho Ba')
    // Every template page stays, pricing included (no `pages` answer keeps them all); the plan is kept with the receipt.
    assert.equal(sent.brief.answers.pages, undefined)
    const plan = (await call(A, 'GET', `${BASE}/builds/${started.body.build.id}`)).body.build.receipt.pagePlan
    assert.deepEqual(
      plan?.pages.filter((p) => !p.keep).map((p) => p.id),
      []
    )
    assert.ok(plan?.pages.some((p) => p.id === 'pricing' && p.keep))
    // One live demo per (brief, choice): the same research and template build again once the first is removed.
    await pool.query('update wo_build set demo_deleted_at = now()')
    state.questionsDown = true
    const rev2 = (
      await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {
        template: { quickstart: 'ja-restaurant/j6', design: 'ja-restaurant' }
      })
    ).body.revision
    await runBuild(A, 'POST', `${BASE}/revisions/${rev2.id}/build`, {
      requestId: 'build-0002',
      label: 'phoba2'
    })
    const second = JSON.parse(forwarded.filter((f) => f.path === '/api/sites').at(-1).init.body)
    assert.deepEqual(Object.keys(second.brief), ['about'])
  }
)

test(
  'build: the create door gets the contact facts the brief holds, each with its source, also when the questions are down',
  opts,
  async () => {
    const { call, runBuild, forwarded, state } = await world()
    const opp = (
      await call(A, 'POST', BASE, {
        candidate: {
          provider: 'osm',
          providerId: 'node/1',
          name: 'Pho Ba',
          lat: 15.88,
          lon: 108.33,
          phone: '+84 235 5550 134',
          address: '12 Tran Phu, Hoi An',
          socials: {}
        }
      })
    ).body.opportunity
    const rev = (
      await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {
        template: { quickstart: 'ja-restaurant/j6', design: 'ja-restaurant' }
      })
    ).body.revision
    await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, {
      requestId: 'build-0001',
      label: 'phoba'
    })
    const sent = JSON.parse(forwarded.find((f) => f.path === '/api/sites').init.body)
    assert.deepEqual(sent.brief.facts, {
      phone: { value: '+84 235 5550 134', source: 'business.phone', fetchedAt: rev.brief.madeAt },
      address: { value: '12 Tran Phu, Hoi An', source: 'business.address', fetchedAt: rev.brief.madeAt }
    })
    state.questionsDown = true
    await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, {
      requestId: 'build-0002',
      label: 'phoba2'
    })
    const second = JSON.parse(forwarded.filter((f) => f.path === '/api/sites').at(-1).init.body)
    assert.deepEqual(second.brief.facts, sent.brief.facts)
  }
)

test('revision: the brief makes its content from the posts each source collected', opts, async () => {
  const { pool, call } = await world()
  const opp = await opportunity(call)
  const caption =
    'A good morning starts here. Our Eggs Benedict has become a firm favourite since its recent menu introduction, with poached eggs and ham on a proper English muffin.'
  await pool.query(
    `insert into wo_source (opportunity_id, source, status, collected) values ($1, 'facebook', 'complete', $2::jsonb)
     on conflict (opportunity_id, source) do update set status = excluded.status, collected = excluded.collected`,
    [
      opp.id,
      JSON.stringify({
        posts: [{ id: 'p1', url: 'https://facebook.com/p1', caption, postedAt: '2026-10-01T00:00:00Z' }]
      })
    ]
  )
  const rev = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
  const items = rev.brief.content.items
  assert.equal(items.length, 1)
  assert.ok(items[0].kinds.includes('dish'))
  assert.deepEqual(items[0].posts[0], {
    source: 'facebook',
    id: 'p1',
    url: 'https://facebook.com/p1',
    publishedAt: '2026-10-01T00:00:00Z'
  })
})

test('template fit without a restaurant template: a hospitality card beats the first one listed', () => {
  const card = (id, blurb) => ({
    id,
    label: id,
    card: { blurb },
    platforms: [{ platform: 'joomla', tag: `${id}/j6`, version: '1.0.0' }]
  })
  const cards = [
    card('ja-impact', 'A charity and non-profit site'),
    card('ja-smallbiz', 'A small-business website template'),
    card('ja-resort', 'A Joomla hotel and resort website template')
  ]
  assert.equal(chooseTemplate({ cards }, 'joomla', undefined).design, 'ja-resort')
  assert.equal(chooseTemplate({ cards }, 'joomla', undefined).reason, 'hospitality-match')
  assert.equal(
    chooseTemplate({ cards: cards.slice(0, 2) }, 'joomla', undefined).reason,
    'small-business-match'
  )
  assert.equal(chooseTemplate({ cards: cards.slice(0, 1) }, 'joomla', undefined).reason, 'first-available')
})

test(
  'build: a refused create is asked again by the same requestId, and only then makes the site',
  opts,
  async () => {
    const { call, runBuild, forwarded, state } = await world()
    const opp = await opportunity(call)
    const rev = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
    state.refuseCreate = true
    const press = () =>
      runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, { requestId: 'build-0001', label: 'phoba' })
    const first = await press()
    assert.equal(first.status, 202)
    assert.equal(first.body.build.state, 'refused')
    const second = await press()
    assert.equal(second.status, 202, JSON.stringify(second.body))
    assert.equal(second.body.build.id, first.body.build.id)
    assert.equal(second.body.build.state, 'done')
    const creates = forwarded
      .filter((f) => f.path === '/api/sites')
      .map((f) => JSON.parse(f.init.body).buildId)
    assert.equal(creates.length, 2)
    assert.equal(creates[0], creates[1], 'the same buildId both times')
  }
)

/** What `/ops/wo` saves: sealed keys and the settings row. */
async function saveOps(pool, { settings: chosen = {}, google, apify, rapidapi } = {}) {
  const settings = { defaultCms: 'joomla', ...chosen }
  const secret = env.SESSION_SECRET
  await pool.query(
    `insert into wo_ops_setting (id, settings, google_key_cipher, apify_key_cipher, rapidapi_key_cipher, updated_by)
     values (true, $1::jsonb, $2, $3, $4, 'test')
     on conflict (id) do update set settings = excluded.settings,
       google_key_cipher = excluded.google_key_cipher, apify_key_cipher = excluded.apify_key_cipher,
       rapidapi_key_cipher = excluded.rapidapi_key_cipher`,
    [
      JSON.stringify(settings),
      google ? await sealSecret(google, secret) : null,
      apify ? await sealSecret(apify, secret) : null,
      rapidapi ? await sealSecret(rapidapi, secret) : null
    ]
  )
}

test(
  'capabilities read the keys saved on /ops/wo: Places with a Google key, Google Maps with an Apify one',
  opts,
  async () => {
    const { pool, call } = await world()
    const none = await call(A, 'GET', `${BASE}/capabilities`)
    assert.deepEqual(none.body.discovery, { 'google-places': false, 'google-maps': false, osm: true })
    await saveOps(pool, { google: 'AIza-ops', apify: 'apify-ops' })
    const both = await call(A, 'GET', `${BASE}/capabilities`)
    assert.deepEqual(both.body.discovery, { 'google-places': true, 'google-maps': true, osm: true })
    assert.equal(both.body.sources.facebook.available, true, 'the Apify key from /ops reaches the connectors')
  }
)

test('search with nothing saved on /ops: env Apify token, 2 km, auto chain — as before', opts, async () => {
  const { call, discoverAsked } = await world({ extraEnv: { APIFY_TOKEN: 'apify-env' } })
  const res = await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An' })
  assert.equal(res.status, 200)
  const { area, deps } = discoverAsked[0]
  assert.equal(area.radiusM, 2000)
  assert.equal(deps.token, 'apify-env')
  assert.equal(deps.provider, 'auto')
  assert.equal(deps.googleKey, undefined)
  // 2 km is a quick search (20 places); `gmapsMaxPlaces` only lowers that.
  assert.equal(deps.limit, 20)
  assert.equal(deps.maxChargeUsd, 0.25)
})

test(
  'search follows /ops/wo settings: default radius, provider, place limit, charge ceiling, Google key',
  opts,
  async () => {
    const { pool, call, discoverAsked } = await world({ extraEnv: { APIFY_TOKEN: 'apify-env' } })
    await saveOps(pool, {
      google: 'AIza-ops',
      apify: 'apify-ops',
      settings: {
        defaultRadiusM: 3500,
        mapDiscoveryProvider: 'google',
        gmapsMaxPlaces: 25,
        maxChargeUsdPerRun: 0.1
      }
    })
    await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An' })
    const google = discoverAsked.at(-1)
    assert.equal(google.area.radiusM, 3500)
    assert.equal(google.deps.googleKey, 'AIza-ops')
    assert.equal(google.deps.provider, 'google')
    assert.equal(google.deps.limit, 25)
    assert.equal(google.deps.maxChargeUsd, 0.1)
    assert.equal(google.deps.token, undefined, 'the google chain never runs Apify, so no paid token')
    await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An', radiusM: 1200 })
    assert.equal(discoverAsked.at(-1).area.radiusM, 1200, 'a radius the person sends wins')
    await saveOps(pool, {
      google: 'AIza-ops',
      apify: 'apify-ops',
      settings: { mapDiscoveryProvider: 'auto' }
    })
    await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An' })
    assert.equal(discoverAsked.at(-1).deps.token, 'apify-ops', 'the /ops key wins over env')
  }
)

test(
  'searchRunsPerDay counts Apify searches only: Places answers are given back, Google Maps ones spend the day',
  opts,
  async () => {
    const { pool, call, discoverAsked, state } = await world()
    await saveOps(pool, { google: 'AIza-ops', apify: 'apify-ops', settings: { searchRunsPerDay: 1 } })
    state.discoverProvider = 'google-places'
    for (let i = 0; i < 3; i += 1) await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An' })
    assert.ok(
      discoverAsked.every((a) => a.deps.token === 'apify-ops'),
      'Places runs never spend the Apify day'
    )
    state.discoverProvider = 'google-maps'
    await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An' })
    assert.equal(discoverAsked.at(-1).deps.token, 'apify-ops')
    await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An' })
    assert.equal(discoverAsked.at(-1).deps.token, undefined, 'past searchRunsPerDay: no paid tier')
    assert.equal(discoverAsked.at(-1).deps.googleKey, 'AIza-ops', 'Places is not counted against Apify')
  }
)

test(
  'a revision carries the profile’s Google Place facts and the current site’s PageSpeed',
  opts,
  async () => {
    const { pool, call } = await world()
    const opp = await opportunity(call)
    const checkedAt = '2026-10-18T10:00:00.000Z'
    await pool.query(`insert into wo_profile (opportunity_id, profile) values ($1, $2::jsonb)`, [
      opp.id,
      JSON.stringify({
        name: 'Pho Ba',
        pageSpeed: { performance: 32, seo: 71, lcpMs: 6420, https: false, checkedAt },
        googlePlace: {
          placeId: 'ChIJphoba',
          amenities: { servesDinner: true },
          reservable: true,
          summaries: {},
          reviews: [{ author: 'Lan', text: 'Great pho', rating: 5 }],
          photos: [{ name: 'places/ChIJphoba/photos/p1', attributions: [] }],
          attribution: 'Google',
          fetchedAt: checkedAt
        }
      })
    ])
    const rev = await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})
    assert.equal(rev.status, 201, JSON.stringify(rev.body))
    const brief = rev.body.revision.brief
    assert.equal(brief.googlePlace.placeId, 'ChIJphoba')
    assert.equal(brief.googlePlace.reviews[0].author, 'Lan')
    assert.deepEqual(brief.currentSite, { performance: 32, seo: 71, lcpMs: 6420, https: false, checkedAt })
    const md = await call(A, 'GET', `${BASE}/revisions/${rev.body.revision.id}?format=md`)
    assert.match(md.body, /^## Google Place$/m)
    assert.match(md.body, /^- Performance: 32\/100/m)
  }
)

// ── Find places v2 (tasks/spec-wo-find-v2.md): filters, depth, chains, status, site check and score ──

const KINDS = ['restaurants', 'cafes', 'fast-food', 'bakeries', 'bars', 'nightlife']
const CUISINES = ['vietnamese', 'italian', 'seafood']
const PLACES = [
  {
    provider: 'google-places',
    providerId: 'ChIJ-pho',
    name: 'Pho Ba',
    lat: 15.88,
    lon: 108.33,
    website: 'https://phoba.example/',
    socials: {},
    phone: '+84 905 000 001',
    rating: 4.6,
    reviews: 1234,
    kind: 'restaurants',
    cuisine: 'vietnamese',
    primaryType: 'vietnamese_restaurant',
    distanceM: 410,
    priceLevel: 1,
    openNow: true,
    photo: { name: 'places/ChIJ-pho/photos/p1', credit: 'Lan Nguyen' }
  },
  {
    provider: 'google-places',
    providerId: 'ChIJ-kfc',
    name: 'KFC Hoi An',
    lat: 15.881,
    lon: 108.331,
    socials: {},
    kind: 'fast-food',
    primaryType: 'fast_food_restaurant',
    distanceM: 900,
    priceLevel: 1,
    openNow: null,
    photo: null
  },
  {
    provider: 'google-places',
    providerId: 'ChIJ-cafe',
    name: 'Fernlight',
    lat: 15.879,
    lon: 108.329,
    socials: { facebook: 'https://facebook.com/fernlight' },
    kind: 'cafes',
    primaryType: 'cafe',
    distanceM: 1200,
    priceLevel: 2,
    openNow: false,
    photo: null
  }
]

/** The domain pieces the find screen reads, as the plugin's own line of work delivers them. */
function findDomain(scored = []) {
  return {
    KINDS,
    CUISINES,
    markChains: (list) => list.map((c) => (c.name.startsWith('KFC') ? { ...c, chain: true } : c)),
    scoreOpportunity: (input) => {
      scored.push(input)
      const pending = input.candidate.website && !input.siteCheck
      return {
        score: pending ? null : 80,
        grade: pending ? null : 'A',
        pending,
        reasons: [['no-website', 40]]
      }
    }
  }
}

async function findWorld(extra = {}) {
  const scored = []
  const w = await world({ domainOverrides: findDomain(scored), ...extra })
  w.state.candidates = PLACES
  w.state.discoverProvider = 'google-places'
  await saveOps(w.pool, { google: 'AIza-ops', settings: { slowSiteThreshold: 40 } })
  return { ...w, scored }
}

test(
  'search v2: filters go to the domain, depth follows the radius, chains are hidden and counted',
  opts,
  async () => {
    const { call, discoverAsked } = await findWorld()
    // The shared Places cache snaps the point to its cell; this test pins the unsnapped request.
    await db.pool.query(`update wo_ops_setting set settings = settings || '{"placesCacheDays":0}'::jsonb`)
    const res = await call(A, 'POST', `${BASE}/search`, {
      query: 'Hoi An',
      radiusM: 2000,
      kinds: ['restaurants', 'cafes'],
      cuisines: ['vietnamese'],
      minRating: 4,
      priceLevels: [1, 2],
      openNow: true
    })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const { deps } = discoverAsked.at(-1)
    assert.deepEqual(deps.filters, {
      trade: 'food',
      kinds: ['restaurants', 'cafes'],
      cuisines: ['vietnamese'],
      minRating: 4,
      priceLevels: [1, 2],
      openNow: true
    })
    assert.equal(deps.limit, 20, '≤ 3 km → quick → 20')
    assert.equal(res.body.provider, 'google-places')
    assert.equal(res.body.hiddenChains, 1)
    assert.deepEqual(
      res.body.candidates.map((c) => c.name),
      ['Pho Ba', 'Fernlight']
    )
    const pho = res.body.candidates[0]
    assert.equal(pho.kind, 'restaurants')
    assert.equal(pho.distanceM, 410)
    assert.deepEqual(pho.photo, { name: 'places/ChIJ-pho/photos/p1', credit: 'Lan Nguyen' })
    assert.equal(pho.status, 'new')
    assert.equal(pho.chainSuspect, false)
    assert.equal(pho.siteCheck, null)
    assert.equal(res.body.attribution, undefined, 'no "Powered by Google" line (Lee, 19/10)')
    assert.deepEqual(pho.score, { score: null, grade: null, pending: true, reasons: [['no-website', 40]] })

    const standard = await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An', radiusM: 5000 })
    assert.equal(discoverAsked.at(-1).deps.limit, 60, '5 km → standard → min(60, gmapsMaxPlaces 60)')
    assert.deepEqual(discoverAsked.at(-1).deps.filters, {
      trade: 'any',
      kinds: KINDS,
      cuisines: [],
      minRating: null,
      priceLevels: [],
      openNow: false
    })
    assert.equal(standard.body.hiddenChains, 1)
    const quick = await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An', radiusM: 5000, depth: 'quick' })
    assert.equal(quick.status, 200)
    assert.equal(discoverAsked.at(-1).deps.limit, 20, 'an explicit depth wins')
    const withChains = await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An', includeChains: true })
    assert.equal(withChains.body.hiddenChains, 0)
    assert.equal(withChains.body.candidates.find((c) => c.name === 'KFC Hoi An').chain, true)
    for (const bad of [
      { kinds: ['hotels'] },
      { trade: 'government' },
      { trade: 'beauty', cuisines: ['vietnamese'] },
      { cuisines: 'vietnamese' },
      { minRating: 6 },
      { priceLevels: [5] },
      { depth: 'deep' },
      { openNow: 'yes' }
    ]) {
      const r = await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An', ...bad })
      assert.equal(r.status, 400, JSON.stringify(bad))
      assert.equal(r.body.code, 'INVALID_SEARCH')
    }
  }
)

test(
  'search v2: social pages the site check found on the website are in the candidate on first paint',
  opts,
  async () => {
    const { call, pool } = await findWorld()
    await pool.query(
      `insert into wo_site_check (url_key, url, status, emails, socials, checked_at)
     values ('https://phoba.example', 'https://phoba.example/', 'done', '[]', $1, $2)`,
      [
        JSON.stringify({ facebook: 'https://www.facebook.com/phoba', instagram: 'javascript:alert(1)' }),
        new Date('2026-10-18T10:00:00Z')
      ]
    )
    const res = await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An' })
    assert.equal(res.status, 200)
    const pho = res.body.candidates.find((c) => c.name === 'Pho Ba')
    assert.deepEqual(pho.socials, { facebook: 'https://www.facebook.com/phoba' }, 'http(s) pages only')
    assert.equal(pho.siteCheck.socials.facebook, 'https://www.facebook.com/phoba')
  }
)

test(
  'search v2: status comes from my own opportunities, jobs and builds; the site check is read, never queued',
  opts,
  async () => {
    const { call, runBuild, pool, scored } = await findWorld()
    const seen = await call(A, 'POST', BASE, { candidate: PLACES[2] })
    assert.equal(seen.status, 201)
    const researched = await call(A, 'POST', BASE, { candidate: PLACES[0] })
    assert.equal(researched.status, 201)
    const job = await call(A, 'POST', `${BASE}/${researched.body.opportunity.id}/research`, {
      requestId: 'req-00000001'
    })
    await pool.query(`update wo_job set state = 'completed' where id = $1`, [job.body.job.id])
    const checkedAt = new Date('2026-10-18T10:00:00Z')
    await pool.query(
      `insert into wo_site_check (url_key, url, status, performance, seo, lcp_ms, https, mobile_friendly, cms, copyright_year, emails, socials, checked_at)
     values ('https://phoba.example', 'https://phoba.example/', 'done', 32, 71, 6420, false, false, 'Wix', 2016, '["hi@phoba.example"]', '{}', $1)`,
      [checkedAt]
    )
    const res = await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An' })
    assert.equal(res.status, 200)
    const byName = Object.fromEntries(res.body.candidates.map((c) => [c.name, c]))
    assert.equal(byName['Pho Ba'].status, 'researched')
    assert.equal(byName['Fernlight'].status, 'seen')
    assert.equal(byName['Pho Ba'].siteCheck.performance, 32)
    assert.equal(byName['Pho Ba'].siteCheck.cms, 'Wix')
    assert.equal(byName['Pho Ba'].siteCheck.checkedAt, checkedAt.toISOString())
    assert.equal(byName['Pho Ba'].score.grade, 'A')
    const last = scored.find((s) => s.candidate.name === 'Pho Ba')
    assert.equal(last.status, 'researched')
    assert.equal(last.slowSiteThreshold, 40, 'from /ops/wo')
    assert.equal(last.siteCheck.performance, 32)
    assert.ok(last.now instanceof Date, 'the scorer reads the year off a Date')
    assert.equal(
      (await pool.query('select count(*)::int as n from wo_site_check')).rows[0].n,
      1,
      'a search reads site checks and queues none'
    )
    // Another account sees its own status only.
    const other = await call(B, 'POST', `${BASE}/search`, { query: 'Hoi An' })
    assert.ok(other.body.candidates.every((c) => c.status === 'new'))
    // A demo built from a revision → demo.
    const rev = await call(A, 'POST', `${BASE}/${researched.body.opportunity.id}/revisions`, {})
    await runBuild(A, 'POST', `${BASE}/revisions/${rev.body.revision.id}/build`, {
      requestId: 'build-0001',
      label: 'phoba'
    })
    const built = await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An' })
    assert.equal(built.body.candidates.find((c) => c.name === 'Pho Ba').status, 'demo')
  }
)

test(
  'create keeps the find fields of a candidate: kind, cuisine, distance, price, photo, reviews, phone',
  opts,
  async () => {
    const { call } = await findWorld()
    const res = await call(A, 'POST', BASE, {
      candidate: {
        ...PLACES[0],
        chain: false,
        photo: { name: 'places/ChIJ-pho/photos/p1', credit: 'Lan Nguyen', extra: 'x' }
      }
    })
    assert.equal(res.status, 201)
    const c = res.body.opportunity.candidate
    assert.equal(c.kind, 'restaurants')
    assert.equal(c.cuisine, 'vietnamese')
    assert.equal(c.primaryType, 'vietnamese_restaurant')
    assert.equal(c.distanceM, 410)
    assert.equal(c.priceLevel, 1)
    assert.equal(c.openNow, true)
    assert.equal(c.reviews, 1234)
    assert.equal(c.phone, '+84 905 000 001')
    assert.deepEqual(c.photo, { name: 'places/ChIJ-pho/photos/p1', credit: 'Lan Nguyen' })
    const bad = await call(A, 'POST', BASE, {
      candidate: { ...PLACES[1], kind: 'hotels', priceLevel: 9, photo: { name: 'x' } }
    })
    assert.equal(bad.status, 201)
    assert.equal(bad.body.opportunity.candidate.kind, null)
    assert.equal(bad.body.opportunity.candidate.priceLevel, null)
    assert.equal(bad.body.opportunity.candidate.photo, null)
  }
)

test(
  'site-checks door: queues the first N unknown addresses, answers what is known, validates and rate-limits',
  opts,
  async () => {
    const { app, call, setSwitch, pool } = await findWorld()
    await saveOps(pool, { google: 'AIza-ops', settings: { siteChecksAutoLimit: 2 } })
    const urls = [
      'https://phoba.example/',
      'https://phoba.example',
      'https://two.example/',
      'https://three.example/'
    ]
    const first = await call(A, 'POST', `${BASE}/site-checks`, { urls })
    assert.equal(first.status, 200, JSON.stringify(first.body))
    assert.deepEqual(first.body, {
      checks: {
        'https://phoba.example/': { status: 'queued' },
        'https://phoba.example': { status: 'queued' },
        'https://two.example/': { status: 'queued' },
        'https://three.example/': { status: 'not_queued' }
      }
    })
    await app.siteChecks.drain()
    const second = await call(A, 'POST', `${BASE}/site-checks`, { urls })
    // The test world has no network: the homepage fetch fails, so the verdict is down.
    const phoba = second.body.checks['https://phoba.example/']
    assert.equal(phoba.status, 'down')
    assert.equal(phoba.performance, null)
    assert.equal(phoba.score, undefined, 'checks only: the client scores')
    assert.equal(second.body.checks['https://three.example/'].status, 'queued', 'asked again: now queued')
    for (const body of [
      {},
      { urls: 'x' },
      { urls: ['ftp://x.example'] },
      { urls: Array(61).fill('https://x.example/') }
    ]) {
      const r = await call(A, 'POST', `${BASE}/site-checks`, body)
      assert.equal(r.status, 400, JSON.stringify(body))
      assert.equal(r.body.code, 'INVALID_URLS')
    }
    for (let i = 0; i < 598; i += 1) await call(A, 'POST', `${BASE}/site-checks`, { urls: [] })
    const limited = await call(A, 'POST', `${BASE}/site-checks`, { urls: [] })
    assert.equal(limited.status, 429, '600 calls an hour per account')
    assert.equal((await call(null, 'POST', `${BASE}/site-checks`, { urls: [] })).status, 401)
    await setSwitch(false)
    assert.equal((await call(A, 'POST', `${BASE}/site-checks`, { urls: [] })).body.code, 'FEATURE_OFF')
  }
)

test(
  'place photo doors: by name (as /search gave it) or by place id (Details, photos mask only); nothing cached here',
  opts,
  async () => {
    // Before any key is saved on /ops/wo: the door says so instead of guessing.
    const bare = await world()
    const noKey = await bare.call(A, 'GET', `${BASE}/places/ChIJ-pho/photo`)
    assert.equal(noKey.status, 503)
    assert.equal(noKey.body.code, 'CREDENTIAL_MISSING')
    const detailsAsked = []
    const photosAsked = []
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    const w = await findWorld({
      domainOverrides: {
        ...findDomain(),
        fetchLimited: async (url, deps) => {
          detailsAsked.push({ url, headers: deps.headers })
          const id = url.split('/places/')[1]
          const photos =
            id === 'ChIJ-none'
              ? []
              : [{ name: `places/${id}/photos/d1`, authorAttributions: [{ displayName: 'Minh Trần' }] }]
          return {
            url,
            status: 200,
            mime: 'application/json',
            bytes: new TextEncoder().encode(JSON.stringify({ photos })),
            truncated: false
          }
        },
        fetchPlacePhoto: async (name, deps) => {
          photosAsked.push({ name, deps })
          if (name === 'places/ChIJ-old/photos/expired')
            throw Object.assign(new Error('HTTP 404'), { code: 'PROVIDER_ERROR', status: 404 })
          return {
            bytes: png,
            mime: 'image/png',
            sourceUrl: `google-places:${name}`,
            attributions: [{ displayName: 'Lan Nguyen' }]
          }
        }
      }
    })
    const { call } = w
    const byName = await call(A, 'GET', `${BASE}/places/photo?name=places/ChIJ-pho/photos/p1&w=5000`)
    assert.equal(byName.status, 200)
    assert.equal(byName.headers.get('content-type'), 'image/png')
    assert.equal(byName.headers.get('cache-control'), 'private, max-age=600')
    assert.equal(byName.headers.get('x-photo-credit'), encodeURIComponent('Lan Nguyen · Google'))
    assert.equal(detailsAsked.length, 0, 'the name from /search is used as is, no Details call')
    assert.equal(photosAsked[0].name, 'places/ChIJ-pho/photos/p1')
    assert.equal(photosAsked[0].deps.maxWidthPx, 1600, 'w clamped to 160–1600')
    assert.equal(photosAsked[0].deps.googleKey, 'AIza-ops')
    assert.equal((await call(A, 'GET', `${BASE}/places/photo?name=places/ChIJ-pho/photos/p1`)).status, 200)
    assert.equal(photosAsked.length, 2, 'every read goes to Google: nothing is kept here')

    const byId = await call(A, 'GET', `${BASE}/places/ChIJ-other/photo?w=480`)
    assert.equal(byId.status, 200)
    assert.equal(detailsAsked.length, 1)
    assert.equal(detailsAsked[0].url, 'https://places.googleapis.com/v1/places/ChIJ-other')
    assert.equal(detailsAsked[0].headers['X-Goog-FieldMask'], 'photos')
    assert.equal(detailsAsked[0].headers['X-Goog-Api-Key'], 'AIza-ops')
    assert.equal(byId.headers.get('x-photo-credit'), encodeURIComponent('Minh Trần · Google'))
    assert.equal(photosAsked.at(-1).deps.maxWidthPx, 480)

    // An expired name: Google answers 404, the door looks the place up once and serves the current photo.
    const expired = await call(A, 'GET', `${BASE}/places/photo?name=places/ChIJ-old/photos/expired`)
    assert.equal(expired.status, 200)
    assert.deepEqual(
      photosAsked.slice(-2).map((p) => p.name),
      ['places/ChIJ-old/photos/expired', 'places/ChIJ-old/photos/d1']
    )
    assert.equal(detailsAsked.at(-1).url, 'https://places.googleapis.com/v1/places/ChIJ-old')

    const none = await call(A, 'GET', `${BASE}/places/ChIJ-none/photo`)
    assert.equal(none.status, 404)
    assert.equal(none.body.code, 'NO_PHOTO')
    assert.equal((await call(A, 'GET', `${BASE}/places/bad%20id/photo`)).status, 400)
    assert.equal((await call(A, 'GET', `${BASE}/places/photo?name=x`)).body.code, 'INVALID_PHOTO_NAME')
    assert.equal((await call(null, 'GET', `${BASE}/places/ChIJ-pho/photo`)).status, 401)
    await w.setSwitch(false)
    assert.equal((await call(A, 'GET', `${BASE}/places/ChIJ-pho/photo`)).body.code, 'FEATURE_OFF')
  }
)

test('capabilities v2: kinds, cuisines, the browser map key and the search limits', opts, async () => {
  const { call, pool } = await findWorld()
  const res = await call(A, 'GET', `${BASE}/capabilities`)
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.kinds, KINDS)
  assert.deepEqual(res.body.cuisines, CUISINES)
  assert.deepEqual(res.body.maps, { browserKey: null })
  // The limits a search really runs with: `gmapsMaxPlaces` (default 60, the spec's Standard) caps Standard, so the
  // screen's "Standard · up to N" says what the operator left (measured on dev 19/10/2026 with the old 40: 38 places, 2 pages).
  assert.deepEqual(res.body.search, { maxRadiusM: 50000, depths: { quick: 20, standard: 60 } })
  await saveOps(pool, {
    google: 'AIza-ops',
    settings: { googleMapsBrowserKey: 'AIzaSyBrowserKey_0123456789abcdef' }
  })
  assert.equal(
    (await call(A, 'GET', `${BASE}/capabilities`)).body.maps.browserKey,
    'AIzaSyBrowserKey_0123456789abcdef'
  )
  await saveOps(pool, { settings: { gmapsMaxPlaces: 100 } })
  assert.deepEqual((await call(A, 'GET', `${BASE}/capabilities`)).body.search.depths, {
    quick: 20,
    standard: 60
  })
  await saveOps(pool, { settings: { gmapsMaxPlaces: 10 } })
  assert.deepEqual((await call(A, 'GET', `${BASE}/capabilities`)).body.search.depths, {
    quick: 10,
    standard: 10
  })
})

// ── Social stats (tasks/todo-wo-social-stats.md step B) ─────────────────────────────────────────

/** Fetched a minute ago on the app's clock: a fixed date reads as stale once CI moves the clock forward. */
const socialTestAllocations = () => ({
  socialStatsProviderCycle: Object.fromEntries(
    ['facebook-scraper3', 'instagram-looter2', 'instagram-stable', 'tiktok-api23', 'yt-api'].map((b) => [
      b,
      {
        limit: 1000,
        used: 0,
        startsAt: new Date(Date.now() - 86400000).toISOString(),
        endsAt: new Date(Date.now() + 86400000).toISOString()
      }
    ])
  ),
  socialStatsYouTubeDailyQuota: 10000
})
const statAt = () => new Date(Date.now() - 60_000)
/** A cached snapshot as `social-stats.js` writes it. */
const insertStat = (pool, key, url, { lastPostAt, followers = 1200, network = key.split(':')[0] } = {}) =>
  pool.query(
    `insert into wo_social_stat (stat_key, network, url, status, followers, posts, last_post_at, posts_per_month, coverage, provider, fetched_at, checked_at)
     values ($1, $2, $3, 'done', $4, 40, $5, 4.3, 'complete', 'scraper3', $6, $6)`,
    [key, network, url, followers, lastPostAt ? new Date(lastPostAt) : null, statAt()]
  )

test(
  'social-stats door: queues the first N unknown profiles, answers what is known, force, validates and rate-limits',
  opts,
  async () => {
    const { app, call, setSwitch, pool } = await findWorld()
    await saveOps(pool, {
      rapidapi: 'rk-ops',
      settings: { socialStatsAutoLimit: 2, ...socialTestAllocations() }
    })
    await insertStat(pool, 'facebook:phoba', 'https://www.facebook.com/phoba', {
      lastPostAt: '2026-10-10T00:00:00Z'
    })
    const handles = [
      { network: 'facebook', url: 'https://www.facebook.com/phoba' },
      { network: 'instagram', url: 'https://www.instagram.com/phoba/' },
      { network: 'tiktok', url: 'https://www.tiktok.com/@phoba' },
      { network: 'youtube', url: 'https://www.youtube.com/@phoba' },
      { network: 'facebook', url: 'https://www.facebook.com/sharer.php' }
    ]
    const first = await call(A, 'POST', `${BASE}/social-stats`, { handles })
    assert.equal(first.status, 200, JSON.stringify(first.body))
    const fb = first.body.stats['https://www.facebook.com/phoba']
    assert.equal(fb.status, 'done')
    assert.equal(fb.followers, 1200)
    assert.equal(fb.lastPostAt, '2026-10-10T00:00:00.000Z')
    assert.deepEqual(Object.keys(fb).sort(), [
      'coverage',
      'fetchedAt',
      'followers',
      'lastPostAt',
      'posts',
      'postsPerMonth',
      'provider',
      'stale',
      'status',
      'url'
    ])
    assert.deepEqual(
      handles.slice(1).map((h) => first.body.stats[h.url].status),
      ['queued', 'queued', 'not_queued', 'not_found'],
      'socialStatsAutoLimit = 2; a non-profile URL is not_found'
    )
    await app.socialStats.drain()
    // The test world has no network: RapidAPI answers 500, so the verdict is failed.
    const second = await call(A, 'POST', `${BASE}/social-stats`, { handles: handles.slice(1, 2) })
    assert.equal(second.body.stats['https://www.instagram.com/phoba/'].status, 'failed')
    const forced = await call(A, 'POST', `${BASE}/social-stats`, {
      handles: handles.slice(0, 1),
      force: true
    })
    assert.equal(
      forced.body.stats['https://www.facebook.com/phoba'].status,
      'queued',
      'force refreshes a fresh one'
    )
    assert.equal(forced.body.stats['https://www.facebook.com/phoba'].followers, 1200)
    await app.socialStats.drain()
    for (const body of [
      {},
      { handles: 'x' },
      { handles: [{ network: 'twitter', url: 'https://x.com/a' }] },
      { handles: [{ network: 'tiktok' }] },
      { handles: Array(41).fill(handles[2]) },
      { handles: Array(5).fill(handles[2]), force: true },
      { handles: [], force: 'yes' }
    ]) {
      const r = await call(A, 'POST', `${BASE}/social-stats`, body)
      assert.equal(r.status, 400, JSON.stringify(body))
      assert.equal(r.body.code, 'INVALID_HANDLES')
    }
    for (let i = 0; i < 57; i += 1) await call(A, 'POST', `${BASE}/social-stats`, { handles: [] })
    const limited = await call(A, 'POST', `${BASE}/social-stats`, { handles: [] })
    assert.equal(limited.status, 429, '60 calls an hour per account')
    assert.equal((await call(null, 'POST', `${BASE}/social-stats`, { handles: [] })).status, 401)
    await setSwitch(false)
    assert.equal((await call(A, 'POST', `${BASE}/social-stats`, { handles: [] })).body.code, 'FEATURE_OFF')
  }
)

test(
  'switch off: the social-stats and site-checks ticks claim nothing; switch on: they run (dev round L5)',
  opts,
  async () => {
    const { app, pool, setSwitch, fetched } = await findWorld()
    await saveOps(pool, { rapidapi: 'rk-ops', google: 'AIza-ops', settings: socialTestAllocations() })
    await pool.query(
      `insert into wo_social_stat (stat_key, network, url, status, queued_at, attempts)
     values ('tiktok:phoba', 'tiktok', 'https://www.tiktok.com/@phoba', 'queued', now(), 0)`
    )
    await pool.query(
      `insert into wo_site_check (url_key, url, status, queued_at, attempts)
     values ('https://phoba.vn', 'https://phoba.vn', 'queued', now(), 0)`
    )
    const states = async () => [
      (await pool.query(`select status, attempts, lease_until from wo_social_stat`)).rows[0],
      (await pool.query(`select status, attempts, lease_until from wo_site_check`)).rows[0]
    ]
    const before = await states()
    await setSwitch(false)
    await app.socialStatsTick()
    await app.siteChecksTick()
    await app.socialStats.drain()
    await app.siteChecks.drain()
    assert.deepEqual(fetched, [], 'no provider, PageSpeed or crawl is asked')
    assert.deepEqual(await states(), before, 'nothing leased')
    await setSwitch(true)
    await app.socialStatsTick()
    await app.siteChecksTick()
    await app.socialStats.drain()
    await app.siteChecks.drain()
    assert.ok(
      fetched.some((u) => u.includes('tiktok-api23.p.rapidapi.com')),
      'the social stats tick ran'
    )
    const [social, site] = await states()
    assert.notEqual(social.status, 'queued')
    assert.ok(site.status !== 'queued' || site.attempts > 0, 'the site check was claimed')
  }
)

test(
  'search v2: known social stats ride on each candidate (read only) and fill the marketing points',
  opts,
  async () => {
    const real = await websiteOpportunitiesDomain()
    const { scoreOpportunity: _fake, ...findPieces } = findDomain()
    const w = await world({ domainOverrides: findPieces })
    w.state.candidates = PLACES.map((p) =>
      p.name === 'Fernlight'
        ? { ...p, socials: { ...p.socials, tiktok: 'https://www.tiktok.com/@fernlight' } }
        : p
    )
    w.state.discoverProvider = 'google-places'
    await insertStat(w.pool, 'facebook:fernlight', 'https://www.facebook.com/fernlight', {
      lastPostAt: '2026-06-01T00:00:00Z'
    })
    await insertStat(w.pool, 'tiktok:fernlight', 'https://www.tiktok.com/@fernlight', {
      lastPostAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      followers: 90
    })
    const res = await w.call(A, 'POST', `${BASE}/search`, { query: 'Hoi An' })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    const cafe = res.body.candidates.find((c) => c.name === 'Fernlight')
    assert.equal(cafe.social.facebook.status, 'done')
    assert.equal(cafe.social.facebook.url, 'https://facebook.com/fernlight', 'keyed by the candidate URL')
    assert.equal(cafe.social.tiktok.followers, 90)
    assert.equal(
      cafe.social.facebook.provider,
      'facebook/scraper3',
      'a bare tier stored earlier reads as the chain id'
    )
    const marketing = cafe.score.reasons.find(([key]) => key.startsWith('marketing.'))
    assert.equal(marketing[0], 'marketing.lastPost', 'the freshest post across networks scores')
    assert.ok(marketing[1] > 0)
    assert.equal(marketing[2].days, 3)
    const pho = res.body.candidates.find((c) => c.name === 'Pho Ba')
    assert.equal(pho.social, null, 'nothing known: null')
    assert.equal(pho.score.reasons.find(([key]) => key.startsWith('marketing.'))[0], 'marketing.unknown')
    assert.equal(
      (await w.pool.query('select count(*)::int as n from wo_social_stat')).rows[0].n,
      2,
      'a search reads social stats and queues none'
    )
    assert.equal(typeof real.scoreOpportunity, 'function')
  }
)

test(
  'capabilities: socialStats says which networks, limits and providers this deployment runs',
  opts,
  async () => {
    const { pool, call } = await world()
    const none = await call(A, 'GET', `${BASE}/capabilities`)
    assert.deepEqual(none.body.socialStats, {
      networks: ['facebook', 'instagram', 'tiktok', 'youtube'],
      autoLimit: 10,
      dailyCap: 200,
      providers: { rapidapi: false, youtube: false, apify: false }
    })
    await saveOps(pool, {
      rapidapi: 'rk-ops',
      google: 'AIza-ops',
      settings: { socialStatsAutoLimit: 4, socialStatsPerAccountPerDay: 30 }
    })
    const some = await call(A, 'GET', `${BASE}/capabilities`)
    assert.deepEqual(some.body.socialStats, {
      networks: ['facebook', 'instagram', 'tiktok', 'youtube'],
      autoLimit: 4,
      dailyCap: 30,
      providers: { rapidapi: true, youtube: true, apify: false }
    })
  }
)

// Per-template runs (tasks/todo-wo-per-template.md step 2): the /ops/wo pin decides the template on the server.
const TRACY_BASE = {
  id: 'tracy',
  label: 'Tracy Base',
  platforms: [
    { platform: 'joomla', tag: 'tracy-base/j6', version: '1.4.0' },
    { platform: 'wordpress', tag: 'tracy-base/wp7', version: '1.3.0' },
    { platform: 'emdash', tag: 'tracy-base/emdash-0.x', version: '0.9.0' }
  ]
}

// Pins apply when the build is chosen (a brief names no template since 24/10/2026): the demo action's selection.
const pinBuild = async (w, opp, requestId, selection) =>
  w.runBuild(A, 'POST', `${BASE}/${opp.id}/demo/build`, { requestId, selection, manual: true })

test('pins: a build naming only its CMS takes the CMS pin saved on /ops/wo', opts, async () => {
  const w = await world({ cards: [...CARDS, TRACY_BASE] })
  const opp = await opportunity(w.call)
  const built = await pinBuild(w, opp, 'pin-0001', { cms: 'joomla' })
  assert.equal(built.status, 202, JSON.stringify(built.body))
  const { template } = await choiceOf(w.pool, 'pin-0001')
  assert.deepEqual(
    {
      quickstart: template.quickstart,
      design: template.design,
      version: template.version,
      reason: template.reason
    },
    { quickstart: 'tracy-base/j6', design: 'tracy', version: '1.4.0', reason: 'pinned' }
  )
})

test('pins: an operator pin on /ops/wo wins over the default pin', opts, async () => {
  const w = await world({ cards: [...CARDS, TRACY_BASE] })
  await saveOps(w.pool, { settings: { pinnedTemplates: { joomla: 'tracy-business/j6' } } })
  const opp = await opportunity(w.call)
  await pinBuild(w, opp, 'pin-0002', { cms: 'joomla' })
  const { template } = await choiceOf(w.pool, 'pin-0002')
  assert.equal(template.quickstart, 'tracy-business/j6')
  assert.equal(template.design, 'tracy-business')
  assert.equal(template.reason, 'pinned')
})

test('pins: a pin no longer offered falls back to the restaurant fit and says why', opts, async () => {
  const w = await world()
  const opp = await opportunity(w.call)
  await pinBuild(w, opp, 'pin-0003', { cms: 'joomla' })
  const { template } = await choiceOf(w.pool, 'pin-0003')
  assert.equal(template.design, 'ja-restaurant')
  assert.equal(template.reason, 'pin-missing:tracy-base/j6;restaurant-match')
})

test(
  'pins: a pin no longer offered under the strict policy is refused 409 before any work or charge',
  opts,
  async () => {
    const w = await world()
    await saveOps(w.pool, { settings: { templatePinPolicy: 'strict' } })
    const opp = await opportunity(w.call)
    const res = await w.call(A, 'POST', `${BASE}/${opp.id}/demo/build`, {
      requestId: 'pin-0004',
      selection: { cms: 'joomla' }
    })
    assert.equal(res.status, 409)
    assert.equal(res.body.code, 'TEMPLATE_PIN_UNAVAILABLE')
    assert.equal(res.body.pin, 'tracy-base/j6')
    assert.equal(res.body.cms, 'joomla')
    assert.equal((await w.pool.query('select count(*)::int as n from wo_demo_action')).rows[0].n, 0)
  }
)

test('pins: a requested template of another CMS, or not offered, is refused 400', opts, async () => {
  const w = await world({ cards: [...CARDS, TRACY_BASE] })
  const opp = await opportunity(w.call)
  for (const template of [
    { quickstart: 'tracy-base/wp7', design: 'tracy' },
    { quickstart: 'gone/j6', design: 'gone' }
  ]) {
    const res = await w.call(A, 'POST', `${BASE}/${opp.id}/demo/build`, {
      requestId: `pin-bad-${template.design}`,
      selection: { cms: 'joomla', ...template }
    })
    assert.equal(res.status, 400, JSON.stringify(template))
    assert.equal(res.body.code, 'INVALID_TEMPLATE')
  }
  assert.equal((await w.pool.query('select count(*)::int as n from wo_demo_action')).rows[0].n, 0)
  await pinBuild(w, opp, 'pin-0005', { cms: 'joomla', quickstart: 'tracy-base/j6', design: 'tracy' })
  assert.equal((await choiceOf(w.pool, 'pin-0005')).template.reason, 'requested')
})

test(
  'pins: the /ops/wo Default CMS is what Settings offers an account with none; each CMS builds on its pin',
  opts,
  async () => {
    const w = await world({ cards: [...CARDS, TRACY_BASE] })
    await saveOps(w.pool, { settings: { defaultCms: 'wordpress' } })
    const opp = await opportunity(w.call)
    const settings = await w.call(A, 'GET', `${BASE}/settings`)
    assert.equal(settings.body.cms, 'wordpress')
    await pinBuild(w, opp, 'pin-0006', { cms: 'wordpress' })
    assert.equal((await choiceOf(w.pool, 'pin-0006')).template.quickstart, 'tracy-base/wp7')
    await pinBuild(w, opp, 'pin-0007', { cms: 'emdash' })
    const emdash = await choiceOf(w.pool, 'pin-0007')
    assert.equal(emdash.cms, 'emdash')
    assert.equal(emdash.cmsSource, 'account')
    assert.equal(emdash.template.quickstart, 'tracy-base/emdash-0.x')
  }
)

// Run 1–3 on wo2 (19/10/2026, J2/L1): the host failed the provision and the build said `provisioning` for ever; pressing
// Build again with the same requestId handed the dead build back instead of building it.
test(
  'build: a provision the host failed reads failed with the host reason, and the same requestId builds it again',
  opts,
  async () => {
    const { app, pool, call, runBuild, forwarded, state } = await world()
    const opp = await opportunity(call)
    const rev = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
    const press = () =>
      runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, { requestId: 'build-fail1', label: 'phoba' })
    state.siteJob = 'running'
    const first = await press()
    assert.equal(first.status, 202, JSON.stringify(first.body))
    state.siteJobBody = {
      state: 'failed',
      step: 'provision',
      detail: 'see /var/log/provision.log',
      output:
        '!! the restored WordPress never answered after 120s (check `docker logs phoba-web-1`)\nmore lines'
    }
    const read = await call(A, 'GET', `${BASE}/builds/${first.body.build.id}`)
    assert.equal(read.status, 200)
    assert.equal(read.body.build.state, 'failed')
    assert.equal(read.body.build.receipt.failure.code, 'PROVISION_FAILED')
    assert.match(read.body.build.receipt.failure.reason, /never answered after 120s/)
    assert.equal(read.body.build.receipt.status, 201, 'the create door’s own answer stays on the receipt')

    await pool.query('update wo_demo_action set next_at=null')
    await app.demoRunner.tick()
    await app.demoRunner.drain()
    state.siteJobBody = null
    state.siteJob = 'done'
    const retry = await runBuild(A, 'POST', `${BASE}/${opp.id}/demo/build`, {
      requestId: 'retry-fail1',
      retryOf: first.body.actions[0].id
    })
    assert.equal(retry.status, 202, JSON.stringify(retry.body))
    assert.equal(retry.body.build.id, first.body.build.id)
    assert.equal(retry.body.build.state, 'done')
    const creates = forwarded.filter((f) => f.path === '/api/sites').map((f) => JSON.parse(f.init.body))
    assert.equal(creates.length, 2, 'the failed build is asked again')
    assert.equal(
      creates[1].buildId,
      creates[0].buildId,
      'the same build: the create door retries it in place'
    )
    assert.equal(creates[1].label, 'phoba')
  }
)

test(
  'build: a provision that ended with nobody watching is written on the build by the sweep',
  opts,
  async () => {
    const { pool, call } = await world()
    const opp = await opportunity(call)
    const accountId = (await pool.query('select id from account where email = $1', [A])).rows[0].id
    const { deterministicBuildId } = await import('../src/opportunities-build/builds.js')
    const made = []
    for (const [n, ending] of [
      [1, 'failed'],
      [2, 'done'],
      [3, 'provisioning']
    ]) {
      const rev = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
      const buildId = deterministicBuildId(accountId, rev.id, `build-sweep${n}`)
      const row = (
        await pool.query(
          `insert into wo_build (account_id, revision_id, request_id, build_id, state, site_key, site_job_id, choice, choice_key)
           values ($1, $2, $3, $4, 'provisioning', $5, $6, '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture') returning id`,
          [accountId, rev.id, `build-sweep${n}`, buildId, `s${n}.localhost`, `job-s${n}`]
        )
      ).rows[0]
      await pool.query(
        `insert into site (site_key, label, host, platform) values ($1, $2, 'local', 'joomla')`,
        [`s${n}.localhost`, `s${n}`]
      )
      await pool.query(
        `insert into job (id, site_key, host, kind, state, detail) values ($1, $2, 'local', 'provision', $3, $4::jsonb)`,
        [
          `job-s${n}`,
          `s${n}.localhost`,
          ending === 'provisioning' ? 'running' : ending,
          JSON.stringify(
            ending === 'failed' ? { detail: 'tracy-host restarted before this job finished' } : {}
          )
        ]
      )
      await pool.query(
        `insert into site_creation (account_id, build_id, payload_hash, state, site_key, job_id)
         values ($1, $2, 'h', $3, $4, $5)`,
        [accountId, buildId, ending, `s${n}.localhost`, `job-s${n}`]
      )
      made.push(row.id)
    }
    assert.equal(await settleEndedBuilds(pool), 2)
    const states = (
      await pool.query('select id, state, receipt from wo_build where id = any($1::uuid[])', [made])
    ).rows
    const byId = new Map(states.map((r) => [r.id, r]))
    assert.equal(byId.get(made[0]).state, 'failed')
    assert.equal(byId.get(made[0]).receipt.failure.code, 'PROVISION_FAILED')
    assert.match(byId.get(made[0]).receipt.failure.reason, /tracy-host restarted/)
    assert.equal(byId.get(made[1]).state, 'done')
    assert.equal(byId.get(made[2]).state, 'provisioning', 'a provision still running is left alone')
    assert.equal(await settleEndedBuilds(pool), 0, 'settled once')
  }
)

// Run 1–3 on wo2 (L2): a reload made a fresh requestId, and the next press made a second site for one revision.
test(
  'build: one live demo per (brief, choice) — the same CMS and template again is refused BUILD_EXISTS before any charge',
  opts,
  async () => {
    const { pool, call, runBuild, forwarded } = await world()
    const opp = await opportunity(call)
    const press = (requestId, selection = { cms: 'joomla' }) =>
      runBuild(A, 'POST', `${BASE}/${opp.id}/demo/build`, { requestId, selection, manual: true })
    const first = await press('build-one1')
    assert.equal(first.status, 202, JSON.stringify(first.body))
    const second = await call(A, 'POST', `${BASE}/${opp.id}/demo/build`, {
      requestId: 'build-one2',
      selection: { cms: 'joomla' }
    })
    assert.equal(second.status, 409)
    assert.equal(second.body.code, 'BUILD_EXISTS')
    assert.equal(second.body.build.id, first.body.build.id)
    assert.equal(
      (await pool.query('select count(*)::int n from wo_demo_action')).rows[0].n,
      1,
      'nothing charged'
    )
    assert.equal(forwarded.filter((f) => f.path === '/api/sites').length, 1)
    // Another template: a second demo of the same brief.
    const other = await press('build-one3', {
      cms: 'joomla',
      design: 'tracy-business',
      quickstart: 'tracy-business/j6'
    })
    assert.equal(other.status, 202, JSON.stringify(other.body))
    assert.notEqual(other.body.build.id, first.body.build.id)
    assert.equal(other.body.build.revisionId, first.body.build.revisionId)
    assert.equal(forwarded.filter((f) => f.path === '/api/sites').length, 2)
    // A failed demo is not a live one: the same choice builds again.
    await pool.query("update wo_build set state = 'failed' where id = $1", [first.body.build.id])
    const again = await press('build-one4')
    assert.equal(again.status, 202, JSON.stringify(again.body))
    assert.notEqual(again.body.build.id, first.body.build.id)
  }
)

// #1456 marks a deleted demo's build `deleted`: a state the build door does not know must not hold the revision.
test(
  'build: only requesting, provisioning and done are live — a build in any other state (deleted) does not block a rebuild',
  opts,
  async () => {
    const { pool, call, runBuild } = await world()
    const opp = await opportunity(call)
    const rev = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
    const first = await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, { requestId: 'build-del1' })
    assert.equal(first.status, 202, JSON.stringify(first.body))
    await pool.query(`update wo_build set state = 'deleted' where id = $1`, [first.body.build.id])
    const again = await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, { requestId: 'build-del2' })
    assert.equal(again.status, 202, JSON.stringify(again.body))
    assert.notEqual(again.body.build.id, first.body.build.id)
  }
)

test(
  'build: a request whose process died before the create door is lost after ten minutes, not live for ever',
  opts,
  async () => {
    const { pool, call, runBuild } = await world()
    const opp = await opportunity(call)
    const rev = (await call(A, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
    const accountId = (await pool.query('select id from account where email = $1', [A])).rows[0].id
    const { deterministicBuildId } = await import('../src/opportunities-build/builds.js')
    const row = (
      await pool.query(
        `insert into wo_build (account_id, revision_id, request_id, build_id, updated_at, choice, choice_key)
       values ($1, $2, 'build-lost1', $3, now() - interval '11 minutes', '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture') returning id`,
        [accountId, rev.id, deterministicBuildId(accountId, rev.id, 'build-lost1')]
      )
    ).rows[0]
    const read = await call(A, 'GET', `${BASE}/builds/${row.id}`)
    assert.equal(read.body.build.state, 'failed')
    assert.equal(read.body.build.receipt.failure.code, 'REQUEST_LOST')
    const next = await runBuild(A, 'POST', `${BASE}/revisions/${rev.id}/build`, { requestId: 'build-lost2' })
    assert.equal(next.status, 202, JSON.stringify(next.body))
  }
)

// ── Find box autocomplete (tasks/todo-wo-social-stats.md item F) ──

const SESSION = '0f8b8c1e-4a8e-4c1e-9d55-6a9b1f2b9c11'

function suggestDomain(asked) {
  return {
    suggestPlaces: async (args, deps) => {
      asked.push({ door: 'suggest', args, deps })
      if (args.input === 'quota') throw Object.assign(new Error('quota'), { code: 'QUOTA' })
      return [
        {
          placeId: 'ChIJdn',
          text: 'Da Nang, Vietnam',
          mainText: 'Da Nang',
          secondaryText: 'Vietnam',
          types: ['locality', 'political']
        }
      ]
    },
    fetchPlaceLocation: async (placeId, deps) => {
      asked.push({ door: 'resolve', placeId, deps })
      if (placeId === 'ChIJnowhere') return null
      return { placeId, label: 'Da Nang, Vietnam', lat: 16.054, lon: 108.202 }
    }
  }
}

test(
  'suggest door: Google Autocomplete through the domain, short input answers nothing, no key is 503, validated and rate-limited',
  opts,
  async () => {
    const asked = []
    const bare = await world({ domainOverrides: suggestDomain(asked) })
    const noKey = await bare.call(A, 'GET', `${BASE}/places/suggest?q=da%20nang&session=${SESSION}`)
    assert.equal(noKey.status, 503)
    assert.equal(noKey.body.code, 'CREDENTIAL_MISSING')
    assert.equal(asked.length, 0)

    const { call, pool, setSwitch } = await world({ domainOverrides: suggestDomain(asked) })
    await saveOps(pool, { google: 'AIza-ops' })
    const ok = await call(A, 'GET', `${BASE}/places/suggest?q=da%20nang&session=${SESSION}&lang=vi`)
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.deepEqual(ok.body, {
      suggestions: [
        // `types` reach the browser: a city is searched by name, a district at its point.
        {
          placeId: 'ChIJdn',
          text: 'Da Nang, Vietnam',
          mainText: 'Da Nang',
          secondaryText: 'Vietnam',
          types: ['locality', 'political']
        }
      ]
    })
    assert.deepEqual(asked[0].args, { input: 'da nang', sessionToken: SESSION, language: 'vi' })
    assert.equal(asked[0].deps.googleKey, 'AIza-ops')

    const short = await call(A, 'GET', `${BASE}/places/suggest?q=%20da%20&session=${SESSION}`)
    assert.deepEqual(short.body, { suggestions: [] })
    assert.equal(asked.length, 1, 'fewer than 3 characters: no Google call')

    for (const query of [
      `q=da%20nang`,
      `q=da%20nang&session=not-a-uuid`,
      `q=${'x'.repeat(201)}&session=${SESSION}`,
      `q=da%20nang&session=${SESSION}&lang=${encodeURIComponent('en"; drop')}`
    ]) {
      const r = await call(A, 'GET', `${BASE}/places/suggest?${query}`)
      assert.equal(r.status, 400, query)
      assert.equal(r.body.code, 'INVALID_SUGGEST')
    }
    const quota = await call(A, 'GET', `${BASE}/places/suggest?q=quota&session=${SESSION}`)
    assert.equal(quota.status, 429)
    assert.equal(quota.body.code, 'PROVIDER_QUOTA')

    const resolved = await call(A, 'GET', `${BASE}/places/suggest/ChIJdn?session=${SESSION}&lang=en`)
    assert.equal(resolved.status, 200, JSON.stringify(resolved.body))
    assert.deepEqual(resolved.body, { label: 'Da Nang, Vietnam', lat: 16.054, lon: 108.202 })
    const r = asked.at(-1)
    assert.equal(r.placeId, 'ChIJdn')
    assert.equal(r.deps.sessionToken, SESSION, 'the pick closes the billed session')
    assert.equal(r.deps.language, 'en')
    assert.equal(r.deps.googleKey, 'AIza-ops')
    assert.equal(
      (await call(A, 'GET', `${BASE}/places/suggest/ChIJnowhere?session=${SESSION}`)).body.code,
      'PLACE_NOT_FOUND'
    )
    assert.equal(
      (await call(A, 'GET', `${BASE}/places/suggest/bad%20id?session=${SESSION}`)).body.code,
      'INVALID_PLACE_ID'
    )

    // Counted so far: suggest, quota, two resolves (refusals before Google and short input are free).
    for (let i = 0; i < 300 - 4; i += 1)
      await call(A, 'GET', `${BASE}/places/suggest?q=da%20nang&session=${SESSION}`)
    const calls = asked.length
    const limited = await call(A, 'GET', `${BASE}/places/suggest?q=da%20nang&session=${SESSION}`)
    assert.equal(limited.status, 429, '300 calls an hour per account, suggest and resolve together')
    assert.equal(limited.body.code, 'RATE_LIMITED')
    assert.equal(asked.length, calls)

    assert.equal(
      (await call(null, 'GET', `${BASE}/places/suggest?q=da%20nang&session=${SESSION}`)).status,
      401
    )
    await setSwitch(false)
    assert.equal(
      (await call(A, 'GET', `${BASE}/places/suggest?q=da%20nang&session=${SESSION}`)).body.code,
      'FEATURE_OFF'
    )
    assert.equal(
      (await call(A, 'GET', `${BASE}/places/suggest/ChIJdn?session=${SESSION}`)).body.code,
      'FEATURE_OFF'
    )
  }
)

test('search by a picked suggestion: lat/lon with its label as query skips the geocoder', opts, async () => {
  const geocoded = []
  const { call, discoverAsked } = await world({
    domainOverrides: {
      geocode: async (q) => {
        geocoded.push(q)
        return { label: 'Hoi An', lat: 15.88, lon: 108.33 }
      }
    }
  })
  // The shared Places cache snaps the point to its cell; this test pins the unsnapped request.
  await db.pool.query(`update wo_ops_setting set settings = settings || '{"placesCacheDays":0}'::jsonb`)
  const res = await call(A, 'POST', `${BASE}/search`, {
    query: 'Da Nang, Vietnam',
    lat: 16.054,
    lon: 108.202
  })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.deepEqual(res.body.center, { label: 'Da Nang, Vietnam', lat: 16.054, lon: 108.202 })
  assert.equal(geocoded.length, 0)
  assert.equal(discoverAsked.at(-1).area.lat, 16.054)
  await call(A, 'POST', `${BASE}/search`, { query: 'Hoi An' })
  assert.deepEqual(geocoded, ['Hoi An'], 'a typed place is still geocoded')
})

test('the template snapshot carries the design system its archive wears, so the brief and the site’s record agree', () => {
  const cards = [
    {
      id: 'tracy',
      label: 'Tracy Base',
      card: {},
      platforms: [
        {
          platform: 'joomla',
          tag: 'tracy-base/j6',
          version: '1.0.5',
          wears: { id: 'apple', source: 'catalog', name: 'Apple' }
        },
        { platform: 'emdash', tag: 'tracy-base/emdash-0.x', version: '0.5.6', wears: null },
        { platform: 'wordpress', tag: 'tracy-base/wp7', version: '1.1.6' }
      ]
    }
  ]
  const pick = (cms, tag) => chooseTemplate({ cards }, cms, { quickstart: tag, design: 'tracy' })
  assert.deepEqual(pick('joomla', 'tracy-base/j6').designSystem, {
    id: 'apple',
    source: 'catalog',
    name: 'Apple'
  })
  assert.equal(pick('emdash', 'tracy-base/emdash-0.x').designSystem, null)
  assert.equal(
    pick('wordpress', 'tracy-base/wp7').designSystem,
    null,
    'a card from before this field: nothing is guessed'
  )
})
// ── Demo retention doors (tasks/todo-wo-demo-retention.md) ──────────────────────────────────────
const DAY_MS = 86_400_000
async function builtDemo(world, email = A) {
  const opp = await opportunity(world.call, email)
  const rev = (await world.call(email, 'POST', `${BASE}/${opp.id}/revisions`, {})).body.revision
  const built = await world.runBuild(email, 'POST', `${BASE}/revisions/${rev.id}/build`, {
    requestId: 'build-demo-1',
    label: 'phoba'
  })
  assert.equal(built.status, 202)
  await world.pool.query(
    `insert into site (site_key, label, host, platform, address) values ('phoba.localhost', 'phoba', 'local', 'joomla', 'https://phoba.localhost')
     on conflict do nothing`
  )
  return { opp, rev, build: built.body.build }
}
const demoRow = async (pool, id) =>
  (
    await pool.query(
      'select demo_expires_at, demo_touched_at, demo_frozen_at, demo_deleted_at from wo_build where id = $1',
      [id]
    )
  ).rows[0]

test(
  'a build that gets its site starts the demo clock, and the list row carries its demo',
  opts,
  async () => {
    const w = await world()
    const before = Date.now()
    const { build } = await builtDemo(w)
    const row = await demoRow(w.pool, build.id)
    const expires = new Date(row.demo_expires_at).getTime()
    assert.ok(expires >= before + 14 * DAY_MS && expires <= Date.now() + 14 * DAY_MS)
    const list = await w.call(A, 'GET', BASE)
    const demo = list.body.opportunities[0].demo
    assert.equal(demo.siteKey, 'phoba.localhost')
    assert.equal(demo.url, 'https://phoba.localhost')
    assert.equal(new Date(demo.expiresAt).getTime(), expires)
    assert.equal(demo.frozenAt, null)
    assert.equal(demo.deletedAt, null)
    assert.equal(demo.qa, null)
    assert.equal(demo.build.status, 'done')
    assert.ok(demo.build.startedAt)
    assert.equal(demo.deletesAt, null)
    await w.pool.query(`update wo_build set demo_frozen_at = '2026-10-19T00:00:00Z' where id = $1`, [
      build.id
    ])
    const frozen = (await w.call(A, 'GET', BASE)).body.opportunities[0].demo
    assert.equal(frozen.deletesAt, '2026-10-26T00:00:00.000Z', 'frozen + demoFreezeGraceDays (7)')
  }
)

test('opening the detail page touches the demo: a new term from now', opts, async () => {
  const w = await world()
  const { opp, build } = await builtDemo(w)
  await w.pool.query(`update wo_build set demo_expires_at = now() + interval '1 hour' where id = $1`, [
    build.id
  ])
  const before = Date.now()
  assert.equal((await w.call(A, 'GET', `${BASE}/${opp.id}`)).status, 200)
  const row = await demoRow(w.pool, build.id)
  assert.ok(new Date(row.demo_expires_at).getTime() >= before + 14 * DAY_MS)
  assert.ok(new Date(row.demo_touched_at).getTime() >= before)
})

test('reopen thaws a frozen demo; extend pushes a live one; each refuses the wrong state', opts, async () => {
  const w = await world()
  const { opp, build } = await builtDemo(w)
  assert.equal((await w.call(A, 'POST', `${BASE}/${opp.id}/demo/reopen`)).body.code, 'DEMO_NOT_FROZEN')
  await w.pool.query(`update wo_build set demo_expires_at = now() + interval '1 hour' where id = $1`, [
    build.id
  ])
  const before = Date.now()
  const extended = await w.call(A, 'POST', `${BASE}/${opp.id}/demo/extend`)
  assert.equal(extended.status, 200)
  assert.ok(new Date(extended.body.demo.expiresAt).getTime() >= before + 14 * DAY_MS)
  await w.pool.query('update wo_build set demo_frozen_at = now() where id = $1', [build.id])
  const refusedExtend = await w.call(A, 'POST', `${BASE}/${opp.id}/demo/extend`)
  assert.equal(refusedExtend.status, 409)
  assert.equal(refusedExtend.body.code, 'DEMO_FROZEN')
  const handoff = await w.call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
  assert.equal(handoff.status, 409)
  assert.equal(handoff.body.code, 'DEMO_FROZEN')
  assert.equal((await w.call(B, 'POST', `${BASE}/${opp.id}/demo/reopen`)).status, 404)
  const reopened = await w.call(A, 'POST', `${BASE}/${opp.id}/demo/reopen`)
  assert.equal(reopened.status, 200)
  assert.equal(reopened.body.demo.frozenAt, null)
  assert.equal((await demoRow(w.pool, build.id)).demo_frozen_at, null)
})

test('rebuild makes a new demo from the old revision once the old one was deleted', opts, async () => {
  const w = await world()
  const { opp, rev } = await builtDemo(w)
  const early = await w.call(A, 'POST', `${BASE}/${opp.id}/demo/rebuild`, { requestId: 'rebuild-0001' })
  assert.equal(early.status, 409)
  assert.equal(early.body.code, 'DEMO_NOT_DELETED')
  await w.pool.query(`delete from site where site_key = 'phoba.localhost'`)
  await w.pool.query('update wo_build set demo_frozen_at = now(), demo_deleted_at = now()')
  const asked = w.forwarded.filter((f) => f.path === '/api/sites').length
  const rebuilt = await w.call(A, 'POST', `${BASE}/${opp.id}/demo/rebuild`, { requestId: 'rebuild-0001' })
  assert.equal(rebuilt.status, 202, JSON.stringify(rebuilt.body))
  // The action names the old brief; the runner writes the build with the deleted build's choice.
  assert.equal(rebuilt.body.actions[0].revisionId, rev.id)
  assert.equal(rebuilt.body.build, null)
  assert.equal(
    w.forwarded.filter((f) => f.path === '/api/sites').length,
    asked,
    'acceptance precedes the create'
  )
  await w.app.demoRunner.tick()
  await w.app.demoRunner.drain()
  const creates = w.forwarded.filter((f) => f.path === '/api/sites')
  assert.equal(creates.length, asked + 1)
  assert.equal(JSON.parse(creates.at(-1).init.body).label, 'phoba')
  const made = (await w.pool.query("select * from wo_build where request_id = 'rebuild-0001'")).rows[0]
  assert.equal(made.revision_id, rev.id)
  assert.equal(
    made.choice_key,
    (
      await w.pool.query(
        "select choice_key from wo_build where request_id <> 'rebuild-0001' order by created_at limit 1"
      )
    ).rows[0].choice_key
  )
  const again = await w.call(A, 'POST', `${BASE}/${opp.id}/demo/rebuild`, { requestId: 'rebuild-0001' })
  assert.equal(again.body.build.id, made.id, 'the same requestId is the same build')
})

test(
  'a deleted demo is not "Demo built": the stage falls back, and Rebuild takes a build marked deleted',
  opts,
  async () => {
    const w = await world()
    const { opp, build, rev } = await builtDemo(w)
    await w.pool.query(
      `insert into site_creation (account_id, build_id, payload_hash, state, site_key)
     select account_id, build_id::text, 'h', 'done', site_key from wo_build where id = $1
       on conflict(account_id,build_id) do update set site_key=excluded.site_key,state='done'`,
      [build.id]
    )
    assert.equal((await w.call(A, 'GET', BASE)).body.opportunities[0].stage, 'demo')
    await w.pool.query(`delete from site where site_key = 'phoba.localhost'`)
    // What the sweep's delete writes: the state, not only the date (#1461 reads the state).
    await w.pool.query(`update wo_build set state = 'deleted', demo_frozen_at = now() where id = $1`, [
      build.id
    ])
    assert.equal((await w.call(A, 'GET', BASE)).body.opportunities[0].stage, 'demo')
    const rebuilt = await w.call(A, 'POST', `${BASE}/${opp.id}/demo/rebuild`, { requestId: 'rebuild-0002' })
    assert.equal(rebuilt.status, 202)
    assert.equal(rebuilt.body.actions[0].revisionId, rev.id)
  }
)

test('the hourly demo retention tick freezes a demo whose term ran out', opts, async () => {
  const w = await world()
  const { build } = await builtDemo(w)
  await w.pool.query(`update wo_build set demo_expires_at = now() - interval '1 minute' where id = $1`, [
    build.id
  ])
  const result = await w.app.demoRetentionTick()
  assert.equal(result.frozen, 1)
  assert.notEqual((await demoRow(w.pool, build.id)).demo_frozen_at, null)
})

test(
  'switch off: the demo retention tick freezes nothing; switch on: it runs (stand wo2 R8)',
  opts,
  async () => {
    const w = await world()
    const { build } = await builtDemo(w)
    await w.pool.query(`update wo_build set demo_expires_at = now() - interval '1 minute' where id = $1`, [
      build.id
    ])
    await w.setSwitch(false)
    const off = await w.app.demoRetentionTick()
    assert.deepEqual(off, { ran: false, reason: 'switch-off' })
    assert.equal((await demoRow(w.pool, build.id)).demo_frozen_at, null)
    await w.setSwitch(true)
    const on = await w.app.demoRetentionTick()
    assert.equal(on.frozen, 1)
    assert.notEqual((await demoRow(w.pool, build.id)).demo_frozen_at, null)
  }
)

test(
  'all build doors share the daily action counter; a refused bulk/manual/rebuild/retry starts nothing',
  opts,
  async () => {
    const { pool, call, forwarded } = await world()
    await saveOps(pool, { settings: { demoBuildsPerAccountPerDay: 1 } })
    const opportunities = []
    for (let i = 0; i < 3; i++) {
      const result = await call(A, 'POST', BASE, {
        candidate: {
          provider: 'osm',
          providerId: `cap/${i}`,
          name: `Cap place ${i}`,
          lat: 1,
          lon: 1,
          socials: {}
        }
      })
      opportunities.push(result.body.opportunity)
    }
    const first = await call(A, 'POST', `${BASE}/${opportunities[0].id}/demo/build`, {
      requestId: 'cap-first-press',
      selection: { cms: 'joomla', design: 'ja-restaurant', quickstart: 'ja-restaurant/j6' }
    })
    assert.equal(first.status, 202)
    assert.equal(first.body.usage.used, 1)
    assert.equal(
      (await pool.query('select id from wo_revision')).rowCount,
      0,
      '202 is before revision creation'
    )
    const replay = await call(A, 'POST', `${BASE}/${opportunities[0].id}/demo/build`, {
      requestId: 'cap-first-press',
      selection: { cms: 'joomla', design: 'ja-restaurant', quickstart: 'ja-restaurant/j6' }
    })
    assert.deepEqual(replay.body.actions, first.body.actions)
    assert.equal(replay.body.usage.used, 1)
    const bulk = await call(A, 'POST', `${BASE}/demo/builds/bulk`, {
      requestId: 'cap-bulk-press',
      selection: { cms: 'joomla', design: 'ja-restaurant', quickstart: 'ja-restaurant/j6' },
      ids: opportunities.slice(1).map((o) => o.id)
    })
    assert.equal(bulk.status, 429)
    assert.equal(bulk.body.code, 'DEMO_BUILD_DAILY_LIMIT')
    assert.equal(bulk.body.usage.used, 1)
    assert.equal(bulk.body.usage.limit, 1)
    assert.match(bulk.body.usage.resetsAt, /T00:00:00.000Z$/)
    const revision = (await call(A, 'POST', `${BASE}/${opportunities[1].id}/revisions`, {})).body.revision
    const manual = await call(A, 'POST', `${BASE}/revisions/${revision.id}/build`, {
      requestId: 'cap-manual-press'
    })
    assert.equal(manual.status, 429)
    assert.equal((await pool.query('select id from wo_build')).rowCount, 0)
    await pool.query(
      `insert into wo_build (account_id,revision_id,request_id,build_id,state,site_key,demo_deleted_at,label, choice, choice_key)
   select account_id,$2,'old-deleted-build',gen_random_uuid(),'deleted','old-cap.localhost',now(),'old-cap', '{"cms":"joomla","cmsSource":"default","template":{"platform":"joomla","quickstart":"fixture","design":"fixture","version":"1"}}'::jsonb, 'fixture'
   from wo_opportunity where id=$1`,
      [opportunities[1].id, revision.id]
    )
    assert.equal(
      (
        await call(A, 'POST', `${BASE}/${opportunities[1].id}/demo/rebuild`, {
          requestId: 'cap-rebuild-press'
        })
      ).status,
      429
    )
    await pool.query("update wo_demo_action set status='failed' where id=$1", [first.body.actions[0].id])
    assert.equal(
      (
        await call(A, 'POST', `${BASE}/${opportunities[0].id}/demo/build`, {
          requestId: 'cap-retry-press',
          retryOf: first.body.actions[0].id
        })
      ).status,
      429
    )
    assert.equal((await pool.query('select id from wo_demo_action')).rowCount, 1)
    assert.equal(forwarded.filter((f) => f.path === '/api/sites').length, 0)
    assert.equal((await call(B, 'GET', `${BASE}/demo/actions/${first.body.actions[0].id}`)).status, 404)
  }
)

for (const limit of [6, 26]) {
  test(`handoff uploads the frozen ${limit}-picture limit instead of the former fixed 24`, opts, async () => {
    const objects = { get: async () => new Response(Buffer.from('jpegbytes')), publicUrl: async () => null }
    const w = await world({ objects })
    const opp = await opportunity(w.call)
    const account = (await w.pool.query('select id from account where email=$1', [A])).rows[0].id
    await w.pool.query(
      `insert into wo_media (account_id,opportunity_id,sha256,object_key,kind,category,source,source_url,mime,bytes)
       select $1,$2,md5(i::text)||md5(i::text),'picture-'||i,'image','food','website',
       'https://synthetic.invalid/'||i||'.jpg','image/jpeg',9 from generate_series(1,27) as i`,
      [account, opp.id]
    )
    await saveWoOpsSettings(w.pool, { defaultCms: 'joomla', handoffMaxPictures: limit }, A)
    const revision = (
      await w.call(A, 'POST', `${BASE}/${opp.id}/revisions`, {
        template: { quickstart: 'ja-restaurant/j6', design: 'ja-restaurant' }
      })
    ).body.revision
    assert.ok(revision, 'revision was created')
    const label = `piclimit${limit}`
    const build = (
      await w.runBuild(A, 'POST', `${BASE}/revisions/${revision.id}/build`, {
        requestId: `build-${label}`,
        label
      })
    ).body.build
    // The picture policy is the build's, frozen with its choice.
    assert.equal((await choiceOf(w.pool, `build-${label}`)).picturePolicy.handoffMaxPictures, limit)
    w.state.siteJob = 'done'
    await w.pool.query("insert into site (site_key,label,host,platform) values($1,$2,'local','joomla')", [
      `${label}.localhost`,
      label
    ])
    // A later operator change cannot alter this revision or its handoff retry.
    await saveWoOpsSettings(w.pool, { handoffMaxPictures: limit === 6 ? 26 : 6 }, A)
    const first = await w.call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(first.status, 200, JSON.stringify(first.body))
    assert.equal(Object.keys(first.body.handoff.placed).length, limit)
    const again = await w.call(A, 'POST', `${BASE}/builds/${build.id}/handoff`)
    assert.equal(again.status, 200)
    assert.equal(Object.keys(again.body.handoff.placed).length, limit)
  })
}

test(
  'named Find bypasses area geocoding and Apify, preserves chains, and retains account decoration',
  opts,
  async () => {
    const asked = []
    const w = await world({
      domainOverrides: {
        geocode: async () => assert.fail('a restaurant name must not be geocoded as an area'),
        searchNamedPlaces: async (input, deps) => {
          asked.push({ input, key: deps.googleKey })
          return {
            center: { lat: 25.26, lon: 55.3 },
            area: null,
            provider: 'google-places',
            pages: 1,
            candidates: [
              {
                provider: 'google-places',
                providerId: 'ChIJgreen',
                name: 'Green Mesa',
                lat: 25.26,
                lon: 55.3,
                chain: true,
                socials: {}
              }
            ]
          }
        }
      }
    })
    await saveOps(w.pool, { google: 'AIza-ops', apify: 'apify-unused' })
    const found = await w.call(A, 'POST', `${BASE}/search`, {
      intent: 'place',
      query: 'GREEN MESA RESTAURANT - AL FAHIDI'
    })
    assert.equal(found.status, 200, JSON.stringify(found.body))
    assert.equal(asked[0].input.query, 'GREEN MESA RESTAURANT - AL FAHIDI')
    assert.equal(asked[0].key, 'AIza-ops')
    assert.equal(found.body.candidates[0].providerId, 'ChIJgreen')
    assert.equal(found.body.candidates[0].status, 'new')
    assert.equal(found.body.hiddenChains, 0)
    assert.equal(w.discoverAsked.length, 0)
  }
)

test(
  'named Find refuses absent credentials and malformed intent/ID without provider calls, and returns empty results honestly',
  opts,
  async () => {
    const w = await world({
      domainOverrides: {
        searchNamedPlaces: async () => ({
          center: null,
          area: null,
          candidates: [],
          pages: 1,
          provider: 'google-places'
        })
      }
    })
    assert.equal(
      (await w.call(A, 'POST', `${BASE}/search`, { intent: 'place', query: 'Green Mesa' })).status,
      503
    )
    await saveOps(w.pool, { google: 'AIza-ops' })
    for (const bad of [
      { intent: 'guess' },
      { intent: 'place', placeId: 'https://evil.invalid' },
      { intent: 'place', sessionToken: 123 }
    ])
      assert.equal((await w.call(A, 'POST', `${BASE}/search`, { query: 'Green Mesa', ...bad })).status, 400)
    const empty = await w.call(A, 'POST', `${BASE}/search`, { intent: 'place', query: 'No such restaurant' })
    assert.equal(empty.status, 200)
    assert.deepEqual(empty.body.candidates, [])
    assert.equal(w.discoverAsked.length, 0)
  }
)

test(
  'a geographic city result from direct Google search retains nearby discovery without Nominatim',
  opts,
  async () => {
    const w = await world({
      domainOverrides: {
        geocode: async () => assert.fail('Google already located this city'),
        searchNamedPlaces: async () => ({
          area: { lat: 25.2, lon: 55.3, label: 'Dubai' },
          center: { lat: 25.2, lon: 55.3 },
          candidates: []
        })
      }
    })
    await saveOps(w.pool, { google: 'AIza-ops', settings: { placesCacheDays: 0 } })
    const result = await w.call(A, 'POST', `${BASE}/search`, {
      intent: 'place',
      query: 'Dubai',
      radiusM: 2000
    })
    assert.equal(result.status, 200, JSON.stringify(result.body))
    assert.deepEqual(w.discoverAsked[0].area, { lat: 25.2, lon: 55.3, radiusM: 2000 })
    assert.ok(result.body.candidates.length > 0)
  }
)

test(
  'Find reuses published public research, timestamps and account-owned actions without collecting',
  opts,
  async () => {
    const w = await findWorld()
    const saved = await opportunity(w.call, B)
    const at = '2026-10-20T10:00:00.000Z'
    const profile = {
      name: 'Pho Ba',
      phone: '+84123',
      email: 'public@example.test',
      website: 'https://phoba.example/',
      socials: { facebook: 'https://www.facebook.com/publicpho' },
      pageSpeed: { performance: 32, checkedAt: at }
    }
    const {
      rows: [snapshot]
    } = await w.pool.query(
      "insert into wo_place_snapshot(place_id,state,published_at) values($1,'preparing',$2) returning id",
      [
        saved.placeId ??
          (await w.pool.query('select place_id from wo_opportunity where id=$1', [saved.id])).rows[0]
            .place_id,
        at
      ]
    )
    await w.pool.query(
      'update wo_place set current_snapshot_id=$1 where id=(select place_id from wo_opportunity where id=$2)',
      [snapshot.id, saved.id]
    )
    await w.pool.query('insert into wo_place_snapshot_profile(snapshot_id,profile) values($1,$2)', [
      snapshot.id,
      profile
    ])
    await w.pool.query(
      "insert into wo_place_snapshot_source(snapshot_id,source,ref,status,collected_at) values($1,'website',$2,'complete',$3)",
      [snapshot.id, profile.website, at]
    )
    await w.pool.query('insert into wo_profile(opportunity_id,profile) values($1,$2)', [
      saved.id,
      { name: 'SECRET', email: 'private@example.test' }
    ])
    await w.pool.query(
      "insert into wo_place_snapshot_source(snapshot_id,source,ref,status,collected_at,collected) values($1,'tripadvisor',$2,'complete',$3,$4)",
      [
        snapshot.id,
        'https://www.tripadvisor.com/12345',
        at,
        { placeId: '12345', rating: 4.5, reviewCount: 238, match: { status: 'matched', placeId: '12345' } }
      ]
    )
    await w.pool.query("update wo_place_snapshot set state='published' where id=$1", [snapshot.id])
    w.state.candidates = [{ provider: 'osm', providerId: 'node/1', name: 'Pho Ba', socials: {} }]
    const answer = await w.call(A, 'POST', `${BASE}/search`, { query: 'Hoi An', radiusM: 2000 })
    assert.equal(answer.status, 200)
    const row = answer.body.candidates[0]
    assert.equal(row.status, 'researched')
    assert.equal(row.tripadvisor.rating, 4.5)
    assert.equal(row.tripadvisor.reviews, 238)
    assert.equal(row.research.researchedAt, at)
    assert.equal(row.findAction.kind, 'build')
    const refreshed = await w.call(A, 'POST', `${BASE}/find/refresh`, {
      candidates: [
        { ...row, findAction: { kind: 'view', opportunityId: saved.id, siteKey: 'other.example' } }
      ]
    })
    assert.equal(refreshed.status, 200)
    assert.equal(refreshed.body.candidates[0].findAction.kind, 'build')
    assert.equal(refreshed.body.candidates[0].findAction.opportunityId, undefined)
    assert.equal(row.findAction.opportunityId, undefined)
    assert.equal(row.siteCheck.performance, 32)
    assert.equal(row.email, 'public@example.test')
    assert.equal(row.socials.facebook, profile.socials.facebook)
    assert.equal(JSON.stringify(row).includes('SECRET'), false)
    assert.equal((await w.pool.query('select count(*)::int as n from wo_job')).rows[0].n, 0)
    assert.equal((await w.pool.query('select count(*)::int as n from wo_opportunity')).rows[0].n, 1)
    const mine = await opportunity(w.call, A)
    const built = await w.call(A, 'POST', `${BASE}/${mine.id}/demo/build`, {
      requestId: 'find-warm-demo',
      fromFind: true,
      selection: { cms: 'joomla', design: 'ja-restaurant', quickstart: 'ja-restaurant/j6' }
    })
    assert.equal(built.status, 202)
    assert.equal(built.body.actions.length, 1)
    const replay = await w.call(A, 'POST', `${BASE}/${mine.id}/demo/build`, {
      requestId: 'find-warm-demo',
      fromFind: true,
      selection: { cms: 'joomla', design: 'ja-restaurant', quickstart: 'ja-restaurant/j6' }
    })
    assert.equal(replay.body.actions[0].id, built.body.actions[0].id)
    const run = await w.runBuild(A, 'POST', `${BASE}/${mine.id}/demo/build`, {
      requestId: 'find-warm-demo',
      fromFind: true,
      selection: { cms: 'joomla', design: 'ja-restaurant', quickstart: 'ja-restaurant/j6' }
    })
    assert.equal(run.status, 202)
    const pinned = (
      await w.pool.query('select place_snapshot_id from wo_revision where opportunity_id=$1', [mine.id])
    ).rows[0]
    assert.equal(pinned?.place_snapshot_id, snapshot.id)
    assert.equal((await w.pool.query('select count(*)::int as n from wo_job')).rows[0].n, 0)
    // A published snapshot only moves on to superseded (the snapshot guard, schema 0004).
    await w.pool.query("update wo_place_snapshot set state='superseded' where id=$1", [snapshot.id])
    const refused = await w.call(A, 'POST', `${BASE}/${mine.id}/demo/build`, {
      requestId: 'find-no-longer-warm',
      fromFind: true,
      selection: { cms: 'joomla', design: 'ja-restaurant', quickstart: 'ja-restaurant/j6' }
    })
    assert.equal(refused.status, 409)
    assert.equal(refused.body.code, 'RESEARCH_REQUIRED')
  }
)

const OWN = '/api/sites/from-business'
const setSwitches = (pool, overrides) =>
  pool.query(
    `insert into ui_setting (id, overrides, updated_by) values (true, $1::jsonb, 'test')
     on conflict (id) do update set overrides = excluded.overrides`,
    [JSON.stringify(overrides)]
  )

test(
  'Build from my business: its own switch; any business found by name; researched, then one build of the customer’s own site',
  opts,
  async () => {
    const asked = []
    const smile = {
      provider: 'google-places',
      providerId: 'ChIJsmile',
      name: 'Smile Dental',
      address: '12 Trang Tien, Hanoi',
      primaryType: 'dentist',
      trade: 'health',
      socials: {}
    }
    const w = await world({
      domainOverrides: {
        searchNamedPlaces: async (args) => {
          asked.push(args)
          return { candidates: [smile], area: null, center: null, pages: 1 }
        }
      }
    })
    await saveOps(w.pool, { google: 'google-key' })
    // Off by default, whatever the Website Opportunities switch says.
    assert.equal((await w.call(A, 'GET', `${OWN}/find?q=Smile%20Dental%20Hanoi`)).body.code, 'FEATURE_OFF')
    await setSwitches(w.pool, { 'website-opportunities': false, 'site-from-business': true })
    const found = await w.call(A, 'GET', `${OWN}/find?q=Smile%20Dental%20Hanoi`)
    assert.equal(found.status, 200)
    assert.deepEqual(
      found.body.candidates.map((c) => c.trade),
      ['health']
    )
    assert.equal(asked[0].anyKind, true)
    assert.equal((await w.call(A, 'GET', `${OWN}/find?q=x`)).status, 400)

    const pressed = await w.call(A, 'POST', OWN, { requestId: 'own-press-0001', place: smile })
    assert.equal(pressed.status, 202, JSON.stringify(pressed.body))
    assert.equal(pressed.body.business.phase, 'research')
    const id = pressed.body.business.id
    const opp = (await w.pool.query('select * from wo_opportunity where id=$1', [id])).rows[0]
    assert.equal(opp.candidate.ownSite.requestId, 'own-press-0001')
    assert.equal(opp.candidate.trade, 'health')
    // The same press again is the same business and the same research.
    const again = await w.call(A, 'POST', OWN, { requestId: 'own-press-0001', place: smile })
    assert.equal(again.body.business.id, id)
    assert.equal((await w.pool.query('select id from wo_job where opportunity_id=$1', [id])).rowCount, 1)
    // Another account cannot read it; it is no Website Opportunity of this one either.
    assert.equal((await w.call(B, 'GET', `${OWN}/${id}`)).status, 404)
    await setSwitches(w.pool, { 'website-opportunities': true, 'site-from-business': true })
    const listed = await w.call(A, 'GET', BASE)
    assert.ok(!listed.body.opportunities.some((o) => o.id === id))

    assert.equal((await w.call(A, 'GET', `${OWN}/${id}`)).body.business.phase, 'research')
    assert.equal(
      (await w.call(A, 'POST', `${OWN}/${id}/build`, { selection: { auto: true } })).body.code,
      'RESEARCH_NOT_DONE'
    )
    // A research that paused on a source's budget resumes by itself, three times, then says so (24/10/2026).
    const pause = () =>
      w.pool.query(
        `update wo_job set state='paused', last_error='{"code":"SOURCE_PAUSED","reason":"timeout"}'::jsonb
         where opportunity_id=$1`,
        [id]
      )
    for (let n = 0; n < 3; n++) {
      await pause()
      const resumed = await w.call(A, 'GET', `${OWN}/${id}`)
      assert.equal(resumed.body.business.phase, 'research')
      assert.equal(
        (await w.pool.query('select state from wo_job where opportunity_id=$1', [id])).rows[0].state,
        'queued'
      )
    }
    await pause()
    const stuck = await w.call(A, 'GET', `${OWN}/${id}`)
    assert.equal(stuck.body.business.phase, 'failed')
    assert.equal(stuck.body.business.code, 'SOURCE_PAUSED')
    await w.pool.query(`update wo_job set state='completed' where opportunity_id=$1`, [id])
    // Researched: Tracy suggests, nothing is built until the person chooses.
    const choosing = await w.call(A, 'GET', `${OWN}/${id}`)
    assert.equal(choosing.body.business.phase, 'choose', JSON.stringify(choosing.body))
    const tip = choosing.body.business.recommended
    assert.equal(tip.design, 'tracy-business')
    assert.match(tip.reason, /^auto:business-match/)
    // The picker's groups for its trade come with the suggestion; the build door of Website Opportunities answers
    // the same ranking for this account's opportunity, and none for another account (26/10/2026).
    const ranking = choosing.body.business.ranking
    assert.equal(ranking.trade, 'health')
    assert.ok(ranking.generic.includes('tracy-business'), JSON.stringify(ranking))
    assert.ok(!ranking.recommended.includes('tracy-business'))
    const ranked = await w.call(A, 'GET', `${BASE}/demo/template-ranking?ids=${id}`)
    assert.equal(ranked.status, 200, JSON.stringify(ranked.body))
    assert.deepEqual(ranked.body.ranking, ranking)
    assert.equal((await w.call(B, 'GET', `${BASE}/demo/template-ranking?ids=${id}`)).body.ranking, null)
    assert.equal((await w.call(A, 'GET', `${BASE}/demo/template-ranking?ids=nope`)).body.code, 'INVALID_IDS')
    assert.equal(
      (await w.pool.query('select id from wo_demo_action where opportunity_id=$1', [id])).rowCount,
      0
    )
    assert.equal(
      (await w.call(A, 'POST', `${OWN}/${id}/build`, { selection: { cms: 'joomla' } })).status,
      400
    )
    const building = await w.call(A, 'POST', `${OWN}/${id}/build`, {
      selection: { cms: tip.cms, design: tip.design, quickstart: tip.quickstart }
    })
    assert.equal(building.status, 202, JSON.stringify(building.body))
    assert.equal(building.body.business.phase, 'build')
    const action = (await w.pool.query('select * from wo_demo_action where opportunity_id=$1', [id])).rows
    assert.equal(action.length, 1)
    assert.equal(action[0].selection.ownSite, true)
    assert.equal(action[0].selection.workflow, 'agent-demo/1')
    assert.equal(action[0].selection.chatMode, 'client-send/1')
    // A dental clinic is never put on the restaurant template; the person kept Tracy's pick.
    assert.equal(action[0].selection.design, 'tracy-business')
    assert.equal(action[0].selection.suggested.taken, true)
    const twice = await w.call(A, 'GET', `${OWN}/${id}`)
    assert.equal(twice.body.business.action.id, action[0].id)
    const again2 = await w.call(A, 'POST', `${OWN}/${id}/build`, { selection: { auto: true } })
    assert.equal(again2.body.business.action.id, action[0].id)
    // Pressed again later (a new request) while that build is still open: the same build, never a new choice
    // that the build door would refuse (24/10/2026).
    const pressedAgain = await w.call(A, 'POST', OWN, { requestId: 'own-press-0002', place: smile })
    assert.equal(pressedAgain.body.business.phase, 'build', JSON.stringify(pressedAgain.body))
    assert.equal(pressedAgain.body.business.action.id, action[0].id)

    // Its chat doors stay open with only this switch on, and close with it.
    await setSwitches(w.pool, { 'website-opportunities': false, 'site-from-business': true })
    const prepare = await w.call(A, 'POST', `${BASE}/demo/actions/${action[0].id}/chat/prepare`, {})
    assert.notEqual(prepare.body.code, 'FEATURE_OFF')
    await setSwitches(w.pool, { 'website-opportunities': false, 'site-from-business': false })
    const closed = await w.call(A, 'POST', `${BASE}/demo/actions/${action[0].id}/chat/prepare`, {})
    assert.equal(closed.body.code, 'FEATURE_OFF')
  }
)

test(
  'Build from my business: a pasted link, a bad link, a forged place, and the daily cap',
  opts,
  async () => {
    const w = await world()
    await saveOps(w.pool, { settings: { ownSiteBuildsPerAccountPerDay: 0 } })
    await setSwitches(w.pool, { 'site-from-business': true })
    assert.equal(
      (await w.call(A, 'POST', OWN, { requestId: 'own-press-bad1', url: 'ftp://x' })).body.code,
      'INVALID_URL'
    )
    assert.equal(
      (
        await w.call(A, 'POST', OWN, {
          requestId: 'own-press-bad2',
          place: { provider: 'osm', providerId: 'n/1', name: 'X' }
        })
      ).body.code,
      'INVALID_PLACE'
    )
    const linked = await w.call(A, 'POST', OWN, {
      requestId: 'own-press-link',
      url: 'https://smiledental.example/'
    })
    assert.equal(linked.status, 202, JSON.stringify(linked.body))
    const id = linked.body.business.id
    assert.equal(
      (await w.pool.query('select candidate from wo_opportunity where id=$1', [id])).rows[0].candidate.trade,
      'other'
    )
    // The website says it is a dentist (schema.org `@type`, kept by `mergeProfile`): the research gives the link
    // its trade. Read from the opportunity's own profile here (no place); a place's snapshot carries the same.
    await w.pool.query('update wo_opportunity set place_id = null where id = $1', [id])
    await w.pool.query(
      `insert into wo_profile (opportunity_id, profile) values ($1, $2::jsonb)
       on conflict (opportunity_id) do update set profile = excluded.profile`,
      [id, JSON.stringify({ name: 'Smile Dental', businessType: 'Dentist', socials: {} })]
    )
    await w.pool.query(`update wo_job set state='completed' where opportunity_id=$1`, [id])
    // 0 = no cap, as the other per-account caps read it.
    const read = await w.call(A, 'GET', `${OWN}/${id}`)
    assert.equal(read.body.business.phase, 'choose', JSON.stringify(read.body))
    assert.equal(read.body.business.trade, 'health')
    const built = await w.call(A, 'POST', `${OWN}/${id}/build`, { selection: { auto: true } })
    assert.equal(built.body.business.phase, 'build', JSON.stringify(built.body))
    assert.equal(
      (await w.pool.query('select candidate from wo_opportunity where id=$1', [id])).rows[0].candidate.trade,
      'health'
    )
  }
)
