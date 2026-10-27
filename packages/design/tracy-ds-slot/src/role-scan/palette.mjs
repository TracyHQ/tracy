/**
 * The template's palette, read from its own sources, and the role each colour plays (Akemi's roadmap
 * step 4, 15/10/2026). PURE. A colour's role comes from how the template USES it, never from the hex
 * alone: the same white is the card in `background` and the words on a button in `color`.
 *
 * - `pageGrounds`: the page ground of each side (light, dark), against which text and fills are read;
 * - `genericRole`: the role of one painted literal from what it paints, its ground, its saturation;
 * - `templateVarRoles`: the role of each of the template's OWN colour variables (`--color-forest`),
 *   from its name, the names of the variables that rename it, and how its uses paint (votes).
 */
import { chromaOf, SATURATED } from '../auto-palette.mjs'
import { contrast, distance, luminance, parseHex } from '../colour.mjs'
import { colourRoleOfName, isComponentVar, isHeadingSelector, statusOf, statusRole } from './hints.mjs'
import { isPageGroundName } from './page-ground.mjs'
import { darkPanels, panelFamilyRole } from './dark-panels.mjs'

const c = (r) => `--ds-c-${r}`
export const lumOf = (hex) => luminance(parseHex(hex) ?? { r: 0, g: 0, b: 0 })
const isHover = (sel) => /:hover|:focus(?!-)|hover:/i.test(sel ?? '')
const isActive = (sel) => /:active|\.active\b|active:/i.test(sel ?? '')

/**
 * @param {{ name: string, hex: string, scheme: string, role: string | null }[]} defs  colour variables
 * @param {{ kind: string, hex: string, selector: string, scheme: string }[]} fills  literal fills
 * @param {{ light?: string | null, dark?: string | null }} [root] what body/html/:root paint
 * @returns {{ light: string, dark: string }}
 */
export function pageGrounds(defs, fills, root = {}) {
  const pick = (scheme) => {
    // what body/html/:root paint (`page-ground.mjs`) first; a variable only when it names the page
    if (root[scheme]) return root[scheme]
    const own = defs.filter(
      (d) => d.scheme === scheme && d.role === c('bg') && d.hex && d.alpha >= 0.9 && isPageGroundName(d.name)
    )
    const named = (re) => own.find((d) => re.test(d.name))
    const byName = named(/page/) ?? own[0]
    if (byName) return byName.hex
    const body = fills.find((f) => f.scheme === scheme && /(^|[\s,])(html|body)\s*$/.test(f.selector ?? ''))
    if (body) return body.hex
    const counts = new Map()
    for (const f of fills.filter((x) => x.scheme === scheme && chromaOf(x.hex) < SATURATED))
      counts.set(f.hex, (counts.get(f.hex) ?? 0) + 1)
    const top = [...counts].sort((a, b) => b[1] - a[1]).find(([h]) => (scheme === 'dark') === lumOf(h) < 0.2)
    return top ? top[0] : scheme === 'dark' ? '#111111' : '#ffffff'
  }
  return { light: pick('light'), dark: pick('dark') }
}

/**
 * Role of one painted colour from what it paints, or null when its role is not clear.
 * @param {{ hex: string, kind: string, selector?: string, scheme?: string, pair?: string | null }} o
 *   pair: the role of the fill the same rule or element paints (text on its own ground)
 * @param {{ light: string, dark: string, accents?: string[] }} grounds  accents: the template's accent
 *   colours (`accentClusters`)
 */
export function genericRole(o, grounds) {
  const page = o.scheme === 'dark' ? grounds.dark : grounds.light
  const sat = chromaOf(o.hex) >= SATURATED
  const lum = lumOf(o.hex)
  const status = statusOf(o.selector)
  if (status && ['text', 'fill', 'line', 'glyph'].includes(o.kind)) return statusRole(status, o.kind, '', lum)
  const k = contrast(o.hex, page) ?? 1
  // a saturated colour is the accent only when it belongs to the template's accent clusters; a
  // one-off brand colour elsewhere on the page is not guessed
  const accents = grounds.accents ?? []
  const near = (max) => accents.some((a) => distance(a, o.hex) <= max)
  const accentLike = sat && (near(24) || ((isHover(o.selector) || isActive(o.selector)) && near(72)))
  if (sat && !accentLike) return null
  if (o.kind === 'text' || o.kind === 'glyph') {
    if (o.pair === c('ink')) return c('on-ink')
    if (o.pair === c('accent') || o.pair === c('accent-hover')) return c('accent-on')
    if (o.pair === c('accent-band')) return c('on-accent-band')
    if (o.kind === 'glyph') return sat ? c('accent') : null
    if (sat) return isHover(o.selector) ? c('accent-text-hover') : c('accent-text')
    if (k < 2.5) return null
    if (k >= 8) return isHeadingSelector(o.selector) ? c('heading') : c('fg')
    return k >= 4.5 ? c('muted') : c('meta')
  }
  if (o.kind === 'fill') {
    if (sat)
      return isHover(o.selector) ? c('accent-hover') : isActive(o.selector) ? c('accent-active') : c('accent')
    if (distance(o.hex, page) <= 4) return c('bg')
    if (k >= 7) return o.scheme === 'dark' ? null : c('ink')
    if (k < 1.6) {
      const lighter = lum > lumOf(page)
      // a grey a :hover rule paints is the neutral hover ground: mapped to the surface like its rest
      // state, a row or grey button no longer moved under the pointer once a system was worn (JA
      // Restaurant's dark variants, 20/10/2026)
      if (isHover(o.selector) && (lighter || o.scheme !== 'dark')) return c('surface-hover')
      if (o.scheme === 'dark') return lighter ? c('surface') : null
      return lighter ? c('surface') : c('surface-warm')
    }
    return null
  }
  if (o.kind === 'line') {
    if (sat) return c('accent')
    if (k < 1.35) return c('border-soft')
    return k < 3.2 ? c('border') : null
  }
  return null
}

/**
 * The role of each template colour variable.
 * @param {{ name: string, hex: string, alpha: number, scheme: string }[]} defs  literal definitions
 * @param {{ name: string, kind: string, selector: string, scheme: string, pair?: string | null }[]} uses
 * @param {Map<string, string>} aliasOf  alias → the variable it renames (`--color-link` → `--color-forest`)
 * @param {{ light: string, dark: string }} grounds
 * @returns {Map<string, { role: string | null, candidates: string[], why: string }>}
 */
export function templateVarRoles(defs, uses, aliasOf, grounds) {
  const out = new Map()
  // two variables may rename each other (one per side): each alias is followed once
  const aliasesOf = (name, seen = new Set([name])) => {
    const all = []
    for (const [alias, of] of aliasOf)
      if (of === name && !seen.has(alias)) {
        seen.add(alias)
        all.push(alias, ...aliasesOf(alias, seen))
      }
    return all
  }
  const first = new Map()
  // a variable takes one role on both sides: read it from its light definition when it has one
  for (const d of defs) {
    const had = first.get(d.name)
    if (!had || (had.scheme !== 'light' && d.scheme === 'light')) first.set(d.name, d)
  }
  const panels = darkPanels(first, grounds)
  for (const [name, d] of first) {
    const fam = panelFamilyRole(name, panels)
    if (fam) {
      out.set(name, fam)
      continue
    }
    // a component's own variable takes a role per definition (`component-vars.mjs`), none by name
    if (isComponentVar(name)) {
      out.set(name, { role: null, candidates: [], why: 'component variable: its role is per component' })
      continue
    }
    const lum = lumOf(d.hex)
    const usesOf = [name, ...aliasesOf(name)].flatMap((n) => uses.filter((u) => u.name === n))
    const kinds = new Set(usesOf.map((u) => u.kind))
    const kind = kinds.size === 1 ? [...kinds][0] : null
    const named = d.dsRole ?? colourRoleOfName(name, lum, kind, d.hex)
    // usage wins over the name: `--tb-ink` painted only as words is not the ink ground
    const own = d.dsRole || !named || !kinds.size || [...kinds].some((k) => fitsKind(named, k)) ? named : null
    if (own) {
      out.set(name, { role: own, candidates: [own], why: `name ${name}` })
      continue
    }
    // text or lines ON a band the scan cannot see (`--color-on-forest-muted`): its uses sit on the
    // band's ground, which the light page's tiers would misread
    if (/(^|-)on-/.test(name)) {
      out.set(name, {
        role: null,
        candidates: [c('on-ink'), c('on-accent-band'), c('muted')],
        why: 'text or line on a band: which band role?'
      })
      continue
    }
    /** @type {Map<string, number>} */
    const votes = new Map()
    const vote = (r, w) => r && votes.set(r, (votes.get(r) ?? 0) + w)
    for (const a of aliasesOf(name)) vote(colourRoleOfName(a, lum, kind), 3)
    for (const u of usesOf)
      vote(
        genericRole(
          { hex: d.hex, kind: u.kind, selector: u.selector, scheme: d.scheme, pair: u.pair },
          grounds
        ),
        1
      )
    const ranked = [...votes].sort((a, b) => b[1] - a[1])
    const total = ranked.reduce((s, [, n]) => s + n, 0)
    const [top] = ranked
    const clear = top && top[1] / total >= 0.6 && (total >= 2 || ranked.length === 1)
    out.set(name, {
      role: clear && d.alpha >= 0.9 ? top[0] : null,
      candidates: ranked.slice(0, 3).map(([r]) => r),
      why: ranked.length
        ? `uses: ${ranked.map(([r, n]) => `${r.replace('--ds-c-', '')}×${n}`).join(', ')}`
        : 'no uses found'
    })
  }
  return out
}

const FILL_ROLE =
  /^--ds-c-(bg|surface|surface-warm|surface-hover|ink|accent|accent-hover|accent-active|accent-band|disabled-bg|(success|warn|danger|info)(-bg)?)$/
const TEXT_ROLE =
  /^--ds-c-(fg|fg-2|heading|muted|meta|accent|accent-text|accent-text-hover|on-ink|accent-on|accent-on-ink|on-accent-band|disabled-fg|(success|warn|danger|info)(-text)?)$/
const LINE_ROLE = /^--ds-c-(border|border-soft|accent|focus-ring|(success|warn|danger|info))$/
/** A role can paint what a use paints (a custom property's use kinds are not judged). */
const fitsKind = (role, kind) =>
  kind === 'fill'
    ? FILL_ROLE.test(role)
    : kind === 'text' || kind === 'glyph'
      ? TEXT_ROLE.test(role)
      : kind === 'line'
        ? LINE_ROLE.test(role) || TEXT_ROLE.test(role)
        : true

/**
 * The template's accent colours: saturated colours it paints as a ground at least twice (a literal
 * fill, or a colour variable its fills read), grouped when within 24 per channel. One-off saturated
 * colours are not accents.
 * @param {{ hex: string }[]} saturatedFills one entry per fill use
 * @returns {string[]}
 */
export function accentClusters(saturatedFills) {
  /** @type {{ hex: string, n: number }[]} */
  const clusters = []
  for (const { hex } of saturatedFills) {
    if (chromaOf(hex) < SATURATED) continue
    const near = clusters.find((cl) => distance(cl.hex, hex) <= 24)
    if (near) near.n++
    else clusters.push({ hex, n: 1 })
  }
  return clusters.filter((cl) => cl.n >= 2).map((cl) => cl.hex)
}
