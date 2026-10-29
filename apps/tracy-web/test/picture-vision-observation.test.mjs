import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { labelWithVision } from '../src/lib/picture-vision.js'
import { createEnginePictureClock } from '../src/sites/engine-picture-clock.js'

for (const trade of ['bakery', 'dental']) {
  test(`${trade}: the direct vision gateway observes fetch and body read during apply`, async () => {
    let time = 0
    const clock = createEnginePictureClock({ now: () => time })
    const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#996633' } })
      .jpeg()
      .toBuffer()
    try {
      await clock.run(async () => {
        clock.startApply()
        const result = await labelWithVision({
          door: { url: 'https://model.test/chat', key: 'fictional-key', model: 'vision' },
          trade,
          pictures: [{ id: 'fictional-photo', bytes }],
          challengeFor: async () => ({ expectedCode: 'ABC12345', image: 'data:image/png;base64,eA==' }),
          fetchImpl: async () => {
            time = 4
            assert.equal(clock.report().pictureCallsDuringApply, 1)
            return {
              ok: true,
              json: async () => {
                time = 9
                return {
                  choices: [
                    {
                      message: {
                        content: JSON.stringify({
                          imageCode: 'ABC12345',
                          pictures: [{ id: 'fictional-photo', subject: 'other' }]
                        })
                      }
                    }
                  ]
                }
              }
            }
          }
        })
        clock.endApply()
        assert.equal(result.labels.size, 1)
      })
      assert.equal(clock.report().visionDuringApplyMs, 9)
      assert.equal(clock.report().pictureCallsDuringApply, 1)
      assert.equal(clock.report().findings[0].severity, 'error')
    } finally {
      clock.close()
    }
  })
}
