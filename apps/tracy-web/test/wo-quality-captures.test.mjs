import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import {
  qualityCaptureManifest,
  qualityOverviewSheets,
  qualityReviewRoutes,
  sliceQualityCapture,
  validateQualityCapture
} from '../src/opportunities-build/quality-captures.js'
import { qualityHash } from '../src/opportunities-build/quality-dossier.js'

const hash = (b) => createHash('sha256').update(b).digest('hex')
const contentHash = qualityHash({ site: 'actual CMS' })
async function rendered({ width = 1440, height = 900, dpr = 1, cssHeight = 2500 } = {}) {
  const png = await sharp({
    create: { width: width * dpr, height: cssHeight * dpr, channels: 3, background: '#e0d0b0' }
  })
    .composite([
      {
        input: await sharp({
          create: { width: width * dpr, height: 120 * dpr, channels: 3, background: '#71283f' }
        })
          .png()
          .toBuffer(),
        top: (cssHeight - 120) * dpr,
        left: 0
      }
    ])
    .png()
    .toBuffer()
  return {
    png,
    source: '<html><body>Actual page including footer</body></html>',
    text: 'Actual page including footer',
    viewport: { width, height, dpr },
    cssHeight,
    status: 200,
    fontsReady: true,
    imagesDecoded: true,
    lazyComplete: true,
    renderComplete: true,
    errors: []
  }
}

test('readable slices cover the complete original PNG with overlap and retain original bytes/DOM', async () => {
  const read = await rendered(),
    made = await sliceQualityCapture({ route: '/', contentHash, read })
  assert.equal(made.capture.slices.length, 3)
  assert.equal(made.capture.slices[1].rect.y, 1036)
  assert.equal(made.capture.slices.at(-1).rect.y + made.capture.slices.at(-1).rect.height, 2500)
  assert.equal(hash(made.pixels.find((p) => p.purpose === 'source').bytes), hash(read.png))
  assert.equal(made.capture.sourceHash, hash(Buffer.from(read.source)))
  assert.equal(made.capture.textHash, hash(Buffer.from(read.text)))
  const bottom = made.pixels.find((p) => p.id === made.capture.slices.at(-1).id)
  const sample = await sharp(bottom.bytes)
    .extract({ left: 20, top: made.capture.slices.at(-1).png.height - 10, width: 1, height: 1 })
    .raw()
    .toBuffer()
  assert.deepEqual(
    [...sample],
    [113, 40, 63, 255],
    'the bottom footer pixels are actually present in the final slice'
  )
})

test('DPR 2 slices map source coordinates and normalize to CSS pixels without omitting the bottom', async () => {
  const made = await sliceQualityCapture({
    route: '/about',
    contentHash,
    read: await rendered({ width: 390, dpr: 2, cssHeight: 2301 })
  })
  assert.deepEqual(made.capture.png, { width: 780, height: 4602 })
  assert.equal(made.capture.slices[1].rect.y, 2072)
  for (const slice of made.capture.slices) {
    const bytes = made.pixels.find((p) => p.id === slice.id).bytes,
      info = await sharp(bytes).metadata()
    assert.equal(info.width, 390)
    assert.equal(info.height, slice.rect.height / 2)
  }
  assert.equal(validateQualityCapture(made.capture).ok, true)
})

test('a gap, changed content identity, viewport mismatch or unreadable derivative cannot prove coverage', async () => {
  const { capture } = await sliceQualityCapture({ route: '/', contentHash, read: await rendered() })
  for (const mutate of [
    (c) => {
      c.slices[1].rect.y += 100
    },
    (c) => {
      c.slices[0].contentHash = 'b'.repeat(64)
    },
    (c) => {
      c.slices[0].viewport.dpr = 2
    },
    (c) => {
      c.slices[0].png.height = 1200
    },
    (c) => {
      c.slices.pop()
    }
  ]) {
    const copy = structuredClone(capture)
    mutate(copy)
    assert.equal(validateQualityCapture(copy).ok, false)
  }
})

test('the browser must prove lazy loading/fonts/image decoding and exact PNG dimensions', async () => {
  for (const [key, value] of [
    ['fontsReady', false],
    ['imagesDecoded', false],
    ['lazyComplete', false],
    ['renderComplete', false],
    ['status', 500],
    ['errors', ['network failure']]
  ]) {
    const read = await rendered({ cssHeight: 1000 })
    read[key] = value
    await assert.rejects(sliceQualityCapture({ route: '/', contentHash, read }), {
      code: 'QUALITY_CAPTURE_INCOMPLETE'
    })
  }
  const read = await rendered({ cssHeight: 1000 })
  read.cssHeight++
  await assert.rejects(sliceQualityCapture({ route: '/', contentHash, read }), {
    code: 'QUALITY_CAPTURE_DIMENSIONS'
  })
  const blank = await rendered({ cssHeight: 1000 })
  blank.png = await sharp({ create: { width: 1440, height: 1000, channels: 3, background: '#ffffff' } })
    .png()
    .toBuffer()
  await assert.rejects(sliceQualityCapture({ route: '/', contentHash, read: blank }), {
    code: 'QUALITY_CAPTURE_UNREADABLE'
  })
})

test('manifest requires both viewports of every main and retained detail route', async () => {
  const manifest = {
      pages: [{ route: '/' }, { route: '/about' }],
      records: [
        { key: 'stories/industry@en', defaultLocale: true, route: '/stories/industry', slug: 'industry' },
        { key: 'stories/hidden@en', defaultLocale: true, route: '/stories/hidden', slug: 'hidden' }
      ]
    },
    plan = {
      records: [
        { key: 'stories/industry@en', state: 'planned', newSlug: 'coffee' },
        { key: 'stories/hidden@en', state: 'empty-by-policy' }
      ]
    }
  const routes = qualityReviewRoutes({ manifest, plan })
  assert.deepEqual(routes, ['/', '/about', '/stories/coffee'])
  const captures = []
  for (const route of routes)
    for (const width of [1440, 390])
      captures.push(
        (await sliceQualityCapture({ route, contentHash, read: await rendered({ width, cssHeight: 900 }) }))
          .capture
      )
  assert.equal(
    qualityCaptureManifest({ accountId: 'a', contentHash, captures, requiredRoutes: routes }).ok,
    true
  )
  const missing = qualityCaptureManifest({
    accountId: 'a',
    contentHash,
    captures: captures.slice(0, -1),
    requiredRoutes: routes
  })
  assert.ok(missing.errors.includes('QUALITY_CAPTURE_MISSING:/stories/coffee@390'))
})

test('global sheets bind each image to its route/viewport and reject a changed overview', async () => {
  const pictures = new Map(),
    captures = []
  for (const width of [1440, 390]) {
    const made = await sliceQualityCapture({
      route: '/',
      contentHash,
      read: await rendered({ width, cssHeight: 900 })
    })
    captures.push(made.capture)
    for (const p of made.pixels) pictures.set(p.id, p.bytes)
  }
  const sheet = await qualityOverviewSheets(captures, (id) => pictures.get(id))
  assert.equal(sheet.images.length, 1)
  assert.deepEqual(
    sheet.metadata[0].members.map((m) => m.width),
    [1440, 390]
  )
  assert.equal(sheet.images[0].sha256, hash(Buffer.from(sheet.images[0].dataUrl.split(',')[1], 'base64')))
  pictures.set(captures[0].overview.id, Buffer.from('changed'))
  await assert.rejects(
    qualityOverviewSheets(captures, (id) => pictures.get(id)),
    { code: 'QUALITY_CAPTURE_PIXELS_CHANGED' }
  )
})
