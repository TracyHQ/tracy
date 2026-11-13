// A full run of the JA Boxing florist's write plan on a blank site in memory (#597): every page of the order exists
// in the main menu, each page shows its blocks (a module per block, in the page's order where they share a position),
// every value the plan writes reads back from the site as the order says it, and no demo text of the released
// quickstart is left on a module a page shows.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-run.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { placesOfOrder } from 'website-opportunities/domain/write-order-check.mjs'
import {
  blankSite,
  florist,
  floristPlan,
  modulesOfPage,
  pageItemsOf,
  runOn,
  snapshotOf
} from './draft-write-fixtures.mjs'

const memory = blankSite()
const report = await runOn(memory)
const items = pageItemsOf(memory)

/** Every string a value holds, JSON columns and HTML pieces opened. */
function stringsOf(value, out = []) {
  if (typeof value === 'string') {
    out.push(value)
    if (/^[[{]/.test(value.trim()))
      try {
        stringsOf(JSON.parse(value), out)
      } catch {}
    const pieces = /^<!--tracy-pieces (.*?)-->/s.exec(value)
    if (pieces) stringsOf(JSON.parse(pieces[1]), out)
  } else if (value && typeof value === 'object') for (const v of Object.values(value)) stringsOf(v, out)
  return out
}
const siteTexts = stringsOf(snapshotOf(memory))
const shows = (texts, words) => texts.some((t) => t.includes(words))
/** A value as the site stores it: straight quotes turned curly, HTML escaped where the write escapes it. */
const formsOf = (value) => [value, value.replace(/"/g, '”'), value.replace(/&/g, '&amp;')]

test('the run is done and ran every operation once', () => {
  assert.equal(report.status, 'done')
  assert.deepEqual(
    report.ran,
    floristPlan.ops.map((op) => op.key)
  )
  assert.equal(report.counts.ops, floristPlan.ops.length)
})

test('the main menu lists every page of the order, once, the home page as home', () => {
  const menu = [...memory.site.records.menuItem.values()].filter((r) => r.menutype === floristPlan.mainMenu)
  assert.equal(menu.length, florist.order.pages.length)
  for (const page of florist.order.pages) {
    assert.ok(items[page.id], page.id)
    assert.equal(items[page.id].title, page.name ?? items[page.id].title)
    assert.equal(items[page.id].home, page.id === 'home' ? 1 : 0, page.id)
  }
  assert.equal(new Set(menu.map((r) => r.alias)).size, menu.length)
})

test('every page shows a module for each of its blocks, in the page order where they share a position', () => {
  const lockOf = (block) => {
    const entity = florist.kit.mapping.placements?.[block]?.entity
    return entity?.startsWith('module-') ? Number(entity.slice(7)) : null
  }
  let checked = 0
  for (const page of florist.order.pages) {
    const shown = modulesOfPage(memory, items[page.id].id)
    const marks = [`copy:site.`, `copy:${page.id}.`, `library:${page.id}.`]
    const placed = []
    for (const block of page.blocks.filter((b) => b.state === 'show')) {
      const row = shown.find(
        (r) =>
          r.note === `copy:${page.id}.${block.id}` ||
          r.note === `library:${page.id}.${block.id}` ||
          r.note === `copy:site.${block.block}` ||
          r.id === lockOf(block.block)
      )
      // A block with no module of its own is the page's content (an article, a category list, a contact).
      if (!row) {
        assert.ok(
          !lockOf(block.block) && !shown.some((r) => r.note === `copy:${page.id}.${block.id}`),
          block.id
        )
        continue
      }
      placed.push({ block, row })
      checked += 1
    }
    for (const r of shown.filter((m) => marks.some((mark) => String(m.note ?? '').startsWith(mark))))
      assert.ok(
        placed.some((p) => p.row === r) || r.note.startsWith('copy:site.'),
        `${page.id} shows ${r.note}`
      )
    const byPosition = Map.groupBy(placed, (p) => p.row.position)
    for (const [position, group] of byPosition) {
      const orderings = group.map((p) => Number(p.row.ordering ?? 0))
      assert.deepEqual(
        orderings,
        [...orderings].sort((a, b) => a - b),
        `${page.id} ${position}`
      )
    }
  }
  assert.ok(checked > 20, `${checked} blocks checked`)
})

test('every value the plan writes reads back from the site as the order says it', () => {
  const written = new Set(floristPlan.ops.flatMap((op) => op.entries))
  const missing = []
  // A library block is written as the HTML the order rendered (a reviewer's name shortened there): read back whole.
  for (const { page, block } of placesOfOrder(florist.order).filter((at) => at.block.source === 'library')) {
    const row = [...memory.site.records.module.values()].find(
      (r) => r.note === `library:${page.id}.${block.id}`
    )
    assert.equal(row?.content, block.library.html, block.id)
  }
  for (const { place } of placesOfOrder(florist.order).filter((at) => at.block.source !== 'library'))
    for (const e of place.fields ?? [])
      if (
        written.has(e.place) &&
        typeof e.value === 'string' &&
        !formsOf(e.value).some((v) => shows(siteTexts, v))
      )
        missing.push(e.place)
  assert.deepEqual(missing, [])
  assert.ok(written.size > 100)
})

test('no demo text of the released quickstart is left on a module a page shows', () => {
  const demo = florist.kit.released.slots
    .map((s) => s.sample)
    .filter(
      (s) =>
        typeof s === 'string' && s.trim().length >= 12 && !/^(https?:|\/|images\/|#|index\.php|[[{<])/.test(s)
    )
  const shown = new Set(Object.values(items).flatMap((item) => modulesOfPage(memory, item.id)))
  const texts = stringsOf([...shown].map((r) => ({ title: r.title, content: r.content, params: r.params })))
  assert.ok(demo.length > 50, `${demo.length} demo texts`)
  assert.deepEqual(
    demo.filter((d) => shows(texts, d)),
    []
  )
})
