/**
 * The element tree of one markup or component file (Astro, TSX/JSX, PHP, HTML, Vue), read without a
 * parser dependency: enough to tell which element a class sits on, its parent elements, and what each
 * element's class attribute holds. PURE.
 *
 * Conservative by design: what cannot be read statically is said so (`detached`, `unknown`), never
 * guessed. An element built into a variable (`const mock = <div>…`) is `detached`: where it is drawn
 * is decided at run time, so the element around it in the file is not its parent.
 */

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
])

/**
 * @typedef {{ index: number, name: string, start: number, openEnd: number, closeEnd: number,
 *   parent: number, attrs: string, attrsAt: number }} Element
 * `openEnd` is the offset after the open tag's `>`; `closeEnd` the offset after its close tag (-1 when
 * the file never closes it); `parent` the index of the enclosing element, -1 at the top.
 */

/** @param {string} text @returns {Element[]} */
export function elementTree(text) {
  const front = /^\s*---\r?\n[\s\S]*?\r?\n---[^\n]*(\n|$)/.exec(text)
  const els = []
  const stack = []
  const top = () => (stack.length ? stack[stack.length - 1] : -1)
  let i = front ? front[0].length : 0
  while (i < text.length) {
    if (text[i] !== '<') {
      i++
      continue
    }
    if (text.startsWith('<!--', i)) {
      const e = text.indexOf('-->', i + 4)
      i = e === -1 ? text.length : e + 3
      continue
    }
    if (text[i + 1] === '?') {
      const e = text.indexOf('?>', i + 2)
      i = e === -1 ? text.length : e + 2
      continue
    }
    const close = /^<\/([A-Za-z][\w.:-]*)?\s*>/.exec(text.slice(i, i + 120))
    if (close) {
      const name = close[1] ?? ''
      let k = stack.length - 1
      while (k >= 0 && els[stack[k]].name !== name) k--
      if (k !== -1) {
        for (let j = stack.length - 1; j >= k; j--) els[stack[j]].closeEnd = i + close[0].length
        stack.length = k
      }
      i += close[0].length
      continue
    }
    const open = /^<([A-Za-z][\w.:-]*)?/.exec(text.slice(i, i + 120))
    const name = open?.[1] ?? ''
    if ((name || text[i + 1] === '>') && tagCanStart(text, i)) {
      const end = name ? openTagEnd(text, i + open[0].length) : i + 1
      if (end !== -1) {
        const self = text[end - 1] === '/'
        const el = {
          index: els.length,
          name,
          start: i,
          openEnd: end + 1,
          closeEnd: self ? end + 1 : -1,
          parent: top(),
          attrs: text.slice(i + open[0].length, self ? end - 1 : end),
          attrsAt: i + open[0].length
        }
        els.push(el)
        if (!self && !VOID.has(name.toLowerCase())) stack.push(el.index)
        else el.closeEnd = end + 1
        i = end + 1
        continue
      }
    }
    i++
  }
  return els
}

/** A `<` after an identifier or `)` is a TypeScript generic (`useState<string>`), not a tag; after a keyword it is. */
function tagCanStart(text, at) {
  let p = at - 1
  while (p >= 0 && /\s/.test(text[p])) p--
  if (p < 0 || !/[\w$.)\]]/.test(text[p])) return true
  // `return <div>`: a keyword, not a type name, before the tag
  return /(^|[^\w$.])(return|yield|else|case|default|do|in|of)$/.test(text.slice(Math.max(0, p - 8), p + 1))
}

/** Offset of the `>` that ends an open tag, outside quotes and `{…}` expressions; -1 when none near. */
function openTagEnd(text, from) {
  let depth = 0
  let quote = ''
  const limit = Math.min(text.length, from + 8000)
  for (let i = from; i < limit; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
      continue
    }
    if (text.startsWith('<?', i)) {
      const e = text.indexOf('?>', i + 2)
      if (e === -1) return -1
      i = e + 1
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch
    else if (ch === '{') depth++
    else if (ch === '}') depth = Math.max(0, depth - 1)
    else if (ch === '>' && depth === 0) return i
    else if (ch === '<' && depth === 0 && /[A-Za-z/]/.test(text[i + 1] ?? '')) return -1
  }
  return -1
}

/** The element whose open tag holds the offset, or null. */
export function elementAt(els, offset) {
  let best = null
  for (const el of els) if (el.start <= offset && offset < el.openEnd) best = el
  return best
}

/** The innermost element whose CONTENT holds the offset (a `{children}` inside it), or null. */
export function elementAround(els, offset) {
  let best = null
  for (const el of els)
    if (el.openEnd <= offset && (el.closeEnd === -1 || offset < el.closeEnd))
      if (!best || el.start > best.start) best = el
  return best
}

/**
 * The element is built into a variable (`const x = <div>…`, `x = cond ? (<a/>) : …`): the element
 * around it in the file is not where it is drawn.
 * @param {string} text @param {Element[]} els @param {Element} el
 */
export function isDetached(text, els, el) {
  const from = el.parent === -1 ? 0 : els[el.parent].openEnd
  const siblings = els.filter(
    (s) => s.parent === el.parent && s.start >= from && s.start < el.start && s.closeEnd > 0
  )
  const opens = []
  let quote = ''
  // the last character that can end a statement, for semicolon-free code (a newline then ends one)
  let last = ''
  for (let i = from; i < el.start; i++) {
    const sib = siblings.find((s) => s.start === i)
    if (sib) {
      i = sib.closeEnd - 1
      last = '>'
      continue
    }
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) {
        quote = ''
        last = ch
      }
      continue
    }
    const top = opens[opens.length - 1]
    if (ch === '"' || ch === "'" || ch === '`') quote = ch
    else if (ch === '{' || ch === '(' || ch === '[') opens.push({ ch, at: i, stmt: i + 1 })
    else if (ch === '}' || ch === ')' || ch === ']') opens.pop()
    else if (ch === ';' && top) top.stmt = i + 1
    else if (ch === '\n' && top?.ch === '{' && /[\w$)\]}"'`>]/.test(last)) top.stmt = i + 1
    if (!/\s/.test(ch)) last = ch
  }
  const block = [...opens].reverse().find((o) => o.ch === '{')
  if (!block) return false
  const statement = text.slice(block.stmt, el.start)
  return /^\s*(?:(?:const|let|var)\s+[\w${}[\],\s]+?|[\w$.]+)\s*=(?![=>])/.test(statement)
}
