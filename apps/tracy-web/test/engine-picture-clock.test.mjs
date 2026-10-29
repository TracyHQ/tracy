import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createEnginePictureClock } from '../src/sites/engine-picture-clock.js'
import { seeder } from '../src/lib/seeder.js'

const { chat, observePictureCall } = await seeder('model')
const door = { url: 'https://model.test/chat', key: 'fictional-key' }
const answer = () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'done' } }] }) })
const waitFor = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

for (const trade of ['bakery', 'dental']) {
  test(`${trade}: provider drawing and vision become error findings during apply`, async () => {
    let time = 0
    const notes = []
    const clock = createEnginePictureClock({ now: () => time, onViolation: (message) => notes.push(message) })
    try {
      await clock.run(async () => {
        clock.startApply()
        await chat(
          door,
          { model: 'drawing', images: true, messages: [{ role: 'user', content: `A fictional ${trade}` }] },
          async () => {
            time = 7
            return answer()
          }
        )
        await chat(
          door,
          {
            model: 'vision',
            messages: [
              {
                role: 'user',
                content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,eA==' } }]
              }
            ]
          },
          async () => {
            time = 12
            return answer()
          }
        )
        clock.endApply()
      })
      const report = clock.report()
      assert.equal(report.drawingDuringApplyMs, 7)
      assert.equal(report.visionDuringApplyMs, 5)
      assert.equal(report.pictureCallsDuringApply, 2)
      assert.equal(report.findings[0].code, 'PICTURE_MODEL_DURING_APPLY')
      assert.equal(report.findings[0].severity, 'error')
      assert.equal(notes.length, 1)
    } finally {
      clock.close()
    }
  })
}

test('prepare pictures and text requests consume no apply picture time', async () => {
  let time = 0
  const clock = createEnginePictureClock({ now: () => time })
  try {
    assert.deepEqual(clock.report(), {})
    await clock.run(async () => {
      await observePictureCall('drawing', async () => {
        time = 8
      })
      clock.startApply()
      await chat(
        door,
        { model: 'words', messages: [{ role: 'user', content: 'A fictional bakery' }] },
        async () => {
          time = 11
          return answer()
        }
      )
      clock.endApply()
    })
    assert.deepEqual(clock.report(), {
      drawingDuringApplyMs: 0,
      visionDuringApplyMs: 0,
      pictureCallsDuringApply: 0,
      findings: []
    })
  } finally {
    clock.close()
  }
})

test('a picture begun in prepare is clipped to the write clock, including an active call at timeout', async () => {
  let time = 0
  const clock = createEnginePictureClock({ now: () => time })
  const wait = waitFor()
  try {
    await clock.run(async () => {
      const pending = observePictureCall('drawing', () => wait.promise)
      time = 4
      clock.startApply()
      time = 14
      clock.endApply()
      assert.equal(clock.report().drawingDuringApplyMs, 10)
      time = 30
      wait.resolve()
      await pending
    })
    assert.equal(clock.report().drawingDuringApplyMs, 10)
    assert.equal(clock.report().pictureCallsDuringApply, 1)
  } finally {
    clock.close()
  }
})

test('parallel builds, outside requests and calls after close never contaminate a receipt', async () => {
  const a = createEnginePictureClock()
  const b = createEnginePictureClock()
  try {
    a.startApply()
    b.startApply()
    await observePictureCall('drawing', async () => {})
    await Promise.all([
      a.run(() => observePictureCall('drawing', async () => {})),
      b.run(() => observePictureCall('vision', async () => {}))
    ])
    a.endApply()
    b.endApply()
    assert.equal(a.report().pictureCallsDuringApply, 1)
    assert.equal(b.report().pictureCallsDuringApply, 1)
    assert.equal(a.report().visionDuringApplyMs, 0)
    assert.equal(b.report().drawingDuringApplyMs, 0)
    a.close()
    await a.run(() => observePictureCall('drawing', async () => {}))
    assert.equal(a.report().pictureCallsDuringApply, 1)
  } finally {
    a.close()
    b.close()
  }
})

test('rejected and zero-duration picture calls still produce findings', async () => {
  const clock = createEnginePictureClock({ now: () => 0 })
  try {
    await clock.run(async () => {
      clock.startApply()
      await assert.rejects(
        observePictureCall('drawing', async () => {
          throw new Error('provider refused')
        })
      )
      clock.endApply()
    })
    assert.equal(clock.report().drawingDuringApplyMs, 0)
    assert.equal(clock.report().pictureCallsDuringApply, 1)
    assert.equal(clock.report().findings.length, 1)
  } finally {
    clock.close()
  }
})

test('concurrent drawings count union wall time rather than multiplying the apply budget', async () => {
  let time = 0
  const clock = createEnginePictureClock({ now: () => time })
  const first = waitFor()
  const second = waitFor()
  try {
    await clock.run(async () => {
      clock.startApply()
      const one = observePictureCall('drawing', () => first.promise)
      time = 2
      const two = observePictureCall('drawing', () => second.promise)
      time = 5
      first.resolve()
      await one
      time = 8
      second.resolve()
      await two
      clock.endApply()
    })
    assert.equal(clock.report().drawingDuringApplyMs, 8)
    assert.equal(clock.report().pictureCallsDuringApply, 2)
  } finally {
    clock.close()
  }
})
