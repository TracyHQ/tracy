// Kit images are fitted inside MAX_IMAGE_SIDE before they reach the model (ADR 0041, #301): the provider refuses an
// image with a side over 8000 px, and over 2000 px on either side once a request carries more than 20 images. The
// sha256 check stays on the zip's original bytes; the fitted bytes are cached once per kit version.
// No network: the zip is built here with invented pictures drawn by sharp.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, before, beforeEach, test } from 'node:test'
import { zipSync } from 'fflate'
import sharp from 'sharp'
import { createKitImages } from '../src/site-planner/kit-images.js'

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const draw = (width, height, format) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } } })
    [format]()
    .toBuffer()

/** Invented full-page captures: one far taller than the limit, one PNG wider than it, one small enough already. */
const PICTURES = {}
before(async () => {
  PICTURES['page-home-1440'] = { path: 'images/page-home-1440.jpg', bytes: await draw(1440, 10000, 'jpeg') }
  PICTURES['banner-2400'] = { path: 'images/banner-2400.png', bytes: await draw(2400, 600, 'png') }
  PICTURES['header-1440'] = { path: 'images/header-1440.png', bytes: await draw(1440, 120, 'png') }
})

function fakeKit() {
  return {
    ref: 'demo/j6/2.0.0',
    release: 'quickstart/demo/j6',
    version: '2.0.0',
    doc: {
      template: { name: 'ja_demo', version: '1.1.0' },
      quickstart: { product: 'demo', version: '2.0.0' },
      images: Object.entries(PICTURES).map(([id, p]) => ({
        id,
        path: p.path,
        sha256: sha(p.bytes),
        bytes: p.bytes.length
      }))
    }
  }
}
const zip = () => {
  const entries = { 'template-kit.json': new TextEncoder().encode('{}') }
  for (const p of Object.values(PICTURES)) entries[p.path] = new Uint8Array(p.bytes)
  return { ok: true, bytes: Buffer.from(zipSync(entries)) }
}
const ready = async () => {
  const got = await createKitImages({ dir, fetchZip: async () => zip() }).ensure(fakeKit())
  assert.equal(got.ok, true, JSON.stringify(got))
  return got.images
}
const sizeOf = async (base64) => sharp(Buffer.from(base64, 'base64')).metadata()

let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'kit-image-fit-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

test('a tall full-page capture reaches the model at most 2000 px on each side, aspect ratio kept', async () => {
  const images = await ready()
  const opened = await images.open('page-home-1440')
  const [image] = opened.images
  const { width, height, format } = await sizeOf(image.base64)
  assert.equal(height, 2000)
  assert.equal(width, 288)
  assert.equal(format, 'jpeg')
  assert.equal(image.mediaType, 'image/jpeg')
  // The reference still names the zip's original bytes: that is what the kit lists and what is checked.
  assert.deepEqual(image.ref, {
    kit: 'demo/j6/2.0.0',
    image: 'page-home-1440',
    sha256: sha(PICTURES['page-home-1440'].bytes)
  })
  const text = JSON.parse(opened.text)
  assert.deepEqual([text.width, text.height], [288, 2000])
  assert.deepEqual(text.original, { width: 1440, height: 10000 })

  // A resumed run reads the same fitted bytes back from the reference.
  const back = await images.resolve(image.ref)
  assert.equal(back.base64, image.base64)
  assert.equal(back.mediaType, 'image/jpeg')
})

test('a PNG over the limit stays a PNG', async () => {
  const opened = await (await ready()).open('banner-2400')
  const { width, height, format } = await sizeOf(opened.images[0].base64)
  assert.deepEqual([width, height, format], [2000, 500, 'png'])
  assert.equal(opened.images[0].mediaType, 'image/png')
})

test('an image already inside the limit is sent as it is, never enlarged', async () => {
  const opened = await (await ready()).open('header-1440')
  assert.deepEqual(Buffer.from(opened.images[0].base64, 'base64'), PICTURES['header-1440'].bytes)
  assert.equal(JSON.parse(opened.text).original, undefined)
})

test('a fitted image is cached beside the originals and reused by a later process', async () => {
  const first = await (await ready()).open('page-home-1440')
  const fitted = readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.includes('fit-2000'))
  const file = fitted.find((f) => f.endsWith('.jpg'))
  assert.ok(file, `no cached fitted image in ${fitted.join(', ')}`)
  assert.match(path.basename(file), new RegExp(sha(PICTURES['page-home-1440'].bytes)))

  // Replace the cached file with another valid picture: a later process must serve it, not fit the original again.
  const marker = await draw(100, 700, 'jpeg')
  writeFileSync(path.join(dir, file), marker)
  const again = await (await ready()).open('page-home-1440')
  assert.notEqual(again.images[0].base64, first.images[0].base64)
  assert.deepEqual(Buffer.from(again.images[0].base64, 'base64'), marker)
})
