// The backdrop behind a cut-out figure (ADR 0043 section 1a): measured from an invented demo picture (a dark disc with
// chevron bands in the accent's hue behind a figure, transparent corners), drawn again from its recipe of shape and
// colour roles, checked by the manifest shape and handed to step 9 in the mapping's `painted` list. Code drawn
// pictures only, no model, no database.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { exportPictureMapping } from '../src/site-pictures/contract-mapping.js'
import { backdropOf } from '../src/site-pictures/cutout-backdrop.js'
import { backdropComposite } from '../src/site-pictures/cutout-backdrop-draw.js'
import { PICTURES_VERSION, readPictures } from '../src/site-pictures/manifest-shape.js'
import { backdropProblem, PAINT_ROLES, PREVIEW_PALETTE } from '../src/site-pictures/paint.js'

const ACCENT = '#c81e1e'
const W = 400
const H = 420

// An invented demo figure: optional disc (centre 200,218, radius 200), chevron bands at 45 degrees (first band top at
// 200,110, 70 px high, 8 px apart) clipped to the disc, and a grey figure whose head pokes out above the disc.
function demoSvg({ disc = true, stripes = true, figure = true } = {}) {
  const bands = []
  for (let k = 0; k < 6; k++) {
    const top = 110 + k * 78
    const bottom = top + 70
    bands.push(
      `<polygon points="-300,${top + 500} 200,${top} 700,${top + 500} 700,${bottom + 500} 200,${bottom} -300,${bottom + 500}"/>`
    )
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><clipPath id="c"><circle cx="200" cy="218" r="200"/></clipPath></defs>${
      disc ? '<circle cx="200" cy="218" r="200" fill="#1b1a1a"/>' : ''
    }${stripes ? `<g clip-path="url(#c)" fill="${ACCENT}">${bands.join('')}</g>` : ''}${
      figure
        ? '<ellipse cx="200" cy="250" rx="70" ry="160" fill="#5a5a5a"/><circle cx="200" cy="45" r="40" fill="#6a6a6a"/>'
        : ''
    }</svg>`
  )
}
const demoPng = (opts) => sharp(demoSvg(opts)).png().toBuffer()

test('a demo with a disc and accent chevron bands gives a recipe of shape and roles', async () => {
  const b = await backdropOf(await demoPng(), { accent: ACCENT })
  assert.ok(b, 'the backdrop is found')
  const { circle, stripes } = b.shape
  assert.ok(Math.abs(circle.x - 0.5) < 0.01 && Math.abs(circle.y - 218 / H) < 0.01, JSON.stringify(circle))
  assert.ok(Math.abs(circle.r - 0.5) < 0.01, JSON.stringify(circle))
  assert.equal(stripes.pattern, 'chevron')
  assert.ok(Math.abs(stripes.angle - 45) <= 1, `angle ${stripes.angle}`)
  assert.ok(Math.abs(stripes.apex.x) < 0.03, `apex x ${stripes.apex.x}`)
  assert.ok(Math.abs(stripes.apex.y - (110 - 218) / 200) < 0.03, `apex y ${stripes.apex.y}`)
  assert.ok(Math.abs(stripes.band - 70 / 200) < 0.03, `band ${stripes.band}`)
  assert.ok(Math.abs(stripes.gap - 8 / 200) < 0.02, `gap ${stripes.gap}`)
  assert.equal(stripes.texture, null)
  assert.deepEqual(b.paint, { circle: 'surface', stripes: 'accent' })
  // The recipe names roles only; the measured colours stay out of it.
  assert.doesNotMatch(JSON.stringify({ shape: b.shape, paint: b.paint }), /#[0-9a-f]{6}/i)
})

test('no backdrop is invented: a bare figure, an opaque picture and a disc of no one colour give null', async () => {
  assert.equal(await backdropOf(await demoPng({ disc: false, stripes: false }), { accent: ACCENT }), null)
  const opaque = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#335577' } })
    .png()
    .toBuffer()
  assert.equal(await backdropOf(opaque, { accent: ACCENT }), null)
  assert.equal(await backdropOf(Buffer.from('not a picture'), { accent: ACCENT }), null)
})

test('a disc without bands gives the disc alone; bands of another hue than the accent are not taken', async () => {
  const plain = await backdropOf(await demoPng({ stripes: false }), { accent: ACCENT })
  assert.equal(plain.shape.stripes, null)
  assert.deepEqual(plain.paint, { circle: 'surface', stripes: null })
  const other = await backdropOf(await demoPng(), { accent: '#1e5ac8' })
  assert.equal(other.shape.stripes, null)
})

const previewFile = {
  file: `files/${'c'.repeat(64)}.png`,
  width: W,
  height: H,
  sha256: 'c'.repeat(64),
  preview: true
}

test('the backdrop shape check takes roles only and a preview marked as one', async () => {
  const b = await backdropOf(await demoPng(), { accent: ACCENT })
  const ok = { shape: b.shape, paint: b.paint, preview: previewFile }
  assert.ok(PAINT_ROLES.includes('surface'))
  assert.equal(backdropProblem(ok), null)
  assert.match(backdropProblem({ ...ok, paint: { ...ok.paint, stripes: ACCENT } }), /colour role/)
  assert.match(backdropProblem({ ...ok, preview: { ...previewFile, preview: false } }), /preview/)
  assert.match(backdropProblem({ ...ok, shape: { ...ok.shape, circle: { x: 2, y: 0.5, r: 0.5 } } }), /circle/)
})

test('the review composite has the figure on top of the backdrop', async () => {
  const b = await backdropOf(await demoPng(), { accent: ACCENT })
  // An invented cut-out figure: an opaque green block in the middle of a transparent picture.
  const figure = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="170" y="150" width="60" height="200" fill="#22aa44"/></svg>`
        )
      }
    ])
    .png()
    .toBuffer()
  const colours = { circle: PREVIEW_PALETTE.surface, stripes: ACCENT }
  const { png, width, height } = await backdropComposite(figure, b, colours)
  assert.deepEqual([width, height], [W, H])
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const px = (x, y) => [...data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)]
  const close = (p, hex) => {
    const n = Number.parseInt(hex.slice(1), 16)
    return (
      Math.max(Math.abs(p[0] - (n >> 16)), Math.abs(p[1] - ((n >> 8) & 255)), Math.abs(p[2] - (n & 255))) <= 6
    )
  }
  assert.ok(close(px(200, 300), '#22aa44'), `figure on top: ${px(200, 300)}`)
  assert.ok(close(px(200, 60), PREVIEW_PALETTE.surface), `disc above the bands: ${px(200, 60)}`)
  assert.ok(close(px(60, 330), ACCENT), `a band beside the figure: ${px(60, 330)}`)
  assert.equal(px(2, 2)[3], 0, 'corners stay transparent')
})

// A manifest with one drawn cut-out that carries a backdrop.
function manifest(entry) {
  return {
    version: PICTURES_VERSION,
    fingerprint: {
      kit: 'k',
      planSha256: 'a'.repeat(64),
      briefSha256: 'b'.repeat(64),
      prompts: { picker: 'd'.repeat(64), drawing: 'e'.repeat(64), looker: 'f'.repeat(64) }
    },
    frames: [entry],
    siteSettings: [],
    returns: [],
    altNotes: [],
    usage: [],
    cost: {},
    timing: {}
  }
}
const cutoutEntry = (backdrop, source = 'drawn') => ({
  frame: 'block-9.1',
  source,
  ...(source === 'owner-photo' ? { asset: 'a1' } : {}),
  file: `files/${'1'.repeat(64)}.png`,
  width: W,
  height: H,
  sha256: '1'.repeat(64),
  sitePath: `images/tracy-content/${'1'.repeat(64)}.png`,
  darkened: false,
  cutout: { groundRemoved: true },
  backdrop,
  reason: 'drawn as a cut-out'
})

test('the manifest keeps a drawn cut-out backdrop and refuses a wrong one; step 9 gets it in painted', async () => {
  const b = await backdropOf(await demoPng(), { accent: ACCENT })
  const backdrop = { shape: b.shape, paint: b.paint, preview: previewFile }
  const good = readPictures(manifest(cutoutEntry(backdrop)))
  assert.deepEqual(good.problems, [])
  assert.deepEqual(good.view.entries[0].backdrop, backdrop)
  const hex = readPictures(
    manifest(cutoutEntry({ ...backdrop, paint: { circle: '#111111', stripes: 'accent' } }))
  )
  assert.match(hex.problems[0].detail, /colour role/)
  const photo = readPictures(manifest(cutoutEntry(backdrop, 'owner-photo')))
  assert.match(photo.problems[0].detail, /backdrop/)

  const out = exportPictureMapping({
    pictures: manifest(cutoutEntry(backdrop)),
    contract: 'c',
    revision: 'r'
  })
  assert.deepEqual(out.problems, [])
  // The figure is placed as it is; the backdrop is painted by step 9 behind it.
  assert.equal(out.mapping.changes['module-9.1'], `images/tracy-content/${'1'.repeat(64)}.png`)
  assert.equal(out.uploads.length, 1)
  assert.deepEqual(out.painted, [
    {
      frame: 'block-9.1',
      key: 'module-9.1',
      kind: 'backdrop',
      paint: b.paint,
      holds: null,
      draw: { backdrop: b.shape, figure: `images/tracy-content/${'1'.repeat(64)}.png` },
      width: W,
      height: H,
      preview: previewFile,
      previewDark: null
    }
  ])
})
