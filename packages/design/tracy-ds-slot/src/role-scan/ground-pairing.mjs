/**
 * Which ground a text sits on (`index.mjs`): the background of its own stylesheet rule (or of the
 * rule its `:hover` state belongs to), a `bg-*` class beside it, or a ground set on a parent element
 * of the markup (`parent-grounds.mjs`), each read as a role. PURE apart from the import aliases it
 * reads from the template folder.
 */
import { importAliases } from './files.mjs'
import { roleOrNull } from './hints.mjs'
import { parseColour } from './literals.mjs'
import { genericRole } from './palette.mjs'
import { parentPairing } from './parent-grounds.mjs'

const BG_CLASS = /(?<=^|[\s:!])bg-(\[[^\]\s]+\]|[a-z][a-z0-9-]*)(?:\/\d+)?(?=$|[\s])/g

/**
 * @param {{ root: string, per: object[], aliasOf: Map<string, string>, roleOfVar: (name: string) => string | null,
 *   resolveHex: (name: string) => string | null, grounds: object }} input
 * @returns {{ pairOf: (f: object) => string | null, declsByRule: Map<string, object[]> }}
 */
export function groundPairing({ root, per, aliasOf, roleOfVar, resolveHex, grounds }) {
  const declsByRule = new Map()
  for (const p of per)
    for (const d of p.decls)
      declsByRule.set(`${p.file.rel}#${d.rule}`, [...(declsByRule.get(`${p.file.rel}#${d.rule}`) ?? []), d])
  // the selector of each rule, to find the ground of `.x:hover` in the rule of `.x`
  const ruleOfSelector = new Map()
  for (const [id, ds] of declsByRule)
    if (ds[0]) ruleOfSelector.set(`${id.split('#')[0]}|${ds[0].selector}`, id)
  // every rule by its selector, across files: the ground of an ancestor (`.band-ink` for `.band-ink .rule`)
  const rulesOfSelector = new Map()
  for (const [id, ds] of declsByRule)
    for (const s of (ds[0]?.selector ?? '').split(','))
      rulesOfSelector.set(s.trim(), [...(rulesOfSelector.get(s.trim()) ?? []), id])
  const fillIn = (rule) =>
    (declsByRule.get(rule) ?? []).find((d) => /^(background|background-color)$/.test(d.prop))
  /** The role of the ground under a text: a role, `?<value>` for a ground whose role is unclear, or null. */
  const pairOf = (f) => {
    if (f.rule) {
      let fill = fillIn(f.rule)
      const sel = (declsByRule.get(f.rule) ?? [])[0]?.selector ?? ''
      const plain = sel.replace(/:(hover|focus|focus-visible|focus-within|active|visited)\b/g, '')
      if (!fill && plain !== sel) fill = fillIn(ruleOfSelector.get(`${f.rule.split('#')[0]}|${plain}`))
      if (fill) return groundRole(fill.value, f.scheme) ?? `?${fill.value}`
      // a single selector whose ancestor compound paints a ground (`.band-ink .rule`, `.band-ink > p`)
      if (plain.includes(',')) return null
      const parts = plain.trim().split(/\s*>\s*|\s+/)
      for (let n = parts.length - 1; n > 0; n--) {
        const up = (rulesOfSelector.get(parts.slice(0, n).join(' ')) ?? []).map(fillIn).find(Boolean)
        if (up) return groundRole(up.value, f.scheme)
      }
      return null
    }
    if (f.classString)
      for (const m of f.classString.matchAll(BG_CLASS)) {
        const r = m[1].startsWith('[')
          ? groundRole(m[1].slice(1, -1).replace(/^color:/, ''), f.scheme)
          : (roleOfVar(`--color-${m[1]}`) ?? groundRole(m[1], f.scheme))
        if (r) return r
      }
    if (f.source === 'tailwind' && f.start !== undefined) return ancestorPair(f)
    return null
  }
  // the ground set on a PARENT element of the markup (`parent-grounds.mjs`)
  const ancestorPair = parentPairing({
    per,
    aliases: importAliases(root),
    aliasOf,
    roleOfVar: (n) => roleOfVar(n),
    resolveHex,
    groundRole: (v, scheme) => groundRole(v, scheme)
  })
  const groundRole = (raw, scheme) => {
    // theme.json reads a preset as `var:preset|color|base`
    const value = raw.replace(
      /^var:(preset|custom)\|([\w|-]+)$/,
      (_, k, p) => `var(--wp--${k}--${p.split('|').join('--')})`
    )
    // a role read is judged by the value behind it, as the original literal was: the ground's pairing
    // must not change once --write has converted it
    const ds = /^var\(\s*(--ds-c-[\w-]+)\s*(?:,\s*(.+))?\)(\s*!important)?$/s.exec(value.trim())
    if (ds) return ds[2] ? groundRole(ds[2], scheme) : roleOrNull(ds[1])
    // the template's own variable decides; a role read nested in a fallback or a gradient is not looked
    // into, exactly as the literal it replaced was not
    const v = /var\(\s*(--(?!ds-)[\w-]+)/.exec(value)
    if (v) return roleOfVar(v[1])
    const lit = parseColour(value.replace(/\s*!important$/i, ''))
    return lit && lit.alpha >= 0.9 ? genericRole({ hex: lit.hex, kind: 'fill', scheme }, grounds) : null
  }
  return { pairOf, declsByRule }
}
