// The read side of the step chain on EmDash: the main menu of an EmDash kit (src/lib/site-copy/main-menu-emdash.js) and
// the copy's export to its content contract (contract-mapping.js), read from the released JA Diner and JA Restaurant
// EmDash contracts in this repository.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { exportContractMapping } from '../src/lib/site-copy/contract-mapping.js'
import { mainMenuOf } from '../src/lib/site-copy/main-menu.js'

const contract = (theme, version) => {
  const dir = new URL(
    `../../../packages/cms/tracy-emdash-theme-${theme}/contracts/${version}/`,
    import.meta.url
  )
  return {
    kit: JSON.parse(readFileSync(new URL('template-kit.json', dir), 'utf8')),
    contentMap: JSON.parse(readFileSync(new URL('content-map.json', dir), 'utf8'))
  }
}

test("an EmDash kit's main menu is its content map's primary menu, labelled by position", () => {
  const { kit, contentMap } = contract('diner', '0.1.4')
  const plan = {
    mainMenu: [
      { page: 'page-home', intent: 'home' },
      { page: 'page-about-us', intent: 'about the cafe' }
    ]
  }
  const menu = mainMenuOf({ plan, kit, contentMap })
  assert.equal(menu.menutype, 'primary')
  assert.deepEqual(menu.problems, [])
  assert.deepEqual(
    menu.slots.map((s) => [s.slot, s.page, s.sample]),
    [
      ['menu.primary.1.label', 'page-home', 'Home'],
      ['menu.primary.2.label', 'page-about-us', 'About Us']
    ]
  )
  // Every other item of the primary menu is hidden, by its own path.
  assert.deepEqual(
    menu.hidden.map((h) => h.path),
    ['/reservation', '/offers', '/our-blog', '/contact-us']
  )
})

test('a dropdown child the plan keeps is a slot under its parent; one it does not keep is hidden', () => {
  const { kit, contentMap } = contract('restaurant', '1.0.4')
  const plan = {
    mainMenu: [{ page: 'page-home' }, { page: 'page-menu', children: [{ page: 'page-menu_simple-menu' }] }]
  }
  const menu = mainMenuOf({ plan, kit, contentMap })
  assert.deepEqual(menu.problems, [])
  const child = menu.slots.find((s) => s.page === 'page-menu_simple-menu')
  assert.equal(child.slot, 'menu.primary.3.1.label')
  assert.equal(child.parentSlot, 'menu.primary.3.label')
  const hiddenPaths = menu.hidden.map((h) => h.path)
  assert.ok(hiddenPaths.includes('/menu/menu-with-image'))
  assert.ok(hiddenPaths.includes('/about-us/our-history'))
})

test('a plan page no menu item opens is a problem, never a guessed slot', () => {
  const { kit, contentMap } = contract('diner', '0.1.4')
  const menu = mainMenuOf({ plan: { mainMenu: [{ page: 'page-nowhere' }] }, kit, contentMap })
  assert.equal(menu.slots.length, 0)
  assert.match(menu.problems[0].detail, /page-nowhere: the kit has no such page/)
})

test('the EmDash export keys words by content map key, the main menu labels with them', () => {
  const { kit, contentMap } = contract('diner', '0.1.4')
  const plan = { mainMenu: [{ page: 'page-home' }, { page: 'page-about-us' }] }
  const copy = {
    version: 'site-copy/1',
    fingerprint: {},
    slots: [
      { slot: 'pages.about-us.title', owner: 'writer', text: 'About Harbour Kitchen', factIds: ['f-name'] },
      { slot: 'menu.primary.2.label', owner: 'writer', text: 'Our story', factIds: [] }
    ]
  }
  const brief = { facts: [{ id: 'f-name', field: 'name', value: 'Harbour Kitchen', source: 'stated' }] }
  const { mapping, extras } = exportContractMapping({
    copy,
    contract: kit.contract,
    revision: 'r1',
    kit,
    brief,
    plan,
    contentMap,
    platform: 'emdash'
  })
  assert.equal(mapping.contract, 'tracy-diner/emdash-0.x/0.1.4')
  assert.deepEqual(Object.keys(mapping.changes), ['pages.about-us.title', 'menu.primary.2.label'])
  assert.equal(mapping.changes['menu.primary.2.label'], 'Our story')
  assert.equal(mapping.changes['pages.about-us.title'], 'About Harbour Kitchen')
  assert.match(mapping.evidence['pages.about-us.title'], /Harbour Kitchen/)
  assert.ok(extras.mainMenu.items.some((i) => i.slot === 'menu.primary.2.label'))
})
