import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hostCall, signHostCall } from '../../tracy-web/src/host/client.js'
import { buildApp } from '../src/app.js'
import { publicOriginOf, publicOriginEnv } from '../src/public-origin.js'
import { runProvisionJob } from '../src/provision.js'
import { runGoLiveJob } from '../src/webroot.js'

const origin = 'https://workspace.example:49127'
const config = {
  hostSecret: 'fixture-host-secret',
  privateRoot: '/private-sites',
  scriptsDir: '/fleet',
  logDir: '/logs'
}

test('the signed host body carries the web public origin, overriding a caller value without affecting other calls', async () => {
  const web = {
    origin,
    hosts: new Map([['fleet', { origin: 'http://host.internal', hostSecret: config.hostSecret }]])
  }
  for (const route of ['/provision', '/go-live', '/frame-policy', '/inventory']) {
    let captured
    const response = await hostCall(
      web,
      'fleet',
      route,
      { label: 'cafe', publicOrigin: 'https://forged.example' },
      {
        fetchImpl: async (_url, init) => {
          captured = JSON.parse(init.body)
          return Response.json({ ok: true })
        }
      }
    )
    assert.equal(response.ok, true)
    assert.equal(captured.publicOrigin, route === '/inventory' ? 'https://forged.example' : origin)
  }
})

test('public origin validation accepts arbitrary origin ports and IPv6 and refuses credentials, paths and injection', () => {
  for (const value of [origin, 'http://localhost:51237', 'https://[::1]:39101', 'https://workspace.example/'])
    assert.equal(publicOriginOf(value), new URL(value).origin)
  for (const value of [
    null,
    '',
    'https://user:pass@workspace.example',
    'https://workspace.example/path',
    'https://workspace.example?x=1',
    'https://workspace.example#x',
    'https://workspace.example:99999',
    'https://workspace.example\nHeader: bad',
    'file:///tmp/site'
  ])
    assert.throws(() => publicOriginOf(value))
  const inherited = { TRACY_ORIGIN: 'http://stale.example:8181', INTERNAL_URL: 'http://web:8080' }
  assert.equal(publicOriginEnv({ publicOrigin: origin }, inherited).TRACY_ORIGIN, origin)
  assert.equal(inherited.TRACY_ORIGIN, 'http://stale.example:8181')
  assert.equal(publicOriginEnv({}, inherited).TRACY_ORIGIN, inherited.TRACY_ORIGIN)
})

test('provision and publish scripts use each job origin without mutating the host environment', async () => {
  const before = process.env.TRACY_ORIGIN
  const calls = [],
    jobs = { put: async () => {} }
  const run = async (input) => {
    calls.push(input)
    return { code: 0, tail: [] }
  }
  await runProvisionJob({ jobId: 'build', body: { label: 'cafe', publicOrigin: origin }, config, jobs, run })
  await runGoLiveJob({
    jobId: 'publish',
    body: { label: 'cafe', op: 'draft', publicOrigin: 'http://localhost:51237' },
    config,
    jobs,
    run
  })
  assert.equal(calls[0].env.TRACY_ORIGIN, origin)
  assert.equal(calls[1].env.TRACY_ORIGIN, 'http://localhost:51237')
  assert.equal(process.env.TRACY_ORIGIN, before)
})

test('invalid signed origins are refused before provision, publish or frame-policy writes', async () => {
  let effects = 0
  const app = buildApp({
    config,
    jobs: {
      put: async () => {
        effects++
      },
      get: async () => null
    },
    run: async () => {
      effects++
      return { code: 0, tail: [] }
    }
  })
  for (const route of ['/provision', '/go-live', '/frame-policy']) {
    const path = `/_host${route}`,
      body = JSON.stringify({
        site: 'cafe.example',
        label: 'cafe',
        fresh: true,
        op: 'draft',
        publicOrigin: 'https://user:secret@evil.example'
      })
    const headers = await signHostCall({ secret: config.hostSecret, path, body })
    const response = await app.request(path, { method: 'POST', headers, body })
    assert.equal(response.status, 400)
  }
  assert.equal(effects, 0)
})

test('frame-policy requires a signed request and passes only a site label and private origin environment to its fixed helper', async () => {
  const calls = []
  const app = buildApp({
    config,
    run: async (input) => {
      calls.push(input)
      return { code: 0, tail: ['diagnostic', '{"state":"updated"}'] }
    }
  })
  const path = '/_host/frame-policy',
    body = JSON.stringify({ label: 'cafe', publicOrigin: origin })
  assert.equal((await app.request(path, { method: 'POST', body })).status, 403)
  assert.equal(calls.length, 0)
  const headers = await signHostCall({ secret: config.hostSecret, path, body })
  const response = await app.request(path, { method: 'POST', headers, body })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { state: 'updated' })
  assert.deepEqual(calls[0].args, ['/fleet/webroot/site-frame-policy.sh', '/private-sites', 'cafe'])
  assert.equal(calls[0].env.TRACY_ORIGIN, origin)
})
