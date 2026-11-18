// A planner run frozen with kitInFirstMessage gets the whole kit in its first message and keeps the image tool
// (template-kit-source.js wholeKitFirstMessage): the parts it used to read in four tool turns are already there, and the
// part tool answers each as already in the first message. On the JA Boxing kit, with no model.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  KIT_TOOL_NAMES,
  kitParts,
  kitTools,
  openKit,
  wholeKitFirstMessage
} from '../src/site-planner/kit-source.js'
import { brief } from './_site-plan-check-inputs.mjs'

const kit = () => openKit('ja-boxing/j6/1.0.10')

/** The JSON object of parts the message carries, read back from its text. */
function carriedOf(text) {
  const start = text.indexOf('The template kit, by part id:')
  const json = text.slice(text.indexOf('{', start), text.indexOf('\n\nInput 1, the brief'))
  return JSON.parse(json)
}

test('the first message carries contents, the site, the page groups, the pages and every block, then the brief', () => {
  const k = kit()
  const { text, inFirstMessage } = wholeKitFirstMessage({ kit: k, brief: brief() })
  const carried = carriedOf(text)
  const parts = kitParts(k.doc)
  for (const id of ['contents', 'site', 'pageGroups', 'pages']) assert.ok(id in carried, id)
  for (const block of k.doc.blocks) assert.ok(block.id in carried, block.id)
  // Each carried part is exactly what the part tool would answer for it.
  for (const [id, value] of Object.entries(carried)) assert.deepEqual(value, JSON.parse(parts.read(id)), id)
  // Every id the tool answers is marked as in the first message, page and group ids inside "pages" and "pageGroups" too.
  assert.deepEqual(new Set(inFirstMessage), new Set(parts.ids()))
  assert.match(text, /Input 1, the brief, is this JSON:/)
  assert.match(text, new RegExp(`${KIT_TOOL_NAMES.openImage}\\(id\\) opens one kit image`))
})

test('the part tool answers every part as already in the first message, and the image tool stays', async () => {
  const k = kit()
  const { inFirstMessage } = wholeKitFirstMessage({ kit: k, brief: brief() })
  const tools = kitTools(k.doc, { images: null, imageTool: true, inFirstMessage })
  assert.deepEqual(
    tools.map((t) => t.name),
    [KIT_TOOL_NAMES.readPart, KIT_TOOL_NAMES.openImage]
  )
  const page = k.doc.pages[0].id
  const block = k.doc.blocks[0].id
  for (const id of ['site', page, block]) {
    const answer = await tools[0].run({ id }, { call: 0 })
    const said = JSON.parse(typeof answer === 'string' ? answer : answer.text)
    assert.equal(said.alreadySent, id)
    assert.match(said.detail, /already sent in the first message/)
  }
})
