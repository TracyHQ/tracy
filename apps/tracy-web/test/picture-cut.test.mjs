/**
 * Measuring and cutting a collected picture for a demo picture's place: the numbers the planner reads, a crop that keeps
 * the demo's shape and is never enlarged, and a neutral placeholder for a place nothing fits.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'

import {
  cutForPlace,
  extendForPlace,
  demoTransparency,
  pictureFeatures,
  placeholderPicture
} from '../src/lib/picture-cut.js'

const flat = (width, height, background = '#cc8844', format = 'jpeg') =>
  sharp({ create: { width, height, channels: 3, background } })
    [format]()
    .toBuffer()

/** Random noise: a stand-in for a busy photograph. */
const noise = (width, height, seed = 7) => {
  const data = Buffer.alloc(width * height * 3)
  let x = seed
  for (let i = 0; i < data.length; i += 1) {
    x = (x * 1103515245 + 12345) & 0x7fffffff
    data[i] = x & 0xff
  }
  return sharp(data, { raw: { width, height, channels: 3 } })
    .jpeg()
    .toBuffer()
}

/** A grey ramp across the width: every tone in equal share, no edge. */
const ramp = (width, height) => {
  const data = Buffer.alloc(width * height)
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) data[y * width + x] = Math.floor((x / width) * 256)
  return sharp(data, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer()
}
/** Black and white squares one sampled pixel wide: edges everywhere. */
const checker = (cells) => {
  const size = cells * 8
  const data = Buffer.alloc(size * size)
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1) data[y * size + x] = ((x >> 3) + (y >> 3)) % 2 ? 255 : 0
  return sharp(data, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer()
}

test('features: a flat poster-like ground is two tones, a ramp is many; squares are all edges; the hash of one picture at two sizes is near', async () => {
  const poster = await pictureFeatures(await flat(800, 1000, '#ffffff'))
  assert.ok(poster.top2Share > 0.9)
  assert.ok(poster.edgeDensity < 0.01)
  const tones = await pictureFeatures(await ramp(512, 300))
  assert.ok(tones.top2Share < 0.2, String(tones.top2Share))
  const edges = await pictureFeatures(await checker(64))
  assert.ok(edges.edgeDensity > 0.5, String(edges.edgeDensity))
  const busy = await pictureFeatures(await noise(400, 300))
  assert.match(busy.dhash, /^[0-9a-f]{16}$/)
  const scene = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#334"/><circle cx="220" cy="260" r="150" fill="#e8c27a"/><rect x="430" y="90" width="300" height="420" fill="#8a3b2e"/><circle cx="600" cy="420" r="90" fill="#f4f1ea"/></svg>`
  const big = await sharp(Buffer.from(scene)).jpeg().toBuffer()
  const small = await sharp(big).resize(400, 300).jpeg().toBuffer()
  const [a, b] = await Promise.all([pictureFeatures(big), pictureFeatures(small)])
  let bits = 0
  for (let i = 0; i < 16; i += 1) {
    let x = parseInt(a.dhash[i], 16) ^ parseInt(b.dhash[i], 16)
    while (x) {
      bits += x & 1
      x >>= 1
    }
  }
  assert.ok(bits <= 6, `dHash ${a.dhash} vs ${b.dhash}: ${bits} bits`)
  assert.ok(tones.centreLuminance > 0.4 && tones.centreLuminance < 0.6, String(tones.centreLuminance))
  assert.equal(poster.centreLuminance, 1)
})

test('a demo PNG with transparent corners is a cut-out; an opaque one and a JPEG are not', async () => {
  const cut = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: await flat(32, 32, '#ff0000', 'png'), top: 16, left: 16 }])
    .png()
    .toBuffer()
  assert.equal(await demoTransparency(cut), true)
  assert.equal(await demoTransparency(await flat(64, 64, '#00ff00', 'png')), false)
  assert.equal(await demoTransparency(await flat(64, 64)), false)
  assert.equal(await demoTransparency(Buffer.from('not a picture')), null)
})

test('a cut keeps the demo’s shape within 1%, is never larger than the source, and is a JPEG named by its own bytes', async () => {
  const source = await noise(1200, 900)
  const cut = await cutForPlace(source, {
    aspect: 2.4,
    source: { width: 1200, height: 500 },
    output: { width: 1200, height: 500 },
    strategy: 'attention'
  })
  assert.equal(cut.ext, 'jpg')
  assert.deepEqual([cut.width, cut.height], [1200, 500])
  const meta = await sharp(cut.bytes).metadata()
  assert.deepEqual([meta.width, meta.height, meta.format], [1200, 500, 'jpeg'])
  assert.match(cut.sha256, /^[0-9a-f]{64}$/)
  // The same picture and the same place give the same bytes: a retry uploads the same file.
  const again = await cutForPlace(source, {
    aspect: 2.4,
    source: { width: 1200, height: 500 },
    output: { width: 1200, height: 500 },
    strategy: 'attention'
  })
  assert.equal(again.sha256, cut.sha256)
})

test('a centred cut of a person sits a little low; an output asked larger than the crop is refused', async () => {
  const source = await noise(600, 1000)
  const cut = await cutForPlace(source, {
    aspect: 1,
    source: { width: 600, height: 600 },
    output: { width: 500, height: 500 },
    strategy: 'anchor',
    anchor: 'centre-low'
  })
  assert.deepEqual(cut.rect, { left: 0, top: 240, width: 600, height: 600 })
  assert.deepEqual([cut.width, cut.height], [500, 500])
  await assert.rejects(
    cutForPlace(source, {
      aspect: 1,
      source: { width: 600, height: 600 },
      output: { width: 700, height: 700 },
      strategy: 'centre'
    }),
    /enlarge/
  )
})

test('a placeholder is a plain picture in the brand’s colours at the place’s exact size', async () => {
  const placeholder = await placeholderPicture({ width: 960, height: 400, colours: ['#1f3b4d', '#c99a5b'] })
  const meta = await sharp(placeholder.bytes).metadata()
  assert.deepEqual([meta.width, meta.height, meta.format], [960, 400, 'jpeg'])
  const fallback = await placeholderPicture({ width: 100, height: 100, colours: [] })
  assert.equal((await sharp(fallback.bytes).metadata()).width, 100)
})

test('a phone photo on its side with a crop planned from its stored size is cut to the crop’s shape, never stretched', async () => {
  // Stored 1200×900, shown 900×1200 (EXIF 6): the 16:9 crop planned from the stored size is wider than the picture.
  const turned = await sharp(await noise(1200, 900))
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer()
  const cut = await cutForPlace(turned, {
    aspect: 16 / 9,
    source: { width: 1200, height: 675 },
    output: { width: 640, height: 360 },
    strategy: 'centre'
  })
  assert.deepEqual([cut.width, cut.height], [640, 360])
  // The region taken off the picture is 16:9 too (it was 900×675, 4:3, before 19/10/2026).
  assert.ok(Math.abs(cut.rect.width / cut.rect.height - 16 / 9) < 0.01, JSON.stringify(cut.rect))
  assert.ok(cut.rect.width <= 900 && cut.rect.height <= 1200)
})

test('source canvas preserves sharp foreground pixels and records a blurred source background without generation', async () => {
  const source = await noise(1000, 600)
  const crop = {
    aspect: 2.5,
    source: { width: 1000, height: 400 },
    output: { width: 500, height: 200 },
    strategy: 'centre'
  }
  const canvas = {
    version: 1,
    minimumSourceWidth: 800,
    output: { width: 1000, height: 200 },
    foreground: { width: 500, height: 200, left: 250, top: 0 }
  }
  const out = await extendForPlace(source, crop, canvas)
  const clear = await cutForPlace(source, crop)
  const expected = await sharp(clear.bytes).raw().toBuffer()
  const actual = await sharp(out.bytes).extract(canvas.foreground).raw().toBuffer()
  let error = 0
  for (let i = 0; i < expected.length; i++) error += Math.abs(expected[i] - actual[i])
  assert.ok(error / expected.length < 8, String(error / expected.length))
  assert.equal((await sharp(out.bytes).metadata()).width, 1000)
  assert.equal(out.height, 200)
  assert.equal(out.recipe.version, 'sharp-source-canvas/1')
  assert.equal(out.recipe.generatedScene, false)
  assert.equal(out.recipe.background.effect, 'blurred-source')
  assert.equal(out.recipe.sourceHash.length, 64)
  assert.equal(out.recipe.foreground.width, 500)
  assert.deepEqual(out.bytes, (await extendForPlace(source, crop, canvas)).bytes)
  await assert.rejects(
    extendForPlace(source, crop, { ...canvas, foreground: { ...canvas.foreground, width: 499 } }),
    /invalid source canvas/
  )
  await assert.rejects(
    extendForPlace(source, { ...crop, source: { width: 1000, height: 200 } }, canvas),
    /discard too much/
  )
  await assert.rejects(
    extendForPlace(source, { ...crop, source: { width: 400, height: 400 } }, canvas),
    /discard too much|enlarge/
  )
  await assert.rejects(extendForPlace(await noise(600, 400), crop, canvas), /discard too much/)
  const turned = await sharp(source).withMetadata({ orientation: 6 }).jpeg().toBuffer()
  const rotatedCrop = {
    aspect: 1,
    source: { width: 600, height: 600 },
    output: { width: 400, height: 400 },
    strategy: 'centre'
  }
  const rotatedCanvas = {
    version: 1,
    minimumSourceWidth: 500,
    output: { width: 800, height: 400 },
    foreground: { width: 400, height: 400, left: 200, top: 0 }
  }
  const rotated = await extendForPlace(turned, rotatedCrop, rotatedCanvas)
  assert.deepEqual([rotated.width, rotated.height], [800, 400])
})

test('keepAlpha keeps a transparent logo transparent (PNG); without it the cut stays a JPEG', async () => {
  // A dark mark on a clear ground (q. patisserie, local round 24, 25/10/2026: as JPEG its ground came out black).
  const logo = await sharp({
    create: { width: 500, height: 160, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: await flat(120, 120, '#3b1f14'), left: 20, top: 20 }])
    .png()
    .toBuffer()
  const crop = {
    aspect: 500 / 160,
    source: { width: 500, height: 160 },
    output: { width: 500, height: 160 },
    strategy: 'centre'
  }
  const kept = await cutForPlace(logo, crop, { keepAlpha: true })
  assert.equal(kept.ext, 'png')
  assert.equal(kept.recipe.encoder.format, 'png')
  const { data, info } = await sharp(kept.bytes).raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.channels, 4)
  assert.equal(data[(150 * info.width + 480) * 4 + 3], 0, 'the clear ground stays clear')
  const flatCut = await cutForPlace(logo, crop)
  assert.equal(flatCut.ext, 'jpg')
  assert.equal((await sharp(flatCut.bytes).metadata()).format, 'jpeg')
  // An opaque photo stays a JPEG even with keepAlpha, an alpha channel or not (local round 26: a 1.2 MB PNG masthead).
  const photo = await cutForPlace(await flat(500, 160), crop, { keepAlpha: true })
  assert.equal(photo.ext, 'jpg')
  const opaqueWithAlpha = await sharp({
    create: { width: 500, height: 160, channels: 4, background: { r: 200, g: 120, b: 60, alpha: 1 } }
  })
    .png()
    .toBuffer()
  assert.equal((await sharp(opaqueWithAlpha).metadata()).hasAlpha, true)
  assert.equal((await cutForPlace(opaqueWithAlpha, crop, { keepAlpha: true })).ext, 'jpg')
})

test('a subject crop is cut where the plan placed it, also from a smaller copy of the photo (#136)', async () => {
  // Planned on a 1200 x 900 photo: a 900 x 900 box starting at 24 px (a face at the left edge), the free room being 300.
  const crop = {
    aspect: 1,
    source: { width: 900, height: 900 },
    output: { width: 600, height: 600 },
    strategy: 'subject',
    at: { x: 0.08, y: 0.5 }
  }
  const cut = await cutForPlace(await noise(1200, 900), crop)
  assert.deepEqual(cut.rect, { left: 24, top: 0, width: 900, height: 900 })
  // The same plan on a smaller copy of the photo: the box shrinks by one factor and keeps its place.
  const smaller = await cutForPlace(await noise(1000, 750), crop)
  assert.deepEqual(smaller.rect, { left: 20, top: 0, width: 750, height: 750 })
  assert.deepEqual([smaller.width, smaller.height], [600, 600])
})
