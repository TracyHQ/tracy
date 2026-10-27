// Source routes for a Joomla source without URL rewrite (/contact → 404, /index.php/contact → 200), and the rule that a
// reachable pair whose routes cannot be resolved is a failure of the tool.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { testDir } from './lib/test-root.mjs'
import { detectSourcePrefix, sourcePrefixPlan, resolveSourceRoute, resolveSourceRoutes, routeCandidates } from '../lib/source-routes.mjs'
import { runPortAudit } from '../review/port-audit.mjs'
import { footerPage } from './audit-fixture.mjs'

const page = (body) => `<!doctype html><html><head><title>P</title></head><body><nav><a href="/index.php/contact">Contact</a><a href="/index.php/about-us/">About</a></nav><main>${body}</main></body></html>`

/** A site: `pages` maps a pathname to html; anything else is 404. */
async function site(pages) {
  const server = createServer((req, res) => {
    const html = pages[new URL(req.url, 'http://x').pathname]
    res.writeHead(html === undefined ? 404 : 200, { 'content-type': 'text/html' })
    res.end(html ?? 'not found')
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }
}

const NO_REWRITE = { '/': page('<p>Home</p>'), '/index.php': page('<p>Home</p>'), '/index.php/contact': page('<p>Contact</p>'), '/index.php/about-us/': page('<p>About</p>') }
const REWRITE = { '/': page('<p>Home</p>'), '/contact': page('<p>Contact</p>') }

test('routeCandidates: as given, then /index.php, then the real hrefs of the source', () => {
  assert.deepEqual(routeCandidates('/contact'), ['/contact', '/contact/', '/index.php/contact', '/index.php/contact/'])
  assert.deepEqual(routeCandidates('/'), ['/', '/index.php/'])
  assert.ok(routeCandidates('/about-us', { hrefs: ['/index.php/about-us/'] }).includes('/index.php/about-us/'))
  assert.throws(() => routeCandidates('contact'), /starting with \//)
})

test('a no-rewrite source: /path is 404 and /index.php/path answers — the route resolves, for the route and for a menu href', async () => {
  const s = await site(NO_REWRITE)
  try {
    const direct = await resolveSourceRoute(s.origin, '/contact')
    assert.equal(direct.url, `${s.origin}/index.php/contact`)
    assert.equal(direct.via, 'prefix')
    assert.match(direct.tried[0], /\/contact → 404/)
    const trailing = await resolveSourceRoute(s.origin, '/about-us')
    assert.equal(trailing.url, `${s.origin}/index.php/about-us/`)
    const all = await resolveSourceRoutes(s.origin, ['/', '/contact', '/about-us'])
    assert.equal(all.prefix, '/index.php')
    assert.deepEqual(all.failed, [])
    assert.equal(await detectSourcePrefix(s.origin, ['/', '/contact']), '/index.php')
  } finally {
    await s.close()
  }
})

test('a route the page map declares as not-found resolves to its declared status; every other route still needs 200', async () => {
  const s = await site(REWRITE)
  try {
    // without a declaration the 404 page pair is "unresolved" — the tool failure the checkpoint hit
    const bare = await resolveSourceRoutes(s.origin, ['/contact', '/404'])
    assert.deepEqual(bare.failed.map((f) => f.route), ['/404'])
    const declared = await resolveSourceRoutes(s.origin, ['/contact', '/404'], { expect: { '/404': 404 } })
    assert.deepEqual(declared.failed, [])
    assert.equal(declared.results['/404'].url, `${s.origin}/404`)
    assert.equal(declared.results['/404'].html, 'not found')
    // a declared status is the ONLY status accepted: a source that answers 200 everywhere does not resolve a declared 404
    const always200 = async (url) => ({ status: 200, html: 'ok', url })
    const wrong = await resolveSourceRoutes(s.origin, ['/contact'], { fetchPage: always200, expect: { '/contact': 404 } })
    assert.deepEqual(wrong.failed.map((f) => f.route), ['/contact'])
    assert.match(wrong.failed[0].reason, /declared 404/)
    const one = await resolveSourceRoute(s.origin, '/gone', { status: 404 })
    assert.equal(one.url, `${s.origin}/gone`)
  } finally {
    await s.close()
  }
})

test('a rewriting source keeps its plain routes (no prefix is invented)', async () => {
  const s = await site(REWRITE)
  try {
    const r = await resolveSourceRoute(s.origin, '/contact')
    assert.equal(r.via, 'direct')
    assert.equal(await detectSourcePrefix(s.origin, ['/contact']), '')
  } finally {
    await s.close()
  }
})

test('a host that answers 200 on / but not on a route: that route is a tool failure, named', async () => {
  const s = await site(REWRITE)
  try {
    const r = await resolveSourceRoutes(s.origin, ['/contact', '/missing'])
    assert.equal(r.failed.length, 1)
    assert.equal(r.failed[0].route, '/missing')
    assert.match(r.failed[0].reason, /answers 200 on \//)
    const down = await resolveSourceRoutes('http://127.0.0.1:9', ['/contact'])
    assert.deepEqual(down.failed, [], 'an unreachable host is unreachable, not a resolution failure')
    assert.equal(down.results['/contact'].url, null)
  } finally {
    await s.close()
  }
})

test('port-audit reads a no-rewrite source through /index.php: an exemption is checked against the source page, not skipped', async () => {
  const about = '<p>Migrating from Joomla! to WordPress</p>'
  const s = await site({ '/': page('<p>Home</p>'), '/index.php/contact': page(about) })
  const t = await site({ '/': footerPage('<p>© 2026 Acme</p>', '<p>Home</p>'), '/contact': footerPage('<p>© 2026 Acme</p>', about) })
  try {
    const seen = []
    const fetchUrl = async (url) => {
      seen.push(url)
      const res = await fetch(url, { redirect: 'follow' })
      return { status: res.status, html: await res.text(), url: res.url }
    }
    const allow = [{ route: '/contact', token: 'joomla', text: 'Migrating from Joomla! to WordPress', reason: 'the article is about Joomla' }]
    const report = await runPortAudit({ site: t.origin, source: s.origin, routes: [{ path: '/', status: null }, { path: '/contact', status: null }], inputs: { decisions: null, allow, reviews: null, exceptionFiles: [] }, fetchUrl })
    assert.ok(seen.includes(`${s.origin}/index.php/contact`), `the source was read under /index.php (${seen.join(', ')})`)
    assert.deepEqual(report.checks['cms-leftovers'].findings, [], 'the source content backs the exemption')
    assert.equal(report.checks['cms-leftovers'].exempt.length, 1)
  } finally {
    await s.close()
    await t.close()
  }
})

// ── the live driver ──
const LIVE = fileURLToPath(new URL('./audit-live.mjs', import.meta.url))
// async: the fixture sites live in this process, a blocking spawn would starve them
const live = (args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [LIVE, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d })
    child.stdout.resume()
    const timer = setTimeout(() => child.kill('SIGKILL'), 170000)
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, stderr }) })
  })
const ESSENCE = { '/': page('<p>Home</p>'), '/contact': page('<p>c</p>'), '/detail/layout-1': page('<p>a</p>'), '/category/category-style-1': page('<p>l</p>'), '/resources': page('<p>r</p>'), '/pages/user/login-form': page('<p>l</p>') }
const noRewriteEssence = Object.fromEntries(Object.entries(ESSENCE).map(([k, v]) => [k === '/' ? '/' : `/index.php${k}`, v]).concat([['/index.php/home/home-3', page('<p>h</p>')]]))

test('audit-live: a no-rewrite source resolves every page under /index.php and is not a tool failure', async () => {
  const s = await site(noRewriteEssence)
  const t = await site(ESSENCE)
  try {
    const out = join(testDir('audit-live-norewrite'), 'out')
    await live(['--profile', 'essence', '--source', s.origin, '--target', t.origin, '--out', out, '--timeout-seconds', '60'])
    const report = JSON.parse(readFileSync(join(out, 'live-report.json'), 'utf8'))
    assert.ok(!report.toolFailure)
    assert.equal(report.sourceRouting.prefix, '/index.php')
    for (const [key, p] of Object.entries(report.pages)) {
      assert.ok(p.source, `${key}: source resolved`)
      assert.equal(p.sourceVia, 'prefix', key)
      assert.equal(p.unavailable, undefined, key)
    }
  } finally {
    await s.close()
    await t.close()
  }
})

test('audit-live: both hosts answer 200 on / but the source has no route → exit 4, a tool failure naming the routes, never "unavailable" alone', async () => {
  const s = await site({ '/': page('<p>Home</p>') })
  const t = await site(ESSENCE)
  try {
    const out = join(testDir('audit-live-toolfail'), 'out')
    const r = await live(['--profile', 'essence', '--source', s.origin, '--target', t.origin, '--out', out, '--timeout-seconds', '60'])
    assert.equal(r.status, 4, r.stderr)
    assert.match(r.stderr, /TOOL FAILURE/)
    const report = JSON.parse(readFileSync(join(out, 'live-report.json'), 'utf8'))
    assert.equal(report.toolFailure.kind, 'route-resolution')
    assert.ok(report.toolFailure.routes.length >= 5)
    assert.equal(report.complete, false)
  } finally {
    await s.close()
    await t.close()
  }
})

test('mixed source routes: one page answers directly and another only under /index.php — each route keeps its own address, and the readers use them per route', async () => {
  const mixed = { '/': page('<p>Home</p>'), '/blog': page('<p>Blog</p>'), '/index.php/contact': page('<p>Contact</p>') }
  const s = await site(mixed)
  try {
    const all = await resolveSourceRoutes(s.origin, ['/', '/blog', '/contact'])
    assert.equal(all.results['/blog'].url, `${s.origin}/blog`)
    assert.equal(all.results['/blog'].via, 'direct')
    assert.equal(all.results['/contact'].url, `${s.origin}/index.php/contact`)
    assert.equal(all.results['/contact'].via, 'prefix')
    assert.deepEqual(all.failed, [])
    // one prefix for the whole source would send /blog to /index.php/blog (404) or /contact to /contact (404): the readers take the per-route address
    assert.equal(await detectSourcePrefix(s.origin, ['/blog', '/contact']), '', 'a single prefix cannot describe this source')
    // every route is probed, not three of them: a mixed source is reported as such, and a reachable route that resolves nowhere is named
    const plan = await sourcePrefixPlan(s.origin, ['/blog', '/contact', '/a', '/b', '/c'])
    assert.equal(plan.mixed, true)
    assert.deepEqual(plan.unresolved.sort(), ['/a', '/b', '/c'])
    assert.equal((await sourcePrefixPlan(s.origin, ['/contact'])).prefix, '/index.php')
    const gone = await resolveSourceRoutes(s.origin, ['/blog', '/nowhere'])
    assert.deepEqual(gone.failed.map((f) => f.route), ['/nowhere'], 'a reachable source with an unresolvable route is a failure, not a fallback')
  } finally {
    await s.close()
  }
  const pre = readFileSync(new URL('../visual/preflight.mjs', import.meta.url), 'utf8')
  assert.match(pre, /sourcePrefixPlan\(/, 'preflight probes every route')
  assert.match(pre, /if \(plan\.mixed\) return usage/, 'preflight stops on a mixed source')
  for (const f of ['visual/motion.mjs', 'visual/layout-boxes.mjs']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    assert.match(src, /resolveSourceRoutes\(/, `${f} resolves each route`)
    assert.doesNotMatch(src, /detectSourcePrefix/, `${f} no longer builds every source URL from one probed prefix`)
  }
  const qa = readFileSync(new URL('../visual/visual-qa.mjs', import.meta.url), 'utf8')
  assert.match(qa, /throw new Error\(`\$\{res\.failed\.length\} source route\(s\) unresolved/, 'visual-qa stops on an unresolved reachable route')
})

test('unresolved reachable source routes (motion, layout-boxes): the readers stop on them, they never measure the unresolved URL as a 404', async () => {
  const { motionRoutes } = await import('../visual/motion.mjs')
  const s = await site({ '/': page('<p>Home</p>'), '/blog': page('<p>Blog</p>') })
  try {
    // motionRoutes' browser is only reached for the pages; an unresolved route is an error row marked as a tool failure, whatever the page answered
    const browser = { newPage: async () => ({ goto: async () => { throw new Error('offline') }, close: async () => {} }) }
    const rows = await motionRoutes(browser, { source: s.origin, site: s.origin, routes: ['/nowhere'] }).catch((e) => e)
    assert.ok(Array.isArray(rows), String(rows))
    assert.equal(rows[0].unresolved, true)
    assert.match(rows[0].error, /TOOL FAILURE: source route unresolved although .* answers 200 on \//)
    const cli = await new Promise((resolve) => {
      const child = spawn(process.execPath, [fileURLToPath(new URL('../visual/layout-boxes.mjs', import.meta.url)), '--source', s.origin, '--site', s.origin, '--routes', '/,/nowhere'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let err = ''
      child.stderr.on('data', (d) => { err += d })
      child.on('close', (code) => resolve({ code, err }))
    })
    assert.equal(cli.code, 2, cli.err)
    assert.match(cli.err, /source \/nowhere unresolved although .* answers 200 on \//)
  } finally {
    await s.close()
  }
})
