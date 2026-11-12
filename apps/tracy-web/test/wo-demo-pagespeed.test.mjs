// The demo's own mobile PageSpeed (`website-opportunities/src/pagespeed.js` `measurePageSpeed`,
// `opportunities-build/demo-pagespeed.js`): measured once a demo build completes with the same code research uses for
// the current site, kept on `wo_build.built.pagespeed` with the reason when there is no score, and read back as
// `{old, demo}` and the proof line a pitch may quote. PageSpeed is always a stub here: no network.
//   node --test --test-concurrency=1 apps/tracy-web/test/wo-demo-pagespeed.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEMO_PAGESPEED_REASONS,
  demoPageSpeedOf,
  measurePageSpeed,
  pageSpeedUnreachable,
  pagespeedPair,
  pagespeedProof
} from 'website-opportunities/src/pagespeed.js'
import { createDemoPageSpeed, demoAddressOf } from '../src/opportunities-build/demo-pagespeed.js'
import { createDemoBuilt } from '../src/opportunities-build/demo-preview.js'

const AT = Date.parse('2026-11-12T09:00:00Z')
const now = () => AT
const PUBLIC_DNS = async () => [{ address: '93.184.216.34', family: 4 }]

/** PageSpeed's answer for a page Lighthouse measured (`score` 0–1 as PSI sends it). */
function lighthouse(score = 0.92) {
  return {
    lighthouseResult: {
      finalDisplayedUrl: 'https://pho-ba.tracy.site/',
      categories: { performance: { score }, seo: { score: 1 } },
      audits: {
        'largest-contentful-paint': { numericValue: 1834.2 },
        'viewport-insight': { score: 1 },
        'target-size': { score: 1 }
      },
      stackPacks: [{ title: 'WordPress' }]
    }
  }
}

/** A stub PageSpeed: records each request and answers `answer(url)`. */
function stubPsi(answer) {
  const asked = []
  const fetchImpl = async (url, init) => {
    asked.push(String(url))
    return answer(String(url), init)
  }
  return { asked, fetchImpl }
}

test('a demo PageSpeed score is kept with its facts, measured on mobile at the demo address', async () => {
  const psi = stubPsi(() => Response.json(lighthouse(0.92)))
  const measured = await measurePageSpeed('https://pho-ba.tracy.site/', 'AIza-test', {
    fetch: psi.fetchImpl,
    now,
    resolve: PUBLIC_DNS
  })
  assert.deepEqual(measured, {
    url: 'https://pho-ba.tracy.site/',
    performance: 92,
    seo: 100,
    lcpMs: 1834,
    https: true,
    mobileFriendly: true,
    checkedAt: '2026-11-12T09:00:00.000Z'
  })
  assert.equal(psi.asked.length, 1)
  const asked = new URL(psi.asked[0])
  assert.equal(asked.searchParams.get('url'), 'https://pho-ba.tracy.site/')
  assert.equal(asked.searchParams.get('strategy'), 'mobile')
  assert.deepEqual(demoPageSpeedOf(measured), { score: 92, measuredAt: '2026-11-12T09:00:00.000Z' })
})

test('a PageSpeed failure keeps its reason and never a number', async () => {
  const cases = [
    [
      'a Lighthouse refusal is unreachable',
      () =>
        Response.json(
          {
            error: {
              code: 500,
              message:
                'Lighthouse returned error: FAILED_DOCUMENT_REQUEST. Lighthouse was unable to reliably load the page.'
            }
          },
          { status: 500 }
        ),
      { reason: 'unreachable', status: 500, lighthouse: 'FAILED_DOCUMENT_REQUEST' }
    ],
    [
      'a quota refusal is failed',
      () => Response.json({ error: { code: 429, message: 'Quota exceeded' } }, { status: 429 }),
      { reason: 'failed', status: 429 }
    ],
    [
      'a network error is failed',
      () => {
        throw new TypeError('fetch failed')
      },
      { reason: 'failed' }
    ],
    ['an answer without a Lighthouse result is failed', () => Response.json({}), { reason: 'failed' }],
    [
      'an answer without a performance score is no_score',
      () => Response.json(lighthouse(null)),
      { reason: 'no_score' }
    ]
  ]
  for (const [label, answer, expected] of cases) {
    const psi = stubPsi(answer)
    const measured = await measurePageSpeed('https://pho-ba.tracy.site/', 'AIza-test', {
      fetch: psi.fetchImpl,
      now,
      resolve: PUBLIC_DNS
    })
    assert.deepEqual(
      measured,
      { url: 'https://pho-ba.tracy.site/', checkedAt: '2026-11-12T09:00:00.000Z', ...expected },
      label
    )
    assert.equal('performance' in measured, false, `${label}: no score`)
    assert.deepEqual(demoPageSpeedOf(measured), { reason: expected.reason }, label)
  }
})

test('a PageSpeed run that never answers ends at its bound as timeout, even when fetch ignores the abort', async () => {
  for (const honoursAbort of [true, false]) {
    const started = Date.now()
    const measured = await measurePageSpeed('https://pho-ba.tracy.site/', 'AIza-test', {
      now,
      resolve: PUBLIC_DNS,
      timeoutMs: 50,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          if (honoursAbort)
            init.signal.addEventListener('abort', () =>
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
            )
        })
    })
    assert.equal(measured.reason, 'timeout', `abort honoured: ${honoursAbort}`)
    assert.ok(Date.now() - started < 2_000, 'bounded')
  }
})

test('an address PageSpeed cannot reach is never sent to Google', async () => {
  const privateDns = async () => [{ address: '10.0.0.7', family: 4 }]
  const noDns = async () => {
    throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
  }
  const cases = [
    ['http://pho-ba.tracy.test:51710/', PUBLIC_DNS, 'not_public'],
    ['https://pho-ba.tracy.test/', PUBLIC_DNS, 'not_public'],
    ['http://localhost:8080/', PUBLIC_DNS, 'not_public'],
    ['https://pho-ba.localhost/', PUBLIC_DNS, 'not_public'],
    ['http://127.0.0.1/', PUBLIC_DNS, 'not_public'],
    ['https://192.168.1.20/', PUBLIC_DNS, 'not_public'],
    ['https://intranet/', PUBLIC_DNS, 'not_public'],
    ['https://pho-ba.example.com:8443/', PUBLIC_DNS, 'not_public'],
    ['ftp://pho-ba.tracy.site/', PUBLIC_DNS, 'not_public'],
    ['https://pho-ba.tracy.site/', privateDns, 'not_public'],
    ['https://pho-ba.tracy.site/', noDns, 'not_resolved']
  ]
  for (const [url, resolve, reason] of cases) {
    const psi = stubPsi(() => Response.json(lighthouse()))
    const measured = await measurePageSpeed(url, 'AIza-test', { fetch: psi.fetchImpl, now, resolve })
    assert.equal(measured.reason, reason, url)
    assert.equal(measured.url, url)
    assert.deepEqual(psi.asked, [], `${url}: PageSpeed is never asked`)
  }
  assert.equal(await pageSpeedUnreachable('https://pho-ba.tracy.site/', { resolve: PUBLIC_DNS }), null)
  // Without a resolver only the address is judged.
  assert.equal(await pageSpeedUnreachable('https://pho-ba.tracy.site/'), null)
  assert.equal(await pageSpeedUnreachable('http://pho-ba.tracy.test:51710/'), 'not_public')
})

test('no address, the operator switch and a missing key each keep their reason; a stand reads not_public first', async () => {
  const psi = stubPsi(() => Response.json(lighthouse()))
  const opts = { fetch: psi.fetchImpl, now, resolve: PUBLIC_DNS }
  assert.equal((await measurePageSpeed(null, 'AIza-test', opts)).reason, 'no_address')
  assert.equal(
    (await measurePageSpeed('https://pho-ba.tracy.site/', 'AIza-test', { ...opts, enabled: false })).reason,
    'switched_off'
  )
  assert.equal((await measurePageSpeed('https://pho-ba.tracy.site/', null, opts)).reason, 'no_key')
  assert.equal((await measurePageSpeed('http://pho-ba.tracy.test:51710/', null, opts)).reason, 'not_public')
  assert.deepEqual(psi.asked, [])
  for (const reason of ['no_address', 'switched_off', 'no_key', 'not_public'])
    assert.ok(DEMO_PAGESPEED_REASONS.includes(reason))
})

test('the measurer reads the key and the switch from the runtime and the address Details gives the demo', async () => {
  const config = { origin: 'https://tracy.example', siteDomain: 'tracy.site' }
  assert.equal(
    demoAddressOf({ address: 'https://pho-ba.tracy.site/', label: 'x' }, config),
    'https://pho-ba.tracy.site/'
  )
  assert.equal(demoAddressOf({ label: 'pho-ba' }, config), 'https://pho-ba.tracy.site/')
  assert.equal(demoAddressOf(null, config), null)
  const psi = stubPsi(() => Response.json(lighthouse(0.95)))
  let settings = { pageSpeedCheckEnabled: true }
  const measure = createDemoPageSpeed({
    config,
    runtime: async () => ({ keys: { google: 'AIza-ops' }, settings }),
    fetchImpl: psi.fetchImpl,
    resolve: PUBLIC_DNS,
    now
  })
  const measured = await measure({ label: 'pho-ba' })
  assert.equal(measured.performance, 95)
  assert.equal(new URL(psi.asked[0]).searchParams.get('key'), 'AIza-ops')
  settings = { pageSpeedCheckEnabled: false }
  assert.equal((await measure({ label: 'pho-ba' })).reason, 'switched_off')
  const local = createDemoPageSpeed({
    config: { origin: 'http://tracy.test:51710', siteDomain: 'tracy.test' },
    runtime: async () => ({ keys: { google: 'AIza-ops' }, settings: {} }),
    fetchImpl: psi.fetchImpl,
    resolve: PUBLIC_DNS,
    now
  })
  const stand = await local({ label: 'pho-ba' })
  assert.deepEqual(stand, {
    url: 'http://pho-ba.tracy.test:51710/',
    reason: 'not_public',
    checkedAt: '2026-11-12T09:00:00.000Z'
  })
  assert.equal(psi.asked.length, 1, 'the stand demo never reached PageSpeed')
  const broken = createDemoPageSpeed({
    config,
    runtime: async () => {
      throw new Error('db down')
    },
    fetchImpl: psi.fetchImpl,
    now
  })
  assert.equal((await broken({ label: 'pho-ba' })).reason, 'failed')
})

/** A pool that records every statement. */
function recordingPool(site = { site_key: 'pho-ba.tracy.site', label: 'pho-ba', platform: 'joomla' }) {
  const asked = []
  return {
    asked,
    query: async (sql, params) => {
      asked.push({ sql, params })
      if (/from site where site_key/.test(sql)) return { rows: site ? [site] : [] }
      return { rows: [] }
    }
  }
}
const quiet = { warn: () => {}, info: () => {} }

test('a finished build keeps its PageSpeed beside its facts, merged into built, alongside its picture', async () => {
  const pool = recordingPool()
  const order = []
  const demoBuilt = createDemoBuilt({
    pool,
    log: quiet,
    capture: async () => {
      order.push('capture')
      return { ok: false, status: 503, body: { code: 'NO_BROWSER' } }
    },
    pageSpeed: async (site) => {
      order.push(`pagespeed ${site.label}`)
      return { url: 'https://pho-ba.tracy.site/', performance: 92, checkedAt: '2026-11-12T09:00:00.000Z' }
    }
  })
  await demoBuilt({ build: { id: 'b-1', site_key: 'pho-ba.tracy.site' }, at: AT })
  assert.deepEqual(order.sort(), ['capture', 'pagespeed pho-ba'])
  const facts = pool.asked.findIndex((q) => /set built = \$2/.test(q.sql))
  const kept = pool.asked.findIndex((q) => /jsonb_build_object\('pagespeed'/.test(q.sql))
  assert.ok(facts >= 0 && kept > facts, 'the facts first, then the measurement merged into them')
  assert.match(pool.asked[kept].sql, /coalesce\(built, '\{\}'::jsonb\) \|\|/)
  assert.equal(pool.asked[kept].params[0], 'b-1')
  assert.deepEqual(JSON.parse(pool.asked[kept].params[1]), {
    url: 'https://pho-ba.tracy.site/',
    performance: 92,
    checkedAt: '2026-11-12T09:00:00.000Z'
  })
})

test('a PageSpeed measurer that throws or a build without a site never fails the hook', async () => {
  const pool = recordingPool()
  const warned = []
  await createDemoBuilt({
    pool,
    log: { warn: (line) => warned.push(line), info: () => {} },
    pageSpeed: async () => {
      throw new Error('boom')
    }
  })({ build: { id: 'b-1', site_key: 'pho-ba.tracy.site' }, at: AT })
  assert.equal(
    pool.asked.some((q) => /'pagespeed'/.test(q.sql)),
    false
  )
  assert.equal(warned.length, 1)
  // No site row: measured at the address its build's label is born at.
  const bare = recordingPool(null)
  const seen = []
  await createDemoBuilt({
    pool: bare,
    log: quiet,
    pageSpeed: async (site) => {
      seen.push(site)
      return { url: null, reason: 'no_address', checkedAt: '2026-11-12T09:00:00.000Z' }
    }
  })({ build: { id: 'b-2', site_key: 'gone.tracy.site', label: 'gone' }, at: AT })
  assert.deepEqual(seen, [{ label: 'gone' }])
  assert.ok(bare.asked.some((q) => /'pagespeed'/.test(q.sql)))
  // A pool that refuses every statement still does not throw.
  const broken = { query: async () => Promise.reject(new Error('db down')) }
  await createDemoBuilt({ pool: broken, log: quiet, pageSpeed: async () => ({ reason: 'no_key' }) })({
    build: { id: 'b-3', site_key: 'x' },
    at: AT
  })
})

test('the pair reads the old score and the demo view; the proof line only when both scored and the demo is faster', () => {
  const old = { performance: 34, seo: 80, checkedAt: '2026-11-01T08:00:00Z' }
  const demo = demoPageSpeedOf({ performance: 92, checkedAt: '2026-11-12T09:00:00.000Z', url: 'https://x/' })
  const pair = pagespeedPair(old, demo)
  assert.deepEqual(pair, {
    old: { score: 34, measuredAt: '2026-11-01T08:00:00.000Z' },
    demo: { score: 92, measuredAt: '2026-11-12T09:00:00.000Z' }
  })
  assert.equal(pagespeedProof(pair), 'Current site 34 → demo 92 on mobile')
  // No old score, no demo score, a demo not faster, no demo: no proof.
  assert.equal(pagespeedProof(pagespeedPair(null, demo)), null)
  assert.equal(pagespeedProof(pagespeedPair({ performance: null, checkedAt: old.checkedAt }, demo)), null)
  assert.equal(pagespeedProof(pagespeedPair(old, demoPageSpeedOf({ reason: 'not_public' }))), null)
  assert.equal(
    pagespeedProof(pagespeedPair({ ...old, performance: 95 }, demo)),
    null,
    'a worse demo is never offered as proof'
  )
  assert.deepEqual(pagespeedPair(old, null).demo, { reason: 'no_demo' })
  assert.deepEqual(demoPageSpeedOf(null), { reason: 'not_measured' })
  assert.deepEqual(demoPageSpeedOf({ reason: 'made-up' }), { reason: 'no_score' })
  // A measurement without a date is no score.
  assert.equal(pagespeedPair({ performance: 50 }, demo).old, null)
})
