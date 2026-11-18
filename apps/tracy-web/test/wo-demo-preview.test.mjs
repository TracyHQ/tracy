// The Your site card's build facts and home page picture (#537, `opportunities-build/demo-preview.js`): what a
// finished build took, the picture cut from the host's full page shot, and a capture that fails never failing a build.
//   node --test --test-concurrency=1 apps/tracy-web/test/wo-demo-preview.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import {
  builtFacts,
  createDemoBuilt,
  PREVIEW_HEIGHT,
  PREVIEW_MAX_BYTES,
  PREVIEW_WIDTH,
  previewPicture
} from '../src/opportunities-build/demo-preview.js'

const AT = Date.parse('2026-11-11T10:42:00Z')

/** A full page shot at the desktop width: a red first screen over a long blue page. */
async function fullPageShot(height = 3200) {
  const page = sharp({ create: { width: 1440, height, channels: 3, background: { r: 30, g: 60, b: 200 } } })
  const top = await sharp({
    create: { width: 1440, height: 900, channels: 3, background: { r: 210, g: 40, b: 30 } }
  })
    .png()
    .toBuffer()
  return page
    .composite([{ input: top, left: 0, top: 0 }])
    .png()
    .toBuffer()
}

/** A pool that records every statement. */
function recordingPool(site = { site_key: 'harbour-lane', label: 'harbour-lane', platform: 'joomla' }) {
  const asked = []
  return {
    asked,
    query: async (sql, params) => {
      asked.push({ sql, params })
      if (/from site where site_key/.test(sql)) return { rows: site ? [site] : [] }
      return { rows: [] }
    }
  }
}
const quiet = { warn: () => {}, info: () => {} }

test('a step chain build keeps its own minutes and cost; another build counts minutes from the press', () => {
  const chain = { totalMinutes: 26.04, totalUsd: 1.8371, steps: [{ usd: 1 }, { usd: 0.8 }] }
  assert.deepEqual(builtFacts({ chain, acceptedAt: null, at: AT }), {
    at: '2026-11-11T10:42:00.000Z',
    minutes: 26,
    usd: 1.84
  })
  // A chain without a total reads the sum of its steps.
  assert.equal(
    builtFacts({ chain: { totalMinutes: 3, steps: [{ usd: 0.5 }, { usd: 0.25 }] }, at: AT }).usd,
    0.75
  )
  assert.deepEqual(builtFacts({ acceptedAt: new Date(AT - 31 * 60_000), at: AT }), {
    at: '2026-11-11T10:42:00.000Z',
    minutes: 31,
    usd: null
  })
  assert.deepEqual(builtFacts({ at: AT }), { at: '2026-11-11T10:42:00.000Z', minutes: null, usd: null })
})

test('the picture is the first screen of the shot, 640 by 400 WebP under 80 KB', async () => {
  const picture = await previewPicture(await fullPageShot())
  assert.equal(picture.contentType, 'image/webp')
  const meta = await sharp(picture.bytes).metadata()
  assert.equal(meta.format, 'webp')
  assert.deepEqual([meta.width, meta.height], [PREVIEW_WIDTH, PREVIEW_HEIGHT])
  assert.ok(picture.bytes.length <= PREVIEW_MAX_BYTES)
  // The first screen is red: the long blue page below it is left out.
  const { data } = await sharp(picture.bytes).raw().toBuffer({ resolveWithObject: true })
  const [r, , b] = [data[(200 * PREVIEW_WIDTH + 320) * 3], 0, data[(200 * PREVIEW_WIDTH + 320) * 3 + 2]]
  assert.ok(r > 150 && b < 100, `middle pixel is red, got r=${r} b=${b}`)
})

test('a finished build keeps its facts and its picture', async () => {
  const pool = recordingPool()
  const png = (await fullPageShot()).toString('base64')
  const asked = []
  const demoBuilt = createDemoBuilt({
    pool,
    log: quiet,
    capture: async (site) => {
      asked.push(site.site_key)
      return {
        ok: true,
        body: {
          shots: [
            { key: 'home', width: 1440, ok: true, png },
            { key: 'home', width: 390, ok: true, png }
          ]
        }
      }
    }
  })
  await demoBuilt({
    build: { id: 'b-1', site_key: 'harbour-lane' },
    chain: { totalMinutes: 26, totalUsd: 1.84 },
    at: AT
  })
  assert.deepEqual(asked, ['harbour-lane'])
  const facts = pool.asked.find((q) => /set built/.test(q.sql))
  assert.deepEqual(JSON.parse(facts.params[1]), { at: '2026-11-11T10:42:00.000Z', minutes: 26, usd: 1.84 })
  const saved = pool.asked.find((q) => /insert into wo_build_preview/.test(q.sql))
  assert.equal(saved.params[0], 'b-1')
  assert.equal(saved.params[1], 'image/webp')
  assert.ok(Buffer.isBuffer(saved.params[2]) && saved.params[2].length <= PREVIEW_MAX_BYTES)
})

test('a capture that fails, throws or brings no desktop shot leaves no picture and never throws', async () => {
  const cases = [
    async () => ({ ok: false, status: 503, body: { code: 'NO_BROWSER' } }),
    async () => {
      throw new Error('host unreachable')
    },
    async () => ({
      ok: true,
      body: { shots: [{ key: 'home', width: 1440, ok: false, error: 'timed out' }] }
    }),
    async () => ({
      ok: true,
      body: { shots: [{ key: 'home', width: 1440, ok: true, png: 'bm90IGFuIGltYWdl' }] }
    })
  ]
  for (const capture of cases) {
    const pool = recordingPool()
    const warned = []
    const demoBuilt = createDemoBuilt({ pool, capture, log: { warn: (line) => warned.push(line) } })
    await demoBuilt({ build: { id: 'b-1', site_key: 'harbour-lane' }, at: AT })
    assert.ok(
      pool.asked.some((q) => /set built/.test(q.sql)),
      'the facts are still kept'
    )
    assert.equal(
      pool.asked.some((q) => /wo_build_preview/.test(q.sql)),
      false
    )
    assert.equal(warned.length, 1, 'the failure is logged')
  }
  // No host at all: facts only, nothing asked.
  const pool = recordingPool()
  await createDemoBuilt({ pool, capture: null, log: quiet })({ build: { id: 'b-1', site_key: 'x' }, at: AT })
  assert.equal(pool.asked.length, 1)
  // A pool that refuses even the facts still does not throw.
  const broken = { query: async () => Promise.reject(new Error('db down')) }
  await createDemoBuilt({ pool: broken, capture: null, log: quiet })({ build: { id: 'b-1' }, at: AT })
})
