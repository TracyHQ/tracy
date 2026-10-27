// verify.mjs — the Phase 8 orchestrator. plan() is pure: from a page-map and the source→target
// pairs it names the routes each phase runs. The fast set is the smallest set that touches every
// template family: home, the first page of every distinct `view`, the single post and the 404 —
// on the real wp-tracy-business page-map that is 12 of 17 routes. The full set is every pair.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { plan, judgeShoot, runVerify, PHASES } from '../verify.mjs'

const fixtures = new URL('./fixtures/verify-plan/', import.meta.url)
const pageMap = JSON.parse(readFileSync(new URL('page-map.json', fixtures), 'utf8'))
const pairs = JSON.parse(readFileSync(new URL('parity-map.json', fixtures), 'utf8'))
const base = (evidence, mode) => ({
  pageMap, pairs, mode, evidence,
  source: 'http://s', target: 'http://t', spec: '/spec', config: '/c.json', darkHook: 'attr:data-theme=dark'
})
const quiet = { log: () => {} }

test('plan fast: home first, then one route per view in page-map order, single and 404 included, RU left out', () => {
  const p = plan({ pageMap, pairs, mode: 'fast' })
  assert.deepEqual(
    p.parity.map((r) => `${r.from} → ${r.to}${r.status ? ` (${r.status})` : ''}`),
    [
      '/Home.html → /',
      '/404.html → /404 (404)',
      '/About.html → /about',
      '/Article.html → /four-common-mistakes-in-heavy-machine-foundation-design/',
      '/Contact.html → /contact',
      '/Email.html → /email',
      '/Form.html → /form',
      '/News.html → /news',
      '/Newsletter.html → /newsletter',
      '/Search.html → /search',
      '/Slide.html → /slide',
      '/Style guide.html → /style-guide'
    ]
  )
  assert.deepEqual(p.views, {
    '/': 'front-page', '/404': '404', '/about': 'page', '/four-common-mistakes-in-heavy-machine-foundation-design/': 'single',
    '/contact': 'page-contact', '/email': 'page-email', '/form': 'page-form', '/news': 'home', '/newsletter': 'page-newsletter',
    '/search': 'search', '/slide': 'page-slide', '/style-guide': 'page-style-guide'
  })
  assert.deepEqual(p.target, p.parity.map((r) => r.to))
  assert.ok(!p.scan.includes('/404'), 'the 404 page answers 404 by contract; the scanners expect 200')
  assert.equal(p.scan.length, 11)
  assert.deepEqual(p.viewports, ['1440x900'])
})

test('plan full: every pair, both viewports; --scan-routes narrows only the scanners', () => {
  const p = plan({ pageMap, pairs, mode: 'full' })
  assert.equal(p.parity.length, 17)
  assert.deepEqual(p.parity.map((r) => r.from), pairs.rules.map((r) => r.from))
  assert.equal(p.scan.length, 16)
  assert.deepEqual(p.viewports, ['1440x900', '390x844'])
  const narrowed = plan({ pageMap, pairs, mode: 'full', scanRoutes: ['/', '/about'] })
  assert.deepEqual(narrowed.scan, ['/', '/about'])
  assert.equal(narrowed.parity.length, 17)
})

test('plan without pairs: source and target routes are the page-map paths', () => {
  const p = plan({ pageMap, mode: 'fast' })
  assert.equal(p.parity[0].from, '/')
  assert.equal(p.parity[0].to, '/')
  assert.ok(p.parity.some((r) => r.to === '/article'))
})

test('judgeShoot: a 404 route answering 404 is fine; a 200 route answering anything else, or without a file, is not', () => {
  const expect = { '/404': 404 }
  const index = [
    { route: '/', width: 1440, theme: 'light', status: 200, file: 'home__1440__light.png' },
    { route: '/404', width: 1440, theme: 'light', status: 404, file: '404__1440__light.png' },
    { route: '/about', width: 1440, theme: 'dark', status: 500, file: 'about__1440__dark.png' },
    { route: '/news', width: 390, theme: 'dark', status: 200, file: null, errors: ['Timeout'] }
  ]
  const j = judgeShoot(index, expect)
  assert.equal(j.ok, false)
  assert.deepEqual(j.bad.map((b) => `${b.route} ${b.width} ${b.theme} ${b.status}`), ['/about 1440 dark 500', '/news 390 dark 200'])
  assert.equal(judgeShoot(index.slice(0, 2), expect).ok, true)
})

test('judgeShoot: a route whose contract is a redirect is fine where the browser landed elsewhere on a page, not otherwise', () => {
  const expect = { '/account/profile': 303 }
  const shot = (url, status) => ({ route: '/account/profile', url, width: 390, theme: 'dark', status, file: 'account-profile__390__dark.png' })
  assert.equal(judgeShoot([shot('http://site.test/account/login/', 200)], expect).ok, true)
  // served at its own address: the redirect is gone
  assert.equal(judgeShoot([shot('http://site.test/account/profile/', 200)], expect).ok, false)
  // redirected onto an error
  assert.equal(judgeShoot([shot('http://site.test/account/login/', 404)], expect).ok, false)
})

test('runVerify: fast red stops before full and says why; every phase is logged with its seconds', async () => {
  const evidence = mkdtempSync(join(tmpdir(), 'verify-'))
  const calls = []
  // Stand-in for the three tools: a fake runner records the argv and answers with canned results.
  const fake = async (phase, mode, argv) => {
    calls.push(`${mode}:${phase}`)
    if (phase === 'parity') return { exit: 1, summary: { routes: 12, ok: 11, failing: 1 }, failing: [{ route: '/About.html', missing: ['Lost run'] }] }
    if (phase === 'scan') return { exit: 0, summary: { total: 22, pass: 22, needsReview: 0, fail: 0, cached: 0 }, failing: [] }
    return { exit: 0, summary: { shots: 24, bad: 0 }, failing: [] }
  }
  const result = await runVerify(base(evidence, 'both'), { runner: fake, ...quiet })
  assert.equal(result.ok, false)
  assert.deepEqual(calls, ['fast:parity', 'fast:scan', 'fast:shoot'], 'full never ran')
  assert.deepEqual(PHASES, ['parity', 'scan', 'shoot'])
  const json = JSON.parse(readFileSync(join(evidence, 'verify.json'), 'utf8'))
  assert.equal(json.ok, false)
  assert.equal(json.phases.length, 3)
  assert.ok(json.phases.every((p) => typeof p.seconds === 'number' && p.mode === 'fast'))
  assert.equal(json.phases[0].ok, false)
  assert.deepEqual(json.results.fast.parity.failing[0].missing, ['Lost run'])
  assert.equal(json.results.full, undefined)
  assert.ok(readdirSync(join(evidence, 'fast')).includes('source-routes.json'))
  assert.deepEqual(JSON.parse(readFileSync(join(evidence, 'fast', 'source-routes.json'), 'utf8')).length, 12)
})

test('runVerify: fast green runs full; --full alone skips fast', async () => {
  const evidence = mkdtempSync(join(tmpdir(), 'verify-'))
  const calls = []
  const fake = async (phase, mode) => {
    calls.push(`${mode}:${phase}`)
    return { exit: 0, summary: {}, failing: [] }
  }
  const r = await runVerify(base(evidence, 'both'), { runner: fake, ...quiet })
  assert.equal(r.ok, true)
  assert.deepEqual(calls, ['fast:parity', 'fast:scan', 'fast:shoot', 'full:parity', 'full:scan', 'full:shoot'])
  calls.length = 0
  await runVerify(base(evidence, 'full'), { runner: fake, ...quiet })
  assert.deepEqual(calls, ['full:parity', 'full:scan', 'full:shoot'])
})
