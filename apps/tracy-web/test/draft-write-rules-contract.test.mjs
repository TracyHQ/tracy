// The plugin rules measured on a real blank site (#584) that bind the draft write (#597), points 2 and 4: the memory
// site behind the doors enforces them (`write-order-memory-doors.mjs`), and the plan follows them, each a named test.
//
//   2  through content.contract on a slot that opens empty: a straight double quote is refused (curly quotes are
//      written); clearing a text node writes one space, never an empty string; an emptied module title is written in
//      the same apply as that module's first other value (175), and a new module has a title (167)
//   4  inline formatting: `codes` (the map's codes) only at an ACM data place, `html` (real tags) at an HTML place;
//      plain text is always valid
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-rules-contract.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { textAt } from 'website-opportunities/domain/draft-write-values.mjs'
import { placesOfOrder } from 'website-opportunities/domain/write-order-check.mjs'
import { blankSite, florist, planOf, runOn } from './draft-write-fixtures.mjs'

const refusal = (code) => (error) => error.code === code
/** Markup a field does not declare: refused by the order check already (redoable there), else by the plan guard. */
const forbidden = (error) =>
  error.code === 'markup_forbidden' ||
  (error.code === 'order_invalid' && error.details.codes.includes('markup_forbidden'))
/** The order with the value of one field changed. */
function orderWith(changes) {
  const order = structuredClone(florist.order)
  for (const { place } of placesOfOrder(order))
    for (const e of place.fields ?? []) if (e.place in changes) e.value = changes[e.place]
  return order
}
let calls = 0
/** One apply through the contract door, as the write sends it: after an inspect, with its own apply id. */
const apply = async (memory, changes, removes = []) =>
  memory.doors.contract({
    applyId: `test-apply-${(calls += 1)}`,
    expectedRevision: (await memory.doors.inspect()).revision,
    changes,
    removes
  })
const moduleOf = (memory, note) => [...memory.site.records.module.values()].find((r) => r.note === note)

test('rule 2: a straight double quote into a slot that opens empty is refused; the write sends curly quotes', async () => {
  const memory = blankSite()
  await assert.rejects(apply(memory, { 'module-175.5': 'Our "little" shop' }), refusal('SLOT_NOT_CONTENT'))
  const plan = planOf(orderWith({ 'home.home-b10.heading': 'Our "little" shop' }))
  await runOn(memory, { plan })
  assert.equal(memory.site.slots.get('module-175.5').current, 'Our “little” shop')
  assert.equal(memory.site.records.module.get(175).title, 'Our “little” shop')
})

test('rule 2: clearing a text node writes one space, an empty string is refused', async () => {
  const memory = blankSite()
  await assert.rejects(
    apply(memory, { 'module-175.5': 'Visit', 'module-175.1': '' }),
    refusal('HTML_SLOT_MISSING')
  )
  const cleared = textAt('', { loc: { xpath: '/html/body/div/a[1]/text()' }, via: 'contract' })
  assert.deepEqual(cleared, { value: ' ', rules: ['text_node_space'] })
  await apply(memory, { 'module-175.5': 'Visit', 'module-175.1': cleared.value })
  assert.equal(memory.site.slots.get('module-175.1').current, ' ')
})

test('rule 2: an emptied module title is written in the same apply as the first other value (175)', async () => {
  const memory = blankSite()
  assert.equal(memory.site.records.module.get(175).title, '')
  await assert.rejects(apply(memory, { 'module-175.2': 'Ambermoor' }), refusal('MODULE_TITLE_REQUIRED'))
  const op = planOf().ops.find((o) => o.key === 'contract:store:module-175')
  const slots = op.values.map((v) => v.loc.slot)
  assert.ok(slots.includes('module-175.5') && slots.length > 1, 'the title rides with the other values')
  await runOn(memory)
  assert.notEqual(memory.site.records.module.get(175).title.trim(), '')
})

test('rule 2: a new module has a title: the copies of 167 and 189 (titles emptied on the blank site) carry one', async () => {
  const memory = blankSite()
  await assert.rejects(
    memory.doors.update({
      applyId: 'test-new',
      kind: 'module',
      id: 0,
      fields: { title: ' ', module: 'mod_jacontenttype' }
    }),
    refusal('MODULE_TITLE_REQUIRED')
  )
  await runOn(memory)
  for (const note of ['copy:plans.plans-b4', 'copy:plans.plans-b5'])
    assert.notEqual(String(moduleOf(memory, note).title).trim(), '', note)
})

test('rule 4: codes are written at an ACM data place (the hero title), real tags at an HTML place (a heading)', async () => {
  const memory = blankSite()
  const order = orderWith({
    'home.home-b3.heading': 'Wild((span))blooms((/span))',
    'home.home-b4.heading': 'Fresh<br><span>daily</span>'
  })
  await runOn(memory, { plan: planOf(order) })
  const hero = JSON.parse(JSON.parse(moduleOf(memory, 'copy:home.home-b3').params)['jatools-config'])
  assert.equal(hero.hero['hero[title]'][0], 'Wild((span))blooms((/span))')
  const stored = JSON.parse(moduleOf(memory, 'copy:home.home-b4').params)['main-section']
  assert.equal(stored, 'Fresh<br/><span>daily</span>')
  // A piece reads as its node's text, never the raw value written.
  assert.equal(memory.doors.html.get(stored, '/html/body/div'), 'Freshdaily')
})

test('rule 4: codes at an HTML place, or a tag at a codes place, are refused before any door', async () => {
  // The real site would store the codes and print them as words: the memory site refuses them.
  await assert.rejects(
    apply(blankSite(), { 'module-175.5': 'Visit', 'module-175.2': 'Wrenfield((br/))Row' }),
    refusal('MARKERS_PRINTED_AS_WORDS')
  )
  assert.throws(() => planOf(orderWith({ 'home.home-b4.heading': 'A ((span))b((/span))' })), forbidden)
  assert.throws(() => planOf(orderWith({ 'home.home-b3.heading': 'Wild<span>blooms</span>' })), forbidden)
  assert.throws(() => planOf(orderWith({ 'home.home-b3.paragraph': 'Fresh <em>stems</em>' })), forbidden)
})

test('rule 4: plain text with no emphasis is written as is everywhere', async () => {
  const memory = blankSite()
  await runOn(memory, { plan: planOf(orderWith({ 'home.home-b4.heading': 'Fresh stems daily' })) })
  const heading = memory.doors.html.get(
    JSON.parse(moduleOf(memory, 'copy:home.home-b4').params)['main-section'],
    '/html/body/div'
  )
  assert.equal(heading, 'Fresh stems daily')
})
