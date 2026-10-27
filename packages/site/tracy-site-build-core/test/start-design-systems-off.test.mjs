/**
 * Tracy's design-system switch at the Build's own start door. A WordPress or EmDash site is created
 * bare and dressed here, so a design system named to `start` never passed Tracy's create check:
 * with the switch off (or unreadable) the door refuses it; a template — one this plugin restores,
 * or one Tracy's plan answered as a template even when its id is also a library id — still starts.
 */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { makeSiteBuildHost } from '../src/host/host.ts'

async function listen(handler) {
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, origin: `http://127.0.0.1:${server.address().port}` }
}

/** A lane whose catalog lists two library ids, belonging to a Tracy at `tracyOrigin`. */
async function lane(root, tracyOrigin) {
  const catalog = path.join(root, 'catalog.json')
  writeFileSync(catalog, JSON.stringify({ systems: [{ id: 'airbnb' }, { id: 'ja-kinetic' }] }))
  const sessions = [{ id: 'session-one', header: { cwd: root }, append() {} }]
  const routes = []
  const ctx = {
    webServer: { register: (route) => (routes.push(route), () => {}) },
    tools: { register: () => () => {} },
    effect: (fn) => fn(),
    get: (name) =>
      name === 'sessions'
        ? { list: () => sessions }
        : name === 'agents'
          ? { get: () => ({ inject() {}, followup() {} }) }
          : { warn() {} }
  }
  makeSiteBuildHost({
    name: 'tracy-site-build-wordpress',
    platform: 'wordpress',
    platformName: 'WordPress',
    stages: ['seed'],
    tool: 'tracy_site_build_wordpress',
    makeStages: () => ({ seed: () => ({ status: 'done' }) })
  })(ctx, {
    siteDir: root,
    chrome: null,
    loopback: 'http://127.0.0.1:1',
    catalog,
    libraryCache: path.join(root, 'no-cache'),
    tracyOrigin
  })
  const { server, origin } = await listen((req, res) => routes[0].handler(req, res))
  let n = 0
  const start = (id, extra = {}) =>
    fetch(`${origin}/api/tracy-site-build-wordpress/start?session=session-one`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id,
        platform: 'wordpress',
        targetSiteKey: `site-${++n}.localhost`,
        answers: { name: 'Acme' },
        ...extra
      })
    })
  return { server, start }
}

async function withLane(shown, fn) {
  const root = mkdtempSync(path.join(tmpdir(), 'build-switch-'))
  mkdirSync(path.join(root, '.webroot'))
  const tracy =
    shown === 'unreachable'
      ? null
      : await listen((req, res) => {
          res.writeHead(req.url === '/api/design-systems' ? 200 : 404, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ shown }))
        })
  const { server, start } = await lane(root, tracy ? tracy.origin : 'http://127.0.0.1:1')
  try {
    await fn(start)
  } finally {
    server.close()
    tracy?.server.close()
    rmSync(root, { recursive: true, force: true })
  }
}

const TEMPLATE_PLAN = {
  requestedDesign: 'ja-kinetic',
  effectiveDesign: 'ja-kinetic',
  workflow: 'template',
  fallback: false,
  registryRevision: 'template'
}

test('switch off: start refuses a design system, and still starts a template', async () => {
  await withLane(false, async (start) => {
    const refused = await start('airbnb')
    assert.equal(refused.status, 400)
    assert.equal((await refused.json()).code, 'DESIGN_SYSTEMS_OFF')

    assert.equal((await start('tracy-business')).status, 202, 'a template this plugin restores')
    const kinetic = await start('ja-kinetic', { designPlan: TEMPLATE_PLAN })
    assert.equal(kinetic.status, 202, 'a template card whose id is also a library id')
    // Without Tracy's word that it is a template, the same id is the library's.
    assert.equal((await start('ja-kinetic')).status, 400)
  })
})

test('a switch that cannot be read is off', async () => {
  await withLane('unreachable', async (start) => {
    assert.equal((await start('airbnb')).status, 400)
  })
})

test('switch on: start builds a design system as before', async () => {
  await withLane(true, async (start) => {
    assert.equal((await start('airbnb')).status, 202)
  })
})
