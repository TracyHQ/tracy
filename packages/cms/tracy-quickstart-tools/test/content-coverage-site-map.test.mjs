/**
 * The site map the coverage file carries (audit 1.6.0): which pages of the content map really open on the site and
 * which sit in the main menu, and what the header holds (logo, menu items, buttons, text). Every business, page, slot
 * and file here is invented.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { loadContract } from '../content-coverage/lib/contract.mjs'
import { buildCoverageFile } from '../content-coverage/lib/coverage-file.mjs'
import { PagePlan } from '../content-coverage/lib/pages.mjs'
import { headerOf, sitePagesOf } from '../content-coverage/lib/site-map.mjs'

const SITE = 'http://bakery.test/'

const menuItem = (id, menutype, title, type, extra = {}) => ({
  menutype,
  title,
  type,
  published: '1',
  level: '1',
  parent_id: '1',
  home: '0',
  params: '{"menu_show":1}',
  ...extra
})

/** An invented bakery: a main menu with a home, two pages, a menu group, an alias; a footer menu of `#` links. */
function contractDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-map-contract-'))
  const write = (name, value) => writeFileSync(path.join(dir, name), JSON.stringify(value))
  write('manifest.json', { id: 'ja-crumb/j6/1.0.0', template: 'ja_crumb' })
  const items = [101, 102, 103, 104, 105, 106, 107, 108]
  write('content-map.json', {
    entities: [
      ...items.map((id) => ({ key: `menuItem-${id}`, kind: 'menuItem', sourceId: id })),
      { key: 'module-9', kind: 'module', sourceId: 9 },
      { key: 'siteSetting-1', kind: 'siteSetting', sourceId: 1 }
    ],
    slots: [
      { key: 'module-9.0', entity: 'module-9', type: 'text', sample: 'Fresh loaves every morning' },
      { key: 'module-9.1', entity: 'module-9', type: 'text', sample: 'Order a cake' },
      { key: 'siteSetting-1.0', entity: 'siteSetting-1', type: 'image', sample: 'images/demo/crumb-logo.png' }
    ],
    pages: [
      { entity: 'menuItem-101', route: 'home', link: 'index.php?option=com_content&view=featured' },
      { entity: 'menuItem-102', route: 'breads', link: 'index.php?option=com_content&view=category&id=8' },
      { entity: 'menuItem-103', route: 'about', link: '' },
      { entity: 'menuItem-104', route: 'about/team', link: 'index.php?option=com_content&view=article&id=3' },
      { entity: 'menuItem-105', route: 'about/story', link: 'index.php?Itemid=' },
      { entity: 'menuItem-106', route: 'specials', link: '#' },
      { entity: 'menuItem-107', route: 'old-offers', link: 'index.php?option=com_content&view=article&id=9' },
      { entity: 'menuItem-108', route: 'catering', link: 'index.php?option=com_content&view=article&id=12' }
    ]
  })
  write('presentation-lock.json', {
    entities: {
      'menuItem-101': menuItem(101, 'mainmenu', 'Home', 'component', { home: '1' }),
      'menuItem-102': menuItem(102, 'mainmenu', 'Breads', 'component'),
      'menuItem-103': menuItem(103, 'mainmenu', 'About', 'heading'),
      'menuItem-104': menuItem(104, 'mainmenu', 'Our Team', 'component', { level: '2', parent_id: '103' }),
      'menuItem-105': menuItem(105, 'mainmenu', 'Our Story', 'alias', {
        level: '2',
        parent_id: '103',
        params: '{"aliasoptions":"102","menu_show":1}'
      }),
      'menuItem-106': menuItem(106, 'footer-links', 'Specials', 'url'),
      'menuItem-107': menuItem(107, 'mainmenu', 'Old offers', 'component', { published: '0' }),
      'menuItem-108': menuItem(108, 'mainmenu', 'Catering', 'component', { params: '{"menu_show":0}' })
    },
    files: {}
  })
  return dir
}

/** What a run of the audit returned: Breads opens, Our Team answers 404, Catering was never reached. */
function auditResult() {
  return {
    site: SITE,
    viewports: ['desktop'],
    pages: [
      {
        url: `${SITE}`,
        requested: `${SITE}index.php?Itemid=101`,
        status: 200,
        mapPages: [{ entity: 'menuItem-101', route: 'home' }],
        items: []
      },
      {
        url: `${SITE}breads`,
        requested: `${SITE}index.php?Itemid=102`,
        status: 200,
        mapPages: [{ entity: 'menuItem-102', route: 'breads' }],
        items: []
      }
    ],
    failures: [{ url: `${SITE}index.php?Itemid=104`, origin: 'map', mapPage: 'menuItem-104', status: 404 }],
    duplicates: [],
    skipped: [],
    offsite: [],
    capReached: true,
    summary: { pages: 2, mappedPages: 2, unmappedPages: 0 },
    header: {
      found: true,
      measuredOn: '/',
      logo: { image: '/images/demo/crumb-logo.png', alt: 'Crumb & Co', text: null, href: '/' },
      menu: [
        { text: 'Home', href: '/', depth: 0, visible: true },
        { text: 'Breads', href: '/breads', depth: 0, visible: true },
        { text: 'About', href: null, depth: 0, visible: true },
        { text: 'Our Team', href: '/about/team', depth: 1, visible: false },
        { text: 'Gift cards', href: '#', depth: 0, visible: true },
        { text: 'Partner farm', href: 'https://farm.example/', depth: 0, visible: true }
      ],
      buttons: [
        { text: 'Order a cake', href: '/breads', iconOnly: false, visible: true },
        { text: 'Toggle navigation', href: null, iconOnly: true, visible: false }
      ],
      texts: [
        { value: 'Fresh loaves every morning', visible: true },
        { value: 'Open daily from 7am', visible: true }
      ]
    }
  }
}

const byEntity = (rows) => Object.fromEntries(rows.map((r) => [r.entity, r]))

test('the contract loader keeps each page menu, level, parent, home flag, link and menu params', () => {
  const contract = loadContract(contractDir(), SITE)
  const team = contract.pages.find((p) => p.entity === 'menuItem-104')
  assert.deepEqual(
    [team.menu, team.level, team.parentId, team.home, team.title],
    ['mainmenu', 2, 103, false, 'Our Team']
  )
  assert.equal(contract.pages.find((p) => p.entity === 'menuItem-105').aliasOf, 102)
  assert.equal(contract.pages.find((p) => p.entity === 'menuItem-108').menuShow, false)
})

test('every map page says whether it opens, and why not when it does not; none is dropped', () => {
  const contract = loadContract(contractDir(), SITE)
  const rows = sitePagesOf({ contract, result: auditResult() })
  assert.equal(rows.length, 8, 'one row per map page, in map order')
  const r = byEntity(rows)
  assert.deepEqual(
    [r['menuItem-101'].opens, r['menuItem-101'].status, r['menuItem-101'].url],
    ['live', 200, '/']
  )
  assert.deepEqual([r['menuItem-102'].opens, r['menuItem-102'].url], ['live', '/breads'])
  assert.deepEqual([r['menuItem-104'].opens, r['menuItem-104'].status], ['broken', 404])
  // A menu group has no page of its own; a `#` link opens nothing.
  assert.equal(r['menuItem-103'].opens, 'no-page')
  assert.match(r['menuItem-103'].reason, /heading/)
  assert.equal(r['menuItem-106'].opens, 'no-page')
  assert.match(r['menuItem-106'].reason, /#/)
  // An alias opens the page of the item it points to, and says which.
  assert.deepEqual([r['menuItem-105'].opens, r['menuItem-105'].aliasOf], ['live', 'menuItem-102'])
  assert.equal(r['menuItem-107'].opens, 'unpublished')
  // The page cap stopped the run before Catering: not checked, never called live or broken.
  assert.equal(r['menuItem-108'].opens, 'not-checked')
})

test('the main menu is the menu of the home item, a hidden item says so, and the header confirms what a visitor sees', () => {
  const contract = loadContract(contractDir(), SITE)
  const r = byEntity(sitePagesOf({ contract, result: auditResult() }))
  assert.deepEqual(
    ['menuItem-101', 'menuItem-102', 'menuItem-103', 'menuItem-104', 'menuItem-106'].map(
      (k) => r[k].inMainMenu
    ),
    [true, true, true, true, false]
  )
  assert.equal(r['menuItem-104'].parent, 'menuItem-103')
  assert.equal(r['menuItem-108'].shownInMenu, false)
  assert.deepEqual(
    ['menuItem-101', 'menuItem-102', 'menuItem-103', 'menuItem-104', 'menuItem-106', 'menuItem-108'].map(
      (k) => r[k].inHeader
    ),
    [true, true, true, true, false, false]
  )
  // Without a measured header nothing is claimed about it.
  const noHeader = { ...auditResult(), header: null }
  assert.equal(byEntity(sitePagesOf({ contract, result: noHeader }))['menuItem-101'].inHeader, null)
})

test('the header entry: logo, menu items with where each leads, buttons and text, each tied to its slot when declared', () => {
  const contract = loadContract(contractDir(), SITE)
  const result = auditResult()
  const header = headerOf({ contract, result })
  assert.equal(header.measuredOn, '/')
  assert.deepEqual(header.logo, {
    image: '/images/demo/crumb-logo.png',
    alt: 'Crumb & Co',
    text: null,
    href: '/',
    slots: ['siteSetting-1.0']
  })
  assert.deepEqual(
    header.menu.map((m) => [m.text, m.depth, m.opens, m.page ?? null]),
    [
      ['Home', 0, 'live', 'menuItem-101'],
      ['Breads', 0, 'live', 'menuItem-102'],
      ['About', 0, 'no-page', null],
      ['Our Team', 1, 'broken', 'menuItem-104'],
      ['Gift cards', 0, 'no-page', null],
      ['Partner farm', 0, 'external', null]
    ]
  )
  assert.equal(header.menu[3].status, 404)
  assert.deepEqual(
    header.buttons.map((b) => [b.text, b.iconOnly, b.slots, b.opens ?? null]),
    [
      ['Order a cake', false, ['module-9.1'], 'live'],
      ['Toggle navigation', true, [], null]
    ]
  )
  assert.deepEqual(
    header.texts.map((t) => [t.value, t.editable, t.slots]),
    [
      ['Fresh loaves every morning', true, ['module-9.0']],
      ['Open daily from 7am', false, []]
    ]
  )
})

test('no header measured is said as null, never an empty header', () => {
  const contract = loadContract(contractDir(), SITE)
  assert.equal(headerOf({ contract, result: { ...auditResult(), header: null } }), null)
  assert.equal(headerOf({ contract, result: { ...auditResult(), header: { found: false } } }), null)
})

test('the coverage file carries the site pages and the header', () => {
  const contract = loadContract(contractDir(), SITE)
  const doc = buildCoverageFile({ result: auditResult(), contract, measuredAt: '2026-11-01T00:00:00.000Z' })
  assert.equal(doc.tool.version, '1.7.0')
  assert.equal(doc.sitePages.length, 8)
  assert.equal(doc.header.menu.length, 6)
})

test('a map page whose request leaves the site is recorded with its entity', () => {
  const contract = loadContract(contractDir(), SITE)
  const plan = new PagePlan(SITE, contract, 50)
  const job = plan.next()
  assert.equal(plan.leftSite(job, 'https://elsewhere.example/'), true)
  assert.equal(plan.offsite[0].mapPage, job.mapPage.entity)
  const result = { ...auditResult(), pages: [], failures: [], offsite: plan.offsite }
  const row = byEntity(sitePagesOf({ contract, result }))[job.mapPage.entity]
  assert.deepEqual([row.opens, row.landedOn], ['offsite', 'https://elsewhere.example/'])
})

test('a map page that opens a form for signed-in users is skipped, not audited as a failed page', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'site-map-form-'))
  const write = (name, value) => writeFileSync(path.join(dir, name), JSON.stringify(value))
  write('manifest.json', { id: 'ja-crumb/j6/1.0.0', template: 'ja_crumb' })
  write('content-map.json', {
    entities: [101, 102].map((id) => ({ key: `menuItem-${id}`, kind: 'menuItem', sourceId: id })),
    slots: [],
    pages: [
      { entity: 'menuItem-101', route: 'home', link: 'index.php?option=com_content&view=featured' },
      { entity: 'menuItem-102', route: 'submit', link: 'index.php?option=com_content&view=form&layout=edit' }
    ]
  })
  write('presentation-lock.json', {
    entities: {
      'menuItem-101': menuItem(101, 'mainmenu', 'Home', 'component', { home: '1' }),
      'menuItem-102': menuItem(102, 'mainmenu', 'Submit a recipe', 'component')
    }
  })
  const plan = new PagePlan(SITE, loadContract(dir, SITE), 10)
  const urls = []
  for (let job = plan.next(); job; job = plan.next()) urls.push(job.url)
  assert.deepEqual(urls, [`${SITE}index.php?Itemid=101`, SITE])
  assert.deepEqual(
    plan.skipped.map((s) => [s.entity, s.reason]),
    [['menuItem-102', 'a form for signed-in users (layout=edit) is no public page']]
  )
})
