import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'
import { mcpRoutes, MCP_VERSIONS } from '../src/mcp/route.js'
import { mcpTools, toolRequest } from '../src/mcp/tools.js'
import { buildOpenApi } from '../src/api-reference/spec.js'
import { APPLY_ACTIONS, applyToolsetLabel } from '../src/sites/route.js'
import { V1_ROUTES } from '../src/lib/v1-routes.js'
import { APPLY_ACTION_DOCS } from '../src/api-reference/actions.js'

const config = { apiOrigin: 'https://api.tracy.test', origin: 'https://tracy.test' }
const document = buildOpenApi({
  origin: config.apiOrigin,
  applyActions: APPLY_ACTIONS,
  toolsetOf: applyToolsetLabel,
  publicApi: true
})
const entries = mcpTools(document)
const entryFor = (method, tail) =>
  entries.find((entry) => entry.row.method === method && entry.row.path.endsWith(tail))

function harness({ authError = null, apiStatus = 200, apiBody = { ok: true }, throws = false } = {}) {
  const calls = []
  const api = new Hono()
  api.all('*', async (c) => {
    calls.push({ url: c.req.url, method: c.req.method, headers: c.req.header(), body: await c.req.text() })
    if (throws) throw new Error('private exception')
    c.header('tracy-apply-id', 'receipt-1')
    c.header('retry-after', '20')
    return c.json(apiBody, apiStatus)
  })
  const app = mcpRoutes({
    config,
    api,
    document,
    resolvePrincipal: async () =>
      authError
        ? { error: Response.json({ code: authError }, { status: 401 }) }
        : { key: { keyId: 'unit-test' } },
    isApiHost: (c) => new URL(c.req.url).hostname === 'api.tracy.test'
  })
  const send = (message, extra = {}) =>
    app.request(`${config.apiOrigin}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer unit-test',
        ...extra
      },
      body: JSON.stringify(message)
    })
  return { app, send, calls }
}
const call = (entry, args = {}) => ({
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: entry.tool.name, arguments: args }
})

test('MCP catalogue exposes public REST operations with self-contained schemas and honest write hints', () => {
  assert.equal(entries.length, V1_ROUTES.length - 1 + 20)
  assert.equal(new Set(entries.map((entry) => entry.tool.name)).size, entries.length)
  for (const { tool, row } of entries) {
    assert.equal(tool.annotations.readOnlyHint, !row.writes)
    assert.equal(tool.annotations.destructiveHint, row.writes)
    assert.ok(tool.name.length <= 64)
    assert.ok(!JSON.stringify(tool.inputSchema).includes('"$ref"'))
    assert.deepEqual(tool.securitySchemes, [{ type: 'oauth2', scopes: ['content'] }])
  }
})

test('MCP initialization, discovery, ping and tool listing negotiate supported versions', async () => {
  const { send } = harness()
  for (const version of [...MCP_VERSIONS, '1999-01-01']) {
    const response = await send({
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: { protocolVersion: version }
    })
    assert.equal(
      (await response.json()).result.protocolVersion,
      MCP_VERSIONS.includes(version) ? version : MCP_VERSIONS[0]
    )
  }
  assert.deepEqual(
    (await (await send({ jsonrpc: '2.0', id: 2, method: 'server/discover' })).json()).result
      .supportedVersions,
    MCP_VERSIONS
  )
  assert.deepEqual((await (await send({ jsonrpc: '2.0', id: 2, method: 'ping' })).json()).result, {})
  assert.equal(
    (await (await send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).json()).result.tools.length,
    entries.length
  )
})

test('MCP requires an authenticated principal even for discovery and listing, and advertises OAuth metadata', async () => {
  const { send, calls } = harness({ authError: 'KEY_REVOKED' })
  const res = await send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  assert.equal(res.status, 401)
  assert.match(res.headers.get('www-authenticate'), /oauth-protected-resource/)
  assert.match(res.headers.get('cache-control'), /no-store/)
  assert.equal(calls.length, 0)
})

test('MCP rejects origins, incompatible media types, Accept and protocol versions', async () => {
  const { send, calls } = harness()
  for (const [headers, status] of [
    [{ origin: 'https://customer.tracy.test' }, 403],
    [{ origin: 'null' }, 403],
    [{ origin: 'https://www.cursor.com.evil.test' }, 403],
    [{ origin: 'http://localhost:8787' }, 403],
    [{ 'content-type': 'application/json-evil' }, 415],
    [{ 'content-type': 'text/plain' }, 415],
    [{ accept: 'application/json' }, 406],
    [{ 'mcp-protocol-version': '1999-01-01' }, 400]
  ])
    assert.equal((await send({ jsonrpc: '2.0', id: 1, method: 'ping' }, headers)).status, status)
  assert.equal(calls.length, 0)
})

test('MCP parses one bounded JSON-RPC message and rejects invalid envelopes without dispatch', async () => {
  const { send, app, calls } = harness()
  for (const message of [null, [], {}, { jsonrpc: '2.0', method: 'ping', id: {} }])
    assert.equal((await send(message)).status, 400)
  assert.equal((await send({ jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202)
  assert.equal(
    (await send({ jsonrpc: '2.0', id: 1, method: 'tools/list', padding: 'x'.repeat(270_000) })).status,
    413
  )
  const malformed = await app.request(`${config.apiOrigin}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: '{'
  })
  assert.equal((await malformed.json()).error.code, -32700)
  assert.equal(calls.length, 0)
})

test('MCP methods, unknown tools and invalid arguments have protocol errors, never a site call', async () => {
  const { send, calls } = harness()
  assert.equal((await (await send({ jsonrpc: '2.0', id: 1, method: 'missing' })).json()).error.code, -32601)
  assert.equal(
    (await (await send({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'missing' } })).json())
      .error.code,
    -32602
  )
  const entry = entryFor('GET', '/pages')
  for (const args of [
    {},
    { path: { key: 'site.test' }, authorization: 'other' },
    { path: { key: 'site.test' }, header: { cookie: 'x' } },
    { path: { key: 'site.test' }, query: { limit: 1 } }
  ])
    assert.equal((await (await send(call(entry, args))).json()).error.code, -32602)
  assert.equal(calls.length, 0)
})

test('MCP builds only a declared local REST route and refuses traversal, URL injection and undeclared headers', () => {
  const entry = entryFor('GET', '/contents/:id')
  for (const id of ['.', '..', '%2e%2e', 'a/b', 'a\\b', 'x?y', 'x#y', ' ', 'https://evil.test'])
    assert.throws(() => toolRequest(entry, { path: { key: 'site.test', id } }, config.apiOrigin))
  const built = toolRequest(
    entry,
    { path: { key: 'site.test', id: 'content:1' }, query: { fields: 'title,url' } },
    config.apiOrigin
  )
  assert.equal(built.url.origin, config.apiOrigin)
  assert.equal(built.url.pathname, '/v1/sites/site.test/contents/content%3A1')
})

test('MCP forwards only the credential, declared revision headers and body, returning the undo receipt', async () => {
  const { send, calls } = harness()
  const entry = entryFor('PATCH', '/records/:kind/:id')
  const args = {
    path: { key: 'site.test', kind: 'post', id: '42' },
    header: { 'If-Match': '"revision"', 'Tracy-Apply-Id': 'receipt-1' },
    body: { fields: { title: 'New title' } }
  }
  const res = await send(call(entry, args), {
    cookie: 'private-cookie',
    'x-tracy-actor': 'spoofed',
    'x-tracy-turn': 'spoofed'
  })
  const value = (await res.json()).result
  assert.equal(value.isError, false)
  assert.equal(value.structuredContent.headers['tracy-apply-id'], 'receipt-1')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers.authorization, 'Bearer unit-test')
  for (const header of ['cookie', 'x-tracy-actor', 'x-tracy-turn'])
    assert.equal(calls[0].headers[header], undefined)
  assert.equal(calls[0].headers['if-match'], '"revision"')
  assert.deepEqual(JSON.parse(calls[0].body), args.body)
})

test('MCP preserves conflicts and retry timing as tool errors; it never retries a write', async () => {
  const { send, calls } = harness({ apiStatus: 412, apiBody: { error: { code: 'REVISION_STALE' } } })
  const value = (
    await (
      await send(
        call(entryFor('POST', '/applies/:id/revert'), { path: { key: 'site.test', id: 'receipt-1' } })
      )
    ).json()
  ).result
  assert.equal(value.isError, true)
  assert.equal(value.structuredContent.status, 412)
  assert.equal(value.structuredContent.body.error.code, 'REVISION_STALE')
  assert.equal(value.structuredContent.headers['retry-after'], '20')
  assert.equal(calls.length, 1)
})

test('MCP rejects unsupported HTTP methods and never answers on the cowork or customer host', async () => {
  const { app } = harness()
  for (const method of ['GET', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'])
    assert.equal((await app.request(`${config.apiOrigin}/mcp`, { method })).status, 405)
  assert.equal((await app.request('https://tracy.test/mcp', { method: 'POST' })).status, 404)
})

test('MCP permits the exact documented Cursor web origin with a credential', async () => {
  const { send } = harness()
  assert.equal(
    (await send({ jsonrpc: '2.0', id: 1, method: 'ping' }, { origin: 'https://www.cursor.com' })).status,
    200
  )
})

test('MCP exposes every callable contract operation separately and omits the dispatcher and provisioning', async () => {
  const { send } = harness()
  const tools = (await (await send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).json()).result.tools
  const contracts = entries.filter((entry) => entry.contractOperation)
  assert.deepEqual(
    contracts.map((entry) => entry.contractOperation),
    APPLY_ACTION_DOCS['content.contract'].params.properties.operation.enum.filter((op) => op !== 'derive')
  )
  assert.ok(!tools.some((tool) => tool.name.endsWith('by_operation') || tool.name.endsWith('_derive')))
  for (const entry of contracts) {
    const tool = tools.find((tool) => tool.name === entry.tool.name)
    assert.ok(tool.description.includes(entry.contractOperation))
    assert.equal(tool.inputSchema.properties.path.properties.operation, undefined)
    assert.equal(tool.inputSchema.properties.body.properties.operation, undefined)
    assert.equal(tool.inputSchema.properties.body.additionalProperties, false)
    const read = entry.contractOperation === 'inspect' || /\.(plan|verify)$/.test(entry.contractOperation)
    assert.equal(tool.annotations.readOnlyHint, read)
    assert.equal(tool.annotations.destructiveHint, !read)
    assert.equal(tool.annotations.idempotentHint, read)
    if (entry.contractOperation !== 'apply')
      assert.equal(tool.inputSchema.properties.header.properties['If-Match'], undefined)
  }
})

test('MCP contract tools dispatch only their fixed operation and reject operation injection before REST', async () => {
  const { send, calls } = harness()
  for (const entry of entries.filter((entry) => entry.contractOperation)) {
    const body = Object.fromEntries(
      (entry.tool.inputSchema.properties.body.required ?? []).map((key) => [
        key,
        key === 'keep' ? ['en'] : key === 'changes' || key === 'translations' ? { hero: 'Hello' } : 'value'
      ])
    )
    const args = { path: { key: 'site.test' }, body }
    const response = await send(call(entry, args))
    assert.equal((await response.json()).result.isError, false)
    assert.equal(
      new URL(calls.at(-1).url).pathname,
      `/v1/sites/site.test/contract/${entry.contractOperation}`
    )
    assert.deepEqual(JSON.parse(calls.at(-1).body), body)
    const count = calls.length
    for (const injected of [
      { ...args, path: { ...args.path, operation: 'apply' } },
      { ...args, body: { ...body, operation: 'apply' } },
      { ...args, body: { ...body, operation: 'derive' } },
      { ...args, operation: 'apply' }
    ])
      assert.equal((await (await send(call(entry, injected))).json()).error.code, -32602)
    assert.equal(calls.length, count)
  }
  const old = await send({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'tracy_post_sites_by_key_contract_by_operation',
      arguments: { path: { key: 'site.test', operation: 'apply' } }
    }
  })
  assert.equal((await old.json()).error.code, -32602)
})

test('MCP contract apply requires changes and preserves declared revision and retry headers', async () => {
  const { send, calls } = harness()
  const entry = entries.find((entry) => entry.contractOperation === 'apply')
  const path = { key: 'site.test' }
  for (const args of [{ path }, { path, body: {} }, { path, body: { changes: {}, locale: 'en' } }])
    assert.equal((await (await send(call(entry, args))).json()).error.code, -32602)
  assert.equal(calls.length, 0)
  const args = {
    path,
    body: { changes: { hero: 'Hello' } },
    header: { 'If-Match': '"1:revision"', 'Idempotency-Key': 'retry-1' }
  }
  assert.equal((await (await send(call(entry, args))).json()).result.isError, false)
  assert.equal(calls[0].headers['if-match'], '"1:revision"')
  assert.equal(calls[0].headers['idempotency-key'], 'retry-1')
})
