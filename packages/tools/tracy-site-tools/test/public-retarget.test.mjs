// The browser follows a redirect to EXACTLY this site's public origin, as the static read does (D4):
// a home page whose loopback answer only the browser saw (a slow first hop, a script or meta redirect)
// is read as the site's own page, never refused as "left this site".
import assert from 'node:assert/strict'
import test from 'node:test'

import { browseAsSite, browserDom, publicRetarget, styleLook } from '../src/host/page.mjs'
import { captureView } from '../src/host/view.mjs'

const PUBLIC = 'https://mysite.tracy.ai'

const LOOPBACK = {
  url: 'http://127.0.0.1/',
  origin: 'http://127.0.0.1',
  container: 'mysite-web-1',
  resolverRule: '',
  via: ''
}

/** A run that answers each browser launch with the next line, and keeps every argv. */
function scripted(/** @type {string[]} */ lines) {
  /** @type {string[][]} */
  const seen = []
  const run = async (/** @type {{ argv: readonly string[] }} */ { argv }) => {
    seen.push([...argv])
    return { code: 0, stdout: lines[seen.length - 1] ?? '', stderr: '', timedOut: false }
  }
  return { run, seen }
}

/** The url and origin a browser argv carries (`node -e <script> <mode> <url> <origin>`). */
function addressOf(/** @type {string[]} */ argv) {
  const at = argv.lastIndexOf('-e')
  return { mode: argv[at + 2], url: argv[at + 3], origin: argv[at + 4] }
}

test('publicRetarget: exactly the public origin becomes the public route, pinned to the same container port', () => {
  assert.deepEqual(publicRetarget(LOOPBACK, `${PUBLIC}/`, PUBLIC), {
    url: `${PUBLIC}/`,
    origin: PUBLIC,
    container: 'mysite-web-1',
    via: '127.0.0.1:80',
    resolverRule: '--host-resolver-rules=MAP mysite.tracy.ai ~NOTFOUND'
  })
  const deep = publicRetarget({ ...LOOPBACK, url: 'http://127.0.0.1:8080/contact' }, `${PUBLIC}/contact/?a=1#top`, PUBLIC)
  assert.equal(deep?.url, `${PUBLIC}/contact/?a=1`, 'the path and query it was sent to, never the fragment')
  assert.equal(deep?.via, '127.0.0.1:8080', 'the port the browser was dialling')
  const canonical = publicRetarget(
    {
      url: 'http://mysite.tracy.test:51710/',
      origin: 'http://mysite.tracy.test:51710',
      container: 'mysite-web-1',
      resolverRule: '--host-resolver-rules=MAP mysite.tracy.test:51710 127.0.0.1:80',
      via: ''
    },
    `${PUBLIC}/`,
    PUBLIC
  )
  assert.equal(canonical?.via, '127.0.0.1:80', 'a canonical-port target keeps the port its resolver rule pinned')
})

test('publicRetarget: anything but exactly the public origin stays off-site', () => {
  assert.equal(publicRetarget(LOOPBACK, `${PUBLIC}/`, null), null, 'a host not told its domain')
  assert.equal(publicRetarget(LOOPBACK, 'https://elsewhere.example/', PUBLIC), null, 'another site')
  assert.equal(publicRetarget(LOOPBACK, 'http://mysite.tracy.ai/', PUBLIC), null, 'the other scheme')
  assert.equal(publicRetarget(LOOPBACK, 'https://mysite.tracy.ai:8443/', PUBLIC), null, 'another port')
  assert.equal(publicRetarget(LOOPBACK, 'https://evil.mysite.tracy.ai/', PUBLIC), null, 'a sub-name')
  assert.equal(publicRetarget(LOOPBACK, 'unknown', PUBLIC), null, 'no address')
  const already = { url: `${PUBLIC}/`, origin: PUBLIC, container: 'mysite-web-1', resolverRule: '', via: '127.0.0.1:80' }
  assert.equal(publicRetarget(already, `${PUBLIC}/`, PUBLIC), null, 'already asked as that origin: no loop')
  assert.equal(
    publicRetarget({ ...LOOPBACK, url: 'http://10.0.0.5/', origin: 'http://10.0.0.5' }, `${PUBLIC}/`, PUBLIC),
    null,
    'a target not pinned to the container loopback'
  )
})

test('browseAsSite: one more run as the public origin, and only one', async () => {
  const twice = scripted([`TRACY_BROWSER OFFSITE ${PUBLIC}/`, `TRACY_BROWSER OFFSITE ${PUBLIC}/`])
  const out = await browseAsSite({
    target: LOOPBACK,
    publicOrigin: PUBLIC,
    launch: (t) => twice.run({ argv: ['node', '-e', 'x', 'dom', t.url, t.origin] })
  })
  assert.equal(twice.seen.length, 2, 'a public page that leaves again is not asked a third time')
  assert.equal(out.target.origin, PUBLIC)
  const foreign = scripted(['TRACY_BROWSER OFFSITE https://elsewhere.example/'])
  const kept = await browseAsSite({
    target: LOOPBACK,
    publicOrigin: PUBLIC,
    launch: (t) => foreign.run({ argv: ['node', '-e', 'x', 'dom', t.url, t.origin] })
  })
  assert.equal(foreign.seen.length, 1)
  assert.equal(kept.target, LOOPBACK)
})

test('page.look {style} of the home page: the site’s own public redirect is read, not refused', async () => {
  const payload = {
    info: { el: '<header.site-header>', text: '', matches: 1, how: 'selector', hidden: false },
    props: { 'background-color': { value: 'rgb(10, 11, 10)', rules: [] } },
    loaded: true
  }
  const s = scripted([`TRACY_BROWSER OFFSITE ${PUBLIC}/`, `TRACY_BROWSER OK ${PUBLIC}/\n${JSON.stringify(payload)}`])
  const answer = /** @type {any} */ (
    await styleLook({
      run: s.run,
      target: LOOPBACK,
      req: { selector: 'header', nth: 0, props: ['background-color'], viewport: 'desktop' },
      url: 'http://127.0.0.1/',
      path: '/',
      publicOrigin: PUBLIC
    })
  )
  assert.notEqual(answer.code, 'REDIRECTED_OFF_SITE')
  assert.equal(answer.ok, true)
  assert.equal(s.seen.length, 2)
  assert.deepEqual(addressOf(s.seen[1]), { mode: 'style', url: `${PUBLIC}/`, origin: PUBLIC })
  assert.ok(s.seen[1].includes('TRACY_PUBLIC_VIA=127.0.0.1:80'), 'served from the container loopback')
  assert.ok(
    s.seen[1].includes('TRACY_RESOLVER_RULE=--host-resolver-rules=MAP mysite.tracy.ai ~NOTFOUND'),
    'the public name resolves to nothing in the browser'
  )
  // Without the deployment's public origin nothing changes: the same refusal as before.
  const bare = scripted([`TRACY_BROWSER OFFSITE ${PUBLIC}/`])
  const refused = /** @type {any} */ (
    await styleLook({
      run: bare.run,
      target: LOOPBACK,
      req: { selector: 'header', nth: 0, props: ['background-color'], viewport: 'desktop' },
      url: 'http://127.0.0.1/',
      path: '/'
    })
  )
  assert.equal(refused.code, 'REDIRECTED_OFF_SITE')
  assert.equal(bare.seen.length, 1)
})

test('page.text’s browser and the customer view take the same road', async () => {
  const dom = scripted([`TRACY_BROWSER OFFSITE ${PUBLIC}/`, `TRACY_BROWSER OK ${PUBLIC}/\n<html><body>Home</body></html>`])
  const read = await browserDom({
    run: dom.run,
    label: 'mysite',
    internalPort: 80,
    route: { kind: 'loopback', origin: 'http://127.0.0.1', host: '127.0.0.1', proto: 'http', connectPort: 80, container: 'mysite-web-1' },
    pathAndQuery: '/',
    publicOrigin: PUBLIC
  })
  assert.equal(read.ok, true)
  assert.equal(dom.seen.length, 2)

  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])
  const view = scripted([
    `TRACY_BROWSER OFFSITE ${PUBLIC}/`,
    `TRACY_BROWSER OK ${PUBLIC}/\n${JSON.stringify({ y: 0, loaded: true, jpeg: JPEG.toString('base64') })}`
  ])
  const drawn = await captureView({
    label: 'mysite',
    view: { path: '/', w: 640, h: 800, y: 0, dark: false },
    internalPort: 80,
    publicOrigin: PUBLIC,
    run: view.run,
    gate: async () => ({ ok: true, target: LOOPBACK, url: 'http://127.0.0.1/', status: null })
  })
  assert.equal(drawn.ok, true)
  assert.deepEqual(addressOf(view.seen[1]).url, `${PUBLIC}/`)
})
