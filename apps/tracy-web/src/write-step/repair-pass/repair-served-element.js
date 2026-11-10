// The element a fault points at, read from the page as the site serves it (#448), so step 9b's comment item carries what
// the preview's picker would report for it (packages/cms/tracy-cms-preview/src/pick.mjs): the kit block's own element
// (`Mod<N>` for a T4 module, `acm-<name>-<N>` for an ACM block, block `block-<N>`), its id as the selector, and inside it
// the element whose words (or picture alt) are the fault's, with the provenance marks of it and its ancestors, innermost
// first (`data-tracy-src`, a `<template data-tracy-owner>`, a menu item id). A fault whose slot names no block (an article's
// picture) is looked for on the whole page by its words or alt. A fault whose block the page does not
// hold, or whose words the page does not show, has no element. Pure.
import { parse } from 'parse5'

const MAX_TEXT = 300
const MAX_MARKS = 12
const SKIPPED = new Set(['script', 'style', 'noscript', 'template', 'svg'])

const attrOf = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? null
const elements = (node) => (node.childNodes ?? []).filter((n) => n.tagName)
const flat = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()

/** The block number a slot or block id names (`block-4.1`, `module-4`), or null. */
export const blockNumberOf = (id) => /^(?:block|module)-(\d+)(?:\.|$)/.exec(String(id ?? ''))?.[1] ?? null

/** The block number an element's id names, or null. */
const servedNumberOf = (node) => {
  const id = attrOf(node, 'id') ?? ''
  return /^Mod(\d+)$/.exec(id)?.[1] ?? /^acm-[\w-]*?-(\d+)$/.exec(id)?.[1] ?? null
}

/** The visible words of an element, collapsed. */
function textOf(node) {
  if (node.nodeName === '#text') return node.value
  if (SKIPPED.has(node.tagName)) return ''
  return (node.childNodes ?? []).map(textOf).join(' ')
}

/** The provenance stamps one element carries, in reading order (pick.mjs `marksOf`). */
function marksOf(node) {
  const out = []
  const src = attrOf(node, 'data-tracy-src')
  if (src?.trim()) out.push(src.trim())
  for (const kid of elements(node)) {
    const owner = kid.tagName === 'template' ? attrOf(kid, 'data-tracy-owner') : null
    if (owner?.trim()) out.push(owner.trim())
  }
  if (node.tagName === 'li') {
    const item = /(?:^|\s)item-(\d+)(?:\s|$)/.exec(attrOf(node, 'class') ?? '')
    const id = item ? item[1] : attrOf(node, 'data-id')
    if (id && /^\d+$/.test(id)) out.push(`menuItem:${id}`)
  }
  return out
}

/** The marks of an element and its ancestors, innermost first, each once. */
function marksUp(node) {
  const marks = []
  for (let at = node; at?.tagName && marks.length < MAX_MARKS; at = at.parentNode)
    for (const mark of marksOf(at)) if (marks.length < MAX_MARKS && !marks.includes(mark)) marks.push(mark)
  return marks
}

/** The innermost element under `root` that `matches`, depth first. */
function innermost(root, matches) {
  for (const child of elements(root)) {
    if (SKIPPED.has(child.tagName)) continue
    const inner = innermost(child, matches)
    if (inner) return inner
    if (matches(child)) return child
  }
  return null
}

/** The words a sentence quotes in double quotes (`The "BACKPACK" item ...`), or ''. */
export const quotedWords = (text) => flat(String(text ?? '').match(/"([^"]{3,})"/)?.[1])

/** A CSS selector for one element: from its nearest ancestor with an id (or `body`), one `tag:nth-of-type(k)` a step. */
export function pathOf(el) {
  const steps = []
  for (let at = el; at?.tagName; at = at.parentNode) {
    const id = attrOf(at, 'id')
    if (id && /^[A-Za-z][\w-]*$/.test(id)) return [`#${id}`, ...steps].join(' > ')
    if (at.tagName === 'body' || at.tagName === 'html') return ['body', ...steps].join(' > ')
    const same = elements(at.parentNode ?? {}).filter((n) => n.tagName === at.tagName)
    steps.unshift(`${at.tagName}:nth-of-type(${same.indexOf(at) + 1})`)
  }
  return steps.join(' > ')
}

/** Every served block element of a page, by block number, and the page's body (`servedPage`). */
export function servedPage(html) {
  const blocks = new Map()
  let body = null
  const walk = (node) => {
    for (const child of elements(node)) {
      if (child.tagName === 'body') body = child
      const n = servedNumberOf(child)
      if (n && !blocks.has(n)) blocks.set(n, child)
      walk(child)
    }
  }
  if (typeof html === 'string' && html) walk(parse(html))
  return { blocks, body }
}

/** The words a fault names on the page: what was measured, else the words its sentence quotes. */
const saidOf = (fault) =>
  typeof fault.measured === 'string' && fault.measured.trim() ? flat(fault.measured) : quotedWords(fault.seen)

/** A simple selector as the host writes it (`a#id.first-class`), as its parts, or null. */
const simpleSelector = (selector) => {
  const m = /^([a-z][a-z0-9]*)(?:#([\w-]+))?((?:\.[\w-]+)*)$/i.exec(String(selector ?? ''))
  return m ? { tag: m[1].toLowerCase(), id: m[2] ?? null, classes: m[3].split('.').filter(Boolean) } : null
}

const matchesSimple = (el, want) =>
  want &&
  el?.tagName === want.tag &&
  (!want.id || attrOf(el, 'id') === want.id) &&
  want.classes.every((cls) => (attrOf(el, 'class') ?? '').split(/\s+/).includes(cls))

/** The host names empty boxes with child selectors of tags and classes; unsupported selectors stay unresolved. */
function frameElement(body, selector) {
  const parts = String(selector ?? '')
    .split(/\s*>\s*/)
    .map(simpleSelector)
  if (!parts.length || parts.some((part) => !part)) return null
  return innermost(body, (el) => {
    let at = el
    for (let i = parts.length - 1; i >= 0; i--, at = at?.parentNode)
      if (!matchesSimple(at, parts[i])) return false
    return true
  })
}

const imagePath = (src) => {
  try {
    return new URL(String(src), 'https://site.invalid').pathname
  } catch {
    return null
  }
}

/** An inline background still has a picture owner, even when there is no img element to pick. */
function backgroundSource(el, wanted) {
  const style = attrOf(el, 'style') ?? ''
  for (const match of style.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) {
    const source = (match[1] ?? match[2] ?? match[3]).trim()
    if (imagePath(source) === imagePath(wanted)) return source
  }
  return null
}

/** Keep an asset selector short enough that the shared comment builder does not fold its CSS syntax. */
function picturePath(el, source, background) {
  const ownId = attrOf(el, 'id')
  if (ownId && /^[A-Za-z][\w-]*$/.test(ownId)) return `#${ownId}`
  const asset = source.split('#')[0]
  const target = `${el.tagName}[${background ? 'style*' : 'src^'}=${JSON.stringify(asset)}]`
  let scope = ''
  for (let at = el.parentNode; at?.tagName; at = at.parentNode) {
    const id = attrOf(at, 'id')
    if (id && /^[A-Za-z][\w-]*$/.test(id)) {
      scope = `#${id} `
      break
    }
  }
  const selector = scope + target
  return selector.length <= 180 ? selector : pathOf(el)
}

/** The nearest served block holding an element (`Mod<N>`, `acm-…-<N>`), or null. */
function blockAround(el) {
  for (let at = el.parentNode; at?.tagName; at = at.parentNode) if (servedNumberOf(at)) return at
  return null
}

/**
 * The control an empty-controls fault names, on the whole page: the elements matching its selector (and its address, when
 * the fault has one), the first with no words for a wordless button, else the first whose words are the fault's.
 */
function controlElement(body, fault) {
  const want = simpleSelector(fault.selector)
  if (!want || !body) return null
  const all = []
  const walk = (node) => {
    for (const child of elements(node)) {
      if (SKIPPED.has(child.tagName)) continue
      const classes = (attrOf(child, 'class') ?? '').split(/\s+/)
      if (
        child.tagName === want.tag &&
        (!want.id || attrOf(child, 'id') === want.id) &&
        want.classes.every((cls) => classes.includes(cls)) &&
        (fault.href == null || attrOf(child, 'href') === fault.href)
      )
        all.push(child)
      walk(child)
    }
  }
  walk(body)
  const said = fault.wordless ? '' : saidOf(fault).toLowerCase()
  return (
    all.find((el) => (said ? flat(textOf(el)).toLowerCase().includes(said) : !flat(textOf(el)))) ??
    all[0] ??
    null
  )
}

/** The element of a control fault, as the picker reports it: its block's id as the selector, else its own path. */
function servedControlOf(body, fault) {
  const el = controlElement(body, fault)
  if (!el) return null
  const block = blockAround(el)
  const path = pathOf(el)
  return {
    selector: block ? `#${attrOf(block, 'id')}` : path,
    path,
    tag: el.tagName,
    text: flat(textOf(el)).slice(0, MAX_TEXT),
    marks: marksUp(el),
    image: null
  }
}

/**
 * The element a fault points at on its served page, or null. A control fault (empty-controls) is looked for by the
 * selector and address the host measured. A fault whose slot names a block is looked for inside that
 * block; one whose slot names no block (an article's picture) is looked for on the whole page by its words
 * or its picture's alt, and is found only when they are there. `path` is the element's own selector, `selector` the
 * block's (as the picker reports it) or, for an element in no block, its path.
 * @param {{ blocks: Map<string, object>, body: object | null }} page from servedPage
 * @param {{ slot?: string | null, block?: string | null, kind: string, measured?: unknown, seen?: unknown, group?: string,
 *   selector?: string, href?: string | null, wordless?: boolean }} fault
 * @returns {{ selector: string, path: string, tag: string, text: string, marks: string[],
 *   image: { src: string, alt: string } | null } | null}
 */
export function servedElementOf({ blocks, body }, fault) {
  if (fault.group === 'empty-controls' && fault.selector) return servedControlOf(body, fault)
  const n = blockNumberOf(fault.slot) ?? blockNumberOf(fault.block)
  const block = n ? blocks.get(n) : null
  const root = block ?? (n ? null : body)
  if (!root) return null
  const said = saidOf(fault).toLowerCase()
  const demoPicture =
    fault.kind === 'demo-picture' && said
      ? innermost(
          root,
          (el) =>
            (el.tagName === 'img' && imagePath(attrOf(el, 'src')) === imagePath(saidOf(fault))) ||
            Boolean(backgroundSource(el, saidOf(fault)))
        )
      : null
  const frame = fault.kind === 'empty-frame' ? frameElement(root, fault.selector) : null
  const picture =
    demoPicture ??
    (fault.kind === 'wrong-alt' && said
      ? innermost(root, (el) => el.tagName === 'img' && flat(attrOf(el, 'alt')).toLowerCase().includes(said))
      : null)
  const worded =
    !picture && said ? innermost(root, (el) => flat(textOf(el)).toLowerCase().includes(said)) : null
  const el = picture ?? frame ?? worded ?? block
  if (!el) return null
  const background = picture?.tagName !== 'img'
  const source = picture ? (attrOf(picture, 'src') ?? backgroundSource(picture, saidOf(fault)) ?? '') : ''
  const path = picture ? picturePath(el, source, background) : pathOf(el)
  return {
    selector: block ? `#${attrOf(block, 'id')}` : path,
    path,
    tag: el.tagName,
    text: picture ? '' : flat(textOf(el)).slice(0, MAX_TEXT),
    marks: marksUp(el),
    image: picture ? { src: source, alt: attrOf(picture, 'alt') ?? '' } : null
  }
}
