/**
 * The menu tree of a sealed Joomla quickstart, read from its contract alone (`content-map.json` +
 * `presentation-lock.json`). Pure: the showcase-navigation generator and its tests feed it parsed JSON.
 *
 * What it keeps of each published site menu item is what decides whether the item may leave the
 * navigation: its place in the tree (`parent_id`, menutype, level), whether it is a home page (per
 * language), what it points at (an alias's `aliasoptions`, a URL's `Itemid` and fragment) and whether it
 * is already hidden (`menu_show`, absent = shown). Of each module it keeps what it renders (`mod_menu`
 * menutype/base/start/end level), where (position, `moduleclass_sfx`) and on which pages (assignments).
 */

/** `index.php?option=com_content&view=article&id=90` → { option, view, id, Itemid } */
export function linkParams(link) {
  const text = String(link ?? '')
  const query = (text.split('?')[1] ?? '').split('#')[0]
  return Object.fromEntries(new URLSearchParams(query))
}

/** The params JSON of a lock row; a row whose params do not parse reads as none. */
export function rowParams(row) {
  if (row?.params && typeof row.params === 'object') return row.params
  try {
    const parsed = JSON.parse(String(row?.params ?? '{}'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * `menu_show` as the contract stores it: the string "1"/"0", or null when the key is absent (Joomla then
 * shows the item). The map writes `from` exactly as found, so a revert can delete a key that was absent.
 */
export function menuShowOf(params) {
  if (!Object.prototype.hasOwnProperty.call(params, 'menu_show')) return null
  return String(params.menu_show)
}

/**
 * com_content's shipped `show_subcategory_content` default, per Joomla release, as each tag's
 * `administrator/components/com_content/config.xml` declares it. A release missing here has no known
 * default: its blogs reach no subcategory through the global.
 */
export const COM_CONTENT_SUBCATEGORY_DEFAULTS = {
  '6.0.0': '0',
  '6.0.2': '0',
  '6.0.3': '0',
  '6.1.1': '0',
  '6.1.2': '0',
  '6.1.3': '0'
}

/**
 * The com_content global a menu item's empty `show_subcategory_content` defers to, and where it was read.
 * The lock carries no component parameters, so it is the default the pinned Joomla release ships.
 * @returns {{ value: string | null, source: string }}
 */
export function subcategoryGlobal(manifest) {
  const version = manifest?.quickstart?.cms?.version ?? manifest?.quickstart?.platformVersion ?? null
  if (!version) return { value: null, source: 'unknown: the manifest pins no Joomla release' }
  const value = COM_CONTENT_SUBCATEGORY_DEFAULTS[version]
  if (value === undefined)
    return { value: null, source: `unknown: no com_content default read for Joomla ${version}` }
  return { value, source: `com_content config.xml default of Joomla ${version}` }
}

/**
 * How many levels of subcategories a category blog lists the articles of (`show_subcategory_content`):
 * "-1" every level, a positive number that many, anything else none. A missing or empty value defers to
 * the com_content global (`global`, as `subcategoryGlobal` reads it); an unknown global reaches nothing.
 * A list layout never lists subcategory articles.
 */
export function subcategoryDepth(query, params, global = null) {
  if (query.option !== 'com_content' || query.view !== 'category') return 0
  if (query.layout !== 'blog' && params.layout_type !== 'blog') return 0
  const own = String(params.show_subcategory_content ?? '').trim()
  const value = own === '' ? String(global ?? '').trim() : own
  if (value === '-1') return Number.POSITIVE_INFINITY
  return /^[1-9][0-9]*$/.test(value) ? Number(value) : 0
}

/**
 * @param {{ entities: Array<{ key: string, kind: string, identity?: object, sourceId: number|string }> }} contentMap
 * @param {{ entities: Record<string, any>, assignments?: Array<{ moduleid: string, menuid: string }> }} lock
 * @param {{ subcategoryGlobal?: string | null }} [options] the com_content `show_subcategory_content` global
 */
export function buildJoomlaTree(contentMap, lock, { subcategoryGlobal: global = null } = {}) {
  const rows = lock.entities ?? {}
  const entities = contentMap.entities ?? []
  /** @type {Map<string, any>} menu item by key */
  const items = new Map()
  /** @type {Map<string, string>} menu item key by source id */
  const bySource = new Map()
  for (const e of entities) {
    if (e.kind !== 'menuItem') continue
    const row = rows[e.key]
    if (!row || String(row.client_id ?? '0') !== '0') continue
    bySource.set(String(e.sourceId), e.key)
    const params = rowParams(row)
    const link = String(row.link ?? '')
    const q = linkParams(link)
    const fragment = link.includes('#') ? link.slice(link.indexOf('#') + 1) : ''
    items.set(e.key, {
      key: e.key,
      sourceId: Number(e.sourceId),
      identity: e.identity ?? {},
      menutype: String(row.menutype ?? e.identity?.menutype ?? ''),
      path: String(row.path ?? e.identity?.path ?? ''),
      title: String(row.title ?? ''),
      alias: String(row.alias ?? ''),
      type: String(row.type ?? ''),
      link,
      query: q,
      fragment,
      published: String(row.published ?? ''),
      home: String(row.home ?? '0') === '1',
      language: String(row.language ?? '*'),
      level: Number(row.level ?? 0),
      parentSource: String(row.parent_id ?? '1'),
      menuShow: menuShowOf(params),
      aliasTargetSource: row.type === 'alias' ? String(params.aliasoptions ?? '') : '',
      subcategoryDepth: subcategoryDepth(q, params, global),
      parent: null,
      children: []
    })
  }
  for (const item of items.values()) {
    const parent = bySource.get(item.parentSource)
    item.parent = parent && items.has(parent) ? parent : null
    if (item.parent) items.get(item.parent).children.push(item.key)
    item.aliasTarget = item.aliasTargetSource ? (bySource.get(item.aliasTargetSource) ?? null) : null
    // A URL item that names a menu item (`index.php?Itemid=101#about_me`) points at it too.
    item.urlTarget =
      item.type === 'url' && item.query.Itemid ? (bySource.get(String(item.query.Itemid)) ?? null) : null
  }
  for (const item of items.values())
    item.children.sort((a, b) => items.get(a).sourceId - items.get(b).sourceId)

  /** Assignments by module source id: 'all', or { include: number[], exclude: number[] }. */
  const assigned = new Map()
  for (const a of lock.assignments ?? []) {
    const id = String(a.moduleid)
    const menu = Number(a.menuid)
    const entry = assigned.get(id) ?? { all: false, include: [], exclude: [] }
    if (menu === 0) entry.all = true
    else if (menu > 0) entry.include.push(menu)
    else entry.exclude.push(-menu)
    assigned.set(id, entry)
  }
  /** @type {Map<string, any>} module by key */
  const modules = new Map()
  for (const e of entities) {
    if (e.kind !== 'module') continue
    const row = rows[e.key]
    if (!row || String(row.client_id ?? '0') !== '0') continue
    const params = rowParams(row)
    const a = assigned.get(String(e.sourceId))
    modules.set(e.key, {
      key: e.key,
      sourceId: Number(e.sourceId),
      identity: e.identity ?? {},
      title: String(row.title ?? ''),
      module: String(row.module ?? ''),
      position: String(row.position ?? ''),
      published: String(row.published ?? ''),
      moduleclassSfx: String(params.moduleclass_sfx ?? '').trim(),
      menutype: row.module === 'mod_menu' ? String(params.menutype ?? '') : null,
      base: row.module === 'mod_menu' ? String(params.base ?? '') : null,
      startLevel: row.module === 'mod_menu' ? Number(params.startLevel ?? 1) || 1 : null,
      endLevel: row.module === 'mod_menu' ? Number(params.endLevel ?? 0) || 0 : null,
      assignment: !a
        ? 'none'
        : a.all
          ? a.exclude.length
            ? 'exclude'
            : 'all'
          : a.exclude.length
            ? 'exclude'
            : 'include',
      menuIds: a ? (a.all || a.exclude.length ? a.exclude : a.include).slice().sort((x, y) => x - y) : []
    })
  }
  /** @type {Map<string, any>} template style by key */
  const styles = new Map()
  for (const e of entities) {
    if (e.kind !== 'templateStyle') continue
    const row = rows[e.key]
    if (!row || String(row.client_id ?? '0') !== '0') continue
    const params = rowParams(row)
    styles.set(e.key, {
      key: e.key,
      sourceId: Number(e.sourceId),
      identity: e.identity ?? {},
      template: String(row.template ?? ''),
      home: String(row.home ?? '0'),
      title: String(row.title ?? ''),
      offcanvas: Object.prototype.hasOwnProperty.call(params, 'addon_offcanvas_enable')
        ? String(params.addon_offcanvas_enable)
        : null,
      // The params column as the lock holds it: an operation on a style is pinned to these bytes.
      rawParams: typeof row.params === 'string' ? row.params : null,
      t3: String(params.t3_template ?? '') === '1'
    })
  }
  /** Content categories and articles, by source id: what a menu item that opens them gives a visitor. */
  const categories = new Map()
  const articles = new Map()
  for (const e of entities) {
    const row = rows[e.key]
    if (!row) continue
    if (e.kind === 'category' && String(row.extension ?? 'com_content') === 'com_content')
      categories.set(String(e.sourceId), {
        key: e.key,
        title: String(row.title ?? ''),
        parent: String(row.parent_id ?? '1'),
        published: String(row.published ?? '') === '1'
      })
    if (e.kind === 'article')
      articles.set(String(e.sourceId), {
        key: e.key,
        title: String(row.title ?? ''),
        alias: String(row.alias ?? ''),
        catid: String(row.catid ?? ''),
        featured: String(row.featured ?? '0') === '1',
        published: String(row.state ?? '') === '1'
      })
  }
  /**
   * Every menu row of the lock, content map or not, by the parent it hangs under: whether an item still
   * has a child on screen is read from these, so a row the content map leaves out still counts.
   */
  const menuRows = []
  for (const [key, row] of Object.entries(rows)) {
    if (!/^menuItem-\d+$/.test(key) || !row || typeof row !== 'object') continue
    menuRows.push({ key, parentSource: String(row.parent_id ?? ''), shown: lockShown(row) })
  }
  return { items, bySource, modules, styles, categories, articles, menuRows }
}

/** Every key of the subtree under `key`, itself first. */
export function subtree(tree, key) {
  const out = []
  const walk = (k) => {
    out.push(k)
    for (const c of tree.items.get(k)?.children ?? []) walk(c)
  }
  walk(key)
  return out
}

/** The keys from the item's parent up to its level-1 ancestor. */
export function ancestors(tree, key) {
  const out = []
  for (let p = tree.items.get(key)?.parent; p; p = tree.items.get(p)?.parent) out.push(p)
  return out
}

/** Whether a menu item is shown in a menu today: published and `menu_show` not "0". */
export const shownToday = (item) => item.published === '1' && item.menuShow !== '0'

/**
 * Whether a lock menu row is shown, as the Claude Cowork plugin reads it (`ShowcaseNavProfile::shown`):
 * published "1" and `menu_show` not "0"/0/false; params that are empty, do not parse or lack the key read as shown.
 */
export function lockShown(row) {
  if (String(row.published ?? '') !== '1') return false
  if (row.params && typeof row.params === 'object') return !['0', 0, false].includes(row.params.menu_show)
  const text = String(row.params ?? '')
  if (text.trim() === '') return true
  try {
    const params = JSON.parse(text)
    return !params || typeof params !== 'object' || !['0', 0, false].includes(params.menu_show)
  } catch {
    return true
  }
}

/**
 * The items a `mod_menu` module renders: those of its menutype within its levels, shown today, whose
 * every ancestor is shown (Joomla drops the children of a hidden item). `null` when what it renders
 * depends on the page (`base` set, or a start level past 1): the rule then has no answer.
 */
export function renderedBy(tree, module) {
  if (module.module !== 'mod_menu' || !module.menutype) return null
  if (module.base || module.startLevel > 1) return null
  const out = []
  for (const item of tree.items.values()) {
    if (item.menutype !== module.menutype) continue
    if (module.endLevel && item.level > module.endLevel) continue
    if (!shownToday(item)) continue
    if (ancestors(tree, item.key).some((a) => !shownToday(tree.items.get(a)))) continue
    out.push(item.key)
  }
  return out.sort((a, b) => tree.items.get(a).sourceId - tree.items.get(b).sourceId)
}
