// A planner run frozen with kitIndexInFirstMessage (template-kit-source.js kitIndexFirstMessage): its first message
// carries the kit's contents, site, page groups and pages, the part tool answers those as already sent, and every block
// is still read with the tool. The shipped JA Diner kit; no database, no model.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { KIT_INDEX_PARTS, kitIndexFirstMessage, kitTools } from '../src/lib/template-kit-source.js'

const doc = JSON.parse(
  readFileSync(
    new URL(
      '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-diner/j6/1.0.8/template-kit.json',
      import.meta.url
    ),
    'utf8'
  )
)
const kit = { ref: 'ja-diner/j6/1.0.8', doc }
const brief = { business: { name: 'Arabian Tea House' } }

test('the first message carries the kit index by part id, then the brief; the blocks are left to the tool', () => {
  const { text, inFirstMessage } = kitIndexFirstMessage({
    kit,
    brief,
    visualReviewText: 'Open every page image.'
  })
  assert.deepEqual(inFirstMessage, [...KIT_INDEX_PARTS])
  const index = JSON.parse(
    text.slice(text.indexOf('by part id:\n\n') + 13, text.indexOf('\n\nInput 1, the brief'))
  )
  assert.deepEqual(Object.keys(index), ['contents', 'site', 'pageGroups', 'pages'])
  assert.equal(index.pageGroups.length, doc.pageGroups.length)
  assert.equal(index.pages.length, doc.pages.length)
  assert.ok(!('blocks' in index), 'no block is in the message')
  assert.match(text, /Open every page image\./)
  assert.ok(text.endsWith(JSON.stringify(brief)))
})

test('the part tool answers the index as sent in the first message and still reads every block', async () => {
  const { inFirstMessage } = kitIndexFirstMessage({ kit, brief })
  const read = kitTools(doc, { inFirstMessage }).find((t) => t.name === 'read_kit_part')
  for (const id of ['site', 'pageGroups', 'pages']) {
    const out = await read.run({ id }, { call: 0 })
    assert.match(out.text ?? out, /already sent in the first message/, id)
  }
  const block = doc.blocks.find((b) => b.slots?.length)
  const out = await read.run({ id: block.id }, { call: 0 })
  assert.equal(JSON.parse(out.text ?? out).id, block.id)
})
