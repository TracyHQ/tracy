// The numbers a Refero component's prose states ("padding 6px 15px", "12px vertical / 24px horizontal",
// "letter-spacing -0.2px"), read in one pass. Each reader returns what its regex in the comment above it
// captured, from the same leftmost match, or null; no length cap on a number. The regexes went back over a
// long run of digits once for each place in it (CodeQL polynomial-redos), so a number is read here only
// where it can begin, and the words around it are checked by hand.

const isDigit = (c) => c >= '0' && c <= '9'
const isSpace = (c) => c !== undefined && /\s/.test(c)
const isWordChar = (c) => c !== undefined && /\w/.test(c)
const digitsEnd = (t, i) => {
  while (isDigit(t[i])) i++
  return i
}
const spaceEnd = (t, i) => {
  while (isSpace(t[i])) i++
  return i
}
// the end of `word` (any case) when the text holds it at `i`, or -1
const wordEnd = (t, i, ...words) => {
  for (const w of words) if (t.slice(i, i + w.length).toLowerCase() === w) return i + w.length
  return -1
}

// Where `\d+(?:\.\d+)?` read at `i` can end, in the order the regex tries them (the decimals first).
const decimalEnds = (t, i) => {
  if (!isDigit(t[i])) return []
  const whole = digitsEnd(t, i)
  return t[whole] === '.' && isDigit(t[whole + 1]) ? [digitsEnd(t, whole + 1), whole] : [whole]
}
const integerEnds = (t, i) => (isDigit(t[i]) ? [digitsEnd(t, i)] : [])
// `-?\d*\.?\d+`, which reads the same numbers as `-?(?:\d+(?:\.\d+)?|\.\d+)`
const signedEnds = (t, i) => {
  const at = t[i] === '-' ? i + 1 : i
  if (isDigit(t[at])) return decimalEnds(t, at)
  return t[at] === '.' && isDigit(t[at + 1]) ? [digitsEnd(t, at + 1)] : []
}

// A match that starts inside a run of digits also starts at the run's first digit, earlier, with the same
// end: only the first digit of a run (or a sign or point, for a signed number) is a place to try.
const runStarts = function* (t) {
  for (let i = 0; i < t.length; i++) if (isDigit(t[i]) && !isDigit(t[i - 1])) yield i
}
const signedStarts = function* (t) {
  for (let i = 0; i < t.length; i++)
    if (t[i] === '-' || t[i] === '.' || (isDigit(t[i]) && !isDigit(t[i - 1]))) yield i
}
// where each match of a prefix regex (global) ends, in order
const prefixEnds = function* (t, prefix) {
  for (const m of t.matchAll(prefix)) yield m.index + m[0].length
}

/** The first of `starts` where `read(t, at)` holds a match, its captures; null when none. */
const first = (t, starts, read) => {
  for (const at of starts) {
    const caps = read(t, at)
    if (caps) return caps
  }
  return null
}

/** `/padding[:\s]*(N)px\s*(?:vertical\s*)?(?:[×x]\s*)?(N)px/i`, N a decimal: [y, x] */
export const paddingPair = (t) =>
  first(t, prefixEnds(t, /padding[:\s]*/gi), (t, at) => {
    for (const e1 of decimalEnds(t, at)) {
      let p = wordEnd(t, e1, 'px')
      if (p < 0) continue
      p = spaceEnd(t, p)
      const v = wordEnd(t, p, 'vertical')
      if (v >= 0) p = spaceEnd(t, v)
      if ('×xX'.includes(t[p] ?? '-')) p = spaceEnd(t, p + 1)
      for (const e2 of decimalEnds(t, p))
        if (wordEnd(t, e2, 'px') >= 0) return [t.slice(at, e1), t.slice(p, e2)]
    }
    return null
  })

/** `/(N)px\s*vertical\s*[×x/]\s*(N)px\s*horizontal/i` (`[×x]` without the slash for integers): [y, x] */
const verticalHorizontal = (t, ends, marks) =>
  first(t, runStarts(t), (t, at) => {
    for (const e1 of ends(t, at)) {
      let p = wordEnd(t, e1, 'px')
      if (p < 0) continue
      p = wordEnd(t, spaceEnd(t, p), 'vertical')
      if (p < 0) continue
      p = spaceEnd(t, p)
      if (!marks.includes(t[p] ?? '-')) continue
      p = spaceEnd(t, p + 1)
      for (const e2 of ends(t, p)) {
        const px = wordEnd(t, e2, 'px')
        if (px >= 0 && wordEnd(t, spaceEnd(t, px), 'horizontal') >= 0)
          return [t.slice(at, e1), t.slice(p, e2)]
      }
    }
    return null
  })

/** `/(\d+(?:\.\d+)?)px\s*vertical\s*[×x/]\s*(\d+(?:\.\d+)?)px\s*horizontal/i`: [y, x] */
export const verticalHorizontalPad = (t) => verticalHorizontal(t, decimalEnds, '×xX/')

/** `/(\d+)px\s*vertical\s*\/\s*(\d+)px\s*horizontal/i`: [y, x] */
export const verticalSlashHorizontalPad = (t) => verticalHorizontal(t, integerEnds, '/')

/** `/\bat\s*(N)(?:\s*[–-]\s*\d+)?\s*px/i`: [size] */
export const sizeAt = (t) =>
  first(t, prefixEnds(t, /\bat\s*/gi), (t, at) => {
    for (const e of decimalEnds(t, at)) {
      const p = spaceEnd(t, e)
      if ('–-'.includes(t[p] ?? '.')) {
        const d = spaceEnd(t, p + 1)
        if (isDigit(t[d]) && wordEnd(t, spaceEnd(t, digitsEnd(t, d)), 'px') >= 0) return [t.slice(at, e)]
      }
      if (wordEnd(t, p, 'px') >= 0) return [t.slice(at, e)]
    }
    return null
  })

/** `/(N)px\s+(?:text|label)/i`: [size] */
export const sizeOfLabel = (t) =>
  first(t, runStarts(t), (t, at) => {
    for (const e of decimalEnds(t, at)) {
      const p = wordEnd(t, e, 'px')
      if (p < 0) continue
      const q = spaceEnd(t, p)
      if (q > p && wordEnd(t, q, 'text', 'label') >= 0) return [t.slice(at, e)]
    }
    return null
  })

/** `/letter-spacing[:\s]*(-?\d*\.?\d+)\s*(px|em)\b/i`: [value, unit] */
export const letterSpacing = (t) =>
  first(t, prefixEnds(t, /letter-spacing[:\s]*/gi), (t, at) => {
    for (const e of signedEnds(t, at)) {
      const p = spaceEnd(t, e)
      const u = wordEnd(t, p, 'px', 'em')
      if (u >= 0 && !isWordChar(t[u])) return [t.slice(at, e), t.slice(p, u)]
    }
    return null
  })

/** `/(-?\d*\.?\d+)(em)\s+(?:tracking|letter-spacing)/i`: [value, unit] */
export const emTracking = (t) =>
  first(t, signedStarts(t), (t, at) => {
    for (const e of signedEnds(t, at)) {
      const u = wordEnd(t, e, 'em')
      if (u < 0) continue
      const q = spaceEnd(t, u)
      if (q > u && wordEnd(t, q, 'tracking', 'letter-spacing') >= 0) return [t.slice(at, e), t.slice(e, u)]
    }
    return null
  })

/** `/(N)px\s*(?:border-)?radius/i`: [radius] */
export const radiusAfter = (t) =>
  first(t, runStarts(t), (t, at) => {
    for (const e of decimalEnds(t, at)) {
      const p = wordEnd(t, e, 'px')
      if (p < 0) continue
      const q = spaceEnd(t, p)
      const b = wordEnd(t, q, 'border-')
      if ((b >= 0 && wordEnd(t, b, 'radius') >= 0) || wordEnd(t, q, 'radius') >= 0) return [t.slice(at, e)]
    }
    return null
  })

/** `/radius[:\s]*(?:of\s*)?(N)px/i`: [radius] */
export const radiusBefore = (t) =>
  first(t, prefixEnds(t, /radius[:\s]*(?:of\s*)?/gi), (t, at) => {
    for (const e of decimalEnds(t, at)) if (wordEnd(t, e, 'px') >= 0) return [t.slice(at, e)]
    return null
  })
