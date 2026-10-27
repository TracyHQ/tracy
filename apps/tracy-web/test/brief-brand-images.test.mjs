/**
 * The brand pictures a customer uploads in "Customize your site" (plan T03, decisions Q4/U5/U7/D8):
 * `checkBrandImage` is the hard check the upload door runs, `prepareBrand` fits a logo into the frame
 * of the template's placement before a writer puts it on the site.
 *
 * Fixtures are drawn here with `sharp` instead of committed: each is a few hundred bytes to make, and
 * its size is the fact under test, so the test says it where it is read.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { BRAND_MAX_BYTES, checkBrandImage, prepareBrand } from '../src/sites/brief-engines/brand-images.js'

const INK = { r: 20, g: 30, b: 40, alpha: 1 }

/** A PNG of `width` × `height`, every pixel opaque. */
const png = (width, height, background = INK) =>
  sharp({ create: { width, height, channels: 4, background } })
    .png()
    .toBuffer()

/** The same picture in another format. */
const encoded = (format) =>
  sharp({ create: { width: 600, height: 600, channels: 4, background: INK } })
    [format]()
    .toBuffer()

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="200"><rect width="800" height="200"/></svg>'
)

test('the four roles the upload door names are taken; any other role is refused before the file is read', async () => {
  const square = await png(512, 512)
  for (const role of ['logo-light', 'logo-dark', 'logo', 'favicon'])
    assert.equal((await checkBrandImage(square, role)).problems.includes('BAD_ROLE'), false, role)
  for (const role of ['logo-x', 'Logo', 'icon', '', undefined])
    assert.deepEqual(
      await checkBrandImage(square, role),
      { ok: false, problems: ['BAD_ROLE'], width: null, height: null },
      String(role)
    )
})

test('a PNG logo with a long edge of 500 or more passes, with its size', async () => {
  for (const role of ['logo-light', 'logo-dark', 'logo']) {
    const verdict = await checkBrandImage(await png(500, 120), role)
    assert.deepEqual(verdict, { ok: true, problems: [], width: 500, height: 120 }, role)
  }
  const tall = await checkBrandImage(await png(80, 640), 'logo')
  assert.equal(tall.ok, true, 'the long edge may be the height')
})

test('only PNG: SVG, JPG, WebP and GIF are refused, even named .png', async () => {
  const others = {
    svg: SVG,
    jpeg: await encoded('jpeg'),
    webp: await encoded('webp'),
    gif: await encoded('gif')
  }
  for (const [name, bytes] of Object.entries(others)) {
    for (const role of ['logo', 'favicon']) {
      const verdict = await checkBrandImage(bytes, role)
      assert.equal(verdict.ok, false, `${name} as ${role}`)
      assert.deepEqual(verdict.problems, ['PNG_ONLY'], `${name} as ${role}`)
    }
  }
})

test('a PNG with a 499 px long edge is too small for a logo', async () => {
  const verdict = await checkBrandImage(await png(499, 200), 'logo-light')
  assert.equal(verdict.ok, false)
  assert.deepEqual(verdict.problems, ['LOGO_TOO_SMALL'])
  assert.equal(verdict.width, 499)
  assert.equal(verdict.height, 200)
})

test('a file over 8 MB is refused before it is read', async () => {
  const head = await png(600, 600)
  const big = Buffer.concat([head, Buffer.alloc(BRAND_MAX_BYTES + 1 - head.length)])
  assert.equal(big.length, BRAND_MAX_BYTES + 1)
  const verdict = await checkBrandImage(big, 'logo')
  assert.equal(verdict.ok, false)
  assert.ok(verdict.problems.includes('TOO_LARGE'))
  assert.equal(BRAND_MAX_BYTES, 8 * 1024 * 1024)
})

test('a favicon is square and at least 512 × 512', async () => {
  assert.deepEqual(await checkBrandImage(await png(512, 512), 'favicon'), {
    ok: true,
    problems: [],
    width: 512,
    height: 512
  })
  assert.deepEqual((await checkBrandImage(await png(512, 511), 'favicon')).problems, ['FAVICON_NOT_SQUARE'])
  assert.deepEqual((await checkBrandImage(await png(511, 511), 'favicon')).problems, ['FAVICON_TOO_SMALL'])
  assert.deepEqual((await checkBrandImage(await png(1240, 320), 'favicon')).problems, ['FAVICON_NOT_SQUARE'])
})

test('a PNG signature over broken data, or an unknown role, is not passed', async () => {
  const broken = Buffer.concat([(await png(600, 600)).subarray(0, 8), Buffer.from('not a png body')])
  assert.deepEqual((await checkBrandImage(broken, 'logo')).problems, ['PNG_UNREADABLE'])
  assert.deepEqual((await checkBrandImage(await png(600, 600), 'banner')).problems, ['BAD_ROLE'])
  assert.deepEqual((await checkBrandImage(new Uint8Array(0), 'logo')).problems, ['PNG_ONLY'])
})

test('a 1000 × 1000 logo padded into a 162 × 48 frame: alpha, the frame shape, every opaque pixel kept', async () => {
  // A logo with a transparent margin and an opaque square in the middle, so "kept" is checkable.
  const logo = await sharp({
    create: { width: 1000, height: 1000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: await png(600, 600, { r: 200, g: 40, b: 10, alpha: 1 }), left: 200, top: 200 }])
    .png()
    .toBuffer()
  const out = await prepareBrand(
    { name: 'Tamarind Bakery', logo: { light: logo } },
    { frame: { width: 162, height: 48 } }
  )
  const padded = out.logo.light
  const meta = await sharp(padded).metadata()
  assert.equal(meta.format, 'png')
  assert.equal(meta.hasAlpha, true)
  const ratio = meta.width / meta.height
  assert.ok(Math.abs(ratio / (162 / 48) - 1) <= 0.02, `shape ${meta.width}×${meta.height} matches the frame`)
  const opaque = async (bytes) => {
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let n = 0
    for (let i = 3; i < data.length; i += info.channels) if (data[i] > 0) n++
    return n
  }
  assert.equal(await opaque(padded), await opaque(logo), 'no opaque pixel lost')
  assert.equal(out.name, 'Tamarind Bakery')
})

test('every logo variant is padded; a logo already the frame shape keeps its size', async () => {
  const out = await prepareBrand(
    { logo: { light: await png(800, 200), dark: await png(640, 160) } },
    { frame: { width: 400, height: 100 } }
  )
  assert.deepEqual(
    [await sharp(out.logo.light).metadata(), await sharp(out.logo.dark).metadata()].map((m) => [
      m.width,
      m.height
    ]),
    [
      [800, 200],
      [640, 160]
    ]
  )
})

test('no frame in the profile: the logo goes as it came', async () => {
  const bytes = await png(700, 300)
  const out = await prepareBrand({ logo: { single: bytes } }, null)
  assert.equal(Buffer.compare(Buffer.from(out.logo.single), bytes), 0)
})

test('no favicon given: none is made', async () => {
  const out = await prepareBrand(
    { name: 'X', logo: { single: await png(600, 200) } },
    { frame: { width: 3, height: 1 } }
  )
  assert.equal('favicon' in out, false)
  const none = await prepareBrand({ name: 'X' }, { frame: { width: 3, height: 1 } })
  assert.equal('favicon' in none, false)
  assert.equal('logo' in none, false)
})

test('a favicon given goes through untouched', async () => {
  const icon = await png(512, 512)
  const out = await prepareBrand({ favicon: icon }, { frame: { width: 3, height: 1 } })
  assert.equal(Buffer.compare(Buffer.from(out.favicon), icon), 0)
})

/** Width and height of a PNG. */
const sizeOf = async (bytes) => {
  const meta = await sharp(bytes).metadata()
  return [meta.width, meta.height]
}

test('a logoHeight in the profile: every logo is scaled down to that height, aspect and transparency kept', async () => {
  // JA Kinetic 1.0.2 shows an uploaded logo at its own size (measured 496 × 155 on dev); its demo logo is 40 px tall.
  const logo = await sharp({
    create: { width: 1000, height: 250, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([{ input: await png(500, 125), left: 250, top: 62 }])
    .png()
    .toBuffer()
  const out = await prepareBrand({ logo: { light: logo, dark: await png(640, 200) } }, { logoHeight: 40 })
  assert.deepEqual(await sizeOf(out.logo.light), [160, 40])
  assert.deepEqual(await sizeOf(out.logo.dark), [128, 40])
  const meta = await sharp(out.logo.light).metadata()
  assert.equal(meta.format, 'png')
  assert.equal(meta.hasAlpha, true)
  const { data } = await sharp(out.logo.light).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(data[3], 0, 'the transparent corner stays transparent')
})

test('a frame and a logoHeight: padded to the frame shape, then scaled to the demo logo (JA Sensei 81 × 23)', async () => {
  const out = await prepareBrand(
    { logo: { light: await png(704, 200), dark: await png(500, 500) } },
    { frame: { width: 81, height: 23 }, logoHeight: 23 }
  )
  assert.deepEqual(await sizeOf(out.logo.light), [81, 23])
  assert.deepEqual(await sizeOf(out.logo.dark), [81, 23])
})

test('a logo already no taller than logoHeight is never scaled up', async () => {
  const bytes = await png(300, 30)
  const out = await prepareBrand({ logo: { single: bytes } }, { logoHeight: 40 })
  assert.deepEqual(await sizeOf(out.logo.single), [300, 30])
})
