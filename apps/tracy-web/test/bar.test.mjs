import { test, after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fileDb } from './_db.mjs'
import { hostKind, barRoutes, ROBOTS, sanitizePreviewErrors } from '../src/bar/route.js'
import { createSite, appendPreviewErrors, previewErrorsFor } from '../src/sites/store.js'
import { siteTarget } from '../src/sites/resolver.js'
import { accountByEmail, grantFor } from '../src/seats/store.js'
import { mintSession } from '../src/lib/session.js'
import { proxySite } from '../src/bar/site-proxy.js'

// One migrated schema for the whole file, emptied before each test (see _db.mjs).
const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)

const dbUrl = process.env.TEST_DATABASE_URL
const dbOpts = { skip: dbUrl ? false : 'set TEST_DATABASE_URL' }

const sessionSecret = 's'.repeat(32)

function baseConfig(overrides = {}) {
  return {
    origin: 'http://tracy.test:8080',
    secure: false,
    siteDomain: 'localhost',
    siteDomainAliases: ['tracy.test'],
    sessionSecret,
    sessionDomain: null,
    hostName: 'local',
    badgeUrl: 'https://tracy.ai/dashboard/badge.js',
    ...overrides
  }
}

// ── hostKind: pure, no DB ──────────────────────────────────────────────────────────────────────

test('hostKind: tracy-web\'s own hostname is "tracy"', () => {
  assert.deepEqual(hostKind('tracy.test:8080', baseConfig()), { kind: 'tracy' })
  assert.deepEqual(hostKind('tracy.test', baseConfig()), { kind: 'tracy' })
})

test('hostKind: a label under SITE_DOMAIN or one of its aliases is "site"', () => {
  assert.deepEqual(hostKind('lantern.localhost', baseConfig()), { kind: 'site', label: 'lantern' })
  assert.deepEqual(hostKind('lantern.tracy.test', baseConfig()), { kind: 'site', label: 'lantern' })
  assert.deepEqual(hostKind('lantern.tracy.test:8080', baseConfig()), { kind: 'site', label: 'lantern' })
})

test('hostKind: a `--` label is "unknown" — proposals are not carried, so the shape means nothing', () => {
  assert.deepEqual(hostKind('a--b.tracy.test', baseConfig()), { kind: 'unknown' })
})

test('hostKind: a hostname naming no domain this deployment owns is "custom"', () => {
  assert.deepEqual(hostKind('customer-own-domain.example', baseConfig()), {
    kind: 'custom',
    hostname: 'customer-own-domain.example'
  })
})

test('hostKind: the API origin’s hostname is "api" — checked before the site-domain loop', () => {
  // `api.tracy.test` is ALSO `api.<alias>`: with an API origin the API wins, port or not.
  const cfg = baseConfig({ apiOrigin: 'https://api.tracy.test' })
  assert.deepEqual(hostKind('api.tracy.test', cfg), { kind: 'api' })
  assert.deepEqual(hostKind('API.tracy.test:8080', cfg), { kind: 'api' })
  // Another hostname under the same domain is still a site.
  assert.deepEqual(hostKind('lantern.tracy.test', cfg), { kind: 'site', label: 'lantern' })
  // An API origin outside every site domain works the same way.
  assert.deepEqual(hostKind('api.example.net', baseConfig({ apiOrigin: 'https://api.example.net:8443' })), {
    kind: 'api'
  })
})

test('hostKind: without an API origin, api.<siteDomain> keeps today’s meaning — a (reserved) site label', () => {
  assert.deepEqual(hostKind('api.tracy.test', baseConfig()), { kind: 'site', label: 'api' })
  assert.deepEqual(hostKind('api.tracy.test', baseConfig({ apiOrigin: null })), {
    kind: 'site',
    label: 'api'
  })
})

test('hostKind: an empty Host is "unknown"', () => {
  assert.deepEqual(hostKind('', baseConfig()), { kind: 'unknown' })
  assert.deepEqual(hostKind(null, baseConfig()), { kind: 'unknown' })
})

// ── isCmsBackendPath / isComponentApiExec: ported verbatim, sanity-checked here ────────────────

// ── barRoutes: the Step 1 acceptance cases, against a fake upstream via fetchImpl ──────────────

function harness(pool, { fetchImpl, calls = [], config, templateOfTag } = {}) {
  const wrapped = async (req) => {
    calls.push(req)
    return (
      fetchImpl?.(req) ??
      new Response('<html><body>hi</body></html>', { headers: { 'content-type': 'text/html' } })
    )
  }
  const app = barRoutes({
    pool,
    config: config ?? baseConfig(),
    sites: {
      byLabel: (p, label) => siteByLabelDirect(p, label),
      target: siteTarget,
      appendPreviewErrors,
      previewErrorsFor,
      templateOfTag
    },
    seats: { accountByEmail, grantFor },
    fetchImpl: wrapped
  })
  return { app, calls }
}

// A local re-import avoids a second name for the same function while keeping this file's harness
// self-contained about what it reads.
async function siteByLabelDirect(pool, label) {
  const { rows } = await pool.query('select * from site where label = $1', [label])
  return rows[0] ?? null
}

test(
  'draft, guest_open=false, no cookie: proxied like any other copy — the bar gates nothing',
  dbOpts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'lantern.example', label: 'lantern', host: 'local' })
    const { app, calls } = harness(pool)
    const res = await app.fetch(
      new Request('http://lantern.tracy.test/', { headers: { host: 'lantern.tracy.test' } })
    )
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    assert.match(await res.text(), /<script async src="https:\/\/tracy\.ai\/dashboard\/badge\.js"/)
    // A draft still asks crawlers to stay away — that is a robots policy, not an access gate.
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow')
  }
)

test(
  'draft, guest_open=true, no cookie: proxied, badge before </body>, x-robots-tag noindex',
  dbOpts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'open.example', label: 'open', host: 'local' })
    const { app, calls } = harness(pool)
    const res = await app.fetch(
      new Request('http://open.tracy.test/', { headers: { host: 'open.tracy.test' } })
    )
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    const text = await res.text()
    const scriptStart = text.indexOf('<script async src="https://tracy.ai/dashboard/badge.js"')
    assert.notEqual(scriptStart, -1)
    assert.ok(scriptStart < text.lastIndexOf('</body>'))
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow')
  }
)

test('an owner cookie: upstream sees x-tracy-email, never the tracy_sess cookie', dbOpts, async () => {
  const { pool } = db
  await createSite(pool, { siteKey: 'private.example', label: 'private', host: 'local' })
  const acct = (await pool.query("insert into account (email) values ('o@x.y') returning id")).rows[0]
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at)
       values ('private.example', $1, 'owner', $1, now())`,
    [acct.id]
  )
  const { app, calls } = harness(pool)
  const token = await mintSession('o@x.y', sessionSecret)
  const res = await app.fetch(
    new Request('http://private.tracy.test/wp-admin/admin-ajax.php?action=heartbeat', {
      headers: {
        host: 'private.tracy.test',
        cookie: `tracy_sess=${token}`,
        origin: 'https://private.tracy.test',
        referer: 'https://private.tracy.test/wp-admin/'
      }
    })
  )
  assert.equal(res.status, 200)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers.get('x-tracy-email'), 'o@x.y')
  assert.equal(calls[0].headers.get('cookie'), null)
  // fix round 1, Minor: a customer's own CMS reads these (WordPress checks Referer on admin
  // POSTs) — this proxy must not silently strip them the way the workspace proxy strips them
  // for an unrelated, WebSocket-specific reason.
  assert.equal(calls[0].headers.get('origin'), 'https://private.tracy.test')
  assert.equal(calls[0].headers.get('referer'), 'https://private.tracy.test/wp-admin/')
})

test('GET /wp-admin/ with no seat: proxied, never redirected to a Tracy login', dbOpts, async () => {
  const { pool } = db
  await createSite(pool, { siteKey: 'admin.example', label: 'admin', host: 'local' })
  const { app, calls } = harness(pool)
  const res = await app.fetch(
    new Request('http://admin.tracy.test/wp-admin/', { headers: { host: 'admin.tracy.test' } })
  )
  assert.equal(res.status, 200)
  assert.equal(calls.length, 1)
  // The CMS's own sign-in screen is what a stranger meets now, served by the site itself.
  assert.equal(res.headers.get('location'), null)
})

test('GET /wp-admin/ with a seat: proxied, not redirected', dbOpts, async () => {
  const { pool } = db
  await createSite(pool, { siteKey: 'admin2.example', label: 'admin2', host: 'local' })
  const acct = (await pool.query("insert into account (email) values ('e@x.y') returning id")).rows[0]
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at)
     values ('admin2.example', $1, 'editor', $1, now())`,
    [acct.id]
  )
  const { app, calls } = harness(pool)
  const token = await mintSession('e@x.y', sessionSecret)
  const res = await app.fetch(
    new Request('http://admin2.tracy.test/wp-admin/', {
      headers: { host: 'admin2.tracy.test', cookie: `tracy_sess=${token}` }
    })
  )
  assert.equal(res.status, 200)
  assert.equal(calls.length, 1)
})

test(
  'POST admin-ajax.php?action=claude_cowork with no seat: proxied — the component-call exception',
  dbOpts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'exec.example', label: 'exec', host: 'local' })
    const { app, calls } = harness(pool)
    const res = await app.fetch(
      new Request('http://exec.tracy.test/wp-admin/admin-ajax.php?action=claude_cowork', {
        method: 'POST',
        headers: { host: 'exec.tracy.test' },
        body: 'x=1'
      })
    )
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
  }
)

test('Host a--b.tracy.test: 404, no lookup, no proxy', dbOpts, async () => {
  const { pool } = db
  const { app, calls } = harness(pool)
  const res = await app.fetch(
    new Request('http://a--b.tracy.test/', { headers: { host: 'a--b.tracy.test' } })
  )
  assert.equal(res.status, 404)
  assert.equal(calls.length, 0)
})

test('Host unknown.tracy.test (no such site): 404 Tracy page, no proxy', dbOpts, async () => {
  const { pool } = db
  const { app, calls } = harness(pool)
  const res = await app.fetch(
    new Request('http://unknown.tracy.test/', { headers: { host: 'unknown.tracy.test' } })
  )
  assert.equal(res.status, 404)
  assert.match(await res.text(), /Unknown site/i)
  assert.equal(calls.length, 0)
})

test('published site: robots.txt is proxied, not the draft Disallow-all text', dbOpts, async () => {
  const { pool } = db
  await createSite(pool, { siteKey: 'live.example', label: 'live', host: 'local' })
  await pool.query("update site set publish = 'published' where site_key = 'live.example'")
  const { app, calls } = harness(pool, {
    fetchImpl: async () =>
      new Response('User-agent: *\nAllow: /\n', { headers: { 'content-type': 'text/plain' } })
  })
  const res = await app.fetch(
    new Request('http://live.tracy.test/robots.txt', { headers: { host: 'live.tracy.test' } })
  )
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'User-agent: *\nAllow: /\n')
  assert.equal(calls.length, 1)
})

test('draft site: robots.txt is the Disallow-all text, never proxied', dbOpts, async () => {
  const { pool } = db
  await createSite(pool, { siteKey: 'draft.example', label: 'draft', host: 'local' })
  const { app, calls } = harness(pool)
  const res = await app.fetch(
    new Request('http://draft.tracy.test/robots.txt', { headers: { host: 'draft.tracy.test' } })
  )
  assert.equal(res.status, 200)
  assert.equal(await res.text(), ROBOTS)
  assert.equal(res.headers.get('x-robots-tag'), null)
  assert.equal(calls.length, 0)
})

test(
  'non-HTML upstream responses stream through untouched, and reframing headers are stripped',
  dbOpts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'asset.example', label: 'asset', host: 'local' })
    const { app, calls } = harness(pool, {
      fetchImpl: async () =>
        new Response('{"ok":true}', {
          headers: {
            'content-type': 'application/json',
            'content-encoding': 'gzip',
            'content-length': '999',
            'transfer-encoding': 'chunked'
          }
        })
    })
    const res = await app.fetch(
      new Request('http://asset.tracy.test/api/thing', { headers: { host: 'asset.tracy.test' } })
    )
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    assert.equal(await res.text(), '{"ok":true}')
    assert.equal(res.headers.get('content-encoding'), null)
    assert.equal(res.headers.get('content-length'), null)
    assert.equal(res.headers.get('transfer-encoding'), null)
    // Non-HTML never gets the noindex header — ported behaviour: `proxyWithBar` only sets it on
    // the same branch that injects the badge.
    assert.equal(res.headers.get('x-robots-tag'), null)
  }
)

test(
  'a redirect naming the INTERNAL container is reframed onto the address the visitor used',
  dbOpts,
  async () => {
    // Measured 11/09 on the dev machine: `GET https://devsmoke2.tracy.site/wp-admin/` answered
    // `302 Location: https://devsmoke2-web-1/wp-admin/` — the docker alias this process dials,
    // handed to a browser that cannot resolve it. undici recomputes `Host` from the target URL, so
    // the site literally cannot be told its own name; putting it back on the way out is this
    // proxy's job (nginx calls it `proxy_redirect`).
    const { pool } = db
    await createSite(pool, { siteKey: 'redir.example', label: 'redir', host: 'local' })
    const { app } = harness(pool, {
      fetchImpl: async () =>
        new Response(null, { status: 302, headers: { location: 'https://redir-web-1/moved/?a=1' } })
    })
    const res = await app.fetch(
      new Request('http://redir.tracy.test/old-page', { headers: { host: 'redir.tracy.test' } })
    )
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), 'http://redir.tracy.test/moved/?a=1')
  }
)

// A relative Location resolves against the dialled target (`http://<label>-web-1:4321/`), and
// assigning `url.host` a value with no port keeps the old port (WHATWG URL), so the visitor was
// sent to a port the tunnel never opens.
for (const location of ['/ru', 'http://emd-web-1:4321/ru']) {
  test(
    `an EmDash redirect to ${location} does not carry the container port onto the public address`,
    dbOpts,
    async () => {
      const { pool } = db
      await createSite(pool, { siteKey: 'emd.example', label: 'emd', host: 'local', platform: 'emdash' })
      const { app } = harness(pool, {
        fetchImpl: async () => new Response(null, { status: 301, headers: { location } })
      })

      const res = await app.fetch(
        new Request('http://emd.tracy.test/ru/', { headers: { host: 'emd.tracy.test' } })
      )

      assert.equal(res.headers.get('location'), 'http://emd.tracy.test/ru')
    }
  )
}

test('a redirect to a THIRD party is left exactly as the site wrote it', dbOpts, async () => {
  // Only a Location that names the target is ours to rewrite. A site sending a visitor to a
  // payment provider, or to its own live domain, means it.
  const { pool } = db
  await createSite(pool, { siteKey: 'pay.example', label: 'pay', host: 'local' })
  const { app } = harness(pool, {
    fetchImpl: async () =>
      new Response(null, { status: 302, headers: { location: 'https://checkout.stripe.com/x' } })
  })
  const res = await app.fetch(
    new Request('http://pay.tracy.test/buy', { headers: { host: 'pay.tracy.test' } })
  )
  assert.equal(res.headers.get('location'), 'https://checkout.stripe.com/x')
})

test(
  'a local CMS redirect that adds a port to its Docker hostname stays on the public site',
  dbOpts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'redir-port.example', label: 'redir-port', host: 'local' })
    const { app } = harness(pool, {
      fetchImpl: async () =>
        new Response(null, { status: 301, headers: { location: 'http://redir-port-web-1:18080/' } })
    })
    const res = await app.fetch(
      new Request('http://redir-port.tracy.test:18080/', {
        headers: { host: 'redir-port.tracy.test:18080' }
      })
    )
    assert.equal(res.headers.get('location'), 'http://redir-port.tracy.test:18080/')
  }
)

// Brian 01/10: a Joomla site built while the local stand still answered on `tracy.test:8080` keeps
// `$live_site = 'http://<label>.tracy.test:8080'`. Pages link relatively and render fine; sign-in,
// sign-out and every SEF redirect answer an absolute Location on that stale port, and the Browser
// tab shows "refused to connect". The hostname is the site's own, so only the port and scheme are
// stale, and those belong to the address the visitor actually used.
test(
  "a redirect to the site's OWN hostname on a stale port or scheme lands on the address the visitor used",
  dbOpts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'stale.example', label: 'stale', host: 'local' })
    for (const location of ['http://stale.tracy.test:8080/', 'https://stale.tracy.test/en/?x=1']) {
      const { app } = harness(pool, {
        fetchImpl: async () => new Response(null, { status: 303, headers: { location } })
      })
      const res = await app.fetch(
        new Request('http://stale.tracy.test:51710/en/', { headers: { host: 'stale.tracy.test:51710' } })
      )
      assert.equal(
        res.headers.get('location'),
        `http://stale.tracy.test:51710${new URL(location).pathname}${new URL(location).search}`
      )
    }
  }
)

// #1651, measured 23/10 on the dev machine: a Joomla copy with `force_ssl=2` and
// `behind_loadbalancer=1`, asked straight with `X-Forwarded-Proto: http`, answers
// `301 Location: https://<site>/index.php/blog`; through this proxy the visitor got
// `Location: http://<site>/index.php/blog`, the URL just asked, forever. The stand-in answers the way
// that container did: a redirect to https unless told the visitor is on https, then the page.
test('#1651 an http visit to a site that forces https ends on https in one hop, no loop', async () => {
  const joomla = async (req) =>
    req.headers.get('x-forwarded-proto') === 'https'
      ? new Response('blog', { headers: { 'content-type': 'text/plain' } })
      : new Response(null, {
          status: 301,
          headers: { location: `https://${req.headers.get('x-forwarded-host')}${new URL(req.url).pathname}` }
        })
  const visit = (url) =>
    proxySite(new Request(url), new URL(`http://shop-web-1${new URL(url).pathname}`), {
      sameHost: true,
      viewerHost: 'shop.tracy.site',
      viewerProto: new URL(url).protocol.replace(':', ''),
      publish: 'draft',
      badgeUrl: 'https://tracy.site/dashboard/badge.js',
      fetchImpl: joomla
    })
  const hops = []
  let url = 'http://shop.tracy.site/index.php/blog'
  for (let i = 0; i < 5; i++) {
    const res = await visit(url)
    hops.push(`${res.status} ${res.headers.get('location') ?? ''}`.trim())
    await res.body?.cancel()
    if (res.status < 300 || res.status >= 400) break
    url = new URL(res.headers.get('location'), url).href
  }
  assert.deepEqual(hops, ['301 https://shop.tracy.site/index.php/blog', '200'])
})

test('#1651 an https Location is still put back on the scheme of a stand on an explicit port', async () => {
  const res = await proxySite(
    new Request('http://shop.tracy.test:51710/en/'),
    new URL('http://shop-web-1/en/'),
    {
      sameHost: true,
      viewerHost: 'shop.tracy.test:51710',
      viewerProto: 'http',
      publish: 'draft',
      badgeUrl: 'http://tracy.test:51710/dashboard/badge.js',
      fetchImpl: async () =>
        new Response(null, { status: 301, headers: { location: 'https://shop.tracy.test/en/' } })
    }
  )
  assert.equal(res.headers.get('location'), 'http://shop.tracy.test:51710/en/')
})

test('x-forwarded-proto tells the site what the VISITOR used, not what we dialled', dbOpts, async () => {
  // It read the target's own scheme until 11/09 — always `http`, because the site's copy is
  // reached over plain HTTP inside the machine. WordPress's stock wp-config turns `$_SERVER
  // ['HTTPS']` on from this header alone, so an https visitor was announced as http and every
  // URL the site built by hand came out http.
  const { pool } = db
  await createSite(pool, { siteKey: 'proto.example', label: 'proto', host: 'local' })
  let seen = null
  const { app } = harness(pool, {
    fetchImpl: async (req) => {
      seen = req.headers.get('x-forwarded-proto')
      return new Response('<html><body>ok</body></html>', { headers: { 'content-type': 'text/html' } })
    }
  })
  await app.fetch(
    new Request('http://proto.tracy.test/', {
      headers: { host: 'proto.tracy.test', 'x-forwarded-proto': 'https' }
    })
  )
  assert.equal(seen, 'https')
})

test('a POST response is never touched for a badge, even when it claims text/html', dbOpts, async () => {
  const { pool } = db
  await createSite(pool, { siteKey: 'postback.example', label: 'postback', host: 'local' })
  const { app, calls } = harness(pool, {
    fetchImpl: async () =>
      new Response('<html><body>posted</body></html>', { headers: { 'content-type': 'text/html' } })
  })
  const res = await app.fetch(
    new Request('http://postback.tracy.test/contact', {
      method: 'POST',
      headers: { host: 'postback.tracy.test' },
      body: 'x=1'
    })
  )
  assert.equal(res.status, 200)
  assert.equal(calls.length, 1)
  assert.equal(await res.text(), '<html><body>posted</body></html>')
})

test(
  'an unreachable upstream (DNS/connection failure) is a styled 502, never a bare 500 — ' +
    'chrome-acceptance.md defect: anonymous visit to a site root 500ing as raw plain text',
  dbOpts,
  async () => {
    const { pool } = db
    const loggedErrors = []
    const originalConsoleError = console.error
    console.error = (...args) => loggedErrors.push(args.join(' '))
    try {
      await createSite(pool, { siteKey: 'unreachable.example', label: 'unreachable', host: 'local' })
      const { app, calls } = harness(pool, {
        fetchImpl: async () => {
          throw new Error('getaddrinfo ENOTFOUND unreachable-web-1')
        }
      })
      const res = await app.fetch(
        new Request('http://unreachable.tracy.test/', { headers: { host: 'unreachable.tracy.test' } })
      )
      assert.equal(res.status, 502)
      assert.equal(calls.length, 1)
      const body = await res.text()
      assert.doesNotMatch(body, /Internal Server Error/i)
      assert.match(body, /Could not reach the site/i)
      assert.match(res.headers.get('content-type') ?? '', /text\/html/)
      // Not swallowed — an operator watching the server log still sees the real cause.
      assert.ok(
        loggedErrors.some((line) => line.includes('ENOTFOUND')),
        `expected the upstream failure to be logged, got: ${JSON.stringify(loggedErrors)}`
      )
    } finally {
      console.error = originalConsoleError
    }
  }
)

// ── the two /__tracy doors that survived — the bar signs nobody in ─────────────────────────────

test(
  'the sign-in doors are gone: /__tracy/login, /__tracy/signin/:provider and /__tracy/team are 404',
  dbOpts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'gone.example', label: 'gone', host: 'local' })
    const { app, calls } = harness(pool)
    for (const path of [
      '/__tracy/login',
      '/__tracy/signin/google',
      '/__tracy/signin/github',
      '/__tracy/team'
    ]) {
      const res = await app.fetch(
        new Request(`http://gone.tracy.test${path}`, { headers: { host: 'gone.tracy.test' } })
      )
      assert.equal(res.status, 404, path)
    }
    // A Tracy page is answered here, never proxied from the customer's own copy.
    assert.equal(calls.length, 0)
  }
)

// ── fix round 1, item 3: the two /__tracy doors, for real ─────────────────────────────────────

// `/__tracy/build` was retired 11/10/2026 (J15.2): nothing has written a manifest since the
// Worker's fleet hook went away, so every site answered `{"built":null}` — a promise of what the
// copy is built from that the door could never keep. Both methods now get Tracy's 404 page and the
// customer's own copy is never asked: the path stays Tracy's, it is just not a door any more.
test(
  '/__tracy/build is retired: GET and POST both answer Tracy’s 404, the site is never asked',
  dbOpts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'build1.example', label: 'build1', host: 'local' })
    const { app, calls } = harness(pool)
    for (const method of ['GET', 'POST']) {
      const res = await app.fetch(
        new Request('http://build1.tracy.test/__tracy/build', {
          method,
          headers: { host: 'build1.tracy.test' },
          ...(method === 'POST' ? { body: '{"commit":"x"}' } : {})
        })
      )
      assert.equal(res.status, 404, method)
      assert.doesNotMatch(await res.text(), /built/, method)
    }
    assert.equal(calls.length, 0)
  }
)

test('sanitizePreviewErrors: drops empty messages, bounds batch/message/source length', () => {
  const long = 'x'.repeat(3000)
  const out = sanitizePreviewErrors(
    { events: [{ message: '  hi  ' }, { message: '' }, { message: long, source: 'y'.repeat(400) }] },
    'now'
  )
  assert.equal(out.length, 2)
  assert.equal(out[0].message, 'hi')
  assert.equal(out[0].level, 'error')
  assert.equal(out[1].message.length, 2000)
  assert.equal(out[1].source.length, 300)
})

test(
  '/__tracy/errors: unauthenticated GET is refused; a POST report is stored and read back',
  dbOpts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'err1.example', label: 'err1', host: 'local' })
    const { app } = harness(pool)

    const anon = await app.fetch(
      new Request('http://err1.tracy.test/__tracy/errors', { headers: { host: 'err1.tracy.test' } })
    )
    assert.equal(anon.status, 401)

    const posted = await app.fetch(
      new Request('http://err1.tracy.test/__tracy/errors', {
        method: 'POST',
        headers: { host: 'err1.tracy.test' },
        body: JSON.stringify({ events: [{ message: 'boom', level: 'fatal', source: '/x.js' }] })
      })
    )
    assert.equal(posted.status, 204)

    const acct = (await pool.query("insert into account (email) values ('v@x.y') returning id")).rows[0]
    await pool.query(
      `insert into seat (site_key, account_id, role, granted_by, accepted_at)
     values ('err1.example', $1, 'editor', $1, now())`,
      [acct.id]
    )
    const token = await mintSession('v@x.y', sessionSecret)
    const seen = await app.fetch(
      new Request('http://err1.tracy.test/__tracy/errors', {
        headers: { host: 'err1.tracy.test', cookie: `tracy_sess=${token}` }
      })
    )
    assert.equal(seen.status, 200)
    const { events } = await seen.json()
    assert.equal(events.length, 1)
    assert.equal(events[0].message, 'boom')
    assert.equal(events[0].level, 'fatal')
  }
)

// Found 28/09 by the API reference inventory: GET checked a session only, so ANY Tracy account
// could read another customer's page errors (URLs, messages). A seat on THIS site is the line.
test(
  '/__tracy/errors: a signed-in person without a live seat on this site is refused, and learns nothing',
  dbOpts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'err2.example', label: 'err2', host: 'local' })
    await createSite(pool, { siteKey: 'other.example', label: 'other', host: 'local' })
    await appendPreviewErrors(pool, 'err2.example', [
      {
        tier: 'browser',
        source: '/secret.js',
        message: 'boom',
        level: 'error',
        at: new Date().toISOString()
      }
    ])
    // An owner of ANOTHER site, an invite never accepted, and a revoked seat: none is a seat here.
    await seatOn(pool, 'other.example', 'stranger@x.y', 'owner')
    await seatOn(pool, 'err2.example', 'invited@x.y', 'editor', { accepted: false })
    await seatOn(pool, 'err2.example', 'gone@x.y', 'owner', { revoked: true })
    await seatOn(pool, 'err2.example', 'holder@x.y', 'editor')
    const { app } = harness(pool)
    const readAs = async (email) =>
      app.fetch(
        new Request('http://err2.tracy.test/__tracy/errors', {
          headers: {
            host: 'err2.tracy.test',
            cookie: `tracy_sess=${await mintSession(email, sessionSecret)}`
          }
        })
      )

    for (const email of ['stranger@x.y', 'invited@x.y', 'gone@x.y', 'nobody@x.y']) {
      const res = await readAs(email)
      assert.equal(res.status, 403, email)
      const body = await res.text()
      assert.doesNotMatch(body, /boom|secret\.js|events/, email)
    }

    const seen = await readAs('holder@x.y')
    assert.equal(seen.status, 200)
    const { events } = await seen.json()
    assert.deepEqual(
      events.map((e) => e.message),
      ['boom']
    )
  }
)

async function seedDemo(pool, { label, platform, tag, badge = true }) {
  await pool.query(
    `insert into site (site_key, label, host, platform, origin, demo, publish, quickstart_tag, badge)
     values ($1, $2, 'local', $3, 'demo', true, 'published', $4, $5)`,
    [`${label}.tracy.test`, label, platform, tag, badge]
  )
}

test(
  'a demo advertises with the Tracy badge, naming its own template on this deployment for the Design inspiration page',
  dbOpts,
  async () => {
    const { pool } = db
    await seedDemo(pool, { label: 'business-emdash', platform: 'emdash', tag: 'tracy-business/emdash-0.x' })
    const asked = []
    const { app, calls } = harness(pool, {
      templateOfTag: async (_pool, tag) => {
        asked.push(tag)
        return 'tracy-business'
      }
    })
    const fetchDemo = () =>
      app.fetch(
        new Request('http://business-emdash.tracy.test/', {
          headers: { host: 'business-emdash.tracy.test' }
        })
      )
    const res = await fetchDemo()
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
    assert.equal(res.headers.get('x-robots-tag'), null, 'a demo is public, not a draft')
    const text = await res.text()
    // The advertisement badge script, served from THIS deployment's own origin — never the
    // hardcoded `cowork.tracy.site` default the badge falls back to when nothing is passed.
    assert.match(text, /<script async src="http:\/\/tracy\.test:8080\/tracy-badge\.js"/)
    assert.match(text, /data-origin="http:\/\/tracy\.test:8080"/)
    assert.doesNotMatch(text, /cowork\.tracy\.site/)
    // JoomlArt's shelf, and the demo's own template card read from its release.
    assert.match(text, /data-provider="JoomlArt"/)
    assert.match(text, /data-template="tracy-business"/)
    // Neither the retired seat "create" pill nor the seat pill's own script belongs on a demo.
    assert.doesNotMatch(text, /data-variant=/)
    assert.doesNotMatch(text, /data-create-href/)
    assert.doesNotMatch(text, /data-team-href/)
    assert.doesNotMatch(text, /dashboard\/badge\.js/)

    await fetchDemo()
    assert.deepEqual(asked, ['tracy-business/emdash-0.x'], 'the template is read once, then remembered')
  }
)

test(
  'a demo whose release carries no Tracy template still advertises, but names no template',
  dbOpts,
  async () => {
    const { pool } = db
    await seedDemo(pool, { label: 'kinetic-joomla', platform: 'joomla', tag: 'quickstart/ja-kinetic/j6' })
    const { app } = harness(pool, { templateOfTag: async () => null })
    const res = await app.fetch(
      new Request('http://kinetic-joomla.tracy.test/', { headers: { host: 'kinetic-joomla.tracy.test' } })
    )
    assert.equal(res.status, 200)
    const text = await res.text()
    // Still the advertisement badge, from this origin and on JoomlArt's shelf...
    assert.match(text, /<script async src="http:\/\/tracy\.test:8080\/tracy-badge\.js"/)
    assert.match(text, /data-provider="JoomlArt"/)
    // ...but with no template to name, so `data-template` is omitted and the badge script resolves
    // to the gallery itself (destination semantics checked by `badgeHref`/`BADGE_SCRIPT` in
    // tracy-badge.test.mjs — nothing to re-assert here). The retired create pill is gone.
    assert.doesNotMatch(text, /data-template=/)
    assert.doesNotMatch(text, /data-variant=/)
    assert.doesNotMatch(text, /data-create-href/)
  }
)

test('a demo installed without a badge is proxied untouched — no advertisement at all', dbOpts, async () => {
  const { pool } = db
  await seedDemo(pool, {
    label: 'bare-emdash',
    platform: 'emdash',
    tag: 'tracy-bare/emdash-0.x',
    badge: false
  })
  const { app, calls } = harness(pool, {
    templateOfTag: async () => assert.fail('a badge-less demo reads no template')
  })
  const res = await app.fetch(
    new Request('http://bare-emdash.tracy.test/', { headers: { host: 'bare-emdash.tracy.test' } })
  )
  assert.equal(res.status, 200)
  assert.equal(calls.length, 1)
  const text = await res.text()
  // `badge = false` at install time (Lee, 16/09) means the page comes back exactly as its own
  // copy sent it: no advertisement badge, and never the seat pill either.
  assert.equal(text, '<html><body>hi</body></html>')
  assert.doesNotMatch(text, /tracy-badge\.js/)
  assert.doesNotMatch(text, /dashboard\/badge\.js/)
})

test('a published customer site keeps the managed pill', dbOpts, async () => {
  const { pool } = db
  await createSite(pool, { siteKey: 'shop.example', label: 'shop', host: 'local' })
  await pool.query("update site set publish = 'published' where site_key = 'shop.example'")
  const { app } = harness(pool, {
    templateOfTag: async () => assert.fail('only a demo asks for a template')
  })
  const res = await app.fetch(
    new Request('http://shop.tracy.test/', { headers: { host: 'shop.tracy.test' } })
  )
  const text = await res.text()
  assert.match(text, /data-variant="managed"/)
  assert.doesNotMatch(text, /data-create-href/)
})

// ── #339: the seat's CMS tier and role reach the site's Access plugin ─────────────────────────
//
// Both Tracy Access plugins (WordPress `tracy-access.php`, Joomla `TracyAccess.php`) open a backend
// session only on `x-tracy-tier: editor`. Losing that header in the port out of the Worker sent
// every owner's "Open admin" to the CMS login page. These tests pin who gets which header, and
// that a client can never supply either one itself.

const FORGED = { 'x-tracy-tier': 'editor', 'x-tracy-role': 'owner', 'x-tracy-email': 'forged@x.y' }
// For a seat that SHOULD get `editor`: forged values that differ from the vouched ones, so a header
// that merely leaked through from the client cannot pass the assertion.
const FORGED_LOW = { 'x-tracy-tier': 'viewer', 'x-tracy-role': 'viewer', 'x-tracy-email': 'forged@x.y' }

async function seatOn(pool, siteKey, email, role, { accepted = true, revoked = false } = {}) {
  const found = await pool.query('select id from account where email = $1', [email])
  const acct =
    found.rows[0] ??
    (await pool.query('insert into account (email) values ($1) returning id', [email])).rows[0]
  await pool.query(
    `insert into seat (site_key, account_id, role, granted_by, accepted_at, revoked_at)
       values ($1, $2, $3, $2, ${accepted ? 'now()' : 'null'}, ${revoked ? 'now()' : 'null'})`,
    [siteKey, acct.id, role]
  )
}

async function openAdminAs(app, label, email, extraHeaders = {}) {
  const headers = { host: `${label}.tracy.test`, ...extraHeaders }
  if (email) headers.cookie = `tracy_sess=${await mintSession(email, sessionSecret)}`
  return app.fetch(new Request(`http://${label}.tracy.test/wp-admin/`, { headers }))
}

for (const role of ['owner', 'editor']) {
  test(
    `#339: a live ${role} seat on this site sends x-tracy-tier editor and x-tracy-role ${role}`,
    dbOpts,
    async () => {
      const { pool } = db
      await createSite(pool, { siteKey: `t-${role}.example`, label: `t-${role}`, host: 'local' })
      await seatOn(pool, `t-${role}.example`, 'p@x.y', role)
      const { app, calls } = harness(pool)
      const res = await openAdminAs(app, `t-${role}`, 'p@x.y', FORGED_LOW)
      assert.equal(res.status, 200)
      assert.equal(calls.length, 1)
      assert.equal(calls[0].headers.get('x-tracy-email'), 'p@x.y')
      assert.equal(calls[0].headers.get('x-tracy-tier'), 'editor')
      assert.equal(calls[0].headers.get('x-tracy-role'), role)
    }
  )
}

test(
  'ADR 0028: a live viewer seat is vouched as tier viewer (front end only), never editor',
  dbOpts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 't-viewer.example', label: 't-viewer', host: 'local' })
    await seatOn(pool, 't-viewer.example', 'p@x.y', 'viewer')
    const { app, calls } = harness(pool)
    await openAdminAs(app, 't-viewer', 'p@x.y', FORGED)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].headers.get('x-tracy-email'), 'p@x.y')
    assert.equal(calls[0].headers.get('x-tracy-tier'), 'viewer')
    assert.equal(calls[0].headers.get('x-tracy-role'), 'viewer')
  }
)

test('#339: signed out, a forged tier/role/email never reaches the site', dbOpts, async () => {
  const { pool } = db
  await createSite(pool, { siteKey: 'anon.example', label: 'anon', host: 'local' })
  const { app, calls } = harness(pool)
  await openAdminAs(app, 'anon', null, FORGED)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers.get('x-tracy-email'), null)
  assert.equal(calls[0].headers.get('x-tracy-tier'), null)
  assert.equal(calls[0].headers.get('x-tracy-role'), null)
})

test('#339: an owner of ANOTHER site gets no tier here — the seat is per site', dbOpts, async () => {
  const { pool } = db
  await createSite(pool, { siteKey: 'mine.example', label: 'mine', host: 'local' })
  await createSite(pool, { siteKey: 'theirs.example', label: 'theirs', host: 'local' })
  await seatOn(pool, 'mine.example', 'p@x.y', 'owner')
  const { app, calls } = harness(pool)
  await openAdminAs(app, 'theirs', 'p@x.y', FORGED)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers.get('x-tracy-email'), null)
  assert.equal(calls[0].headers.get('x-tracy-tier'), null)
  assert.equal(calls[0].headers.get('x-tracy-role'), null)
})

for (const [name, state] of [
  ['an invited-but-unaccepted', { accepted: false }],
  ['a revoked', { revoked: true }]
]) {
  test(`#339: ${name} owner seat is no seat — no tier, no role`, dbOpts, async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'gone.example', label: 'gone', host: 'local' })
    await seatOn(pool, 'gone.example', 'p@x.y', 'owner', state)
    const { app, calls } = harness(pool)
    await openAdminAs(app, 'gone', 'p@x.y', FORGED)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].headers.get('x-tracy-email'), null)
    assert.equal(calls[0].headers.get('x-tracy-tier'), null)
    assert.equal(calls[0].headers.get('x-tracy-role'), null)
  })
}

test('#339: a seat lookup that throws is no seat — no tier, no role', dbOpts, async () => {
  const { pool } = db
  await createSite(pool, { siteKey: 'broken.example', label: 'broken', host: 'local' })
  await seatOn(pool, 'broken.example', 'p@x.y', 'owner')
  const calls = []
  const app = barRoutes({
    pool,
    config: baseConfig(),
    sites: { byLabel: (p, label) => siteByLabelDirect(p, label), target: siteTarget },
    seats: {
      accountByEmail,
      grantFor: async () => {
        throw new Error('connection dropped')
      }
    },
    fetchImpl: async (req) => {
      calls.push(req)
      return new Response('ok', { headers: { 'content-type': 'text/plain' } })
    }
  })
  await openAdminAs(app, 'broken', 'p@x.y', FORGED)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].headers.get('x-tracy-tier'), null)
  assert.equal(calls[0].headers.get('x-tracy-role'), null)
})

test(
  '#339: a site on ANOTHER host gets the email on x-tracy-edge and no tier/role at all',
  dbOpts,
  async () => {
    const { pool } = db
    await createSite(pool, { siteKey: 'far.example', label: 'far', host: 'fleet02' })
    await seatOn(pool, 'far.example', 'p@x.y', 'owner')
    const { app, calls } = harness(pool)
    await openAdminAs(app, 'far', 'p@x.y', FORGED)
    assert.equal(calls.length, 1)
    assert.equal(new URL(calls[0].url).hostname, 'far.fleet02-sites.localhost')
    assert.equal(calls[0].headers.get('x-tracy-edge'), 'p@x.y')
    assert.equal(calls[0].headers.get('x-tracy-email'), null)
    assert.equal(calls[0].headers.get('x-tracy-tier'), null)
    assert.equal(calls[0].headers.get('x-tracy-role'), null)
  }
)

// The same rules one level down, with no database: `proxySite` is handed a role directly, which is
// how a role the seat book cannot hold today (`viewer`) or one it never heard of is exercised.

async function upstreamHeadersFor({ email, role, sameHost = true, forged = FORGED }) {
  const seen = []
  await proxySite(
    new Request('http://s.tracy.test/wp-admin/', { headers: { host: 's.tracy.test', ...forged } }),
    new URL('http://s-web-1/wp-admin/'),
    {
      email,
      role,
      sameHost,
      viewerHost: 's.tracy.test',
      publish: 'draft',
      badgeUrl: 'https://tracy.ai/dashboard/badge.js',
      fetchImpl: async (req) => {
        seen.push(req.headers)
        return new Response('ok', { headers: { 'content-type': 'text/plain' } })
      }
    }
  )
  assert.equal(seen.length, 1)
  return seen[0]
}

test('#339 proxySite: a viewer seat is vouched as tier viewer, which signs nobody in', async () => {
  const h = await upstreamHeadersFor({ email: 'v@x.y', role: 'viewer' })
  assert.equal(h.get('x-tracy-email'), 'v@x.y')
  assert.equal(h.get('x-tracy-tier'), 'viewer')
  assert.equal(h.get('x-tracy-role'), 'viewer')
})

test('#339 proxySite: an owner is vouched as tier editor, role owner', async () => {
  const h = await upstreamHeadersFor({ email: 'o@x.y', role: 'owner' })
  assert.equal(h.get('x-tracy-tier'), 'editor')
  assert.equal(h.get('x-tracy-role'), 'owner')
})

test('#339 proxySite: an unknown role, or a role without an email, fails closed', async () => {
  for (const input of [
    { email: 'o@x.y', role: 'superuser' },
    { email: 'o@x.y', role: 'constructor' },
    { email: null, role: 'owner' },
    { email: 'o@x.y', role: null }
  ]) {
    const h = await upstreamHeadersFor(input)
    assert.equal(h.get('x-tracy-tier'), null, JSON.stringify(input))
    assert.equal(h.get('x-tracy-role'), null, JSON.stringify(input))
  }
})

test('#339 proxySite: a client-sent tier/role is stripped even with nothing to set in its place', async () => {
  const h = await upstreamHeadersFor({ email: null, role: null })
  assert.equal(h.get('x-tracy-email'), null)
  assert.equal(h.get('x-tracy-tier'), null)
  assert.equal(h.get('x-tracy-role'), null)
})

test('#339 proxySite: cross-host carries the email on x-tracy-edge, never a tier or role', async () => {
  const h = await upstreamHeadersFor({ email: 'o@x.y', role: 'owner', sameHost: false })
  assert.equal(h.get('x-tracy-edge'), 'o@x.y')
  assert.equal(h.get('x-tracy-email'), null)
  assert.equal(h.get('x-tracy-tier'), null)
  assert.equal(h.get('x-tracy-role'), null)
})

// ── #1037: a customer's own domain goes through this proxy ─────────────────────────────────────
// Until #1037 the host's ingress sent an own domain straight to the site's port, so nothing below
// was ever asked: the CMS read whatever `x-tracy-*` a client sent, and redirected the visitor to
// the Tracy address. These pin the route that replaced it.
import { ownDomainByName } from '../src/sites/address.js'
import {
  PROBE_HEADER,
  PROBE_PAGE_HEADER,
  PROBE_PATH,
  bodyDigest,
  pageProof,
  probeAnswer,
  probePage,
  probeProof,
  readWhole
} from '../src/sites/domain-probe.js'
import { bodyFormat, originProjection, projectable, isAdminPath } from '../src/bar/own-domain.js'
import { OWN_DOMAIN_PROBE_HEADER, OWN_DOMAIN_PROBE_PATH } from '../src/bar/route.js'

const OWN_DOMAIN = 'www.customer-shop.com'
const CANONICAL = 'https://shop.tracy.test'

/** A published site `shop` with `OWN_DOMAIN` in `state`, and the bar with the real own-domain reads. */
async function ownDomainBed(
  pool,
  { state = 'active', publish = 'published', platform = 'wordpress', routed = true, fetchImpl } = {}
) {
  await createSite(pool, { siteKey: 'shop.example', label: 'shop', host: 'local' })
  await pool.query('update site set address = $1, publish = $2, platform = $3 where site_key = $4', [
    `${CANONICAL}/`,
    publish,
    platform,
    'shop.example'
  ])
  await pool.query(
    `insert into site_name(name, site_key, kind, state, token, probe_secret, routed_at)
     values ($1, 'shop.example', 'custom', $2, repeat('a', 48), repeat('b', 64), $3)`,
    [OWN_DOMAIN, state, routed ? new Date() : null]
  )
  const calls = []
  const app = barRoutes({
    pool,
    config: baseConfig(),
    sites: {
      byLabel: (p, label) => siteByLabelDirect(p, label),
      ownDomain: ownDomainByName,
      probeAnswer,
      probePage,
      readWhole,
      bodyDigest,
      target: siteTarget,
      appendPreviewErrors,
      previewErrorsFor
    },
    seats: { accountByEmail, grantFor },
    fetchImpl: async (req) => {
      calls.push(req)
      return (
        (await fetchImpl?.(req)) ??
        new Response('<html><body>hi</body></html>', { headers: { 'content-type': 'text/html' } })
      )
    }
  })
  const ask = (path = '/', init = {}) =>
    app.fetch(
      new Request(`http://${OWN_DOMAIN}${path}`, {
        ...init,
        headers: { host: OWN_DOMAIN, 'x-forwarded-proto': 'https', ...init.headers }
      })
    )
  return { app, calls, ask }
}

test('own-domain constants: the path and header the probe asks are the ones the bar answers', () => {
  assert.equal(OWN_DOMAIN_PROBE_PATH, PROBE_PATH)
  assert.equal(OWN_DOMAIN_PROBE_HEADER, PROBE_HEADER)
})

test(
  '#1037: a client-supplied x-tracy-* header on an own-domain request never reaches the CMS — forged identity, a Tracy session and Tracy cookies included',
  dbOpts,
  async () => {
    const { pool } = db
    const { calls, ask } = await ownDomainBed(pool)
    // A real owner of this very site: on the Tracy address this cookie is what vouches them.
    await seatOn(pool, 'shop.example', 'owner@x.y', 'owner')
    const session = await mintSession('owner@x.y', sessionSecret)
    for (const method of ['GET', 'POST', 'HEAD']) {
      calls.length = 0
      const res = await ask('/wp-admin/admin-ajax.php?action=x', {
        method,
        headers: {
          ...FORGED,
          'X-Tracy-Email': 'second@x.y',
          'x-tracy-edge': 'forged@x.y',
          'x-tracy-preview': 'pick',
          'x-tracy-signature': 'abc',
          'x-tracy-anything-new': '1',
          // What a client says about where it is, is not what the CMS is told.
          'x-forwarded-host': 'evil.example',
          cookie: `tracy_sess=${session}; wp_lang=vi; __Host-tracy_pv=t; tracy_site=shop.example`,
          origin: `https://${OWN_DOMAIN}`,
          referer: `https://${OWN_DOMAIN}/checkout/?a=1`
        },
        ...(method === 'POST' ? { body: 'a=1' } : {})
      })
      assert.equal(res.status, 200, method)
      assert.equal(calls.length, 1, method)
      const sent = calls[0].headers
      const tracy = [...sent.keys()].filter((name) => name.startsWith('x-tracy-'))
      assert.deepEqual(tracy, [], `${method}: nothing named x-tracy-* reaches the site`)
      assert.equal(sent.get('cookie'), 'wp_lang=vi', `${method}: no Tracy cookie reaches the site`)
      // The CMS is asked as its own canonical address, and hears the browser in those terms.
      assert.equal(sent.get('x-forwarded-host'), 'shop.tracy.test', method)
      assert.equal(sent.get('x-forwarded-proto'), 'https', method)
      assert.equal(sent.get('origin'), CANONICAL, method)
      assert.equal(sent.get('referer'), `${CANONICAL}/checkout/?a=1`, method)
    }
  }
)

test(
  '#1037: an own-domain page names the own domain — links, assets, canonical, escaped and encoded forms, redirects and cookies — and nothing else is touched',
  dbOpts,
  async () => {
    const { pool } = db
    const page = [
      '<html><head>',
      `<link rel="canonical" href="${CANONICAL}/about/">`,
      `<link rel="stylesheet" href="//shop.tracy.test/wp-content/a.css">`,
      `<script>var api=${JSON.stringify({ root: `${CANONICAL}/wp-json/` })};</script>`,
      `<a href="http://shop.tracy.test/old">http link</a>`,
      `<a href="/share?u=${encodeURIComponent(`${CANONICAL}/about/`)}">share</a>`,
      // Other places that merely look alike, and prose that names the host: all left as they are.
      '<a href="https://shop.tracy.test.evil.example/">x</a>',
      '<a href="https://shop.tracy.test-old.example/">x</a>',
      '<a href="https://shop.tracy.test:8443/">x</a>',
      '<a href="https://user@shop.tracy.test/">x</a>',
      '<a href="https://myshop.tracy.test/">x</a>',
      '<a href="wss://shop.tracy.test/live">x</a>',
      '<a href="https://pay.example/?return=1">pay</a>',
      '<p>Built on shop.tracy.test by Tracy.</p>',
      '</head><body>hi</body></html>'
    ].join('\n')
    const { ask } = await ownDomainBed(pool, {
      fetchImpl: () => {
        const headers = new Headers({
          'content-type': 'text/html; charset=utf-8',
          link: `<${CANONICAL}/wp-json/>; rel="https://api.w.org/"`,
          'content-security-policy': `default-src 'self' ${CANONICAL}`
        })
        headers.append('set-cookie', 'wp_x=1; Path=/; Domain=shop.tracy.test; HttpOnly')
        headers.append('set-cookie', 'plain=2; Path=/')
        headers.append('set-cookie', 'tracy_sess=stolen; Path=/')
        headers.append('set-cookie', '__Host-tracy_pv=x; Path=/')
        return new Response(page, { headers })
      }
    })
    const res = await ask('/about/')
    assert.equal(res.status, 200)
    const text = await res.text()
    const own = `https://${OWN_DOMAIN}`
    assert.ok(text.includes(`<link rel="canonical" href="${own}/about/">`))
    assert.ok(text.includes(`href="//${OWN_DOMAIN}/wp-content/a.css"`))
    assert.ok(text.includes(JSON.stringify({ root: `${own}/wp-json/` })), 'the JSON-escaped form')
    assert.ok(text.includes(`<a href="${own}/old">`), 'an http spelling of the canonical is the site too')
    assert.ok(text.includes(`u=${encodeURIComponent(`${own}/about/`)}`), 'the percent-encoded form')
    for (const kept of [
      'https://shop.tracy.test.evil.example/',
      'https://shop.tracy.test-old.example/',
      'https://shop.tracy.test:8443/',
      'https://user@shop.tracy.test/',
      'https://myshop.tracy.test/',
      'wss://shop.tracy.test/live',
      'https://pay.example/?return=1',
      'Built on shop.tracy.test by Tracy.'
    ])
      assert.ok(text.includes(kept), `left alone: ${kept}`)
    assert.equal(text.includes(`${CANONICAL}/`), false, 'no canonical-origin URL is left on the page')
    // The customer's own page carries no Tracy pill and no draft marker.
    assert.equal(text.includes('badge.js'), false)
    assert.equal(res.headers.get('x-robots-tag'), null)
    assert.equal(res.headers.get('link'), `<${own}/wp-json/>; rel="https://api.w.org/"`)
    assert.ok(res.headers.get('content-security-policy').includes(`default-src 'self' ${own}`))
    // Cookies: the site's own only, host-only on the name that was asked; never one of Tracy's.
    assert.deepEqual(res.headers.getSetCookie(), ['wp_x=1; Path=/; HttpOnly', 'plain=2; Path=/'])
  }
)

test(
  '#1037: own-domain bodies by kind — CSS, JSON, XML and plain text are projected, a binary is byte-for-byte, HEAD and a redirect keep working, and a text range is answered whole',
  dbOpts,
  async () => {
    const { pool } = db
    const bytes = new Uint8Array([0, 255, 1, ...Buffer.from(`${CANONICAL}/x`), 254, 0])
    const bodies = {
      '/a.css': ['text/css', `a{background:url(${CANONICAL}/i.png)}`],
      '/wp-json/': [
        'application/json',
        JSON.stringify({ home: `${CANONICAL}/`, feed: `${CANONICAL}/feed/` })
      ],
      '/sitemap.xml': ['application/xml', `<urlset><url><loc>${CANONICAL}/a</loc></url></urlset>`],
      '/feed/': ['application/rss+xml; charset=UTF-8', `<rss><link>${CANONICAL}/</link></rss>`],
      '/robots.txt': ['text/plain', `Sitemap: ${CANONICAL}/sitemap.xml\n`],
      '/app.webmanifest': ['application/manifest+json', `{"start_url":"${CANONICAL}/"}`]
    }
    const seen = []
    const { ask, calls } = await ownDomainBed(pool, {
      fetchImpl: (req) => {
        const path = new URL(req.url).pathname
        seen.push([path, req.headers.get('range')])
        if (path === '/i.png') return new Response(bytes, { headers: { 'content-type': 'image/png' } })
        if (path === '/go')
          return new Response(null, { status: 301, headers: { location: `${CANONICAL}/there?x=1` } })
        if (path === '/loop')
          return new Response(null, { status: 301, headers: { location: `${CANONICAL}/loop` } })
        if (path === '/video.mp4')
          return new Response(bytes.slice(0, 4), {
            status: 206,
            headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-3/20' }
          })
        if (path === '/notes.txt')
          return new Response(`see ${CANONICAL}/`, {
            status: req.headers.get('range') ? 206 : 200,
            headers: { 'content-type': 'text/plain', etag: '"n1"', 'content-md5': 'abc' }
          })
        if (path === '/big.css' && req.headers.get('range'))
          return new Response('a{', { status: 206, headers: { 'content-type': 'text/css' } })
        if (path === '/big.css')
          return new Response(bodies['/a.css'][1], { headers: { 'content-type': 'text/css' } })
        const [type, body] = bodies[path]
        return new Response(body, { headers: { 'content-type': type } })
      }
    })
    const own = `https://${OWN_DOMAIN}`
    // Each by its own format's parser; a CSS address is written back as a quoted `url("…")`.
    const told = { '/a.css': `a{background:url("${own}/i.png")}` }
    for (const [path, [, body]] of Object.entries(bodies)) {
      const res = await ask(path)
      assert.equal(res.status, 200, path)
      assert.equal(await res.text(), told[path] ?? body.replaceAll(CANONICAL, own), path)
      assert.equal(res.headers.get('x-tracy-own-domain-projection'), null, path)
    }
    const image = await ask('/i.png')
    assert.deepEqual(new Uint8Array(await image.arrayBuffer()), bytes, 'a binary is never read')
    const head = await ask('/a.css', { method: 'HEAD' })
    assert.equal(head.status, 200)
    const moved = await ask('/go')
    assert.equal(moved.status, 301)
    assert.equal(moved.headers.get('location'), `${own}/there?x=1`, 'never a Location to the Tracy address')
    assert.equal(moved.headers.get('cache-control'), 'no-store')
    // A redirect to the address just asked is not handed to the browser to follow for ever.
    const before = calls.length
    const loop = await ask('/loop')
    assert.equal(loop.status, 502)
    assert.equal(loop.headers.get('location'), null)
    assert.equal(calls.length, before + 1, 'asked once, not followed')
    // Ranges: a video keeps its slice; a slice of text this proxy rewrites is asked for whole.
    const video = await ask('/video.mp4', { headers: { range: 'bytes=0-3' } })
    assert.equal(video.status, 206)
    // Plain text other than robots.txt has no URL in it by any format: passed on as it is, its
    // range, its validator and its digest with it.
    for (const range of [null, 'bytes=0-3']) {
      const notes = await ask('/notes.txt', range ? { headers: { range } } : {})
      assert.equal(notes.status, range ? 206 : 200)
      assert.equal(await notes.text(), `see ${CANONICAL}/`)
      assert.equal(notes.headers.get('etag'), '"n1"')
      assert.equal(notes.headers.get('content-md5'), 'abc')
    }
    seen.length = 0
    const css = await ask('/big.css', { headers: { range: 'bytes=0-1' } })
    assert.equal(css.status, 200)
    assert.equal(await css.text(), told['/a.css'])
    assert.deepEqual(seen, [
      ['/big.css', 'bytes=0-1'],
      ['/big.css', null]
    ])
  }
)

/** One own-domain request straight through `proxySite`, the site's copy played by `answer`. */
const viaProxy = (answer, path = '/', init = {}) =>
  proxySite(new Request(`https://${OWN_DOMAIN}${path}`, init), new URL(`http://shop-web-1${path}`), {
    email: null,
    sameHost: true,
    viewerHost: OWN_DOMAIN,
    viewerProto: 'https',
    publish: 'published',
    variant: 'none',
    badgeUrl: 'https://tracy.test/badge.js',
    canonical: new URL(CANONICAL),
    fetchImpl: async (req) => answer(req)
  })

test('#1037: a body is read WHOLE before it is projected — however the site cuts it into chunks the answer is the same, and a body that fails on the way is an error, never a prefix', async () => {
  const own = `https://${OWN_DOMAIN}`
  const text = `é€ a{background:url(${CANONICAL}/a.png)} b{background:url(//shop.tracy.test/d.png)} /* ✓ */`
  const expected = `é€ a{background:url("${own}/a.png")} b{background:url("//${OWN_DOMAIN}/d.png")} /* ✓ */`
  const bytes = Buffer.from(text, 'utf8')
  const chunked = (cuts) =>
    new Response(
      new ReadableStream({
        start(controller) {
          let from = 0
          for (const cut of [...cuts, bytes.length]) {
            if (cut > from) controller.enqueue(bytes.subarray(from, cut))
            from = cut
          }
          controller.close()
        }
      }),
      { headers: { 'content-type': 'text/css' } }
    )
  // Every cut — inside the address, inside a multi-byte character — and one byte at a time.
  for (let cut = 0; cut <= bytes.length; cut++)
    assert.equal(
      await (await viaProxy(() => chunked([cut]), '/a.css')).text(),
      expected,
      `cut at byte ${cut}`
    )
  const drip = await viaProxy(() => chunked(Array.from(bytes, (_, i) => i)), '/a.css')
  assert.equal(await drip.text(), expected)
  // A body that breaks off after an address was already read: no part of it is sent as the answer.
  const broken = await viaProxy(
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.subarray(0, 40))
          },
          pull(controller) {
            controller.error(new Error('ECONNRESET'))
          }
        }),
        { headers: { 'content-type': 'text/css' } }
      ),
    '/a.css'
  )
  assert.equal(broken.status, 502)
  assert.equal((await broken.text()).includes('a.png'), false)
  // An empty body and a body with nothing of the site in it are the site's own bytes.
  for (const body of ['', 'a{color:red}', `/* ${CANONICAL} is only mentioned */`]) {
    const res = await viaProxy(
      () => new Response(body, { headers: { 'content-type': 'text/css' } }),
      '/a.css'
    )
    assert.equal(await res.text(), body)
    assert.equal(res.headers.get('x-tracy-own-domain-projection'), null)
  }
})

test('#1037: what is projected and what is back office', () => {
  for (const type of [
    'text/html; charset=utf-8',
    'TEXT/CSS',
    'application/json',
    'application/ld+json',
    'image/svg+xml',
    'application/atom+xml',
    'text/javascript'
  ])
    assert.equal(projectable(type), true, type)
  // Each type has ONE format, and a type with no parser here is never read.
  for (const [type, format] of [
    ['text/html', 'html'],
    ['application/xhtml+xml', 'xhtml'],
    ['application/javascript', 'script'],
    ['text/javascript; charset=utf-8', 'script'],
    ['application/json', 'json'],
    ['application/manifest+json', 'json'],
    ['text/css', 'css'],
    ['application/rss+xml', 'xml'],
    ['image/svg+xml', 'xml'],
    ['text/xml', 'xml'],
    ['text/plain', 'plain'],
    ['text/csv', null],
    ['text/event-stream', null],
    ['image/png', null]
  ])
    assert.equal(bodyFormat(type), format, type)
  for (const type of [
    'image/png',
    'font/woff2',
    'application/octet-stream',
    'video/mp4',
    'application/pdf',
    '',
    null
  ])
    assert.equal(projectable(type), false, String(type))
  assert.equal(isAdminPath('wordpress', '/wp-admin/'), true)
  assert.equal(isAdminPath('wordpress', '/WP-Admin/options.php'), true)
  assert.equal(isAdminPath('wordpress', '/wp-admin/admin-ajax.php'), false)
  assert.equal(isAdminPath('wordpress', '/wp-admin/admin-post.php'), false)
  assert.equal(isAdminPath('wordpress', '/wp-login.php'), false)
  assert.equal(isAdminPath('wordpress', '/wp-administrator'), false)
  assert.equal(isAdminPath('joomla', '/administrator/index.php'), true)
  assert.equal(isAdminPath('joomla', '/wp-admin/'), false)
  assert.equal(isAdminPath('emdash', '/_emdash/admin'), true)
  assert.equal(isAdminPath('emdash', '/_emdash/api/content'), false)
})

for (const [platform, admin, publicPath] of [
  ['wordpress', '/wp-admin/index.php?page=x', '/wp-admin/admin-ajax.php'],
  ['joomla', '/administrator/index.php?option=com_content', '/index.php'],
  ['emdash', '/_emdash/admin/content?x=1', '/_emdash/api/search']
]) {
  test(
    `#1037: ${platform} — the back office is opened at the Tracy address, where signing in works; the public site stays on the own domain`,
    dbOpts,
    async () => {
      const { pool } = db
      const { ask, calls } = await ownDomainBed(pool, { platform })
      const res = await ask(admin, { headers: FORGED })
      assert.equal(res.status, 302)
      assert.equal(res.headers.get('location'), `${CANONICAL}${admin}`)
      assert.equal(res.headers.get('cache-control'), 'no-store')
      assert.equal(
        res.headers.getSetCookie().length,
        0,
        'no cookie of any kind is set on the own domain here'
      )
      assert.equal(calls.length, 0, 'the CMS is not asked')
      assert.equal((await ask(publicPath)).status, 200)
      assert.equal(calls.length, 1)
      // A form posted to the back office is the site's own to answer (it has no session there).
      assert.equal((await ask(admin, { method: 'POST', body: 'a=1' })).status, 200)
    }
  )
}

test(
  '#1037: a hostname that is not a connected domain of a published site is refused, and the CMS is never asked — unknown, pending, failed, released, a draft, a site with no address',
  dbOpts,
  async () => {
    const { pool } = db
    const cases = [
      ['pending, route not installed', { state: 'pending', routed: false }],
      ['pending, route installed', { state: 'pending' }],
      ['failed', { state: 'failed' }],
      ['connected, but the site is a draft', { publish: 'draft' }]
    ]
    for (const [what, options] of cases) {
      await db.reset()
      const { ask, calls } = await ownDomainBed(pool, options)
      for (const path of ['/', '/wp-login.php', '/wp-admin/', '/__tracy/build', '/robots.txt']) {
        const res = await ask(path, { headers: FORGED })
        assert.equal(res.status, 404, `${what} ${path}`)
        assert.match(await res.text(), /Tracy/, `${what}: Tracy's own refusal page`)
      }
      assert.equal(calls.length, 0, `${what}: the site is never asked`)
    }
    await db.reset()
    const { app, calls } = await ownDomainBed(pool)
    const other = (host) => app.fetch(new Request(`http://${host}/`, { headers: { host } }))
    // A name nobody holds, a near name, an IP address, a wildcard, upper case of a name not held.
    for (const host of [
      'unknown.example.com',
      `x.${OWN_DOMAIN}`,
      OWN_DOMAIN.slice(4),
      '203.0.113.9',
      '*.customer-shop.com'
    ])
      assert.equal((await other(host)).status, 404, host)
    assert.equal(calls.length, 0)
    // The name itself, however the Host header spells it, is the one row.
    assert.equal((await other(OWN_DOMAIN.toUpperCase())).status, 200)
    assert.equal((await other(`${OWN_DOMAIN}:443`)).status, 200)
    // Let go: refused, though its DNS still points here.
    await pool.query('delete from site_name where name = $1', [OWN_DOMAIN])
    await pool.query('insert into site_name_released(name) values ($1)', [OWN_DOMAIN])
    assert.deepEqual(await ownDomainByName(pool, OWN_DOMAIN), {
      name: OWN_DOMAIN,
      state: 'released',
      routedAt: null,
      probeSecret: null,
      site: null
    })
    assert.equal((await other(OWN_DOMAIN)).status, 404)
    assert.equal(await ownDomainByName(pool, 'never-heard-of.example.com'), null)
    // No address on record for the site: there is nothing to speak to the CMS as.
    await db.reset()
    const bare = await ownDomainBed(pool)
    await pool.query("update site set address = null where site_key = 'shop.example'")
    assert.equal((await bare.ask('/')).status, 404)
    assert.equal(bare.calls.length, 0)
  }
)

test(
  '#1037: an own domain opens the site that holds it and no other — never by label, never a neighbour',
  dbOpts,
  async () => {
    const { pool } = db
    const { ask, calls } = await ownDomainBed(pool)
    // A second site whose LABEL is the first label of the customer's domain.
    await createSite(pool, { siteKey: 'www.example', label: 'www', host: 'local' })
    await pool.query(
      "update site set address = 'https://www.tracy.test/', publish = 'published' where site_key = 'www.example'"
    )
    assert.equal((await ask('/')).status, 200)
    assert.equal(new URL(calls[0].url).hostname, 'shop-web-1')
    assert.equal(calls[0].headers.get('x-forwarded-host'), 'shop.tracy.test')
  }
)

test(
  '#1037: /__tracy/domain-probe answers a proof only this row can give — to a routed or connected name, for a real challenge, and it opens nothing else',
  dbOpts,
  async () => {
    const { pool } = db
    const challenge = 'c'.repeat(48)
    const proof = await probeProof('b'.repeat(64), { name: OWN_DOMAIN, siteKey: 'shop.example', challenge })
    for (const [what, options, answered] of [
      ['connected', {}, true],
      ['pending, route installed', { state: 'pending' }, true],
      ['connected, the site a draft', { publish: 'draft' }, true],
      ['pending, route not installed', { state: 'pending', routed: false }, false],
      ['failed', { state: 'failed' }, false]
    ]) {
      await db.reset()
      const { ask, calls } = await ownDomainBed(pool, options)
      const res = await ask(PROBE_PATH, { headers: { [PROBE_HEADER]: challenge, ...FORGED } })
      assert.equal(res.status, answered ? 200 : 404, what)
      if (answered) {
        const said = await res.text()
        assert.equal(said, proof, what)
        assert.notEqual(said, challenge, 'never an echo of what was sent')
        assert.equal(res.headers.get('cache-control'), 'no-store')
      }
      // No challenge, or one that is not one: refused like any other path.
      for (const bad of [undefined, '', 'short', 'Z'.repeat(48), `${challenge} x`, 'c'.repeat(65)])
        assert.equal(
          (await ask(PROBE_PATH, bad === undefined ? {} : { headers: { [PROBE_HEADER]: bad } })).status,
          404,
          `${what}: ${JSON.stringify(bad)}`
        )
      assert.equal(calls.length, 0, `${what}: the probe never reaches the CMS`)
    }
    // Another attempt, another site: another proof.
    assert.notEqual(
      proof,
      await probeProof('d'.repeat(64), { name: OWN_DOMAIN, siteKey: 'shop.example', challenge })
    )
    assert.notEqual(
      proof,
      await probeProof('b'.repeat(64), { name: OWN_DOMAIN, siteKey: 'other.example', challenge })
    )
    assert.equal(
      await probeAnswer({ name: OWN_DOMAIN, state: 'active', probeSecret: null, site: {} }, challenge),
      null
    )
  }
)

// ── #1037, review round: the page step of the probe, cookie scope, integrity, the local exception ──
import { createHash } from 'node:crypto'
import { localHostName } from '../src/bar/route.js'
import { parse as parseHtml } from 'parse5'
import { projectBody, projectPage, utf8Text, withAddedHashes } from '../src/bar/own-domain-integrity.js'

test(
  "#1037: the page the probe is asking for — an ORDINARY request, told from a visitor's only by the window on the name's row — is answered by the CMS through the proxy with the site's own status signed; it is the only thing a name still being connected is shown its site for",
  dbOpts,
  async () => {
    const { pool } = db
    const nonce = 'e'.repeat(48)
    const secret = 'b'.repeat(64)
    const about = { name: OWN_DOMAIN, siteKey: 'shop.example', nonce }
    /** The proof of an answer as a prober would compute it: over what it READ, every byte. */
    const proofOf = async (res, path = '/', bytes = null) => {
      const read = bytes ?? Buffer.from(await res.clone().arrayBuffer())
      return pageProof(secret, {
        ...about,
        path,
        status: res.status,
        contentType: res.headers.get('content-type'),
        location: res.headers.get('location'),
        digest: bodyDigest(read)
      })
    }
    /** What the prober does before it asks: the nonce and the path, on the row, for a few seconds. */
    const open = (path = '/', until = "clock_timestamp() + interval '15 seconds'", value = nonce) =>
      pool.query(
        `update site_name set probe_page_nonce = $2, probe_page_path = $3, probe_page_until = ${until}
          where name = $1`,
        [OWN_DOMAIN, value, path]
      )

    // A name whose route is installed and that is not connected yet: the page, and its signed
    // status — to a request that carries nothing of the probe (and whatever else a client adds).
    const pending = await ownDomainBed(pool, { state: 'pending' })
    await open()
    for (const headers of [{}, { ...FORGED, cookie: 'tracy_sess=x' }]) {
      pending.calls.length = 0
      const page = await pending.ask('/', { headers })
      assert.equal(page.status, 200)
      assert.equal(page.headers.get(PROBE_PAGE_HEADER), await proofOf(page))
      // 🔒 The proof is of THESE bytes: the same header beside any other body does not verify —
      // a body replaced, a body cut short, a body with one more byte.
      const body = Buffer.from(await page.clone().arrayBuffer())
      assert.equal(body.toString(), '<html><body>hi</body></html>')
      for (const other of [
        Buffer.from('<html><body>mine</body></html>'),
        body.subarray(0, 6),
        Buffer.concat([body, Buffer.from(' ')]),
        Buffer.alloc(0)
      ])
        assert.notEqual(page.headers.get(PROBE_PAGE_HEADER), await proofOf(page, '/', other))
      assert.equal(page.headers.get('cache-control'), 'no-store, no-transform')
      assert.equal(pending.calls.length, 1, 'the CMS itself was asked')
      const sent = [...pending.calls[0].headers.keys()].filter((name) => name.startsWith('x-tracy-'))
      assert.deepEqual(sent, [], 'no forged identity reaches the CMS')
      assert.equal(pending.calls[0].headers.get('cookie'), null)
    }
    // Everything else of the pending name stays shut while the window is open.
    pending.calls.length = 0
    const shut = async (what, path, init = {}) => {
      const res = await pending.ask(path, init)
      assert.equal(res.status, 404, what)
      assert.equal(res.headers.get(PROBE_PAGE_HEADER), null, what)
    }
    for (const [what, path, init] of [
      ['another path', '/about/'],
      ['the same path with a query', '/?preview=1'],
      ['the back office', '/wp-admin/'],
      ['the login page', '/wp-login.php'],
      ['a POST of the path', '/', { method: 'POST' }],
      ['a HEAD', '/', { method: 'HEAD' }],
      [
        'the headers the probe used to send',
        '/about/',
        { headers: { [PROBE_HEADER]: nonce, 'x-tracy-domain-probe-key': nonce } }
      ]
    ])
      await shut(what, path, init)
    // …and the path itself shuts with the window: lapsed, closed, or holding no usable nonce.
    for (const [what, until, value] of [
      ['the window lapsed', "clock_timestamp() - interval '1 second'", nonce],
      ['the window was closed', 'null', nonce],
      ['no nonce', "clock_timestamp() + interval '15 seconds'", null],
      ['a nonce that is not one', "clock_timestamp() + interval '15 seconds'", 'short']
    ]) {
      await open('/', until, value)
      await shut(what, '/')
    }
    assert.equal(pending.calls.length, 0, 'none of them reached the CMS')
    // The window names ONE path — the one the prober follows a redirect to is opened on its own.
    await open('/en/?a=1')
    await shut('the home page, once the window moved on', '/')
    const hop = await pending.ask('/en/?a=1')
    assert.equal(hop.status, 200)
    assert.equal(hop.headers.get(PROBE_PAGE_HEADER), await proofOf(hop, '/en/?a=1'))
    assert.notEqual(hop.headers.get(PROBE_PAGE_HEADER), await proofOf(hop, '/'))

    // The states an open window opens nothing in: route not installed, a draft site, a failed name.
    for (const [what, options] of [
      ['route not installed', { state: 'pending', routed: false }],
      ['the site is a draft', { state: 'pending', publish: 'draft' }],
      ['connected, the site a draft', { publish: 'draft' }],
      ['failed', { state: 'failed' }]
    ]) {
      await db.reset()
      const bed = await ownDomainBed(pool, options)
      await open()
      const res = await bed.ask('/')
      assert.equal(res.status, 404, what)
      assert.equal(res.headers.get(PROBE_PAGE_HEADER), null, what)
      assert.equal(bed.calls.length, 0, what)
    }
    // No secret (the attempt was taken back): the window signs nothing.
    await db.reset()
    const taken = await ownDomainBed(pool, { state: 'pending' })
    await open()
    await pool.query('update site_name set probe_secret = null where name = $1', [OWN_DOMAIN])
    assert.equal((await taken.ask('/')).status, 404)

    // 🔒 The signature is of what the SITE answered: a CMS that is down, or answers an error, or
    // nothing at all, is signed as that — the route proof alone would have called this connected.
    for (const [what, fetchImpl, status] of [
      [
        'the CMS is stopped',
        () => {
          throw new Error('ECONNREFUSED')
        },
        502
      ],
      ['the CMS answers 500', () => new Response('boom', { status: 500 }), 500],
      ['the CMS answers 404', () => new Response('nf', { status: 404 }), 404],
      ['the CMS answers 204', () => new Response(null, { status: 204 }), 204],
      // 🔒 A home page that cannot be told whole on the own domain is REFUSED, and the refusal is
      // what is signed: a 502, which connects nothing — never a 200 over a page half in each name.
      ...[
        [
          'an inline script left unread',
          'text/html',
          `<html><script>var a = "${CANONICAL}/" +</script></html>`
        ],
        ['not UTF-8', 'text/html; charset=windows-1252', `<html><a href="${CANONICAL}/">x</a></html>`],
        ['XHTML', 'application/xhtml+xml', `<html><a href="${CANONICAL}/">x</a></html>`]
      ].map(([what, type, html]) => [
        `the home page cannot be projected: ${what}`,
        () =>
          new Response(html, {
            headers: { 'content-type': type, 'content-security-policy': `img-src ${CANONICAL}` }
          }),
        502
      ]),
      [
        'the CMS redirects within the site',
        () => new Response(null, { status: 302, headers: { location: `${CANONICAL}/en/` } }),
        302
      ]
    ]) {
      await db.reset()
      const bed = await ownDomainBed(pool, { state: 'pending', fetchImpl })
      await open()
      const res = await bed.ask('/')
      assert.equal(res.status, status, what)
      assert.equal(res.headers.get(PROBE_PAGE_HEADER), await proofOf(res), what)
      if (what.startsWith('the home page cannot be projected')) {
        assert.match(
          res.headers.get('x-tracy-own-domain-projection'),
          /^refused; reason=(parse|charset|xhtml)$/
        )
        // The policy on the refusal is the refusal page's own, never the site's told for this name.
        assert.doesNotMatch(
          res.headers.get('content-security-policy') ?? '',
          /shop\.tracy\.test|customer-shop/,
          what
        )
        assert.equal((await res.clone().text()).includes('shop.tracy.test'), false, what)
      }
      const as200 = new Response(await res.clone().arrayBuffer(), { status: 200, headers: res.headers })
      assert.notEqual(res.headers.get(PROBE_PAGE_HEADER), await proofOf(as200), what)
      if (status === 302) {
        assert.equal(res.headers.get('location'), `https://${OWN_DOMAIN}/en/`)
        // The `Location` is signed too: the same proof beside another one does not verify.
        const elsewhere = new Response(null, {
          status: 302,
          headers: { location: `https://${OWN_DOMAIN}/x/` }
        })
        assert.notEqual(res.headers.get(PROBE_PAGE_HEADER), await proofOf(elsewhere), what)
      }
    }

    // 🔒 A body that was not read to its end is never vouched for as a page. One that breaks off
    // while the proxy reads it, and one that never ends (refused past the ceiling, its stream let
    // go), are each answered by the proxy's own 502, signed AS a 502 — which connects nothing.
    // Neither sends the prefix that did arrive.
    for (const [what, body, signed] of [
      [
        'a page that breaks off',
        () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(Buffer.from('<html><body>begin'))
            },
            pull(controller) {
              controller.error(new Error('ECONNRESET'))
            }
          }),
        true
      ],
      [
        'a page that never ends',
        () =>
          new ReadableStream({
            pull(controller) {
              controller.enqueue(Buffer.alloc(1024 * 1024, 0x20))
            }
          }),
        true
      ]
    ]) {
      await db.reset()
      const bed = await ownDomainBed(pool, {
        state: 'pending',
        fetchImpl: () => new Response(body(), { headers: { 'content-type': 'text/html' } })
      })
      await open()
      const res = await bed.ask('/')
      assert.equal(res.status, 502, what)
      assert.equal(res.headers.get(PROBE_PAGE_HEADER), signed ? await proofOf(res) : null, what)
      const as200 = new Response(await res.clone().arrayBuffer(), { status: 200, headers: res.headers })
      assert.notEqual(res.headers.get(PROBE_PAGE_HEADER), await proofOf(as200), what)
      assert.equal((await res.text()).includes('begin'), false, what)
    }

    // A connected name: a visitor's page carries no signature outside a window, and inside one the
    // page being asked is signed — for whoever asks it, since nothing tells the probe apart.
    await db.reset()
    const live = await ownDomainBed(pool)
    assert.equal((await live.ask('/')).headers.get(PROBE_PAGE_HEADER), null)
    await open()
    const signed = await live.ask('/')
    assert.equal(signed.headers.get(PROBE_PAGE_HEADER), await proofOf(signed))
    const other = await live.ask('/about/')
    assert.equal(other.status, 200, 'the rest of a connected site is served as ever')
    assert.equal(other.headers.get(PROBE_PAGE_HEADER), null)
    // The unit: the row decides, and every part of it must be there.
    const own = {
      name: OWN_DOMAIN,
      state: 'active',
      routedAt: new Date(),
      probeSecret: secret,
      page: { nonce, path: '/' },
      site: { site_key: 'shop.example' }
    }
    const asked = { method: 'GET', path: '/' }
    const sent = {
      status: 200,
      contentType: 'text/html',
      location: null,
      digest: bodyDigest(Buffer.from('x'))
    }
    assert.equal(
      await (await probePage(own, asked))(sent),
      await pageProof(secret, { ...about, path: '/', ...sent })
    )
    // Every field of what was sent is in the proof: change one and it is another proof.
    for (const changed of [
      { status: 204 },
      { contentType: 'text/plain' },
      { location: '/x' },
      { digest: bodyDigest(Buffer.from('y')) }
    ])
      assert.notEqual(
        await (await probePage(own, asked))({ ...sent, ...changed }),
        await pageProof(secret, { ...about, path: '/', ...sent }),
        JSON.stringify(changed)
      )
    for (const [what, row, ask] of [
      ['no secret', { ...own, probeSecret: null }, asked],
      ['no window', { ...own, page: null }, asked],
      ['no site', { ...own, site: null }, asked],
      ['a state that serves nothing', { ...own, state: 'failed' }, asked],
      ['pending, route not installed', { ...own, state: 'pending', routedAt: null }, asked],
      ['another path', own, { method: 'GET', path: '/x' }],
      ['another method', own, { method: 'POST', path: '/' }],
      ['a nonce that is not one', { ...own, page: { nonce: 'x', path: '/' } }, asked]
    ])
      assert.equal(await probePage(row, ask), null, what)
  }
)

test(
  '#1037: a cookie the CMS scopes to ANY domain that covers its Tracy address becomes host-only on the own domain — the exact host, a parent, a leading dot, upper case; a domain that does not cover it is left as written',
  dbOpts,
  async () => {
    const { pool } = db
    const lines = [
      ['exact=1; Path=/; Domain=shop.tracy.test; HttpOnly', 'exact=1; Path=/; HttpOnly'],
      ['parent=2; Domain=.tracy.test; Path=/', 'parent=2; Path=/'],
      ['bare=3; domain=tracy.test', 'bare=3'],
      ['upper=4; DOMAIN=.TRACY.TEST; Secure', 'upper=4; Secure'],
      ['dotted=5; Domain=shop.tracy.test.; SameSite=Lax', 'dotted=5; SameSite=Lax'],
      ['spaced=6;  Domain = .tracy.test ; Path=/x', 'spaced=6; Path=/x'],
      ['twice=7; Domain=.tracy.test; Domain=shop.tracy.test', 'twice=7'],
      // Not a domain the canonical host is, or lies under: never this site's cookie — as written.
      ['other=8; Domain=other.example', 'other=8; Domain=other.example'],
      ['near=9; Domain=evilshop.tracy.test', 'near=9; Domain=evilshop.tracy.test'],
      ['child=10; Domain=x.shop.tracy.test', 'child=10; Domain=x.shop.tracy.test'],
      ['suffix=11; Domain=racy.test', 'suffix=11; Domain=racy.test'],
      // `domain=` inside the VALUE is the value.
      ['value=domain=.tracy.test; Path=/', 'value=domain=.tracy.test; Path=/'],
      ['none=12; Path=/', 'none=12; Path=/']
    ]
    const { ask } = await ownDomainBed(pool, {
      fetchImpl: () => {
        const headers = new Headers({ 'content-type': 'text/html' })
        for (const [line] of lines) headers.append('set-cookie', line)
        headers.append('set-cookie', 'tracy_sess=stolen; Domain=.tracy.test; Path=/')
        return new Response('<html><body>x</body></html>', { headers })
      }
    })
    for (const path of ['/', '/a.css']) {
      const res = await ask(path)
      assert.deepEqual(
        res.headers.getSetCookie().map((line) => line.replace(/\s*;\s*/g, '; ').trim()),
        lines.map(([, kept]) => kept),
        path
      )
    }
  }
)

test("#1037: the closed list of hostnames that reach Tracy's own app without being Tracy's — an address inside the machine, never a public name", () => {
  for (const local of [
    '127.0.0.1',
    '10.0.0.7',
    '172.31.0.4',
    '[',
    'localhost',
    'tracy-web',
    'web_1',
    'app.localhost',
    'tracy.test',
    'api.test',
    'host.docker.internal',
    'ip-10-0-0-7.ec2.internal',
    'mac.local'
  ])
    assert.equal(localHostName(local), true, local)
  for (const open of [
    'example.com',
    'never-held.example.org',
    'localhost.example.com',
    'internal.example.com',
    'tracy.test.evil.example',
    'test.example.com',
    'a.testing',
    'xn--e1afmkfd.xn--p1ai',
    '127.0.0.1.nip.io',
    'a b',
    '*.example.com',
    '',
    null,
    undefined
  ])
    assert.equal(localHostName(open), false, String(open))
})

const OWN = `https://${OWN_DOMAIN}`
const projection = () => originProjection(new URL(CANONICAL), new URL(OWN))

test("#1037 projection: ONE complete URL value is replaced only when the URL parser says its origin is the site's and it is spelled plainly — the site's name as another host's USER part, however the @ is written and however far away, is never the site", () => {
  const p = projection()
  // The site's own, in the one plain spelling.
  for (const [mine, made] of [
    ['https://shop.tracy.test', OWN],
    ['https://shop.tracy.test/', `${OWN}/`],
    ['http://shop.tracy.test/old', `${OWN}/old`],
    ['HTTPS://SHOP.Tracy.Test/A?b=C#d', `${OWN}/A?b=C#d`],
    ['https://shop.tracy.test:443/x', `${OWN}/x`],
    ['http://shop.tracy.test:80/x', `${OWN}/x`],
    ['https://shop.tracy.test/a?mail=a@b.c', `${OWN}/a?mail=a@b.c`],
    ['https://shop.tracy.test?m=a@b', `${OWN}?m=a@b`],
    ['https://shop.tracy.test#a@b', `${OWN}#a@b`],
    ['  https://shop.tracy.test/x', `  ${OWN}/x`],
    ['https://shop.tracy.test/é✓/(a)', `${OWN}/é✓/(a)`],
    ['https://shop.tracy.test/x \n', `${OWN}/x \n`]
  ])
    assert.equal(p.url(mine), made, mine)
  // 🔒 Somebody else's address, or not provably an address at all: left exactly as written.
  const far = (n) => `https://shop.tracy.test:${'p'.repeat(n)}@other.example/`
  for (const elsewhere of [
    'https://shop.tracy.test@other.example/',
    'https://shop.tracy.test:secret@other.example/x',
    'http://shop.tracy.test@other.example',
    'https://shop.tracy.test!x@other.example/',
    "https://shop.tracy.test'x@other.example/",
    'https://shop.tracy.test;a=b,c@other.example/',
    // The review's cases: `&` and `+` do not end an authority.
    'https://shop.tracy.test&u@other.example',
    'https://shop.tracy.test+u@other.example',
    'https://shop.tracy.test&u@other.example/path',
    far(97),
    far(900),
    far(1025),
    far(70000),
    // A spelling a browser reads differently from how it looks.
    'https://shop.tracy.test%40other.example/',
    'https://shop.tracy.test\\@other.example/',
    'https://shop.tracy.test\t@other.example/',
    'https://shop.tracy.test\n/x',
    'https:/\\shop.tracy.test/',
    'https:\\\\shop.tracy.test/',
    'https:///shop.tracy.test/',
    'https:shop.tracy.test/',
    'https://shop%2Etracy.test/',
    'https://shop.tracy.test./',
    // Another host, another port, another scheme.
    'https://shop.tracy.test.evil.example/',
    'https://shop.tracy.test-old.example/',
    'https://myshop.tracy.test/',
    'https://shop.tracy.test:8443/',
    'https://shop.tracy.test:x/',
    'https://user@shop.tracy.test/',
    'https://user:pw@shop.tracy.test/',
    'wss://shop.tracy.test/live',
    'shttp://shop.tracy.test/',
    'git+https://shop.tracy.test/',
    // Not a complete URL value: prose, a prefix, an encoded or escaped string.
    'see https://shop.tracy.test/ here',
    'https://shop.tracy.test/ and more',
    'https://shop.tracy.test/a"b',
    'https://shop.tracy.test/<b>',
    'https://shop.tracy.test/a\\b',
    'url(https://shop.tracy.test/a.png)',
    'https%3A%2F%2Fshop.tracy.test%2F',
    'https%3A%2F%2Fshop.tracy.test&u%40other.example',
    'https%3A%2F%2Fshop.tracy.test+u%40other.example',
    'https:\\/\\/shop.tracy.test\\/',
    'https:\\/\\/shop.tracy.test\\u0040other.example\\/',
    '//shop.tracy.test/x',
    'shop.tracy.test',
    '',
    'http://%zz//shop.tracy.test'
  ])
    assert.equal(p.url(elsewhere), null, elsewhere.slice(0, 90))
  // `//host/…` is a URL only where the format says the value is one.
  assert.equal(p.url('//shop.tracy.test/x', { schemeless: true }), `//${OWN_DOMAIN}/x`)
  assert.equal(p.url('//shop.tracy.test@other.example/x', { schemeless: true }), null)
  assert.equal(p.url('//shop.tracy.test.evil.example/x', { schemeless: true }), null)
  // A value something is appended to at run time must already have ended its authority.
  assert.equal(p.url('https://shop.tracy.test', { continued: true }), null)
  assert.equal(p.url('https://shop.tracy.test/', { continued: true }), `${OWN}/`)
  assert.equal(p.url('https://shop.tracy.test?x=', { continued: true }), `${OWN}?x=`)

  // 🔒 Percent-encoding is decoded in ONE place: a value of the query of a URL parsed as above.
  const enc = encodeURIComponent
  for (const [written, made] of [
    [
      `https://x.example/share?url=${enc(`${CANONICAL}/p?a=1`)}&t=a+b`,
      `https://x.example/share?url=${enc(`${OWN}/p?a=1`)}&t=a+b`
    ],
    [
      `${CANONICAL}/wp-login.php?redirect_to=${enc(`${CANONICAL}/wp-admin/`)}`,
      `${OWN}/wp-login.php?redirect_to=${enc(`${OWN}/wp-admin/`)}`
    ],
    [
      `https://x.example/?u=${CANONICAL}/a#frag?u=${enc(CANONICAL)}`,
      `https://x.example/?u=${enc(`${OWN}/a`)}#frag?u=${enc(CANONICAL)}`
    ],
    [
      `https://x.example/?a=${enc(`https://y.example/?b=${enc(`${CANONICAL}/z`)}`)}`,
      `https://x.example/?a=${enc(`https://y.example/?b=${enc(`${OWN}/z`)}`)}`
    ]
  ])
    assert.equal(p.url(written), made, written)
  for (const kept of [
    `https://x.example/?u=${enc('https://shop.tracy.test@other.example/')}`,
    `https://x.example/?u=${enc('https://shop.tracy.test&u@other.example')}`,
    'https://x.example/?u=https%3A%2F%2Fshop.tracy.test&u%40other.example',
    'https://x.example/?u=https%3A%2F%2Fshop.tracy.test+u%40other.example',
    `https://x.example/?u=${enc(`see ${CANONICAL}/`)}`,
    'https://x.example/?u=%E0%A4%A',
    `https://x.example/#u=${enc(CANONICAL)}`,
    `https://x.example/p/${enc(CANONICAL)}`
  ])
    assert.equal(p.url(kept), null, kept)
  // A relative reference names no host: only its query can carry an address.
  assert.equal(
    p.url(`/share?u=${enc(`${CANONICAL}/a`)}`, { schemeless: true }),
    `/share?u=${enc(`${OWN}/a`)}`
  )
  assert.equal(p.url(`/share?u=${enc(`${CANONICAL}/a`)}`), null)
  assert.equal(p.url('/plain/path', { schemeless: true }), null)
  // The request's own query, told back in the CMS's terms.
  const back = originProjection(new URL(OWN), new URL(CANONICAL))
  assert.equal(
    back.search(`?redirect_to=${enc(`${OWN}/a`)}&x=1`),
    `?redirect_to=${enc(`${CANONICAL}/a`)}&x=1`
  )
  assert.equal(back.search(''), '')
  assert.equal(back.search('?a=%zz&b'), '?a=%zz&b')
})

test('#1037 projection: a script is read by a JavaScript parser — only a STATIC string that is wholly a URL changes; a percent-encoded argument, the right-hand side of a +, a template with expressions, a key and a comment do not', () => {
  const p = projection()
  // The review's cases, as a script: both stay exactly as written.
  for (const kept of [
    "decodeURIComponent('https%3A%2F%2Fshop.tracy.test&u%40other.example')",
    "decodeURIComponent('https%3A%2F%2Fshop.tracy.test+u%40other.example')",
    "location = 'https://shop.tracy.test' + '@other.example/'",
    "var u = 'https://shop.tracy.test'; u += '@other.example/'",
    "location = prefix + 'https://shop.tracy.test/'",
    'location = `https://shop.tracy.test${tail}`',
    'location = `https://shop.tracy.test/${tail}`',
    "location = 'https://shop.tracy.test'.concat('@other.example/')",
    'tag`https://shop.tracy.test/`',
    "var o = { 'https://shop.tracy.test/': 1 }",
    '// https://shop.tracy.test/\nvar a = 1 /* "https://shop.tracy.test/" */',
    'var re = /https:\\/\\/shop.tracy.test\\//',
    // A string a script holds can be appended to anywhere: a bare origin is never known to be whole.
    "var a = 'https://shop.tracy.test'",
    "var o = { home: 'https://shop.tracy.test', n: 1 }",
    "var s = 'see https://shop.tracy.test/ for more'",
    'var s = \'<a href="https://shop.tracy.test/">x</a>\'',
    "var s = 'https://shop.tracy.test@other.example/'",
    "var s = 'https:\\/\\/shop.tracy.test\\u0040other.example\\/'",
    "var s = 'https://shop.tracy.test.evil.example/'"
  ])
    assert.equal(p.script(kept), null, kept)
  for (const [written, made] of [
    [
      `var s = {"root":"https:\\/\\/shop.tracy.test\\/wp-json\\/","n":1}`,
      `var s = {"root":"${OWN}/wp-json/","n":1}`
    ],
    [
      `var a = 'https://shop.tracy.test', b = "http://shop.tracy.test/x?y=1"`,
      `var a = 'https://shop.tracy.test', b = "${OWN}/x?y=1"`
    ],
    ['var t = `https://shop.tracy.test/t`', `var t = "${OWN}/t"`],
    [`fetch('https://shop.tracy.test/api/' + id)`, `fetch("${OWN}/api/" + id)`],
    [
      `import x from 'https://shop.tracy.test/m.js'; export default x`,
      `import x from "${OWN}/m.js"; export default x`
    ],
    [`var u = '\\x68ttps://shop.tracy.test/\\u00e9'`, `var u = "${OWN}/é"`],
    [
      `var o = { ['https://shop.tracy.test/']: 'https://shop.tracy.test/x', k: 'https://shop.tracy.test/</script>' }`,
      `var o = { ["${OWN}/"]: "${OWN}/x", k: 'https://shop.tracy.test/</script>' }`
    ]
  ])
    assert.equal(p.script(written), made, written)
  // An event handler is the body of a function.
  assert.equal(p.script("return go('https://shop.tracy.test/')", { handler: true }), `return go("${OWN}/")`)
  // Not a script this parser reads: nothing changes, and the caller is told.
  let refused = 0
  assert.equal(p.script("var a = 'https://shop.tracy.test/' +", { refused: () => refused++ }), null)
  assert.equal(p.script('<?php echo "https://shop.tracy.test/"; ?>', { refused: () => refused++ }), null)
  assert.equal(refused, 2)
  assert.equal(p.script('var broken = (', { refused: () => refused++ }), null, 'no mention, never parsed')
  assert.equal(refused, 2)
})

test('#1037 projection: JSON, CSS, srcset and XML each by their own parser — string values, url() and @import, candidates, attribute values and whole-text elements — and everything else byte for byte', () => {
  const p = projection()
  // JSON: values only; a number is never re-serialized; a key is the document's own name for a thing.
  assert.equal(
    p.json(
      `{"home":"https:\\/\\/shop.tracy.test\\/", "https://shop.tracy.test/":12345678901234567890, "n":1.0,\n "list":["https://shop.tracy.test/a","https://cdn.example/b",null,true], "html":"<a href=\\"https://shop.tracy.test/\\">x</a>"}`
    ),
    `{"home":"${OWN}/", "https://shop.tracy.test/":12345678901234567890, "n":1.0,\n "list":["${OWN}/a","https://cdn.example/b",null,true], "html":"<a href=\\"https://shop.tracy.test/\\">x</a>"}`
  )
  assert.equal(p.json(`"https://shop.tracy.test/x"`), `"${OWN}/x"`)
  let refused = 0
  for (const notJson of [
    `{"a":"https://shop.tracy.test/"} trailing`,
    `{'a':'https://shop.tracy.test/'}`,
    `{"a":"https://shop.tracy.test/"`,
    `callback({"a":"https://shop.tracy.test/"})`
  ])
    assert.equal(p.json(notJson, { refused: () => refused++ }), null, notJson)
  assert.equal(refused, 4)
  assert.equal(p.json('{"a":"https://shop.tracy.test@other.example/"}'), null)

  // CSS: url() in any quoting and an @import's string; other strings are text.
  assert.equal(
    p.css(
      `@import "https://shop.tracy.test/a.css"; @import url(https://shop.tracy.test/b.css) screen;\na{background:url( 'https://shop.tracy.test/i.png' ),url(//shop.tracy.test/j.png),url(https://shop.tracy.test@other.example/k.png),url(https://cdn.example/l.png)}\nb::after{content:"https://shop.tracy.test/"} /* url(https://shop.tracy.test/c.png) */`
    ),
    `@import "${OWN}/a.css"; @import url("${OWN}/b.css") screen;\na{background:url("${OWN}/i.png"),url("//${OWN_DOMAIN}/j.png"),url(https://shop.tracy.test@other.example/k.png),url(https://cdn.example/l.png)}\nb::after{content:"https://shop.tracy.test/"} /* url(https://shop.tracy.test/c.png) */`
  )
  assert.equal(
    p.css('color:red;background:url(https://shop.tracy.test/q.png)', { declarations: true }),
    `color:red;background:url("${OWN}/q.png")`
  )
  assert.equal(
    p.css('a{background:url(https://shop.tracy.test/a"b<c.png)}'),
    null,
    'not a url() by CSS rules'
  )
  assert.equal(
    p.css(`a{background:url("https://shop.tracy.test/a\\"b<c.png")}`),
    null,
    'a quote or a < is not written in a URL: left as the site wrote it'
  )
  assert.equal(
    p.css(`a{background:url('https://shop.tracy.test/a(b)\\27 c.png')}`),
    `a{background:url("${OWN}/a(b)'c.png")}`
  )

  // srcset: HTML's own candidate rules — a comma inside a URL, descriptors, no space after a comma.
  assert.equal(
    p.srcset(
      'https://shop.tracy.test/1.png 1x, https://shop.tracy.test/2,3.png 2x,https://cdn.example/3.png 3x,\n //shop.tracy.test/4.png 100w'
    ),
    `${OWN}/1.png 1x, ${OWN}/2,3.png 2x,https://cdn.example/3.png 3x,\n //${OWN_DOMAIN}/4.png 100w`
  )
  assert.equal(p.srcset('https://shop.tracy.test@other.example/1.png 1x'), null)
  assert.equal(p.srcset('/a.png 1x, /b.png 2x'), null)

  // XML: attribute values, an element whose whole text is a URL (entities and CDATA), the style
  // sheet instruction; text that merely contains an address, and a comment, are left.
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?xml-stylesheet type="text/xsl" href="https://shop.tracy.test/wp-sitemap.xsl"?>',
    '<!-- https://shop.tracy.test/ -->',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    '<url><loc> https://shop.tracy.test/?a=1&amp;b=2 </loc><guid><![CDATA[https://shop.tracy.test/c]]></guid>',
    '<description>see https://shop.tracy.test/ here</description>',
    '<mixed>https://shop.tracy.test/<b/></mixed>',
    `<xhtml:link rel="alternate" href='https://shop.tracy.test/h' title="https://shop.tracy.test@o.example/"/>`,
    '<loc>https://shop.tracy.test@other.example/</loc></url></urlset>'
  ].join('\n')
  assert.equal(
    p.xml(xml),
    xml
      .replace('href="https://shop.tracy.test/wp-sitemap.xsl"', `href="${OWN}/wp-sitemap.xsl"`)
      .replace('<loc> https://shop.tracy.test/?a=1&amp;b=2 </loc>', `<loc> ${OWN}/?a=1&amp;b=2 </loc>`)
      .replace('<![CDATA[https://shop.tracy.test/c]]>', `<![CDATA[${OWN}/c]]>`)
      .replace("href='https://shop.tracy.test/h'", `href='${OWN}/h'`)
  )
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>a{fill:url(https://shop.tracy.test/p.svg#g)}</style><a xlink:href="//shop.tracy.test/x" style="background:url(https://shop.tracy.test/y.png)"><image href="https://shop.tracy.test/i.png"/></a></svg>`
  assert.equal(
    p.xml(svg),
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><style>a{fill:url("${OWN}/p.svg#g")}</style><a xlink:href="//${OWN_DOMAIN}/x" style="background:url(&quot;${OWN}/y.png&quot;)"><image href="${OWN}/i.png"/></a></svg>`
  )
  // Not well-formed: nothing changes, and the caller is told.
  let unread = 0
  assert.equal(p.xml('<a href="https://shop.tracy.test/"><b></a>', { refused: () => unread++ }), null)
  assert.equal(unread, 1)
  // 🔒 A nested value that names the site and cannot be told: the WHOLE document is left as it was
  // and the caller is told, though another address in it could have been.
  for (const part of [
    `<style>a{filter:progid:X(src='https://shop.tracy.test/a.png')}</style>`,
    `<style><![CDATA[a{filter:progid:X(src='https://shop.tracy.test/a.png')}]]></style>`,
    `<rect style="filter:progid:X(src='https://shop.tracy.test/a.png')"/>`,
    `<style>a{fill:url(https://shop.tracy.test/a.svg#g)}<![CDATA[b{fill:red}]]></style>`
  ]) {
    let told = 0
    const doc = `<svg><a href="https://shop.tracy.test/">x</a>${part}</svg>`
    assert.equal(p.xml(doc, { refused: () => told++ }), null, part)
    assert.ok(told > 0, part)
  }
  // Unread CSS that never names the site has nothing to tell: the rest is told, and nothing is said.
  let quiet = 0
  assert.equal(
    p.xml(
      `<svg><a href="https://shop.tracy.test/">x</a><style>a{filter:progid:X(src='/a.png')}</style></svg>`,
      {
        refused: () => quiet++
      }
    ),
    `<svg><a href="${OWN}/">x</a><style>a{filter:progid:X(src='/a.png')}</style></svg>`
  )
  assert.equal(quiet, 0)

  // robots.txt: the one line that is a URL by definition.
  assert.equal(
    p.robots(
      `User-agent: *\nDisallow: /https://shop.tracy.test/\nSitemap: https://shop.tracy.test/sitemap.xml\nsitemap:https://shop.tracy.test@o.example/s.xml\n`
    ),
    `User-agent: *\nDisallow: /https://shop.tracy.test/\nSitemap: ${OWN}/sitemap.xml\nsitemap:https://shop.tracy.test@o.example/s.xml\n`
  )
})

test('#1037 projection: a comment is read only when the parser hands it over as nothing but a source directive — `# sourceURL=` and `# sourceMappingURL=` name one URL; any other comment, and a directive naming another host, stay byte for byte', () => {
  const p = projection()
  // What WordPress closes every inline style and script with.
  assert.equal(
    p.css('.a{b:c}\n/*# sourceURL=https://shop.tracy.test/wp-includes/blocks/x/style.min.css */\n'),
    `.a{b:c}\n/*# sourceURL=${OWN}/wp-includes/blocks/x/style.min.css */\n`
  )
  assert.equal(
    p.script('var a = 1\n//# sourceURL=https://shop.tracy.test/wp-includes/js/a.js\n'),
    `var a = 1\n//# sourceURL=${OWN}/wp-includes/js/a.js\n`
  )
  assert.equal(
    p.script('var a = 1 /*# sourceMappingURL=//shop.tracy.test/a.js.map */'),
    `var a = 1 /*# sourceMappingURL=//${OWN_DOMAIN}/a.js.map */`
  )
  assert.equal(
    p.script('var a = 1\n//@ sourceURL=https://shop.tracy.test/a.js'),
    `var a = 1\n//@ sourceURL=${OWN}/a.js`
  )
  for (const kept of [
    '.a{b:c} /* see https://shop.tracy.test/x.css */',
    '.a{b:c} /*# sourceURL=https://shop.tracy.test@other.example/x.css */',
    '.a{b:c} /*# sourceURL=https://shop.tracy.test.other.example/x.css */',
    '.a{b:c} /*# sourceURL=https://shop.tracy.test/x.css and more */',
    '.a{b:c} /* # sourceURL=https://shop.tracy.test/x.css */'
  ])
    assert.equal(p.css(kept), null, kept)
  for (const kept of [
    'var a = 1 // https://shop.tracy.test/a.js',
    'var a = 1 //# sourceURL=https://shop.tracy.test:8443/a.js',
    'var a = 1 //# sourceURL=https://shop.tracy.test%40other.example/a.js',
    'var a = 1 //# sourceURL=https://shop.tracy.test&u@other.example/a.js',
    'var a = 1 /* note\n# sourceURL=https://shop.tracy.test/a.js */'
  ])
    assert.equal(p.script(kept), null, kept)
  // A string that merely looks like the directive is a string, read by the string rule.
  assert.equal(p.script(`var a = '//# sourceURL=https://shop.tracy.test/a.js'`), null)
})

test('#1037 projection: response headers by their own formats — one URL, each <URI> of Link, each source of a policy — and no header is searched for the name', () => {
  const p = projection()
  for (const [name, value, made] of [
    ['location', `${CANONICAL}/there?x=1`, `${OWN}/there?x=1`],
    ['location', '//shop.tracy.test/x', `//${OWN_DOMAIN}/x`],
    ['content-location', 'http://shop.tracy.test/doc', `${OWN}/doc`],
    [
      'link',
      `<${CANONICAL}/wp-json/>; rel="https://api.w.org/", <${CANONICAL}/?p=1>; rel=shortlink, <https://shop.tracy.test@o.example/>; rel=x`,
      `<${OWN}/wp-json/>; rel="https://api.w.org/", <${OWN}/?p=1>; rel=shortlink, <https://shop.tracy.test@o.example/>; rel=x`
    ],
    [
      'content-security-policy',
      `default-src 'self' ${CANONICAL}; img-src https://shop.tracy.test.evil.example ${CANONICAL}/img/;report-uri ${CANONICAL}/csp`,
      `default-src 'self' ${OWN}; img-src https://shop.tracy.test.evil.example ${OWN}/img/;report-uri ${OWN}/csp`
    ],
    ['access-control-allow-origin', CANONICAL, OWN],
    ['refresh', `5; url=${CANONICAL}/next`, `5; url=${OWN}/next`],
    ['x-pingback', `${CANONICAL}/xmlrpc.php`, `${OWN}/xmlrpc.php`]
  ])
    assert.equal(p.header(name, value), made, `${name}: ${value}`)
  for (const [name, value] of [
    ['location', 'https://shop.tracy.test@other.example/'],
    ['location', 'https://shop.tracy.test&u@other.example'],
    ['location', '/relative'],
    ['x-powered-by', `see ${CANONICAL}/`],
    ['x-custom', `u=${encodeURIComponent(CANONICAL)}`],
    ['access-control-allow-origin', '*'],
    ['link', '<https://cdn.example/a.css>; rel=preload'],
    ['content-security-policy', "default-src 'self' https://shop.tracy.test:8443"]
  ])
    assert.equal(p.header(name, value), null, `${name}: ${value}`)
})

const sha = (algorithm, text) =>
  `'${algorithm}-${createHash(algorithm).update(text, 'utf8').digest('base64')}'`

/** A page through `projectPage`, as the proxy calls it. */
const page = (html, policies = [], path = '/shop/page') =>
  projectPage(html, { projection: projection(), canonical: new URL(CANONICAL), path, policies })

test("#1037 page: the page is read by the HTML parser — an attribute is an attribute, with its character references read; what only looks like one inside a comment, a script string, a textarea or a title is the site's own text", () => {
  // Every place a URL attribute can be written, and how.
  const html = [
    '<!doctype html>\r\n<html><head><meta charset="utf-8">',
    `<link rel=canonical HREF=https://shop.tracy.test/x?a=1&amp;b=2 href="second-is-ignored">`,
    `<link rel="alternate" href='https&colon;//shop.tracy.test/feed/'>`,
    '<meta property="og:url" content="https://shop.tracy.test/about/">',
    '<meta http-equiv="refresh" content="0; url=https://shop.tracy.test/next">',
    '</head><body>',
    '<a href="//shop.tracy.test/p">p</a><form action="http://shop.tracy.test/send"></form>',
    `<a href="/share?u=${encodeURIComponent(`${CANONICAL}/about/`)}">share</a>`,
    '<img src="https://shop.tracy.test/a.png" srcset="https://shop.tracy.test/a.png 1x, https://shop.tracy.test/b.png 2x" data-lazy="https://shop.tracy.test/c.png">',
    `<div style="background:url(https://shop.tracy.test/bg.png)" onclick="go(&quot;https://shop.tracy.test/q&quot;)" data-settings='{"u":"https:\\/\\/shop.tracy.test\\/w","n":1.50}'></div>`,
    '<noscript><img src="https://shop.tracy.test/n.png"></noscript>',
    '<template><a href="https://shop.tracy.test/t">t</a></template>',
    '<svg><a xlink:href="https://shop.tracy.test/s"><image href="https://shop.tracy.test/i.svg"/></a></svg>',
    '</body></html>'
  ].join('\n')
  const made = page(html).html
  assert.equal(
    made,
    [
      '<!doctype html>\r\n<html><head><meta charset="utf-8">',
      `<link rel=canonical HREF="${OWN}/x?a=1&amp;b=2" href="second-is-ignored">`,
      `<link rel="alternate" href="${OWN}/feed/">`,
      `<meta property="og:url" content="${OWN}/about/">`,
      `<meta http-equiv="refresh" content="0; url=${OWN}/next">`,
      '</head><body>',
      `<a href="//${OWN_DOMAIN}/p">p</a><form action="${OWN}/send"></form>`,
      `<a href="/share?u=${encodeURIComponent(`${OWN}/about/`)}">share</a>`,
      `<img src="${OWN}/a.png" srcset="${OWN}/a.png 1x, ${OWN}/b.png 2x" data-lazy="${OWN}/c.png">`,
      `<div style="background:url(&quot;${OWN}/bg.png&quot;)" onclick="go(&quot;${OWN}/q&quot;)" data-settings="{&quot;u&quot;:&quot;${OWN}/w&quot;,&quot;n&quot;:1.50}"></div>`,
      `<noscript><img src="${OWN}/n.png"></noscript>`,
      `<template><a href="${OWN}/t">t</a></template>`,
      `<svg><a xlink:href="${OWN}/s"><image href="${OWN}/i.svg"/></a></svg>`,
      '</body></html>'
    ].join('\n')
  )
  // The page as sent still parses to the same tree, but for the values that were told.
  const shape = (text) => {
    const names = []
    const walk = (node) => {
      if (node.tagName) names.push([node.tagName, ...node.attrs.map((attr) => attr.name)].join(' '))
      for (const child of node.childNodes ?? []) walk(child)
      if (node.content) walk(node.content)
    }
    walk(parseHtml(text))
    return names
  }
  assert.deepEqual(shape(made), shape(html))

  // 🔒 Not an attribute, not a URL of the site, or somebody else's: the page comes back untouched.
  for (const kept of [
    '<!-- <a href="https://shop.tracy.test/c"> -->',
    '<textarea><a href="https://shop.tracy.test/t"></textarea>',
    '<title><a href="https://shop.tracy.test/t"></title>',
    '<script>var s = "<a href=\\"https://shop.tracy.test/\\">";</script>',
    '<script type="text/template"><a href="https://shop.tracy.test/"></a></script>',
    '<style>a::after{content:"<a href=https://shop.tracy.test/>"}</style>',
    '<xmp><a href="https://shop.tracy.test/x"></xmp>',
    '<p>Built on shop.tracy.test — see https://shop.tracy.test/ for more.</p>',
    '<a title="see https://shop.tracy.test/ here">x</a>',
    '<a href="https://shop.tracy.test@other.example/">x</a>',
    '<a href="https://shop.tracy.test&commat;other.example/">x</a>',
    '<a href="https://shop.tracy.test&#64;other.example/">x</a>',
    '<a href="https://shop.tracy.test&#x40;other.example/">x</a>',
    '<a href="https://shop.tracy.test&amp;u@other.example">x</a>',
    '<a href="https://shop.tracy.test+u@other.example">x</a>',
    `<a href="https://shop.tracy.test:${'p'.repeat(2000)}@other.example/">x</a>`,
    '<a href="https://shop.tracy.test&period;evil.example/">x</a>',
    '<a href="https://shop.tracy.test&colon;8443/">x</a>',
    '<a href="https%3A%2F%2Fshop.tracy.test%2F">x</a>',
    `<a onclick="go(decodeURIComponent('https%3A%2F%2Fshop.tracy.test&amp;u%40other.example'))">x</a>`,
    '<a href="wss://shop.tracy.test/live">x</a>',
    '<a data-x="//shop.tracy.test/only-a-url-attribute-is-schemeless">x</a>',
    '<img srcset="https://shop.tracy.test@other.example/a.png 1x">'
  ]) {
    const whole = `<!doctype html><html><head></head><body>${kept}</body></html>`
    assert.equal(page(whole).html, whole, kept.slice(0, 90))
  }
  // A page that neither names the site nor carries a hash is not parsed at all.
  assert.deepEqual(page('<p>hi <'), { html: '<p>hi <', hashes: [] })
})

test("#1037 page integrity: an asset hash is removed for the site's own file — decided on the reference the parser read, resolved against <base> — and kept for anybody else's; an inline block that changed has the hash of the block AS SENT added where the policy lists the old one", () => {
  // Rule 1 — which references are the site's own.
  for (const base of ['', '<base href="https://cdn.example/">', '<base href="https&colon;//cdn.example/">']) {
    for (const ownRef of [
      `${CANONICAL}/a.js`,
      'http://shop.tracy.test/a.js',
      '//shop.tracy.test/a.js',
      'HTTPS://SHOP.TRACY.TEST/a.js',
      'https&colon;//shop.tracy.test/a.js',
      'https:&sol;&sol;shop.tracy.test/a.js',
      'https://shop&period;tracy&period;test/a.js',
      'https://shop.tracy.test&colon;443/a.js',
      'ht&Tab;tps://shop.tracy.test/a.js',
      'https&#58;//shop.tracy.test/a.js',
      'https:\\\\shop.tracy.test\\a.js'
    ]) {
      for (const [open, close] of [
        ['<script src="', '" integrity="sha384-abc" defer></script>'],
        ['<link rel="stylesheet" href="', '" integrity="sha384-abc">'],
        ["<script integrity='sha384-abc' src=\"", '"></script>'],
        ['<link rel="modulepreload" href="', '" INTEGRITY=sha384-abc>']
      ])
        assert.equal(
          /integrity/i.test(page(`${base}${open}${ownRef}${close}`).html),
          false,
          `${base}${open}${ownRef}`
        )
    }
  }
  // Relative references are the site's own exactly when the page's base is.
  for (const relative of ['/wp-includes/a.js', 'a.js', '../a.js', '  /a.js\n', '/a.js?x=1&amp;y=2']) {
    const tag = `<script src="${relative}" integrity="sha384-abc"></script>`
    assert.equal(page(tag).html, `<script src="${relative}" ></script>`, relative)
    for (const cdn of [
      '<base href="https://cdn.example/">',
      '<base href="https&colon;&sol;&sol;cdn.example&sol;">'
    ])
      assert.equal(page(`${cdn}${tag}`).html, `${cdn}${tag}`, `${cdn} ${relative}`)
    const home = `<base href="https&colon;//shop.tracy.test/sub/">${tag}`
    assert.equal(/integrity/.test(page(home).html), false, `own base ${relative}`)
  }
  for (const theirs of [
    'https://cdn.example/a.js',
    '//cdn.example/a.js',
    'https://shop.tracy.test.evil.example/a.js',
    'https://shop.tracy.test@cdn.example/a.js',
    'https://shop.tracy.test&commat;cdn.example/a.js',
    'https://shop.tracy.test&period;evil.example/a.js',
    'https://shop.tracy.test:8443/a.js',
    'https&colon;//cdn.example/?u=https://shop.tracy.test/a.js',
    'data:text/javascript,1',
    'https://[bad/a.js'
  ]) {
    const html = `<script src="${theirs}" integrity="sha384-abc"></script>`
    const made = page(html).html
    assert.ok(made.includes('integrity="sha384-abc"'), theirs)
    assert.ok(made.includes('cdn.example') || made === html, theirs)
  }
  // No reference, or no hash: nothing to do.
  for (const html of [
    '<script integrity="sha384-abc">1</script>',
    '<script src="/a.js"></script>',
    '<p integrity>hi</p>'
  ])
    assert.equal(page(html).html, html)
  // An import map: the site's own entries are told and lose their hash; a CDN's keep both.
  const map = page(
    `<script type="importmap">${JSON.stringify({
      imports: { a: '/a.js', b: `${CANONICAL}/b.js`, c: 'https://cdn.example/c.js' },
      scopes: { [`${CANONICAL}/app/`]: { d: `${CANONICAL}/d.js` } },
      integrity: {
        '/a.js': 'sha384-x',
        [`${CANONICAL}/b.js`]: 'sha384-y',
        'https://cdn.example/c.js': 'sha384-z'
      }
    })}</script>`
  ).html
  assert.deepEqual(JSON.parse(map.slice(map.indexOf('>') + 1, map.lastIndexOf('<'))), {
    imports: { a: '/a.js', b: `${OWN}/b.js`, c: 'https://cdn.example/c.js' },
    scopes: { [`${OWN}/app/`]: { d: `${OWN}/d.js` } },
    integrity: { 'https://cdn.example/c.js': 'sha384-z' }
  })

  // Rule 2 — the policy's inline hashes follow the bytes that are sent.
  const changed = `window.home = "${CANONICAL}/";`
  const sent = `window.home = "${OWN}/";`
  const same = 'window.x = 1;'
  const css = `body{background:url(${CANONICAL}/bg.png)}`
  const cssSent = `body{background:url("${OWN}/bg.png")}`
  const handler = `go('${CANONICAL}/')`
  const handlerSent = `go("${OWN}/")`
  const doc = `<html><head><script>${changed}</script><script>${same}</script><style>${css}</style><script src="/a.js">${changed}</script></head><body onload="go(&apos;${CANONICAL}&sol;&apos;)">x</body></html>`
  const policy = `default-src 'self'; script-src 'unsafe-hashes' ${sha('sha256', changed)} ${sha('sha256', same)} ${sha('sha256', handler)} 'nonce-abc'; style-src ${sha('sha384', css)}`
  const { html, hashes } = page(doc, [policy])
  assert.equal(
    html,
    `<html><head><script>${sent}</script><script>${same}</script><style>${cssSent}</style><script src="/a.js">${changed}</script></head><body onload="go(&quot;${OWN}/&quot;)">x</body></html>`
  )
  const made = withAddedHashes(policy, hashes)
  for (const [algorithm, before, after] of [
    ['sha256', changed, sent],
    ['sha384', css, cssSent],
    ['sha256', handler, handlerSent]
  ]) {
    assert.ok(made.includes(sha(algorithm, before)), 'the listed hash stays')
    assert.ok(made.includes(sha(algorithm, after)), `the ${algorithm} hash of the block as sent is added`)
  }
  assert.equal(made.split(sha('sha256', same)).length, 2, 'a block that does not change gains nothing')
  assert.equal(hashes.length, 3, 'and the content of a script with src is not an inline block')
  assert.ok(made.includes("'nonce-abc'"))
  // 🔒 The added hash IS the hash of the bytes in the page that is sent, for every block.
  const blocks = []
  const walk = (node) => {
    if ((node.tagName === 'script' || node.tagName === 'style') && !node.attrs.some((a) => a.name === 'src'))
      blocks.push(node.childNodes[0]?.value ?? '')
    for (const child of node.childNodes ?? []) walk(child)
  }
  walk(parseHtml(html))
  for (const block of blocks)
    assert.ok(made.includes(sha(block.includes('background') ? 'sha384' : 'sha256', block)), block)
  // A hash the policy does not list is not added: what was not allowed stays not allowed.
  assert.deepEqual(page(doc, ["script-src 'self'"]).hashes, [])
  assert.deepEqual(page(doc, [`script-src ${sha('sha256', 'something else')}`]).hashes, [])
  // base64url and unpadded spellings of a listed hash are the same hash.
  const spelled = sha('sha256', changed).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+'$/, "'")
  assert.equal(page(doc, [`script-src ${spelled}`]).hashes.length, 1)
  // CRLF in a block is hashed as the parser leaves it, and stays CRLF in the page.
  const crlf = `a = "${CANONICAL}/";\r\nb = 2;`
  const crlfPage = page(`<script>${crlf}</script>`, [
    `script-src ${sha('sha256', crlf.replace(/\r\n/g, '\n'))}`
  ])
  assert.equal(crlfPage.html, `<script>a = "${OWN}/";\r\nb = 2;</script>`)
  assert.deepEqual(
    crlfPage.hashes.map(([, added]) => added),
    [sha('sha256', `a = "${OWN}/";\nb = 2;`)]
  )
  // A policy the page declares itself — however its quotes are written — is rewritten in the page.
  const listed = sha('sha256', changed)
  const policyOf = (text) => {
    let found = null
    const walk = (node) => {
      if (node.tagName === 'meta') found = node.attrs.find((attr) => attr.name === 'content')?.value ?? found
      for (const child of node.childNodes ?? []) walk(child)
    }
    walk(parseHtml(text))
    return found
  }
  for (const [what, meta] of [
    [
      'double quotes',
      `<meta http-equiv="Content-Security-Policy" content="script-src ${listed} ${CANONICAL}">`
    ],
    [
      'numeric quotes',
      `<meta http-equiv="Content-Security-Policy" content="script-src ${listed.replace(/'/g, '&#39;')} ${CANONICAL}">`
    ],
    [
      'named quotes',
      `<meta http-equiv="Content-Security-Policy" content="script-src ${listed.replace(/'/g, '&apos;')} ${CANONICAL}">`
    ],
    [
      'single-quoted attribute',
      `<meta http-equiv=Content-Security-Policy content='script-src ${listed.replace(/'/g, '&#x27;')} ${CANONICAL}'>`
    ],
    [
      'unquoted attribute',
      `<meta http-equiv=content-security-policy content=${`script-src ${listed} ${CANONICAL}`.replace(/[ '=]/g, (ch) => `&#${ch.charCodeAt(0)};`)}>`
    ],
    [
      'the header name in references',
      `<meta http-equiv="Content&#45;Security&#x2d;Policy" content="script-src ${listed} ${CANONICAL}">`
    ]
  ]) {
    const settled = page(`<html><head>${meta}<script>${changed}</script></head></html>`).html
    assert.equal(policyOf(settled), `script-src ${listed} ${sha('sha256', sent)} ${OWN}`, what)
    assert.ok(settled.includes(`<script>${sent}</script>`), what)
  }
  // Nothing written into a block may end the block.
  const closing = `<script>var u = "${CANONICAL}/</scr" + "ipt>";</script>`
  assert.equal((page(closing).html.match(/<\/script/gi) ?? []).length, 1)
})

test("#1037 page: what cannot be told WHOLE on the own domain is refused, never sent half in each name — XHTML, a body that is not UTF-8, a body past the ceiling, a body or an inline block its parser left unread, a policy that allows an own script by hash: a 502 with the reason, and not one byte of the site's answer or of its headers", async () => {
  const header = 'x-tracy-own-domain-projection'
  const link = `<a href="${CANONICAL}/x">é</a>`
  const utf8 = Buffer.from(`<html><body>${link}</body></html>`, 'utf8')
  const latin1 = Buffer.from(`<html><body>${link}</body></html>`, 'latin1')
  const own = (bytes) => Buffer.from(bytes).toString('latin1').includes(OWN_DOMAIN)
  const external = `sha384-${createHash('sha384').update('lib').digest('base64')}`
  const cases = [
    ['an XHTML page', 'application/xhtml+xml', utf8, 'xhtml'],
    ['a header charset that is not UTF-8', 'text/html; charset=windows-1252', latin1, 'charset'],
    [
      'a header charset that is not UTF-8, even with UTF-8 bytes',
      'text/html; charset="ISO-8859-1"',
      utf8,
      'charset'
    ],
    ['bytes that are not UTF-8', 'text/html', latin1, 'charset'],
    [
      'a UTF-16 byte order mark',
      'text/html',
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`<a href="${CANONICAL}/">`, 'utf16le')]),
      'charset'
    ],
    [
      'a <meta charset> that is not UTF-8',
      'text/html',
      Buffer.from(
        `<html><head><meta charset="windows-1251"></head><body>${link.replace('é', 'e')}</body></html>`
      ),
      'charset'
    ],
    [
      'a <meta http-equiv> charset that is not UTF-8',
      'text/html',
      Buffer.from(
        `<meta http-equiv="Content-Type" content="text/html; charset=koi8-r"><a href="${CANONICAL}/">x</a>`
      ),
      'charset'
    ],
    ['a script the parser refuses', 'text/javascript', Buffer.from(`var a = "${CANONICAL}/" +`), 'parse'],
    ['JSON that is not JSON', 'application/json', Buffer.from(`{"a":"${CANONICAL}/",}`), 'parse'],
    [
      'XML that is not well-formed',
      'application/xml',
      Buffer.from(`<a href="${CANONICAL}/"><b></a>`),
      'parse'
    ],
    [
      'CSS that is not UTF-8',
      'text/css',
      Buffer.from(`a{content:"é";background:url(${CANONICAL}/a.png)}`, 'latin1'),
      'charset'
    ],
    [
      'a policy that allows an own script by hash',
      'text/html',
      Buffer.from(`<script src="/lib.js" integrity="${external}"></script><a href="${CANONICAL}/">x</a>`),
      'csp-external-hash',
      { 'content-security-policy': `script-src '${external}' ${CANONICAL}` }
    ],
    // 🔒 A part of a page that names the site and that its own parser did not read: the page is not
    // sent with that part still naming the Tracy address beside parts that name the own domain.
    ...[
      ['an inline script the parser refuses', `<script>var a = "${CANONICAL}/" +</script>`],
      [
        'an inline module the parser refuses',
        `<script type="module">import "${CANONICAL}/a.js" from</script>`
      ],
      [
        'an inline style with a part left unread',
        `<style>a{filter:progid:X(src='${CANONICAL}/a.png')}</style>`
      ],
      [
        'an inline JSON block that is not JSON',
        `<script type="application/ld+json">{"url":"${CANONICAL}/",}</script>`
      ],
      [
        'an import map that is not JSON',
        `<script type="importmap">{"imports":{"a":"${CANONICAL}/a.js",}}</script>`
      ],
      ['an event handler the parser refuses', `<a onclick="go('${CANONICAL}/' +">x</a>`],
      [
        'a style attribute with a part left unread',
        `<p style="filter:progid:X(src='${CANONICAL}/a.png')">x</p>`
      ],
      // A value that has the shape of JSON, names the site, and is not JSON.
      ['a JSON-looking attribute that is not JSON', `<div data-settings="{url:'${CANONICAL}/a'}">x</div>`],
      ['a JSON-looking attribute with a trailing comma', `<div data-settings='["${CANONICAL}/a",]'>x</div>`],
      [
        'an SVG in the page whose style sheet has a part left unread',
        `<svg><style>a{filter:progid:X(src='${CANONICAL}/a.png')}</style></svg>`
      ],
      [
        'an SVG in the page whose style attribute has a part left unread',
        `<svg><rect style="filter:progid:X(src='${CANONICAL}/a.png')"/></svg>`
      ]
    ].map(([what, part]) => [
      what,
      'text/html',
      Buffer.from(
        `<html><head><link rel="canonical" href="${CANONICAL}/x"></head><body>${part}</body></html>`
      ),
      'parse',
      { 'content-security-policy': `img-src ${CANONICAL}` }
    ]),
    [
      'a style sheet with a part left unread that names the site',
      'text/css',
      Buffer.from(`a{background:url(${CANONICAL}/a.png)} b{filter:progid:X(src='${CANONICAL}/b.png')}`),
      'parse'
    ],
    // 🔒 The same inside an XML document: every one of these also holds an address that WOULD be
    // told (`href`), so sending it would be a 200 with one name beside the other.
    ...[
      [
        'an SVG whose style sheet has a part left unread',
        `<style>a{filter:progid:X(src='${CANONICAL}/a.png')}</style>`
      ],
      [
        'an SVG whose CDATA style sheet has a part left unread',
        `<style><![CDATA[a{filter:progid:X(src='${CANONICAL}/a.png')}]]></style>`
      ],
      [
        'an SVG whose style attribute has a part left unread',
        `<rect style="filter:progid:X(src='${CANONICAL}/a.png')"/>`
      ],
      [
        'an SVG whose style sheet is written in several runs',
        `<style>a{fill:url(${CANONICAL}/a.svg#g)}<![CDATA[b{fill:red}]]></style>`
      ]
    ].map(([what, part]) => [
      what,
      'image/svg+xml',
      Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><a href="${CANONICAL}/">x</a>${part}</svg>`),
      'parse'
    ]),
    [
      'an XML document whose style sheet instruction is not written as attributes',
      'application/xml',
      Buffer.from(`<?xml-stylesheet href="${CANONICAL}/s.xsl" < ?><r><loc>${CANONICAL}/</loc></r>`),
      'parse'
    ]
  ]
  for (const [what, contentType, bytes, reason, more = {}] of cases) {
    for (const method of ['GET', 'POST']) {
      const res = await viaProxy(
        () =>
          new Response(bytes, {
            headers: { 'content-type': contentType, etag: '"v1"', 'set-cookie': 'cms=1; Path=/', ...more }
          }),
        '/x',
        method === 'POST' ? { method, body: 'a=1' } : {}
      )
      assert.equal(res.status, 502, `${method} ${what}`)
      assert.equal(res.headers.get(header), `refused; reason=${reason}`, `${method} ${what}`)
      assert.equal(res.headers.get('cache-control'), 'no-store', what)
      // Nothing of the site's answer goes out: not its body, not its policy, validator or cookie.
      const sent = Buffer.from(await res.arrayBuffer())
      assert.equal(sent.includes(bytes), false, `${method} ${what}: the body is not the site's`)
      assert.equal(sent.toString('latin1').includes('shop.tracy.test'), false, `${method} ${what}`)
      // The policy on the refusal is the refusal page's own, never the site's told for this name.
      assert.doesNotMatch(
        res.headers.get('content-security-policy') ?? '',
        /shop\.tracy\.test|customer-shop/,
        what
      )
      assert.equal(res.headers.get('etag'), null, what)
      assert.equal(res.headers.get('set-cookie'), null, what)
    }
  }
  // Past the ceiling — announced or not — nothing of the body is sent, and the site's stream is let go.
  const big = Buffer.concat([Buffer.from(`<html><body>${link}`), Buffer.alloc(5 * 1024 * 1024 + 10, 0x20)])
  for (const [what, headers] of [
    ['announced', { 'content-type': 'text/html', 'content-length': String(big.length) }],
    ['not announced', { 'content-type': 'text/html' }],
    ['a style sheet', { 'content-type': 'text/css' }]
  ]) {
    let cancelled = false
    let at = 0
    const source = new ReadableStream({
      pull(controller) {
        if (at >= big.length) return controller.close()
        controller.enqueue(big.subarray(at, at + 512 * 1024))
        at += 512 * 1024
      },
      cancel() {
        cancelled = true
      }
    })
    const res = await viaProxy(() => new Response(source, { headers }))
    assert.equal(res.status, 502, what)
    assert.equal(res.headers.get(header), 'refused; reason=size', what)
    assert.ok((await res.arrayBuffer()).byteLength < 64 * 1024, what)
    assert.equal(cancelled || at >= big.length, true, `${what}: the site's body is not left open`)
  }
  // 🔒 "Left unread" is only about text that NAMES THE SITE. The same syntax that says nothing of the
  // site has nothing to project: the page and the sheet go out, told, as any other.
  for (const [what, contentType, text, expected] of [
    [
      'an old browser hack beside a url()',
      'text/css',
      `a{*zoom:1;filter:progid:X(src='/a.png');background:url(${CANONICAL}/a.png)}`,
      `a{*zoom:1;filter:progid:X(src='/a.png');background:url("${OWN}/a.png")}`
    ],
    [
      'a url() in a custom property',
      'text/css',
      `:root{--bg:url(${CANONICAL}/a.png) no-repeat}`,
      `:root{--bg:url("${OWN}/a.png") no-repeat}`
    ],
    [
      'a broken inline script that does not name the site',
      'text/html',
      `<html><body><script>var a = 1 +</script><a href="${CANONICAL}/x">x</a></body></html>`,
      `<html><body><script>var a = 1 +</script><a href="${OWN}/x">x</a></body></html>`
    ],
    [
      'a template in a script no browser runs',
      'text/html',
      `<script type="text/template"><a href="{{ ${CANONICAL} +">x</a></script><a href="${CANONICAL}/x">x</a>`,
      `<script type="text/template"><a href="{{ ${CANONICAL} +">x</a></script><a href="${OWN}/x">x</a>`
    ]
  ]) {
    const res = await viaProxy(() => new Response(text, { headers: { 'content-type': contentType } }))
    assert.equal(res.status, 200, what)
    assert.equal(res.headers.get(header), null, what)
    assert.equal(await res.text(), expected, what)
  }
  // The units behind the page's refusal: one reason, and no page.
  assert.deepEqual(page(`<script>var a = "${CANONICAL}/" +</script>`), { unsupported: 'parse' })
  assert.deepEqual(page(`<style>a{b:url(${CANONICAL}/a.png)} @x ${CANONICAL} </style>`), {
    unsupported: 'parse'
  })
  assert.deepEqual(page(`<meta charset="koi8-r"><a href="${CANONICAL}/">x</a>`), { unsupported: 'charset' })
  // What IS supported says nothing: UTF-8 by its header, by a BOM (kept), by its bytes alone.
  for (const [what, contentType, bytes] of [
    ['UTF-8 by header', 'text/html; charset=UTF-8', utf8],
    ['UTF-8 by its bytes', 'text/html', utf8],
    ['a UTF-8 byte order mark', 'text/html', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8])],
    ['<meta charset=utf-8>', 'text/html', Buffer.from(`<meta charset="UTF-8">${link}`)]
  ]) {
    const res = await viaProxy(() => new Response(bytes, { headers: { 'content-type': contentType } }))
    const got = Buffer.from(await res.arrayBuffer())
    assert.equal(res.headers.get(header), null, what)
    assert.equal(own(got), true, what)
    assert.equal(got.toString('utf8').includes('é'), true, what)
    assert.equal(got[0] === 0xef, bytes[0] === 0xef, `${what}: the BOM is kept as it was`)
  }
  // The units behind it.
  assert.equal(utf8Text(latin1, 'text/html'), null)
  assert.deepEqual(utf8Text(Buffer.from('a'), 'text/html; charset=us-ascii'), { text: 'a', bom: false })
  const same = projectBody(Buffer.from('a{}'), {
    contentType: 'text/css',
    projection: projection(),
    canonical: new URL(CANONICAL),
    path: '/'
  })
  assert.equal(same.changed, false)
  assert.equal(same.unsupported, undefined)
  // A binary that happens to contain the address is never read.
  const png = Buffer.from([0, 255, ...Buffer.from(`${CANONICAL}/x`)])
  assert.equal(
    projectBody(png, {
      contentType: 'image/png',
      projection: projection(),
      canonical: new URL(CANONICAL),
      path: '/'
    }).bytes,
    png
  )
})

test(
  '#1037 integrity, through the proxy: an own-domain page keeps working under its own policy and its own asset hashes — for a GET and for a page answered to a POST — and a projected body carries no digest of the old one; SVG is projected, a foreign hash and ETag are left',
  dbOpts,
  async () => {
    const { pool } = db
    const inline = `fetch("${CANONICAL}/wp-json/");`
    const page = [
      '<html><head>',
      `<script src="${CANONICAL}/app.js" integrity="sha384-own"></script>`,
      '<script src="https://cdn.example/lib.js" integrity="sha384-cdn" crossorigin></script>',
      `<link rel="stylesheet" href="/style.css" integrity="sha384-css">`,
      `<script>${inline}</script>`,
      '</head><body>hi</body></html>'
    ].join('')
    const policy = `script-src 'self' ${sha('sha256', inline)}`
    const { ask } = await ownDomainBed(pool, {
      fetchImpl: (req) => {
        const path = new URL(req.url).pathname
        if (path === '/logo.svg')
          return new Response(`<svg xmlns="http://www.w3.org/2000/svg"><a href="${CANONICAL}/">x</a></svg>`, {
            headers: { 'content-type': 'image/svg+xml', digest: 'sha-256=abc', etag: '"v1"' }
          })
        if (path === '/photo.png')
          return new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'content-type': 'image/png', 'content-md5': 'abc', 'repr-digest': 'sha-256=:x:' }
          })
        return new Response(page, {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'content-security-policy': policy,
            'content-security-policy-report-only': policy,
            'content-md5': 'abc',
            'content-digest': 'sha-256=:x:',
            etag: '"page-1"'
          }
        })
      }
    })
    const own = `https://${OWN_DOMAIN}`
    const projectedInline = inline.replace(CANONICAL, own)
    for (const init of [
      {},
      { method: 'POST', body: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } }
    ]) {
      const res = await ask('/', init)
      const text = await res.text()
      assert.ok(text.includes(`<script src="${own}/app.js" ></script>`), 'the own asset: its hash is gone')
      assert.ok(text.includes('<link rel="stylesheet" href="/style.css" >'))
      assert.ok(
        text.includes('src="https://cdn.example/lib.js" integrity="sha384-cdn"'),
        "a CDN's hash stays"
      )
      assert.ok(text.includes(`<script>${projectedInline}</script>`))
      for (const name of ['content-security-policy', 'content-security-policy-report-only']) {
        const sent = res.headers.get(name)
        assert.ok(
          sent.includes(sha('sha256', projectedInline)),
          `${name}: the inline script as sent is allowed`
        )
        assert.ok(sent.includes(sha('sha256', inline)))
      }
      for (const digest of ['content-md5', 'content-digest', 'digest', 'repr-digest'])
        assert.equal(res.headers.get(digest), null, digest)
      // A validator of the CMS's bytes only claims equivalence for the bytes sent: weak.
      assert.equal(res.headers.get('etag'), 'W/"page-1"')
      assert.equal(res.headers.get('x-tracy-own-domain-projection'), null)
    }
    const svg = await ask('/logo.svg')
    assert.ok((await svg.text()).includes(`<a href="${own}/">`), 'an SVG links by address like a page')
    assert.equal(svg.headers.get('digest'), null)
    assert.equal(svg.headers.get('etag'), 'W/"v1"')
    // Bytes that are not projected keep the digest that is still true of them.
    const png = await ask('/photo.png')
    assert.equal(png.headers.get('content-md5'), 'abc')
    assert.equal(png.headers.get('repr-digest'), 'sha-256=:x:')
    assert.equal(projectable('image/svg+xml'), true)
    assert.equal(projectable('image/png'), false)
  }
)

// ── The Tracy address of a site with a connected own domain sends visitors there ───────────────
// Measured on production (15/10/2026): a published site with a connected own domain answered on its
// Tracy address too, with a 200, its own canonical and its own robots.txt — two copies of one site.
import { connectedOwnDomain } from '../src/sites/address.js'
import { staysOnTracyAddress, isDsPreviewFrame } from '../src/bar/route.js'
import { OWN_READ_HEADER, isOwnRead, markOwnReads, ownReadMark } from '../src/lib/own-read.js'

const TRACY_ADDRESS_HOST = 'shop.tracy.test'

/**
 * A site `shop` on its Tracy address, with `names` as its own domains (`connected`: when the probe
 * first saw the name open this site), and the bar with the real `connectedOwnDomain`.
 */
async function tracyAddressBed(
  pool,
  {
    publish = 'published',
    platform = 'wordpress',
    names = [{ name: OWN_DOMAIN, state: 'active', connected: new Date() }],
    now = Date.now,
    lookup = connectedOwnDomain
  } = {}
) {
  await createSite(pool, { siteKey: 'shop.example', label: 'shop', host: 'local' })
  await pool.query('update site set address = $1, publish = $2, platform = $3 where site_key = $4', [
    `${CANONICAL}/`,
    publish,
    platform,
    'shop.example'
  ])
  for (const { name, state, connected } of names) {
    await pool.query(
      `insert into site_name(name, site_key, kind, state, token, probe_secret, routed_at, connected_at)
       values ($1, 'shop.example', 'custom', $2, repeat('a', 48), repeat('b', 64), now(), $3)`,
      [name, state, connected]
    )
  }
  const calls = []
  const app = barRoutes({
    pool,
    config: baseConfig(),
    sites: {
      byLabel: (p, label) => siteByLabelDirect(p, label),
      ownDomain: ownDomainByName,
      connectedOwnDomain: lookup,
      target: siteTarget,
      appendPreviewErrors,
      previewErrorsFor
    },
    seats: { accountByEmail, grantFor },
    fetchImpl: async (req) => {
      calls.push(req)
      return new Response('<html><body>hi</body></html>', { headers: { 'content-type': 'text/html' } })
    },
    now
  })
  const ask = (path = '/', init = {}) =>
    app.fetch(
      new Request(`http://${TRACY_ADDRESS_HOST}${path}`, {
        ...init,
        headers: { host: TRACY_ADDRESS_HOST, 'x-forwarded-proto': 'https', ...init.headers }
      })
    )
  return { app, calls, ask }
}

test(
  'Tracy address, published site with a connected own domain: a visitor GET and HEAD are a 301 to the own domain, path and query kept, the site never asked',
  dbOpts,
  async () => {
    const { calls, ask } = await tracyAddressBed(db.pool)
    for (const method of ['GET', 'HEAD']) {
      const res = await ask('/blog/hello/?utm_source=x&p=2', { method })
      assert.equal(res.status, 301, method)
      assert.equal(res.headers.get('location'), `https://${OWN_DOMAIN}/blog/hello/?utm_source=x&p=2`, method)
      // Never kept: a browser that later signs in or gains a seat, or a removed domain, takes effect at once.
      assert.equal(res.headers.get('cache-control'), 'no-store', method)
    }
    // A crawler is a visitor like any other; its robots.txt and sitemap go to the own domain too.
    const robots = await ask('/robots.txt', { headers: { 'user-agent': 'Googlebot/2.1' } })
    assert.equal(robots.status, 301)
    assert.equal(robots.headers.get('location'), `https://${OWN_DOMAIN}/robots.txt`)
    assert.equal(calls.length, 0)
  }
)

test(
  'Tracy address with a connected own domain: a POST is the site’s own to answer — proxied',
  dbOpts,
  async () => {
    const { calls, ask } = await tracyAddressBed(db.pool)
    const res = await ask('/contact/', { method: 'POST', body: 'a=1' })
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
  }
)

test(
  'Tracy address with a connected own domain: a seat holder keeps working here — proxied, vouched for',
  dbOpts,
  async () => {
    const { pool } = db
    const { calls, ask } = await tracyAddressBed(pool)
    for (const role of ['owner', 'editor', 'viewer']) {
      const email = `${role}@x.y`
      await seatOn(pool, 'shop.example', email, role)
      calls.length = 0
      const res = await ask('/', {
        headers: { cookie: `tracy_sess=${await mintSession(email, sessionSecret)}` }
      })
      assert.equal(res.status, 200, role)
      assert.equal(calls.length, 1, role)
      assert.equal(calls[0].headers.get('x-tracy-email'), email, role)
    }
    // Signed in to Tracy without a seat on THIS site is a visitor.
    const stranger = await ask('/', {
      headers: { cookie: `tracy_sess=${await mintSession('nobody@x.y', sessionSecret)}` }
    })
    assert.equal(stranger.status, 301)
  }
)

test(
  'Tracy address with a connected own domain: the back office, the CMS sign-in and its API stay here — proxied',
  dbOpts,
  async () => {
    const { pool } = db
    const cases = {
      wordpress: [
        '/wp-admin/',
        '/wp-admin/edit.php?post_type=page',
        '/wp-login.php?redirect_to=x',
        '/wp-json/wp/v2/pages',
        '/?rest_route=/wp/v2/pages'
      ],
      joomla: [
        '/administrator/',
        '/administrator/index.php?option=com_content',
        '/api/index.php/v1/content/articles'
      ],
      emdash: [
        '/_emdash/admin',
        '/_emdash/admin/content',
        '/_emdash/api/auth/me',
        '/_emdash/api/auth/magic-link/verify?token=t'
      ]
    }
    for (const [platform, paths] of Object.entries(cases)) {
      await db.reset()
      const { calls, ask } = await tracyAddressBed(pool, { platform })
      for (const path of paths) {
        calls.length = 0
        const res = await ask(path)
        assert.equal(res.status, 200, `${platform} ${path}`)
        assert.equal(calls.length, 1, `${platform} ${path}`)
      }
      // The public page of the same site is still sent on.
      assert.equal((await ask('/about/')).status, 301, platform)
    }
  }
)

test(
  'Tracy address with a connected own domain: a request that carries its own credentials stays here — a redirect to another host would drop them',
  dbOpts,
  async () => {
    const { calls, ask } = await tracyAddressBed(db.pool)
    const res = await ask('/wp-content/uploads/a.json', { headers: { authorization: 'Basic dTpw' } })
    assert.equal(res.status, 200)
    assert.equal(calls.length, 1)
  }
)

test(
  'Tracy address with a connected own domain: /__tracy/* and the Design system preview frame are unchanged',
  dbOpts,
  async () => {
    const { calls, ask } = await tracyAddressBed(db.pool)
    const tracy = await ask('/__tracy/errors')
    assert.equal(tracy.status, 401)
    const unknown = await ask('/__tracy/nothing-here')
    assert.equal(unknown.status, 404)
    assert.equal(calls.length, 0)
    const frame = await ask('/?tracy_ds_preview=sys-1', { headers: { 'sec-fetch-dest': 'iframe' } })
    assert.equal(frame.status, 200)
    assert.equal(frame.headers.get('x-robots-tag'), 'noindex, nofollow')
    assert.equal(calls.length, 1)
  }
)

test(
  'Design system preview on a Tracy address: every answer is noindex, published or not; only a frame (or a request with no Sec-Fetch-Dest) skips the 301 — a top-level visit, a HEAD or a crawler naming the parameter is sent to the own domain',
  dbOpts,
  async () => {
    const { calls, ask } = await tracyAddressBed(db.pool)
    for (const headers of [{ 'sec-fetch-dest': 'iframe' }, {}]) {
      const res = await ask('/?tracy_ds_preview=bogus', { headers })
      assert.equal(res.status, 200, JSON.stringify(headers))
      assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow', JSON.stringify(headers))
    }
    assert.equal(calls.length, 2)
    for (const init of [
      { headers: { 'sec-fetch-dest': 'document' } },
      { headers: { 'sec-fetch-dest': 'document', 'user-agent': 'Googlebot/2.1' } },
      { method: 'HEAD', headers: { 'sec-fetch-dest': 'iframe' } }
    ]) {
      const res = await ask('/?tracy_ds_preview=bogus', init)
      assert.equal(res.status, 301, JSON.stringify(init))
      assert.equal(res.headers.get('location'), `https://${OWN_DOMAIN}/?tracy_ds_preview=bogus`)
    }
    assert.equal(calls.length, 2)
  }
)

test('Design system preview on a draft: noindex too, and served as before', dbOpts, async () => {
  const { calls, ask } = await tracyAddressBed(db.pool, { publish: 'draft', names: [] })
  const top = await ask('/?tracy_ds_preview=bogus', { headers: { 'sec-fetch-dest': 'document' } })
  assert.equal(top.status, 200)
  assert.equal(top.headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.equal(calls.length, 1)
})

test('isDsPreviewFrame: a GET with the parameter, framed or without Sec-Fetch-Dest; nothing else', () => {
  const at = (q) => new URL(`https://shop.tracy.test/${q}`)
  assert.equal(isDsPreviewFrame('GET', at('?tracy_ds_preview=a'), 'iframe'), true)
  assert.equal(isDsPreviewFrame('GET', at('?x=1&tracy_ds_preview='), undefined), true)
  assert.equal(isDsPreviewFrame('GET', at('?tracy_ds_preview=a'), 'document'), false)
  assert.equal(isDsPreviewFrame('HEAD', at('?tracy_ds_preview=a'), 'iframe'), false)
  assert.equal(isDsPreviewFrame('GET', at('?x=1'), 'iframe'), false)
})

test(
  "Tracy's own read of a Tracy address (marked with the session secret, for that hostname, in date) is served the page as nobody; a missing, forged, expired or other host's mark is a 301; the mark never reaches the site",
  dbOpts,
  async () => {
    let clock = Date.parse('2026-10-15T08:00:00Z')
    const { calls, ask } = await tracyAddressBed(db.pool, { now: () => clock })
    const secret = baseConfig().sessionSecret
    const read = await ask('/', {
      headers: { [OWN_READ_HEADER]: ownReadMark(secret, TRACY_ADDRESS_HOST, clock) }
    })
    assert.equal(read.status, 200)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].headers.get(OWN_READ_HEADER), null)
    // Served as nobody: the site is told no one.
    assert.equal(calls[0].headers.get('x-tracy-email'), null)
    assert.equal(calls[0].headers.get('x-tracy-tier'), null)
    const refused = {
      missing: undefined,
      empty: '',
      garbage: 'not-a-mark',
      'other secret': ownReadMark('x'.repeat(32), TRACY_ADDRESS_HOST, clock),
      'other host': ownReadMark(secret, 'other.tracy.test', clock),
      expired: ownReadMark(secret, TRACY_ADDRESS_HOST, clock - 61_000),
      'dated ahead': ownReadMark(secret, TRACY_ADDRESS_HOST, clock + 120_000),
      tampered: ownReadMark(secret, TRACY_ADDRESS_HOST, clock).replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'))
    }
    for (const [why, mark] of Object.entries(refused)) {
      const res = await ask('/', mark === undefined ? {} : { headers: { [OWN_READ_HEADER]: mark } })
      assert.equal(res.status, 301, why)
    }
    assert.equal(calls.length, 1)
    // Still in date 59 s on.
    const mark = ownReadMark(secret, TRACY_ADDRESS_HOST, clock)
    clock += 59_000
    assert.equal((await ask('/', { headers: { [OWN_READ_HEADER]: mark } })).status, 200)
  }
)

test('isOwnRead / markOwnReads: only this secret, this hostname, in date; only Tracy addresses are marked', async () => {
  const secret = 's'.repeat(32)
  const at = Date.parse('2026-10-15T08:00:00Z')
  const mark = ownReadMark(secret, 'Shop.Tracy.Test', at)
  assert.equal(isOwnRead(secret, 'shop.tracy.test', mark, at), true)
  assert.equal(isOwnRead(secret, 'shop.tracy.test', mark, at + 60_000), true)
  assert.equal(isOwnRead(secret, 'shop.tracy.test', mark, at + 61_000), false)
  assert.equal(isOwnRead('', 'shop.tracy.test', mark, at), false)
  assert.equal(isOwnRead(secret, 'shop.tracy.test', null, at), false)
  assert.equal(isOwnRead(secret, 'shop.tracy.test', `${mark}x`, at), false)
  const seen = []
  const fetchImpl = markOwnReads(
    async (url, init) => {
      seen.push([String(url), new Headers(init?.headers).get(OWN_READ_HEADER)])
      return new Response('')
    },
    { sessionSecret: secret, siteDomain: 'localhost', siteDomainAliases: ['tracy.test'] },
    () => at
  )
  await fetchImpl(new URL('https://shop.tracy.test/'), { headers: { accept: 'text/html' } })
  await fetchImpl('https://fonts.googleapis.com/css2?family=Inter')
  await fetchImpl('https://www.customer-shop.com/')
  assert.equal(isOwnRead(secret, 'shop.tracy.test', seen[0][1], at), true)
  assert.equal(seen[1][1], null)
  assert.equal(seen[2][1], null)
  // No secret, no mark.
  const bare = markOwnReads(
    async (_u, init) => new Response(new Headers(init?.headers).get(OWN_READ_HEADER) ?? ''),
    {
      siteDomain: 'localhost',
      siteDomainAliases: ['tracy.test']
    }
  )
  assert.equal(await (await bare('https://shop.tracy.test/')).text(), '')
})

test(
  'Tracy address: the own domain is looked up once per site per 60 s, a site with none included',
  dbOpts,
  async () => {
    let clock = Date.parse('2026-10-15T08:00:00Z')
    let lookups = 0
    let answer = OWN_DOMAIN
    const { ask } = await tracyAddressBed(db.pool, {
      now: () => clock,
      lookup: async () => {
        lookups++
        return answer
      }
    })
    assert.equal((await ask('/')).status, 301)
    clock += 30_000
    assert.equal((await ask('/a')).status, 301)
    assert.equal(lookups, 1)
    // Removed: still sent there until the entry is 60 s old, then read again and served here.
    answer = null
    clock += 29_000
    assert.equal((await ask('/b')).status, 301)
    assert.equal(lookups, 1)
    clock += 1_000
    assert.equal((await ask('/c')).status, 200)
    assert.equal(lookups, 2)
    // "No own domain" is kept too.
    clock += 10_000
    assert.equal((await ask('/d')).status, 200)
    assert.equal(lookups, 2)
  }
)

test(
  'Tracy address: a draft, a site without an own domain, and a domain still being connected are served here as before',
  dbOpts,
  async () => {
    const { pool } = db
    const beds = {
      draft: { publish: 'draft' },
      'no own domain': { names: [] },
      'pending, never connected': { names: [{ name: OWN_DOMAIN, state: 'pending', connected: null }] },
      'active but never answered the probe': {
        names: [{ name: OWN_DOMAIN, state: 'active', connected: null }]
      }
    }
    for (const [what, opts] of Object.entries(beds)) {
      await db.reset()
      const { calls, ask } = await tracyAddressBed(pool, opts)
      const res = await ask('/blog/')
      assert.equal(res.status, 200, what)
      assert.equal(res.headers.get('location'), null, what)
      assert.equal(calls.length, 1, what)
    }
  }
)

test(
  'connectedOwnDomain: one name for every request — the one connected first, then by name; a name not shown connected is never it',
  dbOpts,
  async () => {
    const { pool } = db
    const early = new Date('2026-10-01T00:00:00Z')
    const late = new Date('2026-10-10T00:00:00Z')
    await tracyAddressBed(pool, {
      names: [
        { name: 'b.customer-shop.com', state: 'active', connected: late },
        { name: 'z.customer-shop.com', state: 'active', connected: early },
        { name: 'a.customer-shop.com', state: 'active', connected: early },
        { name: 'pending.customer-shop.com', state: 'pending', connected: null }
      ]
    })
    assert.equal(await connectedOwnDomain(pool, 'shop.example'), 'a.customer-shop.com')
    assert.equal(await connectedOwnDomain(pool, 'nobody.example'), null)
    // A custom hostname at Cloudflare for SaaS that is not ready takes the name out of `connected`.
    await pool.query(`delete from site_name where name <> 'pending.customer-shop.com'`)
    await pool.query(
      `insert into site_name(name, site_key, kind, state, token, connected_at)
       values ('c.customer-shop.com', 'shop.example', 'custom', 'active', repeat('c', 48), now())`
    )
    await pool.query(
      `insert into site_custom_hostname(name, zone_id, site_key, token, state, hostname_status, ssl_status)
       values ('c.customer-shop.com', 'zone', 'shop.example', repeat('c', 48), 'created', 'pending', 'pending_validation')`
    )
    assert.equal(await connectedOwnDomain(pool, 'shop.example'), null)
  }
)

test('staysOnTracyAddress: the back office, sign-in, CMS API and credentials stay; pages do not', () => {
  const none = new Headers()
  const u = (path) => new URL(path, 'https://shop.tracy.test')
  assert.equal(staysOnTracyAddress('wordpress', u('/'), none), false)
  assert.equal(staysOnTracyAddress('wordpress', u('/wp-content/themes/x/style.css'), none), false)
  // admin-ajax and admin-post are front-end machinery (`isAdminPath`) and are not back office.
  assert.equal(staysOnTracyAddress('wordpress', u('/wp-admin/admin-ajax.php'), none), false)
  assert.equal(staysOnTracyAddress('wordpress', u('/WP-LOGIN.PHP'), none), true)
  assert.equal(staysOnTracyAddress(null, u('/wp-json'), none), true)
  assert.equal(staysOnTracyAddress('joomla', u('/wp-login.php'), none), false)
  assert.equal(staysOnTracyAddress('joomla', u('/apis'), none), false)
  assert.equal(staysOnTracyAddress('emdash', u('/_emdash'), none), true)
  assert.equal(staysOnTracyAddress('emdash', u('/'), new Headers({ authorization: 'Bearer t' })), true)
})
