import assert from 'node:assert/strict'
import { test } from 'node:test'
import { preparePicturesBeforeApply } from '../src/sites/picture-preparation.js'

const context = () => ({
  signal: new AbortController().signal,
  notes: [],
  note(value) {
    this.notes.push(value)
  },
  time() {}
})

test('stopping drawing keeps the owner photos and neutral fills returned during the stop grace', async () => {
  const ctx = context()
  const prepared = {}
  const ready = { shaped: [{ receipt: { kind: 'photo' } }, { receipt: { kind: 'placeholder' } }] }
  const engine = {
    preparePictures: ({ signal }) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(ready), { once: true })
      })
  }
  await preparePicturesBeforeApply(engine, ctx, prepared, 10, 100)
  assert.equal(prepared.realPictureShape, ready)
  assert.equal(prepared.realPicturesPrepared, true)
})

test('a dependency that ignores cancellation cannot add pictures after text writing starts', async () => {
  const ctx = context()
  const prepared = {}
  let finish
  const engine = {
    preparePictures: () =>
      new Promise((resolve) => {
        finish = resolve
      })
  }
  await preparePicturesBeforeApply(engine, ctx, prepared, 10, 10)
  assert.equal(prepared.realPictureShape, null)
  assert.equal(prepared.realPicturesPrepared, true)
  finish({ shaped: [{ receipt: { kind: 'drawn' } }] })
  await Promise.resolve()
  assert.equal(prepared.realPictureShape, null)
})

test('a successful preparation returns once and ends its timer without aborting the site write signal', async () => {
  const ctx = context()
  const prepared = {}
  const ready = { shaped: [] }
  await preparePicturesBeforeApply({ preparePictures: async () => ready }, ctx, prepared, 10)
  assert.equal(prepared.realPictureShape, ready)
  assert.equal(ctx.signal.aborted, false)
  assert.deepEqual(ctx.notes, [])
})
