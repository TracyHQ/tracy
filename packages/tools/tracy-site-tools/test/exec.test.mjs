import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync as readFixture, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { EMDASH_READ_TOOLS } from '../src/host/emdash.mjs'
import {
  AGENT_TOKEN_PATH,
  BROWSER_CONTAINER_TIMEOUT_S,
  BROWSER_DEADLINE_MS,
  BROWSER_SCRIPT,
  CONTAINER_SITES_ROOT,
  EMDASH_INDEX_MS,
  EMDASH_INDEX_SCRIPT,
  EMDASH_INDEX_TOOLS,
  EMDASH_MCP_LOOPBACK,
  EMDASH_SCRIPT_DEADLINE_MS,
  EMDASH_WRITE_MIN_LEFT_MS,
  EMDASH_WRITE_MS,
  EMDASH_WRITE_SCRIPT,
  EMDASH_WRITE_TOOLS,
  FETCH_MAX_BYTES,
  FETCH_NONCE,
  FETCH_USER_AGENT,
  MCP_FETCH_ABORT_MS,
  MCP_SCRIPT,
  MCP_TOKEN_PRELUDE,
  PROBE_SCRIPT,
  browserArgv,
  containerLookFile,
  emdashIndexArgv,
  emdashWriteArgv,
  fetchArgv,
  looksLikeMissingBinary,
  loopbackUrl,
  mcpArgv,
  parseBrowser,
  parseEmdashIndex,
  parseEmdashWrite,
  parseFetch,
  parseMcpExec,
  parseProbe,
  probeArgv
} from '../src/host/exec.mjs'
import {
  TOKEN as FAKE_TOKEN,
  createFakeEmdash,
  manualTimers,
  runScript as runOnFake
} from './fixtures/replace/emdash/fake-emdash.mjs'

// A real, minted-shape token — the exact value must never appear in anything the scripts write out.
const TOKEN = 'ec_pat_abcdefghijklmnop0123456789'

// ── the loopback address (#154): the site is dialled from INSIDE its own container ───────────────

test('loopbackUrl: 127.0.0.1, this site’s own port, never a container name', () => {
  assert.equal(loopbackUrl(80, '/'), 'http://127.0.0.1/')
  assert.equal(loopbackUrl(80, '/a?b=c#d'), 'http://127.0.0.1/a?b=c#d')
  assert.equal(loopbackUrl(4321, '/'), 'http://127.0.0.1:4321/')
  // port 80 is implicit; a non-integer or non-positive port is treated as the default.
  assert.equal(loopbackUrl(0, '/'), 'http://127.0.0.1/')
  assert.equal(loopbackUrl(undefined, '/'), 'http://127.0.0.1/')
})

test('containerLookFile stays under the container’s fixed /site mount', () => {
  assert.equal(containerLookFile('demo9', 1730000000000), '/site/demo9/docs/agents/look/1730000000000.png')
  assert.ok(containerLookFile('x', 1).startsWith(`${CONTAINER_SITES_ROOT}/`))
})

// ── the argv the transport actually runs (the builders are pure, so this IS the command) ─────────

test('probeArgv: the GET redirect-chain probe runs as www-data, url as a separate argv element', () => {
  const argv = probeArgv({ container: 'demo9-web-1', url: 'http://127.0.0.1/p', timeoutMs: 2000 })
  assert.deepEqual(argv, [
    'exec',
    '-u',
    'www-data',
    'demo9-web-1',
    'node',
    '-e',
    PROBE_SCRIPT,
    'http://127.0.0.1/p',
    '2000'
  ])
  // 🔒 the url is DATA, never interpolated into the script text: a ';' in it cannot become syntax.
  const nasty = probeArgv({ container: 'c', url: 'http://127.0.0.1/;rm -rf%20/', timeoutMs: 1 })
  assert.equal(nasty[nasty.indexOf(PROBE_SCRIPT) + 1], 'http://127.0.0.1/;rm -rf%20/')
  // the public-origin route is one more argv element, after the timeout — never in the script text
  const pub = probeArgv({
    container: 'demo9-web-1',
    url: 'https://demo9.tracy.site/p',
    timeoutMs: 2000,
    via: '127.0.0.1:80'
  })
  assert.deepEqual(pub.slice(-3), ['https://demo9.tracy.site/p', '2000', '127.0.0.1:80'])
  assert.ok(!PROBE_SCRIPT.includes('demo9.tracy.site'))
})

test('browserArgv (dom): node drives chromium over CDP as www-data, url+origin are argv data', () => {
  const argv = browserArgv({
    container: 'demo9-web-1',
    mode: 'dom',
    url: 'http://127.0.0.1/about',
    origin: 'http://127.0.0.1'
  })
  // www-data (a non-credential user reading a public page), not root.
  assert.equal(argv[1], '-u')
  assert.equal(argv[2], 'www-data')
  assert.deepEqual(argv.slice(3, 5), ['-e', 'HOME=/tmp'])
  // 🔒 `timeout`-wrapped so a hung render is killed INSIDE the container (the backstop under the
  // script's own deadline), not just at the docker client.
  const t = argv.indexOf('timeout')
  assert.ok(t !== -1)
  assert.deepEqual(argv.slice(t, t + 4), ['timeout', '-k', '3', String(BROWSER_CONTAINER_TIMEOUT_S)])
  // it is NODE that runs, driving chromium over CDP — not chromium invoked directly.
  assert.deepEqual(argv.slice(t + 4, t + 7), ['node', '-e', BROWSER_SCRIPT])
  // 🔒 the url and origin are DATA, separate argv elements — never interpolated into the script text.
  assert.deepEqual(argv.slice(-4), ['dom', 'http://127.0.0.1/about', 'http://127.0.0.1', ''])
})

test('browserArgv (shot): the screenshot path is passed as argv, under the /site mount', () => {
  const file = containerLookFile('demo9', 42)
  const argv = browserArgv({
    container: 'demo9-web-1',
    mode: 'shot',
    url: 'http://127.0.0.1/',
    origin: 'http://127.0.0.1',
    file
  })
  assert.equal(argv[2], 'www-data')
  assert.deepEqual(argv.slice(-4), ['shot', 'http://127.0.0.1/', 'http://127.0.0.1', file])
  assert.ok(file.startsWith(`${CONTAINER_SITES_ROOT}/`))
  // the script text carries no user value — the container name is not interpolated into it either.
  assert.ok(!BROWSER_SCRIPT.includes('demo9-web-1'))
})

test('browserArgv: a host-resolver rule rides an ENV value, never argv or the script text', () => {
  // 🔒 the canonical-port fix (#154): the rule that routes the public authority back onto the
  // container's loopback service travels as TRACY_RESOLVER_RULE, so the script (and its argv
  // positions) are untouched and no value is interpolated into a shell string.
  const rule = '--host-resolver-rules=MAP tracy-site.probe.invalid:51710 127.0.0.1:80'
  const argv = browserArgv({
    container: 'demo9-web-1',
    mode: 'dom',
    url: 'http://tracy-site.probe.invalid:51710/',
    origin: 'http://tracy-site.probe.invalid:51710',
    resolverRule: rule
  })
  const e = argv.indexOf('TRACY_RESOLVER_RULE=' + rule)
  assert.ok(e !== -1, 'the rule is carried as an env value')
  assert.equal(argv[e - 1], '-e')
  // it is not in the script text, and the positional page args are still the last four.
  assert.ok(!BROWSER_SCRIPT.includes(rule))
  assert.deepEqual(argv.slice(-4), [
    'dom',
    'http://tracy-site.probe.invalid:51710/',
    'http://tracy-site.probe.invalid:51710',
    ''
  ])
  // with no rule, the argv is exactly as before — the ONLY docker env flag is HOME=/tmp. (`-e` also
  // appears once more after the container as node's own `-e <script>`, so counting `-e` across the
  // whole argv is not the contract; the docker env prefix, before the container, is.)
  const plain = browserArgv({
    container: 'c',
    mode: 'dom',
    url: 'http://127.0.0.1/',
    origin: 'http://127.0.0.1'
  })
  assert.deepEqual(plain.slice(0, 6), ['exec', '-u', 'www-data', '-e', 'HOME=/tmp', 'c'])
  assert.ok(!plain.some((a) => String(a).startsWith('TRACY_RESOLVER_RULE=')))
})

test('mcpArgv: the MCP call runs AS EXPLICIT ROOT (-u 0), -i for the body on stdin', () => {
  const argv = mcpArgv({ container: 'demo9-web-1' })
  assert.deepEqual(argv, ['exec', '-i', '-u', '0', 'demo9-web-1', 'node', '-e', MCP_SCRIPT])
  // 🔒 the token value is NOT on argv or env — the script reads it inside the container. (The
  // `ec_pat_` prefix appears once, in the script's own validation regex, not as a value.)
  assert.ok(!argv.join(' ').includes(TOKEN))
  assert.ok(!argv.includes(AGENT_TOKEN_PATH)) // not even the path is passed in; the script hard-codes it
})

// ── parsing what the in-container scripts write back ─────────────────────────────────────────────

test('parseProbe: final status + final url, the authority-change hop, error, and the empty line', () => {
  assert.deepEqual(parseProbe('TRACY_PROBE 200 http://127.0.0.1/'), {
    ok: true,
    status: 200,
    finalUrl: 'http://127.0.0.1/'
  })
  // the script resolved the chain itself and stayed on the dialled authority — the host sees the FINAL url.
  assert.deepEqual(parseProbe('TRACY_PROBE 200 http://127.0.0.1/home'), {
    ok: true,
    status: 200,
    finalUrl: 'http://127.0.0.1/home'
  })
  // 🔒 a host/port/scheme change STOPS the probe and carries the raw hop, for the host to classify
  // with redirectStaysOnSite (off-site name/scheme vs same-name canonical port). The probe never
  // dialled the new authority.
  assert.deepEqual(parseProbe('TRACY_PROBE_REDIR 301 http://127.0.0.1/ http://127.0.0.1:51710/'), {
    ok: false,
    redirect: { status: 301, from: 'http://127.0.0.1/', location: 'http://127.0.0.1:51710/' }
  })
  assert.deepEqual(parseProbe('TRACY_PROBE_REDIR 302 http://127.0.0.1/ https://evil.example/'), {
    ok: false,
    redirect: { status: 302, from: 'http://127.0.0.1/', location: 'https://evil.example/' }
  })
  assert.equal(parseProbe('TRACY_PROBE_ERR fetch failed').ok, false)
  assert.equal(parseProbe('TRACY_PROBE_ERR fetch failed').redirect, undefined)
  assert.equal(parseProbe('').ok, false)
  assert.equal(parseProbe('TRACY_PROBE notanumber ').ok, false)
})

test('parseBrowser: OK carries final url + dom; OFFSITE / NAV / NOCHROME stay distinct', () => {
  const ok = parseBrowser('TRACY_BROWSER OK http://127.0.0.1:4321/about\n<html><body>hi</body></html>')
  assert.deepEqual(ok, {
    ok: true,
    finalUrl: 'http://127.0.0.1:4321/about',
    dom: '<html><body>hi</body></html>'
  })
  // a screenshot writes no dom; the OK line is the whole output.
  assert.deepEqual(parseBrowser('TRACY_BROWSER OK http://127.0.0.1/'), {
    ok: true,
    finalUrl: 'http://127.0.0.1/',
    dom: ''
  })
  const off = parseBrowser('TRACY_BROWSER OFFSITE http://127.0.0.1:4322/')
  assert.deepEqual(off, { ok: false, kind: 'offsite', error: 'http://127.0.0.1:4322/' })
  const nav = parseBrowser('TRACY_BROWSER NAV net::ERR_CONNECTION_REFUSED')
  assert.deepEqual(nav, { ok: false, kind: 'nav', error: 'net::ERR_CONNECTION_REFUSED' })
  const none = parseBrowser('TRACY_BROWSER NOCHROME spawn chromium ENOENT')
  assert.deepEqual(none, { ok: false, kind: 'no-browser', error: 'spawn chromium ENOENT' })
  assert.equal(parseBrowser('TRACY_BROWSER ERR timed out').kind, 'error')
  assert.equal(parseBrowser('').kind, 'error')
})

test('parseMcpExec: success carries status and body, no-token and transport stay distinct', () => {
  const ok = parseMcpExec('TRACY_MCP 200\n{"jsonrpc":"2.0","id":1,"result":{}}')
  assert.deepEqual(ok, { ok: true, status: 200, body: '{"jsonrpc":"2.0","id":1,"result":{}}' })
  // an SSE body is passed through verbatim for parseMcpBody to unframe.
  const sse = parseMcpExec('TRACY_MCP 200\nevent: message\ndata: {"id":1}\n\n')
  assert.equal(sse.ok, true)
  assert.match(sse.body, /event: message/)

  const missing = parseMcpExec('TRACY_MCP_ERR NO_TOKEN the agent token file is not present')
  assert.deepEqual(missing, { ok: false, kind: 'no-token', error: 'the agent token file is not present' })
  const malformed = parseMcpExec('TRACY_MCP_ERR NO_TOKEN the agent token file is malformed')
  assert.equal(malformed.kind, 'no-token')
  const site = parseMcpExec('TRACY_MCP_ERR SITE connect ECONNREFUSED')
  assert.deepEqual(site, { ok: false, kind: 'transport', error: 'connect ECONNREFUSED' })
  assert.equal(parseMcpExec('').ok, false)
  assert.equal(parseMcpExec('').kind, 'transport')
})

test('looksLikeMissingBinary tells an absent program from one that ran and errored', () => {
  assert.equal(looksLikeMissingBinary({ code: 127, stderr: '' }), true)
  assert.equal(looksLikeMissingBinary({ code: 126, stderr: '' }), true)
  assert.equal(
    looksLikeMissingBinary({ code: 1, stderr: 'exec: "chromium": executable file not found in $PATH' }),
    true
  )
  assert.equal(looksLikeMissingBinary({ code: null, stderr: '', spawnError: 'spawn docker ENOENT' }), false)
  // a browser that RAN and failed (crashed, timed out at 124) is NOT a missing binary.
  assert.equal(looksLikeMissingBinary({ code: 1, stderr: 'Fontconfig error' }), false)
  assert.equal(looksLikeMissingBinary({ code: 124, stderr: '' }), false)
})

// ── executing the REAL scripts with injected fakes (the parent’s vm-style harness) ───────────────
//
// The scripts are the transport's most security-sensitive surface: they read the token and put it in
// an Authorization header. These run the exact PROBE_SCRIPT / MCP_SCRIPT strings the argv carry, with
// `require`/`process`/`fetch` faked, so the token-custody and redirect properties are asserted on the
// code that actually ships — not a paraphrase of it.

/** Run a `node -e` script body with the free names it reads bound to fakes; resolve its stdout. */
function runScript(script, freeNames, values) {
  return new Promise((resolve, reject) => {
    let out = ''
    const dataCbs = []
    const endCbs = []
    const proc = {
      argv: values.argv ?? [],
      env: values.env,
      // the flush callback is what lets the script exit; call it so `done()` clears its bail timer.
      stdout: {
        write: (s, cb) => {
          out += String(s)
          if (typeof cb === 'function') cb()
        }
      },
      stdin: {
        on: (ev, cb) => {
          if (ev === 'data') dataCbs.push(cb)
          else if (ev === 'end') endCbs.push(cb)
        }
      },
      exit: () => {
        throw { __exit: true }
      }
    }
    const bound = { ...values, process: proc }
    try {
      // eslint-disable-next-line no-new-func
      new Function(...freeNames, script)(...freeNames.map((n) => bound[n]))
    } catch (e) {
      if (!e || !e.__exit) return reject(e)
    }
    if (out !== '') return resolve(out) // a synchronous NO_TOKEN / probe error already wrote its line
    for (const cb of dataCbs) cb(Buffer.from(values.stdinBody ?? ''))
    for (const cb of endCbs) cb()
    const started = Date.now()
    const iv = setInterval(() => {
      if (out !== '') {
        clearInterval(iv)
        resolve(out)
      } else if (Date.now() - started > 2000) {
        clearInterval(iv)
        reject(new Error('script wrote nothing'))
      }
    }, 1)
  })
}

const fakeFs = (readFileSync) => (name) => (name === 'fs' ? { readFileSync } : {})

test('MCP_SCRIPT refuses a missing token BY NAME and never dials the site', async () => {
  let dialled = false
  const out = await runScript(MCP_SCRIPT, ['require', 'process', 'fetch', 'AbortSignal'], {
    require: fakeFs(() => {
      throw new Error('ENOENT')
    }),
    fetch: () => {
      dialled = true
    },
    AbortSignal
  })
  assert.equal(out, 'TRACY_MCP_ERR NO_TOKEN the agent token file is not present')
  assert.equal(dialled, false)
})

test('MCP_SCRIPT refuses a malformed token BY NAME, value never in the message', async () => {
  const out = await runScript(MCP_SCRIPT, ['require', 'process', 'fetch', 'AbortSignal'], {
    require: fakeFs(() => 'not-a-pat'),
    fetch: () => {
      throw new Error('should not be called')
    },
    AbortSignal
  })
  assert.equal(out, 'TRACY_MCP_ERR NO_TOKEN the agent token file is malformed')
})

test('MCP_SCRIPT reads the root-only file, calls loopback with redirect:error, returns the answer', async () => {
  let seen = null
  const out = await runScript(MCP_SCRIPT, ['require', 'process', 'fetch', 'AbortSignal'], {
    require: fakeFs((p) => {
      assert.equal(p, AGENT_TOKEN_PATH) // /run/tracy-agent.token, the root-only mount
      return `  ${TOKEN}\n`
    }),
    fetch: async (url, opts) => {
      seen = { url, opts }
      return { status: 200, text: async () => '{"jsonrpc":"2.0","id":1,"result":{"ok":true}}' }
    },
    AbortSignal,
    stdinBody: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  })
  assert.equal(seen.url, EMDASH_MCP_LOOPBACK)
  assert.equal(seen.opts.method, 'POST')
  assert.equal(seen.opts.redirect, 'error') // a credential-bearing request must not follow a redirect
  assert.equal(seen.opts.headers.authorization, `Bearer ${TOKEN}`)
  assert.ok(seen.opts.signal) // the fetch self-aborts; it does not rely on the docker client's timeout
  assert.equal(seen.opts.body, '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
  assert.equal(out, 'TRACY_MCP 200\n{"jsonrpc":"2.0","id":1,"result":{"ok":true}}')
})

test('🔒 MCP_SCRIPT REDACTS a reflected token — a site echoing Authorization cannot leak the PAT', async () => {
  // The regression the parent flagged: a site that echoes the Authorization header into its body
  // returned the exact PAT to dsh stdout. Every byte written out now passes through red().
  const out = await runScript(MCP_SCRIPT, ['require', 'process', 'fetch', 'AbortSignal'], {
    require: fakeFs(() => TOKEN),
    fetch: async (url, opts) => ({
      status: 200,
      text: async () => `you sent ${opts.headers.authorization} and token ${TOKEN}`
    }),
    AbortSignal,
    stdinBody: '{}'
  })
  assert.ok(!out.includes(TOKEN), `stdout must not carry the PAT, got: ${out}`)
  assert.match(out, /\[REDACTED\]/)
})

test('🔒 MCP_SCRIPT redacts a token reflected in a FETCH ERROR message too', async () => {
  const out = await runScript(MCP_SCRIPT, ['require', 'process', 'fetch', 'AbortSignal'], {
    require: fakeFs(() => TOKEN),
    fetch: async () => {
      throw new Error(`request with Bearer ${TOKEN} failed`)
    },
    AbortSignal,
    stdinBody: '{}'
  })
  assert.ok(out.startsWith('TRACY_MCP_ERR SITE '))
  assert.ok(!out.includes(TOKEN))
  assert.match(out, /\[REDACTED\]/)
})

test('PROBE_SCRIPT: GET, follows a same-authority chain, stops at an authority change, survives a dead GET', async () => {
  const resp = (status, location) => ({
    status,
    headers: { get: (h) => (h === 'location' ? location : null) },
    body: { cancel: async () => {} }
  })
  // a same-authority redirect (relative) then a 200 — the FINAL url is what comes back, not the first.
  const chain = {
    'http://127.0.0.1:4321/a': resp(302, '/b'),
    'http://127.0.0.1:4321/b': resp(200, '')
  }
  const ok = await runScript(PROBE_SCRIPT, ['process', 'fetch', 'AbortSignal'], {
    argv: ['node', 'http://127.0.0.1:4321/a', '2000'],
    fetch: async (u, opts) => {
      assert.equal(opts.method, 'GET') // 🔒 GET, not HEAD: a server can answer 200 to HEAD, 302 to GET
      assert.equal(opts.redirect, 'manual')
      return chain[u]
    },
    AbortSignal
  })
  assert.deepEqual(parseProbe(ok), { ok: true, status: 200, finalUrl: 'http://127.0.0.1:4321/b' })

  // 🔒 a FIRST hop that is same-authority and relative, whose SECOND hop leaves the host, is STOPPED
  // at that second hop and reported raw — exactly what one HEAD on the first hop would have waved
  // through. It is the host (redirectStaysOnSite) that then refuses a different NAME.
  const twoHop = {
    'http://127.0.0.1:4321/x': resp(302, '/y'),
    'http://127.0.0.1:4321/y': resp(302, 'https://evil.example/phish')
  }
  let dialled = []
  const off = await runScript(PROBE_SCRIPT, ['process', 'fetch', 'AbortSignal'], {
    argv: ['node', 'http://127.0.0.1:4321/x', '2000'],
    fetch: async (u) => {
      dialled.push(u)
      return twoHop[u]
    },
    AbortSignal
  })
  assert.deepEqual(parseProbe(off), {
    ok: false,
    redirect: { status: 302, from: 'http://127.0.0.1:4321/y', location: 'https://evil.example/phish' }
  })
  // 🔒 the changed authority was NEVER dialled: only the two same-authority hops were fetched.
  assert.deepEqual(dialled, ['http://127.0.0.1:4321/x', 'http://127.0.0.1:4321/y'])

  // 🔒 a same-NAME, other-PORT redirect (WordPress redirect_canonical) is a stop, not a refusal, and
  // its port is never dialled — the host turns this into the canonical authority the browser routes.
  const canon = {
    'http://127.0.0.1/': resp(301, 'http://127.0.0.1:51710/')
  }
  let canonDialled = []
  const canonOut = await runScript(PROBE_SCRIPT, ['process', 'fetch', 'AbortSignal'], {
    argv: ['node', 'http://127.0.0.1/', '2000'],
    fetch: async (u) => {
      canonDialled.push(u)
      return canon[u]
    },
    AbortSignal
  })
  assert.deepEqual(parseProbe(canonOut), {
    ok: false,
    redirect: { status: 301, from: 'http://127.0.0.1/', location: 'http://127.0.0.1:51710/' }
  })
  assert.deepEqual(canonDialled, ['http://127.0.0.1/'], 'the canonical public port must never be dialled')

  const dead = await runScript(PROBE_SCRIPT, ['process', 'fetch', 'AbortSignal'], {
    argv: ['node', 'http://127.0.0.1:4321/', '2000'],
    fetch: async () => {
      throw new Error('connect ECONNREFUSED')
    },
    AbortSignal
  })
  assert.equal(parseProbe(dead).ok, false)
  assert.equal(parseProbe(dead).redirect, undefined) // a dead GET is an error, not a redirect hop
  assert.match(dead, /TRACY_PROBE_ERR/)
})

// ── executing the REAL BROWSER_SCRIPT against a scripted fake CDP browser ─────────────────────────
//
// The shipped BROWSER_SCRIPT string is run with `require`/`process` faked; `spawn` returns a fake
// chromium that speaks just enough of the DevTools pipe protocol to answer the script's requests.
// This asserts the SECURITY decision on the exact code that ships: the final document URL, read over
// CDP, is what decides ok / off-site / failed-navigation — not the address the browser was handed.

/**
 * A fake `spawn` whose child answers CDP requests with a scripted final URL / dom / screenshot, and —
 * when `offsiteNav` is set — pushes a `Fetch.requestPaused` MAIN-FRAME Document event for another
 * origin AFTER the navigate, the way a JS/meta redirect would, to exercise the active off-site guard.
 */
function fakeChromiumCDP({
  finalUrl,
  dom = '',
  errorText,
  screenshotB64,
  offsiteNav,
  styles,
  // every CDP request the script sends, in order (a test asserts what the page was told to do)
  seen,
  // what the in-page scroll answers: where the page actually ended up
  scrolledTo,
  // whether the page fires its load event after the navigation
  loadEvent = false
} = {}) {
  let dataCb = null
  // a CDP frame the script processes may end in process.exit — the harness models that as an `__exit`
  // throw. Swallow it here the way a real exit would end the process, so it never leaks async.
  const emit = (obj) => {
    if (dataCb) {
      try {
        dataCb(Buffer.from(JSON.stringify(obj) + '\0'))
      } catch (e) {
        if (!e || !e.__exit) throw e
      }
    }
  }
  const child = {
    pid: 4242,
    on: () => {}, // 'error'/'exit' never fire: chromium is present and stays up in this scenario
    kill: () => {},
    stdio: [
      null,
      null,
      null,
      {
        on: () => {}, // the write pipe's 'error' handler
        write: (s) => {
          const msg = JSON.parse(String(s).replace(/\0$/, ''))
          seen?.push(msg)
          const reply = (result) => emit({ id: msg.id, result })
          if (msg.method === 'Target.createTarget') return reply({ targetId: 'T1' })
          if (msg.method === 'Target.attachToTarget') return reply({ sessionId: 'S1' })
          if (msg.method === 'Page.enable') return reply({})
          if (msg.method === 'Page.getFrameTree') return reply({ frameTree: { frame: { id: 'MF' } } })
          if (msg.method === 'Fetch.enable') return reply({})
          if (msg.method === 'Fetch.continueRequest' || msg.method === 'Fetch.failRequest') return reply({})
          if (msg.method === 'Page.navigate') {
            reply(errorText ? { frameId: 'MF', errorText } : { frameId: 'MF' })
            if (loadEvent) queueMicrotask(() => emit({ method: 'Page.loadEventFired', params: {} }))
            // a main-frame Document request to another origin, arriving after commit — the guard fails it.
            if (offsiteNav)
              queueMicrotask(() =>
                emit({
                  method: 'Fetch.requestPaused',
                  params: {
                    requestId: 'R1',
                    frameId: 'MF',
                    resourceType: 'Document',
                    request: { url: offsiteNav }
                  }
                })
              )
            return
          }
          if (msg.method === 'Runtime.evaluate') {
            const expr = msg.params.expression
            // the view's scroll runs in the page and answers where the page ended up.
            if (expr.includes('scrollTo')) return reply({ result: { value: scrolledTo ?? null } })
            // the dom read collects href+html in ONE turn; the shot read asks for href alone; the
            // styles read evaluates the adherence probe and gets an object back.
            const value = expr.includes('getComputedStyle')
              ? (styles ?? null)
              : expr.includes('outerHTML')
                ? JSON.stringify({ href: finalUrl, html: dom })
                : finalUrl
            return reply({ result: { value } })
          }
          if (msg.method === 'Page.captureScreenshot') return reply({ data: screenshotB64 })
          if (msg.method === 'Browser.close') return
          return reply({})
        }
      },
      {
        on: (ev, cb) => {
          if (ev === 'data') dataCb = cb
        }
      }
    ]
  }
  return () => child
}

/** Run the real BROWSER_SCRIPT with a faked child_process/fs/os/path; resolve its one output line. */
function runBrowser(spawn, { mode, url, origin, file = '', writeFileSync } = {}) {
  const profiles = []
  const p = runScript(BROWSER_SCRIPT, ['require', 'process'], {
    require: (name) =>
      name === 'child_process'
        ? { spawn }
        : name === 'fs'
          ? {
              writeFileSync: writeFileSync ?? (() => {}),
              mkdtempSync: (pre) => {
                const d = pre + String(profiles.length)
                profiles.push(d)
                return d
              },
              rmSync: () => {}
            }
          : name === 'os'
            ? { tmpdir: () => '/tmp' }
            : name === 'path'
              ? { join: (...a) => a.join('/') }
              : {},
    // a small settle and a generous deadline keep the test fast and off the wall clock.
    argv: ['node', mode, url, origin, file, '5', '4000', '1000']
  })
  p.profiles = profiles
  return p
}

test('🔒 BROWSER_SCRIPT (dom): the CDP final URL decides — own origin returns the DOM', async () => {
  const out = await runBrowser(
    fakeChromiumCDP({ finalUrl: 'http://127.0.0.1:4321/about', dom: '<html><body>own</body></html>' }),
    { mode: 'dom', url: 'http://127.0.0.1:4321/about', origin: 'http://127.0.0.1:4321' }
  )
  assert.deepEqual(parseBrowser(out), {
    ok: true,
    finalUrl: 'http://127.0.0.1:4321/about',
    dom: '<html><body>own</body></html>'
  })
})

test('🔒 BROWSER_SCRIPT: a final URL on ANOTHER origin is OFFSITE, even after a 200 was served', async () => {
  // a JS/meta or 30x navigation the pre-browser GET could not see: the browser ends on another origin.
  const out = await runBrowser(
    fakeChromiumCDP({ finalUrl: 'http://127.0.0.1:4322/', dom: '<html>other</html>' }),
    { mode: 'dom', url: 'http://127.0.0.1:4321/', origin: 'http://127.0.0.1:4321' }
  )
  const parsed = parseBrowser(out)
  assert.equal(parsed.ok, false)
  assert.equal(parsed.kind, 'offsite')
  assert.equal(parsed.error, 'http://127.0.0.1:4322/')
})

test('🔒 BROWSER_SCRIPT: a Chrome error page is a failed NAV, never returned as this site’s content', async () => {
  const out = await runBrowser(
    fakeChromiumCDP({ finalUrl: 'chrome-error://chromewebdata/', errorText: 'net::ERR_CONNECTION_REFUSED' }),
    { mode: 'dom', url: 'http://127.0.0.1:4321/', origin: 'http://127.0.0.1:4321' }
  )
  assert.deepEqual(parseBrowser(out), { ok: false, kind: 'nav', error: 'net::ERR_CONNECTION_REFUSED' })
})

test('BROWSER_SCRIPT (styles): the adherence probe runs in the page; OK carries the probe href and its samples as JSON', async () => {
  const styles = {
    href: 'http://127.0.0.1:4321/',
    seen: 2,
    samples: [{ prop: 'color', value: 'rgb(1, 2, 3)', count: 2, where: ['p'] }]
  }
  const out = await runBrowser(fakeChromiumCDP({ finalUrl: 'http://127.0.0.1:4321/', styles }), {
    mode: 'styles',
    url: 'http://127.0.0.1:4321/',
    origin: 'http://127.0.0.1:4321'
  })
  const parsed = parseBrowser(out)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.finalUrl, 'http://127.0.0.1:4321/')
  assert.deepEqual(JSON.parse(parsed.dom), styles)
  // A probe whose page ended on another origin is OFFSITE, like dom and shot.
  const away = await runBrowser(
    fakeChromiumCDP({
      finalUrl: 'http://127.0.0.1:4321/',
      styles: { ...styles, href: 'http://127.0.0.1:4322/' }
    }),
    { mode: 'styles', url: 'http://127.0.0.1:4321/', origin: 'http://127.0.0.1:4321' }
  )
  assert.equal(parseBrowser(away).kind, 'offsite')
  // A probe that returns nothing is an ERR, never a blank OK.
  const empty = await runBrowser(fakeChromiumCDP({ finalUrl: 'http://127.0.0.1:4321/', styles: null }), {
    mode: 'styles',
    url: 'http://127.0.0.1:4321/',
    origin: 'http://127.0.0.1:4321'
  })
  assert.equal(parseBrowser(empty).ok, false)
  assert.match(parseBrowser(empty).error, /returned nothing/)
})

test('BROWSER_SCRIPT (shot): on-origin, the PNG is written and OK carries the final URL', async () => {
  let wrote = null
  const png = Buffer.from('\x89PNG\r\n\x1a\n', 'binary').toString('base64')
  const out = await runBrowser(fakeChromiumCDP({ finalUrl: 'http://127.0.0.1/', screenshotB64: png }), {
    mode: 'shot',
    url: 'http://127.0.0.1/',
    origin: 'http://127.0.0.1',
    file: '/site/demo/docs/agents/look/1.png',
    writeFileSync: (f, b) => {
      wrote = { f, bytes: b.length }
    }
  })
  assert.deepEqual(parseBrowser(out), { ok: true, finalUrl: 'http://127.0.0.1/', dom: '' })
  assert.equal(wrote.f, '/site/demo/docs/agents/look/1.png')
  assert.ok(wrote.bytes > 0)
})

// ── mode `view`: the page as a customer's Browser tab shows it ───────────────────────────────────────

const VIEW_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64')
const viewRun = (cdp, request, extra = {}) =>
  runBrowser(fakeChromiumCDP({ finalUrl: 'http://127.0.0.1/pricing', screenshotB64: VIEW_JPEG, ...cdp }), {
    mode: 'view',
    url: 'http://127.0.0.1/pricing',
    origin: 'http://127.0.0.1',
    file: JSON.stringify(request),
    ...extra
  })

test('BROWSER_SCRIPT (view): the customer’s frame is emulated, the page scrolled to where they stood, the JPEG comes back on stdout', async () => {
  const seen = []
  let wroteFile = false
  const out = await viewRun(
    { seen, scrolledTo: 1180, loadEvent: true },
    { w: 640, h: 800, y: 1200, dark: true },
    {
      writeFileSync: () => {
        wroteFile = true
      }
    }
  )
  const parsed = parseBrowser(out)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.finalUrl, 'http://127.0.0.1/pricing')
  // Where the page really ended up (a shorter page stops early) and whether it had loaded in time.
  assert.deepEqual(JSON.parse(parsed.dom), { y: 1180, loaded: true, jpeg: VIEW_JPEG })
  // A picture for the model, not a file in the folder the customer can open.
  assert.equal(wroteFile, false)

  const metrics = seen.find((m) => m.method === 'Emulation.setDeviceMetricsOverride')
  assert.deepEqual(
    metrics.params,
    { width: 640, height: 800, deviceScaleFactor: 1, mobile: false },
    'a narrow column is a narrow desktop window, never a phone'
  )
  const media = seen.find((m) => m.method === 'Emulation.setEmulatedMedia')
  assert.deepEqual(
    media.params.features,
    [
      { name: 'prefers-color-scheme', value: 'dark' },
      { name: 'prefers-reduced-motion', value: 'reduce' }
    ],
    'the customer’s colour scheme, and no half-played reveal animation'
  )
  const scroll = seen.find((m) => m.method === 'Runtime.evaluate' && m.params.expression.includes('scrollTo'))
  assert.equal(scroll.params.awaitPromise, true, 'the picture waits for what the scroll brings in')
  assert.match(scroll.params.expression, /\)\(1200,/, 'scrolled to the customer’s position')
  const shot = seen.find((m) => m.method === 'Page.captureScreenshot')
  assert.equal(shot.params.format, 'jpeg')
  assert.ok(shot.params.quality > 0 && shot.params.quality <= 100)
  assert.ok(!('captureBeyondViewport' in shot.params), 'the viewport, not the whole page')
  // The order that makes the picture right: frame first, then the page, then the scroll, then the shot.
  const order = seen.map((m) => m.method)
  assert.ok(order.indexOf('Emulation.setDeviceMetricsOverride') < order.indexOf('Page.navigate'))
  assert.ok(order.indexOf('Page.navigate') < order.indexOf('Page.captureScreenshot'))
})

test('BROWSER_SCRIPT (view): a light scheme by default, and a page still loading is pictured as it stands', async () => {
  const seen = []
  const out = await viewRun({ seen, scrolledTo: 0 }, { w: 1280, h: 800, y: 0 })
  const media = seen.find((m) => m.method === 'Emulation.setEmulatedMedia')
  assert.equal(media.params.features[0].value, 'light')
  // The fake never fires a load event: the picture is taken anyway and says so.
  assert.equal(JSON.parse(parseBrowser(out).dom).loaded, false)
})

test('BROWSER_SCRIPT (view): a scroll that answers nothing leaves y unknown, the picture still comes back', async () => {
  const out = await viewRun({}, { w: 640, h: 800, y: 300 })
  const view = JSON.parse(parseBrowser(out).dom)
  assert.equal(view.y, null)
  assert.equal(view.jpeg, VIEW_JPEG)
})

test('BROWSER_SCRIPT (view): a request that is not three whole numbers is refused before any browser starts', async () => {
  for (const bad of [
    { w: 640, h: 800 },
    { w: 640, y: 0 },
    { h: 800, y: 0 },
    { w: 0, h: 800, y: 0 },
    { w: 640, h: 0, y: 0 },
    { w: 640, h: 800, y: -1 },
    { w: 640.5, h: 800, y: 0 },
    { w: '640', h: 800, y: 0 },
    []
  ]) {
    let started = false
    const out = await runBrowser(
      () => {
        started = true
        throw new Error('the browser must not start')
      },
      {
        mode: 'view',
        url: 'http://127.0.0.1/',
        origin: 'http://127.0.0.1',
        file: JSON.stringify(bad)
      }
    )
    assert.equal(started, false, JSON.stringify(bad))
    assert.deepEqual(parseBrowser(out), {
      ok: false,
      kind: 'error',
      error: 'the view request is not a JSON object with w, h and y'
    })
  }
  // Nor is a request that is not JSON at all.
  const notJson = await runBrowser(() => assert.fail('the browser must not start'), {
    mode: 'view',
    url: 'http://127.0.0.1/',
    origin: 'http://127.0.0.1',
    file: '{nope'
  })
  assert.equal(parseBrowser(notJson).ok, false)
})

test('🔒 BROWSER_SCRIPT (view): a final URL on ANOTHER origin is OFFSITE and no picture leaves', async () => {
  const out = await runBrowser(
    fakeChromiumCDP({ finalUrl: 'http://127.0.0.1:4322/', screenshotB64: VIEW_JPEG }),
    {
      mode: 'view',
      url: 'http://127.0.0.1:4321/',
      origin: 'http://127.0.0.1:4321',
      file: JSON.stringify({ w: 640, h: 800, y: 0 })
    }
  )
  const parsed = parseBrowser(out)
  assert.equal(parsed.ok, false)
  assert.equal(parsed.kind, 'offsite')
  assert.ok(!out.includes(VIEW_JPEG), 'the foreign page’s picture is never printed')
})

test('🔒 BROWSER_SCRIPT (view): a Chrome error page is a failed NAV, never a picture of this site', async () => {
  const out = await viewRun(
    { finalUrl: 'chrome-error://chromewebdata/', errorText: 'net::ERR_CONNECTION_REFUSED' },
    { w: 640, h: 800, y: 0 }
  )
  assert.deepEqual(parseBrowser(out), { ok: false, kind: 'nav', error: 'net::ERR_CONNECTION_REFUSED' })
  assert.ok(!out.includes(VIEW_JPEG))
})

test('browserArgv: a view carries its own settle and deadline, and the other modes’ argv is unchanged', () => {
  const base = { container: 'demo-web-1', url: 'http://127.0.0.1/', origin: 'http://127.0.0.1' }
  const shot = browserArgv({ ...base, mode: 'shot', file: '/site/demo/docs/agents/look/1.png' })
  assert.equal(shot.at(-1), '/site/demo/docs/agents/look/1.png', 'no timing arguments unless asked for')
  const request = JSON.stringify({ w: 640, h: 800, y: 0 })
  const view = browserArgv({ ...base, mode: 'view', file: request, deadlineMs: 16_000 })
  assert.deepEqual(view.slice(-3), [request, String(5000), '16000'])
})

test('🔒 BROWSER_SCRIPT: a MAIN-FRAME nav to another origin is FAILED and reported OFFSITE (active guard)', async () => {
  // The Fetch guard is not the same as the final-URL check: here the browser is TOLD to leave, and the
  // guard fails the request so the foreign page is never fetched under this URL — then reports where.
  const out = await runBrowser(
    fakeChromiumCDP({
      finalUrl: 'http://127.0.0.1:4321/',
      dom: '<html>ours</html>',
      offsiteNav: 'https://evil.example/phish'
    }),
    { mode: 'dom', url: 'http://127.0.0.1:4321/', origin: 'http://127.0.0.1:4321' }
  )
  const parsed = parseBrowser(out)
  assert.equal(parsed.ok, false)
  assert.equal(parsed.kind, 'offsite')
  assert.equal(parsed.error, 'https://evil.example/phish')
})

test('BROWSER_SCRIPT (dom): URL and HTML come back from a single evaluate (no read-to-read race)', async () => {
  // Both fields are produced by one JSON.stringify turn — the fake proves the script asks for them
  // together (the expression names outerHTML) rather than in two separate reads.
  let evaluates = 0
  const spawn = (() => {
    let dataCb = null
    const emit = (o) => {
      if (dataCb) {
        try {
          dataCb(Buffer.from(JSON.stringify(o) + '\0'))
        } catch (e) {
          if (!e || !e.__exit) throw e
        }
      }
    }
    const child = {
      pid: 7,
      on: () => {},
      kill: () => {},
      stdio: [
        null,
        null,
        null,
        {
          on: () => {},
          write: (s) => {
            const m = JSON.parse(String(s).replace(/\0$/, ''))
            const reply = (result) => emit({ id: m.id, result })
            if (m.method === 'Target.createTarget') return reply({ targetId: 'T' })
            if (m.method === 'Target.attachToTarget') return reply({ sessionId: 'S' })
            if (m.method === 'Page.getFrameTree') return reply({ frameTree: { frame: { id: 'MF' } } })
            if (m.method === 'Page.navigate') return reply({ frameId: 'MF' })
            if (m.method === 'Runtime.evaluate') {
              evaluates++
              assert.match(m.params.expression, /location\.href/)
              assert.match(m.params.expression, /outerHTML/) // both, in the one expression
              return reply({
                result: { value: JSON.stringify({ href: 'http://127.0.0.1/', html: '<html>x</html>' }) }
              })
            }
            return reply({})
          }
        },
        {
          on: (ev, cb) => {
            if (ev === 'data') dataCb = cb
          }
        }
      ]
    }
    return () => child
  })()
  const out = await runBrowser(spawn, { mode: 'dom', url: 'http://127.0.0.1/', origin: 'http://127.0.0.1' })
  assert.deepEqual(parseBrowser(out), { ok: true, finalUrl: 'http://127.0.0.1/', dom: '<html>x</html>' })
  assert.equal(evaluates, 1) // one turn, not two
})

/**
 * A fake node `http` for the public-origin route: records every request it is handed (the options
 * AND the headers the script set) and answers from `routes` by path.
 */
function fakeHttp(routes, seen) {
  return {
    request(opts, cb) {
      const handlers = {}
      const q = {
        on: (ev, fn) => ((handlers[ev] = fn), q),
        setTimeout: () => q,
        write: () => {},
        destroy: (e) => handlers.error && handlers.error(e),
        end: () => {
          seen.push(opts)
          const answer = routes[opts.path]
          if (!answer) return handlers.error && handlers.error(new Error('connect ECONNREFUSED'))
          const r = {
            statusCode: answer.status,
            headers: answer.headers ?? {},
            rawHeaders: Object.entries(answer.headers ?? {}).flat(),
            destroy: () => {},
            on: (ev, fn) => {
              if (ev === 'data' && answer.body) fn(Buffer.from(answer.body))
              if (ev === 'end') queueMicrotask(fn)
              return r
            }
          }
          cb(r)
        }
      }
      return q
    }
  }
}

test('🔒 PROBE_SCRIPT (public route): asks the loopback port with the public Host and forwarded scheme', async () => {
  const seen = []
  let fetched = false
  const out = await runScript(PROBE_SCRIPT, ['process', 'fetch', 'AbortSignal', 'require'], {
    argv: ['node', 'https://demo1.tracy.site/', '2000', '127.0.0.1:80'],
    fetch: async () => {
      fetched = true
      throw new Error('fetch must not be used on the public route')
    },
    AbortSignal,
    require: (name) =>
      name === 'http'
        ? fakeHttp({ '/': { status: 200, headers: { 'content-type': 'text/html' } } }, seen)
        : {}
  })
  assert.deepEqual(parseProbe(out), { ok: true, status: 200, finalUrl: 'https://demo1.tracy.site/' })
  assert.equal(fetched, false)
  assert.equal(seen.length, 1)
  // 🔒 the connection is the loopback port; the public name travels only as headers
  assert.equal(seen[0].host, '127.0.0.1')
  assert.equal(seen[0].port, 80)
  assert.equal(seen[0].headers.host, 'demo1.tracy.site')
  assert.equal(seen[0].headers['x-forwarded-proto'], 'https')

  // a hop off the public origin stops the probe there, reported raw and never dialled
  const seen2 = []
  const off = await runScript(PROBE_SCRIPT, ['process', 'fetch', 'AbortSignal', 'require'], {
    argv: ['node', 'https://demo1.tracy.site/a', '2000', '127.0.0.1:80'],
    fetch: async () => assert.fail('no fetch'),
    AbortSignal,
    require: () =>
      fakeHttp(
        {
          '/a': { status: 301, headers: { location: '/b' } },
          '/b': { status: 302, headers: { location: 'https://evil.example/' } }
        },
        seen2
      )
  })
  assert.deepEqual(parseProbe(off), {
    ok: false,
    redirect: { status: 302, from: 'https://demo1.tracy.site/b', location: 'https://evil.example/' }
  })
  assert.deepEqual(
    seen2.map((o) => o.path),
    ['/a', '/b']
  )

  // 🔒 a route that is not a loopback port is refused, never dialled
  const bad = await runScript(PROBE_SCRIPT, ['process', 'fetch', 'AbortSignal', 'require'], {
    argv: ['node', 'https://demo1.tracy.site/', '2000', '10.0.0.5:80'],
    fetch: async () => assert.fail('no fetch'),
    AbortSignal,
    require: () => assert.fail('no http')
  })
  assert.match(bad, /^TRACY_PROBE_ERR the probe route is not a loopback port/)
})

test('browserArgv: the public-origin route rides an ENV value, never argv or the script text', () => {
  const argv = browserArgv({
    container: 'demo9-web-1',
    mode: 'dom',
    url: 'https://demo9.tracy.site/',
    origin: 'https://demo9.tracy.site',
    resolverRule: '--host-resolver-rules=MAP demo9.tracy.site ~NOTFOUND',
    via: '127.0.0.1:80'
  })
  const e = argv.indexOf('TRACY_PUBLIC_VIA=127.0.0.1:80')
  assert.ok(e !== -1 && e < argv.indexOf('demo9-web-1'), 'the route is a docker env value')
  assert.equal(argv[e - 1], '-e')
  assert.deepEqual(argv.slice(-4), ['dom', 'https://demo9.tracy.site/', 'https://demo9.tracy.site', ''])
  assert.ok(!BROWSER_SCRIPT.includes('demo9.tracy.site'))
})

test("🔒 BROWSER_SCRIPT (public route): the page's own origin is served from loopback, others pass through", async () => {
  const cdp = []
  const seen = []
  let dataCb = null
  const emit = (o) => {
    if (dataCb) {
      try {
        dataCb(Buffer.from(JSON.stringify(o) + '\0'))
      } catch (e) {
        if (!e || !e.__exit) throw e
      }
    }
  }
  const paused = (requestId, url, resourceType) => ({
    method: 'Fetch.requestPaused',
    params: {
      requestId,
      frameId: 'MF',
      resourceType,
      request: { url, method: 'GET', headers: { Accept: '*/*', Host: 'spoofed.example' } }
    }
  })
  const child = {
    pid: 9,
    on: () => {},
    kill: () => {},
    stdio: [
      null,
      null,
      null,
      {
        on: () => {},
        write: (str) => {
          const m = JSON.parse(String(str).replace(/\0$/, ''))
          cdp.push(m)
          const reply = (result) => emit({ id: m.id, result })
          if (m.method === 'Target.createTarget') return reply({ targetId: 'T' })
          if (m.method === 'Target.attachToTarget') return reply({ sessionId: 'S' })
          if (m.method === 'Page.getFrameTree') return reply({ frameTree: { frame: { id: 'MF' } } })
          if (m.method === 'Page.navigate') {
            reply({ frameId: 'MF' })
            queueMicrotask(() => {
              emit(paused('R1', 'https://demo1.tracy.site/', 'Document'))
              emit(paused('R2', 'https://demo1.tracy.site/style.css', 'Stylesheet'))
              emit(paused('R3', 'https://fonts.example/f.css', 'Stylesheet'))
            })
            return
          }
          if (m.method === 'Runtime.evaluate')
            return reply({
              result: {
                value: JSON.stringify({ href: 'https://demo1.tracy.site/', html: '<html>ours</html>' })
              }
            })
          return reply({})
        }
      },
      {
        on: (ev, cb) => {
          if (ev === 'data') dataCb = cb
        }
      }
    ]
  }
  const out = await runScript(BROWSER_SCRIPT, ['require', 'process'], {
    require: (name) =>
      name === 'child_process'
        ? { spawn: () => child }
        : name === 'fs'
          ? { writeFileSync: () => {}, mkdtempSync: (pre) => pre + '0', rmSync: () => {} }
          : name === 'os'
            ? { tmpdir: () => '/tmp' }
            : name === 'path'
              ? { join: (...a) => a.join('/') }
              : name === 'http'
                ? fakeHttp(
                    {
                      '/': {
                        status: 200,
                        headers: { 'Content-Type': 'text/html', 'Content-Length': '17' },
                        body: '<html>ours</html>'
                      },
                      '/style.css': { status: 200, headers: { 'Content-Type': 'text/css' }, body: 'p{}' }
                    },
                    seen
                  )
                : {},
    env: { TRACY_PUBLIC_VIA: '127.0.0.1:80' },
    argv: ['node', 'dom', 'https://demo1.tracy.site/', 'https://demo1.tracy.site', '', '20', '4000', '1000']
  })
  assert.deepEqual(parseBrowser(out), {
    ok: true,
    finalUrl: 'https://demo1.tracy.site/',
    dom: '<html>ours</html>'
  })
  // every request is paused on this route, not just Documents
  const enable = cdp.find((m) => m.method === 'Fetch.enable')
  assert.deepEqual(enable.params.patterns, [{ urlPattern: '*', requestStage: 'Request' }])
  // 🔒 the two requests to the page's own origin went to the loopback port, as the public name
  assert.deepEqual(
    seen.map((o) => [o.host, o.port, o.path, o.headers.host, o.headers['x-forwarded-proto']]),
    [
      ['127.0.0.1', 80, '/', 'demo1.tracy.site', 'https'],
      ['127.0.0.1', 80, '/style.css', 'demo1.tracy.site', 'https']
    ]
  )
  assert.ok(!seen.some((o) => 'Host' in o.headers), "the browser's own Host header is replaced, not kept")
  const fulfilled = cdp.filter((m) => m.method === 'Fetch.fulfillRequest')
  assert.deepEqual(
    fulfilled.map((m) => m.params.requestId),
    ['R1', 'R2']
  )
  assert.equal(Buffer.from(fulfilled[0].params.body, 'base64').toString(), '<html>ours</html>')
  // framing headers are dropped: chromium gets the decoded body, not a stale length
  assert.deepEqual(fulfilled[0].params.responseHeaders, [{ name: 'Content-Type', value: 'text/html' }])
  // a request to another origin takes the ordinary path
  const continued = cdp.filter((m) => m.method === 'Fetch.continueRequest').map((m) => m.params.requestId)
  assert.deepEqual(continued, ['R3'])
})

test('🔒 BROWSER_SCRIPT (public route): a route that is not a loopback port is refused before chromium', async () => {
  let spawned = false
  const out = await runScript(BROWSER_SCRIPT, ['require', 'process'], {
    require: (name) =>
      name === 'child_process'
        ? {
            spawn: () => {
              spawned = true
              throw new Error('must not spawn')
            }
          }
        : name === 'fs'
          ? { writeFileSync: () => {}, mkdtempSync: (pre) => pre + '0', rmSync: () => {} }
          : name === 'os'
            ? { tmpdir: () => '/tmp' }
            : name === 'path'
              ? { join: (...a) => a.join('/') }
              : {},
    env: { TRACY_PUBLIC_VIA: 'evil.example:80' },
    argv: ['node', 'dom', 'https://demo1.tracy.site/', 'https://demo1.tracy.site', '', '5', '4000', '1000']
  })
  assert.match(out, /^TRACY_BROWSER ERR the public route is not a loopback port/)
  assert.equal(spawned, false)
})

test('the browser deadline stays under the container timeout backstop', () => {
  assert.ok(BROWSER_DEADLINE_MS < BROWSER_CONTAINER_TIMEOUT_S * 1000)
})

test('the MCP fetch abort budget stays under the host’s docker-client timeout', () => {
  // index.ts keeps MCP_TIMEOUT_MS, the docker client's timeout, module-private; this must fire first.
  const index = readFixture(new URL('../src/host/index.ts', import.meta.url), 'utf8')
  const timeout = /^const MCP_TIMEOUT_MS = ([\d_]+)$/m.exec(index)?.[1]
  assert.ok(timeout, 'index.ts no longer declares MCP_TIMEOUT_MS as a plain number')
  assert.ok(MCP_FETCH_ABORT_MS < Number(timeout.replaceAll('_', '')))
})

// ── page.text's static read: the container's own curl (F2 §5.1) ──────────────────────────────────

const NONCE = `TRACY_FETCH_${'0123456789abcdef'.repeat(2)}`
const fetchInput = (over = {}) => ({
  container: 'demo1-web-1',
  connectPort: 80,
  pathAndQuery: '/p',
  host: 'demo1.tracy.test:51710',
  proto: /** @type {'http'} */ ('http'),
  nonce: NONCE,
  ...over
})

test('🔒 fetchArgv: one curl GET as www-data, `-q` FIRST, never following, loopback URL last', () => {
  const argv = fetchArgv(fetchInput())
  assert.deepEqual(argv.slice(0, 6), ['exec', '-u', 'www-data', 'demo1-web-1', 'curl', '-q'])
  const flagPair = (flag) => argv[argv.indexOf(flag) + 1]
  for (const flag of ['--globoff', '--silent', '--show-error', '--include'])
    assert.ok(argv.includes(flag), flag)
  assert.equal(flagPair('--noproxy'), '*')
  assert.equal(flagPair('--proto'), '=http')
  assert.equal(flagPair('--max-time'), '8')
  assert.equal(flagPair('--max-filesize'), String(FETCH_MAX_BYTES))
  assert.equal(flagPair('--max-filesize'), '4194304')
  assert.equal(flagPair('--user-agent'), FETCH_USER_AGENT)
  assert.equal(flagPair('--output'), '-')
  assert.equal(flagPair('--write-out'), `\n${NONCE} %{http_code} %{size_download}\n`)
  const headers = argv.flatMap((a, i) => (a === '--header' ? [argv[i + 1]] : []))
  assert.deepEqual(headers, [
    'Host: demo1.tracy.test:51710',
    'X-Forwarded-Proto: http',
    'Accept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
    'Accept-Encoding: identity'
  ])
  assert.equal(argv.at(-1), 'http://127.0.0.1/p')
  assert.equal(fetchArgv(fetchInput({ connectPort: 4321 })).at(-1), 'http://127.0.0.1:4321/p')
  // 🔒 nothing that follows, nothing that runs a shell, nothing that needs node.
  for (const banned of ['-L', '--location', 'sh', '-c', 'node', '--insecure', '-k'])
    assert.ok(!argv.includes(banned), banned)
  assert.equal(
    fetchArgv(fetchInput({ maxTimeS: 3 }))[fetchArgv(fetchInput({ maxTimeS: 3 })).indexOf('--max-time') + 1],
    '3'
  )
})

test('🔒 fetchArgv refuses a host, proto, path, nonce or container it cannot vouch for (no header injection)', () => {
  for (const host of [
    'demo1.tracy.test\r\nX-Evil: 1',
    'a b',
    'user@demo1.tracy.test',
    'demo1.tracy.test/x',
    '',
    'demo1.tracy.test:51710\n'
  ])
    assert.throws(() => fetchArgv(fetchInput({ host })), /host/, JSON.stringify(host))
  assert.throws(() => fetchArgv(fetchInput({ proto: 'ftp' })), /proto/)
  for (const pathAndQuery of ['/a b', 'p', '', '/a\nb', '/café'])
    assert.throws(() => fetchArgv(fetchInput({ pathAndQuery })), /path/, JSON.stringify(pathAndQuery))
  for (const nonce of ['TRACY_FETCH_short', 'x', `TRACY_FETCH_${'G'.repeat(32)}`])
    assert.throws(() => fetchArgv(fetchInput({ nonce })), /nonce/)
  for (const container of ['--privileged', 'demo1', 'Demo1-web-1', 'a;b-web-1'])
    assert.throws(() => fetchArgv(fetchInput({ container })), /container/)
  // the authorities the page read really uses pass
  for (const host of ['127.0.0.1', '127.0.0.1:51710', 'wp-dmlj6g.tracy.test:51710', 'demo1.tracy.site'])
    assert.equal(fetchArgv(fetchInput({ host })).includes(`Host: ${host}`), true)
})

/** One curl output as the transport returns it: status line, headers, blank line, body, closing line. */
const curlOut = (status, headers, body, nonce = NONCE) =>
  `HTTP/1.1 ${status} X\r\n${Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}\r\n`)
    .join('')}\r\n${body}\n${nonce} ${status} ${Buffer.byteLength(body)}\n`

test('parseFetch: status, headers (any case), body; a relative or absolute Location read raw', () => {
  const ok = parseFetch(curlOut(200, { 'content-type': 'text/html; charset=utf-8' }, '<p>hi</p>'), NONCE)
  assert.deepEqual(ok, {
    ok: true,
    status: 200,
    location: '',
    contentType: 'text/html; charset=utf-8',
    contentEncoding: '',
    body: '<p>hi</p>'
  })
  const rel = parseFetch(curlOut(301, { LOCATION: '/en/' }, ''), NONCE)
  assert.equal(rel.ok && rel.location, '/en/')
  const abs = parseFetch(curlOut(301, { Location: 'http://j-x.tracy.test:51710/en/' }, 'moved'), NONCE)
  assert.equal(abs.ok && abs.location, 'http://j-x.tracy.test:51710/en/')
  assert.equal(abs.ok && abs.body, 'moved')
  // a bare \n\n separator (some servers) is a separator too
  const lf = parseFetch(`HTTP/1.0 200 OK\nContent-Encoding: gzip\n\nbody\n${NONCE} 200 4\n`, NONCE)
  assert.equal(lf.ok && lf.contentEncoding, 'gzip')
  assert.equal(lf.ok && lf.body, 'body')
})

test('parseFetch: an interim 100 Continue block is skipped; the final block holds the headers', () => {
  const out = `HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 404 Not Found\r\nContent-Type: text/html\r\n\r\n<h1>Nope</h1>\n${NONCE} 404 13\n`
  const got = parseFetch(out, NONCE)
  assert.equal(got.ok && got.status, 404)
  assert.equal(got.ok && got.contentType, 'text/html')
  assert.equal(got.ok && got.body, '<h1>Nope</h1>')
})

test('🔒 parseFetch: no closing line is a CUT read, never a page; 000 is no answer', () => {
  assert.deepEqual(parseFetch('HTTP/1.1 200 OK\r\n\r\n<p>half a pa', NONCE).ok, false)
  assert.equal(parseFetch('HTTP/1.1 200 OK\r\n\r\n<p>half a pa', NONCE).kind, 'cut')
  assert.equal(parseFetch(`\n${NONCE} 000 0\n`, NONCE).kind, 'no-answer')
  assert.equal(parseFetch('', NONCE).kind, 'cut')
})

test("🔒 parseFetch: a body carrying ANOTHER nonce's closing line is body, not the end of the read", () => {
  const forged = `\nTRACY_FETCH_${'f'.repeat(32)} 200 5\n`
  const got = parseFetch(curlOut(200, {}, `<p>a</p>${forged}<p>b</p>`), NONCE)
  assert.equal(got.ok, true)
  assert.equal(got.ok && got.body, `<p>a</p>${forged}<p>b</p>`)
  // and a page that ends early but forges OUR nonce cannot exist: the nonce is fresh per call
  assert.match(NONCE, FETCH_NONCE)
})

test('🔒 looksLikeMissingBinary: the r2 OCI line on STDOUT is a missing program; a page mentioning it is not', () => {
  // r2 j-1ibzqi C00, verbatim (`$S/specs/v2/r2-errors-examples.json`): docker wrote it on stdout.
  const oci =
    'OCI runtime exec failed: exec failed: unable to start container process: exec: "node": executable file not found in $PATH\r\n'
  assert.equal(looksLikeMissingBinary({ code: 0, stdout: oci, stderr: '' }), true)
  assert.equal(looksLikeMissingBinary({ code: 1, stdout: oci.replace('"node"', '"curl"'), stderr: '' }), true)
  // a real answer starts with HTTP/ or TRACY_…; words about OCI inside it are the page's own
  assert.equal(
    looksLikeMissingBinary({ code: 0, stdout: `HTTP/1.1 200 OK\r\n\r\n<p>${oci}</p>`, stderr: '' }),
    false
  )
  assert.equal(
    looksLikeMissingBinary({ code: 0, stdout: `TRACY_BROWSER OK http://127.0.0.1/\n${oci}`, stderr: '' }),
    false
  )
})

/**
 * 🔒 THE REAL CURL, THE REAL ARGV. Every flag above is a claim about curl's behaviour; this runs the
 * argv the transport runs (minus `exec -u www-data <container>`) against a local server, with a
 * hostile `.curlrc` (`location`, `proxy`) and proxy variables in the environment. It needs `curl` on
 * the machine — CI's `tracy-check` image included. It does NOT skip without it: a skipped security
 * test is a green that tested nothing.
 */
test('🔒 real curl: one request, the given Host, no redirect followed, .curlrc and proxy env ignored, 5 MiB refused', async () => {
  /** @type {{ url: string | undefined, host: string | undefined, xfp: unknown }[]} */
  const seen = []
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url, host: req.headers.host, xfp: req.headers['x-forwarded-proto'] })
    if (req.url === '/r') {
      res.writeHead(301, { Location: '/target' })
      res.end('moved')
      return
    }
    if (req.url === '/big') {
      res.writeHead(200, { 'Content-Length': String(5 * 1024 * 1024) })
      res.end(Buffer.alloc(5 * 1024 * 1024))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end('<html lang="en"><title>T</title><p>hello</p></html>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)))
  const port = /** @type {import('node:net').AddressInfo} */ (server.address()).port
  const home = mkdtempSync(path.join(tmpdir(), 'tch-curlrc-'))
  const leak = path.join(home, 'leak.html')
  writeFileSync(path.join(home, '.curlrc'), `location\nproxy = http://127.0.0.1:9\noutput = ${leak}\n`)
  /** @type {Record<string, string | undefined>} */
  const env = {
    ...process.env,
    HOME: home,
    CURL_HOME: home,
    http_proxy: 'http://127.0.0.1:9',
    HTTP_PROXY: 'http://127.0.0.1:9',
    ALL_PROXY: 'http://127.0.0.1:9'
  }
  // 🔒 A runner whose environment exempts 127.0.0.1 (or `*`) from proxies would let curl bypass the
  // planted proxy by itself, and this test would pass without `--noproxy '*'` — so the exemption goes.
  delete env.no_proxy
  delete env.NO_PROXY
  /** @param {string} p */
  const run = (p) => {
    const argv = fetchArgv(
      fetchInput({ connectPort: port, pathAndQuery: p, host: 'demo1.tracy.test:51710', proto: 'https' })
    )
    assert.deepEqual(argv.slice(0, 5), ['exec', '-u', 'www-data', 'demo1-web-1', 'curl'])
    return new Promise((resolve) =>
      execFile(
        'curl',
        argv.slice(5),
        { env, maxBuffer: FETCH_MAX_BYTES + 256 * 1024 },
        (error, stdout, stderr) =>
          resolve({ code: error ? error.code : 0, stdout: String(stdout), stderr: String(stderr) })
      )
    )
  }
  try {
    const page = /** @type {any} */ (await run('/'))
    assert.equal(page.code, 0, page.stderr)
    const got = parseFetch(page.stdout, NONCE)
    assert.equal(got.ok, true, page.stdout.slice(0, 200))
    assert.equal(got.ok && got.status, 200)
    assert.match(got.ok ? got.body : '', /<p>hello<\/p>/)
    assert.deepEqual(seen, [{ url: '/', host: 'demo1.tracy.test:51710', xfp: 'https' }])

    const moved = /** @type {any} */ (await run('/r'))
    const m = parseFetch(moved.stdout, NONCE)
    assert.equal(m.ok && m.status, 301)
    assert.equal(m.ok && m.location, '/target')
    assert.equal(
      seen.length,
      2,
      'the redirect was NOT followed — not by -L, not by a planted .curlrc `location`'
    )

    const big = /** @type {any} */ (await run('/big'))
    assert.equal(big.code, 63, 'a declared 5 MiB body is refused by curl itself')
    assert.equal(existsSync(leak), false, 'the planted .curlrc `output` was never read')
  } finally {
    server.close()
  }
})

// ── The replace job's two EmDash scripts (PLAN v2 P11, F3 §6.1) ─────────────────────────────────
//
// Run for real against an in-memory EmDash MCP door (`test/fixtures/replace/emdash/fake-emdash.mjs`),
// with the bench baseline of benchemdash01 as its content.

const EMDASH_SITE = JSON.parse(
  readFixture(new URL('./fixtures/replace/emdash/site.json', import.meta.url), 'utf8')
)
const sha = (s) => createHash('sha256').update(s).digest('hex')
const revOfRow = (r) => Buffer.from(`${r.version}:${r.updatedAt}`, 'utf8').toString('base64')

test('🔒 MCP_SCRIPT is byte-for-byte what it was before the prelude was extracted (sha256 pinned)', () => {
  // Computed 25/09/2026 from `git show aea3a4ebd:…/src/host/exec.mjs` (PR1), before P11 touched it.
  assert.equal(sha(MCP_SCRIPT), 'edb7e21dfb677f1a47df1eec1121f2143ea02d4b803f799f3d11d2e8212cd109')
  assert.ok(MCP_SCRIPT.startsWith(MCP_TOKEN_PRELUDE))
})

test('🔒 all three token-bearing scripts start with the SAME custody prelude', () => {
  for (const s of [MCP_SCRIPT, EMDASH_INDEX_SCRIPT, EMDASH_WRITE_SCRIPT])
    assert.ok(s.startsWith(MCP_TOKEN_PRELUDE))
})

test('🔒 the INDEX allowlist is exactly EmDash’s read-only tools, the WRITE allowlist exactly three', () => {
  assert.deepEqual([...EMDASH_INDEX_TOOLS].sort(), [...EMDASH_READ_TOOLS].sort())
  assert.deepEqual([...EMDASH_WRITE_TOOLS], ['content_update', 'menu_set_items', 'settings_update'])
  assert.ok(EMDASH_INDEX_SCRIPT.includes(`const ALLOW=new Set(${JSON.stringify(EMDASH_INDEX_TOOLS)})`))
  assert.ok(EMDASH_WRITE_SCRIPT.includes(`const ALLOW=new Set(${JSON.stringify(EMDASH_WRITE_TOOLS)})`))
})

test('🔒 no GET inside a token-bearing script (D2): one fetch, and its only address is EmDash’s MCP', () => {
  for (const s of [EMDASH_INDEX_SCRIPT, EMDASH_WRITE_SCRIPT]) {
    assert.equal(s.split('fetch(').length - 1, 1, 'exactly one fetch call site')
    const urls = s.match(/https?:\/\/[^"'`\s]+/g) ?? []
    assert.deepEqual([...new Set(urls)], [EMDASH_MCP_LOOPBACK])
    assert.ok(s.includes('method:"POST",redirect:"error"'))
  }
})

test('the run-wide deadline fires inside the docker client’s timeout, with room to answer', () => {
  assert.ok(EMDASH_SCRIPT_DEADLINE_MS + 10_000 <= EMDASH_INDEX_MS)
  assert.ok(EMDASH_SCRIPT_DEADLINE_MS + 10_000 <= EMDASH_WRITE_MS)
  assert.ok(EMDASH_WRITE_MIN_LEFT_MS < EMDASH_SCRIPT_DEADLINE_MS)
})

test('emdash script argv: the container’s node AS ROOT with -i; only a site web container', () => {
  assert.deepEqual(emdashIndexArgv({ container: 'bench9-web-1' }), [
    'exec',
    '-i',
    '-u',
    '0',
    'bench9-web-1',
    'node',
    '-e',
    EMDASH_INDEX_SCRIPT
  ])
  assert.equal(emdashWriteArgv({ container: 'bench9-web-1' })[7], EMDASH_WRITE_SCRIPT)
  for (const bad of ['tracy-dsh', '--privileged', 'x-web-1;rm', 'Bench-web-1'])
    assert.throws(() => emdashIndexArgv({ container: bad }), TypeError)
})

test('INDEX: a missing token is NO_TOKEN by name, and not one call is made', async () => {
  const emdash = createFakeEmdash(EMDASH_SITE)
  const out = await runOnFake(EMDASH_INDEX_SCRIPT, { fetch: emdash.fetch, stdin: {}, token: null })
  assert.equal(out, 'TRACY_MCP_ERR NO_TOKEN the agent token file is not present')
  assert.equal(emdash.calls.length, 0)
  const got = parseEmdashIndex(out)
  assert.equal(got.ok === false && got.kind, 'no-token')
})

test('INDEX: one language, every published entry, the menus, terms and settings — reads only, POST to loopback', async () => {
  const emdash = createFakeEmdash(EMDASH_SITE)
  const out = await runOnFake(EMDASH_INDEX_SCRIPT, {
    fetch: emdash.fetch,
    stdin: { locales: ['en'], collections: ['site', 'home'], menus: true, terms: true, settings: true }
  })
  const got = parseEmdashIndex(out)
  assert.equal(got.ok, true, out.slice(0, 200))
  const v = /** @type {any} */ (got.ok && got.value)
  assert.deepEqual(v.served, ['en', 'ru', 'vi'], 'served = the locales of the published site rows')
  assert.deepEqual([...new Set(v.rows.map((r) => `${r.collection}@${r.locale}`))].sort(), [
    'home@en',
    'site@en'
  ])
  const home = v.rows.find((r) => r.collection === 'home')
  assert.equal(home.id, '01M36TA83763RSVSN5R28DZ0AZ')
  assert.equal(typeof home.version, 'number')
  assert.equal(typeof home.updatedAt, 'string')
  assert.ok('draftRevisionId' in home && 'liveRevisionId' in home)
  assert.deepEqual(v.menus.map((m) => m.name).sort(), [
    'footer_company',
    'footer_legal',
    'footer_services',
    'primary',
    'resources_kit',
    'topbar'
  ])
  assert.ok(v.terms.some((t) => t.taxonomy === 'category' && t.label === 'Disclosures'))
  assert.equal(v.settings.title, 'Northgate Industrial')
  assert.deepEqual(v.missing, [])
  for (const c of emdash.calls) {
    assert.ok(EMDASH_READ_TOOLS.has(c.name), `${c.name} is a read`)
    assert.equal(c.url, EMDASH_MCP_LOOPBACK)
    assert.equal(c.method, 'POST')
    assert.equal(c.redirect, 'error')
    assert.equal(c.auth, `Bearer ${FAKE_TOKEN}`)
  }
  assert.ok(emdash.calls.every((c) => c.name !== 'content_list' || c.args.status === 'published'))
})

test('INDEX: a collection this site lacks is skipped and named, never the whole read; cursors are followed', async () => {
  const emdash = createFakeEmdash(EMDASH_SITE, { pageSize: 2 })
  const out = await runOnFake(EMDASH_INDEX_SCRIPT, {
    fetch: emdash.fetch,
    stdin: {
      locales: ['en'],
      collections: ['projects', 'no_such'],
      menus: false,
      terms: false,
      settings: false
    }
  })
  const v = /** @type {any} */ (parseEmdashIndex(out))
  assert.equal(v.ok, true, out.slice(0, 200))
  assert.deepEqual(v.value.missing, ['no_such'])
  const projects = EMDASH_SITE.rows.filter((r) => r.collection === 'projects' && r.locale === 'en')
  assert.equal(v.value.rows.length, projects.length, 'every page of 2 was read')
  assert.ok(
    emdash.calls.filter((c) => c.name === 'content_list' && c.args.collection === 'projects').length >= 5
  )
  assert.ok(!emdash.calls.some((c) => c.name.startsWith('menu') || c.name.startsWith('taxonomy')))
})

test('🔒 INDEX: only [NOT_FOUND] is "not on this site" — any other refusal fails the whole read, a menu included', async () => {
  const stdin = {
    locales: ['en'],
    collections: ['site', 'projects'],
    menus: true,
    terms: false,
    settings: false
  }
  for (const [tool, text] of /** @type {const} */ ([
    ['content_list', '[INTERNAL_ERROR] database is locked'],
    ['content_list', '[FORBIDDEN] insufficient scope'],
    ['menu_get', '[INTERNAL_ERROR] database is locked']
  ])) {
    const emdash = createFakeEmdash(EMDASH_SITE, {
      fault: (name, args) =>
        name === tool && (tool !== 'content_list' || args.collection === 'projects')
          ? { isError: text }
          : undefined
    })
    const got = parseEmdashIndex(await runOnFake(EMDASH_INDEX_SCRIPT, { fetch: emdash.fetch, stdin }))
    assert.equal(got.ok, false, `${tool} ${text}`)
    assert.equal(/** @type {any} */ (got).kind, 'tool')
    assert.match(/** @type {any} */ (got).error, new RegExp(`^${tool}: \\[`))
  }
  const noMenu = createFakeEmdash(EMDASH_SITE, {
    fault: (name, args) =>
      name === 'menu_get' && args.name === 'topbar'
        ? { isError: '[NOT_FOUND] Menu "topbar" not found' }
        : undefined
  })
  const v = /** @type {any} */ (
    parseEmdashIndex(await runOnFake(EMDASH_INDEX_SCRIPT, { fetch: noMenu.fetch, stdin }))
  )
  assert.equal(v.ok, true)
  assert.deepEqual(v.value.missing, ['menu topbar'])
  assert.ok(!v.value.menus.some((/** @type {any} */ m) => m.name === 'topbar'))
})

test('INDEX: a template with no `site` collection reads on — [NOT_FOUND] and EmDash 1.0.1 [COLLECTION_NOT_FOUND] alike', async () => {
  // SaaS 1.2.0 has no `site` collection; EmDash 1.0.1 answers content_list for it with
  // [COLLECTION_NOT_FOUND] (quickstart smoke H2), where the stand answered [NOT_FOUND]. Both mean the
  // collection is not on this site, so the read takes the no-site road (served: null) instead of
  // failing as TOOL — the same pair emdash-call.mjs's NO_COLLECTION already knows.
  for (const code of ['NOT_FOUND', 'COLLECTION_NOT_FOUND']) {
    const emdash = createFakeEmdash(EMDASH_SITE, {
      fault: (name, args) =>
        name === 'content_list' && (args.collection === 'site' || args.collection === 'no_such')
          ? { isError: `[${code}] Collection "${args.collection}" not found` }
          : undefined
    })
    const got = parseEmdashIndex(
      await runOnFake(EMDASH_INDEX_SCRIPT, {
        fetch: emdash.fetch,
        stdin: { collections: ['projects', 'no_such'], menus: false, terms: false, settings: false }
      })
    )
    assert.equal(got.ok, true, `${code}: ${JSON.stringify(got)}`)
    const v = /** @type {any} */ (got.ok && got.value)
    assert.equal(v.served, null, `${code}: no site collection → served null`)
    assert.deepEqual(v.missing, ['no_such'], `${code}: a missing collection is named, not fatal`)
    assert.ok(v.rows.some((/** @type {any} */ r) => r.collection === 'projects'))
  }
})

test('🔒 INDEX: a site echoing the token cannot leak it — the one line is redacted', async () => {
  const emdash = createFakeEmdash(EMDASH_SITE, {
    fault: (name) =>
      name === 'settings_get' ? { isError: `[INTERNAL] you sent Bearer ${FAKE_TOKEN}` } : undefined
  })
  const out = await runOnFake(EMDASH_INDEX_SCRIPT, {
    fetch: emdash.fetch,
    stdin: { locales: ['en'], collections: [], menus: false, terms: false, settings: true }
  })
  assert.ok(!out.includes(FAKE_TOKEN), out)
  assert.match(out, /^TRACY_EMDASH_ERR TOOL settings_get/)
  assert.match(out, /\[REDACTED\]/)
})

test('INDEX: a request that is not names is refused before any call', async () => {
  const emdash = createFakeEmdash(EMDASH_SITE)
  const out = await runOnFake(EMDASH_INDEX_SCRIPT, { fetch: emdash.fetch, stdin: { locales: ['en; drop'] } })
  assert.match(out, /^TRACY_EMDASH_ERR REFUSED locales must be a list of names/)
  assert.equal(emdash.calls.length, 0)
})

test('INDEX: past the deadline the script says so in its one line (DEADLINE), never nothing', async () => {
  const timers = manualTimers()
  const emdash = createFakeEmdash(EMDASH_SITE, {
    fault: (name) => (name === 'menu_get' ? 'hang' : undefined)
  })
  const pending = runOnFake(EMDASH_INDEX_SCRIPT, {
    fetch: emdash.fetch,
    stdin: { locales: ['en'], collections: [], menus: ['primary'] },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout
  })
  await new Promise((r) => setTimeout(r, 20))
  timers.fire()
  const out = await pending
  assert.equal(out, `TRACY_EMDASH_ERR DEADLINE the index ran past ${EMDASH_SCRIPT_DEADLINE_MS} ms`)
  assert.equal(
    parseEmdashIndex(out).ok === false && /** @type {any} */ (parseEmdashIndex(out)).kind,
    'deadline'
  )
})

const siteEn = () => EMDASH_SITE.rows.find((r) => r.collection === 'site' && r.locale === 'en')
const homeEn = () => EMDASH_SITE.rows.find((r) => r.collection === 'home' && r.locale === 'en')
const updateOp = (row, data) => ({
  tool: 'content_update',
  args: {
    collection: row.collection,
    id: row.id,
    locale: row.locale,
    _rev: revOfRow(row),
    data,
    status: 'published'
  }
})

test('🔒 WRITE: every op is checked BEFORE the first call — one bad op refuses the whole run, nothing sent', async () => {
  const good = updateOp(homeEn(), { projects_title: 'Featured projects' })
  const bad = [
    [
      { tool: 'content_delete', args: { collection: 'home', id: homeEn().id } },
      /content_delete is not a write this job makes/
    ],
    [{ ...good, args: { ...good.args, id: 'home' } }, /id must be the entry's ULID, never a slug/],
    [{ ...good, args: { ...good.args, status: 'draft' } }, /status must be published/],
    [{ ...good, args: { ...good.args, _rev: '' } }, /_rev is missing/],
    [
      { ...good, args: { ...good.args, slug: 'x' } },
      /content_update takes collection, id, locale, _rev, data, status/
    ],
    [{ ...good, args: { ...good.args, data: {} } }, /data must name the fields changed/],
    [{ tool: 'settings_update', args: { postsPerPage: '9' } }, /settings_update takes title or tagline/],
    [{ tool: 'menu_set_items', args: { name: 'topbar', locale: 'en', items: [] } }, /menuHash is missing/],
    [
      { tool: 'menu_set_items', args: { name: 'topbar', items: [] }, menuHash: 'a'.repeat(64) },
      /a menu is written in one locale/
    ],
    [
      {
        tool: 'menu_set_items',
        args: { name: 'topbar', locale: 'en', items: [], parentId: 'x' },
        menuHash: 'a'.repeat(64)
      },
      /menu_set_items takes name, locale, items/
    ],
    [{ ...good, menuHash: 'a'.repeat(64) }, /menuHash belongs to a menu/]
  ]
  for (const [op, why] of bad) {
    const emdash = createFakeEmdash(EMDASH_SITE)
    const out = await runOnFake(EMDASH_WRITE_SCRIPT, { fetch: emdash.fetch, stdin: { ops: [good, op] } })
    assert.match(out, /^TRACY_EMDASH_ERR REFUSED op 1: /)
    assert.match(out, why)
    assert.equal(emdash.calls.length, 0, `nothing sent for ${JSON.stringify(op).slice(0, 60)}`)
  }
  const none = await runOnFake(EMDASH_WRITE_SCRIPT, {
    fetch: createFakeEmdash(EMDASH_SITE).fetch,
    stdin: { ops: [] }
  })
  assert.match(none, /^TRACY_EMDASH_ERR REFUSED ops must be a list of 1 to 200/)
})

test('WRITE: ops land in order; EmDash’s own _rev is checked against the computed formula', async () => {
  const emdash = createFakeEmdash(EMDASH_SITE)
  const out = await runOnFake(EMDASH_WRITE_SCRIPT, {
    fetch: emdash.fetch,
    stdin: {
      ops: [
        updateOp(homeEn(), { projects_title: 'Featured projects' }),
        { tool: 'settings_update', args: { title: 'Northgate Group' } }
      ]
    }
  })
  const got = /** @type {any} */ (parseEmdashWrite(out))
  assert.equal(got.ok, true, out)
  assert.deepEqual(got.value.results, [
    { i: 0, ok: true, revFormula: true },
    { i: 1, ok: true }
  ])
  assert.equal(got.value.inFlight, null)
  assert.equal(got.value.deadline, false)
  assert.equal(emdash.row('home', 'home', 'en').data.projects_title, 'Featured projects')
  assert.equal(emdash.state.settings.title, 'Northgate Group')
  assert.deepEqual(
    emdash.calls.map((c) => c.name),
    ['content_update', 'settings_update']
  )
})

test('WRITE: a refusal stops the run at that op — the ops after it are never sent', async () => {
  const emdash = createFakeEmdash(EMDASH_SITE)
  const stale = { ...updateOp(siteEn(), { hours: 'x' }) }
  stale.args = { ...stale.args, _rev: 'MTpzdGFsZQ==' }
  const out = await runOnFake(EMDASH_WRITE_SCRIPT, {
    fetch: emdash.fetch,
    stdin: {
      ops: [
        updateOp(homeEn(), { band_title: 'New' }),
        stale,
        { tool: 'settings_update', args: { title: 'Never' } }
      ]
    }
  })
  const got = /** @type {any} */ (parseEmdashWrite(out))
  assert.equal(got.ok, true)
  assert.equal(got.value.results.length, 2)
  assert.equal(got.value.results[1].ok, false)
  assert.match(got.value.results[1].error, /^content_update: \[CONFLICT\]/)
  assert.equal(got.value.inFlight, null, 'a refusal is an answer: nothing is in doubt')
  assert.equal(emdash.state.settings.title, 'Northgate Industrial')
  assert.ok(!emdash.calls.some((c) => c.name === 'settings_update'))
})

test('🔒 WRITE: a menu is compared with the one the plan was built on — another menu is MENU_CHANGED, not overwritten', async () => {
  const emdash = createFakeEmdash(EMDASH_SITE)
  const menu = emdash.menu('topbar', 'en')
  const op = {
    tool: 'menu_set_items',
    args: { name: 'topbar', locale: 'en', items: [{ label: 'Jobs', type: 'custom', customUrl: '/careers' }] },
    menuHash: createHash('sha256').update(JSON.stringify(menu.items)).digest('hex')
  }
  menu.items[1].label = 'Someone else'
  const out = await runOnFake(EMDASH_WRITE_SCRIPT, { fetch: emdash.fetch, stdin: { ops: [op] } })
  const got = /** @type {any} */ (parseEmdashWrite(out))
  assert.deepEqual(got.value.results, [
    { i: 0, ok: false, error: 'MENU_CHANGED the menu changed since it was read' }
  ])
  assert.deepEqual(
    emdash.calls.map((c) => c.name),
    ['menu_get']
  )
})

test('🔒 WRITE: an answer that never came leaves that op IN FLIGHT (may have landed), the rest unsent', async () => {
  const emdash = createFakeEmdash(EMDASH_SITE, {
    fault: (name, args) => (name === 'content_update' && args.collection === 'site' ? 'drop' : undefined)
  })
  const out = await runOnFake(EMDASH_WRITE_SCRIPT, {
    fetch: emdash.fetch,
    stdin: {
      ops: [
        updateOp(homeEn(), { band_title: 'New' }),
        updateOp(siteEn(), { hours: 'Mon–Sat' }),
        { tool: 'settings_update', args: { title: 'Never' } }
      ]
    }
  })
  assert.ok(!out.includes(FAKE_TOKEN))
  const got = /** @type {any} */ (parseEmdashWrite(out))
  assert.equal(got.value.inFlight, 1)
  assert.match(got.value.lost, /connection closed/)
  assert.deepEqual(
    got.value.results.map((r) => r.i),
    [0]
  )
  assert.equal(emdash.row('site', 'site', 'en').data.hours, 'Mon–Sat', 'the dropped op DID land')
  assert.ok(!emdash.calls.some((c) => c.name === 'settings_update'))
})

test('🔒 WRITE: the deadline writes the line with the op in flight; a late run stops between ops', async () => {
  const timers = manualTimers()
  const emdash = createFakeEmdash(EMDASH_SITE, {
    fault: (name) => (name === 'settings_update' ? 'hang' : undefined)
  })
  const pending = runOnFake(EMDASH_WRITE_SCRIPT, {
    fetch: emdash.fetch,
    stdin: {
      ops: [updateOp(homeEn(), { band_title: 'New' }), { tool: 'settings_update', args: { title: 'Slow' } }]
    },
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout
  })
  await new Promise((r) => setTimeout(r, 20))
  timers.fire()
  const got = /** @type {any} */ (parseEmdashWrite(await pending))
  assert.equal(got.value.deadline, true)
  assert.equal(got.value.inFlight, 1)
  assert.deepEqual(got.value.results, [{ i: 0, ok: true, revFormula: true }])

  // a clock that has run out before op 2 is sent: stopped BETWEEN ops, op 2 never sent
  let t = 1_000_000
  const late = createFakeEmdash(EMDASH_SITE)
  const fetchThenJump = async (...a) => {
    const r = await late.fetch(...a)
    t += EMDASH_SCRIPT_DEADLINE_MS - EMDASH_WRITE_MIN_LEFT_MS + 1
    return r
  }
  const out2 = await runOnFake(EMDASH_WRITE_SCRIPT, {
    fetch: fetchThenJump,
    now: () => t,
    stdin: {
      ops: [updateOp(homeEn(), { band_title: 'New' }), { tool: 'settings_update', args: { title: 'Late' } }]
    },
    setTimeout: manualTimers().setTimeout,
    clearTimeout: () => {}
  })
  const got2 = /** @type {any} */ (parseEmdashWrite(out2))
  assert.equal(got2.value.deadline, true)
  assert.equal(got2.value.inFlight, null)
  assert.equal(got2.value.results.length, 1)
  assert.equal(late.state.settings.title, 'Northgate Industrial')
})

test('parseEmdashIndex / parseEmdashWrite: each failure keeps its kind; a cut line is never an answer', () => {
  assert.deepEqual(parseEmdashIndex('TRACY_EMDASH_ERR SITE HTTP 502 on content_list'), {
    ok: false,
    kind: 'site',
    error: 'HTTP 502 on content_list'
  })
  assert.equal(/** @type {any} */ (parseEmdashIndex('TRACY_EMDASH_ERR TOOL x: [NOT_FOUND] y')).kind, 'tool')
  assert.equal(/** @type {any} */ (parseEmdashWrite('TRACY_EMDASH_ERR REFUSED op 0: no')).kind, 'refused')
  assert.equal(/** @type {any} */ (parseEmdashIndex('TRACY_EMDASH_INDEX {"rows":[')).kind, 'cut')
  assert.equal(/** @type {any} */ (parseEmdashWrite('TRACY_EMDASH_INDEX {}')).kind, 'transport')
  assert.equal(/** @type {any} */ (parseEmdashWrite('')).kind, 'transport')
  assert.equal(
    /** @type {any} */ (parseEmdashWrite('TRACY_MCP_ERR NO_TOKEN the agent token file is malformed')).kind,
    'no-token'
  )
  assert.deepEqual(parseEmdashWrite('TRACY_EMDASH_WRITE {"results":[],"inFlight":null}'), {
    ok: true,
    value: { results: [], inFlight: null }
  })
})

test('browserArgv: the in-container backstop outlasts a deadline longer than its own default', () => {
  const at = (deadlineMs) => {
    const argv = browserArgv({ container: 'demo9-web-1', mode: 'view', url: 'http://127.0.0.1/', origin: 'http://127.0.0.1', deadlineMs })
    return Number(argv[argv.indexOf('timeout') + 3])
  }
  assert.equal(at(undefined), BROWSER_CONTAINER_TIMEOUT_S)
  assert.equal(at(16_000), BROWSER_CONTAINER_TIMEOUT_S)
  assert.ok(at(40_000) * 1000 > 40_000)
})
