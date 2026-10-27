/**
 * The pairing of a light text in markup with the ground set on a PARENT element (gap 1, 15/10/2026):
 * the walk itself is `ground.mjs`; this decides what a found ground means for the text. Only the
 * grounds a text role is named after (ink, accent, accent band) pair, and only when the text stands
 * out on them (contrast 3:1); any other ground keeps the palette's reading, and a ground the walk
 * could not read comes back as `~<why>` for the flag message.
 */
import { contrast } from '../colour.mjs'
import { groundFinder } from './ground.mjs'
import { colourRoleOfName, roleOrNull } from './hints.mjs'
import { parseColour } from './literals.mjs'
import { lumOf } from './palette.mjs'

const PAIRING = new Set(['--ds-c-ink', '--ds-c-accent', '--ds-c-accent-hover', '--ds-c-accent-band'])
const FILL_ROLE =
  /^--ds-c-(bg|surface|surface-warm|surface-hover|ink|accent|accent-hover|accent-active|accent-band)$/

/**
 * @param {{ per: { file: { rel: string, kind: string }, text: string, decls: object[] }[], aliases: Record<string, string>,
 *   aliasOf: Map<string, string>, roleOfVar: (n: string) => string | null, resolveHex: (n: string) => string | null,
 *   groundRole: (value: string, scheme: string) => string | null }} o
 * @returns {(f: object) => string | null} a role, `~<why>`, or null
 */
export function parentPairing({ per, aliases, aliasOf, roleOfVar, resolveHex, groundRole }) {
  // a variable whose own role is split (`--color-signal`: accent fill AND accent text) still has one
  // role AS A GROUND when the variables renaming it name exactly one ground role (`--color-primary`)
  const fillRoleByAlias = (name) => {
    const names = []
    const add = (n, depth = 0) => {
      for (const [alias, of] of aliasOf)
        if (of === n && depth < 8 && !names.includes(alias)) {
          names.push(alias)
          add(alias, depth + 1)
        }
    }
    add(name)
    const roles = new Set(
      names.map((a) => roleOrNull(colourRoleOfName(a, 0.5, 'fill'))).filter((r) => r && FILL_ROLE.test(r))
    )
    return roles.size === 1 ? [...roles][0] : null
  }
  const fallbackHex = (v) =>
    parseColour(/,\s*([^()]+|(?:rgba?|hsla?)\([^()]*\))\s*\)\s*$/.exec(v)?.[1] ?? '')?.hex ?? null
  const hexOfValue = (v) => {
    const ref = /^var\(\s*(--[\w-]+)/.exec(v.trim())
    if (ref) return resolveHex(ref[1]) ?? fallbackHex(v)
    return parseColour(v.replace(/\s*!important$/i, ''))?.hex ?? null
  }
  // single-class rules of the stylesheets that paint a ground (`.band-ink { background: … }`)
  const cssBg = new Map()
  for (const p of per)
    for (const d of p.decls)
      if (
        /^\.[\w-]+$/.test(d.selector) &&
        d.scheme === 'light' &&
        /^(background|background-color)$/.test(d.prop)
      )
        cssBg.set(d.selector.slice(1), d.value)
  const findGround = groundFinder({
    texts: new Map(
      per.filter((p) => ['markup', 'script'].includes(p.file.kind)).map((p) => [p.file.rel, p.text])
    ),
    aliases,
    cssBg,
    bgOf: (value, scheme) => {
      if (value.startsWith('[')) {
        const v = value
          .slice(1, -1)
          .replace(/^color:/, '')
          .replace(/_/g, ' ')
        return { role: groundRole(v, scheme), hex: hexOfValue(v) }
      }
      if (/[\s(#]/.test(value)) return { role: groundRole(value, scheme), hex: hexOfValue(value) }
      return {
        role:
          roleOfVar(`--color-${value}`) ?? fillRoleByAlias(`--color-${value}`) ?? groundRole(value, scheme),
        hex: resolveHex(`--color-${value}`) ?? parseColour(value)?.hex ?? null
      }
    }
  })
  return (f) => {
    const g = findGround(f.file, f.start, f.scheme)
    if (!g) return null
    if (g.unknown) return `~${g.unknown}`
    if (!PAIRING.has(g.role)) return null
    if (f.hex && g.hex ? (contrast(f.hex, g.hex) ?? 0) < 3 : f.hex && lumOf(f.hex) < 0.4) return null
    return g.role
  }
}
