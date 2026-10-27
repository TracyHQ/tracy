/**
 * Font stacks sorted by the face they name (JA Kinetic dry run, 15/10/2026: 425 stacks flagged only
 * because their selector named no component). PURE. The template's body face is the face its
 * body/html/:root (or a body-named variable) reads, its display face the one its headings read; any
 * other stack that leads with one of them takes that role. A monospace stack is code, an icon font is
 * a picture: both are kept, never a role.
 */
import { fontRoleOf, isHeadingSelector } from './hints.mjs'

const GENERIC =
  /^(serif|sans-serif|system-ui|ui-sans-serif|ui-serif|ui-rounded|-apple-system|blinkmacsystemfont|cursive|fantasy|emoji|math|fangsong|inherit|initial|unset)$/
const MONO = /mono|^monospace$|consolas|menlo|monaco|courier|sfmono|source code|fira code|ui-monospace/i
const ICON =
  /awesome|^fa$|icomoon|dashicons|material (icons|symbols)|bootstrap-icons|glyphicons|ionicons|themify|simple-line-icons|eicons|linearicons|elegant ?icons|et-line|feather/i
const ROOT = /(^|[\s,])(html|body|:root)\s*$/

/** The families of a stack, unquoted and lower-cased, `var(--x)` left as is. */
export function families(stack) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of stack.replace(/\s*!important\s*$/i, '')) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && !depth) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
    .map((s) =>
      s
        .trim()
        .replace(/^\\?["']|\\?["']$/g, '')
        .trim()
        .toLowerCase()
    )
    .filter(Boolean)
}

/**
 * The families of a stack with its variables resolved through the template's font variables.
 * @param {string} stack @param {Map<string, string>} defs font variable → its stack
 */
export function resolvedFamilies(stack, defs, seen = new Set()) {
  return families(stack).flatMap((f) => {
    const v = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/i.exec(f)
    if (!v) return [f]
    if (defs.has(v[1]) && !seen.has(v[1])) return resolvedFamilies(defs.get(v[1]), defs, seen.add(v[1]))
    return v[2] ? resolvedFamilies(v[2], defs, seen) : []
  })
}
const faceOf = (fams) => fams.find((f) => !GENERIC.test(f)) ?? null

/**
 * The template's body and display faces, from its font findings.
 * @param {{ text: string, selector?: string, name?: string }[]} fonts @param {Map<string, string>} defs
 */
export function templateFaces(fonts, defs) {
  const tally = (pred) => {
    const n = new Map()
    for (const f of fonts.filter(pred)) {
      const face = faceOf(resolvedFamilies(f.text, defs))
      if (face && !MONO.test(face)) n.set(face, (n.get(face) ?? 0) + 1)
    }
    return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const named = (f) => (f.name ? fontRoleOf(f.name) : null)
  return {
    body: tally((f) => named(f) === '--ds-font-body' || (!f.name && ROOT.test(f.selector ?? ''))),
    display: tally((f) => named(f) === '--ds-font-display' || (!f.name && isHeadingSelector(f.selector)))
  }
}

/**
 * @param {{ text: string, selector?: string, name?: string }} f
 * @param {{ body: string | null, display: string | null }} faces @param {Map<string, string>} defs
 * @returns {{ keep: string } | { role: string, why: string } | null} null: not clear
 */
export function fontRole(f, faces, defs) {
  const fams = resolvedFamilies(f.text, defs)
  const face = faceOf(fams)
  if (fams.some((x) => ICON.test(x))) return { keep: 'icon font: its glyphs are pictures, not a face role' }
  if ((face && MONO.test(face)) || (!face && fams.includes('monospace')))
    return { keep: 'monospace stack: the code face, not a body or display role' }
  const named = f.name ? fontRoleOf(f.name) : null
  if (named === '--ds-font-mono')
    return { keep: 'monospace stack: the code face, not a body or display role' }
  if (named) return { role: named, why: `font variable ${f.name}` }
  const heading = isHeadingSelector(f.selector)
  if (face && face === faces.display && face !== faces.body)
    return { role: '--ds-font-display', why: `the display face (${face})` }
  if (face && face === faces.body && face !== faces.display)
    return { role: '--ds-font-body', why: `the body face (${face})` }
  if (heading) return { role: '--ds-font-display', why: 'font stack of a heading' }
  if (ROOT.test(f.selector ?? '')) return { role: '--ds-font-body', why: 'font stack of the page' }
  if (face && face === faces.body) return { role: '--ds-font-body', why: `the body face (${face})` }
  if (!face && fams.some((x) => /sans|system-ui|apple-system/.test(x)))
    return { role: '--ds-font-body', why: 'a system sans stack' }
  return null
}
