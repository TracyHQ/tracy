import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { tameMarkup } from '../src/host/html-units.mjs'
import {
  OUTLINE_DEFAULT_CHARS,
  OUTLINE_KINDS,
  OUTLINE_LINE_FORMAT,
  OUTLINE_REGIONS,
  PAGE_PARSE_MAX_CHARS,
  PAGE_PATHS_PARALLEL,
  PAGE_TEXT_MAX_CHARS,
  browserRefusal,
  browserTargetForRoute,
  contentDoor,
  deploymentOriginOf,
  fetchPageHtml,
  foreignCharset,
  isThinPage,
  lookNoBrowserAnswer,
  nextHop,
  noReaderAnswer,
  outlineExcerpt,
  pageBodyRefusal,
  pageLookGate,
  pageOutline,
  pagePaths,
  pageRefusal,
  pageText,
  publicOriginFor,
  readPage,
  routeStart,
  styleLook,
  textExcerpt
} from '../src/host/page.mjs'
import { readablePage } from '../src/host/site.mjs'

const FIXTURES = path.join(import.meta.dirname, 'fixtures', 'pages')
const fixture = (name) => readFileSync(path.join(FIXTURES, name), 'utf8')

/** r2 `j-1ibzqi` C00, verbatim (`$S/specs/v2/r2-errors-examples.json`) — what docker wrote on STDOUT. */
const R2_OCI =
  'OCI runtime exec failed: exec failed: unable to start container process: exec: "node": executable file not found in $PATH\r\n'
const OCI_NO_CURL = R2_OCI.replace('"node"', '"curl"')

// ── a fake transport: what the container's curl and browser would answer ──────────────────────────

/** What one fetch argv asked: the Host it presented, its scheme, the loopback URL it dialled, its nonce. */
function asked(argv) {
  const nonce = /\n(TRACY_FETCH_[0-9a-f]{32}) /.exec(argv[argv.indexOf('--write-out') + 1])[1]
  const headers = argv.flatMap((a, i) => (a === '--header' ? [argv[i + 1]] : []))
  const header = (name) =>
    headers.find((h) => h.toLowerCase().startsWith(`${name.toLowerCase()}: `))?.slice(name.length + 2) ?? ''
  const url = new URL(argv.at(-1))
  return {
    nonce,
    host: header('Host'),
    proto: header('X-Forwarded-Proto'),
    dial: url.host,
    path: url.pathname + url.search,
    container: argv[3]
  }
}

/** A curl answer as the transport returns it. */
const answer = (
  nonce,
  { status = 200, headers = { 'Content-Type': 'text/html; charset=utf-8' }, body = '' } = {}
) => ({
  code: 0,
  stdout: `HTTP/1.1 ${status} X\r\n${Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}\r\n`)
    .join('')}\r\n${body}\n${nonce} ${status} ${Buffer.byteLength(body)}\n`,
  stderr: '',
  timedOut: false
})

/**
 * A `run` whose fetches are answered by `site(req)` → `{status, headers, body}` | a raw exec result,
 * and whose browser calls by `browser(argv)`. Every call is recorded.
 */
function transport({
  site,
  browser = () => ({
    code: 127,
    stdout: '',
    stderr: 'timeout: failed to run command ‘node’: No such file or directory',
    timedOut: false
  })
}) {
  const calls = []
  let running = 0
  let most = 0
  const run = async ({ argv }) => {
    running += 1
    most = Math.max(most, running)
    await new Promise((resolve) => setTimeout(resolve, 2))
    try {
      if (argv[4] === 'curl') {
        const req = asked(argv)
        calls.push({ kind: 'fetch', ...req, argv })
        const out = await site(req)
        return 'stdout' in out || 'code' in out
          ? { stderr: '', timedOut: false, ...out }
          : answer(req.nonce, out)
      }
      calls.push({ kind: argv.includes('timeout') ? 'browser' : 'other', argv })
      return browser(argv)
    } finally {
      running -= 1
    }
  }
  return { run, calls, most: () => most }
}

const page = (words, extra = '') =>
  `<html lang="en"><head><title>Home</title></head><body><header><a href="/">Brand</a></header><main><h1>${words}</h1><p>${'Real words of the page. '.repeat(12)}</p>${extra}</main></body></html>`

// ── where the site is ─────────────────────────────────────────────────────────────────────────────

test("publicOriginFor: the domain alone on a fleet host; the deployment origin adds the stand's scheme and port", () => {
  assert.deepEqual(publicOriginFor('wp-dmlj6g', 'tracy.test', 'http://tracy.test:51710'), {
    origin: 'http://wp-dmlj6g.tracy.test:51710',
    problem: null
  })
  assert.deepEqual(publicOriginFor('demo1', 'tracy.site', 'https://cowork.tracy.site'), {
    origin: 'https://demo1.tracy.site',
    problem: null
  })
  // today's behaviour, unchanged, when no deployment origin is given
  assert.deepEqual(publicOriginFor('demo1', 'tracy.site', undefined), {
    origin: 'https://demo1.tracy.site',
    problem: null
  })
  assert.deepEqual(publicOriginFor('demo1', 'tracy.site', ''), {
    origin: 'https://demo1.tracy.site',
    problem: null
  })
  // no domain → no public origin, and nothing to warn about (a host that was not told)
  assert.deepEqual(publicOriginFor('demo1', undefined, 'http://tracy.test:51710'), {
    origin: null,
    problem: null
  })
})

test('🔒 publicOriginFor: a malformed deployment origin is IGNORED (https, no port) and reported once, never guessed', () => {
  for (const bad of ['ftp://x', 'garbage', 'javascript:alert(1)', 'http://']) {
    const got = publicOriginFor('demo1', 'tracy.site', bad)
    assert.equal(got.origin, 'https://demo1.tracy.site', bad)
    assert.match(String(got.problem), /TRACY_DEPLOYMENT_ORIGIN/, bad)
  }
  assert.equal(deploymentOriginOf('http://tracy.test:51710').port, '51710')
  assert.equal(deploymentOriginOf('https://cowork.tracy.site').port, '')
  // a malformed DOMAIN is a problem too; a bad label is the caller's bug, not a deployment problem
  assert.match(String(publicOriginFor('demo1', 'not a domain', '').problem), /TRACY_SITE_DOMAIN/)
  assert.deepEqual(publicOriginFor('Bad Label', 'tracy.site', ''), { origin: null, problem: null })
})

test("routeStart: every read starts on the container's own loopback (D4)", () => {
  assert.deepEqual(routeStart('wp-dmlj6g', 80), {
    kind: 'loopback',
    origin: 'http://127.0.0.1',
    host: '127.0.0.1',
    proto: 'http',
    connectPort: 80,
    container: 'wp-dmlj6g-web-1'
  })
  assert.equal(routeStart('ed-ivj9ni', 4321)?.host, '127.0.0.1:4321')
  assert.equal(routeStart('x', 0)?.connectPort, 80)
  assert.equal(routeStart('Bad_Label', 80), null)
  assert.equal(routeStart('--privileged', 80), null)
})

// ── the redirect rules (D4) ───────────────────────────────────────────────────────────────────────

const LOOP = /** @type {const} */ (routeStart('demo1', 80))
const PUB = 'https://demo1.tracy.site'
const PUBLIC_ROUTE = { ...LOOP, kind: 'public', origin: PUB, host: 'demo1.tracy.site', proto: 'https' }

test('nextHop: same origin → followed; a relative Location resolves on the origin AS ASKED', () => {
  assert.deepEqual(nextHop(LOOP, '/', '/en/'), { follow: true, route: LOOP, pathAndQuery: '/en/' })
  assert.deepEqual(nextHop(LOOP, '/contact', 'http://127.0.0.1/contact/'), {
    follow: true,
    route: LOOP,
    pathAndQuery: '/contact/'
  })
  // on the public route a relative `/en/` stays on the PUBLIC origin, not on the loopback curl dialled
  const hop = nextHop(PUBLIC_ROUTE, '/', '/en/?a=1', PUB)
  assert.equal(hop.follow && hop.route.origin, PUB)
  assert.equal(hop.follow && hop.pathAndQuery, '/en/?a=1')
})

test('🔒 nextHop: EXACTLY the public origin is followed AS that origin, still connecting to loopback', () => {
  const hop = nextHop(LOOP, '/', 'https://demo1.tracy.site/', PUB)
  assert.equal(hop.follow, true)
  assert.deepEqual(hop.follow && hop.route, {
    kind: 'public',
    origin: PUB,
    host: 'demo1.tracy.site',
    proto: 'https',
    connectPort: 80,
    container: 'demo1-web-1'
  })
  // the stand's shape: http with a port
  const stand = nextHop(LOOP, '/', 'http://j-1ibzqi.tracy.test:51710/en/', 'http://j-1ibzqi.tracy.test:51710')
  assert.equal(stand.follow && stand.route.host, 'j-1ibzqi.tracy.test:51710')
  assert.equal(stand.follow && stand.route.proto, 'http')
  assert.equal(stand.follow && stand.pathAndQuery, '/en/')
})

test('🔒 nextHop: the public host on ANOTHER port or scheme is not the public origin — from loopback or the public route', () => {
  for (const location of ['https://demo1.tracy.site:8443/', 'http://demo1.tracy.site/']) {
    assert.deepEqual(nextHop(LOOP, '/', location, PUB).follow, false, location)
    assert.deepEqual(nextHop(PUBLIC_ROUTE, '/', location, PUB).follow, false, location)
  }
  // without a public origin the public name is just another host
  assert.equal(nextHop(LOOP, '/', 'https://demo1.tracy.site/', null).follow, false)
  // another host, from anywhere
  assert.deepEqual(nextHop(PUBLIC_ROUTE, '/', 'https://evil.example/', PUB), {
    follow: false,
    why: 'offsite',
    location: 'https://evil.example/'
  })
})

test('nextHop: from loopback, the same name on another port is WordPress redirect_canonical — followed, pinned', () => {
  const hop = nextHop(LOOP, '/', 'http://127.0.0.1:51710/')
  assert.equal(hop.follow, true)
  assert.deepEqual(hop.follow && [hop.route.kind, hop.route.host, hop.route.connectPort], [
    'canonical',
    '127.0.0.1:51710',
    80
  ])
  // EmDash on 4321 redirected to the implicit :80
  const ed = nextHop(/** @type {any} */ (routeStart('shop1', 4321)), '/', 'http://127.0.0.1/')
  assert.deepEqual(ed.follow && [ed.route.kind, ed.route.host, ed.route.connectPort], [
    'canonical',
    '127.0.0.1',
    4321
  ])
  // a scheme change is never bridged; port 0 is not a port; an empty Location is off-site
  assert.equal(nextHop(LOOP, '/', 'https://127.0.0.1:51710/').follow, false)
  assert.equal(nextHop(LOOP, '/', 'http://127.0.0.1:0/').follow, false)
  assert.deepEqual(nextHop(LOOP, '/', ''), { follow: false, why: 'offsite', location: '' })
  assert.deepEqual(nextHop(LOOP, '/', undefined), { follow: false, why: 'offsite', location: '' })
})

test('🔒 nextHop: a Location equal to the address just asked stops AT ONCE (a loop)', () => {
  assert.deepEqual(nextHop(LOOP, '/a', '/a'), { follow: false, why: 'loop', location: 'http://127.0.0.1/a' })
  assert.equal(nextHop(PUBLIC_ROUTE, '/', `${PUB}/`, PUB).follow, false)
  // a different query string is a different address
  assert.equal(nextHop(LOOP, '/a', '/a?x=1').follow, true)
})

test('browserTargetForRoute: public → served from loopback with the name resolving to NOTHING; canonical → virtual host', () => {
  assert.deepEqual(browserTargetForRoute('demo1', /** @type {any} */ (PUBLIC_ROUTE), '/en/', 80), {
    url: 'https://demo1.tracy.site/en/',
    origin: PUB,
    container: 'demo1-web-1',
    via: '127.0.0.1:80',
    resolverRule: '--host-resolver-rules=MAP demo1.tracy.site ~NOTFOUND'
  })
  const canonical = { ...LOOP, kind: 'canonical', origin: 'http://127.0.0.1:51710', host: '127.0.0.1:51710' }
  assert.deepEqual(browserTargetForRoute('demo1', /** @type {any} */ (canonical), '/', 80), {
    url: 'http://tracy-site.probe.invalid:51710/',
    origin: 'http://tracy-site.probe.invalid:51710',
    container: 'demo1-web-1',
    resolverRule: '--host-resolver-rules=MAP tracy-site.probe.invalid:51710 127.0.0.1:80',
    via: ''
  })
  assert.deepEqual(browserTargetForRoute('demo1', /** @type {any} */ (LOOP), '/a', 80), {
    url: 'http://127.0.0.1/a',
    origin: 'http://127.0.0.1',
    container: 'demo1-web-1',
    resolverRule: '',
    via: ''
  })
})

// ── what the read found ───────────────────────────────────────────────────────────────────────────

test('isThinPage: a JavaScript shell is thin; a no-script maintenance page and a real page are not', () => {
  const shell = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>'
  assert.equal(isThinPage(shell, readablePage(shell)), true)
  const maintenance = '<html><body><h1>Back soon</h1></body></html>'
  assert.equal(isThinPage(maintenance, readablePage(maintenance)), false)
  const real = `<html><body><p>${'x'.repeat(1178)}</p><script></script></body></html>`
  assert.equal(isThinPage(real, readablePage(real)), false)
})

test('foreignCharset: the header wins over <meta>; UTF-8 and ASCII are not foreign', () => {
  assert.equal(foreignCharset('text/html; charset=windows-1251', '<meta charset="utf-8">'), 'windows-1251')
  assert.equal(foreignCharset('text/html', '<meta charset="ISO-8859-1">'), 'iso-8859-1')
  assert.equal(foreignCharset('text/html; charset=UTF-8', ''), null)
  assert.equal(foreignCharset('', '<meta http-equiv="Content-Type" content="text/html; charset=utf8">'), null)
  assert.equal(foreignCharset(undefined, undefined), null)
})

test('pagePaths: path and paths merged and deduped; eight read, the rest in notRead', () => {
  assert.deepEqual(pagePaths('demo1', {}), { ok: true, targets: [{ path: '/' }], notRead: [], multi: false })
  assert.deepEqual(pagePaths('demo1', { path: '/a', paths: ['/b', '/a'] }), {
    ok: true,
    targets: [{ path: '/a' }, { path: '/b' }],
    notRead: [],
    multi: true
  })
  const nine = pagePaths('demo1', { paths: ['/1', '/2', '/3', '/4', '/5', '/6', '/7', '/8', '/9'] })
  assert.equal(nine.ok && nine.targets.length, 8)
  assert.deepEqual(nine.ok && nine.notRead, ['/9'])
  // a lone string for paths is one path
  assert.deepEqual(pagePaths('demo1', { paths: '/contact' }), {
    ok: true,
    targets: [{ path: '/contact' }],
    notRead: [],
    multi: false
  })
})

test('🔒 pagePaths: a bad entry is refused BY NAME before anything runs; `/\\host` is a host, not a path', () => {
  const bad = pagePaths('demo1', { paths: ['/', 'contact'] })
  assert.equal(bad.ok, false)
  assert.equal(!bad.ok && bad.answer.code, 'BAD_PATH')
  assert.match(!bad.ok ? bad.answer.error : '', /^paths\[1\]:/)
  for (const p of ['/\\evil.example', '//evil.example', '/a b', 'http://evil.example/'])
    assert.equal(pagePaths('demo1', { path: p }).ok, false, p)
  assert.equal(pagePaths('demo1', { paths: 5 }).ok, false)
})

// ── the read ──────────────────────────────────────────────────────────────────────────────────────

test('readPage: one hop 200 → the page, on loopback, hops 1', async () => {
  const t = transport({ site: () => ({ body: page('Hello') }) })
  const read = await readPage({ run: t.run, label: 'shop1', internalPort: 4321, path: '/' })
  assert.equal(read.ok, true)
  assert.equal(read.ok && read.hops, 1)
  assert.equal(read.ok && read.finalUrl, 'http://127.0.0.1:4321/')
  assert.deepEqual(
    t.calls.map((c) => [c.container, c.host, c.proto, c.dial, c.path]),
    [['shop1-web-1', '127.0.0.1:4321', 'http', '127.0.0.1:4321', '/']]
  )
})

test('🔒 readPage (stand WordPress): loopback 301 → the exact public origin → asked AS it, still dialling loopback', async () => {
  const t = transport({
    site: (req) =>
      req.host === '127.0.0.1'
        ? { status: 301, headers: { Location: 'http://wp-dmlj6g.tracy.test:51710/' } }
        : { body: page('Home') }
  })
  const read = await readPage({
    run: t.run,
    label: 'wp-dmlj6g',
    internalPort: 80,
    publicOrigin: 'http://wp-dmlj6g.tracy.test:51710',
    path: '/'
  })
  assert.equal(read.ok, true)
  assert.equal(read.ok && read.finalUrl, 'http://wp-dmlj6g.tracy.test:51710/')
  assert.deepEqual(
    t.calls.map((c) => [c.host, c.proto, c.dial]),
    [
      ['127.0.0.1', 'http', '127.0.0.1'],
      ['wp-dmlj6g.tracy.test:51710', 'http', '127.0.0.1']
    ]
  )
})

test('🔒 nextHop: loopback upgraded to https (Joomla force_ssl) is asked again AS the https public origin', () => {
  // Measured on dev 25/09/2026: Joomla force_ssl=2 answers http://127.0.0.1/ with 301 https://127.0.0.1/.
  const hop = nextHop(LOOP, '/', 'https://127.0.0.1/', PUB)
  assert.equal(hop.follow, true)
  assert.equal(hop.follow && hop.route.kind, 'public')
  assert.equal(hop.follow && hop.route.origin, PUB)
  assert.equal(hop.follow && hop.route.connectPort, 80)
  assert.equal(hop.follow && hop.pathAndQuery, '/')
  // Not without an https public origin, not from a non-loopback route, not to another host.
  assert.equal(nextHop(LOOP, '/', 'https://127.0.0.1/', null).follow, false)
  assert.equal(nextHop(LOOP, '/', 'https://127.0.0.1/', 'http://demo1.tracy.test:51710').follow, false)
  assert.equal(nextHop(PUBLIC_ROUTE, '/', 'https://127.0.0.1/', PUB).follow, false)
  assert.equal(nextHop(LOOP, '/', 'https://10.0.0.9/', PUB).follow, false)
  assert.equal(nextHop(LOOP, '/', 'https://127.0.0.1:51710/', PUB).follow, false)
})

test('🔒 readPage (Joomla on a fleet host): force_ssl → https://127.0.0.1/ → asked AS the public origin → /en/', async () => {
  const t = transport({
    site: (req) =>
      req.host === '127.0.0.1'
        ? { status: 301, headers: { Location: 'https://127.0.0.1/' } }
        : req.path === '/'
          ? { status: 301, headers: { Location: 'https://demo1.tracy.site/en/' } }
          : { body: page('Home') }
  })
  const read = await readPage({ run: t.run, label: 'demo1', internalPort: 80, publicOrigin: PUB, path: '/' })
  assert.equal(read.ok && read.finalUrl, 'https://demo1.tracy.site/en/')
  assert.deepEqual(
    t.calls.map((c) => [c.host, c.path]),
    [
      ['127.0.0.1', '/'],
      ['demo1.tracy.site', '/'],
      ['demo1.tracy.site', '/en/']
    ]
  )
})

test('🔒 readPage (Joomla): / → 301 /en/ on the public origin → the SAME Host asks /en/', async () => {
  const t = transport({
    site: (req) =>
      req.path === '/'
        ? { status: 301, headers: { Location: 'http://j-x.tracy.test:51710/en/' } }
        : { body: page('Home') }
  })
  const read = await readPage({
    run: t.run,
    label: 'j-x',
    internalPort: 80,
    publicOrigin: 'http://j-x.tracy.test:51710',
    path: '/'
  })
  assert.equal(read.ok && read.finalUrl, 'http://j-x.tracy.test:51710/en/')
  assert.deepEqual(
    t.calls.map((c) => [c.host, c.path]),
    [
      ['127.0.0.1', '/'],
      ['j-x.tracy.test:51710', '/en/']
    ]
  )
})

test('🔒 readPage (fleet): https public origin → Host + X-Forwarded-Proto: https, no TLS, loopback dialled', async () => {
  const t = transport({
    site: (req) =>
      req.host === '127.0.0.1' ? { status: 301, headers: { Location: `${PUB}/` } } : { body: page('Home') }
  })
  const read = await readPage({ run: t.run, label: 'demo1', internalPort: 80, publicOrigin: PUB, path: '/' })
  assert.equal(read.ok && read.finalUrl, `${PUB}/`)
  assert.deepEqual(t.calls[1].argv.slice(0, 6), ['exec', '-u', 'www-data', 'demo1-web-1', 'curl', '-q'])
  assert.equal(t.calls[1].argv.at(-1), 'http://127.0.0.1/')
  assert.deepEqual([t.calls[1].host, t.calls[1].proto], ['demo1.tracy.site', 'https'])
})

test('🔒 readPage: a redirect OFF the site is refused after ONE exec — nothing is asked of the other host', async () => {
  for (const location of [
    'https://evil.example/phish',
    'http://demo1.tracy.site/',
    'https://127.0.0.1:51710/'
  ]) {
    const t = transport({ site: () => ({ status: 302, headers: { Location: location } }) })
    const read = await readPage({
      run: t.run,
      label: 'demo1',
      internalPort: 80,
      publicOrigin: PUB,
      path: '/'
    })
    assert.equal(!read.ok && read.why, 'offsite', location)
    assert.equal(t.calls.length, 1, location)
  }
})

test('🔒 readPage: a host not told its site domain keeps the public-name redirect off-site (one exec)', async () => {
  const t = transport({ site: () => ({ status: 301, headers: { Location: `${PUB}/` } }) })
  const read = await readPage({ run: t.run, label: 'demo1', internalPort: 80, publicOrigin: null, path: '/' })
  assert.equal(!read.ok && read.why, 'offsite')
  assert.equal(t.calls.length, 1)
})

test('🔒 readPage: the public address redirecting on to another port, scheme or host is refused — never asked', async () => {
  for (const location of [
    'https://demo1.tracy.site:8443/',
    'http://demo1.tracy.site/',
    'https://evil.example/'
  ]) {
    const t = transport({
      site: (req) =>
        req.host === '127.0.0.1'
          ? { status: 301, headers: { Location: `${PUB}/` } }
          : { status: 302, headers: { Location: location } }
    })
    const read = await readPage({
      run: t.run,
      label: 'demo1',
      internalPort: 80,
      publicOrigin: PUB,
      path: '/'
    })
    assert.equal(!read.ok && read.why, 'offsite', location)
    assert.equal(t.calls.length, 2, location)
  }
})

test('readPage: WordPress redirect_canonical from loopback → asked as that authority, connection pinned', async () => {
  const t = transport({
    site: (req) =>
      req.host === '127.0.0.1'
        ? { status: 301, headers: { Location: 'http://127.0.0.1:51710/' } }
        : { body: page('Home') }
  })
  const read = await readPage({ run: t.run, label: 'demo1', internalPort: 80, path: '/' })
  assert.equal(read.ok && read.route.kind, 'canonical')
  assert.deepEqual(
    t.calls.map((c) => [c.host, c.dial]),
    [
      ['127.0.0.1', '127.0.0.1'],
      ['127.0.0.1:51710', '127.0.0.1']
    ]
  )
})

test('🔒 readPage: a self-redirect stops at once; six same-origin hops are a loop; the budget stops a slow chain', async () => {
  const self = transport({ site: () => ({ status: 301, headers: { Location: '/a' } }) })
  const s = await readPage({ run: self.run, label: 'demo1', internalPort: 80, path: '/a' })
  assert.equal(!s.ok && s.why, 'loop')
  assert.equal(self.calls.length, 1)

  let n = 0
  const chain = transport({ site: () => ({ status: 302, headers: { Location: `/hop${(n += 1)}` } }) })
  const c = await readPage({ run: chain.run, label: 'demo1', internalPort: 80, path: '/' })
  assert.equal(!c.ok && c.why, 'loop')
  assert.equal(chain.calls.length, 5)

  let clock = 0
  const slow = transport({
    site: () => {
      clock += 7000
      return { status: 302, headers: { Location: `/s${clock}` } }
    }
  })
  const w = await readPage({ run: slow.run, label: 'demo1', internalPort: 80, path: '/', now: () => clock })
  assert.equal(!w.ok && w.why, 'slow')
  assert.equal(slow.calls.length, 3, 'the third hop left < 1 s of the 15 s budget, so no fourth was started')
})

test('🔒 readPage: each exec failure is classified in the measured order; a cut output is never a page', async () => {
  const cases = [
    [{ code: 127, stdout: OCI_NO_CURL, stderr: '' }, 'no-curl'],
    [
      {
        code: 126,
        stdout: '',
        stderr: 'OCI runtime exec failed: exec: "curl": executable file not found in $PATH'
      },
      'no-curl'
    ],
    [{ code: 0, stdout: OCI_NO_CURL, stderr: '' }, 'no-curl'],
    [
      {
        code: 7,
        stdout: '',
        stderr: "curl: (7) Failed to connect to 127.0.0.1 port 80 after 0 ms: Couldn't connect to server"
      },
      'unreachable'
    ],
    [{ code: 28, stdout: '', stderr: 'curl: (28) Operation timed out' }, 'slow'],
    [{ code: null, stdout: '', stderr: '', timedOut: true }, 'slow'],
    [
      {
        code: null,
        stdout: 'HTTP/1.1 200 OK\r\n\r\n<p>',
        stderr: '',
        spawnError: 'stdout maxBuffer length exceeded'
      },
      'too-large'
    ],
    [
      { code: 1, stdout: '', stderr: 'Error response from daemon: No such container: demo1-web-1' },
      'unreachable'
    ],
    [{ code: 0, stdout: 'HTTP/1.1 200 OK\r\n\r\n<p>half a pa', stderr: '' }, 'unreachable']
  ]
  for (const [out, why] of cases) {
    const t = transport({ site: () => out })
    const read = await readPage({ run: t.run, label: 'demo1', internalPort: 80, path: '/' })
    assert.equal(!read.ok && read.why, why, JSON.stringify(out))
  }
  // exit 63 is read BEFORE the status: the closing line of a refused 5 MiB body still says 200
  const big = transport({ site: (req) => ({ ...answer(req.nonce, { body: '' }), code: 63 }) })
  const r63 = await readPage({ run: big.run, label: 'demo1', internalPort: 80, path: '/' })
  assert.equal(!r63.ok && r63.why, 'too-large')
})

test('readPage: a compressed body is `encoded`, handed on (the read never decompresses)', async () => {
  const t = transport({
    site: () => ({ headers: { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' }, body: '\x1f\x8b' })
  })
  const read = await readPage({ run: t.run, label: 'demo1', internalPort: 80, path: '/' })
  assert.equal(!read.ok && read.why, 'encoded')
})

// ── refusals the model reads (T10) ────────────────────────────────────────────────────────────────

const DOORS = [
  contentDoor(),
  contentDoor({ platform: 'wordpress' }),
  contentDoor({ platform: 'joomla', sealed: true }),
  contentDoor({ platform: 'joomla', sealed: false }),
  contentDoor({ platform: 'emdash' })
]

test("🔒 every page refusal fits T10 — error ≤ 160 chars, next ≤ 200 — on every surface's door", () => {
  const long = `/${'x'.repeat(300)}`
  const reads = [
    {
      why: 'bad-path',
      url: '',
      detail: 'path must be a path on this site, starting with a single "/" and without spaces'
    },
    { why: 'no-curl', url: 'http://127.0.0.1/', detail: 'no curl' },
    {
      why: 'offsite',
      url: 'http://127.0.0.1/',
      detail: 'x',
      location: `https://evil.example/${'y'.repeat(300)}`
    },
    { why: 'loop', url: 'http://127.0.0.1/', detail: 'more than 5 redirects' },
    { why: 'slow', url: 'http://127.0.0.1/', detail: 'longer than 8 s' },
    { why: 'too-large', url: 'http://127.0.0.1/', detail: 'larger than 4 MiB' },
    { why: 'encoded', url: 'http://127.0.0.1/', detail: 'gzip' },
    {
      why: 'unreachable',
      url: `http://127.0.0.1:4321${long}`,
      detail: "the site's web container is not running"
    }
  ]
  for (const door of DOORS)
    for (const read of reads)
      for (const p of ['/', long]) {
        const a = pageRefusal(/** @type {any} */ (read), p, door)
        assert.ok(a.error.length <= 160, `${read.why} error ${a.error.length}: ${a.error}`)
        assert.ok(a.next.length <= 200, `${read.why} next ${a.next.length}: ${a.next}`)
      }
  for (const door of DOORS) {
    for (const a of [
      noReaderAnswer(door),
      noReaderAnswer(door, 'curl'),
      lookNoBrowserAnswer(true, door),
      lookNoBrowserAnswer(false, door)
    ]) {
      assert.ok(a.error.length <= 160 && a.next.length <= 200, JSON.stringify(a))
      assert.doesNotMatch(a.next, /check the site is running/i)
    }
  }
  // the browser fallback's refusals and the body refusals (review finding 5: the off-site one reached
  // 175 chars, and a port with no pin read "left this site for a port … in the browser")
  const failures = [
    { kind: 'port', error: 'a port this site does not expose here' },
    { kind: 'offsite', error: `https://evil.example/${'y'.repeat(300)}` },
    { kind: 'nav', error: 'it could not open the page' },
    { kind: 'error', error: 'it ran out of time' },
    { kind: 'error', error: 'it returned no whole document' },
    { kind: 'error', error: 'the document was cut off before it finished' }
  ]
  for (const door of DOORS)
    for (const p of ['/', long]) {
      for (const b of failures) {
        const a = browserRefusal(p, /** @type {any} */ ({ ok: false, ...b }), door)
        assert.ok(a.error.length <= 160, `${b.kind} error ${a.error.length}: ${a.error}`)
        assert.ok(a.next.length <= 200, `${b.kind} next ${a.next.length}: ${a.next}`)
      }
      for (const a of [
        pageBodyRefusal('too-large', p, door),
        pageBodyRefusal('not-a-page', p, door, `application/${'x'.repeat(300)}; charset=utf-8`)
      ]) {
        assert.ok(a.error.length <= 160, `body error ${a.error.length}: ${a.error}`)
        assert.ok(a.next.length <= 200, `body next ${a.next.length}: ${a.next}`)
      }
    }
  const port = browserRefusal(
    '/x',
    { ok: false, kind: 'port', error: 'a port this site does not expose here' },
    DOORS[1]
  )
  assert.equal(port.error, '/x asks to be served on a port this site does not expose here')
})

test('🔒 the r2 OCI missing-binary string maps to NO_BROWSER, and the raw OCI text never reaches the answer', async () => {
  const t = transport({ site: () => ({ code: 127, stdout: OCI_NO_CURL, stderr: '' }) })
  const door = contentDoor({ platform: 'wordpress' })
  const out = /** @type {any} */ (
    await pageText({ run: t.run, label: 'wp-x', internalPort: 80, params: {}, door })
  )
  assert.equal(out.code, 'NO_BROWSER')
  assert.equal(out.next, 'Read the words through the content door instead: content.get {kind:"post", id}.')
  assert.doesNotMatch(JSON.stringify(out), /OCI|executable file|\$PATH/)
  // the EXACT r2 string (docker named node there) classifies the same way: what is missing decides, not its name
  const exact = transport({ site: () => ({ code: 127, stdout: R2_OCI, stderr: '' }) })
  const same = /** @type {any} */ (
    await pageText({ run: exact.run, label: 'j-1ibzqi', internalPort: 80, params: {}, door })
  )
  assert.equal(same.code, 'NO_BROWSER')
  assert.doesNotMatch(JSON.stringify(same), /OCI|executable file|\$PATH/)
  // the legacy probe (IX1) answers the same when node is missing too: G1's text, the content door
  assert.deepEqual(noReaderAnswer(contentDoor({ platform: 'joomla', sealed: true })), {
    ok: false,
    code: 'NO_BROWSER',
    error: "this site's container has neither curl nor node, so its pages cannot be read here",
    next: 'Read the words through the content door instead: content.contract {operation:"inspect", match}.'
  })
})

test("🔒 an unreachable site's refusal names the reason in words, never the raw stderr", async () => {
  const t = transport({
    site: () => ({
      code: 7,
      stdout: '',
      stderr: "curl: (7) Failed to connect to 127.0.0.1 port 80 after 0 ms: Couldn't connect to server"
    })
  })
  const out = /** @type {any} */ (
    await fetchPageHtml({ run: t.run, label: 'demo1', internalPort: 80, path: '/' })
  )
  assert.equal(out.code, 'SITE_UNREACHABLE')
  assert.equal(out.error, 'http://127.0.0.1/ did not answer: nothing answers on port 80')
  assert.doesNotMatch(JSON.stringify(out), /curl: \(7\)/)
})

// Round 7 (30/09/2026, EmDash on a loaded stand): two runs sent the identical page.text again after the 8 s
// timeout and waited another 8 s; one read words "through content_get {collection, id:<slug>}" with a slug it
// did not have (`services`, NOT_FOUND) and read the page twice more.
{
  const slow = { why: 'slow', url: 'http://127.0.0.1/', detail: 'longer than 8 s' }
  const rows = [
    ['a site of no known platform', contentDoor()],
    ['WordPress', contentDoor({ platform: 'wordpress' })],
    ['sealed Joomla', contentDoor({ platform: 'joomla', sealed: true })],
    ['open Joomla', contentDoor({ platform: 'joomla', sealed: false })]
  ]
  for (const [label, door] of rows)
    test(`🔒 a slow site is not a read to repeat: the next sends quoted words to content.replace and names the read that is left: ${label}`, () => {
      const a = pageRefusal(/** @type {any} */ (slow), '/services', door)

      assert.equal(a.code, 'READ_FAILED')
      assert.equal(
        a.next,
        `Do not repeat this read. Quoted words go straight to content.replace {find, replace}; to read: ${door}.`
      )
      assert.doesNotMatch(a.next, /Try once more/)
      assert.ok(a.next.length <= 200, `${a.next.length}`)
    })

  // Review of round 7, RL-2: on EmDash `content.replace` reads the page AND the whole entry index, and the
  // index read ran to its 45 s deadline 19 times in 10 runs on the same loaded stand while one-entry reads
  // of `tracy_emdash` answered in under 8 s — so a slow page read does not send quoted words there.
  test('🔒 a slow site on EmDash is sent to the one-entry read, not to content.replace (its own index read is the slow one)', () => {
    const a = pageRefusal(/** @type {any} */ (slow), '/services', contentDoor({ platform: 'emdash' }))

    assert.equal(a.code, 'READ_FAILED')
    assert.match(a.next, /^Do not repeat this read\./)
    assert.doesNotMatch(a.next, /content\.replace|Try once more/)
    // A picked element's mark holds the collection, the id and the slug; a chat finds the collection in the list.
    assert.match(
      a.next,
      /content_get \{collection, id:"<slug>"\} from a picked mark \(emdash:<collection>:<id>:<slug>\)/
    )
    assert.match(a.next, /else schema_list_collections, then content_list \{collection\}/)
    assert.ok(a.next.length <= 200, `${a.next.length}`)
  })

  test('the other refusals keep their words: only a slow read changed', () => {
    const loop = pageRefusal(
      /** @type {any} */ ({ why: 'loop', url: 'http://127.0.0.1/', detail: 'more than 5 redirects' }),
      '/',
      contentDoor({ platform: 'wordpress' })
    )

    assert.match(loop.next, /^That path cannot be read as a page; read its words through /)
  })
}

test('contentDoor: each surface names only its own read (never an action it lacks)', () => {
  assert.equal(contentDoor({ platform: 'wordpress' }), 'content.get {kind:"post", id}')
  assert.equal(
    contentDoor({ platform: 'joomla', sealed: true }),
    'content.contract {operation:"inspect", match}'
  )
  assert.doesNotMatch(contentDoor({ platform: 'joomla', sealed: false }), /content\.contract/)
  assert.doesNotMatch(contentDoor({ platform: 'wordpress' }), /content\.contract/)
})

// Review of round 7, RL-1. The EmDash road to a page's words named `search`, whose index holds only the
// collections that have `search` in their `supports` and fields marked `searchable`. Held against the
// templates the road walks: every page collection (a `urlPattern` with no `{slug}`) is outside that index,
// so `search` finds none of a page's own copy — the road is the collection list, whose rows carry the path.
{
  const seedOf = (/** @type {string} */ template) =>
    JSON.parse(
      readFileSync(
        new URL(`../../../cms/tracy-emdash-theme-${template}/seed/seed.json`, import.meta.url),
        'utf8'
      )
    )
  for (const template of ['base', 'business'])
    test(`the EmDash road to a page's words fits the ${template} template: its page collections carry their path and no search index`, () => {
      const pages = seedOf(template).collections.filter(
        (/** @type {any} */ c) => typeof c.urlPattern === 'string' && !c.urlPattern.includes('{slug}')
      )

      assert.ok(pages.length >= 5, `${pages.length} page collections`)
      for (const c of pages) {
        assert.equal((c.supports ?? []).includes('search'), false, `${c.slug} is in the search index`)
        assert.deepEqual(
          (c.fields ?? [])
            .filter((/** @type {any} */ f) => f.searchable)
            .map((/** @type {any} */ f) => f.slug),
          [],
          `${c.slug} has searchable fields`
        )
      }
      const door = contentDoor({ platform: 'emdash' })
      assert.doesNotMatch(door, /\bsearch\b/)
      assert.match(
        door,
        /schema_list_collections \(urlPattern = the path\), then content_list \{collection\}/
      )
    })
}

// ── the outline, on the three ja-business homes ───────────────────────────────────────────────────

const WP = { html: fixture('wp-home.html'), url: 'http://wp-dmlj6g.tracy.test:51710/' }
const J = { html: fixture('j-home.html'), url: 'http://j-1ibzqi.tracy.test:51710/en/' }
const ED = { html: fixture('ed-home.html'), url: 'http://ed-ivj9ni.tracy.test:51710/' }

test('pageOutline (EmDash home): the top bar before <header>, the home-link logo, a flex row of links cut into links', () => {
  const lines = pageOutline(ED.html, ED.url)
  assert.deepEqual(lines.slice(0, 8), [
    'topbar list: Hotline: 0123456789 · 123 Ba Đình, Hà Nội david@lab3.example · Careers',
    'topbar button: English',
    'topbar button: Dark',
    'header logo: BXT · BÁN XE NỘI THẬT · Real wood furniture sales',
    'header nav: Home [/] · About [/about] · Services [/services] · Projects [/projects] · News [/news] · Contact [/contact] · Resources',
    'header button: Ask about a piece [/contact]',
    // the hero badge above the h1: the first words of its section (the "small line above the heading")
    'main text: Hà Nội workshop',
    'main h1 (2 lines): Furniture built to fit your exact space'
  ])
  assert.ok(lines.includes('main button: See our work [/services]'))
  assert.ok(lines.includes('footer text: Mon–Fri, 9:00–18:00 (MSK)'))
  assert.ok(lines.includes('footer text: © 2026 bán xe nội thật'))
})

test('pageOutline (WordPress home): topbar inside <header>, logo parts joined, the lede after h1, dropdowns last as drawer', () => {
  const lines = pageOutline(WP.html, WP.url)
  assert.deepEqual(lines.slice(0, 12), [
    'topbar link: Hotline: 8 800 550-67-89 [tel:+78005506789]',
    'topbar link: info@northgate-ind.ru [mailto:info@northgate-ind.ru]',
    'topbar p: Vorsino Industrial Park, Kaluga Region',
    'topbar nav: Careers [/careers/] · Investors [/investor-relations/]',
    'topbar button: English',
    'topbar button: Dark',
    'header logo: Northgate · Industrial infrastructure',
    'header nav: Home [/] · About [/about/] · Services [/services/] · Projects [/projects/] · News [/news/] · Contact [/contact/]',
    'header button: Resources',
    'header button: Request a quote [/contact/]',
    'main p: Established 2004',
    'main h1 (2 lines): Building the groundwork for next-generation plants'
  ])
  assert.match(lines[12], /^main p: Design–build main contractor/)
  // the 41-language picker is a closed <dialog>: ONE drawer line, at the end, not 41 lines
  const langs = lines.filter((l) => l.includes('Deutsch'))
  assert.deepEqual(langs, [
    'drawer list: English · Русский · Deutsch · Afrikaans · Беларуская мова · Български · Català · Čeština · +33 more'
  ])
  const firstDrawer = lines.findIndex((l) => l.startsWith('drawer '))
  assert.ok(
    firstDrawer > lines.findLastIndex((l) => l.startsWith('footer ')),
    'drawer lines come after the footer'
  )
  assert.ok(lines.includes('drawer h3: Marketing kit'))
  // hidden words are not printed: the skip link, the `hidden` "No matching languages", the aria-hidden NG mark
  assert.ok(!lines.some((l) => /Skip to content|No matching languages|\bNG\b/.test(l)))
})

test('pageOutline (Joomla home): no <main> — section heads stay in main; off-canvas copies drop, the 43-language list is one line', () => {
  const lines = pageOutline(J.html, J.url)
  assert.deepEqual(lines.slice(0, 10), [
    'topbar list: Hotline: 8 800 550-67-90 [tel:88005506790] · info@northgate-ind.ru [mailto:info@northgate-ind.ru] · Vorsino Industrial Park, Kaluga Region',
    'topbar nav: Careers [/en/careers] · Investors [/en/investors]',
    'topbar button: English',
    'topbar button: Dark',
    'topbar button: Light',
    'header logo: Northgate · Industrial infrastructure',
    'header nav: Home [/en/] · About [/en/about] · Services [/en/services] · Projects [/en/projects] · News [/en/news] · Contact [/en/contact] · Resources',
    'header button: Request a quote [/en/contact]',
    'main p: Established 2004',
    'main h1 (2 lines): Toyota Hanoi Motors — your authorised Toyota dealer'
  ])
  // `header.tb-section__head` inside every band is NOT the page header
  assert.ok(lines.includes('main h2: Four core service lines'))
  assert.ok(!lines.some((l) => l.startsWith('header h2')))
  // the off-canvas logo and button are copies of the header's: printed once, not again as drawer
  assert.equal(lines.filter((l) => l.endsWith(': Northgate · Industrial infrastructure')).length, 1)
  assert.equal(lines.filter((l) => l.includes('Request a quote')).length, 1)
  // 43 languages = one line (8 shown + 35 more)
  const langs = lines.filter((l) => l.includes('Polski'))
  assert.equal(langs.length, 1)
  assert.match(langs[0], /^drawer list: .* · \+35 more$/)
  // the off-canvas menu is a drawer line, printed after the footer
  const offCanvas = lines.findIndex((l) => l.startsWith('drawer nav: Home [/en/] \u00b7 About [/en/about]'))
  assert.ok(
    offCanvas > lines.findLastIndex((l) => l.startsWith('footer ')),
    'the off-canvas copy comes last, as drawer'
  )
  // the mega menu's dropdown items are drawer, not header nav
  assert.ok(
    lines.some((l) =>
      l.startsWith('drawer nav: Newsletter Digest email template [/en/marketing-kit/newsletter]')
    )
  )
})

test('🔒 pageOutline: a section with no heading is in the outline by its first words (eyebrows, the clients strip)', () => {
  // Measured 25/09/2026 on the local stand: the Joomla and EmDash agents answered "which sections does
  // the home page have" from the outline and both left out "Clients we have built for" — a band whose
  // title is an eyebrow <p> (Joomla, WordPress) or a <span> (EmDash), never a heading.
  for (const [name, page] of [
    ['Joomla', J],
    ['WordPress', WP]
  ]) {
    const lines = pageOutline(page.html, page.url)
    assert.ok(lines.includes('main p: Clients we have built for'), name)
  }
  const span = pageOutline(
    '<html><body><main><section><h2>News</h2><p>Lede</p><p>Second</p></section>' +
      '<section><span>Clients we have built for</span><img src="/a.png" alt="A"><span>Other</span></section></main></body></html>'
  )
  assert.ok(span.includes('main text: Clients we have built for'))
  // Only a section's FIRST words: the rest of a heading-less band stays out of the skeleton, and a
  // paragraph after a lede in a headed section is still left out.
  assert.ok(!span.includes('main text: Other'))
  assert.ok(!span.includes('main p: Second'))
})

test('pageOutline: suppressed, deduped, collapsed — the rules in one small page', () => {
  const html =
    '<body><header><a class="skip-link" href="#m">Skip</a><div class="site-logo"><a href="/"><span>NG</span><span>North</span></a></div>' +
    '<nav><a href="/">Home</a><a href="https://other.example/x">Partner</a><a href="#top">Top</a><a href="javascript:void(0)">JS</a>' +
    '<a href="/1">1</a><a href="/2">2</a><a href="/3">3</a><a href="/4">4</a><a href="/5">5</a></nav></header>' +
    '<main><h1>Title</h1><p>Lede.</p><p>Second paragraph is not printed.</p><h2>Band</h2><p>Band lede.</p>' +
    '<p><a class="btn btn-primary" href="/go">Go</a></p><a href="tel:+84123">Call 0123</a></main>' +
    `<footer><p>${'y'.repeat(300)}</p><span>Mon–Fri</span><nav><a href="/">Home</a><a href="https://other.example/x">Partner</a><a href="#top">Top</a><a href="javascript:void(0)">JS</a><a href="/1">1</a><a href="/2">2</a><a href="/3">3</a><a href="/4">4</a><a href="/5">5</a></nav></footer></body>`
  const lines = pageOutline(html, 'https://demo1.tracy.site/')
  assert.deepEqual(lines, [
    'header logo: NG · North',
    'header nav: Home [/] · Partner [other.example] · Top · JS · 1 [/1] · 2 [/2] · 3 [/3] · 4 [/4] · +1 more',
    'main h1: Title',
    'main p: Lede.',
    'main h2: Band',
    'main p: Band lede.',
    'main link: Call 0123 [tel:+84123]',
    `footer p: ${'y'.repeat(300)}`,
    'footer text: Mon–Fri'
  ])
  // the footer nav is an identical item list: printed once
})

test("pageOutline: this site's own absolute links read as paths when the read ended on loopback", () => {
  const html = '<body><header><nav><a href="https://demo1.tracy.site/about/">About</a></nav></header></body>'
  assert.deepEqual(pageOutline(html, 'http://127.0.0.1/', { origins: [PUB] }), [
    'header nav: About [/about/]'
  ])
  assert.deepEqual(pageOutline(html, 'http://127.0.0.1/'), ['header nav: About [demo1.tracy.site]'])
})

test('outlineExcerpt: match keeps only matching lines, WHOLE; a long line is cut unless matched; cap at a line boundary', () => {
  const long = `footer p: ${'word '.repeat(80).trim()}`
  const lines = ['main h1: Hello world', 'main p: Hotline 0123', long, 'footer text: Mon–Fri']
  const all = outlineExcerpt(lines, null, OUTLINE_DEFAULT_CHARS)
  assert.match(all.text, /footer p: (word ){47}word… \(399 chars\)\n/)
  assert.equal(all.truncated, false)
  const m = outlineExcerpt(lines, 'word', OUTLINE_DEFAULT_CHARS)
  assert.deepEqual([m.text, m.matched], [long, 1])
  assert.equal(outlineExcerpt(lines, 'mon-fri', 5000).text, 'footer text: Mon–Fri')
  const cut = outlineExcerpt(lines, null, 60)
  assert.equal(cut.truncated, true)
  assert.equal(cut.text, 'main h1: Hello world\nmain p: Hotline 0123\n… +2 lines')
})

test('textExcerpt: match keeps ONLY the lines carrying it (T8), folded; the cap cuts at a line boundary', () => {
  const text = 'Welcome\nHotline: 0123 456\nOpen Mon–Fri\nMail: a@b.c\nBye'
  assert.deepEqual(textExcerpt(text, '@', 2000), {
    text: 'Mail: a@b.c',
    truncated: false,
    chars: 11,
    matched: 1
  })
  assert.deepEqual(textExcerpt(text, 'mon-fri', 2000).text, 'Open Mon–Fri')
  assert.deepEqual(textExcerpt(text, 'nothing here', 2000), {
    text: '',
    truncated: false,
    chars: 0,
    matched: 0
  })
  assert.deepEqual(textExcerpt(text, null, 20), {
    text: 'Welcome',
    truncated: true,
    chars: text.length,
    matched: null
  })
  // one line longer than the cap is cut inside itself, never answered empty
  assert.equal(textExcerpt('x'.repeat(50), null, 10).text, 'x'.repeat(10))
})

// ── page.text whole ───────────────────────────────────────────────────────────────────────────────

test('🔒 pageText (WordPress-shaped: curl yes, node no): the words, with NO probe and NO browser exec', async () => {
  const t = transport({
    site: (req) =>
      req.host === '127.0.0.1'
        ? { status: 301, headers: { Location: 'http://wp-x.tracy.test:51710/' } }
        : { body: WP.html }
  })
  const out = /** @type {any} */ (
    await pageText({
      run: t.run,
      label: 'wp-x',
      internalPort: 80,
      publicOrigin: 'http://wp-x.tracy.test:51710',
      params: { match: 'Hotline' }
    })
  )
  assert.equal(out.ok, true)
  assert.equal(out.url, 'http://wp-x.tracy.test:51710/')
  assert.equal(out.lang, 'en-US')
  assert.equal(out.matchedLines, 1)
  assert.equal(out.text, 'Hotline: 8 800 550-67-89')
  assert.deepEqual(
    t.calls.map((c) => c.kind),
    ['fetch', 'fetch']
  )
  assert.ok(!t.calls.some((c) => c.argv.includes('node')))
})

test('🔒 pageText (T8 budget): text ≤ 2,000 by default, maxChars clamped to 8,000; a cut names match first, maxChars second', async () => {
  const big = `<html><body><main>${Array.from({ length: 900 }, (_, i) => `<p>Line number ${i} of the page</p>`).join('')}</main></body></html>`
  const t = transport({ site: () => ({ body: big }) })
  const out = /** @type {any} */ (
    await pageText({ run: t.run, label: 'demo1', internalPort: 80, params: {} })
  )
  assert.ok(out.text.length <= 2000)
  assert.equal(out.truncated, true)
  assert.ok(out.next.indexOf('match') < out.next.indexOf('maxChars'), out.next)
  const huge = /** @type {any} */ (
    await pageText({ run: t.run, label: 'demo1', internalPort: 80, params: { maxChars: 50_000 } })
  )
  assert.ok(huge.text.length <= PAGE_TEXT_MAX_CHARS && huge.text.length > 7000)
  const outline = /** @type {any} */ (
    await pageText({
      run: t.run,
      label: 'demo1',
      internalPort: 80,
      params: { outline: true, maxChars: 50_000 }
    })
  )
  assert.ok(outline.outline.length <= PAGE_TEXT_MAX_CHARS)
})

test('🔒 pageText: a 404 says so — status, an empty text, a next; never the not-found page as the page (r2 C09)', async () => {
  const t = transport({
    site: () => ({
      status: 404,
      body: '<html><head><title>Page not found</title></head><body><p>Oops, nothing here.</p></body></html>'
    })
  })
  const out = /** @type {any} */ (
    await pageText({ run: t.run, label: 'demo1', internalPort: 80, params: { path: '/warranty' } })
  )
  assert.deepEqual(out, {
    ok: true,
    url: 'http://127.0.0.1/warranty',
    path: '/warranty',
    lang: null,
    title: 'Page not found',
    status: 404,
    text: '',
    next: 'That path does not exist on this site.'
  })
  const five = transport({ site: () => ({ status: 500, body: page('Error') }) })
  const err = /** @type {any} */ (
    await pageText({ run: five.run, label: 'demo1', internalPort: 80, params: {} })
  )
  assert.equal(err.status, 500)
  assert.match(err.next, /error page \(status 500\)/)
})

test('pageText: a thin page goes to the browser where there is one (rendered), and says so where there is none (thin)', async () => {
  const shell =
    '<html lang="en"><head><title>App</title></head><body><div id="root"></div><script src="/a.js"></script></body></html>'
  const withBrowser = transport({
    site: () => ({ body: shell }),
    browser: (argv) => ({
      code: 0,
      stdout: `TRACY_BROWSER OK ${argv[argv.indexOf('dom') + 1]}\n<html lang="en"><head><title>App</title></head><body><main><p>Drawn by script</p></main></body></html>`,
      stderr: '',
      timedOut: false
    })
  })
  const drawn = /** @type {any} */ (
    await pageText({ run: withBrowser.run, label: 'shop1', internalPort: 4321, params: {} })
  )
  assert.equal(drawn.rendered, 'browser')
  assert.match(drawn.text, /Drawn by script/)
  assert.deepEqual(
    withBrowser.calls.map((c) => c.kind),
    ['fetch', 'browser']
  )
  const noBrowser = transport({ site: () => ({ body: shell }) })
  const door = contentDoor({ platform: 'wordpress' })
  const thin = /** @type {any} */ (
    await pageText({ run: noBrowser.run, label: 'wp-x', internalPort: 80, params: {}, door })
  )
  assert.equal(thin.ok, true)
  assert.equal(thin.thin, true)
  assert.ok(thin.next.includes(door))
  assert.notEqual(thin.code, 'NO_BROWSER')
})

test('🔒 pageText: the browser fallback is addressed as the route the read ended on (public → via + ~NOTFOUND)', async () => {
  const shell = '<html><body><div id="root"></div><script></script></body></html>'
  const t = transport({
    site: (req) =>
      req.host === '127.0.0.1' ? { status: 301, headers: { Location: `${PUB}/` } } : { body: shell },
    browser: () => ({
      code: 0,
      stdout: `TRACY_BROWSER OFFSITE https://evil.example/`,
      stderr: '',
      timedOut: false
    })
  })
  const out = /** @type {any} */ (
    await pageText({ run: t.run, label: 'demo1', internalPort: 80, publicOrigin: PUB, params: {} })
  )
  assert.equal(out.code, 'REDIRECTED_OFF_SITE')
  const argv = t.calls.find((c) => c.kind === 'browser').argv
  assert.ok(argv.includes('TRACY_PUBLIC_VIA=127.0.0.1:80'))
  assert.ok(argv.includes('TRACY_RESOLVER_RULE=--host-resolver-rules=MAP demo1.tracy.site ~NOTFOUND'))
  assert.ok(argv.includes(`${PUB}/`) && argv.includes(PUB))
})

test('pageText: a file that is not a page, a body too large with no browser, a redirect loop → READ_FAILED', async () => {
  const pdf = transport({ site: () => ({ headers: { 'Content-Type': 'application/pdf' }, body: '%PDF' }) })
  const a = /** @type {any} */ (
    await pageText({ run: pdf.run, label: 'demo1', internalPort: 80, params: { path: '/x.pdf' } })
  )
  assert.equal(a.code, 'READ_FAILED')
  assert.match(a.error, /application\/pdf file, not a page/)
  const big = transport({ site: (req) => ({ ...answer(req.nonce), code: 63 }) })
  const b = /** @type {any} */ (
    await pageText({ run: big.run, label: 'demo1', internalPort: 80, params: {} })
  )
  assert.equal(b.code, 'READ_FAILED')
  const loop = transport({ site: () => ({ status: 301, headers: { Location: '/' } }) })
  const c = /** @type {any} */ (
    await pageText({ run: loop.run, label: 'demo1', internalPort: 80, params: {} })
  )
  assert.equal(c.code, 'READ_FAILED')
  assert.match(c.error, /loop/)
})

test('pageText: outline:true answers the outline instead of the text; with match, only the matching lines', async () => {
  const t = transport({ site: () => ({ body: ED.html }) })
  const out = /** @type {any} */ (
    await pageText({ run: t.run, label: 'ed-x', internalPort: 4321, params: { outline: true } })
  )
  assert.equal(out.text, undefined)
  assert.match(out.outline, /^topbar list: Hotline/)
  assert.ok(out.outline.includes('main h1 (2 lines): Furniture built to fit your exact space'))
  const h1 = /** @type {any} */ (
    await pageText({
      run: t.run,
      label: 'ed-x',
      internalPort: 4321,
      params: { outline: true, match: 'fit your exact' }
    })
  )
  assert.equal(h1.outline, 'main h1 (2 lines): Furniture built to fit your exact space')
  assert.equal(h1.matchedLines, 1)
})

test('🔒 pageText paths: three pages, ≤ 4 execs at once, one answer; nine → eight read + notRead; a bad path first', async () => {
  const t = transport({
    site: (req) =>
      req.path === '/nope'
        ? { status: 404, body: '<title>Not found</title>' }
        : { body: page(req.path === '/' ? 'Home' : 'Other', '<p>Hotline: 0123456789</p>') }
  })
  const out = /** @type {any} */ (
    await pageText({
      run: t.run,
      label: 'demo1',
      internalPort: 80,
      params: { paths: ['/', '/about', '/nope'], match: '0123' }
    })
  )
  assert.equal(out.ok, true)
  assert.equal(out.match, '0123')
  assert.deepEqual(
    out.pages.map((p) => [p.path, p.status ?? 200, p.matchedLines ?? null, p.text]),
    [
      ['/', 200, 1, 'Hotline: 0123456789'],
      ['/about', 200, 1, 'Hotline: 0123456789'],
      ['/nope', 404, null, '']
    ]
  )
  assert.equal(t.calls.filter((c) => c.kind === 'fetch').length, 3)

  const many = transport({ site: () => ({ body: page('Hi') }) })
  const nine = /** @type {any} */ (
    await pageText({
      run: many.run,
      label: 'demo1',
      internalPort: 80,
      params: { paths: ['/1', '/2', '/3', '/4', '/5', '/6', '/7', '/8', '/9'] }
    })
  )
  assert.equal(nine.pages.length, 8)
  assert.deepEqual(nine.notRead, ['/9'])
  assert.ok(many.most() <= PAGE_PATHS_PARALLEL, `ran ${many.most()} at once`)
  assert.ok(nine.pages.every((p) => p.text.length <= Math.floor(4000 / 8)))

  const none = transport({ site: () => assert.fail('nothing runs for a bad path') })
  const bad = /** @type {any} */ (
    await pageText({ run: none.run, label: 'demo1', internalPort: 80, params: { paths: ['/', 'nope'] } })
  )
  assert.equal(bad.code, 'BAD_PATH')
})

test('pageText paths: a page that cannot be read is an entry; the call is ok while one page was read', async () => {
  const t = transport({
    site: (req) =>
      req.path === '/away'
        ? { status: 302, headers: { Location: 'https://evil.example/' } }
        : { body: page('Home') }
  })
  const out = /** @type {any} */ (
    await pageText({ run: t.run, label: 'demo1', internalPort: 80, params: { paths: ['/', '/away'] } })
  )
  assert.equal(out.ok, true)
  assert.deepEqual(out.pages[1], {
    path: '/away',
    ok: false,
    code: 'REDIRECTED_OFF_SITE',
    error: '/away redirects to https://evil.example/, which is not this site'
  })
})

test('pageText: no curl → the pre-F2 road when one is given (per path), else NO_BROWSER naming the door', async () => {
  const t = transport({ site: () => ({ code: 127, stdout: OCI_NO_CURL, stderr: '' }) })
  const legacy = []
  const out = await pageText({
    run: t.run,
    label: 'demo1',
    internalPort: 80,
    params: { path: '/about' },
    legacy: async (p) => {
      legacy.push(p)
      return {
        ok: true,
        url: 'http://127.0.0.1/about',
        path: p,
        lang: null,
        title: null,
        text: 'via the probe road'
      }
    }
  })
  assert.deepEqual(legacy, ['/about'])
  assert.equal(/** @type {any} */ (out).text, 'via the probe road')
})

// ── page.look's gate ──────────────────────────────────────────────────────────────────────────────

test('🔒 pageLookGate: the same read as page.text; the browser target is the route it ended on', async () => {
  const t = transport({
    site: (req) =>
      req.host === '127.0.0.1' ? { status: 301, headers: { Location: `${PUB}/` } } : { body: page('Home') }
  })
  const gate = /** @type {any} */ (
    await pageLookGate({ run: t.run, label: 'demo1', internalPort: 80, publicOrigin: PUB, path: '/' })
  )
  assert.equal(gate.ok, true)
  assert.deepEqual(gate.target, {
    url: `${PUB}/`,
    origin: PUB,
    container: 'demo1-web-1',
    via: '127.0.0.1:80',
    resolverRule: '--host-resolver-rules=MAP demo1.tracy.site ~NOTFOUND'
  })
  assert.equal(gate.url, `${PUB}/`)
})

test('pageLookGate: no curl → the legacy probe; off-site refused; slow or too large still photographed', async () => {
  const noCurl = transport({ site: () => ({ code: 127, stdout: '', stderr: '' }) })
  assert.deepEqual(await pageLookGate({ run: noCurl.run, label: 'demo1', internalPort: 80, path: '/' }), {
    legacy: true
  })
  const away = transport({ site: () => ({ status: 302, headers: { Location: 'https://evil.example/' } }) })
  const off = /** @type {any} */ (
    await pageLookGate({ run: away.run, label: 'demo1', internalPort: 80, path: '/' })
  )
  assert.equal(off.answer.code, 'REDIRECTED_OFF_SITE')
  const slow = transport({ site: () => ({ code: 28, stdout: '', stderr: 'curl: (28) Operation timed out' }) })
  const s = /** @type {any} */ (
    await pageLookGate({ run: slow.run, label: 'demo1', internalPort: 80, path: '/' })
  )
  assert.equal(s.ok, true)
  assert.equal(s.target.url, 'http://127.0.0.1/')
})

test('🔒 lookNoBrowserAnswer: the flip — page.text is named ONLY when the curl read ran', () => {
  const door = contentDoor({ platform: 'wordpress' })
  assert.match(lookNoBrowserAnswer(true, door).next, /page\.text \{path\} reads the words/)
  assert.doesNotMatch(lookNoBrowserAnswer(false, door).next, /page\.text/)
  assert.ok(lookNoBrowserAnswer(false, door).next.includes(door))
})

// ── review fixes (25/09): browser failures, match on the outline, parse budget, wrappers, repeats ──

const SHELL =
  '<html lang="en"><head><title>App</title></head><body><div id="root"></div><script src="/a.js"></script></body></html>'

test('🔒 pageText: a browser that EXISTS and fails (NAV guard, timeout, error) is READ_FAILED — thin/charset only with no browser', async () => {
  const door = contentDoor({ platform: 'emdash' })
  const failing = {
    nav: () => ({
      code: 0,
      stdout: 'TRACY_BROWSER NAV net::ERR_ABORTED at http://127.0.0.1:4321/',
      stderr: '',
      timedOut: false
    }),
    timeout: () => ({
      code: null,
      stdout: 'TRACY_BROWSER OK http://127.0.0.1:4321/\n<html><p>half',
      stderr: '',
      timedOut: true
    }),
    error: () => ({
      code: 1,
      stdout: 'TRACY_BROWSER ERR Error: boom\n    at draw (/app/x.js:1:1)',
      stderr: '',
      timedOut: false
    })
  }
  for (const [name, browser] of Object.entries(failing)) {
    for (const site of [
      () => ({ body: SHELL }),
      () => ({ headers: { 'Content-Type': 'text/html; charset=windows-1251' }, body: page('Hello') })
    ]) {
      const t = transport({ site, browser })
      const out = /** @type {any} */ (
        await pageText({ run: t.run, label: 'ed-x', internalPort: 4321, params: {}, door })
      )
      assert.equal(out.code, 'READ_FAILED', name)
      assert.equal(out.thin, undefined, name)
      assert.equal(out.charset, undefined, name)
      assert.equal(out.next, `Try once more; if it fails again, read the words through ${door}.`, name)
      assert.doesNotMatch(JSON.stringify(out), /net::|ERR_ABORTED|boom|x\.js|no browser runs here/, name)
    }
  }
  const t = transport({ site: () => ({ body: SHELL }), browser: failing.timeout })
  const timedOut = /** @type {any} */ (
    await pageText({ run: t.run, label: 'ed-x', internalPort: 4321, params: {}, door })
  )
  assert.equal(timedOut.error, 'the browser could not read /: it ran out of time')
  // …while a MISSING browser is still answered with the server's words, said honestly
  const none = transport({ site: () => ({ body: SHELL }) })
  const thin = /** @type {any} */ (
    await pageText({ run: none.run, label: 'ed-x', internalPort: 4321, params: {}, door })
  )
  assert.equal(thin.ok, true)
  assert.equal(thin.thin, true)
})

const WP_CONTACT = { html: fixture('wp-contact.html'), url: 'http://wp-dmlj6g.tracy.test:51710/contact/' }

test('🔒 pageText outline + match reads EVERY visible part: the WordPress contact card is found, not only the skeleton', async () => {
  const t = transport({ site: () => ({ body: WP_CONTACT.html }) })
  const ask = async (/** @type {Record<string, unknown>} */ params) =>
    /** @type {any} */ (await pageText({ run: t.run, label: 'wp-x', internalPort: 80, params }))
  // the skeleton prints the lede after the h1, not the card's label paragraphs…
  const skeleton = await ask({ outline: true })
  assert.doesNotMatch(skeleton.outline, /Head office/)
  // …and match finds them anyway (it answered matchedLines:0 and "no line here" before)
  const office = await ask({ outline: true, match: 'Head office' })
  assert.equal(office.outline, 'main p: Head office')
  assert.equal(office.matchedLines, 1)
  const phone = await ask({ outline: true, match: '550-67-89' })
  assert.deepEqual(phone.outline.split('\n'), [
    'topbar link: Hotline: 8 800 550-67-89 [tel:+78005506789]',
    'main p: 8 800 550-67-89',
    'footer link: 8 800 550-67-89 [tel:+78005506789]'
  ])
  // the text read finds the same three
  assert.equal((await ask({ match: '550-67-89' })).matchedLines, 3)
  // words only the page's TEXT carries (a skip link is screen-reader text): answered from the text, said so
  const hidden = await ask({ outline: true, match: 'Skip to content' })
  assert.equal(hidden.text, 'Skip to content')
  assert.equal(hidden.outline, undefined)
  assert.match(hidden.next, /No visible part of the page carries those words/)
  // and only a page that carries them nowhere says so
  const none = await ask({ outline: true, match: 'Nowhere on this page' })
  assert.equal(none.matchedLines, 0)
  assert.match(none.next, /No line here carries those words/)
})

test('pageOutline every: each main paragraph and loose word, and every item of a list line', () => {
  const lines = pageOutline(WP.html, WP.url, { every: true })
  const skeleton = pageOutline(WP.html, WP.url)
  assert.ok(lines.length > skeleton.length)
  const langs = lines.find((l) => l.startsWith('drawer list: English'))
  assert.ok(langs && !langs.includes('more') && langs.split(' · ').length === 41, langs)
})

test('🔒 pageText: 120 KB of never-closing markup is read in < 1 s on the static road (outline or text)', async () => {
  // The quadratic read this pins took seconds; 200 ms went red under load (review, 25/09), and the
  // `tests` gate runs on shared, CPU-capped runners.
  const body = `<html><body><p>x</p>${'<a"'.repeat(40_000)}</body></html>`
  const t = transport({ site: () => ({ body }) })
  for (const params of [{}, { outline: true }, { outline: true, match: 'x' }]) {
    const t0 = performance.now()
    const out = /** @type {any} */ (await pageText({ run: t.run, label: 'demo1', internalPort: 80, params }))
    assert.ok(
      performance.now() - t0 < 1_000,
      `${JSON.stringify(params)}: ${Math.round(performance.now() - t0)} ms`
    )
    assert.equal(out.ok, true)
  }
})

test('🔒 pageText parse budget: more than 1 MiB of markup outside scripts and styles is refused, not cut; scripts do not count', async () => {
  const huge = `<html><body>${'<p>word</p>'.repeat(Math.ceil(PAGE_PARSE_MAX_CHARS / 11) + 10)}</body></html>`
  const t = transport({ site: () => ({ body: huge }) })
  const door = contentDoor({ platform: 'wordpress' })
  const out = /** @type {any} */ (
    await pageText({ run: t.run, label: 'demo1', internalPort: 80, params: {}, door })
  )
  assert.deepEqual(out, {
    ok: false,
    code: 'READ_FAILED',
    error: '/ carries more than 1 MiB of markup besides its scripts and styles, too large to read here',
    next: `Read the words through ${door}.`
  })
  // 2 MiB of it in one inline script: emptied before the budget is counted
  const scripted = `<html><body><script>${'x'.repeat(2 * 1024 * 1024)}</script><p>hello</p></body></html>`
  const s = transport({ site: () => ({ body: scripted }) })
  const ok = /** @type {any} */ (await pageText({ run: s.run, label: 'demo1', internalPort: 80, params: {} }))
  assert.equal(ok.text, 'hello')
})

test('tameMarkup changes no word: the four ja-business fixtures read the same outline and text raw and tamed', () => {
  for (const f of [WP, J, ED, WP_CONTACT]) {
    const tamed = tameMarkup(f.html)
    assert.deepEqual(pageOutline(tamed, f.url), pageOutline(f.html, f.url))
    assert.deepEqual(pageOutline(tamed, f.url, { every: true }), pageOutline(f.html, f.url, { every: true }))
    assert.deepEqual(readablePage(tamed), readablePage(f.html))
  }
})

test("🔒 pageOutline: a page wrapper's token does not swallow the page's header and footer (review finding 6)", () => {
  const html =
    '<body><div class="main-wrapper"><header><a class="logo" href="/">Brand</a><nav><a href="/a">A</a><a href="/b">B</a></nav></header>' +
    '<main><h1>Title</h1></main><footer><span>© 2026 X</span></footer></div></body>'
  assert.deepEqual(pageOutline(html, 'https://demo1.tracy.site/'), [
    'header logo: Brand',
    'header nav: A [/a] · B [/b]',
    'main h1: Title',
    'footer text: © 2026 X'
  ])
})

test('🔒 pageOutline: two identical cards are two parts — only item lists and drawer copies are deduped', () => {
  const card = '<div class="card"><h3>Plan</h3><a class="btn" href="/buy">Buy</a></div>'
  const html = `<body><main><h1>T</h1>${card}${card}</main><footer><p>Call us</p><p>Call us</p></footer></body>`
  assert.deepEqual(pageOutline(html, 'https://demo1.tracy.site/'), [
    'main h1: T',
    'main h3: Plan',
    'main button: Buy [/buy]',
    'main h3: Plan',
    'main button: Buy [/buy]',
    'footer p: Call us',
    'footer p: Call us'
  ])
})

test('🔒 every outline line names a region and a kind of OUTLINE_REGIONS / OUTLINE_KINDS, and OUTLINE_LINE_FORMAT names them all', () => {
  const line = new RegExp(
    `^(${OUTLINE_REGIONS.join('|')}) (${OUTLINE_KINDS.join('|')})( \\(\\d+ lines\\))?: `
  )
  const printed = new Set()
  for (const f of [WP, J, ED, WP_CONTACT])
    for (const every of [false, true])
      for (const l of pageOutline(f.html, f.url, { every })) {
        const m = line.exec(l)
        assert.ok(m, l)
        printed.add(m?.[1]).add(m?.[2])
      }
  // the fixtures print every region and every kind but h4–h6 (no page has one)
  for (const name of [...OUTLINE_REGIONS, ...OUTLINE_KINDS.filter((k) => !/^h[4-6]$/.test(k))])
    assert.ok(printed.has(name), name)
  for (const name of [...OUTLINE_REGIONS, ...OUTLINE_KINDS.filter((k) => !/^h[1-6]$/.test(k))])
    assert.ok(
      OUTLINE_LINE_FORMAT.includes(`|${name}|`) ||
        OUTLINE_LINE_FORMAT.includes(`<${name}|`) ||
        OUTLINE_LINE_FORMAT.includes(`|${name}>`),
      name
    )
  assert.match(OUTLINE_LINE_FORMAT, /h1…h6/)
})

// ── v6 #3: what a crawler reads, a site's text files, and one element's look ────────────────────────

const HEAD_FIXTURE = (/** @type {string} */ name) => fixture(path.join('head', name))

test('page.text {head:true}: the head of the page the read fetched, JSON-LD out of the raw markup, no text', async () => {
  const t = transport({ site: () => ({ body: HEAD_FIXTURE('emdash-home.html') }) })
  const out = /** @type {any} */ (
    await pageText({ run: t.run, label: 'benchemdash02', internalPort: 4321, params: { head: true } })
  )
  assert.equal(out.ok, true)
  assert.equal(out.title, 'Home — Northgate Industrial')
  assert.equal(out.robots, 'index, follow')
  assert.equal(out.og.description, '(= description)')
  // taming empties every <script> body; the head reads the raw page, so the JSON-LD is there
  assert.deepEqual(out.jsonLd, [
    { '@type': 'WebSite', name: 'Northgate Industrial', url: 'http://benchemdash02.tracy.test:51710' }
  ])
  assert.equal(out.text, undefined, 'the head answers instead of the words')
  assert.ok(JSON.stringify(out).length <= 2000)
  assert.equal(t.calls.filter((c) => c.kind === 'browser').length, 0, 'the head needs no browser')
})

test('page.text {head:true, paths}: each page carries its own head, null fields kept as the finding', async () => {
  const t = transport({
    site: (req) => ({ body: HEAD_FIXTURE(req.path === '/news' ? 'joomla-news.html' : 'wp-home.html') })
  })
  const out = /** @type {any} */ (
    await pageText({
      run: t.run,
      label: 'benchwp02',
      internalPort: 80,
      params: { head: true, paths: ['/', '/news'] }
    })
  )
  assert.equal(out.ok, true)
  assert.equal(out.pages.length, 2)
  assert.equal(out.pages[0].robots, 'max-image-preview:large')
  assert.equal(out.pages[1].description, null, 'a page with no description says so')
  assert.equal(out.pages[1].jsonLd[0]['@type'], 'BreadcrumbList')
})

test("page.text on a site's text files: robots.txt as its lines (and whose it is), a sitemap as its addresses", async () => {
  const robots =
    'User-agent: *\r\nDisallow: /wp-admin/\r\nAllow: /wp-admin/admin-ajax.php\r\n\r\nSitemap: http://site.test/wp-sitemap.xml\r\n'
  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="http://site.test/wp-sitemap-index.xsl" ?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>http://site.test/wp-sitemap-posts-post-1.xml</loc></sitemap><sitemap><loc>http://site.test/ru/wp-sitemap-posts-post-1.xml?a=1&amp;b=2</loc></sitemap></sitemapindex>'
  const t = transport({
    site: (req) =>
      req.path === '/robots.txt'
        ? { headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: robots }
        : req.path === '/wp-sitemap.xml'
          ? { headers: { 'Content-Type': 'application/xml; charset=UTF-8' }, body: sitemap }
          : req.path === '/llms.txt'
            ? {
                status: 404,
                body: '<html><head><title>Page not found</title></head><body><h1>Not found</h1></body></html>'
              }
            : { headers: { 'Content-Type': 'image/png' }, body: 'PNG' }
  })
  const read = async (/** @type {Record<string, unknown>} */ params) =>
    /** @type {any} */ (await pageText({ run: t.run, label: 'benchwp02', internalPort: 80, params }))
  const r = await read({ path: '/robots.txt' })
  assert.equal(r.ok, true)
  assert.equal(r.type, 'text/plain')
  assert.equal(
    r.text,
    'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php\n\nSitemap: http://site.test/wp-sitemap.xml'
  )
  assert.match(r.next, /site's own robots\.txt: it applies once the site is published/)
  const m = await read({ path: '/robots.txt', match: 'sitemap' })
  assert.equal(m.matchedLines, 1)
  assert.equal(m.text, 'Sitemap: http://site.test/wp-sitemap.xml')
  const s = await read({ path: '/wp-sitemap.xml', head: true })
  assert.equal(s.locs, 2)
  assert.equal(
    s.text,
    'http://site.test/wp-sitemap-posts-post-1.xml\nhttp://site.test/ru/wp-sitemap-posts-post-1.xml?a=1&b=2'
  )
  const missing = await read({ path: '/llms.txt' })
  assert.equal(missing.status, 404)
  assert.match(missing.next, /does not exist/)
  const picture = await read({ path: '/logo.png' })
  assert.equal(picture.code, 'READ_FAILED')
  assert.match(picture.error, /image\/png file, not a page/)
})

/** A `run` whose browser answers one scripted result, recording the argv it was handed. */
function styleRun(/** @type {Record<string, unknown>} */ result) {
  /** @type {string[][]} */
  const seen = []
  const run = async (/** @type {{ argv: readonly string[] }} */ { argv }) => {
    seen.push([...argv])
    return { code: 0, stdout: '', stderr: '', timedOut: false, ...result }
  }
  return { run, seen }
}

const STYLE_TARGET = {
  url: 'http://127.0.0.1:80/',
  origin: 'http://127.0.0.1:80',
  container: 'benchwp02-web-1',
  resolverRule: '',
  via: ''
}
const STYLE_REQ = /** @type {const} */ ({
  text: 'See our capabilities',
  nth: 0,
  props: ['color'],
  viewport: 'desktop'
})

test('page.look {style}: the browser in mode style, its answer made the model’s', async () => {
  const payload = {
    info: { el: '<a.btn>', text: 'See our capabilities', matches: 1, how: 'exact', hidden: false },
    props: {
      color: {
        value: 'rgb(255, 255, 255)',
        hex: '#ffffff',
        set: 'color: var(--accent-on)',
        by: '.btn',
        sheet: '/css/site.css',
        line: 12,
        tokens: [
          {
            name: '--accent-on',
            value: '#ffffff',
            by: ':root',
            sheet: '/css/tokens.css',
            line: 3,
            on: '<html>'
          }
        ]
      }
    }
  }
  const t = styleRun({ stdout: `TRACY_BROWSER OK http://127.0.0.1/\n${JSON.stringify(payload)}` })
  const out = /** @type {any} */ (
    await styleLook({ run: t.run, target: STYLE_TARGET, req: STYLE_REQ, url: 'http://127.0.0.1/', path: '/' })
  )
  assert.equal(out.ok, true)
  assert.equal(out.viewport, 'desktop 1440×900')
  assert.deepEqual(out.style.color, {
    value: 'rgb(255, 255, 255)',
    hex: '#ffffff',
    set: 'color: var(--accent-on)',
    by: '.btn',
    in: '/css/site.css:12',
    tokens: ['--accent-on = #ffffff · :root · /css/tokens.css:3']
  })
  const argv = t.seen[0]
  const at = argv.lastIndexOf('-e') // node's -e, after docker's `-e HOME=/tmp`
  assert.deepEqual(argv.slice(at + 2, at + 6), [
    'style',
    STYLE_TARGET.url,
    STYLE_TARGET.origin,
    JSON.stringify(STYLE_REQ)
  ])
})

test('page.look {style}: no browser, off-site, out of time and a cut answer are refusals, never a guess', async () => {
  const call = async (/** @type {Record<string, unknown>} */ result) =>
    /** @type {any} */ (
      await styleLook({
        run: styleRun(result).run,
        target: STYLE_TARGET,
        req: STYLE_REQ,
        url: 'http://127.0.0.1/',
        path: '/'
      })
    )
  assert.equal(
    (await call({ code: 127, stderr: 'timeout: failed to run command ‘node’' })).code,
    'NO_BROWSER'
  )
  assert.equal((await call({ stdout: 'TRACY_BROWSER NOCHROME spawn chromium ENOENT' })).code, 'NO_BROWSER')
  assert.equal(
    (await call({ stdout: 'TRACY_BROWSER OFFSITE https://elsewhere.example/' })).code,
    'REDIRECTED_OFF_SITE'
  )
  assert.equal((await call({ code: null, timedOut: true })).code, 'LOOK_FAILED')
  const cut = await call({
    code: null,
    spawnError: 'stdout maxBuffer length exceeded',
    stdout: 'TRACY_BROWSER OK http://127.0.0.1/\n{"info":'
  })
  assert.equal(cut.code, 'LOOK_FAILED')
  const missing = await call({
    stdout: 'TRACY_BROWSER OK http://127.0.0.1/\n{"error":"no visible element shows the words \\"Buy\\""}'
  })
  assert.equal(missing.code, 'STYLE_TARGET_NOT_FOUND')
  assert.match(missing.error, /no visible element shows the words "Buy"/)
})

test('page.text {head:true}: the answer sent, notes and all, stays within the cap it was packed for', async () => {
  // the WordPress home carries 41 hreflang links, 27 headings and 42 flags with an empty alt: cut
  const hreflang = Array.from(
    { length: 41 },
    (_, i) => `<link rel="alternate" href="http://benchwp02.tracy.test:51710/l${i}/" hreflang="l${i}" />`
  ).join('')
  const headings = Array.from(
    { length: 27 },
    (_, i) => `<h3>Heading number ${i} of a long mega menu on this page</h3>`
  ).join('')
  const flags = Array.from({ length: 42 }, (_, i) => `<img src="/flags/f${i}.png" alt="">`).join('')
  const body = `<html lang="en"><head><title>Home</title>${hreflang}</head><body><header>${flags}</header><main>${headings}</main></body></html>`
  for (const params of [
    { head: true },
    { head: true, match: 'nowhere-at-all' },
    { head: true, maxChars: 900 }
  ]) {
    const t = transport({ site: () => ({ body }) })
    const out = /** @type {any} */ (
      await pageText({ run: t.run, label: 'benchwp02', internalPort: 80, params })
    )
    assert.equal(out.truncated, true)
    assert.ok(
      JSON.stringify(out).length <= (params.maxChars ?? 2000),
      `${JSON.stringify(params)}: ${JSON.stringify(out).length}`
    )
  }
})
