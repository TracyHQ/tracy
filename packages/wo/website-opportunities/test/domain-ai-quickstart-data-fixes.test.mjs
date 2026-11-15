// The data fixes of an AI quickstart mapping file (ticket #587, `dataFixes`): changes the blank site step makes to the
// demo data beyond removing it. The one kind is the system menu: a menu no module shows, whose items give the system
// pages (search, sign in, password reset, username reminder) a menu item of their own, so they print their main body
// on the template style the kit names and each has its own title. Checked on the invented fixture: present, refused in
// an unknown or loose shape, and refused when it would not do what it says.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkAiQuickstartContract } from '../domain/ai-quickstart-contract.mjs'
import { SYSTEM_PAGE_LINKS } from '../domain/ai-quickstart-data-fixes.mjs'

const read = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/ai-quickstart/${name}`, import.meta.url), 'utf8'))
const VALID = {
  blockStore: read('block-store.json'),
  pageRecipes: read('page-recipes.json'),
  mapping: read('mapping.json')
}
const problemsOf = (set) => checkAiQuickstartContract(set).problems.map((p) => `${p.at}: ${p.message}`)
const near = (set, prefix) => problemsOf(set).filter((p) => p.startsWith(prefix))

const SYSTEM_MENU = {
  id: 'system-menu',
  menu: { menutype: 'system-pages', title: 'System pages' },
  templateStyle: 0,
  items: [
    {
      page: 'system-search',
      title: 'Search',
      alias: 'search',
      link: 'index.php?option=com_finder&view=search'
    },
    { page: 'system-login', title: 'Log in', alias: 'login', link: 'index.php?option=com_users&view=login' }
  ],
  why: 'with no menu item of their own the invented template prints these pages on the home page style, with no main body'
}
const withFix = (fix) => {
  const set = structuredClone(VALID)
  set.mapping.dataFixes = [structuredClone(fix)]
  return set
}

test('a system menu names its menu, the template style and one item per system page, with why (#587)', () => {
  assert.deepEqual(near(withFix(SYSTEM_MENU), 'dataFixes'), [])
  const set = structuredClone(VALID)
  assert.deepEqual(near(set, 'dataFixes'), [], 'the declaration is optional')
})

test('the system page links are the platform routes of the four system pages', () => {
  assert.deepEqual(SYSTEM_PAGE_LINKS, {
    'system-search': 'index.php?option=com_finder&view=search',
    'system-login': 'index.php?option=com_users&view=login',
    'system-reset': 'index.php?option=com_users&view=reset',
    'system-remind': 'index.php?option=com_users&view=remind'
  })
})

test('a data fix is a closed shape: unknown keys, an unknown kind and a missing reason are refused (#587)', () => {
  const set = withFix({ ...SYSTEM_MENU, id: 'system-menu', extra: 1, why: '' })
  set.mapping.dataFixes.push({ ...structuredClone(SYSTEM_MENU), id: 'rename-pages' })
  set.mapping.dataFixes.push('system-menu')
  set.mapping.dataFixes.push(structuredClone(SYSTEM_MENU))
  assert.deepEqual(near(set, 'dataFixes'), [
    'dataFixes[0].extra: "extra" is no key here: id, menu, templateStyle, items, why',
    'dataFixes[0].why: say why (what prints it, measured or read where)',
    'dataFixes[1].id: id is one of system-menu, registration-off',
    'dataFixes[2]: a data fix is {id, ...} with id one of system-menu, registration-off',
    'dataFixes[3].id: system-menu is declared twice: one per kit'
  ])
  const notList = structuredClone(VALID)
  notList.mapping.dataFixes = SYSTEM_MENU
  assert.deepEqual(near(notList, 'dataFixes'), ['dataFixes: dataFixes is a list of data fixes'])
})

test('the menu is a menu type name and a title; the style is a style id, 0 for the default (#587)', () => {
  const set = withFix({
    ...SYSTEM_MENU,
    menu: { menutype: 'System Pages!', title: '', module: 'mod_menu' },
    templateStyle: -1
  })
  assert.deepEqual(near(set, 'dataFixes'), [
    'dataFixes[0].menu.module: "module" is no key here: menutype, title',
    'dataFixes[0].menu.menutype: menutype is lower case letters, digits and dashes, at most 24 characters',
    'dataFixes[0].menu.title: title is the menu title, at most 48 characters',
    'dataFixes[0].templateStyle: templateStyle is a template style id, 0 for the site default style'
  ])
})

test('each item is one system page with its own route, alias and title; none repeats (#587)', () => {
  const items = [
    { page: 'system-search', title: 'Search', alias: 'search', link: 'index.php?option=com_finder' },
    { page: 'system-cart', title: 'Cart', alias: 'cart', link: 'index.php?option=com_cart' },
    { page: 'system-login', title: 'Search', alias: 'search', link: SYSTEM_PAGE_LINKS['system-login'] },
    {
      page: 'system-login',
      title: 'Log in',
      alias: 'Log In',
      link: SYSTEM_PAGE_LINKS['system-login'],
      home: 1
    }
  ]
  assert.deepEqual(near(withFix({ ...SYSTEM_MENU, items }), 'dataFixes'), [
    'dataFixes[0].items[0].link: the route of system-search is index.php?option=com_finder&view=search',
    'dataFixes[0].items[1].page: page is one of system-search, system-login, system-reset, system-remind',
    'dataFixes[0].items[2].alias: alias "search" is used twice: one page, one address',
    'dataFixes[0].items[2].title: title "Search" is used twice: each system page has its own title',
    'dataFixes[0].items[3].home: "home" is no key here: page, title, alias, link, robots',
    'dataFixes[0].items[3].page: system-login has two items',
    'dataFixes[0].items[3].alias: alias is lower case letters, digits and dashes'
  ])
  assert.deepEqual(near(withFix({ ...SYSTEM_MENU, items: [] }), 'dataFixes'), [
    'dataFixes[0].items: items lists the system pages the menu gives an item: {page, title, alias, link, robots?}'
  ])
})

test('a system menu item may carry robots, one of the platform robots values (#587)', () => {
  const items = SYSTEM_MENU.items.map((item) => ({ ...item, robots: 'noindex, follow' }))
  assert.deepEqual(near(withFix({ ...SYSTEM_MENU, items }), 'dataFixes'), [])
  const off = [
    { ...SYSTEM_MENU.items[0], robots: 'noindex' },
    { ...SYSTEM_MENU.items[1], robots: '' }
  ]
  assert.deepEqual(near(withFix({ ...SYSTEM_MENU, items: off }), 'dataFixes'), [
    'dataFixes[0].items[0].robots: robots is one of index, follow; noindex, follow; index, nofollow; noindex, nofollow',
    'dataFixes[0].items[1].robots: robots is one of index, follow; noindex, follow; index, nofollow; noindex, nofollow'
  ])
})

const REGISTRATION_OFF = {
  id: 'registration-off',
  why: 'the invented business takes no visitor accounts: the sign in page offers no sign up'
}

test('registration-off turns visitor sign-up off, said with why, in a closed shape (#587)', () => {
  assert.deepEqual(near(withFix(REGISTRATION_OFF), 'dataFixes'), [])
  const both = withFix(SYSTEM_MENU)
  both.mapping.dataFixes.push(structuredClone(REGISTRATION_OFF))
  assert.deepEqual(near(both, 'dataFixes'), [], 'one of each kind')
  const loose = withFix({ ...REGISTRATION_OFF, why: ' ', menu: SYSTEM_MENU.menu })
  loose.mapping.dataFixes.push(structuredClone(REGISTRATION_OFF))
  assert.deepEqual(near(loose, 'dataFixes'), [
    'dataFixes[0].menu: "menu" is no key here: id, why',
    'dataFixes[0].why: say why (what prints it, measured or read where)',
    'dataFixes[1].id: registration-off is declared twice: one per kit'
  ])
})
