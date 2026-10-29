// A small CSS reader for the brand colour pass (`brand-colour-css.mjs`): the style rules of a stylesheet, each with the
// grouping at-rules around it (`@media`, `@supports`, `@layer`, `@container`), its selector and its declarations in order.
// Font faces, keyframes, pages and nested blocks are skipped: they paint no brand colour a visitor sees as a role.
// Strings and parentheses are respected, so a `;` or `}` inside `url(...)` or a quoted value never splits a rule.

const GROUPING = /^@(?:media|supports|layer|container|document)\b/i

/**
 * @param {string} text
 * @returns {Array<{at: string[], selector: string, decls: Array<{prop: string, value: string, important: boolean}>}>}
 */
export function cssRules(text) {
  const src = String(text ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
  const n = src.length
  const out = []
  let i = 0
  const skipString = (j) => {
    const q = src[j]
    let k = j + 1
    while (k < n && src[k] !== q) k += src[k] === '\\' ? 2 : 1
    return k + 1
  }
  /** Text up to the first of `stops` outside strings and parentheses; `i` is left on the stop. */
  const readUntil = (stops) => {
    const start = i
    let depth = 0
    while (i < n) {
      const ch = src[i]
      if (ch === '"' || ch === "'") {
        i = skipString(i)
        continue
      }
      if (ch === '(') depth += 1
      else if (ch === ')') depth = Math.max(0, depth - 1)
      else if (depth === 0 && stops.includes(ch)) break
      i += 1
    }
    return src.slice(start, i)
  }
  /** A block body from just after its `{` to its `}`, nested blocks dropped; `i` is left after the `}`. */
  const readBody = () => {
    let body = ''
    let depth = 0
    while (i < n) {
      const ch = src[i]
      if (ch === '"' || ch === "'") {
        const end = skipString(i)
        if (depth === 0) body += src.slice(i, end)
        i = end
        continue
      }
      i += 1
      if (ch === '{') depth += 1
      else if (ch === '}') {
        if (depth === 0) return body
        depth -= 1
      } else if (depth === 0) body += ch
    }
    return body
  }
  const list = (at) => {
    while (i < n) {
      while (i < n && /\s/.test(src[i])) i += 1
      if (i >= n) return
      if (src[i] === '}') {
        i += 1
        return
      }
      const prelude = readUntil('{;}').trim()
      if (i >= n) return
      if (src[i] === ';') {
        i += 1
        continue
      }
      if (src[i] === '}') {
        i += 1
        return
      }
      i += 1
      if (prelude.startsWith('@')) {
        if (GROUPING.test(prelude)) list([...at, prelude.replace(/\s+/g, ' ')])
        else readBody()
        continue
      }
      const body = readBody()
      const decls = declsOf(body)
      if (decls.length) out.push({ at, selector: prelude.replace(/\s+/g, ' '), decls })
    }
  }
  list([])
  return out
}

/** The declarations of a rule body, in order. */
function declsOf(body) {
  const parts = []
  let depth = 0
  let start = 0
  for (let k = 0; k < body.length; k += 1) {
    const ch = body[k]
    if (ch === '"' || ch === "'") {
      const q = ch
      k += 1
      while (k < body.length && body[k] !== q) k += body[k] === '\\' ? 2 : 1
    } else if (ch === '(') depth += 1
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (ch === ';' && depth === 0) {
      parts.push(body.slice(start, k))
      start = k + 1
    }
  }
  parts.push(body.slice(start))
  const decls = []
  for (const part of parts) {
    const colon = part.indexOf(':')
    if (colon < 0) continue
    const prop = part.slice(0, colon).trim()
    if (!/^-{0,2}[a-zA-Z][\w-]*$/.test(prop)) continue
    let value = part.slice(colon + 1).trim()
    const important = /!\s*important\s*$/i.test(value)
    if (important) value = value.replace(/\s*!\s*important\s*$/i, '')
    decls.push({ prop: prop.startsWith('--') ? prop : prop.toLowerCase(), value, important })
  }
  return decls
}
