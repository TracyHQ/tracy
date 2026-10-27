/**
 * Declarations of a stylesheet (CSS, SCSS, LESS, compiled or not) with where each one sits: the
 * selector and at-rules around it, the side (light or dark) it paints, and the offset of its value in
 * the file, so a rewrite replaces exactly the characters it read. PURE, no CSS parser dependency:
 * a template's stylesheet is often not valid CSS (SCSS nesting, LESS mixins, a compiled file of 400 kB
 * on one line), and all this needs is `prop: value` and the braces around it.
 */

// the dark side's hooks: an attribute (`[data-theme=dark]`, Bootstrap's `[data-bs-theme=dark]`), a
// class on the root (`.dark`, T4's `html.t4-dark`, WordPress's `.is-dark-theme`) or the media query.
// A class that only contains the word (`.dark-header`, `.bg-dark`, `.text-dark`) is not the side.
const DARK =
  /\[data-(?:bs-)?(?:theme|color-scheme|color-mode|mode)\s*=\s*["']?dark["']?\s*\]|\.(?:dark|t4-dark|theme-dark|dark-mode|dark-theme|is-dark-theme|mode-dark)(?![\w-])|prefers-color-scheme\s*:\s*dark/i

/** `:not(…)` (nested parentheses included) blanked: `html:not(.t4-dark)` is the LIGHT side. */
const withoutNot = (prelude) => {
  let out = ''
  for (let i = 0; i < prelude.length; i++) {
    if (prelude.startsWith(':not(', i)) {
      let d = 0
      let j = i + 4
      for (; j < prelude.length; j++) {
        if (prelude[j] === '(') d++
        else if (prelude[j] === ')' && --d === 0) break
      }
      i = j
      continue
    }
    out += prelude[i]
  }
  return out
}

/** The prelude (selector or at-rule) paints the dark side. */
export const isDarkPrelude = (prelude) => DARK.test(withoutNot(prelude))

/**
 * @typedef {{ prop: string, value: string, start: number, end: number, selector: string,
 *   atRules: string[], scheme: 'light' | 'dark', rule: number }} Declaration
 * `start`/`end` are offsets of the value inside the text given; `rule` numbers the block it sits in,
 * so two declarations of one rule can be paired (text on its own fill).
 */

/**
 * @param {string} text
 * @param {{ base?: number, lineComments?: boolean, selector?: string }} [opts]
 *   base: offset added to every `start`/`end` (a `<style>` block inside a markup file);
 *   lineComments: `//` starts a comment (SCSS, LESS); selector: the context of an inline style
 * @returns {Declaration[]}
 */
export function declarationsOf(text, opts = {}) {
  const base = opts.base ?? 0
  const out = []
  /** @type {{ prelude: string, rule: number }[]} */
  const stack = opts.selector ? [{ prelude: opts.selector, rule: 0 }] : []
  // SCSS/LESS `// …` before a property or a selector: blanked (same length), never read as either
  const blankLineComments = (seg) =>
    opts.lineComments
      ? seg.replace(/(^|[^:(])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length))
      : seg
  let ruleCount = 0
  let segStart = 0
  let depth = 0
  let quote = ''
  const flush = (end) => {
    // a comment before the property (`/* source: normal; … */ border: …`) is blanked, not read: its
    // own colon is not the declaration's
    const seg = blankLineComments(
      text.slice(segStart, end).replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    )
    const colon = topColon(seg)
    if (colon === -1) return
    const prop = seg.slice(0, colon).trim()
    if (!/^(--[\w-]+|[$@][\w-]+|-?[a-z][a-z-]*)$/i.test(prop)) return
    let vs = colon + 1
    while (vs < seg.length && /\s/.test(seg[vs])) vs++
    let ve = seg.length
    while (ve > vs && /\s/.test(seg[ve - 1])) ve--
    const value = seg.slice(vs, ve)
    if (!value) return
    const pre = stack.map((s) => s.prelude)
    out.push({
      prop: prop.toLowerCase().startsWith('--') ? prop : prop.toLowerCase(),
      value,
      start: base + segStart + vs,
      end: base + segStart + ve,
      selector: joinSelectors(pre.filter((p) => !p.startsWith('@'))),
      atRules: pre.filter((p) => p.startsWith('@')),
      scheme: pre.some(isDarkPrelude) ? 'dark' : 'light',
      rule: stack.length ? stack[stack.length - 1].rule : 0
    })
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2)
      i = close === -1 ? text.length : close + 1
      continue
    }
    if (opts.lineComments && ch === '/' && text[i + 1] === '/' && depth === 0 && text[i - 1] !== ':') {
      const nl = text.indexOf('\n', i)
      i = nl === -1 ? text.length : nl
      continue
    }
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (depth) continue
    if (ch === '{') {
      if (text[i - 1] === '#') continue // SCSS interpolation #{…}
      const prelude = blankLineComments(text.slice(segStart, i).replace(/\/\*[\s\S]*?\*\//g, ''))
        .replace(/\s+/g, ' ')
        .trim()
      stack.push({ prelude, rule: ++ruleCount })
      segStart = i + 1
    } else if (ch === '}') {
      flush(i)
      stack.pop()
      segStart = i + 1
    } else if (ch === ';') {
      flush(i)
      segStart = i + 1
    }
  }
  flush(text.length)
  return out
}

/** Offset of the first `:` outside parentheses and brackets, or -1 (a selector `a:hover` has no value). */
function topColon(seg) {
  let d = 0
  for (let i = 0; i < seg.length; i++) {
    const ch = seg[i]
    if (ch === '(' || ch === '[') d++
    else if (ch === ')' || ch === ']') d--
    else if (ch === ':' && d === 0) return i
  }
  return -1
}

/** Nested selectors (SCSS `&`) joined into the selector they compile to, roughly: for reading only. */
function joinSelectors(list) {
  return list.reduce((acc, s) => {
    if (!acc) return s
    return s.includes('&') ? s.replace(/&/g, acc) : `${acc} ${s}`
  }, '')
}

/**
 * Every `<style>` block and `style="…"` attribute of a markup file (Astro, HTML, PHP, Vue, JSX string
 * styles), as declarations with offsets into the whole file.
 * @param {string} text
 * @returns {Declaration[]}
 */
export function markupDeclarations(text) {
  const out = []
  for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const at = m.index + m[0].indexOf('>') + 1
    out.push(...declarationsOf(m[1], { base: at }))
  }
  for (const m of text.matchAll(/<([a-z][\w-]*)\b([^<>]*?)\sstyle\s*=\s*(["'])([^"']*?)\3/gi)) {
    const at = m.index + m[0].length - 1 - m[4].length
    const cls = /class(?:Name)?\s*=\s*["']([^"']*)/.exec(m[2])
    out.push(...declarationsOf(m[4], { base: at, selector: `<${m[1]}${cls ? ` .${cls[1].trim()}` : ''}>` }))
  }
  return out
}

/** Line starts of a text, for offset → 1-based line. */
export function lineIndex(text) {
  const starts = [0]
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1)
  return (offset) => {
    let lo = 0
    let hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}
