/**
 * The module boxes the label judge reads on every audited page: a page that does not open is a failure the measure
 * counts, never only a log line (a run whose second viewport lost the site recorded `failed: 0`).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addModuleBoxFailures, moduleBoxes } from '../content-coverage/lib/verify/module-boxes.mjs'

/** A browser whose pages answer every address but the ones in `down` for the viewports in `downOn`. */
function fakeChromium({ down, downOn }) {
  const page = (vp) => {
    let url = null
    return {
      goto: async (u) => {
        if (down.has(u) && downOn.has(vp))
          throw new Error(`page.goto: net::ERR_CONNECTION_REFUSED at ${u}\nCall log`)
        url = u
      },
      waitForLoadState: async () => {},
      evaluate: async (fn) =>
        typeof fn === 'function' && url ? { containers: [], 'module-7': { x: 0, y: 0, w: 10, h: 10 } } : {},
      mouse: { wheel: async () => {} },
      keyboard: { press: async () => {} },
      close: async () => {}
    }
  }
  const browser = { close: async () => {} }
  return {
    chromium: { launch: async () => browser },
    openContext: async (_b, vp) => ({ newPage: async () => page(vp), close: async () => {} })
  }
}

test('a page whose module boxes fail on one viewport is returned as a failure and counted as a failed page', async () => {
  const findings = {
    pages: [
      { n: 1, url: 'https://travel.example/' },
      { n: 2, url: 'https://travel.example/journeys' }
    ]
  }
  const { chromium, openContext } = fakeChromium({
    down: new Set(['https://travel.example/journeys']),
    downOn: new Set(['phone'])
  })
  const read = await moduleBoxes({ chromium, openContext, findings })
  assert.deepEqual(Object.keys(read.boxes).sort(), ['1', '2'])
  assert.deepEqual(Object.keys(read.boxes[2]), ['desktop'])
  assert.deepEqual(read.failures, [
    {
      url: 'https://travel.example/journeys',
      viewport: 'phone',
      error: 'page.goto: net::ERR_CONNECTION_REFUSED at https://travel.example/journeys'
    }
  ])

  const result = { failures: [] }
  addModuleBoxFailures(result, read.failures)
  assert.equal(result.failures.length, 1)
  assert.equal(result.failures[0].url, 'https://travel.example/journeys')
  assert.match(
    result.failures[0].error,
    /^module boxes not read \(phone: page\.goto: net::ERR_CONNECTION_REFUSED/
  )
})
