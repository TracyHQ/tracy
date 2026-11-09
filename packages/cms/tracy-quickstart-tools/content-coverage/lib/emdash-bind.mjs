// Binds what an EmDash page shows to the content map. The page is fetched with `X-Tracy-Preview: pick`, so the template
// itself says which entry and field printed an element (`data-tracy-src`, see lib/emdash-extract.js): the stamp is the
// evidence, the words are only the tie-breaker inside the one entry the stamp names. Joomla and WordPress have no such
// stamps and match words over the whole contract; here a word match across entries is the LAST resort and says so.
//
// An item is bound by, in order:
//   stamp        the stamp names a field the map has a slot for (`<collection>.<slug>.<field>`, a Portable Text block
//                `field.<_key>`, a repeater cell `field.<sub>`)
//   entry        the stamp names only the entry (a card or list item): the slot of that entry that holds these words
//   clone        the same words, or the same picture, a stamped item of the same page already shows (a slider clone)
//   menu         a label of the theme's declared menus (`map.menus`)
//   date         a date a dated slot holds, printed in any usual format
//   words        the exact words of a slot of another entry (an unstamped listing card): counted as bound, reported apart
// What stays is a hole, classed:
//   core         a form the Forms plugin prints (its labels are edited in the admin, not in the template)
//   template     words the template's own source holds: demo content the customer can never change
//   unknown      found in no source
// A picture of the template's own `public/` folder is design (`locked`, and listed), the brand logo route is chrome (`core`).
// A picture is bound ONLY by the site's own record of which entry field holds the file (the REST media index): a stamp
// names the entry, not the file, so it never binds a picture by itself. A link is bound by its stamp, by a link slot,
// by a declared menu, page or taxonomy term, or by an address a text slot holds (mailto:, tel:); otherwise it is a hole.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import { alnumCount, normText } from './normalize.mjs'

const LINK_BASE = 'http://site.invalid'
/** The keys of the forms file whose values a form prints. */
const FORM_TEXT_KEYS = new Set(['label', 'placeholder', 'submitLabel', 'confirmationMessage'])
const MEDIA_PATH = '/_emdash/api/media/file/'

/**
 * A link in the form slots are compared in: a path of this site with its whole query (keys sorted, values as written), an absolute
 * address with its trailing slash dropped, or a `mailto:` / `tel:` address without spaces.
 */
export function normLink(href, origin) {
  const raw = String(href ?? '').trim()
  if (/^(mailto|tel):/i.test(raw)) return raw.toLowerCase().replace(/\s+/g, '')
  try {
    const u = new URL(raw, `${origin}/`)
    const path = u.pathname.replace(/\/+$/, '') || '/'
    // The query as written, re-serialised with its encoding (`%23` stays one value, never a fragment); only the keys are
    // sorted (stably), so `?b=2&a=1` and `?a=1&b=2` are one route and `?token=x%23y` is not `?token=x`.
    const query = new URLSearchParams([...u.searchParams].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    const search = query.size > 0 ? `?${query}` : ''
    if (u.origin === origin || u.origin === LINK_BASE) return `${path}${search}`
    return `${u.origin}${path}${search}`
  } catch {
    return raw
  }
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** The words of a slot sample, plain: markup and line breaks gone. */
const wordsOf = (sample) => normText(sample)

/** Pieces a sample may be shown in: its whole, each line, each markup-free segment. */
function piecesOf(sample) {
  const whole = wordsOf(sample)
  const out = new Set([whole])
  for (const part of String(sample ?? '').split(/\n+|<br\s*\/?>|<\/?(?:p|li|ul|ol|div|h\d)[^>]*>/gi)) {
    const n = wordsOf(part)
    if (n) out.add(n)
  }
  return [...out].filter(Boolean)
}

/** Does `shown` (normalized) carry the words of `sample`? Whole, a piece of it, or (prose only) inside it. */
function sameWords(shown, sample, { prose = false } = {}) {
  if (!shown) return false
  // A sample the template fills from the site ("Copyright (c) {year} {name}") is a pattern: each {token} stands for any words.
  const parts = wordsOf(sample)
    .split(/\{[a-z_]+\}/i)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (parts.length > 1 && new RegExp(`^${parts.join('.+?')}$`).test(shown)) return true
  const pieces = piecesOf(sample)
  if (pieces.includes(shown)) return true
  // A template decorates a label with a closing mark ("Contact" printed as "Contact.", "Email:"), and a count with its
  // unit ("85" printed as "85%"). Only that closing mark is ignored; no word, sign or figure is.
  const bare = (v, numeric) => v.replace(numeric ? /[.:;!%]+$/ : /[.:;!]+$/, '').trim()
  const numeric = /^\d+(?:[.,]\d+)?$/.test(String(sample).trim())
  if (pieces.some((p) => bare(p, numeric) === bare(shown, numeric) && bare(p, numeric))) return true
  // Spaces alone may differ ("Offline<span>Pages</span>" renders with or without one); punctuation and signs may not.
  const unspaced = (v) => v.replace(/\s+/g, '')
  if (unspaced(shown) && pieces.some((p) => unspaced(p) === unspaced(shown))) return true
  // A paragraph or heading shown out of a prose field is a piece of it; a block that holds MORE than the slot says is not.
  if (prose) return pieces.some((p) => p.length >= 8 && p.includes(shown))
  return false
}

/** Year, month, day of an ISO date sample, or null. */
function ymdOf(sample) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(sample ?? ''))
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null
}

/** Does `shown` print this date, whatever the format (06.09.2021, 9/6/2021, September 6, 2021)? */
function printsDate(shown, ymd) {
  // A date alone (or with a weekday): a long sentence that happens to hold the figures is not the date.
  if (!ymd || String(shown).length > 32) return false
  const text = String(shown).toLowerCase()
  if (!text.includes(String(ymd.y))) return false
  const day = new RegExp(`(^|[^0-9])0?${ymd.d}([^0-9]|$)`).test(text)
  const month = new RegExp(`(^|[^0-9])0?${ymd.m}([^0-9]|$)`).test(text) || text.includes(MONTHS[ymd.m - 1])
  return day && month
}

/**
 * @param {any} map the EmDash content map
 * @returns the lookups the binder reads
 */
export function indexOfMap(map) {
  const slots = Array.isArray(map?.slots) ? map.slots : []
  const byKey = new Map(slots.map((s) => [s.key, s]))
  const byEntity = new Map()
  const textual = new Map()
  const dated = []
  for (const s of slots) {
    const list = byEntity.get(s.entity) ?? []
    list.push(s)
    byEntity.set(s.entity, list)
    if (s.type === 'date') dated.push({ key: s.key, ymd: ymdOf(s.sample) })
    if (s.type !== 'text' && s.type !== 'richtext' && s.type !== 'url' && s.type !== 'term') continue
    for (const piece of piecesOf(s.sample)) {
      if (alnumCount(piece) < 2) continue
      const keys = textual.get(piece) ?? []
      keys.push(s.key)
      textual.set(piece, keys)
    }
  }
  const menus = new Map()
  const menuLinks = new Set()
  const walk = (menu, items) => {
    for (const item of items ?? []) {
      const n = normText(item?.label)
      if (n) menus.set(n, menu)
      if (item?.url) menuLinks.add(normLink(item.url, LINK_BASE))
      walk(menu, item?.children)
    }
  }
  for (const m of map?.menus ?? []) walk(m.name, m.items)
  const links = new Map()
  const phones = new Set()
  for (const s of slots) {
    if (s.type === 'url' && s.sample.trim()) {
      const n = normLink(s.sample, LINK_BASE)
      links.set(n, [...(links.get(n) ?? []), s.key])
    }
    if (s.type === 'text')
      for (const m of String(s.sample).match(/\+?[\d][\d\s().-]{6,}\d/g) ?? [])
        phones.add(m.replace(/\D/g, ''))
  }
  const routes = new Set((map?.pages ?? []).map((p) => normLink(p.route, LINK_BASE)))
  const terms = new Set(
    slots
      .filter((s) => s.type === 'term')
      .flatMap((s) => [`/${s.target.term}`, `/${s.target.taxonomy}/${s.target.term}`])
  )
  return { byKey, byEntity, textual, dated, menus, menuLinks, links, phones, routes, terms }
}

/** The template's own words: every string a theme's source or its forms file holds, normalized, in one haystack. */
export function sourceIndexOf(themeDir) {
  const parts = []
  /** The whole label, placeholder, button and confirmation values of the theme's forms file, normalised like other text. */
  const formsLabels = new Set()
  const walk = (dir) => {
    let names = []
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(astro|tsx?|jsx?|mjs|json)$/.test(name)) parts.push(readFileSync(full, 'utf8'))
    }
  }
  if (themeDir) {
    walk(join(themeDir, 'src'))
    const forms = join(themeDir, 'tools', 'forms.json')
    if (existsSync(forms)) {
      parts.push(readFileSync(forms, 'utf8'))
      const collect = (node, key) => {
        if (Array.isArray(node)) for (const v of node) collect(v, key)
        else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) collect(v, k)
        else if (typeof node === 'string' && FORM_TEXT_KEYS.has(key)) formsLabels.add(normText(node))
      }
      collect(JSON.parse(readFileSync(forms, 'utf8')))
    }
  }
  return {
    haystack: normText(parts.join('\n')),
    formsLabels,
    publicDir: themeDir ? join(themeDir, 'public') : null
  }
}

const entityOf = (stamp) => `${stamp.collection}.${stamp.slug}`

/** Slots of `entity` whose field is `root` and, in a repeater, whose sub-field is `sub`. */
const cellSlots = (index, entity, root, sub) =>
  (index.byEntity.get(entity) ?? []).filter(
    (s) =>
      s.target?.field === root && (sub === undefined ? s.target?.sub === undefined : s.target?.sub === sub)
  )

/** Does this slot hold the words shown? A prose field holds them inside its text, a date in any format. */
function covers(slot, shown) {
  if (slot.type === 'date') return printsDate(shown, ymdOf(slot.sample))
  if (slot.type === 'richtext') return wordsOf(slot.sample).includes(shown)
  if (sameWords(shown, slot.sample)) return true
  // The one literal a template prints from the clock is the year of a copyright line: only a slot of a copyright field
  // may differ from its sample by a year. A year anywhere else (\"Founded in 2020\") must match as written.
  const yearless = (v) => v.replace(/\b(?:19|20)\d{2}\b/g, '#')
  return (
    /copyright/i.test(String(slot.target?.field ?? '')) && yearless(shown) === yearless(wordsOf(slot.sample))
  )
}

function bindByStamp(item, index) {
  // A stamp names the entry (and a field), never the file: a picture is bound by the media index alone (bindPicture).
  if (item.kind !== 'text') return null
  const st = item.stamp
  const entity = entityOf(st)
  const shown = normText(item.value)
  if (st.field) {
    const [root, ...rest] = st.field.split('.')
    const direct = index.byKey.get(`${entity}.${st.field}`)
    // The stamp says which field printed the element; the field must also HOLD the words shown (a stamp is not a pass).
    if (direct && covers(direct, shown)) return { slots: [direct.key], matchBy: 'stamp' }
    // A block of a Portable Text field: `body._key` names the field, the key is the block.
    const prose = index.byKey.get(`${entity}.${root}`)
    if (prose && prose.type === 'richtext' && covers(prose, shown))
      return { slots: [prose.key], matchBy: 'stamp' }
    // A cell of a repeater row: `items.title` names the sub-field of every row, the words say which row.
    if (rest.length > 0) {
      const cells = cellSlots(index, entity, root, rest[0])
      const exact = cells.filter((c) => sameWords(shown, c.sample, { prose: c.type === 'richtext' }))
      if (exact.length > 0) return { slots: exact.map((c) => c.key), matchBy: 'stamp' }
    }
  }
  const own = index.byEntity.get(entity) ?? []
  if (item.kind === 'image') {
    const pictures = own.filter((s) => s.type === 'image')
    return pictures.length > 0 ? { slots: pictures.map((s) => s.key), matchBy: 'entry' } : null
  }
  const hit = own.filter(
    (s) =>
      (s.type === 'text' || s.type === 'richtext' || s.type === 'url') &&
      sameWords(shown, s.sample, { prose: s.type === 'richtext' })
  )
  if (hit.length > 0) return { slots: hit.map((s) => s.key), matchBy: 'entry' }
  const date = own.filter((s) => s.type === 'date' && printsDate(shown, ymdOf(s.sample)))
  if (date.length > 0) return { slots: date.map((s) => s.key), matchBy: 'entry' }
  const parts = compositeOf(
    shown,
    own.filter((s) => s.type === 'text' || s.type === 'url')
  )
  return parts ? { slots: parts, matchBy: 'composite' } : null
}

/**
 * A block that prints several slots of one entry together ("Phone:" and its number, a dish and its badge): the slots
 * whose words, taken out of the block's words one after the other, leave nothing behind but punctuation.
 */
function compositeOf(shown, candidates) {
  const found = candidates
    .map((s) => ({ s, words: wordsOf(s.sample) }))
    .filter(({ words }) => words && alnumCount(words) >= 1 && shown.includes(words))
    .sort((a, b) => shown.indexOf(a.words) - shown.indexOf(b.words))
  if (found.length < 2) return null
  let rest = shown
  const used = []
  for (const { s, words } of found) {
    if (!rest.includes(words)) continue
    rest = rest.replace(words, ' ')
    used.push(s.key)
  }
  return used.length >= 2 && alnumCount(rest) === 0 ? used : null
}

/** A list card's excerpt: the first words of a prose slot, cut short with an ellipsis. */
function excerptOf(shown, index) {
  const head = shown.replace(/\s*(\.\.\.|…)$/, '')
  if (head.length < 24 || head === shown) return null
  const keys = []
  for (const [piece, slots] of index.textual)
    if (piece.length > head.length && piece.startsWith(head)) keys.push(...slots)
  return keys.length > 0 ? [...new Set(keys)] : null
}

/**
 * Bind every item of one page, in place. `ctx.source`: the template's words (`sourceIndexOf`); `ctx.origin`: the site's
 * origin, so a picture's address can be told from the template's own files.
 * @returns the items
 */
export function bindItems(items, index, ctx) {
  const stampedWords = new Map()
  // First pass: what the stamps bind. Second: what only words or pictures can say.
  for (const item of items) {
    const stamped = item.stamp ? bindByStamp(item, index) : null
    if (stamped) {
      Object.assign(item, { status: 'matched', ...stamped })
      stampedWords.set(normText(item.value), item.slots)
    }
  }
  for (const item of items) {
    if (item.status) continue
    const shown = normText(item.value)
    if (item.kind === 'image') {
      bindPicture(item, { ...ctx, index })
      continue
    }
    if (item.kind === 'link') {
      bindLink(item, index, ctx)
      continue
    }
    if (alnumCount(shown) < 2) {
      Object.assign(item, { status: 'ignored', cause: 'no words' })
      continue
    }
    const clone = stampedWords.get(shown)
    if (clone) {
      Object.assign(item, { status: 'matched', slots: clone, matchBy: 'clone' })
      continue
    }
    if (item.zone !== 'main' && index.menus.has(shown)) {
      Object.assign(item, { status: 'matched', slots: [], matchBy: 'menu', menu: index.menus.get(shown) })
      continue
    }
    const date = index.dated.find((d) => printsDate(shown, d.ymd))
    if (date) {
      Object.assign(item, { status: 'matched', slots: [date.key], matchBy: 'date' })
      continue
    }
    const words = index.textual.get(shown)
    if (words) {
      Object.assign(item, { status: 'matched', slots: words, matchBy: 'words' })
      continue
    }
    if (index.menus.has(shown)) {
      Object.assign(item, { status: 'matched', slots: [], matchBy: 'menu', menu: index.menus.get(shown) })
      continue
    }
    const excerpt = excerptOf(shown, index)
    if (excerpt) {
      Object.assign(item, { status: 'matched', slots: excerpt, matchBy: 'excerpt' })
      continue
    }
    holeOf(item, shown, ctx)
  }
  return items
}

function bindPicture(item, ctx) {
  const url = new URL(item.value, ctx.origin)
  // Only a picture of the audited site is ever accounted for: a foreign host's file is not this site's media or design.
  if (url.origin !== ctx.origin)
    return Object.assign(item, {
      status: 'hole',
      class: 'unknown',
      cause: `a picture served from another site (${url.origin})`
    })
  if (url.pathname.startsWith('/brand/') && url.pathname.includes('logo'))
    return Object.assign(item, {
      status: 'ignored',
      class: 'core',
      cause: "the brand logo: served by the brand door, replaced by Tracy's brand step"
    })
  // The site's own record of which entry field holds this file (the REST media index): a file counts only under the media
  // door, and its WHOLE final segment must be a key of the record (the file id, the storage key, or the storage key's
  // ULID). No part of a name is looked up on its own.
  const name = url.pathname.startsWith(MEDIA_PATH)
    ? decodeURIComponent(url.pathname.slice(MEDIA_PATH.length))
    : ''
  const owners = name && !name.includes('/') ? ctx.media?.get(name) : undefined
  if (owners) {
    const known = owners.filter((k) => ctx.index.byKey.has(k))
    // The stamp, when there is one, must agree with the file's owner: a stamped entry's own picture binds to its slot.
    const own = item.stamp ? known.filter((k) => k.startsWith(`${entityOf(item.stamp)}.`)) : []
    if (own.length > 0) return Object.assign(item, { status: 'matched', slots: own, matchBy: 'media' })
    if (known.length > 0) return Object.assign(item, { status: 'matched', slots: known, matchBy: 'media' })
    return Object.assign(item, {
      status: 'hole',
      class: 'unknown',
      cause: `a picture held by ${owners[0]}, which the content map has no slot for`
    })
  }
  const file = ctx.source?.publicDir
    ? resolve(ctx.source.publicDir, `.${decodeURIComponent(url.pathname)}`)
    : null
  // A file of the template's public folder only: an encoded `..` must not reach any other file of the theme.
  if (
    file?.startsWith(`${resolve(ctx.source.publicDir)}${sep}`) &&
    existsSync(file) &&
    statSync(file).isFile()
  )
    return Object.assign(item, {
      status: 'locked',
      cause: "a picture of the template's own public folder (design)"
    })
  return Object.assign(item, {
    status: 'hole',
    class: 'unknown',
    cause: ctx.media
      ? "a picture no entry field holds (the site's media index does not know the file) and the template does not ship"
      : 'a picture with no media index to say which field holds it (run the audit with --token-file)'
  })
}

/** Is this href a link a visitor can follow to somewhere? `#`, empty and `javascript:` go nowhere. */
const goesNowhere = (href) => /^\s*(#.*)?$|^\s*javascript:/i.test(href)

function bindLink(item, index, ctx) {
  const href = String(item.value ?? '')
  if (goesNowhere(href)) return Object.assign(item, { status: 'ignored', cause: 'a link that goes nowhere' })
  const norm = normLink(href, ctx.origin)
  const urlSlot = (s) => s.type === 'url' && s.sample.trim() && normLink(s.sample, LINK_BASE) === norm
  const bound = (slots, matchBy) => Object.assign(item, { status: 'matched', slots, matchBy })
  const st = item.stamp
  if (st) {
    const entity = entityOf(st)
    if (st.field) {
      const [root, ...rest] = st.field.split('.')
      const direct = index.byKey.get(`${entity}.${st.field}`)
      // A stamp names the field that printed the anchor; the address is covered only if that field holds THIS address.
      if (direct && urlSlot(direct)) return bound([direct.key], 'stamp')
      const cells = rest.length > 0 ? cellSlots(index, entity, root, rest[0]).filter(urlSlot) : []
      if (cells.length > 0)
        return bound(
          cells.map((c) => c.key),
          'stamp'
        )
    }
    const own = (index.byEntity.get(entity) ?? []).filter(urlSlot)
    if (own.length > 0)
      return bound(
        own.map((c) => c.key),
        'entry'
      )
  }
  if (index.links.has(norm)) return bound(index.links.get(norm), 'words')
  if (norm.startsWith('mailto:') && index.textual.has(normText(norm.slice(7).split('?')[0])))
    return bound(index.textual.get(normText(norm.slice(7).split('?')[0])), 'words')
  if (norm.startsWith('tel:') && index.phones.has(norm.replace(/\D/g, ''))) return bound([], 'words')
  if (index.menuLinks.has(norm)) return bound([], 'menu')
  // `?page=N` of a declared page is that page's next leaf; any other query is a route of its own.
  if (index.routes.has(norm) || index.routes.has(norm.replace(/\?page=\d+$/, ''))) return bound([], 'route')
  if (index.terms.has(norm)) return bound([], 'term')
  const inSource = (ctx.source?.haystack ?? '').includes(href.toLowerCase())
  return Object.assign(item, {
    status: 'hole',
    class: inSource ? 'template' : 'unknown',
    cause: inSource
      ? "an address in the template's own source, no link slot, menu, page or term holds it"
      : 'an address no link slot, menu, page, term or source holds'
  })
}

function holeOf(item, shown, ctx) {
  // A form's label counts as the Forms plugin's only when the theme's forms file holds it (a required star aside).
  if (item.inForm && ctx.source?.formsLabels?.has(shown.replace(/\s*\*$/, '')))
    return Object.assign(item, {
      status: 'hole',
      class: 'core',
      cause: 'a form the Forms plugin prints (its labels are edited in the admin)'
    })
  const source = ctx.source?.haystack ?? ''
  // "Page 2 of 5": the template prints the figures, its source holds the words around them.
  const fragments = shown
    .split(/\d+/)
    .map((f) => f.trim())
    .filter((f) => f.length >= 2)
  const inSource =
    shown.length >= 3 &&
    (source.includes(shown) ||
      source.includes(shown.replace(/[.:;!]+$/, '')) ||
      (fragments.length > 0 &&
        fragments.length < 6 &&
        /\d/.test(shown) &&
        fragments.every((f) => source.includes(f))))
  const stamped = item.stamp
    ? ` (stamped ${entityOf(item.stamp)}${item.stamp.field ? ` field ${item.stamp.field}` : ''}: no slot holds these words)`
    : ''
  return Object.assign(item, {
    status: 'hole',
    // A count the template prints around a figure ("3 articles", "Page 2 of 5") is one hole, whatever the figures.
    ...(/\d/.test(shown) && inSource ? { pattern: String(item.value).replace(/\d+/g, '#') } : {}),
    class: inSource ? 'template' : 'unknown',
    cause: inSource
      ? `words in the template's own source${stamped}`
      : `words no slot, menu or source holds${stamped}`
  })
}
