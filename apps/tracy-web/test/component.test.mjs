// Task 6b: component custody (`site_component`, ADR 0051) and the Apply proxy it feeds —
// `PUT /api/sites/:key/component-credential` and `POST /api/sites/:key/apply`, ported from
// `workers/cowork-web/src/worker.js`'s `apiSiteComponentCredential`/`apiSiteApply` calling
// `workers/seat-registry/src/index.js`'s `handleSetComponentCredential`/`handleApply`. See the
// task brief (`.superpowers/sdd/2026-09-09-tracy-web-02-so-ghe-va-site/task-6b-brief.md`) for why
// this exists (Task 6 shipped both doors as 501 stubs) and what is deliberately NOT carried
// (Shopify's `themeFiles.update`/`theme.redirect`/`storeContent.update`/`storefront.deploy`, and
// the draft/proposal short-circuit in `handleApply` — both out of scope for this plan).

import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { hostCall, hostJob } from '../src/host/client.js'
import { mintKey, revokeKey, verifyKey } from '../src/lib/api-key.js'
import { validateContent, validateDescribe } from '../src/lib/content-api.js'
import { mintSession } from '../src/lib/session.js'
import { accountByEmail, grantFor } from '../src/seats/store.js'
import { currentComponent, jobById, putJob, writeComponent } from '../src/sites/store.js'
import { createWorkspace, declareSiteWorkspace } from '../src/workspaces/store.js'
import { fileDb } from './_db.mjs'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

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
  SEAT_local_SECRET: 'k',
  MCP_TRACY_ACTOR_SECRET: 'component-actor-test-key'
}

/** A fake component endpoint, recording every call it receives — the "site's live CMS" half of
 * an Apply. `answer` is what it hands back each time (JSON-stringified before send unless it is
 * already a string, letting a test send deliberately-broken bodies); `throwOn` fails the fetch
 * itself (network unreachable) instead of ever producing a response. */
function fakeNetwork({ answer = { ok: true }, throwOn = false } = {}) {
  const calls = []
  const fetchImpl = async (input, init) => {
    calls.push({ url: String(input), init })
    if (throwOn) throw new Error('connection refused')
    const body = typeof answer === 'string' ? answer : JSON.stringify(answer)
    return new Response(body, { status: 200 })
  }
  return { calls, fetchImpl }
}

function harness(pool, { fetchImpl, envOverrides, isApiHost } = {}) {
  const config = readConfig({ ...env, ...envOverrides })
  const app = buildApp({
    config,
    pool,
    mail: { send: async () => {} },
    host: { hostCall, hostJob },
    ...(fetchImpl ? { fetchImpl } : {}),
    // S1: the Apply door reads a Bearer seat key ONLY on the api host; S2 wires the real hostKind
    // check in `app.js`, so a test states which host it is on.
    ...(isApiHost ? { isApiHost } : {})
  })
  const cookieFor = async (email) => `tracy_sess=${await mintSession(email, config.sessionSecret)}`
  const send = (method, path, cookie, body) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      })
    )
  /** Same as `send`, but the body goes over the wire exactly as given — for proving a body that
   * cannot even parse as JSON is refused cleanly rather than crashing the route. */
  const sendRaw = (method, path, cookie, rawBody) =>
    app.fetch(
      new Request(`http://tracy.test${path}`, {
        method,
        headers: { ...(cookie ? { cookie } : {}), 'content-type': 'application/json' },
        body: rawBody
      })
    )
  return { app, config, cookieFor, send, sendRaw }
}

async function accountId(pool, email) {
  const { rows } = await pool.query(
    `insert into account (email) values ($1) on conflict (email) do update set email = excluded.email returning id`,
    [email]
  )
  return rows[0].id
}

async function seatRow(pool, siteKey, email, role) {
  const id = await accountId(pool, email)
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())`,
    [siteKey, id, role]
  )
  return id
}

async function ownedSite(pool, siteKey = 'lantern.localhost', label = 'lantern') {
  await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [siteKey, label, 'local'])
  await seatRow(pool, siteKey, 'owner@x.y', 'owner')
  await seatRow(pool, siteKey, 'editor@x.y', 'editor')
  await seatRow(pool, siteKey, 'viewer@x.y', 'viewer')
}

// ── PUT /api/sites/:key/component-credential ─────────────────────────────────────────────────────

test(
  'component-credential: an editor or viewer is refused NOT_SITE_OWNER; the owner registers one and the response never carries the token',
  opts,
  async () => {
    const { pool } = db
    const { send, cookieFor } = harness(pool)
    await ownedSite(pool)

    // Custody of the write-back token is site administration: the Owner's alone (ADR 0028).
    for (const who of ['editor@x.y', 'viewer@x.y']) {
      const refused = await send(
        'PUT',
        '/api/sites/lantern.localhost/component-credential',
        await cookieFor(who),
        {
          endpoint: 'https://lantern.example/cowork',
          token: 'a'.repeat(20)
        }
      )
      assert.equal(refused.status, 403, who)
      assert.deepEqual(await refused.json(), { code: 'NOT_SITE_OWNER' })
    }
    assert.equal((await currentComponent(pool, 'lantern.localhost')) ?? null, null)

    const owner = await cookieFor('owner@x.y')
    const token = 'b'.repeat(24)
    const ok = await send('PUT', '/api/sites/lantern.localhost/component-credential', owner, {
      endpoint: 'https://lantern.example/cowork',
      token
    })
    assert.equal(ok.status, 200)
    const okText = await ok.text()
    assert.deepEqual(JSON.parse(okText), { ok: true })
    assert.equal(okText.includes(token), false, 'the token must never appear in a response body')

    const row = await currentComponent(pool, 'lantern.localhost')
    assert.equal(row.config.endpoint, 'https://lantern.example/cowork')
    assert.equal(row.config.token, token)
    assert.equal(row.created_by, 'owner@x.y')
  }
)

test(
  'component-credential: a bad endpoint, a short token, and an unparsable body are all a plain 400 INVALID_REQUEST',
  opts,
  async () => {
    const { pool } = db
    const { send, sendRaw, cookieFor } = harness(pool)
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const badEndpoint = await send('PUT', '/api/sites/lantern.localhost/component-credential', owner, {
      endpoint: 'http://lantern.example/cowork', // not https
      token: 'a'.repeat(20)
    })
    assert.equal(badEndpoint.status, 400)
    assert.deepEqual(await badEndpoint.json(), { code: 'INVALID_REQUEST' })

    const shortToken = await send('PUT', '/api/sites/lantern.localhost/component-credential', owner, {
      endpoint: 'https://lantern.example/cowork',
      token: 'short'
    })
    assert.equal(shortToken.status, 400)
    assert.deepEqual(await shortToken.json(), { code: 'INVALID_REQUEST' })

    const garbage = await sendRaw(
      'PUT',
      '/api/sites/lantern.localhost/component-credential',
      owner,
      'not json'
    )
    assert.equal(garbage.status, 400)
    assert.deepEqual(await garbage.json(), { code: 'INVALID_REQUEST' })

    assert.equal(await currentComponent(pool, 'lantern.localhost'), null)
  }
)

test(
  'component-credential: append-only — registering twice writes two rows, and the newest wins',
  opts,
  async () => {
    const { pool } = db
    const { send, cookieFor } = harness(pool)
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    await send('PUT', '/api/sites/lantern.localhost/component-credential', owner, {
      endpoint: 'https://lantern.example/cowork',
      token: 'a'.repeat(20)
    })
    await send('PUT', '/api/sites/lantern.localhost/component-credential', owner, {
      endpoint: 'https://lantern.example/cowork-v2',
      token: 'b'.repeat(20)
    })

    const { rows } = await pool.query(
      'select config from site_component where site_key = $1 order by created_at asc',
      ['lantern.localhost']
    )
    assert.equal(rows.length, 2, 're-registering must INSERT, never UPDATE in place')
    assert.equal(rows[0].config.token, 'a'.repeat(20))
    assert.equal(rows[1].config.token, 'b'.repeat(20))

    const current = await currentComponent(pool, 'lantern.localhost')
    assert.equal(current.config.token, 'b'.repeat(20), 'currentComponent reads the newest row')
  }
)

// ── POST /api/sites/:key/apply ───────────────────────────────────────────────────────────────────

test('apply: no seat on the site is refused before anything else runs', opts, async () => {
  const { pool } = db
  const { send, cookieFor } = harness(pool)
  await ownedSite(pool)
  const stranger = await cookieFor('stranger@x.y')
  const res = await send('POST', '/api/sites/lantern.localhost/apply', stranger, {
    action: 'info',
    params: {}
  })
  assert.equal(res.status, 403)
  assert.deepEqual(await res.json(), { code: 'SEAT_NOT_AUTHORIZED' })
})

test('apply: a missing or unknown action is a plain 400, not a 500', opts, async () => {
  const { pool } = db
  const { send, cookieFor } = harness(pool)
  await ownedSite(pool)
  const owner = await cookieFor('owner@x.y')

  const noAction = await send('POST', '/api/sites/lantern.localhost/apply', owner, { params: {} })
  assert.equal(noAction.status, 400)
  assert.deepEqual(await noAction.json(), { code: 'INVALID_REQUEST' })

  const unknown = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
    action: 'not.a.real.action',
    params: {}
  })
  assert.equal(unknown.status, 400)
  assert.deepEqual(await unknown.json(), { code: 'ACTION_NOT_ALLOWED' })
})

test(
  'apply: with no component ever registered, a read action still answers COMPONENT_NOT_REGISTERED (409), not a crash',
  opts,
  async () => {
    const { pool } = db
    const { send, cookieFor } = harness(pool)
    await ownedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
      action: 'info',
      params: {}
    })
    assert.equal(res.status, 409)
    assert.deepEqual(await res.json(), { code: 'COMPONENT_NOT_REGISTERED' })
  }
)

// 19/09: a site can have a component standing on it and no row here — every Joomla site built
// from a JoomlArt card before the provision fix, plus every site provisioned while `/agent-token`
// was briefly unreachable. `pairComponent` is the repair and it already exists, but the only door
// that called it was `POST /api/sites/:key/agent`, which nothing in the product presses (grepped
// 19/09 across `apps/*/src` and `packages/*/src`). So the site stayed unreachable with the cure
// sitting one function away, and the customer read "not connected to Tracy" on every retry.
test(
  'apply: a fleet-born site with no row pairs itself on the spot when its component answers',
  opts,
  async () => {
    const { pool } = db
    const token = 'a-private-token-minted-by-the-host'
    let tokenReads = 0
    let applies = 0
    const fetchImpl = async (url, init) => {
      const u = new URL(String(url))
      if (u.pathname === '/_host/agent-token') {
        tokenReads++
        return Response.json({ token })
      }
      if (u.hostname === 'lantern-web-1') {
        const body = JSON.parse(init.body)
        if (body.action === 'core.manifest')
          return Response.json({ ok: true, manifest: { platform: 'joomla', platformVersion: '6.1.2' } })
        applies++
        return Response.json({ ok: true, info: 'reached the site' })
      }
      throw new Error(`unexpected call to ${u.href}`)
    }
    const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    await ownedSite(pool)
    await pool.query("update site set platform='joomla', origin='fleet_born' where site_key=$1", [
      'lantern.localhost'
    ])
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
      action: 'info',
      params: {}
    })
    assert.equal(res.status, 200, 'the call goes through instead of being refused')
    assert.deepEqual(await res.json(), { ok: true, info: 'reached the site' })
    assert.equal(applies, 1)
    assert.equal(tokenReads, 1, 'the token is minted once, not on every call')

    // The repair is kept, so the next call is an ordinary one.
    const again = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
      action: 'info',
      params: {}
    })
    assert.equal(again.status, 200)
    assert.equal(tokenReads, 1)
    const row = await currentComponent(pool, 'lantern.localhost')
    assert.equal(
      row.config.endpoint,
      'http://lantern-web-1/index.php?option=com_claudecowork&task=api.exec&format=json'
    )
  }
)

// The repair must not become a way to hide a site that truly has no door: when pairing cannot
// finish, the answer is the same refusal as before, and the customer is told what to do about it.
test(
  'apply: a site whose component cannot be paired is refused as before, with the reason',
  opts,
  async () => {
    const { pool } = db
    const fetchImpl = async (url) => {
      const u = new URL(String(url))
      if (u.pathname === '/_host/agent-token') return Response.json({ code: 'NO_TOKEN' }, { status: 404 })
      throw new Error(`unexpected call to ${u.href}`)
    }
    const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    await ownedSite(pool)
    await pool.query("update site set platform='joomla', origin='fleet_born' where site_key=$1", [
      'lantern.localhost'
    ])
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
      action: 'info',
      params: {}
    })
    assert.equal(res.status, 409)
    const body = await res.json()
    assert.equal(body.code, 'COMPONENT_NOT_REGISTERED')
    assert.equal(typeof body.custodyDetail, 'string', 'the refusal says why pairing did not work')
    assert.equal((await currentComponent(pool, 'lantern.localhost')) ?? null, null)
  }
)

// 25/09 on the dev machine (`capij1400`, quickstart `tracy-business/j6`): a `content.read` through
// this door while the site was still building minted a token; the build's own pairing, eleven
// seconds later, found it, took the verify-only road and died, leaving the previous component on
// the site. The repair must wait for the build that owns the pairing — and must not trust a row
// nobody has polled since the build ended.
test('apply: no pairing is minted while the site is still being built', opts, async () => {
  const { pool } = db
  let hostState = 'running'
  let tokenReads = 0
  const fetchImpl = async (url, init) => {
    const u = new URL(String(url))
    if (u.pathname === '/_host/jobs/job-build-1') return Response.json({ state: hostState, step: 'pairing' })
    if (u.pathname === '/_host/agent-token') {
      tokenReads++
      return Response.json({ token: 'a-private-token-minted-by-the-host' })
    }
    if (u.hostname === 'lantern-web-1') {
      const body = JSON.parse(init.body)
      if (body.action === 'core.manifest')
        return Response.json({ ok: true, manifest: { platform: 'joomla' } })
      return Response.json({ ok: true, info: 'reached the site' })
    }
    throw new Error(`unexpected call to ${u.href}`)
  }
  const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
  await ownedSite(pool)
  await pool.query("update site set platform='joomla', origin='fleet_born' where site_key=$1", [
    'lantern.localhost'
  ])
  await putJob(pool, { id: 'job-build-1', siteKey: 'lantern.localhost', host: 'local', kind: 'provision' })
  const owner = await cookieFor('owner@x.y')

  const early = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
    action: 'info',
    params: {}
  })
  assert.equal(early.status, 409)
  assert.equal((await early.json()).code, 'SITE_PROVISIONING')
  assert.equal(tokenReads, 0, 'nothing is minted while the build owns the pairing')
  assert.equal((await jobById(pool, 'job-build-1')).state, 'running', "the host's answer is kept on the row")

  // The row still says running; the host says done. The host is believed and the repair runs.
  hostState = 'done'
  const late = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
    action: 'info',
    params: {}
  })
  assert.equal(late.status, 200)
  assert.equal(tokenReads, 1)
})

test(
  'apply (ADR 0028): an editor takes code-tier and content-tier actions; a viewer is refused TOOLSET_NOT_GRANTED for both',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true, installed: true } })
    const { send, cookieFor } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
      'owner@x.y'
    )
    const editor = await cookieFor('editor@x.y')
    const viewer = await cookieFor('viewer@x.y')
    const apply = (who, action, params) =>
      send('POST', '/api/sites/lantern.localhost/apply', who, { action, params })

    const codeTier = await apply(editor, 'extension.install', {})
    assert.equal(codeTier.status, 200)
    assert.deepEqual(await codeTier.json(), { ok: true, installed: true })
    assert.equal((await apply(editor, 'content.update', { kind: 'article', id: 1 })).status, 200)
    assert.equal((await apply(editor, 'db.cleanup', {})).status, 200, 'an editor holds `site` too')

    // 27/09/2026: the WordPress kinds take their Joomla counterparts' tier, not `site` by default —
    // a category or tag (`term`) is content, a block theme's header/footer (`templatePart`) is code.
    for (const [action, params, toolset] of [
      ['extension.install', {}, 'code'],
      ['content.update', { kind: 'article', id: 1 }, 'content'],
      ['content.update', { kind: 'term', id: 3, key: 'category', fields: { name: 'News' } }, 'content'],
      ['content.update', { kind: 'templatePart', key: 'footer', fields: { content: '<p>x</p>' } }, 'code'],
      ['db.cleanup', {}, 'site']
    ]) {
      const refused = await apply(viewer, action, params)
      assert.equal(refused.status, 403, `${action} ${params.kind ?? ''}`)
      assert.deepEqual(await refused.json(), { code: 'TOOLSET_NOT_GRANTED', toolset, role: 'viewer' })
    }

    // Every pure read of what the site shows is `read` (PO 08/10/2026): the viewer's read-only agent
    // may ask it. Two reads that carry out more than the site shows stay gated.
    for (const action of [
      'info',
      'content.list',
      'content.get',
      'core.manifest',
      'extension.list',
      'plugin.list',
      'theme.list',
      'db.tables'
    ]) {
      assert.equal((await apply(viewer, action, {})).status, 200, `a viewer reads ${action}`)
    }
    for (const [action, toolset] of [
      ['db.dump', 'site'],
      ['apply.list', 'content']
    ]) {
      const refused = await apply(viewer, action, {})
      assert.equal(refused.status, 403, action)
      assert.deepEqual(await refused.json(), { code: 'TOOLSET_NOT_GRANTED', toolset, role: 'viewer' })
    }
  }
)

// ── No role policy any more (ADR 0028) ──────────────────────────────────────────────────────────────
// Until 08/10/2026 a workspace's or a site's role policy could widen or narrow a role here. Each
// role now holds a fixed set (`seats/roles.js`); the Apply door reads no policy, so there is
// nothing left to rank between a site and its workspace.

test(
  'apply: a site declared into a workspace answers by the fixed role sets — the workspace changes nothing',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
    const { send, cookieFor } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
      'owner@x.y'
    )
    const workspace = await createWorkspace(pool, { displayName: 'Some Agency', createdBy: null })
    await declareSiteWorkspace(pool, { siteKey: 'lantern.localhost', workspaceId: workspace.id })
    const call = async (who) =>
      (
        await send('POST', '/api/sites/lantern.localhost/apply', await cookieFor(who), {
          action: 'extension.install',
          params: {}
        })
      ).status
    assert.equal(await call('editor@x.y'), 200)
    assert.equal(await call('viewer@x.y'), 403)
  }
)

test('apply: a read action bypasses the toolset gate for any live seat', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork({ answer: { ok: true, version: '5.2' } })
  const { send, cookieFor } = harness(pool, { fetchImpl })
  await ownedSite(pool)
  await writeComponent(
    pool,
    'lantern.localhost',
    { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
    'owner@x.y'
  )
  const editor = await cookieFor('editor@x.y')

  const res = await send('POST', '/api/sites/lantern.localhost/apply', editor, {
    action: 'info',
    params: {}
  })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, version: '5.2' })
})

test(
  'apply: forwards {token, action, params} to the registered endpoint, and the reply back to the caller never carries the token',
  opts,
  async () => {
    const { pool } = db
    const token = 'q'.repeat(24)
    const { fetchImpl, calls } = fakeNetwork({ answer: { ok: true } })
    const { send, cookieFor } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token },
      'owner@x.y'
    )
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
      action: 'content.update',
      params: { kind: 'article', id: 7, fields: { title: 'x' } }
    })
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.equal(text.includes(token), false, 'the token must never appear in a response body')

    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://lantern.example/cowork')
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      token,
      action: 'content.update',
      params: { kind: 'article', id: 7, fields: { title: 'x' } }
    })

    const { rows } = await pool.query(
      "select * from audit where site_key = $1 and action = 'content.update'",
      ['lantern.localhost']
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].actor, 'owner@x.y')
    assert.equal(rows[0].detail.ok, true)
    assert.equal(
      JSON.stringify(rows[0]).includes(token),
      false,
      'the token must never reach the audit trail either'
    )
  }
)

// ── An IMPORTED site writes to its fleet copy, never to the customer's live site (14/09) ─────────
// The import registers the component on the live site; measured on fijitrips.example, an agent in
// the site's workspace disabled a plugin in production through this door. The copy has the same
// component and token, so the door moves the endpoint onto it — and refuses when it cannot.

const LIVE = 'https://fijitrips.example/index.php?option=com_claudecowork&task=api.exec&format=json'
const COPY =
  'http://fijitrips-example-5254d120-web-1/index.php?option=com_claudecowork&task=api.exec&format=json'

/** The live site's fingerprint its import took (`sites/route.js` importFingerprint). */
const IMPORT_FINGERPRINT = {
  version: 1,
  pageSize: 50000,
  skip: ['hits'],
  files: { count: 1, bytes: 1, pages: ['a'.repeat(40)] },
  tables: {}
}

async function importedSite(pool) {
  await pool.query(
    'insert into site (site_key, label, host, platform, origin, port) values ($1, $2, $3, $4, $5, $6)',
    ['fijitrips.example', 'fijitrips-example-5254d120', 'local', 'joomla', 'migrated', 52001]
  )
  await seatRow(pool, 'fijitrips.example', 'owner@x.y', 'owner')
  await writeComponent(
    pool,
    'fijitrips.example',
    { endpoint: LIVE, token: 't'.repeat(24), importFingerprint: IMPORT_FINGERPRINT },
    'owner@x.y'
  )
}

/**
 * A component that answers only on the copy; the live site must never be dialled. `manifests`, when
 * given, answers the copy's `core.manifest` calls in order (the last one repeats): an answer body, a
 * `Response`, or `'timeout'` — the call cut the way `AbortSignal.timeout` cuts it.
 */
function copyOnlyNetwork({
  copyManifest = { ok: true, manifest: { platform: 'joomla' } },
  manifests = null
} = {}) {
  const calls = []
  let manifestCalls = 0
  const fetchImpl = async (input, init) => {
    const url = String(input)
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : null })
    if (url !== COPY) return new Response(JSON.stringify({ ok: true, reached: 'live' }), { status: 200 })
    const body = calls.at(-1).body
    if (body?.action === 'core.manifest' && manifests) {
      const answer = manifests[Math.min(manifestCalls++, manifests.length - 1)]
      if (answer === 'timeout')
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
      if (answer instanceof Response) return answer
      return new Response(JSON.stringify(answer), { status: 200 })
    }
    const answer = body?.action === 'core.manifest' ? copyManifest : { ok: true, reached: 'copy' }
    return new Response(JSON.stringify(answer), { status: 200 })
  }
  return { calls, fetchImpl }
}

test(
  'apply: an imported site registered on its live endpoint writes to the fleet copy, and the live site is never called',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = copyOnlyNetwork()
    const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/fijitrips.example/apply', owner, {
      action: 'content.update',
      params: { kind: 'option', key: 'x', fields: { value: 1 } }
    })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true, reached: 'copy' })
    assert.equal(
      calls.some((c) => c.url === LIVE),
      false,
      'the customer live site must never be dialled'
    )
    assert.deepEqual(
      calls.map((c) => c.body.action),
      ['core.manifest', 'content.update']
    )

    const cred = await currentComponent(pool, 'fijitrips.example')
    assert.equal(cred.config.endpoint, COPY)
    assert.equal(cred.config.liveEndpoint, LIVE)
    // The first Sync from live compares with what the import found: re-pairing to the copy keeps it
    // (22/10/2026: the copy's row dropped it, and the first sync read the whole site again).
    assert.deepEqual(cred.config.importFingerprint, IMPORT_FINGERPRINT)
  }
)

test(
  'apply: an imported site whose copy does not verify is refused COMPONENT_NOT_ON_FLEET_COPY — never written live',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = copyOnlyNetwork({ copyManifest: { ok: false, error: 'BAD_TOKEN' } })
    const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    await importedSite(pool)
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/fijitrips.example/apply', owner, {
      action: 'info',
      params: {}
    })
    assert.equal(res.status, 409)
    assert.deepEqual(await res.json(), {
      code: 'COMPONENT_NOT_ON_FLEET_COPY',
      copyReason: 'refused',
      transient: false
    })
    assert.equal(
      calls.some((c) => c.url === LIVE),
      false
    )
    assert.equal((await currentComponent(pool, 'fijitrips.example')).config.endpoint, LIVE)
  }
)

test(
  'pairing: a copy provisioned with its own Claude Cowork token is reached with it, and the live token is kept apart for Sync from live',
  opts,
  async () => {
    const { pool } = db
    const COPY_TOKEN = 'c'.repeat(48)
    const { fetchImpl, calls } = copyOnlyNetwork()
    const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    await importedSite(pool)
    await writeComponent(
      pool,
      'fijitrips.example',
      { endpoint: LIVE, token: 't'.repeat(24), copyToken: COPY_TOKEN },
      'owner@x.y'
    )
    const owner = await cookieFor('owner@x.y')
    const res = await send('POST', '/api/sites/fijitrips.example/apply', owner, {
      action: 'info',
      params: {}
    })
    assert.equal(res.status, 200)
    assert.ok(
      calls.every((c) => c.url === COPY && c.body.token === COPY_TOKEN),
      'only the copy, only with its token'
    )
    const cred = await currentComponent(pool, 'fijitrips.example')
    assert.deepEqual(
      {
        endpoint: cred.config.endpoint,
        token: cred.config.token,
        liveEndpoint: cred.config.liveEndpoint,
        liveToken: cred.config.liveToken
      },
      { endpoint: COPY, token: COPY_TOKEN, liveEndpoint: LIVE, liveToken: 't'.repeat(24) }
    )
  }
)

test(
  'pairing: a copy that still holds the live token (a host from before the copy token) is reached with that one',
  opts,
  async () => {
    const { pool } = db
    const LIVE_TOKEN = 't'.repeat(24)
    const calls = []
    const fetchImpl = async (input, init) => {
      const body = JSON.parse(init.body)
      calls.push({ url: String(input), token: body.token })
      if (String(input) !== COPY) return new Response('{}', { status: 200 })
      if (body.token !== LIVE_TOKEN)
        return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 200 })
      const answer =
        body.action === 'core.manifest'
          ? { ok: true, manifest: { platform: 'joomla' } }
          : { ok: true, reached: 'copy' }
      return new Response(JSON.stringify(answer), { status: 200 })
    }
    const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    await importedSite(pool)
    await writeComponent(
      pool,
      'fijitrips.example',
      { endpoint: LIVE, token: LIVE_TOKEN, copyToken: 'c'.repeat(48) },
      'owner@x.y'
    )
    const owner = await cookieFor('owner@x.y')
    const res = await send('POST', '/api/sites/fijitrips.example/apply', owner, {
      action: 'info',
      params: {}
    })
    assert.equal(res.status, 200)
    assert.equal(
      calls.some((c) => c.url === LIVE),
      false
    )
    assert.equal((await currentComponent(pool, 'fijitrips.example')).config.token, LIVE_TOKEN)
  }
)

// ── 30/09: a cold copy is tried once more; a wrong one is refused with its reason ─────────────────
// Measured on a local stand: tracy.ai imported (WordPress + WooCommerce, 2,482 posts), three writes
// refused minutes after the import, while the same core.manifest answered in 464 ms a moment later.

/** Runs one Apply on the imported site and answers what came back, with what the copy was asked. */
async function applyOnImported(pool, network) {
  const { send, cookieFor } = harness(pool, {
    fetchImpl: network.fetchImpl,
    envOverrides: { HOST_NAME: 'local' }
  })
  await importedSite(pool)
  const res = await send('POST', '/api/sites/fijitrips.example/apply', await cookieFor('owner@x.y'), {
    action: 'content.update',
    params: { kind: 'option', key: 'x', fields: { value: 1 } }
  })
  return { status: res.status, body: await res.json(), actions: network.calls.map((c) => c.body.action) }
}

test(
  'apply: an imported copy whose first check times out is checked again, and the write goes through',
  opts,
  async () => {
    const { pool } = db
    const network = copyOnlyNetwork({
      manifests: ['timeout', { ok: true, manifest: { platform: 'joomla' } }]
    })
    const warned = []
    const warn = console.warn
    console.warn = (...line) => warned.push(line.join(' '))
    let answer
    try {
      answer = await applyOnImported(pool, network)
    } finally {
      console.warn = warn
    }
    assert.equal(answer.status, 200, JSON.stringify(answer.body))
    assert.deepEqual(answer.body, { ok: true, reached: 'copy' })
    assert.deepEqual(answer.actions, ['core.manifest', 'core.manifest', 'content.update'])
    assert.equal(
      network.calls.some((c) => c.url === LIVE),
      false,
      'the live site is never dialled'
    )
    assert.equal((await currentComponent(pool, 'fijitrips.example')).config.endpoint, COPY)
    // The first cut is said, with the site and the reason, so a cold copy is told from a wrong one.
    assert.equal(warned.length, 1, warned.join('\n'))
    assert.match(
      warned[0],
      /\[fleet-copy\] fijitrips-example-5254d120 not verified: timeout \(try 1\/2, 30000 ms\)/
    )
  }
)

test(
  'apply: an imported copy that times out twice is refused as warming up — retry, never written live',
  opts,
  async () => {
    const { pool } = db
    const network = copyOnlyNetwork({ manifests: ['timeout'] })
    const warn = console.warn
    console.warn = () => {}
    let answer
    try {
      answer = await applyOnImported(pool, network)
    } finally {
      console.warn = warn
    }
    assert.equal(answer.status, 409)
    assert.deepEqual(answer.body, {
      code: 'COMPONENT_NOT_ON_FLEET_COPY',
      copyReason: 'timeout',
      transient: true
    })
    assert.deepEqual(answer.actions, ['core.manifest', 'core.manifest'], 'one retry, no more')
    assert.equal((await currentComponent(pool, 'fijitrips.example')).config.endpoint, LIVE)
  }
)

/**
 * 🔒 THE COPY'S OTHER DOOR (beta report 26/10/2026). A Joomla site whose front end was gated when it
 * was imported again keeps its ADMINISTRATOR door registered; on the copy that door may not reach the
 * plugin while the front door does. Each door is asked, the registered one first, and the door that
 * answered is the one kept — never the live site.
 */
const LIVE_ADMIN =
  'https://fijitrips.example/administrator/index.php?option=com_claudecowork&task=api.exec&format=json'
const COPY_ADMIN =
  'http://fijitrips-example-5254d120-web-1/administrator/index.php?option=com_claudecowork&task=api.exec&format=json'

async function reimportedSite(pool, adminAnswer) {
  await pool.query(
    'insert into site (site_key, label, host, platform, origin, port) values ($1, $2, $3, $4, $5, $6)',
    ['fijitrips.example', 'fijitrips-example-5254d120', 'local', 'joomla', 'migrated', 52001]
  )
  await seatRow(pool, 'fijitrips.example', 'owner@x.y', 'owner')
  await writeComponent(
    pool,
    'fijitrips.example',
    { endpoint: LIVE_ADMIN, token: 't'.repeat(24) },
    'owner@x.y'
  )
  const calls = []
  const fetchImpl = async (input, init) => {
    const url = String(input)
    const body = init?.body ? JSON.parse(init.body) : null
    calls.push({ url, action: body?.action })
    if (url === COPY_ADMIN) return adminAnswer()
    if (url !== COPY) return new Response(JSON.stringify({ ok: true, reached: 'live' }), { status: 200 })
    const answer =
      body?.action === 'core.manifest'
        ? { ok: true, manifest: { platform: 'joomla' } }
        : { ok: true, reached: 'copy' }
    return new Response(JSON.stringify(answer), { status: 200 })
  }
  return { calls, fetchImpl }
}

test(
  'apply: a re-imported Joomla copy whose registered administrator door redirects is reached on its front door',
  opts,
  async () => {
    const { pool } = db
    const network = await reimportedSite(pool, () => {
      throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') })
    })
    const { send, cookieFor } = harness(pool, {
      fetchImpl: network.fetchImpl,
      envOverrides: { HOST_NAME: 'local' }
    })
    const warn = console.warn
    console.warn = () => {}
    let res
    try {
      res = await send('POST', '/api/sites/fijitrips.example/apply', await cookieFor('owner@x.y'), {
        action: 'content.update',
        params: { kind: 'option', key: 'x', fields: { value: 1 } }
      })
    } finally {
      console.warn = warn
    }
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true, reached: 'copy' })
    assert.deepEqual(
      network.calls.map((c) => [c.url === COPY_ADMIN ? 'admin' : c.url === COPY ? 'front' : c.url, c.action]),
      [
        ['admin', 'core.manifest'],
        ['front', 'core.manifest'],
        ['front', 'content.update']
      ]
    )
    assert.equal(
      network.calls.some((c) => new URL(c.url).hostname === 'fijitrips.example'),
      false,
      'never the live site'
    )
    const cred = await currentComponent(pool, 'fijitrips.example')
    assert.equal(cred.config.endpoint, COPY)
    assert.equal(cred.config.liveEndpoint, LIVE_ADMIN)
  }
)

for (const rootAdmin of [false, true]) {
  test(
    `apply: Joomla imported from a subdirectory verifies its root ${rootAdmin ? 'administrator' : 'front'} door and keeps the live endpoint for sync`,
    opts,
    async () => {
      const { pool } = db
      await reimportedSite(pool, () => assert.fail('unexpected old door'))
      const live = `https://fijitrips.example/2026-joomla6/index.php?option=com_claudecowork&task=api.exec&format=json`
      await writeComponent(
        pool,
        'fijitrips.example',
        {
          endpoint: live,
          token: 'l'.repeat(24),
          copyToken: 'c'.repeat(24),
          importFingerprint: { source: 'retained' }
        },
        'owner@x.y'
      )
      const calls = []
      const chosen = rootAdmin ? COPY_ADMIN : COPY
      const fetchImpl = async (input, init) => {
        const url = String(input)
        assert.equal(new URL(url).origin, new URL(COPY).origin, 'never call live')
        const body = JSON.parse(init.body)
        if (body.action === 'core.manifest')
          assert.equal(init.redirect, 'error', 'never send the token through a redirect')
        calls.push({ url, body })
        if (url !== chosen) return new Response('<html>Not Found</html>', { status: 404 })
        assert.equal(body.token, 'c'.repeat(24))
        return Response.json(
          body.action === 'core.manifest'
            ? { ok: true, manifest: { platform: 'joomla' } }
            : { ok: true, reached: 'copy' }
        )
      }
      const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
      const res = await send('POST', '/api/sites/fijitrips.example/apply', await cookieFor('owner@x.y'), {
        action: 'content.update',
        params: { kind: 'option', key: 'x', fields: { value: 1 } }
      })
      assert.equal(res.status, 200)
      assert.deepEqual(await res.json(), { ok: true, reached: 'copy' })
      assert.deepEqual(
        calls.map(({ url }) => new URL(url).pathname),
        [
          '/2026-joomla6/index.php',
          '/2026-joomla6/administrator/index.php',
          '/index.php',
          ...(rootAdmin ? ['/administrator/index.php'] : []),
          rootAdmin ? '/administrator/index.php' : '/index.php'
        ]
      )
      assert.equal(calls.filter(({ body }) => body.action === 'content.update').length, 1)
      const cred = await currentComponent(pool, 'fijitrips.example')
      assert.equal(cred.config.endpoint, chosen)
      assert.equal(cred.config.liveEndpoint, live)
      assert.equal(cred.config.token, 'c'.repeat(24))
      assert.equal(cred.config.liveToken, 'l'.repeat(24))
      assert.deepEqual(cred.config.importFingerprint, { source: 'retained' })
    }
  )
}

test(
  'apply: a copy whose doors redirect and answer a page is refused as such, not as warming up',
  opts,
  async () => {
    const { pool } = db
    const network = await reimportedSite(pool, () => {
      throw new TypeError('fetch failed', { cause: new Error('unexpected redirect') })
    })
    const gated = async (input, init) =>
      String(input) === COPY
        ? new Response('<html>Site offline</html>', { status: 200, headers: { 'content-type': 'text/html' } })
        : network.fetchImpl(input, init)
    const { send, cookieFor } = harness(pool, { fetchImpl: gated, envOverrides: { HOST_NAME: 'local' } })
    const warn = console.warn
    console.warn = () => {}
    let res
    try {
      res = await send('POST', '/api/sites/fijitrips.example/apply', await cookieFor('owner@x.y'), {
        action: 'info',
        params: {}
      })
    } finally {
      console.warn = warn
    }
    assert.equal(res.status, 409)
    assert.deepEqual(await res.json(), {
      code: 'COMPONENT_NOT_ON_FLEET_COPY',
      copyReason: 'not_json',
      transient: false
    })
  }
)

test(
  'apply: an imported copy that refuses the token is refused unauthorized on the first answer — no retry',
  opts,
  async () => {
    const { pool } = db
    const network = copyOnlyNetwork({
      manifests: [
        new Response(
          JSON.stringify({ ok: false, error: 'unauthorized', message: 'invalid or missing token' }),
          {
            status: 401
          }
        )
      ]
    })
    const warn = console.warn
    console.warn = () => {}
    let answer
    try {
      answer = await applyOnImported(pool, network)
    } finally {
      console.warn = warn
    }
    assert.equal(answer.status, 409)
    assert.deepEqual(answer.body, {
      code: 'COMPONENT_NOT_ON_FLEET_COPY',
      copyReason: 'unauthorized',
      transient: false
    })
    assert.deepEqual(answer.actions, ['core.manifest'])
    assert.equal(
      network.calls.some((c) => c.url === LIVE),
      false
    )
  }
)

test(
  'apply: an imported copy that answers as another CMS is refused platform_mismatch — never written',
  opts,
  async () => {
    const { pool } = db
    const network = copyOnlyNetwork({ manifests: [{ ok: true, manifest: { platform: 'wordpress' } }] })
    const warn = console.warn
    console.warn = () => {}
    let answer
    try {
      answer = await applyOnImported(pool, network)
    } finally {
      console.warn = warn
    }
    assert.equal(answer.status, 409)
    assert.deepEqual(answer.body, {
      code: 'COMPONENT_NOT_ON_FLEET_COPY',
      copyReason: 'platform_mismatch',
      transient: false
    })
    assert.deepEqual(answer.actions, ['core.manifest'])
    assert.equal((await currentComponent(pool, 'fijitrips.example')).config.endpoint, LIVE)
  }
)

test(
  'apply: an imported site is bound to its derived contract — an editor applies its slots, and no seat may derive (29/09)',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = copyOnlyNetwork()
    const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    await importedSite(pool)
    await seatRow(pool, 'fijitrips.example', 'editor@x.y', 'editor')
    await seatRow(pool, 'fijitrips.example', 'viewer@x.y', 'viewer')
    await accountId(pool, 'stranger@x.y')
    const as = async (email, params) => {
      const res = await send('POST', '/api/sites/fijitrips.example/apply', await cookieFor(email), {
        action: 'content.contract',
        params
      })
      return { status: res.status, body: await res.json() }
    }

    // `derive` rebinds every slot: import provisioning runs it, never a seat — the owner included.
    for (const who of ['owner', 'editor', 'viewer']) {
      const refused = await as(`${who}@x.y`, { operation: 'derive' })
      assert.equal(refused.status, 403, who)
      assert.deepEqual(refused.body, { code: 'CONTRACT_OPERATION_PROVISION_ONLY', operation: 'derive' })
    }
    assert.equal(calls.length, 0, 'a refused derive never reaches the site')

    // No quickstart seals it, yet an editor writes the words its derived contract maps.
    const words = {
      operation: 'apply',
      expected_revision: 'r1',
      changes: { 'article-12.introtext.0a1b2c3d4e': 'Fiji, slowly' }
    }
    const editor = await as('editor@x.y', words)
    assert.equal(editor.status, 200, JSON.stringify(editor.body))
    assert.deepEqual(editor.body, { ok: true, reached: 'copy' })
    // A string override changes words a visitor reads: `content`, like a text slot.
    const string = await as('editor@x.y', {
      operation: 'string',
      domain: 'default',
      msgid: 'Read more',
      locale: 'en_US',
      value: 'Keep reading',
      apply_id: 'a-string-1'
    })
    assert.equal(string.status, 200, JSON.stringify(string.body))
    assert.equal((await as('stranger@x.y', words)).status, 403, 'no seat, no write')
    assert.equal((await as('viewer@x.y', words)).status, 403, 'a viewer writes no slot (ADR 0028)')
  }
)

// ── `target` (Fix round 1, task-6b-review.md): this app has no clone concept, so a non-empty
// `target` must fail closed rather than silently write to the live endpoint — see the comment on
// the check itself in `route.js`.

test(
  'apply: a non-empty target is refused APPLY_TARGET_NOT_ALLOWED, and the component is never called',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ answer: { ok: true } })
    const { send, cookieFor } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
      'owner@x.y'
    )
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
      action: 'info',
      params: {},
      target: 'https://lantern--preview.example/'
    })
    assert.equal(res.status, 400)
    assert.deepEqual(await res.json(), { code: 'APPLY_TARGET_NOT_ALLOWED' })
    assert.equal(calls.length, 0, 'a refused target must never reach the component')
  }
)

test(
  'apply: no target still succeeds, and an empty-string target behaves exactly as absent',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl, calls } = fakeNetwork({ answer: { ok: true } })
    const { send, cookieFor } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
      'owner@x.y'
    )
    const owner = await cookieFor('owner@x.y')

    const noTarget = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
      action: 'info',
      params: {}
    })
    assert.equal(noTarget.status, 200)

    const emptyTarget = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
      action: 'info',
      params: {},
      target: ''
    })
    assert.equal(emptyTarget.status, 200)

    assert.equal(calls.length, 2, 'both calls must have reached the component')
  }
)

test(
  'apply: the component being unreachable is a 502 COMPONENT_UNREACHABLE, not a thrown error',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ throwOn: true })
    const { send, cookieFor } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
      'owner@x.y'
    )
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
      action: 'info',
      params: {}
    })
    assert.equal(res.status, 502)
    assert.deepEqual(await res.json(), { code: 'COMPONENT_UNREACHABLE' })

    const { rows } = await pool.query("select detail from audit where site_key = $1 and action = 'info'", [
      'lantern.localhost'
    ])
    assert.equal(rows[0].detail.ok, false)
  }
)

test('apply: a non-JSON component reply is a 502 COMPONENT_BAD_RESPONSE', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork({ answer: 'not json at all' })
  const { send, cookieFor } = harness(pool, { fetchImpl })
  await ownedSite(pool)
  await writeComponent(
    pool,
    'lantern.localhost',
    { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
    'owner@x.y'
  )
  const owner = await cookieFor('owner@x.y')

  const res = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
    action: 'info',
    params: {}
  })
  assert.equal(res.status, 502)
  const body = await res.json()
  assert.equal(body.code, 'COMPONENT_BAD_RESPONSE')
})

test(
  'apply: a component that reports its own token as invalid maps to 409 COMPONENT_UNAUTHORIZED, not a generic failure',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: false, error: 'invalid token' } })
    const { send, cookieFor } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
      'owner@x.y'
    )
    const owner = await cookieFor('owner@x.y')

    const res = await send('POST', '/api/sites/lantern.localhost/apply', owner, {
      action: 'info',
      params: {}
    })
    assert.equal(res.status, 409)
    assert.deepEqual(await res.json(), { code: 'COMPONENT_UNAUTHORIZED' })
  }
)

// ── content.list {search} (30/09/2026): the plugin proves it read the filter by echoing it ─────────────
//
// A Claude Cowork plugin reads only the keys it knows and answers ok:true for the rest, so a `search`
// it never read came back as the whole list, looking filtered (r2, 25/09). A plugin that reads it
// answers with a `search` key iff the request carried one. The relay judges that key, never the rows.

const LIST_ROWS = [
  { id: 1, title: 'Roof repair', alias: 'roof-repair' },
  { id: 2, title: 'Gutter cleaning', alias: 'gutter-cleaning' }
]

/** A paired site, and the seat that lists it: an editor, since a list is a read any seat may make. */
async function listingSeat(pool, plugin) {
  const { send, cookieFor } = harness(pool, { fetchImpl: plugin.fetchImpl })
  await ownedSite(pool)
  await writeComponent(
    pool,
    'lantern.localhost',
    { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
    'owner@x.y'
  )
  const cookie = await cookieFor('editor@x.y')
  return (params, action = 'content.list') =>
    send('POST', '/api/sites/lantern.localhost/apply', cookie, { action, params })
}

test(
  'apply: a content.list that carried `search` and came back with no `search` key is 501 LIST_SEARCH_UNSUPPORTED — the KEY, not its value, decides; no rows; audited as not ok',
  opts,
  async () => {
    for (const asked of ['roof', '', '   ', null]) {
      const { pool } = db
      await db.reset()
      const plugin = fakeNetwork({ answer: { ok: true, kind: 'article', offset: 0, items: LIST_ROWS } })
      const list = await listingSeat(pool, plugin)

      const res = await list({ kind: 'article', search: asked })

      assert.equal(res.status, 501, `search ${JSON.stringify(asked)}`)
      const text = await res.text()
      const body = JSON.parse(text)
      assert.equal(body.code, 'LIST_SEARCH_UNSUPPORTED')
      assert.match(body.error, /Claude Cowork plugin/)
      assert.equal('items' in body, false)
      assert.equal(text.includes('Roof repair'), false, 'nothing that looks filtered')
      assert.equal(plugin.calls.length, 1)
      assert.deepEqual(JSON.parse(plugin.calls[0].init.body).params, { kind: 'article', search: asked })
      const { rows } = await pool.query(
        "select detail from audit where site_key = $1 and action = 'content.list'",
        ['lantern.localhost']
      )
      assert.equal(rows.length, 1)
      assert.equal(rows[0].detail.ok, false, 'the caller was refused, so the trail says so')
    }
  }
)

test(
  'apply: a content.list whose answer echoes `search` passes as the plugin sent it — `matched` and the rows included, whatever the echo says',
  opts,
  async () => {
    for (const echo of ['roof', '', 'roof repair', null, 0]) {
      const { pool } = db
      await db.reset()
      const answer = { ok: true, kind: 'article', offset: 0, search: echo, matched: 1, items: [LIST_ROWS[0]] }
      const plugin = fakeNetwork({ answer })
      const list = await listingSeat(pool, plugin)

      const res = await list({ kind: 'article', search: 'roof' })

      assert.equal(res.status, 200, `echo ${JSON.stringify(echo)}`)
      assert.deepEqual(await res.json(), answer)
      const { rows } = await pool.query("select detail from audit where action = 'content.list'")
      assert.equal(rows[0].detail.ok, true)
    }
  }
)

test(
  'apply: a content.list with no `search` key is answered as before, whatever the plugin says — and so is any other action that carries one',
  opts,
  async () => {
    const { pool } = db
    const listed = { ok: true, kind: 'article', offset: 0, items: LIST_ROWS }
    const plugin = fakeNetwork({ answer: listed })
    const list = await listingSeat(pool, plugin)

    const plain = await list({ kind: 'article', offset: 10, limit: 5 })
    const other = await list({ kind: 'article', id: 1, search: 'roof' }, 'content.get')

    assert.equal(plain.status, 200)
    assert.deepEqual(await plain.json(), listed)
    assert.equal(other.status, 200, 'only a list is judged by the echo')
    assert.deepEqual(await other.json(), listed)
  }
)

test(
  'apply: a plugin that refuses the search itself is passed on as it said it — never turned into LIST_SEARCH_UNSUPPORTED',
  opts,
  async () => {
    const { pool } = db
    const refusal = {
      ok: false,
      error: 'bad_params',
      message: 'search must be text of at most 200 characters'
    }
    const plugin = fakeNetwork({ answer: refusal })
    const list = await listingSeat(pool, plugin)

    const res = await list({ kind: 'article', search: 'roof' })

    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), refusal)
  }
)

test(
  'apply: the guard is the door’s, not a role’s — an owner and an editor are refused a search the same way',
  opts,
  async () => {
    const { pool } = db
    const plugin = fakeNetwork({ answer: { ok: true, kind: 'article', offset: 0, items: LIST_ROWS } })
    const { send, cookieFor } = harness(pool, { fetchImpl: plugin.fetchImpl })
    await ownedSite(pool)
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
      'owner@x.y'
    )
    for (const who of ['owner@x.y', 'editor@x.y']) {
      const res = await send('POST', '/api/sites/lantern.localhost/apply', await cookieFor(who), {
        action: 'content.list',
        params: { kind: 'article', search: 'roof' }
      })
      assert.equal(res.status, 501, who)
      assert.equal((await res.json()).code, 'LIST_SEARCH_UNSUPPORTED', who)
    }
  }
)

// ── WordPress block edits by revision, and patterns (01/10/2026, `tasks/todo-wordpress-block-editing.md`) ──
//
// The host sends `expected_body_revision` beside a block write only when the plugin's own read answered
// `body_revision`; the plugin compares it inside its lock. The relay must hand it over untouched, and hand
// the plugin's `revision_stale` back as the plugin said it, or the condition is lost between the two.

test(
  'apply: a content.update param the door has no rule for (expected_body_revision) reaches the plugin unchanged, and its answer comes back as sent',
  opts,
  async () => {
    const { pool } = db
    const answers = [
      { ok: true, kind: 'post', id: 42, created: false, body_revision: 'b'.repeat(64) },
      { ok: false, error: 'revision_stale', message: 'the body changed', body_revision: 'c'.repeat(64) }
    ]
    for (const answer of answers) {
      await db.reset()
      const plugin = fakeNetwork({ answer })
      const write = await listingSeat(pool, plugin)
      const params = {
        apply_id: 'wp-home',
        kind: 'post',
        id: 42,
        fields: { post_content: '<!-- wp:paragraph -->\n<p>Hi</p>\n<!-- /wp:paragraph -->' },
        expected_body_revision: 'a'.repeat(64)
      }

      const res = await write(params, 'content.update')

      assert.equal(res.status, 200, answer.error ?? 'ok')
      assert.deepEqual(await res.json(), answer)
      assert.equal(plugin.calls.length, 1)
      assert.deepEqual(JSON.parse(plugin.calls[0].init.body).params, params)
    }
  }
)

test(
  'apply: a seat that may read may read the registered patterns — content.list {kind:"pattern"} and content.get {kind:"pattern", key} are reads',
  opts,
  async () => {
    const { pool } = db
    const listed = {
      ok: true,
      kind: 'pattern',
      search: 'hero',
      items: [{ name: 'theme/hero', title: 'Hero', categories: ['banner'], description: '', chars: 420 }],
      matched: 1,
      offset: 0,
      limit: 50
    }
    const plugin = fakeNetwork({ answer: listed })
    const read = await listingSeat(pool, plugin)

    const list = await read({ kind: 'pattern', search: 'hero' })
    const one = await read({ kind: 'pattern', key: 'theme/hero' }, 'content.get')

    assert.equal(list.status, 200)
    assert.deepEqual(await list.json(), listed)
    assert.equal(one.status, 200)
    assert.deepEqual(
      plugin.calls.map((c) => JSON.parse(c.init.body).params),
      [
        { kind: 'pattern', search: 'hero' },
        { kind: 'pattern', key: 'theme/hero' }
      ]
    )
  }
)

test(
  'Apply accepts a signed prompter and rechecks their seat; other doors remain cookie-only',
  opts,
  async () => {
    const { pool } = db
    const network = fakeNetwork()
    const { app, config } = harness(pool, network)
    await ownedSite(pool)
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'test-component-token' },
      'owner@x.y'
    )
    const actor = (email) => {
      const payload = Buffer.from(
        JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })
      ).toString('base64url')
      return `v1.${payload}.${createHmac('sha256', config.actorSecret).update(payload).digest('base64url')}`
    }
    const send = (email, action, params = {}, path = '/api/sites/lantern.localhost/apply') =>
      app.fetch(
        new Request(`http://tracy.test${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-tracy-actor': actor(email) },
          body: JSON.stringify({ action, params })
        })
      )
    assert.equal((await send('owner@x.y', 'core.manifest')).status, 200)
    assert.equal(network.calls.length, 1)
    assert.equal((await send('outsider@x.y', 'core.manifest')).status, 403)
    // A signed viewer is held to its role like a cookie viewer: a read-only agent (ADR 0028).
    assert.equal((await send('viewer@x.y', 'extension.install')).status, 403)
    assert.equal((await send('owner@x.y', 'unused', {}, '/api/sites')).status, 401)
    assert.equal(network.calls.length, 1, 'refusals never reach the component')

    // One conversation, one site: a call carrying its session's folder label is held to that site.
    const inConversation = (key, label) =>
      app.fetch(
        new Request(`http://tracy.test/api/sites/${key}/apply`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-tracy-actor': actor('owner@x.y'),
            'x-tracy-workspace-label': label
          },
          body: JSON.stringify({ action: 'core.manifest', params: {} })
        })
      )
    assert.equal((await inConversation('_conversation', 'lantern')).status, 200)
    const other = await inConversation('harbor.localhost', 'lantern')
    assert.equal(other.status, 403)
    assert.equal((await other.json()).code, 'SITE_OUTSIDE_CONVERSATION')
    assert.equal((await inConversation('_conversation', 'nowhere')).status, 404)
    assert.equal(network.calls.length, 2)
    const audit = await pool.query('select actor from audit order by id desc limit 1')
    assert.equal(audit.rows[0].actor, 'owner@x.y')
  }
)

test(
  'content.renderedWords is taken from the agent host alone: a cookie or a seat key is refused before the site (24/10/2026)',
  opts,
  async () => {
    const { pool } = db
    const network = fakeNetwork({ answer: { ok: true, revision: 1, targets: [] } })
    const { app, config, cookieFor, send } = harness(pool, network)
    await ownedSite(pool)
    await writeComponent(
      pool,
      'lantern.localhost',
      { endpoint: 'https://lantern.example/cowork', token: 'test-component-token' },
      'owner@x.y'
    )
    const apply = { operation: 'apply', proof: 'p', expected_revision: 1, rules: [], apply_id: 'a-1' }
    // A browser session, on both addresses of the door: refused by name, the site never called.
    const cookie = await cookieFor('owner@x.y')
    for (const res of [
      await send('POST', '/api/sites/lantern.localhost/apply', cookie, {
        action: 'content.renderedWords',
        params: apply
      }),
      await send('POST', '/api/sites/lantern.localhost/apply/content.renderedWords', cookie, apply)
    ]) {
      assert.equal(res.status, 403)
      assert.deepEqual(await res.json(), { code: 'ACTION_AGENT_ONLY', action: 'content.renderedWords' })
    }
    assert.equal(network.calls.length, 0, 'a refused call never reaches the site')

    // The agent host's signed actor — the road content.replace takes — still reaches the site.
    const payload = Buffer.from(
      JSON.stringify({ email: 'owner@x.y', exp: Math.floor(Date.now() / 1000) + 60 })
    ).toString('base64url')
    const actor = `v1.${payload}.${createHmac('sha256', config.actorSecret).update(payload).digest('base64url')}`
    const asActor = (params) =>
      app.fetch(
        new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-tracy-actor': actor,
            'x-tracy-session': 'session-rw'
          },
          body: JSON.stringify({ action: 'content.renderedWords', params })
        })
      )
    const inspected = await asActor({ operation: 'inspect', path: '/', targets: [] })
    assert.equal(inspected.status, 200)
    assert.equal(network.calls.length, 1)
    assert.equal(JSON.parse(network.calls[0].init.body).action, 'content.renderedWords')
    const applied = await asActor({ ...apply, apply_id: 'rw-1' })
    assert.equal(applied.status, 200)
    assert.equal(network.calls.length, 2)

    // Its receipt is an ordinary one: listed among the site's changes, read and undone by apply_id
    // through the same door from a browser session, which the action itself refuses.
    const asOwner = applyAs(app, cookie)
    const recent = await (await asOwner('session-other', { action: 'apply.list', params: {} })).json()
    assert.deepEqual(
      recent.changes.map((c) => [c.apply_id, c.changed[0]?.action]),
      [['rw-1', 'content.renderedWords']]
    )
    assert.equal(
      (await asOwner('session-other', { action: 'apply.list', params: { apply_id: 'rw-1' } })).status,
      200
    )
    const reverted = await asOwner('session-other', { action: 'apply.revert', params: { apply_id: 'rw-1' } })
    assert.equal(reverted.status, 200)
    assert.deepEqual(
      network.calls
        .slice(2)
        .map((c) => JSON.parse(c.init.body))
        .map((b) => [b.action, b.params.apply_id]),
      [
        ['apply.list', 'rw-1'],
        ['apply.revert', 'rw-1']
      ]
    )
    const after = await (await asOwner('session-other', { action: 'apply.list', params: {} })).json()
    assert.equal(after.changes.find((c) => c.apply_id === 'rw-1')?.undone, true)
  }
)

// ── The write lease, at the door ──────────────────────────────────────────────────────────────────
//
// 🔒 THIS LAYER HAD NO TEST AT ALL, AND THAT IS WHY IT SHIPPED WRONG. `write-lease.test.mjs` proves
// the lease itself — atomicity, ordering, the TTL, the ceiling — and every one of its cases calls
// `takeWriteLease` directly. Nothing exercised the DOOR with a session header, so the store stayed
// right while the door's decision about WHICH calls take the lease drifted away from it, and a pure
// read locked a site against its own owner.
//
// Measured 19/09 on `demowp`, two chats of one customer: chat A asked `content.language` with no
// params, the component refused it for `apply_id required`, nothing was written — and chat A held
// the site from 03:17:15 until its real write at 03:18:59, with chat B refused `SITE_BUSY` twice in
// between and told to stop. The customer typed two requests and one of them did nothing.

/** The lease row for a site, or null. */
async function leaseRow(pool, siteKey) {
  const { rows } = await pool.query('select * from site_write_lease where site_key = $1', [siteKey])
  return rows[0] ?? null
}

/** An Apply as a chat session makes it: the `x-tracy-session` header is what the lease keys on. */
function applyAs(app, cookie) {
  return (session, body) =>
    app.fetch(
      new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json', 'x-tracy-session': session },
        body: JSON.stringify(body)
      })
    )
}

async function siteWithComponent(pool) {
  await ownedSite(pool)
  await writeComponent(
    pool,
    'lantern.localhost',
    { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
    'owner@x.y'
  )
}

test('apply: a read that needs a privileged toolset does not take the write lease', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork({ answer: { ok: true, tables: ['wp_options'] } })
  const { app, cookieFor } = harness(pool, { fetchImpl })
  await siteWithComponent(pool)
  const apply = applyAs(app, await cookieFor('owner@x.y'))

  // `db.dump` needs the `site` toolset because it carries the customer's data out — not because
  // it writes. Same for `apply.list`, and for `content.contract` when it only inspects. All three
  // used to be lumped in with the writes by `rule !== 'read'`.
  for (const body of [
    { action: 'db.dump', params: { table: 'wp_options' } },
    { action: 'apply.list', params: {} },
    { action: 'content.contract', params: { operation: 'inspect' } },
    // 27/09/2026: the component answers no operation as an inspect, and plans/verifies only read.
    { action: 'content.contract', params: {} },
    { action: 'content.contract', params: { operation: 'multilingual.plan' } },
    { action: 'content.contract', params: { operation: 'demoTrim.verify' } }
  ]) {
    const res = await apply('session-reader', body)
    assert.equal(res.status, 200, `${body.action} was refused at the door`)
    assert.equal(await leaseRow(pool, 'lantern.localhost'), null, `${body.action} took the write lease`)
  }

  // The other chat is therefore free to write, which is the whole point.
  const other = await apply('session-writer', {
    action: 'content.update',
    params: { kind: 'article', id: 1, fields: { title: 'x' } }
  })
  assert.equal(other.status, 200)
  assert.equal((await leaseRow(pool, 'lantern.localhost')).holder_session, 'session-writer')
})

test('apply: a contract operation that is not `inspect` does take the lease', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
  const { app, cookieFor } = harness(pool, { fetchImpl })
  await siteWithComponent(pool)
  const apply = applyAs(app, await cookieFor('owner@x.y'))

  const res = await apply('session-a', {
    action: 'content.contract',
    params: { operation: 'apply', changes: { 'hero.title': 'Xin chào' } }
  })
  assert.equal(res.status, 200)
  assert.equal((await leaseRow(pool, 'lantern.localhost')).holder_session, 'session-a')
  // A language job's apply writes too — only `*.plan` / `*.verify` read.
  const lang = await apply('session-a', {
    action: 'content.contract',
    params: { operation: 'multilingual.apply' }
  })
  assert.equal(lang.status, 200)
  assert.equal((await leaseRow(pool, 'lantern.localhost')).holder_session, 'session-a')
})

test('apply: a refusal from the component gives the lease straight back', opts, async () => {
  const { pool } = db
  // Exactly what `demowp` measured: a write-class action the component refuses for a bad call.
  const { fetchImpl } = fakeNetwork({
    answer: { ok: false, error: 'bad_params', message: 'apply_id required' }
  })
  const { app, cookieFor } = harness(pool, { fetchImpl })
  await siteWithComponent(pool)
  const apply = applyAs(app, await cookieFor('owner@x.y'))

  const res = await apply('session-a', { action: 'content.language', params: {} })
  assert.equal(res.status, 200, 'the component answer comes back verbatim')
  assert.equal((await res.json()).ok, false)
  const after = await leaseRow(pool, 'lantern.localhost')
  assert.equal(after.holder_session, null, 'a call that changed nothing is still holding the site')

  // And the other chat gets in immediately — 200 from the component, not 409 SITE_BUSY — rather
  // than waiting out a stale window for a call that never wrote. (This component refuses every
  // call, so session-b's write is refused too and its own lease comes straight back for the same
  // reason; what is being proved here is that it was never told the site was busy.)
  const other = await applyAs(app, await cookieFor('editor@x.y'))('session-b', {
    action: 'content.update',
    params: { kind: 'article', id: 1, fields: { title: 'x' } }
  })
  assert.equal(other.status, 200, 'the second chat was locked out by a call that changed nothing')
  assert.notEqual((await other.json()).code, 'SITE_BUSY')
})

test(
  'apply: a refusal in the MIDDLE of a request keeps the lease — only the call that opened it may give it back',
  opts,
  async () => {
    const { pool } = db
    let answer = { ok: true }
    const fetchImpl = async () => new Response(JSON.stringify(answer), { status: 200 })
    const { app, cookieFor } = harness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const apply = applyAs(app, await cookieFor('owner@x.y'))

    // One customer ask, several writes under one apply_id. The first lands…
    const first = await apply('session-a', {
      action: 'content.update',
      params: { kind: 'article', id: 1, fields: { title: 'one' }, apply_id: 'batch-1' }
    })
    assert.equal(first.status, 200)
    assert.equal((await leaseRow(pool, 'lantern.localhost')).holder_session, 'session-a')

    // …the next is refused. The site is now half changed, so releasing here would invite the other
    // chat into exactly the state the lease exists to protect.
    answer = { ok: false, error: 'bad_params', message: 'id required' }
    const second = await apply('session-a', {
      action: 'content.update',
      params: { kind: 'article', fields: { title: 'two' }, apply_id: 'batch-1' }
    })
    assert.equal(second.status, 200)
    assert.equal(
      (await leaseRow(pool, 'lantern.localhost')).holder_session,
      'session-a',
      'a refusal mid-request handed the site to somebody else'
    )
  }
)

test('apply: silence from the component keeps the lease — the write may have landed', opts, async () => {
  const { pool } = db
  // Not a refusal: an answer that is not an answer. Whether the site moved is unknown, so fail
  // closed and keep holding it rather than letting a second writer in on a guess.
  const { fetchImpl } = fakeNetwork({ answer: 'not json at all' })
  const { app, cookieFor } = harness(pool, { fetchImpl })
  await siteWithComponent(pool)
  const apply = applyAs(app, await cookieFor('owner@x.y'))

  const res = await apply('session-a', {
    action: 'content.update',
    params: { kind: 'article', id: 1, fields: { title: 'x' } }
  })
  assert.equal(res.status, 502)
  assert.equal((await res.json()).code, 'COMPONENT_BAD_RESPONSE')
  assert.equal(
    (await leaseRow(pool, 'lantern.localhost')).holder_session,
    'session-a',
    'an unknown outcome released the site'
  )
})

test('apply: the second chat is told who has the site and how long it has to wait', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
  const { app, cookieFor } = harness(pool, { fetchImpl })
  await siteWithComponent(pool)

  const write = { action: 'content.update', params: { kind: 'article', id: 1, fields: { title: 'x' } } }
  assert.equal((await applyAs(app, await cookieFor('owner@x.y'))('session-a', write)).status, 200)

  const res = await applyAs(app, await cookieFor('editor@x.y'))('session-b', write)
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.code, 'SITE_BUSY')
  assert.equal(body.holder, 'owner@x.y')
  assert.equal(body.holderIsYou, false)
  // The number a customer can actually decide against, instead of the word "shortly".
  assert.ok(body.freeInSeconds > 0, 'the refusal carries no wait')
  assert.match(body.next, /frees in about \d+ second/)
})

// Stand, 29/09 (`tasks/evidence/comment-multi-pin/stand-e2e.md` round 2): each fresh conversation of
// the one customer, inside 90 s of the previous one's last write, got `SITE_BUSY` from itself.
test(
  'apply: a new conversation of the same account takes the lease over, and the audit says so',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
    const { app, cookieFor } = harness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const owner = applyAs(app, await cookieFor('owner@x.y'))
    const write = { action: 'content.update', params: { kind: 'article', id: 1, fields: { title: 'x' } } }

    assert.equal((await owner('session-a', write)).status, 200)
    // Arrival is stamped on the database clock; move the first conversation's back so the second is
    // unambiguously the newer one, as it is on a real machine.
    await pool.query(`update site_presence set first_at = first_at - interval '10 seconds'`)
    const res = await owner('session-a2', write)
    assert.equal(res.status, 200, 'the same account was refused by its own earlier conversation')
    assert.equal((await leaseRow(pool, 'lantern.localhost')).holder_session, 'session-a2')

    const { rows } = await pool.query(
      `select actor, detail from audit where site_key = $1 and action = 'site.lease.takeover'`,
      ['lantern.localhost']
    )
    assert.equal(rows.length, 1, 'the takeover left no audit row')
    assert.equal(rows[0].actor, 'owner@x.y')
    assert.deepEqual(rows[0].detail, { fromSession: 'session-a', toSession: 'session-a2' })

    // A different account is still refused while the hold is live — the lease's original purpose.
    const other = await applyAs(app, await cookieFor('editor@x.y'))('session-b', write)
    assert.equal(other.status, 409)
    assert.equal((await other.json()).code, 'SITE_BUSY')
    assert.equal((await leaseRow(pool, 'lantern.localhost')).holder_session, 'session-a2')
  }
)

// Acceptance v4 (30/09, `e2e-v4/send.md` S09, R09, ED1, ADV3): a second conversation was refused
// for up to 90 s after the first one had finished. The host frees the hold when the turn ends.
test('lease/release: the finished conversation’s hold goes back; nobody else’s does', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
  const { app, cookieFor } = harness(pool, { fetchImpl })
  await siteWithComponent(pool)
  const write = { action: 'content.update', params: { kind: 'article', id: 1, fields: { title: 'x' } } }
  const ownerCookie = await cookieFor('owner@x.y')
  const editorCookie = await cookieFor('editor@x.y')
  assert.equal((await applyAs(app, ownerCookie)('session-a', write)).status, 200)
  const release = (cookie, session) =>
    app.fetch(
      new Request('http://tracy.test/api/sites/lantern.localhost/lease/release', {
        method: 'POST',
        headers: { cookie, 'x-tracy-session': session }
      })
    )
  // The editor quoting the owner's session frees nothing.
  const foreign = await release(editorCookie, 'session-a')
  assert.equal(foreign.status, 200)
  assert.deepEqual(await foreign.json(), { released: false })
  assert.equal((await applyAs(app, editorCookie)('session-b', write)).status, 409)
  // The owner's turn ended: the editor's next write goes through at once.
  const own = await release(ownerCookie, 'session-a')
  assert.deepEqual(await own.json(), { released: true })
  const after = await applyAs(app, editorCookie)('session-b', write)
  assert.equal(after.status, 200, 'the finished conversation still held the site')
  // No session header is a bad call, not a silent success.
  const bare = await app.fetch(
    new Request('http://tracy.test/api/sites/lantern.localhost/lease/release', {
      method: 'POST',
      headers: { cookie: ownerCookie }
    })
  )
  assert.equal(bare.status, 400)
})

// Review Q3 (20/10/2026): turn 4's release, slow or retried, arrives after turn 5 of the same
// conversation wrote. Judged by session alone it freed turn 5's hold mid-request.
test(
  'lease/release: a late release of an earlier turn keeps the hold the next turn renewed',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
    const { app, cookieFor } = harness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const write = { action: 'content.update', params: { kind: 'article', id: 1, fields: { title: 'x' } } }
    const ownerCookie = await cookieFor('owner@x.y')
    const editorCookie = await cookieFor('editor@x.y')
    const inTurn = (turn) =>
      app.fetch(
        new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
          method: 'POST',
          headers: {
            cookie: ownerCookie,
            'content-type': 'application/json',
            'x-tracy-session': 'session-a',
            'x-tracy-turn': `session-a:${turn}`
          },
          body: JSON.stringify(write)
        })
      )
    const release = (turn) =>
      app.fetch(
        new Request('http://tracy.test/api/sites/lantern.localhost/lease/release', {
          method: 'POST',
          headers: {
            cookie: ownerCookie,
            'x-tracy-session': 'session-a',
            'x-tracy-turn': `session-a:${turn}`
          }
        })
      )
    assert.equal((await inTurn(4)).status, 200)
    assert.equal((await inTurn(5)).status, 200)
    assert.deepEqual(await (await release(4)).json(), { released: false })
    assert.equal((await leaseRow(pool, 'lantern.localhost')).holder_session, 'session-a')
    assert.equal(
      (await applyAs(app, editorCookie)('session-b', write)).status,
      409,
      'another chat stepped into turn 5'
    )
    assert.deepEqual(await (await release(5)).json(), { released: true })
    assert.equal((await applyAs(app, editorCookie)('session-b', write)).status, 200)
  }
)

test('SITE_BUSY never reads out a count of conversations', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
  const { app, cookieFor } = harness(pool, { fetchImpl })
  await siteWithComponent(pool)
  const write = { action: 'content.update', params: { kind: 'article', id: 1, fields: { title: 'x' } } }
  assert.equal((await applyAs(app, await cookieFor('owner@x.y'))('session-a', write)).status, 200)
  const editor = applyAs(app, await cookieFor('editor@x.y'))
  for (const s of ['session-b', 'session-c', 'session-b']) {
    const body = await (await editor(s, write)).json()
    assert.equal(body.code, 'SITE_BUSY')
    assert.ok(body.aheadOfYou === 0 || body.aheadOfYou === 1, `aheadOfYou ${body.aheadOfYou}`)
    assert.doesNotMatch(body.next, /\d+ other conversation/)
  }
})

// ── GET /api/sites/:key/applies — what a chat cut off by a deploy had already changed (#295) ─────

test(
  'applies: the Apply door records the chat session, and the read door lists what it changed',
  opts,
  async () => {
    const { pool } = db
    let answer = { ok: true }
    const fetchImpl = async () => new Response(JSON.stringify(answer), { status: 200 })
    const { app, send, cookieFor } = harness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const owner = await cookieFor('owner@x.y')
    const apply = applyAs(app, owner)

    const update = (applyId) => ({
      action: 'content.update',
      params: { kind: 'article', id: 1, fields: { title: applyId }, apply_id: applyId }
    })
    await apply('session-a', update('vi-default'))
    await apply('session-a', update('vi-tagline'))
    await apply('session-a', update('vi-default')) // a second write under the same id
    answer = { ok: false, error: 'bad_params', message: 'id required' }
    await apply('session-a', update('vi-refused'))
    answer = { ok: true }
    await apply('session-a', { action: 'apply.revert', params: { apply_id: 'vi-tagline' } })

    const res = await send('GET', '/api/sites/lantern.localhost/applies?session=session-a', owner)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(
      body.applies.map((a) => [a.action, a.applyId, a.ok]),
      [
        ['content.update', 'vi-default', true],
        ['content.update', 'vi-tagline', true],
        ['content.update', 'vi-default', true],
        ['content.update', 'vi-refused', false],
        ['apply.revert', 'vi-tagline', true]
      ]
    )
    assert.deepEqual(
      body.applyIds,
      ['vi-default', 'vi-tagline'],
      'refused writes and reverts are not changes to undo'
    )

    const later = new Date(Date.now() + 60_000).toISOString()
    const none = await send(
      'GET',
      `/api/sites/lantern.localhost/applies?session=session-a&since=${later}`,
      owner
    )
    assert.deepEqual((await none.json()).applies, [])
  }
)

test('applies: a session token in the header never reaches the audit trail', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork()
  const { app, cookieFor } = harness(pool, { fetchImpl })
  await siteWithComponent(pool)
  const token = 'v1.eyJlbWFpbCI6ImFAYi5jIn0.c2lnbmF0dXJl'
  await applyAs(app, await cookieFor('owner@x.y'))(token, {
    action: 'content.update',
    params: { kind: 'article', id: 1, fields: { title: 'x' }, apply_id: 'one' }
  })
  const { rows } = await pool.query("select detail from audit where action = 'content.update'")
  assert.equal(rows.length, 1)
  assert.equal(rows[0].detail.sessionId, undefined)
  assert.doesNotMatch(JSON.stringify(rows[0].detail), /v1\./)
})

test(
  'applies: an editor sees every caller’s calls, a viewer only its own; a bad session id and a stranger are refused',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork()
    const { app, send, cookieFor } = harness(pool, { fetchImpl })
    await siteWithComponent(pool)
    await applyAs(app, await cookieFor('owner@x.y'))('session-a', {
      action: 'content.update',
      params: { kind: 'article', id: 1, fields: { title: 'x' }, apply_id: 'owner-write' }
    })
    const editor = await cookieFor('editor@x.y')
    // An editor may revert anyone's change (ADR 0028), so it sees every caller's calls.
    const all = await send('GET', '/api/sites/lantern.localhost/applies?session=session-a', editor)
    assert.equal(all.status, 200)
    assert.deepEqual((await all.json()).applyIds, ['owner-write'])
    const seen = await send(
      'GET',
      '/api/sites/lantern.localhost/applies?session=session-a',
      await cookieFor('viewer@x.y')
    )
    assert.equal(seen.status, 200)
    assert.deepEqual((await seen.json()).applies, [], "a viewer read the owner's writes")

    const bad = await send('GET', '/api/sites/lantern.localhost/applies?session=a.b', editor)
    assert.equal(bad.status, 400)
    const badSince = await send(
      'GET',
      '/api/sites/lantern.localhost/applies?session=session-a&since=nope',
      editor
    )
    assert.equal(badSince.status, 400)
    const stranger = await send(
      'GET',
      '/api/sites/lantern.localhost/applies?session=session-a',
      await cookieFor('stranger@x.y')
    )
    assert.equal(stranger.status, 403)
  }
)

// ── apply.list with no apply_id: the site's recent changes (ladder DL15, 14/10/2026) ──────────────────

/**
 * 🔒 DL15 on dsl2jo: the customer came back in a NEW conversation and asked to undo the site-name change
 * of the one before. `apply.list {}` reached the plugin, which lists one apply_id only, and the agent
 * found no such change and undid two articles. The door now answers it from Tracy's own record: every
 * conversation's recorded changes, newest first, each with its apply_id and what it was aimed at.
 */
test(
  'apply.list with no apply_id answers the site’s recent changes from every conversation, without asking the site',
  opts,
  async () => {
    const { pool } = db
    const sent = []
    const fetchImpl = async (input, init) => {
      sent.push(JSON.parse(String(init?.body ?? '{}')).action)
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }
    const { app, cookieFor } = harness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const apply = applyAs(app, await cookieFor('owner@x.y'))

    // DL14's conversation: the site name (read first, then set), a module, an article later undone.
    await apply('session-dl14', { action: 'site.identity', params: { operation: 'read' } })
    await apply('session-dl14', {
      action: 'site.identity',
      params: { operation: 'set', fields: { sitename: 'Street Bakery' }, apply_id: 'identity-1' }
    })
    await apply('session-dl14', {
      action: 'content.update',
      params: { kind: 'module', id: 110, fields: { content: 'x' }, apply_id: 'call-button' }
    })
    await apply('session-dl14', {
      action: 'content.update',
      params: { kind: 'article', id: 19, fields: { introtext: 'x' }, apply_id: 'article-19' }
    })
    await apply('session-dl14', { action: 'apply.revert', params: { apply_id: 'article-19' } })
    const asked = sent.length

    // DL15: a new conversation, no id.
    const res = await apply('session-dl15', { action: 'apply.list', params: {} })
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(sent.length, asked, 'the site is not asked: Tracy answers from its own record')
    assert.equal(body.ok, true)
    const byId = Object.fromEntries(body.changes.map((c) => [c.apply_id, c]))
    assert.deepEqual(Object.keys(byId).sort(), ['article-19', 'call-button', 'identity-1'])
    assert.deepEqual(byId['identity-1'].changed, [{ action: 'site.identity', fields: ['sitename'] }])
    assert.deepEqual(byId['call-button'].changed, [
      { action: 'content.update', kind: 'module', id: '110', fields: ['content'] }
    ])
    assert.equal(byId['article-19'].undone, true)
    assert.equal(byId['identity-1'].undone, undefined)
    for (const c of body.changes) assert.equal(c.thisConversation, false)
    assert.match(body.next, /apply\.revert \{apply_id\} undoes one/)

    // The name's READ took no lease and wrote no Site changes row: only the set did.
    const { rows } = await pool.query(
      "select count(*)::int as n from site_write where site_key = 'lantern.localhost' and action = 'site.identity'"
    )
    assert.equal(rows[0].n, 1)

    // The same list from the conversation that made them marks them its own; an id still asks the site.
    const own = await (await apply('session-dl14', { action: 'apply.list', params: {} })).json()
    assert.ok(own.changes.every((c) => c.thisConversation === true))
    await apply('session-dl15', { action: 'apply.list', params: { apply_id: 'identity-1' } })
    assert.equal(sent.at(-1), 'apply.list')
  }
)

// Transport fixtures only: these do not certify any CMS reader or lifecycle hook.
test(
  'content.read: server authority, protocol probe and unsupported Claude Cowork plugins fail closed',
  opts,
  async () => {
    const { pool } = db
    let answer = { schemaVersion: 'tracy-content/v1' }
    const forwarded = []
    const fetchImpl = async (_input, init) => {
      forwarded.push(JSON.parse(init.body))
      return Response.json(answer)
    }
    const { send, cookieFor } = harness(pool, { fetchImpl })
    await ownedSite(pool)
    await seatRow(pool, 'lantern.localhost', 'second-editor@x.y', 'editor')
    await writeComponent(
      pool,
      'lantern.localhost',
      {
        endpoint: 'https://lantern.example/cowork',
        token: 'z'.repeat(20)
      },
      'owner@x.y'
    )
    const owner = await cookieFor('owner@x.y')
    const call = (cookie, params = {}) =>
      send('POST', '/api/sites/lantern.localhost/apply', cookie, {
        action: 'content.read',
        params,
        contentPrincipal: 'agent-supplied',
        contentScope: 'editorial'
      })
    assert.equal((await call(owner, { limit: 1 })).status, 200)
    assert.equal(forwarded[0].contentScope, 'published')
    assert.match(forwarded[0].contentPrincipal, /^seat:[a-f0-9]{64}$/)
    assert.deepEqual(forwarded[0].params, { limit: 1 })
    // The HTML lang an agent reads is lower case on Joomla (`en-gb`); the Claude Cowork plugin lists `en-GB`.
    assert.equal((await call(owner, { type: 'page', locale: 'en-gb' })).status, 200)
    assert.equal(forwarded.at(-1).params.locale, 'en-GB')
    forwarded.pop()
    // A locale the site does not list: the Claude Cowork plugin's bare refusal becomes one that names the
    // site's own tags (25/09, fj1823: `locale:"en"` → "Invalid content query", 118 s of detours).
    const cowork = answer
    answer = { error: { code: 'CONTENT_BAD_QUERY', message: 'Invalid content query.' } }
    const listing = { schemaVersion: 'tracy-content/v1', site: { locales: ['en-GB', 'ru-RU'] } }
    const before = forwarded.length
    const probeAnswers = async (_input, init) => {
      const sent = JSON.parse(init.body)
      forwarded.push(sent)
      return Response.json(sent.params.limit === 1 && sent.params.locale === undefined ? listing : answer)
    }
    const probing = harness(pool, { fetchImpl: probeAnswers })
    const refusedLocale = await probing.send('POST', '/api/sites/lantern.localhost/apply', owner, {
      action: 'content.read',
      params: { type: 'page', locale: 'en' }
    })
    assert.equal(refusedLocale.status, 400)
    assert.equal(
      (await refusedLocale.json()).error.message,
      `locale "en" is not one of this site's locales: en-GB, ru-RU; use "en-GB"`
    )
    assert.deepEqual(forwarded.at(-1).params, { limit: 1 }, 'the one extra read asks for the list only')
    forwarded.splice(before)
    answer = cowork
    assert.equal((await call(await cookieFor('second-editor@x.y'))).status, 200)
    assert.equal(forwarded[1].contentScope, 'published')
    assert.notEqual(forwarded[1].contentPrincipal, forwarded[0].contentPrincipal)
    for (const params of [
      { scope: 'editorial' },
      { principal: 'service' },
      { contentScope: 'editorial' },
      { contentPrincipal: 'service' },
      { query: { limit: 1 } }
    ]) {
      assert.equal((await call(owner, params)).status, 400)
    }
    // Each refusal names the field to fix (25/09, agent chat on capiwp1333: four bare refusals).
    for (const [params, said] of [
      [{ scope: 'editorial' }, /unknown parameter "scope"/],
      [{ limit: 200 }, /limit must be an integer from 1 to 100/],
      [{ type: 'template-part' }, /type must be one of page, article/],
      [{ id: 'c1', type: 'page' }, /do not combine it with type/],
      [{ blockId: 'b1' }, /need the id/]
    ]) {
      const refused = await call(owner, params)
      assert.equal(refused.status, 400)
      const { error } = await refused.json()
      assert.equal(error.code, 'CONTENT_BAD_QUERY')
      assert.match(error.message, said)
    }
    // ADR 0028 (PO 08/10/2026): a content read is open to any live seat, so a viewer's read-only
    // agent reads the site too — published scope, under a principal of its own.
    assert.equal((await call(await cookieFor('viewer@x.y'))).status, 200)
    assert.equal(forwarded[2].contentScope, 'published')
    assert.notEqual(forwarded[2].contentPrincipal, forwarded[0].contentPrincipal)
    assert.equal(forwarded.length, 3, 'rejected authority and policy never reach the Claude Cowork plugin')
    for (const unsupported of [
      { ok: false, error: 'unknown action' },
      { ok: true, status: 200, content: { schemaVersion: 'tracy-content/v1' } },
      { ok: true, native: 'emdash transport has no v1 envelope' }
    ]) {
      answer = unsupported
      const response = await call(owner)
      assert.equal(response.status, 501)
      assert.equal((await response.json()).error.code, 'CONTENT_ADAPTER_UNSUPPORTED')
      assert.equal(response.headers.get('cache-control'), 'private, no-store')
    }
    for (const [code, status] of Object.entries({
      CONTENT_BAD_QUERY: 400,
      CONTENT_UNAUTHENTICATED: 401,
      CONTENT_FORBIDDEN: 403,
      CONTENT_NOT_FOUND: 404,
      CONTENT_SNAPSHOT_EXPIRED: 409,
      CONTENT_FIELD_TOO_LARGE: 413,
      CONTENT_ADAPTER_UNSUPPORTED: 501,
      CONTENT_SOURCE_UNAVAILABLE: 503
    })) {
      answer = { error: { code, message: 'fixture refusal' } }
      const response = await call(owner)
      assert.equal(response.status, status)
      assert.deepEqual(await response.json(), answer)
    }
  }
)

// EmDash has no Tracy component: content.read reaches the site's own reader with the read-only
// relay PAT the host keeps, as a Bearer, with the canonical envelope and nothing else.
test(
  'content.read on EmDash: Bearer read PAT from the host, canonical body, other actions still unpaired',
  opts,
  async () => {
    const { pool } = db
    const readToken = 'ec_pat_' + 'r'.repeat(43)
    let hostAnswer = { status: 404, body: { code: 'NO_CONTENT_API' } }
    const hostCalls = []
    const siteCalls = []
    const fetchImpl = async (input, init) => {
      const at = String(input)
      if (at.startsWith('http://tracy-host.test/')) {
        hostCalls.push(at)
        return Response.json(hostAnswer.body, { status: hostAnswer.status })
      }
      siteCalls.push({ url: at, init })
      return Response.json({ schemaVersion: 'tracy-content/v1', contents: [] })
    }
    const { send, cookieFor } = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    await pool.query(
      `insert into site (site_key, label, host, platform, origin) values ($1, $2, 'local', 'emdash', 'fleet_born')`,
      ['lantern.localhost', 'lantern']
    )
    await seatRow(pool, 'lantern.localhost', 'owner@x.y', 'owner')
    const owner = await cookieFor('owner@x.y')
    const call = (action, params = {}) =>
      send('POST', '/api/sites/lantern.localhost/apply', owner, {
        action,
        params,
        contentPrincipal: 'agent-supplied',
        contentScope: 'editorial'
      })

    // No reader on the site (no relay token on the host): 501, and the site is never called.
    const none = await call('content.read', { limit: 1 })
    assert.equal(none.status, 501)
    assert.equal((await none.json()).error.code, 'CONTENT_ADAPTER_UNSUPPORTED')
    assert.deepEqual(siteCalls, [])

    hostAnswer = { status: 200, body: { token: readToken } }
    const ok = await call('content.read', { limit: 1 })
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('cache-control'), 'private, no-store')
    const [sent] = siteCalls
    assert.equal(new URL(sent.url).pathname, '/content.json')
    assert.equal(sent.init.headers.authorization, `Bearer ${readToken}`)
    assert.equal(sent.init.redirect, 'error')
    const body = JSON.parse(sent.init.body)
    assert.deepEqual(Object.keys(body).sort(), ['action', 'contentPrincipal', 'contentScope', 'params'])
    assert.equal(body.action, 'content.read')
    assert.equal(body.contentScope, 'published')
    assert.match(body.contentPrincipal, /^seat:[a-f0-9]{64}$/)
    assert.deepEqual(body.params, { limit: 1 })

    // The token is kept server-side: the next read asks the host nothing.
    const asked = hostCalls.length
    assert.equal((await call('content.read')).status, 200)
    assert.equal(hostCalls.length, asked)
    // Consumer-supplied authority is still refused before anything is sent.
    assert.equal((await call('content.read', { contentScope: 'editorial' })).status, 400)
    assert.equal(siteCalls.length, 2)

    // The content door is not a write door: other actions are refused as before.
    assert.equal(await currentComponent(pool, 'lantern.localhost'), null)
    const other = await call('apply.list')
    assert.equal(other.status, 409)
    assert.equal((await other.json()).code, 'COMPONENT_NOT_REGISTERED')
    assert.equal(siteCalls.length, 2)
  }
)

// ── content.read {describe} and the relay's additions to the v1 envelope (Content API v2) ────────

const SEALED = { tag: 'tracy-business/j6', version: '1.2.0', contract: 'tracy-business/j6/1.2.0' }
/** `@tracy/content-api`'s Joomla fixture: a complete v1 envelope with a mapped slot `module-430.0`. */
const JOOMLA_ENVELOPE = JSON.parse(
  readFileSync(
    new URL('../../../packages/cms/tracy-content-api/test/fixtures/joomla.json', import.meta.url),
    'utf8'
  )
)
const hasCapability = (doc, name) => doc.capabilities.some((one) => one.name === `ai.tracy.content.${name}`)

/** A fake v1 Claude Cowork plugin: the site listing for `{limit:1}`, a total per type for `{type, limit:1}`. */
function contentCowork({ totals = { page: 7, article: 12 }, envelope = true, extra = {} } = {}) {
  const asked = []
  const fetchImpl = async (_input, init) => {
    const sent = JSON.parse(init.body)
    asked.push(sent.params)
    if (!envelope) return Response.json({ ok: false, error: 'unknown action' })
    const type = sent.params.type
    return Response.json({
      ...JOOMLA_ENVELOPE,
      site: {
        id: 's-lantern',
        name: 'Lantern',
        url: 'https://lantern.example',
        defaultLocale: 'en-GB',
        locales: ['en-GB', 'ru-RU']
      },
      pagination: { limit: 1, nextCursor: null, total: type === undefined ? 40 : (totals[type] ?? 0) },
      ...extra
    })
  }
  return { asked, fetchImpl }
}

async function sealedJoomlaSite(pool, { tag = SEALED.tag, version = SEALED.version } = {}) {
  await pool.query(
    `insert into site (site_key, label, host, platform, quickstart_tag, quickstart_version) values ($1, $2, 'local', 'joomla', $3, $4)`,
    ['lantern.localhost', 'lantern', tag, version]
  )
  await seatRow(pool, 'lantern.localhost', 'owner@x.y', 'owner')
  await seatRow(pool, 'lantern.localhost', 'editor@x.y', 'editor')
  await writeComponent(
    pool,
    'lantern.localhost',
    { endpoint: 'https://lantern.example/cowork', token: 'z'.repeat(20) },
    'owner@x.y'
  )
}

/** One `content.read` through the Apply door, as `email`. */
function contentRead(harnessed, email, params) {
  return harnessed
    .cookieFor(email)
    .then((cookie) =>
      harnessed.send('POST', '/api/sites/lantern.localhost/apply', cookie, { action: 'content.read', params })
    )
}

test('content.read describe: a sealed Joomla site, read by its owner', opts, async () => {
  const { pool } = db
  const cowork = contentCowork()
  const harnessed = harness(pool, { fetchImpl: cowork.fetchImpl })
  await sealedJoomlaSite(pool)

  const response = await contentRead(harnessed, 'owner@x.y', { describe: true })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const doc = await response.json()
  assert.deepEqual(validateDescribe(doc), [])
  assert.equal(doc.schemaVersion, 'tracy-content-describe/v1')
  assert.deepEqual(doc.site, {
    id: 's-lantern',
    name: 'Lantern',
    url: 'https://lantern.example',
    defaultLocale: 'en-GB',
    locales: ['en-GB', 'ru-RU']
  })
  assert.deepEqual(
    doc.types.map(({ type, count }) => ({ type, count })),
    [
      { type: 'page', count: 7 },
      { type: 'article', count: 12 },
      { type: 'service', count: 0 },
      { type: 'project', count: 0 },
      { type: 'shared', count: 0 },
      { type: 'generic', count: 0 }
    ]
  )
  assert.equal(doc.provenance.quickstartTag, 'tracy-business/j6')
  assert.equal(doc.provenance.quickstartVersion, '1.2.0')
  assert.equal(doc.provenance.contractId, SEALED.contract)
  assert.match(doc.provenance.contractHash, /^[a-f0-9]{64}$/)
  // A content recommendation, not a lock (ADR 0022): the reason names the design baseline.
  assert.equal(doc.presentation.state, 'unlocked')
  assert.match(doc.presentation.reason, /tracy-business\/j6\/1\.2\.0/)
  assert.equal(doc.permissions.role, 'owner')
  assert.equal(doc.permissions.apply, true)
  assert.ok(hasCapability(doc, 'slot-write'))
  assert.ok(doc.blockKinds.length > 0)
  assert.ok(doc.blockKinds.every((kind) => kind.fields.every((field) => field.writable === true)))
  assert.deepEqual(doc.protocol.cowork, { kind: 'joomla', capability: 'v1' })
  assert.equal(doc.i18n.defaultLocale, 'en-GB')
  // The Claude Cowork plugin never sees `describe` (an old one would refuse it): one listing and six counts.
  assert.equal(cowork.asked.length, 7)
  assert.ok(cowork.asked.every((params) => params.describe === undefined && params.limit === 1))

  // A second describe within five minutes asks the Claude Cowork plugin nothing.
  assert.equal((await contentRead(harnessed, 'owner@x.y', { describe: true })).status, 200)
  assert.equal(cowork.asked.length, 7)

  // Execute the advertised article read through the real relay route. The model need not
  // infer a query type from a CMS block kind (for example WordPress's `option`).
  const next = doc.types.find((entry) => entry.type === 'article').next
  assert.deepEqual(next, { tool: 'tracy_site', action: 'content.read', params: { type: 'article' } })
  assert.equal((await contentRead(harnessed, 'owner@x.y', next.params)).status, 200)
  assert.deepEqual(cowork.asked.at(-1), { type: 'article' })
})

test(
  'content.read describe: Joomla counts survive a Claude Cowork plugin that refuses overlapping reads',
  opts,
  async () => {
    const { pool } = db
    const cowork = contentCowork()
    let active = 0
    let maxActive = 0
    const fetchImpl = async (input, init) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      const response =
        active > 1
          ? Response.json({ error: { code: 'CONTENT_SOURCE_UNAVAILABLE' } }, { status: 503 })
          : await cowork.fetchImpl(input, init)
      active--
      return response
    }
    const harnessed = harness(pool, { fetchImpl })
    await sealedJoomlaSite(pool)
    const responses = await Promise.all([
      contentRead(harnessed, 'owner@x.y', { describe: true }),
      contentRead(harnessed, 'owner@x.y', { describe: true })
    ])
    for (const response of responses) {
      assert.equal(response.status, 200)
      const doc = await response.json()
      assert.deepEqual(validateDescribe(doc), [])
      assert.equal(doc.protocol.cowork.capability, 'v1')
      assert.deepEqual(
        doc.types.find((entry) => entry.type === 'article'),
        {
          type: 'article',
          count: 12,
          next: { tool: 'tracy_site', action: 'content.read', params: { type: 'article' } }
        }
      )
    }
    assert.equal(maxActive, 1)
    assert.equal(cowork.asked.length, 7)
  }
)

test(
  'content.read describe: an editor seat reads it; describe mixed with a query is refused',
  opts,
  async () => {
    const { pool } = db
    const harnessed = harness(pool, { fetchImpl: contentCowork().fetchImpl })
    await sealedJoomlaSite(pool)
    // 27/09/2026: every content read is the `content` toolset, and an editor may apply text, image
    // and link slots — so the editor's describe says `apply: true`.
    const editorDescribe = await contentRead(harnessed, 'editor@x.y', { describe: true })
    assert.equal(editorDescribe.status, 200)
    const editorDoc = await editorDescribe.json()
    assert.equal(editorDoc.permissions.role, 'editor')
    assert.equal(editorDoc.permissions.apply, true)
    const mixed = await contentRead(harnessed, 'owner@x.y', { describe: 1, type: 'page' })
    assert.equal(mixed.status, 400)
    const { error } = await mixed.json()
    assert.equal(error.code, 'CONTENT_BAD_QUERY')
    assert.match(error.message, /describe/)
    assert.equal((await contentRead(harnessed, 'owner@x.y', { describe: '1' })).status, 200)
    assert.equal((await contentRead(harnessed, 'owner@x.y', { describe: 'yes' })).status, 400)
  }
)

test(
  'apply: content reads are the content toolset; an editor applies every contract slot, a viewer none (ADR 0028)',
  opts,
  async () => {
    const { pool } = db
    const sent = []
    const fetchImpl = async (_input, init) => {
      const body = JSON.parse(init.body)
      sent.push(body)
      return body.action === 'content.read' ? Response.json(JOOMLA_ENVELOPE) : Response.json({ ok: true })
    }
    const harnessed = harness(pool, { fetchImpl })
    await sealedJoomlaSite(pool)
    await seatRow(pool, 'lantern.localhost', 'viewer@x.y', 'viewer')
    await accountId(pool, 'stranger@x.y')
    const as = async (email, action, params) => {
      const res = await harnessed.send(
        'POST',
        '/api/sites/lantern.localhost/apply',
        await harnessed.cookieFor(email),
        { action, params }
      )
      return { status: res.status, body: await res.json() }
    }
    const text = { operation: 'apply', expected_revision: 'r1', changes: { 'module-430.0': 'Call us' } }
    const link = { operation: 'apply', expected_revision: 'r1', changes: { 'module-430.1': '/contact' } }
    const layout = {
      operation: 'apply',
      expected_revision: 'r1',
      changes: { 'module-430.0': 'Call us', 'module-430.layout': 'split' }
    }
    const structural = { operation: 'multilingual.apply' }
    /** role → action → expected status */
    const matrix = [
      // Reads are open to any live seat (ADR 0028, PO 08/10/2026); a stranger holds no seat at all.
      ['content.read', { type: 'page' }, { owner: 200, editor: 200, viewer: 200, stranger: 403 }],
      ['content.contract', { operation: 'inspect' }, { owner: 200, editor: 200, viewer: 200, stranger: 403 }],
      [
        'content.contract',
        { operation: 'multilingual.plan' },
        { owner: 200, editor: 200, viewer: 200, stranger: 403 }
      ],
      ['content.contract', text, { owner: 200, editor: 200, viewer: 403, stranger: 403 }],
      ['content.contract', link, { owner: 200, editor: 200, viewer: 403, stranger: 403 }],
      ['content.contract', layout, { owner: 200, editor: 200, viewer: 403, stranger: 403 }],
      ['content.contract', structural, { owner: 200, editor: 200, viewer: 403, stranger: 403 }]
    ]
    for (const [action, params, expected] of matrix) {
      for (const [who, status] of Object.entries(expected)) {
        const got = await as(`${who}@x.y`, action, structuredClone(params))
        assert.equal(
          got.status,
          status,
          `${who} ${action} ${JSON.stringify(params)}: ${JSON.stringify(got.body)}`
        )
      }
    }

    // Every owner and editor apply reached the site as sent; no viewer apply did.
    const applied = sent.filter(
      (body) => body.action === 'content.contract' && body.params.operation === 'apply'
    )
    assert.deepEqual(
      applied.map((body) => Object.keys(body.params.changes)),
      [
        ['module-430.0'], // owner text
        ['module-430.0'], // editor text
        ['module-430.1'], // owner link
        ['module-430.1'], // editor link
        ['module-430.0', 'module-430.layout'], // owner layout
        ['module-430.0', 'module-430.layout'] // editor layout
      ]
    )

    // A viewer holds no toolset: even the words of a slot are refused by role, before the site.
    const refusedText = await as('viewer@x.y', 'content.contract', text)
    assert.equal(refusedText.body.code, 'TOOLSET_NOT_GRANTED')
    assert.equal(refusedText.body.role, 'viewer')

    // The editor's read carries writable fields: the same slot it may now apply.
    const read = await as('editor@x.y', 'content.read', { type: 'page' })
    const [mapped] = read.body.contents[0].fields
    assert.equal(mapped.slotKey, 'module-430.0')
    assert.equal(mapped.writable, true)
    // The viewer reads the same field and is told it may not write it: open to read, never to write.
    const viewed = await as('viewer@x.y', 'content.read', { type: 'page' })
    const [seen] = viewed.body.contents[0].fields
    assert.equal(seen.slotKey, 'module-430.0')
    assert.equal(seen.writable, false)
  }
)

test(
  'content.read describe: a Claude Cowork plugin without v1 still gets a describe, marked unsupported',
  opts,
  async () => {
    const { pool } = db
    const harnessed = harness(pool, { fetchImpl: contentCowork({ envelope: false }).fetchImpl })
    await sealedJoomlaSite(pool)
    const response = await contentRead(harnessed, 'owner@x.y', { describe: true })
    assert.equal(response.status, 200)
    const doc = await response.json()
    assert.deepEqual(validateDescribe(doc), [])
    assert.equal(doc.protocol.cowork.capability, 'unsupported')
    assert.ok(doc.types.every((one) => one.count === null))
    assert.ok(doc.types.every((one) => one.next === null))
    // The Claude Cowork plugin said nothing, so the locales and the address are the release's and the fleet's.
    assert.deepEqual(doc.site.locales, ['en-GB', 'ru-RU'])
    assert.equal(doc.site.url, 'http://lantern.localhost:8080/')
  }
)

test('content.read describe: a site no contract seals has no slots and no provenance', opts, async () => {
  const { pool } = db
  const harnessed = harness(pool, { fetchImpl: contentCowork().fetchImpl })
  await sealedJoomlaSite(pool, { tag: null, version: null })
  const response = await contentRead(harnessed, 'owner@x.y', { describe: true })
  assert.equal(response.status, 200)
  const doc = await response.json()
  assert.deepEqual(validateDescribe(doc), [])
  assert.deepEqual(doc.blockKinds, [])
  assert.equal(doc.permissions.apply, false)
  assert.equal(doc.provenance, null)
  assert.ok(!hasCapability(doc, 'slot-write'))
})

test('content.read describe on EmDash: kinds from the template site model, reading only', opts, async () => {
  const { pool } = db
  const cowork = contentCowork({
    extra: {
      completeness: {
        scope: 'mapped-content',
        status: 'partial',
        unresolved: [{ code: 'SCALAR_PROJECTION_ONLY', message: 'fixture' }]
      }
    }
  })
  const fetchImpl = async (input, init) =>
    String(input).startsWith('http://tracy-host.test/')
      ? Response.json({ token: 'ec_pat_' + 'r'.repeat(43) })
      : cowork.fetchImpl(input, init)
  const harnessed = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
  await pool.query(
    `insert into site (site_key, label, host, platform, origin, quickstart_tag, quickstart_version)
     values ($1, $2, 'local', 'emdash', 'fleet_born', 'tracy-business/emdash-0.x', '1.4.3')`,
    ['lantern.localhost', 'lantern']
  )
  await seatRow(pool, 'lantern.localhost', 'owner@x.y', 'owner')
  const response = await contentRead(harnessed, 'owner@x.y', { describe: true })
  assert.equal(response.status, 200)
  const doc = await response.json()
  assert.deepEqual(validateDescribe(doc), [])
  assert.equal(doc.permissions.apply, false)
  assert.deepEqual(doc.protocol.cowork, { kind: 'emdash', capability: 'v1' })
  assert.deepEqual(
    doc.types.map((one) => one.type),
    ['shared', 'page', 'service', 'project', 'article', 'generic']
  )
  assert.ok(doc.blockKinds.some((kind) => kind.kind === 'home'))
  assert.ok(doc.blockKinds.every((kind) => kind.fields.every((field) => field.writable === null)))
  assert.equal(doc.presentation.state, 'unlocked')
  assert.ok(hasCapability(doc, 'scalars'))
  assert.ok(!hasCapability(doc, 'slot-write'))
  assert.equal(doc.provenance.contractId, null)
})

test(
  'content.read describe on EmDash: a reader that predates maxBytes is still described as v1',
  opts,
  async () => {
    const { pool } = db
    // Measured 28/09/2026 on the stand: r1e1734's reader (EmDash image 1.4.3 built before #418)
    // refuses any maxBytes with 400 CONTENT_BAD_QUERY and answers the same listing without it,
    // so describe said "unsupported" for a reader that works; r2e2308 (a later 1.4.3) said "v1".
    const cowork = contentCowork()
    const probes = []
    const fetchImpl = async (input, init) => {
      if (String(input).startsWith('http://tracy-host.test/'))
        return Response.json({ token: 'ec_pat_' + 'r'.repeat(43) })
      const sent = JSON.parse(init.body)
      probes.push(sent.params)
      if (sent.params.maxBytes !== undefined)
        return Response.json(
          { error: { code: 'CONTENT_BAD_QUERY', message: 'Content request could not be completed.' } },
          { status: 400 }
        )
      return cowork.fetchImpl(input, init)
    }
    const harnessed = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
    await pool.query(
      `insert into site (site_key, label, host, platform, origin, quickstart_tag, quickstart_version)
       values ($1, $2, 'local', 'emdash', 'fleet_born', 'tracy-business/emdash-0.x', '1.4.3')`,
      ['lantern.localhost', 'lantern']
    )
    await seatRow(pool, 'lantern.localhost', 'owner@x.y', 'owner')
    const doc = await (await contentRead(harnessed, 'owner@x.y', { describe: true })).json()
    assert.deepEqual(validateDescribe(doc), [])
    assert.deepEqual(doc.protocol.cowork, { kind: 'emdash', capability: 'v1' })
    assert.deepEqual(doc.site.locales, ['en-GB', 'ru-RU'])
    assert.equal(doc.types.find((one) => one.type === 'page')?.count, 7)
    // It takes no budget, so describe does not say it does.
    assert.ok(!hasCapability(doc, 'budget'))
    // One refused probe, then every read without the budget the reader refuses.
    assert.equal(probes.filter((params) => params.maxBytes !== undefined).length, 1)
  }
)

test(
  'content.read: the envelope carries writable, constraints and next from the contract',
  opts,
  async () => {
    const { pool } = db
    const harnessed = harness(pool, { fetchImpl: async () => Response.json(JOOMLA_ENVELOPE) })
    await sealedJoomlaSite(pool)
    const read = async () => (await contentRead(harnessed, 'owner@x.y', { type: 'page' })).json()
    const out = await read()
    assert.deepEqual(validateContent(out), [])
    const [mapped] = out.contents[0].fields
    assert.equal(mapped.slotKey, 'module-430.0')
    assert.equal(mapped.writable, true)
    assert.equal(mapped.constraints.maxCharacters, 50)
    assert.deepEqual(mapped.next, {
      tool: 'tracy_site',
      action: 'content.contract',
      operation: 'apply',
      changes: { 'module-430.0': null }
    })
    const caption = out.contents[0].blocks.flatMap((block) => block.items).flatMap((item) => item.fields)[0]
    assert.equal(caption.writable, null)
    assert.equal(out.contents[0].writable, true)
    assert.deepEqual(out.protocol.cowork, { kind: 'joomla', capability: 'v1' })

    // The same read on a site no contract seals: nothing is writable through the contract.
    await pool.query(`update site set quickstart_tag = null, quickstart_version = null`)
    const unsealed = await read()
    assert.deepEqual(validateContent(unsealed), [])
    assert.equal(unsealed.contents[0].writable, false)
    assert.equal(unsealed.contents[0].fields[0].writable, false)
    assert.equal(unsealed.contents[0].fields[0].next, null)
  }
)

test(
  'content.contract apply: expected_content_revisions reaches the Claude Cowork plugin as sent, and its errors[] and contentRevisions come back whole',
  opts,
  async () => {
    const { pool } = db
    const asked = []
    const refusal = {
      ok: false,
      error: 'contract_failed',
      message: 'Content changed; inspect again',
      errors: [
        {
          code: 'REVISION_STALE',
          message: 'content_0123 changed',
          field: { slotKey: 'module-430.0', contentId: 'content_0123' },
          severity: 'recoverable',
          current: 'rev-9'
        }
      ]
    }
    const receipt = { ok: true, ids: [430], contentRevisions: { content_0123: 'rev-2' } }
    const fetchImpl = async (_input, init) => {
      const sent = JSON.parse(init.body)
      asked.push(sent)
      return Response.json(asked.length === 1 ? refusal : receipt)
    }
    const harnessed = harness(pool, { fetchImpl })
    await sealedJoomlaSite(pool)
    const cookie = await harnessed.cookieFor('owner@x.y')
    const params = {
      operation: 'apply',
      apply_id: 'contract-1',
      request_id: 'r-0123456789abcdef',
      changes: { 'module-430.0': 'New words' },
      expected_content_revisions: { content_0123: 'rev-1' }
    }
    const apply = () =>
      harnessed.send('POST', '/api/sites/lantern.localhost/apply', cookie, {
        action: 'content.contract',
        params
      })
    const refused = await (await apply()).json()
    assert.equal(asked[0].action, 'content.contract')
    assert.deepEqual(asked[0].params, params, 'the map is passed through untouched')
    assert.deepEqual(refused, refusal, 'the refusal comes back as the Claude Cowork plugin said it')
    const accepted = await (await apply()).json()
    assert.deepEqual(accepted.contentRevisions, { content_0123: 'rev-2' })
  }
)

test('content.read describe on EmDash with no reader: described from the template alone', opts, async () => {
  const { pool } = db
  const siteCalls = []
  const fetchImpl = async (input) => {
    if (String(input).startsWith('http://tracy-host.test/'))
      return Response.json({ code: 'NO_CONTENT_API' }, { status: 404 })
    siteCalls.push(String(input))
    return Response.json({})
  }
  const harnessed = harness(pool, { fetchImpl, envOverrides: { HOST_NAME: 'local' } })
  await pool.query(
    `insert into site (site_key, label, host, platform, origin, quickstart_tag, quickstart_version)
     values ($1, $2, 'local', 'emdash', 'fleet_born', 'tracy-business/emdash-0.x', '1.4.3')`,
    ['lantern.localhost', 'lantern']
  )
  await seatRow(pool, 'lantern.localhost', 'owner@x.y', 'owner')
  const response = await contentRead(harnessed, 'owner@x.y', { describe: true })
  assert.equal(response.status, 200)
  const doc = await response.json()
  assert.deepEqual(validateDescribe(doc), [])
  assert.deepEqual(doc.protocol.cowork, { kind: 'emdash', capability: 'unsupported' })
  assert.equal(doc.site.defaultLocale, 'en')
  assert.ok(doc.blockKinds.length > 0)
  assert.deepEqual(siteCalls, [])
})

/** One listing row as a v1 Claude Cowork plugin sends it: a summary, no blocks. */
function summaryRow(id, type, title, rowUrl, locale = 'en-GB') {
  return {
    id,
    type,
    title,
    slug: null,
    url: rowUrl,
    locale,
    translationGroupId: null,
    summary: null,
    publishedAt: null,
    createdAt: null,
    updatedAt: null,
    revision: `r-${id}`,
    detailState: 'summary',
    links: { self: `https://lantern.example/content/${id}` },
    publication: { status: 'published', valueSource: 'published', scheduledAt: null }
  }
}

/** A fake Claude Cowork plugin whose listing spans two pages: rows 1–3, then row 4 behind a cursor. */
function pagedCowork() {
  const asked = []
  const rows = [
    summaryRow('c-home', 'page', 'Home', 'https://lantern.example/'),
    summaryRow('c-about', 'page', 'About us', 'https://lantern.example/about-us'),
    summaryRow('c-header', 'shared', 'Header', null),
    summaryRow('c-post', 'article', 'Opening day', 'https://lantern.example/ru/blog/opening-day', 'ru-RU')
  ]
  const fetchImpl = async (_input, init) => {
    const sent = JSON.parse(init.body)
    asked.push(sent.params)
    const second = sent.params.cursor === 'page-2'
    return Response.json({
      ...JOOMLA_ENVELOPE,
      site: {
        id: 's-lantern',
        name: 'Lantern',
        url: 'https://lantern.example',
        defaultLocale: 'en-GB',
        locales: ['en-GB', 'ru-RU']
      },
      pagination: { limit: 100, nextCursor: second ? null : 'page-2', total: 4 },
      contents: second ? rows.slice(3) : rows.slice(0, 3)
    })
  }
  return { asked, fetchImpl }
}

test(
  'content.read view=pages: every row with an address, across the listing, in one answer',
  opts,
  async () => {
    const { pool } = db
    const cowork = pagedCowork()
    const harnessed = harness(pool, { fetchImpl: cowork.fetchImpl })
    await sealedJoomlaSite(pool)

    const response = await contentRead(harnessed, 'owner@x.y', { view: 'pages' })
    assert.equal(response.status, 200, await response.clone().text())
    const doc = await response.json()
    assert.equal(doc.schemaVersion, 'tracy-content-pages/v1')
    assert.deepEqual(validateContent(doc), [])
    assert.deepEqual(
      doc.pages.map((page) => [page.id, page.type, page.title, page.path, page.locale]),
      [
        ['c-home', 'page', 'Home', '/', 'en-GB'],
        ['c-about', 'page', 'About us', '/about-us', 'en-GB'],
        ['c-post', 'article', 'Opening day', '/ru/blog/opening-day', 'ru-RU']
      ]
    )
    assert.equal(doc.truncated, false)
    // The Claude Cowork plugin saw a plain listing it already knows, then its cursor WITH the same filters: an
    // EmDash cursor is signed over them and a bare one is refused (dev gf1410, 26/09/2026).
    assert.deepEqual(cowork.asked, [{ limit: 100 }, { limit: 100, cursor: 'page-2' }])
  }
)

test(
  'content.read view=pages with url: the page a pasted link shows, however the customer copied it',
  opts,
  async () => {
    const { pool } = db
    const cowork = pagedCowork()
    const harnessed = harness(pool, { fetchImpl: cowork.fetchImpl })
    await sealedJoomlaSite(pool)

    for (const pasted of [
      'https://lantern.example/about-us',
      'https://lantern.example/about-us/?utm_source=mail#team',
      'lantern.example/about-us',
      '/about-us'
    ]) {
      const response = await contentRead(harnessed, 'owner@x.y', { view: 'pages', url: pasted })
      assert.equal(response.status, 200, `${pasted}: ${await response.clone().text()}`)
      const doc = await response.json()
      assert.deepEqual(
        doc.pages.map((page) => page.id),
        ['c-about'],
        pasted
      )
    }
    const none = await (await contentRead(harnessed, 'owner@x.y', { view: 'pages', url: '/nowhere' })).json()
    assert.deepEqual(none.pages, [])
  }
)

/**
 * A fake Claude Cowork plugin with `count` pages spread over `locales`, 100 rows per listing page
 * behind a cursor, each row a long title so that the whole list is larger than one answer.
 */
function wideCowork(count, { locales = ['en-GB', 'ru-RU'], perPage = 100, titleBytes = 400 } = {}) {
  const asked = []
  const all = Array.from({ length: count }, (_, at) => {
    const locale = locales[at % locales.length]
    return summaryRow(
      `c-${at}`,
      'page',
      `Page ${at} ${'x'.repeat(titleBytes)}`,
      `https://lantern.example/${locale}/page-${at}`,
      locale
    )
  })
  const fetchImpl = async (_input, init) => {
    const sent = JSON.parse(init.body)
    asked.push(sent.params)
    const rows = all.filter((row) => sent.params.locale === undefined || row.locale === sent.params.locale)
    const from = sent.params.cursor ? Number(sent.params.cursor) : 0
    const next = from + perPage < rows.length ? String(from + perPage) : null
    return Response.json({
      ...JOOMLA_ENVELOPE,
      site: {
        id: 's-lantern',
        name: 'Lantern',
        url: 'https://lantern.example',
        defaultLocale: locales[0],
        locales
      },
      pagination: { limit: 100, nextCursor: next, total: rows.length },
      contents: rows.slice(from, from + perPage).map((row) => ({ ...row }))
    })
  }
  return { asked, all, fetchImpl }
}

test(
  'content.read view=pages larger than one answer: cut at whole rows within the budget, with the narrower call to make',
  opts,
  async () => {
    const { pool } = db
    // Measured 28/09 on the stand: a 40-language EmDash site answered 527–578 KB (1,568–1,720 rows).
    const cowork = wideCowork(900)
    const harnessed = harness(pool, { fetchImpl: cowork.fetchImpl })
    await sealedJoomlaSite(pool)

    const response = await contentRead(harnessed, 'owner@x.y', { view: 'pages' })
    assert.equal(response.status, 200, await response.clone().text())
    const text = await response.text()
    assert.ok(Buffer.byteLength(text, 'utf8') <= 256 * 1024, `${Buffer.byteLength(text, 'utf8')} bytes`)
    const doc = JSON.parse(text)
    // The shared validator, budget included, is the judge.
    assert.deepEqual(validateContent(doc), [])
    assert.equal(doc.truncated, true)
    assert.ok(doc.pages.length > 100 && doc.pages.length < 900, `${doc.pages.length} rows`)
    // Whole rows, in listing order: the first rows of the walk, none half-written.
    assert.deepEqual(
      doc.pages.map((page) => page.id),
      cowork.all.slice(0, doc.pages.length).map((row) => row.id)
    )
    // The call that fits: one language at a time, starting with the site's default.
    assert.deepEqual(doc.next?.params, { view: 'pages', locale: 'en-GB' })
    assert.equal(doc.next?.action, 'content.read')
    assert.match(doc.next?.why ?? '', /locale/)

    // One language still too large: the next call lists one type at a time, in that language.
    const narrow = await (
      await contentRead(harnessed, 'owner@x.y', { view: 'pages', locale: 'en-GB' })
    ).json()
    assert.deepEqual(validateContent(narrow), [])
    assert.equal(narrow.truncated, true)
    assert.deepEqual(narrow.next?.params, { type: 'page', locale: 'en-GB' })

    // A list that fits is not cut and names no next call.
    const small = harness(pool, { fetchImpl: wideCowork(20).fetchImpl })
    const whole = await (await contentRead(small, 'owner@x.y', { view: 'pages' })).json()
    assert.equal(whole.truncated, false)
    assert.equal(whole.pages.length, 20)
    assert.equal(whole.next, undefined)
  }
)

test(
  'content.read fields: only the keys asked for come back, with the ids that address them',
  opts,
  async () => {
    const { pool } = db
    const row = {
      ...JOOMLA_ENVELOPE.contents[0],
      title: 'Home',
      bodyHtml: '<p>' + 'long body '.repeat(200) + '</p>',
      blocks: [
        {
          id: 'b-hero',
          key: 'hero',
          role: null,
          position: 0,
          sharedContentId: null,
          visibility: 'visible',
          fields: [
            {
              key: 'heading',
              type: 'text',
              value: 'Built to last',
              slotKey: 'home.hero.heading',
              semanticKey: null
            },
            {
              key: 'lead',
              type: 'text',
              value: 'Forty years of steel',
              slotKey: 'home.hero.lead',
              semanticKey: null
            }
          ],
          items: []
        }
      ]
    }
    const asked = []
    const fetchImpl = async (_input, init) => {
      asked.push(JSON.parse(init.body).params)
      return Response.json({ ...JOOMLA_ENVELOPE, contents: [row] })
    }
    const harnessed = harness(pool, { fetchImpl })
    await sealedJoomlaSite(pool)

    const response = await contentRead(harnessed, 'owner@x.y', {
      id: row.id,
      fields: 'title, blocks.fields.value, blocks.fields.slotKey'
    })
    assert.equal(response.status, 200, await response.clone().text())
    const envelope = await response.json()
    assert.deepEqual(envelope.projection, ['title', 'blocks.fields.value', 'blocks.fields.slotKey'])
    assert.deepEqual(validateContent(envelope), [])
    assert.deepEqual(envelope.contents, [
      {
        id: row.id,
        title: 'Home',
        blocks: [
          {
            id: 'b-hero',
            fields: [
              { key: 'heading', value: 'Built to last', slotKey: 'home.hero.heading' },
              { key: 'lead', value: 'Forty years of steel', slotKey: 'home.hero.lead' }
            ]
          }
        ]
      }
    ])
    // The Claude Cowork plugin read what it always reads; the projection is the relay's.
    assert.deepEqual(asked, [{ id: row.id }])

    // A key the content map does not have is named, not ignored.
    const refused = await contentRead(harnessed, 'owner@x.y', { id: row.id, fields: ['title', 'heading'] })
    assert.equal(refused.status, 400)
    assert.match((await refused.json()).error.message, /"heading"/)
  }
)

/** A Claude Cowork plugin whose listing is `rows`, which the test may change between reads. */
function mutableCowork(rows) {
  const asked = []
  const fetchImpl = async (_input, init) => {
    asked.push(JSON.parse(init.body).params)
    return Response.json({
      ...JOOMLA_ENVELOPE,
      site: {
        id: 's-lantern',
        name: 'Lantern',
        url: 'https://lantern.example',
        defaultLocale: 'en-GB',
        locales: ['en-GB', 'ru-RU']
      },
      pagination: { limit: 100, nextCursor: null, total: rows.length },
      contents: rows.map((row) => ({ ...row }))
    })
  }
  return { asked, fetchImpl }
}

test(
  'content.read ifVersion: an unchanged read answers notModified, a changed one answers in full',
  opts,
  async () => {
    const { pool } = db
    const rows = [
      summaryRow('c-home', 'page', 'Home', 'https://lantern.example/'),
      summaryRow('c-about', 'page', 'About us', 'https://lantern.example/about-us')
    ]
    const cowork = mutableCowork(rows)
    const harnessed = harness(pool, { fetchImpl: cowork.fetchImpl })
    await sealedJoomlaSite(pool)

    const first = await (await contentRead(harnessed, 'owner@x.y', { type: 'page' })).json()
    assert.match(first.version, /^cv1\.[a-f0-9]{32}$/)
    assert.deepEqual(validateContent(first), [])

    const same = await contentRead(harnessed, 'owner@x.y', { type: 'page', ifVersion: first.version })
    assert.equal(same.status, 200)
    const body = await same.json()
    assert.deepEqual(body, { schemaVersion: 'tracy-content/v1', notModified: true, version: first.version })
    assert.deepEqual(validateContent(body), [])
    // The Claude Cowork plugin is still asked (the relay holds no copy of the site); it never sees ifVersion.
    assert.deepEqual(cowork.asked.at(-1), { type: 'page' })

    rows[1].revision = 'r-about-2'
    const changed = await (
      await contentRead(harnessed, 'owner@x.y', { type: 'page', ifVersion: first.version })
    ).json()
    assert.equal(changed.notModified, undefined)
    assert.notEqual(changed.version, first.version)
    assert.equal(changed.contents.length, 2)

    // The same records asked another way are another version: a projection is part of what was read.
    const projected = await (
      await contentRead(harnessed, 'owner@x.y', { type: 'page', fields: 'title' })
    ).json()
    assert.notEqual(projected.version, changed.version)
  }
)

test('content.read changedSince: only what moved since a full walk, and what is gone', opts, async () => {
  const { pool } = db
  const rows = [
    summaryRow('c-home', 'page', 'Home', 'https://lantern.example/'),
    summaryRow('c-about', 'page', 'About us', 'https://lantern.example/about-us'),
    summaryRow('c-header', 'shared', 'Header', null)
  ]
  const cowork = mutableCowork(rows)
  const harnessed = harness(pool, { fetchImpl: cowork.fetchImpl })
  await sealedJoomlaSite(pool)

  const walk = await (await contentRead(harnessed, 'owner@x.y', { view: 'pages' })).json()
  assert.match(walk.version, /^cv1\./)
  // The answer says how to ask later (dev chat b4c-j, 27/09: the model held the version and still
  // spent 12 calls before it thought of changedSince).
  assert.deepEqual(walk.later?.params, { changedSince: walk.version })
  assert.match(walk.later?.why ?? '', /changed/)
  // view:"pages" beside changedSince is what a model sends (dev chat b4b-j, 26/09): the same question.
  const both = await contentRead(harnessed, 'owner@x.y', { view: 'pages', changedSince: walk.version })
  assert.equal(both.status, 200, await both.clone().text())
  assert.equal((await both.json()).schemaVersion, 'tracy-content-changes/v1')

  rows[1] = { ...rows[1], title: 'About', revision: 'r-about-2' }
  rows.push(summaryRow('c-team', 'page', 'Team', 'https://lantern.example/team'))
  rows.splice(0, 1)
  const response = await contentRead(harnessed, 'owner@x.y', { changedSince: walk.version })
  assert.equal(response.status, 200, await response.clone().text())
  const changes = await response.json()
  assert.deepEqual(validateContent(changes), [])
  assert.equal(changes.schemaVersion, 'tracy-content-changes/v1')
  assert.equal(changes.since, walk.version)
  assert.deepEqual(
    changes.changed.map((row) => [row.id, row.title, row.revision]),
    [
      ['c-about', 'About', 'r-about-2'],
      ['c-team', 'Team', 'r-c-team']
    ]
  )
  assert.deepEqual(changes.removed, ['c-home'])

  // Asked again from the new version: nothing moved.
  const quiet = await (await contentRead(harnessed, 'owner@x.y', { changedSince: changes.version })).json()
  assert.deepEqual([quiet.changed, quiet.removed], [[], []])

  // A time is not a version (26/09, dev chat b4-j: the agent sent "2026-09-26T14:00:00Z"): the
  // refusal says what a version is and the one read that gives one.
  const timed = await contentRead(harnessed, 'owner@x.y', { changedSince: '2026-09-26T14:00:00Z' })
  assert.equal(timed.status, 400)
  assert.match((await timed.json()).error.message, /not a time.*\{view:"pages"\}.*version/)

  // A version this relay does not hold (a restart, another seat, too old) is refused by name.
  const unknown = await contentRead(harnessed, 'owner@x.y', { changedSince: `cv1.${'0'.repeat(32)}` })
  assert.equal(unknown.status, 409)
  const refusal = await unknown.json()
  assert.equal(refusal.error.code, 'CONTENT_SNAPSHOT_EXPIRED')
  assert.match(refusal.error.message, /view/)
})

test(
  'content.read changedSince against a walk cut short: its version answers, over the rows that walk saw',
  opts,
  async () => {
    const { pool } = db
    // A reader that pages by its own byte budget answers a few rows per call, so the walk stops at
    // PAGES_MAX_CALLS (the stand's 40-language EmDash sites, 28/09/2026). Before, the answer still
    // carried a version, and changedSince with it was refused CONTENT_SNAPSHOT_EXPIRED.
    const cowork = wideCowork(150, { perPage: 5, titleBytes: 10 })
    const harnessed = harness(pool, { fetchImpl: cowork.fetchImpl })
    await sealedJoomlaSite(pool)

    const walk = await (await contentRead(harnessed, 'owner@x.y', { view: 'pages' })).json()
    assert.deepEqual(validateContent(walk), [])
    assert.equal(walk.truncated, true)
    assert.equal(walk.pages.length, 100)
    // Cut short, it still says how to read the rest, and how to ask later.
    assert.deepEqual(walk.next?.params, { view: 'pages', locale: 'en-GB' })
    assert.deepEqual(walk.later?.params, { changedSince: walk.version })

    // Nothing moved: an answer, not a refusal, and nothing is called gone that was not reached.
    const quiet = await contentRead(harnessed, 'owner@x.y', { changedSince: walk.version })
    assert.equal(quiet.status, 200, await quiet.clone().text())
    const none = await quiet.json()
    assert.deepEqual(validateContent(none), [])
    assert.deepEqual([none.changed, none.removed, none.truncated], [[], [], true])

    // A row that walk saw moves: it is the one change.
    cowork.all[3] = { ...cowork.all[3], title: 'Moved', revision: 'r-moved' }
    const moved = await (await contentRead(harnessed, 'owner@x.y', { changedSince: walk.version })).json()
    assert.deepEqual(
      moved.changed.map((row) => [row.id, row.revision]),
      [['c-3', 'r-moved']]
    )
    assert.deepEqual(moved.removed, [])

    // The site shrinks so a walk reaches the end: what the first walk saw and is gone is removed,
    // and nothing is left unreached.
    cowork.all.splice(40)
    const whole = await (await contentRead(harnessed, 'owner@x.y', { changedSince: walk.version })).json()
    assert.deepEqual(validateContent(whole), [])
    assert.equal(whole.truncated, false)
    assert.deepEqual(
      whole.removed,
      Array.from({ length: 60 }, (_, at) => `c-${at + 40}`)
    )
  }
)

test(
  "content.read native: page rows, change rows and a fields projection name each content's CMS records",
  opts,
  async () => {
    const { pool } = db
    // Lee 27/09: content.read carries the CMS's own ids, so the agent writes without an inspect
    // or a content.list first (dev chat b4c-j went content.list → content.get only to learn them).
    const withNative = (row, native) => ({ ...row, native })
    const rows = [
      withNative(summaryRow('c-home', 'page', 'Home', 'https://lantern.example/'), [
        { kind: 'menuItem', id: 101 },
        { kind: 'article', id: 7 }
      ]),
      withNative(summaryRow('c-about', 'page', 'About us', 'https://lantern.example/about-us'), [
        { kind: 'menuItem', id: 102 }
      ]),
      // A Claude Cowork plugin older than native: the row simply has none, and nothing is invented for it.
      summaryRow('c-team', 'page', 'Team', 'https://lantern.example/team')
    ]
    const cowork = mutableCowork(rows)
    const harnessed = harness(pool, { fetchImpl: cowork.fetchImpl })
    await sealedJoomlaSite(pool)

    const walk = await (await contentRead(harnessed, 'owner@x.y', { view: 'pages' })).json()
    assert.deepEqual(validateContent(walk), [])
    assert.deepEqual(
      walk.pages.map((row) => [row.id, row.native]),
      [
        [
          'c-home',
          [
            { kind: 'menuItem', id: 101 },
            { kind: 'article', id: 7 }
          ]
        ],
        ['c-about', [{ kind: 'menuItem', id: 102 }]],
        ['c-team', undefined]
      ]
    )

    rows[1] = { ...rows[1], title: 'About', revision: 'r-about-2' }
    const changes = await (await contentRead(harnessed, 'owner@x.y', { changedSince: walk.version })).json()
    assert.deepEqual(validateContent(changes), [])
    assert.deepEqual(
      changes.changed.map((row) => [row.id, row.native]),
      [['c-about', [{ kind: 'menuItem', id: 102 }]]]
    )

    // `fields` keeps native like the id: both are how a kept content is addressed.
    const projected = await (
      await contentRead(harnessed, 'owner@x.y', { type: 'page', fields: 'title' })
    ).json()
    assert.deepEqual(validateContent(projected), [])
    assert.deepEqual(projected.contents[0], {
      id: 'c-home',
      title: 'Home',
      native: [
        { kind: 'menuItem', id: 101 },
        { kind: 'article', id: 7 }
      ]
    })
  }
)

test(
  'content.read view=pages with url walks the language the link names, and the whole site only when it finds nothing',
  opts,
  async () => {
    const { pool } = db
    const cowork = pagedCowork()
    const harnessed = harness(pool, { fetchImpl: cowork.fetchImpl })
    await sealedJoomlaSite(pool)

    const found = await (
      await contentRead(harnessed, 'owner@x.y', {
        view: 'pages',
        url: 'https://lantern.example/ru/blog/opening-day'
      })
    ).json()
    assert.deepEqual(
      found.pages.map((page) => page.id),
      ['c-post']
    )
    // The site's OWN languages decide (dev gf1410, 26/09: the template listed 2, the site served
    // 40): one small read for them, then the named language only.
    assert.deepEqual(cowork.asked[0], { limit: 1 })
    assert.ok(
      cowork.asked.length > 1 && cowork.asked.slice(1).every((params) => params.locale === 'ru-RU'),
      JSON.stringify(cowork.asked)
    )

    // A link in a language the walk of that language cannot place: the whole site is walked.
    cowork.asked.length = 0
    const elsewhere = await (
      await contentRead(harnessed, 'owner@x.y', { view: 'pages', url: '/ru/nowhere' })
    ).json()
    assert.deepEqual(elsewhere.pages, [])
    assert.ok(cowork.asked.some((params) => params.locale === 'ru-RU'))
    assert.ok(cowork.asked.some((params) => params.locale === undefined))
  }
)

test(
  "content.read view=pages: a walk of every language names each page's twins, one language's walk names none",
  opts,
  async () => {
    const { pool } = db
    const inGroup = (row, group) => ({ ...row, translationGroupId: group })
    const rows = [
      inGroup(summaryRow('c-about', 'page', 'About us', 'https://lantern.example/about-us'), 'g-about'),
      inGroup(
        summaryRow('c-about-ru', 'page', 'О компании', 'https://lantern.example/ru/o-kompanii', 'ru-RU'),
        'g-about'
      ),
      summaryRow('c-team', 'page', 'Team', 'https://lantern.example/team')
    ]
    const cowork = mutableCowork(rows)
    const harnessed = harness(pool, { fetchImpl: cowork.fetchImpl })
    await sealedJoomlaSite(pool)

    const every = await (await contentRead(harnessed, 'owner@x.y', { view: 'pages' })).json()
    assert.deepEqual(validateContent(every), [])
    assert.deepEqual(
      every.pages.map((row) => [row.id, row.alternates]),
      [
        ['c-about', [{ locale: 'ru-RU', id: 'c-about-ru' }]],
        ['c-about-ru', [{ locale: 'en-GB', id: 'c-about' }]],
        ['c-team', undefined]
      ]
    )
    // Filtered to one language, the walk cannot see a twin: none is named, not an empty list.
    const english = await (
      await contentRead(harnessed, 'owner@x.y', { view: 'pages', locale: 'en-GB' })
    ).json()
    assert.deepEqual(validateContent(english), [])
    assert.ok(english.pages.every((row) => row.alternates === undefined))
  }
)

test('POST /apply/{action} is the same door as POST /apply {action, params}', opts, async () => {
  // Each action gets its own address so the API reference can give it its own page (28/09/2026);
  // behind it there is still one door: one seat check, one toolset gate, one call to the site.
  const { pool } = db
  const rows = [summaryRow('c-home', 'page', 'Home', 'https://lantern.example/')]
  const cowork = mutableCowork(rows)
  const harnessed = harness(pool, { fetchImpl: cowork.fetchImpl })
  await sealedJoomlaSite(pool)
  const cookie = await harnessed.cookieFor('owner@x.y')
  const viaBody = await (
    await harnessed.send('POST', '/api/sites/lantern.localhost/apply', cookie, {
      action: 'content.read',
      params: { view: 'pages' }
    })
  ).json()
  const viaPath = await harnessed.send('POST', '/api/sites/lantern.localhost/apply/content.read', cookie, {
    view: 'pages'
  })
  assert.equal(viaPath.status, 200, await viaPath.clone().text())
  assert.deepEqual((await viaPath.json()).pages, viaBody.pages)
  // The door's own refusals come through unchanged.
  const unknown = await harnessed.send('POST', '/api/sites/lantern.localhost/apply/no.such', cookie, {})
  assert.equal(unknown.status, 400)
  assert.equal((await unknown.json()).code, 'ACTION_NOT_ALLOWED')
  const signedOut = await harnessed.send('POST', '/api/sites/lantern.localhost/apply/content.read', null, {})
  assert.equal(signedOut.status, 401)
  // The body is the params; naming a different action in it is refused, not silently ignored.
  const mixed = await harnessed.send('POST', '/api/sites/lantern.localhost/apply/content.read', cookie, {
    action: 'content.update'
  })
  assert.equal(mixed.status, 400)
  assert.equal((await mixed.json()).code, 'INVALID_REQUEST')
})

test(
  'content.read ids: several contents in one read, with maxBytes only, refused by name otherwise',
  opts,
  async () => {
    // Claude Cowork plugin 0.18.3 / 0.14.3 read `ids` (1–100 content ids, beside maxBytes only); the
    // relay refused it as an unknown parameter until 28/09/2026.
    const { pool } = db
    const cowork = mutableCowork([summaryRow('c-home', 'page', 'Home', 'https://lantern.example/')])
    const harnessed = harness(pool, { fetchImpl: cowork.fetchImpl })
    await sealedJoomlaSite(pool)
    const ok = await contentRead(harnessed, 'owner@x.y', { ids: ['c-home', 'c-about'], maxBytes: 65536 })
    assert.equal(ok.status, 200, await ok.clone().text())
    for (const [params, pattern] of [
      [{ ids: ['c-home'], type: 'page' }, /ids is read with maxBytes only/],
      [{ ids: [] }, /ids must list 1 to 100 content ids/],
      [{ ids: Array.from({ length: 101 }, (_, i) => `c-${i}`) }, /ids must list 1 to 100 content ids/],
      [{ ids: ['c-home', 'c-home'] }, /ids must not repeat an id/]
    ]) {
      const refused = await contentRead(harnessed, 'owner@x.y', params)
      assert.equal(refused.status, 400)
      const body = await refused.json()
      assert.equal(body.error.code, 'CONTENT_BAD_QUERY')
      assert.match(body.error.message, pattern)
    }
  }
)

// ── Seat keys on the api host (tasks/todo-api-public.md S1) ──────────────────────────────────────
// `Authorization: Bearer trk_…` is a third principal the Apply door accepts ONLY when `isApiHost`
// says so. It names one account and one site; the seat's toolsets are intersected with the key's
// scopes on every call; the lease is keyed by the key, not by a header the caller chose.

const PEPPER = 'p'.repeat(32)

/** `http://api.test` is the api host, `http://tracy.test` (the `send` helper) the cowork host. */
function apiHarness(pool, { fetchImpl, envOverrides } = {}) {
  return harness(pool, {
    fetchImpl,
    envOverrides: { API_KEY_PEPPER: PEPPER, ...envOverrides },
    isApiHost: (c) => new URL(c.req.url).host === 'api.test'
  })
}

async function keyFor(pool, email, siteKey, scopes, extra = {}) {
  return mintKey({
    pool,
    accountId: await accountId(pool, email),
    siteKey,
    label: 'test',
    scopes,
    pepper: PEPPER,
    ...extra
  })
}

/** An Apply as a program holding a key makes it: no cookie, no actor, a Bearer. */
function applyWithKey(app, key, extraHeaders = {}) {
  return (siteKey, body) =>
    app.fetch(
      new Request(`http://api.test/api/sites/${siteKey}/apply`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', ...extraHeaders },
        body: JSON.stringify(body)
      })
    )
}

const ARTICLE = { action: 'content.update', params: { kind: 'article', id: 1, fields: { title: 'x' } } }

test('a seat key cannot send content.renderedWords: only the agent host may (24/10/2026)', opts, async () => {
  const { pool } = db
  const network = fakeNetwork()
  const { app } = apiHarness(pool, network)
  await siteWithComponent(pool)
  const { key } = await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['content', 'code', 'site'])
  const res = await applyWithKey(app, key)('lantern.localhost', {
    action: 'content.renderedWords',
    params: { operation: 'apply', proof: 'p', expected_revision: 1, rules: [], apply_id: 'a-1' }
  })
  assert.equal(res.status, 403)
  assert.equal((await res.json()).code, 'ACTION_AGENT_ONLY')
  assert.equal(network.calls.length, 0)
  // An apply the agent made that way is still the key's to undo: apply.revert is an ordinary action.
  const reverted = await applyWithKey(app, key)('lantern.localhost', {
    action: 'apply.revert',
    params: { apply_id: 'rw-1' }
  })
  assert.equal(reverted.status, 200)
  assert.deepEqual(JSON.parse(network.calls[0].init.body).params, { apply_id: 'rw-1' })
})
const MODULE = { action: 'content.update', params: { kind: 'module', id: 1, fields: { title: 'x' } } }

test(
  'api host: a key writes its own site, is refused on another, and never exceeds its scopes — owner included',
  opts,
  async () => {
    const { pool } = db
    const { calls, fetchImpl } = fakeNetwork({ answer: { ok: true, changed: 1 } })
    const { app, send, cookieFor } = apiHarness(pool, { fetchImpl })
    await siteWithComponent(pool)
    await pool.query('insert into site (site_key, label, host) values ($1, $2, $3)', [
      'moon.localhost',
      'moon',
      'local'
    ])
    await seatRow(pool, 'moon.localhost', 'owner@x.y', 'owner')
    await writeComponent(
      pool,
      'moon.localhost',
      { endpoint: 'https://moon.example/cowork', token: 'y'.repeat(20) },
      'owner@x.y'
    )
    const key = await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['content'])
    const apply = applyWithKey(app, key.key)

    const own = await apply('lantern.localhost', ARTICLE)
    assert.equal(own.status, 200)
    assert.deepEqual(await own.json(), { ok: true, changed: 1 })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://lantern.example/cowork')

    // The key names ONE site; the owner's seat on moon does not travel with it.
    const other = await apply('moon.localhost', ARTICLE)
    assert.equal(other.status, 403)
    assert.deepEqual(await other.json(), { code: 'SEAT_NOT_AUTHORIZED' })

    // An owner holds every toolset; an owner's `content` key holds `content`.
    for (const body of [MODULE, { action: 'extension.install', params: {} }]) {
      const refused = await apply('lantern.localhost', body)
      assert.equal(refused.status, 403, body.action)
      assert.deepEqual(await refused.json(), {
        code: 'TOOLSET_NOT_GRANTED',
        toolset: 'code',
        role: 'owner'
      })
    }
    // `read`-rule actions need a live seat and a live key, no toolset: any seat may read.
    assert.equal((await apply('lantern.localhost', { action: 'info', params: {} })).status, 200)
    assert.equal(calls.length, 2, 'the two refusals never reached the site')

    const { rows } = await pool.query(
      "select detail from audit where action = 'content.update' and site_key = 'lantern.localhost'"
    )
    assert.equal(rows.length, 1)
    assert.equal(rows[0].detail.keyId, key.id)
    assert.equal(rows[0].detail.ok, true)
    // The lease identity is also the audit session, so S3's `GET /v1/sites/{key}/applies` can list
    // a key's calls through the existing listing — here read the cowork way, with the owner's cookie.
    assert.equal(rows[0].detail.sessionId, `key:${key.id}`)
    const listed = await send(
      'GET',
      `/api/sites/lantern.localhost/applies?session=key:${key.id}`,
      await cookieFor('owner@x.y')
    )
    assert.equal(listed.status, 200)
    const { applies } = await listed.json()
    // The write and the `info` read, in order; the two refusals never made a row.
    assert.deepEqual(
      applies.map(({ action, actor, ok }) => ({ action, actor, ok })),
      [
        { action: 'content.update', actor: 'owner@x.y', ok: true },
        { action: 'info', actor: 'owner@x.y', ok: true }
      ]
    )
  }
)

test(
  'api host: a seat demoted to viewer after the mint narrows its key to nothing on the next call (ADR 0028)',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
    const { app } = apiHarness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const key = await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content', 'code'])
    const apply = applyWithKey(app, key.key)
    // An editor holds `code`: the key, scoped to it, may install.
    assert.equal((await apply('lantern.localhost', { action: 'extension.install', params: {} })).status, 200)
    // The Owner makes the editor a viewer; the key is narrowed on its next call, no re-mint needed.
    await pool.query(`update seat set role = 'viewer' where site_key = $1 and account_id = $2`, [
      'lantern.localhost',
      await accountId(pool, 'editor@x.y')
    ])
    const refused = await apply('lantern.localhost', { action: 'extension.install', params: {} })
    assert.equal(refused.status, 403)
    assert.deepEqual(await refused.json(), { code: 'TOOLSET_NOT_GRANTED', toolset: 'code', role: 'viewer' })
    assert.equal((await apply('lantern.localhost', ARTICLE)).status, 403)
  }
)

test(
  'api host: revoked → KEY_REVOKED, expired → KEY_EXPIRED, garbage → KEY_INVALID, none → NOT_SIGNED_IN (cookie ignored), seat revoked → 403',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
    const { app, cookieFor } = apiHarness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const owner = await accountId(pool, 'owner@x.y')

    const revoked = await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['content'])
    await revokeKey(pool, owner, revoked.id)
    const r = await applyWithKey(app, revoked.key)('lantern.localhost', ARTICLE)
    assert.equal(r.status, 401)
    assert.deepEqual(await r.json(), { code: 'KEY_REVOKED' })

    const expired = await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['content'], {
      expiresAt: new Date(Date.now() - 1000)
    })
    const e = await applyWithKey(app, expired.key)('lantern.localhost', ARTICLE)
    assert.equal(e.status, 401)
    assert.deepEqual(await e.json(), { code: 'KEY_EXPIRED' })

    const g = await applyWithKey(app, `trk_${'a'.repeat(16)}.${'b'.repeat(32)}`)('lantern.localhost', ARTICLE)
    assert.equal(g.status, 401)
    assert.deepEqual(await g.json(), { code: 'KEY_INVALID' })

    // A browser session on the api host is nobody: the host does not read cookies.
    const cookie = await cookieFor('owner@x.y')
    const c = await app.fetch(
      new Request('http://api.test/api/sites/lantern.localhost/apply', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(ARTICLE)
      })
    )
    assert.equal(c.status, 401)
    assert.deepEqual(await c.json(), { code: 'NOT_SIGNED_IN' })

    // The seat behind a live key is revoked: the very next call is refused, the key row untouched.
    const live = await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])
    assert.equal((await applyWithKey(app, live.key)('lantern.localhost', ARTICLE)).status, 200)
    await pool.query(
      "update seat set revoked_at = now() where site_key = 'lantern.localhost' and account_id = $1",
      [await accountId(pool, 'editor@x.y')]
    )
    const s = await applyWithKey(app, live.key)('lantern.localhost', ARTICLE)
    assert.equal(s.status, 403)
    assert.deepEqual(await s.json(), { code: 'SEAT_NOT_AUTHORIZED' })
  }
)

test('cowork host: a Bearer seat key is ignored — 401 NOT_SIGNED_IN exactly as before', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
  const { app } = harness(pool, { fetchImpl, envOverrides: { API_KEY_PEPPER: PEPPER } })
  await siteWithComponent(pool)
  const key = await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['content'])
  const res = await applyWithKey(app, key.key)('lantern.localhost', ARTICLE)
  assert.equal(res.status, 401)
  assert.deepEqual(await res.json(), { code: 'NOT_SIGNED_IN' })
})

test('api host: describe.permissions reports the seat ∩ scopes, not the seat', opts, async () => {
  const { pool } = db
  const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
  const { app } = apiHarness(pool, { fetchImpl })
  await siteWithComponent(pool)
  const key = await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['content'])
  const res = await applyWithKey(app, key.key)('lantern.localhost', {
    action: 'content.read',
    params: { describe: true }
  })
  assert.equal(res.status, 200)
  const doc = await res.json()
  assert.equal(doc.permissions.role, 'owner')
  assert.deepEqual(doc.permissions.toolsets, { content: true, code: false, site: false, lifecycle: false })
})

test(
  'api host: a key over its hourly cap is refused 429 RATE_LIMITED with Retry-After, before the site is called',
  opts,
  async () => {
    const { pool } = db
    const { calls, fetchImpl } = fakeNetwork({ answer: { ok: true } })
    const { app } = apiHarness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const key = await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['content'])
    const apply = applyWithKey(app, key.key)
    const windowStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)
    // 599 writes already made this hour: the 600th passes, the 601st does not.
    await pool.query('insert into rate_bucket (bucket, window_start, count) values ($1, $2, 599)', [
      `key:${key.id}:write`,
      windowStart
    ])
    assert.equal((await apply('lantern.localhost', ARTICLE)).status, 200)
    const over = await apply('lantern.localhost', ARTICLE)
    assert.equal(over.status, 429)
    assert.deepEqual(await over.json(), { code: 'RATE_LIMITED' })
    const retry = Number(over.headers.get('retry-after'))
    assert.ok(
      Number.isInteger(retry) && retry >= 1 && retry <= 3600,
      `Retry-After ${over.headers.get('retry-after')}`
    )
    assert.equal(calls.length, 1, 'the refused write never reached the site')
    // Reads have their own, ten times larger, bucket — and a `content.contract` inspect is a read.
    await pool.query('insert into rate_bucket (bucket, window_start, count) values ($1, $2, 5999)', [
      `key:${key.id}:read`,
      windowStart
    ])
    assert.equal(
      (await apply('lantern.localhost', { action: 'content.contract', params: { operation: 'inspect' } }))
        .status,
      200
    )
    const overRead = await apply('lantern.localhost', { action: 'info', params: {} })
    assert.equal(overRead.status, 429)
    assert.ok(overRead.headers.get('retry-after'))
  }
)

test(
  'api host: the lease is keyed by the key — two keys interleaving → SITE_BUSY; caller-chosen headers are ignored',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
    const { app } = apiHarness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const a = await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['content'])
    const b = await keyFor(pool, 'editor@x.y', 'lantern.localhost', ['content'])
    // A session header and a conversation label the caller made up change nothing: the key names
    // the site, and the lease identity is the server's.
    const first = await applyWithKey(app, a.key, {
      'x-tracy-session': 'session-zzz',
      'x-tracy-workspace-label': 'nonexistent'
    })('lantern.localhost', ARTICLE)
    assert.equal(first.status, 200)
    assert.equal((await leaseRow(pool, 'lantern.localhost')).holder_session, `key:${a.id}`)

    const second = await applyWithKey(app, b.key)('lantern.localhost', ARTICLE)
    assert.equal(second.status, 409)
    const body = await second.json()
    assert.equal(body.code, 'SITE_BUSY')
    assert.equal(body.holder, 'owner@x.y')
    // The holder renews; a read by the other key is never blocked.
    assert.equal((await applyWithKey(app, a.key)('lantern.localhost', ARTICLE)).status, 200)
    assert.equal(
      (await applyWithKey(app, b.key)('lantern.localhost', { action: 'info', params: {} })).status,
      200
    )
  }
)

test(
  'applyDoor: the function the /v1 layer calls answers exactly what the HTTP door answers for the same key',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true, changed: 1 } })
    const { app } = apiHarness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const minted = await keyFor(pool, 'owner@x.y', 'lantern.localhost', ['content'])
    const key = await verifyKey({ pool, header: `Bearer ${minted.key}`, pepper: PEPPER })
    const account = await accountByEmail(pool, key.email)
    const grant = await grantFor(pool, account.id, 'lantern.localhost')
    const principal = { kind: 'key', email: key.email, account, grant, key }
    for (const body of [ARTICLE, MODULE, { action: 'nope', params: {} }]) {
      const direct = await app.applyDoor({
        siteKey: 'lantern.localhost',
        action: body.action,
        params: body.params,
        principal
      })
      const http = await applyWithKey(app, minted.key)('lantern.localhost', body)
      assert.equal(direct.status, http.status, body.action)
      assert.deepEqual(direct.body, await http.json(), body.action)
    }
  }
)

// ── The chat turn a write belongs to (plan tasks/todo-site-changes.md §5, Q2) ─────────────────────
// `tracy-site-tools` sends `x-tracy-turn: <root session>:<turn>` beside `x-tracy-session`; a write
// leaves a `site_write` row in the same statement as its audit line, joined to the turn by that id
// alone. A call from a subagent carries its own session and the ROOT agent's turn.

function applyInTurn(app, cookie) {
  return (headers, body) =>
    app.fetch(
      new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body)
      })
    )
}

const siteWrites = async (pool) =>
  (
    await pool.query(
      'select turn_id, session_id, actor, action, outcome, target, via from site_write order by id'
    )
  ).rows

test(
  'apply + x-tracy-turn: a write leaves a site_write row and the turn in its audit line; a read leaves none',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
    const { app, cookieFor } = harness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const apply = applyInTurn(app, await cookieFor('owner@x.y'))
    const turn = { 'x-tracy-session': 'session-sub', 'x-tracy-turn': 'session-root:2' }
    assert.equal((await apply(turn, ARTICLE)).status, 200)
    assert.equal(
      (await apply(turn, { action: 'content.get', params: { kind: 'article', id: 1 } })).status,
      200
    )
    assert.deepEqual(await siteWrites(pool), [
      {
        turn_id: 'session-root:2',
        session_id: 'session-sub',
        actor: 'owner@x.y',
        action: 'content.update',
        outcome: 'ok',
        target: { kind: 'article', id: '1', fields: ['title'] },
        via: 'apply'
      }
    ])
    const { rows } = await pool.query(
      "select action, detail from audit where action in ('content.update', 'content.get') order by id"
    )
    assert.deepEqual(
      rows.map((r) => [r.action, r.detail.turnId, r.detail.writeClass, r.detail.outcome]),
      [
        ['content.update', 'session-root:2', true, 'ok'],
        ['content.get', 'session-root:2', false, 'ok']
      ]
    )
  }
)

test(
  'apply: a write that CREATED a row is recorded under the new id and as a create (#1182, J5.8)',
  opts,
  async () => {
    // Dev e2e 04/10 (e2ef-jo): article 76 was created through `content.update` id 0, and Site
    // changes said `article "0"` was updated. The Claude Cowork plugins answer `{id, created}`.
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true, kind: 'article', id: 76, created: true } })
    const { app, cookieFor } = harness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const apply = applyInTurn(app, await cookieFor('owner@x.y'))
    const turn = { 'x-tracy-session': 'session-c', 'x-tracy-turn': 'session-c:1' }
    const create = { action: 'content.update', params: { kind: 'article', id: 0, fields: { title: 'New' } } }
    assert.equal((await apply(turn, create)).status, 200)
    const [row] = await siteWrites(pool)
    assert.equal(row.action, 'content.create')
    assert.deepEqual(row.target, { kind: 'article', id: '76', fields: ['title'] })
    const { rows } = await pool.query("select action from audit where detail->>'turnId' = 'session-c:1'")
    assert.deepEqual(
      rows.map((r) => r.action),
      ['content.update'],
      'the audit line keeps the door action'
    )
  }
)

test(
  "apply + x-tracy-write-title: the dsh host's title of the record labels the write; a cookie, a revert and a bad encoding keep none",
  opts,
  async () => {
    // Council D1 (20/10/2026): the card under a reply said "Content · article 4", because the Apply
    // door kept `{kind, id, fields}` and no title. The dsh host reads the record's title itself and
    // sends it encoded; only its signed actor may, and it is a label only.
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
    const { app, config, cookieFor } = harness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const actor = (email) => {
      const payload = Buffer.from(
        JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })
      ).toString('base64url')
      return `v1.${payload}.${createHmac('sha256', config.actorSecret).update(payload).digest('base64url')}`
    }
    const fromHost = (title, body = ARTICLE) =>
      app.fetch(
        new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-tracy-actor': actor('owner@x.y'),
            'x-tracy-session': 'session-t',
            'x-tracy-turn': 'session-t:1',
            ...(title === undefined ? {} : { 'x-tracy-write-title': title })
          },
          body: JSON.stringify(body)
        })
      )
    // Spaces and a line break collapse; the value is the record's title, not the agent's words.
    assert.equal((await fromHost(encodeURIComponent('  Yêu\n chính   mình '))).status, 200)
    // A title that does not decode is no title: the write still goes through.
    assert.equal((await fromHost('%E0%A4%A')).status, 200)
    // Capped at the `/changed` door's 200 characters, whole code points.
    assert.equal((await fromHost(encodeURIComponent('😀'.repeat(250)))).status, 200)
    // A revert names the change it takes back, never a record: the title is not added to it.
    assert.equal(
      (await fromHost(encodeURIComponent('Home'), { action: 'apply.revert', params: { apply_id: 'a-1' } }))
        .status,
      200
    )
    // A person's cookie may not label a write: a browser has no reading of the record behind it.
    const cookie = await cookieFor('owner@x.y')
    const byCookie = await app.fetch(
      new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
        method: 'POST',
        headers: {
          cookie,
          'content-type': 'application/json',
          'x-tracy-session': 'session-t',
          'x-tracy-write-title': encodeURIComponent('Made up')
        },
        body: JSON.stringify(ARTICLE)
      })
    )
    assert.equal(byCookie.status, 200)
    const targets = (await siteWrites(pool)).map((w) => w.target)
    assert.deepEqual(targets[0], { kind: 'article', id: '1', fields: ['title'], title: 'Yêu chính mình' })
    assert.deepEqual(targets[1], { kind: 'article', id: '1', fields: ['title'] })
    assert.equal([...targets[2].title].length, 200)
    assert.equal(targets[2].title, '😀'.repeat(200))
    assert.deepEqual(targets[3], { reverts: 'a-1' })
    assert.deepEqual(targets[4], { kind: 'article', id: '1', fields: ['title'] })
    assert.equal(targets.length, 5)
  }
)

test(
  'apply + x-tracy-write-front: the dsh host marks a write to the static front page; a cookie and a revert keep none (#257)',
  opts,
  async () => {
    // Survey 29/10/2026: a home page hero edit was named after the front page record's hidden demo title.
    // The host marks the write; the screens then say "the home page" in the reader's language.
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
    const { app, config, cookieFor } = harness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const payload = Buffer.from(
      JSON.stringify({ email: 'owner@x.y', exp: Math.floor(Date.now() / 1000) + 60 })
    ).toString('base64url')
    const actor = `v1.${payload}.${createHmac('sha256', config.actorSecret).update(payload).digest('base64url')}`
    const send = (auth, front, body = ARTICLE) =>
      app.fetch(
        new Request('http://tracy.test/api/sites/lantern.localhost/apply', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...auth,
            'x-tracy-session': 'session-f',
            'x-tracy-turn': 'session-f:1',
            ...(front === undefined ? {} : { 'x-tracy-write-front': front })
          },
          body: JSON.stringify(body)
        })
      )
    const host = { 'x-tracy-actor': actor }
    assert.equal((await send(host, '1')).status, 200)
    assert.equal((await send(host, 'yes')).status, 200)
    assert.equal((await send(host, '1', { action: 'apply.revert', params: { apply_id: 'a-1' } })).status, 200)
    assert.equal((await send({ cookie: await cookieFor('owner@x.y') }, '1')).status, 200)
    const targets = (await siteWrites(pool)).map((w) => w.target)
    assert.deepEqual(targets[0], { kind: 'article', id: '1', fields: ['title'], front: true })
    assert.deepEqual(targets[1], { kind: 'article', id: '1', fields: ['title'] }, 'only "1" marks it')
    assert.deepEqual(targets[2], { reverts: 'a-1' })
    assert.deepEqual(targets[3], { kind: 'article', id: '1', fields: ['title'] }, 'a cookie may not mark it')
    assert.equal(targets.length, 4)
  }
)

test(
  'apply: an update, or a create whose answer names no usable id, keeps the call id and action',
  opts,
  async () => {
    const { pool } = db
    await siteWithComponent(pool)
    for (const [answer, params] of [
      [
        { ok: true, kind: 'article', id: 5, created: false },
        { kind: 'article', id: 5, fields: { title: 'x' } }
      ],
      [
        { ok: true, created: true },
        { kind: 'article', id: 0, fields: { title: 'x' } }
      ]
    ]) {
      const { app, cookieFor } = harness(pool, { fetchImpl: fakeNetwork({ answer }).fetchImpl })
      await applyInTurn(app, await cookieFor('owner@x.y'))(
        { 'x-tracy-session': 'session-u', 'x-tracy-turn': 'session-u:1' },
        { action: 'content.update', params }
      )
    }
    assert.deepEqual(
      (await siteWrites(pool)).map((r) => [r.action, r.target.id]),
      [
        ['content.update', '5'],
        ['content.update', '0']
      ]
    )
  }
)

test(
  'apply + x-tracy-turn: a clean refusal is "refused", silence is "unknown"; a malformed turn is dropped, never refused',
  opts,
  async () => {
    const { pool } = db
    await siteWithComponent(pool)
    const refusing = harness(pool, {
      fetchImpl: fakeNetwork({ answer: { ok: false, error: 'apply_id required' } }).fetchImpl
    })
    await applyInTurn(refusing.app, await refusing.cookieFor('owner@x.y'))(
      { 'x-tracy-session': 's-1', 'x-tracy-turn': 's-1:1' },
      ARTICLE
    )
    const silent = harness(pool, { fetchImpl: fakeNetwork({ throwOn: true }).fetchImpl })
    await applyInTurn(silent.app, await silent.cookieFor('owner@x.y'))(
      { 'x-tracy-session': 's-1', 'x-tracy-turn': 's-1:1' },
      ARTICLE
    )
    const old = harness(pool, { fetchImpl: fakeNetwork({ answer: { ok: true } }).fetchImpl })
    const oldApply = applyInTurn(old.app, await old.cookieFor('owner@x.y'))
    assert.equal((await oldApply({ 'x-tracy-session': 's-1' }, ARTICLE)).status, 200)
    assert.equal(
      (await oldApply({ 'x-tracy-session': 's-1', 'x-tracy-turn': '../etc:1' }, ARTICLE)).status,
      200
    )
    assert.deepEqual(
      (await siteWrites(pool)).map((w) => [w.turn_id, w.outcome]),
      [
        ['s-1:1', 'refused'],
        ['s-1:1', 'unknown'],
        [null, 'ok'],
        [null, 'ok']
      ]
    )
  }
)

test(
  '/changed + x-tracy-turn: an EmDash or look write outside the Apply door is a site_write of its turn, named by how it went',
  opts,
  async () => {
    const { pool } = db
    const { app, config } = harness(pool, {
      envOverrides: { MCP_TRACY_ACTOR_SECRET: 'changed-actor-test-key' }
    })
    await ownedSite(pool)
    const actor = (email) => {
      const payload = Buffer.from(
        JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + 60 })
      ).toString('base64url')
      return `v1.${payload}.${createHmac('sha256', config.actorSecret).update(payload).digest('base64url')}`
    }
    const changed = (tool, headers = {}) =>
      app.fetch(
        new Request('http://tracy.test/api/sites/_conversation/changed', {
          method: 'POST',
          headers: {
            'x-tracy-actor': actor('editor@x.y'),
            'x-tracy-workspace-label': 'lantern',
            'x-tracy-session': 'session-e1',
            'content-type': 'application/json',
            ...headers
          },
          body: JSON.stringify({ tool })
        })
      )
    for (const tool of ['content_update', 'edit', 'look.revert']) {
      assert.equal((await changed(tool, { 'x-tracy-turn': 'session-e1:5' })).status, 200)
    }
    assert.equal((await changed('content_replace')).status, 200, 'an older dsh: no turn header')
    // A newer dsh names how the write was made: a look edit through bash is a file write, not EmDash
    // (stand, 02/10). A `via` that is not one of the three is refused.
    const withVia = (body, extra = {}) =>
      app.fetch(
        new Request('http://tracy.test/api/sites/_conversation/changed', {
          method: 'POST',
          headers: {
            'x-tracy-actor': actor('editor@x.y'),
            'x-tracy-workspace-label': 'lantern',
            'x-tracy-session': 'session-e1',
            'content-type': 'application/json',
            ...extra
          },
          body: JSON.stringify(body)
        })
      )
    assert.equal(
      (await withVia({ tool: 'bash', via: 'file-look' }, { 'x-tracy-turn': 'session-e1:6' })).status,
      200
    )
    assert.equal((await withVia({ tool: 'bash', via: 'apply' })).status, 400)
    // An EmDash write names its entry (QA-A10-em): kept as the write's target. A malformed target,
    // or one on a write that is not EmDash's, is dropped — the stamp still lands.
    const turn7 = { 'x-tracy-turn': 'session-e1:7' }
    const entry = { kind: 'posts', id: '01M3Z45EZRYDF85GHERTM1PAF7' }
    assert.equal(
      (await withVia({ tool: 'content_update', via: 'emdash-mcp', target: entry }, turn7)).status,
      200
    )
    assert.equal(
      (await withVia({ tool: 'content_update', via: 'emdash-mcp', target: { kind: 'a b', id: 'x' } }, turn7))
        .status,
      200
    )
    assert.equal((await withVia({ tool: 'edit', via: 'file-look', target: entry }, turn7)).status, 200)
    // C1 (04/10): a delete names every row it removed, so each of EmDash's anonymous delete rows can
    // be matched by id. A list that is not a list of ids is dropped; the entry itself is kept.
    const removed = {
      kind: 'posts',
      id: '01M3Z45EZRYDF85GHERTM1PAEN',
      ids: ['01M3Z45EZRYDF85GHERTM1PAEN', '01M3Z45EZRYDF85GHERTM1PARU']
    }
    assert.equal(
      (await withVia({ tool: 'content_delete', via: 'emdash-mcp', target: removed }, turn7)).status,
      200
    )
    assert.equal(
      (
        await withVia(
          { tool: 'content_delete', via: 'emdash-mcp', target: { ...entry, ids: ['ok', 'not ok'] } },
          turn7
        )
      ).status,
      200
    )
    // Dev e2e 04/10 (E3.2, E5.e5): the entry's title as the write answered it, and the live state
    // the write moved. A state that is not one of the two is dropped; a title is trimmed and capped.
    const titled = { kind: 'home', id: '01M3PJRBF0GQ7B4HVY1WVH70XN', title: 'Home', state: 'published' }
    assert.equal(
      (await withVia({ tool: 'content_update', via: 'emdash-mcp', target: titled }, turn7)).status,
      200
    )
    assert.equal(
      (
        await withVia(
          {
            tool: 'content_update',
            via: 'emdash-mcp',
            target: { ...titled, title: `  ${'x'.repeat(300)} `, state: 'live' }
          },
          turn7
        )
      ).status,
      200
    )
    assert.deepEqual(
      (await siteWrites(pool)).map((w) => [
        w.turn_id,
        w.session_id,
        w.actor,
        w.action,
        w.outcome,
        w.via,
        w.target
      ]),
      [
        ['session-e1:5', 'session-e1', 'editor@x.y', 'content_update', 'ok', 'emdash-mcp', null],
        ['session-e1:5', 'session-e1', 'editor@x.y', 'edit', 'ok', 'file-look', null],
        ['session-e1:5', 'session-e1', 'editor@x.y', 'look.revert', 'ok', 'look-revert', null],
        [null, 'session-e1', 'editor@x.y', 'content_replace', 'ok', 'emdash-mcp', null],
        ['session-e1:6', 'session-e1', 'editor@x.y', 'bash', 'ok', 'file-look', null],
        ['session-e1:7', 'session-e1', 'editor@x.y', 'content_update', 'ok', 'emdash-mcp', entry],
        ['session-e1:7', 'session-e1', 'editor@x.y', 'content_update', 'ok', 'emdash-mcp', null],
        ['session-e1:7', 'session-e1', 'editor@x.y', 'edit', 'ok', 'file-look', null],
        ['session-e1:7', 'session-e1', 'editor@x.y', 'content_delete', 'ok', 'emdash-mcp', removed],
        ['session-e1:7', 'session-e1', 'editor@x.y', 'content_delete', 'ok', 'emdash-mcp', entry],
        ['session-e1:7', 'session-e1', 'editor@x.y', 'content_update', 'ok', 'emdash-mcp', titled],
        [
          'session-e1:7',
          'session-e1',
          'editor@x.y',
          'content_update',
          'ok',
          'emdash-mcp',
          { kind: 'home', id: '01M3PJRBF0GQ7B4HVY1WVH70XN', title: 'x'.repeat(200) }
        ]
      ]
    )
    const { rows } = await pool.query(
      "select detail from audit where action = 'site.changed' order by id limit 1"
    )
    assert.equal(rows[0].detail.turnId, 'session-e1:5')
  }
)

// Review Q1 (council 20/10/2026): an EmDash write never passes the Apply door, so the host takes the same
// lease here first. One row with the Apply door's: a hold taken at either refuses the other conversation.
test(
  'lease/acquire: the host takes the Apply door’s own lease; another conversation is refused SITE_BUSY at both doors',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
    const { app, cookieFor } = harness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const owner = await cookieFor('owner@x.y')
    const editor = await cookieFor('editor@x.y')
    const acquire = (cookie, session, extra = {}) =>
      app.fetch(
        new Request('http://tracy.test/api/sites/lantern.localhost/lease/acquire', {
          method: 'POST',
          headers: { cookie, 'x-tracy-session': session, ...extra }
        })
      )
    const taken = await acquire(owner, 'session-a', { 'x-tracy-turn': 'session-a:3' })
    assert.equal(taken.status, 200)
    assert.deepEqual(await taken.json(), { ok: true, fresh: true })
    const row = await leaseRow(pool, 'lantern.localhost')
    assert.equal(row.holder_session, 'session-a')
    assert.equal(row.holder_turn, 3)
    // Renewed, not opened again.
    assert.deepEqual(await (await acquire(owner, 'session-a')).json(), { ok: true, fresh: false })
    // Another person's conversation: the Apply door's refusal, here and at the Apply door.
    const busy = await acquire(editor, 'session-b')
    assert.equal(busy.status, 409)
    const body = await busy.json()
    assert.equal(body.code, 'SITE_BUSY')
    assert.equal(body.holder, 'owner@x.y')
    assert.equal(body.holderIsYou, false)
    assert.match(body.next, /Do not retry in a loop/)
    const write = { action: 'content.update', params: { kind: 'article', id: 1, fields: { title: 'x' } } }
    assert.equal((await applyAs(app, editor)('session-b', write)).status, 409)
    // The turn-end release frees it for the other conversation.
    await app.fetch(
      new Request('http://tracy.test/api/sites/lantern.localhost/lease/release', {
        method: 'POST',
        headers: { cookie: owner, 'x-tracy-session': 'session-a', 'x-tracy-turn': 'session-a:3' }
      })
    )
    assert.equal((await acquire(editor, 'session-b')).status, 200)
    // A viewer holds no write lease; a call with no session is a bad call.
    assert.equal((await acquire(await cookieFor('viewer@x.y'), 'session-v')).status, 403)
    const bare = await app.fetch(
      new Request('http://tracy.test/api/sites/lantern.localhost/lease/acquire', {
        method: 'POST',
        headers: { cookie: owner }
      })
    )
    assert.equal(bare.status, 400)
  }
)

// Review Q2 (council 20/10/2026): what a stopped turn wrote, kept for the next turn of the conversation.
test(
  'turn/stopped: the writes of a stopped turn are kept by name and told once, to the same conversation and person',
  opts,
  async () => {
    const { pool } = db
    const { fetchImpl } = fakeNetwork({ answer: { ok: true } })
    const { app, cookieFor } = harness(pool, { fetchImpl })
    await siteWithComponent(pool)
    const owner = await cookieFor('owner@x.y')
    const editor = await cookieFor('editor@x.y')
    const post = (cookie, path, body) =>
      app.fetch(
        new Request(`http://tracy.test/api/sites/lantern.localhost/${path}`, {
          method: 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          body: JSON.stringify(body)
        })
      )
    const sent = {
      turnId: 'session-a:4',
      writes: [
        {
          id: 'w1',
          action: 'content.update',
          target: { kind: 'post', id: 42, value: 'secret' },
          via: 'apply',
          outcome: 'ok'
        },
        {
          id: 'w2',
          action: 'content_update',
          target: { kind: 'pages', id: '01ABC' },
          via: 'emdash',
          outcome: 'sent'
        }
      ]
    }
    assert.equal((await post(owner, 'turn/stopped', sent)).status, 200)
    // The Stop's late `sent` never overwrites an outcome that already came.
    await post(owner, 'turn/stopped', {
      turnId: 'session-a:4',
      writes: [{ ...sent.writes[0], outcome: 'sent' }]
    })
    assert.equal((await post(owner, 'turn/stopped', { turnId: 'nope', writes: sent.writes })).status, 400)
    assert.equal((await post(owner, 'turn/stopped', { turnId: 'session-a:4', writes: [] })).status, 400)
    // Another person, or the same turn, is told nothing.
    assert.deepEqual(
      (await (await post(editor, 'turn/stopped/take', { turnId: 'session-a:5' })).json()).writes,
      []
    )
    assert.deepEqual(
      (await (await post(owner, 'turn/stopped/take', { turnId: 'session-a:4' })).json()).writes,
      []
    )
    const told = await (await post(owner, 'turn/stopped/take', { turnId: 'session-a:5' })).json()
    assert.deepEqual(told.writes, [
      { turn: 4, action: 'content.update', target: { kind: 'post', id: '42' }, via: 'apply', outcome: 'ok' },
      {
        turn: 4,
        action: 'content_update',
        target: { kind: 'pages', id: '01ABC' },
        via: 'emdash',
        outcome: 'sent'
      }
    ])
    assert.deepEqual(
      (await (await post(owner, 'turn/stopped/take', { turnId: 'session-a:6' })).json()).writes,
      [],
      'told twice'
    )
  }
)
