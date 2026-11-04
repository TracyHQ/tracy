// The page settings stage through the write step's entry point (ADR 0044, decision 4, item 4): page titles and
// descriptions, a contact's mobile line, a map, hidden menu items, and what has no door. A fake site door answers as the
// plugin does; the kit, plan and copy are the invented ones of the copy check tests, with pages and setting slots added.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copy, KIT, plan, runStep } from './_write-step-run.mjs'

const MAP_TEMPLATE =
  '{map locations=\'{"location":{"0":"<address>"},"latitude":{"0":"<latitude>"},"longitude":{"0":"<longitude>"}}\'}{/map}'

function kitWith() {
  const kit = KIT()
  kit.doc.pages = [
    { id: 'page-home', path: '/' },
    { id: 'page-about', path: '/about-us/coach' }
  ]
  kit.doc.site = {
    ...kit.doc.site,
    settingSlots: [
      {
        id: 'contact-1.mobile',
        kind: 'contact-mobile',
        writable: true,
        writeTo: { entity: 'contact-1', column: 'mobile' }
      },
      {
        id: 'block-2.map-location',
        kind: 'map-location',
        writable: true,
        writeTo: { entity: 'module-2', column: 'content', whole: true, template: MAP_TEMPLATE }
      },
      {
        id: 'site.body-background',
        kind: 'template-background',
        writable: true,
        writeTo: { action: 'template.siteSettings', key: 'bg' }
      }
    ]
  }
  return kit
}

const menuRow = (id, over = {}) => ({
  kind: 'menuItem',
  id,
  published: 1,
  home: 0,
  path: '',
  menutype: 'mainmenu',
  params: JSON.stringify({ page_title: 'Demo Gym', 'menu-meta_description': 'Template words', show_icon: 1 }),
  ...over
})

const records = () => [
  menuRow(101, { home: 1, path: 'home' }),
  menuRow(102, { path: 'about-us/coach' }),
  menuRow(103, { path: 'about-us/old-page' }),
  { kind: 'contact', id: 1, mobile: '' },
  { kind: 'module', id: 2, content: 'old map' }
]

function withSettings(c = copy()) {
  c.slots.push({ slot: 'contact-1.mobile', owner: 'writer', text: '+000 555 0199', factIds: [] })
  c.slots.push({
    slot: 'block-2.map-location',
    owner: 'writer',
    text: '12 Harbour Row\'s "Quay"',
    factIds: []
  })
  return c
}

test('a page title and description reach the menu item that opens the page, with every other param kept', async () => {
  const { report, site } = await runStep({}, { records: records() }, { kit: kitWith() })
  assert.equal(report.status, 'done')
  const home = JSON.parse(site.records.get('menuItem-101').params)
  assert.equal(home.page_title, 'Quay Fitness Studio, group classes')
  assert.match(home['menu-meta_description'], /^Small group classes/)
  assert.equal(home.show_icon, 1)
  assert.equal(
    JSON.parse(site.records.get('menuItem-102').params).page_title,
    'Our coach at Quay Fitness Studio'
  )
  assert.equal(
    site.records.get('menuItem-103').params.includes('Demo Gym'),
    true,
    'another page is untouched'
  )
  const title = report.slots.find((s) => s.slot === 'page-home:title')
  assert.deepEqual(
    [title.status, title.part, title.ordered, title.readFrom],
    [
      'written',
      'page-title',
      'Quay Fitness Studio, group classes',
      { action: 'content.get', params: { kind: 'menuItem', id: 101 }, path: ['item', 'params', 'page_title'] }
    ]
  )
  assert.equal(report.slots.find((s) => s.slot === 'page-about:description').status, 'written')
})

test('a page no menu item opens, and a page the kit does not know, are skipped with a reason', async () => {
  const kit = kitWith()
  kit.doc.pages.push({ id: 'page-lost', path: '/lost' })
  const c = copy()
  c.seo.push({ page: 'page-lost', title: 'Lost page of Quay', description: 'A page nothing opens.' })
  const { report } = await runStep({ copy: c }, { records: records() }, { kit })
  const lost = report.slots.find((s) => s.slot === 'page-lost:title')
  assert.equal(lost.status, 'skipped')
  assert.match(lost.reason, /no published menu item/)
  const privacy = report.slots.find((s) => s.slot === 'legal:privacy:title')
  assert.equal(privacy.status, 'skipped')
  assert.match(privacy.reason, /kit has no page/)
})

test('a page that is an article under a menu item keeps its title and description on the article', async () => {
  const kit = kitWith()
  kit.doc.blocks = [
    ...(kit.doc.blocks ?? []),
    { id: 'article-7-body', source: { owner: 'article-7', ownerKind: 'article' } }
  ]
  kit.doc.pages.push({ id: 'page-spin', path: '/classes/spin', blocks: { 1440: ['article-7-body'] } })
  const c = copy()
  c.seo.push({ page: 'page-spin', title: 'Spin classes at Quay', description: 'Spin on the quay.' })
  const row = { kind: 'article', id: 7, attribs: JSON.stringify({ show_title: '1', article_page_title: '' }) }
  const { report, site } = await runStep({ copy: c }, { records: [...records(), row] }, { kit })
  const title = report.slots.find((s) => s.slot === 'page-spin:title')
  const description = report.slots.find((s) => s.slot === 'page-spin:description')
  assert.equal(title.status, 'written', title.reason)
  assert.deepEqual(title.readFrom.path, ['item', 'attribs', 'article_page_title'])
  assert.deepEqual(title.readFrom.params, { kind: 'article', id: 7 })
  assert.equal(description.status, 'written', description.reason)
  assert.deepEqual(description.readFrom.path, ['item', 'metadesc'])
  const update = site.calls.find(
    (call) => call.action === 'content.update' && call.params?.kind === 'article'
  )
  assert.equal(update.params.fields.metadesc, 'Spin on the quay.')
  const attribs = JSON.parse(update.params.fields.attribs)
  assert.equal(attribs.article_page_title, 'Spin classes at Quay')
  assert.equal(attribs.show_title, '1', 'the article keeps its other settings')
})

test('the contact mobile line and the map are written from the kit fields and reported with a read', async () => {
  const { report, site } = await runStep({ copy: withSettings() }, { records: records() }, { kit: kitWith() })
  assert.equal(site.records.get('contact-1').mobile, '+000 555 0199')
  const map = site.records.get('module-2').content
  assert.match(map, /"0":"12 Harbour Row’s \\"Quay\\""/, 'no single quote, escaped as JSON')
  assert.match(map, /"latitude":\{"0":""\}/, 'no place id gives no coordinates')
  const mobile = report.slots.find((s) => s.slot === 'contact-1.mobile')
  assert.deepEqual([mobile.status, mobile.ordered, mobile.owner], ['written', '+000 555 0199', 'writer'])
  assert.deepEqual(mobile.readFrom, {
    action: 'content.get',
    params: { kind: 'contact', id: 1 },
    path: ['item', 'mobile']
  })
  const line = report.slots.find((s) => s.slot === 'block-2.map-location')
  assert.equal(line.status, 'written')
  assert.equal(line.ordered, map)
  assert.deepEqual(line.readFrom.path, ['item', 'content'])
  assert.equal(
    report.slots.some((s) => /setting slot/.test(s.reason ?? '')),
    false,
    'no setting slot is left set aside'
  )
})

test('coordinates from a place go into the map, as a pair', async () => {
  const place = { latitude: 25.2, longitude: 55.27 }
  const { site } = await runStep({ copy: withSettings() }, { records: records() }, { kit: kitWith(), place })
  assert.match(site.records.get('module-2').content, /"latitude":\{"0":"25.2"\},"longitude":\{"0":"55.27"\}/)
  const half = await runStep(
    { copy: withSettings() },
    { records: records() },
    { kit: kitWith(), place: { latitude: 25.2 } }
  )
  assert.match(half.site.records.get('module-2').content, /"latitude":\{"0":""\},"longitude":\{"0":""\}/)
})

test('a setting slot the kit marks not writable, or another writer owns, is skipped with its reason', async () => {
  const kit = kitWith()
  kit.doc.site.settingSlots[0].writable = false
  const c = withSettings()
  c.slots.push({ slot: 'site.body-background', owner: 'writer', text: 'images/x.jpg', factIds: [] })
  const { report, site } = await runStep({ copy: c }, { records: records() }, { kit })
  const mobile = report.slots.find((s) => s.slot === 'contact-1.mobile')
  assert.equal(mobile.status, 'skipped')
  assert.match(mobile.reason, /not writable/)
  assert.equal(site.records.get('contact-1').mobile, '')
  const background = report.slots.find((s) => s.slot === 'site.body-background')
  assert.equal(background.status, 'skipped')
  assert.match(background.reason, /template\.siteSettings/)
})

test('a refusal is failed in the plugin words and the other items still go', async () => {
  const refuseUpdate = (kind) =>
    kind === 'contact'
      ? { ok: false, error: 'too_long', message: 'mobile is longer than 22 characters' }
      : null
  const { report, site } = await runStep(
    { copy: withSettings() },
    { records: records(), refuseUpdate },
    { kit: kitWith() }
  )
  assert.equal(report.status, 'done')
  const mobile = report.slots.find((s) => s.slot === 'contact-1.mobile')
  assert.equal(mobile.status, 'failed')
  assert.equal(mobile.reason, 'too_long: mobile is longer than 22 characters')
  assert.equal(mobile.ordered, '+000 555 0199')
  assert.equal(report.slots.find((s) => s.slot === 'block-2.map-location').status, 'written')
  assert.equal(report.slots.find((s) => s.slot === 'page-home:title').status, 'written')
  assert.equal(site.records.get('contact-1').mobile, '')
  assert.equal(report.counts.failed, 1)
})

const MENU_KEYS = ['menuItem-101.0', 'menuItem-102.0']

/** A kit, plan, copy and content map in which the main menu keeps one top-level item and drops the other two. */
function menuFixture() {
  const kit = kitWith()
  const label = (id, sample) => ({
    id,
    role: 'editorial.button_label',
    type: 'text',
    maxCharacters: 20,
    sample,
    paragraphs: 1,
    bullets: 0
  })
  kit.doc.blocks[0].slots.push(label('menuItem-101.0', 'Home'), label('menuItem-102.0', 'Coach'))
  const p = plan()
  p.sharedBlocks[0].copy.push({
    slot: 'menuItem-102.0',
    says: 'coach link',
    text: 'Coach',
    basis: 'trade',
    maxCharacters: 20
  })
  const c = copy()
  c.slots.push({ slot: 'menuItem-102.0', owner: 'plan-label', text: 'Coach', factIds: [] })
  const entity = (n, path) => ({
    key: `menuItem-${n}`,
    kind: 'menuItem',
    identity: { menutype: 'mainmenu', path }
  })
  const contentMap = {
    entities: [entity(101, 'home'), entity(102, 'about-us/coach'), entity(103, 'about-us/old-page')],
    slots: []
  }
  return { kit, plan: p, copy: c, contentMap }
}

test('the menu items the plan hides are unpublished and read back as published 0', async () => {
  const { kit, plan: p, copy: c, contentMap } = menuFixture()
  const { report, site } = await runStep(
    { plan: p, copy: c },
    { records: records(), extraKeys: MENU_KEYS },
    { kit, contentMap }
  )
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const hidden = report.slots.filter((s) => s.part === 'menu-hide')
  assert.deepEqual(hidden.map((s) => s.slot).sort(), ['menuItem-101', 'menuItem-103'])
  for (const line of hidden) {
    assert.equal(line.status, 'written')
    assert.equal(line.ordered, '0')
    assert.deepEqual(line.readFrom.path, ['item', 'published'])
  }
  assert.equal(site.records.get('menuItem-101').published, 0)
  assert.equal(site.records.get('menuItem-103').published, 0)
  assert.equal(site.records.get('menuItem-102').published, 1, 'the kept item stays')
})

test('a refused unpublish is failed in the plugin words and the other item still goes', async () => {
  const { kit, plan: p, copy: c, contentMap } = menuFixture()
  const refuseUpdate = (kind, id, fields) =>
    id === 101 && 'published' in fields
      ? { ok: false, error: 'is_home', message: 'the home item cannot be unpublished' }
      : null
  const { report, site } = await runStep(
    { plan: p, copy: c },
    { records: records(), refuseUpdate, extraKeys: MENU_KEYS },
    { kit, contentMap }
  )
  const line = (slot) => report.slots.find((s) => s.slot === slot)
  assert.equal(line('menuItem-101').status, 'failed')
  assert.equal(line('menuItem-101').reason, 'is_home: the home item cannot be unpublished')
  assert.equal(line('menuItem-103').status, 'written')
  assert.equal(site.records.get('menuItem-103').published, 0)
})

test('the legal and 404 pages are reported skipped, each with why', async () => {
  const { report } = await runStep({}, { records: records() }, { kit: kitWith() })
  const body = (page) => report.slots.find((s) => s.part === 'page-body' && s.slot === page)
  assert.equal(body('legal:privacy').status, 'skipped')
  assert.match(body('legal:privacy').reason, /article and a menu item/)
  assert.match(body('notFound').reason, /404 page/)
})

test('a menu that cannot be read fails the page lines with the reason and leaves the settings written', async () => {
  const site = await runStep({ copy: withSettings() }, { records: records() }, { kit: kitWith() })
  const unreadable = {
    async apply(call) {
      if (call.action === 'content.list')
        return { ok: false, error: 'menu_locked', message: 'the menu is locked' }
      return site.site.door.apply(call)
    }
  }
  const { report } = await runStep(
    { copy: withSettings() },
    { records: records() },
    { kit: kitWith(), door: unreadable }
  )
  assert.equal(report.status, 'done')
  const title = report.slots.find((s) => s.slot === 'page-home:title')
  assert.equal(title.status, 'failed')
  assert.match(title.reason, /menu_locked: the menu is locked/)
  assert.equal(report.slots.find((s) => s.slot === 'contact-1.mobile').status, 'written')
})
