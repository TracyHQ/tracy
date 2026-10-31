/**
 * Where a WordPress slot lives in block markup, and how its value is read and written there (TracyHQ/tracy#139).
 *
 * A slot's `target` names its block one of two ways:
 *
 *   BY NAME      `{ block, attr }`: the first block whose opening comment carries `"name":"<block>"` (`metadata.name`).
 *                The Claude Cowork plugin's `QuickstartContract::setBlockValue` and the seeder's `setBlockValue` find it.
 *   BY POSITION  `{ blockType, occurrence, attr, field?, link? }`: the `occurrence`-th core block of type `blockType` in the
 *                entity's markup (a page's `post_content` or a template part's `content`), counted from 1 in document
 *                order, named or not, nested or not. `field` picks one text of a block that holds several (an item of
 *                a list with no inner blocks, a table cell, a quote's `cite` or a pullquote's `text`); `link` the n-th
 *                link inside that text.
 *
 * 🔒 THE CAPTURE AND THE WRITER COUNT WITH THIS ONE WALKER (`textUnits` of `capture-all-text.mjs` reads `blockUnits`), so
 * an address made at capture is the block the writer reaches. A position is stable for the markup it was captured from:
 * re-capturing the same release gives the same key and target, and a re-capture of a release whose markup moved keeps a
 * slot's reviewed role only when its key AND sample are unchanged (`carryRoles`), so a shifted position is re-labelled,
 * never mislabelled. A position past the last block of its type is refused, never written into another block.
 *
 * Values are plain text: a write escapes it, a read returns the text a visitor sees (tags gone, entities decoded), so a
 * value written reads back equal. Writing a text replaces the inline markup it held, its links included.
 */

const OPEN = /<!-- (\/)?wp:(?:([a-z0-9-]+)\/)?([a-z0-9-]+)(?: (\{[^\n]*\}))? ?(\/)?-->/g
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export const decodeEntities = (/** @type {string} */ text) =>
  text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, n) => ENTITIES[n])

/** Markup with every tag gone, stripped until nothing changes so a tag split by another tag cannot survive. */
const withoutTags = (/** @type {string} */ html) => {
  let text = html
  for (let before = ''; before !== text; ) {
    before = text
    text = text.replace(/<[^>]*>/g, '')
  }
  return text
}

/** The words a visitor reads in some markup: tags gone, `<br>` a space, entities decoded, blanks collapsed. */
export const visibleText = (/** @type {string} */ html) =>
  decodeEntities(withoutTags(html.replace(/<br\s*\/?>/gi, ' ')))
    .replace(/\s+/g, ' ')
    .trim()

/** A text the way a single-value slot holds it: plain text keeps its own line breaks, markup is flattened. */
export const sampleOf = (/** @type {string} */ raw) =>
  raw.includes('<') ? visibleText(raw) : decodeEntities(raw)

export const escapeHtml = (/** @type {string} */ s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Where a slot lives in an entity's markup: by name (`block`) or by position (`blockType` + `occurrence`), with the
 * attribute it holds and, for a block of several texts, which one (`field`) and which link in it (`link`).
 * @typedef {{ block?: string, blockType?: string, occurrence?: number, attr?: string, field?: string, link?: number }} SlotTarget
 */

/** Blocks that hold one text. */
const SINGLE = new Set(['heading', 'paragraph', 'verse', 'preformatted', 'list-item'])
/** Every block type a slot can be addressed in. */
export const TEXT_BLOCK_TYPES = new Set([
  ...SINGLE,
  'button',
  'list',
  'table',
  'quote',
  'pullquote',
  'navigation-link',
  'navigation-submenu'
])

/**
 * @typedef {{ blockType: string, occurrence: number, name: string | null, attrs: Record<string, any> | null,
 *   attrsText: string | null, start: number, openEnd: number, inner: string, innerStart: number }} BlockUnit
 */

/**
 * Every core block of a text-bearing type in `markup`, in document order, each with its position.
 * @param {string} markup
 * @returns {BlockUnit[]}
 */
export function blockUnits(markup) {
  const tokens = [...markup.matchAll(OPEN)].map((m) => ({
    close: Boolean(m[1]),
    core: !m[2] || m[2] === 'core',
    type: m[3],
    attrs: m[4] ?? null,
    self: Boolean(m[5]),
    start: m.index,
    end: m.index + m[0].length
  }))
  const seen = new Map()
  /** @type {BlockUnit[]} */
  const units = []
  tokens.forEach((t, i) => {
    if (t.close || !t.core || !TEXT_BLOCK_TYPES.has(t.type)) return
    const occurrence = (seen.get(t.type) ?? 0) + 1
    seen.set(t.type, occurrence)
    let inner = ''
    if (!t.self) {
      let depth = 1
      for (let j = i + 1; j < tokens.length && depth > 0; j++) {
        const o = tokens[j]
        if (!o.core || o.type !== t.type || o.self) continue
        depth += o.close ? -1 : 1
        if (depth === 0) inner = markup.slice(t.end, o.start)
      }
    }
    let attrs = null
    try {
      attrs = t.attrs ? JSON.parse(t.attrs) : null
    } catch {
      attrs = null
    }
    const name =
      typeof attrs?.metadata?.name === 'string' && attrs.metadata.name !== '' ? attrs.metadata.name : null
    units.push({
      blockType: t.type,
      occurrence,
      name,
      attrs,
      attrsText: t.attrs,
      start: t.start,
      openEnd: t.end,
      inner,
      innerStart: t.end
    })
  })
  return units
}

/**
 * The texts of the elements named `names` in `text` (`<li>`, `<td>`/`<th>`…), as offsets: from the end of each opening tag
 * to the first closing tag of any of those names. A scan with indexOf, not a lazy regex, so a long run of unclosed tags
 * costs one pass (no polynomial backtracking on a theme's markup).
 * @param {string} text
 * @param {string[]} names
 * @returns {Array<{ start: number, end: number }>}
 */
const elementTexts = (text, names) => {
  const lower = text.toLowerCase()
  const closes = names.map((n) => `</${n}>`)
  const out = []
  let at = 0
  for (;;) {
    let open = -1
    for (const n of names) {
      let i = lower.indexOf(`<${n}`, at)
      // A tag name ends at a character no name holds (`<li>`, `<li class`), never inside a longer one (`<link`).
      while (i !== -1 && /[a-z0-9]/.test(lower[i + n.length + 1] ?? '')) i = lower.indexOf(`<${n}`, i + 1)
      if (i !== -1 && (open === -1 || i < open)) open = i
    }
    if (open === -1) return out
    const gt = lower.indexOf('>', open)
    if (gt === -1) return out
    const start = gt + 1
    const ends = closes.map((c) => lower.indexOf(c, start)).filter((i) => i !== -1)
    if (ends.length === 0) return out
    const end = Math.min(...ends)
    out.push({ start, end })
    at = end
  }
}

/**
 * The texts of one block: each with its id (`''` for the block's only text), the attribute that holds it, and where its
 * markup sits inside the block (`start`/`end`, offsets in `unit.inner`), or `label` for a navigation link's attribute.
 * @param {BlockUnit} unit
 * @returns {Array<{ id: string, attr: string, raw: string, start?: number, end?: number, url?: string | null }>}
 */
export function blockFields(unit) {
  const { blockType: type, inner, attrs } = unit
  const at = (/** @type {{start: number, end: number}} */ r, id = '', attr = 'content') => ({
    id,
    attr,
    raw: inner.slice(r.start, r.end),
    start: r.start,
    end: r.end
  })
  if (SINGLE.has(type)) {
    const own = inner.split('<!--')[0]
    const open = /^\s*<[a-z0-9]+\b[^>]*>/.exec(own)
    const close = /<\/[a-z0-9]+>\s*$/.exec(own)
    const start = open ? open[0].length : 0
    const end = close && close.index >= start ? close.index : own.length
    return [at({ start, end })]
  }
  if (type === 'button') {
    const a = elementTexts(inner, ['a'])[0]
    const url = typeof attrs?.url === 'string' ? attrs.url : (hrefsIn(inner)[0] ?? null)
    return a ? [{ ...at(a), url }] : []
  }
  if (type === 'navigation-link' || type === 'navigation-submenu')
    return typeof attrs?.label === 'string'
      ? [{ id: '', attr: 'label', raw: attrs.label, url: attrs.url ?? null }]
      : []
  if (type === 'list' && !inner.includes('<!--'))
    return elementTexts(inner, ['li']).map((r, i) => at(r, String(i + 1)))
  if (type === 'table') return elementTexts(inner, ['td', 'th']).map((r, i) => at(r, String(i + 1)))
  if (type === 'quote' || type === 'pullquote') {
    const out = []
    if (type === 'pullquote') {
      const p = elementTexts(inner, ['p'])[0]
      if (p) out.push(at(p, 'text'))
    }
    const cite = elementTexts(inner, ['cite'])[0]
    if (cite) out.push(at(cite, 'cite'))
    return out
  }
  return []
}

/** The links of some markup, as a visitor follows them. */
export const hrefsIn = (/** @type {string} */ html) =>
  hrefSpans(html).map((r) => decodeEntities(html.slice(r.start, r.end)))

/**
 * Where the value of each link's `href` sits in some markup, in document order: an indexOf scan of the `<a …>` tags, not a
 * regex, so a long run of unclosed tags costs one pass.
 * @param {string} html
 * @returns {Array<{ start: number, end: number }>}
 */
function hrefSpans(html) {
  const out = []
  let at = 0
  for (;;) {
    let open = html.indexOf('<a', at)
    while (open !== -1 && /[A-Za-z0-9]/.test(html[open + 2] ?? '')) open = html.indexOf('<a', open + 1)
    if (open === -1) return out
    const gt = html.indexOf('>', open)
    if (gt === -1) return out
    const tag = html.slice(open, gt)
    let attr = tag.indexOf('href="')
    while (attr !== -1 && !/\s/.test(tag[attr - 1] ?? '')) attr = tag.indexOf('href="', attr + 1)
    if (attr !== -1) {
      const start = open + attr + 'href="'.length
      const close = html.indexOf('"', start)
      if (close !== -1 && close < gt) out.push({ start, end: close })
    }
    at = gt + 1
  }
}

/**
 * The block and the text a target names, or a sentence saying why there is none.
 * @param {string} markup
 * @param {SlotTarget} target
 */
function locate(markup, target) {
  const units = blockUnits(markup)
  const unit =
    typeof target.block === 'string'
      ? units.find((u) => u.name === target.block)
      : units.find((u) => u.blockType === target.blockType && u.occurrence === target.occurrence)
  const where =
    typeof target.block === 'string' ? `block ${target.block}` : `${target.blockType} ${target.occurrence}`
  if (!unit) return { problem: `${where} is not in this markup` }
  const want = String(target.field ?? '')
  const field = blockFields(unit).find((f) => f.id === want)
  if (!field) return { problem: `${where} has no text ${target.field ?? ''} to address`.trim() }
  return { unit, field }
}

/** Whether a target is found by position (a block with no name, or one that repeats a name). */
export const byPosition = (/** @type {any} */ target) =>
  typeof target?.blockType === 'string' && Number.isInteger(target?.occurrence)

/**
 * The value a slot holds: its text as a visitor reads it, or its link. Null when the target names nothing here.
 * @param {string} markup
 * @param {SlotTarget} target
 * @returns {string | null}
 */
export function readSlotValue(markup, target) {
  const found = locate(markup, target)
  if (!found.unit || !found.field) return null
  const { field } = found
  const attr = target.attr ?? 'content'
  if (attr === 'url') {
    if (Number.isInteger(target.link)) return hrefsIn(field.raw)[Number(target.link) - 1] ?? null
    return field.url ?? null
  }
  return field.attr === 'label' ? field.raw : sampleOf(field.raw)
}

/**
 * The markup with one slot's value written. A target found by name with no `field` or `link` goes through the named writer
 * (`setBlockValue`), byte for byte what it always wrote; every other target is written here.
 * @param {string} markup
 * @param {SlotTarget} target
 * @param {string} value
 * @param {(markup: string, name: string, attr: string, value: string, imageId?: number) => string} named - the named writer
 * @param {number} [imageId]
 */
export function writeAt(markup, target, value, named, imageId) {
  const attr = target.attr ?? 'content'
  if (typeof target.block === 'string' && target.field === undefined && target.link === undefined)
    return named(markup, target.block, attr, value, imageId)
  if (attr === 'src') throw new Error('a picture is written by its block name only')
  const found = locate(markup, target)
  if (!found.unit || !found.field) throw new Error(found.problem)
  const { unit, field } = found
  const blockEnd = unit.innerStart + unit.inner.length
  const splice = (/** @type {string} */ inner, opening = markup.slice(unit.start, unit.openEnd)) =>
    `${markup.slice(0, unit.start)}${opening}${inner}${markup.slice(blockEnd)}`
  const withAttrs = (/** @type {Record<string, any>} */ attrs) =>
    markup.slice(unit.start, unit.openEnd).replace(String(unit.attrsText), () => JSON.stringify(attrs))

  if (field.attr === 'label') {
    const attrs = { ...unit.attrs, [attr === 'url' ? 'url' : 'label']: value }
    return splice(unit.inner, withAttrs(attrs))
  }
  if (field.start === undefined || field.end === undefined)
    throw new Error('the text has no place in the markup')
  if (attr === 'url') {
    const href = escapeHtml(value)
    const nthHref = (/** @type {string} */ html, /** @type {number} */ nth) => {
      const span = hrefSpans(html)[nth - 1]
      if (!span) throw new Error(`the text has no link ${nth} to write`)
      return `${html.slice(0, span.start)}${href}${html.slice(span.end)}`
    }
    // The n-th link inside a text.
    if (Number.isInteger(target.link)) {
      const raw = nthHref(field.raw, Number(target.link))
      return splice(`${unit.inner.slice(0, field.start)}${raw}${unit.inner.slice(field.end)}`)
    }
    // A button's own link, and its `url` attribute when it has one, as the named writer does.
    if (unit.blockType !== 'button') throw new Error(`${unit.blockType} has no link of its own to write`)
    const opening = unit.attrs && 'url' in unit.attrs ? withAttrs({ ...unit.attrs, url: value }) : undefined
    return splice(nthHref(unit.inner, 1), opening)
  }
  if (attr !== 'content' && attr !== 'text') throw new Error(`unsupported block attribute ${attr}`)
  return splice(`${unit.inner.slice(0, field.start)}${escapeHtml(value)}${unit.inner.slice(field.end)}`)
}
