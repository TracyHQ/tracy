// A widget turn or create that did not finish (`src/widget/route.js`, `native-session.js`): a turn the
// model failed never blocks the hand-off to the native chat, a turn left by a restart stops blocking
// once no run could still be going, and a create whose answer was lost is reconciled by sending the
// same request again under the same buildId — the create door's idempotency — never a second site.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Hono } from 'hono'
import { mintSession } from '../src/lib/session.js'
import { INFLIGHT_STALE_MS } from '../src/widget/native-session.js'
import { widgetRoutes } from '../src/widget/route.js'
import { conversationPayload, conversationStore, openConversationSnapshot } from '../src/widget/store.js'

const origin = 'https://widget-inflight.example.test',
  secret = 'widget-inflight-secret',
  owner = '00000000-0000-4000-8000-000000000001'

/** The conversation table and the account lookup, in memory (the shape `widget-store.test.mjs` uses). */
function database() {
  const rows = new Map()
  return {
    rows,
    async query(sql, args) {
      if (sql.includes('ui_setting')) return { rows: [{ on: true }] }
      // The restart sign-in binding (`widget_sign_in`) is not this fake's subject: none is kept.
      if (sql.includes('widget_sign_in')) return { rows: [], rowCount: 0 }
      if (sql.includes('llm_assignment')) return { rows: [] }
      if (sql.includes('rate_bucket')) return { rows: [{ count: 1 }] }
      if (sql.startsWith('insert into account')) return { rows: [] }
      if (sql.startsWith('select id from account')) return { rows: [{ id: owner }] }
      if (sql.startsWith('select *')) return { rows: rows.has(args[0]) ? [rows.get(args[0])] : [] }
      if (sql.startsWith('insert')) {
        if (rows.has(args[0])) return { rows: [] }
      } else if (sql.startsWith('update')) {
        const old = rows.get(args[0])
        if (!old || old.revision !== args[6] || old.owner_account_id !== args[7]) return { rows: [] }
      } else throw Error('Unexpected SQL: ' + sql)
      const row = {
        visitor_digest: args[0],
        owner_account_id: args[1],
        payload_cipher: args[2],
        schema_version: args[3],
        revision: args[4],
        expires_at: args[5],
        native_session_id: (sql.startsWith('update') ? args[8] : args[6]) ?? null
      }
      rows.set(args[0], row)
      return { rows: [{ revision: row.revision }] }
    }
  }
}

/** A widget app on `pool` (a process); `sites` answers the create door. */
function widgetApp(pool, sites, created) {
  const widget = widgetRoutes({
    pool,
    contextStore: conversationStore(pool, secret),
    config: {
      origin,
      sessionSecret: secret,
      model: { apiKey: 'test', baseUrl: 'https://model.invalid', words: 'test' }
    },
    nativeSessionOptions: {
      mintNative: async ({ sessionId }) => ({ sessionId, workspaceId: 'own-workspace' })
    },
    request: async (path, init = {}) => {
      if (path === '/api/sites') {
        created.push(JSON.parse(init.body))
        return sites(JSON.parse(init.body))
      }
      if (path === '/api/templates')
        return Response.json({
          templates: [{ id: 'template-a', platforms: [{ platform: 'wordpress', tag: 'base' }] }]
        })
      if (path === '/api/design-system/library') return Response.json({ systems: [] })
      return Response.json({ available: false })
    }
  })
  const app = new Hono()
  app.route('/widget', widget)
  return app
}

/** A signed-in visitor on a widget backed by `pool`; `restart()` is a new process on the same database. */
async function stand({ pool = database(), sites = async () => Response.json({}, { status: 500 }) } = {}) {
  const created = []
  let app = widgetApp(pool, sites, created)
  let cookie = 'tracy_sess=' + (await mintSession('me@test.invalid', secret))
  const send = (path, data) =>
    app.request(origin + '/widget' + path, {
      headers: { cookie, ...(data ? { origin, 'content-type': 'application/json' } : {}) },
      ...(data ? { method: 'POST', body: JSON.stringify(data) } : {})
    })
  // A visitor is made on its first write (#1478): what is visible is the cheapest one.
  const visitor = (await send('/api/visible', {})).headers.get('set-cookie').split(';')[0]
  cookie += '; ' + visitor
  return {
    send,
    created,
    pool,
    visitorId: visitor.split('=')[1],
    store: conversationStore(pool, secret),
    stored: async () => openConversationSnapshot([...pool.rows.values()][0], secret),
    restart() {
      app = widgetApp(pool, sites, created)
    }
  }
}

test('a turn the model failed leaves its words for review and does not block the native hand-off', async (t) => {
  const s = await stand()
  t.mock.method(globalThis, 'fetch', async () => new Response('no credits', { status: 402 }))
  const failed = await s.send('/api/turn', { message: 'Uncertain words' })
  assert.equal(failed.status, 402)
  assert.deepEqual(await failed.json(), { code: 'MODEL_UNAVAILABLE', reason: 'upstream' })
  const kept = await s.stored()
  assert.equal(kept.inflight, null)
  assert.equal(kept.clientPending.pendingDraft, 'Uncertain words')
  // Offered back for review, manual only, as before.
  const state = await (await s.send('/api/state')).json()
  assert.deepEqual(state.recovery, { message: 'Uncertain words', manualOnly: true })
  const open = await s.send('/api/native/open', {})
  assert.equal(open.status, 200, 'never WIDGET_NATIVE_WAIT_FOR_TURN after a failed turn')
  assert.match((await open.json()).sessionId, /^session-widget-/)
  // The page hands its words to the native composer; the discovery state stops offering them.
  assert.equal((await (await s.send('/api/state')).json()).recovery, null)
})

test('a turn stored by a process that restarted mid-run blocks only while it could still be running', async () => {
  for (const [age, status] of [
    [1000, 409],
    [INFLIGHT_STALE_MS + 1000, 200]
  ]) {
    const s = await stand()
    // What the restart left: the turn saved before the model call, never answered or failed.
    const [row] = [...s.pool.rows.values()]
    await s.store.write(
      s.visitorId,
      owner,
      { ...(await s.stored()), inflight: { kind: 'turn', message: 'Uncertain words', at: Date.now() - age } },
      row.revision,
      owner
    )
    s.restart()
    const open = await s.send('/api/native/open', {})
    assert.equal(open.status, status)
    if (status === 409) assert.equal((await open.json()).code, 'WIDGET_NATIVE_WAIT_FOR_TURN')
    else assert.equal((await s.stored()).inflight, null)
  }
})

test('a create whose answer was lost is sent again as it was, under the same buildId, and adopted', async () => {
  let answer = 'throw'
  const s = await stand({
    sites: async (body) => {
      if (answer === 'throw') throw Object.assign(Error('socket hang up'), { code: 'ECONNRESET' })
      return Response.json(
        { siteKey: `${body.label}.tracy.test`, jobId: 'job-1', buildId: body.buildId },
        { status: 202 }
      )
    }
  })
  await s.send('/api/select', { kind: 'template', id: 'template-a' })
  const lost = await s.send('/api/create', { label: 'first-label' })
  assert.equal(lost.status, 503)
  const marker = (await s.stored()).inflight
  assert.equal(marker.kind, 'create')
  assert.equal(marker.request.label, 'first-label')
  // The open is held while that create could still be running.
  assert.equal((await s.send('/api/native/open', {})).status, 409)
  // A second press, with a new address in the form, reconciles the first instead of starting another.
  answer = 'site'
  const again = await s.send('/api/create', { label: 'second-label' })
  assert.equal(again.status, 202)
  assert.deepEqual(
    s.created.map((x) => [x.label, x.buildId]),
    [
      ['first-label', s.created[0].buildId],
      ['first-label', s.created[0].buildId]
    ]
  )
  const kept = await s.stored()
  assert.equal(kept.inflight, null)
  assert.deepEqual(kept.build, { siteKey: 'first-label.tracy.test', jobId: 'job-1' })
  // Adopted: a third press answers the build, asks nothing.
  assert.equal((await (await s.send('/api/create', { label: 'third-label' })).json()).jobId, 'job-1')
  assert.equal(s.created.length, 2)
})

test('a create the door refused clears its marker; one still pending keeps it', async () => {
  const answers = [
    Response.json({ code: 'CREATE_PENDING', buildId: 'b', siteKey: null }, { status: 202 }),
    Response.json({ code: 'INVALID_LABEL' }, { status: 400 })
  ]
  const s = await stand({ sites: async () => answers.shift() })
  await s.send('/api/select', { kind: 'template', id: 'template-a' })
  assert.equal((await s.send('/api/create', { label: 'pending-label' })).status, 202)
  assert.equal((await s.stored()).inflight.request.label, 'pending-label', 'still unknown: kept')
  assert.equal((await s.stored()).build, null)
  assert.equal((await s.send('/api/create', { label: 'other-label' })).status, 400)
  assert.equal(s.created[1].label, 'pending-label', 'the pending one is what was sent again')
  assert.equal((await s.stored()).inflight, null, 'the door answered: nothing left to reconcile')
  assert.equal((await s.send('/api/native/open', {})).status, 200)
})

test('the stored record keeps a create’s own request fields only, and a turn’s start', () => {
  const value = conversationPayload({
    inflight: {
      kind: 'create',
      at: 5,
      request: { platform: 'joomla', design: 'd', quickstart: 'q', label: 'my-site', cookie: 'secret' }
    }
  })
  assert.deepEqual(value.inflight, {
    kind: 'create',
    message: '',
    at: 5,
    request: { platform: 'joomla', design: 'd', quickstart: 'q', label: 'my-site' }
  })
  assert.deepEqual(conversationPayload({ inflight: { kind: 'turn', message: 'm', at: 'x' } }).inflight, {
    kind: 'turn',
    message: 'm'
  })
})
