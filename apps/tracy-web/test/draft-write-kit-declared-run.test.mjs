// The kit's measured build declarations as a run writes them on a blank site in memory (#597): the accent module on
// both sides (fact L1), the listed pages of a menu as `url` items to their address and an alias item with the link
// Joomla stores (K3), and every key of a created row (K1). The invented florist on the real JA Boxing kit.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-kit-declared-run.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { memoryHtml } from 'website-opportunities/domain/write-order-memory-doors.mjs'
import { checkUpdate } from 'website-opportunities/domain/write-order-memory-rules.mjs'
import { MEMORY_TEMPLATE_ACCENT } from 'website-opportunities/domain/write-order-memory-sheets.mjs'
import { templateAccentOf } from '../src/step-chain-draft-write-accent.js'
import { baseFieldsOf, writtenFields } from '../src/step-chain-draft-write-ops.js'
import { blankSite, florist, pageItemsOf, planOf, runOn } from './draft-write-fixtures.mjs'

const DARK = '#e7a3b6'
const order = structuredClone(florist.order)
order.look.accentDark = DARK
const plan = planOf(order)
const memory = blankSite()
const report = await runOn(memory, { plan })
const records = memory.site.records

test('the accent module is written as declared, the light tone on the root and the dark one under the dark hook', () => {
  assert.equal(report.status, 'done')
  const accent = florist.aiq.mapping.look.accent
  const op = plan.ops.find((o) => o.kind === 'look.accent')
  const row = [...records.module.values()].find((m) => m.note === op.mark)
  assert.ok(row, 'the accent module is made')
  assert.deepEqual(
    [row.module, row.position, row.title, JSON.parse(row.params).style],
    [accent.writtenAs.module, accent.writtenAs.position, accent.writtenAs.title, accent.writtenAs.style]
  )
  assert.ok(row.content.includes(`:root{--tracy-accent:${order.look.accent}`), row.content.slice(0, 200))
  assert.ok(row.content.includes(`:root${accent.sides.darkHook}{--tracy-accent:${DARK}`))
  assert.ok(row.content.includes(`replaces=${MEMORY_TEMPLATE_ACCENT}`))
  assert.deepEqual(memory.site.assignments.get(row.id), [0])
})

test('the template accent is the one colour the root gives the accent variables; none or two stop typed', () => {
  const vars = ['--color-primary', '--body-link-color']
  assert.equal(
    templateAccentOf([':root{--color-primary:#AA3311;--body-link-color:#aa3311}'], vars),
    '#aa3311'
  )
  for (const sheets of [[], [':root{--color-primary:#aa3311}', ':root{--body-link-color:#113355}']]) {
    let code = null
    try {
      templateAccentOf(sheets, vars)
    } catch (error) {
      code = error.code
    }
    assert.equal(code, 'accent_template_colour_unknown')
  }
})

test('a listed page of a page-address menu is a url item linking its page item', () => {
  const items = pageItemsOf(memory, plan)
  const listed = [...records.menuItem.values()].filter((m) => m.menutype === 'site-map')
  assert.ok(listed.length > 0)
  const classes = listed.find((m) => m.link === `index.php?Itemid=${items.classes.id}`)
  assert.ok(classes, JSON.stringify(listed.map((m) => m.link)))
  assert.deepEqual([classes.type, Number(classes.component_id)], ['url', 0])
})

test('an alias item is sent with the link Joomla stores for one; the memory site refuses an empty link', () => {
  const ctx = { plan, state: { ids: { 'menuItem:mainmenu:plans': 2001 } } }
  const op = {
    recordKind: 'menuItem',
    fields: { title: 'Plans', alias: 'plans-2', menutype: 'site-map', home: 0 },
    link: { ref: 'page:plans', form: 'alias' }
  }
  const fields = baseFieldsOf(op, ctx)
  assert.deepEqual(
    [fields.type, fields.link, JSON.parse(fields.params).aliasoptions],
    ['alias', 'index.php?Itemid=', '2001']
  )
  assert.doesNotThrow(() => checkUpdate({ kind: 'menuItem', id: 0, fields }, records))
  assert.throws(
    () => checkUpdate({ kind: 'menuItem', id: 0, fields: { ...fields, link: '' } }, records),
    /creating a menuItem needs link/
  )
})

test('a created row is written with every key it declares, the plan value kept where it gives one', () => {
  const loc = (key) => ({
    entity: 'article-16',
    column: 'attribs',
    jsonPath: ['exer-features', 'exer-features0', key]
  })
  const op = {
    kind: 'article.create',
    values: [{ loc: loc('feature_title'), value: 'Warm up' }],
    fills: ['exer_img', 'exer_video_id', 'feature_desc', 'feature_title'].map((k) => ({
      loc: loc(k),
      value: ''
    }))
  }
  const out = writtenFields({ attribs: '{}' }, op, { html: memoryHtml, state: { ids: {} }, plan })
  assert.deepEqual(JSON.parse(out.attribs)['exer-features']['exer-features0'], {
    exer_img: '',
    exer_video_id: '',
    feature_desc: '',
    feature_title: 'Warm up'
  })
})
