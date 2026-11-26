// A slot that is one text node of an HTML value takes the writer's paragraphs as one (lib/site-copy/contract-mapping.js
// `isTextNodeSlot`). Dev arabian-tea-lat34 and lat36 (JA Diner Joomla, 2026-11-25/26): the reservation text, one `<p>` in
// the release, was written as three `((p))` paragraphs, stored as `<p></p><p>…</p><p>…</p><p>…</p><p></p>`, and every
// inspect after it answered `contract_failed` (the slot's xpath matched three text nodes), so the final check could read
// nothing. The release's own kit and content map; the business words are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openContentMap } from '../src/lib/content-map-source.js'
import { openKit } from '../src/lib/template-kit-source.js'
import { exportContractMapping, isTextNodeSlot, joinItems } from '../src/lib/site-copy/contract-mapping.js'

const REF = 'ja-diner/j6/1.0.8'
const kit = openKit(REF).doc
const contentMap = openContentMap(REF).doc
const copyOf = (slots) => ({
  version: 'site-copy/1',
  fingerprint: {
    kit: `${kit.kit} ${REF}`,
    planSha256: 'a'.repeat(64),
    briefSha256: 'b'.repeat(64),
    promptSha256: 'c'.repeat(64)
  },
  slots,
  alts: [],
  seo: [],
  pages: [],
  notebook: [],
  returns: []
})

test('a text node slot takes every paragraph of the writer as one, even where the kit counts three', () => {
  const slot = contentMap.slots.find((s) => s.key === 'article-28.4')
  assert.equal(isTextNodeSlot(slot), true)
  const { mapping } = exportContractMapping({
    copy: copyOf([
      {
        slot: 'article-28.4',
        owner: 'writer',
        text: [
          'Call the restaurant or send a WhatsApp message to book.',
          'The kitchen opens at 07:00 and closes at 23:00 every day.',
          'We are in Jumeirah, at the Mercato Shopping Mall.'
        ],
        factIds: []
      }
    ]),
    contract: REF,
    revision: 'r1',
    kit,
    contentMap
  })
  assert.equal(
    mapping.changes['article-28.4'],
    'Call the restaurant or send a WhatsApp message to book. The kitchen opens at 07:00 and closes at 23:00 every day. We are in Jumeirah, at the Mercato Shopping Mall.'
  )
  assert.doesNotMatch(mapping.changes['article-28.4'], /\(\(/)
})

test('a slot that is a whole element, or no HTML at all, keeps its paragraphs and lists', () => {
  assert.equal(isTextNodeSlot({ xpath: '/html/body/div/div[2]' }), false)
  assert.equal(isTextNodeSlot({ xpath: '/html/body/div/p[2]/text()[1]' }), true)
  assert.equal(isTextNodeSlot({ column: 'title' }), false)
  assert.equal(
    joinItems(['One.', 'Two.'], { paragraphs: 2 }, '', { xpath: '/html/body/div/div' }),
    '((p))One.((/p))\n((p))Two.((/p))'
  )
  assert.equal(
    joinItems(['One.', 'Two.'], { paragraphs: 2 }, '', { xpath: '/html/body/div/p/text()' }),
    'One. Two.'
  )
  assert.equal(
    joinItems(['One.', 'Two.'], { bullets: 2 }),
    '((ul))\n((li))One.((/li))\n((li))Two.((/li))\n((/ul))'
  )
})
