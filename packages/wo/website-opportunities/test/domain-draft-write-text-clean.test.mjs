// The words of the draft write made safe for Joomla before any door (ticket #597, faults of the real run on plugin
// 0.24.85): a content plugin code (`{loadposition x}`, `{emailcloak=off}`) in the owner's words ran on the page, and
// was refused in a contract slot; control characters were refused or read back otherwise. One rule in `safeOps` for
// every value with an order entry and every worded column of a created record, whatever its column kind; kit owned
// text untouched. Real JA Boxing kit, invented florist, invented words.
//
//   node --test --test-concurrency=1 packages/wo/website-opportunities/test/domain-draft-write-text-clean.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { writePlanOf } from '../domain/draft-write-plan.mjs'
import { cleanText, WORD_JOINER } from '../domain/draft-write-text-clean.mjs'
import { checkWriteOrder, placesOfOrder } from '../domain/write-order-check.mjs'
import { memoryDoors } from '../domain/write-order-memory-doors.mjs'
import { boxingSite } from './fixtures/draft-write/boxing-site.mjs'

const site = await boxingSite()
const WJ = WORD_JOINER
/** The plugin's own directive pattern: a value it would refuse in a slot, and a page plugin would act on. */
const DIRECTIVE = /\{\/?[a-z][^{}]*\}/i
const ch = (code) => String.fromCodePoint(code)

test('a plugin code keeps its words with a word joiner after the brace; an address takes %7B', () => {
  assert.deepEqual(cleanText('Visit {loadposition shop-news} today'), {
    value: `Visit {${WJ}loadposition shop-news} today`,
    stripped: 0,
    neutralised: 1
  })
  for (const code of [
    '{emailcloak=off}',
    '{loadmodule mod_custom,Promo}',
    '{loadmoduleid 12}',
    '{source}',
    '{/source}'
  ])
    assert.equal(DIRECTIVE.test(cleanText(`a ${code} b`).value), false, code)
  assert.equal(
    cleanText('https://shop.example/{loadposition x}', { address: true }).value,
    'https://shop.example/%7Bloadposition x}'
  )
  // Braces that open no code stay as they are.
  assert.equal(cleanText('Sizes {1, 2} and { spaced }').value, 'Sizes {1, 2} and { spaced }')
})

test('control characters, invisible and direction controls are taken out; a line end is a space in one line', () => {
  const typed = [
    'a',
    ch(1),
    'b',
    ch(8),
    'c',
    ch(0x1b),
    'd',
    ch(13),
    ch(10),
    'e',
    ch(0x7f),
    ch(0x200b),
    'f'
  ].join('')
  assert.deepEqual(cleanText(typed), { value: 'abcd ef', stripped: 6, neutralised: 0 })
  const direction = [ch(0x202e), 'abc', ch(0x202c), ' ', ch(0x2067), 'def', ch(0x2069)].join('')
  assert.equal(cleanText(direction).value, 'abc def')
  // A whole HTML column keeps its line ends; the joiners that shape emoji and scripts stay everywhere.
  assert.equal(cleanText(`<p>a</p>${ch(10)}<p>b</p>`, { multiline: true }).value, `<p>a</p>${ch(10)}<p>b</p>`)
  const family = [ch(0x1f469), ch(0x200d), ch(0x1f33e)].join('')
  assert.equal(cleanText(family).value, family)
})

/** The order with invented words at the named entries and page names. */
function orderWith(words, pages = {}) {
  const order = structuredClone(site.order)
  const entries = new Map(
    placesOfOrder(order).flatMap(({ place }) => (place.fields ?? []).map((e) => [e.place, e]))
  )
  for (const [place, value] of Object.entries(words)) {
    assert.ok(entries.has(place), place)
    const entry = entries.get(place)
    // A fact reads the same everywhere and as the plan holds it: changed at every entry of it and in the plan data.
    const fact = entry.from === 'data' && (order.facts ?? []).find((f) => f.data === entry.data)
    if (!fact) entry.value = value
    else {
      for (const e of entries.values())
        if (e.from === 'data' && e.data === entry.data && e.textOf === undefined) e.value = value
      fact.value = value
    }
  }
  for (const [id, name] of Object.entries(pages)) {
    const page = order.pages.find((p) => p.id === id)
    page.name = name
    if (page.menu) page.menu.label = name
  }
  return order
}
const planOf = (order) => {
  assert.deepEqual(checkWriteOrder(order), [])
  return writePlanOf(order, site.aiq, { stored: site.stored })
}
const valuesOf = (plan, entry) =>
  plan.ops.flatMap((op) => (op.values ?? []).filter((v) => v.entry === entry).map((v) => ({ op, v })))

// One entry per kind of column the write fills with the owner's or the model's words.
const KINDS = {
  'class.class-b3.paragraph-2': 'article introtext, an HTML piece',
  'class.class-b3.paragraph': 'article fulltext, an HTML piece',
  'class.class-b3.heading-2': 'article attribs, a JSON key',
  'contact.contact-b4.paragraph': 'contact misc, an HTML piece',
  'home.home-b10.heading': 'a contract slot, a module title',
  'class.class-b3.trial-heading': 'a contract slot, a language string',
  'contact.contact-b4.paragraph-2': 'a contract slot, a custom field setting',
  'home.home-b10.address': 'a contract slot and a contact column, a fact'
}

test('every kind of column a value reaches holds the plugin code neutralised, reported once per value', () => {
  const words = Object.fromEntries(Object.keys(KINDS).map((k) => [k, 'Qx {loadposition q}']))
  const plan = planOf(orderWith(words, { classes: 'All {loadmodule mod_menu} bouquets' }))
  for (const [entry, kind] of Object.entries(KINDS)) {
    const got = valuesOf(plan, entry)
    assert.ok(got.length > 0, kind)
    for (const { op, v } of got) {
      assert.equal(DIRECTIVE.test(String(v.value)), false, `${kind}: ${op.key}`)
      assert.ok(String(v.value).includes(`{${WJ}loadposition q}`), kind)
      assert.ok(
        plan.cleaned.some(
          (c) => c.code === 'plugin_code_neutralised' && c.op === op.key && c.entry === entry && c.count === 1
        ),
        kind
      )
    }
  }
  // A created record's title: the menu item and the category named after the page.
  for (const key of ['menuItem:mainmenu:classes', 'category:class']) {
    const op = plan.ops.find((o) => o.key === key)
    assert.equal(op.fields.title, `All {${WJ}loadmodule mod_menu} bouquets`, key)
    assert.ok(
      plan.cleaned.some((c) => c.op === key && c.column === 'title'),
      key
    )
  }
})

test('the site name with control characters is written without them, and the change is reported', () => {
  const name = ['Larkspur', ch(1), ' Blooms', ch(13), ch(10)].join('')
  const plan = planOf(orderWith({ 'classes.classes-b3.default-title': name }))
  const identity = plan.ops.find((op) => op.kind === 'site.identity')
  assert.equal(identity.values.find((v) => v.loc.column === 'sitename').value, 'Larkspur Blooms ')
  assert.ok(plan.cleaned.some((c) => c.code === 'control_characters_stripped' && c.op === 'identity'))
})

test('kit owned text is untouched: a setting a hide writes, a mark, a frame', () => {
  const plan = planOf(site.order)
  assert.deepEqual(plan.cleaned, [])
  const show = plan.ops
    .flatMap((op) => op.values ?? [])
    .find((v) => v.rule === 'hides.setting' && JSON.stringify(v.loc).includes('show-on'))
  assert.equal(show.value, '0')
})

test('the memory site refuses what the plugin refuses in a slot, and takes the neutralised value', async () => {
  const memory = memoryDoors({ lock: site.kit.lock, contentMap: site.kit.blankContract })
  const slot = site.kit.blankContract.slots.find((s) => s.key === 'module-175.5')
  const apply = async (value) => {
    const { revision } = await memory.doors.inspect()
    return memory.doors.contract({
      applyId: `a-${value.length}-${revision}`,
      expectedRevision: revision,
      changes: { [slot.key]: value }
    })
  }
  await assert.rejects(apply('Qx {loadposition qxl}'), /Joomla plugin directives are not content/)
  await assert.rejects(apply(`Qx a${ch(1)}b`), /Markup and control characters are not content/)
  assert.deepEqual(await apply(cleanText('Qx {loadposition qxl}').value), { ok: true })
  await memory.doors.identity({ applyId: 'id-1', fields: { sitename: `A${ch(1)}B` } })
  assert.equal((await memory.doors.readIdentity()).sitename, 'AB')
})
