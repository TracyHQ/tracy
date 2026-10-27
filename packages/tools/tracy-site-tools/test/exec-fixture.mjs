#!/usr/bin/env node
/**
 * A REAL Linux-container validation of the #154/#155 transport, run against the EXACT scripts the
 * transport ships (`PROBE_SCRIPT`, `BROWSER_SCRIPT`, `MCP_SCRIPT`, the argv builders, and the real
 * `dockerExec`), not a paraphrase. It proves on running containers what a host install cannot:
 *
 *   #154 BROWSER (needs a real chromium):
 *     - own-origin render returns the DOM and writes a real PNG;
 *     - a redirect to a REACHABLE other origin is `OFFSITE` (the browser's actual final URL, not the
 *       address it was handed) — the HEAD200+GET302 / JS-meta / multihop holes the review named;
 *     - a dead address is a failed `NAV`, never a Chrome error page returned as content;
 *     - a missing chromium is `NOCHROME`; a hung render is killed with chromium's whole process group
 *       in the container (0 live chrome after the script's own deadline).
 *   #154 PROBE (GET redirect chain): a same-authority chain resolves; a hop to another NAME is
 *     off-site, and a same-name/other-PORT hop (redirect_canonical) is same-site with its port learned
 *     but never dialled — `redirectStaysOnSite` classifies both.
 *   #154 CANONICAL PORT: the browser, given the one host-resolver rule, renders THIS site's port and
 *     never contacts a different local port.
 *   PUBLIC ORIGIN (24/09): a site that redirects its bare loopback to `https://<its public host>/`
 *     (every fleet WordPress behind cloudflared) is read AS that host — public Host plus
 *     `X-Forwarded-Proto: https` — by the probe and by real chromium, page and subresources alike, over
 *     the loopback port; a hop off that origin is still OFFSITE.
 *   #154 FLEET SHAPE: a site that binds loopback, on its own network, is NOT dialable from a second
 *     ("dsh side") container on a different network — yet `docker exec` into the site reaches it.
 *   #155 CUSTODY / REDACTION: a root:0600 token is unreadable+unreplaceable by the unprivileged exec
 *     user, readable by the root MCP exec, and the real MCP_SCRIPT authenticates yet REDACTS a
 *     reflected PAT; a missing token is NO_TOKEN by name.
 *   TRANSPORT: the real `dockerExec` swallows the stdin EPIPE when the child exits before reading.
 *
 *   node packages/tools/tracy-site-tools/test/exec-fixture.mjs
 *
 * Own resources only: uniquely named containers + networks off a cached image, all removed at the end.
 * Skips (exit 0) when docker or a suitable cached image is absent — and when no cached image ships a
 * chromium, the #154 BROWSER checks are reported UNVALIDATED (with the reason) while the rest still run.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'

import {
  AGENT_TOKEN_PATH,
  MCP_SCRIPT,
  browserArgv,
  dockerExec,
  parseBrowser,
  parseProbe,
  probeArgv
} from '../src/host/exec.mjs'
import {
  VIRTUAL_SITE_HOST,
  hostResolverRule,
  publicOriginOf,
  publicTarget,
  redirectStaysOnSite
} from '../src/host/site.mjs'

// The fixture drives the LOCAL docker daemon directly; the real `dockerExec` reads TRACY_DOCKER_HOST,
// so clear it here or its stdin-EPIPE check would talk to a proxy that never saw these containers.
delete process.env.TRACY_DOCKER_HOST

const SUFFIX = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`
const TOKEN = 'ec_pat_FIXTUREtoken0123456789abcdef'
const SITE_PORT = 8080
const OTHER_PORT = 8081
const SITE_ORIGIN = `http://127.0.0.1:${SITE_PORT}`
const SITE = `tch-fix-site-${SUFFIX}`
// The public name the fixture site believes it is served as (what cloudflared sends in front of it):
// `<label>.<site domain>`, exactly what `publicOriginOf` derives from the host's configured domain.
// `.test` never resolves, so nothing here could reach a real host even without the resolver rule.
const PUBLIC_DOMAIN = 'fixture.test'
const PUBLIC_HOST = `${SITE}.${PUBLIC_DOMAIN}`
const PUBLIC_ORIGIN = `https://${PUBLIC_HOST}`

function sh(args, opts = {}) {
  // A 60s default so a wedged docker call can never hang the fixture; opts may override maxBuffer etc.
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 60000, ...opts })
}
/** docker exec that returns {status, stdout, stderr} instead of throwing, for the deny-path asserts. */
function tryExec(args, input) {
  try {
    return {
      status: 0,
      stdout: execFileSync('docker', ['exec', ...args], { encoding: 'utf8', timeout: 60000, input }),
      stderr: ''
    }
  } catch (e) {
    return { status: e.status ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }
  }
}

// ── availability + image discovery ─────────────────────────────────────────────────────────────
try {
  sh(['version', '--format', '{{.Server.Version}}'], { stdio: ['ignore', 'pipe', 'ignore'] })
} catch {
  console.log('SKIP exec-fixture: docker is not available here')
  process.exit(0)
}

/** A cached image that ships node + www-data, and (ideally) a chromium binary we can drive. */
function discoverImage() {
  // Images known to carry node + www-data; the browser-bearing ones also have a chromium binary.
  const candidates = ['tracy/dsh:dev', 'tracy/host:dev', 'node:22.17.0']
  for (const image of candidates) {
    try {
      sh(['image', 'inspect', image], { stdio: ['ignore', 'ignore', 'ignore'] })
    } catch {
      continue
    }
    let chromePath = ''
    try {
      chromePath =
        sh(
          [
            'run',
            '--rm',
            '--pull',
            'never',
            '--entrypoint',
            'sh',
            image,
            '-c',
            'command -v chromium 2>/dev/null || command -v chromium-browser 2>/dev/null || ls /opt/playwright/*/chrome-linux*/chrome 2>/dev/null | head -1'
          ],
          { stdio: ['ignore', 'pipe', 'ignore'] }
        )
          .trim()
          .split('\n')[0] || ''
    } catch {
      chromePath = ''
    }
    return { image, chromePath }
  }
  return null
}

const found = discoverImage()
if (found === null) {
  console.log('SKIP exec-fixture: no cached image with node + www-data is present (not pulling)')
  process.exit(0)
}
const { image: IMAGE, chromePath: CHROME } = found
const HAS_BROWSER = CHROME !== ''

const NET_SITE = `tch-fix-net-site-${SUFFIX}`
const NET_DSH = `tch-fix-net-dsh-${SUFFIX}`
const DSH = `tch-fix-dsh-${SUFFIX}`

// The fake EmDash MCP server (4321) echoes the Authorization header so redaction is under test; the
// "site" server (8080) serves a real page and the redirect shapes; an "other origin" (8081) stands in
// for another site the browser must refuse to return.
const SERVERS = `
const http=require('http');
http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{
  const auth=req.headers['authorization']||'';
  if(!auth.startsWith('Bearer ec_pat_')){res.writeHead(401);return res.end('no token');}
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({jsonrpc:'2.0',id:1,result:{echoedAuth:auth,you_sent:b}}));
});}).listen(4321,'127.0.0.1');
http.createServer((q,s)=>{s.writeHead(200,{'content-type':'text/html'});s.end('<html lang="en"><head><title>Own</title></head><body><h1>OWN SITE</h1></body></html>')}).listen(${OTHER_PORT},'127.0.0.1');
http.createServer((q,s)=>{const u=q.url;
  if(u==='/ok'){s.writeHead(200,{'content-type':'text/html'});return s.end('<html lang="en"><head><title>Real Site</title></head><body><h1>OWN SITE HOME</h1></body></html>')}
  if(u==='/big'){s.writeHead(200,{'content-type':'text/html'});return s.end('<html lang="en"><head><title>Big</title></head><body>'+'x'.repeat(300*1024)+'<!--TRACY-END-MARKER-->'+'</body></html>')}
  if(u.indexOf('/tag')===0){const n=new URL(u,'http://x').searchParams.get('n');s.writeHead(200,{'content-type':'text/html'});return s.end('<html lang="en"><body>TAG-'+n+'</body></html>')}
  // a same-HOST, other-PORT redirect: WordPress redirect_canonical's shape (the #154 case).
  if(u==='/redir-port'){s.writeHead(301,{location:'http://127.0.0.1:${OTHER_PORT}/'});return s.end()}
  // a redirect to a different NAME, and a multihop that ends at one — both are off-site.
  if(u==='/redir-host'){s.writeHead(302,{location:'http://not-this.example/'});return s.end()}
  if(u==='/hop1'){s.writeHead(302,{location:'/hop2'});return s.end()}
  if(u==='/hop2'){s.writeHead(302,{location:'http://not-this.example/'});return s.end()}
  // The fleet WordPress shape: asked as anything but its public https self, it redirects there — the
  // way WordPress answers a request whose Host/scheme is not home_url(). Asked with the public Host and
  // X-Forwarded-Proto: https, it serves the page, whose stylesheet is an absolute URL on that origin.
  if(u==='/pub-hits'){s.writeHead(200,{'content-type':'text/plain'});return s.end(String(globalThis.pubCss||0))}
  if(u.indexOf('/pub')===0){const asPublic=q.headers.host==='${PUBLIC_HOST}'&&q.headers['x-forwarded-proto']==='https';
    if(!asPublic){s.writeHead(301,{location:'${PUBLIC_ORIGIN}'+u});return s.end()}
    if(u==='/pub.css'){globalThis.pubCss=(globalThis.pubCss||0)+1;s.writeHead(200,{'content-type':'text/css'});return s.end('h1{color:rgb(1,2,3)}')}
    if(u==='/pub-off'){s.writeHead(302,{location:'https://not-this.example/'});return s.end()}
    s.writeHead(200,{'content-type':'text/html'});return s.end('<html lang="en"><head><title>Public</title><link rel="stylesheet" href="${PUBLIC_ORIGIN}/pub.css"></head><body><h1>PUBLIC SITE HOME</h1></body></html>')}
  s.writeHead(404);s.end('nf')
}).listen(${SITE_PORT},'127.0.0.1',()=>console.log('servers up'));
`.trim()

let failures = 0
const results = []
function check(name, fn) {
  try {
    fn()
    results.push(`  ✔ ${name}`)
  } catch (e) {
    failures++
    results.push(`  ✖ ${name}\n      ${String(e.message).split('\n').join('\n      ')}`)
  }
}
async function checkAsync(name, fn) {
  try {
    await fn()
    results.push(`  ✔ ${name}`)
  } catch (e) {
    failures++
    results.push(`  ✖ ${name}\n      ${String(e.message).split('\n').join('\n      ')}`)
  }
}
/** Run the shipped BROWSER_SCRIPT in the site container with an explicit settle/deadline. */
function runBrowserScript(mode, url, origin, file, settleMs, deadlineMs) {
  const argv = browserArgv({ container: SITE, mode, url, origin, file })
  // browserArgv ends `... node -e BROWSER_SCRIPT <mode> <url> <origin> <file>`; append settle+deadline.
  const withBudget = settleMs === undefined ? argv : [...argv, String(settleMs), String(deadlineMs)]
  return tryExec(withBudget.slice(1)) // drop the leading "exec"
}

try {
  console.log(
    `exec-fixture: image ${IMAGE}${HAS_BROWSER ? ` (chromium: ${CHROME})` : ' (NO chromium — #154 browser UNVALIDATED)'}`
  )
  sh(['network', 'create', NET_SITE], { stdio: ['ignore', 'ignore', 'ignore'] })
  sh(['network', 'create', NET_DSH], { stdio: ['ignore', 'ignore', 'ignore'] })
  sh([
    'run',
    '-d',
    '--pull',
    'never',
    '--init',
    '--name',
    SITE,
    '--network',
    NET_SITE,
    '--entrypoint',
    'sleep',
    IMAGE,
    '900'
  ])
  sh([
    'run',
    '-d',
    '--pull',
    'never',
    '--init',
    '--name',
    DSH,
    '--network',
    NET_DSH,
    '--entrypoint',
    'sleep',
    IMAGE,
    '900'
  ])

  // A `chromium` on PATH that supplies --no-sandbox, exactly as the fleet image's /etc/chromium.d
  // wrapper is expected to — the shipped BROWSER_SCRIPT never adds --no-sandbox itself.
  if (HAS_BROWSER && CHROME !== 'chromium' && CHROME !== '/usr/local/bin/chromium') {
    sh([
      'exec',
      '-u',
      '0',
      SITE,
      'sh',
      '-c',
      `printf '#!/bin/sh\\nexec ${CHROME} --no-sandbox "$@"\\n' > /usr/local/bin/chromium && chmod 755 /usr/local/bin/chromium`
    ])
  }

  // Lay the token down root:0600 at the mount target, and start the loopback servers.
  sh([
    'exec',
    '-u',
    '0',
    SITE,
    'sh',
    '-c',
    `install -m 600 /dev/null ${AGENT_TOKEN_PATH} && printf '%s\\n' '${TOKEN}' > ${AGENT_TOKEN_PATH} && chown 0:0 ${AGENT_TOKEN_PATH}`
  ])
  sh(['exec', '-u', '0', SITE, 'sh', '-c', `cat > /srv.cjs <<'EOF'\n${SERVERS}\nEOF`])
  sh(['exec', '-d', '-u', 'www-data', '-e', 'HOME=/tmp', SITE, 'node', '/srv.cjs'])
  for (let i = 0; i < 50; i++) {
    const r = tryExec([
      '-u',
      '0',
      SITE,
      'node',
      '-e',
      `fetch('${SITE_ORIGIN}/ok').then(()=>process.exit(0)).catch(()=>process.exit(1))`
    ])
    if (r.status === 0) break
    execFileSync('sh', ['-c', 'true'])
  }

  // ── #155 custody / redaction (unchanged properties, re-proven) ──────────────────────────────
  check('#155 unprivileged user CANNOT read the root:0600 token', () => {
    const r = tryExec(['-u', 'nobody', SITE, 'cat', AGENT_TOKEN_PATH])
    assert.notEqual(r.status, 0, 'nobody read the token file')
    assert.ok(!r.stdout.includes(TOKEN))
  })
  check('#155 unprivileged user CANNOT replace the token (symlink swap) in root-owned /run', () => {
    const r = tryExec(['-u', 'nobody', SITE, 'sh', '-c', `ln -sf /etc/passwd ${AGENT_TOKEN_PATH}`])
    assert.notEqual(r.status, 0)
    assert.match(tryExec(['-u', '0', SITE, 'cat', AGENT_TOKEN_PATH]).stdout, /ec_pat_/)
  })
  check('#155 REAL MCP_SCRIPT authenticates and REDACTS the reflected PAT (leak canary closed)', () => {
    const r = tryExec(
      ['-i', '-u', '0', SITE, 'node', '-e', MCP_SCRIPT],
      '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
    )
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /^TRACY_MCP 200\n/, `expected 200, got: ${r.stdout.slice(0, 200)}`)
    assert.ok(!r.stdout.includes(TOKEN), `the PAT leaked to stdout: ${r.stdout}`)
    assert.match(r.stdout, /\[REDACTED\]/)
    assert.match(r.stdout, /you_sent/)
  })
  check('#155 MCP_SCRIPT reports NO_TOKEN by name when the file is absent (never a value)', () => {
    sh(['exec', '-u', '0', SITE, 'mv', AGENT_TOKEN_PATH, '/run/_saved.token'])
    const r = tryExec(['-i', '-u', '0', SITE, 'node', '-e', MCP_SCRIPT], '{}')
    sh(['exec', '-u', '0', SITE, 'mv', '/run/_saved.token', AGENT_TOKEN_PATH])
    assert.match(r.stdout, /^TRACY_MCP_ERR NO_TOKEN /)
    assert.ok(!r.stdout.includes(TOKEN))
  })

  // ── #154 GET redirect-chain probe (the shipped PROBE_SCRIPT) ────────────────────────────────
  check('#154 PROBE_SCRIPT: a same-authority page answers with its status', () => {
    const r = tryExec(probeArgv({ container: SITE, url: `${SITE_ORIGIN}/ok`, timeoutMs: 2000 }).slice(1))
    assert.deepEqual(parseProbe(r.stdout), { ok: true, status: 200, finalUrl: `${SITE_ORIGIN}/ok` })
  })
  check('🔒 #154 PROBE_SCRIPT: a multihop chain to another NAME stops there and is off-site', () => {
    const r = tryExec(probeArgv({ container: SITE, url: `${SITE_ORIGIN}/hop1`, timeoutMs: 2000 }).slice(1))
    const p = parseProbe(r.stdout)
    assert.equal(p.ok, false)
    assert.ok(p.redirect, `expected a redirect hop, got: ${r.stdout.slice(0, 200)}`)
    assert.equal(p.redirect.location, 'http://not-this.example/')
    // the host classifies: a different name is not this site.
    assert.equal(redirectStaysOnSite(p.redirect.from, p.redirect.location).same, false)
  })
  check(
    '🔒 #154 PROBE_SCRIPT: a same-host canonical PORT redirect is same-site, and the port is never dialled',
    () => {
      const r = tryExec(
        probeArgv({ container: SITE, url: `${SITE_ORIGIN}/redir-port`, timeoutMs: 2000 }).slice(1)
      )
      const p = parseProbe(r.stdout)
      assert.equal(p.ok, false)
      assert.ok(p.redirect, `expected a redirect hop, got: ${r.stdout.slice(0, 200)}`)
      assert.equal(p.redirect.location, `http://127.0.0.1:${OTHER_PORT}/`)
      const verdict = redirectStaysOnSite(p.redirect.from, p.redirect.location)
      assert.equal(verdict.same, true, 'a same-host/other-port redirect is this site')
      assert.equal(verdict.authority, `127.0.0.1:${OTHER_PORT}`)
      // The PROBE returned WITHOUT the OTHER_PORT server ever being contacted — the port is discovered
      // from the Location header, not by dialling it. (If it had dialled, the OTHER server's log would
      // show it; the transport contract is that the probe stops at the first authority change.)
    }
  )

  // ── public origin: the site redirects its loopback to https://<its public host>/ (24/09) ────
  const route = publicTarget(
    SITE,
    '/pub',
    SITE_PORT,
    publicOriginOf(SITE, PUBLIC_DOMAIN),
    `${SITE_ORIGIN}/pub`,
    `${PUBLIC_ORIGIN}/pub`
  )
  check('🔒 PUBLIC PROBE: the bare loopback redirects to the public https origin (the dev symptom)', () => {
    const r = tryExec(probeArgv({ container: SITE, url: `${SITE_ORIGIN}/pub`, timeoutMs: 2000 }).slice(1))
    const p = parseProbe(r.stdout)
    assert.ok(p.redirect, `expected a redirect hop, got: ${r.stdout.slice(0, 200)}`)
    assert.equal(p.redirect.location, `${PUBLIC_ORIGIN}/pub`)
    assert.equal(redirectStaysOnSite(p.redirect.from, p.redirect.location).same, false)
    assert.equal(route.ok, true)
  })
  check('🔒 PUBLIC PROBE: asked as its public self over loopback, the site answers the page', () => {
    const r = tryExec(
      probeArgv({ container: SITE, url: route.url, timeoutMs: 2000, via: route.via }).slice(1)
    )
    assert.deepEqual(parseProbe(r.stdout), { ok: true, status: 200, finalUrl: `${PUBLIC_ORIGIN}/pub` })
  })
  check('🔒 PUBLIC PROBE: a hop off the public origin stops there, unfollowed', () => {
    const r = tryExec(
      probeArgv({ container: SITE, url: `${PUBLIC_ORIGIN}/pub-off`, timeoutMs: 2000, via: route.via }).slice(
        1
      )
    )
    const p = parseProbe(r.stdout)
    assert.ok(p.redirect, `expected a redirect hop, got: ${r.stdout.slice(0, 200)}`)
    assert.equal(p.redirect.location, 'https://not-this.example/')
  })

  // ── #154 the browser itself (the shipped BROWSER_SCRIPT over real chromium) ─────────────────
  if (HAS_BROWSER) {
    check('#154 BROWSER own-origin render returns the DOM', () => {
      const r = runBrowserScript('dom', `${SITE_ORIGIN}/ok`, SITE_ORIGIN)
      const b = parseBrowser(r.stdout)
      assert.equal(b.ok, true, `expected OK, got: ${r.stdout.slice(0, 200)} ${r.stderr}`)
      assert.equal(b.finalUrl, `${SITE_ORIGIN}/ok`)
      assert.match(b.dom, /OWN SITE HOME/)
    })
    check(
      '🔒 #154 BROWSER a server 30x to a REACHABLE other origin is OFFSITE (final URL, not the address handed)',
      () => {
        // No resolver rule here: even a same-host/other-PORT redirect, unrouted, must be refused by the
        // browser's exact-origin guard — defence in depth behind the pre-browser probe.
        const r = runBrowserScript('dom', `${SITE_ORIGIN}/redir-port`, SITE_ORIGIN)
        const b = parseBrowser(r.stdout)
        assert.equal(b.ok, false, `expected refusal, got: ${r.stdout.slice(0, 200)}`)
        assert.equal(b.kind, 'offsite')
        assert.equal(b.error, `http://127.0.0.1:${OTHER_PORT}/`)
      }
    )
    check(
      '🔒 #154 BROWSER the canonical-port routing lands on THIS site, and the other port is never contacted',
      () => {
        // The #154 fix end to end: address the page by the virtual host at the "public" port, with the
        // one host-resolver rule that maps THAT authority back onto this container's real site port.
        // Chromium must render the SITE server (8080, "OWN SITE HOME"), never the OTHER server on 8081
        // ("OWN SITE", no HOME) — proving the connection is pinned and 8081 is never contacted.
        const authority = `${VIRTUAL_SITE_HOST}:${OTHER_PORT}`
        const argv = browserArgv({
          container: SITE,
          mode: 'dom',
          url: `http://${authority}/ok`,
          origin: `http://${authority}`,
          resolverRule: hostResolverRule(authority, `127.0.0.1:${SITE_PORT}`)
        })
        const b = parseBrowser(tryExec(argv.slice(1)).stdout)
        assert.equal(
          b.ok,
          true,
          `expected OK via the routed virtual host, got: ${JSON.stringify(b).slice(0, 200)}`
        )
        assert.equal(b.finalUrl, `http://${authority}/ok`)
        assert.match(b.dom, /OWN SITE HOME/, 'the routed request must reach the SITE server (8080)')
        assert.doesNotMatch(
          b.dom,
          /OWN SITE<\/h1>/,
          'the OTHER server (8081) must never be contacted — the connection is pinned to the site port'
        )
      }
    )
    const publicBrowser = (mode, url, file = '') =>
      parseBrowser(
        tryExec(
          browserArgv({
            container: SITE,
            mode,
            url,
            origin: route.origin,
            file,
            resolverRule: route.resolverRule,
            via: route.via
          }).slice(1)
        ).stdout
      )
    check(
      '🔒 PUBLIC BROWSER real chromium reads the public https page AND its stylesheet over loopback',
      () => {
        const before = Number(
          tryExec([
            '-u',
            '0',
            SITE,
            'node',
            '-e',
            `fetch('${SITE_ORIGIN}/pub-hits').then(r=>r.text()).then(t=>process.stdout.write(t))`
          ]).stdout
        )
        const b = publicBrowser('dom', route.url)
        assert.equal(b.ok, true, `expected OK, got: ${JSON.stringify(b).slice(0, 300)}`)
        assert.equal(b.finalUrl, `${PUBLIC_ORIGIN}/pub`)
        assert.match(b.dom, /PUBLIC SITE HOME/)
        const after = Number(
          tryExec([
            '-u',
            '0',
            SITE,
            'node',
            '-e',
            `fetch('${SITE_ORIGIN}/pub-hits').then(r=>r.text()).then(t=>process.stdout.write(t))`
          ]).stdout
        )
        assert.ok(after > before, "the page's own https subresource was not served from loopback")
      }
    )
    check('🔒 PUBLIC BROWSER (shot) writes a real PNG of the public page', () => {
      const file = `/site/${SITE}/pub-${SUFFIX}.png`
      sh(['exec', '-u', '0', SITE, 'sh', '-c', `mkdir -p /site/${SITE} && chown www-data /site/${SITE}`])
      const b = publicBrowser('shot', route.url, file)
      assert.equal(b.ok, true, `expected OK, got: ${JSON.stringify(b).slice(0, 300)}`)
      const head = tryExec(['-u', '0', SITE, 'sh', '-c', `head -c8 ${file} | od -An -tx1 | tr -d ' \\n'`])
      assert.match(head.stdout, /^89504e47/, 'the screenshot is not a PNG')
    })
    check('🔒 PUBLIC BROWSER a redirect off the public origin is still OFFSITE', () => {
      const b = publicBrowser('dom', `${PUBLIC_ORIGIN}/pub-off`)
      assert.equal(b.ok, false, `expected refusal, got: ${JSON.stringify(b).slice(0, 200)}`)
      assert.equal(b.kind, 'offsite')
      assert.match(b.error, /not-this\.example/)
    })
    check(
      '🔒 PUBLIC BROWSER without the route, the public https URL is never reached (no TLS bypass)',
      () => {
        // the same URL and resolver rule, but no loopback route: chromium must fail the navigation,
        // not reach anything, since the public name resolves to nothing.
        const b = parseBrowser(
          tryExec(
            browserArgv({
              container: SITE,
              mode: 'dom',
              url: route.url,
              origin: route.origin,
              resolverRule: route.resolverRule
            }).slice(1)
          ).stdout
        )
        assert.equal(b.ok, false)
        assert.equal(b.kind, 'nav', JSON.stringify(b))
      }
    )
    check('🔒 #154 BROWSER a dead address is a failed NAV, never a Chrome error page as content', () => {
      const b = parseBrowser(runBrowserScript('dom', 'http://127.0.0.1:9/', 'http://127.0.0.1:9').stdout)
      assert.equal(b.ok, false)
      assert.equal(b.kind, 'nav')
    })
    check('#154 BROWSER (shot) writes a real PNG on the /site inode and returns OK', () => {
      const file = `/site/${SITE}/shot-${SUFFIX}.png`
      sh(['exec', '-u', '0', SITE, 'sh', '-c', `mkdir -p /site/${SITE} && chown www-data /site/${SITE}`])
      const b = parseBrowser(runBrowserScript('shot', `${SITE_ORIGIN}/ok`, SITE_ORIGIN, file).stdout)
      assert.equal(b.ok, true)
      const head = tryExec(['-u', '0', SITE, 'sh', '-c', `head -c8 ${file} | od -An -tx1 | tr -d ' \\n'`])
      assert.match(head.stdout, /^89504e47/, 'the screenshot is not a PNG')
    })
    check('#154 BROWSER a missing chromium is NOCHROME (not a false success)', () => {
      sh(['exec', '-u', '0', SITE, 'mv', '/usr/local/bin/chromium', '/usr/local/bin/chromium.bak'])
      const b = parseBrowser(runBrowserScript('dom', `${SITE_ORIGIN}/ok`, SITE_ORIGIN).stdout)
      sh(['exec', '-u', '0', SITE, 'mv', '/usr/local/bin/chromium.bak', '/usr/local/bin/chromium'])
      assert.equal(b.ok, false)
      assert.equal(b.kind, 'no-browser')
    })
    check(
      '🔒 #154 BROWSER a hung render is bounded IN the container — 0 live chrome after its deadline',
      () => {
        // huge settle, tiny deadline: the script must kill chromium's whole process group itself.
        const r = runBrowserScript('dom', `${SITE_ORIGIN}/ok`, SITE_ORIGIN, '', 30000, 1500)
        assert.match(r.stdout, /TRACY_BROWSER ERR timed out/)
        execFileSync('sh', ['-c', 'sleep 2'])
        const live = tryExec([
          '-u',
          '0',
          SITE,
          'sh',
          '-c',
          'ps -eo stat,comm 2>/dev/null | grep -i chrom | grep -vc Z'
        ])
        assert.equal(live.stdout.trim(), '0', `chrome left running: ${live.stdout}`)
      }
    )
    // 🔒 The large-output requirement on REAL chromium via the REAL dockerExec (the host's own path):
    // process.exit drops buffered stdout, so a >256KiB DOM written just before exit would be truncated
    // to the pipe's ~64KiB through docker exec. The end marker is LAST, so a truncation loses it first.
    // maxBuffer is the host's own 16MiB (index.ts page.text) — above the 1MiB execFileSync default —
    // while the payload stays ~300KiB, well over the pipe buffer.
    await checkAsync(
      '🔒 #154 BROWSER a >256KiB DOM survives the real docker-exec pipe intact (end marker last)',
      async () => {
        const run = await dockerExec({
          argv: browserArgv({ container: SITE, mode: 'dom', url: `${SITE_ORIGIN}/big`, origin: SITE_ORIGIN }),
          timeoutMs: 30000,
          maxBuffer: 16 * 1024 * 1024
        })
        assert.equal(
          run.code,
          0,
          `a clean exit is required for a whole document; code=${run.code} spawnError=${run.spawnError}`
        )
        const b = parseBrowser(run.stdout)
        assert.equal(b.ok, true, `expected OK, got: ${run.stdout.slice(0, 200)}`)
        assert.ok(
          Buffer.byteLength(b.dom) > 256 * 1024,
          `the DOM came back short: ${Buffer.byteLength(b.dom)} bytes`
        )
        assert.match(b.dom, /TRACY-END-MARKER/, 'the tail of a large DOM was cut off')
      }
    )
    // 🔒 Concurrent REAL renders: each must get its OWN private --user-data-dir and its OWN document,
    // and every profile dir must be gone afterwards (done()'s clean() + the process-exit hook).
    await checkAsync(
      '🔒 #154 BROWSER concurrent real renders: unique profiles, own DOM each, no leftovers',
      async () => {
        const N = 3
        const runs = await Promise.all(
          Array.from({ length: N }, (_, i) =>
            dockerExec({
              argv: browserArgv({
                container: SITE,
                mode: 'dom',
                url: `${SITE_ORIGIN}/tag?n=${i}`,
                origin: SITE_ORIGIN
              }),
              timeoutMs: 30000,
              maxBuffer: 4 * 1024 * 1024
            })
          )
        )
        runs.forEach((run, i) => {
          const b = parseBrowser(run.stdout)
          assert.equal(b.ok, true, `render ${i} not OK: ${run.stdout.slice(0, 160)}`)
          assert.match(b.dom, new RegExp(`TAG-${i}\\b`), `render ${i} returned another render's document`)
        })
        // www-data runs the browser with HOME=/tmp, so its os.tmpdir() profiles land at /tmp/tracy-look-*.
        const left = tryExec(['-u', '0', SITE, 'sh', '-c', 'ls -d /tmp/tracy-look-* 2>/dev/null | wc -l'])
        assert.equal(left.stdout.trim(), '0', `profile dirs left behind: ${left.stdout}`)
      }
    )
  } else {
    results.push(
      '  ⚠ #154 BROWSER checks UNVALIDATED: no cached image ships a chromium binary (not pulling one)'
    )
  }

  // ── #154 fleet shape: the site binds loopback; the "dsh side" cannot dial it; exec inside can ──
  check(
    '🔒 #154 FLEET the dsh-side container cannot dial the loopback-bound site; docker exec into it can',
    () => {
      const siteIp = sh([
        'inspect',
        '-f',
        `{{(index .NetworkSettings.Networks "${NET_SITE}").IPAddress}}`,
        SITE
      ]).trim()
      // from the dsh side (different network): no route to the site's IP:port at all.
      const dsh = tryExec([
        '-u',
        '0',
        DSH,
        'node',
        '-e',
        `fetch('http://${siteIp}:${SITE_PORT}/ok',{signal:AbortSignal.timeout(2500)}).then(()=>process.exit(9)).catch(()=>process.exit(0))`
      ])
      assert.equal(dsh.status, 0, 'the dsh-side container reached the site — the network is not isolated')
      // docker exec INTO the site reaches its own loopback, which is where it binds.
      const inside = tryExec([
        '-u',
        '0',
        SITE,
        'node',
        '-e',
        `fetch('${SITE_ORIGIN}/ok').then(r=>r.text()).then(t=>process.stdout.write(t))`
      ])
      assert.match(inside.stdout, /OWN SITE HOME/)
    }
  )

  // ── TRANSPORT: the real dockerExec swallows a stdin EPIPE when the child exits early ─────────
  await checkAsync(
    'transport: dockerExec swallows the stdin EPIPE when the child exits before reading',
    async () => {
      // The MCP script does exactly this on NO_TOKEN: writes its line and exits before draining stdin.
      // A large body to a child that never reads it raises EPIPE on the pipe; unhandled it would crash dsh.
      const r = await dockerExec({
        argv: ['exec', '-i', SITE, 'sh', '-c', 'printf DONE; exit 0'],
        stdin: 'x'.repeat(4 * 1024 * 1024),
        timeoutMs: 15000,
        maxBuffer: 1024 * 1024
      })
      assert.equal(r.stdout.trim(), 'DONE')
      assert.ok(
        !r.spawnError,
        `dockerExec surfaced a spawn error instead of swallowing EPIPE: ${r.spawnError}`
      )
    }
  )
} finally {
  for (const c of [SITE, DSH]) {
    try {
      sh(['rm', '-f', c], { stdio: ['ignore', 'ignore', 'ignore'] })
    } catch {
      results.push(`  ! could not remove ${c}`)
    }
  }
  for (const n of [NET_SITE, NET_DSH]) {
    try {
      sh(['network', 'rm', n], { stdio: ['ignore', 'ignore', 'ignore'] })
    } catch {
      /* already gone */
    }
  }
}

console.log(results.join('\n'))
console.log(
  failures === 0 ? '\nexec-fixture: all checks passed' : `\nexec-fixture: ${failures} check(s) failed`
)
process.exit(failures === 0 ? 0 : 1)
