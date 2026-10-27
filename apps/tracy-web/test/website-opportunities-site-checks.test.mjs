// Site checks (`website-opportunities/src/site-checks.js`): a restaurant's current website measured once in the
// background — PageSpeed mobile + the homepage read for its CMS and footer — kept per normalised
// address and shared by every account, with the row itself as the queue (lease, attempts). The
// domain is the real subtree with the network replaced.
import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { createSiteChecks, urlKeyOf } from 'website-opportunities/src/site-checks.js'
import { createEscalatingFetch } from 'website-opportunities/src/escalating-fetch.js'
import { SCHEMA_DIR } from 'website-opportunities/src/schema/index.js'
import { startGuardedProxy } from 'website-opportunities/src/guarded-connect-proxy.js'
import { createPinnedFetch } from 'website-opportunities/src/pinned-fetch.js'
import { readFile } from 'node:fs/promises'
import http from 'node:http'
import { join } from 'node:path'
import { fileDb } from './_db.mjs'

const url = process.env.TEST_DATABASE_URL
const opts = { skip: url ? false : 'set TEST_DATABASE_URL' }

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
// A request's background tick must not outlive its test and claim the next test's rows.
const worlds = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map((c) => c.drain()))
})

const PUBLIC = async () => [{ address: '93.184.216.34', family: 4 }]
const NOW = Date.parse('2026-10-18T12:00:00Z')
const DAY = 86_400_000

const PSI_ANSWER = (over = {}) => ({
  lighthouseResult: {
    finalUrl: 'https://phoba.example/',
    categories: { performance: { score: 0.32 }, seo: { score: 0.71 } },
    stackPacks: [{ id: 'wordpress', title: 'WordPress' }],
    audits: {
      'largest-contentful-paint': { numericValue: 6420.4 },
      'viewport-insight': { score: 1 },
      'target-size': { score: 0 }
    },
    ...over
  }
})

const HTML =
  '<html><head><meta name="generator" content="WordPress 6.4"></head><body>© 2016 Pho Ba <a href="mailto:hi@phoba.example">mail</a> <a href="https://www.facebook.com/phoba">fb</a></body></html>'
const page = (body = HTML, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/html' } })

async function world({
  psi = () => Response.json(PSI_ANSWER()),
  site = () => page(),
  googleKey = 'AIza-test',
  concurrency = 4,
  hourlyCap = 120,
  resolve = PUBLIC,
  domainOverrides = {},
  clock = { now: NOW },
  pool = db.pool,
  escalate = null
} = {}) {
  const real = await websiteOpportunitiesDomain()
  const asked = { psi: [], site: [] }
  const warned = []
  const fetchImpl = async (u, init) => {
    asked.site.push(String(u))
    return site(String(u), init)
  }
  asked.impit = []
  const startRead = escalate
    ? createEscalatingFetch({
        baseFetch: fetchImpl,
        getProxy: escalate.getProxy ?? (async () => ({ proxyUrl: 'http://tracy:t@127.0.0.1:1' })),
        loadImpit:
          escalate.loadImpit ??
          (async () => ({
            Impit: class {
              async fetch(u, init) {
                asked.impit.push(String(u))
                return escalate.impit(String(u), init)
              }
            }
          })),
        isEnabled: () => escalate.enabled ?? true,
        budgets: escalate.budgets,
        log: { warn: (m) => warned.push(m) }
      })
    : undefined
  const checks = createSiteChecks({
    pool,
    runtime: async () => ({ keys: { google: googleKey }, settings: {} }),
    domain: { ...real, ...domainOverrides },
    fetchImpl,
    ...(startRead ? { startRead } : {}),
    apiFetch: async (u) => {
      asked.psi.push(String(u))
      return psi(String(u))
    },
    resolve,
    now: () => clock.now,
    concurrency,
    hourlyCap,
    retryDelayMs: 0,
    log: { warn: (m) => warned.push(m), error: (m) => warned.push(m) }
  })
  worlds.push(checks)
  return { checks, asked, warned, clock, pool: db.pool }
}

const rowOf = async (key) =>
  (await db.pool.query('select * from wo_site_check where url_key = $1', [key])).rows[0]

test('urlKeyOf: case, trailing slash, query and hash fold; the scheme stays; not-http is null', () => {
  const key = urlKeyOf('https://Pho-Ba.Example/menu/?utm=1#top')
  assert.equal(key, 'https://pho-ba.example/menu')
  assert.equal(
    urlKeyOf('http://pho-ba.example/menu'),
    'http://pho-ba.example/menu',
    'http is another address'
  )
  assert.equal(urlKeyOf('https://pho-ba.example/'), 'https://pho-ba.example')
  assert.equal(urlKeyOf('https://pho-ba.example'), 'https://pho-ba.example')
  assert.equal(urlKeyOf('ftp://pho-ba.example'), null)
  assert.equal(urlKeyOf('not a url'), null)
})

test(
  'a new address is queued, then checked once: PageSpeed + homepage → done with scores and stack',
  opts,
  async () => {
    const { checks, asked } = await world()
    const first = await checks.request(['https://phoba.example/'])
    assert.deepEqual(first, { 'https://phoba.example/': { status: 'queued' } })
    await checks.drain()
    assert.equal(asked.psi.length, 1)
    const q = new URL(asked.psi[0])
    assert.equal(q.searchParams.get('url'), 'https://phoba.example/')
    assert.equal(q.searchParams.get('strategy'), 'mobile')
    assert.deepEqual(q.searchParams.getAll('category'), ['performance', 'seo'])
    assert.deepEqual(asked.site, ['https://phoba.example/'], 'fetched as given, once')
    const row = await rowOf('https://phoba.example')
    assert.equal(row.status, 'done')
    assert.equal(row.attempts, 1)
    assert.equal(row.lease_until, null)
    const again = await checks.request(['https://PHOBA.example'])
    assert.deepEqual(again['https://PHOBA.example'], {
      status: 'done',
      finalUrl: 'https://phoba.example/',
      performance: 32,
      seo: 71,
      lcpMs: 6420,
      https: true,
      mobileFriendly: false,
      cms: 'WordPress',
      cmsVersion: '6.4',
      copyrightYear: 2016,
      emails: ['hi@phoba.example'],
      socials: { facebook: 'https://www.facebook.com/phoba' },
      error: null,
      checkedAt: new Date(NOW).toISOString()
    })
    await checks.drain()
    assert.equal(asked.psi.length, 1, 'a cached row never calls PageSpeed again')
    // Read-only: what /search attaches to a candidate.
    const peek = await checks.lookup(['https://phoba.example', 'https://unknown.example'])
    assert.equal(peek['https://phoba.example'].status, 'done')
    assert.equal(peek['https://unknown.example'], undefined)
  }
)

test('freshness: done lasts 30 days, down/blocked/failed 24 h', opts, async () => {
  const { checks, asked, clock, pool } = await world()
  await checks.request(['https://phoba.example/'])
  await checks.drain()
  clock.now = NOW + 29 * DAY
  assert.equal((await checks.request(['https://phoba.example/']))['https://phoba.example/'].status, 'done')
  clock.now = NOW + 31 * DAY
  assert.equal((await checks.request(['https://phoba.example/']))['https://phoba.example/'].status, 'queued')
  await checks.drain()
  assert.equal(asked.psi.length, 2)
  await pool.query(`update wo_site_check set status = 'down', error = 'timeout'`)
  clock.now += 23 * 3_600_000
  const kept = await checks.request(['https://phoba.example/'])
  assert.equal(kept['https://phoba.example/'].status, 'down')
  assert.equal(kept['https://phoba.example/'].error, 'timeout')
  clock.now += 2 * 3_600_000
  const stale = await checks.request(['https://phoba.example/'])
  assert.equal(stale['https://phoba.example/'].status, 'queued')
  await checks.drain()
  assert.equal(asked.psi.length, 3, 'stale after a day: measured again, once')
})

test(
  'limit: only the first N unknown addresses are queued; the rest say not_queued and can be asked again',
  opts,
  async () => {
    const { checks } = await world()
    const urls = [1, 2, 3, 4].map((n) => `https://site${n}.example/`)
    const out = await checks.request(urls, { limit: 2 })
    assert.deepEqual(
      urls.map((u) => out[u].status),
      ['queued', 'queued', 'not_queued', 'not_queued']
    )
    await checks.drain()
    const later = await checks.request(urls, { limit: 2 })
    assert.deepEqual(
      urls.map((u) => later[u].status),
      ['done', 'done', 'queued', 'queued']
    )
  }
)

test(
  'the queue is the table: a lease held by another worker is respected, an expired one is taken, the third attempt is final',
  opts,
  async () => {
    const { checks, asked, clock, pool } = await world()
    await pool.query(
      `insert into wo_site_check (url_key, url, status, queued_at, lease_until, attempts)
     values ('https://leased.example', 'https://leased.example/', 'queued', $1, $2, 1),
            ('https://expired.example', 'https://expired.example/', 'queued', $1, $3, 1),
            ('https://spent.example', 'https://spent.example/', 'queued', $1, null, 3)`,
      [new Date(NOW - 60_000), new Date(NOW + 60_000), new Date(NOW - 1)]
    )
    await checks.drain()
    assert.deepEqual(asked.site.sort(), ['https://expired.example/'])
    assert.equal((await rowOf('https://leased.example')).status, 'queued')
    assert.equal((await rowOf('https://expired.example')).status, 'done')
    assert.equal((await rowOf('https://expired.example')).attempts, 2)
    const spent = await rowOf('https://spent.example')
    assert.equal(spent.status, 'failed')
    assert.equal(spent.error, 'attempts')
    clock.now = NOW + 120_000
    await checks.drain()
    assert.equal((await rowOf('https://leased.example')).status, 'done', 'the lease ran out: taken')
  }
)

test('concurrency and the hourly cap bound how many checks run', opts, async () => {
  let inFlight = 0
  let peak = 0
  const slow = async () => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    await new Promise((r) => setTimeout(r, 20))
    inFlight -= 1
    return Response.json(PSI_ANSWER())
  }
  const { checks } = await world({ concurrency: 2, psi: slow })
  const urls = [1, 2, 3, 4, 5, 6].map((n) => `https://site${n}.example/`)
  await checks.request(urls)
  await checks.drain()
  assert.equal(peak, 2)
  const { rows } = await db.pool.query(`select count(*)::int as n from wo_site_check where status = 'done'`)
  assert.equal(rows[0].n, 6)

  const capped = await world({ hourlyCap: 7 })
  await capped.checks.request(['https://seven.example/', 'https://eight.example/'])
  await capped.checks.drain()
  assert.equal((await rowOf('https://seven.example')).status, 'done')
  assert.equal((await rowOf('https://eight.example')).status, 'queued', 'over the hour cap: waits')
  capped.clock.now = NOW + 3_600_000 + 1
  await capped.checks.drain()
  assert.equal((await rowOf('https://eight.example')).status, 'done')
})

test(
  'verdicts: connect failure or HTTP ≥ 500 twice → down; 403/429 or a challenge → blocked; PSI alone → done; the guard → failed',
  opts,
  async () => {
    const sites = {
      'https://dead.example/': () => {
        throw new Error('ECONNREFUSED')
      },
      'https://broken.example/': () => page('oops', 503),
      'https://forbidden.example/': () => page('no', 403),
      'https://cloudflare.example/': () =>
        page('<html><title>Just a moment...</title><div id="cf-challenge-running"></div></html>', 503),
      'https://nopsi.example/': () => page(),
      'https://nohtml.example/': () =>
        new Response(null, { status: 302, headers: { location: 'https://nohtml.example/' } })
    }
    let flaky = 0
    sites['https://flaky.example/'] = () => (flaky++ === 0 ? page('oops', 502) : page())
    const { checks, asked, warned } = await world({
      site: (u) => sites[u](),
      psi: (u) => {
        const target = new URL(u).searchParams.get('url')
        return target === 'https://nopsi.example/' || target === 'https://dead.example/'
          ? new Response('quota', { status: 429 })
          : Response.json(PSI_ANSWER())
      }
    })
    await checks.request(Object.keys(sites))
    await checks.drain()
    const out = await checks.request(Object.keys(sites))
    assert.deepEqual(Object.fromEntries(Object.keys(sites).map((u) => [u, [out[u].status, out[u].error]])), {
      'https://dead.example/': ['down', 'fetch_failed'],
      'https://broken.example/': ['down', 'http_503'],
      'https://forbidden.example/': ['blocked', 'http_403'],
      'https://cloudflare.example/': ['blocked', 'challenge'],
      'https://nopsi.example/': ['done', null],
      'https://nohtml.example/': ['done', 'redirects'],
      'https://flaky.example/': ['done', null]
    })
    assert.equal(asked.site.filter((u) => u === 'https://broken.example/').length, 2, 'one retry')
    assert.equal(asked.site.filter((u) => u === 'https://flaky.example/').length, 2, 'the retry answered')
    assert.equal(
      asked.site.filter((u) => u === 'https://forbidden.example/').length,
      1,
      'blocked is not retried'
    )
    const nopsi = out['https://nopsi.example/']
    assert.equal(nopsi.performance, null)
    assert.equal(nopsi.mobileFriendly, null)
    assert.equal(nopsi.cms, 'WordPress')
    assert.equal(out['https://nohtml.example/'].performance, 32, 'PageSpeed answered, the page did not')
    assert.equal(out['https://nohtml.example/'].cms, 'WordPress', 'from stackPacks')
    assert.ok(
      warned.every((m) => !/AIza-test/.test(m)),
      'no key in the log'
    )

    const privateWorld = await world({ resolve: async () => [{ address: '10.0.0.5', family: 4 }] })
    await privateWorld.checks.request(['https://intranet.example/'])
    await privateWorld.checks.drain()
    const blocked = await privateWorld.checks.request(['https://intranet.example/'])
    assert.equal(blocked['https://intranet.example/'].status, 'failed')
    assert.equal(blocked['https://intranet.example/'].error, 'url_blocked')
    assert.equal(privateWorld.asked.psi.length, 0, 'a blocked address is never sent to PageSpeed')
    // Nothing answered at all → failed, not down (down means the site itself refused).
    const nothing = await world({
      psi: () => new Response('x', { status: 500 }),
      site: () => new Response(null, { status: 302, headers: { location: 'https://loop.example/' } })
    })
    await nothing.checks.request(['https://loop.example/'])
    await nothing.checks.drain()
    assert.equal((await rowOf('https://loop.example')).status, 'failed')
  }
)

test(
  'without a Google key the homepage is still read; a throwing detectStack never loses the verdict',
  opts,
  async () => {
    const { checks, asked, warned } = await world({
      googleKey: null,
      domainOverrides: {
        detectStack: () => {
          throw new Error('boom')
        }
      }
    })
    await checks.request(['https://phoba.example/'])
    await checks.drain()
    assert.equal(asked.psi.length, 0)
    const out = (await checks.request(['https://phoba.example/']))['https://phoba.example/']
    assert.equal(out.status, 'done')
    assert.equal(out.performance, null)
    assert.equal(out.cms, null)
    assert.equal(out.https, true)
    assert.ok(warned.length >= 1, 'logged once')
  }
)

test(
  'request ignores what is not an http(s) address and answers each URL by its own spelling',
  opts,
  async () => {
    const { checks } = await world()
    const out = await checks.request(['mailto:x@y', 'https://phoba.example/', 'https://phoba.example'])
    assert.deepEqual(Object.keys(out), ['https://phoba.example/', 'https://phoba.example'])
    await checks.drain()
    const { rows } = await db.pool.query('select count(*)::int as n from wo_site_check')
    assert.equal(rows[0].n, 1, 'two spellings, one row')
  }
)

// Races (council P0-4): two web instances share the table, so the lease, not the process, decides
// who runs and who may write.
const gate = () => {
  let open
  const opened = new Promise((r) => {
    open = r
  })
  return { opened, open }
}

test(
  'two instances ticking at once lease each row once and never run more than `concurrency` in total',
  opts,
  async () => {
    const hold = gate()
    let inFlight = 0
    let peak = 0
    const psi = async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await hold.opened
      inFlight -= 1
      return Response.json(PSI_ANSWER())
    }
    const a = await world({ concurrency: 4, psi })
    const b = await world({ concurrency: 4, psi })
    const urls = [1, 2, 3, 4, 5, 6].map((n) => `https://race${n}.example/`)
    await a.pool.query(
      `insert into wo_site_check (url_key, url, status, queued_at)
       select 'https://race' || n || '.example', 'https://race' || n || '.example/', 'queued', $1
       from generate_series(1, 6) n`,
      [new Date(NOW - 1000)]
    )
    const claimed = await Promise.all([a.checks.tick(), b.checks.tick()])
    assert.ok(claimed[0] + claimed[1] <= 4, `leased ${claimed[0]} + ${claimed[1]}`)
    await new Promise((r) => setTimeout(r, 30))
    assert.ok(peak <= 4, `peak ${peak}`)
    hold.open()
    await Promise.all([a.checks.drain(), b.checks.drain()])
    await Promise.all([a.checks.drain(), b.checks.drain()])
    assert.equal(a.asked.site.length + b.asked.site.length, 6, 'each row ran exactly once')
    assert.deepEqual([...new Set([...a.asked.site, ...b.asked.site])].sort(), urls.sort())
  }
)

test(
  'a worker whose lease ran out cannot overwrite the result of the worker that took the row over',
  opts,
  async () => {
    const hold = gate()
    let calls = 0
    const clock = { now: NOW }
    const a = await world({
      clock,
      psi: async () => {
        calls += 1
        await hold.opened
        return Response.json(PSI_ANSWER({ categories: { performance: { score: 0.1 }, seo: { score: 0.1 } } }))
      }
    })
    const b = await world({ clock })
    await a.checks.request(['https://phoba.example/'])
    await a.checks.tick()
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(calls, 1, 'A holds the row')
    clock.now = NOW + 121_000
    await b.checks.drain()
    assert.equal((await rowOf('https://phoba.example')).performance, 32, 'B finished it')
    hold.open()
    await a.checks.drain()
    const row = await rowOf('https://phoba.example')
    assert.equal(row.performance, 32, "A's late write is dropped")
    assert.equal(row.status, 'done')
    assert.ok(
      a.warned.some((m) => /lease lost/.test(m)),
      'the lost lease is logged'
    )
  }
)

test('request for an address a worker holds keeps its lease and attempts', opts, async () => {
  // The row is stale when read; a worker of another instance re-queues and leases it before this
  // request writes — the read-then-write race of the old upsert.
  let raced = false
  const leaseUntil = new Date(NOW + 60_000)
  const pool = {
    query: async (sql, params) => {
      const out = await db.pool.query(sql, params)
      if (!raced && sql.startsWith('select * from wo_site_check')) {
        raced = true
        await db.pool.query(
          `update wo_site_check set status = 'queued', lease_until = $1, attempts = 1, lease_token = lease_token + 1`,
          [leaseUntil]
        )
      }
      return out
    },
    connect: () => db.pool.connect()
  }
  const { checks } = await world({ pool })
  await db.pool.query(
    `insert into wo_site_check (url_key, url, status, checked_at) values ('https://phoba.example', 'https://phoba.example/', 'done', $1)`,
    [new Date(NOW - 31 * DAY)]
  )
  const before = await rowOf('https://phoba.example')
  const out = await checks.request(['https://phoba.example/'])
  assert.equal(out['https://phoba.example/'].status, 'queued')
  const row = await rowOf('https://phoba.example')
  assert.equal(row.lease_until?.getTime(), leaseUntil.getTime(), 'lease kept')
  assert.equal(row.attempts, 1, 'attempts kept')
  assert.equal(row.lease_token, String(Number(before.lease_token) + 1), 'token kept')
  checks.stop()
})

test('two callers asking for the same new address at once make one row, both told queued', opts, async () => {
  const a = await world()
  const b = await world()
  const [x, y] = await Promise.all([
    a.checks.request(['https://phoba.example/']),
    b.checks.request(['https://phoba.example/'])
  ])
  assert.equal(x['https://phoba.example/'].status, 'queued')
  assert.equal(y['https://phoba.example/'].status, 'queued')
  const { rows } = await db.pool.query('select count(*)::int as n from wo_site_check')
  assert.equal(rows[0].n, 1)
  await Promise.all([a.checks.drain(), b.checks.drain()])
  assert.equal(a.asked.site.length + b.asked.site.length, 1, 'checked once')
})

// Homepage verdict fixes in the same read (plan wo-site-read-tls §8): a contact form is not a challenge, and a
// parked domain is not the restaurant's site.
test('a contact form with reCAPTCHA or hCaptcha is the site, not a challenge', opts, async () => {
  const form = HTML.replace(
    '</body>',
    '<form><div class="g-recaptcha"></div></form><script src="https://www.google.com/recaptcha/api.js"></script><div class="h-captcha"></div></body>'
  )
  const { checks } = await world({ site: () => page(form) })
  await checks.request(['https://phoba.example/'])
  await checks.drain()
  const row = await rowOf('https://phoba.example')
  assert.equal(row.status, 'done')
  assert.equal(row.error, null)
})

const PARKED_TITLE =
  '<html><head><title>phoba.example is for sale | Domain For Sale</title></head><body>x</body></html>'
const PARKED_SIGNALS =
  '<html><head><title>phoba.example</title></head><body><a href="https://www.hugedomains.com/domain_profile.cfm?d=phoba">Make an offer</a><script src="https://sedoparking.com/js/park.js"></script></body></html>'
const ONE_LINK = HTML.replace('</body>', '<a href="https://dan.com/">Our domain broker</a></body>')

test(
  'a parked domain is failed/parked even when PageSpeed answered; one stray link is not enough',
  opts,
  async () => {
    const sites = {
      'https://titled.example/': () => page(PARKED_TITLE),
      'https://signals.example/': () => page(PARKED_SIGNALS),
      'https://onelink.example/': () => page(ONE_LINK)
    }
    const { checks } = await world({ site: (u) => sites[u]() })
    await checks.request(Object.keys(sites))
    await checks.drain()
    const out = await checks.request(Object.keys(sites))
    assert.deepEqual(Object.fromEntries(Object.keys(sites).map((u) => [u, [out[u].status, out[u].error]])), {
      'https://titled.example/': ['failed', 'parked'],
      'https://signals.example/': ['failed', 'parked'],
      'https://onelink.example/': ['done', null]
    })
    assert.equal(
      out['https://titled.example/'].performance,
      32,
      'PageSpeed facts kept, the verdict is still parked'
    )
  }
)

// Tier 2 (`escalating-fetch.js`): the ledger columns come from package migration 0009.
const readTierColumns = async () =>
  db.pool.query(await readFile(join(SCHEMA_DIR, '0009-site-check-read-tier.sql'), 'utf8'))

test(
  'switch on: a 403 homepage read again through impit is done, and the row says how it was read',
  opts,
  async () => {
    await readTierColumns()
    const { checks, asked } = await world({
      site: () => page('no', 403),
      escalate: { impit: () => page() }
    })
    await checks.request(['https://phoba.example/'])
    await checks.drain()
    const row = await rowOf('https://phoba.example')
    assert.equal(row.status, 'done')
    assert.equal(row.cms, 'WordPress')
    assert.equal(row.read_via, 'impit')
    assert.deepEqual(
      row.read_attempts.map(({ tier, status, reason }) => ({ tier, status, reason })),
      [
        { tier: 1, status: 403, reason: 'http_403' },
        { tier: 2, status: 200, reason: 'ok' }
      ]
    )
    assert.deepEqual(asked.impit, ['https://phoba.example/'])
  }
)

test('switch on: a tier-2 failure keeps the tier-1 verdict (blocked), never down', opts, async () => {
  await readTierColumns()
  const sites = {
    'https://forbidden.example/': () => page('no', 403),
    'https://fine.example/': () => page()
  }
  const { checks } = await world({
    site: (u) => sites[u](),
    escalate: { impit: () => Promise.reject(new Error('h2 stream reset')) }
  })
  await checks.request(Object.keys(sites))
  await checks.drain()
  const forbidden = await rowOf('https://forbidden.example')
  assert.equal(forbidden.status, 'blocked')
  assert.equal(forbidden.error, 'http_403')
  assert.equal(forbidden.read_via, 'node')
  assert.equal(forbidden.read_attempts.at(-1).reason, 'tier2_failed')
  const fine = await rowOf('https://fine.example')
  assert.equal(fine.status, 'done')
  assert.equal(fine.read_via, 'node')
  assert.equal(fine.read_attempts.length, 1)
})

test('switch on: impit missing keeps the tier-1 verdict and warns once', opts, async () => {
  await readTierColumns()
  const { checks, warned } = await world({
    site: () => page('no', 403),
    escalate: {
      loadImpit: async () => {
        throw new Error("impit couldn't load native bindings")
      }
    }
  })
  await checks.request(['https://a.example/', 'https://b.example/'])
  await checks.drain()
  assert.equal((await rowOf('https://a.example')).status, 'blocked')
  assert.equal((await rowOf('https://b.example')).status, 'blocked')
  assert.equal(warned.filter((m) => /impit unavailable/.test(m)).length, 1)
})

test(
  'switch on: the retry after a down read shares the first read’s deadline, and skips when none is left',
  opts,
  async () => {
    await readTierColumns()
    const { checks, asked } = await world({
      site: () => page('oops', 503),
      escalate: { impit: () => page(), budgets: { readMs: 500 } }
    })
    await checks.request(['https://broken.example/'])
    await checks.drain()
    const row = await rowOf('https://broken.example')
    assert.equal(row.status, 'down')
    assert.equal(
      asked.site.filter((u) => u === 'https://broken.example/').length,
      1,
      'no time left: no retry'
    )

    const roomy = await world({ site: () => page('oops', 503), escalate: { impit: () => page() } })
    await roomy.checks.request(['https://broken2.example/'])
    await roomy.checks.drain()
    const two = await rowOf('https://broken2.example')
    assert.equal(two.status, 'down')
    assert.equal(roomy.asked.site.length, 2, 'one retry')
    assert.equal(two.read_attempts.length, 2, 'both reads in the ledger')
    assert.equal(two.read_via, 'node', 'the tier the verdict was judged from')
  }
)

// The same reads against real local servers: the real pinned fetch for tier 1, the real `impit` through the real guarded
// proxy for tier 2 (regression case for wo-site-read-tls). Only the DNS answers and the allowed port are test seams.
const impitModule = await import('impit').catch(() => null)
const live = { skip: !url ? 'set TEST_DATABASE_URL' : impitModule ? false : 'impit is not installed' }
const CHALLENGE_403 =
  '<html><head><title>Just a moment...</title></head><body><div id="cf_chl_opt"></div></body></html>'
const RECAPTCHA_ONLY =
  '<html><head><title>Contact</title></head><body><form><div class="g-recaptcha"></div></form><script src="https://www.google.com/recaptcha/api.js"></script></body></html>'

/** One local origin that refuses any client but Chrome on `guarded.test`, and serves a parked and a form page. */
async function localSites() {
  const seen = []
  const server = http.createServer((req, res) => {
    const host = (req.headers.host ?? '').split(':')[0]
    const ua = req.headers['user-agent'] ?? ''
    seen.push({ host, chrome: /Chrome\//.test(ua) })
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'text/html' })
      res.end(body)
    }
    if (host === 'guarded.test') return /Chrome\//.test(ua) ? send(200, HTML) : send(403, CHALLENGE_403)
    if (host === 'parked.test') return send(200, PARKED_TITLE)
    if (host === 'form.test') return send(200, RECAPTCHA_ONLY)
    send(404, 'unknown host')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address())
  return {
    port,
    seen,
    close: async () => {
      server.closeAllConnections?.()
      await new Promise((r) => server.close(r))
    }
  }
}

/** A site-checks world whose network is the local origin: every name answers 127.0.0.1. */
async function localWorld(sites, { enabled = true, proxyBlocks = 'loopback-allowed' } = {}) {
  const real = await websiteOpportunitiesDomain()
  // Tier 1 and the proxy both dial 127.0.0.1; only the SSRF world keeps the real filter for the proxy.
  const localOnly = (ip) => ip !== '127.0.0.1' && real.isBlockedAddress(ip)
  const loopbackDns = (_h, o, cb) =>
    o?.all ? cb(null, [{ address: '127.0.0.1', family: 4 }]) : cb(null, '127.0.0.1', 4)
  const pinned = createPinnedFetch({ isBlockedAddress: async () => localOnly, lookup: loopbackDns })
  const proxy = await startGuardedProxy({
    isBlockedAddress: proxyBlocks === 'real' ? real.isBlockedAddress : localOnly,
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    allowedPorts: [sites.port]
  })
  const w = await world({
    psi: () => new Response('no', { status: 500 }),
    site: (u, init) => pinned(u, init),
    domainOverrides: {
      fetchLimited: (u, o) => real.fetchLimited(u, { ...o, allowPorts: [sites.port] }),
      assertPublicUrl: (u, o) => real.assertPublicUrl(u, o, { allowPorts: [sites.port] })
    },
    escalate: { enabled, getProxy: async () => proxy, loadImpit: async () => impitModule }
  })
  return { ...w, proxy }
}

test(
  'local servers, switch on: a 403 challenge homepage is read through impit (done, read_via impit); parked is failed/parked; a reCAPTCHA form is not blocked',
  live,
  async () => {
    await readTierColumns()
    const sites = await localSites()
    const { checks, proxy } = await localWorld(sites)
    try {
      const at = (h) => `http://${h}:${sites.port}/`
      await checks.request([at('guarded.test'), at('parked.test'), at('form.test')])
      await checks.drain()
      const guarded = await rowOf(urlKeyOf(`http://guarded.test:${sites.port}/`))
      assert.deepEqual([guarded.status, guarded.error, guarded.read_via], ['done', null, 'impit'])
      assert.equal(guarded.cms, 'WordPress')
      assert.deepEqual(
        guarded.read_attempts.map(({ tier, status }) => ({ tier, status })),
        [
          { tier: 1, status: 403 },
          { tier: 2, status: 200 }
        ]
      )
      const parked = await rowOf(urlKeyOf(`http://parked.test:${sites.port}/`))
      assert.deepEqual([parked.status, parked.error, parked.read_via], ['failed', 'parked', 'node'])
      const form = await rowOf(urlKeyOf(`http://form.test:${sites.port}/`))
      assert.deepEqual([form.status, form.error, form.read_via], ['done', null, 'node'])
      assert.deepEqual(
        sites.seen.filter((s) => s.chrome).map((s) => s.host),
        ['guarded.test'],
        'only the refused homepage was read again as Chrome'
      )
    } finally {
      await proxy.close()
      await sites.close()
    }
  }
)

test(
  'local servers, switch off: the same 403 challenge homepage stays blocked and impit is never used',
  live,
  async () => {
    await readTierColumns()
    const sites = await localSites()
    const { checks, proxy } = await localWorld(sites, { enabled: false })
    try {
      await checks.request([`http://guarded.test:${sites.port}/`])
      await checks.drain()
      const row = await rowOf(urlKeyOf(`http://guarded.test:${sites.port}/`))
      assert.deepEqual(
        [row.status, row.error, row.read_via, row.read_attempts],
        ['blocked', 'challenge', null, null]
      )
      assert.ok(sites.seen.length >= 1)
      assert.ok(
        sites.seen.every((s) => !s.chrome),
        'no Chrome read'
      )
    } finally {
      await proxy.close()
      await sites.close()
    }
  }
)

test(
  'local servers, switch on: the proxy refuses a name that resolves to a private address; the verdict stays blocked',
  live,
  async () => {
    await readTierColumns()
    const sites = await localSites()
    const { checks, proxy } = await localWorld(sites, { proxyBlocks: 'real' })
    try {
      await checks.request([`http://guarded.test:${sites.port}/`])
      await checks.drain()
      const row = await rowOf(urlKeyOf(`http://guarded.test:${sites.port}/`))
      assert.deepEqual([row.status, row.error, row.read_via], ['blocked', 'challenge', 'node'])
      assert.equal(row.read_attempts.at(-1).tier, 2)
      assert.notEqual(row.read_attempts.at(-1).reason, 'ok')
      assert.equal(proxy.stats().refused, 1, 'the proxy refused the Chrome read')
      assert.ok(
        sites.seen.every((s) => !s.chrome),
        'the Chrome read never reached the private address'
      )
    } finally {
      await proxy.close()
      await sites.close()
    }
  }
)
