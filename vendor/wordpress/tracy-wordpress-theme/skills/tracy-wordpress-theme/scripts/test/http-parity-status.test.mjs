// http-parity judges two answers other than 200 as answers, not as broken pages:
//   - a route whose pair declares a status (the port's 404 page) passes when the source gives it too;
//   - a source that redirects is read as that redirect — by a plain fetch AND through the browser
//     that --source-snapshot falls back to — and passes when the target redirects to where the
//     source's redirect lands, mapped through the pairs.
// And the real breaks next to them still fail: a declared 404 the target serves as a page, a page
// the target answers 404, a redirect to somewhere else, a declared redirect the target serves.
// A page-map declares the 404 page by its view (`{ path: "/404", view: "404" }`, issue #7 item 1):
// read from --routes, it passes the same way a pair's status does; a status the pair declares wins.
// The source must give the declared answer too: a source serving a page there fails, and a saved
// snapshot (which keeps no status) is not used for such a route — it is rendered live. A static
// export's error page has no status of its own, so its declared 4xx is the target's alone — but only
// when a from-html reference.json names its static file; a path ending in .html proves nothing.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'

const PAGE = (words) => `<!doctype html><html><body><main><h1>${words}</h1><p>one two three four five six seven</p></main></body></html>`
const serve = (routes) =>
  createServer((req, res) => {
    const r = routes[req.url] ?? [404, PAGE('Nothing at this address')]
    res.writeHead(r[0], { 'content-type': 'text/html', ...(r[2] ? { location: r[2] } : {}) })
    res.end(r[1])
  })
const source = serve({
  '/gone': [404, PAGE('Nothing at this address')],
  '/gone-2': [404, PAGE('Nothing at this address')],
  '/real': [200, PAGE('A real page')],
  '/account': [303, '', '/login'],
  '/account-2': [303, '', '/login'],
  '/account-3': [303, '', '/login'],
  '/login': [200, PAGE('Sign in to the site')],
  '/pm-404': [404, PAGE('Nothing at this address')],
  '/pm-404-served': [404, PAGE('Nothing at this address')],
  '/pm-404-empty': [404, PAGE('Nothing at this address')],
  '/pm-both': [410, PAGE('Gone for good now')],
  '/pm-real': [200, PAGE('A real page')],
  '/pm-404-source-page': [200, PAGE('Nothing at this address')],
  '/err.html': [200, PAGE('Nothing at this address')],
  '/err-2.html': [200, PAGE('Nothing at this address')],
  '/live.html': [200, PAGE('Nothing at this address')],
  '/err-303.html': [200, PAGE('Sign in to the site')]
})
const target = serve({
  '/gone-wp': [404, PAGE('Nothing at this address')],
  '/gone-2-wp': [200, PAGE('Nothing at this address')],
  '/real-wp': [404, PAGE('Nothing at this address')],
  '/account-wp': [303, '', '/login-wp/'],
  '/account-2-wp': [303, '', '/elsewhere/'],
  '/account-3-wp': [200, PAGE('Some other page entirely')],
  '/login-wp': [301, '', '/login-wp/'],
  '/login-wp/': [200, PAGE('Sign in to the site')],
  '/pm-404': [404, PAGE('Nothing at this address')],
  '/pm-404-served': [200, PAGE('Nothing at this address')],
  '/pm-404-empty': [404, '<!doctype html><html><body><main><h1>Oops</h1></main></body></html>'],
  '/pm-both-wp': [410, PAGE('Gone for good now')],
  '/pm-real': [404, PAGE('Nothing at this address')],
  '/pm-404-source-page': [404, PAGE('Nothing at this address')]
})
const listening = [once(source, 'listening'), once(target, 'listening')]
source.listen(0, '127.0.0.1')
target.listen(0, '127.0.0.1')
await Promise.all(listening)
const S = `http://127.0.0.1:${source.address().port}`
const T = `http://127.0.0.1:${target.address().port}`

const scratch = mkdtempSync(join(tmpdir(), 'parity-status-'))
const pairs = join(scratch, 'pairs.json')
writeFileSync(
  pairs,
  JSON.stringify({
    rules: [
      { from: '/gone', to: '/gone-wp', status: 404 },
      { from: '/gone-2', to: '/gone-2-wp', status: 404 },
      { from: '/real', to: '/real-wp' },
      { from: '/account', to: '/account-wp', status: 303 },
      { from: '/account-2', to: '/account-2-wp', status: 303 },
      { from: '/account-3', to: '/account-3-wp', status: 303 },
      { from: '/login', to: '/login-wp' }
    ]
  })
)
const pageMap = join(scratch, 'page-map.json')
writeFileSync(
  pageMap,
  JSON.stringify({
    pages: [
      { file: '404.html', view: '404', path: '/pm-404', synthetic: true },
      { file: '404.html', view: '404', path: '/pm-404-served' },
      { file: '404.html', view: '404', path: '/pm-404-empty' },
      { file: '404.html', view: '404', path: '/pm-both' },
      { file: 'page.html', view: 'page', path: '/pm-real' },
      { file: '404.html', view: '404', path: '/pm-404-source-page' }
    ]
  })
)
const pmPairs = join(scratch, 'pm-pairs.json')
writeFileSync(pmPairs, JSON.stringify({ rules: [{ from: '/pm-both', to: '/pm-both-wp', status: 410 }] }))
// A from-html source: its error page is a file, and a file answers 200 whatever it holds. `/live.html`
// is a live route that happens to end in .html, and `/err-303.html` declares a redirect a file cannot give.
const filePairs = join(scratch, 'file-pairs.json')
writeFileSync(
  filePairs,
  JSON.stringify({
    rules: [
      { from: '/err.html', to: '/pm-404', status: 404 },
      { from: '/err-2.html', to: '/pm-404-served', status: 404 },
      { from: '/live.html', to: '/pm-404', status: 404 },
      { from: '/err-303.html', to: '/account-wp', status: 303 }
    ]
  })
)
// The from-html spec that vouches for the export: reference.json of kind "html", each page with the
// static file it was rendered from. `/live.html` is not in it.
const htmlSpec = join(scratch, 'html-spec')
mkdirSync(join(htmlSpec, 'static'), { recursive: true })
mkdirSync(join(htmlSpec, 'rendered'))
const exportPages = { 'err.html': PAGE('Nothing at this address'), 'err-2.html': PAGE('Nothing at this address'), 'err-303.html': PAGE('Sign in to the site') }
for (const [name, html] of Object.entries(exportPages)) {
  writeFileSync(join(htmlSpec, 'static', name), html)
  writeFileSync(join(htmlSpec, 'rendered', name), html)
}
writeFileSync(
  join(htmlSpec, 'reference.json'),
  JSON.stringify({
    kind: 'html',
    pages: Object.keys(exportPages).map((name) => ({ page: name, path: `rendered/${name}`, static: `static/${name}`, staticSha256: createHash('sha256').update(exportPages[name]).digest('hex') }))
  })
)
// A spec whose reference.json names no rendered file: every source route goes through the browser,
// as it does for a from-joomla spec pack.
const spec = join(scratch, 'spec')
mkdirSync(spec)
writeFileSync(join(spec, 'reference.json'), JSON.stringify({ kind: 'url', pages: [{ page: 'account.html', url: `${S}/account` }] }))
// A rendered snapshot dir holding the 404 page as a saved page: the file keeps the words, not the 404.
const rendered = join(scratch, 'rendered')
mkdirSync(rendered)
writeFileSync(join(rendered, 'pm-404--1440-light.html'), PAGE('Nothing at this address'))
writeFileSync(join(rendered, 'pm-404-source-page--1440-light.html'), PAGE('Nothing at this address'))
writeFileSync(join(rendered, 'pm-real--1440-light.html'), PAGE('A real page'))
test.after(async () => {
  source.close()
  target.close()
  await Promise.all([once(source, 'close'), once(target, 'close')])
  rmSync(scratch, { recursive: true, force: true })
})

const run = (...extra) => runWith(['--routes', '/gone,/gone-2,/real,/account,/account-2,/account-3,/login', '--pairs', pairs, ...extra])
async function runWith(extra) {
  const out = join(scratch, `report-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  const child = spawn(process.execPath, [new URL('../http-parity.mjs', import.meta.url).pathname, '--source', S, '--target', T, '--out', out, ...extra])
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const [code] = await once(child, 'close')
  return { code, output, by: Object.fromEntries(JSON.parse(readFileSync(out, 'utf8')).routes.map((x) => [x.route, x])) }
}

const judged = (by) => Object.fromEntries(Object.entries(by).map(([k, v]) => [k, v.ok]))
const EXPECTED = { '/gone': true, '/gone-2': false, '/real': false, '/account': true, '/account-2': false, '/account-3': false, '/login': true }

test('plain fetch: a shared 404 and a matching redirect pass; the breaks beside them fail', async () => {
  const r = await run()
  assert.equal(r.code, 1, r.output)
  assert.deepEqual(judged(r.by), EXPECTED, r.output)
  assert.equal(r.by['/account'].sourceRedirect.ok, true)
  assert.equal(r.by['/account-2'].sourceRedirect.ok, false)
  assert.equal(r.by['/account-2'].sourceRedirect.expected, '/login-wp')
})

test('through the browser (--source-snapshot, no rendered file): the source redirect is read as the redirect', async () => {
  const r = await run('--source-snapshot', spec)
  assert.equal(r.code, 1, r.output)
  assert.deepEqual(judged(r.by), EXPECTED, r.output)
  assert.equal(r.by['/account'].sourceFrom, 'render')
  assert.equal(r.by['/account'].sourceStatus, 303)
  assert.equal(r.by['/account'].sourceRuns, 0, 'the login page it leads to is not read as the account page')
})

test('page-map --routes: a view "404" page passes on a shared 404; a 404 served as a page, lost copy or an unexpected 404 fail; a pair status wins', async () => {
  const r = await runWith(['--routes', pageMap, '--pairs', pmPairs])
  assert.equal(r.code, 1, r.output)
  assert.deepEqual(judged(r.by), { '/pm-404': true, '/pm-404-served': false, '/pm-404-empty': false, '/pm-both': true, '/pm-real': false, '/pm-404-source-page': false }, r.output)
  assert.equal(r.by['/pm-404-source-page'].sourceStatus, 200, 'a source serving a page where the 404 is declared is no error page')
  assert.equal(r.by['/pm-404'].targetStatus, 404)
  assert.deepEqual(r.by['/pm-404-empty'].missing, ['Nothing at this address', 'one two three four five six seven'])
})

test('--source-snapshot: a route declared 404 is rendered live, so the source status is measured, not assumed 200', async () => {
  const r = await runWith(['--routes', pageMap, '--pairs', pmPairs, '--source-snapshot', rendered])
  assert.equal(r.code, 1, r.output)
  assert.equal(r.by['/pm-404'].ok, true, r.output)
  assert.equal(r.by['/pm-404'].sourceFrom, 'render')
  assert.equal(r.by['/pm-404'].sourceStatus, 404)
  assert.deepEqual(r.by['/pm-404'].notes, ['declared 404: rendered live'])
  assert.equal(r.by['/pm-404-source-page'].ok, false, 'the live source answers 200 there')
  assert.equal(r.by['/pm-404-source-page'].sourceStatus, 200)
  assert.equal(r.by['/pm-real'].sourceFrom, 'snapshot', 'a page with no declared answer still comes from the snapshot')
})

test('a static export (from-html reference.json names the file) answers 200 whatever it holds: a declared 404 is checked on the target alone, and noted', async () => {
  const r = await runWith(['--routes', '/err.html,/err-2.html,/live.html,/err-303.html', '--pairs', filePairs, '--source-snapshot', htmlSpec])
  assert.equal(r.code, 1, r.output)
  assert.deepEqual(judged(r.by), { '/err.html': true, '/err-2.html': false, '/live.html': false, '/err-303.html': false }, r.output)
  assert.equal(r.by['/err.html'].sourceFrom, 'snapshot')
  assert.deepEqual(r.by['/err.html'].notes, ['static file: 404 checked on the target'])
  assert.equal(r.by['/err-2.html'].targetStatus, 200, 'the target serving the 404 page as a page still fails')
  assert.equal(r.by['/live.html'].sourceStatus, 200, 'no snapshot vouches for it: a live route serving a page is no error page')
  assert.equal(r.by['/err-303.html'].sourceFrom, 'render', 'a declared redirect is measured live, never met by a file')
  assert.equal(r.by['/err-303.html'].sourceStatus, 200)
})

test('a route ending in .html without that provenance is live: declared 404 or 303, a source answering 200 fails', async () => {
  const r = await runWith(['--routes', '/err.html,/live.html,/err-303.html', '--pairs', filePairs])
  assert.equal(r.code, 1, r.output)
  assert.deepEqual(judged(r.by), { '/err.html': false, '/live.html': false, '/err-303.html': false }, r.output)
  for (const k of ['/err.html', '/live.html', '/err-303.html']) {
    assert.equal(r.by[k].sourceStatus, 200)
    assert.deepEqual(r.by[k].notes, [])
  }
})
