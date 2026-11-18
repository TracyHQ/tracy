// A menu item the plan relabels while its target cannot move (a component item, a page of its own): the label must not be
// written over the old target, or the menu prints the plan's words leading to the template's demo page. The item leaves the
// menus with its label instead (ADR 0044, closing ladder). Every business, address and fact here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readBackGroup } from '../src/site-check/read-back.js'
import { copy, KIT, plan, runStep } from './_write-step-run.mjs'
import { brief as baseBrief } from './_site-copy-check.mjs'

const row = (id, path, over = {}) => ({
  kind: 'menuItem',
  id,
  path,
  published: 1,
  type: 'component',
  menutype: 'mainmenu',
  ...over
})
const entity = (n, path) => ({
  key: `menuItem-${n}`,
  kind: 'menuItem',
  identity: { menutype: 'mainmenu', path }
})
const label = (id, sample) => ({
  id,
  role: 'editorial.menu_label',
  type: 'text',
  maxCharacters: 20,
  sample,
  paragraphs: 1,
  bullets: 0
})

/** A header whose item 102 opens the demo price list, a page of its own; the plan relabels it to lead to the about page. */
function stranded() {
  const kit = KIT()
  kit.doc.pages = [
    { id: 'page-home', path: '/', blocks: { 1440: ['block-1', 'block-2'] } },
    { id: 'page-about', path: '/about', blocks: { 1440: ['block-5'] } },
    { id: 'page-prices', path: '/prices', blocks: { 1440: [] } }
  ]
  kit.doc.blocks[0].slots.push(label('menuItem-102.0', 'Prices'))
  kit.doc.blocks[0].links = [
    {
      id: 'block-1.link-1',
      target: '/prices',
      action: 'navigation',
      menuItem: 'menuItem-102',
      menu: 'module-1'
    }
  ]
  const p = plan()
  p.sharedBlocks[0].links = [{ link: 'block-1.link-1', leadsTo: 'page-about', labelSlot: 'menuItem-102.0' }]
  p.sharedBlocks[0].copy.push({
    slot: 'menuItem-102.0',
    says: 'the coaches',
    text: 'Coaches',
    basis: 'trade',
    maxCharacters: 20
  })
  const c = copy()
  c.slots.push({ slot: 'menuItem-102.0', owner: 'plan-label', text: 'Coaches', factIds: [] })
  return { kit, p, c }
}

async function run() {
  const { kit, p, c } = stranded()
  return runStep(
    { plan: p, copy: c, brief: baseBrief() },
    {
      records: [{ ...row(101, 'home'), home: 1 }, row(12, 'about'), row(102, 'prices')],
      extraKeys: ['menuItem-102.0']
    },
    {
      kit,
      contentMap: { entities: [entity(101, 'home'), entity(12, 'about'), entity(102, 'prices')], slots: [] }
    }
  )
}

test('a relabelled menu item whose target cannot move leaves the menus with its label, never half written', async () => {
  const done = await run()
  const sent = done.site.applies().flatMap((a) => Object.keys(a.params?.changes ?? {}))
  assert.ok(!sent.includes('menuItem-102.0'), 'the plan label is not written over the demo target')
  const unpublished = done.site.updates().find((u) => u.params.id === 102 && u.params.fields?.published === 0)
  assert.ok(unpublished, 'the item, and the demo page that is its own, are unpublished')
  const link = done.line('block-1.link-1')
  assert.equal(link.status, 'hidden')
  assert.match(link.reason, /page of its own/)
  assert.deepEqual([link.ordered, link.readFrom.params], ['0', { kind: 'menuItem', id: 102 }])
  const words = done.line('menuItem-102.0')
  assert.equal(words.status, 'hidden')
  assert.match(words.reason, /label/)
})

test('the site check reads the stranded item as hidden on its row', async () => {
  const done = await run()
  const read = async (action, params) => done.site.door.apply({ siteKey: 's', action, params })
  const check = await readBackGroup.run({ report: done.report, read })
  assert.equal(check.lines['block-1.link-1'], 'match')
})
