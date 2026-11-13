// The untouched parts of a stored HTML value (ticket #597): what the read back of a draft write compares around the
// pieces it wrote. The HTML piece functions read a value, change one node and write the whole value back; a fault in
// them (an entity escaped twice, a sibling dropped, a paragraph closed in the wrong place) changes nodes the write never
// named, and comparing the written node alone would never see it. This reader is the step's own, apart from the
// functions it checks: it reads both values into elements and words (every character reference read, white space
// as written), leaves out every element a piece of the write names, and the read back holds the two to be equal.
// Pure.
import { decodeEntities } from './draft-write-entities.mjs'

const VOID = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr', 'area', 'col', 'embed'])
const P_CLOSERS = new Set(
  'address article aside blockquote details dialog div dl fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr main menu nav ol p pre section table ul'.split(
    ' '
  )
)
const TOKEN =
  /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g

/** The element tree of a value, wrapped as the piece functions wrap it (`/html/body/div`). */
function treeOf(html) {
  const root = { name: 'div', attrs: [], children: [] }
  const stack = [root]
  const close = (name, fence) => {
    const open = stack.findLastIndex((n) => n.name === name)
    if (open > 0 && open > stack.findLastIndex((n) => fence.includes(n.name))) stack.length = open
  }
  let last = 0
  const re = new RegExp(TOKEN.source, 'g')
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m.index > last) stack.at(-1).children.push({ text: decodeEntities(html.slice(last, m.index)) })
    last = re.lastIndex
    if (m[1]) {
      const at = stack.findLastIndex((n) => n.name === m[1].toLowerCase())
      if (at > 0) stack.length = at
    } else if (m[2]) {
      const name = m[2].toLowerCase()
      if (name === 'li') close('li', ['ul', 'ol'])
      if (P_CLOSERS.has(name)) close('p', ['td', 'th', 'table', 'button'])
      const attrs = [...m[3].matchAll(ATTR)].map(
        (a) => `${a[1].toLowerCase()}=${decodeEntities(a[2] ?? a[3] ?? a[4] ?? '')}`
      )
      const node = { name, attrs: attrs.sort(), children: [] }
      stack.at(-1).children.push(node)
      if (!VOID.has(name) && !m[0].endsWith('/>')) stack.push(node)
    }
  }
  if (last < html.length) stack.at(-1).children.push({ text: decodeEntities(html.slice(last)) })
  return root
}

/** The element an xpath of a piece names (`/html/body/div/ul/li[2]/a/text()` is `ul[1]/li[2]/a[1]`). */
export function elementStepsOf(xpath) {
  const steps = String(xpath ?? '')
    .split('/')
    .filter(Boolean)
    .slice(3)
    .filter((s) => !/^(text\(\)|@)/.test(s))
  return steps.map((s) => {
    const m = /^([a-zA-Z][\w-]*)(?:\[(\d+)\])?$/.exec(s)
    return m ? `${m[1].toLowerCase()}[${m[2] ?? 1}]` : s
  })
}

/**
 * Every element and word of a value outside the elements `masks` names (step lists), in document order; an element of
 * `drops` (taken out by the write) leaves no trace at all.
 */
export function restOf(html, masks, drops = []) {
  const keys = new Set(masks.map((m) => m.join('/')))
  const gone = new Set(drops.map((m) => m.join('/')))
  const out = []
  // `path` names an element as the masks do (its place in this value); `shown` as the other value names it, every
  // dropped sibling left out of the count.
  const walk = (node, path, shown) => {
    const seen = {}
    const kept = {}
    for (const child of node.children) {
      if (child.text !== undefined) {
        out.push(`${shown.join('/')}#${child.text}`)
        continue
      }
      seen[child.name] = (seen[child.name] ?? 0) + 1
      const at = [...path, `${child.name}[${seen[child.name]}]`]
      if (gone.has(at.join('/'))) continue
      kept[child.name] = (kept[child.name] ?? 0) + 1
      const as = [...shown, `${child.name}[${kept[child.name]}]`]
      if (keys.has(at.join('/'))) {
        out.push(`${as.join('/')} (written)`)
        continue
      }
      out.push(`${as.join('/')} ${child.attrs.join(' ')}`)
      walk(child, at, as)
    }
  }
  walk(treeOf(String(html ?? '')), [], [])
  return out
}

/** Element steps after an element of the same parent and name before them was taken out. */
export function movedAfterRemove(steps, removed) {
  if (removed.length === 0 || steps.length < removed.length) return steps
  const head = (x) => x.slice(0, -1).join('/')
  const nameOf = (x) => x.replace(/\[\d+\]$/, '')
  const rankOf = (x) => Number(/\[(\d+)\]$/.exec(x)[1])
  const at = removed.length - 1
  if (head(removed) !== head(steps.slice(0, removed.length))) return steps
  if (nameOf(steps[at]) !== nameOf(removed[at]) || rankOf(steps[at]) <= rankOf(removed[at])) return steps
  return [...steps.slice(0, at), `${nameOf(steps[at])}[${rankOf(steps[at]) - 1}]`, ...steps.slice(at + 1)]
}
