// The HTML pieces of the memory site (ticket #597): the stored HTML value parsed into nodes, the way the Claude Cowork
// plugin's own functions see it (`scripts/ai-quickstart/html-piece.php`: `ContentSlots::html` wraps the value in a
// `div` under `/html/body`, a value in the JA ACM marker notation is read and written in it). An xpath of the mapping
// file (`/html/body/div/a[1]/text()`, `.../@href`, `.../p`) must name exactly one node, else the call is refused with
// `HTML_SLOT_MISSING` ("HTML slot is missing or ambiguous"); reading a piece returns the node's text (an attribute's
// value, an element's text), never the raw value written. Only the xpath forms the mapping file uses are read: element
// steps with an optional `[n]`, then `text()` (`[n]`) or `@name`. Pure.

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'col', 'embed'])
/** Elements whose end tag is implied by the next one of the same name, inside the nearest of these parents. */
const IMPLIED = { li: ['ul', 'ol'], p: ['div', 'section', 'blockquote', 'li', 'td', 'th'] }
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
const decode = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, name) => {
    if (name[0] === '#')
      return String.fromCodePoint(
        name[1] === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1))
      )
    return ENTITIES[name] ?? m
  })
const escText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')

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
    if (m.index > last) stack.at(-1).children.push({ type: 'text', text: decode(html.slice(last, m.index)) })
    last = re.lastIndex
    if (m[0].startsWith('<!--')) stack.at(-1).children.push({ type: 'raw', text: m[0] })
    else if (m[1]) {
      const name = m[1].toLowerCase()
      const at = stack.findLastIndex((n) => n.name === name)
      if (at > 0) stack.length = at
    } else {
      const attrs = [...m[3].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(
        (a) => [a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? '')]
      )
      const node = { type: 'element', name: m[2].toLowerCase(), attrs, children: [] }
      // An unclosed `li` (or `p`) ends where its next sibling opens, as an HTML parser reads it (`((li))` rows of a
      // stored list value are written without their end tags).
      const scope = IMPLIED[node.name]
      if (scope) {
        const open = stack.findLastIndex((n) => n.name === node.name)
        const fence = stack.findLastIndex((n) => scope.includes(n.name))
        if (open > 0 && open > fence) stack.length = open
      }
      stack.at(-1).children.push(node)
      if (!m[4] && !VOID.has(node.name)) stack.push(node)
    }
  }
  if (last < html.length) stack.at(-1).children.push({ type: 'text', text: decode(html.slice(last)) })
  return root
}

/** An HTML value of nodes. */
export function serializeHtml(nodes) {
  return nodes
    .map((n) => {
      if (n.type === 'text') return escText(n.text)
      if (n.type === 'raw') return n.text
      const attrs = n.attrs.map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('')
      return VOID.has(n.name)
        ? `<${n.name}${attrs}/>`
        : `<${n.name}${attrs}>${serializeHtml(n.children)}</${n.name}>`
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
