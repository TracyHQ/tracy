// A small reader of rendered HTML for the built site check (ticket #601): elements, the words a visitor sees, links
// and menu links. It reads a page the way a person sees it, not the way a browser lays it out: script, style and
// template content are left out, every character reference is read, white space is one space. Pure.
import { decodeEntities } from '../../packages/wo/website-opportunities/domain/draft-write-entities.mjs'

const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '))
const HIDDEN = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head'])
const BLOCK = new Set(
  'address article aside blockquote br dd details div dl dt figcaption figure footer form h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table td th tr ul'.split(
    ' '
  )
)
const TOKEN =
  /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/gi
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g
const RAW = new Set(['script', 'style'])

function attrsOf(text) {
  const attrs = {}
  for (const m of String(text ?? '').matchAll(ATTR))
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '')
  return attrs
}

/**
 * The element tree of a rendered page.
 * @param {string} html
 * @returns {{name: string, attrs: object, children: Array<object | string>, parent: object | null}}
 */
export function treeOf(html) {
  const root = { name: '#root', attrs: {}, children: [], parent: null }
  let node = root
  let last = 0
  const source = String(html ?? '')
  const re = new RegExp(TOKEN.source, 'gi')
  for (let m = re.exec(source); m; m = re.exec(source)) {
    if (m.index > last) node.children.push(decodeEntities(source.slice(last, m.index)))
    last = re.lastIndex
    if (m[1]) {
      const name = m[1].toLowerCase()
      let open = node
      while (open && open.name !== name) open = open.parent
      if (open?.parent) node = open.parent
    } else if (m[2]) {
      const name = m[2].toLowerCase()
      const el = { name, attrs: attrsOf(m[3]), children: [], parent: node }
      node.children.push(el)
      if (RAW.has(name)) {
        // The body of a script or style is never markup: skip to its closing tag.
        const end = source.toLowerCase().indexOf(`</${name}`, last)
        last = end < 0 ? source.length : end
        re.lastIndex = last
      } else if (!VOID.has(name) && !m[0].endsWith('/>')) node = el
    }
  }
  if (last < source.length) node.children.push(decodeEntities(source.slice(last)))
  return root
}

const squash = (text) => text.replace(/\s+/g, ' ').trim()

/** The words of an element a visitor sees, white space as one space; a block element is set apart by a space. */
export function textOf(el) {
  const parts = []
  const walk = (n) => {
    if (typeof n === 'string') return parts.push(n)
    if (HIDDEN.has(n.name)) return
    if (BLOCK.has(n.name)) parts.push(' ')
    for (const c of n.children) walk(c)
    if (BLOCK.has(n.name)) parts.push(' ')
  }
  walk(el)
  return squash(parts.join(''))
}

/** Every element of the tree in document order, the hidden ones (script, style, head) left out. */
export function elementsOf(root) {
  const out = []
  const walk = (n) => {
    for (const c of n.children)
      if (typeof c !== 'string' && !HIDDEN.has(c.name)) {
        out.push(c)
        walk(c)
      }
  }
  walk(root)
  return out
}

const MENU_TOKEN = /(^|[-_])(nav|navbar|navigation|menu|mainmenu|megamenu)($|[-_])/i
/** Whether an element sits in a menu: inside `nav`, a `role="navigation"`, or a class or id that names a menu. */
export function inMenu(el) {
  for (let n = el; n; n = n.parent) {
    if (n.name === 'nav' || n.attrs?.role === 'navigation') return true
    const tokens = `${n.attrs?.class ?? ''} ${n.attrs?.id ?? ''}`.split(/\s+/)
    if (tokens.some((t) => MENU_TOKEN.test(t))) return true
  }
  return false
}

/** The links of a page: `{href, label, menu}`, the label as a visitor reads it. */
export function linksOf(root) {
  return elementsOf(root)
    .filter((el) => el.name === 'a' && typeof el.attrs.href === 'string')
    .map((el) => ({ href: el.attrs.href.trim(), label: textOf(el), menu: inMenu(el) }))
}

/**
 * The innermost elements whose visible words hold `needle` (already squashed): the element that shows a field, even
 * when its words are split across inline tags.
 */
export function innermostHolding(root, needle) {
  if (!needle) return []
  const out = []
  const walk = (el) => {
    if (!textOf(el).includes(needle)) return false
    let inner = false
    for (const c of el.children) if (typeof c !== 'string' && !HIDDEN.has(c.name) && walk(c)) inner = true
    if (!inner && el.name !== '#root') out.push(el)
    return true
  }
  walk(root)
  return out
}

export { squash }
