// A small reader for compiled stylesheets, enough to find which declarations paint a colour: it keeps each rule's selector,
// its declarations and the @media or @supports blocks around it, in source order. Pure. It is not a validator: what it cannot
// read it skips, and the site check then measures the page itself.

/** The end of a block or a statement from `from`, stepping over strings, comments and parentheses. */
function scanTo(css, from, stops) {
  let depth = 0
  for (let i = from; i < css.length; i++) {
    const ch = css[i]
    if (ch === '"' || ch === "'") {
      for (i++; i < css.length && css[i] !== ch; i++) if (css[i] === '\\') i++
    } else if (ch === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2)
      if (end === -1) return css.length
      i = end + 1
    } else if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && stops.includes(ch)) return i
  }
  return css.length
}

const closingBrace = (css, open) => {
  let depth = 1
  let i = open + 1
  while (i < css.length) {
    const at = scanTo(css, i, '{}')
    if (at >= css.length) return css.length
    depth += css[at] === '{' ? 1 : -1
    if (depth === 0) return at
    i = at + 1
  }
  return css.length
}

const uncommented = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').trim()

/** @returns {{ prop: string, value: string, important: boolean }[]} */
export function declarationsOf(body) {
  const list = []
  let i = 0
  while (i < body.length) {
    const end = scanTo(body, i, ';')
    const text = uncommented(body.slice(i, end))
    i = end + 1
    const colon = text.indexOf(':')
    if (colon <= 0) continue
    const prop = text.slice(0, colon).trim()
    const raw = text.slice(colon + 1).trim()
    const important = /!\s*important\s*$/i.test(raw)
    list.push({
      prop: prop.startsWith('--') ? prop : prop.toLowerCase(),
      value: raw.replace(/\s*!\s*important\s*$/i, ''),
      important
    })
  }
  return list
}

const GROUPING = /^@(?:media|supports|layer|container|document)\b/i
const KEYFRAMES = /^@(?:-\w+-)?keyframes\b/i

/**
 * @param {string} css
 * @returns {{ rules: { selector: string, decls: object[], at: string[] }[], keyframes: { head: string, body: string, at: string[] }[] }}
 */
export function readRules(css) {
  const rules = []
  const keyframes = []
  const walk = (text, at) => {
    let i = 0
    while (i < text.length) {
      const stop = scanTo(text, i, '{;}')
      if (stop >= text.length) return
      const head = uncommented(text.slice(i, stop))
      if (text[stop] !== '{') {
        i = stop + 1
        continue
      }
      const close = closingBrace(text, stop)
      const body = text.slice(stop + 1, close)
      i = close + 1
      if (GROUPING.test(head)) walk(body, [...at, head])
      else if (KEYFRAMES.test(head)) keyframes.push({ head, body, at })
      else if (head && !head.startsWith('@')) rules.push({ selector: head, decls: declarationsOf(body), at })
    }
  }
  walk(css, [])
  return { rules, keyframes }
}
