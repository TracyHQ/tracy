import assert from 'node:assert/strict'
import { test } from 'node:test'

import { chromium } from '@playwright/test'

import { readDetails } from '../template-kit/lib/read-details.js'
import { assignSlotOwners, ownerTextsOf } from '../template-kit/lib/slot-owners.mjs'

test('inline heading keeps its own module owner beside a duplicate article headline', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(`<section data-kit-block="body-news"><h2>Efforts to curb soda consumption bring results on both coasts</h2></section>
      <section data-kit-block="block-121"><h2>Efforts to curb <span>soda consumption</span> bring results on both coasts</h2>
      <p>Visible <span style="display:none">secret</span> words</p>
      <p>Shown <span style="opacity:0">invisible</span> words</p>
      <div><p>Separate start</p><p>separate end</p></div>
      <div data-kit-block="nested"><h3>Nested words</h3></div></section>`)
    const details = await page.evaluate(readDetails)
    const own = details['block-121']
    assert.ok(
      own.texts.includes('Efforts to curb bring results on both coasts'),
      'atomic readings remain unchanged'
    )
    assert.ok(
      (own.inlineTexts ?? []).includes('Efforts to curb soda consumption bring results on both coasts')
    )
    assert.ok(own.inlineTexts.includes('Visible words'))
    assert.ok(own.inlineTexts.includes('Shown words'))
    assert.ok(!own.inlineTexts.some((x) => /secret|invisible|Nested/.test(x)))
    assert.ok(!own.inlineTexts.some((x) => /Separate start.*separate end/.test(x)))
    const blocks = [
      { id: 'body-news', source: { entity: 'article-24' }, slots: [{ id: 'block-121.9' }] },
      { id: 'block-121', source: { entity: 'module-121' }, slots: [{ id: 'block-121.9' }] }
    ]
    assignSlotOwners({
      blocks,
      slotOf: () => ({
        entity: 'module-121',
        sample:
          "Efforts to curb ((span class='highlight'))soda consumption((/span)) bring results on both coasts"
      }),
      textsOf: (id) => ownerTextsOf(details[id])
    })
    assert.equal(blocks[0].slots.length, 0)
    assert.equal(blocks[1].slots[0].id, 'block-121.9')
    assert.equal(ownerTextsOf({ texts: ['Legacy words'] }), 'legacy words', 'old captures remain readable')
  } finally {
    await browser.close()
  }
})
