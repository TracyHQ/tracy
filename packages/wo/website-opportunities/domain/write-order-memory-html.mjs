// The HTML pieces of the memory site (ticket #597): the stored HTML value parsed into nodes, the way the Claude Cowork
// plugin's own functions see it (`scripts/ai-quickstart/html-piece.php`: `ContentSlots::html` wraps the value in a
// `div` under `/html/body`, a value in the JA ACM marker notation is read and written in it). An xpath of the mapping
// file (`/html/body/div/a[1]/text()`, `.../@href`, `.../p`) must name exactly one node, else the call is refused with
// `HTML_SLOT_MISSING` ("HTML slot is missing or ambiguous"); reading a piece returns the node's text (an attribute's
// value, an element's text), never the raw value written. Only the xpath forms the mapping file uses are read: element
// steps with an optional `[n]`, then `text()` (`[n]`) or `@name`. Every character reference is read
// (`draft-write-entities.mjs`), and a node the edit did not change is written back as it was read, so an edit never
// alters its siblings (`Caf&eacute;` stays as it is). Pure.
import { decodeEntities } from './draft-write-entities.mjs'

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'col', 'embed'])
/** An open `li` ends where the next `li` opens, inside the nearest list. */
const LI_FENCE = ['ul', 'ol']
/** An open `p` ends where one of these opens (the HTML parser's rule), inside the nearest of the fences. */
const P_CLOSERS = new Set(
  'address article aside blockquote details dialog div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr main menu nav ol p pre section table ul'.split(
    ' '
  )
)
const P_FENCE = ['td', 'th', 'caption', 'table', 'button', 'object', 'template', 'marquee', 'applet']
const escText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
/** A text node keeps the text it was read from: written back as it was while its words are unchanged. */
const textNode = (raw) => ({ type: 'text', text: decodeEntities(raw), raw })

/** Close the open `name` element above the last fence, if any: what an HTML parser does before `next` opens. */
function closeImplied(stack, name, fence) {
  const open = stack.findLastIndex((n) => n.name === name)
  const fenced = stack.findLastIndex((n) => fence.includes(n.name))
  if (open > 0 && open > fenced) stack.length = open
}

class PieceRefusal extends Error {
  constructor(xpath, found) {
    super(`HTML_SLOT_MISSING: ${xpath} names ${found} nodes`)
    this.code = 'HTML_SLOT_MISSING'
  }
}

/** The nodes of an HTML value: `{type: 'element', name, attrs: [[k, v]], children} | {type: 'text', text} | {type: 'raw'}`. */
export function parseHtml(html) {
  const root = { type: 'element', name: '#root', attrs: [], children: [] }
  const stack = [root]
  const re =
    /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g
  let last = 0
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m.index > last) stack.at(-1).children.push(textNode(html.slice(last, m.index)))
    last = re.lastIndex
    if (m[0].startsWith('<!--')) stack.at(-1).children.push({ type: 'raw', text: m[0] })
    else if (m[1]) {
      const name = m[1].toLowerCase()
      const at = stack.findLastIndex((n) => n.name === name)
      if (at > 0) stack.length = at
    } else {
      const attrs = [...m[3].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(
        (a) => [a[1].toLowerCase(), decodeEntities(a[2] ?? a[3] ?? a[4] ?? '')]
      )
      const node = { type: 'element', name: m[2].toLowerCase(), attrs, children: [], open: m[0] }
      node.read = JSON.stringify(attrs)
      // An unclosed `li` ends where the next one opens (`((li))` rows of a stored list value are written without their
      // end tags); an unclosed `p` where a block opens (`div`, `ul`, another `p`), as an HTML parser reads them.
      if (node.name === 'li') closeImplied(stack, 'li', LI_FENCE)
      if (P_CLOSERS.has(node.name)) closeImplied(stack, 'p', P_FENCE)
      stack.at(-1).children.push(node)
      if (!m[4] && !VOID.has(node.name)) stack.push(node)
    }
  }
  if (last < html.length) stack.at(-1).children.push(textNode(html.slice(last)))
  return root
}

/** An HTML value of nodes. */
export function serializeHtml(nodes) {
  return nodes
    .map((n) => {
      if (n.type === 'text')
        return n.raw !== undefined && decodeEntities(n.raw) === n.text ? n.raw : escText(n.text)
      if (n.type === 'raw') return n.text
      const attrs = n.attrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('')
      const open = n.open && n.read === JSON.stringify(n.attrs) ? n.open : null
      if (VOID.has(n.name)) return open ?? `<${n.name}${attrs}/>`
      // A non-void element read as closed by its own tag (`<span/>`) holds nothing: written back as it was read.
      if (open?.endsWith('/>') && n.children.length === 0) return open
      return `${open ?? `<${n.name}${attrs}>`}${serializeHtml(n.children)}</${n.name}>`
    })
    .join('')
}

/** The text of a node: a text node's text, an attribute's value, an element's text. */
const textOf = (n) =>
  n.type === 'text'
    ? n.text
    : n.type === 'attr'
      ? n.owner.attrs.find((a) => a[0] === n.name)[1]
      : n.type === 'element'
        ? n.children.map(textOf).join('')
        : ''

const MARKED = /\(\(\/?[a-z][a-z0-9]*[^)]*\)\)/i
const isMarked = (value) => MARKED.test(value) && !/<\/?[a-z]/i.test(value)
const fromMarkers = (value) => value.replace(/\(\((\/?[a-z][a-z0-9]*(?:\s[^)]*?)?\/?)\)\)/gi, '<$1>')
const toMarkers = (value) => value.replace(/<(\/?[a-z][a-z0-9]*(?:\s[^>]*?)?\/?)>/gi, '(($1))')

/** The one node an xpath names inside the wrapped value, or a refusal. */
function nodeAt(root, xpath) {
  const steps = String(xpath).split('/').filter(Boolean)
  const head = steps.splice(0, 3).join('/')
  if (head !== 'html/body/div') throw new PieceRefusal(xpath, 0)
  let node = root
  for (const [i, step] of steps.entries()) {
    const m = /^(text\(\)|@[\w-]+|[a-z][\w-]*)(?:\[(\d+)\])?$/i.exec(step)
    if (!m || node.type !== 'element') throw new PieceRefusal(xpath, 0)
    if (m[1].startsWith('@')) {
      const name = m[1].slice(1).toLowerCase()
      if (i !== steps.length - 1 || !node.attrs.some((a) => a[0] === name)) throw new PieceRefusal(xpath, 0)
      return { type: 'attr', owner: node, name }
    }
    const text = m[1] === 'text()'
    const all = node.children.filter((c) =>
      text ? c.type === 'text' : c.type === 'element' && c.name === m[1].toLowerCase()
    )
    if (!m[2] && all.length !== 1) throw new PieceRefusal(xpath, all.length)
    const next = all[(Number(m[2]) || 1) - 1]
    if (!next) throw new PieceRefusal(xpath, 0)
    node = next
  }
  return node
}

/** Run `change` on the wrapped value; return the value, in the notation it was stored in. */
function edit(html, xpath, change) {
  const stored = String(html ?? '')
  const marked = isMarked(stored)
  const root = parseHtml(marked ? fromMarkers(stored) : stored)
  const out = change(nodeAt(root, xpath), root)
  if (out !== undefined) return out
  const value = serializeHtml(root.children)
  return marked ? toMarkers(value) : value
}

/** The memory site's HTML piece functions, the shape of `doors.html`. */
export const memoryHtml = {
  get: (html, xpath) => edit(html, xpath, (node) => textOf(node)),
  set: (html, xpath, value) =>
    edit(html, xpath, (node) => {
      if (node.type === 'text') node.text = String(value)
      else if (node.type === 'attr') node.owner.attrs.find((a) => a[0] === node.name)[1] = String(value)
      else node.children = parseHtml(String(value)).children
    }),
  remove: (html, xpath) =>
    edit(html, xpath, (node, root) => {
      if (node.type !== 'element' || node === root) throw new PieceRefusal(xpath, 0)
      const parentOf = (at) =>
        at.children?.find((c) => c === node) ? at : at.children?.map(parentOf).find(Boolean)
      const parent = parentOf(root)
      parent.children = parent.children.filter((c) => c !== node)
    })
}
