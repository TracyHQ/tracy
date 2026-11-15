/**
 * The data fixes the AI quickstart kit declares for its blank site (ticket #587, `mapping.dataFixes`, shape and
 * reasons in `packages/wo/website-opportunities/domain/ai-quickstart-data-fixes.mjs`).
 *
 * The system menu (`system-menu`): a menu type no block shows, with one site menu item per declared system page
 * (search, sign in, password reset, username reminder) at the root, on the declared template style, home of none, and
 * the item's declared `robots` in its params. With no menu item of its own such a page is printed under the active
 * page's style and title; with its own item it prints its main body on the declared style and takes the item's title.
 * The step runs after the blank site steps, so the demo menus are gone when it adds the menu; the blank site check
 * (`checkBlankSite` with `systemMenus`) accepts the declared items and nothing else.
 *
 * Visitor sign-up off (`registration-off`): `allowUserRegistration` becomes "0" in the params of the com_users
 * component row, the rest of the params text unchanged; the check (`checkBlankSite` with `registrationOff`) refuses a
 * blank site where it is on.
 *
 * Pure, and deterministic: ids follow the highest id the dump keeps and the items close the root's nested set range.
 * The step reads the human quickstart's demo data: a dump that already has the menu type (a blank site made before)
 * stops it, so the menu is never added twice or over a menu of the template's own.
 */

import { addRows, records, setValue, updates } from './joomla-sql-dump.mjs'

const fixesOf = (mapping) => (Array.isArray(mapping?.dataFixes) ? mapping.dataFixes : [])

/**
 * The system menus a mapping file declares:
 * `[{menutype, title, templateStyle, items: [{page, title, alias, link, robots?}]}]`.
 */
export function systemMenusOf(mapping) {
  return fixesOf(mapping)
    .filter((f) => f?.id === 'system-menu')
    .map((f) => ({ ...f.menu, templateStyle: f.templateStyle, items: f.items }))
}

/** Whether a mapping file declares visitor sign-up off (`registration-off`). */
export function registrationOffOf(mapping) {
  return fixesOf(mapping).some((f) => f?.id === 'registration-off')
}

/** The declared item a menu row is: by alias when the dump has the column, else by title. */
const isItem = (row, item) => (row.alias !== undefined ? row.alias === item.alias : row.title === item.title)
const optionOf = (link) => new URLSearchParams(String(link).split('?')[1] ?? '').get('option')
const maxId = (rows, column = 'id') => Math.max(0, ...rows.map((r) => Number(r[column]) || 0))

/** Every column of a site menu item the step writes for one declared item; the dump writes the ones it lists. */
function itemValues(menu, item, { id, componentId, lft }) {
  return {
    id,
    menutype: menu.menutype,
    title: item.title,
    alias: item.alias,
    note: '',
    path: item.alias,
    link: item.link,
    type: 'component',
    published: 1,
    parent_id: 1,
    level: 1,
    component_id: componentId,
    checked_out: null,
    checked_out_time: null,
    browserNav: 0,
    access: 1,
    img: '',
    template_style_id: menu.templateStyle,
    params: item.robots ? JSON.stringify({ robots: item.robots }) : '{}',
    lft,
    rgt: lft + 1,
    home: 0,
    language: '*',
    client_id: 0,
    publish_up: null,
    publish_down: null
  }
}

/** The values `values` gives for the columns the dump's INSERT into `table` lists; a column it lacks stops. */
function forColumns(dump, table, values) {
  const part = dump.parts.filter((p) => p.kind === 'insert' && p.table === table).at(-1)
  if (!part) throw new Error(`the dump has no INSERT into ${table}`)
  const unknown = part.columns.filter((c) => !Object.hasOwn(values, c))
  if (unknown.length)
    throw new Error(`${table} has a column ${unknown.join(', ')} the system menu step does not write`)
  return Object.fromEntries(part.columns.map((c) => [c, values[c]]))
}

/** What differs between a menu item row and its declaration (the columns the dump has). */
export function itemProblems(row, menu, item) {
  const want = { title: item.title, alias: item.alias, link: item.link, parent_id: '1', home: '0' }
  want.template_style_id = String(menu.templateStyle)
  want.published = '1'
  const off = Object.entries(want)
    .filter(([c, v]) => Object.hasOwn(row, c) && String(row[c]) !== String(v))
    .map(([c]) => c)
  if (Object.hasOwn(row, 'params') && (paramsOf(row.params)?.robots ?? null) !== (item.robots ?? null))
    off.push('robots')
  return off
}

function paramsOf(text) {
  try {
    return JSON.parse(text || '{}')
  } catch {
    return null
  }
}

function addSystemMenu(dump, fix) {
  const menu = { ...fix.menu, templateStyle: fix.templateStyle, items: fix.items }
  if (records(dump, 'menu_types').some((r) => r.menutype === menu.menutype))
    throw new Error(`the menu type ${menu.menutype} exists: the step reads the human quickstart's demo data`)
  const components = new Map(
    records(dump, 'extensions')
      .filter((e) => e.type === 'component')
      .map((e) => [e.element, Number(e.extension_id)])
  )
  const menus = records(dump, 'menu')
  const root = menus.find((r) => r.id === '1')
  if (!root) throw new Error('the dump has no menu root (id 1)')
  if (menu.items.some((i) => i.robots) && !Object.hasOwn(root, 'params'))
    throw new Error("robots is declared but the dump's menu table has no params column")
  let id = maxId(menus)
  let lft = Number(root.rgt)
  const rows = []
  const added = []
  for (const item of menu.items) {
    const option = optionOf(item.link)
    if (!components.has(option)) throw new Error(`the site has no component ${option} for ${item.page}`)
    id += 1
    rows.push(
      forColumns(dump, 'menu', itemValues(menu, item, { id, componentId: components.get(option), lft }))
    )
    added.push({ id, page: item.page, alias: item.alias })
    lft += 2
  }
  const types = records(dump, 'menu_types')
  const type = {
    id: maxId(types) + 1,
    asset_id: 0,
    menutype: menu.menutype,
    title: menu.title,
    description: '',
    client_id: 0,
    ordering: maxId(types, 'ordering') + 1
  }
  addRows(dump, 'menu_types', [forColumns(dump, 'menu_types', type)])
  addRows(dump, 'menu', rows)
  if (Object.hasOwn(root, 'rgt')) setValue(dump, 'menu', (r) => r.id === '1', 'rgt', lft)
  return { id: fix.id, menutype: menu.menutype, items: added }
}

const REGISTRATION = /("allowUserRegistration"\s*:\s*)("[^"]*"|\d+)/g
const isUsers = (r) => r.type === 'component' && r.element === 'com_users'

/** The value of `allowUserRegistration` in the com_users params, as the platform reads it ("1", "0", or null). */
function registrationOf(params) {
  const value = paramsOf(params)?.allowUserRegistration
  return value === undefined || value === null ? null : String(value)
}

function turnRegistrationOff(dump, fix) {
  if (updates(dump).some((u) => u.table === 'extensions' && u.text.includes('allowUserRegistration')))
    throw new Error(
      'an UPDATE of #__extensions names allowUserRegistration: the step changes the INSERT row only'
    )
  const rows = records(dump, 'extensions').filter(isUsers)
  if (!rows.length) throw new Error('the dump has no com_users component row')
  if (rows.length > 1) throw new Error(`the dump has ${rows.length} com_users component rows`)
  const params = rows[0].params
  const was = registrationOf(params)
  if (paramsOf(params) === null) throw new Error('the com_users params are not JSON')
  // Only the value changes: the rest of the params text stays as the release wrote it. A key the params lack reads as
  // off (the platform reads no value as false), so nothing is written.
  const next = String(params).replace(REGISTRATION, (_, key) => `${key}"0"`)
  if (next !== params) setValue(dump, 'extensions', isUsers, 'params', next)
  if (registrationOf(next) !== null && registrationOf(next) !== '0')
    throw new Error('allowUserRegistration is still on after the step')
  return { id: fix.id, was }
}

/** The step `{id: 'data-fixes', run(ctx)}` for `produceBlankSite`: every data fix the mapping file declares. */
export function dataFixesStep({ mapping }) {
  const fixes = fixesOf(mapping)
  return {
    id: 'data-fixes',
    run(ctx) {
      return fixes.map((fix) => {
        if (fix?.id === 'system-menu') return addSystemMenu(ctx.dump, fix)
        if (fix?.id === 'registration-off') return turnRegistrationOff(ctx.dump, fix)
        throw new Error(`unknown data fix ${fix?.id}`)
      })
    }
  }
}

/** Why `dump` lets visitors sign up though the kit declares registration-off; empty when sign-up is off. */
export function registrationProblems(dump) {
  const rows = records(dump, 'extensions').filter(isUsers)
  const on = rows.map((r) => registrationOf(r.params)).filter((v) => v !== null && v !== '0')
  return on.map(
    (v) =>
      `visitor sign-up is on (com_users allowUserRegistration "${v}") though the kit declares registration-off`
  )
}

/** Everything about the declared system menus that keeps `dump` from being the blank site the kit declares. */
export function systemMenuProblems(dump, systemMenus) {
  const problems = []
  const site = records(dump, 'menu').filter((r) => r.client_id === '0' && r.id !== '1')
  for (const menu of systemMenus) {
    const held = site.filter((r) => r.menutype === menu.menutype)
    for (const r of held) {
      const item = menu.items.find((i) => isItem(r, i))
      if (!item) {
        problems.push(
          `site menu item ${r.id} (${r.title}) is in the system menu ${menu.menutype} but not declared`
        )
        continue
      }
      const off = itemProblems(r, menu, item)
      if (off.length)
        problems.push(
          `site menu item ${r.id} (${r.title}) of the system menu ${menu.menutype} is not as declared: ${off.join(', ')}`
        )
    }
    for (const item of menu.items)
      if (!held.some((r) => isItem(r, item)))
        problems.push(`system menu ${menu.menutype} has no item for ${item.page}`)
    for (const m of records(dump, 'modules'))
      if (m.client_id === '0' && m.module === 'mod_menu' && menutypeOf(m.params) === menu.menutype)
        problems.push(`block ${m.id} shows the system menu ${menu.menutype}`)
  }
  return problems
}

function menutypeOf(params) {
  try {
    return JSON.parse(params || '{}')?.menutype ?? null
  } catch {
    return null
  }
}
