// The rule that decides whether the home page draws the 3D cup, shows a still image of it, or
// shows no cup at all. Every branch the template promises is one case here; the page and the
// browser test only wire inputs into this rule.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_MODEL_BYTES, cupRoute, cupStill, storedModelSize } from '../src/lib/cup-route.mjs'

const MB = 1024 * 1024
const defaults = { model: '/models/default-cup.glb', still: '/models/default-cup-still.webp' }
const ok = { reducedMotion: false, webgl: true, saveData: false, fileError: false }
const owner = (size) => ({ model: { url: '/_emdash/api/media/file/cup.glb', size }, still: null })
const ownerWithStill = (size) => ({ ...owner(size), still: '/_emdash/api/media/file/cup.webp' })
const empty = { model: null, still: null }

test('an empty model field draws the default cup', () => {
  assert.deepEqual(cupRoute(empty, defaults, ok), { route: '3d', model: defaults.model })
})

test("the owner's file is drawn when the browser can and the file is at most 10 MB", () => {
  assert.deepEqual(cupRoute(owner(1 * MB), defaults, ok), { route: '3d', model: owner(0).model.url })
  assert.deepEqual(cupRoute(owner(5 * MB), defaults, ok).route, '3d', '3–10 MB still loads')
  assert.deepEqual(cupRoute(owner(MAX_MODEL_BYTES), defaults, ok).route, '3d', 'exactly 10 MB loads')
})

test('reduced motion, no WebGL, Save-Data or a broken file take the still path', () => {
  for (const signal of ['reducedMotion', 'saveData', 'fileError']) {
    assert.deepEqual(
      cupRoute(empty, defaults, { ...ok, [signal]: true }),
      {
        route: 'still',
        image: defaults.still
      },
      signal
    )
  }
  assert.deepEqual(cupRoute(empty, defaults, { ...ok, webgl: false }), {
    route: 'still',
    image: defaults.still
  })
})

test('a file over 10 MB is not loaded: still path', () => {
  assert.deepEqual(cupRoute(ownerWithStill(MAX_MODEL_BYTES + 1), defaults, ok), {
    route: 'still',
    image: '/_emdash/api/media/file/cup.webp'
  })
})

test('a file whose size is unknown is not loaded: still path', () => {
  for (const size of [null, undefined, Number.NaN, -1]) {
    assert.equal(cupRoute(ownerWithStill(size), defaults, ok).route, 'still', String(size))
  }
})

test("still path: the owner's still image goes with the owner's file", () => {
  assert.deepEqual(cupRoute(ownerWithStill(MB), defaults, { ...ok, webgl: false }), {
    route: 'still',
    image: '/_emdash/api/media/file/cup.webp'
  })
})

test('still path: an empty model field shows the default still, even when the owner stored a still image', () => {
  const stillOnly = { model: null, still: '/_emdash/api/media/file/cup.webp' }
  assert.deepEqual(cupRoute(stillOnly, defaults, { ...ok, reducedMotion: true }), {
    route: 'still',
    image: defaults.still
  })
})

test('still path: an owner file without an owner still image hides the cup (never the old cup)', () => {
  assert.deepEqual(cupRoute(owner(MB), defaults, { ...ok, reducedMotion: true }), { route: 'none' })
  assert.deepEqual(cupRoute(owner(20 * MB), defaults, ok), { route: 'none' })
  assert.deepEqual(cupRoute(owner(null), defaults, ok), { route: 'none' })
})

test('a missing default still image leaves the place empty instead of failing', () => {
  assert.deepEqual(cupRoute(empty, { ...defaults, still: null }, { ...ok, reducedMotion: true }), {
    route: 'still',
    image: null
  })
})

test('other pages use the same still rule', () => {
  assert.equal(cupStill(empty, defaults), defaults.still)
  assert.equal(cupStill({ model: null, still: '/x.webp' }, defaults), defaults.still)
  assert.equal(cupStill(ownerWithStill(MB), defaults), '/_emdash/api/media/file/cup.webp')
  assert.equal(cupStill(owner(MB), defaults), null)
})

test('a size stored on the field value is used without looking up the media record', async () => {
  let looked = false
  const size = await storedModelSize({ id: 'm1', size: 2 * MB }, async () => ((looked = true), 99))
  assert.equal(size, 2 * MB)
  assert.equal(looked, false)
})

test('a value without a size takes the media record size (a seed or API value is still drawn)', async () => {
  const size = await storedModelSize({ id: 'm1' }, async (id) => (id === 'm1' ? 5 * MB : null))
  assert.equal(size, 5 * MB)
  assert.equal(cupRoute(owner(size), defaults, ok).route, '3d')
})

test('no size on the value and none from the media record means an unknown size: not loaded', async () => {
  for (const lookup of [
    async () => null,
    async () => undefined,
    async () => {
      throw new Error('db')
    }
  ]) {
    const size = await storedModelSize({ id: 'm1' }, lookup)
    assert.equal(size, null)
    assert.deepEqual(cupRoute(ownerWithStill(size), defaults, ok), {
      route: 'still',
      image: ownerWithStill(0).still
    })
    assert.deepEqual(cupRoute(owner(size), defaults, ok), { route: 'none' })
  }
  assert.equal(await storedModelSize({}, async () => 1), null)
})
