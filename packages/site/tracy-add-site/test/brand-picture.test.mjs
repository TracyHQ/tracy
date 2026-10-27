/**
 * The logo and favicon of the "Customize your site" sheet, the parts that are not drawing: what a picked file is
 * refused for before it leaves the browser, how much of a logo blends into each tile (U6 of TracyHQ/tch#1013: WCAG
 * contrast under 1.5:1 on more than 20% of the visible pixels), and how the upload door's answers are read. The tiles
 * themselves are driven in a real browser by `e2e/create-brief-sheet.test.mjs`.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  BRAND_MAX_BYTES,
  blendOf,
  fileProblem,
  roleOf,
  serverProblem,
  tileWarnings,
  uploadBrandFile
} from '../src/client/brand-picture.mjs'

const png = (over = {}) => ({ type: 'image/png', size: 180_000, width: 1240, height: 320, ...over })

test('a logo is refused before upload for its type, its size and a short long side, with the numbers said', () => {
  assert.equal(fileProblem('logo', png()), null)
  assert.deepEqual(fileProblem('logo', png({ type: 'image/svg+xml' })), { key: 'brand_png_only' })
  assert.deepEqual(fileProblem('logo', png({ type: 'image/jpeg' })), { key: 'brand_png_only' })
  assert.deepEqual(fileProblem('logo', png({ size: 9.4 * 1048576 })), {
    key: 'brand_too_large',
    params: { size: '9.4 MB' }
  })
  assert.deepEqual(fileProblem('logo', png({ width: 240, height: 62 })), {
    key: 'brand_logo_small',
    params: { width: 240, height: 62 }
  })
  assert.equal(fileProblem('logo', png({ width: 500, height: 80 })), null, '500 on the long side is enough')
  assert.deepEqual(fileProblem('logo', png({ width: 0, height: 0, unreadable: true })), {
    key: 'brand_unreadable'
  })
})

test('a favicon must be square and at least 512 px', () => {
  assert.deepEqual(fileProblem('favicon', png({ width: 1240, height: 320 })), {
    key: 'brand_favicon_square',
    params: { width: 1240, height: 320 }
  })
  assert.deepEqual(fileProblem('favicon', png({ width: 64, height: 64 })), {
    key: 'brand_favicon_small',
    params: { width: 64, height: 64 }
  })
  assert.equal(fileProblem('favicon', png({ width: 512, height: 512 })), null)
  assert.equal(BRAND_MAX_BYTES, 8 * 1048576)
})

/** An RGBA sample of `n` pixels, each `[r, g, b, a]`. */
const sample = (pixels) => Uint8ClampedArray.from(pixels.flat())
const repeat = (pixel, n) => Array.from({ length: n }, () => pixel)

test('a white logo blends into the light tile, a dark one into the dark tile, a coloured one into neither', () => {
  // Ink on a transparent canvas (clear corners): a solid white square would read as a white background instead.
  const white = blendOf(sample([[0, 0, 0, 0], ...repeat([255, 255, 255, 255], 14), [0, 0, 0, 0]]))
  assert.equal(white.lowOnLight, 1)
  assert.equal(white.lowOnDark, 0)
  const ink = blendOf(sample(repeat([20, 20, 20, 255], 16)))
  assert.equal(ink.lowOnLight, 0)
  assert.equal(ink.lowOnDark, 1)
  const terracotta = blendOf(sample(repeat([191, 91, 61, 255], 16)))
  assert.equal(terracotta.lowOnLight, 0)
  assert.equal(terracotta.lowOnDark, 0)
  // Transparent pixels are not the logo: a mostly empty canvas with a dark mark is all dark ink.
  const mark = blendOf(sample([...repeat([0, 0, 0, 0], 12), ...repeat([20, 20, 20, 255], 4)]))
  assert.equal(mark.lowOnDark, 1)
  assert.equal(blendOf(sample(repeat([0, 0, 0, 0], 4))).lowOnDark, 0, 'nothing visible blends')
})

test('four white corners mean a solid white background, which is not counted as the logo', () => {
  const s = 4
  const pixels = repeat([255, 255, 255, 255], s * s)
  pixels[5] = [17, 17, 17, 255]
  const boxed = blendOf(sample(pixels), s)
  assert.equal(boxed.box, true)
  assert.equal(boxed.lowOnLight, 0, 'the white ground left out, the black ink stays readable on white')
  assert.equal(blendOf(sample(repeat([20, 20, 20, 255], 16)), 4).box, false)
})

test('warnings per tile: past 20% blends, a white box on the dark tile says so instead', () => {
  assert.deepEqual(tileWarnings('light', { lowOnLight: 0.6, lowOnDark: 0, box: false }), [
    'brand_blend_light'
  ])
  assert.deepEqual(tileWarnings('single', { lowOnLight: 0.21, lowOnDark: 0, box: false }), [
    'brand_blend_light'
  ])
  assert.deepEqual(tileWarnings('light', { lowOnLight: 0.2, lowOnDark: 0, box: false }), [])
  assert.deepEqual(tileWarnings('dark', { lowOnLight: 0, lowOnDark: 0.9, box: false }), ['brand_blend_dark'])
  assert.deepEqual(tileWarnings('dark', { lowOnLight: 0, lowOnDark: 0.9, box: true }), ['brand_white_box'])
  assert.deepEqual(tileWarnings('light', { lowOnLight: 0, lowOnDark: 0.9, box: true }), [])
  assert.deepEqual(tileWarnings('dark', null), [], 'a file not measured warns of nothing')
})

test('each tile uploads under its own role', () => {
  assert.equal(roleOf('logo', 'light'), 'logo-light')
  assert.equal(roleOf('logo', 'dark'), 'logo-dark')
  assert.equal(roleOf('logo', 'single'), 'logo')
  assert.equal(roleOf('favicon', 'favicon'), 'favicon')
})

test('the upload door: multipart file and role, an id back; a refusal by its code; anything else a failure', async () => {
  let seen
  const file = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
  const ok = await uploadBrandFile(file, 'logo-dark', async (url, init) => {
    seen = { url, init }
    return new Response(
      JSON.stringify({ id: 'a1b2c3d4-0000-4000-8000-000000000001', width: 600, height: 200 }),
      {
        status: 201
      }
    )
  })
  assert.deepEqual(ok, { ok: true, id: 'a1b2c3d4-0000-4000-8000-000000000001', width: 600, height: 200 })
  assert.equal(seen.url, '/api/sites/brand-files')
  assert.equal(seen.init.method, 'POST')
  assert.equal(seen.init.credentials, 'same-origin')
  assert.equal(seen.init.body.get('role'), 'logo-dark')
  assert.ok(seen.init.body.get('file') instanceof Blob)

  const refused = await uploadBrandFile(file, 'favicon', async () =>
    Response.json({ code: 'FAVICON_NOT_SQUARE', problems: ['FAVICON_NOT_SQUARE'] }, { status: 422 })
  )
  assert.deepEqual(refused, { ok: false, code: 'FAVICON_NOT_SQUARE' })
  assert.deepEqual(
    await uploadBrandFile(file, 'logo', async () =>
      Response.json({ code: 'BRAND_STORE_FAILED' }, { status: 502 })
    ),
    { ok: false, code: 'BRAND_STORE_FAILED' }
  )
  assert.deepEqual(
    await uploadBrandFile(file, 'logo', async () => {
      throw new Error('offline')
    }),
    { ok: false, code: 'NETWORK' }
  )
  assert.deepEqual(
    await uploadBrandFile(file, 'logo', async () => new Response('{}', { status: 201 })),
    { ok: false, code: 'BAD_ANSWER' },
    'a 201 without an id is not an upload'
  )
})

test("the door's refusal codes read as the same lines the browser's own checks say, with the file's numbers", () => {
  const local = { size: 9.4 * 1048576, width: 1240, height: 320 }
  assert.deepEqual(serverProblem('PNG_ONLY', local), { key: 'brand_png_only' })
  assert.deepEqual(serverProblem('PNG_UNREADABLE', local), { key: 'brand_unreadable' })
  assert.deepEqual(serverProblem('TOO_LARGE', local), { key: 'brand_too_large', params: { size: '9.4 MB' } })
  assert.deepEqual(serverProblem('LOGO_TOO_SMALL', local), {
    key: 'brand_logo_small',
    params: { width: 1240, height: 320 }
  })
  assert.deepEqual(serverProblem('FAVICON_NOT_SQUARE', local), {
    key: 'brand_favicon_square',
    params: { width: 1240, height: 320 }
  })
  assert.deepEqual(serverProblem('FAVICON_TOO_SMALL', local), {
    key: 'brand_favicon_small',
    params: { width: 1240, height: 320 }
  })
  assert.deepEqual(serverProblem('BRAND_STORE_FAILED', local), { key: 'brand_upload_failed' })
  assert.deepEqual(serverProblem('NETWORK', local), { key: 'brand_upload_failed' })
})
