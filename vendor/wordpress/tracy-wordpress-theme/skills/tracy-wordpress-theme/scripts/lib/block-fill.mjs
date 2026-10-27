// block-fill.mjs — parse WordPress block markup, fill blocks by `metadata.name`, serialize back.
//
// A pattern of the tracy-base theme names every editable block (`metadata.name = <type>.<field>[.<n>]`,
// see overlays/tracy-base/patterns.map.json). The seeder reads the registered pattern, finds each
// block by that name, writes the ACM instance's field into it and serializes valid block markup
// again. Nothing is located by position: a pattern may reorder or restyle its blocks and the fill
// still lands on the right one.
//
// The parser mirrors the Gutenberg grammar closely enough for the markup this repo produces:
// `<!-- wp:ns/name {json} -->` … `<!-- /wp:ns/name -->` and the self-closing `<!-- wp:name {json} /-->`.
// A block keeps `innerContent` exactly as WordPress does — an array of HTML strings with `null`
// placeholders where inner blocks sit — so serializing an untouched tree returns the input byte
// for byte. Leaf HTML (a paragraph, a heading, a button, an image) is edited through jsdom; the
// opening chunk of a container (a group's `<section class="…">`, a details' `<summary>`) through
// a bounded regex, because that chunk is not a complete document on its own.
//
// `fillFromLibrary` is the second job: the home page of the Joomla source is twelve `mod_custom`
// blocks of OpenDesign HTML that render the same thirteen sections `packages/cms/tracy-cms-sections`
// ships as `tracy/section-*` patterns. Those patterns carry no metadata.name, so the alignment is
// structural: both sides are reduced to an ordered shape of text leaves (heading / text / button /
// item / summary / cite, with repeated sibling groups folded into runs), and the module's words are
// written into the pattern only when the two shapes agree. When they do not, it returns null and
// the caller falls back to `core/html` and says so — a wrong guess would put words in the wrong
// place without any error.

import { JSDOM } from 'jsdom'

const TOKEN =
  /<!--\s+(\/)?wp:([a-z][a-z0-9_-]*\/)?([a-z][a-z0-9_-]*)\s+({(?:(?!}\s+\/?-->)[^])*?}\s+)?(\/)?-->/g

const fullName = (ns, name) => `${ns ?? 'core/'}${name}`
const shortName = (name) => (name.startsWith('core/') ? name.slice(5) : name)

/** Parse block markup into a tree of `{ name, attrs, innerBlocks, innerContent }`; text outside blocks becomes `{ name: null, html }`. */
export function parseBlocks(markup) {
  const root = { name: null, attrs: {}, innerBlocks: [], innerContent: [] }
  const stack = [root]
  let last = 0
  const pushText = (text) => {
    if (!text) return
    const top = stack[stack.length - 1]
    if (top === root)
      root.innerBlocks.push({ name: null, html: text, attrs: {}, innerBlocks: [], innerContent: [text] })
    else top.innerContent.push(text)
  }
  for (const m of markup.matchAll(TOKEN)) {
    const [raw, closer, ns, name, json, selfClose] = m
    pushText(markup.slice(last, m.index))
    last = m.index + raw.length
    const top = stack[stack.length - 1]
    if (closer) {
      if (top === root || top.name !== fullName(ns, name))
        throw new Error(`Unbalanced block markup: unexpected closer ${raw}`)
      stack.pop()
      continue
    }
    let attrs = {}
    if (json) {
      try {
        attrs = JSON.parse(json.trim())
      } catch (e) {
        throw new Error(`Invalid block attribute JSON in ${raw}: ${e.message}`)
      }
    }
    const block = { name: fullName(ns, name), attrs, innerBlocks: [], innerContent: [] }
    if (top === root) root.innerBlocks.push(block)
    else {
      top.innerBlocks.push(block)
      top.innerContent.push(null)
    }
    if (!selfClose) stack.push(block)
  }
  pushText(markup.slice(last))
  if (stack.length !== 1)
    throw new Error(`Unbalanced block markup: ${stack[stack.length - 1].name} never closed`)
  return root.innerBlocks
}

// WordPress escapes these in attribute JSON so a value can never close the HTML comment.
const escapeAttrJson = (json) =>
  json
    .replace(/--/g, '\\u002d\\u002d')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\\"/g, '\\u0022')
const attrJson = (attrs) =>
  attrs && Object.keys(attrs).length ? ' ' + escapeAttrJson(JSON.stringify(attrs)) : ''

/** Serialize a block tree back to markup. */
export function serializeBlocks(blocks) {
  return blocks.map(serializeBlock).join('')
}

function serializeBlock(block) {
  if (block.name === null) return block.html ?? block.innerContent.join('')
  const name = shortName(block.name)
  const hasInner = block.innerContent.length > 0
  if (!hasInner) return `<!-- wp:${name}${attrJson(block.attrs)} /-->`
  let i = 0
  const body = block.innerContent
    .map((chunk) => (chunk === null ? serializeBlock(block.innerBlocks[i++]) : chunk))
    .join('')
  return `<!-- wp:${name}${attrJson(block.attrs)} -->${body}<!-- /wp:${name} -->`
}

/** True when opening and closing delimiters balance and every attribute JSON parses. */
export function checkMarkup(markup) {
  try {
    parseBlocks(markup)
    return true
  } catch {
    return false
  }
}

/** Depth-first walk; `visit(block, parent)` returning `false` stops the walk. */
export function walkBlocks(blocks, visit, parent = null) {
  for (const b of blocks) {
    if (visit(b, parent) === false) return false
    if (b.innerBlocks?.length && walkBlocks(b.innerBlocks, visit, b) === false) return false
  }
  return true
}

export function blockName(block) {
  return block?.attrs?.metadata?.name ?? null
}

/** The block whose `metadata.name` is `name`, or null. */
export function findBlock(blocks, name) {
  let found = null
  walkBlocks(blocks, (b) => {
    if (blockName(b) === name) {
      found = b
      return false
    }
  })
  return found
}

export function findAll(blocks, predicate) {
  const out = []
  walkBlocks(blocks, (b, parent) => {
    if (predicate(b, parent)) out.push(b)
  })
  return out
}

function findParent(blocks, target) {
  let found = null
  walkBlocks(blocks, (b, parent) => {
    if (b === target) {
      found = parent
      return false
    }
  })
  return found
}

/** Remove a block from the tree (its `null` placeholder and the newline that followed it go too). */
export function removeBlock(blocks, target) {
  const parent = findParent(blocks, target)
  const list = parent ? parent.innerBlocks : blocks
  const idx = list.indexOf(target)
  if (idx < 0) return false
  list.splice(idx, 1)
  if (parent) {
    let seen = -1
    for (let i = 0; i < parent.innerContent.length; i++) {
      if (parent.innerContent[i] !== null) continue
      seen++
      if (seen === idx) {
        parent.innerContent.splice(i, 1)
        // Collapse the separator so two "\n" chunks do not stack up.
        if (typeof parent.innerContent[i] === 'string' && typeof parent.innerContent[i - 1] === 'string') {
          parent.innerContent[i - 1] = parent.innerContent[i - 1].replace(/\n$/, '') + parent.innerContent[i]
          parent.innerContent.splice(i, 1)
        }
        break
      }
    }
  }
  return true
}

// ---------------------------------------------------------------------------------------------
// Leaf HTML editing (paragraph, heading, list-item, button, image, social-link…)

const dom = new JSDOM('')
const { document } = dom.window

function leafElement(block) {
  const html = block.innerContent.join('')
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const el = tpl.content.firstElementChild
  return { tpl, el }
}

function writeLeaf(block, tpl) {
  const html = Array.from(tpl.content.childNodes)
    .map((n) => (n.nodeType === 1 ? n.outerHTML : n.textContent))
    .join('')
  block.innerContent = [html]
}

export const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** A bare line break as a source writes it — `<br>`, `<br/>`, `<br />`, or `</br>`, any case; no attributes. */
// HTML parsers recover a stray closing `</br>` as a line break too; source text fields
// must give it the same treatment as the opening spellings.
const BARE_BREAK = /(?:<br\s*\/?>|<\/br\s*>)/i

/**
 * A plain-text field that carries the source's line breaks, as block markup: every bare break
 * kept as `<br>` (a space before it, as richText writes it), every other character escaped — an
 * attribute on the break, a script, a comment that would close the block all stay text. Null when
 * the value has no bare break (the caller writes it as the plain text it is); '' when breaks are
 * all it has. A Joomla module stores "Meet the Minds <br>Behind Our Success" in its field, and
 * `renderAcm` wrote it as text: the page printed "<br>" and the heading broke where the width
 * did, not where the designer did (JA Vega M6-12).
 */
export function breaksAsMarkup(value) {
  const s = String(value ?? '')
  if (!BARE_BREAK.test(s)) return null
  const parts = s.split(new RegExp(BARE_BREAK.source, 'gi')).map((x) => escapeHtml(x.replace(/\s+/g, ' ')))
  if (!parts.some((x) => x.trim())) return ''
  return parts.join('<br>').replace(/\s*<br>\s*/g, ' <br>').replace(/\s+/g, ' ').trim()
}

const INLINE_KEEP = new Set(['EM', 'STRONG', 'B', 'I', 'BR', 'SUB', 'SUP'])
const normText = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()

/**
 * The inline markup of the source element whose text is `text`, with only emphasis kept
 * (`em strong b i sub sup br`, without attributes; everything else unwrapped, text escaped) —
 * or null when no such element exists or it carries no emphasis. A spec field is plain text
 * (`sectionFields` reads `textContent`), so the orange `<em>` of a hero heading was lost on
 * the way to the pattern; the section's html still has it, and this reads it back.
 *
 * A `<br>` counts as emphasis here. A spec field flattens it to a space — it has to, a plain
 * field cannot carry a tag — and the line the designer drew went with it: the contact card's
 * head office read "Vorsino Industrial Park, plot 12 Borovsk District, Kaluga Region, 249020"
 * on one run where the source breaks the street from the district. A postal address is the one
 * place a break is content, not styling.
 */
export function richText(html, text) {
  if (!html || !text) return null
  const tpl = document.createElement('template')
  tpl.innerHTML = String(html)
  const want = normText(text)
  const textOf = (el) => {
    let t = ''
    for (const n of el.childNodes) {
      if (n.nodeType === 3) t += n.textContent
      else if (n.nodeType === 1) t += n.tagName === 'BR' ? ' ' : textOf(n)
    }
    return t
  }
  const el = [...tpl.content.querySelectorAll('*')].find((e) => normText(textOf(e)) === want && e.querySelector('em, strong, b, i, sub, sup, br'))
  if (!el) return null
  const render = (node) => {
    let out = ''
    for (const n of node.childNodes) {
      if (n.nodeType === 3) out += escapeHtml(n.textContent)
      else if (n.nodeType !== 1) continue
      else if (n.tagName === 'BR') out += '<br>'
      else if (INLINE_KEEP.has(n.tagName)) {
        const inner = render(n)
        out += inner.trim() ? `<${n.tagName.toLowerCase()}>${inner.trim()}</${n.tagName.toLowerCase()}>` : inner
      } else out += render(n)
    }
    return out
  }
  // A space stays in front of the break. It draws nothing (the break ends the line anyway), and
  // it is what every reader of this markup that is not a browser needs: `strip_tags` drops the
  // tag and joins the words around it, so a heading the designer broke in two came back out of
  // WordPress as "groundwork fornext-generation plants" in the excerpt, the meta description and
  // the share card. A line break is a space — the readers in this repo (`textOf`, `stripTags`,
  // `extractRuns`) already say so; the writer now says it too.
  return render(el).replace(/\s+/g, ' ').replace(/\s*<br>\s*/g, ' <br>').trim()
}

/** The text of a leaf block (paragraph, heading, list-item, button). */
function getText(block) {
  const { el } = leafElement(block)
  return el ? el.textContent : ''
}

/**
 * Set the text of a paragraph / heading / list-item / button / cite. Plain text by default; `html: true`
 * writes the string as inner HTML (for fields the source stores as HTML). For a button the text lands
 * in the inner `<a>`; for a paragraph that wraps a single link (`<p><a>…</a></p>`) inside the link.
 */
export function setText(block, text, { html = false } = {}) {
  const { tpl, el } = leafElement(block)
  if (!el) throw new Error(`setText: block ${block.name} has no element`)
  let target = el
  if (block.name === 'core/button') target = el.querySelector('a') ?? el
  else if (
    el.children.length === 1 &&
    el.children[0].tagName === 'A' &&
    el.textContent.trim() === el.children[0].textContent.trim()
  )
    target = el.children[0]
  if (html) target.innerHTML = text
  else target.textContent = text
  writeLeaf(block, tpl)
  if (block.name === 'core/details') throw new Error('setText: use setSummary for details')
  return block
}

/** Set the `href` of the `<a>` inside a paragraph / heading / list-item, or a button's link. */
export function setHref(block, href) {
  const { tpl, el } = leafElement(block)
  const a = el?.tagName === 'A' ? el : el?.querySelector('a')
  if (!a) throw new Error(`setHref: block ${block.name} (${blockName(block)}) has no <a>`)
  a.setAttribute('href', href)
  if (block.name === 'core/button') {
    block.attrs.url = href
    delete block.attrs.url // core/button keeps the href in HTML only; url attr is derived on parse
  }
  writeLeaf(block, tpl)
  return block
}

/** Set src / alt / attachment id of a core/image. */
export function setImage(block, { src, alt, id } = {}) {
  const { tpl, el } = leafElement(block)
  const img = el?.querySelector('img')
  if (!img) throw new Error(`setImage: block ${blockName(block)} has no <img>`)
  if (src != null) img.setAttribute('src', src)
  if (alt != null) img.setAttribute('alt', alt)
  if (id != null) {
    block.attrs.id = Number(id)
    const classes = (img.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((c) => c && !/^wp-image-\d+$/.test(c))
    classes.push(`wp-image-${id}`)
    img.setAttribute('class', classes.join(' '))
  }
  writeLeaf(block, tpl)
  return block
}

/** The `class` attribute of a block's root element, as an array of tokens. */
export function getClasses(block) {
  const m = /^(\s*<[a-z][^>]*?)\sclass="([^"]*)"/i.exec(block.innerContent[0] ?? '')
  return m ? m[2].split(/\s+/).filter(Boolean) : []
}

/**
 * Add / remove class tokens on a block: `attrs.className` and the root element's `class` attribute stay
 * in step, and WordPress's own `wp-block-*` classes are kept where they are.
 */
export function setClasses(block, { add = [], remove = [] } = {}) {
  const removeSet = new Set(remove)
  const own = (block.attrs.className ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((c) => !removeSet.has(c))
  for (const c of add) if (!own.includes(c)) own.push(c)
  if (own.length) block.attrs.className = own.join(' ')
  else delete block.attrs.className
  if (typeof block.innerContent[0] === 'string') {
    block.innerContent[0] = block.innerContent[0].replace(
      /^(\s*<[a-z][^>]*?)\sclass="([^"]*)"/i,
      (_, head, cls) => {
        const tokens = cls
          .split(/\s+/)
          .filter(Boolean)
          .filter((c) => !removeSet.has(c))
        for (const c of add) if (!tokens.includes(c)) tokens.push(c)
        return `${head} class="${tokens.join(' ')}"`
      }
    )
  }
  return block
}

/** Heading level: attribute and tag together. */
export function setLevel(block, level) {
  const n = Number(String(level).replace(/^h/i, ''))
  if (!(n >= 1 && n <= 6)) return block
  block.attrs.level = n
  if (n === 2) delete block.attrs.level
  block.innerContent = block.innerContent.map((c) =>
    typeof c === 'string' ? c.replace(/<(\/?)h[1-6]\b/g, `<$1h${n}`) : c
  )
  return block
}

/** The `<summary>` of a core/details, and whether it starts open. */
export function setSummary(block, text, { open } = {}) {
  block.innerContent = block.innerContent.map((c) =>
    typeof c === 'string'
      ? c.replace(/<summary>[^]*?<\/summary>/, `<summary>${escapeHtml(text)}</summary>`)
      : c
  )
  if (open !== undefined) {
    if (open) block.attrs.showContent = true
    else delete block.attrs.showContent
    block.innerContent[0] = block.innerContent[0].replace(
      /(<details\b[^>]*?)(\s+open)?(>)/,
      (_, a, __, c) => `${a}${open ? ' open' : ''}${c}`
    )
  }
  return block
}

/** Set an HTML attribute on the root element of a block (details `name`, social-link…). */
export function setRootAttr(block, attr, value) {
  if (typeof block.innerContent[0] !== 'string') return block
  block.innerContent[0] = block.innerContent[0].replace(
    /^(\s*<[a-z][^>]*?)(\s+[a-z-]+="[^"]*")*(\/?>)/i,
    (tag) => {
      const re = new RegExp(`\\s${attr}="[^"]*"`)
      if (value === null || value === undefined) return tag.replace(re, '')
      if (re.test(tag)) return tag.replace(re, ` ${attr}="${escapeHtml(value).replace(/"/g, '&quot;')}"`)
      return tag.replace(/(\/?>)$/, ` ${attr}="${escapeHtml(value).replace(/"/g, '&quot;')}"$1`)
    }
  )
  return block
}

/** Replace the list-items of a core/list with one item per line (a pattern's item is the template). */
export function setListItems(block, lines) {
  const template = block.innerBlocks[0]
  if (!template) throw new Error('setListItems: list has no item to clone')
  const items = lines.map((line) => {
    const item = structuredClone(template)
    setText(item, line)
    return item
  })
  block.innerBlocks = items
  const open = block.innerContent[0]
  const close = block.innerContent[block.innerContent.length - 1]
  block.innerContent = [open, ...items.flatMap((_, i) => (i ? ['\n', null] : [null])), close]
  return block
}

/**
 * Rename every `<prefix>.<field>.<old>` in a subtree to index `n`; `renumber` regexes patch HTML/attrs
 * too. The index is the first numeric segment, so `<prefix>.item.<old>.title` (a child named under
 * its wrapper, the wp-tracy-business convention) renumbers as well as `<prefix>.<field>.<old>`.
 */
function renumberItem(block, prefix, n, renumber = []) {
  walkBlocks([block], (b) => {
    const name = blockName(b)
    if (name && name.startsWith(prefix + '.')) b.attrs.metadata.name = name.replace(/\.\d+(?=\.|$)/, `.${n}`)
    for (const re of renumber) {
      b.innerContent = b.innerContent.map((c) => (typeof c === 'string' ? c.replace(re, `$1${n}`) : c))
      for (const [k, v] of Object.entries(b.attrs))
        if (typeof v === 'string') b.attrs[k] = v.replace(re, `$1${n}`)
    }
  })
  return block
}

/**
 * Repeat the item wrapper `<prefix>.item.<n>` so that exactly `count` items exist, renumbered 1..count.
 * The template is the existing item with the most inner blocks (a pricing pattern's recommended tier
 * carries the badge; a clone can drop a block, it cannot invent one). `itemName` overrides the wrapper
 * name pattern when the item is not `<prefix>.item.<n>` (clients: the image itself).
 */
export function repeatItems(blocks, prefix, count, { itemName = `${prefix}.item`, renumber = [] } = {}) {
  const re = new RegExp(`^${itemName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)$`)
  const items = findAll(blocks, (b) => re.test(blockName(b) ?? ''))
  if (!items.length) throw new Error(`repeatItems: no ${itemName}.<n> in the pattern`)
  const parent = findParent(blocks, items[0])
  const list = parent ? parent.innerBlocks : blocks
  const first = list.indexOf(items[0])
  const lastIdx = list.indexOf(items[items.length - 1])
  const template = items.reduce((best, b) => (countBlocks(b) > countBlocks(best) ? b : best), items[0])
  const fresh = Array.from({ length: count }, (_, i) =>
    renumberItem(structuredClone(template), prefix, i + 1, renumber)
  )
  // A block named without an index inside the wrapper (`features-intro.spotlight-label`) belongs to
  // the first item only, as the pattern drew it; the clones drop it.
  for (const clone of fresh.slice(1))
    for (const b of findAll(
      [clone],
      (b) => b !== clone && /^[a-z0-9-]+\.[a-z0-9-]+$/.test(blockName(b) ?? '')
    ))
      removeBlock([clone], b)
  list.splice(first, lastIdx - first + 1, ...fresh)
  if (parent) {
    const nulls = []
    parent.innerContent.forEach((c, i) => c === null && nulls.push(i))
    const n0 = nulls[first]
    const n1 = nulls[lastIdx]
    const sep = '\n'
    parent.innerContent.splice(n0, n1 - n0 + 1, ...fresh.flatMap((_, i) => (i ? [sep, null] : [null])))
  }
  return fresh
}

function countBlocks(block) {
  let n = 0
  walkBlocks([block], () => {
    n++
  })
  return n
}

// ---------------------------------------------------------------------------------------------
// fillFromLibrary — structural alignment of a library pattern with a module's HTML.
//
// Both sides become a *shape*: an ordered list of text leaves (kind: heading · text · button · item ·
// summary · cite) where repeated siblings fold into runs (`3×[heading text]`). Alignment then works
// level by level: runs pair up in order (a pattern run with no module counterpart is removed — the
// pattern is a template, dropping a decorative group is safe; a module run with no pattern
// counterpart is a failure — that is content with nowhere to go), the leaves between runs align by
// longest common subsequence of kinds (a pattern-only leaf is removed, a module-only text / button /
// item is inserted after the leaf before it, a module-only heading or summary is a failure), and a
// paired run is cloned to the module's item count before its items align the same way. Every removal
// and insertion is listed in `report`, so the caller can decide whether the result is faithful
// enough — the function never drops a module word silently.

const HEADING = /^H[1-6]$/
const hasWords = (s) => /[\p{L}\p{N}]/u.test(s)
const norm = (s) => s.replace(/\s+/g, ' ').trim()
const LEAF_RUN_KINDS = new Set(['item', 'button'])

/** Text-bearing leaves of a pattern in document order, each with the container chain it sits in. */
function patternLeaves(blocks) {
  const leaves = []
  const images = []
  const rec = (list, trail) => {
    for (const b of list) {
      switch (b.name) {
        case 'core/paragraph':
          leaves.push({ kind: 'text', block: b, path: trail })
          break
        case 'core/heading':
          leaves.push({ kind: 'heading', block: b, path: trail, level: b.attrs.level ?? 2 })
          break
        case 'core/list-item':
          leaves.push({ kind: 'item', block: b, path: trail })
          break
        case 'core/button':
          leaves.push({ kind: 'button', block: b, path: trail })
          break
        case 'core/details':
          leaves.push({ kind: 'summary', block: b, path: [...trail, b] })
          break
        case 'core/image':
          images.push(b)
          break
        default:
      }
      if (b.innerBlocks?.length) rec(b.innerBlocks, [...trail, b])
      if (b.name === 'core/quote' && /<cite>/.test(b.innerContent.join('')))
        leaves.push({ kind: 'cite', block: b, path: [...trail, b] })
    }
  }
  rec(blocks, [])
  return { leaves, images }
}

/** Text-bearing leaves of a module's HTML; decorative glyphs (a lone ✓ or +) and svg are skipped. */
function moduleLeaves(html) {
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const leaves = []
  const images = []
  const INLINE = /^(A|STRONG|EM|B|I|SPAN|BR|CODE|SMALL|SUP|SUB|U|MARK)$/
  const walk = (el, trail) => {
    if (/^(SCRIPT|STYLE|TEMPLATE)$/.test(el.tagName)) return
    // An inline svg travels with the wordless box that frames it (the mock card around a feature
    // illustration, the tile around a step drawing): the highest text-free ancestor is the visual.
    if (/^svg$/i.test(el.tagName) || (!hasWords(el.textContent) && el.querySelector('svg'))) {
      images.push({ kind: 'svg', html: el.outerHTML, path: trail })
      return
    }
    if (el.tagName === 'IMG') {
      images.push({
        kind: 'img',
        src: el.getAttribute('src') ?? '',
        alt: el.getAttribute('alt') ?? '',
        path: trail
      })
      return
    }
    const kids = Array.from(el.children)
    const textKids = kids.filter((k) => hasWords(k.textContent))
    const own = norm(
      Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join(' ')
    )
    const leaf = (extra = {}) =>
      leaves.push({
        kind: leafKind(el),
        el,
        path: trail,
        centered: isCentered(el),
        level: HEADING.test(el.tagName) ? Number(el.tagName[1]) : null,
        text: norm(el.textContent),
        ...extra
      })
    if (!textKids.length) {
      if (hasWords(el.textContent)) leaf()
      for (const k of kids)
        if (k.querySelector('img, svg') || /^(img|svg)$/i.test(k.tagName)) walk(k, [...trail, el])
      return
    }
    // Prose with inline formatting (`<p>Hi <strong>there</strong></p>`) is one leaf, links kept.
    if (
      own &&
      kids.every(
        (k) =>
          INLINE.test(k.tagName) && !Array.from(k.querySelectorAll('*')).some((d) => !INLINE.test(d.tagName))
      )
    )
      return leaf({ html: el.innerHTML.trim() })
    for (const k of kids) walk(k, [...trail, el])
  }
  for (const k of Array.from(tpl.content.children)) walk(k, [])
  return { leaves, images }
}

/** Whether an element or one of its ancestors centres its text (a class the OpenDesign CSS centres, or an inline rule). */
const CENTER_CLASS = /(^|\s)(section-head|text-center|hero-trust|has-text-align-center)(\s|$)/
function isCentered(el) {
  for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
    if (CENTER_CLASS.test(cur.getAttribute('class') ?? '')) return true
    if (/text-align:\s*center/.test(cur.getAttribute('style') ?? '')) return true
  }
  return false
}

/** Centre a filled block the way the editor would: the attribute plus the class WordPress prints for it. */
function setCentered(block) {
  if (block.name === 'core/heading') block.attrs.textAlign = 'center'
  else if (block.name === 'core/paragraph') block.attrs.align = 'center'
  else if (block.name === 'core/buttons') {
    block.attrs.layout = { type: 'flex', justifyContent: 'center' }
    return block
  } else return block
  setClasses(block, { add: ['has-text-align-center'] })
  // The class is derived from the attribute at parse time, not stored in className.
  const own = (block.attrs.className ?? '').split(/\s+/).filter((c) => c && c !== 'has-text-align-center')
  if (own.length) block.attrs.className = own.join(' ')
  else delete block.attrs.className
  return block
}

function leafKind(el) {
  if (HEADING.test(el.tagName)) return 'heading'
  // OpenDesign HTML sets display sizes inline: a leaf sized with a heading token is a heading in
  // all but tag name (the price of a pricing tier, a statistic's figure).
  if (/font-size:\s*var\(--brand-font-size-heading/.test(el.getAttribute('style') ?? '')) return 'heading'
  if (el.closest('summary')) return 'summary'
  if (el.tagName === 'CITE') return 'cite'
  if (el.closest('li')) return 'item'
  if (el.tagName === 'A') {
    // A link standing alone in its parent (an action row) is a button; a link inside prose is text.
    const p = el.parentElement
    const prose = Array.from(p?.childNodes ?? []).some(
      (n) => n !== el && n.nodeType === 3 && hasWords(n.textContent)
    )
    return prose ? 'text' : 'button'
  }
  return 'text'
}

// Identity of a container for run detection: the block name / tag plus the first class token (the
// BEM root), so a flipped or highlighted sibling (`tracy-zig--flip`, `is-hot`) still counts as a repeat.
const firstClass = (cls) => (cls ?? '').split(/\s+/).filter(Boolean)[0] ?? ''
const blockIdentity = (b) => `${b.name}|${firstClass(b.attrs?.className)}`
const elementIdentity = (el) => `${el.tagName}|${firstClass(el.getAttribute('class'))}`

/**
 * Fold leaves into a shape. `depth` is how many containers of each leaf's path have already been
 * consumed; `identity` names a container so repeated siblings can be recognised.
 */
function fold(leaves, depth, identity) {
  const nodes = []
  let i = 0
  while (i < leaves.length) {
    const c = leaves[i].path[depth]
    if (c === undefined) {
      nodes.push({ kind: leaves[i].kind, leaf: leaves[i], id: `leaf:${leaves[i].kind}` })
      i++
      continue
    }
    let j = i
    while (j < leaves.length && leaves[j].path[depth] === c) j++
    nodes.push({ container: c, id: identity(c), sub: fold(leaves.slice(i, j), depth + 1, identity) })
    i = j
  }
  // Repeated sibling containers with the same identity and a structurally compatible sub-shape (same
  // headings / summaries / cites — a recommended tier may carry one badge more) → a run. Repeated
  // item / button leaves → a run by kind; repeated plain texts → a run only when three or more share
  // one identity (a row of names in spans), so a name / summary / price sequence never folds.
  const out = []
  const itemOf = (n) => {
    if (n.container) return { id: n.id, sub: n.sub, kind: 'container' }
    if (LEAF_RUN_KINDS.has(n.kind)) return { id: `leaf:${n.kind}`, sub: [n], kind: n.kind }
    if (n.kind === 'text')
      return { id: `text:${identity(n.leaf.block ?? n.leaf.el)}`, sub: [n], kind: 'text' }
    return null
  }
  const joins = (prevItem, item) =>
    prevItem.id === item.id &&
    (item.kind === 'container' ? sameSignature(prevItem.sub, item.sub) : sameShape(prevItem.sub, item.sub))
  for (const n of nodes) {
    const prev = out[out.length - 1]
    const item = itemOf(n)
    if (item && prev?.run && joins({ id: prev.id, sub: prev.items[0], kind: prev.kind }, item)) {
      prev.items.push(item.sub)
      continue
    }
    if (item && prev && !prev.run) {
      const prevItem = itemOf(prev)
      if (prevItem && joins(prevItem, item)) {
        out[out.length - 1] = { run: true, id: item.id, kind: item.kind, items: [prevItem.sub, item.sub] }
        continue
      }
    }
    out.push(n)
  }
  // Two plain texts are a coincidence, not a list; a container that did not repeat is transparent.
  return out.flatMap((n) => {
    if (n.run && n.kind === 'text' && n.items.length < 3) return n.items.flat()
    return n.container ? n.sub : [n]
  })
}

function sameShape(a, b) {
  if (a.length !== b.length) return false
  return a.every((x, i) => {
    const y = b[i]
    if (x.run || y.run) return Boolean(x.run && y.run) && sameShape(x.items[0], y.items[0])
    return x.kind === y.kind
  })
}

function describe(shape) {
  return shape.map((n) => (n.run ? `${n.items.length}×[${describe(n.items[0]).join(' ')}]` : n.kind))
}

const compatible = (p, m) => p === m || (p === 'item' && m === 'text') || (p === 'text' && m === 'item')

/** Longest common subsequence of two leaf-node lists by kind; returns pairs of indexes. */
function lcs(a, b) {
  const n = a.length
  const m = b.length
  const dp = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => 0))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = compatible(a[i].kind, b[j].kind)
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
  const pairs = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (compatible(a[i].kind, b[j].kind) && dp[i][j] === dp[i + 1][j + 1] + 1) {
      pairs.push([i, j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  return pairs
}

/**
 * Structural compatibility of two run item shapes: the module item's headings / summaries / cites /
 * nested runs must appear, in order, among the pattern item's. A pattern leaf the module lacks is
 * removable; a module heading the pattern lacks is not.
 */
const signature = (shape) =>
  describe(shape)
    .filter((k) => /^(heading|summary|cite|\d+×)/.test(k))
    .map((k) => k.replace(/^\d+×/, 'run'))
/** Siblings fold into a run only when their signatures are equal: a hero's copy column and its decorative mock are not two of a kind. */
const sameSignature = (a, b) => signature(a).join(' ') === signature(b).join(' ')

function runsCompatible(p, m) {
  const a = signature(p)
  const b = signature(m)
  let i = 0
  for (const k of b) {
    while (i < a.length && a[i] !== k) i++
    if (i >= a.length) return false
    i++
  }
  return true
}

/**
 * Align one level. `pShape`/`mShape` are shapes; mutations happen on the pattern blocks. Returns
 * false when the module has content the pattern cannot hold.
 */
function alignLevel(ctx, pShape, mShape) {
  const pRuns = pShape.map((n, i) => (n.run ? i : -1)).filter((i) => i >= 0)
  // A module run of bare texts / buttons / items with no pattern run to hold it is content, not
  // structure: it is flattened and its leaves inserted one by one. A run with headings inside fails.
  const structural = (run) => /heading|summary|cite|×/.test(describe(run.items[0]).join(' '))
  mShape = mShape.flatMap((n) => {
    if (!n.run) return [n]
    const hasPartner = pShape.some((p) => p.run && runsCompatible(p.items[0], n.items[0]))
    return hasPartner || structural(n) ? [n] : n.items.flat()
  })
  const mRuns = mShape.map((n, i) => (n.run ? i : -1)).filter((i) => i >= 0)
  // Pair runs in order by compatibility; unpaired pattern runs are removed, unpaired module runs fail.
  const pairs = []
  let pi = 0
  for (const mi of mRuns) {
    let found = -1
    for (let k = pi; k < pRuns.length; k++) {
      if (runsCompatible(pShape[pRuns[k]].items[0], mShape[mi].items[0])) {
        found = k
        break
      }
    }
    if (found < 0) {
      ctx.report.failure = `module group ${describe(mShape[mi].items[0]).join(' ')} ×${mShape[mi].items.length} has no pattern group`
      return false
    }
    for (let k = pi; k < found; k++) removeRun(ctx, pShape[pRuns[k]])
    pairs.push([pRuns[found], mi])
    pi = found + 1
  }
  for (let k = pi; k < pRuns.length; k++) removeRun(ctx, pShape[pRuns[k]])
  // Leaves between paired runs.
  let pFrom = 0
  let mFrom = 0
  const segments = [...pairs.map(([p, m]) => [p, m]), [pShape.length, mShape.length]]
  for (const [pTo, mTo] of segments) {
    const pSeg = pShape.slice(pFrom, pTo).filter((n) => !n.run)
    const mSeg = mShape.slice(mFrom, mTo).filter((n) => !n.run)
    if (!alignLeaves(ctx, pSeg, mSeg, pShape[pFrom - 1])) return false
    pFrom = pTo + 1
    mFrom = mTo + 1
  }
  // Paired runs: clone to the module's count, then align item by item.
  for (const [p, m] of pairs) {
    const run = pShape[p]
    const want = mShape[m].items.length
    const items = expandRun(ctx, run, want)
    for (let k = 0; k < want; k++) {
      const mLeaf = flatLeaves(mShape[m].items[k])[0]?.leaf
      if (mLeaf) ctx.itemPairs.push({ block: items[k][0], el: itemContainer(mShape[m], k, mLeaf) })
      const root = items[k][0]
      const shape = fold(patternLeaves(items[k]).leaves, root.innerBlocks?.length ? 1 : 0, blockIdentity)
      if (!alignLevel(ctx, shape, mShape[m].items[k])) return false
    }
  }
  return true
}

/** The module element that is item k of a run: the first ancestor not shared with the run's other item. */
function itemContainer(run, k, leaf) {
  const other = flatLeaves(run.items[k === 0 ? 1 : 0])[0]?.leaf
  if (!other) return leaf.el
  let common = 0
  while (common < leaf.path.length && common < other.path.length && leaf.path[common] === other.path[common])
    common++
  return leaf.path[common] ?? leaf.el
}

function alignLeaves(ctx, pSeg, mSeg, anchor) {
  const pairs = lcs(pSeg, mSeg)
  const matchedP = new Set(pairs.map(([i]) => i))
  const matchedM = new Set(pairs.map(([, j]) => j))
  for (let j = 0; j < mSeg.length; j++) {
    if (matchedM.has(j)) continue
    if (mSeg[j].kind === 'heading' || mSeg[j].kind === 'summary') {
      ctx.report.failure = `module ${mSeg[j].kind} "${mSeg[j].leaf.text}" has no pattern counterpart`
      return false
    }
  }
  for (let i = 0; i < pSeg.length; i++) {
    if (matchedP.has(i)) continue
    ctx.report.removed.push(`${pSeg[i].kind}: ${getLeafText(pSeg[i].leaf)}`)
    removeLeaf(ctx, pSeg[i].leaf)
  }
  // Insert module-only leaves after the matched pattern leaf that precedes them (or the anchor).
  let lastP = anchor?.run ? null : (anchor?.leaf ?? null)
  let pi = 0
  for (let j = 0; j < mSeg.length; j++) {
    const pair = pairs.find(([, jj]) => jj === j)
    if (pair) {
      pSeg[pair[0]].leaf.ctxBlocks = ctx.blocks
      writeLeafFrom(pSeg[pair[0]].leaf, mSeg[j].leaf)
      lastP = pSeg[pair[0]].leaf
      pi = pair[0] + 1
      continue
    }
    const next = pairs.find(([, jj]) => jj > j) ?? null
    const ref = lastP ?? (next ? pSeg[next[0]].leaf : null) ?? pSeg[pi]?.leaf ?? null
    const inserted = insertLeaf(ctx, ref, mSeg[j].leaf, lastP !== null)
    if (!inserted) {
      ctx.report.failure = `module ${mSeg[j].kind} "${mSeg[j].leaf.text}" could not be placed`
      return false
    }
    ctx.report.inserted.push(`${mSeg[j].kind}: ${mSeg[j].leaf.text}`)
    if (mSeg[j].leaf.centered) setCentered(inserted.block)
    lastP = inserted
  }
  return true
}

function getLeafText(leaf) {
  if (leaf.kind === 'summary')
    return /<summary>([^]*?)<\/summary>/.exec(leaf.block.innerContent[0] ?? '')?.[1] ?? ''
  if (leaf.kind === 'cite') return /<cite>([^]*?)<\/cite>/.exec(leaf.block.innerContent.join(''))?.[1] ?? ''
  return getText(leaf.block)
}

function removeLeaf(ctx, leaf) {
  if (leaf.kind === 'cite') {
    leaf.block.innerContent = leaf.block.innerContent.map((c) =>
      typeof c === 'string' ? c.replace(/<cite>[^]*?<\/cite>/, '') : c
    )
    return
  }
  removeBlock(ctx.blocks, leaf.block)
}

function removeRun(ctx, run) {
  for (const item of run.items) for (const n of flatLeaves(item)) removeLeaf(ctx, n.leaf)
  ctx.report.removed.push(`group ×${run.items.length}: ${describe(run.items[0]).join(' ')}`)
}

function flatLeaves(shape) {
  return shape.flatMap((n) => (n.run ? n.items.flatMap(flatLeaves) : [n]))
}

/** Clone the run's template item to `want` copies; returns the item block lists. */
function expandRun(ctx, run, want) {
  // The template is the item with the most leaves; every item of a run shares one parent.
  const firstLeaf = (item) => flatLeaves(item)[0]?.leaf
  // The item root is the first container below the deepest ancestor the run's items share; a run of
  // bare leaves (list items, buttons) has the leaf itself as root.
  const a = firstLeaf(run.items[0])
  const b = firstLeaf(run.items[1])
  let common = 0
  while (common < a.path.length && common < b.path.length && a.path[common] === b.path[common]) common++
  const itemRoot = (item) => {
    const leaf = firstLeaf(item)
    return leaf.path[common] ?? leaf.block
  }
  const roots = run.items.map(itemRoot)
  const template = roots.reduce((best, r) => (countBlocks(r) > countBlocks(best) ? r : best), roots[0])
  const parent = findParent(ctx.blocks, roots[0])
  const list = parent ? parent.innerBlocks : ctx.blocks
  const first = list.indexOf(roots[0])
  const last = list.indexOf(roots[roots.length - 1])
  const fresh = Array.from({ length: want }, () => structuredClone(template))
  list.splice(first, last - first + 1, ...fresh)
  if (parent) {
    const nulls = []
    parent.innerContent.forEach((c, k) => c === null && nulls.push(k))
    parent.innerContent.splice(
      nulls[first],
      nulls[last] - nulls[first] + 1,
      ...fresh.flatMap((_, k) => (k ? ['\n', null] : [null]))
    )
  }
  return fresh.map((b) => [b])
}

function writeLeafFrom(p, m) {
  const b = p.block
  if (m.centered && (b.name === 'core/heading' || b.name === 'core/paragraph')) setCentered(b)
  if (m.centered && b.name === 'core/button') {
    const row = findParent(p.ctxBlocks ?? [], b)
    if (row?.name === 'core/buttons') setCentered(row)
  }
  switch (p.kind) {
    case 'summary':
      setSummary(b, m.text)
      break
    case 'cite':
      b.innerContent = b.innerContent.map((c) =>
        typeof c === 'string' ? c.replace(/<cite>[^]*?<\/cite>/, `<cite>${escapeHtml(m.text)}</cite>`) : c
      )
      break
    case 'button':
      setText(b, m.text)
      if (m.el.tagName === 'A' && m.el.getAttribute('href')) setHref(b, m.el.getAttribute('href'))
      break
    default:
      if (m.html && /<a\b/.test(m.html)) setText(b, m.html, { html: true })
      else setText(b, m.text)
  }
}

/** A new block for a module-only leaf, inserted after `ref` (or before it when `after` is false). */
function insertLeaf(ctx, ref, m, after) {
  if (!ref) return null
  const parent = findParent(ctx.blocks, ref.block)
  const list = parent ? parent.innerBlocks : ctx.blocks
  let idx = list.indexOf(ref.block)
  if (idx < 0) return null
  let block
  if (m.kind === 'button' && ref.kind === 'button') {
    block = structuredClone(ref.block)
    setText(block, m.text)
    if (m.el.getAttribute('href')) setHref(block, m.el.getAttribute('href'))
  } else if (m.kind === 'item' && ref.kind === 'item') {
    block = structuredClone(ref.block)
    setText(block, m.text)
  } else if (m.kind === 'button' && m.el.tagName === 'A') {
    block = {
      name: 'core/paragraph',
      attrs: {},
      innerBlocks: [],
      innerContent: [
        `\n<p><a href="${escapeHtml(m.el.getAttribute('href') ?? '#').replace(/"/g, '&quot;')}">${escapeHtml(m.text)}</a></p>\n`
      ]
    }
  } else {
    block = {
      name: 'core/paragraph',
      attrs: {},
      innerBlocks: [],
      innerContent: [`\n<p>${m.html && /<a\b/.test(m.html) ? m.html : escapeHtml(m.text)}</p>\n`]
    }
  }
  const at = after ? idx + 1 : idx
  list.splice(at, 0, block)
  if (parent) {
    const nulls = []
    parent.innerContent.forEach((c, k) => c === null && nulls.push(k))
    if (after) parent.innerContent.splice(nulls[idx] + 1, 0, '\n', null)
    else parent.innerContent.splice(nulls[idx], 0, null, '\n')
  }
  return {
    kind:
      m.kind === 'button' && block.name === 'core/button'
        ? 'button'
        : m.kind === 'item' && block.name === 'core/list-item'
          ? 'item'
          : 'text',
    block
  }
}

/** A container with nothing inside: no inner block, no words of its own (leaf blocks never count). */
export function isEmptyContainer(b) {
  if (b.name === null) return false
  if (/core\/(paragraph|heading|list-item|button|image|html|details|separator|spacer|search|social-link)$/.test(b.name))
    return false
  const own = b.innerContent.filter((c) => typeof c === 'string').join('')
  return b.innerBlocks.length === 0 && b.innerContent.length > 0 && !hasWords(own.replace(/<[^>]*>/g, ''))
}

/**
 * Drop containers left with nothing inside (a buttons row whose buttons went, a group whose leaves went).
 * `keep` holds blocks that stay empty on purpose: drawn empty by the pattern, or drawn by their class
 * alone (an icon picked by its key).
 */
export function pruneEmptyContainers(blocks, { keep = null } = {}) {
  let changed = true
  while (changed) {
    changed = false
    walkBlocks(blocks, (b) => {
      if (!keep?.has(b) && isEmptyContainer(b)) {
        removeBlock(blocks, b)
        changed = true
        return false
      }
    })
  }
}

/**
 * Fill a library pattern with a module's HTML. Returns the markup, or null when the module holds
 * content the pattern cannot place (`report.failure` says which). `report` also lists `removed`
 * pattern leaves, `inserted` module leaves and the shapes of both sides.
 */
export function fillFromLibrary(patternMarkup, moduleHtml, report = {}) {
  const blocks = parseBlocks(patternMarkup)
  const pat = patternLeaves(blocks)
  const mod = moduleLeaves(moduleHtml)
  const pShape = fold(pat.leaves, 0, blockIdentity)
  const mShape = fold(mod.leaves, 0, elementIdentity)
  Object.assign(report, {
    patternShape: describe(pShape),
    moduleShape: describe(mShape),
    removed: [],
    inserted: [],
    failure: null
  })
  const ctx = { blocks, report, itemPairs: [] }
  if (!alignLevel(ctx, pShape, mShape)) return null
  // Image slots are read after the alignment: cloned run items hold new block objects.
  placeVisuals(ctx, patternLeaves(blocks).images, mod.images)
  // A pattern's own core/html (the contact section's sample form) has no module counterpart and
  // would ship as a dead fixture; the module's html arrives through placeVisuals only.
  for (const b of findAll(
    blocks,
    (x) =>
      x.name === 'core/html' &&
      !/<svg|<figure class="(tracy-visual|wp-block-image)/.test(x.innerContent.join(''))
  )) {
    removeBlock(blocks, b)
    report.removed.push('html: pattern fixture')
  }
  report.images = mod.images.length
  pruneEmptyContainers(blocks)
  return serializeBlocks(blocks)
}

/** A core/html block carrying an SVG verbatim, wrapped so the pattern's figure classes still size it. */
function svgBlock(svgHtml, classes = '') {
  const wrap = classes ? `<figure class="${classes}">${svgHtml}</figure>` : svgHtml
  return { name: 'core/html', attrs: {}, innerBlocks: [], innerContent: [`\n${wrap}\n`] }
}

function replaceBlock(blocks, target, replacement) {
  const parent = findParent(blocks, target)
  const list = parent ? parent.innerBlocks : blocks
  const idx = list.indexOf(target)
  if (idx >= 0) list.splice(idx, 1, replacement)
}

function prependBlock(container, block) {
  container.innerBlocks.unshift(block)
  const firstNull = container.innerContent.indexOf(null)
  if (firstNull >= 0) container.innerContent.splice(firstNull, 0, null, '\n')
  else container.innerContent.splice(1, 0, '\n', null)
}

/**
 * The module's visuals (img and inline svg, in order) against the pattern's image slots: an img
 * fills the slot, an svg replaces it verbatim, a slot with nothing to show is removed rather than
 * shipped as a placeholder. Svgs left over that sit inside a paired run item (a pillar's icon, a
 * step's mock) are prepended to that item; the rest are reported.
 */
function placeVisuals(ctx, slots, visuals) {
  const queue = [...visuals]
  ctx.report.visuals = { filled: 0, svg: 0, removed: 0, prepended: 0, dropped: 0 }
  for (const slot of slots) {
    const v = queue.shift()
    if (!v) {
      removeBlock(ctx.blocks, slot)
      ctx.report.visuals.removed++
    } else if (v.kind === 'img') {
      setImage(slot, { src: v.src, alt: v.alt })
      ctx.report.visuals.filled++
    } else {
      replaceBlock(ctx.blocks, slot, svgBlock(v.html, getClasses(slot).join(' ')))
      ctx.report.visuals.svg++
    }
  }
  for (const v of queue) {
    if (v.kind !== 'svg') continue
    const pair = ctx.itemPairs.find(
      (pr) => pr.el === v.path[v.path.length - 1] || pr.el.contains?.(v.path[v.path.length - 1])
    )
    if (pair && pair.block.innerBlocks) {
      prependBlock(pair.block, svgBlock(v.html, 'tracy-visual'))
      ctx.report.visuals.prepended++
    } else ctx.report.visuals.dropped++
  }
}
