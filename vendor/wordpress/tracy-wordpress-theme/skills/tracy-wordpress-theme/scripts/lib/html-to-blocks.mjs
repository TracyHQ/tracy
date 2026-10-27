// html-to-blocks.mjs — Joomla article HTML → WordPress block markup.
//
// WordPress keeps post_content as HTML with comment delimiters (`<!-- wp:paragraph -->…<!-- /wp:paragraph -->`,
// see references/inputs/from-joomla.md §1). Raw HTML still saves, but the editor treats it as a
// Classic block, so every element that has a core block gets one here; everything else is wrapped
// in `core/html` rather than guessed at.
//
//   p → core/paragraph · h1..h6 → core/heading · ul/ol → core/list + core/list-item (an <img> in an
//   item stays inline in it) · img/figure →
//   core/image (src → /wp-content/uploads/<basename>) · blockquote → core/quote · hr →
//   core/separator · div/section/article → core/group (empty ones dropped) · `{loadposition x}` →
//   `<!-- wp:tracy-base/slot {"position":"x"} /-->` (the seeder swaps in the module instances
//   assigned to that position) · anything else → core/html.
//
// Output is deterministic: attribute JSON has stable key order, blocks are joined with "\n".

import { JSDOM } from 'jsdom'

export const SLOT_BLOCK = 'tracy-base/slot'
// Where a post's own body goes in the menu route composition it carries (from-joomla
// `posts[].route`, seed.mjs postWithRoute): never saved, the seeder replaces it.
export const POST_BODY_MARKER = '<!-- wp:tracy-base/post-body /-->'
const SLOT_RE = /\{load(?:position|module)\s+([^}\s]+)(?:\s+[^}]*)?\}/g

const INLINE = new Set([
  'strong',
  'em',
  'b',
  'i',
  'a',
  'br',
  'span',
  'code',
  'sub',
  'sup',
  'u',
  's',
  'mark',
  'small',
  'abbr',
  'kbd',
  'del',
  'ins'
])
const HEADING = /^h[1-6]$/
const WRAPPER = new Set(['div', 'section', 'article', 'main', 'aside', 'header', 'footer', 'nav'])
const INLINE_ATTRS = { a: ['href', 'target', 'rel', 'title', 'class'], abbr: ['title'], span: ['class'] }

const attrJson = (attrs) => (attrs && Object.keys(attrs).length ? ' ' + JSON.stringify(attrs) : '')
const open = (name, attrs) => `<!-- wp:${name}${attrJson(attrs)} -->`
const close = (name) => `<!-- /wp:${name} -->`
const selfClosing = (name, attrs) => `<!-- wp:${name}${attrJson(attrs)} /-->`
const wrap = (name, attrs, html) => `${open(name, attrs)}\n${html}\n${close(name)}`

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;')

/**
 * A URL path as the file path it names: percent-escapes decoded exactly once, segment by segment,
 * as the web server does before it opens the file (`paint%20bucket.png` → `paint bucket.png`). A
 * path whose escapes do not decode (a literal `%` the author never encoded), or whose decoding
 * would move it (an encoded `/`, `\`, `.` or `..` segment), is returned as written.
 */
export function decodeUrlPath(path) {
  const raw = String(path ?? '')
  if (!raw.includes('%')) return raw
  const out = []
  for (const seg of raw.split('/')) {
    let d
    try {
      d = decodeURIComponent(seg)
    } catch {
      return raw
    }
    if (d !== seg && (/[\/\\]/.test(d) || d === '.' || d === '..')) return raw
    out.push(d)
  }
  return out.join('/')
}

/** A file name as the last segment of a URL: the inverse of decodeUrlPath for one segment. */
const encodeUrlSegment = (name) => encodeURI(name).replace(/[#?]/g, encodeURIComponent)

/**
 * `images/tracy-demo/studio-workspace.png#joomlaImage://…` → `/wp-content/uploads/studio-workspace.png`.
 * `src` is a URL; `file` and `original` are the names on disk (decodeUrlPath), which is what the
 * seeder imports from the images tree.
 */
export function rewriteImageSrc(src, uploadsBase = '/wp-content/uploads/') {
  const clean = decodeUrlPath(
    String(src ?? '')
      .split('#')[0]
      .split('?')[0]
  )
  const base = clean.split('/').filter(Boolean).pop() ?? ''
  return { src: uploadsBase + encodeUrlSegment(base), file: base, original: clean }
}

const hasStyledDescendant = (el) => el.hasAttribute('style') || Boolean(el.querySelector('[style]'))

// ── inline serialisation ──────────────────────────────────────────────────────

function inlineHtml(node, ctx) {
  let out = ''
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      out += escapeHtml(child.nodeValue)
      continue
    }
    if (child.nodeType !== 1) continue
    const tag = child.tagName.toLowerCase()
    if (tag === 'br') {
      // A space in front of the break: it draws nothing, and it keeps the two words apart for
      // every reader that strips tags instead of laying them out (WordPress's excerpt, a meta
      // description, a share card) — see the same rule in `richText`.
      out += /\S$/.test(out) ? ' <br>' : '<br>'
      continue
    }
    if (tag === 'img') {
      // Inside a list item the picture is part of the item (an icon before its words): it stays
      // there, inline. Elsewhere it is lifted out into a core/image after the paragraph.
      if (ctx.inListItem) out += inlineImage(child, ctx)
      else ctx.inlineImages.push(child)
      continue
    }
    if (!INLINE.has(tag)) {
      out += inlineHtml(child, ctx)
      continue
    } // unknown inline: unwrap
    const attrs = (INLINE_ATTRS[tag] ?? [])
      .filter((a) => child.hasAttribute(a))
      .map((a) => ` ${a}="${escapeAttr(ctx.link(child.getAttribute(a), a))}"`)
      .join('')
    out += `<${tag}${attrs}>${inlineHtml(child, ctx)}</${tag}>`
  }
  return out
}

/** Split text holding `{loadposition x}` markers into ['text', {slot}] pieces. */
function splitSlots(html) {
  const parts = []
  let last = 0
  for (const m of html.matchAll(SLOT_RE)) {
    if (m.index > last) parts.push(html.slice(last, m.index))
    parts.push({ slot: m[1] })
    last = m.index + m[0].length
  }
  if (last < html.length) parts.push(html.slice(last))
  return parts
}

// ── block builders ────────────────────────────────────────────────────────────

function paragraphBlocks(html, className, ctx) {
  const blocks = []
  for (const part of splitSlots(html)) {
    if (typeof part !== 'string') {
      ctx.slots.push(part.slot)
      blocks.push(selfClosing(SLOT_BLOCK, { position: part.slot }))
      continue
    }
    const text = part.trim()
    if (!text) continue
    const attrs = className ? { className } : null
    const cls = className ? ` class="${escapeAttr(className)}"` : ''
    blocks.push(wrap('paragraph', attrs, `<p${cls}>${text}</p>`))
  }
  return blocks
}

function headingBlock(el, ctx) {
  const level = Number(el.tagName[1])
  const className = el.getAttribute('class')?.trim() || ''
  const attrs = {}
  if (level !== 2) attrs.level = level
  if (className) attrs.className = className
  const cls = `wp-block-heading${className ? ' ' + className : ''}`
  return wrap(
    'heading',
    attrs,
    `<h${level} class="${escapeAttr(cls)}">${inlineHtml(el, ctx).trim()}</h${level}>`
  )
}

/**
 * An <img> kept inline (inside a list item): rich text holds it as it holds a link, with its class,
 * alt and the width/height the source drew it at. Listed in `images` like a block image.
 */
function inlineImage(img, ctx) {
  const { src, file, original } = rewriteImageSrc(img.getAttribute('src'), ctx.uploadsBase)
  const alt = img.getAttribute('alt') ?? ''
  const size = Object.fromEntries(['width', 'height'].filter((a) => img.getAttribute(a)?.trim()).map((a) => [a, img.getAttribute(a).trim()]))
  ctx.images.push({ src, file, original, alt, ...size })
  const className = img.getAttribute('class')?.trim().replace(/\s+/g, ' ') || ''
  return `<img${className ? ` class="${escapeAttr(className)}"` : ''} src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${Object.entries(size).map(([a, v]) => ` ${a}="${escapeAttr(v)}"`).join('')}>`
}

/**
 * `center` when the element's own inline style centres its inline content (`text-align: center`),
 * else null. An <img> in such a paragraph sits in the middle of the column; lifted out into a
 * core/image it keeps that as `align: center` (the figure's `aligncenter`). Left and right are
 * not mapped: core/image's alignleft/alignright float the picture, which the source never did.
 */
const centredBy = (el) => /(?:^|;)\s*text-align\s*:\s*center\s*(?:!important\s*)?(?:;|$)/i.test(el?.getAttribute?.('style') ?? '') ? 'center' : null

function imageBlock(img, caption, ctx, align = null) {
  const { src, file, original } = rewriteImageSrc(img.getAttribute('src'), ctx.uploadsBase)
  ctx.images.push({ src, file, original, alt: img.getAttribute('alt') ?? '' })
  const alt = escapeAttr(img.getAttribute('alt') ?? '')
  const cap = caption ? `<figcaption class="wp-element-caption">${caption}</figcaption>` : ''
  // The image's own class is the block's className (on the figure, where core/image puts it),
  // so a theme rule written for the source class still reaches it.
  const className = img.getAttribute('class')?.trim().replace(/\s+/g, ' ') || ''
  const attrs = { ...(align ? { align } : {}), sizeSlug: 'full', ...(className ? { className } : {}) }
  return wrap(
    'image',
    attrs,
    `<figure class="wp-block-image${align ? ` align${align}` : ''} size-full${className ? ' ' + escapeAttr(className) : ''}"><img src="${escapeAttr(src)}" alt="${alt}"/>${cap}</figure>`
  )
}

function listBlock(el, ctx) {
  const ordered = el.tagName.toLowerCase() === 'ol'
  const items = []
  const outer = ctx.inListItem
  ctx.inListItem = true
  for (const li of el.children) {
    if (li.tagName.toLowerCase() !== 'li') continue
    let text = ''
    const nested = []
    for (const child of li.childNodes) {
      if (child.nodeType === 1 && /^(ul|ol)$/i.test(child.tagName)) nested.push(listBlock(child, ctx))
      else text += child.nodeType === 3 ? escapeHtml(child.nodeValue) : inlineHtml({ childNodes: [child] }, ctx)
    }
    const inner = text.trim() + (nested.length ? '\n' + nested.join('\n') + '\n' : '')
    const className = li.getAttribute('class')?.trim() || ''
    const attrs = className ? { className } : null
    items.push(wrap('list-item', attrs, `<li${className ? ` class="${escapeAttr(className)}"` : ''}>${inner}</li>`))
  }
  ctx.inListItem = outer
  const tag = ordered ? 'ol' : 'ul'
  // The list's own class (a theme's `list-special` check-mark list) stays on the block, as a
  // heading's or a group's does: without it the list draws as a plain bullet list.
  const className = el.getAttribute('class')?.trim() || ''
  const attrs = { ...(ordered ? { ordered: true } : {}), ...(className ? { className } : {}) }
  return wrap(
    'list',
    Object.keys(attrs).length ? attrs : null,
    `<${tag} class="${escapeAttr(`wp-block-list${className ? ' ' + className : ''}`)}">\n${items.join('\n')}\n</${tag}>`
  )
}

function quoteBlock(el, ctx) {
  const inner = []
  let cite = ''
  const rest = []
  for (const child of el.childNodes) {
    if (child.nodeType === 1 && child.tagName.toLowerCase() === 'cite') {
      cite = inlineHtml(child, ctx).trim()
      continue
    }
    rest.push(child)
  }
  inner.push(...childrenToBlocks({ childNodes: rest }, ctx))
  const citeHtml = cite ? `<cite>${cite}</cite>` : ''
  return wrap(
    'quote',
    null,
    `<blockquote class="wp-block-quote">\n${inner.join('\n')}\n${citeHtml}</blockquote>`
  )
}

function groupBlock(el, ctx) {
  const inner = childrenToBlocks(el, ctx)
  if (!inner.length) return []
  const className = el.getAttribute('class')?.trim() || ''
  const attrs = { layout: { type: 'constrained' } }
  if (className) attrs.className = className
  const cls = `wp-block-group${className ? ' ' + className : ''}`
  return [wrap('group', attrs, `<div class="${escapeAttr(cls)}">\n${inner.join('\n')}\n</div>`)]
}

function htmlBlock(el) {
  return wrap('html', null, el.outerHTML.trim())
}

/** Does this element carry only inline content (text + inline tags), i.e. is it really a paragraph? */
const isInlineOnly = (el) =>
  [...el.childNodes].every(
    (n) => n.nodeType === 3 || (n.nodeType === 1 && INLINE.has(n.tagName.toLowerCase()))
  )

const isInlineNode = (n) =>
  n.nodeType === 3 ||
  (n.nodeType === 1 && (INLINE.has(n.tagName.toLowerCase()) || n.tagName.toLowerCase() === 'img'))

/** Children → blocks, with runs of loose text/inline nodes coalesced into one paragraph each. */
function childrenToBlocks(parent, ctx) {
  const blocks = []
  let run = []
  const flush = () => {
    if (!run.length) return
    const html = inlineHtml({ childNodes: run }, ctx)
    const flushed = ctx.inlineImages.splice(0).map((img) => imageBlock(img, '', ctx))
    blocks.push(...paragraphBlocks(html, '', ctx), ...flushed)
    run = []
  }
  for (const child of parent.childNodes) {
    if (isInlineNode(child)) {
      run.push(child)
      continue
    }
    flush()
    blocks.push(...nodeToBlocks(child, ctx))
  }
  flush()
  return blocks
}

function nodeToBlocks(node, ctx) {
  if (node.nodeType === 3) {
    const text = escapeHtml(node.nodeValue)
    return text.trim() ? paragraphBlocks(text, '', ctx) : []
  }
  if (node.nodeType !== 1) return []
  const tag = node.tagName.toLowerCase()

  if (tag === 'p') {
    const flushed = []
    const html = inlineHtml(node, ctx)
    for (const img of ctx.inlineImages.splice(0)) flushed.push(imageBlock(img, '', ctx, centredBy(node)))
    return [...paragraphBlocks(html, node.getAttribute('class')?.trim() || '', ctx), ...flushed]
  }
  if (HEADING.test(tag)) return [headingBlock(node, ctx)]
  if (tag === 'ul' || tag === 'ol') return [listBlock(node, ctx)]
  if (tag === 'img') return [imageBlock(node, '', ctx)]
  if (tag === 'figure') {
    const img = node.querySelector('img')
    const cap = node.querySelector('figcaption')
    if (img) return [imageBlock(img, cap ? inlineHtml(cap, ctx).trim() : '', ctx)]
    return [htmlBlock(node)]
  }
  if (tag === 'blockquote') return [quoteBlock(node, ctx)]
  if (tag === 'hr')
    return [wrap('separator', null, '<hr class="wp-block-separator has-alpha-channel-opacity"/>')]
  if (tag === 'br') return []
  if (INLINE.has(tag)) return paragraphBlocks(inlineHtml({ childNodes: [node] }, ctx), '', ctx)
  if (WRAPPER.has(tag)) {
    // Inline styles cannot survive a core/group (the block has no attribute for them) — keep the
    // markup whole rather than silently drop the styling the author relied on.
    if (hasStyledDescendant(node)) return [htmlBlock(node)]
    if (isInlineOnly(node)) {
      const html = inlineHtml(node, ctx)
      const flushed = ctx.inlineImages.splice(0).map((img) => imageBlock(img, '', ctx))
      return [...paragraphBlocks(html, node.getAttribute('class')?.trim() || '', ctx), ...flushed]
    }
    return groupBlock(node, ctx)
  }
  return [htmlBlock(node)]
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Convert an HTML fragment. Returns the block markup plus what it referenced:
 *   images — `{ src, file, original, alt }` per <img> (plus `width`/`height` for one kept inline in a
 *            list item), in document order, so the seeder knows which files to upload
 *   slots  — every `{loadposition x}` position, in document order
 *
 * @param {string} html
 * @param {{ uploadsBase?: string, link?: (href: string) => string }} [opts]
 *   `link` rewrites href values (e.g. Joomla `index.php?Itemid=N` → the WordPress path).
 */
export function convertHtml(html, { uploadsBase = '/wp-content/uploads/', link = null } = {}) {
  const doc = new JSDOM(`<body>${html ?? ''}</body>`).window.document
  const ctx = {
    uploadsBase,
    images: [],
    slots: [],
    inlineImages: [],
    link: (value, attr) => (attr === 'href' && link ? link(value) : value)
  }
  const blocks = childrenToBlocks(doc.body, ctx)
  return { markup: blocks.join('\n'), images: ctx.images, slots: ctx.slots }
}

/** Markup only. */
export function htmlToBlocks(html, opts) {
  return convertHtml(html, opts).markup
}

const TOKEN_RE = /<!--\s*(\/)?wp:([a-z][a-z0-9-]*\/)?([a-z][a-z0-9-]*)\s*(\{[\s\S]*?\})?\s*(\/)?-->/g

/**
 * Check block delimiters: every opener has a matching closer in the right nesting order, every
 * self-closer stands alone, every attribute payload is valid JSON. Returns `{ ok, problems, blocks }`.
 */
export function checkBlockMarkup(markup) {
  const problems = []
  const stack = []
  let blocks = 0
  for (const m of String(markup).matchAll(TOKEN_RE)) {
    const [, closer, ns, name, json, selfClose] = m
    const full = `${ns ?? 'core/'}${name}`
    if (json != null) {
      try {
        JSON.parse(json)
      } catch {
        problems.push(`invalid attribute JSON on ${full}: ${json.slice(0, 60)}`)
      }
    }
    if (closer) {
      const top = stack.pop()
      if (top !== full) problems.push(`closer ${full} does not match opener ${top ?? '(none)'}`)
      continue
    }
    blocks++
    if (!selfClose) stack.push(full)
  }
  for (const left of stack) problems.push(`unclosed block ${left}`)
  return { ok: problems.length === 0, problems, blocks }
}
