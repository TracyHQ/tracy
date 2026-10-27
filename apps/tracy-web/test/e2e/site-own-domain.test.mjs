/**
 * The local pilot of a site's own domain: connect → check DNS → live → remove, through the real
 * doors, on one machine, with nothing outside it.
 *
 * WHAT IS REAL HERE
 *   - `apps/tracy-web` (`buildApp`) on a real HTTP port, on a PostgreSQL the stand started for this
 *     run, with its real DNS resolver pointed at the DNS server below (`TRACY_DNS_RESOLVER`);
 *   - `apps/tracy-host` (`buildApp`) with its real job store and runner, called with real signatures;
 *   - `go-live.sh`, `lib/site-lifecycle.sh` and `ingress_api.py` of the fleet, run as the host runs
 *     them;
 *   - the Publish tab (`PublishView` of `@tracy/core/site-tabs`, the plugin's own strings and its
 *     own stylesheet built the way the plugin builds it) in a real Chromium, pressed like a person.
 *
 * WHAT IS A STAND-IN, OWNED BY THIS RUN
 *   - DNS: an authoritative UDP server in this process, answering the records the test sets;
 *   - the tunnel provider: an HTTP server in this process that keeps one tunnel's ingress in memory
 *     (`TRACY_CF_API_BASE`) — no call leaves this machine, and any other outgoing request fails;
 *   - the host's firewall and docker: stand-ins on PATH (the site here has no containers);
 *   - the CMS: `GET /settings` reads none (its rows say so); only the Publish wizard's steps to Your domain are driven.
 *     Where the site's proxy asks it for a page (`siteTarget`), a stand-in answers one whole HTML
 *     page: what the HTTPS probe and a removal's check of the Tracy address read (#1037);
 *   - Cloudflare for SaaS: an HTTP server in this process answering `/zones/{zone}/custom_hostnames`
 *     (`test/_fake-cloudflare.mjs`, `CLOUDFLARE_SAAS_API`) — tracy-web's real client and sweeps
 *     create, read and delete the domain's custom hostname there (#1037, slice 2);
 *   - the edge in front of the customer's domain: the HTTPS probe (`sites/domain-probe.js`
 *     `probeDomain`, real) dials the name through a stand-in that resolves it only while its CNAME
 *     names `connect.<zone>` AND the zone holds an active custom hostname with an active
 *     certificate for it, and forwards each request to the service the tunnel's ingress rule for
 *     the name names — tracy-web's own port — as cloudflared does (it picks a rule by the request's
 *     host name), with `x-forwarded-proto: https` and no TLS;
 *   - dsh around the tab: the tab is mounted on a bare page.
 *
 * NOT EXERCISED: public DNS (propagation, a flattened apex record at a real provider, a proxy in
 * front), a real Cloudflare account or zone, the certificate at the edge.
 *
 * Runs where three things are supplied: `TRACY_PILOT=1` (it is asked for by name, so it can never
 * reach a real zone by accident), `TRACY_PILOT_ARTIFACT_DIR` (where screenshots go) and
 * `TEST_DATABASE_URL`. Two places supply them:
 *
 *   - locally, `tests/regression/scripts/site-own-domain-stand.mjs --pilot`, which starts the
 *     PostgreSQL of its own:
 *       node tests/regression/scripts/site-own-domain-stand.mjs --project tchdomainpilot \
 *         --artifacts <dir> --pilot -- node --test apps/tracy-web/test/e2e/site-own-domain.test.mjs
 *   - in `Tracy CI`, the `tests e2e` row (since 08/10/2026, #1028): the workflow sets the first two
 *     on that row and the runner's PostgreSQL is the third. Until then no CI run executed it.
 *
 * Without `TRACY_PILOT=1` the test is skipped and the gate lists it by name. With it, a missing
 * artifact directory or database is a FAILURE, not a skip: asked to run and unable to is not "not
 * asked".
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import dgram from 'node:dgram'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { createRequire } from 'node:module'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { buildApp as buildHostApp } from '../../../tracy-host/src/app.js'
import * as hostJobs from '../../../tracy-host/src/jobs.js'
import { runScript } from '../../../tracy-host/src/run.js'
import { buildApp } from '../../src/app.js'
import { readConfig } from '../../src/config.js'
import * as cron from '../../src/cron.js'
import { hostCall, hostJob } from '../../src/host/client.js'
import { mintSession } from '../../src/lib/session.js'
import { saveUiSwitches } from '../../src/lib/ui-setting.js'
import { probeDomain } from '../../src/sites/domain-probe.js'
import { dbSitesResolver, siteTarget } from '../../src/sites/resolver.js'
import { fileDb } from '../_db.mjs'
import { fakeCloudflare } from '../_fake-cloudflare.mjs'

const repo = fileURLToPath(new URL('../../../../', import.meta.url))
const SHOTS = process.env.TRACY_PILOT_ARTIFACT_DIR
const asked = process.env.TRACY_PILOT === '1'
/** What an asked-for pilot still lacks; empty when it can run. */
const lacking = [
  ...(SHOTS ? [] : ['TRACY_PILOT_ARTIFACT_DIR']),
  ...(process.env.TEST_DATABASE_URL ? [] : ['TEST_DATABASE_URL'])
]
const ready = asked && lacking.length === 0
const opts = {
  skip: ready
    ? false
    : asked
      ? `asked for, but ${lacking.join(' and ')} is not set: the test below fails for it`
      : 'TRACY_PILOT is not 1: run through tests/regression/scripts/site-own-domain-stand.mjs --pilot (Tracy CI sets it on the tests e2e row)',
  timeout: 900_000
}

if (asked && !ready) {
  test('the own-domain pilot was asked for (TRACY_PILOT=1) and has what it needs', () => {
    assert.fail(
      `TRACY_PILOT=1 but ${lacking.join(' and ')} is not set: the pilot cannot run, and that is not a skip`
    )
  })
}

const SITE = 'lantern.localhost'
const LABEL = 'lantern'
const DOMAIN = 'shop.pilot-example.com'
const TUNNEL = '0f3c9a52-7b1e-4d6a-9c2f-5e8d1a4b7c90'
/** What a customer points their domain at with Cloudflare for SaaS: `connect.<site domain>`. */
const CONNECT = 'connect.localhost'
const PORT = 8123
const SUBNET = '172.30.0.0/24'

const db = fileDb()
/** Everything the run started, closed in `after` whatever happened. */
const closing = []
before(async () => {
  if (!ready) return
  // CI names a directory under `runner.temp` that nothing has created yet.
  mkdirSync(SHOTS, { recursive: true })
  await db.open()
})
after(async () => {
  for (const close of closing.reverse()) await Promise.resolve(close()).catch(() => {})
  if (ready) await db.close()
})

// ── the DNS server this run owns ────────────────────────────────────────────────────────────────

function encodeName(name) {
  const parts = name.split('.').filter(Boolean)
  return Buffer.concat([
    ...parts.map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p)])),
    Buffer.from([0])
  ])
}
/**
 * An authoritative server for whatever `records` holds: `{ 'name': { TXT: ['value'], CNAME: 'target' } }`.
 * A name it has with no record of the asked type answers NODATA; a name it does not have, NXDOMAIN.
 * `mode`: `ok` · `servfail` (every question fails) · `silent` (no answer at all).
 */
async function dnsServer() {
  const server = { records: {}, mode: 'ok', questions: [] }
  const socket = dgram.createSocket('udp4')
  socket.on('message', (message, from) => {
    let offset = 12
    const labels = []
    while (message[offset] !== 0) {
      labels.push(message.subarray(offset + 1, offset + 1 + message[offset]).toString())
      offset += message[offset] + 1
    }
    const name = labels.join('.').toLowerCase()
    const type = message.readUInt16BE(offset + 1)
    const question = message.subarray(12, offset + 5)
    const kind = type === 16 ? 'TXT' : type === 5 ? 'CNAME' : `TYPE${type}`
    server.questions.push(`${kind} ${name}`)
    if (server.mode === 'silent') return
    const answers = []
    let rcode = 0
    const known = server.records[name]
    if (server.mode === 'servfail') rcode = 2
    else if (!known) rcode = 3
    else if (kind === 'TXT' && known.TXT)
      for (const value of known.TXT) {
        const chunks = []
        for (let i = 0; i < value.length; i += 255) {
          const chunk = Buffer.from(value.slice(i, i + 255))
          chunks.push(Buffer.from([chunk.length]), chunk)
        }
        answers.push([16, Buffer.concat(chunks)])
      }
    else if (kind === 'CNAME' && known.CNAME) answers.push([5, encodeName(known.CNAME)])
    const header = Buffer.alloc(12)
    message.copy(header, 0, 0, 2)
    header.writeUInt16BE(0x8400 | (message.readUInt16BE(2) & 0x0100) | rcode, 2)
    header.writeUInt16BE(1, 4)
    header.writeUInt16BE(answers.length, 6)
    const body = answers.map(([rrType, rdata]) => {
      const rr = Buffer.alloc(12)
      rr.writeUInt16BE(0xc00c, 0)
      rr.writeUInt16BE(rrType, 2)
      rr.writeUInt16BE(1, 4)
      rr.writeUInt32BE(0, 6)
      rr.writeUInt16BE(rdata.length, 10)
      return Buffer.concat([rr, rdata])
    })
    socket.send(Buffer.concat([header, question, ...body]), from.port, from.address)
  })
  await new Promise((resolve) => socket.bind(0, '127.0.0.1', resolve))
  server.address = `127.0.0.1:${socket.address().port}`
  closing.push(() => new Promise((resolve) => socket.close(resolve)))
  return server
}

// ── the tunnel provider this run owns ───────────────────────────────────────────────────────────

/** One tunnel's ingress in memory. `failWrites`: every PUT answers 502; `delayMs`: each write waits. */
async function tunnelProvider() {
  const provider = { rules: [{ service: 'http_status:404' }], calls: [], failWrites: false, delayMs: 0 }
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', async () => {
      provider.calls.push(`${req.method} ${req.url}`)
      if (req.method === 'PUT') {
        if (provider.delayMs) await new Promise((resolve) => setTimeout(resolve, provider.delayMs))
        if (provider.failWrites) {
          res.writeHead(502, { 'content-type': 'text/html' })
          return res.end('<html><body>Bad gateway</body></html>')
        }
        provider.rules = JSON.parse(raw).config.ingress
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ success: true, result: { config: { ingress: provider.rules } } }))
    })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  provider.url = `http://127.0.0.1:${server.address().port}/client/v4`
  provider.routed = () =>
    provider.rules.filter((rule) => rule.hostname === DOMAIN).map((rule) => rule.service)
  provider.writes = () => provider.calls.filter((call) => call.startsWith('PUT')).length
  closing.push(() => new Promise((resolve) => server.close(resolve)))
  return provider
}

// ── the host: real app, real runner, real fleet scripts; firewall and docker stood in ────────────

function hostBed(work, provider) {
  const bin = path.join(work, 'bin')
  const state = path.join(work, 'host-state')
  const privateRoot = path.join(work, 'private')
  const sitesRoot = path.join(work, 'sites')
  for (const dir of [bin, state, path.join(privateRoot, LABEL, 'apache'), sitesRoot])
    mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(privateRoot, LABEL, '.env'), `HOST_PORT=${PORT}\nDB_PASSWORD=pilot\n`)
  writeFileSync(path.join(privateRoot, LABEL, 'apache', 'tracy-noindex.conf'), 'before\n')
  // A provisioned site always has its compose file, and go-live.sh reads the image a running EmDash
  // site is on from it (platform/emdash.sh) — without one the script ends before the ingress step
  // on any machine that has no tracy/emdash build. Nothing pulls or runs this image: docker is the
  // stand-in below.
  writeFileSync(
    path.join(privateRoot, LABEL, 'docker-compose.yml'),
    'services:\n  web:\n    image: tracy/pilot-site:0\n'
  )
  // The site starts as a draft: its subnet is fenced off from sending mail.
  writeFileSync(path.join(state, 'rule'), '')
  const stubs = {
    iptables: `#!/bin/bash
case "$1" in
  -C) [ -e "${state}/rule" ] && exit 0; exit 1 ;;
  -S) echo "-N DOCKER-USER"; [ -e "${state}/rule" ] && echo "-A DOCKER-USER -s ${SUBNET} -j TRACY-FLEET-EGRESS"; echo "-A DOCKER-USER -j RETURN" ;;
  -D) rm -f "${state}/rule" ;;
  -I) : > "${state}/rule" ;;
esac
exit 0
`,
    docker: `#!/bin/bash
case "$1 $2" in
  "network inspect") echo ${SUBNET} ;;
esac
exit 0
`
  }
  for (const [name, text] of Object.entries(stubs)) {
    writeFileSync(path.join(bin, name), text)
    chmodSync(path.join(bin, name), 0o755)
  }
  // What the host's runner hands its scripts is this process's environment (`runGoLiveJob`).
  process.env.PATH = `${bin}:${process.env.PATH}`
  process.env.TRACY_PRIVATE_ROOT = privateRoot
  process.env.TRACY_SITES_ROOT = sitesRoot
  process.env.TRACY_CF_API_BASE = provider.url
  process.env.TRACY_INGRESS_LOCK = path.join(work, 'ingress.lock')
  const config = {
    hostName: 'local',
    hostSecret: 'pilot-host-secret',
    sitesRoot,
    privateRoot,
    scriptsDir: path.join(repo, 'packages/fleet/tracy-fleet-operation/scripts'),
    jobsDir: path.join(work, 'jobs'),
    logDir: path.join(work, 'logs'),
    cloudflare: { token: 'pilot-token', account: 'pilot-account', tunnel: TUNNEL }
  }
  const jobs = {
    put: (id, fields) => hostJobs.putJob(config.jobsDir, id, fields),
    get: (id) => hostJobs.readJob(config.jobsDir, id),
    accept: (id) => hostJobs.acceptJob(config.jobsDir, id),
    accepted: (id) => hostJobs.jobAccepted(config.jobsDir, id)
  }
  const host = { config, down: false, asks: [] }
  /** A fresh process of the host: its in-memory guards are gone, its disk is as it was. */
  host.start = () => {
    host.app = buildHostApp({ config, jobs, run: runScript })
  }
  host.start()
  host.ledger = () => {
    const file = path.join(privateRoot, LABEL, '.golive-domains')
    return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : []
  }
  host.mailFenced = () => existsSync(path.join(state, 'rule'))
  return host
}

// ── the page: the real tab, bundled and styled the way the plugin does it ───────────────────────

async function tabAssets(work) {
  const pluginRoot = path.join(repo, 'packages/site/tracy-site-tabs')
  const coreRoot = path.join(repo, 'packages/core/tracy-core')
  const css = path.join(work, 'pilot.css')
  execFileSync(
    process.execPath,
    [
      path.join(pluginRoot, 'node_modules/@tailwindcss/cli/dist/index.mjs'),
      '--input',
      path.join(pluginRoot, 'src/client/site-tabs.css'),
      '--output',
      css
    ],
    { cwd: pluginRoot, stdio: ['ignore', 'ignore', 'inherit'] }
  )
  const js = path.join(work, 'pilot.js')
  await createRequire(path.join(coreRoot, 'package.json'))('esbuild').build({
    stdin: {
      contents: `
        import { createElement } from 'react'
        import { createRoot } from 'react-dom/client'
        import { PublishView } from '@tracy/core/site-tabs'
        import { en } from './strings'
        // The wizard's geometry (step bar, footer) the plugin injects beside its Tailwind sheet.
        import { WIZARD_SHELL_CSS } from './styles'
        const shell = document.createElement('style')
        shell.textContent = WIZARD_SHELL_CSS
        document.head.appendChild(shell)
        const t = (key, params) =>
          (en[key] ?? key).replace(/\\{(\\w+)\\}/g, (m, name) => (params && name in params ? String(params[name]) : m))
        const asked = new URLSearchParams(location.search)
        const siteKey = asked.get('site')
        const role = asked.get('role')
        createRoot(document.getElementById('root')).render(
          createElement('div', { className: 'tracy-site-tabs text-sm' },
            createElement(PublishView, { siteKey, role, sites: [{ siteKey, role }], onPick() {}, pollMs: 400, t }))
        )
      `,
      resolveDir: path.join(pluginRoot, 'src/client'),
      loader: 'tsx'
    },
    bundle: true,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    // `styles.ts` reads the Tailwind sheet from this define; the page links that sheet itself.
    define: { 'process.env.NODE_ENV': '"production"', __TAILWIND_CSS__: '""' },
    loader: { '.css': 'empty' },
    nodePaths: [path.join(coreRoot, 'node_modules'), path.join(pluginRoot, 'node_modules')],
    outfile: js,
    logLevel: 'silent'
  })
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Site settings — pilot</title>
<link rel="stylesheet" href="/pilot.css">
<style>body{margin:0;background:var(--background);color:var(--foreground);font-family:system-ui,sans-serif}#root{width:440px;padding:12px}</style>
</head><body><div id="root"></div><script src="/pilot.js"></script></body></html>`
  return { html, css: readFileSync(css, 'utf8'), js: readFileSync(js, 'utf8') }
}

/** Until `read()` answers something truthy; fails naming what was waited for. */
async function until(read, what, ms = 60_000) {
  const deadline = Date.now() + ms
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() > deadline) throw new Error(`gave up waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

test(
  'own domain, end to end on the local stand: connect, each DNS state as a lookup returned it, live, a removal that half succeeds and is continued under its key, a failed connect, back to draft, and an operation settled with the tab closed',
  opts,
  async () => {
    const work = mkdtempSync(path.join(SHOTS, 'work-'))
    closing.push(() => rmSync(work, { recursive: true, force: true }))
    const dns = await dnsServer()
    const provider = await tunnelProvider()
    const host = hostBed(work, provider)
    // Cloudflare for SaaS: new hostnames start pending, their certificate not issued.
    const cf = fakeCloudflare()
    cf.state = { status: 'pending', ssl: 'pending_validation', records: [] }
    const cfApi = await cf.listen()
    closing.push(cfApi.close)
    const cfOrigin = new URL(cfApi.apiBase).origin
    const assets = await tabAssets(work)
    const { pool } = db

    // tracy-web on a real port. Its only way out is to the host of this run; anything else fails.
    let handle = () => new Response('starting', { status: 503 })
    const server = await new Promise((resolve) => {
      const started = serve({ fetch: (request) => handle(request), port: 0, hostname: '127.0.0.1' }, () =>
        resolve(started)
      )
    })
    closing.push(() => new Promise((resolve) => server.close(resolve)))
    const origin = `http://127.0.0.1:${server.address().port}`
    const config = readConfig({
      TRACY_ORIGIN: origin,
      SITE_DOMAIN: 'localhost',
      SESSION_SECRET: 'p'.repeat(32),
      HOSTS: 'local',
      HOST_local_ORIGIN: 'http://tracy-host.pilot',
      HOST_local_DSH_ORIGIN: 'http://dsh.pilot',
      HOST_local_SECRET: host.config.hostSecret,
      SEAT_local_SECRET: 'k',
      TRACY_DNS_RESOLVER: dns.address,
      CLOUDFLARE_SAAS_ZONE_ID: cf.zoneId,
      CLOUDFLARE_SAAS_TOKEN: cf.token,
      CLOUDFLARE_SAAS_API: cfApi.apiBase
    })
    // tracy-web's own port is where the host sends a customer's own domain (go-live.sh step 4).
    process.env.TRACY_OWN_DOMAIN_SERVICE = origin
    closing.push(() => delete process.env.TRACY_OWN_DOMAIN_SERVICE)
    const outside = []
    const cmsOrigins = new Set(
      ['lantern', 'harbor'].map((label) => siteTarget({ label, host: 'local' }, config).origin)
    )
    const fetchImpl = async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input))
      // The site's CMS, as its proxy asks it: one whole page, the same every time.
      if (cmsOrigins.has(url.origin))
        return new Response(
          '<!doctype html><html><head><title>Lantern</title></head><body><h1>Lantern</h1></body></html>',
          { headers: { 'content-type': 'text/html; charset=utf-8' } }
        )
      // The Cloudflare for SaaS stand-in of this run.
      if (url.origin === cfOrigin) return fetch(input, init)
      if (url.origin !== 'http://tracy-host.pilot') {
        outside.push(url.href)
        throw new Error(`the pilot reaches nothing outside this machine: ${url.origin}`)
      }
      host.asks.push(url.pathname)
      // `down`: the go-live door of the host cannot be reached (its other doors still answer).
      if (host.down && url.pathname === '/_host/go-live') throw new Error('connect ECONNREFUSED')
      // The CMS is not part of this pilot: a webroot job is answered "no such door".
      if (url.pathname === '/_host/site') return new Response(null, { status: 404 })
      return host.app.fetch(new Request(url, init))
    }
    /**
     * The edge in front of the customer's domain. The name resolves only while its CNAME names the
     * tunnel; a request reaches the service of the tunnel's ingress rule for the name (none: the
     * tunnel's own 404), as cloudflared sends it — plain HTTP, the visitor's Host, `https` forwarded.
     */
    const edge = {
      resolver: {
        resolve4: async (name) => {
          const served = cf.byName(name)
          if (
            dns.records[name]?.CNAME === CONNECT &&
            served?.status === 'active' &&
            served.ssl.status === 'active'
          )
            return ['127.0.0.1']
          throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' })
        },
        resolve6: async () => {
          throw Object.assign(new Error('no data'), { code: 'ENODATA' })
        }
      },
      request: ({ name, kind, path: asked, challenge }) => {
        const rule = provider.rules.find((r) => r.hostname === name)
        if (!rule) return Promise.resolve({ error: 'HTTP_STATUS' })
        const service = new URL(rule.service)
        return new Promise((resolve) => {
          const req = httpRequest(
            {
              host: service.hostname,
              port: service.port,
              path: kind === 'page' ? asked : '/__tracy/domain-probe',
              method: 'GET',
              agent: false,
              headers: {
                host: name,
                'x-forwarded-proto': 'https',
                ...(kind === 'page'
                  ? { accept: 'text/html', 'accept-encoding': 'identity' }
                  : { 'x-tracy-domain-probe': challenge, accept: 'text/plain' })
              }
            },
            (res) => {
              const chunks = []
              res.on('data', (chunk) => chunks.push(chunk))
              res.on('error', () => resolve({ error: 'PAGE_INCOMPLETE' }))
              res.on('end', () => {
                const bytes = Buffer.concat(chunks)
                const header = (h) => (typeof res.headers[h] === 'string' ? res.headers[h] : null)
                if (kind === 'page')
                  return resolve({
                    status: res.statusCode,
                    proof: header('x-tracy-domain-probe-page'),
                    location: header('location'),
                    contentType: header('content-type'),
                    bytes
                  })
                if (res.statusCode !== 200) return resolve({ error: 'HTTP_STATUS' })
                resolve({ status: 200, body: bytes.toString('latin1') })
              })
            }
          )
          req.on('error', () => resolve({ error: 'CONNECT_FAILED' }))
          req.end()
        })
      },
      asked: []
    }
    /** The real probe, through the edge above. */
    const ownDomainProbe = (row, page) => {
      edge.asked.push(row.name)
      return probeDomain(row, {
        resolver: edge.resolver,
        options: { allowPrivate: true },
        request: edge.request,
        page
      })
    }
    const app = buildApp({
      config,
      pool,
      mail: { send: async () => {} },
      sites: dbSitesResolver(pool, config),
      host: { hostCall, hostJob },
      fetchImpl,
      ownDomainProbe
    })
    handle = (request) => {
      const { pathname } = new URL(request.url)
      if (pathname === '/pilot')
        return new Response(assets.html, { headers: { 'content-type': 'text/html' } })
      if (pathname === '/pilot.css')
        return new Response(assets.css, { headers: { 'content-type': 'text/css' } })
      if (pathname === '/pilot.js')
        return new Response(assets.js, { headers: { 'content-type': 'text/javascript' } })
      return app.fetch(request)
    }

    // The site and its seats.
    // A site with its copy on the host and its Tracy address on record: what a removal checks first.
    await pool.query(
      'insert into site (site_key, label, host, attached, address) values ($1, $2, $3, true, $4)',
      [SITE, LABEL, 'local', `http://${LABEL}.localhost/`]
    )
    for (const [email, role] of [
      ['owner@pilot.test', 'owner'],
      ['editor@pilot.test', 'editor']
    ]) {
      const id = (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0]
        .id
      await pool.query(
        'insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, $3, $2, now())',
        [SITE, id, role]
      )
    }
    const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0] ?? null
    const nameRow = () => one('select * from site_name where name = $1', [DOMAIN])
    const opRow = () => one('select * from site_publish_op where site_key = $1', [SITE])
    const published = async () => (await one('select publish from site where site_key = $1', [SITE])).publish
    // What the run left behind, written beside the screenshots before the work folder goes: when a
    // step fails, this is what says where the operation stood on each side.
    closing.push(async () => {
      const filesOf = (dir) =>
        existsSync(dir)
          ? Object.fromEntries(
              readdirSync(dir).map((name) => {
                const file = path.join(dir, name)
                return [name, statSync(file).isFile() ? readFileSync(file, 'utf8').slice(-6000) : null]
              })
            )
          : null
      writeFileSync(
        path.join(SHOTS, 'last-state.json'),
        `${JSON.stringify(
          {
            operation: await opRow().catch((error) => String(error)),
            name: await nameRow().catch((error) => String(error)),
            hostAsks: host.asks,
            providerCalls: provider.calls,
            providerRules: provider.rules,
            ledger: host.ledger(),
            jobs: filesOf(host.config.jobsDir),
            logs: filesOf(host.config.logDir)
          },
          null,
          2
        )}\n`
      )
    })

    // The browser.
    const { chromium } = createRequire(path.join(repo, 'package.json'))('@playwright/test')
    const browser = await chromium.launch()
    closing.push(() => browser.close())
    /**
     * Walk the Publish wizard to its "Your domain" step the way a person does (the tab is a stepped
     * wizard since 24/10/2026, 777d51c3ff): an Owner picks "Make it live on Tracy" and continues; the
     * Tracy address step goes on with Continue once the site is live, or with the draft card's "Your
     * domain" when a draft already has a domain. False when the step cannot be reached from here.
     */
    const toDomain = async (page) => {
      for (let i = 0; i < 6; i++) {
        const step = await page.$eval('[data-publish-wizard]', (el) => el.getAttribute('data-publish-step'))
        if (step === 'domain') return true
        if (step === 'kind') {
          await page.click('[data-publish-kinds] label:has(input[value="online"])')
          await page.click('[data-wizard-continue]')
        } else if (step === 'address' || step === 'sync') {
          const on = await page.$('[data-publish-next], [data-action="to-domain"]')
          if (on === null) return false
          await on.click()
        } else return false
        await page.waitForFunction(
          (was) => document.querySelector('[data-publish-wizard]')?.getAttribute('data-publish-step') !== was,
          step
        )
      }
      return false
    }
    const open = async (email, role, site = SITE, { domainStep = true } = {}) => {
      const context = await browser.newContext({ viewport: { width: 464, height: 1000 } })
      await context.addCookies([
        { name: 'tracy_sess', value: await mintSession(email, config.sessionSecret), url: origin }
      ])
      const page = await context.newPage()
      await page.goto(`${origin}/pilot?site=${site}&role=${role}`)
      await page.waitForSelector('[data-publish-wizard]')
      if (domainStep) assert.equal(await toDomain(page), true, `${role} reaches the Your domain step`)
      return page
    }
    const shots = []
    /** One state, in light and in dark, as two files. */
    const shot = async (page, name) => {
      for (const theme of ['light', 'dark']) {
        await page.evaluate((dark) => {
          document.documentElement.classList.toggle('dark', dark)
          if (dark) document.body.setAttribute('data-ds-dark-theme', '')
          else document.body.removeAttribute('data-ds-dark-theme')
        }, theme === 'dark')
        const file = path.join(SHOTS, `${name}-${theme}.png`)
        await page.screenshot({ path: file, fullPage: true })
        shots.push(path.basename(file))
      }
      await page.evaluate(() => {
        document.documentElement.classList.remove('dark')
        document.body.removeAttribute('data-ds-dark-theme')
      })
    }
    const card = '[data-card="own-domain"]'
    const inState = (page, state) =>
      page.waitForSelector(`${card}[data-domain-state="${state}"]`, { timeout: 60_000 })
    const foundOf = (page, record) =>
      page.$eval(`${card} [data-record="${record}"] [data-found]`, (el) => ({
        status: el.getAttribute('data-found'),
        error: el.getAttribute('data-error'),
        text: el.textContent
      }))
    /** Press Check again and wait for the reading of THIS press: a new time under the records. */
    const check = async (page) => {
      const before = await page.$eval('[data-line="checked-at"]', (el) => el.getAttribute('data-checked-at'))
      await page.click('[data-action="check-dns"]')
      await page.waitForFunction(
        (was) => document.querySelector('[data-line="checked-at"]')?.getAttribute('data-checked-at') !== was,
        before,
        { timeout: 30_000 }
      )
    }
    /**
     * The site's Draft / Live chip, which the wizard shows on its Tracy address step: read there (by
     * the step bar from a later step), then back to the step the page was on.
     */
    const siteChip = async (page, status) => {
      const was = await page.$eval('[data-publish-wizard]', (el) => el.getAttribute('data-publish-step'))
      if (was !== 'address') await page.click('[data-wizard-goto="address"]')
      await page.waitForSelector(`[data-site-status="${status}"]`, { timeout: 90_000 })
      if (was === 'domain') assert.equal(await toDomain(page), true, 'back to the Your domain step')
    }
    /** Load the page again: the wizard starts over, and is walked back to the Your domain step. */
    const reopen = async (page) => {
      await page.reload()
      await page.waitForSelector('[data-publish-wizard]')
      assert.equal(await toDomain(page), true, 'the Your domain step, after a reload')
    }

    // ── 1. a draft with no domain of its own; the operator's switch hides the way in; publish first ─
    // The Owner picks "Make it live on Tracy"; on a draft the Tracy address step offers Publish and
    // nothing past it: a domain is connected to a live site only.
    const page = await open('owner@pilot.test', 'owner', SITE, { domainStep: false })
    await page.click('[data-publish-kinds] label:has(input[value="online"])')
    await page.click('[data-wizard-continue]')
    await page.waitForSelector('[data-publish-wizard][data-publish-step="address"] [data-action="live"]')
    await siteChip(page, 'draft')
    assert.equal(
      await page.$('[data-publish-next], [data-action="to-domain"]'),
      null,
      'a draft goes no further'
    )
    assert.ok(await page.$('[data-own-domain-hint]'), 'the address step says a domain comes after publishing')
    assert.equal(await page.$('form[data-form="domain"]'), null, 'no domain form on a draft')
    await shot(page, '01-draft-no-domain')
    await page.click('[data-action="live"]')
    await siteChip(page, 'live')
    await page.waitForSelector('[data-publish-next]', { timeout: 90_000 })
    assert.equal(await published(), 'published')
    assert.deepEqual(provider.routed(), [], 'a site with no domain routes nothing through the tunnel')
    await page.click('[data-publish-next]')
    await page.waitForSelector('[data-publish-step="domain"] [data-own-domain-entry]')
    await shot(page, '01b-domain-step')
    const hidden = await page.evaluate(() => {
      document.documentElement.setAttribute('data-tracy-hide', 'site-connect-domain')
      const shown = document.querySelector('[data-own-domain-entry]').offsetParent !== null
      document.documentElement.removeAttribute('data-tracy-hide')
      return !shown
    })
    assert.equal(hidden, true, 'the UI switch hides the domain field')

    // ── 2. connect: the name is saved, the two records are shown, nothing is called checked ───────
    await page.fill('form[data-form="domain"] input', `https://${DOMAIN}/`)
    await page.click('[data-action="check-name"]')
    await page.waitForSelector('[role="alert"]:has-text("without https://")')
    await shot(page, '02-form-refuses-a-url')
    await page.fill('form[data-form="domain"] input', DOMAIN)
    await page.click('[data-action="check-name"]')
    await page.click('[data-action="save-domain"]:not([disabled])')
    await inState(page, 'waiting')
    const token = (await nameRow()).token
    assert.match(token, /^[0-9a-f]{48}$/)
    assert.equal(
      await page.$eval(`${card} [data-record="ownership"] [data-record-value]`, (el) => el.textContent),
      token
    )
    assert.equal(
      await page.$eval(`${card} [data-record="routing"] [data-record-value]`, (el) => el.textContent),
      CONNECT
    )
    assert.equal((await foundOf(page, 'ownership')).status, 'unchecked')
    assert.deepEqual(dns.questions, [], 'saving a name looks nothing up')
    await shot(page, '03-saved-not-checked')

    // ── 3. waiting for DNS: the lookup really returned "no such name" ─────────────────────────────
    await check(page)
    await inState(page, 'waiting')
    assert.deepEqual(await foundOf(page, 'ownership').then((f) => [f.status, f.error]), [
      'missing',
      'NXDOMAIN'
    ])
    assert.deepEqual(await foundOf(page, 'routing').then((f) => [f.status, f.error]), ['missing', 'NXDOMAIN'])
    assert.deepEqual([...new Set(dns.questions)].sort(), [`CNAME ${DOMAIN}`, `TXT _tracy.${DOMAIN}`])
    await shot(page, '04-waiting-for-dns')

    // ── 4. DNS wrong: which record, what was found, what is expected ──────────────────────────────
    dns.records[`_tracy.${DOMAIN}`] = { TXT: ['not-the-token'] }
    dns.records[DOMAIN] = { CNAME: 'parked.registrar.example' }
    await check(page)
    await inState(page, 'wrong')
    const wrongTxt = await foundOf(page, 'ownership')
    assert.equal(wrongTxt.status, 'wrong')
    assert.match(wrongTxt.text, /not-the-token/)
    assert.match((await foundOf(page, 'routing')).text, /parked\.registrar\.example/)
    await shot(page, '05-dns-wrong')

    // A flattened record: addresses only, no CNAME to read — missing, never guessed right. The
    // ownership record alone is what a domain is connected on (#1037): the card reads verified, and
    // the routing record stays a diagnostic that says what was found.
    dns.records[`_tracy.${DOMAIN}`] = { TXT: [token] }
    dns.records[DOMAIN] = { A: '192.0.2.10' }
    await check(page)
    await inState(page, 'verified')
    assert.deepEqual(await foundOf(page, 'routing').then((f) => [f.status, f.error]), ['missing', 'NODATA'])
    assert.equal((await foundOf(page, 'ownership')).status, 'ok')
    assert.equal(
      dns.questions.some((q) => !/^(TXT|CNAME) /.test(q)),
      false,
      'no address record is ever asked for'
    )
    await shot(page, '06-cname-flattened')

    // ── 5. DNS cannot be read: unknown, with the reason ───────────────────────────────────────────
    dns.mode = 'servfail'
    await check(page)
    await inState(page, 'unknown')
    assert.equal((await foundOf(page, 'ownership')).status, 'unknown')
    await shot(page, '07-dns-could-not-be-read')
    dns.mode = 'ok'

    // ── 6. verified: both records found, at a time the card states ────────────────────────────────
    dns.records[DOMAIN] = { CNAME: CONNECT }
    await check(page)
    await inState(page, 'verified')
    const verifiedRow = await nameRow()
    assert.equal(verifiedRow.state, 'pending', 'verified is a reading, not a connection')
    assert.equal(verifiedRow.routing_target, CONNECT)
    // Proven: its custom hostname was registered with Cloudflare at once — pending, like its certificate.
    assert.equal(cf.byName(DOMAIN)?.status, 'pending')
    assert.equal(verifiedRow.carried_at, null)
    assert.deepEqual(provider.routed(), [], 'nothing reached the tunnel')
    await shot(page, '08-verified')
    // The keyboard reaches the card's actions; what focus looks like is kept beside the screenshots.
    await page.focus('[data-action="check-dns"]')
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    const focus = await page.evaluate(() => {
      const el = document.activeElement
      const style = getComputedStyle(el)
      return {
        action: el.getAttribute('data-action'),
        outline: `${style.outlineStyle} ${style.outlineWidth}`,
        boxShadow: style.boxShadow
      }
    })
    assert.equal(focus.action, 'check-dns')
    writeFileSync(path.join(SHOTS, 'focus.json'), `${JSON.stringify(focus, null, 2)}\n`)
    await shot(page, '09-verified-keyboard-focus')

    // ── 7. publish on the domain: it goes with the job, and reads Live only when the host installed
    // its route AND the domain itself, asked through the edge, answered as this site (#1037) ──────
    provider.delayMs = 2500
    await page.click('[data-action="connect-live"]')
    await inState(page, 'connecting')
    await shot(page, '10-connecting')
    // The route is in, but Cloudflare has not validated the name nor issued its certificate: the
    // domain is not even asked, and the card says why.
    await inState(page, 'unreachable')
    await page.waitForSelector(`${card} [data-line="domain-unreachable"]:has-text("still setting up")`)
    assert.equal(edge.asked.includes(DOMAIN), false, 'not asked before the hostname is active')
    await shot(page, '10b-hostname-pending')
    // Cloudflare validates the name and issues its certificate. With nobody on the screen, the two
    // background sweeps do the rest: the hostname's next read finds it ready (which makes the
    // domain due at once), and the probe sweep asks the domain itself.
    cf.set(DOMAIN, { status: 'active', ssl: 'active' })
    await pool.query("update site_custom_hostname set next_at = now() - interval '1 second'")
    const ready = await cron.sweepCustomHostnames(pool, config)
    assert.deepEqual(ready.ready, [DOMAIN])
    assert.deepEqual(await cron.sweepOwnDomainProbes(pool, config, { probe: ownDomainProbe }), {
      asked: 1,
      connected: [DOMAIN]
    })
    await reopen(page)
    await inState(page, 'live')
    await siteChip(page, 'live')
    provider.delayMs = 0
    assert.deepEqual(
      provider.routed(),
      [origin],
      'the tunnel routes the domain to tracy-web, which serves the site (#1037)'
    )
    assert.deepEqual(host.ledger(), [DOMAIN])
    assert.equal(host.mailFenced(), false, 'mail is open')
    assert.equal((await nameRow()).state, 'active')
    assert.ok(edge.asked.includes(DOMAIN), 'connected on the probe of the domain itself')
    assert.notEqual((await nameRow()).connected_at, null)
    assert.equal(await published(), 'published')
    const liveOp = await opRow()
    // No tunnel is named to the host: the domain points at `connect.<zone>`, not at the tunnel.
    assert.deepEqual(
      [liveOp.op, liveOp.state, liveOp.domains, liveOp.target],
      ['live', 'done', [DOMAIN], null]
    )
    await shot(page, '11-live')

    // ── 8. remove, with the provider failing: recorded as not finished, visible, nothing lost ─────
    provider.failWrites = true
    provider.delayMs = 2000
    const writesBefore = provider.writes()
    await page.click('[data-action="remove-domain"]')
    await page.waitForSelector('[role="alertdialog"]')
    await shot(page, '12-remove-dialog')
    await page.click('[data-confirm="remove-domain"]')
    await inState(page, 'removing')
    await shot(page, '13-removing')
    await inState(page, 'cleanup')
    provider.delayMs = 0
    const failedOp = await opRow()
    assert.deepEqual(
      [failedOp.op, failedOp.state, failedOp.code, failedOp.attempt],
      ['drop-domain', 'failed', 'DOMAIN_STILL_ROUTED', 0]
    )
    // Still the site's reservation, and its rule may still be at the host (`carried_at`) — but it
    // stopped opening the site when the removal started (#1037, `publish-store.js`), so it is not
    // read as connected while the cleanup is unfinished.
    const halfRemoved = await nameRow()
    assert.deepEqual([halfRemoved.state, halfRemoved.carried_at !== null], ['pending', true])
    assert.deepEqual(provider.routed(), [origin])
    assert.deepEqual(host.ledger(), [DOMAIN], 'the host still has it on record: the retry knows what is left')
    assert.equal(await published(), 'published', 'the site itself stays live')
    await shot(page, '14-removal-not-finished')

    // ── 9. try again: the SAME operation, the next attempt, and only what was left is done ────────
    provider.failWrites = false
    await page.click('[data-action="retry-remove"]')
    await page.waitForSelector(card, { state: 'detached', timeout: 60_000 })
    const retried = await opRow()
    assert.equal(retried.ref, failedOp.ref, 'the same key')
    assert.deepEqual([retried.state, retried.attempt, retried.job_id], ['done', 1, failedOp.job_id])
    assert.equal((await hostJobs.readJob(host.config.jobsDir, failedOp.job_id)).attempt, 1)
    assert.deepEqual(provider.routed(), [])
    assert.deepEqual(host.ledger(), [])
    assert.equal(await nameRow(), null)
    assert.equal(provider.writes(), writesBefore + 2, 'one write that failed, one that removed the rule')
    assert.equal(host.mailFenced(), false, 'removing a domain touched neither mail nor noindex')
    // Not served any more: its custom hostname is deleted at Cloudflare, and the name stops resolving.
    assert.ok(cf.byName(DOMAIN), 'still there until the sweep has seen the reservation gone')
    await cron.sweepCustomHostnames(pool, config)
    assert.equal(cf.byName(DOMAIN), null)
    assert.equal(await one('select 1 from site_custom_hostname where name = $1', [DOMAIN]), null)
    await page.waitForSelector('[data-own-domain-entry]')
    await shot(page, '15-removed')

    // ── 10. connect again on the live site, the provider refusing: failed, said on the card ───────
    // From here Cloudflare validates a new hostname and issues its certificate at once.
    cf.state = { status: 'active', ssl: 'active', records: [] }
    await page.fill('form[data-form="domain"] input', DOMAIN)
    await page.click('[data-action="check-name"]')
    await page.click('[data-action="save-domain"]:not([disabled])')
    await inState(page, 'waiting')
    const second = (await nameRow()).token
    assert.notEqual(second, token, 'a new reservation has a proof of its own')
    // The old TXT value is still in DNS: it proves nothing for the new reservation.
    await check(page)
    await inState(page, 'wrong')
    dns.records[`_tracy.${DOMAIN}`] = { TXT: [second] }
    await check(page)
    await inState(page, 'verified')
    provider.failWrites = true
    await page.click('[data-action="connect-live"]')
    await inState(page, 'failed')
    assert.equal((await opRow()).code, 'DOMAIN_NOT_ROUTED')
    assert.equal(await published(), 'published')
    assert.deepEqual(provider.routed(), [])
    await shot(page, '16-connect-failed')
    provider.failWrites = false
    await page.click('[data-action="connect-live"]')
    await inState(page, 'live')
    assert.deepEqual(provider.routed(), [origin])

    // ── 11. an Editor: the domain and its state, never its proof, no action it would be refused ────
    const adminPage = await open('editor@pilot.test', 'editor')
    await inState(adminPage, 'live')
    const adminText = await adminPage.evaluate(() => document.body.textContent)
    assert.equal(adminText.includes(second), false, "the token is not on the Editor's page")
    assert.equal(await adminPage.$('[data-action="remove-domain"]'), null)
    assert.equal(await adminPage.$('[data-action="check-dns"]'), null)
    const refused = await adminPage.evaluate(async (site) => {
      const res = await fetch(`/api/sites/${site}/address/domain`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'shop.pilot-example.com' })
      })
      return [res.status, (await res.json()).code]
    }, SITE)
    assert.deepEqual(refused, [403, 'NOT_SITE_OWNER'])
    await shot(adminPage, '17-editor-sees-no-proof')
    await adminPage.context().close()

    // ── 12. back to draft: the dialog names the domain, and the host takes it out ─────────────────
    // Back to draft sits on the Tracy address step's status line; the step bar goes back to it.
    await page.click('[data-wizard-goto="address"]')
    await page.click('[data-action="draft"]')
    await page.waitForSelector(`[role="alertdialog"] [data-line="draft-domain"]:has-text("${DOMAIN}")`)
    await shot(page, '18-back-to-draft-dialog')
    await page.click('[data-confirm="draft"]')
    await siteChip(page, 'draft')
    // A draft that has a domain still reaches it, from the address card's "Your domain".
    assert.equal(await toDomain(page), true, 'a draft with a domain reaches the Your domain step')
    await inState(page, 'verified')
    assert.deepEqual(provider.routed(), [], 'the domain no longer opens the site')
    assert.deepEqual(host.ledger(), [])
    assert.equal(host.mailFenced(), true, 'mail is closed again')
    assert.equal((await nameRow()).state, 'pending')
    assert.equal((await nameRow()).carried_at, null)
    await shot(page, '19-draft-again')

    // ── 13. the tab is closed; the host's answer to the press is lost; the host restarts — the sweep ends it ─
    await page.context().close()
    host.down = true
    const cookie = `tracy_sess=${await mintSession('owner@pilot.test', config.sessionSecret)}`
    const pressed = await app.fetch(
      new Request(`${origin}/api/sites/${SITE}/go-live`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'live' })
      })
    )
    assert.equal(pressed.status, 504, 'the host did not answer: nothing is called a success or a failure')
    const held = await opRow()
    assert.deepEqual([held.state, held.job_id, held.domains], ['starting', null, [DOMAIN]])
    // Days pass, on the database's own clock; the host comes back as a new process.
    await pool.query(
      "update site_publish_op set started_at = now() - interval '3 days', sweep_at = now() - interval '1 second'"
    )
    host.down = false
    host.start()
    const asksBefore = host.asks.length
    const swept = await cron.sweepPublishOps(pool, config, { fetchImpl, log: { info() {}, warn() {} } })
    assert.equal(swept.taken, 1)
    assert.equal(
      (await opRow()).state,
      'running',
      'handed to the host under its own key, with nobody reading'
    )
    assert.equal((await opRow()).ref, held.ref)
    await until(async () => {
      await pool.query(
        "update site_publish_op set sweep_at = now() - interval '1 second' where state = 'running'"
      )
      await cron.sweepPublishOps(pool, config, { fetchImpl, log: { info() {}, warn() {} } })
      return (await opRow()).state === 'done'
    }, 'the sweep to hear the job end')
    assert.equal(await published(), 'published')
    // The host installed the route; the domain is connected only by its own probe — which the
    // sweep runs too, with nobody reading.
    assert.equal((await nameRow()).state, 'pending')
    const probed = await cron.sweepOwnDomainProbes(pool, config, { probe: ownDomainProbe })
    assert.deepEqual(probed, { asked: 1, connected: [DOMAIN] })
    assert.equal((await nameRow()).state, 'active')
    assert.deepEqual(provider.routed(), [origin])
    assert.ok(host.asks.length > asksBefore)
    assert.equal(
      host.asks.slice(asksBefore).every((p) => p === '/_host/go-live' || p.startsWith('/_host/jobs/')),
      true
    )
    assert.equal((await pool.query('select count(*)::int as n from site_publish_op')).rows[0].n, 1)

    // The page, opened again, shows what the sweep left: live, on the domain.
    const again = await open('owner@pilot.test', 'owner')
    await inState(again, 'live')
    await siteChip(again, 'live')
    await shot(again, '20-live-after-background-sweep')
    await again.context().close()

    // ── 14. review after #988: a bare domain, a reservation that lapses, the switch turned off ────
    const HARBOR = 'harbor.localhost'
    // Published: the Your domain step and its field come only to a live site.
    await pool.query("insert into site (site_key, label, host, publish) values ($1, $2, $3, 'published')", [
      HARBOR,
      'harbor',
      'local'
    ])
    const ownerId = (await one('select id from account where email = $1', ['owner@pilot.test'])).id
    await pool.query(
      "insert into seat (site_key, account_id, role, granted_by, accepted_at) values ($1, $2, 'owner', $2, now())",
      [HARBOR, ownerId]
    )
    const harbor = await open('owner@pilot.test', 'owner', HARBOR)
    const form = 'form[data-form="domain"]'
    // A bare domain: refused under the field, naming the subdomain to enter instead; nothing kept.
    await harbor.fill(`${form} input`, 'Pilot-Example.com')
    await harbor.click('[data-action="check-name"]')
    await harbor.waitForSelector(`${form} [data-line="field-error"]:has-text("www.pilot-example.com")`)
    await shot(harbor, '21-bare-domain-refused')
    assert.equal(await one('select 1 from site_name where name = $1', ['pilot-example.com']), null)
    // One reserved before that was refused: explained, no record to add, Remove only.
    await pool.query(
      "insert into site_name (name, site_key, kind, state, token) values ('pilot-example.org', $1, 'custom', 'pending', repeat('d', 48))",
      [HARBOR]
    )
    await reopen(harbor)
    await inState(harbor, 'unsupported')
    assert.match(await harbor.$eval(card, (el) => el.textContent), /www\.pilot-example\.org/)
    assert.equal(await harbor.$(`${card} [data-action="check-dns"]`), null)
    assert.equal(await harbor.$(`${card} [data-record]`), null)
    await shot(harbor, '22-bare-domain-reserved-before')
    await harbor.click('[data-action="remove-domain"]')
    await harbor.waitForSelector(card, { state: 'detached', timeout: 60_000 })
    assert.equal(await one('select 1 from site_name where name = $1', ['pilot-example.org']), null)
    // A reservation nobody proves: held until a time the card states, then let go by the sweep.
    const BLOG = 'blog.pilot-example.com'
    await harbor.fill(`${form} input`, BLOG)
    await harbor.click('[data-action="check-name"]')
    await harbor.click('[data-action="save-domain"]:not([disabled])')
    await inState(harbor, 'waiting')
    await harbor.waitForSelector(`${card} [data-line="hold-until"]`)
    const firstToken = (await one('select token from site_name where name = $1', [BLOG])).token
    await pool.query("update site_name set hold_until = now() - interval '1 second' where name = $1", [BLOG])
    await cron.sweepExpired(pool)
    assert.equal(await one('select 1 from site_name where name = $1', [BLOG]), null, 'the name is free')
    await reopen(harbor)
    await inState(harbor, 'lapsed')
    await shot(harbor, '23-reservation-lapsed')
    await harbor.click('[data-action="reserve-again"]')
    await inState(harbor, 'waiting')
    const renewed = await one('select token, hold_until > now() as held from site_name where name = $1', [
      BLOG
    ])
    assert.notEqual(renewed.token, firstToken, 'reserved again: a new proof')
    assert.equal(renewed.held, true)
    // The operator turns Connect domain off: the doors that start one refuse, what the site has stays.
    await saveUiSwitches(pool, { 'site-connect-domain': false }, 'ops@pilot.test')
    const doors = await harbor.evaluate(
      async ([site, blog]) => {
        const ask = async (method, path, body) => {
          const res = await fetch(`/api/sites/${site}${path}`, {
            method,
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
          })
          return [res.status, (await res.json()).code]
        }
        return [
          await ask('PUT', '/address', { name: 'news.pilot-example.com', kind: 'custom' }),
          await ask('POST', '/address/verify', { name: blog })
        ]
      },
      [HARBOR, BLOG]
    )
    assert.deepEqual(doors, [
      [403, 'OWN_DOMAIN_DISABLED'],
      [403, 'OWN_DOMAIN_DISABLED']
    ])
    await harbor.evaluate(() =>
      document.documentElement.setAttribute('data-tracy-hide', 'site-connect-domain')
    )
    await inState(harbor, 'waiting')
    assert.equal(
      await harbor.$eval(`${card} [data-action="check-dns"]`, (el) => el.offsetParent === null),
      true,
      'Check again goes with the switch'
    )
    await shot(harbor, '24-switch-off-domain-kept')
    await harbor.click('[data-action="remove-domain"]')
    await harbor.click('[data-confirm="remove-domain"]')
    await harbor.waitForSelector(card, { state: 'detached', timeout: 60_000 })
    assert.equal(
      await one('select 1 from site_name where name = $1', [BLOG]),
      null,
      'removed with the switch off'
    )
    await saveUiSwitches(pool, { 'site-connect-domain': true }, 'ops@pilot.test')
    await harbor.context().close()

    // Nothing left this machine, and every state has its pair of screenshots.
    assert.deepEqual(outside, [], 'no request went anywhere but the host of this run')
    assert.ok(provider.calls.length > 0)
    assert.equal(shots.length, 52)
    for (const file of shots) assert.ok(existsSync(path.join(SHOTS, file)), file)
    writeFileSync(
      path.join(SHOTS, 'README.txt'),
      [
        'Screenshots of the own-domain pilot (apps/tracy-web/test/e2e/site-own-domain.test.mjs), light and dark.',
        'DNS was answered by a server the test started; the tunnel provider and Cloudflare for SaaS were stand-ins in the test process.',
        'NOT exercised: public DNS, a real Cloudflare account or zone, the certificate at the edge.',
        '',
        ...shots
      ].join('\n')
    )
  }
)
