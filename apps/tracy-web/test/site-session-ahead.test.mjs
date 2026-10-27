import assert from 'node:assert/strict'
import { test } from 'node:test'
import { once } from 'node:events'
import { WebSocketServer } from 'ws'
import { siteSessionBaseline } from '../src/lib/dsh-workspace-baseline.js'
import { promptSiteSession, siteSessionAhead } from '../src/lib/site-session-ahead.js'

const sessionId = 'wo-demo-11111111-1111-4111-8111-111111111111'
const config = {
  defaultHost: 'local',
  hosts: new Map([['local', { dshOrigin: 'https://lane.test', seatSecret: 'test-secret' }]])
}
const site = { host: 'local', site_key: 'demo.example.test', label: 'demo', platform: 'emdash' }

test('a durable site session uses the signed allocation twice with one identity and fresh nonces', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    assert.equal(url, 'https://lane.test/gateway/seat/session')
    calls.push(init)
    return Response.json({ ok: true, siteSession: { sessionId, workspaceId: 'owned-workspace' } })
  }
  for (let i = 0; i < 2; i++)
    assert.equal(
      await siteSessionAhead({
        config,
        seatDoor: {},
        site,
        email: 'owner@example.test',
        sessionId,
        fetchImpl
      }),
      sessionId
    )
  assert.deepEqual(JSON.parse(calls[0].body), {
    role: 'owner',
    email: 'owner@example.test',
    folders: ['/site/demo'],
    site: 'demo.example.test',
    siteSession: { sessionId, agentPreset: 'designer-emdash' }
  })
  assert.equal(calls[0].body, calls[1].body)
  assert.notEqual(calls[0].headers['x-seat-nonce'], calls[1].headers['x-seat-nonce'])
  assert.ok(calls.every((c) => c.headers['x-seat-signature']))
})

test('an unavailable or older signed site allocator never falls back to a random browser chat', async () => {
  for (const response of [
    Response.json({ ok: true, token: 'test-only' }),
    Response.json({ code: 'NO_ALLOCATOR' }, { status: 404 }),
    Response.json({ siteSession: { sessionId: 'foreign' } })
  ]) {
    let calls = 0
    const result = await siteSessionAhead({
      config,
      seatDoor: {},
      site,
      email: 'owner@example.test',
      sessionId,
      fetchImpl: async (url) => {
        calls++
        assert.equal(url, 'https://lane.test/gateway/seat/session')
        return response
      }
    })
    assert.equal(result, null)
    assert.equal(calls, 1)
  }
})

async function baselineServer(t, items, mode = 'baseline') {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  t.after(() => {
    for (const socket of server.clients) socket.terminate()
    server.close()
  })
  server.on('connection', (socket, request) => {
    assert.equal(request.url, '/demo.example.test/api/remote.mux')
    assert.equal(request.headers.cookie, 'dsh_gateway_token=test-only')
    socket.on('message', (raw) => {
      const frame = JSON.parse(String(raw))
      assert.equal(frame.endpoint, 'workspace/follow')
      assert.deepEqual(frame.payload, { args: {} })
      if (mode === 'close') return socket.close()
      if (mode === 'silent') return
      socket.send(
        JSON.stringify({
          type: 'item',
          streamId: frame.streamId,
          value: { type: 'baseline', value: { items, archivedSessionIds: [] } }
        })
      )
    })
  })
  return `http://127.0.0.1:${server.address().port}`
}

test('a server-held chat must appear in the same seat baseline and exact site folder', async (t) => {
  for (const [items, expected] of [
    [[{ workspaceId: 'owned', path: '/site/demo', sessionIds: [sessionId] }], true],
    [[{ workspaceId: 'foreign', path: '/site/other', sessionIds: [sessionId] }], false],
    [[{ workspaceId: 'owned', path: '/site/demo', sessionIds: ['another-chat'] }], false],
    [null, false]
  ]) {
    const origin = await baselineServer(t, items)
    assert.equal(
      await siteSessionBaseline({
        origin,
        mount: '/demo.example.test',
        token: 'test-only',
        label: 'demo',
        sessionId
      }),
      expected
    )
  }
})

test('closed and missing baselines fail closed with a bounded wait', async (t) => {
  for (const mode of ['close', 'silent']) {
    const origin = await baselineServer(t, [], mode)
    assert.equal(
      await siteSessionBaseline({
        origin,
        mount: '/demo.example.test',
        token: 'test-only',
        label: 'demo',
        sessionId,
        timeoutMs: 50
      }),
      false
    )
  }
})

test('prompt waits for the filtered baseline and never sends for a foreign folder', async (t) => {
  for (const [path, expected] of [
    ['/site/demo', true],
    ['/site/foreign', false]
  ]) {
    const origin = await baselineServer(t, [{ workspaceId: 'owned', path, sessionIds: [sessionId] }])
    let prompted = 0
    const result = await promptSiteSession({
      config: {
        defaultHost: 'local',
        hosts: new Map([['local', { dshOrigin: origin, seatSecret: 'test-secret' }]])
      },
      seatDoor: { mintSeatSession: async () => 'test-only' },
      site,
      email: 'owner@example.test',
      sessionId,
      requestId: 'held-prompt',
      text: 'Build the site',
      fetchImpl: async (url, init) => {
        assert.equal(url, origin + '/demo.example.test/api/session/prompt')
        const body = JSON.parse(init.body)
        assert.equal(body.payload.args.request.sessionId, sessionId)
        assert.equal(body.payload.args.request.requestId, 'held-prompt')
        prompted++
        return Response.json({
          type: 'server-response',
          rpcId: body.rpcId,
          result: { ok: true, value: { accepted: true } }
        })
      }
    })
    assert.equal(result, expected)
    assert.equal(prompted, expected ? 1 : 0)
  }
})
