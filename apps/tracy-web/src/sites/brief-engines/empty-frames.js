/**
 * Frames that print empty after the build (spec TracyHQ/tracy#189). A template prints a card, a fact row or a list item
 * whenever its list has a row, so a row whose texts were all emptied (or taken off) still shows its icon and its box. A
 * row cannot be removed (the contract needs every bound path), so the served page is read for the frame instead:
 *
 *   a REPEATED frame is one of several siblings that share a tag and classes (the items of a list, the cards of a grid);
 *   an EMPTY frame holds no text, picture, video, frame or form control (an icon or a drawing is decoration);
 *   a frame is hidden when it is empty and a sibling of the same shape is not, or when every sibling is empty
 *
 * and each hidden frame comes back as a CSS selector built from the structure (tag, classes and child position, from the
 * nearest id), so the head block can hide it. Controls of a carousel, a slider or a pager are never taken for frames.
 * Pure: HTML in, selectors out. No template, class or trade is named.
 */
import { parse } from 'parse5'

const SKIPPED = new Set(['script', 'style', 'noscript', 'template', 'head'])
const MEDIA = new Set([
  'img',
  'picture',
  'video',
  'audio',
  'canvas',
  'iframe',
  'input',
  'select',
  'textarea',
  'form',
  'object'
])
/** Classes and attributes of controls whose empty items are the control itself, not a leftover frame. */
const CONTROL =
  /carousel|slider|slide|swiper|slick|owl|indicator|dots?\b|pagination|pager|rating|star|progress|bullet|toggle|spacer|divider/i
const MAX_SELECTORS = 80

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? ''
const classesOf = (node) => attr(node, 'class').split(/\s+/).filter(Boolean)
const elements = (node) => (node.childNodes ?? []).filter((c) => c.tagName)
const signature = (node) => `${node.tagName}.${[...classesOf(node)].sort().join('.')}`

/** True when the element holds something a visitor reads or sees. */
function hasContent(node) {
  if (SKIPPED.has(node.tagName)) return false
  if (MEDIA.has(node.tagName)) return true
  if (/url\(/i.test(attr(node, 'style'))) return true
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === '#text') {
      if (/[^\s ]/.test(child.value ?? '')) return true
    } else if (child.tagName && hasContent(child)) return true
  }
  return false
}

const isControl = (node) =>
  CONTROL.test(classesOf(node).join(' ')) ||
  node.attrs?.some((a) => /^(data-bs-|data-slide|aria-controls|aria-label|role$)/.test(a.name)) ||
  ['button', 'a'].includes(node.tagName)

/** The CSS for a class token, escaped. */
const esc = (token) => token.replace(/[^\w-]/g, (c) => `\\${c}`)

/** A selector from the nearest id (or the body) down to `node`: tag, classes and child position of each step. */
function selectorOf(node) {
  const steps = []
  for (let at = node; at?.tagName && at.tagName !== 'body' && at.tagName !== 'html'; at = at.parentNode) {
    const id = attr(at, 'id')
    if (id && /^[A-Za-z][\w-]*$/.test(id)) {
      steps.unshift(`#${id}`)
      return steps.join(' > ')
    }
    const position = elements(at.parentNode).indexOf(at) + 1
    const classes = classesOf(at)
      .filter((c) => /^[\w-]+$/.test(c))
      .map((c) => `.${esc(c)}`)
      .join('')
    steps.unshift(`${at.tagName}${classes}:nth-child(${position})`)
  }
  return `body > ${steps.join(' > ')}`
}

/**
 * The selectors of the empty frames of one page.
 * @param {string} html
 * @returns {string[]}
 */
export function emptyFrameSelectors(html) {
  /** @type {string[]} */
  const out = []
  let root
  try {
    root = parse(String(html ?? ''))
  } catch {
    return out
  }
  const body = elements(elements(root).find((n) => n.tagName === 'html') ?? root).find(
    (n) => n.tagName === 'body'
  )
  if (!body) return out
  const walk = (node) => {
    if (SKIPPED.has(node.tagName) || ['nav', 'header'].includes(node.tagName)) return
    const kids = elements(node).filter((k) => !SKIPPED.has(k.tagName))
    /** @type {Map<string, any[]>} */
    const shapes = new Map()
    for (const kid of kids) shapes.set(signature(kid), [...(shapes.get(signature(kid)) ?? []), kid])
    const hidden = new Set()
    for (const same of shapes.values()) {
      if (same.length < 2) continue
      for (const kid of same) {
        // A frame holds some element inside (an icon, a box); a bare empty element is a spacer or a control, left alone.
        if (
          hasContent(kid) ||
          elements(kid).length === 0 ||
          isControl(kid) ||
          CONTROL.test(classesOf(node).join(' '))
        )
          continue
        out.push(selectorOf(kid))
        hidden.add(kid)
      }
    }
    for (const kid of kids) if (!hidden.has(kid)) walk(kid)
  }
  walk(body)
  return out
}

/** The selectors of the empty frames of several pages, each once, the most of them kept. @param {string[]} pages */
export function emptyFrames(pages) {
  return [...new Set(pages.flatMap((html) => emptyFrameSelectors(html)))].slice(0, MAX_SELECTORS)
}
