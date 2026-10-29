import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createBriefBuilds } from '../src/sites/brief-build.js'
import { briefOf } from '../src/sites/brief-store.js'
import { seeder } from '../src/lib/seeder.js'
import { fileDb } from './_db.mjs'

const db = fileDb()
before(db.open)
beforeEach(db.reset)
after(db.close)
const dbOpts = { skip: process.env.TEST_DATABASE_URL ? false : 'set TEST_DATABASE_URL' }

for (const trade of ['bakery', 'dental clinic']) {
  test(`${trade}: the production runner persists drawing in apply as an error finding`, dbOpts, async () => {
    let now = Date.now()
    const { chat } = await seeder('model')
    const b = createBriefBuilds({
      pool: db.pool,
      engines: {
        wordpress: {
          prepare: async () => ({}),
          apply: async () => {
            await chat(
              { url: 'https://model.example.test', key: 'fictional' },
              {
                model: 'fictional-picture-model',
                images: true,
                messages: []
              },
              async () => ({
                ok: true,
                json: async () => {
                  now += 121_619
                  return { choices: [{ message: {} }] }
                }
              })
            )
            return { wrote: 1 }
          }
        }
      },
      normalize: async () => ({ languages: ['en'] }),
      now: () => now,
      sleep: () => Promise.resolve(),
      pollMs: 1,
      recoverOnStart: false,
      log: { info() {}, warn() {} }
    })
    const siteKey = 'fictional.tracy.test'
    await b.start({
      siteKey,
      label: 'fictional',
      platform: 'wordpress',
      accountId: null,
      email: 'owner@example.test',
      quickstart: null,
      brief: { about: `A fictional ${trade}.` }
    })
    await b.gate(siteKey)
    await b.idle()
    const row = await briefOf(db.pool, siteKey)
    assert.equal(row.timings.drawingDuringApplyMs, 121_619)
    assert.equal(row.timings.pictureCallsDuringApply, 1)
    assert.equal(row.timings.findings[0].code, 'PICTURE_MODEL_DURING_APPLY')
    assert.equal(row.timings.findings[0].severity, 'error')
    assert.match(row.error, /picture|drawing|vision/i)
  })
}
