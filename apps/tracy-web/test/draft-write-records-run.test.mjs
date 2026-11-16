// The faults of the real run of the draft write on plugin 0.24.85 (#597), reproduced on the memory site, which refuses
// what the plugin refuses: an alias with accents read back folded (`read_back_mismatch`), Joomla plugin codes refused
// in contract slots (modules, language strings, a custom field: `redo_failed`), control characters in the site name
// and a contract slot; and the #587 keys the write reads: the articles' author name (a column the door drops, flagged),
// the footer logo module on no page with no logo, articles published apart in the list's order. Invented florist, invented words.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-records-run.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placesOfOrder } from 'website-opportunities/domain/write-order-check.mjs'
import { blankSite, FIXED_NOW, florist, planOf, runOn } from './draft-write-fixtures.mjs'

const ch = (code) => String.fromCodePoint(code)
const DIRECTIVE = /\{\/?[a-z][^{}]*\}/i

/** The florist's order with invented words at entries (a fact everywhere it reads) and pages renamed. */
function orderWith(words, pages = {}) {
  const order = structuredClone(florist.order)
  const entries = placesOfOrder(order).flatMap(({ place }) => place.fields ?? [])
  for (const [place, value] of Object.entries(words)) {
    const entry = entries.find((e) => e.place === place)
    const fact = entry.from === 'data' && order.facts.find((f) => f.data === entry.data)
    if (fact) fact.value = value
    for (const e of fact ? entries.filter((x) => x.data === entry.data && x.textOf === undefined) : [entry])
      e.value = value
  }
  for (const [id, name] of Object.entries(pages)) {
    const page = order.pages.find((p) => p.id === id)
    page.name = name
    if (page.menu) page.menu.label = name
  }
  return order
}

// language-allow: invented page names in Polish and Greek, the alias fold under test
const NAMES = { classes: 'Łąka Różana', plans: 'Λουλούδια' }
const CODE = 'Qx {loadposition q}'
const WORDS = {
  'home.home-b10.heading': CODE,
  'class.class-b3.trial-heading': CODE,
  'contact.contact-b4.paragraph-2': CODE,
  'class.class-b3.paragraph-2': 'Qx {emailcloak=off}',
  'contact.contact-b4.paragraph': CODE,
  'classes.classes-b3.default-title': ['Larkspur', ch(1), ' Blooms'].join(''),
  'home.home-b10.address': ['7 Wrenfield', ch(0x1b), ' Row'].join('')
}

test('the faults of the real run write cleanly: accented aliases, plugin codes, control characters', async () => {
  const plan = planOf(orderWith(WORDS, NAMES))
  const memory = blankSite()
  const report = await runOn(memory, { plan })
  assert.equal(report.status, 'done')
  const items = [...memory.site.records.menuItem.values()]
  assert.ok(items.some((r) => r.alias === 'laka-rozana'))
  for (const r of items) assert.match(r.alias, /^[a-z0-9]+(-[a-z0-9]+)*$/)
  for (const slot of memory.site.slots.values()) assert.equal(DIRECTIVE.test(slot.current), false, slot.key)
  for (const kind of ['article', 'contact'])
    for (const row of memory.site.records[kind].values())
      assert.equal(DIRECTIVE.test(JSON.stringify(row)), false, `${kind} ${row.id}`)
  assert.equal(memory.site.identity.sitename, 'Larkspur Blooms')
  const codes = new Set(report.cleaned.map((c) => c.code))
  assert.deepEqual([...codes].sort(), ['control_characters_stripped', 'plugin_code_neutralised'])
})

test('without the rule the memory site refuses the same values as the plugin did', async () => {
  const plan = planOf(orderWith({ 'class.class-b3.trial-heading': CODE }))
  const op = plan.ops.find((o) => o.key === 'contract:store:languageString-76896395')
  // The value as the order holds it, written as a plan without the rule would send it.
  op.values[0].value = CODE
  await assert.rejects(
    runOn(blankSite(), { plan }),
    (e) => e.code === 'redo_failed' && e.details.cause === 'SLOT_NOT_CONTENT'
  )
})

test('the articles keep the site author (the door drops created_by_alias), the footer logo module is on no page', async () => {
  const memory = blankSite()
  const report = await runOn(memory)
  const articles = [...memory.site.records.article.values()]
  assert.ok(articles.length > 0)
  for (const a of articles) assert.equal(a.created_by_alias, undefined)
  assert.ok(report.unproven.some((u) => u.code === 'record_fact_no_door' && u.column === 'created_by_alias'))
  assert.deepEqual(memory.site.assignments.get(170), [])
})

test('created articles are published apart in the list order, the same on a resume after a crash', async () => {
  const memory = blankSite()
  await runOn(memory)
  const plan = planOf()
  const dated = plan.ops.filter((op) => op.dated).sort((a, b) => a.dated.rank - b.dated.rank)
  const rows = [...memory.site.records.article.values()]
  const byAlias = (op) => rows.find((r) => r.alias === op.fields.alias)
  const dates = dated.map((op) => byAlias(op).publish_up)
  assert.equal(new Set(dates).size, dates.length, 'distinct')
  assert.deepEqual([...dates].sort().reverse(), dates, 'rank 0 newest')
  assert.ok(Date.parse(`${dates[0]}Z`) < FIXED_NOW(), 'the newest is before the run time')
  // A run that dies, resumed later by another clock, writes the dates the first attempt kept.
  const record = {}
  const crashed = blankSite({ crash: 12 })
  await assert.rejects(runOn(crashed, { record }))
  await runOn(crashed, { record, now: () => FIXED_NOW() + 3_600_000 })
  const again = [...crashed.site.records.article.values()]
  assert.deepEqual(
    dated.map((op) => again.find((r) => r.alias === op.fields.alias).publish_up),
    dates
  )
})
