// `POST /_host/emdash-content` (src/emdash-content.js): a list of the site's own MCP calls on its entries, menus,
// settings and terms, made in one `docker exec` inside the site's container with the token only it reads. Only the
// content tools are allowed; anything else is refused before docker runs.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { signHostCall } from '../../tracy-web/src/host/client.js'
import { buildApp } from '../src/app.js'
import {
  BATCH_SCRIPT,
  CONTENT_TOOLS,
  MAX_CALLS,
  batchArgv,
  emdashContentCalls
} from '../src/emdash-content.js'
import { MCP_TOKEN_PRELUDE } from '../src/emdash-media.js'

const LABEL = 'emd1'

function hostConfig() {
  const dir = (name) => mkdtempSync(path.join(tmpdir(), `emdash-content-${name}-`))
  const privateRoot = dir('private')
  mkdirSync(path.join(privateRoot, LABEL, 'data'), { recursive: true })
  mkdirSync(path.join(privateRoot, 'plainwp'), { recursive: true })
  return {
    hostName: 'local',
    hostSecret: 'host-secret',
    sitesRoot: dir('sites'),
    privateRoot,
    scriptsDir: '/opt/tracy-fleet',
    jobsDir: dir('jobs'),
    logDir: dir('logs'),
    cloudflare: null
  }
}

/** A docker that records each call and answers the batch with one MCP reply per request, from `reply(request)`. */
function fakeDocker(reply) {
  const calls = []
  return {
    calls,
    run: async (input) => {
      calls.push(input)
      if (typeof reply !== 'function') return { code: 0, tail: reply }
      const requests = JSON.parse(input.stdin)
      const out = requests.map((r) => reply(r))
      return {
        code: 0,
        tail: ['something the container printed first', `TRACY_MCP_BATCH ${JSON.stringify(out)}`]
      }
    }
  }
}
const ok = (request, data) => ({
  status: 200,
  body: `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { content: [{ type: 'text', text: JSON.stringify(data) }] } })}`
})

test('the calls go in one exec in <label>-web-1, in order, each answered on its own', async () => {
  const config = hostConfig()
  const docker = fakeDocker((r) =>
    r.params.name === 'content_update'
      ? ok(r, { item: { id: 'e1', _rev: 'r2' } })
      : r.params.name === 'content_publish'
        ? {
            status: 200,
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: r.id,
              result: { isError: true, content: [{ type: 'text', text: 'stale _rev' }] }
            })
          }
        : ok(r, { item: { id: 'e1', data: { title: 'Home' }, _rev: 'r1' } })
  )
  const calls = [
    { tool: 'content_get', args: { collection: 'pages', id: 'home', locale: 'en' } },
    {
      tool: 'content_update',
      args: { collection: 'pages', id: 'e1', data: { title: 'Harbour Kitchen' }, _rev: 'r1' }
    },
    { tool: 'content_publish', args: { collection: 'pages', id: 'e1', _rev: 'r1' } }
  ]
  const done = await emdashContentCalls({ body: { label: LABEL, calls }, config, run: docker.run })
  assert.equal(done.ok, true)
  assert.equal(docker.calls.length, 1)
  assert.deepEqual(docker.calls[0].args, batchArgv(`${LABEL}-web-1`))
  assert.deepEqual(docker.calls[0].args.slice(0, 5), ['exec', '-i', '-u', '0', `${LABEL}-web-1`])
  const sent = JSON.parse(docker.calls[0].stdin)
  assert.deepEqual(
    sent.map((r) => [r.method, r.params.name]),
    [
      ['tools/call', 'content_get'],
      ['tools/call', 'content_update'],
      ['tools/call', 'content_publish']
    ]
  )
  assert.deepEqual(sent[1].params.arguments.data, { title: 'Harbour Kitchen' })
  assert.deepEqual(done.results[0], {
    ok: true,
    data: { item: { id: 'e1', data: { title: 'Home' }, _rev: 'r1' } }
  })
  assert.equal(done.results[1].ok, true)
  assert.deepEqual(done.results[2], { ok: false, code: 'TOOL_FAILED', detail: 'stale _rev' })
})

test('refused before docker runs: not EmDash, a tool that is no content tool, too many calls, no list, args that are no object', async () => {
  const config = hostConfig()
  const docker = fakeDocker(() => ({ status: 200, body: '{}' }))
  const one = [{ tool: 'content_get', args: { collection: 'pages', id: 'home' } }]
  const go = (body) => emdashContentCalls({ body, config, run: docker.run })
  assert.equal((await go({ label: 'plainwp', calls: one })).code, 'NOT_EMDASH')
  for (const tool of [
    'content_delete',
    'schema_delete_collection',
    'media_upload',
    'media_delete',
    'site_import_start',
    'user_create'
  ])
    assert.equal((await go({ label: LABEL, calls: [{ tool, args: {} }] })).code, 'BAD_REQUEST', tool)
  assert.equal((await go({ label: LABEL, calls: [] })).code, 'BAD_REQUEST')
  assert.equal((await go({ label: LABEL })).code, 'BAD_REQUEST')
  assert.equal(
    (await go({ label: LABEL, calls: [{ tool: 'content_get', args: ['x'] }] })).code,
    'BAD_REQUEST'
  )
  const many = Array.from({ length: MAX_CALLS + 1 }, () => one[0])
  assert.equal((await go({ label: LABEL, calls: many })).code, 'BAD_REQUEST')
  assert.equal(docker.calls.length, 0)
  // The allowed list writes words, menus and settings only: nothing that deletes, imports or changes a schema, and of the
  // media library only its reads.
  for (const tool of CONTENT_TOOLS)
    assert.doesNotMatch(tool, /delete|schema|import|export|user|plugin|upload|create/)
  assert.deepEqual(
    [...CONTENT_TOOLS].filter((tool) => tool.startsWith('media_')),
    ['media_get', 'media_list']
  )
})

test("the site's refusals are named: no token, no answer, a list that is not the calls' length", async () => {
  const config = hostConfig()
  const one = [{ tool: 'settings_get', args: {} }]
  const go = (tail) =>
    emdashContentCalls({ body: { label: LABEL, calls: one }, config, run: fakeDocker(tail).run })
  assert.equal((await go(['TRACY_MCP_ERR NO_TOKEN the agent token file is not present'])).code, 'NO_TOKEN')
  assert.equal((await go(['TRACY_MCP_ERR SITE connect ECONNREFUSED'])).code, 'SITE_UNREACHABLE')
  assert.equal((await go([])).code, 'SITE_UNREACHABLE')
  assert.equal((await go(['TRACY_MCP_BATCH []'])).code, 'NOT_MCP')
  const refused = await go([`TRACY_MCP_BATCH ${JSON.stringify([{ status: 401, body: 'no' }])}`])
  assert.equal(refused.ok, true)
  assert.equal(refused.results[0].code, 'SITE_REFUSED')
})

test('🔒 the in-container script reads the token as the media upload does, and says so when there is none', () => {
  assert.ok(BATCH_SCRIPT.startsWith(MCP_TOKEN_PRELUDE))
  // Run here, where no token is mounted: the script itself parses and answers NO_TOKEN before any call.
  const ran = spawnSync(process.execPath, ['-e', BATCH_SCRIPT], { input: '[]', encoding: 'utf8' })
  assert.match(ran.stdout, /^TRACY_MCP_ERR NO_TOKEN/)
})

test('POST /_host/emdash-content: 200 with the results; a refused label 400; a tool outside the list 400', async () => {
  const config = hostConfig()
  const docker = fakeDocker((r) => ok(r, { title: 'JA Diner' }))
  const app = buildApp({ config, run: docker.run })
  const post = async (payload) => {
    const urlPath = '/_host/emdash-content'
    const body = JSON.stringify(payload)
    const headers = await signHostCall({ secret: 'host-secret', path: urlPath, body })
    return app.fetch(new Request(`http://tracy-host.test${urlPath}`, { method: 'POST', headers, body }))
  }
  const good = await post({ label: LABEL, calls: [{ tool: 'settings_get', args: {} }] })
  assert.equal(good.status, 200)
  assert.deepEqual((await good.json()).results, [{ ok: true, data: { title: 'JA Diner' } }])
  assert.equal((await post({ label: '../etc', calls: [{ tool: 'settings_get' }] })).status, 400)
  assert.equal((await post({ label: LABEL, calls: [{ tool: 'content_delete', args: {} }] })).status, 400)
})
