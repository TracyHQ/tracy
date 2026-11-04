// The ground removal of a cut-out (#346, cutout-ground.js) on small code drawn pictures: a fake figure (a body, a head
// and a racket with thin strings, drawn with soft edges) on a flat plain ground. No model.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import {
  cutoutFile,
  dropResidue,
  GROUNDS,
  groundFor,
  removeGround
} from '../src/site-pictures/cutout-ground.js'
import { lookImage } from '../src/site-pictures/looker-call.js'

const [GREEN, MAGENTA, BLUE] = GROUNDS

// A figure in the middle of a 240 x 200 picture on the ground; `over` moves or adds shapes.
function figure(ground, { body = '#c8323c', head = '#f4f4f0', extra = '', background = null } = {}) {
  const fill = background ?? ground.hex
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="200">
    <rect width="240" height="200" fill="${fill}"/>
    <ellipse cx="110" cy="130" rx="38" ry="60" fill="${body}"/>
    <circle cx="110" cy="56" r="22" fill="${head}"/>
    <ellipse cx="170" cy="80" rx="22" ry="30" fill="none" stroke="#1a1a1a" stroke-width="3"/>
    <line x1="150" y1="80" x2="190" y2="80" stroke="#f4f4f0" stroke-width="1"/>
    <line x1="170" y1="52" x2="170" y2="108" stroke="#f4f4f0" stroke-width="1"/>
    ${extra}
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

const pixel = (r, x, y) => [...r.data.subarray((y * r.width + x) * 4, (y * r.width + x) * 4 + 4)]

test('the ground is removed with a soft edge and no halo of its colour', async () => {
  const r = await removeGround(await figure(GREEN), GREEN)
  assert.equal(r.ok, true, r.reason)
  assert.equal(r.measured, GREEN.hex)
  assert.equal(pixel(r, 5, 5)[3], 0, 'the ground is transparent')
  assert.equal(pixel(r, 110, 130)[3], 255, 'the body is opaque')
  assert.deepEqual(pixel(r, 110, 130).slice(0, 3), [200, 50, 60], 'the body keeps its colour')
  assert.equal(pixel(r, 110, 56)[3], 255, 'the head is opaque')
  // Between the racket strings the ground is gone too.
  assert.equal(pixel(r, 160, 70)[3], 0)
  // The edge is soft: partly transparent pixels exist, and they are few.
  let soft = 0
  let halo = 0
  let worst = 0
  for (let y = 0; y < r.height; y++)
    for (let x = 0; x < r.width; x++) {
      const [red, green, blue, a] = pixel(r, x, y)
      if (a > 0 && a < 255) soft++
      // No halo: no visible pixel shows more green than its red or blue.
      if (a > 12) {
        const spill = green - Math.max(red, blue)
        if (spill > 0) halo++
        worst = Math.max(worst, spill)
      }
    }
  assert.ok(soft > 50, `a soft edge: ${soft} partly transparent pixels`)
  assert.ok(r.soft < 0.06, `${r.soft}`)
  assert.equal(halo, 0, `no green fringe (worst spill ${worst})`)
  // The head's edge pixels are unmixed from the ground: still the head's near white, not a green tint.
  const edge = []
  for (let y = 30; y < 68; y++)
    for (let x = 84; x < 136; x++) {
      const p = pixel(r, x, y)
      if (p[3] >= 64 && p[3] < 255) edge.push(p)
    }
  assert.ok(edge.length > 10, `the head has a soft edge: ${edge.length} pixels`)
  for (const p of edge) assert.ok(Math.min(...p.slice(0, 3)) >= 200, `edge pixel ${p}`)
})

test('magenta and blue grounds are removed the same way', async () => {
  for (const ground of [MAGENTA, BLUE]) {
    const r = await removeGround(await figure(ground, { body: '#e0a030' }), ground)
    assert.equal(r.ok, true, `${ground.name}: ${r.reason}`)
    assert.equal(pixel(r, 5, 5)[3], 0)
    assert.equal(pixel(r, 110, 130)[3], 255)
  }
})

test('a ground that cannot be removed cleanly fails, naming the fault for the redraw', async () => {
  // No plain ground of the asked colour: a grey picture.
  const grey = await removeGround(await figure(GREEN, { background: '#808080' }), GREEN)
  assert.deepEqual([grey.ok, grey.fault], [false, 'leftover ground'])
  // A figure in the ground colour's family: much of it only partly removed.
  const greenish = await removeGround(await figure(GREEN, { body: '#4f9a5a', head: '#5aa060' }), GREEN)
  assert.deepEqual([greenish.ok, greenish.fault], [false, 'leftover ground'])
  assert.match(greenish.reason, /only partly removed/)
  // A figure cut by the left edge.
  const cut = await removeGround(
    await figure(GREEN, { extra: '<rect x="0" y="40" width="60" height="120" fill="#202020"/>' }),
    GREEN
  )
  assert.deepEqual(
    [cut.ok, cut.fault, cut.reason],
    [false, 'subject cut off', 'the figure touches the left edge of the picture']
  )
  // Standing on the bottom edge is allowed.
  const standing = await removeGround(
    await figure(GREEN, { extra: '<rect x="90" y="150" width="40" height="50" fill="#202020"/>' }),
    GREEN
  )
  assert.equal(standing.ok, true, standing.reason)
})

test('the cut-out file is contained in the frame size as a PNG with alpha', async () => {
  const made = await cutoutFile(await figure(GREEN), GREEN, { width: 300, height: 300 })
  assert.equal(made.ok, true)
  const meta = await sharp(made.png).metadata()
  assert.deepEqual([meta.format, meta.width, meta.height, meta.hasAlpha], ['png', 300, 300, true])
  const { data } = await sharp(made.png).raw().toBuffer({ resolveWithObject: true })
  assert.equal(data[3], 0, 'the band added around the drawing is transparent')
  assert.equal(made.cutout.ground, GREEN.hex)
  assert.equal(made.cutout.groundRemoved, true)
  assert.ok(made.cutout.figure > 0.05 && made.cutout.figure < 0.4, `${made.cutout.figure}`)
})

test('the ground colour avoids the colours the plan words name', () => {
  assert.equal(groundFor({ shows: 'a boxer with red gloves' }), GREEN)
  assert.equal(groundFor({ shows: 'a player with a tennis ball', mustInclude: ['a racket'] }), MAGENTA)
  assert.equal(groundFor({ shows: 'a girl in a pink dress on the grass' }), BLUE)
  // The words to avoid are not in the picture: they never rule a ground out.
  assert.equal(groundFor({ shows: 'a boxer', avoid: ['green walls'] }), GREEN)
})

test('a faint cast shadow under the figure is dropped, the soft edge of the figure stays', async () => {
  // A wide, faint dark blob on the ground under the body, a few pixels below it (not touching the solid body).
  const extra = '<ellipse cx="110" cy="195" rx="70" ry="4" fill="#000000" fill-opacity="0.16"/>'
  const r = await removeGround(await figure(GREEN, { extra }), GREEN)
  assert.equal(r.ok, true, r.reason)
  assert.equal(pixel(r, 110, 196)[3], 0, 'the faint shadow is transparent')
  assert.equal(pixel(r, 60, 195)[3], 0, 'the far end of the shadow is transparent')
  assert.equal(pixel(r, 110, 130)[3], 255, 'the body stays opaque')
  let edge = 0
  for (let y = 60; y < 190; y++)
    for (let x = 60; x < 160; x++) {
      const a = pixel(r, x, y)[3]
      if (a > 0 && a < 255) edge++
    }
  assert.ok(edge > 20, `the antialiased edge stays (${edge} partly transparent pixels)`)
})

test('dropResidue clears faint pixels away from the body and keeps those next to it', () => {
  const w = 40
  const h = 20
  const rgba = Buffer.alloc(w * h * 4)
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) rgba.writeUInt8(255, (y * w + x) * 4 + 3)
  rgba.writeUInt8(90, (5 * w + 11) * 4 + 3) // an edge pixel beside the body
  rgba.writeUInt8(90, (15 * w + 30) * 4 + 3) // a faint pixel far from it
  assert.equal(dropResidue(rgba, w, h), 1)
  assert.equal(rgba[(5 * w + 11) * 4 + 3], 90)
  assert.equal(rgba[(15 * w + 30) * 4 + 3], 0)
})

test('the looker sees a cut-out over one flat colour, never a checkerboard', async () => {
  const cut = await sharp({
    create: { width: 40, height: 40, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
  })
    .png()
    .toBuffer()
  const known = await sharp(
    Buffer.from(
      (await lookImage(cut, { width: 40, height: 40 }, null, { checks: true, background: '#102030' })).base64,
      'base64'
    )
  )
    .raw()
    .toBuffer()
  const colours = new Set()
  for (let i = 0; i < known.length; i += 3) colours.add(`${known[i]},${known[i + 1]},${known[i + 2]}`)
  assert.deepEqual([...colours], ['16,32,48'])
  const grey = await sharp(
    Buffer.from((await lookImage(cut, { width: 40, height: 40 }, null, { checks: true })).base64, 'base64')
  )
    .raw()
    .toBuffer()
  assert.deepEqual([...grey.subarray(0, 3)], [128, 128, 128])
})
