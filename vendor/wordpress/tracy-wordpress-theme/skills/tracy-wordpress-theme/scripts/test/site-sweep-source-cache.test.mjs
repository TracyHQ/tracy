// site-sweep-source-cache.mjs: the source side of a sweep is measured once and reused while the source is unchanged.
// Real browser on small local pages (a "port" server and a mutable "source" server); the pages are synthetic fixtures.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { lazyBrowser } from '../lib/browser.mjs'
import { dossierPlan, runSweep, ALL_CHECKS } from '../visual/site-sweep.mjs'
import { canonical, createSourceCache as makeCache, fetchEntry, PROBE_VERSION, SOURCE_CACHE_SCHEMA } from '../visual/site-sweep-source-cache.mjs'

const browser = lazyBrowser()
const servers = []
const tmps = []
after(async () => {
  await browser.close()
  for (const s of servers) s.close()
  for (const t of tmps) rmSync(t, { recursive: true, force: true })
})
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), 'source-cache-'))
  tmps.push(d)
  return d
}

// a server whose pages the test can change. It counts every request; the cache's own revalidation fetches are counted by the test's fetcher
// (they carry exactly the browser's headers), so the requests a BROWSER made are the difference.
const byOrigin = new Map()
const createSourceCache = (o) =>
  makeCache({
    ...o,
    fetcher: (e) => {
      const st = byOrigin.get(new URL(e.url).origin)
      if (st) st.fetches++
      return fetchEntry(e)
    }
  })
const loadsOf = (st) => st.requests - st.fetches
const serve = (routes) =>
  new Promise((resolve) => {
    const state = { routes, requests: 0, fetches: 0, seen: [] }
    const server = createServer((req, res) => {
      const url = req.url.split('?')[0]
      state.requests++
      state.seen.push({ url, headers: req.headers })
      const r = state.routes[url]
      if (req.method === 'POST') {
        res.writeHead(200)
        return res.end('ok')
      }
      if (!r) {
        res.writeHead(404, { 'content-type': 'text/html' })
        return res.end('<!doctype html><title>404</title><body>not found')
      }
      res.writeHead(r.status ?? 200, { 'content-type': r.type ?? 'text/html', ...(typeof r.headers === 'function' ? r.headers() : (r.headers ?? {})) })
      res.end(r.body)
    })
    server.listen(0, '127.0.0.1', () => {
      servers.push(server)
      const origin = `http://127.0.0.1:${server.address().port}`
      byOrigin.set(origin, state)
      resolve(Object.assign(state, { origin }))
    })
  })
const page = (body, { css = '', script = '' } = {}) => ({ body: `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/site.css"><style>body{margin:0;font:16px/24px Arial;background:#fff}${css}</style></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>` })
const CSS = { type: 'text/css', body: 'main{padding:8px}' }
const contract = (pages) => ({
  design: { theme: { selector: 'html', attribute: 'data-theme', values: { light: null, dark: 'dark' }, storage: { type: 'cookie', key: 'tracy_theme' } } },
  source: { kind: 'live', darkHook: 'attr:data-theme=dark', lightHook: 'attr:data-theme=light' },
  pages: pages.map((p) => ({ id: p, path: p, status: 200, sourceRoute: p }))
})
const body = '<header><a href="/">Home</a></header><main><h1>Title</h1><p>text</p></main><footer>foot</footer>'
const wide = '<div style="width:620px;height:20px;background:#ccc">wide</div>'

async function fixture(routes = ['/a', '/over']) {
  const port = await serve({ '/site.css': CSS, '/a': page(body), '/over': page(body + wide) })
  // '/' is the home page the command line fingerprints the source on
  const source = await serve({ '/': page(body), '/site.css': { ...CSS }, '/a': page(body), '/over': page(body) })
  const plan = dossierPlan({ contract: contract(routes) })
  const pairs = plan.pages.map((pg) => ({ ...pg, sourceUrl: new URL(pg.sourceRoute, source.origin).href }))
  return { port, source, plan, pairs }
}
const sweep = async (f, { cache, widths = [390, 1024], only = ALL_CHECKS, plan = f.plan, pairs = f.pairs } = {}) =>
  runSweep({ browser: await browser.get(), site: f.port.origin, source: f.source.origin, plan, pairs, widths, heightsWidths: widths, schemes: ['light'], only, concurrency: 2, settleMs: 50, sourceCache: cache, heightsQuiet: { minMs: 100, ceilingMs: 1500, stepMs: 60 } })
// what was judged, without timing, timestamps and provenance
const judgments = (r) => canonical({ checks: r.checks.map((c) => ({ id: c.id, cases: c.cases, defects: c.defects, defectRows: c.defectRows, listed: c.listed, notMeasured: c.notMeasured, pass: c.pass, accepted: c.accepted })), groups: r.groups, owed: r.owed, exit: r.exit, confirmation: r.confirmation })
const cells = (r, from) => r.sourceCache.cells.filter((c) => c.from === from)
const entries = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')) : [])

test('synthetic: a second sweep over an unchanged source reuses every source reading and judges the same; the port is measured live', async (t) => {
  const f = await fixture()
  const dir = path.join(tmp(), 'source-cache')
  const t0 = Date.now()
  const cold = await sweep(f, { cache: createSourceCache({ dir }) })
  const coldMs = Date.now() - t0
  const sourceLoads = loadsOf(f.source)
  const portLoads = loadsOf(f.port)
  assert.ok(cold.checks.some((c) => c.id === 'overflow' && c.defects > 0), 'the fixture has a defect, so a confirmation runs')
  assert.ok(cold.confirmation && Object.keys(cold.confirmation).length, 'the defect was confirmed on a fresh load')
  assert.equal(cells(cold, 'cache').length, 0)
  assert.ok(cells(cold, 'live').length > 0)
  assert.ok(sourceLoads > 0)

  const portBefore = f.port.requests
  f.source.requests = f.source.fetches = 0
  const t1 = Date.now()
  const warm = await sweep(f, { cache: createSourceCache({ dir }) })
  const warmMs = Date.now() - t1
  t.diagnostic(`fixture timing (not asserted): cold ${coldMs} ms, warm ${warmMs} ms; source browser loads ${sourceLoads} → ${loadsOf(f.source)}, port browser loads ${portLoads} → ${f.port.requests - portBefore}`)
  assert.equal(loadsOf(f.source), 0, 'no source page was loaded by the browser ' + JSON.stringify(cells(warm, 'live')))
  assert.ok(f.port.requests - portBefore >= portLoads * 0.9, 'the port was measured live again')
  // the one reading that loads no source page (a state the dossier has no switch for) has nothing to fingerprint and is derived, not read
  assert.ok(cells(warm, 'live').every((c) => /no document was recorded/.test(c.why)), JSON.stringify(cells(warm, 'live')))
  assert.equal(warm.sourceCache.cached + cells(warm, 'live').length, cells(cold, 'live').length)
  for (const kind of ['plain', 'scheme-state', 'static', 'heights', 'first-interaction-themeCase', 'confirm-overflow']) assert.ok(cells(warm, 'cache').some((c) => c.kind === kind), `a cached ${kind} cell`)
  assert.equal(judgments(warm), judgments(cold))
})

test('mixed none routes stay target-live and never create source-cache cells', async () => {
  const f = await fixture(['/a', '/over'])
  const dir = path.join(tmp(), 'mixed-source-cache')
  const pages = f.plan.pages.map((p) => p.path === '/over' ? { ...p, referenceKind: 'none' } : { ...p, referenceKind: 'html' })
  const plan = { ...f.plan, pages }
  const pairs = pages.map((p) => ({ ...p, sourceUrl: new URL(p.sourceRoute, f.source.origin).href }))
  const cache = createSourceCache({ dir })
  const report = await sweep(f, { cache, plan, pairs, widths: [390], only: ['overflow'] })
  assert.ok(report.rows.some((r) => r.route === '/over' && r.referenceKind === 'none'), 'the target route was measured')
  assert.ok(report.sourceCache.cells.every((c) => c.route !== '/over'), 'the none route has no cache cell')
  assert.ok(!f.source.seen.some((r) => r.url === '/over'), 'the configured source counterpart was never fetched for the none route')
  assert.ok(report.sourceCache.cells.some((c) => c.route === '/a'), 'the sourced route still uses source cache')
})

test('synthetic: a changed source page, a changed asset, a changed width, probe version or probe configuration each miss, and nothing else does', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  const only = ['overflow', 'background', 'heights']
  await sweep(f, { cache: createSourceCache({ dir }), only })
  const live = async (opts, cacheOpts = {}) => cells(await sweep(f, { cache: createSourceCache({ dir, ...cacheOpts }), only, ...opts }), 'live')
  assert.equal((await live({})).length, 0, 'unchanged: all cached')

  // a changed asset that shapes the reading
  const css = f.source.routes['/site.css']
  f.source.routes['/site.css'] = { ...css, body: 'main{padding:40px}' }
  const afterAsset = await live({})
  assert.ok(afterAsset.length > 0 && afterAsset.every((c) => /the source changed: .*site\.css/.test(c.why)), JSON.stringify(afterAsset))
  assert.equal((await live({})).length, 0, 'the new version was stored')

  // a changed page
  f.source.routes['/a'] = page(body.replace('Title', 'Another title'))
  assert.ok((await live({})).every((c) => /the source changed: .*\/a/.test(c.why)))
  assert.equal((await live({})).length, 0)

  // another width: the plain sequence misses; heights hit at the width it has
  const widths = await live({ widths: [390, 768] })
  assert.deepEqual([...new Set(widths.map((c) => c.kind))].sort(), ['heights', 'plain'])
  assert.equal(widths.filter((c) => c.kind === 'heights').length, 1, 'only the new width is measured')

  // the probe version
  const v = await live({}, { probeVersion: PROBE_VERSION + 1 })
  assert.ok(v.length > 0 && v.every((c) => /no entry/.test(c.why)))

  // probe configuration: another header selector
  const sel = structuredClone(f.plan)
  sel.selectors.source.header = 'header'
  const cfg = await live({ plan: sel })
  assert.ok(cfg.some((c) => c.kind === 'plain') && cfg.some((c) => c.kind === 'heights'))
})

test('synthetic: a missing, unreadable, foreign or incomplete entry measures live; the cache is never trusted over the key', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  const only = ['overflow']
  await sweep(f, { cache: createSourceCache({ dir }), only })
  const names = entries(dir)
  assert.ok(names.length > 0)
  const file = path.join(dir, names[0])
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(doc.schema, SOURCE_CACHE_SCHEMA)
  const reason = async () => cells(await sweep(f, { cache: createSourceCache({ dir }), only }), 'live')[0]?.why
  writeFileSync(file, '{ not json')
  assert.match(await reason(), /entry unreadable/)
  writeFileSync(file, JSON.stringify({ ...doc, key: { ...doc.key, url: `${doc.key.url}?x` } }))
  assert.match(await reason(), /key mismatch/)
  writeFileSync(file, JSON.stringify({ ...doc, complete: false }))
  assert.match(await reason(), /entry incomplete/)
  writeFileSync(file, JSON.stringify({ ...doc, manifest: [] }))
  assert.match(await reason(), /entry incomplete/)
  rmSync(file)
  assert.match(await reason(), /no entry/)
  assert.equal(await reason(), undefined, 'the live reading was stored again')
  assert.deepEqual(readdirSync(dir).filter((n) => n.endsWith('.tmp')), [])
})

test('synthetic: a source that cannot be fingerprinted is measured live every time and never stored', async () => {
  const f = await fixture(['/a'])
  f.source.routes['/a'] = page(body, { script: "fetch('/beacon', { method: 'POST', body: 'x' })" })
  const dir = path.join(tmp(), 'source-cache')
  for (let i = 0; i < 2; i++) {
    const r = await sweep(f, { cache: createSourceCache({ dir }), only: ['overflow'] })
    assert.equal(cells(r, 'cache').length, 0)
    assert.match(cells(r, 'live')[0].why, /not stored: POST .*cannot be fetched again/)
  }
  assert.equal(entries(dir).length, 0)
})

test('synthetic: not-measured stays not-measured; a source that stops answering is owed, never served from the cache', async () => {
  const f = await fixture(['/a', '/gone'])
  const dir = path.join(tmp(), 'source-cache')
  const only = ['overflow', 'heights']
  const first = await sweep(f, { cache: createSourceCache({ dir }), only })
  assert.ok(first.owed.some((o) => o.route === '/gone'))
  const second = await sweep(f, { cache: createSourceCache({ dir }), only })
  assert.ok(second.owed.some((o) => o.route === '/gone'), 'the unmeasured route is still owed')
  assert.ok(!cells(second, 'cache').some((c) => c.route === '/gone'))
  assert.equal(second.exit, 3)
  // the source now answers 500 on a page that was cached: the document changed, so the reading is live, fails and is owed
  f.source.routes['/a'] = { status: 500, body: 'broken' }
  const third = await sweep(f, { cache: createSourceCache({ dir }), only })
  assert.ok(third.owed.some((o) => o.route === '/a'))
  assert.ok(third.exit === 3 || third.exit === 1)
  assert.ok(!cells(third, 'cache').some((c) => c.route === '/a'))
})

test('synthetic: a bypass measures the source live in every pass and writes nothing; the report says why', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  const r = await sweep(f, { cache: createSourceCache({ dir, enabled: false, reason: '--no-source-cache' }), only: ['overflow', 'background', 'heights', 'first-interaction'] })
  assert.equal(r.sourceCache.enabled, false)
  assert.equal(r.sourceCache.bypass, '--no-source-cache')
  assert.equal(cells(r, 'cache').length, 0)
  assert.ok(cells(r, 'live').length > 0 && cells(r, 'live').every((c) => c.why === '--no-source-cache'))
  assert.equal(entries(dir).length, 0)
  // without a cache object the report still says so
  const none = await sweep(f, { only: ['overflow'] })
  assert.equal(none.sourceCache.enabled, false)
})

test('synthetic: the cached reading handed to the judges is a copy; judging cannot change the file', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  const cache = createSourceCache({ dir })
  await sweep(f, { cache, only: ['overflow'] })
  const before = Object.fromEntries(entries(dir).map((n) => [n, readFileSync(path.join(dir, n), 'utf8')]))
  const again = createSourceCache({ dir })
  const r = await sweep(f, { cache: again, only: ['overflow'] })
  r.rows[0].source.over = 12345
  assert.deepEqual(Object.fromEntries(entries(dir).map((n) => [n, readFileSync(path.join(dir, n), 'utf8')])), before)
})

test('command line: --no-source-cache and --reload are accepted and the cache directory lives under the run root', async () => {
  const { spawn } = await import('node:child_process')
  const f = await fixture(['/a'])
  const dossier = tmp()
  writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify(contract(['/a'])))
  const run = (extra) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(import.meta.dirname, '../visual/site-sweep.mjs'), '--site', f.port.origin, '--source', f.source.origin, '--run-root', dossier, '--settle-ms', '50', '--widths', '390', '--only', 'overflow', '--out', tmp(), ...extra])
      let err = ''
      child.stderr.on('data', (d) => (err += d))
      child.stdout.on('data', () => {})
      child.on('close', (status) => resolve({ status, err }))
    })
  const cached = await run([])
  assert.match(cached.err, /source cache: 0 source reading\(s\) reused, \d+ measured live/)
  assert.ok(entries(path.join(dossier, 'source-cache')).length > 0)
  const again = await run([])
  assert.match(again.err, /source cache: [1-9]\d* source reading\(s\) reused, 0 measured live/)
  assert.match((await run(['--no-source-cache'])).err, /bypassed \(--no-source-cache\)/)
  assert.match((await run(['--reload'])).err, /bypassed \(--reload\)/)
})


test('synthetic: a response header that changes rendering misses; the revalidation replays the browser\'s request; an answer is never kept for a later reading', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  const only = ['overflow', 'heights']
  const cache = createSourceCache({ dir })
  const cold = await sweep(f, { cache, only })
  let seen = cache.cells.length
  // the cells one sweep added to the shared cache object
  const added = () => {
    const out = cache.cells.slice(seen)
    seen = cache.cells.length
    return out
  }
  added()
  // every plain cell is recorded per width, not once per sequence
  assert.deepEqual(cells(cold, 'live').filter((c) => c.kind === 'plain').map((c) => c.width).sort((a, b) => a - b), [390, 1024])
  const browserDoc = f.source.seen.find((x) => x.url === '/a').headers
  f.source.seen.length = 0
  // the SAME cache object checks again: nothing finished is remembered
  await sweep(f, { cache, only })
  assert.equal(added().filter((c) => c.from === 'live').length, 0)
  const check = f.source.seen.find((x) => x.url === '/a')
  assert.ok(check, 'the page was fetched again to check it')
  // no header of the browser's request is lost, added or changed (accept-encoding with its q-values included), bar the hop-by-hop ones
  const own = new Set(['host', 'connection', 'content-length', 'keep-alive', 'transfer-encoding', 'upgrade', 'te'])
  const names = (h) => Object.keys(h).filter((k) => !own.has(k)).sort()
  assert.deepEqual(names(check.headers), names(browserDoc))
  for (const k of names(browserDoc)) assert.equal(check.headers[k], browserDoc[k], k)
  // same bytes, a new policy header: the reading is taken again
  f.source.routes['/a'] = { ...f.source.routes['/a'], headers: { 'content-security-policy': "style-src 'none'" } }
  await sweep(f, { cache, only })
  const live1 = added().filter((c) => c.from === 'live')
  assert.ok(live1.length > 0 && live1.every((c) => /the source changed: .*\/a/.test(c.why)), JSON.stringify(live1))
  // the stylesheet changes between two sweeps of one cache object: the second sweep sees it
  f.source.routes['/site.css'] = { ...f.source.routes['/site.css'], body: 'main{padding:60px}' }
  await sweep(f, { cache, only })
  const live2 = added().filter((c) => c.from === 'live')
  assert.ok(live2.length > 0 && live2.every((c) => /site\.css/.test(c.why)), JSON.stringify(live2))
})


test('synthetic: a changed Set-Cookie, with the same body and the same other headers, misses', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  const only = ['overflow']
  f.source.routes['/a'] = { ...f.source.routes['/a'], headers: { 'set-cookie': 'visit=one; Path=/' } }
  await sweep(f, { cache: createSourceCache({ dir }), only })
  assert.equal(cells(await sweep(f, { cache: createSourceCache({ dir }), only }), 'live').length, 0)
  f.source.routes['/a'] = { ...f.source.routes['/a'], headers: { 'set-cookie': 'visit=two; Path=/' } }
  const live = cells(await sweep(f, { cache: createSourceCache({ dir }), only }), 'live')
  assert.ok(live.length > 0 && live.every((c) => /the source changed: .*\/a/.test(c.why)), JSON.stringify(live))
})


test('synthetic: any response header a page could read misses when it changes (a custom header, Link); the clock and the hop-by-hop headers are not compared only where nothing in the response can depend on them', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  const only = ['overflow']
  const set = (build, link) => {
    f.source.routes['/a'] = { ...f.source.routes['/a'], headers: { 'x-build': build, link } }
  }
  set('one', '</site.css>; rel=preload; as=style')
  await sweep(f, { cache: createSourceCache({ dir }), only })
  // no cookie deadline, no freshness header, no script read: `date` differs on every answer and is not compared, so an unchanged source is reused
  const same = await sweep(f, { cache: createSourceCache({ dir }), only })
  assert.equal(cells(same, 'live').length, 0, JSON.stringify(cells(same, 'live')))
  // same body, new header: a script can show it, so the reading is taken again
  set('two', '</site.css>; rel=preload; as=style')
  const build = cells(await sweep(f, { cache: createSourceCache({ dir }), only }), 'live')
  assert.ok(build.length > 0 && build.every((c) => /the source changed: .*\/a/.test(c.why)), JSON.stringify(build))
  // same body, new Link
  set('two', '</site.css>; rel=prefetch')
  const link = cells(await sweep(f, { cache: createSourceCache({ dir }), only }), 'live')
  assert.ok(link.length > 0 && link.every((c) => /the source changed: .*\/a/.test(c.why)), JSON.stringify(link))
})

test('synthetic: a header that changes on every answer and drives what the page renders is never cached; each sweep reads the page as it is then', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  // the cookie set with each answer is read by the page, which draws a box as wide as its number says
  let n = 0
  f.source.routes['/a'] = {
    ...page(body, { script: "const m = /n=(\\d+)/.exec(document.cookie); const d = document.createElement('div'); d.style.cssText = 'height:10px;width:' + (m ? Number(m[1]) * 200 : 0) + 'px'; document.body.appendChild(d)" }),
    headers: () => ({ 'set-cookie': `n=${++n}; Path=/` })
  }
  const over = async () => {
    const r = await sweep(f, { cache: createSourceCache({ dir }), only: ['overflow'], widths: [390] })
    return { r, source: r.rows.map((x) => x.source.over) }
  }
  const first = await over()
  const second = await over()
  for (const x of [first, second]) {
    assert.equal(cells(x.r, 'cache').length, 0)
    assert.match(cells(x.r, 'live')[0].why, /not stored: .*set-cookie|not stored: .*answered differently|not stored: .*changed between two answers/)
  }
  assert.equal(entries(dir).length, 0)
  assert.notDeepEqual(second.source, first.source, 'the second sweep saw the page as the second answer drew it')
})


test('synthetic: Chromium shows a page the transport headers too, so none is exempt by assumption (this is the evidence the exemption is gated on observation)', async () => {
  const f = await fixture(['/a'])
  const b = await browser.get()
  const ctx = await b.newContext()
  try {
    const pg = await ctx.newPage()
    await pg.goto(new URL('/a', f.source.origin).href)
    const names = await pg.evaluate(async () => {
      const n = []
      ;(await fetch('/a')).headers.forEach((v, k) => n.push(k))
      return n
    })
    for (const h of ['date', 'connection', 'keep-alive', 'transfer-encoding']) assert.ok(names.includes(h), `${h} is visible to a page`)
  } finally {
    await ctx.close()
  }
})

test('synthetic: a page that walks all the headers of a response observes the transport ones: they are compared, and a Date that differs between answers keeps the reading out of the cache', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  let n = 0
  f.source.routes['/clock'] = { type: 'text/plain', body: 'tick', headers: () => ({ date: new Date(1.7e12 + ++n * 86400000).toUTCString() }) }
  f.source.routes['/a'] = page(body, { script: "const x = new XMLHttpRequest(); x.open('GET', '/clock', false); x.send(); document.title = x.getAllResponseHeaders().length" })
  for (let i = 0; i < 2; i++) {
    const r = await sweep(f, { cache: createSourceCache({ dir }), only: ['overflow'], widths: [390] })
    assert.equal(cells(r, 'cache').length, 0)
    assert.match(cells(r, 'live')[0].why, /not stored: .*(Date\/Age|changed between two answers)/)
  }
  assert.equal(entries(dir).length, 0)
})

test('synthetic: a page that reads the date of a response is rendered by it; the reading is then never stored (a page that never reads it keeps hitting)', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  const only = ['overflow']
  let date = 'Mon, 01 Jan 2024 00:00:00 GMT'
  // every answer carries a fixed date, so only the page's own reading of the clock response decides
  const fixed = (r) => ({ ...r, headers: () => ({ date: 'Mon, 01 Jan 2024 00:00:00 GMT' }) })
  f.source.routes['/site.css'] = fixed(f.source.routes['/site.css'])
  f.source.routes['/clock'] = { type: 'text/plain', body: 'tick', headers: () => ({ date }) }
  // the page draws a box as wide as the day of the month its clock response says (a synchronous request: the box is there at load)
  f.source.routes['/a'] = fixed(page(body, { script: "const x = new XMLHttpRequest(); x.open('GET', '/clock', false); x.send(); const d = document.createElement('div'); d.style.cssText = 'height:10px;width:' + new Date(x.getResponseHeader('date')).getUTCDate() * 100 + 'px'; document.body.appendChild(d)" }))
  const over = async () => {
    const r = await sweep(f, { cache: createSourceCache({ dir }), only, widths: [390] })
    return { live: cells(r, 'live'), cached: cells(r, 'cache'), over: r.rows.find((x) => x.route === '/a').source.over }
  }
  const one = await over()
  assert.equal(one.over, 0)
  assert.equal(entries(dir).length, 0, 'the page read the clock: the reading is not stored, whatever the values')
  const again = await over()
  assert.equal(again.cached.length, 0)
  assert.ok(again.live.length > 0 && again.live.some((c) => /Date\/Age/.test(c.why)), JSON.stringify(again.live))
  assert.equal(again.over, 0)
  date = 'Fri, 05 Jan 2024 00:00:00 GMT'
  const changed = await over()
  assert.equal(changed.cached.length, 0)
  assert.ok(changed.over > 0, 'the new reading is the page as the new clock draws it')
})

test('synthetic: Date moving past a byte-identical Set-Cookie Expires deadline is not reused: the second sweep is taken live and reports the changed content', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  const only = ['overflow']
  const cookie = 'visit=one; Path=/; Expires=Mon, 01 Jan 2024 00:00:10 GMT'
  let date = 'Mon, 01 Jan 2024 00:00:00 GMT'
  // the page draws a box as wide as its cookie says: 100px while the cookie lives (Date is 10 s before the deadline), 700px once it is gone
  f.source.routes['/a'] = page(body, { script: "const d = document.createElement('div'); d.style.cssText = 'height:10px;width:' + (document.cookie.includes('visit=one') ? 100 : 700) + 'px'; document.body.appendChild(d)" })
  f.source.routes['/a'].headers = () => ({ 'set-cookie': cookie, date })
  const over = async () => {
    const r = await sweep(f, { cache: createSourceCache({ dir }), only, widths: [390] })
    return { live: cells(r, 'live'), cached: cells(r, 'cache'), over: r.rows.find((x) => x.route === '/a').source.over }
  }
  const one = await over()
  assert.equal(one.over, 0, 'the cookie is alive: the box fits')
  assert.equal(entries(dir).length, 0, 'a reading that depends on the clock is not stored')
  date = 'Mon, 01 Jan 2024 00:00:20 GMT'
  const two = await over()
  assert.equal(two.cached.length, 0)
  assert.ok(two.live.length > 0)
  assert.ok(two.over > 0, 'the cookie is past its deadline: the page is drawn wider')
})

test('synthetic: a response with a freshness header (Cache-Control, ETag, Last-Modified, Expires, Age) is never stored, even when Date is byte-identical', async () => {
  for (const headers of [{ 'cache-control': 'max-age=60' }, { etag: '"x"' }, { 'last-modified': 'Mon, 01 Jan 2024 00:00:00 GMT' }, { expires: 'Tue, 02 Jan 2024 00:00:00 GMT' }, { age: '5' }]) {
    const f = await fixture(['/a'])
    const dir = path.join(tmp(), 'source-cache')
    f.source.routes['/a'] = { ...f.source.routes['/a'], headers: { ...headers, date: 'Mon, 01 Jan 2024 00:00:00 GMT' } }
    await sweep(f, { cache: createSourceCache({ dir }), only: ['overflow'] })
    assert.equal(entries(dir).length, 0, JSON.stringify(headers))
    const again = await sweep(f, { cache: createSourceCache({ dir }), only: ['overflow'] })
    assert.equal(cells(again, 'cache').length, 0, JSON.stringify(headers))
  }
})

test('synthetic: a response with no cookie deadline, no freshness header and no script read of Date is still reused', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  f.source.routes['/a'] = { ...f.source.routes['/a'], headers: { 'set-cookie': 'visit=one; Path=/; Max-Age=60' } }
  await sweep(f, { cache: createSourceCache({ dir }), only: ['overflow'] })
  const again = await sweep(f, { cache: createSourceCache({ dir }), only: ['overflow'] })
  assert.equal(cells(again, 'live').length, 0, JSON.stringify(cells(again, 'live')))
  assert.ok(cells(again, 'cache').length > 0)
})

test('synthetic: an entry stored under the previous probe version is not reused', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  await sweep(f, { cache: createSourceCache({ dir, probeVersion: PROBE_VERSION - 1 }), only: ['overflow'] })
  const again = await sweep(f, { cache: createSourceCache({ dir }), only: ['overflow'] })
  assert.equal(cells(again, 'cache').length, 0)
  assert.ok(cells(again, 'live').length > 0)
})

test('synthetic: a reading stored under one source fingerprint is not reused under another, and is reused under the same one', async () => {
  const f = await fixture(['/a'])
  const dir = path.join(tmp(), 'source-cache')
  await sweep(f, { cache: createSourceCache({ dir, sourceId: 'fingerprint-one' }), only: ['overflow'] })
  const other = await sweep(f, { cache: createSourceCache({ dir, sourceId: 'fingerprint-two' }), only: ['overflow'] })
  assert.equal(cells(other, 'cache').length, 0)
  assert.ok(cells(other, 'live').length > 0)
  const same = await sweep(f, { cache: createSourceCache({ dir, sourceId: 'fingerprint-two' }), only: ['overflow'] })
  assert.ok(cells(same, 'cache').length > 0)
})
