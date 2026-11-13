/**
 * The blank site of an AI quickstart (ADR 0045, ticket #582): the template with its design intact, no pages, an empty
 * menu, every demo block unassigned and kept in the block store, no account or secret of the source site.
 *
 * These tests read the demo data of an invented quickstart (`fixtures/blank-site/custom.sql`) the way the installer
 * would import it, and check what a site built from the result would hold.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { BLANK_SITE_STEPS, checkBlankSite, produceBlankSite } from '../scripts/blank-site.mjs'
import { parseDump, records } from '../scripts/joomla-sql-dump.mjs'

const FIXTURE = readFileSync(new URL('./fixtures/blank-site/custom.sql', import.meta.url), 'utf8')
const blank = () => {
  const { sql, report } = produceBlankSite(FIXTURE)
  return { sql, report, dump: parseDump(sql) }
}
const rawRows = (sql, table) => {
  const at = sql.indexOf('INSERT INTO `#__' + table + '`')
  return at === -1 ? '' : sql.slice(at, sql.indexOf(';\n', at))
}

test('the site menus are empty: every site menu item goes, the root and the administrator menu stay', () => {
  const { dump } = blank()
  assert.deepEqual(
    records(dump, 'menu').map((r) => r.id),
    ['1', '2']
  )
  assert.deepEqual(
    records(dump, 'menu_types').map((r) => r.menutype),
    ['mainmenu', 'footer'],
    'the menus themselves stay, empty, so a build can fill them'
  )
})

test('no page is left: articles, demo categories, tags, contacts and what hangs on them are gone', () => {
  const { dump } = blank()
  for (const table of [
    'content',
    'content_frontpage',
    'contentitem_tag_map',
    'contact_details',
    'ucm_content',
    'ucm_base',
    'workflow_associations'
  ]) {
    assert.deepEqual(records(dump, table), [], table)
  }
  assert.deepEqual(
    records(dump, 'categories').map((r) => r.id),
    ['1', '2', '4'],
    'the root and the Uncategorised categories Joomla itself needs stay'
  )
  assert.deepEqual(
    records(dump, 'tags').map((r) => r.id),
    ['1']
  )
  assert.deepEqual(
    records(dump, 'assets').map((r) => r.name),
    [
      'root.1',
      'com_content',
      'com_modules',
      'com_content.category.2',
      'com_modules.module.90',
      'com_modules.module.91'
    ],
    'the assets of removed articles and categories go with them; block assets stay'
  )
})

test('every demo block stays in the store exactly as designed, assigned to no page', () => {
  const { sql, dump } = blank()
  assert.equal(
    rawRows(sql, 'modules'),
    rawRows(FIXTURE, 'modules'),
    'module rows are byte for byte the source rows'
  )
  assert.deepEqual(
    records(dump, 'modules_menu'),
    [{ moduleid: '3', menuid: '0' }],
    'only the administrator module keeps its assignment'
  )
})

test('the template design and its settings are untouched', () => {
  const { sql } = blank()
  assert.equal(rawRows(sql, 'template_styles'), rawRows(FIXTURE, 'template_styles'))
  const template = (s) =>
    rawRows(s, 'extensions')
      .split('\n')
      .find((l) => l.includes("'ja_bakery','template'"))
  assert.equal(template(sql), template(FIXTURE))
})

test('no account of the source site is carried over, and no session', () => {
  const { dump } = blank()
  for (const table of ['users', 'user_usergroup_map', 'user_profiles', 'session', 'acym_user']) {
    assert.deepEqual(records(dump, table), [], table)
  }
})

test('secrets are blanked where they sit; every other setting keeps its text', () => {
  const { sql, dump, report } = blank()
  const params = Object.fromEntries(records(dump, 'extensions').map((r) => [r.element, JSON.parse(r.params)]))
  assert.equal(params.ldap.password, '')
  assert.equal(params.ldap.username, '', 'a directory service login is a credential')
  assert.equal(params.ldap.port, '389')
  assert.equal(params.mapblock.api_key, '')
  assert.ok(
    rawRows(sql, 'extensions').includes('\\"link\\":\\"https:\\\\/\\\\/maps.example.test\\\\/\\"'),
    'escapes of the row are kept'
  )
  assert.equal(params.com_users.sendpassword, '0', 'a setting that only names a password is not a secret')
  const acym = Object.fromEntries(records(dump, 'acym_configuration').map((r) => [r.name, r.value]))
  assert.equal(acym.security_key, '')
  assert.equal(acym.cron_frequency, '900')
  assert.ok(
    !sql.includes('invented-directory-pass') &&
      !sql.includes('invented-map-key-000') &&
      !sql.includes('invented0security0key0value')
  )
  assert.deepEqual(report.secrets, [
    { table: 'acym_configuration', row: 'security_key', key: 'value' },
    { table: 'extensions', row: '10', key: 'password' },
    { table: 'extensions', row: '10', key: 'username' },
    { table: 'extensions', row: '11', key: 'api_key' }
  ])
})

test('an UPDATE of a removed row is dropped; an UPDATE of a block is kept', () => {
  const { sql } = blank()
  assert.ok(!sql.includes('UPDATE `#__content`'))
  assert.ok(sql.includes('UPDATE `#__modules` SET'))
})

test('the step is deterministic and running it on its own result changes nothing', () => {
  const first = produceBlankSite(FIXTURE)
  assert.equal(produceBlankSite(FIXTURE).sql, first.sql)
  assert.deepEqual(produceBlankSite(FIXTURE).report, first.report)
  assert.equal(produceBlankSite(first.sql).sql, first.sql)
})

test('the report says what was there and what is left, and lists the block store', () => {
  const { report } = blank()
  const count = (o) => ({
    siteMenuItems: 4,
    articles: 2,
    demoCategories: 1,
    tags: 1,
    contacts: 1,
    siteBlocks: 3,
    assignedSiteBlocks: 3,
    users: 2,
    sessions: 1,
    ...o
  })
  assert.deepEqual(report.before, count({}))
  assert.deepEqual(
    report.after,
    count({
      siteMenuItems: 0,
      articles: 0,
      demoCategories: 0,
      tags: 0,
      contacts: 0,
      assignedSiteBlocks: 0,
      users: 0,
      sessions: 0
    })
  )
  assert.deepEqual(report.blockStore, [
    { id: '90', module: 'mod_ja_acm', position: 'hero', published: '1', title: 'Hero' },
    { id: '91', module: 'mod_footer', position: 'copyright', published: '1', title: 'Footer Copy' },
    { id: '92', module: 'mod_custom', position: 'section-1', published: '-2', title: 'Old Banner' }
  ])
})

test('checkBlankSite names everything that is not blank, and nothing once the step ran', () => {
  const problems = checkBlankSite(FIXTURE)
  for (const expected of [
    'site menu item 101',
    'block 90 is assigned',
    'content row',
    'users row',
    'secret extensions 10 password'
  ]) {
    assert.ok(
      problems.some((p) => p.includes(expected)),
      `expected a problem naming "${expected}" in ${JSON.stringify(problems)}`
    )
  }
  assert.deepEqual(checkBlankSite(blank().sql), [])
})

test('the steps are a list a later ticket can extend', () => {
  assert.deepEqual(
    BLANK_SITE_STEPS.map((s) => s.id),
    ['remove-pages', 'unassign-blocks', 'remove-accounts', 'blank-secrets', 'drop-updates-of-removed-rows']
  )
  const extra = { id: 'mark', run: ({ dump }) => ({ parts: dump.parts.length }) }
  const { report } = produceBlankSite(FIXTURE, { steps: [...BLANK_SITE_STEPS, extra] })
  assert.ok(report.steps.mark.parts > 0)
})
