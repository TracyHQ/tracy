// The element a fault points at, read from the page as the site serves it (#448), so step 9b's comment item carries what
// the preview's picker would report for it (packages/cms/tracy-cms-preview/src/pick.mjs): the kit block's own element
// (`Mod<N>` for a T4 module, `acm-<name>-<N>` for an ACM block, block `block-<N>`), its id as the selector, and inside it
// the element whose words (or picture alt) are the fault's, with the provenance marks of it and its ancestors, innermost
// first (`data-tracy-src`, a `<template data-tracy-owner>`, a menu item id). A fault whose block the page does not hold has
// no element. Pure.
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

/** Every served block element of a page, by block number. */
export function servedBlocks(html) {
  const found = new Map()
  const walk = (node) => {
    for (const child of elements(node)) {
      const n = servedNumberOf(child)
      if (n && !found.has(n)) found.set(n, child)
      walk(child)
    }
  }
  if (typeof html === 'string' && html) walk(parse(html))
  return found
}

/**
 * The element a fault points at on its served page, or null.
 * @param {Map<string, object>} blocks from servedBlocks
 * @param {{ slot?: string | null, block?: string | null, kind: string, measured?: unknown }} fault
 * @returns {{ selector: string, tag: string, text: string, marks: string[], image: { src: string, alt: string } | null } | null}
 */
export function servedElementOf(blocks, fault) {
  const n = blockNumberOf(fault.slot) ?? blockNumberOf(fault.block)
  const block = n ? blocks.get(n) : null
  if (!block) return null
  const said = typeof fault.measured === 'string' ? flat(fault.measured).toLowerCase() : ''
  const picture =
    fault.kind === 'wrong-alt' && said
      ? innermost(block, (el) => el.tagName === 'img' && flat(attrOf(el, 'alt')).toLowerCase().includes(said))
      : null
  const worded =
    !picture && said ? innermost(block, (el) => flat(textOf(el)).toLowerCase().includes(said)) : null
  const el = picture ?? worded ?? block
  return {
    selector: `#${attrOf(block, 'id')}`,
    tag: el.tagName,
    text: picture ? '' : flat(textOf(el)).slice(0, MAX_TEXT),
    marks: marksUp(el),
    image: picture ? { src: attrOf(picture, 'src') ?? '', alt: attrOf(picture, 'alt') ?? '' } : null
  }
}
