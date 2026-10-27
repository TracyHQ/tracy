/**
 * The style rules of a stylesheet, flat: each with its selector, its declarations and the
 * at-rules (`@media (prefers-color-scheme: dark)`, `@supports …`) it sits in. Enough for the logo
 * rules to ask "which rule sizes or recolours a logo" (LOGO-2, LOGO-3); not a CSS engine: it does
 * not know which rule wins.
 */

/**
 * @typedef {{ selector: string, body: string, within: string[] }} CssRule
 */

/**
 * @param {string} css
 * @returns {CssRule[]}
 */
export function cssRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  /** @type {CssRule[]} */
  const rules = []
  /** @type {string[]} */
  const within = []
  let start = 0
  let quote = null
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === ';' && text.slice(start, i).trim().startsWith('@')) start = i + 1
    else if (c === '{') {
      const head = text.slice(start, i).trim()
      if (head.startsWith('@')) {
        within.push(head)
        start = i + 1
        continue
      }
      // A style rule: its body runs to the matching close (nested rules are read flat into it).
      let depth = 1
      let j = i + 1
      for (; j < text.length && depth > 0; j += 1) {
        if (text[j] === '{') depth += 1
        else if (text[j] === '}') depth -= 1
      }
      rules.push({ selector: head, body: text.slice(i + 1, j - 1), within: [...within] })
      i = j - 1
      start = j
    } else if (c === '}') {
      within.pop()
      start = i + 1
    }
  }
  return rules
}

/** A selector or at-rule that applies only in dark mode. */
export const DARK_CONTEXT =
  /\[data-(?:bs-)?theme\s*=\s*["']?dark["']?\]|(?:^|[\s,>+~(])(?:html|body)?\.(?:dark|dark-mode|is-dark|theme-dark)\b|prefers-color-scheme\s*:\s*dark/i

/** Whether a rule applies only in dark mode. */
export const inDarkMode = (/** @type {CssRule} */ r) =>
  DARK_CONTEXT.test(r.selector) || r.within.some((w) => DARK_CONTEXT.test(w))
