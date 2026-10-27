import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mintSession } from '../src/lib/session.js'
import { widgetContext } from '../src/widget/context.js'
import { prepareNativeHandoff, finishNativeHandoff } from '../src/widget/native-handoff.js'
import {
  CONVERSATION_TTL,
  NATIVE_CONTEXT_EXPIRY,
  ConversationConflict,
  conversationPayload,
  conversationStore,
  openConversationSnapshot,
  sealConversationSnapshot,
  seedConversationSnapshot
} from '../src/widget/store.js'

const secret = 'test-purpose-only'
const owner = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const now = Date.now()
const data = {
  history: [{ role: 'user', text: 'Private business request' }],
  brief: { name: 'n'.repeat(2000), about: 'about' },
  build: { siteKey: 'mine.test', jobId: 'job1', token: 'never' },
  buildId: 'stable',
  inflight: { kind: 'turn', message: 'uncertain' },
  authCookie: 'secret-cookie',
  speechToken: 'secret-speech',
  otp: '123456'
}
function database() {
  const rows = new Map()
  return {
    rows,
    async query(sql, args) {
      // The restart sign-in binding (`widget_sign_in`) is not this fake's subject: none is kept.
      if (sql.includes('widget_sign_in')) return { rows: [], rowCount: 0 }
      if (sql.startsWith('select id from account'))
        return { rows: [{ id: args[0] === 'other@test.invalid' ? other : owner }] }
      if (sql.includes('where native_session_id'))
        return {
          rows: [...rows.values()].filter(
            (row) => row.native_session_id === args[0] && row.owner_account_id === args[1]
          )
        }
      if (sql.startsWith('select *')) return { rows: rows.has(args[0]) ? [rows.get(args[0])] : [] }
      if (sql.startsWith('insert')) {
        if (rows.has(args[0])) return { rows: [] }
      } else if (sql.startsWith('update')) {
        const old = rows.get(args[0])
        if (!old || old.revision !== args[6] || old.owner_account_id !== args[7]) return { rows: [] }
      } else throw Error('Unexpected SQL')
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
test('purpose-bound encrypted whitelist keeps full brief and pointer identity, rejects metadata tamper', async () => {
  const row = await sealConversationSnapshot(
    { visitorId: 'visitor', ownerAccountId: owner, data, capturedAt: now },
    secret
  )
  assert.deepEqual(await openConversationSnapshot(row, secret, now), conversationPayload(data))
  assert.equal((await openConversationSnapshot(row, secret, now)).brief.name.length, 2000)
  const serialized = JSON.stringify(row)
  for (const value of ['Private business request', 'secret-cookie', 'secret-speech', '123456', 'mine.test'])
    assert.ok(!serialized.includes(value))
  for (const patch of [
    { owner_account_id: other },
    { visitor_digest: 'bad' },
    { revision: 2 },
    { expires_at: 'malformed' },
    { expires_at: new Date(now + CONVERSATION_TTL + 1).toISOString() },
    {
      payload_cipher: row.payload_cipher.replace(
        /^(v1\.)(.)/,
        (_, prefix, char) => prefix + (char === 'A' ? 'B' : 'A')
      )
    }
  ])
    assert.equal(await openConversationSnapshot({ ...row, ...patch }, secret, now), null)
  assert.equal(await openConversationSnapshot(row, 'wrong-purpose-secret', now), null)
  await assert.rejects(sealConversationSnapshot({ visitorId: 'visitor', data, capturedAt: NaN }, secret))
})
test('expiry is honest and fresh visitor can save without old-key CAS collision; CAS never retries', async () => {
  const pool = database(),
    store = conversationStore(pool, secret)
  const row = await sealConversationSnapshot(
    { visitorId: 'expired', ownerAccountId: owner, data, capturedAt: now - CONVERSATION_TTL - 1 },
    secret
  )
  pool.rows.set(row.visitor_digest, row)
  assert.deepEqual(await store.read('expired', owner, now), { expired: true, revision: 1 })
  const context = widgetContext({
    pool,
    config: { sessionSecret: secret },
    store,
    visitors: new Map(),
    secure: false
  })
  const cookie = 'tracy_widget=expired; tracy_sess=' + (await mintSession('me@test.invalid', secret))
  const c = { req: { header: () => cookie }, header() {} }
  const v = await context.visitor(c)
  assert.notEqual(v.id, 'expired')
  assert.equal(v.history.length, 0)
  await context.save(v)
  await assert.rejects(store.write(v.id, owner, data, 0), ConversationConflict)
})
test('seed exact visitor/owner, restart hydration, account lock and manual inflight, no overwrite', async () => {
  const pool = database(),
    row = await sealConversationSnapshot(
      { visitorId: 'visitor', ownerAccountId: owner, data, capturedAt: now },
      secret
    )
  await seedConversationSnapshot(pool, row, secret, { visitorId: 'visitor', ownerAccountId: owner, now })
  await assert.rejects(
    seedConversationSnapshot(pool, row, secret, { visitorId: 'wrong', ownerAccountId: owner, now })
  )
  await assert.rejects(
    seedConversationSnapshot(pool, row, secret, { visitorId: 'visitor', ownerAccountId: owner, now }),
    ConversationConflict
  )
  const store = conversationStore(pool, secret)
  const make = () =>
    widgetContext({ pool, config: { sessionSecret: secret }, store, visitors: new Map(), secure: false })
  const c = (cookie) => ({ req: { header: () => cookie }, header() {} })
  const sameContext = make()
  const locked = await sameContext.visitor(c('tracy_widget=visitor'))
  assert.equal(locked.locked, true)
  assert.deepEqual(locked.history, [])
  assert.equal(locked.build, null)
  const v = await sameContext.visitor(
    c('tracy_widget=visitor; tracy_sess=' + (await mintSession('me@test.invalid', secret)))
  )
  assert.equal(v.history.length, 1)
  assert.equal(v.buildId, 'stable')
  assert.deepEqual(v.build, { siteKey: 'mine.test', jobId: 'job1' })
  assert.equal(v.inflight.message, 'uncertain')
  assert.equal(v.authCookie, undefined)
  assert.equal(v.locked, undefined)
  await sameContext.save(v)
  assert.equal(v.revision, 2)
  const switched = await make().visitor(
    c('tracy_widget=visitor; tracy_sess=' + (await mintSession('other@test.invalid', secret)))
  )
  assert.notEqual(switched.id, 'visitor')
  assert.deepEqual(switched.history, [])
  pool.rows.set(row.visitor_digest, { ...row, expires_at: 'invalid' })
  await assert.rejects(store.read('visitor', owner, now), /WIDGET_STATE_UNREADABLE/)
})

test('locked cached context expires then rotates UUID without revision-zero collision', async (t) => {
  const pool = database(),
    store = conversationStore(pool, secret)
  const row = await sealConversationSnapshot(
    { visitorId: 'locked-expiry', ownerAccountId: owner, data, capturedAt: now },
    secret
  )
  pool.rows.set(row.visitor_digest, row)
  const ctx = widgetContext({
    pool,
    config: { sessionSecret: secret },
    store,
    visitors: new Map(),
    secure: false
  })
  let cookie = 'tracy_widget=locked-expiry'
  const c = { req: { header: () => cookie }, header() {} }
  assert.equal((await ctx.visitor(c)).locked, true)
  t.mock.method(Date, 'now', () => now + CONVERSATION_TTL + 10)
  cookie += '; tracy_sess=' + (await mintSession('me@test.invalid', secret))
  const fresh = await ctx.visitor(c)
  assert.notEqual(fresh.id, 'locked-expiry')
  assert.deepEqual(fresh.history, [])
  await ctx.save(fresh)
  assert.equal(fresh.revision, 1)
})

test('embedded OTP reauth preserves verified transient cookie across locked hydration without persisting it', async () => {
  const pool = database(),
    store = conversationStore(pool, secret)
  const row = await sealConversationSnapshot(
    { visitorId: 'embedded', ownerAccountId: owner, data, capturedAt: now },
    secret
  )
  pool.rows.set(row.visitor_digest, row)
  const ctx = widgetContext({
    pool,
    config: { sessionSecret: secret },
    store,
    visitors: new Map(),
    secure: false
  })
  const c = { req: { header: () => 'tracy_widget=embedded' }, header() {} }
  const locked = await ctx.visitor(c)
  locked.authCookie = 'tracy_sess=' + (await mintSession('me@test.invalid', secret))
  const hydrated = await ctx.visitor(c)
  assert.equal(hydrated.history.length, 1)
  assert.equal(hydrated.authCookie, locked.authCookie)
  await ctx.save(hydrated)
  assert.equal((await ctx.visitor(c)).locked, undefined)
  assert.ok(!JSON.stringify([...pool.rows.values()]).includes(hydrated.authCookie))
})

test('mounted durable turn saves inflight before inference and final history before response; restart never replays', async (t) => {
  const { widgetRoutes } = await import('../src/widget/route.js')
  const { Hono } = await import('hono')
  const pool = database(),
    query = pool.query.bind(pool)
  pool.query = async (sql, args) =>
    sql.includes('ui_setting')
      ? { rows: [{ on: true }] }
      : sql.includes('llm_assignment')
        ? { rows: [] }
        : sql.includes('rate_bucket')
          ? { rows: [{ count: 1 }] }
          : query(sql, args)
  const origin = 'https://tracy.test',
    store = conversationStore(pool, secret)
  const make = () => {
    const app = new Hono()
    app.route(
      '/widget',
      widgetRoutes({
        pool,
        config: {
          origin,
          sessionSecret: secret,
          model: { apiKey: 'test', baseUrl: 'https://model.invalid', words: 'test' }
        },
        contextStore: store,
        request: async (path) =>
          Response.json(
            path === '/api/templates'
              ? { templates: [] }
              : path === '/api/design-system/library'
                ? { systems: [] }
                : { available: false }
          )
      })
    )
    return app
  }
  let app = make(),
    cookie = 'tracy_sess=' + (await mintSession('me@test.invalid', secret))
  // Reading makes no visitor (council 19/10/2026): no cookie and no row until the first turn.
  const state = await app.request(origin + '/widget/api/state', { headers: { cookie } })
  assert.equal(state.headers.get('set-cookie'), null)
  assert.equal(pool.rows.size, 0)
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    const row = [...pool.rows.values()][0]
    const persisted = await openConversationSnapshot(row, secret)
    assert.equal(persisted.inflight.message, calls === 1 ? 'Fresh words' : 'Uncertain words')
    return calls === 1
      ? Response.json({ choices: [{ message: { content: JSON.stringify({ speak: 'Answer' }) } }] })
      : new Response('private-upstream-body', { status: 401 })
  })
  const turn = async (message) => {
    const response = await app.request(origin + '/widget/api/turn', {
      method: 'POST',
      headers: { cookie, origin, 'content-type': 'application/json' },
      body: JSON.stringify({ message })
    })
    const made = response.headers.get('set-cookie')
    if (made) cookie += '; ' + made.split(';')[0]
    return response
  }
  assert.equal((await turn('Fresh words')).status, 200)
  let persisted = await openConversationSnapshot([...pool.rows.values()][0], secret)
  assert.equal(persisted.history.length, 2)
  assert.equal(persisted.inflight, null)
  assert.equal((await turn('Uncertain words')).status, 401)
  app = make()
  const recovered = await (await app.request(origin + '/widget/api/state', { headers: { cookie } })).json()
  assert.equal(recovered.history.length, 2)
  assert.equal(recovered.recovery.message, 'Uncertain words')
  assert.equal(recovered.recovery.manualOnly, true)
  assert.equal(calls, 2)
})

test('native adoption mapping remains encrypted and idempotent across store restart', async () => {
  const pool = database(),
    store = conversationStore(pool, secret)
  const v = { ...data, id: 'native-visitor', ownerId: owner, revision: 0, expires: now + 10000 }
  const identity = { visitorId: v.id, ownerAccountId: owner, expectedRevision: 0, now }
  v.nativeHandoff = prepareNativeHandoff(v, identity)
  const sessionId = v.nativeHandoff.sessionId
  Object.assign(v, await store.write(v.id, owner, v, 0, owner, now))
  assert.equal(await store.readContextForSession(sessionId, owner, now), null)
  const restored = await conversationStore(pool, secret).read(v.id, owner, now)
  Object.assign(v, restored.data, { revision: restored.revision })
  identity.expectedRevision = v.revision
  assert.equal(prepareNativeHandoff(v, identity).sessionId, sessionId)
  v.nativeHandoff = finishNativeHandoff(v, identity, { sessionId, workspaceId: 'workspace-owned' })
  await store.write(v.id, owner, v, v.revision, owner, now)
  assert.deepEqual(
    await conversationStore(pool, secret).readContextForSession(sessionId, owner, now),
    v.nativeHandoff.context
  )
  assert.equal(await store.readContextForSession(sessionId, other, now), null)
  assert.deepEqual(
    await store.readContextForSession(sessionId, owner, now + CONVERSATION_TTL * 365),
    v.nativeHandoff.context
  )
  const afterYear = await store.read(v.id, owner, now + CONVERSATION_TTL * 365)
  assert.equal(afterYear.data.nativeHandoff.sessionId, sessionId)
  assert.equal(afterYear.expires, Date.parse(NATIVE_CONTEXT_EXPIRY))
  const row = [...pool.rows.values()][0]
  assert.equal(row.native_session_id, sessionId)
  assert.equal(JSON.stringify(row).includes('Private business request'), false)
  row.native_session_id = 'session-tampered'
  assert.equal(await openConversationSnapshot(row, secret, now), null)
})

test('native mapping cannot be sealed under another owner or visitor or silently change context', async () => {
  const v = { ...data, id: 'bound', ownerId: owner, revision: 0, expires: now + 10000 }
  v.nativeHandoff = prepareNativeHandoff(v, {
    visitorId: v.id,
    ownerAccountId: owner,
    expectedRevision: 0,
    now
  })
  for (const binding of [
    { visitorId: 'other', ownerAccountId: owner },
    { visitorId: v.id, ownerAccountId: other }
  ])
    await assert.rejects(
      sealConversationSnapshot({ ...binding, data: v, capturedAt: now }, secret),
      /ENVELOPE_INVALID/
    )
  v.history = [...v.history, { role: 'user', text: 'changed after handoff' }]
  await assert.rejects(
    sealConversationSnapshot({ visitorId: v.id, ownerAccountId: owner, data: v, capturedAt: now }, secret),
    /MAPPING_INVALID/
  )
})

test('only authenticated ready native metadata receives account retention', async () => {
  const v = { ...data, id: 'retention', ownerId: owner, revision: 0, expires: now + 10000 }
  v.nativeHandoff = prepareNativeHandoff(v, {
    visitorId: v.id,
    ownerAccountId: owner,
    expectedRevision: 0,
    now
  })
  const row = await sealConversationSnapshot(
    { visitorId: v.id, ownerAccountId: owner, data: v, capturedAt: now },
    secret
  )
  assert.equal(row.expires_at, new Date(now + CONVERSATION_TTL).toISOString())
  assert.equal(await openConversationSnapshot(row, secret, now + CONVERSATION_TTL), null)
  assert.equal(
    await openConversationSnapshot({ ...row, expires_at: NATIVE_CONTEXT_EXPIRY }, secret, now),
    null
  )
})
