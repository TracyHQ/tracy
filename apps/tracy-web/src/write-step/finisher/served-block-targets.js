// The CSS targets a "style one block" order may name, read from the page as the site serves it now (spec #418): the
// elements inside a kit block's own element that print words, each as a target the style allow list accepts
// (lib/finisher-style-allow-list.js), with its tag and its classes as served. A heading the template prints as
// `<span class="h2 main-title">` is the target `span.h2.main-title`, never `h2`; an element with no class of its own is
// named under the nearest ancestor inside the block that has one (`span.h2.main-title span`). A block whose element the
// page does not hold has no target: a rule for it would draw nothing. Pure.
import { parse } from 'parse5'

/** The most targets a block lists, and the most classes a target keeps. */
const MAX_TARGETS = 40
const MAX_CLASSES = 4
const CLASS = /^[\w-]+$/
const SKIPPED = new Set(['script', 'style', 'noscript', 'template', 'svg'])

const attrOf = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? null
const elements = (node) => (node.childNodes ?? []).filter((n) => n.tagName)

/** The block number an element's id names: `Mod<N>` (a T4 module), or `acm-<name>-<N>` (an ACM block). */
const blockNumberOf = (node) => {
  const id = attrOf(node, 'id') ?? ''
  return /^Mod(\d+)$/.exec(id)?.[1] ?? /^acm-[\w-]*?-(\d+)$/.exec(id)?.[1] ?? null
}

/** An element as a target: its tag and its classes as served, or null when a class could not be named safely. */
const selfOf = (node) => {
  const classes = String(attrOf(node, 'class') ?? '')
    .split(/\s+/)
    .filter((c) => CLASS.test(c))
    .slice(0, MAX_CLASSES)
  return { tag: node.tagName, classes }
}

const ownWords = (node) => (node.childNodes ?? []).some((n) => n.nodeName === '#text' && n.value.trim())

/** The targets inside one block element, in page order, each once. */
function targetsIn(root) {
  const out = []
  const walk = (node, anchor) => {
    for (const child of elements(node)) {
      if (SKIPPED.has(child.tagName)) continue
      const self = selfOf(child)
      const own = self.classes.length ? `${self.tag}.${self.classes.join('.')}` : null
      const target = own ?? (anchor ? `${anchor} ${self.tag}` : self.tag)
      if (ownWords(child) && !out.includes(target) && out.length < MAX_TARGETS) out.push(target)
      walk(child, own ?? anchor)
    }
  }
  walk(root, null)
  return out
}

/**
 * Every kit block the served page holds, by its block id (`block-<N>`), with the targets inside it.
 * @param {string} html
 * @returns {Map<string, string[]>}
 */
export function servedBlockTargets(html) {
  const found = new Map()
  const walk = (node) => {
    for (const child of elements(node)) {
      const n = blockNumberOf(child)
      if (n && !found.has(`block-${n}`)) found.set(`block-${n}`, targetsIn(child))
      walk(child)
    }
  }
  if (typeof html === 'string') walk(parse(html))
  return found
}
