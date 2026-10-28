/**
 * Slot fit and the audit measure boxes in a real browser. A sticky header must measure at its resting place:
 * the page sets `scroll-behavior: smooth`, so a plain `scrollTo(0, 0)` after waking lazy content is still
 * animating when the boxes are read, and a sticky element lands wherever the animation had got to.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from '@playwright/test'

import { openContext, renderPage } from '../content-coverage/lib/render.mjs'

const FIXTURE = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'sticky', 'page.html')
).href

async function launch() {
  try {
    return await chromium.launch()
  } catch {
    return null
  }
}

test('a sticky header gets the same box on every run, at the top of the page', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  try {
    const boxes = []
    for (let run = 0; run < 3; run++) {
      const ctx = await openContext(browser, 'desktop')
      const r = await renderPage(ctx, FIXTURE, { screenshot: false })
      await ctx.close()
      const item = r.data.items.find(
        (i) => String(i.value).includes('Harbor Lane Bakery') && i.kind !== 'title'
      )
      assert.ok(item, 'the header text is extracted')
      boxes.push(item.rect)
    }
    for (const b of boxes) assert.deepEqual(b, boxes[0])
    assert.ok(boxes[0].y < 40, `the sticky header rests at the top, got y=${boxes[0].y}`)
  } finally {
    await browser.close()
  }
})
