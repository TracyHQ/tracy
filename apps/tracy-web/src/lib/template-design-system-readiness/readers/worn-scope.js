/**
 * The worn scope: rules a template writes for the time a design system is worn only.
 *
 * The slot module puts `#tracy-ds-slot` on the page only while a system is worn, so a rule whose
 * selector requires `:has(#tracy-ds-slot)` (`:root:has(#tracy-ds-slot) .x`, the WORN_RULES form
 * `:where(:root:has(#tracy-ds-slot)) .x`, `html[data-theme="dark"]:has(#tracy-ds-slot) .x`) never
 * matches on a site that wears none. What such a rule reads cannot change the default look.
 *
 * A selector is gated only when EVERY selector of its list requires the slot: `.a:has(#tracy-ds-slot),
 * .b` still styles `.b` on every site. A requirement counts only where it must hold: inside `:not()`
 * it says the opposite, and as one alternative of `:is()`/`:where()` it can be met without the slot.
 * A rule nested in a gated rule is gated; an at-rule (`@media`, `@supports`) neither gates nor ungates.
 */

const SLOT = /:has\(\s*#tracy-ds-slot\s*\)/g

/** Split at commas outside brackets. */
function topLevelParts(/** @type {string} */ s) {
  const parts = []
  let depth = 0
  let from = 0
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '(' || s[i] === '[') depth += 1
    else if (s[i] === ')' || s[i] === ']') depth -= 1
    else if (s[i] === ',' && depth === 0) {
      parts.push(s.slice(from, i))
      from = i + 1
    }
  }
  parts.push(s.slice(from))
  return parts
}

/** Whether one complex selector requires the slot at a place where the requirement must hold. */
function partRequiresSlot(/** @type {string} */ part) {
  for (const m of part.matchAll(SLOT)) {
    const at = /** @type {number} */ (m.index)
    /** @type {{ name: string, open: number }[]} */
    const stack = []
    for (let i = 0; i < at; i += 1) {
      if (part[i] === '(') stack.push({ name: /:([\w-]+)$/.exec(part.slice(0, i))?.[1] ?? '', open: i })
      else if (part[i] === ')') stack.pop()
    }
    const holds = stack.every(({ name, open }) => {
      if (name === 'not') return false
      if (name !== 'is' && name !== 'where') return true
      let depth = 0
      let close = open
      for (let i = open; i < part.length; i += 1) {
        if (part[i] === '(') depth += 1
        else if (part[i] === ')' && --depth === 0) {
          close = i
          break
        }
      }
      return topLevelParts(part.slice(open + 1, close)).length === 1
    })
    if (holds) return true
  }
  return false
}

/** Whether a selector list applies only while a system is worn. */
export const selectorGated = (/** @type {string} */ selector) =>
  topLevelParts(selector).every((p) => p.trim() !== '' && partRequiresSlot(p))

/**
 * Whether the declaration holding the text at `at` (comments already removed) sits in a rule, or
 * inside a rule, that applies only while a system is worn.
 */
export function inWornScope(/** @type {string} */ css, /** @type {number} */ at) {
  let depth = 0
  for (let i = at - 1; i >= 0; i -= 1) {
    const c = css[i]
    if (c === '}') depth += 1
    else if (c === '{') {
      if (depth > 0) {
        depth -= 1
        continue
      }
      let from = i - 1
      while (from >= 0 && css[from] !== '{' && css[from] !== '}' && css[from] !== ';') from -= 1
      const prelude = css.slice(from + 1, i).trim()
      if (!prelude.startsWith('@') && selectorGated(prelude)) return true
    }
  }
  return false
}
