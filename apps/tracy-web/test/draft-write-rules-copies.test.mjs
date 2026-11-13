// The copy rules measured on a real blank site (#584) that bind the draft write (#597), points 5 and 6, each a named
// test on the memory site after a run:
//
//   5  two plans containers on one page: each holding copy has its own position `tracy-tabs-<container id>`; the page
//      title block 162 is ONE copy for the site, its demo rows cut to the rows written; the social footer 171 is one
//      copy on every page; block 160 lists the category the build made, not the demo's catid 9
//   6  an empty button is hidden the way the contract declares (a setting, an element removed), an unused social row
//      is cut, paired values are written together, both versions of an icon are written
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-rules-copies.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { blankSite, florist, floristPlan, pageItemsOf, planOf, runOn } from './draft-write-fixtures.mjs'

const memory = blankSite()
await runOn(memory)
const refusal = (code) => (error) => error.code === code
const moduleOf = (site, note) => [...site.site.records.module.values()].find((r) => r.note === note)
const paramsOf = (row) => JSON.parse(row.params)
const acmOf = (row) => JSON.parse(paramsOf(row)['jatools-config'])

/** The plans page with a second container and its two tab blocks, made from the first (as #584 measured it). */
function twoContainers() {
  const order = structuredClone(florist.order)
  const page = order.pages.find((p) => p.id === 'plans')
  const rename = (block, from, to) =>
    JSON.parse(JSON.stringify(block).replaceAll(`plans-b${from}`, `plans-b${to}`))
  const more = [3, 4, 5].map((n) =>
    rename(
      page.blocks.find((b) => b.id === `plans-b${n}`),
      n,
      n + 3
    )
  )
  page.blocks.push(...more.map((b, i) => ({ ...b, order: page.blocks.length + i + 1 })))
  // The order lists every hidden place: the new blocks' hidden places join the list.
  const hidden = JSON.stringify(order.hidden)
  for (const n of [3, 4, 5])
    order.hidden.push(
      ...order.hidden
        .filter((h) => JSON.stringify(h).includes(`plans-b${n}.`))
        .map((h) => rename(h, n, n + 3))
    )
  assert.notEqual(JSON.stringify(order.hidden), hidden)
  return order
}

test('rule 5: two plans containers on one page, each holding copy on its own position tracy-tabs-<container id>', async () => {
  const site = blankSite()
  await runOn(site, { plan: planOf(twoContainers()) })
  const positions = new Set()
  for (const [container, held] of [
    ['plans-b3', ['plans-b4', 'plans-b5']],
    ['plans-b6', ['plans-b7', 'plans-b8']]
  ]) {
    const holder = moduleOf(site, `copy:plans.${container}`)
    const position = `tracy-tabs-${holder.id}`
    positions.add(position)
    assert.ok(holder.params.includes(position), `${container} loads ${position}`)
    for (const id of held) assert.equal(moduleOf(site, `copy:plans.${id}`).position, position, id)
  }
  assert.equal(positions.size, 2)
})

test('rule 5: the page title block 162 is one copy for the site, its demo rows cut to the rows written', () => {
  const copies = [...memory.site.records.module.values()].filter(
    (r) => r.note?.startsWith('copy:') && r.note.includes('162')
  )
  assert.equal(copies.length, 1)
  const demoRows = JSON.parse(florist.kit.lock.entities['module-162'].params).menuitem_config.item_id.length
  const cut = floristPlan.ops.find((op) => op.key === 'copy:site.block-162').cuts[0]
  const rows = paramsOf(copies[0]).menuitem_config
  assert.ok(demoRows > cut.kept.length, `${demoRows} demo rows`)
  for (const array of cut.row.arrays) assert.equal(rows[array].length, cut.kept.length, array)
  const items = pageItemsOf(memory)
  assert.deepEqual(memory.site.assignments.get(copies[0].id), [items.classes.id, items.contact.id])
})

test('rule 5: the social footer 171 is one copy shown on every page', () => {
  const copies = [...memory.site.records.module.values()].filter((r) => r.note === 'copy:site.block-171')
  assert.equal(copies.length, 1)
  assert.deepEqual(memory.site.assignments.get(copies[0].id), [0])
})

test('rule 5: block 160 lists the category the build made, not the demo catid 9', () => {
  assert.deepEqual(paramsOf(florist.kit.lock.entities['module-160']).catid, [9])
  const category = [...memory.site.records.category.values()]
  assert.equal(category.length, 1)
  assert.deepEqual(paramsOf(moduleOf(memory, 'copy:home.home-b5')).catid.map(Number), [category[0].id])
})

test('rule 6: a button with no label and no address is hidden by its setting (160 section-link "0")', () => {
  const control = floristPlan.controls.find((c) => c.record === 'copy:home.home-b5')
  assert.deepEqual([control.by, control.written], ['setting', [false, false]])
  assert.equal(paramsOf(moduleOf(memory, 'copy:home.home-b5'))['section-link'], '0')
})

test('rule 6: a button with no label and no address is removed from its HTML (157 top-desc link)', () => {
  const control = floristPlan.controls.find((c) => c.record === 'copy:home.home-b4')
  assert.deepEqual([control.by, control.written], ['rows.remove', [false, false]])
  const html = paramsOf(moduleOf(memory, 'copy:home.home-b4'))['top-desc']
  assert.throws(() => memory.doors.html.get(html, '/html/body/div/div/a'), refusal('HTML_SLOT_MISSING'))
  assert.equal(memory.doors.html.get(html, '/html/body/div/div/@class'), 'bottom-actions')
})

test('rule 6: social rows with no link are cut, never left as empty circles linking to "/"', async () => {
  const social = acmOf(moduleOf(memory, 'copy:site.block-171')).social
  const demo = JSON.parse(paramsOf(florist.kit.lock.entities['module-171'])['jatools-config']).social
  assert.ok(demo['social-intro[link]'].length > 3)
  assert.equal(social['social-intro[link]'].length, 3)
  for (const link of social['social-intro[link]']) assert.match(link, /^https:\/\//)
  const order = structuredClone(florist.order)
  for (const page of order.pages)
    for (const block of page.blocks.filter((b) => b.block === 'block-171'))
      block.items = block.items.slice(0, 1)
  const site = blankSite()
  await runOn(site, { plan: planOf(order) })
  const one = acmOf(moduleOf(site, 'copy:site.block-171')).social
  assert.equal(one['social-intro[link]'].length, 1)
  assert.equal(one['social-intro[font-icon]'].length, 1)
})

test('rule 6: paired values are written together: a button label with its address, in one apply', () => {
  for (const c of floristPlan.controls)
    assert.ok(c.written.every(Boolean) || !c.written.some(Boolean), c.record)
  const header = floristPlan.ops.find((op) => op.key === 'contract:store:module-176')
  assert.deepEqual(header.values.map((v) => v.loc.slot).sort(), ['module-176.0', 'module-176.1'])
  assert.notEqual(memory.site.slots.get('module-176.1').current.trim(), '')
})

test('rule 6: both versions of an icon are written (157 light and dark), one alone is refused', async () => {
  const order = structuredClone(florist.order)
  const icons = order.icons.filter((i) => i.id.startsWith('home.home-b4.service-seasonal-posy.'))
  for (const icon of icons)
    Object.assign(icon, { source: 'library', state: 'show', icon: { name: 'flower-rose' } })
  for (const page of order.pages)
    for (const at of [page, ...page.blocks, ...page.blocks.flatMap((b) => b.items ?? [])])
      for (const i of at.icons ?? [])
        if (icons.some((x) => x.id === i.id))
          Object.assign(
            i,
            icons.find((x) => x.id === i.id)
          )
  const site = blankSite()
  await runOn(site, { plan: planOf(order, { iconKeys: ['flower-rose'] }) })
  const intro = acmOf(moduleOf(site, 'copy:home.home-b4'))['features-intro']
  assert.match(intro['features-intro[img-icon]'][0], /^images\/tracy\//)
  assert.match(intro['features-intro[img-light-icon]'][0], /^images\/tracy\//)
  const one = structuredClone(order)
  for (const page of one.pages)
    for (const at of [page, ...page.blocks, ...page.blocks.flatMap((b) => b.items ?? [])])
      for (const i of at.icons ?? [])
        if (i.id.endsWith('.item-icon-2')) Object.assign(i, { source: 'none', icon: null })
  one.icons = one.icons.map((i) => (i.id.endsWith('.item-icon-2') ? { ...i, source: 'none', icon: null } : i))
  assert.throws(
    () => planOf(one, { iconKeys: ['flower-rose'] }),
    (error) => error.code === 'pair_incomplete'
  )
})

test('hides omit: a plan card on the plans page shows no empty feature bullet; its button is written empty', async () => {
  const memory = blankSite()
  await runOn(memory)
  for (const id of ['plans-b4', 'plans-b5']) {
    const cards = acmOf(moduleOf(memory, `copy:plans.${id}`))['features-intro']
    assert.equal(cards['features-intro[item-info]'].length, 1, id)
    assert.doesNotMatch(cards['features-intro[item-info]'][0], /\(\(li\)\)/, id)
    assert.deepEqual(cards['features-intro[title-btn]'], [''], id)
  }
})
