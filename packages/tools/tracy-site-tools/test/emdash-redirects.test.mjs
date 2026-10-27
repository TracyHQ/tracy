/**
 * The redirect door of `tracy_emdash` (v6, 29/09/2026): Tracy-side redirect_list / redirect_create /
 * redirect_delete over EmDash's REST redirect store, exec stubbed at the `redirects` seam.
 *
 *   node --test packages/tools/tracy-site-tools/test/emdash-redirects.test.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { createEmdashState, runEmdashTool } from '../src/host/emdash-call.mjs'
import {
  EMDASH_DESCRIPTION,
  emdashRedirectReply,
  emdashRedirectRequest,
  validateRedirectArgs
} from '../src/host/emdash.mjs'
import { REDIRECTS_SCRIPT, parseRedirectsExec, redirectsArgv } from '../src/host/exec.mjs'

const ID = '01M36TA83763RSVSN5R28DZ0AZ'
const ok = (data) => emdashRedirectReply(200, JSON.stringify({ success: true, data }))

function fake(reply = () => ok({ items: [] })) {
  const requests = []
  return { requests, redirects: async (r) => (requests.push(r), reply(r)) }
}
const run = (f, args, extra = {}) =>
  runEmdashTool({
    args,
    site: { label: 'ed-abc123' },
    artifact: { locales: { default: 'en' } },
    mcp: async () => assert.fail('a redirect never goes over MCP'),
    redirects: f.redirects,
    state: createEmdashState(),
    sessionId: 's',
    turn: 1,
    sleep: async () => {},
    ...extra
  })

test('redirect_create: POST body {source, destination, type} and the record comes back', async () => {
  const f = fake(() => ok({ id: ID, source: '/a', destination: '/b', type: 302 }))
  const out = await run(f, {
    tool: 'redirect_create',
    arguments: { source: '/a', destination: '/b', type: 302 }
  })
  assert.equal(out.ok, true)
  assert.equal(out.result.id, ID)
  assert.deepEqual(f.requests, [
    { method: 'POST', path: '', body: JSON.stringify({ source: '/a', destination: '/b', type: 302 }) }
  ])
})

test('redirect_create: type defaults to 301', () => {
  assert.equal(
    JSON.parse(emdashRedirectRequest('redirect_create', { source: '/a', destination: '/b' }).body).type,
    301
  )
})

test('redirect_create refuses a loop, a non-path, a wrong type before any exec', async () => {
  const f = fake()
  for (const a of [
    { source: '/a', destination: '/a' },
    { source: 'a', destination: '/b' },
    { source: '//evil.com', destination: '/b' },
    { source: '/a', destination: 'https://x.com/' },
    { source: '/a', destination: '/b', type: 307 },
    { source: '/a/../b', destination: '/c' },
    {}
  ]) {
    const out = await run(f, { tool: 'redirect_create', arguments: a })
    assert.equal(out.code, 'BAD_CALL', JSON.stringify(a))
  }
  assert.equal(f.requests.length, 0)
})

test('redirect_list: GET, optional filters only in a safe query', async () => {
  const f = fake(() => ok({ items: [{ id: ID, source: '/a' }] }))
  const out = await run(f, { tool: 'redirect_list', arguments: { limit: 10, search: 'a b' } })
  assert.equal(out.ok, true)
  assert.deepEqual(f.requests[0], { method: 'GET', path: '?limit=10&search=a+b', body: '' })
  assert.deepEqual(emdashRedirectRequest('redirect_list', {}), { method: 'GET', path: '', body: '' })
})

test("redirect_delete asks first (D34), then deletes on the customer's yes", async () => {
  const f = fake(() => ok({ deleted: true }))
  let asked = false
  const memory = {
    confirmAsked: () => (asked = true),
    confirmed: () => asked,
    turnOf: () => 1
  }
  const first = await run(f, { tool: 'redirect_delete', arguments: { id: ID } }, { memory })
  assert.equal(first.code, 'CONFIRM_FIRST')
  assert.match(first.target, new RegExp(ID))
  assert.equal(f.requests.length, 0)
  const second = await run(f, { tool: 'redirect_delete', arguments: { id: ID }, confirm: true }, { memory })
  assert.equal(second.ok, true)
  assert.deepEqual(f.requests, [{ method: 'DELETE', path: `/${ID}`, body: '' }])
})

test('redirect_delete refuses an id that is not a redirect id', () => {
  assert.equal(validateRedirectArgs('redirect_delete', { id: '../mcp' })?.code, 'BAD_CALL')
  assert.equal(validateRedirectArgs('redirect_delete', { id: ID }), null)
})

test("EmDash's refusal keeps its class: [NOT_FOUND] → emdash NOT_FOUND", async () => {
  const f = fake(() =>
    emdashRedirectReply(
      404,
      JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Redirect "x" not found' } })
    )
  )
  const memory = { confirmAsked() {}, confirmed: () => true, turnOf: () => 1 }
  const out = await run(f, { tool: 'redirect_delete', arguments: { id: ID }, confirm: true }, { memory })
  assert.equal(out.ok, false)
  assert.equal(out.code, 'TOOL_FAILED')
  assert.equal(out.emdash, 'NOT_FOUND')
})

test('emdashRedirectReply: a non-JSON body is a refusal, never a success', () => {
  const r = emdashRedirectReply(502, '<html>bad gateway</html>')
  assert.equal(r.ok, false)
  assert.match(r.error, /^\[REDIRECT_ERROR\]/)
})

test('redirectsArgv / parseRedirectsExec: root exec, method and suffix as argv, the script holds no request data', () => {
  const argv = redirectsArgv({ container: 'x-web-1', method: 'DELETE', path: `/${ID}` })
  assert.deepEqual(argv, [
    'exec',
    '-i',
    '-u',
    '0',
    'x-web-1',
    'node',
    '-e',
    REDIRECTS_SCRIPT,
    'DELETE',
    `/${ID}`
  ])
  assert.ok(!REDIRECTS_SCRIPT.includes(ID))
  assert.ok(REDIRECTS_SCRIPT.includes('/_emdash/api/redirects'))
  assert.deepEqual(parseRedirectsExec('TRACY_REDIRECTS 201\n{"success":true}'), {
    ok: true,
    status: 201,
    body: '{"success":true}'
  })
  assert.equal(parseRedirectsExec('TRACY_REDIRECTS_ERR NO_TOKEN missing').kind, 'no-token')
  assert.equal(parseRedirectsExec('').kind, 'transport')
})

test('the description names the door and the no-rebuild SEO road within 1,500 chars', () => {
  assert.ok(EMDASH_DESCRIPTION.length <= 1500, String(EMDASH_DESCRIPTION.length))
  assert.match(EMDASH_DESCRIPTION, /redirect_create \{source, destination, type:301\|302\}/)
  assert.match(EMDASH_DESCRIPTION, /settings_update \{seo:\{/)
})
