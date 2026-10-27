/**
 * The two sides of a two-mode sheet written as one: a rule both sides write word for word is written once,
 * for both, and only the rules that differ keep their side's condition. PURE.
 *
 * Why: a Joomla module's content is at most MODULE_MAX_BYTES (joomla.mjs), and a two-mode template wrote
 * its whole sheet twice. JA Vital with both modes and its bands reached 88 KB (16/10/2026), while two
 * thirds of its rules (fonts, sizes, radii, every rule that reads a --ds-c-* role) are the same text on
 * both sides: only the role values and the rules built from a side's own colours differ.
 *
 * Why the page is unchanged: the merged list is a common supersequence of the two sides' rule lists (their
 * longest common subsequence, by bytes), so on each side the rules that apply are that side's own rules in
 * that side's own order. A shared rule is scoped by the root alone (`scopeCss(rule, '')`): the side's
 * condition is a :where(), which weighs nothing, and on either side of the switch it is met, so the shared
 * rule reaches the same elements at the same specificity. The OS-dark copy of a theme with an "auto" state
 * is not merged: it is written after both sides in full, as before.
 *
 * A rule both sides write alike but for its colours (a band's words: white on one side, near-black on the
 * other) is written once too, each differing colour read from a variable (`--dsv-<n>`) that each side
 * sets on the root, one variable per pair of colours. Only a declaration whose whole value is one colour
 * literal (hex, rgb(), hsl()) is replaced: such a value is valid on every browser, carries no var() that
 * would resolve on the root instead of on the element, and a custom property holding it substitutes the
 * same colour wherever it is read (it inherits, and nothing else sets a --dsv- name). Rules that set custom
 * properties (the role blocks) and rules on highlight pseudo-elements are never merged this way.
 */
import { scopeCss } from './sides.mjs'

/** A sheet's top-level rules (style rules, @media blocks, comments), each as its own text. */
export function rulesOf(css) {
  const out = []
  let i = 0
  while (i < css.length) {
    if (/\s/.test(css[i])) {
      i++
      continue
    }
    if (css.startsWith('/*', i)) {
      const end = css.indexOf('*/', i + 2)
      const stop = end < 0 ? css.length : end + 2
      out.push(css.slice(i, stop))
      i = stop
      continue
    }
    const open = css.indexOf('{', i)
    if (open < 0) {
      out.push(css.slice(i).trim())
      break
    }
    const stop = closingBrace(css, open) + 1
    out.push(css.slice(i, stop))
    i = stop
  }
  return out.filter(Boolean)
}

/** The index of the brace closing the block opened at `open`, skipping quoted text. */
function closingBrace(css, open) {
  let depth = 0
  let quote = null
  for (let i = open; i < css.length; i++) {
    const ch = css[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return i
  }
  return css.length - 1
}

const COLOUR = /^(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?)\([^()]*\))$/i
// pseudo-elements whose custom properties do not come from the element they belong to on every browser
const NO_VARS = /::(?:selection|backdrop|highlight|spelling-error|grammar-error|target-text)\b|^\s*@(?!media)/

/** Split at top-level semicolons (outside parentheses and quotes). */
function declarations(body) {
  const out = []
  let depth = 0
  let quote = null
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ';' && depth === 0) {
      out.push(body.slice(start, i))
      start = i + 1
    }
  }
  out.push(body.slice(start))
  return out
}

/**
 * A rule's shape with its whole-value colours taken out: `{ shape, colours }`, the shape holding \u0000 where
 * each colour was. A rule that cannot be shared through variables is its own shape, with no colours.
 * @param {string} rule
 */
function shapeOf(rule) {
  if (NO_VARS.test(rule)) return { shape: rule, colours: [] }
  const colours = []
  let open = true
  // the innermost blocks are the declaration blocks (a @media block holds style rules)
  const shape = rule.replace(/\{([^{}]*)\}/g, (whole, body) => {
    const parts = declarations(body).map((d) => {
      const m = /^(\s*)([\w-]+)(\s*:\s*)(.*?)(\s*!important)?(\s*)$/is.exec(d)
      if (!m) return d
      if (m[2].startsWith('--')) open = false
      if (!COLOUR.test(m[4])) return d
      colours.push(m[4])
      return `${m[1]}${m[2]}${m[3]}\u0000${m[5] ?? ''}${m[6]}`
    })
    return `{${parts.join(';')}}`
  })
  return open ? { shape, colours } : { shape: rule, colours: [] }
}

/**
 * The light and dark sheets as one list: shared rules once (root-scoped), the others under their side.
 * @param {string} light  the light side's one-look sheet
 * @param {string} dark   the dark side's one-look sheet
 * @param {{ light: string, dark: string }} sides  each side's root condition (sides.mjs sidesOf)
 * @returns {string}
 */
export function mergeSides(light, dark, sides) {
  const a = rulesOf(light)
  const b = rulesOf(dark)
  const sa = a.map(shapeOf)
  const sb = b.map(shapeOf)
  // what a pair saves: the whole rule when the text is the same, less a little per variable when only colours differ
  const gain = (x, y) =>
    a[x] === b[y]
      ? a[x].length
      : sa[x].colours.length && sa[x].shape === sb[y].shape
        ? Math.max(1, a[x].length - 40 * sa[x].colours.length)
        : 0
  // L[x][y]: the bytes the best common subsequence of a[x..] and b[y..] saves
  const L = Array.from({ length: a.length + 1 }, () => new Float64Array(b.length + 1))
  for (let x = a.length - 1; x >= 0; x--)
    for (let y = b.length - 1; y >= 0; y--) {
      const g = gain(x, y)
      L[x][y] = Math.max(L[x + 1][y], L[x][y + 1], g ? L[x + 1][y + 1] + g : 0)
    }
  const names = new Map()
  const lightVars = []
  const darkVars = []
  /** The variable that reads `l` on the light side and `d` on the dark one. */
  const varOf = (l, d) => {
    const key = `${l.toLowerCase()}|${d.toLowerCase()}`
    if (!names.has(key)) {
      const name = `--dsv-${names.size.toString(36)}`
      names.set(key, name)
      lightVars.push(`${name}:${l}`)
      darkVars.push(`${name}:${d}`)
    }
    return `var(${names.get(key)})`
  }
  const out = []
  let x = 0
  let y = 0
  while (x < a.length || y < b.length) {
    const g = x < a.length && y < b.length ? gain(x, y) : 0
    if (g && L[x][y] === L[x + 1][y + 1] + g) {
      if (a[x] === b[y]) out.push(scopeCss(a[x], ''))
      else {
        let i = 0
        const ca = sa[x].colours
        const cb = sb[y].colours
        // the shape marks each colour with \u0000 on purpose: no CSS holds it
        // oxlint-disable-next-line no-control-regex
        const text = sa[x].shape.replace(/\u0000/g, () => {
          const [l, d] = [ca[i], cb[i++]]
          return l.toLowerCase() === d.toLowerCase() ? l : varOf(l, d)
        })
        out.push(scopeCss(text, ''))
      }
      x++
      y++
    } else if (y >= b.length || (x < a.length && L[x + 1][y] >= L[x][y + 1])) {
      out.push(scopeCss(a[x++], sides.light))
    } else {
      out.push(scopeCss(b[y++], sides.dark))
    }
  }
  const vars = lightVars.length
    ? [`:root${sides.light}{${lightVars.join(';')}}`, `:root${sides.dark}{${darkVars.join(';')}}`]
    : []
  return [...vars, ...out].join('\n')
}
