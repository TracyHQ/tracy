// Whether a value a run wrote is PRINTED on a page (ADR 0044): read from the page's markup as a visitor's browser gets it, inside the
// body only. A picture counts when an <img> or a <source> names its file in `src` or `srcset`, or when an element of the body paints it
// as its own background (`style="background-image: url(...)"`, how a template's hero band prints its picture). Words count when the
// body's text holds them. Nothing else counts: the head, scripts (JSON-LD among them), style sheets, comments, <meta>, and `data-*`
// attributes all name files the visitor may never see printed. One rule, shared by the write step and the site check.
//
// Several slots may hold the same picture on one page. Each needs its own printed element, so a file printed once covers one slot; the
// slots it covers are taken in the order given (the kit's order), and the rest are not printed. A template may print one slot on a
// page the kit does not expect (a list page prints an article's intro picture), so a slot is printed when any of its pages prints it.
//
// The picture fallback block: when the template prints a slot only under a condition the run cannot meet (a video poster printed only
// with a video id), the write step prints the picture itself in the article body, marked so a later run finds it again.

const FALLBACK = 'tracy-fallback'
const each = (value) => (Array.isArray(value) ? value : [])
/** A fallback block as written: one wrapper, one frame, one picture, whatever whitespace an editor puts between them. */
const BLOCK = /<div\b[^>]*\btracy-fallback\b[^>]*>\s*<div\b[^>]*>\s*<img\b[^>]*>\s*<\/div>\s*<\/div>\n?/gi
const IMG = /^<(?:img|source)\b/i
const TAG = /<[a-z][a-z0-9-]*\b[^>]*>/gi
const PAINTED = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi
const NOT_PRINTED = /<(script|style|template|noscript|svg)\b[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->/gi
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘' }

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return m ? (m[1] ?? m[2] ?? m[3]) : null
}

const decoded = (text) =>
  String(text).replace(/&(?:([a-z]+)|#(\d+)|#x([0-9a-f]+));/gi, (whole, name, dec, hex) => {
    if (name) return NAMED[name.toLowerCase()] ?? whole
    const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })

/** A picture is its file: the site's address, a query, Joomla's media suffix and a leading slash do not change which one. */
export function pictureKey(value) {
  let text = decoded(String(value ?? '').trim())
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || text.startsWith('//'))
    try {
      text = new URL(text, 'http://x').pathname
    } catch {
      return ''
    }
  text = text.split('#', 1)[0].split('?', 1)[0].replace(/^\/+/, '')
  try {
    return decodeURI(text)
  } catch {
    return text
  }
}

/** Words as compared: markup (real tags or a content map's doubled brackets) and every space left out, references read, any case. */
export const wordsKey = (value) =>
  decoded(
    String(value ?? '')
      .replace(/<[^<>]*>/g, ' ')
      .replace(/\(\(\s*\/?[a-z][^()]*\)\)/gi, ' ')
  )
    .replace(/\s+/g, '')
    .toLowerCase()

/** The markup of the page's body, with what a visitor is never shown as content taken out. */
function bodyOf(html) {
  const text = String(html ?? '')
  const open = /<body\b[^>]*>/i.exec(text)
  const from = open ? open.index + open[0].length : (/<\/head\s*>/i.exec(text)?.index ?? 0)
  const close = text.search(/<\/body\s*>/i)
  return text.slice(from, close > from ? close : text.length).replace(NOT_PRINTED, ' ')
}

/** @returns {{ slot: string | null, key: string, whole: string, index: number }[]} each fallback block in a text, in order */
export function fallbackBlocksIn(text) {
  return [...String(text ?? '').matchAll(BLOCK)].map((m) => ({
    slot: attr(m[0], 'data-slot'),
    key: pictureKey(attr(m[0].slice(m[0].search(/<img\b/i)), 'src') ?? ''),
    whole: m[0],
    index: m.index
  }))
}

/** A text with every fallback block taken out: what the template prints of itself. */
export const withoutFallbackBlocks = (text) => String(text ?? '').replace(BLOCK, '')

const escaped = (value) => String(value).replace(/[&"<>]/g, (c) => `&#${c.charCodeAt(0)};`)

/** The block that prints a picture the template does not: the template's own media classes, no play button. */
export const fallbackBlock = (slot, path) =>
  `<div class="media-lead media-wrap ${FALLBACK}" data-slot="${escaped(slot)}"><div class="thumb-media"><img src="/${escaped(pictureKey(path))}" alt="" class="img-fluid w-100"></div></div>\n`

/** Whether a block is exactly what `fallbackBlock` writes, for the look guard. */
export const isFallbackBlock = (whole) => {
  const [found] = fallbackBlocksIn(whole)
  return Boolean(found?.slot && found.key && whole === fallbackBlock(found.slot, found.key))
}

/** Each printed picture of a body: its file, and the fallback block it sits in (`slot`, or '' for a block naming none). */
function printedPictures(body) {
  const blocks = fallbackBlocksIn(body).map((b) => ({ ...b, end: b.index + b.whole.length }))
  const out = []
  for (const m of body.matchAll(TAG)) {
    const named = IMG.test(m[0]) ? [attr(m[0], 'src'), ...String(attr(m[0], 'srcset') ?? '').split(',')] : []
    const style = decoded(attr(m[0], 'style') ?? '')
    if (/background/i.test(style)) for (const u of style.matchAll(PAINTED)) named.push(u[1] ?? u[2] ?? u[3])
    const files = named
      .map((part) =>
        pictureKey(
          String(part ?? '')
            .trim()
            .split(/\s+/)[0]
        )
      )
      .filter(Boolean)
    const block = blocks.find((b) => m.index >= b.index && m.index < b.end)
    for (const key of new Set(files)) out.push({ key, block: block ? (block.slot ?? '') : null })
  }
  return out
}

/**
 * Which of a page's written slots the page prints.
 * @param {string} html the page as the site serves it
 * @param {{ slot: string, kind: 'picture' | 'text', value: string }[]} slots the page's written slots, in the kit's order
 * @param {{ native?: boolean }} [options] `native`: judge what the template prints of itself, fallback blocks left out
 * @returns {{ printed: Map<string, 'template' | 'fallback'>, notPrinted: string[] }}
 */
export function pagePrints(html, slots, { native = false } = {}) {
  const body = bodyOf(native ? withoutFallbackBlocks(html) : html)
  const printed = new Map()
  const words = wordsKey(body.replace(/<[^<>]*>/g, ' '))
  for (const s of slots)
    if (s.kind === 'text' && wordsKey(s.value) && words.includes(wordsKey(s.value)))
      printed.set(s.slot, 'template')
  const pool = new Map()
  for (const p of printedPictures(body)) {
    const own = p.block && slots.find((s) => s.kind === 'picture' && s.slot === p.block)
    if (own && pictureKey(own.value) === p.key && !printed.has(own.slot)) printed.set(own.slot, 'fallback')
    else pool.set(p.key, [...(pool.get(p.key) ?? []), p.block === null ? 'template' : 'fallback'])
  }
  // Template prints are given first, so a block left from an earlier run is the one a slot does without.
  for (const list of pool.values()) list.sort((a, b) => (a === b ? 0 : a === 'template' ? -1 : 1))
  for (const s of slots) {
    if (s.kind !== 'picture' || printed.has(s.slot)) continue
    const via = pool.get(pictureKey(s.value))?.shift()
    if (via) printed.set(s.slot, via)
  }
  return { printed, notPrinted: slots.filter((s) => !printed.has(s.slot)).map((s) => s.slot) }
}

/**
 * Which written slots a site prints, over the pages that show them.
 * @param {{ onPages: Map<string, string[]>, pages: Map<string, string | null>, slots: { slot: string }[], native?: boolean }} input
 *   `onPages`: the slot ids each page shows (`slotsOnPages`); `pages`: each page's markup, null for one that could not be read
 * @returns {{ printed: Map<string, { page: string, via: 'template' | 'fallback' }>, notPrinted: { slot: string, pages: string[] }[],
 *   unread: string[] }} `unread`: slots whose every page went unread, so nothing is said of them
 */
export function sitePrints({ onPages, pages, slots, native = false }) {
  const bySlot = new Map(slots.map((s) => [s.slot, s]))
  const printed = new Map()
  const seen = new Map()
  for (const [path, ids] of onPages) {
    const html = pages.get(path)
    const mine = ids.map((id) => bySlot.get(id)).filter(Boolean)
    for (const s of mine)
      seen.set(s.slot, [...(seen.get(s.slot) ?? []), ...(typeof html === 'string' ? [path] : [])])
    if (typeof html !== 'string' || !mine.length) continue
    for (const [slot, via] of pagePrints(html, mine, { native }).printed)
      if (!printed.has(slot) || (via === 'template' && printed.get(slot).via !== 'template'))
        printed.set(slot, { page: path, via })
  }
  const notPrinted = []
  const unread = []
  for (const [slot, read] of seen) {
    if (printed.has(slot)) continue
    if (read.length) notPrinted.push({ slot, pages: read })
    else unread.push(slot)
  }
  return { printed, notPrinted, unread }
}

const IMAGE = /\.(?:jpe?g|png|webp|gif|svg|avif)(?:[#?].*)?$/i
/** An address or a piece of markup only: it is not words a visitor reads. */
const NOT_WORDS = /^(?:\/|#|index\.php|[a-z][a-z0-9+.-]*:)/i
/** The pictures a page prints in its content; a logo, a favicon, a share picture or a body background are printed elsewhere. */
const PICTURE_PARTS = new Set(['picture', 'picture-painted'])

/** A text slot whose value a template prints inside an attribute or a player, never as words: a video id, an address. */
const NOT_PRINTED_AS_WORDS = /(?:^|\.)(?:video|[a-z_]*_url)$/

/** Each kit slot's type and role, by id. */
function kitSlotKinds(kit) {
  const kinds = new Map()
  for (const block of each(kit?.blocks)) {
    const rows = each(block?.lists).flatMap((l) => each(l?.rows).flatMap((r) => each(r?.slots)))
    for (const s of [...each(block?.slots), ...rows]) if (typeof s?.id === 'string') kinds.set(s.id, s)
  }
  return kinds
}

/**
 * The written lines of a write report this rule judges, as slots: a picture by its file, words by their text. With a kit, words are
 * judged only on a slot the kit types as text, and not on one whose role is printed some other way than as words.
 * @param {object[]} lines the report's slot lines
 * @param {object | null} [kit] the template kit's document
 */
export function printedSlotsOf(lines, kit = null) {
  const kinds = kit ? kitSlotKinds(kit) : null
  const asWords = (slot) => {
    if (!kinds) return true
    const found = kinds.get(slot)
    return found?.type === 'text' && !NOT_PRINTED_AS_WORDS.test(String(found.role ?? ''))
  }
  const out = []
  for (const l of Array.isArray(lines) ? lines : []) {
    if (l?.status !== 'written' || typeof l.ordered !== 'string' || !l.ordered.trim()) continue
    if (PICTURE_PARTS.has(l.part) && IMAGE.test(l.ordered))
      out.push({ slot: l.slot, kind: 'picture', value: l.ordered })
    else if (
      !l.part &&
      !IMAGE.test(l.ordered) &&
      !NOT_WORDS.test(l.ordered.trim()) &&
      wordsKey(l.ordered) &&
      asWords(l.slot)
    )
      out.push({ slot: l.slot, kind: 'text', value: l.ordered })
  }
  return out
}

/** Every slot id a kit block holds, in the kit's order: its words, its frames, its list rows. */
function slotIdsOf(block) {
  const ids = [...each(block?.slots), ...each(block?.frames)].map((s) => s?.id)
  for (const list of each(block?.lists))
    for (const row of each(list?.rows)) ids.push(...each(row?.slots).map((s) => s?.id))
  return ids.filter((id) => typeof id === 'string')
}

/**
 * Which kept page shows which slots, from the kit: a page's blocks at any width, each block's slots in order.
 * @param {object} kit the template kit's document
 * @param {{ id: string, path: string }[]} pages the kept pages of a write report
 * @returns {Map<string, string[]>} page path to slot ids
 */
export function slotsOnPages(kit, pages) {
  const blocks = new Map(each(kit?.blocks).map((b) => [b?.id, b]))
  const kitPages = new Map(each(kit?.pages).map((p) => [p?.id, p]))
  const out = new Map()
  for (const page of each(pages)) {
    const found = kitPages.get(page?.id)
    if (!found || typeof page.path !== 'string') continue
    const ids = new Set(Object.values(found.blocks ?? {}).flatMap((list) => each(list)))
    out.set(page.path, [...new Set([...ids].flatMap((id) => slotIdsOf(blocks.get(id))))])
  }
  return out
}
