import assert from 'node:assert/strict'
import { test } from 'node:test'
import { preparePicturesBeforeApply } from '../src/sites/picture-preparation.js'
import { createQuickstartFirstEngine } from '../src/sites/brief-engines/quickstart-first.js'

const context = () => ({
  signal: new AbortController().signal,
  notes: [],
  note(value) {
    this.notes.push(value)
  },
  time() {}
})

for (const trade of ['bakery', 'dental clinic']) {
  test(`${trade}: the production workflow wrapper keeps drawing time outside applyMs`, async (t) => {
    let now = 0
    t.mock.method(Date, 'now', () => now)
    const ready = { shaped: [{ receipt: { kind: 'drawn' } }] }
    const legacy = {
      prepare: async () => ({}),
      preparePictures: async () => {
        now += 121_619
        return ready
      },
      apply: async (_ctx, prepared) => {
        if (!prepared.realPicturesPrepared) prepared.realPictureShape = await legacy.preparePictures()
        assert.equal(prepared.realPictureShape, ready)
        now += 7
        return { wrote: 1 }
      }
    }
    const engine = createQuickstartFirstEngine({ legacy, woContent: {} })
    const ctx = context()
    const prepared = await engine.prepare(ctx)
    await preparePicturesBeforeApply(engine, ctx, prepared, 180_000)
    const started = Date.now()
    await engine.apply(ctx, prepared)
    const applyMs = Date.now() - started
    assert.equal(applyMs, 7, 'the 121.6 s drawing belongs to preparation, not the site write clock')
    assert.equal(now, 121_626, 'picture work ran exactly once')
  })
}

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
