// A row set whose highlighted card carries a modifier of its own class (`plan--featured` beside `plan`) is still one
// row set: the read pass counts every card, and the minimum measurement keeps and removes them together.
// Fabricated studio: three membership plans, the middle one featured.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chromium } from '@playwright/test'
import { keepRows } from '../template-kit/lib/measure-min.mjs'
import { readDetails } from '../template-kit/lib/read-details.js'

const card = (name, extra = '') =>
  `<div class="plan card${extra}" style="width:200px;height:120px"><h3>${name}</h3><p>Monthly</p></div>`
const HTML = `<div data-kit-block="plans-1"><div class="plans" style="display:flex;gap:10px">
  ${card('Starter')}${card('Club', ' plan--featured')}${card('Team')}</div></div>`

test('a modifier of a card class is not a shape of its own', async (t) => {
  let browser
  try {
    browser = await chromium.launch()
  } catch {
    return t.skip('no Chromium available')
  }
  try {
    const page = await browser.newPage()
    await page.setContent(HTML)
    const repeats = (await page.evaluate(readDetails))['plans-1'].repeats
    const set = repeats.find((r) => r.shape.includes('plan'))
    assert.ok(set, 'the cards form a row set')
    assert.equal(set.count, 3, 'the featured card counts with the others')
    const left = await page.evaluate(keepRows, {
      block: 'plans-1',
      path: set.path,
      shape: set.shape,
      keep: 2
    })
    assert.equal(left.total, 3)
    assert.equal(left.rows.length, 2)
  } finally {
    await browser.close()
  }
})
