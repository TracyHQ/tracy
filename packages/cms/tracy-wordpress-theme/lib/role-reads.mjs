/**
 * Role reads of a target's root look: `theme.config.json` `roleReads` maps some of the 56 contract
 * tokens (`--bg`, `--radius-pill`, `--font-body`…) to the standard design-system role variable that
 * plays the same part (`--ds-c-bg`, `--ds-pill-radius`, `--ds-font-body`, the one list in
 * `@tracy/ds-slot` `role-variables.mjs`). Before the root variation is made, each mapped token's
 * value becomes `var(<role>, <the token's own value>)`: undefined until a design system is worn, so
 * the theme's default look is unchanged, and once one is worn its value reaches every reader of the
 * WordPress variable (`--wp--preset--color--bg`, `--wp--custom--radius--pill`) at once.
 *
 * A token whose literal plays no role (a shadow's tint, say) is mapped to `{ "keep": "<reason>" }`
 * instead: its value gains the scanner's manual keep marker as a CSS comment
 * (`0 12px 32px rgba(…) /* ds-keep: <reason> *\/`), which WordPress prints into the variable as it
 * is and every browser ignores. theme.json has no comments of its own, so this is the one way the
 * packaging role scan can be told that literal is kept on purpose.
 *
 * A token that is a shadow or an outline drawn in one colour (`--focus-ring: 0 0 0 4px <colour>`)
 * is mapped to `{ "colour": "<role>" }`: only its colour expression (the last top-level colour in
 * the value) reads the role, the geometry stays the token's own.
 *
 * Every look a target ships is rewritten with its own values as the fallbacks: the root look (its
 * theme.json and `styles/<root>.json`) and each style variation it lists (Tracy Base's Airbnb), so a
 * worn design system reaches the site whichever style the owner picked. The editor keeps plain colours: see
 * `src/tracy/inc/role-reads.php`, which hands the block and site editors the fallback of each palette
 * entry (their colour pickers parse the raw value). PURE.
 */
import { isRoleVariable } from '../../../design/tracy-ds-slot/src/role-variables.mjs'
import { TOKEN_NAMES } from './variation.mjs'

/**
 * The `roleReads` of a theme.config.json, checked: an object of contract token → role variable,
 * → `{ keep: <reason> }` or → `{ colour: <role variable> }`.
 * @param {unknown} value - the config's `roleReads` (absent: null)
 * @param {string} label - for the error message
 * @returns {Record<string, string | { keep: string } | { colour: string }> | null}
 */
export function roleReadsOf(value, label) {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label}: roleReads must be an object of contract token -> role variable`)
  for (const [token, role] of Object.entries(value)) {
    if (!TOKEN_NAMES.includes(token))
      throw new Error(`${label}: roleReads names ${token}, which is not one of the 56 contract tokens`)
    const obj = role && typeof role === 'object' && !Array.isArray(role) ? role : null
    if (obj && obj.colour !== undefined) {
      if (typeof obj.colour !== 'string' || !isRoleVariable(obj.colour) || Object.keys(obj).length !== 1)
        throw new Error(`${label}: roleReads ${token} colour needs one standard role variable`)
      continue
    }
    const keep = obj ? obj.keep : undefined
    if (keep !== undefined) {
      if (typeof keep !== 'string' || !keep.trim() || /\*\//.test(keep) || Object.keys(role).length !== 1)
        throw new Error(`${label}: roleReads ${token} keep needs one reason (no comment end in it)`)
      continue
    }
    if (typeof role !== 'string' || !isRoleVariable(role))
      throw new Error(
        `${label}: roleReads ${token} -> ${JSON.stringify(role)} is not a standard role variable`
      )
  }
  return { ...value }
}

/** A colour expression at the top level of a value: a hex, a named colour function or a var(). */
const COLOUR_START =
  /^(#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|var)\()/i

/**
 * The value with its last top-level colour expression read through `role`, or null when it has none.
 * @param {string} value @param {string} role
 * @returns {string | null}
 */
export function withColourRole(value, role) {
  let depth = 0
  let last = null
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (depth === 0 && (i === 0 || /[\s,]/.test(value[i - 1]))) {
      const m = value.slice(i).match(COLOUR_START)
      if (m) {
        let end = i + m[0].length
        if (m[0].endsWith('(')) {
          for (let d = 1; end < value.length && d > 0; end++)
            d += value[end] === '(' ? 1 : value[end] === ')' ? -1 : 0
        }
        last = [i, end]
        i = end - 1
        continue
      }
    }
    if (c === '(') depth++
    else if (c === ')') depth--
  }
  if (!last) return null
  const [a, b] = last
  return `${value.slice(0, a)}var(${role}, ${value.slice(a, b)})${value.slice(b)}`
}

/**
 * The tokens with each mapped value read through its role, the token's own value as the fallback.
 * @param {Record<string, string>} tokens - name -> value, as tokensOf() reads them
 * @param {Record<string, string | { keep: string } | { colour: string }> | null} map - roleReadsOf()
 * @param {string} label - for the error message
 * @returns {Record<string, string>}
 */
export function withRoleReads(tokens, map, label) {
  if (!map) return tokens
  const out = { ...tokens }
  for (const [token, role] of Object.entries(map)) {
    const value = tokens[token]
    if (typeof value !== 'string')
      throw new Error(`${label}: roleReads ${token} has no value to fall back to`)
    if (/^var\(\s*--ds-/.test(value) || value.includes('ds-keep:'))
      throw new Error(`${label}: ${token} already reads a role (${value}); drop it from roleReads`)
    if (typeof role === 'string') out[token] = `var(${role}, ${value})`
    else if ('colour' in role) {
      const read = withColourRole(value, role.colour)
      if (read === null) throw new Error(`${label}: roleReads ${token} has no colour in ${value}`)
      out[token] = read
    } else out[token] = `${value} /* ds-keep: ${role.keep} */`
  }
  return out
}
