// verify.mjs end to end on a fixture: a static "source" and a "target" that carry the same copy,
// a spec dir with page-map.json and a rendered snapshot, a review config. --fast must run the
// three real tools on one browser each, read their JSON back, and write verify.json + verify.log;
// a phase that overruns --timeout is killed and named, not waited for.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const COPY = '<h1>Steel frames for industry</h1><p>We design and build industrial halls since 2004</p>'
const html = (body) =>
  `<!doctype html><html data-theme="light"><head><style>body{background:#fff;color:#000}html[data-theme=dark] body{background:rgb(20,20,20);color:rgb(240,240,240)}</style></head><body><header class="hd"><p>Header of the fixture</p></header><main>${body}${'<p>Visible content of the page</p>'.repeat(20)}</main></body></html>`
const source = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(html('<main id="app"></main>'))
})
const target = createServer((req, res) => {
  if (req.url.startsWith('/404')) {
    res.writeHead(404, { 'content-type': 'text/html' })
    return res.end(html(COPY))
  }
  res.writeHead(200, { 'content-type': 'text/html' })
  res.end(html(COPY))
})
const listening = [once(source, 'listening'), once(target, 'listening')]
source.listen(0, '127.0.0.1')
target.listen(0, '127.0.0.1')
await Promise.all(listening)
const S = `http://127.0.0.1:${source.address().port}`
const T = `http://127.0.0.1:${target.address().port}`

const scratch = mkdtempSync(join(tmpdir(), 'verify-e2e-'))
const spec = join(scratch, 'spec')
mkdirSync(join(spec, 'reference', 'rendered'), { recursive: true })
mkdirSync(join(spec, 'reference', 'static'), { recursive: true })
writeFileSync(
  join(spec, 'page-map.json'),
  JSON.stringify({
    defaultLocale: 'en',
    pages: [
      { file: 'Home.html', path: '/', view: 'front-page', locale: 'en' },
      { file: 'About.html', path: '/about', view: 'page', locale: 'en' },
      { file: '404.html', path: '/404', view: '404', locale: 'en' }
    ]
  })
)
// As from-html writes it: kind "html", each page with the static file it was rendered from — the
// provenance that lets http-parity check the 404 file's declared status on the target alone.
writeFileSync(
  join(spec, 'reference.json'),
  JSON.stringify({
    kind: 'html',
    pages: [
      { page: 'Home.html', path: 'reference/rendered/home--1440-light.html', static: 'reference/static/Home.html' },
      { page: 'About.html', path: 'reference/rendered/about--1440-light.html', static: 'reference/static/About.html' },
      { page: '404.html', path: 'reference/rendered/404--1440-light.html', static: 'reference/static/404.html' }
    ]
  })
)
for (const file of ['Home.html', 'About.html', '404.html']) writeFileSync(join(spec, 'reference', 'static', file), html(COPY))
for (const slug of ['home', 'about', '404']) writeFileSync(join(spec, 'reference', 'rendered', `${slug}--1440-light.html`), html(COPY))
const pairs = join(scratch, 'pairs.json')
writeFileSync(pairs, JSON.stringify({ rules: [{ from: '/Home.html', to: '/' }, { from: '/About.html', to: '/about' }, { from: '/404.html', to: '/404', status: 404 }] }))
const config = join(scratch, 'review.config.json')
writeFileSync(config, JSON.stringify({ hook: { type: 'attribute', name: 'data-theme' }, toggle: '.t', persistence: { type: 'cookie', key: 'theme' }, expectedSelectors: ['.hd', 'main'] }))
test.after(async () => {
  source.close()
  target.close()
  await Promise.all([once(source, 'close'), once(target, 'close')])
  rmSync(scratch, { recursive: true, force: true })
})

async function run(evidence, ...extra) {
  const child = spawn(process.execPath, [
    new URL('../verify.mjs', import.meta.url).pathname,
    '--source', S, '--target', T, '--spec', spec, '--pairs', pairs, '--config', config, '--evidence', evidence, ...extra
  ])
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const [code] = await once(child, 'close')
  return { code, output }
}

test('verify --fast on the fixture: three green phases, verify.json and verify.log, shots on disk', async () => {
  const evidence = join(scratch, 'ev1')
  const r = await run(evidence, '--fast', '--concurrency', '3')
  assert.equal(r.code, 0, r.output)
  const j = JSON.parse(readFileSync(join(evidence, 'verify.json'), 'utf8'))
  assert.equal(j.ok, true)
  assert.deepEqual(j.phases.map((p) => `${p.mode}:${p.phase}:${p.ok}`), ['fast:parity:true', 'fast:scan:true', 'fast:shoot:true'])
  assert.equal(j.results.fast.parity.summary.routes, 3)
  assert.equal(j.results.fast.parity.summary.sourceSnapshot, 3)
  assert.equal(j.results.fast.scan.summary.total, 4, '2 routes × leak+contrast; the 404 is not scanned')
  assert.deepEqual(j.results.fast.shoot.summary, { shots: 6, bad: 0 }, '3 routes × 1 viewport × 2 themes; the 404 answers 404 by contract')
  assert.ok(existsSync(join(evidence, 'fast', 'shots', '404__1440__dark.png')))
  const log = readFileSync(join(evidence, 'verify.log'), 'utf8')
  assert.match(log, /--> fast parity: node .*http-parity\.mjs/)
  assert.match(log, /http-parity: 3 routes, 3 ok/)
  assert.match(log, /verify: fast is green/)
  assert.match(r.output, /verify: OK in [\d.]+s/)
})

test('verify: a phase past --timeout is killed and named; the run is red and full never starts', async () => {
  const evidence = join(scratch, 'ev2')
  const r = await run(evidence, '--both', '--timeout', '0.001')
  assert.equal(r.code, 1)
  const j = JSON.parse(readFileSync(join(evidence, 'verify.json'), 'utf8'))
  assert.equal(j.ok, false)
  assert.equal(j.phases.length, 3, 'fast ran its three phases, full did not start')
  assert.equal(j.phases[0].exit, 124)
  assert.match(j.results.fast.parity.failing[0].error, /parity timed out after 0.001 min/)
  assert.match(r.output, /fast is RED — full matrix not run/)
})
