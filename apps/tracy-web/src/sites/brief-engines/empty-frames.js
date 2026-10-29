/**
 * Frames that print empty after the build (spec TracyHQ/tracy#189). A template prints a card, a fact row or a list item
 * whenever its list has a row, so a row whose texts were all emptied (or taken off) still shows its icon and its box. A
 * row cannot be removed (the contract needs every bound path), so the served page is read for the frame instead:
 *
 *   a REPEATED frame is one of several siblings that share a tag and classes (the items of a list, the cards of a grid);
 *   an EMPTY frame holds no text, picture, video, frame or form control (an icon or a drawing is decoration);
 *   a frame is hidden when it is empty and a sibling of the same shape is not, or when every sibling is empty
 *   a LONE frame (no sibling of its shape) is hidden too when it is empty, sits beside content its parent shows, holds
 *   nested boxes (or names itself a box: card, panel, tile, info, stat, bg-*), and holds no link, button, icon or anything
 *   a script fills (an id, a data-, aria- or role attribute): a fact block whose values were all emptied
 *   a TILE is an empty repeated frame whose same-shape siblings show pictures and no words (a box among the photos of a
 *   grid; siblings with words are cards, and an emptied card is a demo card taken off, hidden): it is shown as one of
 *   the owner's photos instead of hidden (`photoTiles`), so the grid keeps its shape
 *
 *   a CENTRED row is the parent of repeated frames laid out by grid column classes (col-md-4, col-12, span4) of which
 *   some are hidden and some are kept: the template's column count and card size stay, and the cards kept are centred
 *   in the row (`centredRows`), so a row that lost demo cards never shows an empty-looking half
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
/** A grid column class: Bootstrap 3 to 5 (col-md-4, col-12, col) and Bootstrap 2 (span4). */
const COLUMN = /^(?:col(?:-[a-z]+)?(?:-\d+)?|span\d+)$/

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

/** True when the element holds words of its own (a text node with a letter or a digit, outside scripts and styles). */
function hasWords(node) {
  if (SKIPPED.has(node.tagName)) return false
  return (node.childNodes ?? []).some((c) =>
    c.nodeName === '#text' ? /[\p{L}\p{N}]/u.test(c.value ?? '') : c.tagName ? hasWords(c) : false
  )
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

/** Classes of a lone element that paint a box of its own, and of decoration that is meant to be empty. */
const BOX = /(?:^|[-_ ])(?:card|panel|tile|box|info|stat|stats|statics|fact|facts|counter|bg)(?:[-_ ]|$)/i
const DECOR =
  /overlay|mask|shape|decor|separator|divider|clearfix|spinner|loader|backdrop|placeholder|gradient|parallax|particles|map|icon|bg-image|video/i
/** Elements whose presence says the box is a control or an icon, not an emptied fact. */
const LIVE = new Set([
  'a',
  'button',
  'svg',
  'i',
  'img',
  'picture',
  'video',
  'iframe',
  'canvas',
  'form',
  'input',
  'select',
  'textarea'
])

/**
 * True when a script may fill the element or one inside it: an id, a data-, aria- or role attribute, a style or script of
 * its own, or a class the page's own scripts name (`.name`).
 */
const scripted = (node, scripts) =>
  ['script', 'style'].includes(node.tagName) ||
  (node.attrs ?? []).some((a) => a.name === 'id' || /^(?:data-|aria-|role$)/.test(a.name)) ||
  classesOf(node).some((c) => scripts.includes(`.${c}`)) ||
  (node.childNodes ?? []).some((k) => k.tagName && scripted(k, scripts))
/** The text of a page's inline scripts. */
const scriptsOf = (node) =>
  node.tagName === 'script'
    ? (node.childNodes ?? []).map((c) => c.value ?? '').join('')
    : (node.childNodes ?? []).map(scriptsOf).join('\n')
/** A style or a script inside: the frame carries code (a head block in a module), never a leftover. */
const holdsCode = (node) => ['script', 'style'].includes(node.tagName) || elements(node).some(holdsCode)
const holdsLive = (node) => LIVE.has(node.tagName) || elements(node).some(holdsLive)
const nested = (node) => elements(node).some((k) => elements(k).length > 0)
const imagesIn = (node) =>
  node.tagName === 'img' ? [attr(node, 'src')].filter(Boolean) : elements(node).flatMap(imagesIn)

/** Whether a lone element is an emptied frame (see the head comment). */
function loneFrame(kid, parent, scripts) {
  const classes = classesOf(kid).join(' ')
  if (
    hasContent(kid) ||
    !hasContent(parent) ||
    isControl(kid) ||
    CONTROL.test(classes) ||
    DECOR.test(classes)
  )
    return false
  if (holdsLive(kid) || scripted(kid, scripts)) return false
  return (
    nested(kid) ||
    (elements(kid).length > 0 && BOX.test(classes)) ||
    (BOX.test(classes) && /bg-/.test(classes))
  )
}

/**
 * The empty frames of one page: those to hide, the tiles of a photo grid to show as an owner photo, and the rows whose
 * kept cards are centred.
 * @param {string} html
 * @returns {{hide: string[], tiles: Array<{selector: string, target: string, grid: string[]}>, centre: string[]}}
 */
export function emptyFramesOf(html) {
  /** @type {string[]} */
  const hide = []
  /** @type {Array<{selector: string, target: string, grid: string[]}>} */
  const tiles = []
  /** @type {string[]} */
  const centre = []
  let root
  try {
    root = parse(String(html ?? ''))
  } catch {
    return { hide, tiles, centre }
  }
  const body = elements(elements(root).find((n) => n.tagName === 'html') ?? root).find(
    (n) => n.tagName === 'body'
  )
  if (!body) return { hide, tiles, centre }
  const scripts = scriptsOf(root)
  const walk = (node) => {
    if (SKIPPED.has(node.tagName) || ['nav', 'header'].includes(node.tagName)) return
    const kids = elements(node).filter((k) => !SKIPPED.has(k.tagName))
    /** @type {Map<string, any[]>} */
    const shapes = new Map()
    for (const kid of kids) shapes.set(signature(kid), [...(shapes.get(signature(kid)) ?? []), kid])
    const hidden = new Set()
    for (const same of shapes.values()) {
      if (same.length < 2) {
        if (body !== node && loneFrame(same[0], node, scripts)) {
          hide.push(selectorOf(same[0]))
          hidden.add(same[0])
        }
        continue
      }
      const before = hide.length
      for (const kid of same) {
        // A frame holds some element inside (an icon, a box); a bare empty element is a spacer or a control, left alone.
        if (
          hasContent(kid) ||
          elements(kid).length === 0 ||
          holdsCode(kid) ||
          isControl(kid) ||
          CONTROL.test(classesOf(node).join(' '))
        )
          continue
        hidden.add(kid)
        // Two or more of its siblings show a picture and no words: the frame is a tile of a photo grid. Siblings with
        // words (a name, a title) are cards, and an emptied card is a demo card taken off: hidden, never a photo.
        const grid = same.filter((k) => k !== kid).flatMap(imagesIn)
        const photos = same.filter((k) => k !== kid && imagesIn(k).length > 0)
        if (photos.length >= 2 && !photos.some(hasWords)) {
          const inner = elements(kid)
          tiles.push({
            selector: selectorOf(kid),
            target: inner.length === 1 ? selectorOf(inner[0]) : selectorOf(kid),
            grid
          })
        } else hide.push(selectorOf(kid))
      }
      // Cards laid out by grid columns lost some and kept some: the row centres the kept ones.
      if (
        hide.length > before &&
        same.some((k) => !hidden.has(k)) &&
        classesOf(same[0]).some((c) => COLUMN.test(c)) &&
        !centre.includes(selectorOf(node))
      )
        centre.push(selectorOf(node))
    }
    for (const kid of kids) if (!hidden.has(kid)) walk(kid)
  }
  walk(body)
  return { hide, tiles, centre }
}

/** The rows of several pages whose kept cards are centred, each once. @param {string[]} pages */
export function centredRows(pages) {
  return [...new Set(pages.flatMap((html) => emptyFramesOf(html).centre))].slice(0, MAX_SELECTORS)
}

/**
 * The selectors of the empty frames of one page, tiles of a photo grid included (hidden when no photo is left for them).
 * @param {string} html
 * @returns {string[]}
 */
export function emptyFrameSelectors(html) {
  const { hide, tiles } = emptyFramesOf(html)
  return [...hide, ...tiles.map((t) => t.selector)]
}

const OWNER_PHOTO = /["'(]\/?(images\/tracy-content\/[a-f0-9]{64}\.(?:jpe?g|webp))/gi
const sitePath = (src) =>
  String(src ?? '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '')
    .split(/[?#]/)[0]

/**
 * The tiles of photo grids on several pages, each with one of the owner's photos to show in it: a photo the site already
 * serves (a build-written owner photo, never a template file), not one of the tile's own grid, not one of `skip` (the
 * clear pictures of the cut-out ladder), the photos no page shows first, then those of another page; never the same
 * photo in two tiles. A tile no photo is left for is not returned: `emptyFrames` hides it.
 * @param {string[]} pages
 * @param {{skip?: string[]}} [options]
 * @returns {Array<{selector: string, target: string, picture: string}>}
 */
export function photoTiles(pages, { skip = [] } = {}) {
  const off = new Set(skip.map(sitePath))
  const onPage = pages.map((html) => new Set([...String(html ?? '').matchAll(OWNER_PHOTO)].map((m) => m[1])))
  const pool = [...new Set(onPage.flatMap((set) => [...set]))].filter((p) => !off.has(p))
  const taken = new Set()
  const out = []
  const seen = new Set()
  pages.forEach((html, n) => {
    for (const tile of emptyFramesOf(html).tiles) {
      if (seen.has(tile.selector)) continue
      seen.add(tile.selector)
      const grid = new Set(tile.grid.map(sitePath))
      const free = pool.filter((p) => !grid.has(p) && !taken.has(p))
      const picture = free.find((p) => !onPage[n].has(p)) ?? free[0] ?? null
      if (!picture) continue
      taken.add(picture)
      out.push({ selector: tile.selector, target: tile.target, picture })
    }
  })
  return out.slice(0, MAX_SELECTORS)
}

/** The selectors of the empty frames of several pages, each once, the most of them kept. @param {string[]} pages */
export function emptyFrames(pages) {
  return [...new Set(pages.flatMap((html) => emptyFrameSelectors(html)))].slice(0, MAX_SELECTORS)
}
