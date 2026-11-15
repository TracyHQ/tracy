/**
 * The data fixes of the blank site (ticket #587): the system menu the kit declares (`mapping.dataFixes`) is added to
 * the blank site's demo data, a menu no block shows whose items give the system pages a menu item of their own.
 * Read on the invented quickstart of `blank-site.test.mjs` (`fixtures/blank-site/custom.sql.txt`).
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { dataFixesStep, systemMenusOf } from '../scripts/blank-site-data-fixes.mjs'
import { BLANK_SITE_STEPS, checkBlankSite, countSite, produceBlankSite } from '../scripts/blank-site.mjs'
import { parseDump, records } from '../scripts/joomla-sql-dump.mjs'

const FIXTURE = readFileSync(new URL('./fixtures/blank-site/custom.sql.txt', import.meta.url), 'utf8')
const SYSTEM_MENU = {
  id: 'system-menu',
  menu: { menutype: 'system-pages', title: 'System pages' },
  templateStyle: 0,
  items: [
    { page: 'system-login', title: 'Log in', alias: 'login', link: 'index.php?option=com_users&view=login' },
    {
      page: 'system-reset',
      title: 'Forgot your password?',
      alias: 'password-reset',
      link: 'index.php?option=com_users&view=reset'
    }
  ],
  why: 'invented: the system pages print no main body without a menu item of their own'
}
/** The fixture with the full column list of a real dump's menu table (params among them). */
const FULL = FIXTURE.replace(
  "INSERT INTO `#__menu` (`id`, `menutype`, `title`, `link`, `parent_id`, `lft`, `rgt`, `home`, `client_id`) VALUES \n(1,'','Menu_Item_Root','',0,0,15,0,0)",
  "INSERT INTO `#__menu` (`id`, `menutype`, `title`, `alias`, `note`, `path`, `link`, `type`, `published`, `parent_id`, `level`, `component_id`, `checked_out`, `checked_out_time`, `browserNav`, `access`, `img`, `template_style_id`, `params`, `lft`, `rgt`, `home`, `language`, `client_id`, `publish_up`, `publish_down`) VALUES \n(1,'','Menu_Item_Root','root','','','','',1,0,0,0,NULL,NULL,0,0,'',0,'',0,15,0,'*',0,NULL,NULL)"
).replace(/\n,\((?:2|101|102|103|104),'[^\n]*/g, (row) => (row.endsWith(';') ? ';' : ''))
const MAPPING = { dataFixes: [SYSTEM_MENU] }
const make = (sql = FIXTURE, mapping = MAPPING) =>
  produceBlankSite(sql, { steps: [...BLANK_SITE_STEPS, dataFixesStep({ mapping })] })

test('the system menu and one item per declared system page are added, on the declared style, home of none', () => {
  const { sql, report } = make()
  const dump = parseDump(sql)
  assert.deepEqual(
    records(dump, 'menu_types').map((r) => [r.id, r.menutype, r.title, r.client_id]),
    [
      ['1', 'mainmenu', 'Main Menu', '0'],
      ['2', 'footer', 'Footer', '0'],
      ['3', 'system-pages', 'System pages', '0']
    ]
  )
  const items = records(dump, 'menu').filter((r) => r.menutype === 'system-pages')
  // Ids follow the highest id the dump keeps (the administrator menu's 2, the site items 101 to 104 are removed).
  assert.deepEqual(
    items.map(({ id, title, link, parent_id, lft, rgt, home, client_id }) => ({
      id,
      title,
      link,
      parent_id,
      lft,
      rgt,
      home,
      client_id
    })),
    [
      {
        id: '3',
        title: 'Log in',
        link: 'index.php?option=com_users&view=login',
        parent_id: '1',
        lft: '15',
        rgt: '16',
        home: '0',
        client_id: '0'
      },
      {
        id: '4',
        title: 'Forgot your password?',
        link: 'index.php?option=com_users&view=reset',
        parent_id: '1',
        lft: '17',
        rgt: '18',
        home: '0',
        client_id: '0'
      }
    ]
  )
  assert.equal(records(dump, 'menu').find((r) => r.id === '1').rgt, '19', 'the root encloses the new items')
  assert.deepEqual(report.steps['data-fixes'], [
    {
      id: 'system-menu',
      menutype: 'system-pages',
      items: [
        { id: 3, page: 'system-login', alias: 'login' },
        { id: 4, page: 'system-reset', alias: 'password-reset' }
      ]
    }
  ])
  assert.deepEqual(checkBlankSite(sql, { systemMenus: systemMenusOf(MAPPING) }), [])
  assert.equal(countSite(dump, { systemMenus: systemMenusOf(MAPPING) }).systemMenuItems, 2)
  assert.equal(countSite(dump, { systemMenus: systemMenusOf(MAPPING) }).siteMenuItems, 0)
})

test('the full menu columns of a real dump are written; a column the step does not know stops it', () => {
  const full = FULL
  const { sql } = make(full)
  const item = records(parseDump(sql), 'menu').find((r) => r.alias === 'login')
  assert.deepEqual(
    {
      path: item.path,
      type: item.type,
      published: item.published,
      level: item.level,
      component_id: item.component_id,
      access: item.access,
      template_style_id: item.template_style_id,
      params: item.params,
      language: item.language,
      checked_out: item.checked_out
    },
    {
      path: 'login',
      type: 'component',
      published: '1',
      level: '1',
      component_id: '12',
      access: '1',
      template_style_id: '0',
      params: '{}',
      language: '*',
      checked_out: null
    }
  )
  const odd = FIXTURE.replace('`home`, `client_id`) VALUES \n(1,', '`home`, `client_id`, `odd`) VALUES \n(1,')
    .replace("(1,'','Menu_Item_Root','',0,0,15,0,0)", "(1,'','Menu_Item_Root','',0,0,15,0,0,0)")
    .replace(/\n,\((?:2|101|102|103|104),'[^\n]*/g, (row) => (row.endsWith(';') ? ';' : ''))
  assert.throws(() => make(odd), /menu has a column odd the system menu step does not write/)
})

test('a page whose component the site lacks, or a menu type the site already has, stops the step', () => {
  const search = {
    ...SYSTEM_MENU,
    items: [
      {
        page: 'system-search',
        title: 'Search',
        alias: 'search',
        link: 'index.php?option=com_finder&view=search'
      }
    ]
  }
  assert.throws(() => make(FIXTURE, { dataFixes: [search] }), /no component com_finder/)
  const taken = { ...SYSTEM_MENU, menu: { menutype: 'footer', title: 'Footer' } }
  assert.throws(() => make(FIXTURE, { dataFixes: [taken] }), /menu type footer exists/)
})

test('a dump that already has the menu type (a blank site made before) stops the step', () => {
  assert.throws(() => make(make().sql), /menu type system-pages exists: the step reads the human quickstart/)
})

test('the blank site check names a system menu item that is undeclared, changed or missing, and a block showing it', () => {
  const { sql } = make()
  const menus = systemMenusOf(MAPPING)
  assert.deepEqual(checkBlankSite(sql).slice(0, 2), [
    'site menu item 3 (Log in)',
    'site menu item 4 (Forgot your password?)'
  ])
  const less = structuredClone(MAPPING)
  less.dataFixes[0].items.pop()
  assert.deepEqual(checkBlankSite(sql, { systemMenus: systemMenusOf(less) }), [
    'site menu item 4 (Forgot your password?) is in the system menu system-pages but not declared'
  ])
  const more = structuredClone(MAPPING)
  more.dataFixes[0].items.push({
    page: 'system-remind',
    title: 'Forgot your username?',
    alias: 'username-reminder',
    link: 'index.php?option=com_users&view=remind'
  })
  assert.deepEqual(checkBlankSite(sql, { systemMenus: systemMenusOf(more) }), [
    'system menu system-pages has no item for system-remind'
  ])
  const home = sql.replace(
    "'Log in','index.php?option=com_users&view=login',1,15,16,0,0",
    "'Log in','index.php?option=com_users&view=login',1,15,16,1,0"
  )
  assert.deepEqual(checkBlankSite(home, { systemMenus: menus }), [
    'site menu item 3 (Log in) of the system menu system-pages is not as declared: home'
  ])
  const shown = sql.replace(
    "(91,51,'Footer Copy','copyright',1,'mod_footer','{}',0)",
    "(91,51,'Footer Copy','copyright',1,'mod_footer','{}',0)\n,(93,0,'Pages','footer',1,'mod_menu','{\\\"menutype\\\":\\\"system-pages\\\"}',0)"
  )
  assert.deepEqual(checkBlankSite(shown, { systemMenus: menus }), [
    'block 93 shows the system menu system-pages'
  ])
})

test('robots an item declares is written into its params, and the check refuses an item whose robots differ (#587)', () => {
  const declared = structuredClone(MAPPING)
  for (const item of declared.dataFixes[0].items) item.robots = 'noindex, follow'
  const { sql } = make(FULL, declared)
  const items = records(parseDump(sql), 'menu').filter((r) => r.menutype === 'system-pages')
  assert.deepEqual(
    items.map((r) => r.params),
    ['{"robots":"noindex, follow"}', '{"robots":"noindex, follow"}']
  )
  const menus = systemMenusOf(declared)
  assert.deepEqual(checkBlankSite(sql, { systemMenus: menus }), [])
  assert.deepEqual(checkBlankSite(make(FULL).sql, { systemMenus: menus }), [
    'site menu item 2 (Log in) of the system menu system-pages is not as declared: robots',
    'site menu item 3 (Forgot your password?) of the system menu system-pages is not as declared: robots'
  ])
  assert.throws(
    () => make(FIXTURE, declared),
    /robots is declared but the dump's menu table has no params column/
  )
})

const REGISTRATION_OFF = { id: 'registration-off', why: 'invented: the business takes no visitor accounts' }
const usersParams = (sql) =>
  records(parseDump(sql), 'extensions').find((r) => r.element === 'com_users' && r.type === 'component')
    .params

test('registration-off sets allowUserRegistration "0" in the com_users params and changes nothing else (#587)', () => {
  const mapping = { dataFixes: [SYSTEM_MENU, REGISTRATION_OFF] }
  const { sql, report } = make(FIXTURE, mapping)
  assert.equal(usersParams(sql), '{"allowUserRegistration":"0","sendpassword":"0","new_usertype":"2"}')
  assert.deepEqual(report.steps['data-fixes'][1], { id: 'registration-off', was: '1' })
  const after = make(FIXTURE, { dataFixes: [REGISTRATION_OFF] }).sql.split('\n')
  const blank = produceBlankSite(FIXTURE).sql.split('\n')
  assert.deepEqual(
    after.filter((line, i) => line !== blank[i]),
    [
      ',(12,\'com_users\',\'component\',\'com_users\',\'\',1,\'{\\"allowUserRegistration\\":\\"0\\",\\"sendpassword\\":\\"0\\",\\"new_usertype\\":\\"2\\"}\')'
    ]
  )
  assert.deepEqual(checkBlankSite(sql, { systemMenus: systemMenusOf(mapping), registrationOff: true }), [])
})

test('the check refuses visitor sign-up on when registration-off is declared, and the step stops without com_users (#587)', () => {
  const { sql } = make(FIXTURE, { dataFixes: [] })
  assert.deepEqual(checkBlankSite(sql, { registrationOff: true }), [
    'visitor sign-up is on (com_users allowUserRegistration "1") though the kit declares registration-off'
  ])
  assert.deepEqual(checkBlankSite(sql), [], 'not declared: not checked')
  const none = FIXTURE.replace(/\n,\(12,'com_users'[^\n]*/, '')
  assert.throws(() => make(none, { dataFixes: [REGISTRATION_OFF] }), /no com_users component row/)
  const updated = `${FIXTURE}\nUPDATE \`#__extensions\` SET \`params\` = '{\\"allowUserRegistration\\":\\"1\\"}' WHERE \`extension_id\` = 12;\n`
  assert.throws(
    () => make(updated, { dataFixes: [REGISTRATION_OFF] }),
    /an UPDATE of #__extensions names allowUserRegistration/
  )
})
