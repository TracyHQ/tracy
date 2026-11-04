// Tests for the site-copy/1 to Joomla contract mapping export (ADR 0042, #331).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contentMapKey, exportContractMapping, joinItems } from '../src/lib/site-copy/contract-mapping.js'
import { applyJoomlaContract } from '../../../packages/cms/tracy-seeder/src/apply-joomla-contract.mjs'
import { brief, copy, kit } from './_site-copy-check.mjs'

const run = (over = {}) =>
  exportContractMapping({
    copy: copy(),
    contract: 'demo-gym/j6/1.0.0',
    revision: 'rev-1',
    kit: kit(),
    brief: brief(),
    ...over
  })

// The shape rules applyJoomlaContract checks before it writes, restated here because the domain must not import
// package internals: scalar changes object, string values, non-empty revision, no pending inputs, evidence per change
// that needs it (here: every cited fact slot).
function assertDoorShape(mapping) {
  assert.equal(typeof mapping.contract, 'string')
  assert.ok(typeof mapping.revision === 'string' && mapping.revision)
  assert.ok(mapping.changes && typeof mapping.changes === 'object' && !Array.isArray(mapping.changes))
  assert.ok(Object.keys(mapping.changes).length > 0)
  for (const [k, v] of Object.entries(mapping.changes)) {
    assert.equal(typeof v, 'string', k)
    assert.ok(!k.startsWith('block-'), k)
  }
  assert.ok(Array.isArray(mapping.emptyLinks) && mapping.emptyLinks.every((k) => typeof k === 'string'))
  for (const k of mapping.emptyLinks) assert.ok(!(k in mapping.changes))
  assert.deepEqual(mapping.pending, [])
}

test('block ids become module keys, article and menu item ids stay', () => {
  assert.equal(contentMapKey('block-163.4'), 'module-163.4')
  assert.equal(contentMapKey('article-7.1'), 'article-7.1')
  assert.equal(contentMapKey('menuItem-12'), 'menuItem-12')
})

test('the mapping passes the door shape rules', () => {
  const { mapping, problems } = run()
  assert.deepEqual(problems, [])
  assertDoorShape(mapping)
  assert.equal(mapping.contract, 'demo-gym/j6/1.0.0')
})

test('label and writer slots are exported once each, hidden slots are absent', () => {
  const c = copy()
  const { mapping } = run()
  assert.equal(Object.keys(mapping.changes).length, c.slots.length)
  assert.equal(mapping.changes['module-1.1'], 'Join us')
  assert.ok('module-2.1' in mapping.changes)
  assert.ok(!('module-2.3' in mapping.changes))
  assert.ok(!Object.keys(mapping.changes).some((k) => k.startsWith('block-')))
})

test('article and menu item slots keep their ids', () => {
  const c = copy()
  c.slots.push({ slot: 'article-7.1', owner: 'writer', text: 'Body', factIds: [] })
  c.slots.push({ slot: 'menuItem-3', owner: 'plan-label', text: 'About', factIds: [] })
  const { mapping } = run({ copy: c })
  assert.equal(mapping.changes['article-7.1'], 'Body')
  assert.equal(mapping.changes['menuItem-3'], 'About')
})

test('a list of strings is joined as paragraphs, or as bullets when the kit slot is a bullet list', () => {
  const c = copy()
  c.slots.find((s) => s.slot === 'block-2.2').text = ['One.', 'Two.']
  const k = kit()
  assert.equal(run({ copy: c, kit: k }).mapping.changes['module-2.2'], '((p))One.((/p))\n((p))Two.((/p))')
  assert.equal(
    run({ copy: c, kit: undefined }).mapping.changes['module-2.2'],
    '((p))One.((/p))\n((p))Two.((/p))'
  )
  const slot = k.blocks[1].slots[1]
  slot.paragraphs = 0
  slot.bullets = 2
  assert.equal(
    run({ copy: c, kit: k }).mapping.changes['module-2.2'],
    '((ul))\n((li))One.((/li))\n((li))Two.((/li))\n((/ul))'
  )
})

test('cited facts become evidence, with values when a brief is passed', () => {
  const { mapping } = run()
  assert.match(mapping.evidence['module-2.1'], /f-name: Quay Fitness Studio/)
  assert.ok(!('module-1.1' in mapping.evidence))
  const bare = run({ brief: undefined }).mapping
  assert.equal(bare.evidence['module-2.1'], 'Brief facts: f-name')
})

test('alts and page meta go to the extras section', () => {
  const c = copy()
  const { mapping, extras } = run()
  assert.deepEqual(
    Object.keys(extras.alts),
    c.alts.map((a) => a.frame)
  )
  assert.deepEqual(
    Object.keys(extras.pageMeta),
    c.seo.map((s) => s.page)
  )
  assert.ok(c.alts.length > 0 && c.seo.length > 0)
  for (const f of Object.keys(extras.alts)) assert.ok(!(f in mapping.changes))
})

test('footer headings export like other slots, pages without kit slots go to extras.pages', () => {
  const c = copy()
  const { mapping, extras } = run()
  assert.equal(mapping.changes['module-6.1'], 'Our classes')
  assert.equal(mapping.changes['module-6.2'], 'Meet the coach')
  assert.deepEqual(Object.keys(extras.pages), ['legal:privacy', 'notFound'])
  assert.deepEqual(extras.pages.notFound, { title: c.pages[1].title, body: c.pages[1].body })
  for (const k of Object.keys(extras.pages)) assert.ok(!(k in mapping.changes))
})

// The real write door check, run dry against a fake site that knows every exported key (test only import).
test('the real applyJoomlaContract accepts the mapping in a dry run', async () => {
  const { mapping } = run()
  const slots = Object.keys(mapping.changes).map((key) => ({ key }))
  const apply = async () => ({ ok: true, contract: mapping.contract, slots, pages: [] })
  const out = await applyJoomlaContract({ apply, siteKey: 'demo', mapping, dry: true })
  assert.deepEqual(out.params.changes, mapping.changes)
  assert.deepEqual(out.params.evidence, mapping.evidence)
})

// A slot whose template sample holds a list is written in the sample's own form (same list tag and class).
test('several items follow the sample list form: lead paragraph, then list items with the same class', () => {
  const sample =
    '((p))Lead words((/p))\n\n((ul class="list-star"))\n\t((li))A((/li))\n\t((li))B((/li))\n((/ul))'
  const items = ['Lead', 'One', 'Two']
  assert.equal(
    joinItems(items, { paragraphs: 1, bullets: 2 }, sample),
    '((p))Lead((/p))\n((ul class="list-star"))\n((li))One((/li))\n((li))Two((/li))\n((/ul))'
  )
  assert.equal(
    joinItems(['One', 'Two'], { bullets: 2 }, '((ul class="list-star"))((li))A((/li))((/ul))'),
    '((ul class="list-star"))\n((li))One((/li))\n((li))Two((/li))\n((/ul))'
  )
  assert.equal(joinItems(['Only'], {}, sample), 'Only')
  assert.equal(joinItems(['One', 'Two'], { paragraphs: 2 }, '((p))x((/p))'), '((p))One((/p))\n((p))Two((/p))')
  assert.equal(
    joinItems(['One', 'Two'], { bullets: 2 }, ''),
    '((ul))\n((li))One((/li))\n((li))Two((/li))\n((/ul))'
  )
})
