// joomla-inventory.mjs — pure functions over a Joomla database inventory (inventory.json).
//
// The inventory is a dump of the tables a Joomla site keeps its content in: #__content,
// #__categories, #__menu, #__modules, #__modules_menu, #__template_styles. Every value is a string
// (mysql text), params columns are JSON-in-a-string, and mod_ja_acm params are JSON inside JSON.
// These helpers normalise that into plain objects the from-joomla adapter can reason about.
//
// Nothing here touches the network or a running site. Dependency-free except jsdom for the ACM
// schema XML (optional — the heuristic path needs no schema at all).

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'

// ── strings ───────────────────────────────────────────────────────────────────

/**
 * A WordPress slug from a human title (D2: slugs come from titles, never from stale Joomla
 * aliases). Diacritics are stripped, the d-with-stroke letter (U+0111) becomes `d`, everything
 * non-alphanumeric collapses to `-`.
 */
export function slugify(title) {
  return (
    String(title ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\u0111/g, 'd')
      .replace(/\u0110/g, 'D')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  )
}

/** Parse a JSON-in-a-string column; a blank or broken column reads as `{}`, never throws. */
export function parseJsonColumn(value) {
  if (value == null || value === '') return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

const num = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

// ── loading ───────────────────────────────────────────────────────────────────

const TABLES = ['content', 'content_frontpage', 'categories', 'menu', 'modules', 'modules_menu', 'template_styles']

/**
 * Read inventory.json. Every table the adapter needs is guaranteed to be an array afterwards, so
 * callers never have to guard against a missing key.
 */
export function loadInventory(path) {
  return normaliseInventory(JSON.parse(readFileSync(path, 'utf8')))
}

/** An inventory already parsed, made safe the way loadInventory does (every table an array); returns the same object. */
export function normaliseInventory(raw) {
  for (const table of TABLES) if (!Array.isArray(raw[table])) raw[table] = []
  return raw
}

// ── articles ──────────────────────────────────────────────────────────────────

const STATE_STATUS = { 1: 'publish', 0: 'draft', 2: 'publish', '-2': 'trash' }

/**
 * The article options Joomla itself defines in `attribs` (Options tab: show_*, link_*, info_block_*,
 * the layout and a few more). Every other key is an extra field a template adds through its layout
 * override (`$this->item->attribs`, a subform of benefits, a question list) — content the source
 * page prints.
 */
const CORE_ATTRIB = /^(show_|link_|info_block_)|^(article_layout|urls_position|alternative_readmore|article_page_title)$/

const isEmptyValue = (v) =>
  v === null || v === undefined || v === '' || (typeof v === 'object' && !Object.values(v).some((x) => !isEmptyValue(x)))

/** The extra fields of an article's `attribs`: every non-core key with a value, in column order. */
function articleFields(attribs) {
  return Object.fromEntries(Object.entries(attribs ?? {}).filter(([k, v]) => !CORE_ATTRIB.test(k) && !isEmptyValue(v)))
}

/**
 * #__content → plain article records. `state 2` (Joomla archived) stays published: WordPress has no
 * archived status. `layout` is the article's layout override (`article_layout`, `tpl:name`) and
 * `fields` its extra fields (articleFields) — both kept, so nothing the source page prints is lost
 * at this step.
 */
export function articles(inv) {
  return inv.content.map((row) => {
    const images = parseJsonColumn(row.images)
    const attribs = parseJsonColumn(row.attribs)
    const clean = (p) => (p ? String(p).split('#')[0].replace(/\\\//g, '/') : '')
    return {
      id: String(row.id),
      title: row.title ?? '',
      alias: row.alias ?? '',
      catid: String(row.catid ?? ''),
      state: num(row.state, 1),
      status: STATE_STATUS[String(row.state)] ?? 'draft',
      featured: String(row.featured) === '1',
      created: row.created ?? null,
      modified: row.modified ?? null,
      publishUp: row.publish_up ?? null,
      publishDown: row.publish_down ?? null,
      access: row.access == null ? null : num(row.access),
      createdBy: String(row.created_by ?? ''),
      createdByAlias: row.created_by_alias ?? '',
      introtext: row.introtext ?? '',
      fulltext: row.fulltext ?? '',
      images: {
        intro: clean(images.image_intro),
        introAlt: images.image_intro_alt ?? '',
        introCaption: images.image_intro_caption ?? '',
        full: clean(images.image_fulltext),
        fullAlt: images.image_fulltext_alt ?? '',
        fullCaption: images.image_fulltext_caption ?? ''
      },
      metadesc: row.metadesc ?? '',
      metakey: row.metakey ?? '',
      language: row.language ?? '*',
      ordering: num(row.ordering),
      hits: num(row.hits),
      layout: attribs.article_layout || null,
      fields: articleFields(attribs)
    }
  })
}

// ── categories ────────────────────────────────────────────────────────────────

/**
 * com_content categories, ROOT excluded. `wpSlug` is the Joomla alias, except for the aliases
 * listed in `retitle` (the D2 table: stale aliases such as `politics` for "Website planning"),
 * which get a slug generated from the title. The alias always survives as `joomlaAlias`.
 *
 * Joomla keeps an alias unique among siblings only; WordPress keeps a category slug unique across
 * the site. Every category of a group that would share one slug (`database-security` under both
 * `services` and `portfolio`) takes its full Joomla path instead (`services-database-security`,
 * `portfolio-database-security`) — each one of the group, so the rule does not depend on which
 * came first. A slug that still collides after that throws, naming both categories: a merged
 * category files one parent's posts under the other.
 *
 * A trashed category (`published -2`) is not part of the site: it is neither exported nor counted
 * in a slug group, so a live category whose only twin sits in the trash keeps its alias. A live
 * category whose parent is trashed has nowhere to hang in the tree and throws, naming both.
 */
export function categories(inv, { retitle = [] } = {}) {
  const retitled = new Set(retitle)
  const content = inv.categories.filter((c) => c.extension === 'com_content' && String(c.id) !== '1')
  const trashed = new Map(content.filter((c) => String(c.published) === '-2').map((c) => [String(c.id), c]))
  const rows = content.filter((c) => !trashed.has(String(c.id)))
  for (const c of rows) {
    const parent = trashed.get(String(c.parent_id))
    if (parent)
      throw new Error(
        `category #${c.id} (${c.path || c.title}) is live but its parent #${parent.id} (${parent.path || parent.title}) is trashed; ` +
          'restore the parent or move the category in the source'
      )
  }
  const ids = new Set(rows.map((c) => String(c.id)))
  const out = rows
    .sort((a, b) => num(a.lft) - num(b.lft) || num(a.id) - num(b.id))
    .map((c) => ({
      id: String(c.id),
      title: c.title ?? '',
      joomlaAlias: c.alias ?? '',
      wpSlug: retitled.has(c.alias ?? '') ? slugify(c.title) : c.alias || slugify(c.title),
      parentId: ids.has(String(c.parent_id)) ? String(c.parent_id) : null,
      level: num(c.level),
      joomlaPath: c.path ?? '',
      description: c.description ?? '',
      published: String(c.published) === '1'
    }))
  const shared = new Map()
  for (const c of out) shared.set(c.wpSlug, (shared.get(c.wpSlug) ?? 0) + 1)
  for (const c of out) if (shared.get(c.wpSlug) > 1 && c.joomlaPath) c.wpSlug = slugify(c.joomlaPath.replace(/\//g, '-'))
  const taken = new Map()
  for (const c of out) {
    const other = taken.get(c.wpSlug)
    if (other)
      throw new Error(
        `category slug collision: "${c.wpSlug}" names #${other.id} (${other.joomlaPath || other.title}) and #${c.id} (${c.joomlaPath || c.title}); ` +
          'rename one alias in the source, or list it in the retitle table'
      )
    taken.set(c.wpSlug, c)
  }
  return out
}

// ── menus ─────────────────────────────────────────────────────────────────────

/** `index.php?option=com_content&view=article&id=3` → { option, view, id, layout, raw }. */
export function parseMenuLink(link) {
  const raw = String(link ?? '')
  const q = raw.replace(/^index\.php\??/, '')
  const params = new URLSearchParams(q)
  const idRaw = params.get('id') ?? params.get('id[0]')
  return {
    raw,
    option: params.get('option') ?? null,
    view: params.get('view') ?? null,
    layout: params.get('layout') ?? null,
    id: idRaw != null ? String(idRaw) : null,
    itemid: params.get('Itemid')
  }
}

function menuItem(row) {
  return {
    id: String(row.id),
    menutype: row.menutype ?? '',
    title: row.title ?? '',
    alias: row.alias ?? '',
    path: row.path ?? '',
    type: row.type ?? '',
    link: row.link ?? '',
    target: parseMenuLink(row.link),
    published: num(row.published),
    parentId: String(row.parent_id ?? '1'),
    level: num(row.level),
    home: String(row.home) === '1',
    templateStyleId: String(row.template_style_id ?? '0'),
    params: parseJsonColumn(row.params),
    lft: num(row.lft),
    clientId: num(row.client_id),
    children: []
  }
}

/** The site menutypes (client_id 0) that actually hold items, in first-seen order. */
export function siteMenuTypes(inv) {
  const seen = []
  for (const row of inv.menu) {
    const t = row.menutype ?? ''
    if (!t || num(row.client_id) !== 0) continue
    if (!seen.includes(t)) seen.push(t)
  }
  return seen
}

/**
 * Nest one menutype's items by parent_id, siblings in lft order. Joomla's root item (id 1) is
 * the implicit parent of level-1 items and is never returned.
 */
export function menuTree(inv, menutype) {
  const items = inv.menu
    .filter((row) => (row.menutype ?? '') === menutype)
    .map(menuItem)
    .sort((a, b) => a.lft - b.lft)
  const byId = new Map(items.map((i) => [i.id, i]))
  const roots = []
  for (const item of items) {
    const parent = byId.get(item.parentId)
    if (parent) parent.children.push(item)
    else roots.push(item)
  }
  return roots
}

/** Flat lookup of every menu item by id (all menutypes, both clients). */
export function menuIndex(inv) {
  return new Map(inv.menu.map((row) => [String(row.id), menuItem(row)]))
}

// ── modules ───────────────────────────────────────────────────────────────────

/**
 * #__modules_menu → Map(moduleId → assignment). `menuid 0` means every page ("ALL"); a negative
 * id is Joomla's "all pages except" form and is recorded under `except`.
 */
export function moduleAssignments(inv) {
  const map = new Map()
  for (const row of inv.modules_menu) {
    const mid = String(row.moduleid)
    const menuid = num(row.menuid)
    const entry = map.get(mid) ?? { all: false, pages: [], except: [] }
    if (menuid === 0) entry.all = true
    else if (menuid < 0) entry.except.push(String(-menuid))
    else entry.pages.push(String(menuid))
    map.set(mid, entry)
  }
  return map
}

/**
 * Whether a module shows on a menu item, the way Joomla reads `#__modules_menu`: menuid 0 is every
 * page; negative ids alone are "every page except these"; positive ids are "only these".
 */
export function assignedTo(assignment, menuId) {
  const id = String(menuId ?? '')
  if (!assignment || assignment.except.includes(id)) return false
  return assignment.all || assignment.pages.includes(id) || (assignment.except.length > 0 && assignment.pages.length === 0)
}

/**
 * The masthead a `mod_jamasthead` module prints on a menu item: the `menuitem_config` row whose
 * `item_id` list names the item, else the module's `default-title` / `default-description`.
 * `{ module, title, description, via: 'menuitem_config' | 'default' }`, or null when the module is
 * not on that item. An empty description stays empty (the module prints none).
 */
export function mastheadFor(module, menuId) {
  if (!module || module.module !== 'mod_jamasthead' || !module.published || !assignedTo(module.assignment, menuId)) return null
  const p = module.params ?? {}
  const cfg = p.menuitem_config ?? {}
  const text = (v) => (typeof v === 'string' ? v.trim() : '')
  const row = (Array.isArray(cfg.item_id) ? cfg.item_id : []).findIndex((ids) => [ids].flat().map(String).includes(String(menuId)))
  if (row >= 0)
    return { module: module.id, title: text(cfg.title?.[row]), description: text(cfg.description?.[row]), via: 'menuitem_config' }
  return { module: module.id, title: text(p['default-title']), description: text(p['default-description']), via: 'default' }
}

/**
 * What a module's params ask its section wrapper to carry: the template's vertical spacing
 * (`top-space` / `bottom-space`, e.g. T4's `large` · `medium` · `normal` · `blank`) and the author's
 * class suffix (`moduleclass_sfx`, e.g. ` bg-light`, whitespace collapsed). A param the module does
 * not set is `null` / `''` — the template's own default is not guessed here.
 */
export function moduleSpacing(params) {
  const p = parseJsonColumn(params)
  const value = (v) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)
  return {
    spacing: { top: value(p['top-space']), bottom: value(p['bottom-space']) },
    moduleClass: typeof p.moduleclass_sfx === 'string' ? p.moduleclass_sfx.split(/\s+/).filter(Boolean).join(' ') : ''
  }
}

/** Site modules (client_id 0) of any type, params parsed, assignment attached. */
export function siteModules(inv) {
  const assignments = moduleAssignments(inv)
  return inv.modules
    .filter((m) => num(m.client_id) === 0)
    .sort((a, b) => num(a.id) - num(b.id))
    .map((m) => ({
      id: String(m.id),
      title: m.title ?? '',
      module: m.module ?? '',
      position: m.position ?? '',
      published: num(m.published) === 1,
      ordering: num(m.ordering),
      showtitle: num(m.showtitle) === 1,
      content: m.content ?? '',
      params: parseJsonColumn(m.params),
      assignment: assignments.get(String(m.id)) ?? { all: false, pages: [], except: [] }
    }))
}

// ── ACM (mod_ja_acm) ──────────────────────────────────────────────────────────

/**
 * Parse one `tmpl/style-N.xml` into the repeatable-field sets the params need to be read with.
 *   flat   — fields declared under `<fieldset multiple="1">` (parallel arrays, key `type[field]`)
 *   nested — `<fieldset multiple="1"><fields name="G" multiple="1">` (key `type[G][field]`)
 */
export function parseAcmSchema(xml) {
  const doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document
  const flat = new Set()
  const nested = {}
  for (const fs of doc.querySelectorAll('fieldset[multiple="1"], fieldset[multiple="true"]')) {
    const groups = fs.querySelectorAll('fields[multiple="1"], fields[multiple="true"]')
    if (groups.length) {
      for (const g of groups) {
        const name = g.getAttribute('name') ?? ''
        nested[name] = nested[name] ?? new Set()
        for (const f of g.querySelectorAll('field')) nested[name].add(f.getAttribute('name'))
      }
    } else {
      for (const f of fs.querySelectorAll('field')) flat.add(f.getAttribute('name'))
    }
  }
  return { flat, nested }
}

/**
 * Load every `<acmDir>/<type>/tmpl/<style>.xml` that exists. Missing files are simply absent from
 * the map — the instance parser then falls back to the shape heuristic for that type/style.
 */
function loadAcmSchemas(acmDir, instances) {
  const schemas = {}
  for (const { type, style } of instances) {
    const key = `${type}/${style}`
    if (schemas[key]) continue
    const file = join(acmDir, type, 'tmpl', `${style}.xml`)
    if (!existsSync(file)) continue
    schemas[key] = parseAcmSchema(readFileSync(file, 'utf8'))
  }
  return schemas
}

/** `params → jatools-config → (( ))-unescaped JSON`; `null` when the module carries no config. */
export function decodeAcmConfig(params) {
  const p = parseJsonColumn(params)
  const cfg = p['jatools-config']
  if (cfg == null || cfg === '') return null
  if (typeof cfg === 'object') return cfg
  try {
    return JSON.parse(String(cfg).replace(/\(\(/g, '<').replace(/\)\)/g, '>'))
  } catch {
    return null
  }
}

const flatten = (v) => (Array.isArray(v) ? v.flatMap(flatten) : [v])
const KEY_RE = /^([^[\]]+)\[([^[\]]+)\](?:\[([^[\]]+)\])?$/
const isMediaValue = (v) => typeof v === 'string' && v.includes('#joomlaImage://')
const cleanValue = (v) => (v == null ? '' : isMediaValue(v) ? String(v).split('#')[0] : String(v))

/**
 * Normalise one mod_ja_acm module into `{ id, type, style, title, position, pages, fields, items }`.
 *
 * Every field, single or repeatable, is stored as an array; singles are `[value]`, repeatables are
 * parallel arrays (item i = field_a[i], field_b[i], …). A schema (from `tmpl/<style>.xml`) says
 * which is which; without one, nested `type[G][field]` keys and any array longer than one are
 * treated as repeatable. Repeatables are zipped into `items[]`; nested groups are flattened so
 * `carousel[slide][slide-title]` becomes item field `slide-title` (the templates read only the
 * last bracket too). Items whose every value is empty are dropped, as the templates skip them.
 */
export function normaliseAcm(module, assignment, schemas = {}) {
  const cfg = decodeAcmConfig(module.params)
  if (!cfg || typeof cfg[':type'] !== 'string') return null
  const type = cfg[':type'].split(':').pop()
  const block = cfg[type] ?? {}
  const outer = parseJsonColumn(module.params)
  const style = block[`jatools-layout-${type}`] ?? outer[`jatools-layout-${type}`] ?? 'style-1'
  const schema = schemas[`${type}/${style}`] ?? null

  const fields = {}
  const repeat = new Map() // field → values[]
  let itemGroup = null
  for (const [key, rawValue] of Object.entries(block)) {
    if (key.startsWith('jatools-')) continue
    const m = key.match(KEY_RE)
    if (!m) continue
    const group = m[3] ? m[2] : null
    const field = m[3] ?? m[2]
    const values = flatten(rawValue).map(cleanValue)
    let repeatable
    if (schema) repeatable = Boolean(group) || schema.flat.has(field)
    else repeatable = Boolean(group) || values.length > 1
    if (repeatable) {
      repeat.set(field, values)
      if (group) itemGroup = group
    } else fields[field] = values.length > 1 ? values : (values[0] ?? '') // a multi-select keeps its list
  }

  // Joomla's module title lives in #__modules, outside the nested ACM config. Keep it available
  // to patterns that expose a title field without replacing an ACM-authored title.
  if (!Object.hasOwn(fields, 'title')) fields.title = module.title ?? ''
  if (!Object.hasOwn(fields, 'subtitle')) {
    const subtitle = Object.entries(block).find(([key]) => /^(?:sub-?title|subtitle)$/i.test(key.match(KEY_RE)?.[2] ?? ''))
    if (subtitle) fields.subtitle = flatten(subtitle[1]).map(cleanValue).join(' ')
  }

  const length = Math.max(0, ...[...repeat.values()].map((v) => v.length))
  const items = []
  for (let i = 0; i < length; i++) {
    const item = {}
    for (const [field, values] of repeat) item[field] = values[i] ?? ''
    if (Object.values(item).some((v) => v !== '')) items.push(item)
  }

  return {
    id: String(module.id),
    type,
    style,
    title: module.title ?? '',
    position: module.position ?? '',
    published: num(module.published) === 1,
    ordering: num(module.ordering),
    showtitle: num(module.showtitle) === 1,
    pages: assignment?.all ? ['ALL'] : [...(assignment?.pages ?? [])],
    ...moduleSpacing(outer),
    itemGroup,
    fields,
    items
  }
}

/**
 * Every mod_ja_acm site module, normalised. Pass `{ acmDir }` (the template's `acm/` folder) to
 * read the field schemas; without it the shape heuristic applies.
 */
export function acmInstances(inv, { acmDir = null, schemas = null } = {}) {
  const assignments = moduleAssignments(inv)
  const mods = inv.modules.filter((m) => m.module === 'mod_ja_acm' && num(m.client_id) === 0)
  let schemaMap = schemas ?? {}
  if (acmDir && !schemas) {
    const probe = mods
      .map((m) => {
        const cfg = decodeAcmConfig(m.params)
        const type = cfg?.[':type']?.split(':').pop() ?? ''
        const outer = parseJsonColumn(m.params)
        const style = cfg?.[type]?.[`jatools-layout-${type}`] ?? outer[`jatools-layout-${type}`] ?? 'style-1'
        return { type, style }
      })
      .filter((p) => p.type)
    schemaMap = loadAcmSchemas(acmDir, probe)
  }
  return mods
    .map((m) => normaliseAcm(m, assignments.get(String(m.id)), schemaMap))
    .filter(Boolean)
    .sort((a, b) => num(a.id) - num(b.id))
}

// ── category blog display options ─────────────────────────────────────────────

/** The category-view options an archive is printed by: spec key → Joomla param (menu item and global alike). */
const ARCHIVE_DISPLAY_PARAMS = { showTitle: 'show_category_title', showDescription: 'show_description', maxLevel: 'maxLevel' }

const setParam = (v) => v !== undefined && v !== null && String(v).trim() !== ''

/**
 * What a com_content category menu item prints, resolved as Joomla resolves it: the menu item's
 * value, and where it says "Use Global" (an empty value) the global com_content option
 * (`#__extensions.params` of com_content, `globalParams`). `{ showTitle, showDescription, maxLevel,
 * showIntro?, from: { <key>: 'menu' | 'category' | 'global' } }`; `maxLevel` -1 is every level, 0 none.
 * `showIntro` is included only when a menu, category or global option declares `show_intro`. The
 * required title/description/depth settings with no value, or any invalid value, throw by name.
 */
export function archiveDisplay(menuParams, globalParams, where, categoryParams = {}) {
  const out = {}
  const from = {}
  for (const [key, field] of Object.entries(ARCHIVE_DISPLAY_PARAMS)) {
    let raw
    if (setParam(menuParams?.[field])) {
      raw = menuParams[field]
      from[key] = 'menu'
    } else if (setParam(globalParams?.[field])) {
      raw = globalParams[field]
      from[key] = 'global'
    } else
      throw new Error(
        `${where}: "${field}" is inherited from the global com_content options, and ${globalParams ? 'they do not set it' : 'none were given'}; ` +
          'export them (the params of com_content in #__extensions) and pass --content-params <file>, or put content-params.json in the j6 folder'
      )
    const text = String(raw).trim()
    if (key === 'maxLevel') {
      if (!/^-?\d+$/.test(text) || Number(text) < -1)
        throw new Error(`${where}: "${field}" (${from[key]}) is ${JSON.stringify(raw)}; expected -1 (every level) or a level count of 0 or more`)
      out[key] = Number(text)
    } else {
      if (text !== '0' && text !== '1') throw new Error(`${where}: "${field}" (${from[key]}) is ${JSON.stringify(raw)}; expected 0 or 1`)
      out[key] = text === '1'
    }
  }
  // Blog intro text is governed by the route's menu item, then category options, then
  // com_content globals. Older exports may omit all three; in that case leave the field absent.
  const introSources = [
    ['menu', menuParams?.show_intro],
    ['category', categoryParams?.show_intro],
    ['global', globalParams?.show_intro]
  ]
  const intro = introSources.find(([, value]) => setParam(value))
  if (intro) {
    const [source, raw] = intro
    const value = String(raw).trim()
    if (value !== '0' && value !== '1') throw new Error(`${where}: "show_intro" (${source}) is ${JSON.stringify(raw)}; expected 0 or 1`)
    out.showIntro = value === '1'
    from.showIntro = source
  }
  return { ...out, from }
}

// ── category blog paging ──────────────────────────────────────────────────────

/**
 * Which com_content category layout a menu item draws: `{ kind: 'blog' | 'list', layout, from }`,
 * or `{ kind: null, layout, why }` when the item does not say. The link's `layout` names the file:
 * `blog` is the blog, none (or `default`) the list. A template's own layout (`ja_vega:portfolio`,
 * `<template>:<name>`) is an alternative of one of the two, and the menu item records which in
 * `params.layout_type` — what Joomla's CategoryModel itself reads to page it as a blog. JA Vega's
 * `/portfolio/*` items are `layout=ja_vega:portfolio` with `layout_type: "blog"`; read by the link
 * alone they were lists, and their per-page count was never declared (M6-5).
 */
export function categoryLayoutKind(target, params) {
  const layout = target?.layout ?? null
  if (layout === 'blog') return { kind: 'blog', layout, from: 'link' }
  if (layout === null || layout === '' || layout === 'default') return { kind: 'list', layout: 'default', from: 'link' }
  const type = params?.layout_type
  if (type === 'blog' || type === 'list') return { kind: type, layout, from: 'layout_type' }
  return { kind: null, layout, why: `layout ${layout} names no layout_type (blog or list)` }
}

/** The blog-layout counts a category page is paged by: spec key → Joomla param (menu item and global alike). */
const ARCHIVE_PAGING_PARAMS = { leading: 'num_leading_articles', intro: 'num_intro_articles', links: 'num_links' }

/**
 * How many articles a com_content category BLOG prints per page, resolved as archiveDisplay
 * resolves its options (the menu item's value, the global one where it says "Use Global"):
 * `{ perPage, leading, intro, links, from }`. `perPage` is the cards — leading + intro articles;
 * `links` are the titles Joomla lists under them ("More Articles") and are kept apart, never
 * added in: a WordPress query draws cards only. A count neither sets gives `{ perPage: null,
 * missing: [<param>…] }` (nothing is guessed, and the number of articles on the page is not
 * evidence of a limit); a value that is not a count throws naming the field.
 */
export function archivePaging(menuParams, globalParams, where) {
  const out = {}
  const from = {}
  const missing = []
  for (const [key, field] of Object.entries(ARCHIVE_PAGING_PARAMS)) {
    let raw
    if (setParam(menuParams?.[field])) {
      raw = menuParams[field]
      from[key] = 'menu'
    } else if (setParam(globalParams?.[field])) {
      raw = globalParams[field]
      from[key] = 'global'
    } else {
      missing.push(field)
      continue
    }
    const text = String(raw).trim()
    if (!/^\d+$/.test(text)) throw new Error(`${where}: "${field}" (${from[key]}) is ${JSON.stringify(raw)}; expected a count of 0 or more`)
    out[key] = Number(text)
  }
  if (missing.includes(ARCHIVE_PAGING_PARAMS.leading) || missing.includes(ARCHIVE_PAGING_PARAMS.intro)) return { perPage: null, missing }
  const perPage = out.leading + out.intro
  return { perPage: perPage >= 1 ? perPage : null, ...out, from, missing }
}

// ── global configuration ──────────────────────────────────────────────────────

/**
 * The fields of Joomla's configuration.php (class JConfig) that joomla-dump.mjs exports to
 * site-config.json: what the site shows or how it routes, nothing else. Credentials (`password`,
 * `secret`, `user`, `db*`, `smtp*`, `host`), paths and keys are not on this list and never leave the
 * site. joomla-dump.mjs keeps the same list (SITE_CONFIG_FIELDS).
 */
export const SITE_CONFIG_FIELDS = ['sitename', 'MetaDesc', 'MetaKeys', 'MetaAuthor', 'language', 'offline', 'sef', 'sef_rewrite', 'sef_suffix', 'offset', 'list_limit', 'feed_limit']

// ── authors ───────────────────────────────────────────────────────────────────

/** The #__user_profiles keys read for an author, by what they are. Nothing else of a profile is read. */
export const AUTHOR_PROFILE_KEYS = { avatar: 'profile.user_avatar' }

/**
 * #__users (+ #__user_profiles) → the people articles name as `created_by`: `[{ id, name,
 * username, blocked, avatar }]`, or null when the inventory has no users table (an older dump).
 * Only those columns are read — never a password, an email, a token or the params. The avatar is
 * the profile's image path, cleaned like an article image (`images/…`, no `#joomlaImage` tail).
 */
export function authors(inv) {
  if (!Array.isArray(inv.users)) return null
  const avatars = new Map()
  for (const r of Array.isArray(inv.user_profiles) ? inv.user_profiles : []) {
    if (r.profile_key !== AUTHOR_PROFILE_KEYS.avatar) continue
    let v = r.profile_value ?? ''
    // Joomla stores a profile value JSON-encoded ("\"images\\/a.jpg\""); a plain one is taken as is.
    if (/^\s*"/.test(v)) {
      try {
        v = JSON.parse(v)
      } catch {}
    }
    const clean = String(v ?? '').split('#')[0].replace(/\\\//g, '/').trim()
    if (clean) avatars.set(String(r.user_id), clean)
  }
  return inv.users.map((u) => ({
    id: String(u.id),
    name: String(u.name ?? '').trim(),
    username: String(u.username ?? '').trim(),
    blocked: String(u.block ?? '0') === '1',
    avatar: avatars.get(String(u.id)) ?? null
  }))
}

// ── article tags ──────────────────────────────────────────────────────────────

/** The tag map rows that tag an article (#__contentitem_tag_map.type_alias); other components' rows stay in the inventory and are skipped here. */
export const ARTICLE_TAG_TYPE = 'com_content.article'
const INT = /^\d+$/

/**
 * #__contentitem_tag_map ⋈ #__tags → the tags each article shows: `{ byArticle: Map<article id,
 * [title]>, notes }`, or null when the inventory has neither table (a dump older than the tag
 * tables, or a site without them: not declared — never "no article has a tag"). An empty table is
 * an answer: no tags. One table without the other, or a table that is not a list of rows, throws:
 * that is a dump that went wrong, not a site without tags.
 *
 * Only rows of ARTICLE_TAG_TYPE are joined (a contact or a category tagged with the same id is not
 * an article). A tag Joomla does not show — unpublished, trashed, the tree's root — is left out;
 * a row naming a tag the table does not hold is left out with a note. A map row without a
 * type_alias throws: it cannot be told apart from an article's row. Titles come in the tag
 * tree's order (`lft`, then id), the order Joomla prints them, each tag once and each title once
 * (WordPress keeps tags by name). An id, `lft` or published state that is not an integer, or a
 * shown tag an article carries that has no title, throws, naming the row: a malformed table is not
 * read as fewer tags.
 */
export function articleTags(inv) {
  const declared = ['tags', 'contentitem_tag_map'].filter((k) => inv[k] !== undefined)
  if (!declared.length) return null
  for (const k of ['tags', 'contentitem_tag_map']) {
    if (inv[k] === undefined) throw new Error(`#__${k}: not in the inventory while #__${declared[0]} is — the article tags cannot be read`)
    if (!Array.isArray(inv[k])) throw new Error(`#__${k}: not a list of rows (${inv[k] === null ? 'null' : typeof inv[k]})`)
  }
  const notes = []
  const tags = new Map()
  for (const t of inv.tags) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) throw new Error(`#__tags: a row that is not an object (${JSON.stringify(t)})`)
    for (const k of ['id', 'lft', 'published'])
      if (!/^-?\d+$/.test(String(t?.[k] ?? '').trim())) throw new Error(`#__tags: row ${JSON.stringify(t?.id ?? null)} has no integer ${k} (${JSON.stringify(t?.[k] ?? null)})`)
    const id = String(t.id).trim()
    if (tags.has(id)) throw new Error(`#__tags: tag ${id} appears twice`)
    tags.set(id, { id, lft: Number(t.lft), title: String(t.title ?? '').trim(), shown: String(t.published).trim() === '1' && String(t.alias ?? '') !== 'root' && String(t.parent_id ?? '1') !== '0' })
  }
  const byArticle = new Map()
  const missing = new Set()
  for (const r of inv.contentitem_tag_map) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error(`#__contentitem_tag_map: a row that is not an object (${JSON.stringify(r)})`)
    // a row without a component is not "another component's row": it throws rather than drop a tag
    if (typeof r.type_alias !== 'string' || !r.type_alias.trim()) throw new Error(`#__contentitem_tag_map: a row without a type_alias (${JSON.stringify(r)}) — whose tag it is cannot be told`)
    if (r.type_alias.trim() !== ARTICLE_TAG_TYPE) continue
    const item = String(r.content_item_id ?? '').trim()
    const tagId = String(r.tag_id ?? '').trim()
    if (!INT.test(item) || !INT.test(tagId)) throw new Error(`#__contentitem_tag_map: an article row without an integer content_item_id or tag_id (${JSON.stringify(r)})`)
    const tag = tags.get(tagId)
    if (!tag) {
      missing.add(tagId)
      continue
    }
    if (!tag.shown) continue
    if (!tag.title) throw new Error(`#__tags: tag ${tag.id}, on article ${item}, has no title`)
    if (!byArticle.has(item)) byArticle.set(item, new Map())
    byArticle.get(item).set(tag.id, tag)
  }
  if (missing.size) notes.push(`#__contentitem_tag_map names tag(s) ${[...missing].sort((a, b) => Number(a) - Number(b)).join(', ')} that #__tags does not hold; those tags are left off their articles`)
  const out = new Map()
  for (const [item, set] of byArticle) {
    const titles = []
    const seen = new Set()
    for (const t of [...set.values()].sort((a, b) => a.lft - b.lft || Number(a.id) - Number(b.id))) {
      const key = t.title.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      titles.push(t.title)
    }
    out.set(item, titles)
  }
  return { byArticle: out, notes }
}

// ── routes → WordPress views ──────────────────────────────────────────────────

const LANDING_LAYOUTS = new Set(['home', 'home-2', 'landing', 'od-landing'])
const USERS_VIEWS = {
  login: 'page-login',
  registration: 'page-register',
  profile: 'page-account',
  reset: 'page-password',
  remind: 'page-password'
}

/** menu item → template layout name via #__template_styles (`typelist-layout`), default style when unset. */
export function templateLayouts(inv) {
  const styles = new Map()
  let defaultLayout = 'default'
  for (const s of inv.template_styles) {
    if (num(s.client_id) !== 0) continue
    const layout = parseJsonColumn(s.params)['typelist-layout'] || 'default'
    styles.set(String(s.id), layout)
    if (String(s.home) === '1') defaultLayout = layout
  }
  return { styles, defaultLayout }
}

/** Derive the spec-pack page filename from a WordPress path: `/` → index.html, `/a/b` → a-b.html. */
export function fileForPath(wpPath) {
  const segs = String(wpPath).split('/').filter(Boolean)
  return segs.length ? `${segs.join('-')}.html` : 'index.html'
}

/**
 * Classify the rendered routes (`render-routes.json`: `[{ id: <menu item id>, path }]`) into
 * WordPress views, per the content-map table:
 *
 *   home item (any view) → front-page · featured → page-landing · article → page (page-landing /
 *   page-onepage when the template layout says so) · category → category · categories → page ·
 *   archive → date · author → author · users.* → page-login/register/account/password ·
 *   finder.search → search · tags.tags → page · tags.tag → tag · contact.contact (first) →
 *   page-contact · every other contact/newsfeeds/wrapper view → a GAP with a 301 target.
 *
 * Every route keeps its Joomla path verbatim — the URL is the contract — except the paths listed
 * in `routeRenames` (D2: the three `mag-*` category routes) and an article page whose menu alias
 * is the article's alias with Joomla's collision suffix (articleSlugs). The WordPress slug is the
 * last path segment; the seeder rebuilds nested paths as parent/child pages.
 *
 * @param {{ retitle?: string[], routeRenames?: Record<string, string> }} [opts]
 */
export function routeViews(inv, routes, { retitle = [], routeRenames = {} } = {}) {
  const index = menuIndex(inv)
  const arts = new Map(articles(inv).map((a) => [a.id, a]))
  const cats = new Map(categories(inv, { retitle }).map((c) => [c.id, c]))
  const { styles, defaultLayout } = templateLayouts(inv)
  const seenArticle = new Set()
  let contactPage = null

  const entries = routes.map((route) => {
    const item = index.get(String(route.id))
    const joomlaPath = route.path.startsWith('/') ? route.path : `/${route.path}`
    if (!item)
      return {
        menuId: String(route.id),
        joomlaPath,
        kind: 'gap',
        reason: 'menu item not in inventory',
        redirectTo: '/'
      }
    const { option, view, layout: linkLayout, id } = item.target
    const layout = styles.get(item.templateStyleId) ?? defaultLayout
    const base = {
      menuId: item.id,
      joomlaPath,
      title: item.title,
      menutype: item.menutype,
      home: item.home,
      option,
      view,
      linkLayout,
      targetId: id,
      layout
    }
    const wpPath = item.home ? '/' : (routeRenames[joomlaPath] ?? joomlaPath)
    const wpSlug = wpPath.split('/').filter(Boolean).pop() ?? (item.alias || 'home')
    const page = (wpView, extra = {}) => ({
      ...base,
      kind: 'page',
      wpView,
      wpSlug,
      wpPath,
      file: fileForPath(wpPath),
      ...extra
    })

    let out
    if (option === 'com_content' && view === 'article') {
      const art = arts.get(String(id))
      const first = !seenArticle.has(String(id))
      seenArticle.add(String(id))
      const wpView =
        layout === 'od-onepage' ? 'page-onepage' : LANDING_LAYOUTS.has(layout) ? 'page-landing' : 'page'
      out = page(wpView, {
        articleId: String(id),
        articleTitle: art?.title ?? null,
        duplicateOf: first ? null : String(id)
      })
    } else if (option === 'com_content' && view === 'featured') {
      out = page('page-landing')
    } else if (option === 'com_content' && view === 'category') {
      const cat = cats.get(String(id))
      out = page('category', {
        categoryId: String(id),
        categoryTitle: cat?.title ?? null,
        categorySlug: cat?.wpSlug ?? null
      })
    } else if (option === 'com_content' && view === 'categories') {
      out = page('page', { parentCategoryId: id })
    } else if (option === 'com_content' && view === 'archive') {
      out = page('date')
    } else if (option === 'com_content' && view === 'author') {
      out = page('author')
    } else if (option === 'com_users' && USERS_VIEWS[view]) {
      out = page(USERS_VIEWS[view])
    } else if (option === 'com_finder' && view === 'search') {
      out = page('search')
    } else if (option === 'com_tags' && view === 'tags') {
      out = page('page')
    } else if (option === 'com_tags' && view === 'tag') {
      out = page('tag', { tagId: id })
    } else if (option === 'com_contact' && view === 'contact' && !contactPage) {
      out = page('page-contact', { contactId: id })
      contactPage = out
    } else {
      out = {
        ...base,
        kind: 'gap',
        reason: `no WordPress core equivalent for ${option ?? '?'}/${view ?? '?'}`
      }
    }
    if (item.home && out.kind === 'page') out.wpView = 'front-page'
    return out
  })

  // Gap targets: contact views → the contact page; newsfeeds → the blog route (alias "blog", else
  // the first category route); wrapper and anything else → home.
  const pages = entries.filter((e) => e.kind === 'page')
  const home = pages.find((p) => p.home)?.wpPath ?? '/'
  const blog =
    (
      pages.find((p) => p.wpView === 'category' && /^blog$/i.test(index.get(p.menuId)?.alias ?? '')) ??
      pages.find((p) => p.wpView === 'category')
    )?.wpPath ?? home
  for (const e of entries) {
    if (e.kind !== 'gap' || e.redirectTo) continue
    if (e.option === 'com_contact') e.redirectTo = contactPage?.wpPath ?? home
    else if (e.option === 'com_newsfeeds') e.redirectTo = blog
    else e.redirectTo = home
  }
  articleSlugs(entries, arts, routeRenames)
  return entries
}

/** A slug WordPress keeps as written: lower-case ASCII words joined by single hyphens. */
const PLAIN_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * The slug of an article page when its menu alias is the article's alias plus Joomla's collision
 * suffix (`cloud-services-2` for article alias `cloud-services`). Joomla numbers an alias another
 * item of the site already used; WordPress only needs a page slug unique among the pages of one
 * parent, so the page takes the article's alias unless a route already holds that path (a page, a
 * gap redirected from it, or a route below it), or another article page asks for the same path —
 * then every one of them keeps its menu alias. Decided on the whole set of routes, so the order of
 * the inventory does not change the answer. A category's own alias is a term, not a page, and
 * holds no page path. The front page and the routes `routeRenames` names keep theirs.
 *
 * A route that moves takes the routes below it along (`/a-2/b` → `/a/b`), and a page below it that
 * moves too lands under the new path (`/a-2/b-2` → `/a/b`): the paths are decided all at once. Each
 * moved route gets `renamed: { from, why }`, and every article page whose menu alias differs from its article's gets
 * `slugNote` saying which slug it has and why. Mutates `entries`.
 */
function articleSlugs(entries, arts, routeRenames = {}) {
  const wants = []
  for (const e of entries) {
    if (e.kind !== 'page' || !e.articleId || e.home || routeRenames[e.joomlaPath] || e.wpPath !== e.joomlaPath) continue
    const alias = String(arts.get(e.articleId)?.alias ?? '').trim()
    const segs = e.wpPath.split('/').filter(Boolean)
    const menuSlug = segs.at(-1)
    if (!menuSlug || alias === menuSlug) continue
    const m = /^(.+)-(\d+)$/.exec(menuSlug)
    if (!alias) e.slugNote = `keeps its menu alias "${menuSlug}": article #${e.articleId} has no alias`
    else if (!m || m[1] !== alias || Number(m[2]) < 2)
      e.slugNote = `keeps its menu alias "${menuSlug}": it is not article #${e.articleId}'s alias "${alias}" with Joomla's -N suffix, so it is the address the site chose`
    else if (!PLAIN_SLUG.test(alias)) e.slugNote = `keeps its menu alias "${menuSlug}": article #${e.articleId}'s alias "${alias}" is not a plain slug`
    else wants.push({ e, alias, menuSlug })
  }
  // Every move is decided on the paths the routes will have once ALL the moves are made — a page
  // and a page below it may both move (`/a-2` → `/a`, `/a-2/b-2` → `/a/b`), and the order they are
  // written in must not matter. Moves that collide are dropped together and the rest decided
  // again, until what is left moves without a collision: set-wise, so the inventory order does
  // not change the answer.
  const byNum = (a, b) => Number(a.menuId) - Number(b.menuId)
  let active = [...wants]
  const finalPathWith = (moving) => {
    const by = new Map(moving.map((w) => [w.e.wpPath, w.alias]))
    return (p) => {
      const segs = String(p).split('/').filter(Boolean)
      return `/${segs.map((seg, k) => by.get(`/${segs.slice(0, k + 1).join('/')}`) ?? seg).join('/')}`
    }
  }
  for (;;) {
    const fin = finalPathWith(active)
    const finalOf = (x) => (x.kind === 'page' ? fin(x.wpPath) : x.joomlaPath)
    const dropped = []
    for (const w of active) {
      const target = finalOf(w.e)
      w.target = target
      const parent = target.slice(0, target.lastIndexOf('/')) || '/'
      // the routes below this page move with it: they are its own, never a holder
      const others = entries.filter((x) => x !== w.e && !(x.kind === 'page' && x.wpPath.startsWith(`${w.e.wpPath}/`)))
      const holders = others.filter((x) => finalOf(x) === target || String(finalOf(x)).startsWith(`${target}/`)).sort((a, b) => (finalOf(b) === target) - (finalOf(a) === target) || byNum(a, b))
      const rivals = active.filter((o) => o !== w && finalOf(o.e) === target)
      const holder = holders.find((x) => !rivals.some((o) => o.e === x))
      if (rivals.length) w.note = `keeps its menu alias "${w.menuSlug}": menu items ${[w, ...rivals].map((o) => o.e.menuId).sort((a, b) => Number(a) - Number(b)).join(', ')} all open an article with alias "${w.alias}" under ${parent}`
      else if (holder) {
        const at = finalOf(holder)
        w.note = `keeps its menu alias "${w.menuSlug}": ${at === target ? `${target} is` : `${at} below ${target} is`} held by menu item ${holder.menuId} (${holder.kind === 'gap' ? 'a route redirected from there' : holder.wpView})`
      } else continue
      dropped.push(w)
    }
    if (!dropped.length) break
    for (const w of dropped) w.e.slugNote = w.note
    active = active.filter((w) => !dropped.includes(w))
  }
  const fin = finalPathWith(active)
  const whyOf = new Map()
  for (const w of active) whyOf.set(w.e, `page slug from article #${w.e.articleId}'s alias "${w.alias}": the menu alias "${w.menuSlug}" carries Joomla's -N suffix and no page under ${w.target.slice(0, w.target.lastIndexOf('/')) || '/'} holds "${w.alias}"`)
  // Decided on the paths as they are, then written: the nearest moving page above a route is what
  // its move is explained by.
  const was = new Map(entries.filter((x) => x.kind === 'page').map((x) => [x, x.wpPath]))
  const moverAbove = (p) => active.filter((w) => p.startsWith(`${was.get(w.e)}/`)).sort((a, b) => was.get(b.e).length - was.get(a.e).length)[0]
  for (const x of entries) {
    if (x.kind === 'gap' && typeof x.redirectTo === 'string' && x.redirectTo.startsWith('/')) x.redirectTo = fin(x.redirectTo)
    if (x.kind !== 'page') continue
    const from = was.get(x)
    const to = fin(from)
    if (to === from) continue
    const up = whyOf.has(x) ? null : moverAbove(from)
    x.renamed = { from, why: whyOf.get(x) ?? `below ${was.get(up.e)}, which became ${fin(was.get(up.e))} (${whyOf.get(up.e)})` }
    x.wpPath = to
    x.file = fileForPath(to)
  }
  for (const w of active) {
    w.e.wpSlug = w.alias
    w.e.slugNote = whyOf.get(w.e)
  }
  return entries
}
