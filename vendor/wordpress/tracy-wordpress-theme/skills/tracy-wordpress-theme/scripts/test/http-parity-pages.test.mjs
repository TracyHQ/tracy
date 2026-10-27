// http-parity --pairs <page-map.json> and --pages: a page group measures only its own pages, and a
// source whose routes are files (`/About.html`) is mapped to the WordPress path by the page-map itself
// (no pairs.json), with a declared status kept. A listed page no route reaches exits 2.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const body = (slug) => `<!doctype html><html><body><main><h1>Page about ${slug}</h1><p>this is the page ${slug} of the site</p></main></body></html>`
const served = []
const source = createServer((req, res) => {
  served.push(req.url)
  const slug = decodeURIComponent(req.url).replace(/^\/|\.html$/g, '').toLowerCase()
  res.writeHead(slug === 'missing' ? 404 : 200, { 'content-type': 'text/html' }).end(body(slug))
})
const target = createServer((req, res) => {
  const slug = req.url.replace(/^\/|\/$/g, '')
  if (slug === 'missing') return res.writeHead(404, { 'content-type': 'text/html' }).end(body('missing'))
  res.writeHead(200, { 'content-type': 'text/html' }).end(body(slug))
})
source.listen(0, '127.0.0.1')
target.listen(0, '127.0.0.1')
await Promise.all([once(source, 'listening'), once(target, 'listening')])
const S = `http://127.0.0.1:${source.address().port}`
const T = `http://127.0.0.1:${target.address().port}`
const scratch = mkdtempSync(join(tmpdir(), 'parity-pages-'))
const pageMap = join(scratch, 'page-map.json')
writeFileSync(pageMap, JSON.stringify({ pages: [
  { file: 'About.html', path: '/about', view: 'page' },
  { file: 'Contact.html', path: '/contact', view: 'page' },
  { file: 'Missing.html', path: '/missing', view: '404' }
] }))
test.after(async () => {
  source.close()
  target.close()
  await Promise.all([once(source, 'close'), once(target, 'close')])
  rmSync(scratch, { recursive: true, force: true })
})

async function run(...extra) {
  const out = join(scratch, `r-${Math.random().toString(36).slice(2)}.json`)
  const child = spawn(process.execPath, [new URL('../http-parity.mjs', import.meta.url).pathname, '--source', S, '--target', T, '--routes', pageMap, '--pairs', pageMap, '--out', out, ...extra])
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const [code] = await once(child, 'close')
  let report = null
  try { report = JSON.parse(readFileSync(out, 'utf8')) } catch {}
  return { code, output, report }
}

test('--pairs page-map: source file routes land on the WordPress path; a declared 404 is kept', async () => {
  served.length = 0
  const r = await run()
  assert.equal(r.code, 0, r.output)
  assert.deepEqual(r.report.routes.map((x) => x.route), ['/About.html', '/Contact.html', '/Missing.html'])
  assert.ok(r.report.routes.every((x) => x.ok), r.output)
  assert.deepEqual(served.sort(), ['/About.html', '/Contact.html', '/Missing.html'])
})

test('--pages keeps only the listed WordPress paths and fetches only their source routes', async () => {
  served.length = 0
  const r = await run('--pages', '/contact,/missing')
  assert.equal(r.code, 0, r.output)
  assert.deepEqual(r.report.routes.map((x) => x.route), ['/Contact.html', '/Missing.html'])
  assert.deepEqual(served.sort(), ['/Contact.html', '/Missing.html'])
})

test('--pages naming a path no route reaches exits 2 before any fetch', async () => {
  served.length = 0
  const r = await run('--pages', '/about,/nope')
  assert.equal(r.code, 2, r.output)
  assert.match(r.output, /--pages names no route: \/nope/)
  assert.deepEqual(served, [])
})

test('--pages with a malformed list exits 2', async () => {
  const r = await run('--pages', 'about')
  assert.equal(r.code, 2, r.output)
  assert.match(r.output, /--pages/)
})

test('a pairs.json with differing paths: a page-map as --routes is read as WordPress paths and fetched at the pair source', async () => {
  const rules = join(scratch, 'pairs.json')
  writeFileSync(rules, JSON.stringify({ rules: [{ from: '/About.html', to: '/about' }, { from: '/Contact.html', to: '/contact' }] }))
  const urlMap = join(scratch, 'url-page-map.json')
  writeFileSync(urlMap, JSON.stringify({ pages: [{ path: '/about' }, { path: '/contact' }] }))
  served.length = 0
  const out = join(scratch, 'url.json')
  const child = spawn(process.execPath, [new URL('../http-parity.mjs', import.meta.url).pathname, '--source', S, '--target', T, '--routes', urlMap, '--pairs', rules, '--pages', '/contact', '--out', out])
  child.stdout.resume(); child.stderr.resume()
  const [code] = await once(child, 'close')
  assert.equal(code, 0)
  assert.deepEqual(JSON.parse(readFileSync(out, 'utf8')).routes.map((x) => [x.route, x.targetPath]), [['/Contact.html', '/contact']])
  assert.deepEqual(served, ['/Contact.html'])
})

test('a pair whose target carries a query: the page-map path is read at the pair source and the query reaches the target (ja-fresco S-31)', async () => {
  const rules = join(scratch, 'query-pairs.json')
  writeFileSync(rules, JSON.stringify({ rules: [{ from: '/find?q=x', to: '/find?q=x' }, { from: '/About.html', to: '/about' }] }))
  const urlMap = join(scratch, 'query-page-map.json')
  writeFileSync(urlMap, JSON.stringify({ pages: [{ path: '/about' }, { path: '/find' }] }))
  served.length = 0
  const out = join(scratch, 'query.json')
  const child = spawn(process.execPath, [new URL('../http-parity.mjs', import.meta.url).pathname, '--source', S, '--target', T, '--routes', urlMap, '--pairs', rules, '--pages', '/find', '--out', out])
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const [code] = await once(child, 'close')
  assert.equal(code, 0, output)
  const report = JSON.parse(readFileSync(out, 'utf8'))
  assert.deepEqual(report.routes.map((x) => [x.route, x.targetPath, x.ok]), [['/find?q=x', '/find?q=x', true]])
  assert.deepEqual(served, ['/find?q=x'])
})
