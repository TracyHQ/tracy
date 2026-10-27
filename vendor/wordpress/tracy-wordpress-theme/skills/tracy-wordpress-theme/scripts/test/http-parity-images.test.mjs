// http-parity --media-map: WordPress renames an upload whose file name is taken (`item-5.jpg` →
// `item-5-7.jpg`), so comparing images by basename reports every renamed image as missing and lets
// a missing image hide behind another one with the same name (issue #7 item 2). The seeder's
// media.json maps each source path to the URL WordPress gave it; with it, a source image is present
// when the target shows that URL (or one of its generated sizes) — and missing otherwise, even when
// some other image of the same basename is on the page.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const TEXT = '<h1>Our features</h1><p>one two three four five six seven</p>'
const page = (imgs) => `<!doctype html><html><body><main>${TEXT}${imgs.map((s) => `<img src="${s}" alt="">`).join('')}</main></body></html>`
const SOURCE = page([
  '/images/joomlart/features/item-5.jpg#joomlaImage://local-images/joomlart/features/item-5.jpg?width=700&height=394',
  '/images/joomlart/features/item-6.jpg',
  '/images/joomlart/hero/item-1.jpg',
  'images/joomlart/team/item-2.jpg',
  '/images/logo.png'
])
const TARGET = page([
  'http://wp.test/wp-content/uploads/2026/09/item-5-7.jpg',
  '/wp-content/uploads/2026/09/item-6-7-300x200.jpg',
  '/wp-content/uploads/2026/09/item-1.jpg',
  '/wp-content/themes/tracy/assets/logo.png'
])
const serve = (html) => createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(html))
const source = serve(SOURCE)
const target = serve(TARGET)
source.listen(0, '127.0.0.1')
target.listen(0, '127.0.0.1')
await Promise.all([once(source, 'listening'), once(target, 'listening')])
const S = `http://127.0.0.1:${source.address().port}`
const T = `http://127.0.0.1:${target.address().port}`

const scratch = mkdtempSync(join(tmpdir(), 'parity-images-'))
const media = (hero) => ({
  files: {
    'joomlart/blogs/intro/item-1.jpg': { id: 5, url: '/wp-content/uploads/2026/09/item-1.jpg', file: 'item-1.jpg' },
    'joomlart/features/item-5.jpg': { id: 76, url: '/wp-content/uploads/2026/09/item-5-7.jpg', file: 'item-5.jpg' },
    'joomlart/features/item-6.jpg': { id: 79, url: '/wp-content/uploads/2026/09/item-6-7.jpg', file: 'item-6.jpg' },
    'joomlart/hero/item-1.jpg': { id: 90, url: hero, file: 'item-1.jpg' },
    'joomlart/team/item-2.jpg': { id: 91, url: '/wp-content/uploads/2026/09/item-2-4.jpg', file: 'item-2.jpg' }
  }
})
const mediaA = join(scratch, 'media-a.json')
const mediaB = join(scratch, 'media-b.json')
writeFileSync(mediaA, JSON.stringify(media('/wp-content/uploads/2026/09/item-1-3.jpg')))
// The hero image imported as the file the target does show: now it is present.
writeFileSync(mediaB, JSON.stringify(media('/wp-content/uploads/2026/09/item-1.jpg')))
test.after(async () => {
  source.close()
  target.close()
  await Promise.all([once(source, 'close'), once(target, 'close')])
  rmSync(scratch, { recursive: true, force: true })
})

async function run(...extra) {
  const out = join(scratch, `report-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  const child = spawn(process.execPath, [new URL('../http-parity.mjs', import.meta.url).pathname, '--source', S, '--target', T, '--routes', '/features', '--out', out, ...extra])
  let output = ''
  child.stdout.on('data', (d) => (output += d))
  child.stderr.on('data', (d) => (output += d))
  const [code] = await once(child, 'close')
  return { code, output, route: JSON.parse(readFileSync(out, 'utf8')).routes[0] }
}

test('without a media map, images are compared by basename (renamed uploads read as missing)', async () => {
  const r = await run()
  assert.equal(r.code, 0, r.output)
  assert.deepEqual(r.route.missingImages, ['item-5.jpg', 'item-6.jpg', 'item-2.jpg'])
})

test('--media-map: a renamed upload and its generated size are present; a missing image hidden by a shared basename and a missing import are reported by source path', async () => {
  const r = await run('--media-map', mediaA)
  assert.equal(r.code, 0, r.output)
  assert.deepEqual(r.route.missingImages, ['/images/joomlart/hero/item-1.jpg', '/images/joomlart/team/item-2.jpg'])
})

test('--media-map with --cache: a different map is a different verdict, never the cached one', async () => {
  const cache = join(scratch, 'cache')
  const a = await run('--media-map', mediaA, '--cache', cache)
  const again = await run('--media-map', mediaA, '--cache', cache)
  assert.equal(again.route.cached, true, again.output)
  const b = await run('--media-map', mediaB, '--cache', cache)
  assert.equal(b.route.cached, false, b.output)
  assert.deepEqual(a.route.missingImages, ['/images/joomlart/hero/item-1.jpg', '/images/joomlart/team/item-2.jpg'])
  assert.deepEqual(b.route.missingImages, ['/images/joomlart/team/item-2.jpg'])
})
