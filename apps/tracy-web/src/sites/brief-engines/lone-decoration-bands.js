/**
 * Bands left with decoration only (COO decision, spec TracyHQ/tracy#189 item 30). A band of the page sets blocks side by
 * side: a footer strip with the logo in one column and a sign-up box in the next. When the build takes the working block
 * off (a sign-up box with no destination, a call-to-action that cannot be written), the template still prints the band and
 * its empty column, and the logo stands alone in an empty strip (measured on a local Joomla T4 build: the logo is in the
 * header already). Such a band comes off whole:
 *
 *   a ROW is an element with two or more element children (its columns);
 *   it is a LONE DECORATION row when exactly one column holds content, that content is decoration only (a logo, an icon:
 *   no words, no form, no video, no photo), and another column is an emptied frame (a div, section or aside with no
 *   content, not a spacer or a divider): the trace of the part taken off;
 *   the BAND hidden is the widest element around the row that holds nothing else, so its padding goes with it.
 *
 * The header and the navigation are never read (a logo beside a menu is the header's own). Pure: the parsed tree in,
 * selectors out. No template, class or trade is named.
 */

const SKIPPED = new Set(['script', 'style', 'noscript', 'template', 'head'])
const PHOTO = new Set(['video', 'audio', 'iframe', 'canvas', 'object', 'picture'])
const FORM = new Set(['form', 'input', 'select', 'textarea', 'button'])
const FRAME_TAGS = new Set(['div', 'section', 'aside', 'article'])
/** Classes of an element meant to be empty: a spacer, a divider, a clearfix. */
const MEANT_EMPTY =
  /clearfix|spacer|divider|separator|overlay|mask|shape|decor|backdrop|gradient|placeholder/i
/** A picture that decorates: it names a logo, a brand mark or an icon. */
const DECORATIVE_PICTURE = /logo|brand|icon|emblem|badge/i
/** A link to the home page (a logo's usual link). */
const HOME = /^(?:https?:\/\/[^/]+)?\/?(?:index\.php)?(?:[?#].*)?$/i
/** A drawn icon: an icon font or an inline drawing. */
const ICON_CLASS =
  /(?:^|\s)(?:fa[a-z]?|fa-[\w-]+|bi|bi-[\w-]+|icon[\w-]*|glyphicon[\w-]*|material-icons)(?:\s|$)/i

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? ''
const elements = (node) => (node.childNodes ?? []).filter((c) => c.tagName && !SKIPPED.has(c.tagName))
const hiddenAttr = (node) => (node.attrs ?? []).some((a) => a.name === 'hidden')

/** What an element shows: its words, and the pictures, drawings, forms and photos inside it. */
function shown(node, out = { words: false, decor: 0, other: 0 }) {
  if (SKIPPED.has(node.tagName) || hiddenAttr(node)) return out
  if (node.tagName === 'img') {
    const home = node.parentNode?.tagName === 'a' && HOME.test(attr(node.parentNode, 'href'))
    const named = DECORATIVE_PICTURE.test(`${attr(node, 'src')} ${attr(node, 'alt')} ${attr(node, 'class')}`)
    if (home || named) out.decor += 1
    else out.other += 1
    return out
  }
  if (node.tagName === 'svg' || (node.tagName === 'i' && ICON_CLASS.test(attr(node, 'class')))) {
    out.decor += 1
    return out
  }
  if (PHOTO.has(node.tagName) || FORM.has(node.tagName) || /url\(/i.test(attr(node, 'style'))) {
    out.other += 1
    return out
  }
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === '#text') {
      if (/[\p{L}\p{N}]/u.test(child.value ?? '')) out.words = true
    } else if (child.tagName) shown(child, out)
  }
  return out
}

const hasContent = (node) => {
  const s = shown(node)
  return s.words || s.decor > 0 || s.other > 0
}
const decorationOnly = (node) => {
  const s = shown(node)
  return !s.words && s.other === 0 && s.decor > 0
}
/** An emptied column: a frame element with no content that is not meant to be empty. */
const emptiedColumn = (node) =>
  FRAME_TAGS.has(node.tagName) && !MEANT_EMPTY.test(attr(node, 'class')) && !hasContent(node)

/** Whether `node` sits in the header, a navigation or an off-canvas menu. */
const inChrome = (node) => {
  for (let at = node; at?.tagName; at = at.parentNode) {
    if (['header', 'nav'].includes(at.tagName)) return true
    if (/off-?canvas|navbar|(?:^|[\s_-])header(?:$|[\s_-])/i.test(`${attr(at, 'class')} ${attr(at, 'id')}`))
      return true
  }
  return false
}

/**
 * The bands of a page that hold only decoration beside an emptied column.
 * @param {any} body - the parsed body element
 * @param {(node: any) => string} selectorOf - the engine's selector builder
 * @returns {string[]}
 */
export function loneDecorationBands(body, selectorOf) {
  const out = []
  const walk = (node) => {
    if (SKIPPED.has(node.tagName) || ['header', 'nav'].includes(node.tagName)) return
    const kids = elements(node)
    const filled = kids.filter(hasContent)
    if (
      kids.length >= 2 &&
      filled.length === 1 &&
      decorationOnly(filled[0]) &&
      kids.some((k) => k !== filled[0] && emptiedColumn(k)) &&
      !inChrome(node)
    ) {
      let band = node
      while (
        band.parentNode?.tagName &&
        !['body', 'html', 'main'].includes(band.parentNode.tagName) &&
        elements(band.parentNode).filter(hasContent).length === 1
      )
        band = band.parentNode
      if (band.parentNode?.tagName !== 'body' && band.parentNode?.tagName !== 'html') {
        const selector = selectorOf(band)
        if (!out.includes(selector)) out.push(selector)
        return
      }
    }
    for (const kid of kids) walk(kid)
  }
  walk(body)
  return out
}
