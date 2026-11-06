// A vision capture asked for bands shoots only the tiles that reach one (the write step's finisher re-shoots only the blocks
// it repaired, #424). Driven through createVisionCapturer with a fake browser whose page is a tall blank document: what is
// asserted is the stream it yields, never how it scrolled.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { captureBody, layoutBands } from '../src/capture.js'
import { createVisionCapturer, reachesBand } from '../src/vision-capture.js'

/** A browser whose every page is `height` px tall, with no sticky band, no picture and no text box. */
function fakeBrowser(height) {
  return {
    async newContext({ viewport }) {
      let scrollY = 0
      const page = {
        setDefaultTimeout() {},
        async goto() {
          return { status: () => 200 }
        },
        async waitForLoadState() {},
        async waitForTimeout() {},
        async evaluate(fn, arg) {
          const code = String(fn)
          if (code.includes('scrollHeight'))
            return {
              height,
              viewportWidth: viewport.width,
              viewportHeight: viewport.height,
              y: scrollY,
              top: 0,
              bottom: 0,
              anchors: []
            }
          if (code.includes('IntersectionObserver')) return { ready: true, fontsReady: true, pending: [] }
          if (code.includes('childNodes')) return []
          if (code.includes('scrollTo'))
            scrollY = Math.min(Number(arg ?? 0), Math.max(0, height - viewport.height))
          return undefined
        },
        async screenshot() {
          return Buffer.from(`tile at ${scrollY}`)
        }
      }
      return { newPage: async () => page, close: async () => {} }
    }
  }
}

async function frames(layouts, height = 9000) {
  const capture = createVisionCapturer({ launched: async () => fakeBrowser(height), prepare: async () => {} })
  const out = []
  for await (const frame of capture({
    layouts,
    base: 'http://site.test',
    signal: AbortSignal.timeout(10_000)
  }))
    out.push(frame)
  return out
}

test('a width with bands is shot only where a tile reaches one, and still ends whole; a width without is shot whole', async () => {
  const out = await frames([{ key: 'home', path: '/', bands: { desktop: [{ y: 4000, height: 300 }] } }])
  const tiles = (viewport) => out.filter((f) => f.type === 'tile' && f.viewport === viewport)
  const desktop = tiles('desktop')
  assert.ok(desktop.length >= 1 && desktop.length <= 2, `${desktop.length} desktop tiles`)
  for (const tile of desktop)
    assert.ok(reachesBand([{ y: 4000, height: 300 }], tile.y, 900), `tile at ${tile.y}`)
  assert.ok(
    desktop.some((t) => t.y <= 4000 && t.y + 900 >= 4300),
    'the band is on one tile'
  )
  assert.deepEqual(
    desktop.map((t) => t.index),
    desktop.map((_, i) => i),
    'tiles are numbered as sent'
  )
  const ends = out.filter((f) => f.type === 'view-end')
  const desktopEnd = ends.find((f) => f.viewport === 'desktop')
  assert.equal(desktopEnd.complete, true, desktopEnd.reason)
  assert.ok(desktopEnd.skipped > 0)
  // The phone width named no band: every tile down to the end, as before.
  const phone = tiles('phone')
  assert.ok(phone.length >= Math.ceil(9000 / 844), `${phone.length} phone tiles`)
  assert.equal(ends.find((f) => f.viewport === 'phone').skipped, undefined)
})

test('a capture without bands shoots every tile, as before', async () => {
  const out = await frames([{ key: 'home', path: '/' }], 3000)
  const desktop = out.filter((f) => f.type === 'tile' && f.viewport === 'desktop')
  assert.ok(desktop.length >= 4, `${desktop.length} desktop tiles`)
  assert.equal(out.find((f) => f.type === 'view-end').complete, true)
})

test('the request carries well formed bands per layout and drops the rest, never refusing the capture for them', () => {
  assert.deepEqual(
    layoutBands({
      desktop: [
        { y: 10, height: 20 },
        { y: -1, height: 5 }
      ],
      phone: 'all'
    }),
    {
      desktop: [{ y: 10, height: 20 }]
    }
  )
  assert.equal(layoutBands({ desktop: [{ y: 1, height: 0 }] }), null)
  const asked = captureBody({
    label: 'acme',
    platform: 'joomla',
    layouts: [
      { key: 'home', path: '/', bands: { phone: [{ y: 0, height: 100 }] } },
      { key: 'about', path: '/about', bands: 'nonsense' }
    ]
  })
  assert.equal(asked.error, null)
  assert.deepEqual(asked.layouts[0].bands, { phone: [{ y: 0, height: 100 }] })
  assert.equal(asked.layouts[1].bands, undefined)
})
