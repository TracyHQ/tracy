/**
 * A block a scroll reveal keeps faded out (opacity 0 with an opacity transition) is waited for before the blocks are
 * read: the last line of a page whose reveal observer skips the bottom of the window shows only when the script's
 * timer reveals it, and a block read before that is recorded as hidden and never shot. Fabricated bakery page.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { chromium } from '@playwright/test'

import { openFrozen } from '../template-kit/lib/capture.mjs'

const FIXTURE = pathToFileURL(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'scroll-reveal', 'page.html')
).href

async function launch() {
  try {
    return await chromium.launch()
  } catch {
    return null
  }
}

test('the last line of the page, faded out by a scroll reveal, is read as shown', async (t) => {
  const browser = await launch()
  if (!browser) return t.skip('no Chromium available')
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const opened = await openFrozen(ctx, FIXTURE, [], null)
    assert.ok(opened.page, opened.error)
    const last = opened.blocks.find((b) => b.block === 'module-7')
    assert.ok(last, 'the last line is found')
    assert.equal(last.visible, true)
    await opened.page.close()
    await ctx.close()
  } finally {
    await browser.close()
  }
})
