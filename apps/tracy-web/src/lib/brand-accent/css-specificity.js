// Shared: the accent routes read it (accent-routes.js), so it lives in lib/ (module-graph.test.mjs).
// The specificity of one selector (Selectors Level 4): ids, then classes, attributes and pseudo-classes, then types and
// pseudo-elements. `:is()`, `:not()` and `:has()` count as their most specific argument, `:where()` as nothing. Pure; a
// selector it cannot read answers null, so no caller ever guesses an order from it.

const PSEUDO_ELEMENT_ONE_COLON = /^:(?:before|after|first-line|first-letter)\b/i

/** @param {string} text @param {number} from the index after an opening `(` @returns {number} the index of its `)` */
function closing(text, from) {
  let depth = 1
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')' && --depth === 0) return i
  }
  return -1
}

/** A selector list's selectors at its top-level commas. */
function listParts(text) {
  const parts = []
  let depth = 0
  let from = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '(' || ch === '[') depth += 1
    else if (ch === ')' || ch === ']') depth -= 1
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(from, i))
      from = i + 1
    }
  }
  parts.push(text.slice(from))
  return parts.map((p) => p.trim()).filter(Boolean)
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const greater = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

/**
 * @param {string} selector one selector, not a list
 * @returns {[number, number, number] | null}
 */
export function specificityOf(selector) {
  const text = String(selector ?? '').trim()
  if (!text) return null
  let out = [0, 0, 0]
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '#') {
      out = add(out, [1, 0, 0])
      i += 1
      while (i < text.length && /[\w-]/.test(text[i])) i += 1
    } else if (ch === '.') {
      out = add(out, [0, 1, 0])
      i += 1
      while (i < text.length && /[\w-]/.test(text[i])) i += 1
    } else if (ch === '[') {
      const end = text.indexOf(']', i)
      if (end === -1) return null
      out = add(out, [0, 1, 0])
      i = end + 1
    } else if (ch === ':') {
      const element = text[i + 1] === ':' || PSEUDO_ELEMENT_ONE_COLON.test(text.slice(i))
      let j = i + (text[i + 1] === ':' ? 2 : 1)
      const start = j
      while (j < text.length && /[\w-]/.test(text[j])) j += 1
      const name = text.slice(start, j).toLowerCase()
      let args = null
      if (text[j] === '(') {
        const end = closing(text, j + 1)
        if (end === -1) return null
        args = text.slice(j + 1, end)
        j = end + 1
      }
      if (element) out = add(out, [0, 0, 1])
      else if (name === 'where') {
        // nothing
      } else if (['is', 'not', 'has', 'matches', '-webkit-any', '-moz-any'].includes(name) && args !== null) {
        let most = null
        for (const part of listParts(args)) {
          const s = specificityOf(part)
          if (!s) return null
          if (!most || greater(s, most) > 0) most = s
        }
        if (most) out = add(out, most)
      } else if (name.startsWith('nth-') && args !== null && /\bof\b/i.test(args)) return null
      else out = add(out, [0, 1, 0])
      i = j
    } else if (/[a-z_\\-]/i.test(ch) || ch === '*') {
      const isUniversal = ch === '*'
      i += 1
      while (i < text.length && /[\w-]/.test(text[i])) i += 1
      if (!isUniversal) out = add(out, [0, 0, 1])
    } else if (/[\s>+~|]/.test(ch)) i += 1
    else return null
  }
  return out
}

/** Whether two selectors weigh the same, so their order alone decides which wins. */
export const sameSpecificity = (a, b) => {
  const x = specificityOf(a)
  const y = specificityOf(b)
  return Boolean(x && y) && greater(x, y) === 0
}

export { listParts as selectorList }
