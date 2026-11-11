// Reproduce BXR's module 161 repair target using its published measured kit and native image fit.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { pageItems } from '../src/write-step/repair-pass/repair-locate.js'
import { pageTurn } from '../src/write-step/repair-pass/repair-items.js'
import { withPictureSlot } from '../src/write-step/repair-pass/repair-picture-slots.js'

const artifact = new URL(
  '../../../packages/cms/tracy-joomla-quickstart/contracts/ja-boxing/j6/1.0.11/',
  import.meta.url
)
const kit = JSON.parse(await readFile(new URL('template-kit.json', artifact)))
const contentMap = JSON.parse(await readFile(new URL('content-map.json', artifact)))
const fault = { kind: 'demo-picture', page: '/', measured: 'images/joomlart/others/bg-cta.jpg' }
const pass = {
  kit,
  contentMap,
  urlOf: () => 'https://example.test/',
  agent: {},
  clock: { workLeft: () => 1000, within: async (fn) => ({ value: await fn() }) }
}

test('a measured demo background gets the exact native contract replacement before a generic module write', async () => {
  const [item] = await pageItems(pass, '/', [fault])
  assert.match(item.text, /content.contract operation apply for exact image slot module-161\.2/)
  assert.match(item.text, /fresh content.read or contract inspect and its expected_revision/)
  assert.match(item.text, /aspect 1\.5, tolerance 0\.02, minimum width 2160px/)
  assert.doesNotMatch(item.text, /aspect 2\.813/)
  assert.match(item.text, /Do not .*patch the whole module params/)
  assert.match(item.text, /frame cannot be hidden/)
  assert.match(item.text, /report the picture unresolved/)
  assert.equal(item.element.label, 'block-161.2')
  assert.ok(item.locate.levels.some((l) => l.native?.kind === 'module' && l.native.id === 161))
})

test('explicit block and native image keys resolve only on the measured page', () => {
  for (const slot of ['block-161.2', 'module-161.2']) {
    const exact = withPictureSlot({ ...fault, slot }, kit, contentMap)
    assert.equal(exact.pictureSlot.key, 'module-161.2')
    assert.equal(exact.pictureSlot.canHide, false)
  }
  const elsewhere = { ...fault, page: '/not-a-measured-page' }
  assert.equal(withPictureSlot(elsewhere, kit, contentMap), elsewhere)
})

test('ambiguous image paths and duplicate native declarations do not invent a binding', () => {
  const other = structuredClone(kit)
  const block = structuredClone(other.blocks.find((b) => b.id === 'block-161'))
  block.id = 'block-999'
  block.frames[0].id = 'block-999.2'
  other.blocks.push(block)
  other.pages.find((p) => p.path === '/').blocks['1440'].push(block.id)
  const map = structuredClone(contentMap)
  map.slots.push({ ...map.slots.find((s) => s.key === 'module-161.2'), key: 'module-999.2' })
  assert.equal(withPictureSlot(fault, other, map), fault)
  assert.equal(withPictureSlot({ ...fault, slot: 'block-161.2' }, other, map).pictureSlot.key, 'module-161.2')
  map.slots.push(map.slots.find((s) => s.key === 'module-161.2'))
  const explicit = { ...fault, slot: 'block-161.2' }
  assert.equal(withPictureSlot(explicit, other, map), explicit)
})

test('unmatched paths, unrelated kinds and unmeasured native fit preserve the original fault', () => {
  for (const value of [
    { ...fault, measured: 'images/unmatched.jpg' },
    { ...fault, kind: 'wrong-alt' },
    { ...fault, block: 'block-165' },
    { ...fault, slot: 'block-161.0' }
  ])
    assert.equal(withPictureSlot(value, kit, contentMap), value)
  const map = structuredClone(contentMap)
  map.slots.find((s) => s.key === 'module-161.2').fit.measured = false
  assert.equal(withPictureSlot(fault, kit, map), fault)
})

test('the delivered turn retains consent refusals and explains recoverable native write errors', async () => {
  const items = await pageItems(pass, '/', [fault])
  const turn = pageTurn(({ items: numbered }) => numbered.map((i) => i.text).join('\n'), items, [1])
  assert.match(turn, /exact image slot module-161\.2/)
  assert.match(turn, /After REVISION_STALE, inspect again/)
  assert.match(turn, /without HTML markup or control characters/)
  assert.match(turn, /After SLOT_IMAGE_INVALID, prepare the image to the native slot fit/)
  assert.match(turn, /If a site door returns CONFIRM_FIRST/)
  assert.match(turn, /Record that change as blocked/)
})
