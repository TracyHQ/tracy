// http-parity --source-snapshot reads the source page from the rendered HTML that from-html
// already wrote (spec/reference/rendered/<slug>--1440-light.html) instead of rendering it again.
// The fixture source serves a SKELETON whose text is written by script, so a plain fetch sees
// nothing: a route that passes proves its source came from the snapshot (or from a real render).
//
// Three contracts: a route with a snapshot never opens a browser; a route without one, or whose
// static source is newer than its snapshot, is rendered and says so in the report; a second
// run with --cache serves every unchanged route from the cache and says so.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const CONTENT = '<h1>Hello wide world</h1><p>one two three four five six</p>'
const source = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  const slug = decodeURIComponent(req.url).replace(/^\/|\.html$/g, '').replace(/\s+/g, '-').toLowerCase()
  res.end(`<!doctype html><html><body><main id="app"></main><script>document.getElementById('app').innerHTML=${JSON.stringify(CONTENT + `<p>this is page ${slug} of the site</p>`)}</script></body></html>`)
})
const target = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(`<!doctype html><html><body><main>${CONTENT}<p>this is page ${req.url.replace(/^\/|\/$/g, '')} of the site</p></main></body></html>`)
})
const listening = [once(source, 'listening'), once(target, 'listening')]
source.listen(0, '127.0.0.1')
target.listen(0, '127.0.0.1')
await Promise.all(listening)
const S = `http://127.0.0.1:${source.address().port}`
const T = `http://127.0.0.1:${target.address().port}`

const scratch = mkdtempSync(join(tmpdir(), 'parity-snap-'))
const spec = join(scratch, 'spec')
mkdirSync(join(spec, 'reference', 'rendered'), { recursive: true })
mkdirSync(join(spec, 'reference', 'static'), { recursive: true })
const page = (name, slug) => ({
  page: `${name}.html`,
  path: `reference/rendered/${slug}--1440-light.html`,
  static: `reference/static/${name}.html`
})
writeFileSync(
  join(spec, 'reference.json'),
  JSON.stringify({ kind: 'html', pages: [page('About', 'about'), page('Project detail', 'project-detail')] })
)
for (const [name, slug] of [['About', 'about'], ['Project detail', 'project-detail']]) {
  writeFileSync(join(spec, 'reference', 'static', `${name}.html`), '<main id="app"></main>')
  writeFileSync(
    join(spec, 'reference', 'rendered', `${slug}--1440-light.html`),
    `<html><body><main>${CONTENT}<p>this is page ${slug} of the site</p></main></body></html>`
  )
}
// Stale on purpose: the static source of Project detail is newer than its snapshot.
const future = new Date(Date.now() + 60_000)
utimesSync(join(spec, 'reference', 'static', 'Project detail.html'), future, future)
const pairs = join(scratch, 'pairs.json')
writeFileSync(
  pairs,
  JSON.stringify({
    rules: [
      { from: '/About.html', to: '/about' },
      { from: '/Project detail.html', to: '/project-detail' },
      { from: '/Contact.html', to: '/contact' }
    ]
  })
)
test.after(async () => {
  source.close()
  target.close()
  await Promise.all([once(source, 'close'), once(target, 'close')])
  rmSync(scratch, { recursive: true, force: true })
})

async function run(...extra) {
  const out = join(scratch, `report-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  const child = spawn(process.execPath, [
    new URL('../http-parity.mjs', import.meta.url).pathname,
    '--source', S, '--target', T,
    '--routes', '/About.html,/Project detail.html,/Contact.html',
    '--pairs', pairs, '--out', out, ...extra
  ])
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const [code] = await once(child, 'close')
  return { code, output, report: JSON.parse(readFileSync(out, 'utf8')) }
}

test('without a snapshot a plain fetch of the skeleton source sees no runs (the fixture is honest)', async () => {
  const r = await run()
  assert.ok(r.report.routes.every((x) => x.sourceFrom === 'fetch' && x.sourceRuns === 0), r.output)
})

test('--source-snapshot: snapshot routes pass without rendering; missing and stale ones are rendered and noted', async () => {
  const r = await run('--source-snapshot', spec)
  assert.equal(r.code, 0, r.output)
  const by = Object.fromEntries(r.report.routes.map((x) => [x.route, x]))
  assert.equal(by['/About.html'].sourceFrom, 'snapshot')
  assert.deepEqual(by['/About.html'].notes, [])
  assert.equal(by['/Project detail.html'].sourceFrom, 'render')
  assert.deepEqual(by['/Project detail.html'].notes, ['snapshot stale'])
  assert.equal(by['/Contact.html'].sourceFrom, 'render')
  assert.deepEqual(by['/Contact.html'].notes, ['no snapshot'])
  assert.ok(r.report.routes.every((x) => x.ok && x.sourceRuns === 3 && x.cached === false), JSON.stringify(r.report.routes))
  // log lines keep the serial order of --routes whatever finished first
  const lines = r.output.split('\n').filter((l) => /^(ok|FAIL)/.test(l))
  assert.deepEqual(lines.map((l) => l.split(/\s+/)[2]), ['/About.html', '/Project', '/Contact.html'])
  assert.match(r.output, /http-parity: 3 routes, 3 ok, 0 failing, cached 0\/3, source snapshot 1 · rendered 2/)
})

test('--cache: the second run serves unchanged routes from the cache and says so; --no-cache does not', async () => {
  const cache = join(scratch, 'cache')
  const first = await run('--source-snapshot', spec, '--cache', cache)
  assert.equal(first.code, 0, first.output)
  assert.ok(first.report.routes.every((x) => x.cached === false))
  const second = await run('--source-snapshot', spec, '--cache', cache)
  assert.equal(second.code, 0, second.output)
  assert.ok(second.report.routes.every((x) => x.cached === true), JSON.stringify(second.report.routes))
  assert.match(second.output, /cached 3\/3/)
  assert.equal(second.report.summary.cached, 3)
  // the cached entry is the same verdict, route by route
  const strip = ({ cached, ...rest }) => rest
  assert.deepEqual(second.report.routes.map(strip), first.report.routes.map(strip))
  const third = await run('--source-snapshot', spec, '--cache', cache, '--no-cache')
  assert.ok(third.report.routes.every((x) => x.cached === false))
})
