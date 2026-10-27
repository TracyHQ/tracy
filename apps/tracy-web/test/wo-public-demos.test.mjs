// `/v1/demos` (tasks/todo-wo-public-demos.md B, C, R1): the public door an outside builder asks Tracy for a demo
// with. Driven through its HTTP routes on a real Postgres; the account token (part A) is a fake with the same
// signature, the network and the object store are fakes.
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { Hono } from 'hono'
import * as domain from 'website-opportunities/domain'
import { publicDemoRoutes } from '../src/opportunities-build/public-demos-route.js'
import { savePublicDemoSettings } from '../src/lib/wo-public-demo-settings.js'
import { buildApp } from '../src/app.js'
import { mintSession, SESSION_COOKIE } from '../src/lib/session.js'
import { woOpsRoutes } from '../src/ops/wo.js'
import { siteLabelRefusal } from '../src/lib/site-label-rules.js'
import { revisionForAction } from '../src/opportunities-build/revisions.js'
import { LOGO_RESEARCH_PENDING } from '../src/opportunities-build/client-demo.js'
import { researchOfRevision } from '../src/opportunities-build/revision-research.js'
import { createWebsiteBuilder } from '../src/opportunities-build/route.js'
import { placeProfileFromDemoRequest } from 'website-opportunities/domain/place-profile-from-demo-request.mjs'
import { canonicalJson } from 'website-opportunities/src/canonical-json.js'
import { createHash } from 'node:crypto'
import { fileDb } from './_db.mjs'

const opts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const offeredTemplates = {
  cards: [
    {
      id: 'ja-food',
      platforms: [
        { platform: 'wordpress', tag: 'ja-food/wp', version: '1.0.0' },
        { platform: 'joomla', tag: 'ja-food/jo', version: '1.0.0' }
      ]
    }
  ]
}

const body = (extra = {}) => ({
  schema: 'website-opportunities/demo-request/v1',
  business: {
    name: 'Pho Hanoi',
    address: '12 Hang Bac, Hanoi',
    phone: '+84 24 1234 5678',
    hours: ['Mon–Sun 08:00–22:00'],
    items: [{ name: 'Pho bo', price: '50000', currency: 'VND' }]
  },
  photos: [{ url: 'https://images.example/pho.jpg', caption: 'A bowl of pho' }],
  cms: 'wordpress',
  ...extra
})

/** The door on a bare app, with every outside party faked; `seen` records what reached them. */
function door({ pool = db.pool, now = () => Date.parse('2026-10-24T10:00:00Z'), ...over } = {}) {
  const seen = { fetched: [], stored: [] }
  const app = new Hono()
  app.route(
    '/',
    publicDemoRoutes({
      pool,
      config: { origin: 'https://cowork.tracy.test', apiOrigin: 'https://api.tracy.test' },
      isApiHost: () => true,
      requireAccountToken: async (c, scope) => {
        const m = /^Bearer acct:(.+)$/.exec(c.req.header('authorization') ?? '')
        if (!m || scope !== 'demos')
          return c.json({ error: { code: 'NOT_SIGNED_IN', message: 'no account token' } }, 401)
        return { accountId: m[1] }
      },
      loadDomain: async () => domain,
      resolve: async (host) => [{ address: host.endsWith('.internal') ? '10.0.0.5' : '93.184.216.34' }],
      fetchImpl: async (url) => {
        seen.fetched.push(url)
        if (url.includes('redirect-inside'))
          return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } })
        return new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } })
      },
      imageInfo: async () => ({ width: 800, height: 600, palette: null, dhash: null, features: null }),
      objects: { put: async (key) => (seen.stored.push(key), true) },
      templateCards: async () => offeredTemplates,
      woSettings: async () => ({ pinnedTemplates: {}, defaultCms: 'wordpress' }),
      switchOn: async () => true,
      now,
      ...over
    })
  )
  const call = (method, path, { account, key, json, raw, headers = {} } = {}) =>
    app.request(`https://api.tracy.test${path}`, {
      method,
      headers: {
        ...(account ? { authorization: `Bearer acct:${account}` } : {}),
        ...(key ? { 'idempotency-key': key } : {}),
        ...(json !== undefined || raw !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers
      },
      ...(raw !== undefined ? { body: raw } : json !== undefined ? { body: JSON.stringify(json) } : {})
    })
  return { app, call, seen }
}

async function account(email = 'builder@test.example') {
  return (await db.pool.query('insert into account(email) values ($1) returning id', [email])).rows[0].id
}

const count = async (table, accountId) =>
  Number(
    (await db.pool.query(`select count(*)::int as n from ${table} where account_id = $1`, [accountId]))
      .rows[0].n
  )

const profileBody = () => {
  const request = body({ business: { ...body().business, name: 'North Studio', category: 'fitness' } })
  return {
    schema: 'website-opportunities/demo-request/v2',
    profile: placeProfileFromDemoRequest(request),
    photos: request.photos,
    cms: request.cms
  }
}

test(
  'v2 freezes the sender profile and host assessment into the revision and replays the same brief',
  opts,
  async () => {
    const acct = await account()
    const { call, seen } = door()
    const json = profileBody()
    const reference = json.profile.business.name.evidenceRefs
    json.profile.people.push({
      id: 'person-1',
      value: { name: 'Casey', role: 'Coach', relationship: 'Employee' },
      evidenceRefs: reference
    })
    json.profile.sources.forEach((s) => {
      s.kind = 'website'
    })
    const res = await call('POST', '/v1/demos', { account: acct, key: 'profile-v2-01', json })
    assert.equal(res.status, 202)
    const demo = (await res.json()).demo
    assert.equal(demo.business.name, 'North Studio')
    const action = (await db.pool.query('select * from wo_demo_action where account_id=$1', [acct])).rows[0]
    const frozenInput = structuredClone(action.selection.researchInput)
    assert.deepEqual(frozenInput.demoRequest, json)
    await db.pool.query(
      'update wo_profile set profile = \'{"name":"Changed later"}\' where opportunity_id=$1',
      [action.opportunity_id]
    )
    const args = { action, domain, templates: async () => offeredTemplates.cards }
    const made = await revisionForAction(db.pool, args)
    const stored = (await db.pool.query('select * from wo_revision where id=$1', [made.revision.id])).rows[0]
    assert.deepEqual(stored.place_profile.profile, json.profile)
    const hash = createHash('sha256').update(canonicalJson(json.profile)).digest('hex')
    assert.equal(stored.place_profile.profileHash, hash)
    assert.equal(stored.place_profile.assessment.profileHash, hash)
    assert.equal(
      stored.place_profile.assessment.facts.find((f) => f.factId === 'person-1').status,
      'withheld'
    )
    assert.equal(made.revision.brief.business.name, 'North Studio')
    assert.equal(made.revision.brief.business.trade, 'fitness')
    assert.equal(domain.validateBrief(made.revision.brief).ok, true)
    assert.deepEqual(
      seen.fetched,
      json.photos.map((p) => p.url)
    )
    const replay = await call('POST', '/v1/demos', { account: acct, key: 'profile-v2-01', json })
    assert.equal(replay.status, 202)
    assert.equal((await replay.json()).demo.id, demo.id)
    assert.equal((await revisionForAction(db.pool, args)).revision.id, stored.id)
    assert.equal(await count('wo_revision', acct), 1)
    const options = await (await call('GET', '/v1/demos/options', { account: acct })).json()
    assert.ok(options.accepts.includes('profile/1'))
    await assert.rejects(
      db.pool.query("update wo_revision set place_profile='{}' where id=$1", [stored.id]),
      /immutable/i
    )
  }
)

test(
  'v2 refuses oversized bodies, assessment smuggling and undeclared media before fetching or accepting',
  opts,
  async () => {
    const acct = await account()
    const { call, seen } = door()
    const smuggled = profileBody()
    smuggled.profile.extensions['sender:approval'] = { assessment: { status: 'accepted' } }
    const rejected = await call('POST', '/v1/demos', { account: acct, key: 'profile-bad-01', json: smuggled })
    assert.equal(rejected.status, 422)
    assert.ok((await rejected.json()).errors.some((e) => e.code === 'SENDER_CANNOT_ASSESS'))
    const large = profileBody()
    large.profile.extensions['sender:notes'] = 'x'.repeat(512 * 1024)
    assert.equal(
      (await call('POST', '/v1/demos', { account: acct, key: 'profile-bad-02', json: large })).status,
      413
    )
    const undeclared = profileBody()
    undeclared.profile.media[0].value.url = 'https://images.example/undeclared.jpg'
    assert.equal(
      (await call('POST', '/v1/demos', { account: acct, key: 'profile-bad-03', json: undeclared })).status,
      422
    )
    const privatePhoto = profileBody()
    privatePhoto.photos[0].url = 'http://169.254.169.254/latest'
    privatePhoto.profile.media[0].value.url = privatePhoto.photos[0].url
    const blocked = await call('POST', '/v1/demos', {
      account: acct,
      key: 'profile-bad-04',
      json: privatePhoto
    })
    assert.equal(blocked.status, 422)
    assert.equal((await blocked.json()).error.code, 'PHOTO_URL_BLOCKED')
    assert.deepEqual(seen.fetched, [])
    assert.equal(await count('wo_opportunity', acct), 0)
  }
)

test(
  'v2 excludes restricted photos from stored build inputs and fetches its logo only through photos',
  opts,
  async () => {
    const acct = await account()
    const { call, seen } = door()
    const blocked = profileBody()
    blocked.profile.media[0].value.restrictions = ['not-on-demo']
    const rejected = await call('POST', '/v1/demos', {
      account: acct,
      key: 'profile-media-01',
      json: blocked
    })
    assert.equal(rejected.status, 422)
    assert.equal((await rejected.json()).error.code, 'PHOTOS_UNUSABLE')
    assert.deepEqual(seen.stored, [])
    assert.equal(await count('wo_opportunity', acct), 0)

    const request = body({
      photos: [
        ...blocked.photos,
        { url: 'https://images.example/studio.jpg' },
        { url: 'https://images.example/logo.png' }
      ],
      brand: { logo: 'https://images.example/logo.png' }
    })
    const json = { ...blocked, profile: placeProfileFromDemoRequest(request), photos: request.photos }
    json.profile.media[0].value.restrictions = ['not-on-demo']
    seen.fetched.length = 0
    const accepted = await call('POST', '/v1/demos', { account: acct, key: 'profile-media-02', json })
    assert.equal(accepted.status, 202)
    const out = await accepted.json()
    assert.deepEqual(out.demo.photos.skipped, [{ index: 0, reason: 'profile_withheld' }])
    assert.deepEqual(
      seen.fetched,
      json.photos.map((p) => p.url)
    )
    assert.equal(seen.stored.length, 2)
    const media = (await db.pool.query('select source_url from wo_media where account_id=$1', [acct])).rows
    assert.ok(media.length > 0)
    assert.ok(media.every((m) => m.source_url !== blocked.photos[0].url))
    const action = (await db.pool.query('select * from wo_demo_action where account_id=$1', [acct])).rows[0]
    const made = await revisionForAction(db.pool, {
      action,
      domain,
      templates: async () => offeredTemplates.cards
    })
    assert.deepEqual(made.revision.place_profile.profile, json.profile)
    assert.equal(
      made.revision.place_profile.assessment.facts.find((f) => f.factId === json.profile.media[0].id).status,
      'withheld'
    )
  }
)

test(
  'a demo request becomes the account’s opportunity and one queued demo action, answered with its status',
  opts,
  async () => {
    const acct = await account()
    const { call, seen } = door()
    const res = await call('POST', '/v1/demos', { account: acct, key: 'build-0001', json: body() })
    assert.equal(res.status, 202)
    const out = await res.json()
    assert.equal(out.demo.status, 'queued')
    assert.equal(out.demo.business.name, 'Pho Hanoi')
    assert.equal(out.demo.statusUrl, `https://api.tracy.test/v1/demos/${out.demo.id}`)
    assert.deepEqual(out.demos, { live: 1, limit: 20 })
    assert.deepEqual(out.demo.retention, { expiresAt: null, frozenAt: null, deletedAt: null })
    const opp = (await db.pool.query('select * from wo_opportunity where account_id = $1', [acct])).rows[0]
    assert.equal(opp.provider, 'external:website-opportunities')
    assert.equal(opp.place_id, null, 'never a shared place')
    const action = (await db.pool.query('select * from wo_demo_action where account_id = $1', [acct])).rows[0]
    assert.equal(action.status, 'queued')
    assert.equal(action.selection.cms, 'wordpress')
    const media = (await db.pool.query('select * from wo_media where account_id = $1', [acct])).rows
    assert.equal(media.length, 1)
    assert.equal(media[0].status, 'stored')
    assert.deepEqual(seen.fetched, ['https://images.example/pho.jpg'])
    assert.equal(seen.stored.length, 1)
    const read = await call('GET', `/v1/demos/${out.demo.id}`, { account: acct })
    assert.equal(read.status, 200)
    assert.equal((await read.json()).demo.id, out.demo.id)
  }
)

test(
  'a retry with the same key and body answers the same demo; a different body under the key is 409',
  opts,
  async () => {
    const acct = await account()
    const { call } = door()
    const first = await (
      await call('POST', '/v1/demos', { account: acct, key: 'retry-0001', json: body() })
    ).json()
    // The same JSON with its keys in another order is the same body.
    const reordered = {
      cms: 'wordpress',
      photos: body().photos,
      business: body().business,
      schema: body().schema
    }
    const again = await call('POST', '/v1/demos', { account: acct, key: 'retry-0001', json: reordered })
    assert.equal(again.status, 202)
    assert.equal((await again.json()).demo.id, first.demo.id)
    const changed = await call('POST', '/v1/demos', {
      account: acct,
      key: 'retry-0001',
      json: body({ cms: 'joomla' })
    })
    assert.equal(changed.status, 409)
    assert.equal((await changed.json()).error.code, 'IDEMPOTENCY_KEY_REUSED')
    assert.equal(await count('wo_public_demo', acct), 1)
    assert.equal(await count('wo_demo_action', acct), 1)
  }
)

test('a business name that is no site address never becomes the build’s label', opts, async () => {
  // "Khách sạn ATM" as a label made every such demo fail INVALID_LABEL at the build step (24/10/2026).
  const acct = await account()
  const { call } = door()
  const json = body({ business: { ...body().business, name: 'Khách sạn ATM' } })
  const res = await call('POST', '/v1/demos', { account: acct, key: 'build-label-01', json })
  assert.equal(res.status, 202)
  const action = (await db.pool.query('select label from wo_demo_action where account_id = $1', [acct]))
    .rows[0]
  assert.ok(
    action.label === '' || action.label === null || siteLabelRefusal(action.label) === null,
    `label ${JSON.stringify(action.label)} is not a site address`
  )
})

test(
  'the demo is built from the business it was sent: its profile is frozen into the revision',
  opts,
  async () => {
    // The revision stored profile_effective = null, so the fill saw no business and kept the template's words (25/10/2026).
    const acct = await account()
    const { call } = door()
    const json = body({ business: { ...body().business, description: 'Hanoi street pho since 1998.' } })
    const res = await call('POST', '/v1/demos', { account: acct, key: 'build-profile-01', json })
    assert.equal(res.status, 202)
    const action = (await db.pool.query('select * from wo_demo_action where account_id = $1', [acct])).rows[0]
    const made = await revisionForAction(db.pool, {
      action,
      domain,
      templates: async () => offeredTemplates.cards
    })
    assert.ok(made.revision, JSON.stringify(made))
    const profile = made.revision.profile_effective
    assert.equal(profile?.name, 'Pho Hanoi')
    assert.equal(profile.address, '12 Hang Bac, Hanoi')
    assert.equal(profile.phone, '+84 24 1234 5678')
    assert.deepEqual(profile.hours, ['Mon–Sun 08:00–22:00'])
    assert.equal(profile.bio, 'Hanoi street pho since 1998.')
    assert.equal(profile.menuItems[0].name, 'Pho bo')
    assert.equal(made.revision.brief.business.name, 'Pho Hanoi')
    assert.deepEqual(made.revision.place_profile.profile, placeProfileFromDemoRequest(json))
    assert.equal(made.revision.place_profile.origin, 'sender')
  }
)

test('a demo with no usable photo of the business is refused before anything is built', opts, async () => {
  // The fill needs the business's real photos; without any it built the site and then failed
  // SITE_FILL_FAILED (QUICKSTART_PHOTOGRAPHS_REQUIRED, stranger run 25/10/2026).
  const acct = await account()
  const none = await door().call('POST', '/v1/demos', {
    account: acct,
    key: 'build-nophoto-1',
    json: body({ photos: [] })
  })
  assert.equal(none.status, 422)
  assert.equal((await none.json()).error.code, 'PHOTOS_REQUIRED')
  const broken = door({ fetchImpl: async () => new Response('gone', { status: 404 }) })
  const dead = await broken.call('POST', '/v1/demos', { account: acct, key: 'build-nophoto-2', json: body() })
  assert.equal(dead.status, 422)
  const out = await dead.json()
  assert.equal(out.error.code, 'PHOTOS_UNUSABLE')
  assert.equal(out.photos.skipped.length, 1)
  const storeDown = door({ objects: { put: async () => false } })
  const down = await storeDown.call('POST', '/v1/demos', {
    account: acct,
    key: 'build-nophoto-3',
    json: body()
  })
  assert.equal(down.status, 503)
  assert.equal((await down.json()).error.code, 'PHOTO_STORE_UNAVAILABLE')
  assert.equal(await count('wo_demo_action', acct), 0, 'nothing accepted')
  assert.equal(await count('wo_opportunity', acct), 0, 'no opportunity left behind')
})

test(
  'a demo is the same agent demo Tracy’s own Build demo makes: the seller’s AI builds it in the site’s chat',
  opts,
  async () => {
    const acct = await account()
    const prepared = []
    const { call } = door({ clientDemo: { prepare: async (args) => prepared.push(args) } })
    const res = await call('POST', '/v1/demos', { account: acct, key: 'agent-0001', json: body() })
    assert.equal(res.status, 202)
    const out = (await res.json()).demo
    const action = (await db.pool.query('select * from wo_demo_action where account_id = $1', [acct])).rows[0]
    assert.equal(action.selection.workflow, 'agent-demo/1')
    assert.equal(action.selection.chatMode, 'client-send/1')
    assert.equal(action.session_id, `wo-demo-${action.id}`)
    assert.deepEqual(
      prepared,
      [{ accountId: acct, actionId: action.id }],
      'the site and its chat are made at once'
    )
    const made = await revisionForAction(db.pool, {
      action,
      domain,
      templates: async () => offeredTemplates.cards
    })
    assert.equal(made.revision.brief.quickstartWorkflow, 'agent-demo/1')
    assert.equal(researchOfRevision(made.revision).research.profile.name, 'Pho Hanoi')
    assert.equal(out.status, 'queued')
  }
)

test(
  'a demo waiting for its logo research answers 202 queued at once, on create and on read, and logs no miss',
  opts,
  async () => {
    const acct = await account()
    const asked = []
    const pending = Object.assign(new Error(LOGO_RESEARCH_PENDING), {
      code: LOGO_RESEARCH_PENDING,
      status: 409,
      retryAt: '2026-10-24T10:01:00.000Z'
    })
    const { call } = door({
      clientDemo: {
        prepare: async (args) => {
          asked.push(args)
          throw pending
        }
      }
    })
    const warned = []
    const warn = console.warn
    console.warn = (...line) => warned.push(line.join(' '))
    try {
      const started = Date.now()
      const res = await call('POST', '/v1/demos', { account: acct, key: 'logo-0001', json: body() })
      assert.equal(res.status, 202)
      const out = (await res.json()).demo
      assert.equal(out.status, 'queued')
      const read = await call('GET', `/v1/demos/${out.id}`, { account: acct })
      assert.equal(read.status, 200)
      assert.equal((await read.json()).demo.status, 'queued')
      assert.ok(Date.now() - started < 5_000, 'neither request waits for the research')
      assert.equal(asked.length, 2, 'each request asks once more, and is told to come back')
      assert.deepEqual(
        warned.filter((line) => line.includes('chat not prepared')),
        [],
        'a pending logo research is the expected wait, not a miss'
      )
    } finally {
      console.warn = warn
    }
  }
)

test(
  'status: waiting-for-you with the chat to open, building once the brief is sent, ready after QA',
  opts,
  async () => {
    const acct = await account()
    const { call } = door()
    const demo = (
      await (await call('POST', '/v1/demos', { account: acct, key: 'agent-0002', json: body() })).json()
    ).demo
    await giveSite(acct, demo.id)
    const action = (await db.pool.query('select * from wo_demo_action where account_id = $1', [acct])).rows[0]
    const read = async () =>
      (await (await call('GET', `/v1/demos/${demo.id}`, { account: acct })).json()).demo
    const chat = (submissions) =>
      db.pool.query(
        `update wo_build set content = jsonb_build_object('agentDemo', jsonb_build_object('clientChat',
         jsonb_build_object('chatMode','client-send/1','sessionId',$2::text,'submissions',$3::jsonb))) where account_id = $1`,
        [acct, action.session_id, JSON.stringify(submissions)]
      )
    await chat({})
    const waiting = await read()
    assert.equal(waiting.status, 'waiting-for-you')
    const key = waiting.site.key
    assert.equal(
      waiting.site.editUrl,
      `https://cowork.tracy.test/${key}/s/${action.session_id}?wo-demo-chat=${action.id}`
    )
    await chat({ [action.id]: { nativeRequestId: 'r1', state: 'reserved' } })
    const building = await read()
    assert.equal(building.status, 'building')
    assert.equal(building.site.editUrl, `https://cowork.tracy.test/${key}/s/${action.session_id}`)
    await db.pool.query("update wo_demo_action set status = 'completed' where account_id = $1", [acct])
    await db.pool.query(`update wo_build set qa = '{"state":"passed"}'::jsonb where account_id = $1`, [acct])
    assert.equal((await read()).status, 'ready')
  }
)

test('concurrent sends of one key make one demo', opts, async () => {
  const acct = await account()
  const { call } = door()
  const answers = await Promise.all(
    Array.from({ length: 5 }, () =>
      call('POST', '/v1/demos', { account: acct, key: 'race-0001', json: body() })
    )
  )
  const ids = new Set()
  for (const res of answers) {
    assert.equal(res.status, 202)
    ids.add((await res.json()).demo.id)
  }
  assert.equal(ids.size, 1)
  assert.equal(await count('wo_demo_action', acct), 1)
  assert.equal(await count('wo_opportunity', acct), 1)
})

test('a send that died before its commit left nothing; its retry makes exactly one demo', opts, async () => {
  const acct = await account()
  let crash = true
  // The database connection dies on the receipt's insert, after the import and the action were written.
  const crashing = {
    query: (...a) => db.pool.query(...a),
    connect: async () => {
      const client = await db.pool.connect()
      return {
        query: (sql, ...a) => {
          if (crash && typeof sql === 'string' && sql.includes('insert into wo_public_demo')) {
            crash = false
            return Promise.reject(Object.assign(new Error('connection lost'), { code: '57P01' }))
          }
          return client.query(sql, ...a)
        },
        release: () => client.release()
      }
    }
  }
  const { call } = door({ pool: crashing })
  const lost = await call('POST', '/v1/demos', { account: acct, key: 'crash-0001', json: body() })
  assert.equal(lost.status, 500)
  assert.equal(await count('wo_opportunity', acct), 0)
  assert.equal(await count('wo_demo_action', acct), 0)
  const retried = await call('POST', '/v1/demos', { account: acct, key: 'crash-0001', json: body() })
  assert.equal(retried.status, 202)
  const again = await call('POST', '/v1/demos', { account: acct, key: 'crash-0001', json: body() })
  assert.equal((await again.json()).demo.id, (await retried.json()).demo.id)
  assert.equal(await count('wo_demo_action', acct), 1)
  assert.deepEqual((await (await call('GET', '/v1/demos', { account: acct })).json()).demos, {
    live: 1,
    limit: 20
  })
})

/** A demo's build as the runner leaves it: a site, or a site retention deleted. */
async function giveSite(acct, demoId, { deleted = false } = {}) {
  const a = (
    await db.pool.query(
      'select a.* from wo_demo_action a join wo_public_demo d on d.action_id = a.id where d.id = $1',
      [demoId]
    )
  ).rows[0]
  await db.pool.query(
    `insert into wo_revision (id, opportunity_id, account_id, n, brief, brief_md) values ($1,$2,$3,1,'{}','')
     on conflict do nothing`,
    [a.revision_id, a.opportunity_id, acct]
  )
  await db.pool.query(
    `insert into wo_build (account_id, revision_id, request_id, build_id, site_key, state, choice, choice_key,
       demo_expires_at, demo_deleted_at)
     values ($1,$2,$3,$4,$5,$6,'{"cms":"wordpress","template":{"quickstart":"ja-food/wp","design":"ja-food"}}'::jsonb,
       'fixture', now() + interval '14 days', $7)`,
    [
      acct,
      a.revision_id,
      a.build_request_id,
      a.id,
      `demo-${demoId.slice(0, 8)}.tracy.test`,
      deleted ? 'deleted' : 'done',
      deleted ? new Date() : null
    ]
  )
  return a
}

test('the 21st live demo is refused 409 with the count; deleting one makes room', opts, async () => {
  const acct = await account()
  const { call } = door()
  const ids = []
  for (let i = 0; i < 20; i++) {
    const res = await call('POST', '/v1/demos', {
      account: acct,
      key: `cap-${String(i).padStart(4, '0')}`,
      json: body()
    })
    assert.equal(res.status, 202, `demo ${i}`)
    ids.push((await res.json()).demo.id)
  }
  const over = await call('POST', '/v1/demos', { account: acct, key: 'cap-0020', json: body() })
  assert.equal(over.status, 409)
  const refused = await over.json()
  assert.equal(refused.error.code, 'DEMO_LIMIT_REACHED')
  assert.deepEqual(refused.demos, { live: 20, limit: 20 })
  assert.equal(await count('wo_demo_action', acct), 20, 'nothing accepted')
  // Expired-but-not-deleted still holds its slot; deleted frees it.
  await giveSite(acct, ids[0])
  await db.pool.query('update wo_build set demo_frozen_at = now() where account_id = $1', [acct])
  assert.equal(
    (await call('POST', '/v1/demos', { account: acct, key: 'cap-0021', json: body() })).status,
    409
  )
  await db.pool.query(
    "update wo_build set state = 'deleted', demo_deleted_at = now() where account_id = $1",
    [acct]
  )
  const room = await call('POST', '/v1/demos', { account: acct, key: 'cap-0022', json: body() })
  assert.equal(room.status, 202)
})

test('at 19 live demos, concurrent new requests let exactly one through', opts, async () => {
  const acct = await account()
  await savePublicDemoSettings(
    db.pool,
    { liveDemosPerAccount: 3, sponsoredDemoMaxCents: 200, sponsoredMonthlyBudgetCents: 30000 },
    'test'
  )
  const { call } = door()
  for (let i = 0; i < 2; i++)
    assert.equal(
      (await call('POST', '/v1/demos', { account: acct, key: `pre-${i}-0000`, json: body() })).status,
      202
    )
  const answers = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      call('POST', '/v1/demos', { account: acct, key: `last-${i}-000`, json: body() })
    )
  )
  const statuses = answers.map((r) => r.status).sort()
  assert.deepEqual(statuses, [202, 409, 409, 409, 409, 409])
  assert.equal(await count('wo_public_demo', acct), 3)
})

test(
  'the model budget refuses a demo on Tracy’s model before accepting it; an own AI account is not charged',
  opts,
  async () => {
    const acct = await account()
    await savePublicDemoSettings(
      db.pool,
      { liveDemosPerAccount: 20, sponsoredDemoMaxCents: 200, sponsoredMonthlyBudgetCents: 300 },
      'test'
    )
    const { call } = door()
    const first = await call('POST', '/v1/demos', { account: acct, key: 'budget-0001', json: body() })
    assert.equal(first.status, 202)
    assert.equal((await first.json()).demo.model, 'tracy')
    const over = await call('POST', '/v1/demos', { account: acct, key: 'budget-0002', json: body() })
    assert.equal(over.status, 503)
    assert.equal((await over.json()).error.code, 'SPONSOR_BUDGET_EXHAUSTED')
    assert.equal(await count('wo_demo_action', acct), 1)
    const own = await account('own-ai@test.example')
    await db.pool.query(
      `insert into seat_plan_connection (id, account_id, provider, provider_subject, subject_label, secret)
     values (gen_random_uuid(), $1, 'claude', 'sub', 'me@claude', '{"sealed":"x"}'::jsonb)`,
      [own]
    )
    const mine = await call('POST', '/v1/demos', { account: own, key: 'budget-0003', json: body() })
    assert.equal(mine.status, 202)
    const demo = (await mine.json()).demo
    assert.equal(demo.model, 'account')
    assert.equal(
      (await db.pool.query('select reserved_cents from wo_public_demo where id = $1', [demo.id])).rows[0]
        .reserved_cents,
      0
    )
  }
)

test(
  'cancel before the site frees the slot; cancel after keeps it; a finished demo is not cancelled',
  opts,
  async () => {
    const acct = await account()
    const { call } = door()
    const early = (
      await (await call('POST', '/v1/demos', { account: acct, key: 'cancel-001', json: body() })).json()
    ).demo
    const late = (
      await (await call('POST', '/v1/demos', { account: acct, key: 'cancel-002', json: body() })).json()
    ).demo
    await giveSite(acct, late.id)
    const a = await call('POST', `/v1/demos/${early.id}/cancel`, { account: acct })
    assert.equal(a.status, 200)
    const cancelled = await a.json()
    assert.equal(cancelled.demo.status, 'cancelled')
    assert.deepEqual(cancelled.demos, { live: 1, limit: 20 })
    const action = (
      await db.pool.query("select status, error from wo_demo_action where error = 'DEMO_CANCELLED'")
    ).rows
    assert.equal(action.length, 1)
    const b = await (await call('POST', `/v1/demos/${late.id}/cancel`, { account: acct })).json()
    assert.equal(b.demo.status, 'cancelled')
    assert.deepEqual(b.demos, { live: 1, limit: 20 }, 'a demo with a site keeps its slot')
    assert.equal(
      (await call('POST', `/v1/demos/${early.id}/cancel`, { account: acct })).status,
      200,
      'twice is fine'
    )
    const done = (
      await (await call('POST', '/v1/demos', { account: acct, key: 'cancel-003', json: body() })).json()
    ).demo
    await db.pool.query(
      "update wo_demo_action set status = 'completed' from wo_public_demo d where d.action_id = wo_demo_action.id and d.id = $1",
      [done.id]
    )
    const finished = await call('POST', `/v1/demos/${done.id}/cancel`, { account: acct })
    assert.equal(finished.status, 409)
    assert.equal((await finished.json()).error.code, 'DEMO_FINISHED')
  }
)

test(
  'bad schema, an oversize body, a private photo URL or a redirect inside are refused with nothing written',
  opts,
  async () => {
    const acct = await account()
    const { call, seen } = door()
    const cases = [
      [{ json: { ...body(), schema: 'tracy-wo-place-bundle/v1' } }, 422, 'INVALID_DEMO_REQUEST'],
      [
        {
          raw: JSON.stringify({
            ...body(),
            business: { ...body().business, description: 'x'.repeat(600 * 1024) }
          })
        },
        413,
        'REQUEST_TOO_LARGE'
      ],
      [{ raw: '{not json' }, 400, 'INVALID_JSON'],
      [{ json: body({ photos: [{ url: 'https://cdn.internal/a.jpg' }] }) }, 422, 'PHOTO_URL_BLOCKED'],
      [
        { json: body({ photos: [{ url: 'http://169.254.169.254/latest/meta-data' }] }) },
        422,
        'PHOTO_URL_BLOCKED'
      ],
      [{ json: body({ photos: [{ url: 'http://[::1]/a.jpg' }] }) }, 422, 'PHOTO_URL_BLOCKED'],
      [
        { json: body({ photos: [{ url: 'https://images.example/redirect-inside.jpg' }] }) },
        422,
        'PHOTO_URL_BLOCKED'
      ],
      [{ json: body({ template: { quickstart: 'not-offered/wp' } }) }, 422, 'INVALID_TEMPLATE']
    ]
    for (const [i, [send, status, code]] of cases.entries()) {
      const res = await call('POST', '/v1/demos', { account: acct, key: `bad-${i}-0000`, ...send })
      assert.equal(res.status, status, code)
      assert.equal((await res.json()).error.code, code)
    }
    assert.equal((await call('POST', '/v1/demos', { account: acct, json: body() })).status, 400, 'no key')
    assert.deepEqual(seen.stored, [])
    for (const table of ['wo_opportunity', 'wo_demo_action', 'wo_public_demo', 'wo_media'])
      assert.equal(await count(table, acct), 0, table)
    assert.equal(
      seen.fetched.filter((u) => !u.includes('redirect-inside')).length,
      0,
      'a refused address is never fetched'
    )
  }
)

test(
  'a body naming the account, a site or ownSite is refused by field; the token decides the account',
  opts,
  async () => {
    const acct = await account()
    const other = await account('other@test.example')
    const { call } = door()
    for (const [i, extra] of [{ accountId: other }, { siteKey: 'x.tracy.test' }].entries()) {
      const res = await call('POST', '/v1/demos', { account: acct, key: `field-${i}-000`, json: body(extra) })
      assert.equal(res.status, 422)
    }
    const own = body()
    own.business.ownSite = true
    const res = await call('POST', '/v1/demos', { account: acct, key: 'field-own-01', json: own })
    assert.deepEqual((await res.json()).errors, [{ path: 'business.ownSite', code: 'UNKNOWN_FIELD' }])
    assert.equal(await count('wo_public_demo', other), 0)
    // Another account cannot read or cancel this account's demo.
    const mine = (
      await (await call('POST', '/v1/demos', { account: acct, key: 'field-mine-1', json: body() })).json()
    ).demo
    assert.equal((await call('GET', `/v1/demos/${mine.id}`, { account: other })).status, 404)
    assert.equal((await call('POST', `/v1/demos/${mine.id}/cancel`, { account: other })).status, 404)
  }
)

test('a seat key is refused 403; no token is the token helper’s 401', opts, async () => {
  const { call } = door()
  const seat = await call('POST', '/v1/demos', {
    key: 'seat-key-01',
    json: body(),
    headers: { authorization: `Bearer trk_${'a'.repeat(16)}.${'b'.repeat(32)}` }
  })
  assert.equal(seat.status, 403)
  assert.equal((await seat.json()).error.code, 'ACCOUNT_TOKEN_REQUIRED')
  assert.equal((await call('GET', '/v1/demos')).status, 401)
})

test('retention dates come from the WO demo clock, and polling never moves them', opts, async () => {
  const acct = await account()
  const { call } = door()
  const demo = (
    await (await call('POST', '/v1/demos', { account: acct, key: 'clock-0001', json: body() })).json()
  ).demo
  await giveSite(acct, demo.id)
  const before = (
    await db.pool.query('select demo_expires_at, demo_touched_at from wo_build where account_id = $1', [acct])
  ).rows[0]
  const first = (await (await call('GET', `/v1/demos/${demo.id}`, { account: acct })).json()).demo
  await call('GET', `/v1/demos/${demo.id}`, { account: acct })
  await call('GET', '/v1/demos', { account: acct })
  const afterRow = (
    await db.pool.query('select demo_expires_at, demo_touched_at from wo_build where account_id = $1', [acct])
  ).rows[0]
  assert.deepEqual(afterRow, before)
  assert.equal(first.retention.expiresAt, before.demo_expires_at.toISOString())
  assert.equal(first.status, 'waiting-for-you', 'a site whose brief no chat has sent yet')
  assert.equal(first.site.key, `demo-${demo.id.slice(0, 8)}.tracy.test`)
  assert.match(
    first.site.editUrl,
    new RegExp(
      `^https://cowork\\.tracy\\.test/demo-${demo.id.slice(0, 8)}\\.tracy\\.test/s/wo-demo-[0-9a-f-]+\\?wo-demo-chat=`
    )
  )
})

test('ready needs QA passed; a finished build without it is needs-review', opts, async () => {
  const acct = await account()
  const { call } = door()
  const demo = (
    await (await call('POST', '/v1/demos', { account: acct, key: 'ready-0001', json: body() })).json()
  ).demo
  await giveSite(acct, demo.id)
  await db.pool.query("update wo_demo_action set status = 'completed' where account_id = $1", [acct])
  await db.pool.query(`update wo_build set qa = '{"state":"needs-review"}'::jsonb where account_id = $1`, [
    acct
  ])
  assert.equal(
    (await (await call('GET', `/v1/demos/${demo.id}`, { account: acct })).json()).demo.status,
    'needs-review'
  )
  await db.pool.query(`update wo_build set qa = '{"state":"passed"}'::jsonb where account_id = $1`, [acct])
  assert.equal(
    (await (await call('GET', `/v1/demos/${demo.id}`, { account: acct })).json()).demo.status,
    'ready'
  )
})

test('the list pages newest first, and options names what a demo may be built with', opts, async () => {
  const acct = await account()
  let t = Date.parse('2026-10-24T10:00:00Z')
  const { call } = door({ now: () => (t += 1000) })
  const ids = []
  for (let i = 0; i < 3; i++)
    ids.push(
      (await (await call('POST', '/v1/demos', { account: acct, key: `list-${i}-0000`, json: body() })).json())
        .demo.id
    )
  const page1 = await (await call('GET', '/v1/demos?limit=2', { account: acct })).json()
  assert.deepEqual(
    page1.data.map((d) => d.id),
    [ids[2], ids[1]]
  )
  const page2 = await (
    await call('GET', `/v1/demos?limit=2&cursor=${page1.nextCursor}`, { account: acct })
  ).json()
  assert.deepEqual(
    page2.data.map((d) => d.id),
    [ids[0]]
  )
  assert.equal(page2.nextCursor, null)
  assert.equal((await call('GET', '/v1/demos?limit=500', { account: acct })).status, 400)
  const options = await (await call('GET', '/v1/demos/options', { account: acct })).json()
  const wp = options.cms.find((o) => o.cms === 'wordpress')
  assert.deepEqual(
    wp.templates.map((x) => x.quickstart),
    ['ja-food/wp']
  )
  assert.deepEqual(options.demos, { live: 3, limit: 20 })
})

test(
  'the server answers /v1/demos on the api host only, and refuses a caller without an account token',
  opts,
  async () => {
    const config = {
      origin: 'http://tracy.test:8080',
      secure: false,
      siteDomain: 'tracy.test',
      sessionSecret: 's'.repeat(32),
      sessionDomain: null,
      apiOrigin: 'https://api.tracy.test'
    }
    const onApi = (app, path, init = {}) =>
      app.request(`http://api.tracy.test${path}`, {
        ...init,
        headers: { host: 'api.tracy.test', ...init.headers }
      })
    const plain = buildApp({ config, pool: db.pool, mail: { send: async () => {} } })
    const refused = await onApi(plain, '/v1/demos', {
      method: 'POST',
      headers: { 'idempotency-key': 'app-0001' }
    })
    assert.equal(refused.status, 401)
    assert.notEqual((await refused.json()).error.code, undefined)
    const acct = await account()
    const wired = buildApp({
      config,
      pool: db.pool,
      mail: { send: async () => {} },
      requireAccountToken: async () => ({ accountId: acct })
    })
    const bad = await onApi(wired, '/v1/demos', {
      method: 'POST',
      headers: { 'idempotency-key': 'app-0002', 'content-type': 'application/json' },
      body: JSON.stringify({ schema: 'nope' })
    })
    assert.equal(bad.status, 422)
    assert.equal((await bad.json()).error.code, 'INVALID_DEMO_REQUEST')
    const options = await onApi(wired, '/v1/demos/options')
    assert.equal(options.status, 200)
    assert.deepEqual((await options.json()).demos, { live: 0, limit: 20 })
    const elsewhere = await wired.request('http://tracy.test:8080/v1/demos/options', {
      headers: { host: 'tracy.test:8080' }
    })
    assert.notEqual(elsewhere.headers.get('x-tracy-api-version'), 'v1', 'not this door off the api host')
  }
)

test(
  '/ops/wo › Settings reads and saves the door’s live cap and model budget; staff read, owners write',
  opts,
  async () => {
    const config = { origin: 'https://cowork.tracy.test', sessionSecret: 's'.repeat(32) }
    const app = woOpsRoutes({ pool: db.pool, config, log: { log() {} } })
    const staff = await account('ops@tracy.test')
    const cookie = `${SESSION_COOKIE}=${await mintSession('ops@tracy.test', config.sessionSecret)}`
    const read = () => app.request('/api/ops/wo/public-demos', { headers: { cookie } })
    const write = (settings) =>
      app.request('/api/ops/wo/public-demos', {
        method: 'PUT',
        headers: { cookie, origin: config.origin, 'content-type': 'application/json' },
        body: JSON.stringify({ settings })
      })
    assert.equal((await read()).status, 403)
    const ws = (
      await db.pool.query(
        "insert into workspace(display_name,kind) values('Tracy','tracy_admin') returning id"
      )
    ).rows[0].id
    await db.pool.query(
      "insert into seat_workspace(workspace_id,account_id,role,granted_by,accepted_at) values($1,$2,'developer',$2,now())",
      [ws, staff]
    )
    const seen = await (await read()).json()
    assert.deepEqual(seen.settings, {
      liveDemosPerAccount: 20,
      sponsoredDemoMaxCents: 200,
      sponsoredMonthlyBudgetCents: 30000
    })
    assert.equal(seen.writable, false)
    assert.equal((await write({ liveDemosPerAccount: 5 })).status, 403)
    await db.pool.query("update seat_workspace set role = 'owner' where account_id = $1", [staff])
    const bad = await write({ liveDemosPerAccount: -1 })
    assert.equal(bad.status, 400)
    assert.equal((await bad.json()).error, 'INVALID_PUBLIC_DEMO_SETTING')
    const saved = await write({ liveDemosPerAccount: 5 })
    assert.equal(saved.status, 200)
    assert.equal((await saved.json()).settings.liveDemosPerAccount, 5)
    assert.equal(
      (await (await read()).json()).settings.sponsoredDemoMaxCents,
      200,
      'keys left out keep their value'
    )
    const { call } = door()
    assert.deepEqual((await (await call('GET', '/v1/demos', { account: staff })).json()).demos, {
      live: 0,
      limit: 5
    })
  }
)

/** Distinct bytes per address, so every photo is its own row (`wo_media` is unique per sha256). */
const photoBytes = async (url) =>
  new Response(Uint8Array.from([...PNG, ...new TextEncoder().encode(url)]), {
    status: 200,
    headers: { 'content-type': 'image/png' }
  })

const handOff = () =>
  body({
    business: {
      ...body().business,
      items: [
        {
          name: 'Pho bo',
          size: 'Large',
          price: '55',
          priceScale: 1000,
          currency: 'VND',
          section: 'Soups',
          photo: 'https://images.example/pho.jpg'
        },
        { name: 'Bun cha', price: '45', photo: 'https://images.example/shared.jpg' },
        { name: 'Nem ran', price: '30', photo: 'https://images.example/shared.jpg' },
        { name: 'Che', photo: 'https://images.example/gone.jpg' }
      ]
    },
    photos: [
      { url: 'https://images.example/pho.jpg', caption: 'Pho bo' },
      { url: 'https://images.example/shared.jpg' },
      { url: 'https://images.example/gone.jpg' },
      { url: 'https://images.example/post.jpg' }
    ],
    brand: {
      logo: 'https://images.example/logo.png',
      colors: [{ hex: '#aa3300', role: 'primary' }, { hex: '#ffffff' }]
    },
    links: { menu: 'https://pho-hanoi.example/menu', booking: 'https://book.example/pho' },
    posts: [
      {
        text: 'New this week at our kitchen: a bowl of pho with slow-cooked beef brisket, simmered overnight with star anise and charred onion. We serve it every morning from eight until the pot runs out, with fresh herbs from the market on Hang Be street and lime on the side.',
        url: 'https://facebook.com/phohanoi/posts/1',
        publishedAt: '2026-10-20T08:00:00Z',
        source: 'facebook',
        photos: ['https://images.example/post.jpg']
      }
    ]
  })

test('options announce the hand-off parts this host takes all the way to the brief', opts, async () => {
  const acct = await account()
  const options = await (await door().call('GET', '/v1/demos/options', { account: acct })).json()
  assert.deepEqual(options.accepts, [
    'items.size',
    'items.priceScale',
    'items.photo',
    'brand',
    'links',
    'posts',
    'profile/1'
  ])
  for (const part of options.accepts) assert.ok(domain.DEMO_REQUEST_CAPABILITIES.includes(part), part)
})

test(
  'the hand-off parts are kept: item size, price scale and photo, the logo and colours, links and posts',
  opts,
  async () => {
    const acct = await account()
    const { call, seen } = door({
      fetchImpl: async (url) => {
        seen.fetched.push(url)
        return url.includes('gone') ? new Response('gone', { status: 404 }) : photoBytes(url)
      }
    })
    const res = await call('POST', '/v1/demos', { account: acct, key: 'handoff-0001', json: handOff() })
    assert.equal(res.status, 202, JSON.stringify(await res.clone().json()))
    assert.equal((await res.json()).demo.photos.stored, 3, 'the logo is not one of the content photos')
    const opp = (await db.pool.query('select id from wo_opportunity where account_id = $1', [acct])).rows[0]
    const { profile, brand } = (
      await db.pool.query('select profile, brand from wo_profile where opportunity_id = $1', [opp.id])
    ).rows[0]
    const media = (await db.pool.query('select * from wo_media where opportunity_id = $1', [opp.id])).rows
    const idOf = (url) => media.find((m) => m.source_url === url)?.id
    const [pho, bun, nem, che] = profile.menuItems
    assert.equal(pho.size, 'Large')
    assert.equal(pho.priceScale, 1000)
    assert.deepEqual(pho.photo, {
      mediaId: idOf('https://images.example/pho.jpg'),
      status: 'candidate',
      how: 'sender',
      evidence: { sourceUrl: 'https://images.example/pho.jpg' },
      matcher: 'sender/1'
    })
    assert.equal('photo' in bun || 'photo' in nem, false, 'one photo for two dishes links neither')
    assert.equal('photo' in che, false, 'a photo that did not download links nothing')
    assert.equal('priceScale' in bun, false)
    assert.deepEqual(profile.menus, [
      { url: 'https://pho-hanoi.example/menu', source: 'website-opportunities' }
    ])
    assert.deepEqual(profile.booking, [
      { url: 'https://book.example/pho', verified: false, source: 'website-opportunities' }
    ])
    const logoId = idOf('https://images.example/logo.png')
    assert.ok(logoId, 'the logo is stored as a picture of its own')
    assert.equal(brand.logo, logoId)
    assert.equal(brand.logoResearch.chosen.mediaId, logoId)
    assert.deepEqual(brand.social.colors, [
      { hex: '#aa3300', role: 'primary' },
      { hex: '#ffffff', role: 'unspecified' }
    ])
    const post = media.find((m) => m.source_url === 'https://images.example/post.jpg')
    assert.ok(post.post_id, 'a post photo keeps its post')
    assert.equal(media.find((m) => m.id === idOf('https://images.example/pho.jpg')).post_id, null)
    const source = (
      await db.pool.query('select collected from wo_source where opportunity_id = $1', [opp.id])
    ).rows[0]
    assert.equal(source.collected.posts.length, 1)
    assert.equal(source.collected.posts[0].id, post.post_id)
    assert.equal(JSON.stringify(profile.menuItems).includes('brisket'), false, 'a post never becomes a dish')

    // …and reach the brief the demo is built from.
    const action = (await db.pool.query('select * from wo_demo_action where account_id = $1', [acct])).rows[0]
    const made = await revisionForAction(db.pool, {
      action,
      domain,
      templates: async () => offeredTemplates.cards
    })
    const brief = made.revision.brief
    const dishes = brief.sitemap.flatMap((p) => p.sections).flatMap((s) => s.menuItems ?? [])
    assert.equal(dishes[0].size, 'Large')
    assert.equal(dishes[0].priceScale, 1000)
    assert.equal(dishes[0].photo.assetId, idOf('https://images.example/pho.jpg'))
    assert.equal(
      dishes[0].photo.status,
      'candidate',
      'a sender photo is a dish photo only once vision says so'
    )
    assert.equal(brief.brand.logo, logoId)
    assert.deepEqual(
      brief.brand.colors.map((c) => c.hex),
      ['#aa3300', '#ffffff']
    )
    assert.ok(brief.integrations.some((x) => x.kind === 'booking' && x.url === 'https://book.example/pho'))
    const menu = brief.sitemap.find((p) => p.slug === 'menu').sections[0]
    assert.ok(menu.evidence.some((e) => e.url === 'https://pho-hanoi.example/menu'))
    assert.ok(brief.content.items.some((i) => i.body.includes('brisket')))
  }
)

// The sender's category is the trade (`fitness`, `beauty`), a cuisine from an older client, or something unknown.
test(
  'the sender’s category sets the trade the brief is built for: a gym is no restaurant',
  opts,
  async () => {
    const cases = [
      ['fitness', 'fitness'],
      ['Beauty', 'beauty'],
      ['Vietnamese', 'food'],
      ['pizza', 'food'],
      ['dog whisperer', 'other'],
      // One normaliser (`tradeOfCategory`) for the brief and the frozen profile: Google types, any case.
      ['Gym', 'fitness'],
      ['gym', 'fitness'],
      ['hair salon', 'beauty'],
      ['day_spa', 'beauty'],
      ['restaurant', 'food']
    ]
    for (const [i, [category, trade]] of cases.entries()) {
      const acct = await account(`trade${i}@test.example`)
      const { call } = door()
      const base = body()
      const res = await call('POST', '/v1/demos', {
        account: acct,
        key: `trade-000${i}`,
        json: { ...base, business: { ...base.business, name: `Place ${i}`, category } }
      })
      assert.equal(res.status, 202, JSON.stringify(await res.clone().json()))
      const opp = (await db.pool.query('select candidate from wo_opportunity where account_id = $1', [acct]))
        .rows[0]
      assert.equal(opp.candidate.trade, trade, `${category} → ${trade}`)
      const action = (await db.pool.query('select * from wo_demo_action where account_id = $1', [acct]))
        .rows[0]
      const made = await revisionForAction(db.pool, {
        action,
        domain,
        templates: async () => offeredTemplates.cards
      })
      const brief = made.revision.brief
      assert.equal(brief.business.trade ?? 'food', trade, `${category}: the brief's trade`)
      const stored = (
        await db.pool.query('select place_profile from wo_revision where id=$1', [made.revision.id])
      ).rows[0].place_profile
      assert.equal(
        domain.statedTradeOf(stored.profile),
        trade,
        `${category}: the frozen profile's trade matches the brief's`
      )
      const slugs = brief.sitemap.map((p) => p.slug)
      assert.equal(slugs.includes('menu'), trade === 'food', `${category}: menu page only for food`)
      if (trade !== 'food')
        assert.equal(
          JSON.stringify(brief.missing).toLowerCase().includes('dishes'),
          false,
          `${category}: no dishes asked of a business that serves none`
        )
    }
  }
)

test('a logo at an address Tracy does not fetch refuses the request by its path', opts, async () => {
  const acct = await account()
  const json = body({ brand: { logo: 'https://logo.internal/logo.png' } })
  const res = await door().call('POST', '/v1/demos', { account: acct, key: 'handoff-0002', json })
  assert.equal(res.status, 422)
  assert.deepEqual((await res.json()).errors, [{ path: 'brand.logo', code: 'URL_BLOCKED' }])
  assert.equal(await count('wo_opportunity', acct), 0)
})

test(
  'Details of a public demo whose request row is gone still opens: the brief’s currency is unknown, not a 500',
  opts,
  async () => {
    const acct = await account('gone@test.example')
    const { call } = door()
    const res = await call('POST', '/v1/demos', { account: acct, key: 'gone-0001', json: body() })
    assert.equal(res.status, 202)
    const action = (await db.pool.query('select * from wo_demo_action where account_id=$1', [acct])).rows[0]
    await revisionForAction(db.pool, { action, domain, templates: async () => offeredTemplates.cards })
    const opp = (await db.pool.query('select * from wo_opportunity where id=$1', [action.opportunity_id]))
      .rows[0]
    const builder = createWebsiteBuilder({
      config: { origin: 'http://tracy.test:8080' },
      pool: db.pool,
      request: async () => Response.json({}),
      loadDomain: async () => domain
    })
    assert.equal((await builder.detailOf(opp, acct)).brief.current, true)
    await db.pool.query('update wo_demo_action set selection = selection - $2 where id=$1', [
      action.id,
      'researchInput'
    ])
    await db.pool.query('delete from wo_public_demo where opportunity_id=$1', [opp.id])
    const detail = await builder.detailOf(opp, acct)
    assert.equal(detail.brief.current, null)
  }
)
