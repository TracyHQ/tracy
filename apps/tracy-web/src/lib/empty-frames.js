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
 *   a TAKEN-OFF part (a picture, link or list item the build hid with the `hidden` attribute) is no content: the lone
 *   wrapper it leaves (its margins, the line of its emptied words) is hidden with it, so the neighbours close up
 *   a TILE is an empty repeated frame whose same-shape siblings show pictures and no words (a box among the photos of a
 *   grid; siblings with words are cards, and an emptied card is a demo card taken off, hidden): it is shown as one of
 *   the owner's photos instead of hidden (`photoTiles`), so the grid keeps its shape
 *
 *   a CENTRED row is the parent of repeated frames laid out by grid column classes (col-md-4, col-12, span4) of which
 *   some are hidden and some are kept: the template's column count and card size stay, and the cards kept are centred
 *   in the row (`centredRows`), so a row that lost demo cards never shows an empty-looking half
 *
 *   a LONE DECORATION band is a strip whose only content left is a logo or an icon beside the emptied column of a part
 *   taken off (`lone-decoration-bands.js`, #189 item 30): the whole band is hidden (`bands`), so no logo stands alone
 *
 * and each hidden frame comes back as a CSS selector built from the structure (tag, classes and child position, from the
 * nearest id), so the head block can hide it. Controls of a carousel, a slider or a pager are never taken for frames.
 * Pure: HTML in, selectors out. No template, class or trade is named.
 */
import { parse } from 'parse5'
import { processFrameSelectors } from './process-frames.js'
import { loneDecorationBands } from './lone-decoration-bands.js'

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

/**
 * True when the build took the element off (item 26): the records door hides a picture, a link or a list item it has no
 * owner content for with the `hidden` attribute. One a script may reveal (an id, a data-, aria- or role attribute) is
 * not taken off. A taken-off element is no content, so the wrapper it leaves goes with it instead of printing a hole.
 */
const TAKEN_OFF = new Set(['img', 'picture', 'a', 'li'])
const takenOff = (node) =>
  TAKEN_OFF.has(node.tagName) &&
  (node.attrs ?? []).some((a) => a.name === 'hidden') &&
  !(node.attrs ?? []).some((a) => a.name === 'id' || /^(?:data-|aria-|role$)/.test(a.name))

/** True when the element holds something a visitor reads or sees. */
function hasContent(node) {
  if (SKIPPED.has(node.tagName) || takenOff(node)) return false
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
  if (SKIPPED.has(node.tagName) || takenOff(node)) return false
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

/** The first taken-off picture inside `node` with a file of its own, or null. */
const takenOffPicture = (node) =>
  node.tagName === 'img' && takenOff(node) && attr(node, 'src')
    ? attr(node, 'src')
    : (elements(node).map(takenOffPicture).find(Boolean) ?? null)

/**
 * The selector of a frame to hide. A frame around a taken-off picture is named by that picture, from the nearest id with
 * a descendant step, never by its path: a template script often moves an intro block into another column after load
 * (a sticky side column), and a child path read from the served HTML then matches nothing in the live page.
 */
function frameSelectorOf(node) {
  const src = takenOffPicture(node)
  if (!src) return selectorOf(node)
  let anchor = 'body'
  for (let at = node.parentNode; at?.tagName && at.tagName !== 'html'; at = at.parentNode) {
    const id = attr(at, 'id')
    if (id && /^[A-Za-z][\w-]*$/.test(id)) {
      anchor = `#${id}`
      break
    }
  }
  const classes = classesOf(node)
    .filter((c) => /^[\w-]+$/.test(c))
    .map((c) => `.${esc(c)}`)
    .join('')
  const file = src.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  return `${anchor} ${node.tagName}${classes}:has(img[hidden][src="${file}"])`
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
const holdsLive = (node) => !takenOff(node) && (LIVE.has(node.tagName) || elements(node).some(holdsLive))
const holdsTakenOff = (node) => takenOff(node) || elements(node).some(holdsTakenOff)
const nested = (node) => elements(node).some((k) => elements(k).length > 0)
const imagesIn = (node) =>
  takenOff(node)
    ? []
    : node.tagName === 'img'
      ? [attr(node, 'src')].filter(Boolean)
      : elements(node).flatMap(imagesIn)

/** Whether a lone element is an emptied frame (see the head comment). */
function loneFrame(kid, parent, scripts) {
  const classes = classesOf(kid).join(' ')
  if (
    takenOff(kid) ||
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
    holdsTakenOff(kid) ||
    (elements(kid).length > 0 && BOX.test(classes)) ||
    (BOX.test(classes) && /bg-/.test(classes))
  )
}

const isColumn = (node) => classesOf(node).some((c) => COLUMN.test(c))

/**
 * Whether a lone grid column is an emptied one: it holds boxes but nothing a visitor reads or sees, no link, control or
 * code, nothing a script fills, and a sibling column of the same row shows content.
 */
function emptyColumn(kid, kids, scripts) {
  if (!isColumn(kid) || takenOff(kid) || hasContent(kid) || elements(kid).length === 0) return false
  if (holdsLive(kid) || holdsCode(kid) || scripted(kid, scripts) || isControl(kid)) return false
  return kids.some((k) => k !== kid && isColumn(k) && hasContent(k))
}

/**
 * The empty frames of one page: those to hide, the tiles of a photo grid to show as an owner photo, and the rows whose
 * kept cards are centred.
 * @param {string} html
 * @returns {{hide: string[], tiles: Array<{selector: string, target: string, grid: string[]}>, centre: string[],
 *   bands?: string[]}}
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
          hide.push(frameSelectorOf(same[0]))
          hidden.add(same[0])
        } else if (body !== node && emptyColumn(same[0], kids, scripts)) {
          // A grid column whose content the build took off (a channel the business does not have) leaves no hole: it is
          // hidden and the row centres the columns kept (R12 group C, criterion 4.1).
          hide.push(frameSelectorOf(same[0]))
          hidden.add(same[0])
          if (!centre.includes(selectorOf(node))) centre.push(selectorOf(node))
        }
        continue
      }
      const before = hide.length
      for (const kid of same) {
        // A frame holds some element inside (an icon, a box); a bare empty element is a spacer or a control, left alone.
        if (
          takenOff(kid) ||
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
        } else hide.push(frameSelectorOf(kid))
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
  hide.push(...processFrameSelectors(body, selectorOf).filter((selector) => !hide.includes(selector)))
  const bands = loneDecorationBands(body, selectorOf).filter((selector) => !hide.includes(selector))
  return { hide, tiles, centre, bands }
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
  const { hide, tiles, bands = [] } = emptyFramesOf(html)
  return [...hide, ...tiles.map((t) => t.selector), ...bands]
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

/** A gallery marker removes its repeated tile, preserving the contract's bound nodes and list indexes. */
function removedPictureFramesOf(html, paths) {
  if (!paths.size) return []
  const out = []
  const walk = (node) => {
    if (SKIPPED.has(node.tagName) || ['nav', 'header'].includes(node.tagName)) return
    if (node.tagName === 'img' && paths.has(sitePath(attr(node, 'src')))) {
      let tile = node
      for (
        let at = node.parentNode;
        at?.tagName && !['body', 'html', 'section', 'main'].includes(at.tagName);
        at = at.parentNode
      ) {
        if (elements(at.parentNode).filter((s) => signature(s) === signature(at)).length > 1) {
          tile = at
          break
        }
        // Never hide a whole gallery container when this was its last tile.
        if (attr(at, 'id')) {
          if (
            ['figure', 'li'].includes(at.tagName) ||
            classesOf(at).some((c) => COLUMN.test(c) || BOX.test(c))
          )
            tile = at
          break
        }
        tile = at
      }
      const file = sitePath(attr(node, 'src')).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
      // This head block serves every page: an identical tile on another page must keep its real photo.
      const picture = `img[src*="${file}"]`
      out.push(tile === node ? `${selectorOf(tile)}[src*="${file}"]` : `${selectorOf(tile)}:has(${picture})`)
      return
    }
    for (const child of elements(node)) walk(child)
  }
  walk(parse(String(html ?? '')))
  return out
}

/** The complete gallery tiles explicitly cleared by their picture slot roles. */
export function removedPictureFrames(pages, paths) {
  const removed = new Set(paths.map(sitePath))
  return [...new Set(pages.flatMap((html) => removedPictureFramesOf(html, removed)))].slice(0, MAX_SELECTORS)
}

/**
 * The selectors of empty frames and explicit gallery removals, each once.
 * @param {string[]} pages
 * @param {{removedPictures?: string[]}} [options]
 */
export function emptyFrames(pages, { removedPictures = [] } = {}) {
  const removed = new Set(removedPictures.map(sitePath))
  return [
    ...new Set(
      pages.flatMap((html) => [...removedPictureFramesOf(html, removed), ...emptyFrameSelectors(html)])
    )
  ].slice(0, MAX_SELECTORS)
}
