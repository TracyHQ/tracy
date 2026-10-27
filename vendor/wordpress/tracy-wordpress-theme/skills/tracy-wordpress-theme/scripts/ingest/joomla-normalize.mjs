// joomla-normalize.mjs — source-value normalisation the Joomla adapter does before it reads a module
// or a link (issues #67, #73). Kept beside from-joomla.mjs, not in scripts/lib: these are adapter
// readings of what a source site stores, each with the evidence it stands on.
import { decodeAcmConfig, parseJsonColumn } from '../lib/joomla-inventory.mjs'

const KEY = /^[^[\]]+\[[^[\]]+\](?:\[[^[\]]+\])?$/
const MAX_DEPTH = 3

/**
 * ACM keeps a repeatable group (`type[G]`, a `jalist` field) either as parallel arrays under
 * `type[G][field]` keys, or as ONE object under `type[G]` whose values are those same keys (JA Morgan's
 * slideshow #98, features-intro #101, accordion #105, testimonials #106, clients #118). The inventory
 * reader takes the object for a value and prints "[object Object]". Here the object is expanded into
 * the `type[G][field]` keys the reader reads (a group named as its own key, `name[G]` holding `name[G][field]`, whatever
 * `name` is); the object's non-field keys (`rows`, `cols`, `type`: the
 * editor's own layout of the list) are dropped and named. A value under a nested key that is neither a
 * bracket key nor a scalar, or nested deeper than MAX_DEPTH, is not expanded: it is named in `unread`
 * and left out, never stringified.
 * @returns {{ params: string, expanded: {key: string, fields: string[]}[], dropped: {key: string, name: string}[], unread: {key: string, why: string}[] } | null} null when nothing is nested
 */
export function expandAcmNested(paramsColumn) {
  const cfg = decodeAcmConfig(paramsColumn)
  if (!cfg || typeof cfg[':type'] !== 'string') return null
  const type = cfg[':type'].split(':').pop()
  const block = cfg[type]
  if (!block || typeof block !== 'object' || Array.isArray(block)) return null
  if (!Object.entries(block).some(([k, v]) => !k.startsWith('jatools-') && v && typeof v === 'object' && !Array.isArray(v))) return null
  const next = {}
  const expanded = []
  const dropped = []
  const unread = []
  const hoist = (key, obj, depth) => {
    const fields = []
    for (const [sub, val] of Object.entries(obj)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        if (depth >= MAX_DEPTH) unread.push({ key: sub, why: `nested deeper than ${MAX_DEPTH}` })
        else hoist(sub, val, depth + 1)
      } else if (KEY.test(sub) && sub.startsWith(`${key}[`)) {
        next[sub] = val
        fields.push(sub)
      } else dropped.push({ key, name: sub })
    }
    expanded.push({ key, fields })
  }
  for (const [k, v] of Object.entries(block)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !k.startsWith('jatools-')) hoist(k, v, 1)
    else next[k] = v
  }
  const outer = parseJsonColumn(paramsColumn)
  return { params: JSON.stringify({ ...outer, 'jatools-config': { ...cfg, [type]: next } }), expanded, dropped, unread }
}

/**
 * `inv` with every mod_ja_acm row's nested groups expanded (expandAcmNested), and one note per module
 * changed. The rows are copied; the input is not modified.
 */
export function normaliseAcmModules(inv) {
  const notes = []
  const modules = inv.modules.map((m) => {
    if (m.module !== 'mod_ja_acm' || String(m.client_id) !== '0') return m
    const r = expandAcmNested(m.params)
    if (!r) return m
    const fields = r.expanded.reduce((n, e) => n + e.fields.length, 0)
    notes.push(
      `module #${m.id} (${m.title ?? ''}): ACM nested group(s) ${r.expanded.map((e) => e.key).join(', ')} expanded into ${fields} field list(s)` +
        (r.dropped.length ? `; editor layout keys not read: ${[...new Set(r.dropped.map((d) => d.name))].join(', ')}` : '') +
        (r.unread.length ? `; NOT read (${r.unread.map((u) => `${u.key}: ${u.why}`).join('; ')})` : '')
    )
    return { ...m, params: r.params }
  })
  return { inv: { ...inv, modules }, notes }
}

/** PHP truthiness of a module param, as the chrome's `if ($params->get(x))` reads it. */
const truthy = (v) => !(v == null || v === '' || v === 0 || v === '0' || v === false || (Array.isArray(v) && !v.length))
const text = (v) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

/**
 * What a T3 `T3Section` module frame prints, from the module's params (JA Morgan's html/modules.php
 * `modChrome_T3Section`): the section's classes and inline style, its container, the title's sub-heading.
 * Read exactly as that chrome reads them — a param is on when PHP would call it true (`"0"` is off) —
 * with the names as the params store them, so a seeder can draw the same section:
 *   `color-module` → class `mod-bg-<value>`; `bg-module` → `background-image: url(<site root><value>)`;
 *   `bg-position` → `background-position`; `padding-top|bottom`, `border-top|bottom` → the class of the same name;
 *   `module-width` 1 → `container`, otherwise `container-fluid`; `sub-heading` → the span above the title;
 *   `module_tag` (default section), `header_tag` (h3), `header_class`, `bootstrap_size` (`col-sm-N`), `moduleclass_sfx`.
 * `frame.classes` is the class list the chrome prints. Only the params the module has are named in `set`.
 */
export function t3SectionFrame(params) {
  const p = params ?? {}
  const set = Object.keys(p).filter((k) => ['color-module', 'bg-module', 'bg-position', 'padding-top', 'padding-bottom', 'border-top', 'border-bottom', 'module-width', 'sub-heading', 'module_tag', 'header_tag', 'header_class', 'bootstrap_size', 'moduleclass_sfx'].includes(k))
  const colorModule = truthy(p['color-module']) ? text(p['color-module']) : null
  const bg = truthy(p['bg-module']) ? text(p['bg-module']) : null
  const bgPosition = truthy(p['bg-position']) ? text(p['bg-position']) : null
  const on = (k) => truthy(p[k])
  const width = text(p['module-width']) === '1' ? 'container' : 'container-fluid'
  const size = truthy(p.bootstrap_size) ? Number.parseInt(text(p.bootstrap_size), 10) || 0 : 0
  const sfx = text(p.moduleclass_sfx)
  const classes = ['t3-section', 'section', ...(sfx ? [sfx] : []), ...(size ? [`col-sm-${size}`] : []), ...['padding-bottom', 'padding-top', 'border-bottom', 'border-top'].filter(on), ...(colorModule ? [`mod-bg-${colorModule}`] : [])].join(' ')
  return {
    chrome: 'T3Section',
    classes,
    colorModule,
    backgroundImage: bg,
    backgroundPosition: bgPosition,
    paddingTop: on('padding-top'),
    paddingBottom: on('padding-bottom'),
    borderTop: on('border-top'),
    borderBottom: on('border-bottom'),
    width,
    subHeading: text(p['sub-heading']),
    moduleTag: text(p.module_tag) || 'section',
    headerTag: text(p.header_tag) || 'h3',
    headerClass: text(p.header_class),
    set,
    from: 'module params, read as the template\'s modChrome_T3Section reads them'
  }
}

/**
 * A Joomla SEF address written with `index.php/` in front (`index.php/home/home-style-1`, `/index.php/a/b`,
 * with an optional query or fragment ignored) → its route path (`/home/home-style-1`), or null when `href`
 * is not that form. Trailing slashes and a `.html` suffix are not part of the path; a segment that is not
 * a plain name (`.`, `..`, empty, encoded separator) makes it null: such an address is not resolved.
 */
export function sefRoutePath(href) {
  const m = /^\/?index\.php\/([^?#]+)(?:[?#].*)?$/.exec(String(href ?? '').trim())
  if (!m) return null
  const segs = m[1].replace(/\/+$/, '').split('/')
  if (!segs.length || segs.some((s) => !s || /^\.+$/.test(s) || /%2f|%5c/i.test(s) || s.includes('\\'))) return null
  return `/${segs.join('/').replace(/\.html?$/i, '')}`
}

/**
 * `{loadmoduleid N}` in an article body (Joomla's Content - Load Module plugin): the module N where the
 * marker stands. Per marker:
 *  - a published `mod_custom` module → its content is inlined (`inline`);
 *  - any other published module with a position → a slot marker `{loadposition @m<N>}` in the text (`slot`,
 *    with the module's position): the block converter turns it into a slot block, which the caller renames to
 *    the position and lists by module id;
 *  - an unpublished module → the marker is dropped (`dropped`): Joomla renders no unpublished module;
 *  - anything else (no such module, a module with no position) → left as text (`unresolved`, with the reason).
 * Whether the plugin filters the module by its menu assignment is not traced: the module is drawn wherever an
 * article names it, and `unassigned` lists the markers whose module is not assigned to `menuId`
 * (`assignedTo(assignment, menuId)`), for the caller to say so. `modules` are siteModules().
 * Returns `{ html, slots, inline, dropped, unresolved, unassigned }`.
 */
export function resolveModuleLoads(html, modules, menuId, assignedTo) {
  const out = { html: String(html ?? ''), slots: [], inline: [], dropped: [], unresolved: [], unassigned: [] }
  const byId = new Map(modules.map((m) => [m.id, m]))
  out.html = out.html.replace(/\{loadmoduleid\s+([^}]*)\}/g, (marker, arg) => {
    const id = arg.trim()
    if (!/^\d+$/.test(id)) {
      out.unresolved.push({ marker, id, why: 'the module id is not a number' })
      return marker
    }
    const m = byId.get(id)
    if (!m) {
      out.unresolved.push({ marker, id, why: 'no such site module in the inventory' })
      return marker
    }
    if (!m.published) {
      out.dropped.push({ marker, id, why: 'the module is not published' })
      return ''
    }
    if (!assignedTo(m.assignment, menuId)) out.unassigned.push({ marker, id })
    if (m.module === 'mod_custom') {
      out.inline.push({ marker, id })
      return m.content ?? ''
    }
    if (!m.position) {
      out.unresolved.push({ marker, id, why: `${m.module} has no position to draw it at` })
      return marker
    }
    out.slots.push({ marker, id, position: m.position, token: `@m${id}` })
    return `{loadposition @m${id}}`
  })
  return out
}

// ── menu item options (issue #73) ─────────────────────────────────────────────

/** Joomla stores an on/off option as "1"/"0" (or a number, or a boolean); anything else is not a value. */
const flag = (v) => (v === '1' || v === 1 || v === true ? true : v === '0' || v === 0 || v === false ? false : null)

/**
 * The heading a menu item's page prints: custom text when `show_page_heading` is on, an explicit
 * hidden state when it is off, else null. With the option on and no text Joomla prints the menu
 * item's title, so it does not declare a separate heading.
 */
export function pageHeading(params) {
  const p = params ?? {}
  if (flag(p.show_page_heading) === false) return { hidden: true, from: 'menu item params show_page_heading 0' }
  const text = typeof p.page_heading === 'string' ? p.page_heading.trim() : ''
  if (flag(p.show_page_heading) !== true || !text) return null
  return { text, from: 'menu item params page_heading (show_page_heading 1)' }
}

/** Whether the menu item is printed in the menus it belongs to (`menu_show`, default on). Off: the route still answers. */
export const menuShown = (params) => flag(params?.menu_show) !== false

/** A route record's measured answer (`status`, `location` of render-routes.json), or `{ problem }`, or null when it has none. */
export function routeAnswer(record) {
  if (!record || (record.status === undefined && record.location === undefined)) return null
  const status = record.status
  if (!Number.isInteger(status) || status < 100 || status > 599) return { problem: `status ${JSON.stringify(status)} is not an HTTP status (100–599)` }
  if (record.location !== undefined && (typeof record.location !== 'string' || !record.location.trim() || record.location.length > 2048 || /[\x00-\x1f\x7f]/.test(record.location))) return { problem: 'location is not a URL string' }
  if (status >= 300 && status < 400 && record.location === undefined) return { problem: `a ${status} answer without its location` }
  return { status, ...(record.location !== undefined ? { location: record.location } : {}) }
}

// ── authors and contacts (issue #73) ──────────────────────────────────────────

/** The profile keys an author's page reads besides the avatar: the dump's allowlist (joomla-dump.mjs USER_PROFILE_KEYS). Any other key of #__user_profiles is never read. */
export const AUTHOR_PROFILE_FIELDS = Object.freeze({ jobTitle: 'profile.user_jobtitle', description: 'profile.aboutme', social: 'profile.user_social' })

/** A profile value as Joomla stores it: JSON-encoded text ("\"Lead designer\""), or plain text. */
function profileValue(raw) {
  let v = raw ?? ''
  if (typeof v === 'string' && /^\s*["{[]/.test(v)) {
    try {
      v = JSON.parse(v)
    } catch {}
  }
  return v
}

/**
 * #__user_profiles → per user id `{ jobTitle?, description?, social?: { network: url }, provenance }`, for the
 * keys of AUTHOR_PROFILE_FIELDS only (an empty value is no value). Text is trimmed, never cut, `social` keeps the
 * http(s) links; whatever else a value holds is not read. `null` when the inventory has no such table.
 */
export function authorProfiles(inv) {
  if (!Array.isArray(inv.user_profiles)) return null
  const out = new Map()
  const byKey = Object.fromEntries(Object.entries(AUTHOR_PROFILE_FIELDS).map(([field, key]) => [key, field]))
  for (const r of inv.user_profiles) {
    const field = byKey[r?.profile_key]
    if (!field) continue
    const v = profileValue(r.profile_value)
    const entry = out.get(String(r.user_id)) ?? { provenance: {} }
    if (field === 'social') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue
      const links = Object.fromEntries(Object.entries(v).filter(([k, url]) => /^[A-Za-z0-9_-]{1,40}$/.test(k) && typeof url === 'string' && /^https?:\/\/\S+$/i.test(url.trim())).map(([k, url]) => [k, url.trim()]))
      if (!Object.keys(links).length) continue
      entry.social = links
    } else {
      const text = typeof v === 'string' ? v.trim() : ''
      if (!text) continue
      entry[field] = text
    }
    entry.provenance[field] = `#__user_profiles.${AUTHOR_PROFILE_FIELDS[field]}`
    out.set(String(r.user_id), entry)
  }
  return out
}

const CONTACT_TEXT_FIELDS = { name: 'name', position: 'con_position', street: 'address', suburb: 'suburb', state: 'state', postcode: 'postcode', country: 'country', telephone: 'telephone', mobile: 'mobile', fax: 'fax', email: 'email_to', image: 'image', webpage: 'webpage' }

/**
 * A #__contact_details row (com_contact) → `{ id, ...text fields, misc, links, provenance }`, only the values the
 * row holds; `null` when the row is not there. The e-mail is `email_to` (the address the contact page prints);
 * `links` are the row's params `linka…linke` (+ `_name`), http(s) only; `misc` is the row's HTML as it is. Nothing
 * is made up for a field the row leaves empty.
 */
export function contactRow(row) {
  if (!row) return null
  const out = { id: String(row.id) }
  for (const [field, col] of Object.entries(CONTACT_TEXT_FIELDS)) {
    const v = typeof row[col] === 'string' ? row[col].trim() : ''
    if (v) out[field] = v
  }
  if (typeof row.misc === 'string' && row.misc.trim()) out.misc = row.misc
  const params = parseJsonColumn(row.params)
  const links = ['a', 'b', 'c', 'd', 'e']
    .map((k) => ({ label: typeof params[`link${k}_name`] === 'string' ? params[`link${k}_name`].trim() : '', url: typeof params[`link${k}`] === 'string' ? params[`link${k}`].trim() : '' }))
    .filter((l) => /^https?:\/\/\S+$/i.test(l.url))
  if (links.length) out.links = links
  out.provenance = '#__contact_details'
  return out
}

/** Whether an article is one the featured view lists: featured, published (Joomla state 1) — archived and trashed are not. */
export const isFeaturedListed = (a) => a.featured && String(a.state) === '1'
