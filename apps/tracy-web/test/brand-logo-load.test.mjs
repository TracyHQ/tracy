// Loading a brief's found logo into the run folder (brand step trial bench, #321): the media id of brand.logo becomes
// media/<id>.<ext>, where open_image, measure_logo and cut_mark look. A fake pool and a fake object store; the logo is
// drawn by code.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import { ensureLogo, logoIdOf, logoImage } from '../src/brand-step/brand-logo.js'
import { memoryRunFiles } from '../src/brand-step/run-files.js'

const ID = '7d1c0a52-3b7e-4c1d-9a55-0e6f2b8c4d11'
const brief = { brand: { name: 'Invented Cafe', voice: 'English; warm', logo: ID } }
const png = await sharp({ create: { width: 64, height: 32, channels: 4, background: '#224466' } })
  .png()
  .toBuffer()
const sha = (b) => createHash('sha256').update(b).digest('hex')

/** A pool that answers the wo_media lookup with the given row (or none). */
const poolWith = (row) => {
  const asked = []
  return { asked, query: async (sql, params) => (asked.push([sql, params]), { rows: row ? [row] : [] }) }
}
const storeOf = (bytes) => ({ get: async () => new Response(bytes) })
const stored = { sha256: sha(png), object_key: 'wo/logo.png', status: 'stored' }

test('the logo id of a brief is its brand.logo, or null', () => {
  assert.equal(logoIdOf(brief), ID)
  assert.equal(logoIdOf({ brand: { logo: null } }), null)
  assert.equal(logoIdOf({ brand: {} }), null)
})

test('a media id is read from storage and written as media/<id>.png in the run folder', async () => {
  const files = memoryRunFiles()
  const pool = poolWith(stored)
  const got = await ensureLogo({ pool, files, brief, objects: storeOf(png) })
  assert.deepEqual(got, { ok: true, source: { kind: 'media', mediaId: ID } })
  assert.deepEqual(files.read(`media/${ID}.png`), png)
  assert.equal(pool.asked[0][1][0], ID)
})

test('a logo already in the run folder is kept and nothing is looked up (a resumed run)', async () => {
  const files = memoryRunFiles({ [`media/${ID}.jpg`]: png })
  const pool = poolWith(null)
  assert.deepEqual(await ensureLogo({ pool, files, brief, objects: null }), { ok: true, source: null })
  assert.equal(pool.asked.length, 0)
})

test('a brief with no logo loads nothing', async () => {
  const files = memoryRunFiles()
  const got = await ensureLogo({
    pool: poolWith(null),
    files,
    brief: { brand: { logo: null } },
    objects: null
  })
  assert.deepEqual(got, { ok: true, source: null })
  assert.deepEqual(files.list(), [])
})

test('every way the logo cannot be had says why and writes nothing', async () => {
  const cases = [
    ['no such media row', poolWith(null), storeOf(png), /does not exist/],
    [
      'bytes not stored',
      poolWith({ ...stored, status: 'reference', object_key: null }),
      storeOf(png),
      /no stored bytes/
    ],
    ['no object store', poolWith(stored), null, /no object store/],
    [
      'store has no such object',
      poolWith(stored),
      { get: async () => new Response('', { status: 404 }) },
      /cannot be read/
    ],
    [
      'store throws',
      poolWith(stored),
      { get: async () => Promise.reject(new Error('down')) },
      /cannot be read/
    ],
    ['hash differs', poolWith({ ...stored, sha256: sha(Buffer.from('other')) }), storeOf(png), /stored hash/],
    [
      'not an image',
      poolWith({ ...stored, sha256: sha(Buffer.from('text')) }),
      storeOf(Buffer.from('text')),
      /not an image/
    ]
  ]
  for (const [name, pool, objects, reason] of cases) {
    const files = memoryRunFiles()
    const got = await ensureLogo({ pool, files, brief, objects })
    assert.equal(got.ok, false, name)
    assert.match(got.reason, reason, name)
    assert.deepEqual(files.list(), [], name)
  }
  const bad = await ensureLogo({
    pool: poolWith(null),
    files: memoryRunFiles(),
    brief: { brand: { logo: 'x' } },
    objects: null
  })
  assert.match(bad.reason, /not a media id/)
})

test('a picture format the tools do not list is stored as a png, an image keeps its own format', async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#336699"/></svg>'
  )
  const asPng = await logoImage(svg)
  assert.equal(asPng.ext, 'png')
  assert.equal((await sharp(asPng.bytes).metadata()).format, 'png')
  const jpeg = await sharp(png).jpeg().toBuffer()
  assert.equal((await logoImage(jpeg)).ext, 'jpg')
  assert.equal(await logoImage(Buffer.from('plain text')), null)
})
