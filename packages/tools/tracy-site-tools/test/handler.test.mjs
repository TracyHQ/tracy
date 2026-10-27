import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

// 🔒 THE POINT OF THIS FILE. The other suites pin the pure builders and parsers; this one drives the
// ACTUAL registered `tracy_site` / `tracy_emdash` `execute` — the shipped `lib/index.js` — through the
// `config.exec` seam, so wrong handler wiring, the site fence, and the error CODES the model reads are
// under test, not just the argv a parser would see. If a tool routed page.text to the image scan, or
// returned a Chrome error page as success, an argv test would still pass and this one would not.
import { apply, releaseSiteLease } from '../lib/index.js'
import { LOOK_FAILED_NEXT, lookParamsProblem } from '../src/host/look-style.mjs'
import { SURFACE_ACTIONS, siteToolParameters } from '../src/host/surface.mjs'
import { component as wordpressComponent, PAGES as WP_PAGES } from './fixtures/replace/fake-wordpress.mjs'
import {
  component as joomlaOpenComponent,
  SITE as JOOMLA_OPEN_SITE
} from './fixtures/replace/fake-joomla-open.mjs'
import { createFakeEmdash, runScript } from './fixtures/replace/emdash/fake-emdash.mjs'

// Leases, held messages and the drain marker live under $DSH_HOME (`@tracy/core` lease, `deploy-hold.mjs`), which
// falls back to the folder the tests run from: this file gets its own, so no run leaves files in the checkout (a
// turn's lease was committed from one, 16/10/2026).
process.env.DSH_HOME ??= mkdtempSync(path.join(tmpdir(), 'site-tools-handler-home-'))

const CONTAINER_ROOT = '/site' // CONTAINER_SITES_ROOT — where a screenshot's container path is rooted

/** A HostContext just real enough for `apply` to register its tools; captures them by name. */
function register(config) {
  const tools = new Map()
  const ctx = {
    webServer: { register: () => () => {} },
    tools: { register: (t) => (tools.set(t.name, t), () => {}) },
    effect: (setup) => {
      setup()
    },
    on: () => {},
    get: () => undefined // no logger, no llm, no sessions, no assertion — every optional service absent
  }
  apply(ctx, config)
  return tools
}

/** A sites root with one empty (platform-unknown, port 80) label folder; returns the cwd for a session on it. */
function siteWorkspace(label = 'demo1') {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-handler-'))
  mkdirSync(path.join(root, label), { recursive: true })
  process.env.TRACY_SITES_ROOT = root
  return { root, label, cwd: path.join(root, label) }
}

/**
 * A sites root whose one label is an EmDash site — its `.webroot/data/data.db` makes `detectPlatform`
 * return `emdash`, so the internal loopback port is 4321, not 80. Used to prove the canonical-port
 * routing pins the resolver's CONNECT side to this site's OWN port (4321), never the port it redirected to.
 */
function emdashWorkspace(label = 'shop1') {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-handler-'))
  mkdirSync(path.join(root, label, '.webroot', 'data'), { recursive: true })
  writeFileSync(path.join(root, label, '.webroot', 'data', 'data.db'), '')
  process.env.TRACY_SITES_ROOT = root
  return { root, label, cwd: path.join(root, label) }
}

/**
 * 🔒 THE REAL SHAPE OF A DEPLOYED EMDASH SITE, which {@link emdashWorkspace} does NOT have. A real
 * EmDash provision sets `PLATFORM_NEEDS_WEBROOT=0`: the database lives under the site's PRIVATE root
 * inside the container, and `<sitesRoot>/<label>/.webroot/` is EMPTY. So `detectPlatform` answers
 * `unknown`, `sitePort` answers 80, and the probe knocks on a port nothing listens on while the site
 * is up and well on 4321 — measured 20/09/2026 on `site-4x82yk`, where the agent read
 * `SITE_UNREACHABLE` for a running site and went to the shell instead. The fixture with a
 * `.webroot/data/data.db` cannot regress that: it makes the WEAK marker answer, so `sitePortFor`
 * would look right even if it had never asked `isEmdashSite`.
 *
 * Two ways a site with an empty webroot still says EmDash, one per fixture flavour:
 * - `template/artifact.json` with `cms.name: 'emdash'` — the provision handoff file;
 * - the container's own `io.tracy.cms` label, read through the docker proxy (`config.emdash.cms`),
 *   for a site whose provision stopped before it wrote the handoff file.
 */
function emdashPrivateRootWorkspace(label, { artifact = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-handler-'))
  mkdirSync(path.join(root, label, '.webroot'), { recursive: true })
  if (artifact) {
    mkdirSync(path.join(root, label, 'template'), { recursive: true })
    writeFileSync(
      path.join(root, label, 'template', 'artifact.json'),
      JSON.stringify({ cms: { name: 'emdash' } })
    )
  }
  process.env.TRACY_SITES_ROOT = root
  // The database is NOWHERE under the webroot — that is the whole point of the fixture.
  assert.equal(existsSync(path.join(root, label, '.webroot', 'data', 'data.db')), false)
  return { root, label, cwd: path.join(root, label) }
}

/**
 * A fleet WordPress site on a host serving sites under `tracy.site`: WordPress holds
 * `https://<label>.tracy.site` as `home`, so the site answers its own plain-http loopback with
 * `301 → https://<its public host>/` (measured 24/09 on `qc-hano-wp-0923-01`, where every page came
 * back REDIRECTED_OFF_SITE). The public origin is the HOST's configuration (`siteDomain`), never the
 * site folder; `address` optionally plants a `.tracy/site.json` claim to prove it is ignored.
 */
const PUBLIC = { siteDomain: 'tracy.site' }
function publicSiteWorkspace(label = 'demo1', address = null) {
  const ws = siteWorkspace(label)
  if (address !== null) {
    mkdirSync(path.join(ws.root, label, '.tracy'), { recursive: true })
    writeFileSync(
      path.join(ws.root, label, '.tracy', 'site.json'),
      JSON.stringify({ siteKey: `${label}.tracy.site`, platform: 'wordpress', address })
    )
  }
  return ws
}

/** Answer the loopback probe with the https redirect, and the public-origin probe with `second`. */
const httpsProbe =
  (publicUrl, second = `TRACY_PROBE 200 ${publicUrl}`, seen = []) =>
  (input) => {
    seen.push(input.argv)
    return input.argv.includes(publicUrl)
      ? { code: 0, stdout: second }
      : { code: 0, stdout: `TRACY_PROBE_REDIR 301 http://127.0.0.1/ ${publicUrl}` }
  }

/**
 * 🔒 THE CURL ROAD IS THE DEFAULT, AND A TEST SAYS WHICH ROAD IT DESCRIBES (F2 §6.19). `page.text` and
 * `page.look` read a page with one pinned curl GET first (`page.mjs`); the node probe and browser road
 * runs only in a container with no curl. A stub that answers no `fetch` must declare `road:'legacy'`,
 * which answers the fetch the way docker does when curl is missing (the r2 OCI line, on stdout) — so
 * every probe test below keeps describing the pre-F2 road, and a new test cannot fall onto it unseen.
 */
const OCI_NO_CURL =
  'OCI runtime exec failed: exec failed: unable to start container process: exec: "curl": executable file not found in $PATH\r\n'
const execFor = (label, root) => (byKind) => async (input) => {
  const argv = input.argv
  const kind =
    argv[1] === '-i' ? 'mcp' : argv[4] === 'curl' ? 'fetch' : argv.includes('timeout') ? 'browser' : 'probe'
  if (kind === 'fetch' && byKind.fetch === undefined) {
    if (byKind.road !== 'legacy')
      assert.fail('this stub answers no fetch: give it `fetch` or declare road:"legacy"')
    return { code: 127, stdout: OCI_NO_CURL, stderr: '', timedOut: false }
  }
  const spec = byKind[kind]
  const out =
    typeof spec === 'function'
      ? await spec(input)
      : { code: 0, stdout: '', stderr: '', timedOut: false, ...spec }
  // A `shot` browser call writes its PNG to the container path, which maps to the host sites root —
  // mirror that so `page.look`'s existsSync sees the file the real container would have written,
  // whether the stub is a plain object or a callback that inspects the argv it was handed.
  if (kind === 'browser') {
    const containerFile = argv[argv.length - 1]
    if (containerFile.startsWith(`${CONTAINER_ROOT}/`) && String(out.stdout).startsWith('TRACY_BROWSER OK')) {
      writeFileSync(path.join(root, containerFile.slice(CONTAINER_ROOT.length + 1)), Buffer.from('\x89PNG'))
    }
  }
  return out
}

const runSite = (tools, args, cwd) =>
  tools.get('tracy_site').execute(args, { agent: { session: { id: 'session-x', header: { cwd } } } })
const runEmdash = (tools, args, cwd) =>
  tools.get('tracy_emdash').execute(args, { agent: { session: { id: 'session-x', header: { cwd } } } })

test.afterEach(() => {
  delete process.env.TRACY_SITES_ROOT
})

// ── tracy_site: page.text / page.look through the real handler ───────────────────────────────────

test('page.text: no site in the conversation is refused before any exec', async () => {
  const tools = register({ exec: async () => assert.fail('exec must not run without a site') })
  siteWorkspace()
  const out = await runSite(tools, { action: 'page.text', params: {} }, '/tmp/not-a-site')
  assert.equal(out.code, 'NO_SITE_IN_CONVERSATION')
})

test('page.text: a bad path is refused before any exec (BAD_PATH)', async () => {
  const tools = register({ exec: async () => assert.fail('exec must not run for a bad path') })
  const { cwd } = siteWorkspace()
  const out = await runSite(tools, { action: 'page.text', params: { path: 'not-a-path' } }, cwd)
  assert.equal(out.code, 'BAD_PATH')
})

test('page.text: the site not answering the probe is SITE_UNREACHABLE', async () => {
  const { root, label, cwd } = siteWorkspace()
  const tools = register({
    exec: execFor(label, root)({ road: 'legacy', probe: { stdout: 'TRACY_PROBE_ERR connect ECONNREFUSED' } })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'SITE_UNREACHABLE')
})

test('page.text: a server redirect to another NAME is REDIRECTED_OFF_SITE (pre-browser)', async () => {
  const { root, label, cwd } = siteWorkspace()
  let launched = false
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      // the probe stops at the authority change and reports it raw; the host classifies with
      // redirectStaysOnSite — a different NAME is refused before any browser is launched.
      probe: { stdout: 'TRACY_PROBE_REDIR 302 http://127.0.0.1/ https://evil.example/phish' },
      browser: () => {
        launched = true
        return { code: 0, stdout: 'TRACY_BROWSER OK http://127.0.0.1/\n' }
      }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'REDIRECTED_OFF_SITE')
  assert.equal(launched, false) // the browser was never launched for an off-site server redirect
})

test('page.text: a same-host http→https redirect is refused, never bridged to the loopback (pre-browser)', async () => {
  const { root, label, cwd } = siteWorkspace()
  let launched = false
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE_REDIR 301 http://127.0.0.1/ https://127.0.0.1:51710/' },
      browser: () => {
        launched = true
        return { code: 0, stdout: 'TRACY_BROWSER OK http://127.0.0.1/\n' }
      }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'REDIRECTED_OFF_SITE') // no TLS to a plain-http loopback, no disabled validation
  assert.equal(launched, false)
})

test("🔒 page.text: a redirect to the site's OWN public https address reads the page over loopback", async () => {
  // The 24/09 regression: the site answers `301 → https://demo1.tracy.site/`, which is where this
  // host serves it (`<label>.<siteDomain>`). The page is then asked for AS that address — public Host plus
  // `X-Forwarded-Proto: https`, exactly what cloudflared sends — on a connection that never leaves
  // the container's loopback service.
  const { root, label, cwd } = publicSiteWorkspace()
  const probes = []
  let browserArgv = null
  const tools = register({
    ...PUBLIC,
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: httpsProbe('https://demo1.tracy.site/', undefined, probes),
      browser: (input) => {
        browserArgv = input.argv
        return {
          code: 0,
          stdout:
            'TRACY_BROWSER OK https://demo1.tracy.site/\n<html lang="en"><head><title>Home</title></head><body><p>Real page</p></body></html>'
        }
      }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.match(out.text, /Real page/)
  // the second probe asked for the public URL, pinned to this site's own loopback port
  assert.equal(probes.length, 2)
  assert.deepEqual(probes[1].slice(-3), ['https://demo1.tracy.site/', '2000', '127.0.0.1:80'])
  // the browser is addressed by the public origin, and told to serve it from loopback
  assert.ok(browserArgv.includes('https://demo1.tracy.site/'), 'browser url is the public address')
  assert.ok(browserArgv.includes('https://demo1.tracy.site'), 'origin guard is the public origin')
  assert.ok(browserArgv.includes('TRACY_PUBLIC_VIA=127.0.0.1:80'), 'requests are served from loopback')
  // 🔒 and the public name resolves to NOTHING in the browser: no request can leave the container
  assert.ok(
    browserArgv.includes('TRACY_RESOLVER_RULE=--host-resolver-rules=MAP demo1.tracy.site ~NOTFOUND'),
    'the public name must not resolve to the real site'
  )
})

test("🔒 page.look: a redirect to the site's OWN public https address photographs the page", async () => {
  const { root, label, cwd } = publicSiteWorkspace()
  let browserArgv = null
  const tools = register({
    ...PUBLIC,
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: httpsProbe('https://demo1.tracy.site/'),
      browser: (input) => {
        browserArgv = input.argv
        return { code: 0, stdout: 'TRACY_BROWSER OK https://demo1.tracy.site/' } // execFor writes the PNG
      }
    })
  })
  const out = await runSite(tools, { action: 'page.look', params: {} }, cwd)
  assert.equal(out.ok, true, JSON.stringify(out))
  assert.ok(existsSync(out.file), 'the screenshot the container wrote is on the host inode')
  assert.ok(browserArgv.includes('https://demo1.tracy.site'), 'origin guard is the public origin')
  assert.ok(browserArgv.includes('TRACY_PUBLIC_VIA=127.0.0.1:80'))
})

test('🔒 page.text: https of a host the site does NOT own is refused', async () => {
  const { root, label, cwd } = publicSiteWorkspace()
  const probes = []
  const tools = register({
    ...PUBLIC,
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: (input) => {
        probes.push(input.argv)
        return { code: 0, stdout: 'TRACY_PROBE_REDIR 301 http://127.0.0.1/ https://other.tracy.site/' }
      },
      browser: () => assert.fail('the browser must not launch for an off-site redirect')
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'REDIRECTED_OFF_SITE')
  assert.equal(probes.length, 1, 'the foreign address is never asked for')
})

test('🔒 page.text: a host not told its site domain keeps an https redirect REDIRECTED_OFF_SITE', async () => {
  // The redirect itself is never the authority: without the host's own site domain nothing proves
  // that https://demo1.tracy.site is this site, however plausible the name.
  const saved = process.env.TRACY_SITE_DOMAIN
  delete process.env.TRACY_SITE_DOMAIN
  try {
    const { root, label, cwd } = publicSiteWorkspace()
    const probes = []
    const tools = register({
      exec: execFor(
        label,
        root
      )({
        road: 'legacy',
        probe: httpsProbe('https://demo1.tracy.site/', undefined, probes),
        browser: () => assert.fail('the browser must not launch')
      })
    })
    const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
    assert.equal(out.code, 'REDIRECTED_OFF_SITE')
    assert.equal(probes.length, 1)
  } finally {
    if (saved !== undefined) process.env.TRACY_SITE_DOMAIN = saved
  }
})

test('🔒 page.text: the site folder cannot vouch for another host — .tracy/site.json is not trusted', async () => {
  // The review's case: `.tracy/site.json` is owned by www-data, so the site or the agent can write
  // `address: https://other.tracy.site`. A redirect there must stay off-site, and the site's real
  // origin must still come from the host's configuration, whatever the folder says.
  const { root, label, cwd } = publicSiteWorkspace('demo1', 'https://other.tracy.site')
  const probes = []
  const tools = register({
    ...PUBLIC,
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: (input) => {
        probes.push(input.argv)
        return { code: 0, stdout: 'TRACY_PROBE_REDIR 301 http://127.0.0.1/ https://other.tracy.site/' }
      },
      browser: () => assert.fail('the browser must not launch for an off-site redirect')
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'REDIRECTED_OFF_SITE')
  assert.equal(probes.length, 1, 'the address the folder claimed is never asked for')
})

test('🔒 page.text: the site domain comes from TRACY_SITE_DOMAIN when the plugin config names none', async () => {
  const saved = process.env.TRACY_SITE_DOMAIN
  process.env.TRACY_SITE_DOMAIN = 'tracy.site'
  try {
    const { root, label, cwd } = publicSiteWorkspace()
    const probes = []
    const tools = register({
      exec: execFor(
        label,
        root
      )({
        road: 'legacy',
        probe: httpsProbe('https://demo1.tracy.site/', undefined, probes),
        browser: {
          code: 0,
          stdout: 'TRACY_BROWSER OK https://demo1.tracy.site/\n<html><body><p>Real page</p></body></html>'
        }
      })
    })
    const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
    assert.equal(out.ok, true, JSON.stringify(out))
    assert.equal(probes.length, 2)
  } finally {
    if (saved === undefined) delete process.env.TRACY_SITE_DOMAIN
    else process.env.TRACY_SITE_DOMAIN = saved
  }
})

test('🔒 page.text: the public host on ANOTHER port or scheme is not the public origin', async () => {
  for (const location of ['https://demo1.tracy.site:8443/', 'http://demo1.tracy.site/']) {
    const { root, label, cwd } = publicSiteWorkspace()
    const probes = []
    const tools = register({
      ...PUBLIC,
      exec: execFor(
        label,
        root
      )({
        road: 'legacy',
        probe: (input) => {
          probes.push(input.argv)
          return { code: 0, stdout: `TRACY_PROBE_REDIR 301 http://127.0.0.1/ ${location}` }
        },
        browser: () => assert.fail('the browser must not launch')
      })
    })
    const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
    assert.equal(out.code, 'REDIRECTED_OFF_SITE', location)
    assert.equal(probes.length, 1, location)
  }
})

test('🔒 page.text: the public address redirecting on to another host is refused before the browser', async () => {
  const { root, label, cwd } = publicSiteWorkspace()
  const tools = register({
    ...PUBLIC,
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: httpsProbe(
        'https://demo1.tracy.site/',
        'TRACY_PROBE_REDIR 302 https://demo1.tracy.site/ https://evil.example/'
      ),
      browser: () => assert.fail('the browser must not launch')
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'REDIRECTED_OFF_SITE')
  assert.match(out.error, /evil\.example/)
})

test('🔒 page.text: a public-origin page whose browser ends elsewhere is still REDIRECTED_OFF_SITE', async () => {
  const { root, label, cwd } = publicSiteWorkspace()
  const tools = register({
    ...PUBLIC,
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: httpsProbe('https://demo1.tracy.site/'),
      browser: { code: 0, stdout: 'TRACY_BROWSER OFFSITE https://evil.example/' }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'REDIRECTED_OFF_SITE')
})

test('🔒 page.text: a same-host canonical PORT redirect renders via the virtual host, connection pinned', async () => {
  // The #154 regression: WordPress redirect_canonical answers 301 http://127.0.0.1/ →
  // http://127.0.0.1:51710/ on a deployment whose public address carries a port. The probe learns the
  // port WITHOUT dialling it; the browser is then pointed at the virtual host at that port with a
  // host-resolver rule routing it back onto THIS container's loopback service.
  const { root, label, cwd } = siteWorkspace()
  let browserArgv = null
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE_REDIR 301 http://127.0.0.1/ http://127.0.0.1:51710/' },
      browser: (input) => {
        browserArgv = input.argv
        return {
          code: 0,
          stdout:
            'TRACY_BROWSER OK http://tracy-site.probe.invalid:51710/\n<html lang="en"><head><title>Home</title></head><body><p>Real page</p></body></html>'
        }
      }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.ok, true)
  assert.match(out.text, /Real page/)
  // 🔒 the browser was addressed by the virtual host at the canonical port…
  assert.ok(
    browserArgv.includes('http://tracy-site.probe.invalid:51710/'),
    'browser url is the virtual authority'
  )
  assert.ok(
    browserArgv.includes('http://tracy-site.probe.invalid:51710'),
    'origin guard is the virtual authority'
  )
  // …and the ONE host-resolver rule routes exactly that authority back onto the loopback service —
  // never a second local port. (Port 80 is implicit in loopbackUrl, so the connect side is :80.)
  const rule = browserArgv.find((a) => String(a).startsWith('TRACY_RESOLVER_RULE='))
  assert.ok(rule, 'the resolver rule rides an env value')
  assert.equal(
    rule,
    'TRACY_RESOLVER_RULE=--host-resolver-rules=MAP tracy-site.probe.invalid:51710 127.0.0.1:80'
  )
})

test('🔒 page.text: a canonical redirect to the IMPLICIT default port 80 still renders, pinned to the site port', async () => {
  // The review's defect: an EmDash site answers its loopback (4321) with `301 → http://127.0.0.1/` —
  // `home_url()` with no port, so the canonical port is 80 written implicitly. Reading that port by
  // splitting the authority on a colon gave NaN (there is no colon), and every such page was refused
  // REDIRECTED_OFF_SITE. It must render: the port is 80 by URL semantics, and the connection stays
  // pinned to THIS site's own loopback port (4321), never dialling the port it named.
  const { root, label, cwd } = emdashWorkspace()
  let browserArgv = null
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE_REDIR 301 http://127.0.0.1:4321/ http://127.0.0.1/' },
      browser: (input) => {
        browserArgv = input.argv
        return {
          code: 0,
          stdout:
            'TRACY_BROWSER OK http://tracy-site.probe.invalid/\n<html lang="en"><head><title>Home</title></head><body><p>Real page</p></body></html>'
        }
      }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.ok, true) // the old NaN split refused this REDIRECTED_OFF_SITE
  assert.match(out.text, /Real page/)
  // 🔒 the origin guard carries NO :80 — it reads as the browser reads its own final URL (URL.origin
  // drops a default port), so an implicit-80 canonical page is not a false off-site.
  assert.ok(
    browserArgv.includes('http://tracy-site.probe.invalid'),
    'origin guard is the bare-port virtual origin'
  )
  assert.ok(
    !browserArgv.includes('http://tracy-site.probe.invalid:80'),
    'the origin guard is not spelled with :80'
  )
  // 🔒 the resolver rule pins the canonical authority back onto THIS site's own port (4321) — the port
  // the site redirected to is never dialled as a service.
  const rule = browserArgv.find((a) => String(a).startsWith('TRACY_RESOLVER_RULE='))
  assert.equal(
    rule,
    'TRACY_RESOLVER_RULE=--host-resolver-rules=MAP tracy-site.probe.invalid:80 127.0.0.1:4321'
  )
})

test('🔒 page.look: a canonical redirect to the EXPLICIT port 80 renders and stays pinned to the site port', async () => {
  // The same defect from the picture side, with the port spelled out (`http://127.0.0.1:80/`): URL
  // semantics normalise it to 80, the browser is pointed at the virtual host, and the connection is
  // pinned to 4321. page.look shares the path, so it is regressed here too.
  const { root, label, cwd } = emdashWorkspace()
  let browserArgv = null
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE_REDIR 301 http://127.0.0.1:4321/ http://127.0.0.1:80/' },
      browser: (input) => {
        browserArgv = input.argv
        return { code: 0, stdout: 'TRACY_BROWSER OK http://tracy-site.probe.invalid/' } // execFor writes the PNG
      }
    })
  })
  const out = await runSite(tools, { action: 'page.look', params: {} }, cwd)
  assert.equal(out.ok, true)
  assert.ok(existsSync(out.file), 'the canonical-port screenshot the container wrote is on the host inode')
  assert.ok(
    browserArgv.includes('http://tracy-site.probe.invalid'),
    'origin guard is the bare-port virtual origin'
  )
  assert.ok(
    !browserArgv.includes('http://tracy-site.probe.invalid:80'),
    'the origin guard is not spelled with :80'
  )
  const rule = browserArgv.find((a) => String(a).startsWith('TRACY_RESOLVER_RULE='))
  assert.equal(
    rule,
    'TRACY_RESOLVER_RULE=--host-resolver-rules=MAP tracy-site.probe.invalid:80 127.0.0.1:4321'
  )
})

test('🔒 page.text: an EmDash site with NO database in the webroot is still dialled on 4321 (handoff file)', async () => {
  // The defect `sitePortFor` closes: `detectPlatform` reads the WEBROOT, and a real EmDash site
  // keeps its database under the private root, so the webroot is empty and the port answered 80.
  // The handoff file decides instead — and the container is not asked when it is present.
  const { root, label, cwd } = emdashPrivateRootWorkspace('emd-artifact-1', { artifact: true })
  let probeCall = null
  let browserCall = null
  const tools = register({
    emdash: { cms: async () => assert.fail('the handoff file decides; the container is not asked') },
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: (input) => {
        probeCall = input.argv
        return { code: 0, stdout: 'TRACY_PROBE 200 http://127.0.0.1:4321/' }
      },
      browser: (input) => {
        browserCall = input.argv
        return {
          code: 0,
          stdout:
            'TRACY_BROWSER OK http://127.0.0.1:4321/\n<html lang="en"><head><title>Home</title></head><body><p>Real page</p></body></html>'
        }
      }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.ok, true) // port 80 gave SITE_UNREACHABLE for a site that was up
  assert.match(out.text, /Real page/)
  // 🔒 both legs run as www-data INSIDE this site's OWN container (the docker proxy's one allowed
  // target), never on dsh and never in another site's container…
  assert.deepEqual(probeCall.slice(0, 4), ['exec', '-u', 'www-data', `${label}-web-1`])
  // (the browser leg carries `-e HOME=/tmp` between the user and the container; this page needs
  // no canonical-port routing, so nothing else stands in front of the container)
  assert.deepEqual(browserCall.slice(0, 6), ['exec', '-u', 'www-data', '-e', 'HOME=/tmp', `${label}-web-1`])
  // …and both are pointed at THIS site's own loopback port, 4321.
  assert.ok(probeCall.includes('http://127.0.0.1:4321/'), 'the probe dials 4321, not 80')
  assert.ok(
    browserCall.some((a) => String(a) === 'http://127.0.0.1:4321/'),
    'the browser is pointed at 4321, not 80'
  )
})

test('🔒 page.look: an EmDash site with no handoff file is dialled on 4321 by its container label', async () => {
  // A provision that stopped before writing `template/artifact.json` (measured 16/09) still runs
  // EmDash. `isEmdashSite` falls through to the image's own `io.tracy.cms` label, read for THIS
  // site's container through the docker proxy — so the picture leg gets 4321 too.
  const { root, label, cwd } = emdashPrivateRootWorkspace('emd-label-1')
  let inspected = null
  let probeCall = null
  let browserCall = null
  const tools = register({
    emdash: {
      cms: async (container) => {
        inspected = container
        return container === `${label}-web-1` ? 'emdash' : ''
      }
    },
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: (input) => {
        probeCall = input.argv
        return { code: 0, stdout: 'TRACY_PROBE 200 http://127.0.0.1:4321/' }
      },
      browser: (input) => {
        browserCall = input.argv
        return { code: 0, stdout: 'TRACY_BROWSER OK http://127.0.0.1:4321/' } // execFor writes the PNG
      }
    })
  })
  const out = await runSite(tools, { action: 'page.look', params: {} }, cwd)
  assert.equal(out.ok, true)
  assert.ok(existsSync(out.file), 'the screenshot the container wrote is on the host inode')
  assert.equal(inspected, `${label}-web-1`, "the label is read off THIS site's own container")
  assert.deepEqual(probeCall.slice(0, 4), ['exec', '-u', 'www-data', `${label}-web-1`])
  assert.deepEqual(browserCall.slice(0, 6), ['exec', '-u', 'www-data', '-e', 'HOME=/tmp', `${label}-web-1`])
  assert.ok(probeCall.includes('http://127.0.0.1:4321/'), 'the probe dials 4321, not 80')
  assert.ok(
    browserCall.some((a) => String(a) === 'http://127.0.0.1:4321/'),
    'the browser is pointed at 4321, not 80'
  )
})

test('🔒 page.text: a canonical redirect to an INVALID explicit port (:0) is refused, never dialled', async () => {
  // The numeric edge the review named: an explicit `:0` must not be read as the default 80. The port
  // is taken as written (0), fails the validity check, and the page is refused REDIRECTED_OFF_SITE —
  // the browser is never launched, so the trap authority is never dialled.
  const { root, label, cwd } = emdashWorkspace()
  let launched = false
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE_REDIR 301 http://127.0.0.1:4321/ http://127.0.0.1:0/' },
      browser: () => {
        launched = true
        return { code: 0, stdout: 'TRACY_BROWSER OK http://tracy-site.probe.invalid/' }
      }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'REDIRECTED_OFF_SITE')
  assert.equal(launched, false)
})

test('🔒 page.text: the probe passes but the browser ends on ANOTHER origin → REDIRECTED_OFF_SITE', async () => {
  // the exact hole the review named: a JS/meta navigation the GET probe cannot see. The browser's
  // final-URL check catches it, so a foreign document never comes back as this site's text.
  const { root, label, cwd } = siteWorkspace()
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE 200 http://127.0.0.1/' },
      browser: { stdout: 'TRACY_BROWSER OFFSITE http://127.0.0.1:4322/' }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'REDIRECTED_OFF_SITE')
})

test('page.text: a missing browser is NO_BROWSER, and its next names no browser tool', async () => {
  const { root, label, cwd } = siteWorkspace()
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE 200 http://127.0.0.1/' },
      browser: { stdout: 'TRACY_BROWSER NOCHROME spawn chromium ENOENT' }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'NO_BROWSER')
  // 🔒 the review's NO_BROWSER cycle: the truthful fallback is the content door, and page.look — which
  // needs the SAME browser — is disclaimed, never offered as the way out. The door is THIS surface's
  // own read (T10 G1, `contentDoor`); a site whose platform no file names gets both platforms' reads.
  assert.match(out.next, /content\.get \{kind:"post", id\} on WordPress, content\.contract/)
  assert.match(out.next, /page\.look needs the same browser/)
  assert.ok(out.next.length <= 200, out.next)
})

test('page.text: the browser renders the own-origin document → ok, with the DOM read back', async () => {
  const { root, label, cwd } = siteWorkspace()
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE 200 http://127.0.0.1/' },
      browser: {
        stdout:
          'TRACY_BROWSER OK http://127.0.0.1/\n<html lang="en"><head><title>Home</title></head><body><p>Hello there</p></body></html>'
      }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.ok, true)
  assert.equal(out.lang, 'en')
  assert.equal(out.title, 'Home')
  assert.match(out.text, /Hello there/)
})

test('page.look: a missing browser is NO_BROWSER whose next names no browser tool', async () => {
  const { root, label, cwd } = siteWorkspace()
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE 200 http://127.0.0.1/' },
      browser: { stdout: 'TRACY_BROWSER NOCHROME spawn chromium ENOENT' }
    })
  })
  const out = await runSite(tools, { action: 'page.look', params: {} }, cwd)
  assert.equal(out.code, 'NO_BROWSER')
  assert.doesNotMatch(out.next, /page\.text/) // page.text needs the same browser — never recommend it here
})

test('page.look: an own-origin render writes the PNG and returns ok with the host file path', async () => {
  const { root, label, cwd } = siteWorkspace()
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE 200 http://127.0.0.1/' },
      browser: { stdout: 'TRACY_BROWSER OK http://127.0.0.1/' } // execFor writes the PNG for a shot OK
    })
  })
  const out = await runSite(tools, { action: 'page.look', params: {} }, cwd)
  assert.equal(out.ok, true)
  assert.ok(existsSync(out.file), 'the screenshot the container wrote should be on the host inode dsh reads')
  assert.ok(out.file.startsWith(path.join(root, label)))
})

test('🔒 page.look on an image-capable session: the picture rides the answer as an image block (W4)', async () => {
  const { root, label, cwd } = siteWorkspace()
  const saved = []
  const services = {
    llm: {
      resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
      listModels: async () => [],
      stream: () => assert.fail('an image-capable session needs no second model call')
    },
    attachments: {
      saveImage: async (input) => {
        saved.push(input)
        return {
          attachmentId: 'sha256:look',
          mediaType: input.mediaType,
          bytes: input.data.length,
          width: 8,
          height: 8
        }
      }
    },
    agentDefaultModel: {
      currentSelection: () => ({ provider: 'deepseek-official', model: 'deepseek-flash' })
    }
  }
  const tools = new Map()
  apply(
    {
      webServer: { register: () => () => {} },
      tools: { register: (t) => (tools.set(t.name, t), () => {}) },
      effect: (setup) => {
        setup()
      },
      on: () => {},
      get: (name) => services[name]
    },
    {
      exec: execFor(
        label,
        root
      )({
        road: 'legacy',
        probe: { stdout: 'TRACY_PROBE 200 http://127.0.0.1/' },
        browser: { stdout: 'TRACY_BROWSER OK http://127.0.0.1/' }
      })
    }
  )
  const out = await runSite(tools, { action: 'page.look', params: {} }, cwd)
  assert.equal(out.ok, true)
  assert.equal(saved.length, 1, 'the screenshot on disk is saved once, the way read_image saves it')
  const blocks = tools.get('tracy_site').output.render({ action: 'page.look' }, out)
  assert.equal(blocks.length, 2)
  assert.equal(blocks[1].type, 'image')
  assert.equal(blocks[1].attachment.attachmentId, 'sha256:look')
  const shown = JSON.parse(blocks[0].text)
  assert.equal(shown.picture, undefined, 'the reference rides the image block, not the JSON text')
  assert.equal(shown.file, out.file, 'the file stays in the answer, to cite')
  assert.match(shown.next, /no read_image needed/)
  // Every other answer renders exactly as before: one text block, JSON.stringify byte for byte.
  const refusal = { ok: false, code: 'BAD_PATH', error: 'x' }
  for (const name of ['tracy_site', 'tracy_emdash'])
    assert.deepEqual(tools.get(name).output.render({}, refusal), [
      { type: 'text', text: JSON.stringify(refusal) }
    ])
})

// ── truncated / non-zero browser output must NOT come back as a whole page (the large-output rule) ──

test('🔒 page.text: a maxBuffer overflow (code:null + spawnError) under an OK line is READ_FAILED, never a half page', async () => {
  const { root, label, cwd } = siteWorkspace()
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE 200 http://127.0.0.1/' },
      // dockerExec reports a stdout past maxBuffer (16 MiB) as code:null + a spawnError, with the stdout
      // CUT OFF mid-document — the OK prefix survives but the page does not. This is the exact hole.
      browser: {
        code: null,
        spawnError: 'stdout maxBuffer length exceeded',
        stdout: 'TRACY_BROWSER OK http://127.0.0.1/\n<html><body>only the start of a 16MiB document'
      }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'READ_FAILED')
})

test('🔒 page.text: a non-zero exit under an OK line (a stalled flush) is READ_FAILED', async () => {
  const { root, label, cwd } = siteWorkspace()
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE 200 http://127.0.0.1/' },
      browser: { code: 1, stdout: 'TRACY_BROWSER OK http://127.0.0.1/\n<html><body>half a page' }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'READ_FAILED')
})

test('🔒 page.look: a maxBuffer overflow (code:null + spawnError) is LOOK_FAILED even though a PNG was written', async () => {
  const { root, label, cwd } = siteWorkspace()
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE 200 http://127.0.0.1/' },
      // execFor writes the PNG for a shot OK, so existsSync passes — yet an unclean exit must still refuse.
      browser: {
        code: null,
        spawnError: 'stdout maxBuffer length exceeded',
        stdout: 'TRACY_BROWSER OK http://127.0.0.1/'
      }
    })
  })
  const out = await runSite(tools, { action: 'page.look', params: {} }, cwd)
  assert.equal(out.code, 'LOOK_FAILED')
})

test('🔒 page.look: a non-zero exit under an OK line is LOOK_FAILED', async () => {
  const { root, label, cwd } = siteWorkspace()
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      road: 'legacy',
      probe: { stdout: 'TRACY_PROBE 200 http://127.0.0.1/' },
      browser: { code: 1, stdout: 'TRACY_BROWSER OK http://127.0.0.1/' }
    })
  })
  const out = await runSite(tools, { action: 'page.look', params: {} }, cwd)
  assert.equal(out.code, 'LOOK_FAILED')
  // 🔒 And it says what to do next (v6: it had no next, and the agent retried blind or built its own
  // browser): once more, or read the value with style instead of a picture.
  assert.equal(out.next, LOOK_FAILED_NEXT)
  assert.match(out.next, /once more/)
  assert.match(out.next, /style:\{text:/)
})

/**
 * 🔒 A KEY PAGE.LOOK DOES NOT READ IS REFUSED, NEVER IGNORED (suite v6 BEFORE, 29/09/2026). `full`,
 * `fullPage` and `scrollTo` came back as the same top-of-page picture, identical hash, and the agent
 * built curl and Chromium probes to see below it. Refused before any exec, naming what it takes.
 */
test('🔒 page.look: an unknown key is BAD_PARAMS before any exec, naming the keys it takes', async () => {
  const tools = register({ exec: async () => assert.fail('exec must not run for an unread key') })
  const { cwd } = siteWorkspace()
  for (const params of [
    { path: '/', fullPage: true },
    { path: '/', full: true },
    { scrollTo: 'bottom' },
    { style: { text: 'See our capabilities', scroll: true } }
  ]) {
    const out = await runSite(tools, { action: 'page.look', params }, cwd)
    assert.equal(out.code, 'BAD_PARAMS', JSON.stringify(params))
    assert.match(
      out.error,
      /^page\.look takes path, style \{text \| selector, nth\?, props\?, viewport\?\} and maxChars/
    )
    assert.match(out.next, /page\.look \{path, style:\{text:/)
  }
  // Beside `action` is the same as inside `params` (planCall moves it there), and it is named.
  const beside = await runSite(tools, { action: 'page.look', path: '/', fullPage: true }, cwd)
  assert.equal(beside.code, 'BAD_PARAMS')
  assert.match(beside.error, /"fullPage" would have been ignored/)
  // A style key written beside path has the one exact fix.
  const misplaced = await runSite(
    tools,
    { action: 'page.look', params: { path: '/', viewport: 'mobile' } },
    cwd
  )
  assert.equal(misplaced.code, 'BAD_PARAMS')
  assert.equal(misplaced.next, 'Put viewport inside style:{…} and call again.')
  // Every key it reads passes the check (null and undefined are no key at all).
  assert.equal(
    lookParamsProblem({
      path: '/',
      maxChars: 1200,
      style: { text: 'x', nth: 0, props: ['color'], prop: 'color', viewport: 'mobile' },
      extra: undefined,
      other: null
    }),
    null
  )
  assert.equal(lookParamsProblem({}), null)
  assert.equal(lookParamsProblem({ style: 'See our capabilities' }), null)
})

// ── page.text / page.look on the curl road (F2 §6.20–31) ─────────────────────────────────────────

/** What one curl argv asked: its nonce, the Host it presented, its scheme, the path it dialled. */
function fetchAsked(argv) {
  const nonce = /\n(TRACY_FETCH_[0-9a-f]{32}) /.exec(argv[argv.indexOf('--write-out') + 1])[1]
  const headers = argv.flatMap((a, i) => (a === '--header' ? [argv[i + 1]] : []))
  const header = (name) => headers.find((h) => h.startsWith(`${name}: `))?.slice(name.length + 2) ?? ''
  const url = new URL(argv.at(-1))
  return {
    nonce,
    host: header('Host'),
    proto: header('X-Forwarded-Proto'),
    dial: url.host,
    path: url.pathname
  }
}

/** A curl answer as the transport returns it: headers, body, then the call's own closing line. */
function fetchOk(
  argv,
  { status = 200, headers = { 'Content-Type': 'text/html; charset=utf-8' }, body = '' } = {}
) {
  const { nonce } = fetchAsked(argv)
  const head = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}\r\n`)
    .join('')
  return {
    code: 0,
    stdout: `HTTP/1.1 ${status} X\r\n${head}\r\n${body}\n${nonce} ${status} ${Buffer.byteLength(body)}\n`,
    stderr: '',
    timedOut: false
  }
}

const HOME = `<html lang="en"><head><title>Home</title></head><body><header><a href="/">Brand</a></header><main><h1>Welcome to the shop</h1><p>${'Real words of the page, served by the server itself. '.repeat(8)}</p><p>Call 555-0100</p></main><footer><p>Open Mon–Fri</p></footer></body></html>`
const SHELL =
  '<html lang="en"><head><title>App</title></head><body><div id="app"></div><script src="/app.js"></script></body></html>'

/** Every exec a curl-road stub saw, by kind. */
const kinds = (seen) =>
  seen.map((argv) => (argv[4] === 'curl' ? 'fetch' : argv.includes('timeout') ? 'browser' : 'probe'))

test('🔒 page.text (curl road): a WordPress-shaped site is read with no probe and no browser, as its public self', async () => {
  const { root, label, cwd } = siteWorkspace('demo1')
  const seen = []
  const tools = register({
    siteDomain: 'tracy.test',
    deploymentOrigin: 'http://tracy.test:51710',
    exec: execFor(
      label,
      root
    )({
      fetch: (input) => {
        seen.push(input.argv)
        const asked = fetchAsked(input.argv)
        // WordPress answers its bare loopback with its home: the public origin, on the stand's port.
        return asked.host === '127.0.0.1'
          ? fetchOk(input.argv, { status: 301, headers: { Location: 'http://demo1.tracy.test:51710/' } })
          : fetchOk(input.argv, { body: HOME })
      },
      probe: () => assert.fail('the node probe must not run where curl is'),
      browser: () => assert.fail('a whole server page needs no browser')
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.ok, true)
  assert.match(out.text, /Welcome to the shop/)
  assert.deepEqual(kinds(seen), ['fetch', 'fetch'])
  // D4: loopback first, then EXACTLY the public origin, asked as itself over the same loopback port.
  assert.equal(fetchAsked(seen[0]).dial, '127.0.0.1')
  assert.equal(fetchAsked(seen[1]).host, 'demo1.tracy.test:51710')
  assert.equal(fetchAsked(seen[1]).proto, 'http')
  assert.equal(fetchAsked(seen[1]).dial, '127.0.0.1')
})

test('🔒 page.text (curl road): a Joomla-shaped / → /en/ redirect is followed on the same origin', async () => {
  const { root, label, cwd } = siteWorkspace('j1')
  const seen = []
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      fetch: (input) => {
        seen.push(input.argv)
        return fetchAsked(input.argv).path === '/'
          ? fetchOk(input.argv, { status: 301, headers: { Location: '/en/' } })
          : fetchOk(input.argv, { body: HOME })
      }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.ok, true)
  assert.match(out.url, /\/en\/$/)
  assert.deepEqual(kinds(seen), ['fetch', 'fetch'])
})

test('🔒 page.text (curl road): the site folder cannot vouch for another host, and no domain keeps a public redirect off-site', async () => {
  // A claim planted in the folder (www-data may write it) is not the host's configuration.
  const ws = publicSiteWorkspace('demo1', 'https://evil.example')
  let fetches = 0
  const tools = register({
    ...PUBLIC,
    exec: execFor(
      ws.label,
      ws.root
    )({
      fetch: (input) => {
        fetches += 1
        return fetchOk(input.argv, { status: 301, headers: { Location: 'https://evil.example/' } })
      }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, ws.cwd)
  assert.equal(out.code, 'REDIRECTED_OFF_SITE')
  assert.equal(fetches, 1, 'refused after one exec, the foreign address never dialled')
  // A host told no site domain: the site's own public name is still not this site.
  delete process.env.TRACY_SITE_DOMAIN
  const bare = register({
    exec: execFor(
      ws.label,
      ws.root
    )({
      fetch: (input) =>
        fetchOk(input.argv, { status: 301, headers: { Location: 'https://demo1.tracy.site/' } })
    })
  })
  assert.equal((await runSite(bare, { action: 'page.text', params: {} }, ws.cwd)).code, 'REDIRECTED_OFF_SITE')
})

test('page.text (curl road): a thin page is drawn by the browser where there is one, and said thin where there is none', async () => {
  const { root, label, cwd } = siteWorkspace('app1')
  const drawn = register({
    exec: execFor(
      label,
      root
    )({
      fetch: (input) => fetchOk(input.argv, { body: SHELL }),
      browser: () => ({
        code: 0,
        stdout: `TRACY_BROWSER OK http://127.0.0.1/\n<html lang="en"><head><title>App</title></head><body><main><h1>Drawn by script</h1><p>${'Words the script put on the page. '.repeat(10)}</p></main></body></html>`
      })
    })
  })
  const out = await runSite(drawn, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.ok, true)
  assert.equal(out.rendered, 'browser')
  assert.match(out.text, /Drawn by script/)
  const bare = register({
    exec: execFor(
      label,
      root
    )({
      fetch: (input) => fetchOk(input.argv, { body: SHELL }),
      browser: {
        code: 127,
        stdout: '',
        stderr: 'timeout: failed to run command ‘node’: No such file or directory'
      }
    })
  })
  const thin = await runSite(bare, { action: 'page.text', params: {} }, cwd)
  assert.equal(thin.ok, true, 'a site that answered is never NO_BROWSER')
  assert.equal(thin.thin, true)
})

// v6 #3 (28/09/2026): a TEXT file (a feed, robots.txt, a sitemap) is read as its lines; only a file
// that is not text (a PDF, a picture) is still READ_FAILED "not a page".
test('page.text (curl road): 404 is a status, not a page; a text file is its lines; a binary is READ_FAILED', async () => {
  const { root, label, cwd } = siteWorkspace('miss1')
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      fetch: (input) => {
        const path = fetchAsked(input.argv).path
        if (path === '/feed')
          return fetchOk(input.argv, { headers: { 'Content-Type': 'application/rss+xml' }, body: '<rss/>' })
        if (path === '/brochure.pdf')
          return fetchOk(input.argv, { headers: { 'Content-Type': 'application/pdf' }, body: '%PDF-1.7' })
        return fetchOk(input.argv, { status: 404, body: '<html><body><h1>Not found</h1></body></html>' })
      }
    })
  })
  const missing = await runSite(tools, { action: 'page.text', params: { path: '/warranty' } }, cwd)
  assert.equal(missing.status, 404)
  assert.equal(missing.text, '')
  assert.match(missing.next, /does not exist/)
  const feed = await runSite(tools, { action: 'page.text', params: { path: '/feed' } }, cwd)
  assert.equal(feed.ok, true)
  assert.equal(feed.type, 'application/rss+xml')
  assert.equal(feed.text, '<rss/>')
  assert.equal(
    (await runSite(tools, { action: 'page.text', params: { path: '/brochure.pdf' } }, cwd)).code,
    'READ_FAILED'
  )
})

test('page.text (curl road): paths + match read each page once and keep only the lines carrying the words', async () => {
  const { root, label, cwd } = siteWorkspace('many1')
  let fetches = 0
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      fetch: (input) => {
        fetches += 1
        return fetchOk(input.argv, { body: HOME })
      }
    })
  })
  const out = await runSite(
    tools,
    { action: 'page.text', params: { paths: ['/', '/contact', '/about'], match: '555-0100' } },
    cwd
  )
  assert.equal(out.ok, true)
  assert.equal(out.pages.length, 3)
  assert.equal(fetches, 3)
  for (const one of out.pages) assert.doesNotMatch(one.text, /Real words/)
  const outline = await runSite(tools, { action: 'page.text', params: { outline: true } }, cwd)
  assert.equal(typeof outline.outline, 'string')
  assert.match(outline.outline, /main h1: Welcome to the shop/)
})

test('🔒 page.text (curl road): a canonical-port redirect from loopback is followed pinned to this site’s own port', async () => {
  // WordPress `redirect_canonical` pastes its public port onto the loopback name (the probe road's
  // canonical-port case): same host and scheme, another port — asked as that authority, dialled on 80.
  const { root, label, cwd } = siteWorkspace('canon1')
  const seen = []
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      fetch: (input) => {
        seen.push(input.argv)
        return fetchAsked(input.argv).host === '127.0.0.1'
          ? fetchOk(input.argv, { status: 301, headers: { Location: 'http://127.0.0.1:51710/' } })
          : fetchOk(input.argv, { body: HOME })
      }
    })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.ok, true)
  assert.equal(seen.length, 2)
  assert.equal(fetchAsked(seen[1]).host, '127.0.0.1:51710')
  assert.equal(fetchAsked(seen[1]).dial, '127.0.0.1', 'the connection stays on the container’s own port')
})

test('🔒 page.text (curl road): a redirect loop is READ_FAILED at once, and a browser ending elsewhere is REDIRECTED_OFF_SITE', async () => {
  const { root, label, cwd } = siteWorkspace('loop1')
  const loop = register({
    exec: execFor(
      label,
      root
    )({
      fetch: (input) => fetchOk(input.argv, { status: 302, headers: { Location: 'http://127.0.0.1/' } })
    })
  })
  assert.equal((await runSite(loop, { action: 'page.text', params: {} }, cwd)).code, 'READ_FAILED')
  // A thin page sends the read to the browser, and the browser is the authority on the final document.
  const away = register({
    exec: execFor(
      label,
      root
    )({
      fetch: (input) => fetchOk(input.argv, { body: SHELL }),
      browser: { code: 0, stdout: 'TRACY_BROWSER OFFSITE https://evil.example/' }
    })
  })
  const out = await runSite(away, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'REDIRECTED_OFF_SITE')
  assert.doesNotMatch(JSON.stringify(out), /Welcome/)
})

test('🔒 page.look (curl road): no browser in a container that has curl → NO_BROWSER naming page.text (the flip)', async () => {
  const { root, label, cwd } = siteWorkspace('look1')
  const tools = register({
    exec: execFor(
      label,
      root
    )({
      fetch: (input) => fetchOk(input.argv, { body: HOME }),
      browser: {
        code: 127,
        stdout: '',
        stderr: 'timeout: failed to run command ‘node’: No such file or directory'
      }
    })
  })
  const out = await runSite(tools, { action: 'page.look', params: {} }, cwd)
  assert.equal(out.code, 'NO_BROWSER')
  assert.match(out.next, /page\.text/)
})

test('🔒 page.text (legacy road): no curl and no node is NO_BROWSER naming the content door, never "check the site is running"', async () => {
  // r2 j-1ibzqi: docker wrote its OCI line on STDOUT, and 70 calls were told a running site was down.
  const { root, label, cwd } = siteWorkspace('bare1')
  const OCI_NO_NODE = OCI_NO_CURL.replace('"curl"', '"node"')
  const tools = register({
    exec: execFor(label, root)({ road: 'legacy', probe: { code: 127, stdout: OCI_NO_NODE } })
  })
  const out = await runSite(tools, { action: 'page.text', params: {} }, cwd)
  assert.equal(out.code, 'NO_BROWSER')
  assert.match(out.error, /neither curl nor node/)
  assert.doesNotMatch(JSON.stringify(out), /OCI runtime|check the site is running/i)
})

// ── tracy_emdash: the MCP transport through the real handler ─────────────────────────────────────

const emdashConfig = (execByKind) => ({ emdash: { cms: async () => 'emdash' }, exec: execByKind })

test('tracy_emdash: naming another site than the session’s is refused (SITE_OUTSIDE_CONVERSATION), no exec', async () => {
  const { cwd } = siteWorkspace('site-abc')
  const tools = register(emdashConfig(async () => assert.fail('exec must not run for a foreign site')))
  const out = await runEmdash(tools, { tool: 'content_list', siteKey: 'site-zzz' }, cwd)
  assert.equal(out.code, 'SITE_OUTSIDE_CONVERSATION')
  // The fence carries a next step, as every refusal on this road must (CLAUDE.md §6 `refusal-next`).
  assert.match(String(out.next ?? ''), /own workspace/)
})

test('tracy_emdash {list}: a JSON tools/list answer is parsed into the catalogue', async () => {
  const { root, label, cwd } = siteWorkspace('emd1')
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: { tools: [{ name: 'content_list', description: 'd', inputSchema: {} }] }
  })
  const tools = register(emdashConfig(execFor(label, root)({ mcp: { stdout: `TRACY_MCP 200\n${body}` } })))
  const out = await runEmdash(tools, { list: true }, cwd)
  assert.equal(out.ok, true)
  // One line per tool (`catalogueOf`), not every argument schema: r2 answered {list:true} with 49,977
  // characters in 32 of 33 EmDash turns, re-read on every later step; the schemas of the tools a call
  // needs come from `{list:true, tools:[names]}`, and the next says so.
  assert.deepEqual(out.tools, ['content_list — d'])
  assert.match(out.next, /tools:\[names\]/)
})

test('tracy_emdash: an SSE-framed result is unframed and returned', async () => {
  const { root, label, cwd } = siteWorkspace('emd1')
  const sse =
    'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"ok"}]}}\n\n'
  const tools = register(emdashConfig(execFor(label, root)({ mcp: { stdout: `TRACY_MCP 200\n${sse}` } })))
  const out = await runEmdash(tools, { tool: 'content_get', arguments: { id: 1 } }, cwd)
  assert.equal(out.ok, true)
  assert.equal(out.tool, 'content_get')
})

test('tracy_emdash: an HTTP refusal from the site is SITE_REFUSED', async () => {
  const { root, label, cwd } = siteWorkspace('emd1')
  const tools = register(
    emdashConfig(execFor(label, root)({ mcp: { stdout: 'TRACY_MCP 403\n{"error":"nope"}' } }))
  )
  const out = await runEmdash(tools, { tool: 'content_list' }, cwd)
  assert.equal(out.code, 'SITE_REFUSED')
})

test('tracy_emdash: a missing agent token is NO_TOKEN by name, with the trusted label and a usable next', async () => {
  const { root, label, cwd } = siteWorkspace('emd1')
  const tools = register(
    emdashConfig(
      execFor(label, root)({ mcp: { stdout: 'TRACY_MCP_ERR NO_TOKEN the agent token file is not present' } })
    )
  )
  const out = await runEmdash(tools, { tool: 'content_list' }, cwd)
  assert.equal(out.code, 'NO_TOKEN')
  // The answer carries no token value — the token is read in-container and never reaches dsh.
  assert.doesNotMatch(JSON.stringify(out), /ec_pat_/)
  // 🔒 The label on the refusal is the TRUSTED one the lane settled on, not a requested siteKey —
  // it is what makes the next step name a real site to the operator.
  assert.equal(out.label, label)
  // 🔒 And the next step is the custody procedure this PR ships, not `mint-agent-token.sh`: that
  // helper replaces the inode the container is holding through its exact read-only bind, so it
  // reports success while every tracy_emdash call keeps refusing.
  assert.match(out.next, new RegExp(label))
  assert.match(out.next, /host access/)
  assert.doesNotMatch(out.next, /mint-agent-token/)
  assert.match(out.next, /migrate-token-mount\.mjs/)
  assert.match(out.next, /authenticate the mounted reader/)
  // 🔒 The order it hands over is the one the migration will actually accept: that tool refuses
  // `recovery-required` on custody/auth before it patches compose, so a site missing both the mount
  // and a usable token starts at the staged recovery, not at the migration.
  assert.match(out.next, /recovery-required/)
  assert.ok(out.next.indexOf('stage the credential') < out.next.indexOf('run migrate-token-mount.mjs'))
  assert.match(out.next, /Do NOT read or write the site's database/)
})

test('tracy_emdash: the container never answering is SITE_UNREACHABLE', async () => {
  const { root, label, cwd } = siteWorkspace('emd1')
  const waits = []
  const tools = register({
    ...emdashConfig(execFor(label, root)({ mcp: { code: 1, stdout: '' } })),
    // The read's one retry waits before asking again; the test records the wait instead of serving it.
    sleep: async (ms) => void waits.push(ms)
  })
  const out = await runEmdash(tools, { tool: 'content_list' }, cwd)
  assert.equal(out.code, 'SITE_UNREACHABLE')
  assert.equal(waits.length, 1, 'one retry, after one wait')
})

// ── tracy_site: the Apply-door relay through the real handler ────────────────────────────────────

/** The customer's own message in a session log: who typed (the gate's stamp) and what they asked. */
const customerSaid = (text, email = 'an@example.test') => ({
  type: 'user/message',
  data: { source: { kind: 'user', prompter: { user: 'An', email } }, content: [{ type: 'text', text }] }
})

// The default door for a test that names none: refuses at once, as a host that does not resolve would,
// instead of a real DNS lookup for door.test that keeps the process alive ~28 s at exit on macOS.
const unreachableDoor = async () => {
  throw new TypeError('fetch failed')
}

/**
 * A HostContext whose optional services answer: dsh's session store holds `events` (so a write leaves
 * as the person who typed, signed by the gate's signer), and every `ctx.on` listener is kept by name
 * so a test can fire `agent/pre-step`, `agent/created` or `tools/result` itself.
 */
function registerWithDoor(config, { events = [customerSaid('change the phone')], services = {} } = {}) {
  const tools = new Map()
  const listeners = new Map()
  const ctx = {
    webServer: { register: () => () => {} },
    tools: { register: (t) => (tools.set(t.name, t), () => {}) },
    // dsh's live agent registry, when a test brings one (`x-tracy-turn` reads who owns whom).
    agents: services.agents,
    effect: (setup) => {
      setup()
    },
    on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    get: (name) =>
      name === 'sessions'
        ? { get: () => ({ snapshotEvents: () => events }) }
        : name === 'tracyAssertion'
          ? (services.tracyAssertion ?? { mint: (email) => `signed:${email}` })
          : services[name]
  }
  // A fixed clock unless the test brings its own: the today notice (`todayNotice`) says a day, and a
  // suite that straddled midnight UTC would otherwise send one step more than it counts.
  // These fixtures are ordinary site conversations, not a granted researched-demo session.
  const http = config.fetch ?? unreachableDoor
  const fetch = async (url, init = {}) => {
    if (String(url).endsWith('/apply') && init.body) {
      const body = JSON.parse(String(init.body))
      if (body.action === 'demo.research' && body.params?.operation === 'guard')
        return new Response(JSON.stringify({ code: 'AGENT_DEMO_NOT_GRANTED' }), { status: 409 })
    }
    return http(url, init)
  }
  apply(ctx, { origin: 'http://door.test', now: () => TODAY_FIXED, ...config, fetch })
  return { tools, listeners, events }
}

/** The day every host of these tests believes it is (`registerWithDoor`), a Wednesday. */
const TODAY_FIXED = new Date('2026-09-30T12:00:00Z')

/**
 * The Apply door as `config.fetch`: every call is recorded ({url, headers, body}) and answered by
 * `answer(body, n)` (or the same object each time). The boot pairing probe is answered 404 — silence.
 */
function doorFetch(answer, calls = []) {
  return async (url, init = {}) => {
    if (!String(url).endsWith('/apply')) return new Response('', { status: 404 })
    const body = JSON.parse(String(init.body))
    calls.push({ url: String(url), headers: init.headers, body })
    const out = typeof answer === 'function' ? await answer(body, calls.length) : answer
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

test('🔒 the relay: a call leaves through config.fetch as the person who typed, and its refusal carries a next', async () => {
  const { label, cwd } = siteWorkspace('relay1')
  const calls = []
  const { tools } = registerWithDoor({
    fetch: doorFetch({ ok: false, error: 'bad_params', message: 'kind must be one of: post, option' }, calls)
  })
  const out = await runSite(tools, { action: 'content.get', params: { kind: 'page', id: 42 } }, cwd)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'http://door.test/api/sites/_conversation/apply')
  assert.equal(calls[0].headers['x-tracy-actor'], 'signed:an@example.test')
  assert.equal(calls[0].headers['x-tracy-workspace-label'], label)
  assert.equal(calls[0].headers['x-tracy-session'], 'session-x')
  assert.equal(calls[0].body.action, 'content.get')
  // A call for no comment keeps the body it always had.
  assert.equal(Object.hasOwn(calls[0].body, 'comment'), false)
  // D24: the component's code on `error` gets its own next, never "This site answered no".
  assert.equal(out.ok, false)
  assert.match(String(out.next ?? ''), /\S/)
  assert.doesNotMatch(String(out.next), /answered no/)
})

/**
 * A sites root with one site of `platform`, sealed or not — as Add site and provision leave it: the
 * folder's own record (`.tracy/site.json`), the contract marker beside the sites (`.content-contracts/
 * <label>.json`), and optionally a build job filed under the site's key.
 */
function siteOn({ label = 'site1', platform, sealed = false, job = null, marker = null }) {
  const root = mkdtempSync(path.join(tmpdir(), 'tch-handler-'))
  const folder = path.join(root, label)
  mkdirSync(path.join(folder, '.tracy'), { recursive: true })
  const siteKey = `${label}.tracy.test`
  writeFileSync(path.join(folder, '.tracy', 'site.json'), JSON.stringify({ siteKey, platform }))
  if (sealed) {
    mkdirSync(path.join(root, '.content-contracts'), { recursive: true })
    writeFileSync(
      path.join(root, '.content-contracts', `${label}.json`),
      JSON.stringify(marker ?? { contract: 'tracy-business/j6/1.2.0' })
    )
  }
  if (job !== null) writeBuildJob(folder, siteKey, job)
  process.env.TRACY_SITES_ROOT = root
  return { root, label, cwd: folder, siteKey }
}

/** A build job for `folder`'s site, where the build pipeline files it. */
function writeBuildJob(folder, siteKey, job) {
  mkdirSync(path.join(folder, 'docs', 'agents', 'build', 'sites'), { recursive: true })
  writeFileSync(
    path.join(folder, 'docs', 'agents', 'build', 'sites', `${siteKey}.json`),
    JSON.stringify({ job: 'build-one', ...job })
  )
}

/** A sealed Joomla inspect answer: one page, three slots — enough for every snapshot rule. */
const INSPECT = {
  ok: true,
  revision: 'rev-1',
  slots: [
    {
      key: 'module-441.1',
      entity: 'module-441',
      type: 'text',
      label: 'Hero / Title (en)',
      current: 'Welcome'
    },
    {
      key: 'module-441.2',
      entity: 'module-441',
      type: 'text',
      label: 'Hero / Phone (en)',
      current: '555-0100'
    },
    {
      key: 'module-441.8',
      entity: 'module-441',
      type: 'image',
      label: 'Hero / Picture',
      current: '',
      sample: 'a.jpg'
    }
  ],
  pages: [{ route: 'home', entity: 'menu-101', assignedModules: [{ entity: 'module-441' }] }]
}

/** The door answering a sealed Joomla site: the inspect above, and `ok` for everything else. */
const joomlaDoor = (calls) =>
  doorFetch(
    (body) =>
      body.action === 'content.contract' && body.params.operation === 'inspect'
        ? INSPECT
        : { ok: true, applyId: body.params.apply_id ?? null },
    calls
  )

/** The agent `agent/pre-step` hands over: its session log is `events`, all of it visible. */
function stepAgent(cwd, events, sessionId = 'session-x') {
  return {
    id: sessionId,
    session: {
      id: sessionId,
      header: { cwd },
      seq: events.length,
      eventAt: (seq) => events[seq],
      surface: { nodes: events.map((_, seq) => seq) }
    }
  }
}

/** Run this plugin's `agent/pre-step` hook for one step that claimed `messages`; returns what it sends. */
async function preStep(listeners, { cwd, events = [], messages = [] }) {
  const [hook] = listeners.get('agent/pre-step') ?? []
  const decision = await hook({ agent: stepAgent(cwd, events), messages }, async () => ({
    kind: 'enter',
    messages: [...messages]
  }))
  return decision.messages.filter((m) => !messages.includes(m))
}

/** Messages a step sent, written back as the session log events a later step reads. */
const asEvents = (sent) =>
  sent.map((message, seq) => ({
    type: 'user/message',
    seq,
    data: { source: message.source, content: message.content }
  }))

/** A customer's message as a step claims it. */
const claimed = (text) => ({
  id: 'm',
  role: 'user',
  content: [{ type: 'text', text }],
  source: { kind: 'user' }
})

const inspectCall = {
  action: 'content.contract',
  params: { operation: 'inspect', page: 'home', slots: 'text' }
}
const inspects = (calls) => calls.filter((c) => c.body.params.operation === 'inspect').length

test('🔒 D24: on a sealed WordPress site, content.contract is refused before any relay, naming only that surface', async () => {
  const { cwd } = siteOn({ platform: 'wordpress', sealed: true })
  const calls = []
  const { tools } = registerWithDoor({ fetch: doorFetch({ ok: true }, calls) })
  const out = await runSite(tools, { action: 'content.contract', params: { operation: 'inspect' } }, cwd)
  assert.equal(calls.length, 0, 'nothing was relayed')
  assert.equal(out.code, 'NOT_ON_THIS_PLATFORM')
  assert.deepEqual(out.actions, [...SURFACE_ACTIONS['wordpress-sealed']])
  assert.doesNotMatch(String(out.next), /content\.contract/)
  // An action nobody knows lists THIS surface too — r2 C05/C24 tried content.contract 5× each.
  const unknown = await runSite(tools, { action: 'help' }, cwd)
  assert.equal(unknown.code, 'BAD_ACTION')
  assert.ok(!unknown.actions.includes('content.contract'))
})

/**
 * 🔒 A WORDPRESS SITE PROVISION BOUND (#337), END TO END THROUGH THE SHIPPED HANDLER: the marker names
 * the Claude Cowork plugin provision pinned, so `tracy_site` carries out the contract road the agent was told
 * about — the inspect relayed bare and narrowed here, the apply sent with Tracy's ids — and refuses a
 * record write before the relay, pointing at the contract.
 */
test('🔒 #337: on a bound WordPress site the contract is relayed and narrowed; a record write is relayed too', async () => {
  const { cwd } = siteOn({
    platform: 'wordpress',
    sealed: true,
    marker: { contract: 'tracy-business/wp7/1.1.0', platform: 'wordpress', coworkContractVersion: '0.13.2' }
  })
  const calls = []
  const wpInspect = {
    ok: true,
    bound: true,
    contract: 'tracy-business/wp7/1.1.0',
    revision: 'rev-wp',
    entities: [
      { key: 'option-blogname', kind: 'option', id: null },
      { key: 'page-home', kind: 'page', id: 42 },
      { key: 'page-about', kind: 'page', id: 43 }
    ],
    slots: { 'site.name': 'Northgate', 'home.hero.heading': 'Building plants', 'about.intro': 'We build' },
    problems: []
  }
  const { tools } = registerWithDoor({
    fetch: doorFetch(
      (body) =>
        body.action === 'content.contract' && body.params.operation === 'inspect'
          ? wpInspect
          : { ok: true, apply_id: body.params.apply_id, revision: 'rev-wp-2' },
      calls
    )
  })
  const found = await runSite(
    tools,
    { action: 'content.contract', params: { operation: 'inspect', page: 'home' } },
    cwd
  )
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].body.params, { operation: 'inspect' }, "Tracy's filters never reach the site")
  assert.deepEqual(
    found.slots.map((slot) => slot.key),
    ['site.name', 'home.hero.heading']
  )
  const applied = await runSite(
    tools,
    {
      action: 'content.contract',
      params: { operation: 'apply', expected_revision: 'rev-wp', changes: { 'home.hero.heading': 'Hi' } }
    },
    cwd
  )
  assert.equal(applied.ok, true)
  const sent = calls.at(-1).body.params
  assert.match(sent.apply_id, /^contract-/)
  assert.match(sent.request_id, /^r-[0-9a-f]{16}$/)
  // Tracy ADR 0022: a record write on a bound site is relayed like on any site; the component decides.
  const before = calls.length
  await runSite(
    tools,
    { action: 'content.update', params: { kind: 'post', id: 42, fields: { post_title: 'x' } } },
    cwd
  )
  assert.equal(calls.length, before + 1, 'the record write was relayed')
  assert.equal(calls.at(-1).body.action, 'content.update')
  assert.ok(SURFACE_ACTIONS['wordpress-contract'].includes('content.update'))
})

test('🔒 D8: the second person never gets the first person’s cached inspect', async () => {
  const { cwd } = siteOn({ platform: 'joomla', sealed: true })
  const calls = []
  const events = [customerSaid('change the phone', 'an@example.test')]
  const { tools } = registerWithDoor({ fetch: joomlaDoor(calls) }, { events })
  await runSite(tools, inspectCall, cwd)
  const again = await runSite(tools, inspectCall, cwd)
  assert.equal(inspects(calls), 1, 'the same person, the same turn: answered from the snapshot')
  assert.match(String(again.normalized), /answered from this turn's inspect/)
  // Another person types in the same conversation: their seat may not carry the contract toolset.
  events.push(customerSaid('and the title', 'bo@example.test'))
  await runSite(tools, inspectCall, cwd)
  assert.equal(inspects(calls), 2, 'a second person is asked for their own inspect')
})

test('🔒 D8: a write between two inspects relays the second', async () => {
  const { cwd } = siteOn({ platform: 'joomla', sealed: true })
  const calls = []
  const { tools } = registerWithDoor({ fetch: joomlaDoor(calls) })
  await runSite(tools, inspectCall, cwd)
  const applied = await runSite(
    tools,
    {
      action: 'content.contract',
      params: { operation: 'apply', expected_revision: 'rev-1', changes: { 'module-441.2': '555-0199' } }
    },
    cwd
  )
  assert.equal(applied.ok, true)
  // Tracy made the ids (D9): the model sent none.
  const apply = calls.find((c) => c.body.params.operation === 'apply')
  assert.match(String(apply.body.params.apply_id), /^contract-/)
  assert.match(String(apply.body.params.request_id), /^r-[0-9a-f]{16}$/)
  await runSite(tools, inspectCall, cwd)
  assert.equal(inspects(calls), 2, 'the site changed: the second inspect is relayed')
})

test("🔒 #316 H1: media.draw looks its slot up in this turn's inspect — two lookups with no write between cost one inspect, and a read after them none", async (t) => {
  const previous = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'test-key'
  t.after(() => {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = previous
  })
  const { cwd } = siteOn({ platform: 'joomla', sealed: true })
  const calls = []
  const { tools } = registerWithDoor({ fetch: joomlaDoor(calls) })
  // Slots the contract does not hold: each draw stops at the lookup, before any picture is drawn.
  const first = await runSite(
    tools,
    { action: 'media.draw', params: { prompt: 'a lake', slot: 'module-1.1' } },
    cwd
  )
  const second = await runSite(
    tools,
    { action: 'media.draw', params: { prompt: 'a hill', slot: 'module-2.1' } },
    cwd
  )
  assert.equal(first.code, 'SLOT_NOT_FOUND')
  assert.equal(second.code, 'SLOT_NOT_FOUND')
  assert.equal(inspects(calls), 1, 'the second draw was served from the first one’s inspect')
  assert.equal(calls[0].headers['x-tracy-actor'], 'signed:an@example.test', 'relayed as the person who typed')
  const read = await runSite(tools, inspectCall, cwd)
  assert.equal(inspects(calls), 1, 'the same person, the same turn: the model’s inspect is the same snapshot')
  assert.match(String(read.normalized), /answered from this turn's inspect/)
})

test('media.draw with a slot the contract does not hold answers the image slots, from the inspect the lookup already made', async (t) => {
  const previous = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'test-key'
  t.after(() => {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = previous
  })
  const { cwd } = siteOn({ platform: 'joomla', sealed: true })
  const calls = []
  const { tools } = registerWithDoor({ fetch: joomlaDoor(calls) })
  // A mistyped index of a right block, sent beside an aspect: the slot wins (not BAD_PARAMS), and the
  // refusal lists the pictures of that block — the contract holds one, `module-441.8`, named by its block.
  const near = await runSite(
    tools,
    { action: 'media.draw', params: { prompt: 'a lake', slot: 'module-441.9', aspect: '1:1' } },
    cwd
  )
  assert.equal(near.code, 'SLOT_NOT_FOUND')
  assert.equal(near.error, 'module-441.9 is not an image slot of this site.')
  assert.deepEqual(near.slots, ['module-441.8 Hero'])
  assert.match(near.next, /Call media\.draw again with one of slots/)
  // A key whose block is nowhere lists every picture of the site.
  const far = await runSite(
    tools,
    { action: 'media.draw', params: { prompt: 'a hill', slot: 'hero.img' } },
    cwd
  )
  assert.equal(far.code, 'SLOT_NOT_FOUND')
  assert.deepEqual(far.slots, ['module-441.8 Hero'])
  assert.equal(inspects(calls), 1, 'both answers came from one inspect')
})

test('media.draw with no slot on a bound WordPress site is answered with its image slots, read from the contract inspect', async () => {
  const { cwd } = siteOn({
    platform: 'wordpress',
    sealed: true,
    marker: { contract: 'tracy-business/wp7/1.2.0', platform: 'wordpress', coworkContractVersion: '0.14.1' }
  })
  const calls = []
  // What a bound WordPress site answers: the words as a map, and its picture slots named with the demo each replaces.
  const wpInspect = {
    ok: true,
    bound: true,
    contract: 'tracy-business/wp7/1.2.0',
    revision: 'rev-wp',
    entities: [
      { key: 'page-home', kind: 'page', id: 42 },
      { key: 'page-about', kind: 'page', id: 43 }
    ],
    slots: {
      'home.hero.heading': 'Building plants',
      'home.hero.img': 'wp-content/uploads/2026/09/banner.png',
      'about.team.img': 'wp-content/uploads/2026/09/crew.png'
    },
    imageSlots: {
      'home.hero.img': 'wp-content/uploads/2026/09/banner.png',
      'about.team.img': 'wp-content/uploads/2026/09/crew.png'
    },
    problems: []
  }
  const { tools } = registerWithDoor({
    fetch: doorFetch(
      (body) =>
        body.action === 'content.contract' && body.params.operation === 'inspect' ? wpInspect : { ok: true },
      calls
    )
  })
  const out = await runSite(tools, { action: 'media.draw', params: { prompt: 'a lake', aspect: '4:5' } }, cwd)
  assert.equal(out.code, 'SLOT_REQUIRED')
  assert.deepEqual(out.slots, ['home.hero.img: banner.png', 'about.team.img: crew.png'])
  assert.match(out.next, /Take the slot the picture replaces from slots and call media\.draw again with it/)
  assert.equal(inspects(calls), 1)
})

test('🔒 D8: a new customer message, or a site build, ends the snapshot', async () => {
  const { cwd } = siteOn({ platform: 'joomla', sealed: true })
  const calls = []
  const { tools, listeners } = registerWithDoor({ fetch: joomlaDoor(calls) })
  await runSite(tools, inspectCall, cwd)
  await preStep(listeners, { cwd, messages: [claimed('now the title')] })
  await runSite(tools, inspectCall, cwd)
  assert.equal(inspects(calls), 2, 'a new turn reads the site again')
  await runSite(tools, inspectCall, cwd)
  assert.equal(inspects(calls), 2, 'within that turn the snapshot serves')
  // A build writes the site outside the relay (the seeder, the language job).
  for (const fn of listeners.get('tools/result') ?? [])
    fn(
      {
        name: 'tracy_site_build_joomla',
        arguments: {},
        agent: { session: { id: 'session-x', header: { cwd } } }
      },
      {
        isError: false
      }
    )
  await runSite(tools, inspectCall, cwd)
  assert.equal(inspects(calls), 3, 'after a build the site is read again')
})

test('🔒 D8: opening a conversation on a built site stales nobody’s snapshot; a build that moves on does', async () => {
  // Review, 25/09: the site-state notice is sent on the first step of EVERY conversation on a built
  // site (nothing earlier to compare with), and each one invalidated every other conversation's
  // inspect snapshot and the served-locale memo, with nothing changed.
  const stages = (running) =>
    ['check', 'install', 'seed', 'copy'].map((name, at) => ({
      name,
      status: at < running ? 'done' : at === running ? 'running' : 'pending'
    }))
  const { cwd, siteKey } = siteOn({
    platform: 'joomla',
    sealed: true,
    job: { status: 'running', stages: stages(1) }
  })
  const calls = []
  const { tools, listeners } = registerWithDoor({ fetch: joomlaDoor(calls) })
  const [hook] = listeners.get('agent/pre-step') ?? []
  /** One step of conversation B, which claimed a customer message. */
  const stepB = (events) =>
    hook({ agent: stepAgent(cwd, events, 'session-b'), messages: [claimed('hello')] }, async () => ({
      kind: 'enter',
      messages: [claimed('hello')]
    }))
  await runSite(tools, inspectCall, cwd)
  const opened = await stepB([])
  const sentB = opened.messages.filter((m) => m.source.kind !== 'user')
  assert.ok(
    sentB.some((m) => m.source.producer === 'tracy-site-tools:site-state'),
    'B is told the build state'
  )
  await runSite(tools, inspectCall, cwd)
  assert.equal(inspects(calls), 1, 'conversation A keeps its snapshot: B opening changed nothing')
  // The build moves on: B's next step says so, and every snapshot of the site is stale.
  writeBuildJob(cwd, siteKey, { status: 'running', stages: stages(2) })
  await stepB(asEvents(sentB))
  await runSite(tools, inspectCall, cwd)
  assert.equal(inspects(calls), 2, 'after the build moved, A reads the site again')
})

test('🔒 D6′: a site build forgets the body lengths this conversation read — the next write reads first', async () => {
  const { cwd } = siteOn({ platform: 'wordpress', sealed: true })
  const calls = []
  const body = `<!-- wp:paragraph --><p>${'Home page words. '.repeat(1600)}</p><!-- /wp:paragraph -->`
  const { tools, listeners } = registerWithDoor({
    fetch: doorFetch(
      (b) =>
        b.action === 'content.get'
          ? { ok: true, item: { ID: 42, post_title: 'Home', post_content: body } }
          : { ok: true, kind: 'post', id: 42, created: false },
      calls
    )
  })
  await runSite(tools, { action: 'content.get', params: { kind: 'post', id: 42 } }, cwd)
  for (const fn of listeners.get('tools/result') ?? [])
    fn(
      {
        name: 'tracy_site_build_wordpress',
        arguments: {},
        agent: { session: { id: 'session-x', header: { cwd } } }
      },
      { isError: false }
    )
  const out = await runSite(
    tools,
    { action: 'content.update', params: { kind: 'post', id: 42, fields: { post_content: body } } },
    cwd
  )
  assert.equal(out.code, 'BODY_SHRINK')
  assert.equal(out.read, false, 'the build may have rewritten the page: read it again first')
  assert.equal(calls.length, 1, 'only the first read was relayed')
})

test('🔒 D6′: a WordPress body write shorter than 80 % of what this conversation read is refused, nothing sent', async () => {
  const { cwd } = siteOn({ platform: 'wordpress', sealed: true })
  const calls = []
  const body = `<!-- wp:paragraph --><p>${'Home page words. '.repeat(1600)}</p><!-- /wp:paragraph -->`
  const { tools } = registerWithDoor({
    fetch: doorFetch(
      (b) =>
        b.action === 'content.get'
          ? { ok: true, item: { ID: 42, post_title: 'Home', post_content: body } }
          : { ok: true, kind: 'post', id: 42, created: false },
      calls
    )
  })
  await runSite(tools, { action: 'content.get', params: { kind: 'post', id: 42 } }, cwd)
  const out = await runSite(
    tools,
    { action: 'content.update', params: { kind: 'post', id: 42, fields: { post_content: '<p>x</p>' } } },
    cwd
  )
  assert.equal(out.code, 'BODY_SHRINK')
  assert.equal(calls.length, 1, 'only the read was relayed')
})

// ── D6′ on Joomla and EmDash (09/10/2026): a whole field sent back from part of it is refused ──────────
// The WordPress truncation of 25/09 (26,847 → 252 chars) had no guard on the other two platforms: an
// article's introtext, a module's content and an EmDash rich-text field are each replaced whole.

/** An article body of `n` paragraphs, each ~110 characters: far over the 500 the guard judges from. */
const longIntro = (n = 30) =>
  Array.from(
    { length: n },
    (_, i) =>
      `<p>Paragraph ${i + 1}: we clean factories, warehouses and offices across the whole region, every week.</p>`
  ).join('\r\n')

/** An open Joomla site whose article 2 holds a long introtext; the door is the fake component. */
function joomlaBodySite(events) {
  const { cwd } = siteOn({ label: 'joomlabody01', platform: 'joomla', sealed: false })
  const jo = joomlaOpenComponent()
  const intro = longIntro()
  jo.db.article.get(2).introtext = intro
  const calls = []
  const { tools } = registerWithDoor(
    { fetch: doorFetch((body) => jo.door(body.action, body.params), calls) },
    { events: [customerSaid(events)] }
  )
  const updates = () => calls.filter((c) => c.body.action === 'content.update')
  const write = (introtext, more = {}) =>
    runSite(
      tools,
      {
        action: 'content.update',
        params: { kind: 'article', id: 2, fields: { introtext }, apply_id: 'fix-1', ...more }
      },
      cwd
    )
  const read = () => runSite(tools, { action: 'content.get', params: { kind: 'article', id: 2 } }, cwd)
  return { jo, intro, tools, cwd, calls, updates, write, read }
}

test('🔒 D6′ Joomla: an article introtext written whole without a read in this conversation is refused, nothing sent', async () => {
  const site = joomlaBodySite('Fix the typo in paragraph 3 of the About us article')
  const out = await site.write('<p>Paragraph 3: we clean factories.</p>')
  assert.equal(out.code, 'BODY_SHRINK', JSON.stringify(out).slice(0, 300))
  assert.equal(out.read, false)
  assert.equal(out.field, 'introtext')
  assert.match(out.next, /content\.get \{kind:"article", id:2\} first/)
  assert.equal(site.updates().length, 0, 'nothing was written')
  assert.equal(site.jo.db.article.get(2).introtext, site.intro)
})

test('🔒 D6′ Joomla: an introtext cut under 80 % of the read is refused; its next names the whole field and content.replace', async () => {
  const site = joomlaBodySite('Fix the typo in paragraph 3 of the About us article')
  await site.read()
  const out = await site.write('<p>Paragraph 3: we clean factories, warehouses and offices.</p>')
  assert.equal(out.code, 'BODY_SHRINK', JSON.stringify(out).slice(0, 300))
  assert.equal(out.read, true)
  assert.equal(out.chars_stored, site.intro.length)
  assert.match(out.next, /introtext is the whole field/)
  assert.match(out.next, /content\.replace/)
  assert.equal(site.updates().length, 0, 'nothing was written')
})

test('🔒 D6′ Joomla: a normal edit of a read introtext passes, and the record read back says it landed whole', async () => {
  const site = joomlaBodySite('Fix the typo in paragraph 3 of the About us article')
  await site.read()
  const fixed = site.intro.replace('Paragraph 3: we clean', 'Paragraph 3: We clean')
  const out = await site.write(fixed)
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(site.updates().length, 1)
  assert.equal(site.jo.db.article.get(2).introtext, fixed)
  assert.deepEqual(out.verified, {
    introtext: { chars_before: site.intro.length, chars_sent: fixed.length, chars_stored: fixed.length }
  })
})

test('🔒 D6′ Joomla: a cut the customer asked for — named in the next, then passed with removes quoting them', async () => {
  const site = joomlaBodySite('Remove every paragraph after the second one from the About us article')
  await site.read()
  const cut = site.intro.split('\r\n').slice(0, 2).join('\r\n')
  const refused = await site.write(cut)
  assert.equal(refused.code, 'BODY_SHRINK')
  assert.match(refused.next, /removes:"/, 'the road for a deliberate cut is named')
  const out = await site.write(cut, { removes: 'Remove every paragraph after the second one' })
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(site.jo.db.article.get(2).introtext, cut)
  const sent = site.updates().at(-1).body.params
  assert.equal(Object.hasOwn(sent, 'removes'), false, 'removes is Tracy’s, never relayed')
})

/** The page's ULID (`EMDASH_ULID` is declared further down). */
const BODY_ULID = '01M36TA83763RSVSN5R28DZ0AZ'

/** An EmDash page whose `body` is long Portable Text, behind the MCP door; `title` is short. */
function emdashBodySite(label, said) {
  const { root, cwd } = siteWorkspace(label)
  const block = (i, text) => ({
    _type: 'block',
    _key: `b${i}`,
    style: 'normal',
    children: [{ _type: 'span', _key: `s${i}`, text, marks: [] }]
  })
  const body = Array.from({ length: 30 }, (_, i) =>
    block(
      i,
      `Paragraph ${i + 1}: we clean factories, warehouses and offices across the whole region, every week.`
    )
  )
  const entry = {
    id: BODY_ULID,
    slug: 'about',
    locale: 'en',
    status: 'published',
    title: 'About',
    data: { title: 'About', body }
  }
  const calls = []
  const on = (name, args) => {
    if (name === 'content_get') return { item: structuredClone(entry), _rev: 'rev-1' }
    if (name === 'content_update') {
      entry.data = { ...entry.data, ...structuredClone(args.data) }
      return { item: structuredClone(entry), _rev: 'rev-2' }
    }
    return { ok: true }
  }
  const { tools } = registerWithDoor(emdashConfig(execFor(label, root)({ mcp: emdashDoor({ on }, calls) })), {
    events: [customerSaid(said)]
  })
  const updates = () => calls.filter((c) => c.name === 'content_update')
  const write = (data, more = {}) =>
    runEmdash(
      tools,
      {
        tool: 'content_update',
        arguments: { collection: 'pages', id: BODY_ULID, data, status: 'published' },
        ...more
      },
      cwd
    )
  const read = () =>
    runEmdash(tools, { tool: 'content_get', arguments: { collection: 'pages', id: 'about' } }, cwd)
  return { entry, body, block, tools, cwd, calls, updates, write, read }
}

test('🔒 D6′ EmDash: a rich-text field written whole without a read is refused, nothing sent; a short field is written as sent', async () => {
  const site = emdashBodySite('emd-body1', 'Fix the typo in paragraph 3 of the About page')
  const out = await site.write({ body: [site.block(0, 'Paragraph 3: we clean factories.')] })
  assert.equal(out.code, 'BODY_SHRINK', JSON.stringify(out).slice(0, 300))
  assert.equal(out.read, false)
  assert.equal(out.field, 'body')
  assert.match(
    out.next,
    /tracy_emdash content_get \{collection:"pages", id:"01M36TA83763RSVSN5R28DZ0AZ"\} first/
  )
  assert.equal(site.updates().length, 0, 'nothing was written')
  const title = await site.write({ title: 'About Acme' })
  assert.equal(title.ok, true, JSON.stringify(title).slice(0, 300))
  assert.equal(site.updates().length, 1)
})

test('🔒 D6′ EmDash: a rich-text field cut under 80 % of the read is refused, with the road in its next', async () => {
  const site = emdashBodySite('emd-body2', 'Fix the typo in paragraph 3 of the About page')
  await site.read()
  const out = await site.write({ body: [site.block(2, 'Paragraph 3: We clean factories.')] })
  assert.equal(out.code, 'BODY_SHRINK', JSON.stringify(out).slice(0, 300))
  assert.equal(out.read, true)
  assert.ok(out.chars_stored > 2_500)
  assert.match(out.next, /body is the whole field/)
  assert.match(out.next, /content\.replace/)
  assert.equal(site.updates().length, 0, 'nothing was written')
})

test('🔒 D6′ EmDash: a normal edit of a read rich-text field passes', async () => {
  const site = emdashBodySite('emd-body3', 'Fix the typo in paragraph 3 of the About page')
  await site.read()
  const body = structuredClone(site.body)
  body[2].children[0].text = body[2].children[0].text.replace('we clean', 'We clean')
  const out = await site.write({ body })
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(site.updates().length, 1)
  assert.equal(out.verified, undefined, 'stored whole: nothing to say')
})

test('🔒 D6′ EmDash: a cut the customer asked for — named in the next, then passed with removes quoting them', async () => {
  const site = emdashBodySite('emd-body4', 'Remove every paragraph after the second one from the About page')
  await site.read()
  const cut = structuredClone(site.body).slice(0, 2)
  const refused = await site.write({ body: cut })
  assert.equal(refused.code, 'BODY_SHRINK')
  assert.match(refused.next, /removes:"/, 'the road for a deliberate cut is named')
  const out = await site.write({ body: cut }, { removes: 'Remove every paragraph after the second one' })
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(site.updates().length, 1)
  assert.equal(Object.hasOwn(site.updates()[0].args, 'removes'), false, 'removes is Tracy’s, never sent')
  assert.equal(site.entry.data.body.length, 2)
})

test('🔒 T-A: the build’s state travels as its own notice after the context, and alone when it changes', async () => {
  const stages = (running) =>
    ['check', 'install', 'seed', 'copy'].map((name, at) => ({
      name,
      status: at < running ? 'done' : at === running ? 'running' : 'pending'
    }))
  const { cwd, siteKey } = siteOn({
    platform: 'wordpress',
    sealed: true,
    job: { status: 'running', stages: stages(1) }
  })
  const { listeners } = registerWithDoor({ fetch: doorFetch({ ok: true }) })
  const first = await preStep(listeners, { cwd, messages: [claimed('how is the build going?')] })
  // The day comes after the build's state (fix A of perf/round7): a notice of its own, sent once. The
  // plain-words rule (V4S-3) and the reply-language rule (bug 30/09) ride last on every step that claims
  // a person's message.
  assert.deepEqual(
    first.map((m) => m.source.producer),
    [
      'tracy-site-tools:site-context',
      'tracy-site-tools:site-state',
      'tracy-site-tools:today',
      'tracy-site-tools:plain-reply',
      'tracy-site-tools:reply-language'
    ]
  )
  // 🔒 Session format V4 (dsh 0.1.7) refuses `kind: 'plugin'` when the event is written
  // (`session-format-v3-to-v4` `src/codec.ts:51,68` → `src/message-sources.ts:9`): every notice
  // carries this plugin's own kind, with the `notice` form and its summary kept.
  for (const m of first) {
    assert.equal(m.source.kind, 'tracy-site')
    assert.equal(m.source.form, 'notice')
    assert.equal(typeof m.source.summary, 'string')
    assert.equal('plugin' in m.source, false)
  }
  assert.doesNotMatch(first[0].content[0].text, /Build:/)
  assert.match(first[1].content[0].text, /Build: running/)
  assert.ok(first[1].content[0].text.length <= 300)
  // The next stage: the rules block is byte-stable, so only the notice goes out again.
  writeBuildJob(cwd, siteKey, { status: 'running', stages: stages(2) })
  const second = await preStep(listeners, { cwd, events: asEvents(first), messages: [claimed('and now?')] })
  assert.deepEqual(
    second.map((m) => m.source.producer),
    ['tracy-site-tools:site-state', 'tracy-site-tools:plain-reply', 'tracy-site-tools:reply-language']
  )
  // Nothing moved: nothing about the site is sent — only the turn's own two rules.
  const third = await preStep(listeners, {
    cwd,
    events: asEvents([first[0], first[2], second[0]]),
    messages: [claimed('ok')]
  })
  assert.deepEqual(
    third.map((m) => m.source.producer),
    ['tracy-site-tools:plain-reply', 'tracy-site-tools:reply-language']
  )
})

/**
 * 🔒 FIX A OF perf/round7 — THE DAY, THROUGH THE HOST'S OWN PRE-STEP. "Post it dated 15 Sep" sent 5 of 12
 * add-a-post runs looking for today's date (`bash date`, or globs over `.webroot` logs that timed out at
 * 30 s). It rides after the customer's words as a notice of its own, goes out once per conversation, and
 * again only when the UTC day changed under one that spans midnight — and that change is NOT the build's:
 * it does not say the build again and drops nobody's read snapshot (which the build notice's change does).
 */
test('🔒 the day is said once per conversation, after the customer’s words, and alone when it changes — a new day stales nobody’s snapshot', async () => {
  let now = new Date('2026-09-30T12:00:00Z')
  const { cwd } = siteOn({
    platform: 'joomla',
    sealed: true,
    job: {
      status: 'running',
      stages: [
        { name: 'check', status: 'done' },
        { name: 'install', status: 'running' }
      ]
    }
  })
  const calls = []
  const { tools, listeners } = registerWithDoor({ fetch: joomlaDoor(calls), now: () => now })
  const [hook] = listeners.get('agent/pre-step') ?? []
  /** One step of one conversation that claimed a customer message; `events` is its session log so far. */
  const step = async (events, text) => {
    const message = claimed(text)
    const decision = await hook(
      { agent: stepAgent(cwd, events, 'session-day'), messages: [message] },
      async () => ({ kind: 'enter', messages: [message] })
    )
    return { message, decision }
  }
  // The plain-words and reply-language rules ride on every turn a person speaks; this test is about the day.
  const perTurn = new Set(['tracy-site-tools:plain-reply', 'tracy-site-tools:reply-language'])
  const producers = (decision) =>
    decision.messages.map((m) => m.source.producer ?? m.source.kind).filter((p) => !perTurn.has(p))
  await runSite(tools, inspectCall, cwd)
  assert.equal(inspects(calls), 1, 'a snapshot of the site exists')

  const first = await step([], 'change the phone')
  assert.deepEqual(producers(first.decision), [
    'tracy-site-tools:site-context',
    'user',
    'tracy-site-tools:site-state',
    'tracy-site-tools:today'
  ])
  const today = first.decision.messages.find((m) => m.source.producer === 'tracy-site-tools:today')
  assert.equal(
    today.content[0].text,
    '<system-reminder>\n- Today: Wednesday 2026-09-30 (UTC).\n</system-reminder>'
  )
  assert.equal(today.source.kind, 'tracy-site')
  assert.equal(today.source.form, 'notice')
  assert.equal(today.source.summary, 'today 2026-09-30')
  assert.equal('plugin' in today.source, false)
  assert.ok(
    first.decision.messages.indexOf(today) > first.decision.messages.indexOf(first.message),
    'after the customer’s words: the cached part in front of them does not move'
  )

  // The same day, the next message: the day is not said again.
  const sent = first.decision.messages.filter((m) => m !== first.message)
  const same = await step(asEvents(sent), 'and the address')
  assert.deepEqual(producers(same.decision), ['user'])

  // Midnight passes under the conversation: the next message says the new day, and only that.
  now = new Date('2026-10-01T00:00:05Z')
  const next = await step(asEvents(sent), 'and the hours')
  assert.deepEqual(producers(next.decision), ['user', 'tracy-site-tools:today'])
  assert.match(next.decision.messages[1].content[0].text, /Today: Thursday 2026-10-01 \(UTC\)\./)
  await runSite(tools, inspectCall, cwd)
  assert.equal(inspects(calls), 1, 'a new day is not the build moving: nobody’s snapshot was dropped')

  // A notice compacted out of sight is as good as never sent: the day is said again.
  const compacted = await step([], 'a fresh conversation')
  assert.ok(producers(compacted.decision).includes('tracy-site-tools:today'))
})

test('the day comes from the host’s own clock unless a test brings one, and a clock that answers nothing sends nothing', async () => {
  const { cwd } = siteOn({ platform: 'wordpress' })
  const said = async (config) => {
    const { listeners } = registerWithDoor({ fetch: doorFetch({ ok: true }), ...config })
    const [hook] = listeners.get('agent/pre-step') ?? []
    const message = claimed('hello')
    const decision = await hook(
      { agent: stepAgent(cwd, [], 'session-clock'), messages: [message] },
      async () => ({
        kind: 'enter',
        messages: [message]
      })
    )
    return decision.messages.filter((m) => m.source?.producer === 'tracy-site-tools:today')
  }
  const before = new Date().toISOString().slice(0, 10)
  const real = await said({ now: undefined })
  const after = new Date().toISOString().slice(0, 10)
  assert.equal(real.length, 1)
  const day = /Today: [A-Z][a-z]+day (\d{4}-\d\d-\d\d) \(UTC\)\./.exec(real[0].content[0].text)?.[1]
  assert.ok(day === before || day === after, `${String(day)} is the host clock's day (${before}, ${after})`)
  assert.deepEqual(await said({ now: () => new Date(Number.NaN) }), [])
})

// ── tracy_emdash through runEmdashTool (PLAN v2.1 IX1 step 5) ─────────────────────────────────────

const EMDASH_ULID = '01M36TA83763RSVSN5R28DZ0AZ'

/**
 * An EmDash site's MCP door as the exec transport: each JSON-RPC request (on stdin) is recorded and
 * answered by `on(name, args)` → the data EmDash would put in its text part. The served-locale read
 * (`content_list` of the published `site` rows) answers `served`.
 */
function emdashDoor({ served = ['en'], on = () => ({ ok: true }) } = {}, calls = []) {
  return async (input) => {
    const request = JSON.parse(String(input.stdin))
    const name = request.method === 'tools/list' ? '{list}' : request.params.name
    const args = request.params?.arguments ?? {}
    calls.push({ name, args })
    const data =
      name === 'content_list' && args.collection === 'site' && args.status === 'published'
        ? {
            items: served.map((locale, i) => ({
              id: `01M36TA5254KTX8AKZQMK4BZ${String(i).padStart(2, '0')}`,
              locale,
              status: 'published'
            }))
          }
        : on(name, args)
    // An entry the test does not script reads as "Hello": the door names it on the question (council 20/10/2026).
    const read =
      name === 'content_get' &&
      !(data && typeof data === 'object' && 'item' in data) &&
      data?.isError !== true
        ? { item: { id: args.id, slug: 'hello', data: { title: 'Hello' } } }
        : data
    // `{isError, text}`: EmDash refusing the call in its own words (an MCP tool result with isError).
    const result =
      read && read.isError === true
        ? { isError: true, content: [{ type: 'text', text: read.text }] }
        : { content: [{ type: 'text', text: JSON.stringify(read) }] }
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, result })
    return { code: 0, stdout: `TRACY_MCP 200\n${body}`, stderr: '', timedOut: false }
  }
}

/** Fire this plugin's `tools/result` listeners for one finished call of `name` in session-x. */
const toolResult = (listeners, name, cwd, isError = false) => {
  for (const fn of listeners.get('tools/result') ?? [])
    fn({ name, arguments: {}, agent: { session: { id: 'session-x', header: { cwd } } } }, { isError })
}

/**
 * The customer answering the question a refusal handed the agent, through the host's own listener.
 * Since D34.4 (28/09/2026) this is the ONE way through a `CONFIRM_FIRST`: an open answer — a bare
 * `ask_user_question` result, or a typed message — opens only a refusal that carries no question of
 * Tracy's, because a call whose question was never put to the customer was never answered by them.
 * @param {Map<string, Function[]>} listeners
 * @param {{ ask: { questions: Array<{ id: string, options: Array<{ label: string }> }> } }} refusal
 * @param {string} cwd
 * @param {number} [option] - which option was chosen; 0 is the go-ahead.
 */
const answerAsk = (listeners, refusal, cwd, option = 0) => {
  const [q] = refusal.ask.questions
  for (const fn of listeners.get('tools/result') ?? [])
    fn(
      {
        name: 'ask_user_question',
        arguments: refusal.ask,
        agent: { session: { id: 'session-x', header: { cwd } } }
      },
      { isError: false, value: { answers: [{ id: q.id, selected: [q.options[option].label] }] } }
    )
}

test('🔒 D34: an EmDash delete asks the customer first — no exec until an answer came back, then once', async () => {
  const { root, label, cwd } = siteWorkspace('emd-del')
  const calls = []
  const { tools, listeners } = registerWithDoor(
    emdashConfig(execFor(label, root)({ mcp: emdashDoor({}, calls) })),
    {}
  )
  const del = { tool: 'content_delete', arguments: { collection: 'posts', id: EMDASH_ULID } }
  const asked = await runEmdash(tools, del, cwd)
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.match(asked.next, /ask_user_question/)
  assert.equal(calls.filter((c) => c.name === 'content_delete').length, 0, 'nothing deleted')
  // The model's own confirm is not the customer's word.
  const again = await runEmdash(tools, { ...del, confirm: true }, cwd)
  assert.equal(again.code, 'CONFIRM_FIRST')
  // An `ask_user_question` carrying no question of Tracy's opens nothing (D34.4): the call's own
  // question is what the customer answers.
  toolResult(listeners, 'ask_user_question', cwd)
  assert.equal((await runEmdash(tools, { ...del, confirm: true }, cwd)).code, 'CONFIRM_FIRST')
  assert.equal(calls.filter((c) => c.name === 'content_delete').length, 0, 'still nothing deleted')
  answerAsk(listeners, again, cwd)
  const done = await runEmdash(tools, { ...del, confirm: true }, cwd)
  assert.equal(done.ok, true)
  assert.equal(calls.filter((c) => c.name === 'content_delete').length, 1)
  assert.equal(
    calls.find((c) => c.name === 'content_delete').args.confirm,
    undefined,
    'confirm is Tracy’s, never sent'
  )
  // Spent: the next delete asks again.
  assert.equal((await runEmdash(tools, { ...del, confirm: true }, cwd)).code, 'CONFIRM_FIRST')
})

test('🔒 D34: the customer choosing "keep it" on the question Tracy wrote leaves the delete refused; the go-ahead lets it through once', async () => {
  const { root, label, cwd } = siteWorkspace('emd-keep')
  const calls = []
  const { tools, listeners } = registerWithDoor(
    emdashConfig(execFor(label, root)({ mcp: emdashDoor({}, calls) })),
    {}
  )
  const del = { tool: 'content_delete', arguments: { collection: 'posts', id: EMDASH_ULID } }
  const asked = await runEmdash(tools, del, cwd)
  assert.equal(asked.code, 'CONFIRM_FIRST')
  const [q] = asked.ask.questions
  // The customer reads what will be removed, not the tool's name (`error` keeps that for the agent).
  assert.match(q.question, /^This removes posts "Hello"/)
  assert.doesNotMatch(q.question, /content_delete/)
  assert.match(asked.error, /^content_delete removes posts\//)
  // The agent asks in the customer's language, keeping the order.
  const args = { questions: [{ ...q, options: [{ label: 'Có, xoá' }, { label: 'Không, giữ lại' }] }] }
  const answer = (/** @type {string} */ label) => {
    for (const fn of listeners.get('tools/result') ?? [])
      fn(
        {
          name: 'ask_user_question',
          arguments: args,
          agent: { session: { id: 'session-x', header: { cwd } } }
        },
        { isError: false, value: { answers: [{ id: q.id, selected: [label] }] } }
      )
  }
  answer('Không, giữ lại')
  assert.equal((await runEmdash(tools, { ...del, confirm: true }, cwd)).code, 'CONFIRM_FIRST')
  assert.equal(calls.filter((c) => c.name === 'content_delete').length, 0, 'kept, as the customer chose')
  answer('Có, xoá')
  const done = await runEmdash(tools, { ...del, confirm: true }, cwd)
  assert.equal(done.ok, true)
  assert.equal(calls.filter((c) => c.name === 'content_delete').length, 1)
})

// 🔒 28/09/2026, through the host's own pre-step hook: an agent that asked in prose, answered with a
// typed "thôi, đừng xoá" ("never mind, don't delete"), used to have the delete opened by that very message.
test('🔒 D34: a typed "thôi, đừng xoá" keeps the delete refused; a typed go-ahead after it is refused again lets it through', async () => {
  const { root, label, cwd } = siteWorkspace('emd-typed-no')
  const calls = []
  const { tools, listeners } = registerWithDoor(
    emdashConfig(execFor(label, root)({ mcp: emdashDoor({}, calls) })),
    {}
  )
  const del = { tool: 'content_delete', arguments: { collection: 'posts', id: EMDASH_ULID } }
  assert.equal((await runEmdash(tools, del, cwd)).code, 'CONFIRM_FIRST')
  await preStep(listeners, { cwd, messages: [claimed('Thôi, đừng xoá bài đó nhé')] })
  assert.equal((await runEmdash(tools, { ...del, confirm: true }, cwd)).code, 'CONFIRM_FIRST')
  assert.equal(calls.filter((c) => c.name === 'content_delete').length, 0, 'kept, as the customer typed')
  // A typed go-ahead is an open answer, and since D34.4 an open answer opens nothing that carries a
  // question of Tracy's: the delete is asked again and the card is the way through.
  await preStep(listeners, { cwd, messages: [claimed('Ừ, xoá đi')] })
  const asked = await runEmdash(tools, { ...del, confirm: true }, cwd)
  assert.equal(asked.code, 'CONFIRM_FIRST')
  assert.equal(calls.filter((c) => c.name === 'content_delete').length, 0)
  answerAsk(listeners, asked, cwd)
  const done = await runEmdash(tools, { ...del, confirm: true }, cwd)
  assert.equal(done.ok, true)
  assert.equal(calls.filter((c) => c.name === 'content_delete').length, 1)
})

// 🔒 F2 (27/09/2026), through the host's own listener: one card asking about two deletes, Yes to the
// first and "keep it" to the second, used to let both through.
test('🔒 D34: one answer to two of Tracy’s questions — yes to one, keep the other — lets only the first delete through', async () => {
  const { root, label, cwd } = siteWorkspace('emd-two')
  const calls = []
  const { tools, listeners } = registerWithDoor(
    emdashConfig(execFor(label, root)({ mcp: emdashDoor({}, calls) })),
    {}
  )
  const other = '01M36TA83763RSVSN5R28DZ0BB'
  const delA = { tool: 'content_delete', arguments: { collection: 'posts', id: EMDASH_ULID } }
  const delB = { tool: 'content_delete', arguments: { collection: 'posts', id: other } }
  const [qa] = (await runEmdash(tools, delA, cwd)).ask.questions
  const [qb] = (await runEmdash(tools, delB, cwd)).ask.questions
  assert.notEqual(qa.id, qb.id)
  for (const fn of listeners.get('tools/result') ?? [])
    fn(
      {
        name: 'ask_user_question',
        arguments: { questions: [qa, qb] },
        agent: { session: { id: 'session-x', header: { cwd } } }
      },
      {
        isError: false,
        value: {
          answers: [
            { id: qa.id, selected: [qa.options[0].label] },
            { id: qb.id, selected: [qb.options[1].label] }
          ]
        }
      }
    )
  assert.equal((await runEmdash(tools, { ...delA, confirm: true }, cwd)).ok, true)
  assert.equal((await runEmdash(tools, { ...delB, confirm: true }, cwd)).code, 'CONFIRM_FIRST')
  assert.deepEqual(
    calls.filter((c) => c.name === 'content_delete').map((c) => c.args.id),
    [EMDASH_ULID],
    'the entry the customer kept is still there'
  )
})

test('🔒 E1.2: EmDash reads and the catalogue run in parallel; a write stays a barrier', () => {
  const { tools } = registerWithDoor(emdashConfig(async () => ({ code: 0, stdout: '' })))
  const safe = tools.get('tracy_emdash').isConcurrencySafe
  assert.equal(safe({ list: true }), true)
  assert.equal(safe({ tool: 'content_get', arguments: { collection: 'home', id: 'home' } }), true)
  assert.equal(safe({ tool: 'content_update', arguments: {} }), false)
  assert.equal(safe({ tool: 'content_delete', arguments: {} }), false)
})

test('🔒 D11: a site build drops the served-locale memo, so the next read asks the site again', async () => {
  const { root, label, cwd } = siteWorkspace('emd-loc')
  const calls = []
  const { tools, listeners } = registerWithDoor(
    emdashConfig(
      execFor(
        label,
        root
      )({
        mcp: emdashDoor({ on: () => ({ item: { id: EMDASH_ULID, locale: 'en', title: 'About' } }) }, calls)
      })
    )
  )
  const read = { tool: 'content_get', arguments: { collection: 'pages', id: 'about' } }
  const servedReads = () =>
    calls.filter((c) => c.name === 'content_list' && c.args.collection === 'site').length
  await runEmdash(tools, read, cwd)
  await runEmdash(tools, read, cwd)
  assert.equal(servedReads(), 1, 'the memo serves reads within its ten minutes')
  // A build can add a language: slug-only calls would land in the old locale on a stale memo.
  toolResult(listeners, 'tracy_site_build_emdash', cwd)
  const again = await runEmdash(tools, read, cwd)
  assert.equal(servedReads(), 2)
  assert.equal(again.ok, true)
})

test('tracy_site on an EmDash site answers EMDASH_SITE with the door that reaches it, never "{list: true} first"', async () => {
  const { cwd } = emdashPrivateRootWorkspace('emd-road', { artifact: true })
  const { tools } = registerWithDoor({ fetch: doorFetch({ ok: true }) })
  const out = await runSite(tools, { action: 'page.look', params: { path: 'nope' } }, cwd)
  assert.equal(out.code, 'BAD_PATH')
  const road = await runSite(tools, { action: 'content.update', params: { kind: 'post', id: 1 } }, cwd)
  // The EmDash surface carries only the page tools, so the call is refused before any relay.
  assert.equal(road.code, 'NOT_ON_THIS_PLATFORM')
  assert.match(road.next, /tracy_emdash/)
  assert.doesNotMatch(JSON.stringify(road), /list: ?true/)
})

// 25/09/2026: content.read is the one relayed action an EmDash site answers (#352 serves it
// through the site's own reader); it leaves through the relay like any read, never EMDASH_SITE.
test('🔒 content.read on an EmDash site reaches the relay, as the person who typed', async () => {
  const { cwd } = emdashPrivateRootWorkspace('emd-map', { artifact: true })
  const calls = []
  const { tools } = registerWithDoor({
    fetch: doorFetch({ schemaVersion: 'tracy-content/v1', contents: [], pagination: {} }, calls)
  })
  const out = await runSite(tools, { action: 'content.read', params: { type: 'page', limit: 1 } }, cwd)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.action, 'content.read')
  // V2-5: a listing carries the byte budget the Claude Cowork plugin pages by (`withReadBudget`, site-call.mjs).
  assert.deepEqual(calls[0].body.params, { type: 'page', limit: 1, maxBytes: 32_768 })
  assert.notEqual(out.code, 'EMDASH_SITE')
  assert.equal(out.schemaVersion, 'tracy-content/v1')
  // Every other relayed action still has no door there.
  const other = await runSite(tools, { action: 'content.update', params: {} }, cwd)
  assert.equal(calls.length, 1)
  assert.notEqual(other.ok, true)
})

// Comment → edit (27/09/2026, plan P5): content.locate is answered by the seat book through the same
// EmDash reader, so it leaves through the relay too — as itself, the params as the pick gave them.
test('🔒 content.locate on an EmDash site reaches the relay, never EMDASH_SITE', async () => {
  const { cwd } = emdashPrivateRootWorkspace('emd-locate', { artifact: true })
  const calls = []
  const located = {
    status: 'resolved',
    levels: [],
    sources: { value: 'exact', mark: 'none' },
    impact: { pages: 1 }
  }
  const { tools } = registerWithDoor({ fetch: doorFetch(located, calls) })
  const params = { url: 'https://emd.test/', text: 'Hotline: 8 800 550-67-89' }
  const out = await runSite(tools, { action: 'content.locate', params }, cwd)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.action, 'content.locate')
  assert.deepEqual(calls[0].body.params, params)
  assert.notEqual(out.code, 'EMDASH_SITE')
  assert.equal(out.status, 'resolved')
})

test('D11: a content_list with no locale reaches the site with this site’s one language filled in', async () => {
  const { root, label, cwd } = siteWorkspace('emd-fill')
  const calls = []
  const { tools } = registerWithDoor(
    emdashConfig(execFor(label, root)({ mcp: emdashDoor({ on: () => ({ items: [] }) }, calls) }))
  )
  const out = await runEmdash(tools, { tool: 'content_list', arguments: { collection: 'home' } }, cwd)
  assert.equal(out.ok, true)
  const list = calls.find((c) => c.name === 'content_list' && c.args.collection === 'home')
  assert.equal(list.args.locale, 'en')
})

test('🔒 D11: on a site serving two languages and naming no default, content_publish by slug is refused before the tool runs', async () => {
  const { root, label, cwd } = siteWorkspace('emd-two')
  const calls = []
  const { tools } = registerWithDoor(
    emdashConfig(execFor(label, root)({ mcp: emdashDoor({ served: ['en', 'vi'] }, calls) }))
  )
  const out = await runEmdash(
    tools,
    { tool: 'content_publish', arguments: { collection: 'pages', id: 'about', _rev: 'x' } },
    cwd
  )
  // content_publish takes no locale, so a slug cannot say which language's entry is meant — and this
  // site has no `template/artifact.json` naming a default to resolve it in (localePlan, D11 amended).
  assert.equal(out.code, 'EMDASH_ULID_REQUIRED')
  assert.equal(calls.filter((c) => c.name === 'content_publish').length, 0)
  assert.match(out.next, /\S/)
})

test('a refused EmDash write carries EmDash’s own code and the next that repairs it (CONFLICT → a fresh _rev)', async () => {
  const { root, label, cwd } = siteWorkspace('emd-conflict')
  const calls = []
  const item = {
    id: EMDASH_ULID,
    slug: 'home',
    locale: 'en',
    status: 'published',
    version: 3,
    updatedAt: '2026-09-24T04:36:45.040Z',
    liveRevisionId: 'r1',
    draftRevisionId: 'r1',
    data: { title: 'Home' }
  }
  const rev = 'MzoyMDI2LTA5LTI0VDA0OjM2OjQ1LjA0MFo='
  const { tools } = registerWithDoor(
    emdashConfig(
      execFor(
        label,
        root
      )({
        mcp: emdashDoor(
          {
            on: (name) =>
              name === 'content_get'
                ? { item, _rev: rev }
                : { isError: true, text: '[CONFLICT] The entry changed since you read it' }
          },
          calls
        )
      })
    )
  )
  const out = await runEmdash(
    tools,
    {
      tool: 'content_update',
      arguments: { collection: 'home', id: EMDASH_ULID, _rev: rev, data: { title: 'Hi' } }
    },
    cwd
  )
  assert.equal(out.code, 'TOOL_FAILED')
  assert.equal(out.emdash, 'CONFLICT')
  assert.match(out.next, /content_get/)
  assert.equal(calls.filter((c) => c.name === 'content_update').length, 1, 'a write is never sent twice')
})

// ── content.replace through the shipped handler (PR2 IX2, D21's sealed-site condition) ─────────────

const REPLACE_FIXTURES = new URL('./fixtures/replace/', import.meta.url)
const replaceFixture = (name) => readFileSync(new URL(name, REPLACE_FIXTURES), 'utf8')

/**
 * A sealed Joomla 1.2.0 site (the benchjoomla01 shape) whose Apply door answers the P9 inspect
 * fixture and records every call, and whose container answers every page GET with the P9 home page.
 * Every exec is recorded by kind, so a test can say which roads the replace job took.
 */
function sealedJoomlaReplace({
  applyAnswer = (body) => ({ ok: true, apply_id: body.params.apply_id }),
  config = {}
} = {}) {
  const { root, label, cwd } = siteOn({
    label: 'benchjoomla01',
    platform: 'joomla',
    sealed: true,
    marker: { contract: 'tracy-business/j6/1.2.0' }
  })
  const snap = JSON.parse(replaceFixture('joomla/inspect-1.2.0.json'))
  const home = replaceFixture('pages/joomla-home.html')
  const calls = []
  const execs = []
  const { tools } = registerWithDoor(
    {
      fetch: doorFetch(
        (body) =>
          body.action === 'content.contract' && (body.params.operation ?? 'inspect') === 'inspect'
            ? snap
            : applyAnswer(body),
        calls
      ),
      siteDomain: 'tracy.test',
      deploymentOrigin: 'http://tracy.test:51710',
      ...config,
      exec: execFor(
        label,
        root
      )({
        fetch: (input) => {
          execs.push('fetch')
          return fetchOk(input.argv, { body: home })
        },
        probe: () => assert.fail('the replace job runs no node probe'),
        browser: () => assert.fail('the replace job opens no browser'),
        mcp: () => assert.fail('a Joomla site has no MCP')
      })
    },
    { events: [customerSaid('The hotline is now 0909 123 456, please change it')] }
  )
  return { tools, cwd, label, calls, execs }
}

test('🔒 D21: content.replace on a sealed Joomla site — one inspect and one apply through the relay, pages read by curl only', async () => {
  const { tools, cwd, label, calls, execs } = sealedJoomlaReplace()
  const out = await runSite(
    tools,
    { action: 'content.replace', params: { find: '8 800 550-67-90', replace: '0909 123 456' } },
    cwd
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
  assert.deepEqual(
    calls.map((c) => c.body.params.operation),
    ['inspect', 'apply'],
    'the whole inspect once, then ONE apply'
  )
  assert.deepEqual(calls[0].body.params, { operation: 'inspect' }, 'the engine reads the WHOLE contract')
  assert.deepEqual(calls[1].body.params.changes, { 'module-4369.5': '0909 123 456' })
  assert.match(calls[1].body.params.apply_id, /^contract-/)
  // Every write leaves as this conversation's own site, and no other exec than the page GET ran.
  for (const c of calls) assert.equal(c.headers['x-tracy-workspace-label'], label)
  assert.ok(execs.length > 0 && execs.every((k) => k === 'fetch'))
  assert.equal(out.undo.action, 'apply.revert')
})

test('🔒 D21: a lease refusal that outlasts the wait comes back with its own code; the engine sends nothing of its own', async () => {
  // Acceptance v4 (S09): the relay waits the lease out, bounded (`lease-wait.mjs`) — the same apply,
  // the same ids, the door refused it before the component ran. Past the bound the code comes back.
  const waits = []
  const { tools, cwd, calls } = sealedJoomlaReplace({
    applyAnswer: () => ({ ok: false, code: 'SITE_BUSY', error: 'Another change is being applied.' }),
    config: { sleep: async (ms) => void waits.push(ms) }
  })
  const out = await runSite(
    tools,
    { action: 'content.replace', params: { find: '8 800 550-67-90', replace: '0909 123 456' } },
    cwd
  )
  assert.equal(out.ok, false)
  assert.equal(out.code, 'SITE_BUSY')
  const applies = calls.filter((c) => c.body.params.operation === 'apply')
  assert.equal(applies.length, waits.length + 1, 'one send per wait, and no send of the engine’s own')
  assert.ok(
    applies.every((c) => c.body.params.apply_id === applies[0].body.params.apply_id),
    'the same ids'
  )
})

test('acceptance v4 S09: a site held by a conversation that finishes — the write waits, then goes through', async () => {
  const waits = []
  let busy = 2
  const { tools, cwd, calls } = sealedJoomlaReplace({
    applyAnswer: (body) =>
      busy-- > 0
        ? { ok: false, httpStatus: 409, code: 'SITE_BUSY', holder: 'ceo@tracy.ai', freeInSeconds: 40 }
        : { ok: true, apply_id: body.params.apply_id },
    config: { sleep: async (ms) => void waits.push(ms) }
  })
  const out = await runSite(
    tools,
    { action: 'content.replace', params: { find: '8 800 550-67-90', replace: '0909 123 456' } },
    cwd
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
  assert.deepEqual(waits, [3_000, 5_000])
  assert.equal(calls.filter((c) => c.body.params.operation === 'apply').length, 3)
})

/**
 * V5S-1 (acceptance v5, 30/09, `e2e-v5/send.md` SEND-v5-new-9): the gate's signature lives 60 s
 * (`dsh-passwords` `exp: now + 60`, `apps/tracy-web/src/lib/actor.js` `exp >= now`). A clock the test
 * owns: every `sleep` of the lease wait moves it, the signer stamps the moment it signed, and the door
 * refuses a signature older than its lifetime exactly as `verifyActor` does — `401 NOT_SIGNED_IN`.
 */
function expiringDoor({ busyUntilMs = 0, refuse = () => false } = {}) {
  const clock = { ms: 0 }
  const sends = []
  const mint = (email) => `signed:${email}#${clock.ms}`
  const fetch = async (url, init = {}) => {
    if (!String(url).endsWith('/apply')) return new Response('', { status: 404 })
    const actor = String(init.headers['x-tracy-actor'])
    const signedAt = Number(actor.split('#')[1])
    sends.push({ at: clock.ms, actor })
    const json = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (clock.ms - signedAt > 60_000 || refuse(sends.length))
      return json(401, { ok: false, code: 'NOT_SIGNED_IN', error: 'Sign in first.' })
    if (clock.ms < busyUntilMs)
      return json(409, { ok: false, code: 'SITE_BUSY', holder: 'e2e3-send-a@example.test' })
    return json(200, { ok: true, kind: 'post', id: 42 })
  }
  const sleep = async (ms) => {
    clock.ms += ms
  }
  return { clock, sends, mint, fetch, sleep }
}

const updateTitle = {
  action: 'content.update',
  params: { kind: 'post', id: 42, fields: { post_title: 'x' } }
}

test('🔒 V5S-1: a lease wait longer than the signature lives still writes — every send is signed afresh', async () => {
  const { cwd } = siteWorkspace('v5s1a')
  const door = expiringDoor({ busyUntilMs: 70_000 })
  const { tools } = registerWithDoor(
    { fetch: door.fetch, sleep: door.sleep },
    { services: { tracyAssertion: { mint: door.mint } } }
  )
  const out = await runSite(tools, updateTitle, cwd)
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
  assert.ok(door.clock.ms >= 70_000, 'the wait outlasted one signature')
  // Never a signature reused beyond the one request it was signed for.
  for (const s of door.sends) assert.equal(s.actor, `signed:an@example.test#${s.at}`)
  assert.equal(new Set(door.sends.map((s) => s.actor)).size, door.sends.length)
})

test('🔒 V5S-1: a signature refused once is signed again and sent once more before anything is reported', async () => {
  const { cwd } = siteWorkspace('v5s1b')
  const door = expiringDoor({ refuse: (n) => n === 1 })
  const { tools } = registerWithDoor(
    { fetch: door.fetch, sleep: door.sleep },
    { services: { tracyAssertion: { mint: door.mint } } }
  )
  const out = await runSite(tools, updateTitle, cwd)
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
  assert.equal(door.sends.length, 2)
})

test('🔒 V5S-1: a key Tracy really does not accept still gets the pairing words — after one fresh retry, no more', async () => {
  const { cwd } = siteWorkspace('v5s1c')
  const door = expiringDoor({ refuse: () => true })
  const { tools } = registerWithDoor(
    { fetch: door.fetch, sleep: door.sleep },
    { services: { tracyAssertion: { mint: door.mint } } }
  )
  const out = await runSite(tools, updateTitle, cwd)
  assert.equal(out.ok, false)
  assert.equal(out.code, 'ACTOR_NOT_ACCEPTED')
  assert.match(String(out.next), /operator pairs this workspace/)
  assert.equal(door.sends.length, 2, 'one fresh retry, then the refusal is reported')
})

test('acceptance v4 S09: a turn that wrote gives the write lease back when it ends; a turn that did not, does not', async () => {
  const { label, cwd } = siteWorkspace('lease1')
  const calls = []
  const released = []
  const door = doorFetch({ ok: true, kind: 'post', id: 42 }, calls)
  const { tools, listeners } = registerWithDoor({
    fetch: async (url, init = {}) => {
      if (String(url).endsWith('/lease/release')) {
        released.push({ url: String(url), headers: init.headers })
        return new Response(JSON.stringify({ released: true }), { status: 200 })
      }
      return door(url, init)
    }
  })
  const status = (s) =>
    listeners
      .get('agent/status')
      .forEach((fn) => fn({ agent: { session: { id: 'session-x', header: { cwd } } }, status: s }))
  status('running')
  status('idle')
  assert.equal(released.length, 0, 'a turn that wrote nothing released a lease')
  status('running')
  const out = await runSite(
    tools,
    { action: 'content.update', params: { kind: 'post', id: 42, fields: { post_title: 'x' } } },
    cwd
  )
  assert.equal(calls.length > 0, true, JSON.stringify(out).slice(0, 300))
  status('idle')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(released.length, 1)
  assert.equal(released[0].url, 'http://door.test/api/sites/_conversation/lease/release')
  assert.equal(released[0].headers['x-tracy-session'], 'session-x')
  assert.equal(released[0].headers['x-tracy-workspace-label'], label)
  assert.equal(released[0].headers['x-tracy-actor'], 'signed:an@example.test')
  // Said once per turn that wrote.
  status('idle')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(released.length, 1)
})

/** A site that took one write in session-x, whose lease release answers `answers` in turn. */
function leaseRetrySite(answers, onSleep = async () => {}) {
  const { cwd } = siteWorkspace('lease2')
  const calls = []
  const released = []
  const sleeps = []
  const door = doorFetch({ ok: true, kind: 'post', id: 42 }, calls)
  const { tools, listeners } = registerWithDoor({
    fetch: async (url, init = {}) => {
      if (String(url).endsWith('/lease/release')) {
        const answer = answers[Math.min(released.length, answers.length - 1)]
        released.push(answer)
        if (answer === 'network') throw new TypeError('fetch failed')
        return new Response(JSON.stringify({ released: answer === 200 }), { status: answer })
      }
      return door(url, init)
    },
    sleep: async (ms) => {
      sleeps.push(ms)
      await onSleep(sleeps.length)
    }
  })
  const status = (s) =>
    listeners
      .get('agent/status')
      .forEach((fn) => fn({ agent: { session: { id: 'session-x', header: { cwd } } }, status: s }))
  const write = () =>
    runSite(
      tools,
      { action: 'content.update', params: { kind: 'post', id: 42, fields: { post_title: 'x' } } },
      cwd
    )
  return { status, write, released, sleeps }
}

test('a lease release that meets a restarting Tracy (5xx, network) is tried again, then stops on the answer', async () => {
  const site = leaseRetrySite([503, 'network', 200])
  site.status('running')
  await site.write()
  site.status('idle')
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(site.released, [503, 'network', 200])
  assert.deepEqual(site.sleeps, [1000, 3000])

  // a refusal says the same thing on every try: one try only
  const refused = leaseRetrySite([403])
  refused.status('running')
  await refused.write()
  refused.status('idle')
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(refused.released, [403])
})

test("🔒 a later lease release never frees the lease the same conversation's next turn has just taken", async () => {
  // the release door frees by session: once the next turn wrote again, the old turn's tries stop
  /** @type {ReturnType<typeof leaseRetrySite>} */
  let site
  site = leaseRetrySite([503], async (n) => {
    if (n === 1) {
      site.status('running')
      await site.write()
    }
  })
  site.status('running')
  await site.write()
  site.status('idle')
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(site.released, [503], 'no second try once the next turn holds the lease')
})

// ── review 19/10/2026: the lease wait, the customer's Stop, and who holds the lease ──────────────────

/** `tracy_site` as one conversation calls it, with the turn's abort signal dsh hands every tool call. */
const runSiteAs = (tools, args, cwd, { session = 'session-x', signal } = {}) =>
  tools
    .get('tracy_site')
    .execute(args, { agent: { session: { id: session, header: { cwd } } }, ...(signal ? { signal } : {}) })

/** A promise the test opens. */
function opening() {
  /** @type {() => void} */
  let open = () => {}
  const opened = new Promise((resolve) => {
    open = () => resolve(undefined)
  })
  return { opened, open }
}

/** `p`, or `fallback` when it has not settled after a short while. */
// The waiter's pause never ends on its own here, so a holder stuck behind it never settles: a long
// window only keeps a loaded machine (the suite in parallel) from reading slow as stuck.
const settledSoon = (p, fallback = 'still queued') =>
  Promise.race([p, new Promise((resolve) => setTimeout(() => resolve(fallback), 3000))])

/** The Apply door as `config.fetch`, answering by conversation: `answer(body, session, init)`. */
function sessionDoor(answer, door = []) {
  return async (url, init = {}) => {
    if (!String(url).endsWith('/apply')) return new Response('', { status: 404 })
    const body = JSON.parse(String(init.body))
    const session = init.headers['x-tracy-session']
    door.push(`${session} ${body.action}`)
    const out = await answer(body, session, init)
    return new Response(JSON.stringify(out), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

test('🔒 C1: on Joomla the conversation holding the lease writes while another waits for it — the waiter is out of the site flight', async () => {
  const { cwd } = siteOn({ label: 'leasej1', platform: 'joomla' })
  const door = []
  const paused = opening()
  const resume = opening()
  let busy = true
  const { tools } = registerWithDoor({
    fetch: sessionDoor(
      (body, session) =>
        session === 'session-b' && busy
          ? { ok: false, code: 'SITE_BUSY', holder: 'an@example.test', holderIsYou: true }
          : { ok: true, kind: 'article', id: body.params.id },
      door
    ),
    sleep: async () => {
      paused.open()
      await resume.opened
    }
  })
  const update = (id) => ({
    action: 'content.update',
    params: { kind: 'article', id, fields: { title: 'x' } }
  })
  // B's write (a Joomla content.update is ordered in the site's flight) meets A's lease and waits.
  const waiter = runSiteAs(tools, update(7), cwd, { session: 'session-b' })
  await paused.opened
  // A, holding the lease, writes again: it must not queue behind B's pause.
  const holder = runSiteAs(tools, update(8), cwd, { session: 'session-a' })
  const got = await settledSoon(holder)
  busy = false
  resume.open()
  assert.notEqual(got, 'still queued', "the holder's write waited for the waiter's pause")
  assert.equal(got.ok, true, JSON.stringify(got).slice(0, 300))
  const out = await waiter
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.deepEqual(door, ['session-b content.update', 'session-a content.update', 'session-b content.update'])
})

test('🔒 C2: Stop while the write waits for the lease — nothing more is sent, at once', async () => {
  const { cwd } = siteWorkspace('stop1')
  const door = []
  const stop = new AbortController()
  const { tools } = registerWithDoor({
    fetch: sessionDoor(() => ({ ok: false, code: 'SITE_BUSY', holder: 'ceo@tracy.ai' }), door),
    // The customer presses Stop during the first pause; a pause that is not cut runs on.
    sleep: async () => {
      stop.abort()
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  })
  const out = await runSiteAs(tools, updateTitle, cwd, { signal: stop.signal })
  assert.deepEqual(door, ['session-x content.update'], 'the refused send only')
  assert.equal(out.code, 'TURN_STOPPED')
})

test('🔒 C2: Stop while a write is on the wire — it runs to its answer, and no second send follows (a lost answer stays unknown)', async () => {
  // A WordPress update whose answer was lost is counted on its receipt and sent again (E2.2): not after Stop.
  const { cwd } = siteOn({ label: 'stop2', platform: 'wordpress' })
  const door = []
  const stop = new AbortController()
  /** @type {AbortSignal | undefined} */
  let wire
  const { tools } = registerWithDoor({
    fetch: sessionDoor((body, _session, init) => {
      if (body.action === 'apply.list') return { ok: true, steps: [] }
      // Stop lands while this write is being answered; the request itself is not cut by it.
      stop.abort()
      wire = init.signal
      return { ok: false, code: 'COMPONENT_UNREACHABLE', error: 'the site did not answer' }
    }, door)
  })
  const out = await runSiteAs(tools, updateTitle, cwd, { signal: stop.signal })
  assert.equal(wire?.aborted, false, "the write's own request never carries the turn's Stop")
  assert.deepEqual(door, ['session-x content.update'], 'no receipt read, no second send')
  assert.equal(out.code, 'OUTCOME_UNKNOWN', 'a write whose answer was lost may have landed')
})

test('🔒 C2: Stop during a replace across several records — the write on the wire lands, no later write or undo is sent', async () => {
  const { root, label, cwd } = siteOn({ label: 'stopwp1', platform: 'wordpress', sealed: true })
  const wp = wordpressComponent()
  const calls = []
  const stop = new AbortController()
  const { tools } = registerWithDoor(
    {
      fetch: doorFetch((body) => {
        if (body.action === 'content.update') stop.abort()
        return wp.door(body.action, body.params)
      }, calls),
      siteDomain: 'tracy.test',
      deploymentOrigin: 'http://tracy.test:51710',
      exec: execFor(
        label,
        root
      )({
        fetch: (input) => {
          const { path: page } = fetchAsked(input.argv)
          return page in WP_PAGES
            ? fetchOk(input.argv, { body: WP_PAGES[page] })
            : fetchOk(input.argv, { status: 404 })
        },
        probe: () => assert.fail('the replace job runs no node probe'),
        browser: () => assert.fail('the replace job opens no browser'),
        mcp: () => assert.fail('a WordPress site has no MCP')
      })
    },
    { events: [customerSaid('The hotline is now 0909 123 456, change it everywhere')] }
  )
  await runSiteAs(
    tools,
    { action: 'content.replace', params: { find: '8 800 550-67-89', replace: '0909 123 456', all: true } },
    cwd,
    { signal: stop.signal }
  )
  const first = calls.findIndex((c) => c.body.action === 'content.update')
  assert.ok(first >= 0, 'the first write was sent')
  assert.deepEqual(
    calls.slice(first + 1).map((c) => c.body.action),
    [],
    'nothing after the write that was on the wire'
  )
})

test('🔒 C2: a tracy_emdash call after Stop runs nothing in the site container', async () => {
  const { root, label, cwd } = siteWorkspace('stopem1')
  let execs = 0
  const tools = register(
    emdashConfig(
      execFor(
        label,
        root
      )({
        mcp: () => {
          execs += 1
          return { stdout: 'TRACY_MCP 200\n{"jsonrpc":"2.0","id":1,"result":{"content":[]}}' }
        }
      })
    )
  )
  const stop = new AbortController()
  stop.abort()
  const out = await tools
    .get('tracy_emdash')
    .execute(
      { tool: 'content_update', arguments: { collection: 'posts', id: '1', data: { title: 'x' } } },
      { agent: { session: { id: 'session-x', header: { cwd } } }, signal: stop.signal }
    )
  assert.equal(execs, 0)
  assert.equal(out.code, 'TURN_STOPPED')
})

/** A site whose door takes every call; `turn(s)` sends a status, `released` counts the lease releases. */
function releaseSite(label) {
  const { cwd } = siteWorkspace(label)
  const released = []
  const door = doorFetch({ ok: true, id: 9, url: '/media/x.png' })
  const { tools, listeners } = registerWithDoor({
    fetch: async (url, init = {}) => {
      if (String(url).endsWith('/lease/release')) {
        released.push(init.headers['x-tracy-session'])
        return new Response(JSON.stringify({ released: true }), { status: 200 })
      }
      return door(url, init)
    }
  })
  const turn = (s) =>
    listeners
      .get('agent/status')
      .forEach((fn) => fn({ agent: { session: { id: 'session-x', header: { cwd } } }, status: s }))
  return { tools, cwd, released, turn }
}

test('🔒 C3: a turn whose only write was a media upload gives the write lease back when it ends', async () => {
  const site = releaseSite('lease3')
  site.turn('running')
  await runSite(
    site.tools,
    {
      action: 'media.upload',
      params: { path: 'logo.png', content_b64: Buffer.from('\x89PNG').toString('base64') }
    },
    site.cwd
  )
  site.turn('idle')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(site.released, ['session-x'], 'the door counts an upload as a write and took the lease')
})

test('🔒 C3: a media delete preview takes no lease, so the turn that only previewed releases none', async () => {
  const site = releaseSite('lease4')
  site.turn('running')
  await runSite(site.tools, { action: 'media.delete', params: { id: 9, dry_run: true } }, site.cwd)
  site.turn('idle')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(site.released, [])
})

test("🔒 C6: a lease release asks whether the lease is still this turn's before its FIRST send too", async () => {
  let sent = 0
  await releaseSiteLease(
    {
      fetch: async () => {
        sent += 1
        return new Response('{}', { status: 200 })
      }
    },
    { as: 'viewer', cookie: 'c', origin: 'http://door.test' },
    '_conversation',
    'lease6',
    'session-x',
    () => {},
    () => false
  )
  assert.equal(sent, 0, 'the next turn already holds the lease: nothing may free it')
})

test('content.replace: aliases are mapped and said; a dryRun writes nothing', async () => {
  const { tools, cwd, calls } = sealedJoomlaReplace()
  const out = await runSite(
    tools,
    { action: 'content.replace', params: { from: '8 800 550-67-90', to: '0909 123 456', dry_run: true } },
    cwd
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
  // `dry_run` is read as `dryRun` where every reader reads the call (`canonicalCall`); the two
  // aliases only the replace job knows are said.
  assert.ok(
    out.normalized.includes('from → find') && out.normalized.includes('to → replace'),
    String(out.normalized)
  )
  assert.equal(calls.filter((c) => c.body.params.operation === 'apply').length, 0)
})

test('🔒 S5: content.replace phase timings reach tool/result.meta and never the text the model reads', async () => {
  const { tools, cwd } = sealedJoomlaReplace()
  const out = await runSite(
    tools,
    { action: 'content.replace', params: { find: '8 800 550-67-90', replace: '0909 123 456', dryRun: true } },
    cwd
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
  const site = tools.get('tracy_site')
  const [shown, ...more] = site.output.render({}, out)
  assert.equal(more.length, 0)
  const { _timing: timing, ...without } = out
  assert.equal(
    shown.text,
    JSON.stringify(without),
    'the model reads the answer as it was before S5, byte for byte'
  )
  assert.deepEqual(Object.keys(site.output.presentationMeta({}, out).replace.phases).sort(), [
    'fetch',
    'index',
    'locate',
    'snapshot',
    'verify',
    'write'
  ])
  assert.equal(timing.platform, 'joomla-contract')
  // Every other answer projects null: nothing to draw, and nothing new in the model's text.
  assert.equal(site.output.presentationMeta({}, { ok: false, code: 'BAD_PATH' }), null)
})

// PR2 review (25/09): the replace through the SHIPPED handler on the two other engines, as sealed Joomla is.
test('content.replace on a sealed WordPress site — through the relay: the bodies read, every write under one apply id, parts first', async () => {
  const { root, label, cwd } = siteOn({ label: 'benchwp01', platform: 'wordpress', sealed: true })
  const wp = wordpressComponent()
  const calls = []
  const { tools } = registerWithDoor(
    {
      fetch: doorFetch((body) => wp.door(body.action, body.params), calls),
      siteDomain: 'tracy.test',
      deploymentOrigin: 'http://tracy.test:51710',
      exec: execFor(
        label,
        root
      )({
        fetch: (input) => {
          const { path: page } = fetchAsked(input.argv)
          return page in WP_PAGES
            ? fetchOk(input.argv, { body: WP_PAGES[page] })
            : fetchOk(input.argv, { status: 404 })
        },
        probe: () => assert.fail('the replace job runs no node probe'),
        browser: () => assert.fail('the replace job opens no browser'),
        mcp: () => assert.fail('a WordPress site has no MCP')
      })
    },
    { events: [customerSaid('The hotline is now 0909 123 456, change it everywhere')] }
  )
  const out = await runSite(
    tools,
    { action: 'content.replace', params: { find: '8 800 550-67-89', replace: '0909 123 456', all: true } },
    cwd
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
  const writes = calls.filter((c) => c.body.action === 'content.update').map((c) => c.body.params)
  assert.ok(writes.length >= 2, 'the header, the footer and the pages that print it')
  assert.deepEqual(new Set(writes.map((w) => w.apply_id)).size, 1, 'one apply id for the whole change')
  assert.equal(writes[0].kind, 'templatePart', 'parts first')
  for (const c of calls) assert.equal(c.headers['x-tracy-workspace-label'], label)
  assert.equal(out.undo.action, 'apply.revert')
  assert.ok(SURFACE_ACTIONS['wordpress-sealed'].includes('content.replace'))
})

test('content.replace on an EmDash site — the REAL index and write scripts in the site container, every language, never the Apply door', async () => {
  const REPLACE = new URL('./fixtures/replace/', import.meta.url)
  const SITE = JSON.parse(readFileSync(new URL('emdash/site.json', REPLACE), 'utf8'))
  const HOME_ED = readFileSync(new URL('pages/emdash-home.html', REPLACE), 'utf8')
  const { root, label, cwd } = emdashWorkspace('benchemdash01')
  mkdirSync(path.join(root, label, 'template'), { recursive: true })
  writeFileSync(path.join(root, label, 'template', 'artifact.json'), JSON.stringify(SITE.artifact ?? {}))
  const em = createFakeEmdash(SITE)
  const scripts = []
  const doorCalls = []
  const tools = register({
    ...emdashConfig(
      execFor(
        label,
        root
      )({
        mcp: async (input) => {
          const script = input.argv[input.argv.indexOf('-e') + 1]
          const kind = script === undefined ? 'mcp' : /EMDASH_WRITE|"writes"/.test(script) ? 'write' : 'index'
          scripts.push(kind)
          const stdin = typeof input.stdin === 'string' ? JSON.parse(input.stdin) : input.stdin
          return {
            code: 0,
            stdout: await runScript(script, { fetch: em.fetch, stdin }),
            stderr: '',
            timedOut: false
          }
        },
        fetch: (input) => fetchOk(input.argv, { body: HOME_ED }),
        probe: () => assert.fail('the replace job runs no node probe'),
        browser: () => assert.fail('the replace job opens no browser')
      })
    ),
    fetch: doorFetch({ ok: true }, doorCalls),
    siteDomain: 'tracy.test',
    deploymentOrigin: 'http://tracy.test:51710'
  })
  const phone = String(
    SITE.rows.find((r) => r.collection === 'site' && r.locale === 'en')?.data?.hotline ?? ''
  )
  assert.ok(phone !== '', 'the fixture site prints a hotline')
  const out = await runSite(
    tools,
    { action: 'content.replace', params: { find: phone, replace: '0909 123 456' } },
    cwd
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
  assert.equal(doorCalls.length, 0, 'an EmDash replace never reaches the Apply door')
  assert.ok(scripts.length >= 2, `the index then the write ran in the container: ${scripts}`)
  const written = em.calls.filter((c) => c.name === 'content_update')
  assert.ok(written.length >= 1)
  assert.ok(out.changed.some((c) => (c.languages ?? 1) >= 1))
})

// 27/09: an open Joomla site (no contract) has its own records engine (`replace-joomla-open.mjs`) —
// its lists through the raw relay, every get and write through the guarded one, one apply id; the
// test it replaces held that such a site was refused by name while it had none.
test('content.replace on an open Joomla site — its records through the relay, one content.update per record under one apply id, and the undo puts them back', async () => {
  const { root, label, cwd } = siteOn({ label: 'openjoomla01', platform: 'joomla', sealed: false })
  const jo = joomlaOpenComponent()
  const calls = []
  const { tools, listeners } = registerWithDoor(
    {
      fetch: doorFetch((body) => jo.door(body.action, body.params), calls),
      siteDomain: 'tracy.test',
      deploymentOrigin: 'http://tracy.test:51710',
      exec: execFor(
        label,
        root
      )({
        fetch: async (input) => {
          const got = await jo.pageHtml(fetchAsked(input.argv).path)
          return fetchOk(input.argv, { status: got.status, body: got.html })
        },
        probe: () => assert.fail('the replace job runs no node probe'),
        browser: () => assert.fail('the replace job opens no browser'),
        mcp: () => assert.fail('a Joomla site has no MCP')
      })
    },
    { events: [customerSaid('The hotline is now 0911 555 033, change it everywhere')] }
  )
  assert.ok(SURFACE_ACTIONS.joomla.includes('content.replace'))
  const call = {
    action: 'content.replace',
    params: { find: '0909 123 456', replace: '0911 555 033', path: '/en/', all: true, expect: 6 }
  }
  // Six places at once are the customer's to allow (council 19/10/2026): counted, nothing written, asked.
  const asked = await runSite(tools, call, cwd)
  assert.equal(asked.code, 'CONFIRM_FIRST', JSON.stringify(asked).slice(0, 300))
  assert.equal(asked.count, 6)
  assert.equal(
    calls.filter((c) => c.body.action === 'content.update').length,
    0,
    'nothing written before the yes'
  )
  answerAsk(listeners, asked, cwd)
  const out = await runSite(tools, { ...call, params: { ...call.params, confirm: true } }, cwd)
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
  assert.equal(out.platform, 'joomla')
  assert.equal(calls.filter((c) => c.body.action === 'content.contract').length, 0, 'no contract here')
  const writes = calls.filter((c) => c.body.action === 'content.update').map((c) => c.body.params)
  assert.equal(writes.length, 6, 'both footers and the four articles, in both languages')
  assert.equal(new Set(writes.map((w) => w.apply_id)).size, 1, 'one apply id for the whole change')
  assert.match(writes[0].apply_id, /^replace-/)
  assert.deepEqual(
    writes.map((w) => `${w.kind}:${w.id}`),
    ['module:90', 'module:92', 'article:1', 'article:3', 'article:11', 'article:13'],
    'the code toolset first, then content, each record by its id'
  )
  // the lists arrived whole (the raw relay), each record was read again right before its write
  assert.ok(calls.some((c) => c.body.action === 'content.list' && c.body.params.include_body === true))
  for (const w of writes)
    assert.ok(
      calls.some(
        (c, k) =>
          c.body.action === 'content.get' &&
          c.body.params.kind === w.kind &&
          c.body.params.id === w.id &&
          calls[k + 1]?.body.action === 'content.update'
      ),
      `${w.kind} ${w.id} read right before its write`
    )
  for (const c of calls) assert.equal(c.headers['x-tracy-workspace-label'], label)
  assert.equal(jo.db.article.get(20).introtext.includes('0909 123 456'), true, 'the unpublished draft kept')
  assert.deepEqual(out.undo, { action: 'apply.revert', params: { apply_id: writes[0].apply_id } })
  // The receipt's undo, through the same door, puts every record back byte for byte.
  const back = await runSite(tools, { action: 'apply.revert', params: out.undo.params }, cwd)
  assert.equal(back.ok, true, JSON.stringify(back).slice(0, 300))
  for (const row of JOOMLA_OPEN_SITE.article)
    assert.equal(jo.db.article.get(Number(row.id)).introtext, row.introtext, `article ${row.id}`)
  for (const row of JOOMLA_OPEN_SITE.module)
    assert.equal(jo.db.module.get(Number(row.id)).content, row.content, `module ${row.id}`)
})

// 27/09: a WordPress site bound to its contract writes records like any site's (ADR 0022), so the
// replace job runs the WordPress engine there — the same relay, the same one apply id.
test('content.replace on a bound WordPress site — the WordPress engine through the relay, one apply id', async () => {
  const { root, label, cwd } = siteOn({
    label: 'benchwp01',
    platform: 'wordpress',
    sealed: true,
    marker: { contract: 'tracy-business/wp7/1.2.0', platform: 'wordpress', coworkContractVersion: '0.14.1' }
  })
  const wp = wordpressComponent()
  const calls = []
  const { tools } = registerWithDoor(
    {
      fetch: doorFetch((body) => wp.door(body.action, body.params), calls),
      siteDomain: 'tracy.test',
      deploymentOrigin: 'http://tracy.test:51710',
      exec: execFor(
        label,
        root
      )({
        fetch: (input) => {
          const { path: page } = fetchAsked(input.argv)
          return page in WP_PAGES
            ? fetchOk(input.argv, { body: WP_PAGES[page] })
            : fetchOk(input.argv, { status: 404 })
        },
        probe: () => assert.fail('the replace job runs no node probe'),
        browser: () => assert.fail('the replace job opens no browser'),
        mcp: () => assert.fail('a WordPress site has no MCP')
      })
    },
    { events: [customerSaid('The hotline is now 0909 123 456, change it everywhere')] }
  )
  const out = await runSite(
    tools,
    { action: 'content.replace', params: { find: '8 800 550-67-89', replace: '0909 123 456', all: true } },
    cwd
  )
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 400))
  assert.equal(
    calls.filter((c) => c.body.action === 'content.contract').length,
    0,
    'the records road, not the contract apply'
  )
  const writes = calls.filter((c) => c.body.action === 'content.update').map((c) => c.body.params)
  assert.ok(writes.length >= 2, 'the header, the footer and the pages that print it')
  assert.equal(new Set(writes.map((w) => w.apply_id)).size, 1, 'one apply id for the whole change')
  assert.equal(out.undo.action, 'apply.revert')
  assert.ok(SURFACE_ACTIONS['wordpress-contract'].includes('content.replace'))
})

// ── media.upload {file} (27/09/2026): the customer's picture is NAMED, and the host reads it ─────────
//
// The Files tab puts the customer's file in the site folder; `upload.mjs` reads it there, fenced, and
// the site's own door takes the bytes. Before it, every road wanted bytes the model typed: on EmDash
// the agent looped 24–40 steps on the local stand, and a WordPress or Joomla call without
// `content_b64` wrote a 0-byte file and answered ok (F5).

/** A PNG header that says 1200×800: all a door here needs to see. */
const PICTURE = (() => {
  const b = Buffer.alloc(40)
  b.writeUInt32BE(0x89504e47, 0)
  b.writeUInt32BE(0x0d0a1a0a, 4)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(1200, 16)
  b.writeUInt32BE(800, 20)
  return b
})()
const PICTURE_SHA = createHash('sha256').update(PICTURE).digest('hex')
const uploadDoor = (calls) =>
  doorFetch((body) => ({ ok: true, path: body.params.path, bytes: PICTURE.length, created: true }), calls)

test('🔒 media.upload {file} on WordPress: the host reads the picture and relays its bytes, digest and content-addressed name, as the person who typed', async () => {
  const { root, label, cwd } = siteOn({ label: 'wpup1', platform: 'wordpress' })
  writeFileSync(path.join(root, label, 'logo.png'), PICTURE)
  const calls = []
  const { tools } = registerWithDoor({ fetch: uploadDoor(calls) })
  const out = await runSite(tools, { action: 'media.upload', params: { file: 'logo.png', alt: 'Logo' } }, cwd)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.action, 'media.upload')
  assert.equal(calls[0].headers['x-tracy-actor'], 'signed:an@example.test')
  const { apply_id: receipt, ...params } = calls[0].body.params
  assert.deepEqual(params, {
    path: `wp-content/uploads/tracy-content/${PICTURE_SHA}.png`,
    content_b64: PICTURE.toString('base64'),
    sha256: PICTURE_SHA
  })
  // One receipt per UPLOAD, not per picture (28/09): the digest opens it, so it still says which bytes
  // went, but the same picture uploaded twice is two receipts — `apply.revert` on the second used to
  // remove the file the page was already using.
  assert.match(receipt, /^media-[a-f0-9]{12}-[a-z0-9]+$/)
  assert.ok(receipt.startsWith(`media-${PICTURE_SHA.slice(0, 12)}-`))
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.equal(out.path, `wp-content/uploads/tracy-content/${PICTURE_SHA}.png`)
  assert.deepEqual([out.width, out.height, out.file], [1200, 800, 'logo.png'])
  assert.match(out.next, /the content\.update of the record that shows it/)
})

test('🔒 media.upload {file} on a sealed Joomla site: the name the bound component accepts, and the slot road next', async () => {
  const { root, label, cwd } = siteOn({ label: 'jup1', platform: 'joomla', sealed: true })
  writeFileSync(path.join(root, label, 'shop.png'), PICTURE)
  const calls = []
  const { tools } = registerWithDoor({ fetch: uploadDoor(calls) })
  const out = await runSite(tools, { action: 'media.upload', params: { file: 'shop.png' } }, cwd)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].body.params.path, `images/tracy-content/${PICTURE_SHA}.png`)
  assert.doesNotMatch(calls[0].body.params.apply_id, /^contract-/)
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.match(
    out.next,
    /content\.contract \{operation:"apply", changes:\{"<image slot key>":"images\/tracy-content\//
  )
})

test('🔒 media.upload: a file outside the folder, and a call with no bytes (F5), are refused before any relay, each with its way on', async () => {
  const { root, label, cwd } = siteOn({ label: 'wpup2', platform: 'wordpress' })
  mkdirSync(path.join(root, 'other'), { recursive: true })
  writeFileSync(path.join(root, 'other', 'theirs.png'), PICTURE)
  const calls = []
  const { tools } = registerWithDoor({ fetch: uploadDoor(calls) })
  const out = await runSite(tools, { action: 'media.upload', params: { file: '../other/theirs.png' } }, cwd)
  assert.equal(out.code, 'FILE_OUTSIDE_SITE')
  assert.match(out.next, /Files tab/)
  // The old shape without its bytes: nothing reaches the component, which stored 0 bytes and said ok.
  const empty = await runSite(
    tools,
    { action: 'media.upload', params: { path: 'wp-content/uploads/logo.png', apply_id: 'm1' } },
    cwd
  )
  assert.equal(empty.code, 'UPLOAD_NEEDS_FILE')
  assert.match(empty.next, /media\.upload \{file:"<name>"\}/)
  assert.equal(calls.length, 0, 'nothing was relayed')
  assert.equal(existsSync(path.join(root, label, 'wp-content')), false)
})

test("🔒 media.upload {file} on EmDash: the site's own media_upload gets the bytes the host read; the answer names the id to write", async () => {
  const { root, label, cwd } = siteWorkspace('emd-up')
  writeFileSync(path.join(root, label, 'logo.png'), PICTURE)
  const calls = []
  const url = `/_emdash/api/media/file/${EMDASH_ULID}.png`
  const tools = register(
    emdashConfig(
      execFor(
        label,
        root
      )({
        mcp: emdashDoor(
          { on: (name) => (name === 'media_upload' ? { item: { id: EMDASH_ULID, url } } : { ok: true }) },
          calls
        )
      })
    )
  )
  const out = await runSite(
    tools,
    { action: 'media.upload', params: { file: 'logo.png', alt: 'Our logo' } },
    cwd
  )
  const uploads = calls.filter((c) => c.name === 'media_upload')
  assert.equal(uploads.length, 1)
  assert.deepEqual(uploads[0].args, {
    filename: 'logo.png',
    contentType: 'image/png',
    base64: PICTURE.toString('base64'),
    alt: 'Our logo'
  })
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.deepEqual([out.id, out.url, out.width, out.height], [EMDASH_ULID, url, 1200, 800])
  assert.match(out.next, /tracy_emdash content_update/)
  // No file named: refused before any exec, with the Files-tab road — never "the same call with contentType".
  const before = calls.length
  const none = await runSite(tools, { action: 'media.upload', params: { content_b64: 'iVBORw0KGgo=' } }, cwd)
  assert.equal(none.code, 'UPLOAD_NEEDS_FILE')
  assert.match(none.next, /Files tab/)
  assert.equal(calls.length, before)
})

// ── media.draw {replaces} on EmDash (30/09/2026): the door reads the stored size itself ─────────────
//
// v7: three EmDash picks drew at a shape the model guessed (16/10, 5/4, 4/3) for a picture that is 1000×880.
// The door reads the entry field through the same road `tracy_emdash` takes and measures it, before the
// picture model is asked for anything. Neutral fixture: a `gallery` entry whose `cover` holds 1000×880.

test('🔒 media.draw {replaces} on EmDash reads the entry field itself: one content_get, and the picture model is asked next', async (t) => {
  // No picture model on this host: the draw stops at NO_PICTURE_MODEL, which only a measured shape reaches.
  const previous = process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_API_KEY
  t.after(() => {
    if (previous !== undefined) process.env.OPENROUTER_API_KEY = previous
  })
  const { root, label, cwd } = siteWorkspace('emd-draw')
  const calls = []
  const tools = register(
    emdashConfig(
      execFor(
        label,
        root
      )({
        mcp: emdashDoor(
          {
            on: (name, args) =>
              name === 'content_get'
                ? {
                    item: {
                      id: args.id,
                      slug: 'a',
                      status: 'published',
                      data: {
                        cover: { id: EMDASH_ULID, provider: 'local', width: 1000, height: 880 },
                        bare: 'MEDIAGONEAAAAAAAAAAAAAAAAA'
                      }
                    }
                  }
                : name === 'media_get'
                  ? { isError: true, text: '[NOT_FOUND] Media not found' }
                  : { ok: true }
          },
          calls
        )
      })
    )
  )
  const at = (field) => ({ collection: 'gallery', id: '01ENTRYAAAAAAAAAAAAAAAAAAA', field })
  const measured = await runSite(
    tools,
    { action: 'media.draw', params: { prompt: 'a lake', replaces: at('cover') } },
    cwd
  )
  assert.equal(measured.code, 'NO_PICTURE_MODEL', JSON.stringify(measured).slice(0, 300))
  const reads = calls.filter((c) => c.name === 'content_get')
  assert.equal(reads.length, 1)
  assert.equal(reads[0].args.collection, 'gallery')
  assert.equal(reads[0].args.id, '01ENTRYAAAAAAAAAAAAAAAAAAA')
  assert.equal(
    calls.some((c) => c.name === 'media_get'),
    false,
    'the entry carried the size'
  )
  // A field that holds only an id which the library does not know: refused with the reason, before any model.
  const unknown = await runSite(
    tools,
    { action: 'media.draw', params: { prompt: 'a lake', replaces: at('bare') } },
    cwd
  )
  assert.equal(unknown.code, 'REPLACES_NO_PICTURE')
  assert.match(unknown.error, /is not in the library/)
  assert.match(unknown.next, /aspect:"<w>:<h>"/)
  assert.ok(
    calls.some((c) => c.name === 'media_get' && c.args.id === 'MEDIAGONEAAAAAAAAAAAAAAAAA'),
    'the id was looked up in the library'
  )
})

// ── media.upload {attachment} (29/09/2026): the picture the customer sent IN THE CHAT ───────────────
//
// dsh keeps it in its attachment store; the host picks it out of THIS session's own log and reads it
// back through the store, then the same doors as {file}. Bench v5 cause O: before it, 12 min / 28
// steps on WordPress and a 725 s timeout on EmDash of base64 typed by hand.

/** The customer's message carrying `bytes` as an image, as dsh's session log keeps it. */
const customerSent = (bytes, name, text = 'use this photo for the hero') => ({
  type: 'user/message',
  data: {
    source: { kind: 'user', prompter: { user: 'An', email: 'an@example.test' } },
    content: [
      { type: 'text', text },
      {
        type: 'image',
        attachment: {
          attachmentId: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
          mediaType: 'image/png',
          bytes: bytes.length,
          width: 1200,
          height: 800,
          name
        }
      }
    ]
  }
})
/** dsh's attachment store holding `held`, recording every read. */
const attachmentStore = (held, reads = []) => ({
  readImage: async (ref) => {
    reads.push(ref.attachmentId)
    const b = held.find((x) => `sha256:${createHash('sha256').update(x).digest('hex')}` === ref.attachmentId)
    if (b === undefined) throw Object.assign(new Error('missing'), { code: 'ATTACHMENT_NOT_FOUND' })
    return { ref, data: new Uint8Array(b) }
  }
})

test('🔒 media.upload {attachment} on WordPress: the chat picture is read back from the store and relayed like a Files-tab one', async () => {
  const { cwd } = siteOn({ label: 'wpatt1', platform: 'wordpress' })
  const calls = []
  const reads = []
  const { tools } = registerWithDoor(
    { fetch: uploadDoor(calls) },
    {
      events: [customerSent(PICTURE, 'hero-kaluga-dusk.png')],
      services: { attachments: attachmentStore([PICTURE], reads) }
    }
  )
  const out = await runSite(
    tools,
    { action: 'media.upload', params: { attachment: 'hero-kaluga-dusk.png' } },
    cwd
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers['x-tracy-actor'], 'signed:an@example.test')
  const { apply_id: receipt, ...params } = calls[0].body.params
  assert.deepEqual(params, {
    path: `wp-content/uploads/tracy-content/${PICTURE_SHA}.png`,
    content_b64: PICTURE.toString('base64'),
    sha256: PICTURE_SHA
  })
  assert.match(receipt, /^media-[a-f0-9]{12}-[a-z0-9]+$/)
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.deepEqual([out.attachment, out.width, out.height], ['hero-kaluga-dusk.png', 1200, 800])
  assert.match(out.next, /the content\.update of the record that shows it/)
  assert.deepEqual(reads, [`sha256:${PICTURE_SHA}`])
})

test('🔒 media.upload {attachment}: a picture this conversation does not hold is refused before any read or relay, with the list', async () => {
  const { cwd } = siteOn({ label: 'wpatt2', platform: 'wordpress' })
  const theirs = Buffer.concat([PICTURE, Buffer.from('another customer')])
  const theirsSha = createHash('sha256').update(theirs).digest('hex')
  const calls = []
  const reads = []
  const { tools } = registerWithDoor(
    { fetch: uploadDoor(calls) },
    {
      events: [customerSent(PICTURE, 'mine.png')],
      // The one store every site on the host shares holds another conversation's picture too.
      services: { attachments: attachmentStore([PICTURE, theirs], reads) }
    }
  )
  for (const attachment of [
    `sha256:${theirsSha}`,
    `/desk-home/attachments/v1/objects/${theirsSha.slice(0, 2)}/${theirsSha}`,
    '/desk-home/dsh-passwords.env'
  ]) {
    const out = await runSite(tools, { action: 'media.upload', params: { attachment } }, cwd)
    assert.equal(out.code, 'ATTACHMENT_NOT_FOUND', attachment)
    assert.deepEqual(out.attached, [
      { name: 'mine.png', id: `sha256:${PICTURE_SHA.slice(0, 12)}`, size: '1200x800' }
    ])
    assert.match(out.next, /media\.upload \{attachment:"<an id from attached>"\}/)
  }
  assert.deepEqual(reads, [], 'nothing was read')
  assert.equal(calls.length, 0, 'nothing was relayed')
})

test("🔒 media.upload {attachment} on EmDash: the site's own media_upload gets the chat picture's bytes; the answer names the id", async () => {
  const { root, label, cwd } = siteWorkspace('emd-att')
  const calls = []
  const url = `/_emdash/api/media/file/${EMDASH_ULID}.png`
  const { tools } = registerWithDoor(
    emdashConfig(
      execFor(
        label,
        root
      )({
        mcp: emdashDoor(
          { on: (name) => (name === 'media_upload' ? { item: { id: EMDASH_ULID, url } } : { ok: true }) },
          calls
        )
      })
    ),
    {
      events: [customerSent(PICTURE, 'hero-kaluga-dusk.png')],
      services: { attachments: attachmentStore([PICTURE]) }
    }
  )
  const out = await runSite(
    tools,
    {
      action: 'media.upload',
      params: { attachment: `sha256:${PICTURE_SHA.slice(0, 8)}`, alt: 'Kaluga at dusk' }
    },
    cwd
  )
  const uploads = calls.filter((c) => c.name === 'media_upload')
  assert.equal(uploads.length, 1)
  assert.deepEqual(uploads[0].args, {
    filename: 'hero-kaluga-dusk.png',
    contentType: 'image/png',
    base64: PICTURE.toString('base64'),
    alt: 'Kaluga at dusk'
  })
  assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
  assert.deepEqual([out.id, out.url, out.attachment], [EMDASH_ULID, url, 'hero-kaluga-dusk.png'])
  assert.match(out.next, /tracy_emdash content_update/)
  // No picture in this conversation: said, with both roads — never a guess at the store.
  const { tools: bare } = registerWithDoor(
    emdashConfig(execFor(label, root)({ mcp: emdashDoor({}, calls) })),
    {
      events: [customerSaid('use the photo I sent')],
      services: { attachments: attachmentStore([PICTURE]) }
    }
  )
  const before = calls.length
  const none = await runSite(bare, { action: 'media.upload', params: { attachment: 'hero.png' } }, cwd)
  assert.equal(none.code, 'NO_ATTACHMENT')
  assert.match(none.next, /attach it here/)
  assert.match(none.next, /Files tab/)
  assert.equal(calls.length, before)
})

/**
 * 🔒 THE PRE-STEP READS THE AGENT'S OWN TOOL LIST, ONCE (28/09/2026). The site context and the step
 * budget name a shell or a plan only where the agent has one (`toolReach`, site-context.mjs), read
 * from `ctx.tools.schemas(agent)` — the list dsh sends that agent, decided when it is made (CS1). Read
 * once per agent and kept, so every step of one conversation carries the same bytes.
 */
test('the pre-step names a shell or a plan only to an agent sent one, reading its tools once', async () => {
  const { cwd } = siteOn({ label: 'reachsite', platform: 'joomla' })
  mkdirSync(path.join(cwd, '.webroot'), { recursive: true })
  const writer = [
    'ask_user_question',
    'edit',
    'glob',
    'grep',
    'read',
    'read_image',
    'skill',
    'tracy_site',
    'web_fetch',
    'web_search',
    'write'
  ]
  const designer = [...writer, 'bash', 'exit_plan_mode', 'job_kill', 'job_list', 'job_output', 'todo_write']
  /** The plugin, with dsh's `schemas(scope)` answering `names` and counting its calls. */
  const withTools = (names) => {
    const listeners = new Map()
    const asked = { n: 0 }
    const ctx = {
      webServer: { register: () => () => {} },
      tools: {
        register: () => () => {},
        schemas: () => {
          asked.n += 1
          return names.map((name) => ({ name }))
        }
      },
      effect: (setup) => {
        setup()
      },
      on: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
      get: () => undefined
    }
    apply(ctx, { origin: 'http://door.test', fetch: doorFetch({ ok: true }) })
    return { hook: (listeners.get('agent/pre-step') ?? [])[0], asked }
  }
  const contextOf = async (hook, agent) => {
    const decision = await hook({ agent, messages: [claimed('hello')] }, async () => ({
      kind: 'enter',
      messages: [claimed('hello')]
    }))
    const notice = decision.messages.find((m) => m.source?.producer === 'tracy-site-tools:site-context')
    return String(notice?.content?.[0]?.text ?? '')
  }
  const w = withTools(writer)
  const agent = stepAgent(cwd, [], 'session-writer')
  const first = await contextOf(w.hook, agent)
  assert.match(first, /SEVERAL JOBS: write the plan FIRST, in your reply, one line per change/)
  assert.match(first, /one `content\.find \{text\}` per phrase you can see/)
  assert.doesNotMatch(first, /todo_write|grep -rn|cache:clean|\bbash\b/)
  const again = await contextOf(w.hook, agent)
  assert.equal(again, first, 'the same agent, the same bytes')
  assert.equal(w.asked.n, 1, 'the tool list is read once per agent')
  const d = withTools(designer)
  const shell = await contextOf(d.hook, stepAgent(cwd, [], 'session-designer'))
  assert.match(shell, /SEVERAL JOBS: call `todo_write` FIRST/)
  assert.match(shell, /`grep -rn` all the English words you can see/)
})

// ── H6: `comment` — the person's numbered Browser-tab comment, echoed, and named to the Apply door ─────────

/** The model-facing text of one answer, and its `tool/result.meta`, as dsh projects them. */
const projected = (tools, out) => {
  const site = tools.get('tracy_site')
  const blocks = site.output.render({}, out)
  return {
    blocks,
    text: blocks.map((b) => b.text ?? '').join('\n'),
    meta: site.output.presentationMeta({}, out)
  }
}

/**
 * Every Apply door body of the call carries the comment BESIDE `action` (29/09: the door writes
 * a comment answer for whoever commented, `apps/tracy-web/src/sites/comment-answer.js`), and never
 * inside `params`, where it would reach the site's component as a parameter it never had.
 */
const commentAtTheDoor = (calls, comment) => {
  for (const c of calls) {
    assert.deepEqual(c.body.comment, comment, JSON.stringify(c.body).slice(0, 200))
    assert.equal(Object.hasOwn(c.body.params ?? {}, 'comment'), false, JSON.stringify(c.body).slice(0, 200))
  }
}

test('🔒 H6: content.replace carries comment through the replace road — each Apply call names it beside action, the answer echoes it first', async () => {
  const { tools, cwd, calls } = sealedJoomlaReplace()
  const out = await runSite(
    tools,
    { action: 'content.replace', params: { find: '8 800 550-67-90', replace: '0909 123 456' }, comment: 2 },
    cwd
  )
  assert.ok(calls.length >= 2, 'the road still ran')
  commentAtTheDoor(calls, 2)
  const { blocks, meta } = projected(tools, out)
  assert.equal(blocks[0].text, 'comment: 2', 'the echo is the first thing the model reads')
  const answer = JSON.parse(blocks[1].text)
  assert.equal(answer.ok, true, blocks[1].text.slice(0, 300))
  assert.equal(Object.hasOwn(answer, 'comment'), false, 'the JSON answer is the one it always was')
  assert.equal(meta.comment, 2)
  assert.ok(meta.replace?.phases, 'the replace timings still reach meta beside it')
})

test('🔒 H6: content.update — the relay body names comment beside action, never in params; the result says comment: 1', async () => {
  const { cwd } = siteWorkspace('relaycomment')
  const calls = []
  const { tools } = registerWithDoor({ fetch: doorFetch({ ok: true, applyId: 'a-1' }, calls) })
  const out = await runSite(
    tools,
    { action: 'content.update', params: { kind: 'page', id: 42, fields: { title: 'Hello' } }, comment: 1 },
    cwd
  )
  assert.equal(calls.length, 1)
  commentAtTheDoor(calls, 1)
  assert.equal(calls[0].body.action, 'content.update')
  const { blocks, meta } = projected(tools, out)
  assert.equal(blocks[0].text, 'comment: 1')
  assert.equal(JSON.parse(blocks[1].text).ok, true)
  assert.deepEqual(meta, { comment: 1 })
})

test('🔒 H6 (F3): a comment sent as a digit string is that number — echoed and named to the door as that number, no refusal', async () => {
  // Round 7: a chat run sent `comment:"1"` and was refused BAD_COMMENT; the same write came back one step later.
  const { cwd } = siteWorkspace('stringcomment')
  const calls = []
  const { tools } = registerWithDoor({ fetch: doorFetch({ ok: true, applyId: 'a-3' }, calls) })
  const out = await runSite(
    tools,
    { action: 'content.update', params: { kind: 'page', id: 42, fields: { title: 'Hello' } }, comment: '1' },
    cwd
  )
  assert.equal(calls.length, 1, JSON.stringify(out).slice(0, 200))
  commentAtTheDoor(calls, 1)
  const { blocks, meta } = projected(tools, out)
  assert.equal(blocks[0].text, 'comment: 1')
  assert.deepEqual(meta, { comment: 1 })
  // A list of digit strings answers several comments, as a list of numbers does.
  const many = await runSite(
    tools,
    { action: 'content.get', params: { kind: 'page', id: 1 }, comment: ['2', '3'] },
    cwd
  )
  assert.equal(projected(tools, many).blocks[0].text, 'comment: 2, 3')
  commentAtTheDoor(calls.slice(-1), [2, 3])
})

test('🔒 H6: content.contract apply on a sealed Joomla site — comment rides beside the apply, never in its params', async () => {
  const { cwd } = siteOn({ platform: 'joomla', sealed: true })
  const calls = []
  const { tools } = registerWithDoor({ fetch: joomlaDoor(calls) })
  await runSite(tools, { ...inspectCall, comment: 3 }, cwd)
  const out = await runSite(
    tools,
    {
      action: 'content.contract',
      params: { operation: 'apply', expected_revision: 'rev-1', changes: { 'module-441.2': '0909 123 456' } },
      comment: 3
    },
    cwd
  )
  assert.ok(
    calls.some((c) => c.body.params.operation === 'apply'),
    JSON.stringify(out).slice(0, 300)
  )
  commentAtTheDoor(calls, 3)
  const { blocks, meta } = projected(tools, out)
  assert.equal(blocks[0].text, 'comment: 3')
  assert.equal(meta.comment, 3)
})

test('🔒 H6: apply.revert and a read (content.get) echo comment and relay it beside action', async () => {
  const { cwd } = siteWorkspace('revertcomment')
  const calls = []
  const { tools } = registerWithDoor({ fetch: doorFetch({ ok: true }, calls) })
  const reverted = await runSite(
    tools,
    { action: 'apply.revert', params: { apply_id: 'a-9' }, comment: 12 },
    cwd
  )
  const read = await runSite(
    tools,
    { action: 'content.get', params: { kind: 'page', id: 7 }, comment: 99 },
    cwd
  )
  assert.deepEqual(
    calls.map((c) => c.body.action),
    ['apply.revert', 'content.get']
  )
  commentAtTheDoor(calls.slice(0, 1), 12)
  commentAtTheDoor(calls.slice(1), 99)
  assert.equal(projected(tools, reverted).blocks[0].text, 'comment: 12')
  assert.equal(projected(tools, read).blocks[0].text, 'comment: 99')
  assert.equal(projected(tools, read).meta.comment, 99)
})

test('🔒 H6: a comment that is not a whole positive number (up to the stored integer) is a worded refusal before any door, never a throw', async () => {
  const { cwd } = siteWorkspace('badcomment')
  const calls = []
  const { tools } = registerWithDoor({ fetch: doorFetch({ ok: true }, calls) })
  for (const comment of [0, 2 ** 31, 2.5, 'three', '0', -1, true, {}]) {
    const out = await runSite(tools, { action: 'content.get', params: { kind: 'page', id: 7 }, comment }, cwd)
    assert.equal(out.ok, false, String(comment))
    assert.equal(out.code, 'BAD_COMMENT')
    assert.match(out.error, /comment/)
    assert.match(out.next, /\[1, 2\]/)
    assert.doesNotMatch(`${out.error} ${out.next}`, /99/, 'no cap at 99 in the words either')
    assert.equal(projected(tools, out).meta, null, 'a refused comment is not echoed')
  }
  assert.equal(calls.length, 0)
  // Absent (or null, JSON's nothing) is no comment at all: the answer is byte for byte the old one.
  for (const args of [
    { action: 'content.get', params: { kind: 'page', id: 7 } },
    { action: 'content.get', params: { kind: 'page', id: 7 }, comment: null }
  ]) {
    const out = await runSite(tools, args, cwd)
    const { blocks, meta } = projected(tools, out)
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].text, JSON.stringify(out))
    assert.equal(meta, null)
  }
})

test('H6: the tool schema names comment, global and per surface, in one sentence', () => {
  const { tools } = registerWithDoor({})
  const global = tools.get('tracy_site').parameters.properties.comment
  // V2-M1: one number, or a list of them for one write that answers several comments.
  const [one, many] = global.anyOf
  assert.deepEqual(one, { type: 'integer', minimum: 1, maximum: 2 ** 31 - 1 })
  assert.deepEqual(many, {
    type: 'array',
    items: { type: 'integer', minimum: 1, maximum: 2 ** 31 - 1 },
    minItems: 1,
    maxItems: 12,
    uniqueItems: true
  })
  assert.equal(global.description.split(/(?<=\.)\s/).length, 1)
  assert.ok(global.description.length <= 120, global.description)
  for (const surface of Object.keys(SURFACE_ACTIONS))
    assert.deepEqual(siteToolParameters(surface).properties.comment, global)
})

test('H6: a step that claims a message of several numbered comments carries the do-every-item rule after it; one comment its own rule (L8)', async () => {
  const { cwd } = siteWorkspace('commentrule')
  const { listeners } = registerWithDoor({})
  const block = (n) =>
    [
      '```tracy-element',
      `<mentioned-element n="${n}" selector="p">`,
      'text: x',
      '</mentioned-element>',
      '```'
    ].join('\n')
  const two = claimed([block(1), block(2), '1. Change one', '2. Change two'].join('\n'))
  const [hook] = listeners.get('agent/pre-step')
  const decision = await hook({ agent: stepAgent(cwd, []), messages: [two] }, async () => ({
    kind: 'enter',
    messages: [two]
  }))
  const at = decision.messages.findIndex((m) => m.source?.producer === 'tracy-site-tools:comment-items')
  assert.ok(at > decision.messages.indexOf(two), 'after the customer message (CS3)')
  assert.match(decision.messages[at].content[0].text, /2 numbered requests from the page/)
  const single = await preStep(listeners, {
    cwd,
    messages: [claimed([block(1), '1. Change one'].join('\n'))]
  })
  // L8 (stand E2E round 4): a lone comment gets the reply line too, never the list's rule.
  const rules = single.filter((m) => m.source?.producer === 'tracy-site-tools:comment-items')
  assert.equal(rules.length, 1)
  assert.match(rules[0].content[0].text, /^The person's message carries one request from the page\. /)
  assert.doesNotMatch(rules[0].content[0].text, /numbered requests? from the page\. Do every one/)
})

test("reply language (bug 30/09): a step that claims a person's message names the reply's language after it, last; a step claiming none says nothing", async () => {
  const { cwd } = siteWorkspace('replylang')
  const { listeners } = registerWithDoor({})
  const comment = [
    '4. just answer in one sentence: what is this section? change nothing',
    '```tracy-element',
    '<mentioned-element n="4" selector="h3" status="unchecked" lang="en">',
    'text: Промышленное строительство',
    '</mentioned-element>',
    '```'
  ].join('\n')
  const message = claimed(comment)
  const [hook] = listeners.get('agent/pre-step')
  const decision = await hook({ agent: stepAgent(cwd, []), messages: [message] }, async () => ({
    kind: 'enter',
    messages: [message]
  }))
  const at = decision.messages.findIndex((m) => m.source?.producer === 'tracy-site-tools:reply-language')
  assert.ok(at > decision.messages.indexOf(message), 'after the customer message (CS3)')
  assert.equal(at, decision.messages.length - 1, 'the last words the step carries')
  assert.match(
    decision.messages[at].content[0].text,
    /^Reply in English — the language of the person's latest message/
  )
  const typed = await preStep(listeners, {
    cwd,
    messages: [claimed('Đổi số điện thoại ở chân trang giúp mình')]
  })
  const rules = typed.filter((m) => m.source?.producer === 'tracy-site-tools:reply-language')
  assert.equal(rules.length, 1, 'a typed message too, once')
  assert.match(rules[0].content[0].text, /^Reply in Vietnamese — /)
  const dutch = await preStep(listeners, {
    cwd,
    messages: [claimed('Wat is de titel van mijn homepagina en hoeveel items staan er in het hoofdmenu?')]
  })
  const dutchRules = dutch.filter((m) => m.source?.producer === 'tracy-site-tools:reply-language')
  assert.equal(dutchRules.length, 1, 'a Dutch typed message too, once')
  assert.match(dutchRules[0].content[0].text, /^Reply in Dutch — the language of the person's latest message/)
  const none = await preStep(listeners, { cwd, messages: [] })
  assert.equal(none.filter((m) => m.source?.producer === 'tracy-site-tools:reply-language').length, 0)
})

test('V4S-3 (acceptance v4, 30/09): a typed turn carries the plain-words rule once; a comment turn carries it in its own rule', async () => {
  const { cwd } = siteWorkspace('plainreply')
  const { listeners } = registerWithDoor({})
  const typed = await preStep(listeners, {
    cwd,
    messages: [
      claimed(
        'On the home page, change the heading "Maintenance and upgrades" to "Maintenance and retrofit".'
      )
    ]
  })
  const plain = typed.filter((m) => m.source?.producer === 'tracy-site-tools:plain-reply')
  assert.equal(plain.length, 1)
  assert.match(plain[0].content[0].text, /not `apply\.revert`, not an `apply_id`/)
  const comment = [
    'make it shorter',
    '```tracy-element',
    '<mentioned-element n="81" selector="h3" status="resolved" lang="en">',
    'text: Maintenance and retrofit',
    '</mentioned-element>',
    '```'
  ].join('\n')
  const sent = await preStep(listeners, { cwd, messages: [claimed(comment)] })
  assert.equal(sent.filter((m) => m.source?.producer === 'tracy-site-tools:plain-reply').length, 0)
  const rule = sent.find((m) => m.source?.producer === 'tracy-site-tools:comment-items')
  assert.match(
    rule.content[0].text,
    /never a selector, id, mark, tool or action name, error code or receipt id/
  )
  assert.match(rule.content[0].text, /`comment: 81`/)
})

/** The model-facing text of one `tracy_emdash` answer, and its `tool/result.meta`. */
const projectedEmdash = (tools, out) => {
  const tool = tools.get('tracy_emdash')
  return { blocks: tool.output.render({}, out), meta: tool.output.presentationMeta?.({}, out) ?? null }
}

test('🔒 H6: tracy_emdash takes comment off before its shape repair — no EmDash tool sees it — and echoes it first', async () => {
  const { root, label, cwd } = siteWorkspace('emd-comment')
  const calls = []
  const { tools } = registerWithDoor(
    emdashConfig(
      execFor(label, root)({ mcp: emdashDoor({ on: () => ({ item: { id: 'e1', title: 'Hi' } }) }, calls) })
    )
  )
  const read = await runEmdash(
    tools,
    { tool: 'content_get', arguments: { collection: 'home', id: 'e1' }, comment: 4 },
    cwd
  )
  const write = await runEmdash(
    tools,
    {
      tool: 'content_update',
      arguments: { collection: 'home', id: 'e1', data: { title: 'Hello' } },
      comment: 5
    },
    cwd
  )
  assert.ok(calls.length > 0)
  for (const c of calls) assert.equal(Object.hasOwn(c.args ?? {}, 'comment'), false, JSON.stringify(c))
  for (const [out, n] of [
    [read, 4],
    [write, 5]
  ]) {
    const { blocks, meta } = projectedEmdash(tools, out)
    assert.equal(blocks[0].text, `comment: ${n}`)
    assert.equal(Object.hasOwn(JSON.parse(blocks[1].text), 'comment'), false)
    assert.deepEqual(meta, { comment: n })
  }
  // No comment: the answer renders as it always did, one block, no meta.
  const plain = await runEmdash(
    tools,
    { tool: 'content_get', arguments: { collection: 'home', id: 'e1' } },
    cwd
  )
  const { blocks, meta } = projectedEmdash(tools, plain)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].text, JSON.stringify(plain))
  assert.equal(meta, null)
})

test('🔒 H6: tracy_emdash refuses a bad comment in words before any exec; its schema names comment in one sentence', async () => {
  const { cwd } = siteWorkspace('emd-bad')
  const tools = register(emdashConfig(async () => assert.fail('no exec for a refused comment')))
  for (const comment of [0, 2 ** 31, 1.5, 'two', '0']) {
    const out = await runEmdash(tools, { tool: 'content_get', arguments: { id: 'e1' }, comment }, cwd)
    assert.equal(out.code, 'BAD_COMMENT')
    assert.match(out.next, /\[1, 2\]/)
  }
  const schema = tools.get('tracy_emdash').parameters.properties.comment
  assert.deepEqual(schema, tools.get('tracy_site').parameters.properties.comment)
})

test('🔒 V2-M1: one write answering several comments carries comment: [1, 2] — echoed as "comment: 1, 2", meta holds the list, the door gets the list beside action', async () => {
  const { cwd } = siteWorkspace('manycomment')
  const calls = []
  const { tools } = registerWithDoor({ fetch: doorFetch({ ok: true, applyId: 'a-2' }, calls) })
  const out = await runSite(
    tools,
    { action: 'content.update', params: { kind: 'page', id: 42, fields: { title: 'Hi' } }, comment: [1, 2] },
    cwd
  )
  assert.equal(calls.length, 1)
  commentAtTheDoor(calls, [1, 2])
  const { blocks, meta } = projected(tools, out)
  assert.equal(blocks[0].text, 'comment: 1, 2')
  assert.equal(JSON.parse(blocks[1].text).ok, true)
  assert.deepEqual(meta, { comment: [1, 2] })
  // A one-number list reads as that number.
  const single = await runSite(
    tools,
    { action: 'content.get', params: { kind: 'page', id: 1 }, comment: [7] },
    cwd
  )
  assert.equal(projected(tools, single).blocks[0].text, 'comment: 7')
  // Past 99 is a number like any other (stage 6: one sequence per site, no cap), in a list too.
  const late = await runSite(
    tools,
    { action: 'content.get', params: { kind: 'page', id: 1 }, comment: [150, 4000] },
    cwd
  )
  assert.equal(projected(tools, late).blocks[0].text, 'comment: 150, 4000')
  commentAtTheDoor(calls.slice(-1), [150, 4000])
  // Refused before any door: empty, repeated, too many (the 12-per-call cap stays), or any entry not
  // a whole positive number.
  const before = calls.length
  for (const comment of [
    [],
    [1, 1],
    Array.from({ length: 13 }, (_, i) => i + 1),
    [1, 0],
    [1, 'two'],
    [2.5]
  ]) {
    const bad = await runSite(tools, { action: 'content.get', params: { kind: 'page', id: 1 }, comment }, cwd)
    assert.equal(bad.code, 'BAD_COMMENT', JSON.stringify(comment))
    assert.match(bad.next, /\[1, 2\]/)
  }
  assert.equal(calls.length, before)
})

test('🔒 V2-M1: tracy_emdash takes comment: [3, 4] off before its shape repair and echoes both', async () => {
  const { root, label, cwd } = siteWorkspace('emd-many')
  const calls = []
  const { tools } = registerWithDoor(
    emdashConfig(execFor(label, root)({ mcp: emdashDoor({ on: () => ({ item: { id: 'e1' } }) }, calls) }))
  )
  const out = await runEmdash(
    tools,
    {
      tool: 'content_update',
      arguments: { collection: 'home', id: 'e1', data: { title: 'A' } },
      comment: [3, 4]
    },
    cwd
  )
  for (const c of calls) assert.equal(Object.hasOwn(c.args ?? {}, 'comment'), false, JSON.stringify(c))
  const { blocks, meta } = projectedEmdash(tools, out)
  assert.equal(blocks[0].text, 'comment: 3, 4')
  assert.deepEqual(meta, { comment: [3, 4] })
  const bad = await runEmdash(tools, { tool: 'content_get', arguments: { id: 'e1' }, comment: [3, 3] }, cwd)
  assert.equal(bad.code, 'BAD_COMMENT')
})

/** An entry EmDash answers a read and a write with, as the CONFLICT test above shapes it. */
const changedEntry = {
  id: EMDASH_ULID,
  slug: 'home',
  locale: 'en',
  status: 'published',
  version: 3,
  updatedAt: '2026-09-24T04:36:45.040Z',
  liveRevisionId: 'r1',
  draftRevisionId: 'r1',
  data: { title: 'Home' }
}
const changedRev = 'MzoyMDI2LTA5LTI0VDA0OjM2OjQ1LjA0MFo='
const changedWrite = {
  tool: 'content_update',
  arguments: { collection: 'home', id: EMDASH_ULID, _rev: changedRev, data: { title: 'Hi' } }
}
const changedDoor = () =>
  emdashDoor({
    on: (name) => (name === 'content_get' ? { item: changedEntry, _rev: changedRev } : { item: changedEntry })
  })

test('🔒 stage 6: a tracy_emdash write that landed is reported to POST /changed as the person who typed; a read or a refusal is not', async () => {
  const { root, label, cwd } = siteWorkspace('emd-changed')
  const posted = []
  const fetch = async (url, init = {}) => {
    if (!String(url).endsWith('/changed')) return new Response('', { status: 404 })
    posted.push({ url: String(url), headers: init.headers, body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify({ changedAt: '2026-09-29T12:00:00.000Z' }), { status: 200 })
  }
  const { tools } = registerWithDoor({ ...emdashConfig(execFor(label, root)({ mcp: changedDoor() })), fetch })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

  const read = await runEmdash(
    tools,
    { tool: 'content_get', arguments: { collection: 'home', id: EMDASH_ULID } },
    cwd
  )
  assert.equal(read.ok, true, JSON.stringify(read))
  await settle()
  assert.equal(posted.length, 0, 'a read changes nothing')

  const wrote = await runEmdash(tools, changedWrite, cwd)
  assert.equal(wrote.ok, true, JSON.stringify(wrote))
  await settle()
  assert.equal(posted.length, 1)
  assert.equal(posted[0].url, 'http://door.test/api/sites/_conversation/changed')
  assert.equal(posted[0].headers['x-tracy-actor'], 'signed:an@example.test')
  assert.equal(posted[0].headers['x-tracy-workspace-label'], label)
  assert.equal(posted[0].headers['x-tracy-session'], 'session-x')
  // The entry it named rides along, so its Site changes row says which one (QA-A10-em).
  assert.deepEqual(posted[0].body, {
    tool: 'content_update',
    via: 'emdash-mcp',
    // Dev e2e 04/10 (E3.2): the entry's title as the write answered it, for the row's words.
    target: { kind: 'home', id: EMDASH_ULID, title: 'Home' }
  })
  assert.equal(Object.hasOwn(wrote, 'changedAt'), false, 'the answer the model reads is untouched')
})

/**
 * C1 (04/10/2026): an EmDash delete is reported with the collection and the id of EVERY row it removed.
 * EmDash logs each removed row as a `delete` with no user, and tracy-web keeps such a row out of Site
 * changes only when a successful Tracy delete names that row's id (never by time). A slug the door
 * resolved names the ULID, and a row EmDash refused is not named.
 */
test('C1: a tracy_emdash delete reports every row it removed, by ULID; a row EmDash refused is not named', async () => {
  const ids = {
    en: '01M36TA83763RSVSN5R28DZ0E1',
    ru: '01M36TA83763RSVSN5R28DZ0E2',
    de: '01M36TA83763RSVSN5R28DZ0E3'
  }
  const rows = Object.entries(ids).map(([locale, id]) => ({ id, locale, slug: 'hello-world' }))
  const run = async (refuse) => {
    const { root, label, cwd } = siteWorkspace(`emd-c1-${refuse.length}`)
    const posted = []
    const fetch = async (url, init = {}) => {
      if (!String(url).endsWith('/changed')) return new Response('', { status: 404 })
      posted.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ changedAt: '2026-10-04T12:00:00.000Z' }), { status: 200 })
    }
    const door = emdashDoor({
      served: ['en', 'ru', 'de'],
      on: (name, args) =>
        name === 'content_translations'
          ? { translationGroup: ids.en, translations: rows }
          : name === 'content_get'
            ? { item: { ...rows.find((r) => r.locale === args.locale || r.id === args.id), data: {} } }
            : name === 'content_delete'
              ? refuse.includes(args.id)
                ? { isError: true, text: '[ENTRY_LOCKED] Ana has it open' }
                : { deleted: true, id: args.id }
              : { ok: true }
    })
    const { tools, listeners } = registerWithDoor({
      ...emdashConfig(execFor(label, root)({ mcp: door })),
      fetch
    })
    const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
    return { tools, listeners, cwd, posted, settle }
  }

  // The whole entry, named by one language's ULID: one call, three rows, one report naming all three.
  {
    const { tools, listeners, cwd, posted, settle } = await run([])
    const del = { tool: 'content_delete', arguments: { collection: 'posts', id: ids.ru } }
    answerAsk(listeners, await runEmdash(tools, del, cwd), cwd)
    const done = await runEmdash(tools, { ...del, confirm: true }, cwd)
    assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
    await settle()
    assert.equal(posted.length, 1)
    assert.deepEqual(posted[0], {
      tool: 'content_delete',
      via: 'emdash-mcp',
      target: { kind: 'posts', id: ids.ru, ids: [ids.ru, ids.en, ids.de] }
    })
    assert.equal(JSON.stringify(done).includes(ids.de), false, 'the ids ride to Tracy, not to the model')
  }
  // One language, named by its slug: the report names the row by the ULID the door resolved.
  {
    const { tools, listeners, cwd, posted, settle } = await run([])
    const one = {
      tool: 'content_delete',
      arguments: { collection: 'posts', id: 'hello-world', locale: 'de' }
    }
    answerAsk(listeners, await runEmdash(tools, one, cwd), cwd)
    const gone = await runEmdash(tools, { ...one, confirm: true }, cwd)
    assert.equal(gone.ok, true, JSON.stringify(gone).slice(0, 300))
    await settle()
    assert.deepEqual(posted, [
      { tool: 'content_delete', via: 'emdash-mcp', target: { kind: 'posts', id: ids.de, ids: [ids.de] } }
    ])
  }
  // A row EmDash refused stayed on the site: it is not named.
  {
    const { tools, listeners, cwd, posted, settle } = await run([ids.de])
    const del = { tool: 'content_delete', arguments: { collection: 'posts', id: ids.en } }
    answerAsk(listeners, await runEmdash(tools, del, cwd), cwd)
    const done = await runEmdash(tools, { ...del, confirm: true }, cwd)
    assert.deepEqual(done.removed, { languages: 2, of: 3 })
    await settle()
    assert.deepEqual(posted[0].target, { kind: 'posts', id: ids.en, ids: [ids.en, ids.ru] })
  }
})

/**
 * C1 media (04/10/2026): EmDash's audit-log logs every upload as `media:upload` with the item id and no
 * user, so Site changes showed Tracy's own uploads as Unknown. `media.upload` / `media.draw` on EmDash
 * upload through the site's own `media_upload` beside `tracy_emdash` and reported nothing to Tracy; now
 * they report it like a `tracy_emdash` write, naming the uploaded item. A `media_delete` names its id.
 */
test('C1 media: an EmDash upload by media.upload and a tracy_emdash media_delete are reported to Tracy with the media id', async () => {
  const capture = () => {
    const posted = []
    const fetch = async (url, init = {}) => {
      if (!String(url).endsWith('/changed')) return new Response('', { status: 404 })
      posted.push(JSON.parse(String(init.body)))
      return new Response(JSON.stringify({ changedAt: '2026-10-04T12:00:00.000Z' }), { status: 200 })
    }
    return { posted, fetch }
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))
  {
    const { root, label, cwd } = siteWorkspace('emd-c1-up')
    writeFileSync(path.join(root, label, 'logo.png'), PICTURE)
    const { posted, fetch } = capture()
    const url = `/_emdash/api/media/file/${EMDASH_ULID}.png`
    const door = emdashDoor({
      on: (name) => (name === 'media_upload' ? { item: { id: EMDASH_ULID, url } } : { ok: true })
    })
    const { tools } = registerWithDoor({ ...emdashConfig(execFor(label, root)({ mcp: door })), fetch })
    const out = await runSite(tools, { action: 'media.upload', params: { file: 'logo.png' } }, cwd)
    assert.equal(out.ok, true, JSON.stringify(out).slice(0, 300))
    await settle()
    assert.deepEqual(posted, [
      {
        tool: 'media_upload',
        via: 'emdash-mcp',
        target: { kind: 'media', id: EMDASH_ULID, title: 'logo.png' }
      }
    ])
  }
  {
    const { root, label, cwd } = siteWorkspace('emd-c1-mdel')
    const { posted, fetch } = capture()
    const door = emdashDoor({ on: (name) => (name === 'media_delete' ? { deleted: true } : { ok: true }) })
    const { tools, listeners } = registerWithDoor({
      ...emdashConfig(execFor(label, root)({ mcp: door })),
      fetch
    })
    const del = { tool: 'media_delete', arguments: { id: EMDASH_ULID } }
    answerAsk(listeners, await runEmdash(tools, del, cwd), cwd)
    const done = await runEmdash(tools, { ...del, confirm: true }, cwd)
    assert.equal(done.ok, true, JSON.stringify(done).slice(0, 300))
    await settle()
    assert.deepEqual(posted, [
      { tool: 'media_delete', via: 'emdash-mcp', target: { kind: 'media', id: EMDASH_ULID } }
    ])
  }
})

test('stage 6: a refused EmDash write is not reported, and Tracy failing to record a landed one never fails it', async () => {
  const { root, label, cwd } = siteWorkspace('emd-changed-down')
  let asked = 0
  const refusing = emdashDoor({
    on: (name) =>
      name === 'content_get'
        ? { item: changedEntry, _rev: changedRev }
        : { isError: true, text: '[CONFLICT] The entry changed since you read it' }
  })
  // The boot pairing probe dials Tracy too: only the report counts.
  const down = async (url, init = {}) => {
    if (String(url).endsWith('/apply')) {
      assert.deepEqual(JSON.parse(String(init.body)), {
        action: 'demo.research',
        params: { operation: 'guard' }
      })
      return new Response(JSON.stringify({ code: 'AGENT_DEMO_NOT_GRANTED' }), { status: 409 })
    }
    if (!String(url).endsWith('/changed')) return new Response('', { status: 404 })
    asked++
    throw new Error('connect ECONNREFUSED')
  }
  const refused = registerWithDoor({ ...emdashConfig(execFor(label, root)({ mcp: refusing })), fetch: down })
  const out = await runEmdash(refused.tools, changedWrite, cwd)
  assert.equal(out.code, 'TOOL_FAILED', JSON.stringify(out))
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(asked, 0, 'a refusal changed nothing, so nothing is reported')

  const landed = registerWithDoor({
    ...emdashConfig(execFor(label, root)({ mcp: changedDoor() })),
    fetch: down
  })
  const wrote = await runEmdash(landed.tools, changedWrite, cwd)
  assert.equal(wrote.ok, true, JSON.stringify(wrote))
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(asked, 1, 'reported once, and its failure stayed out of the answer')
})

// ── x-tracy-turn: the chat turn a call belongs to (plan tasks/todo-site-changes.md §6, Q2) ─────────

test("x-tracy-turn: a call carries the root agent's current turn — a subagent's call too, under its own session", async () => {
  const { cwd } = siteWorkspace('turn1')
  const calls = []
  const root = { session: { id: 'session-x' } }
  const sub = { session: { id: 'session-sub' } }
  const agents = {
    roots: () => [root],
    list: () => [root, sub],
    isOwnedBy: (id, owner) => id === 'session-sub' && owner === root
  }
  const { tools, listeners } = registerWithDoor(
    { fetch: doorFetch({ ok: true, items: [] }, calls) },
    { services: { agents } }
  )
  const [hook] = listeners.get('agent/pre-step') ?? []
  const step = (sessionId, turn) =>
    hook({ agent: stepAgent(cwd, [], sessionId), messages: [], turn, step: 1 }, async () => ({
      kind: 'enter',
      messages: []
    }))

  await runSite(tools, { action: 'content.list', params: { kind: 'page' } }, cwd)
  assert.equal(calls[0].headers['x-tracy-turn'], undefined, 'no step seen yet: no turn, the call still goes')

  await step('session-x', 7)
  await step('session-sub', 2) // the subagent's own numbering names nothing the person did
  await runSite(tools, { action: 'content.list', params: { kind: 'page' } }, cwd)
  await tools
    .get('tracy_site')
    .execute(
      { action: 'content.list', params: { kind: 'page' } },
      { agent: { session: { id: 'session-sub', header: { cwd } } } }
    )
  assert.deepEqual(
    calls.slice(1).map((c) => [c.headers['x-tracy-session'], c.headers['x-tracy-turn']]),
    [
      ['session-x', 'session-x:7'],
      ['session-sub', 'session-x:7']
    ]
  )
})

// 20/10/2026, staff on real customer sites: "when Tracy fixes one place it often breaks another place". Through
// the tool as the model calls it (`modelCall`): a whole body that changes two blocks is refused BODY_WIDE, and a
// template part every page shows asks the customer first — nothing written either way.
test('the model’s own WordPress write: two blocks re-typed is BODY_WIDE, a header part asks first; nothing written', async () => {
  const { cwd } = siteOn({ platform: 'wordpress', sealed: true })
  /** @type {any[]} */
  const calls = []
  const para = (/** @type {string} */ t) =>
    `<!-- wp:paragraph -->\n<p>${t} ${'words '.repeat(40)}</p>\n<!-- /wp:paragraph -->`
  const body = [para('One'), para('Two'), para('Three')].join('\n\n')
  const header = `<!-- wp:group -->\n<div class="wp-block-group">${para('Call 8 800')}</div>\n<!-- /wp:group -->`
  const { tools } = registerWithDoor({
    fetch: doorFetch(
      (b) =>
        b.action === 'content.get'
          ? b.params?.kind === 'templatePart'
            ? { ok: true, item: { id: 77, title: 'Header', content: header } }
            : { ok: true, item: { ID: 42, post_title: 'Home', post_content: body } }
          : { ok: true, kind: 'post', id: 42, created: false },
      calls
    )
  })
  await runSite(tools, { action: 'content.get', params: { kind: 'post', id: 42 } }, cwd)
  const wide = await runSite(
    tools,
    {
      action: 'content.update',
      params: {
        kind: 'post',
        id: 42,
        fields: { post_content: body.replace('One', 'Uno').replace('Three', 'Tres') }
      }
    },
    cwd
  )
  assert.equal(wide.code, 'BODY_WIDE', JSON.stringify(wide))
  await runSite(tools, { action: 'content.get', params: { kind: 'templatePart', key: 'header' } }, cwd)
  const part = await runSite(
    tools,
    {
      action: 'content.update',
      params: { kind: 'templatePart', key: 'header', fields: { content: header.replace('8 800', '0909') } }
    },
    cwd
  )
  assert.equal(part.code, 'CONFIRM_FIRST', JSON.stringify(part))
  assert.equal(part.consequence, 'shared')
  assert.equal(calls.filter((c) => c.action === 'content.update').length, 0, 'nothing written')
})

// ── review Q1 + Q2 (council 20/10/2026): EmDash writes take the write lease; a stopped turn's writes are told ──

/**
 * tracy-web as the host reaches it for these two fixes, in memory: the lease door (`/lease/acquire`,
 * `/lease/release`: one holder per site, by session), the stopped-writes ledger (`/turn/stopped`,
 * `/turn/stopped/take`: told once, a late `sent` never overwrites an outcome), the Apply door (`apply`),
 * and `/changed`. Shared by two hosts in a test, it is what survives a host restart.
 */
function fakeTracy({ apply = () => ({ ok: true }), onAcquire = () => {} } = {}) {
  const state = { holder: null, acquires: [], releases: [], reports: [], rows: new Map() }
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fetch = async (url, init = {}) => {
    const u = String(url)
    const session = init.headers?.['x-tracy-session']
    if (u.endsWith('/lease/acquire')) {
      state.acquires.push(session)
      await onAcquire(session)
      if (state.holder === null || state.holder === session) {
        state.holder = session
        return reply({ ok: true, fresh: true })
      }
      return reply(
        {
          code: 'SITE_BUSY',
          holder: 'an@example.test',
          holderIsYou: true,
          aheadOfYou: 0,
          error: 'Another of your own conversations is changing this site right now.',
          next: 'Tell the customer who is working on the site. Do not retry in a loop.'
        },
        409
      )
    }
    if (u.endsWith('/lease/release')) {
      state.releases.push(session)
      const released = state.holder === session
      if (released) state.holder = null
      return reply({ released })
    }
    if (u.endsWith('/turn/stopped')) {
      const body = JSON.parse(String(init.body))
      state.reports.push(body)
      for (const w of body.writes) {
        const key = `${body.turnId}|${w.id}`
        const prev = state.rows.get(key)
        state.rows.set(key, {
          ...w,
          turnId: body.turnId,
          outcome: w.outcome === 'sent' && prev ? prev.outcome : w.outcome,
          told: prev?.told ?? false
        })
      }
      return reply({ ok: true })
    }
    if (u.endsWith('/turn/stopped/take')) {
      const { turnId } = JSON.parse(String(init.body))
      const cut = turnId.lastIndexOf(':')
      const [root, n] = [turnId.slice(0, cut), Number(turnId.slice(cut + 1))]
      const writes = []
      for (const row of state.rows.values()) {
        const at = row.turnId.lastIndexOf(':')
        if (row.told || row.turnId.slice(0, at) !== root || Number(row.turnId.slice(at + 1)) >= n) continue
        row.told = true
        writes.push({ action: row.action, target: row.target, via: row.via, outcome: row.outcome })
      }
      return reply({ ok: true, writes })
    }
    if (u.endsWith('/apply')) {
      const body = JSON.parse(String(init.body))
      return reply(await apply(body, session))
    }
    if (u.endsWith('/changed')) return reply({ changedAt: null })
    return new Response('', { status: 404 })
  }
  return { state, fetch }
}

/** `tracy_emdash` as one conversation calls it, with the turn's signal. */
const runEmdashAs = (tools, args, cwd, { session = 'session-x', signal } = {}) =>
  tools
    .get('tracy_emdash')
    .execute(args, { agent: { session: { id: session, header: { cwd } } }, ...(signal ? { signal } : {}) })

/** An EmDash write naming its conversation by the title it writes (`A1`, `B1`). */
const emdashTitle = (title) => ({
  tool: 'content_update',
  arguments: { collection: 'home', id: EMDASH_ULID, _rev: changedRev, data: { title } }
})

/** The titles EmDash was asked to write, in order. */
const titlesWritten = (calls) =>
  calls.filter((c) => c.name === 'content_update').map((c) => c.args.data?.title)

const turnStatus = (listeners, session, cwd, status) =>
  listeners
    .get('agent/status')
    .forEach((fn) => fn({ agent: { session: { id: session, header: { cwd } } }, status }))

test('🔒 Q1: two conversations on one EmDash site — B waits for A, A writes on meanwhile, B writes once A’s turn ends', async () => {
  const { root, label, cwd } = siteWorkspace('emlease1')
  const tracy = fakeTracy()
  const calls = []
  const paused = opening()
  const resume = opening()
  const { tools, listeners } = registerWithDoor({
    ...emdashConfig(execFor(label, root)({ mcp: changedDoorRecording(calls) })),
    fetch: tracy.fetch,
    sleep: async () => {
      paused.open()
      await resume.opened
    }
  })
  turnStatus(listeners, 'session-a', cwd, 'running')
  turnStatus(listeners, 'session-b', cwd, 'running')
  const a1 = await runEmdashAs(tools, emdashTitle('A1'), cwd, { session: 'session-a' })
  assert.equal(a1.ok, true, JSON.stringify(a1).slice(0, 300))
  assert.equal(tracy.state.holder, 'session-a')
  // B meets A's lease and waits; nothing of B's reaches the site.
  const b1 = runEmdashAs(tools, emdashTitle('B1'), cwd, { session: 'session-b' })
  await paused.opened
  assert.deepEqual(titlesWritten(calls), ['A1'])
  // A, holding the lease, writes again at once: not behind B's wait.
  const a2 = await settledSoon(runEmdashAs(tools, emdashTitle('A2'), cwd, { session: 'session-a' }))
  assert.notEqual(a2, 'still queued', "the holder's write waited for the waiter")
  assert.equal(a2.ok, true, JSON.stringify(a2).slice(0, 300))
  // A's turn ends: its lease goes back, and B writes on its next look.
  turnStatus(listeners, 'session-a', cwd, 'idle')
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.deepEqual(tracy.state.releases, ['session-a'])
  resume.open()
  const b = await b1
  assert.equal(b.ok, true, JSON.stringify(b).slice(0, 300))
  assert.deepEqual(titlesWritten(calls), ['A1', 'A2', 'B1'])
  assert.equal(tracy.state.holder, 'session-b')
  assert.ok(tracy.state.acquires.filter((s) => s === 'session-b').length >= 2, 'B asked again after the wait')
})

/** `changedDoor`, recording each MCP request into `calls`, with an optional hook on writes. */
function changedDoorRecording(calls, onWrite = () => undefined) {
  const door = emdashDoor(
    {
      on: (name, args) => {
        if (name === 'content_update') {
          const said = onWrite(args)
          if (said !== undefined) return said
        }
        return name === 'content_get' ? { item: changedEntry, _rev: changedRev } : { item: changedEntry }
      }
    },
    calls
  )
  return async (input) => {
    const out = await door(input)
    const request = JSON.parse(String(input.stdin))
    const lost = request.params?.name === 'content_update' ? calls.lostAnswer : undefined
    return lost ? { code: 1, stdout: '', stderr: 'timed out', timedOut: true } : out
  }
}

test('🔒 Q1: Stop while an EmDash write waits for the lease — nothing is sent, also when the lease comes free just then', async () => {
  const { root, label, cwd } = siteWorkspace('emlease2')
  for (const freeAfterStop of [false, true]) {
    const stop = new AbortController()
    const tracy = fakeTracy({
      // The lease comes free while the Stop lands: the write must still not go.
      onAcquire: (session) => {
        if (freeAfterStop && session === 'session-b' && tracy.state.acquires.length > 2) {
          stop.abort()
          tracy.state.holder = null
        }
      }
    })
    tracy.state.holder = 'session-a'
    const calls = []
    const { tools } = registerWithDoor({
      ...emdashConfig(execFor(label, root)({ mcp: changedDoorRecording(calls) })),
      fetch: tracy.fetch,
      sleep: async () => {
        if (!freeAfterStop) stop.abort()
      }
    })
    const out = await runEmdashAs(tools, emdashTitle('B1'), cwd, {
      session: 'session-b',
      signal: stop.signal
    })
    assert.equal(out.code, 'TURN_STOPPED', JSON.stringify(out).slice(0, 300))
    assert.deepEqual(titlesWritten(calls), [], `freeAfterStop=${freeAfterStop}: a write was sent after Stop`)
  }
})

test('🔒 Q1: every EmDash write road takes the lease first — tracy_emdash, media.upload, content.replace — and none writes while another holds it', async () => {
  // tracy_emdash content_update
  {
    const { root, label, cwd } = siteWorkspace('emlease3a')
    const tracy = fakeTracy()
    tracy.state.holder = 'session-other'
    const calls = []
    const { tools } = registerWithDoor({
      ...emdashConfig(execFor(label, root)({ mcp: changedDoorRecording(calls) })),
      fetch: tracy.fetch,
      sleep: async () => {}
    })
    const out = await runEmdashAs(tools, emdashTitle('x'), cwd)
    assert.equal(out.code, 'SITE_BUSY', JSON.stringify(out).slice(0, 300))
    assert.ok(out.waitedSeconds >= 90, 'the wait is the Apply road’s')
    assert.deepEqual(titlesWritten(calls), [])
    tracy.state.holder = null
    const ok = await runEmdashAs(tools, emdashTitle('x'), cwd)
    assert.equal(ok.ok, true)
    assert.deepEqual(titlesWritten(calls), ['x'])
    assert.equal(tracy.state.holder, 'session-x')
    // A read takes no lease.
    const before = tracy.state.acquires.length
    await runEmdashAs(tools, { tool: 'content_get', arguments: { collection: 'home', id: EMDASH_ULID } }, cwd)
    assert.equal(tracy.state.acquires.length, before, 'a read asked for the write lease')
  }
  // media.upload on EmDash (the site's own media_upload through MCP)
  {
    const { root, label, cwd } = siteWorkspace('emlease3b')
    writeFileSync(path.join(root, label, 'logo.png'), PICTURE)
    const tracy = fakeTracy()
    tracy.state.holder = 'session-other'
    const calls = []
    const url = `/_emdash/api/media/file/${EMDASH_ULID}.png`
    const { tools } = registerWithDoor({
      ...emdashConfig(
        execFor(
          label,
          root
        )({
          mcp: emdashDoor(
            { on: (name) => (name === 'media_upload' ? { item: { id: EMDASH_ULID, url } } : { ok: true }) },
            calls
          )
        })
      ),
      fetch: tracy.fetch,
      sleep: async () => {}
    })
    const out = await runSite(tools, { action: 'media.upload', params: { file: 'logo.png' } }, cwd)
    assert.equal(out.code, 'SITE_BUSY', JSON.stringify(out).slice(0, 300))
    assert.equal(calls.filter((c) => c.name === 'media_upload').length, 0)
    tracy.state.holder = null
    const ok = await runSite(tools, { action: 'media.upload', params: { file: 'logo.png' } }, cwd)
    assert.equal(ok.ok, true, JSON.stringify(ok).slice(0, 300))
    assert.equal(calls.filter((c) => c.name === 'media_upload').length, 1)
    assert.ok(tracy.state.acquires.includes('session-x'))
  }
  // content.replace on EmDash (the container's own write script)
  {
    const REPLACE = new URL('./fixtures/replace/', import.meta.url)
    const SITE = JSON.parse(readFileSync(new URL('emdash/site.json', REPLACE), 'utf8'))
    const HOME_ED = readFileSync(new URL('pages/emdash-home.html', REPLACE), 'utf8')
    const { root, label, cwd } = emdashWorkspace('emlease3c')
    mkdirSync(path.join(root, label, 'template'), { recursive: true })
    writeFileSync(path.join(root, label, 'template', 'artifact.json'), JSON.stringify(SITE.artifact ?? {}))
    const em = createFakeEmdash(SITE)
    const scripts = []
    const tracy = fakeTracy()
    tracy.state.holder = 'session-other'
    const { tools } = registerWithDoor({
      ...emdashConfig(
        execFor(
          label,
          root
        )({
          mcp: async (input) => {
            const script = input.argv[input.argv.indexOf('-e') + 1]
            const kind =
              script === undefined ? 'mcp' : /EMDASH_WRITE|"writes"/.test(script) ? 'write' : 'index'
            scripts.push(kind)
            const stdin = typeof input.stdin === 'string' ? JSON.parse(input.stdin) : input.stdin
            return {
              code: 0,
              stdout: await runScript(script, { fetch: em.fetch, stdin }),
              stderr: '',
              timedOut: false
            }
          },
          fetch: (input) => fetchOk(input.argv, { body: HOME_ED }),
          probe: () => assert.fail('the replace job runs no node probe'),
          browser: () => assert.fail('the replace job opens no browser')
        })
      ),
      fetch: tracy.fetch,
      sleep: async () => {},
      siteDomain: 'tracy.test',
      deploymentOrigin: 'http://tracy.test:51710'
    })
    const phone = String(
      SITE.rows.find((r) => r.collection === 'site' && r.locale === 'en')?.data?.hotline ?? ''
    )
    const replace = { action: 'content.replace', params: { find: phone, replace: '0909 123 456' } }
    const out = await runSite(tools, replace, cwd)
    assert.equal(out.code, 'SITE_BUSY', JSON.stringify(out).slice(0, 400))
    assert.equal(scripts.includes('write'), false, 'the write script ran under another conversation’s lease')
    assert.equal(em.calls.filter((c) => c.name === 'content_update').length, 0)
    tracy.state.holder = null
    const ok = await runSite(tools, replace, cwd)
    assert.equal(ok.ok, true, JSON.stringify(ok).slice(0, 400))
    assert.ok(scripts.includes('write'))
    assert.equal(tracy.state.holder, 'session-x')
  }
})

/** A host on `cwd` whose root conversation is session-x, its pre-step hook, and a step at `turn`. */
function stoppedHost(cwd, config) {
  const agent = { session: { id: 'session-x' } }
  const agents = { roots: () => [agent], list: () => [agent], isOwnedBy: () => false }
  const host = registerWithDoor(config, { services: { agents } })
  const [hook] = host.listeners.get('agent/pre-step') ?? []
  const step = async (turn, words = null) => {
    const messages = words === null ? [] : [claimed(words)]
    const decision = await hook(
      { agent: stepAgent(cwd, [], 'session-x'), messages, turn, step: 1 },
      async () => ({
        kind: 'enter',
        messages
      })
    )
    const notice = decision.messages.find((m) => m.source?.producer === 'tracy-site-tools:stopped-writes')
    return notice === undefined ? null : String(notice.content?.[0]?.text ?? '')
  }
  return { ...host, step }
}

const settleReports = () => new Promise((resolve) => setTimeout(resolve, 30))

test('🔒 Q2: an EmDash write lands after Stop, the host restarts, and the next turn is told it landed — once', async () => {
  const { root, label, cwd } = siteWorkspace('emstop1')
  const tracy = fakeTracy()
  const stop = new AbortController()
  const calls = []
  // The Stop lands while the write is on the wire; the site writes it all the same.
  const door = changedDoorRecording(calls, () => {
    stop.abort()
    return undefined
  })
  const first = stoppedHost(cwd, { ...emdashConfig(execFor(label, root)({ mcp: door })), fetch: tracy.fetch })
  await first.step(3)
  const out = await runEmdashAs(first.tools, emdashTitle('Hi'), cwd, { signal: stop.signal })
  assert.equal(out.ok, true, 'the write on the wire ran to its answer')
  await settleReports()
  const rows = [...tracy.state.rows.values()]
  assert.deepEqual(
    rows.map((r) => [r.turnId, r.action, r.outcome, r.via]),
    [['session-x:3', 'content_update', 'ok', 'emdash']]
  )
  assert.deepEqual(rows[0].target, { kind: 'home', id: EMDASH_ULID })
  // A new host: nothing of the first one's memory.
  const second = stoppedHost(cwd, {
    ...emdashConfig(execFor(label, root)({ mcp: door })),
    fetch: tracy.fetch
  })
  const said = await second.step(4, 'and now the footer')
  assert.ok(said !== null, 'the next turn was not told')
  assert.match(said, /landed/)
  assert.match(said, new RegExp(`content_update home ${EMDASH_ULID}`))
  assert.doesNotMatch(said, /unknown outcome/)
  assert.equal(await second.step(5, 'thanks'), null, 'told twice')
})

test('🔒 Q2: an Apply write whose answer was lost after Stop is named as unknown, never as landed', async () => {
  const { cwd } = siteWorkspace('stopq2')
  const stop = new AbortController()
  const tracy = fakeTracy({
    apply: (body) => {
      if (body.action !== 'content.update') return { ok: true }
      stop.abort()
      return { ok: false, code: 'COMPONENT_UNREACHABLE', error: 'the site did not answer' }
    }
  })
  const host = stoppedHost(cwd, { fetch: tracy.fetch })
  await host.step(7)
  await runSiteAs(host.tools, updateTitle, cwd, { signal: stop.signal })
  await settleReports()
  const said = await host.step(8, 'is it done?')
  assert.ok(said !== null)
  assert.match(said, /unknown outcome/)
  assert.match(said, /content\.update/)
  assert.match(said, /Read those places again/)
  assert.doesNotMatch(said, /These landed/)
})

test('🔒 Q2: a turn that was not stopped reports nothing and adds no notice; a write Stop kept from being sent is not named', async () => {
  const { root, label, cwd } = siteWorkspace('emstop3')
  const tracy = fakeTracy()
  const calls = []
  const host = stoppedHost(cwd, {
    ...emdashConfig(execFor(label, root)({ mcp: changedDoorRecording(calls) })),
    fetch: tracy.fetch
  })
  await host.step(1)
  const stop = new AbortController()
  const out = await runEmdashAs(host.tools, emdashTitle('done'), cwd, { signal: stop.signal })
  assert.equal(out.ok, true)
  stop.abort() // after the call returned: its answer reached the model
  await settleReports()
  assert.equal(tracy.state.reports.length, 0, 'a call that returned before Stop was reported')
  assert.equal(await host.step(2, 'next please'), null)
  // Stopped before the send: nothing sent, nothing named.
  const early = new AbortController()
  early.abort()
  await runEmdashAs(host.tools, emdashTitle('never'), cwd, { signal: early.signal })
  await settleReports()
  assert.equal(await host.step(3, 'and again'), null)
  assert.deepEqual(titlesWritten(calls), ['done'])
})

// Council 20/10/2026 (D1): a write carries the record's title Tracy read from this site, so the
// "Changed on the site" card names "Yêu chính mình" (the article title) instead of `article 4`; a read is never labelled.
test('🔒 a write carries the title Tracy read of the same kind and id in x-tracy-write-title; a read carries none', async () => {
  const { cwd } = siteWorkspace('title-hdr')
  const calls = []
  const { tools } = registerWithDoor({
    fetch: doorFetch(
      (body) =>
        body.action === 'content.get'
          ? { ok: true, item: { id: 4, title: 'Yêu chính mình', introtext: '<p>x</p>', fulltext: '' }, id: 4 }
          : { ok: true, apply_id: 'a1', kind: 'article', id: 4 },
      calls
    )
  })
  await runSite(tools, { action: 'content.get', params: { kind: 'article', id: 4 } }, cwd)
  await runSite(
    tools,
    { action: 'content.update', params: { kind: 'article', id: 4, fields: { title: 'Yêu chính mình!' } } },
    cwd
  )
  await runSite(
    tools,
    { action: 'content.update', params: { kind: 'category', id: 4, fields: { title: 'Tin' } } },
    cwd
  )

  const header = (/** @type {any} */ c) => c.headers['x-tracy-write-title']
  const [read, write, other] = calls
  assert.equal(header(read), undefined, 'a read is not a write')
  assert.equal(decodeURIComponent(header(write)), 'Yêu chính mình')
  assert.equal(other.body.params.kind, 'category')
  assert.equal(header(other), undefined, 'category 4 is not the article read')
})
