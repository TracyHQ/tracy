/**
 * The DOM half of slot extraction, shared by `build-od-slots.mjs` (152 vendored fixtures) and
 * `brand-engine.mjs` (a brand's kit.html): the same numbering, the same roles, so a brand pulled from
 * a URL gets slots the cards and the dialog already know how to fill. linkedom's `querySelectorAll`
 * order is document order — the same order a browser's DOMParser yields, which `slots[].n` relies on.
 */
import { parseHTML } from 'linkedom'

import { groupOf, roleOf, SKIP_TAGS, SLOT_TAGS, slotRecord } from './od-slot-rules.mjs'

/**
 * Text of the element's OWN text nodes, in order — what filling a slot will replace.
 * @param {Element} el
 */
function ownText(el) {
  let out = ''
  for (const node of el.childNodes) if (node.nodeType === 3) out += node.textContent
  return out.replace(/\s+/g, ' ').trim()
}

/** @param {Element} el */
function ancestorsOf(el) {
  const names = []
  for (let p = el.parentElement; p; p = p.parentElement) names.push(p.tagName.toLowerCase())
  return names
}

/** @param {Element | null} el */
function insideSkipped(el) {
  for (let p = el; p; p = p.parentElement) {
    const tag = p.tagName?.toLowerCase()
    if (SKIP_TAGS.has(tag)) return true
    if (p.getAttribute?.('aria-hidden') === 'true') return true
    // A subtree the author marks as not copy: the notes of a typography specimen, a palette's hex labels.
    if (p.getAttribute?.('data-slots') === 'skip') return true
  }
  return false
}

/**
 * The slots of one fixture.
 * @param {string} html
 * @param {{ id: string, selectors: string[] }[]} groups - `groups` of components.manifest.json, or [].
 */
export function slotsOf(html, groups) {
  const { document } = parseHTML(html)
  const body = document.body
  if (!body) return []
  // Index every slot-capable tag once, in document order: `n` is the position within its tag.
  const counters = new Map()
  const slots = []
  for (const el of body.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase()
    if (!SLOT_TAGS.has(tag)) continue
    const n = counters.get(tag) ?? 0
    counters.set(tag, n + 1)
    if (insideSkipped(el)) continue
    const text = ownText(el)
    if (text.length === 0) continue
    const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
    const ancestors = ancestorsOf(el)
    const nextTag = el.nextElementSibling?.tagName?.toLowerCase()
    const role = roleOf({
      tag,
      classes,
      text,
      ancestors,
      role: el.getAttribute('role'),
      beforeHeading: nextTag === 'h1' || nextTag === 'h2'
    })
    const group = groupOf(groups, (/** @type {string} */ sel) => el.closest(sel) !== null)
    const inNav = ancestors.includes('nav') || ancestors.includes('header')
    slots.push(slotRecord({ tag, n, text, role, group, inNav }))
  }
  return slots
}
