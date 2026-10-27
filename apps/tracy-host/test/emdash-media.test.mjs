// `POST /_host/emdash-media` (src/emdash-media.js): one picture into an EmDash site's media library,
// through the site's own `media_upload` MCP tool run INSIDE its container — the token never leaves it.
// Docker is a fake that plays the in-container script's contract.
//
//   node --test apps/tracy-host/test/emdash-media.test.mjs
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import * as siteTools from '../../../packages/tools/tracy-site-tools/src/host/exec.mjs'
import { signHostCall } from '../../tracy-web/src/host/client.js'
import { buildApp } from '../src/app.js'
import { EMDASH_MEDIA_MAX_BYTES, MCP_SCRIPT, emdashMediaUpload, mcpArgv } from '../src/emdash-media.js'

const LABEL = 'emd1'
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)])

/** A host config whose private root holds one EmDash site (`data/`, `siteShape`) and one that is not. */
function hostConfig() {
  const dir = (name) => mkdtempSync(path.join(tmpdir(), `emdash-media-${name}-`))
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

/** A docker that records each call and answers with `lines` (the script's stdout, split as `runScript` does). */
function fakeDocker(lines) {
  const calls = []
  return {
    calls,
    run: async (input) => {
      calls.push(input)
      return { code: 0, tail: typeof lines === 'function' ? lines(input) : lines }
    }
  }
}

const sse = (result) => [
  'TRACY_MCP 200',
  'event: message',
  `data: ${JSON.stringify({ jsonrpc: '2.0', id: 1, result })}`
]
const uploaded = (item, extra = {}) => ({
  content: [{ type: 'text', text: JSON.stringify({ item, ...extra }) }]
})

test('🔒 the in-container script and its argv are the site tools’ own, byte for byte', () => {
  assert.equal(MCP_SCRIPT, siteTools.MCP_SCRIPT)
  assert.deepEqual(mcpArgv(`${LABEL}-web-1`), siteTools.mcpArgv({ container: `${LABEL}-web-1` }))
})

test('uploads through media_upload in <label>-web-1, the bytes on stdin, and answers the item', async () => {
  const docker = fakeDocker(sse(uploaded({ id: '01MEDIA', url: '/_emdash/api/media/file/01MEDIA.png' })))
  const out = await emdashMediaUpload({
    body: {
      label: LABEL,
      filename: 'tracy-abc.png',
      contentType: 'image/png',
      base64: PNG.toString('base64'),
      alt: 'Terrace'
    },
    config: hostConfig(),
    run: docker.run
  })
  assert.deepEqual(out, {
    ok: true,
    id: '01MEDIA',
    url: '/_emdash/api/media/file/01MEDIA.png',
    deduplicated: false
  })
  assert.equal(docker.calls.length, 1)
  const call = docker.calls[0]
  assert.equal(call.script, 'docker')
  assert.deepEqual(call.args, mcpArgv(`${LABEL}-web-1`))
  // Nothing about the picture or a token on argv: the request is stdin only.
  assert.ok(!call.args.join(' ').includes(PNG.toString('base64')))
  const rpc = JSON.parse(call.stdin)
  assert.equal(rpc.method, 'tools/call')
  assert.equal(rpc.params.name, 'media_upload')
  assert.deepEqual(rpc.params.arguments, {
    filename: 'tracy-abc.png',
    contentType: 'image/png',
    base64: PNG.toString('base64'),
    alt: 'Terrace'
  })
})

test('the same bytes again come back as the item already in the library', async () => {
  const docker = fakeDocker(sse(uploaded({ id: '01MEDIA', url: '/u.png' }, { deduplicated: true })))
  const out = await emdashMediaUpload({
    body: { label: LABEL, filename: 'a.png', contentType: 'image/png', base64: PNG.toString('base64') },
    config: hostConfig(),
    run: docker.run
  })
  assert.deepEqual(out, { ok: true, id: '01MEDIA', url: '/u.png', deduplicated: true })
})

test('refused before docker runs: not EmDash, a type that is not PNG/JPEG/WebP, bytes that are not that type, too large, a bad name', async () => {
  const config = hostConfig()
  const cases = [
    [
      { label: 'plainwp', filename: 'a.png', contentType: 'image/png', base64: PNG.toString('base64') },
      'NOT_EMDASH'
    ],
    [
      { label: LABEL, filename: 'a.gif', contentType: 'image/gif', base64: PNG.toString('base64') },
      'BAD_PICTURE'
    ],
    [
      { label: LABEL, filename: 'a.png', contentType: 'image/png', base64: JPG.toString('base64') },
      'BAD_PICTURE'
    ],
    [{ label: LABEL, filename: 'a.png', contentType: 'image/png', base64: '' }, 'BAD_PICTURE'],
    [
      { label: LABEL, filename: '../a.png', contentType: 'image/png', base64: PNG.toString('base64') },
      'BAD_PICTURE'
    ],
    [
      {
        label: LABEL,
        filename: 'a.png',
        contentType: 'image/png',
        base64: Buffer.concat([PNG, Buffer.alloc(EMDASH_MEDIA_MAX_BYTES)]).toString('base64')
      },
      'TOO_LARGE'
    ]
  ]
  for (const [body, code] of cases) {
    const docker = fakeDocker([])
    const out = await emdashMediaUpload({ body, config, run: docker.run })
    assert.equal(out.ok, false, JSON.stringify(body).slice(0, 80))
    assert.equal(out.code, code)
    assert.equal(docker.calls.length, 0)
  }
})

test('the site’s refusals are named: no token, the tool said no, an HTTP error, nothing readable', async () => {
  const config = hostConfig()
  const body = { label: LABEL, filename: 'a.jpg', contentType: 'image/jpeg', base64: JPG.toString('base64') }
  const said = async (lines) => emdashMediaUpload({ body, config, run: fakeDocker(lines).run })
  assert.equal((await said(['TRACY_MCP_ERR NO_TOKEN the agent token file is not present'])).code, 'NO_TOKEN')
  assert.equal(
    (await said(sse({ isError: true, content: [{ type: 'text', text: 'scope media:write missing' }] }))).code,
    'TOOL_FAILED'
  )
  assert.equal((await said(['TRACY_MCP 403', 'forbidden'])).code, 'SITE_REFUSED')
  assert.equal((await said([])).code, 'SITE_UNREACHABLE')
  assert.equal((await said(sse(uploaded({ url: '/x.png' })))).code, 'NO_ITEM')
})

async function signed(app, urlPath, payload) {
  const body = JSON.stringify(payload)
  const headers = await signHostCall({ secret: 'host-secret', path: urlPath, body })
  return app.fetch(new Request(`http://tracy-host.test${urlPath}`, { method: 'POST', headers, body }))
}

test('POST /_host/emdash-media: 200 with the item; a refused label 400; a refusal its status', async () => {
  const config = hostConfig()
  const jobs = { put: async () => {}, get: async () => null }
  const ok = buildApp({ config, jobs, run: fakeDocker(sse(uploaded({ id: '01M', url: '/m.png' }))).run })
  const res = await signed(ok, '/_host/emdash-media', {
    label: LABEL,
    filename: 'a.png',
    contentType: 'image/png',
    base64: PNG.toString('base64')
  })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, id: '01M', url: '/m.png', deduplicated: false })
  const bad = await signed(ok, '/_host/emdash-media', { label: '../x', filename: 'a.png' })
  assert.equal(bad.status, 400)
  const notEmdash = await signed(ok, '/_host/emdash-media', {
    label: 'plainwp',
    filename: 'a.png',
    contentType: 'image/png',
    base64: PNG.toString('base64')
  })
  assert.equal(notEmdash.status, 404)
  assert.equal((await notEmdash.json()).code, 'NOT_EMDASH')
})
