import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { withMediaAdmission } from 'website-opportunities/src/media-admission.js'

function latch() {
  let release
  const promise = new Promise((resolve) => {
    release = resolve
  })
  return { promise, release }
}

test('research jobs share five media slots held from fetch through completed object storage', async () => {
  const store = latch()
  const full = latch()
  let retained = 0
  let peak = 0
  const fetched = []
  const job = (name) =>
    withMediaAdmission('image', async () => {
      fetched.push(name)
      // The downloaded buffer stays retained while object storage is pending.
      retained += 1
      peak = Math.max(peak, retained)
      if (retained === 5) full.release()
      await store.promise
      retained -= 1
      return name
    })
  const records = Array.from({ length: 12 }, (_, i) => job(`${i % 2 ? 'shared' : 'legacy'}-${i}`))
  try {
    await full.promise
    await nextTurn()
    assert.equal(fetched.length, 5)
    assert.equal(retained, 5)
  } finally {
    store.release()
  }
  assert.deepEqual(
    await Promise.all(records),
    Array.from({ length: 12 }, (_, i) => `${i % 2 ? 'shared' : 'legacy'}-${i}`)
  )
  assert.equal(peak, 5)
  assert.equal(retained, 0)
})

test('a queued video waits for all image stores and prevents later images from overtaking it', async () => {
  const imageStore = latch()
  const videoStore = latch()
  const imageEntered = latch()
  const videoEntered = latch()
  const order = []
  const image = withMediaAdmission('image', async () => {
    order.push('image')
    imageEntered.release()
    await imageStore.promise
  })
  await imageEntered.promise
  const video = withMediaAdmission('video', async () => {
    order.push('video')
    videoEntered.release()
    await videoStore.promise
  })
  const later = withMediaAdmission('image', async () => {
    order.push('later image')
  })
  try {
    await nextTurn()
    assert.deepEqual(order, ['image'])
    imageStore.release()
    await videoEntered.promise
    await nextTurn()
    assert.deepEqual(order, ['image', 'video'])
  } finally {
    imageStore.release()
    videoStore.release()
    await Promise.all([image, video, later])
  }
  assert.deepEqual(order, ['image', 'video', 'later image'])
})

test('fetch, decoder and object storage rejections release image and exclusive video permits', async () => {
  for (const kind of ['image', 'video']) {
    for (const phase of ['fetch', 'decode', 'store']) {
      const failed = withMediaAdmission(kind, async () => {
        throw new Error(`${phase} failed`)
      })
      const next = withMediaAdmission('video', async () => 'stored')
      await assert.rejects(failed, new RegExp(`${phase} failed`))
      assert.equal(await next, 'stored')
    }
  }
  assert.deepEqual(
    await Promise.all(Array.from({ length: 5 }, (_, i) => withMediaAdmission('image', async () => i))),
    [0, 1, 2, 3, 4]
  )
})
