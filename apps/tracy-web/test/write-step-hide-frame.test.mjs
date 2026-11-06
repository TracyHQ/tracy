// The page frame of the hide stage through the write step's entry point (ADR 0044, decision 4, item 1): pages and menu items
// the plan drops. The main menu items the plan hides stay the page settings stage's, so nothing is unpublished twice, and an
// item a kept page depends on is reported, never unpublished. Every fixture is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hideKit, planHiding, runHide } from './_write-step-hide.mjs'
import { copy } from './_write-step-run.mjs'

const menuRow = (id, path, over = {}) => ({
  kind: 'menuItem',
  id,
  published: 1,
  path,
  menutype: 'mainmenu',
  ...over
})
const entity = (n, path) => ({
  key: `menuItem-${n}`,
  kind: 'menuItem',
  identity: { menutype: 'mainmenu', path }
})
const unpublished = (site, id) =>
  site.updates().filter((c) => c.params.id === id && c.params.fields?.published === 0)
const lineOf = (report, slot) => report.slots.find((s) => s.slot === slot)

/** A kit whose header labels make `mainmenu` the main menu, and a content map of its items. */
function menuFixture(items) {
  const kit = hideKit()
  const label = (id) => ({
    id,
    role: 'editorial.button_label',
    type: 'text',
    maxCharacters: 20,
    sample: 'Demo',
    paragraphs: 1,
    bullets: 0
  })
  kit.doc.blocks[0].slots.push(label('menuItem-101.0'))
  const p = planHiding([])
  p.sharedBlocks[0].copy.push({
    slot: 'menuItem-101.0',
    says: 'home',
    text: 'Home',
    basis: 'trade',
    maxCharacters: 20
  })
  const c = copy()
  c.slots.push({ slot: 'menuItem-101.0', owner: 'plan-label', text: 'Home', factIds: [] })
  return { kit, plan: p, copy: c, contentMap: { entities: [entity(101, 'home'), ...items], slots: [] } }
}

const RUN = (fixture, records, site = {}) =>
  runHide({
    kit: fixture.kit,
    files: { plan: fixture.plan, copy: fixture.copy },
    deps: { contentMap: fixture.contentMap },
    site: { records, extraKeys: ['menuItem-101.0', 'menuItem-102.0', 'menuItem-103.0'], ...site }
  })

test('a main menu item the plan hides is unpublished once, by the page settings stage, and its label goes with it', async () => {
  const fixture = menuFixture([entity(102, 'home/old-offer')])
  const { report, site } = await RUN(fixture, [menuRow(101, 'home'), menuRow(102, 'home/old-offer')])
  assert.equal(unpublished(site, 102).length, 1, 'not twice')
  const label = lineOf(report, 'menuItem-102.0')
  assert.equal(label.status, 'hidden')
  assert.equal(label.ordered, '0')
  assert.deepEqual(label.readFrom.params, { kind: 'menuItem', id: 102 })
  assert.equal(lineOf(report, 'menuItem-102').status, 'written')
  const emptied = site.calls.find((c) => c.params.operation === 'apply').params.empty_slots ?? []
  assert.ok(!emptied.includes('menuItem-102.0'), 'a menu title is never emptied')
})

test('a label whose unpublish was refused is failed with it', async () => {
  const fixture = menuFixture([entity(102, 'home/old-offer')])
  const { report } = await RUN(fixture, [menuRow(101, 'home'), menuRow(102, 'home/old-offer')], {
    refuseUpdate: (_kind, id, fields) =>
      id === 102 && fields.published === 0 ? { ok: false, error: 'is_locked', message: 'locked' } : null
  })
  assert.equal(lineOf(report, 'menuItem-102.0').status, 'failed')
  assert.match(lineOf(report, 'menuItem-102.0').reason, /is_locked: locked/)
})

test('a dropped page outside the main menu has its item unpublished before the contract call, and reads back', async () => {
  const fixture = menuFixture([])
  const { report, site } = await RUN(fixture, [
    menuRow(101, 'home'),
    menuRow(120, 'about-us/old', { menutype: 'other' })
  ])
  assert.equal(unpublished(site, 120).length, 1)
  const update = unpublished(site, 120)[0]
  assert.ok(update.params.apply_id, 'a write carries an apply id')
  const contract = site.calls.find((c) => c.params.operation === 'apply')
  assert.ok(site.calls.indexOf(update) < site.calls.indexOf(contract), 'page frame first')
  const line = lineOf(report, 'page-old')
  assert.deepEqual([line.status, line.part, line.ordered], ['hidden', 'page-drop', '0'])
  assert.deepEqual(line.readFrom.params, { kind: 'menuItem', id: 120 })
})

test('a dropped page the main menu already takes away is not unpublished by the frame as well', async () => {
  const fixture = menuFixture([entity(120, 'about-us/old')])
  const { report, site } = await RUN(fixture, [menuRow(101, 'home'), menuRow(120, 'about-us/old')])
  assert.equal(unpublished(site, 120).length, 1, 'not twice')
  assert.equal(lineOf(report, 'page-old'), undefined, 'the menu line says it')
  assert.equal(lineOf(report, 'menuItem-120').status, 'written')
})

test('a dropped page with no menu item says so and writes nothing', async () => {
  const fixture = menuFixture([])
  const { report, site } = await RUN(fixture, [menuRow(101, 'home')])
  const line = lineOf(report, 'page-old')
  assert.equal(line.status, 'skipped')
  assert.match(line.reason, /no published menu item/)
  assert.equal(site.updates().filter((c) => c.params.fields?.published === 0).length, 0)
})

test('a menu item leaving the dropdown while a kept page opens it is not unpublished, and is reported', async () => {
  // The plan keeps page-about at /about-us but its main menu does not list it under a kept top-level item.
  const fixture = menuFixture([entity(102, 'home/about'), entity(103, 'home/other')])
  fixture.kit.doc.pages[1].path = '/home/about'
  const { report, site } = await RUN(fixture, [
    menuRow(101, 'home'),
    menuRow(102, 'home/about'),
    menuRow(103, 'home/other')
  ])
  assert.equal(unpublished(site, 102).length, 0, 'the kept page still opens')
  assert.equal(unpublished(site, 103).length, 1, 'the other one still goes')
  const line = lineOf(report, 'menuItem-102')
  assert.equal(line.status, 'failed')
  assert.match(line.reason, /page-about/)
  assert.match(line.reason, /\/home\/about/)
  assert.equal(lineOf(report, 'menuItem-102.0').status, 'failed')
})

test('a menu item a kept link leads to, or with a kept page under it, is not unpublished either', async () => {
  const fixture = menuFixture([entity(102, 'home/old'), entity(103, 'home/parent')])
  fixture.kit.doc.pages[1].path = '/home/parent/child'
  fixture.kit.doc.pages.push({ id: 'page-offer', path: '/home/old', blocks: {} })
  fixture.plan.pages[0].blocks[0].links = [{ link: 'block-2.link-1', leadsTo: 'page-offer' }]
  const { report, site } = await RUN(fixture, [
    menuRow(101, 'home'),
    menuRow(102, 'home/old'),
    menuRow(103, 'home/parent')
  ])
  assert.equal(unpublished(site, 102).length, 0)
  assert.equal(unpublished(site, 103).length, 0)
  assert.match(lineOf(report, 'menuItem-102').reason, /link/)
  assert.match(lineOf(report, 'menuItem-103').reason, /page-about/)
})

test('a dropped page a kept page lives under keeps its menu item, and the line says why', async () => {
  const fixture = menuFixture([])
  fixture.kit.doc.pages[1].path = '/about-us/old/still-here'
  const { report, site } = await RUN(fixture, [
    menuRow(101, 'home'),
    menuRow(120, 'about-us/old', { menutype: 'other' })
  ])
  assert.equal(unpublished(site, 120).length, 0)
  assert.equal(lineOf(report, 'page-old').status, 'failed')
  assert.match(lineOf(report, 'page-old').reason, /page-about/)
})

test('a menu that cannot be read fails the dropped page, and the run goes on', async () => {
  const fixture = menuFixture([])
  const { report, site } = await RUN(fixture, [], {
    hideDoor: undefined,
    overList: { ok: false, error: 'read_failed', message: 'no' }
  })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  assert.equal(lineOf(report, 'page-old').status, 'failed')
  assert.match(lineOf(report, 'page-old').reason, /read_failed/)
  assert.ok(site.calls.some((c) => c.params.operation === 'apply'))
})

const otherEntity = (n, path) => ({
  key: `menuItem-${n}`,
  kind: 'menuItem',
  identity: { menutype: 'other', path }
})
const hidingLabel = (fixture, n) => {
  fixture.plan.pages[0].blocks[0].hiddenSlots.push({ slot: `menuItem-${n}.0`, why: 'not in the brief' })
  return fixture
}

test('an item of another menu the plan hides is unpublished, since its title cannot be emptied', async () => {
  const fixture = hidingLabel(menuFixture([otherEntity(103, 'free-intro')]), 103)
  const { report, site } = await RUN(fixture, [
    menuRow(101, 'home'),
    menuRow(103, 'free-intro', { menutype: 'other' })
  ])
  assert.equal(unpublished(site, 103).length, 1)
  const emptied = site.calls.find((c) => c.params.operation === 'apply').params.empty_slots ?? []
  assert.ok(!emptied.includes('menuItem-103.0'))
  const label = lineOf(report, 'menuItem-103.0')
  assert.deepEqual([label.status, label.ordered], ['hidden', '0'])
  assert.deepEqual(label.readFrom.params, { kind: 'menuItem', id: 103 })
  assert.equal(lineOf(report, 'menuItem-103').status, 'written')
})

test('an item of another menu a kept page depends on stays published, and the line names the page', async () => {
  const fixture = hidingLabel(menuFixture([otherEntity(103, 'free-intro')]), 103)
  fixture.kit.doc.pages[1].path = '/free-intro/child'
  const { report, site } = await RUN(fixture, [
    menuRow(101, 'home'),
    menuRow(103, 'free-intro', { menutype: 'other' })
  ])
  assert.equal(unpublished(site, 103).length, 0)
  const line = lineOf(report, 'menuItem-103.0')
  assert.equal(line.status, 'failed')
  assert.match(line.reason, /page-about/)
  assert.ok(!/main menu/.test(line.reason), 'it is not the main menu')
})

test('a second run does not unpublish it again, and keeping it after all needs a new site', async () => {
  const fixture = hidingLabel(menuFixture([otherEntity(103, 'free-intro')]), 103)
  const first = await RUN(fixture, [menuRow(101, 'home'), menuRow(103, 'free-intro', { menutype: 'other' })])
  const rows = [menuRow(101, 'home'), menuRow(103, 'free-intro', { menutype: 'other', published: 0 })]
  const second = await runHide({
    kit: fixture.kit,
    files: { plan: fixture.plan, copy: fixture.copy },
    deps: { contentMap: fixture.contentMap, last: first.report },
    site: { records: rows, extraKeys: ['menuItem-101.0', 'menuItem-103.0'] }
  })
  assert.equal(second.report.status, 'done', JSON.stringify(second.report.cause))
  assert.equal(unpublished(second.site, 103).length, 0)
  assert.equal(lineOf(second.report, 'menuItem-103.0').unchanged, true)
  const kept = menuFixture([otherEntity(103, 'free-intro')])
  const refused = await runHide({
    kit: kept.kit,
    files: { plan: kept.plan, copy: kept.copy },
    deps: { contentMap: kept.contentMap, last: first.report },
    site: { records: rows, extraKeys: ['menuItem-101.0', 'menuItem-103.0'] }
  })
  assert.equal(refused.report.cause?.code, 'NEEDS_NEW_SITE', JSON.stringify(refused.report.cause))
  assert.match(refused.report.cause.reason, /menuItem-103 \(a menu item that was unpublished\)/)
})

test('a menu item no content map knows has no way to leave, and the report names it', async () => {
  const fixture = hidingLabel(menuFixture([]), 103)
  const { report } = await RUN(fixture, [menuRow(101, 'home')])
  assert.equal(lineOf(report, 'menuItem-103.0').status, 'failed')
  assert.deepEqual(
    report.noWayOut.map((n) => n.slot),
    ['menuItem-103.0']
  )
  assert.match(report.noWayOut[0].reason, /menuItem-103/)
})

test('whatever has no way out is named before the first write, an item a kept page needs among them', async () => {
  const fixture = hidingLabel(menuFixture([otherEntity(103, 'free-intro')]), 103)
  fixture.kit.doc.pages[1].path = '/free-intro/child'
  const seen = []
  const writesAtNaming = []
  const run = await runHide({
    kit: fixture.kit,
    files: { plan: fixture.plan, copy: fixture.copy },
    deps: {
      contentMap: fixture.contentMap,
      onNoWayOut: async (named) => {
        seen.push(named.map((n) => n.slot))
      }
    },
    site: {
      records: [
        menuRow(101, 'home'),
        menuRow(103, 'free-intro', { menutype: 'other' }),
        menuRow(120, 'about-us/old', { menutype: 'other' })
      ],
      extraKeys: ['menuItem-101.0', 'menuItem-103.0'],
      refuseUpdate: () => {
        writesAtNaming.push(seen.length)
        return null
      }
    }
  })
  assert.deepEqual(seen, [['menuItem-103.0']])
  assert.ok(writesAtNaming.length > 0 && writesAtNaming.every((n) => n === 1), 'named before any write')
  assert.equal(run.report.noWayOut[0].slot, 'menuItem-103.0')
})
