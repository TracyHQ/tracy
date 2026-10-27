/**
 * One raw finding → one of three classes (Akemi's roadmap step 4):
 * - `auto`: its role is clear, so it is rewritten to read the role variable with its own value as the
 *   fallback (`var(--ds-c-bg, #fff)`): no system worn, the page computes exactly what it did;
 * - `flag`: its role is not clear (a one-off colour, a decorative glyph, a light text whose ground the
 *   scan cannot see) — never guessed, listed with the roles it could be, for the agent to settle;
 * - `keep`: it is not a design role at all (an image, a brand logo, a flag, a shadow, a mask).
 * PURE.
 */
import { contrast } from '../colour.mjs'
import { lumOf, genericRole } from './palette.mjs'
import { componentVarRole, paintOf } from './component-vars.mjs'
import { brandKeepOf } from './brand.mjs'
import { isComponentVar, keepReasonOf, roleOrNull } from './hints.mjs'
import { preprocessorFlag } from './sass.mjs'
import { font, radius } from './classify-shape.mjs'
import { auto, flag, keep } from './verdicts.mjs'

const PAGE_TEXT = /^--ds-c-(fg|fg-2|heading|muted|meta)$/
const TEXTISH =
  /^--ds-c-(fg|fg-2|heading|muted|meta|accent-text|accent-text-hover|on-ink|accent-on|on-accent-band|disabled-fg|(success|warn|danger|info)(-text)?)$/
const FILLISH =
  /^--ds-c-(bg|surface|surface-warm|surface-hover|ink|accent|accent-hover|accent-active|accent-band|focus-ring|disabled-bg|(success|warn|danger|info)(-bg)?)$/
const LINEISH =
  /^--ds-c-(border|border-soft|accent|accent-text|accent-text-hover|focus-ring|(success|warn|danger|info))$/
const fits = (role, kind) =>
  kind === 'text'
    ? TEXTISH.test(role)
    : kind === 'fill'
      ? FILLISH.test(role)
      : kind === 'line'
        ? LINEISH.test(role)
        : kind === 'glyph'
          ? TEXTISH.test(role) || role.endsWith('accent')
          : true
const CANDIDATES = {
  text: ['fg', 'muted', 'accent-text'],
  fill: ['surface', 'accent', 'ink'],
  line: ['border', 'border-soft'],
  glyph: ['accent', 'fg'],
  custom: ['accent', 'surface', 'fg']
}

/**
 * @param {object} f raw finding (`collectFile`)
 * @param {{ grounds: { light: string, dark: string }, varRoles: Map<string, { role: string | null, candidates: string[], why: string }>,
 *   roleOfVar: (name: string) => string | null, exact: Map<string, { role: string, scheme: string }[]>,
 *   pairOf: (f: object) => string | null, twMajor: number, twConfig?: object | null }} ctx
 * @returns {{ class: 'auto' | 'flag' | 'keep' | 'missing', role: string | null, candidates?: string[], reason: string, replacement?: string }}
 */
export function classify(f, ctx) {
  const context = [f.file, f.selector, f.name, f.lineText].filter(Boolean).join(' ')
  // a component that should read a corner role and declares none (`missing-radius.mjs`)
  if (f.valueType === 'missing') return { class: 'missing', role: f.role, reason: f.why }
  // a brand logo keeps its face, paint and corners under every system: never auto-converted
  const brand = brandKeepOf(f)
  if (brand) return keep(brand)
  const pre = preprocessorFlag(f, ctx)
  if (pre) return flag(pre.role, pre.candidates, pre.reason)
  if (f.valueType === 'radius') return radius(f, ctx)
  if (f.valueType === 'font') return font(f, ctx)
  if (f.inUrl) return keep('inside an image (url())')
  if (f.kind === 'shadow') return keep('shadow tint: depth, not a role')
  if (f.kind === 'mask') return keep('mask: only its alpha paints')
  if (/^(--[\w-]*-|--|\$|@)(white|black)$/i.test(f.name ?? ''))
    return keep('base colour token: its uses are scanned where they paint')
  if (/shadow|overlay|scrim|backdrop/i.test(f.name ?? ''))
    return keep('shadow or overlay tint: depth, not a role')
  // Tailwind's own registered properties (`@layer properties`, --tw-ring-offset-color): vendor
  if ((f.name ?? '').startsWith('--tw-') || f.atRules?.some((a) => /@layer\s+properties/.test(a)))
    return keep('Tailwind internal property: vendor, not the template palette')
  // a custom property holding a whole shadow (`--elev-raised: 0 2px 8px rgba(…)`): depth
  if (f.kind === 'custom' && isShadowValue(f.value))
    return keep('shadow value held in a custom property: depth, not a role')
  const why = keepReasonOf(context, f.kind)
  if (why) return keep(why)
  const lum = lumOf(f.hex)
  if (f.alpha < 0.9) {
    const shade = lum < 0.03 || lum > 0.9
    if (f.kind === 'fill' && shade) return keep('translucent shade or scrim over content')
    // black or white over what is under it: a shade of the ground or of the words, never the accent
    const tint = shade
      ? ({ text: ['fg', 'muted', 'on-ink'], line: ['border-soft', 'border'], glyph: ['fg', 'on-ink'] }[
          f.kind
        ] ?? ['border-soft', 'surface', 'fg'])
      : ['accent', 'surface']
    return flag(null, tint, `translucent colour (alpha ${round(f.alpha)}): a tint of which role?`)
  }
  // the fallback of a template variable read (`var(--wp--preset--color--border, #ddd)`) is that
  // variable's value: it takes the variable's role, never one of its own
  const viaVar = f.fallbackOf ? roleOrNull(ctx.roleOfVar(f.fallbackOf)) : null
  if (viaVar) return auto(f, viaVar, `fallback of ${f.fallbackOf} (role ${viaVar})`, ctx)
  if (f.kind === 'custom' && isComponentVar(f.name) && !ctx.varRoles.get(f.name)?.panel) {
    const role = roleOrNull(componentVarRole(f, ctx))
    if (role) return auto(f, role, `component variable ${f.name} on ${f.selector || 'the root'}`, ctx)
    return flag(
      null,
      CANDIDATES[paintOf(f.name)] ?? CANDIDATES.custom,
      `component variable ${f.name}: role unclear`
    )
  }
  if (f.kind === 'custom') {
    const v = ctx.varRoles.get(f.name)
    const role = roleOrNull(v?.role)
    if (role) return auto(f, role, `template variable ${f.name}: ${v.why}`, ctx)
    // a Tailwind theme colour or a WordPress preset makes classes that content stored in the CMS may
    // use: never "unused" from the template's files alone
    if (ctx.isRead && !ctx.isRead(f.name) && /^--(?!color-|wp--preset--)/.test(f.name))
      return keep('defined but never read: paints nothing')
    // no use to vote: the roles its colour could take, by what it could paint
    const candidates = v?.candidates?.length
      ? v.candidates
      : ['fill', 'text', 'line']
          .map((k) => genericRole({ ...f, kind: k, pair: null }, ctx.grounds))
          .filter(Boolean)
    return flag(
      null,
      (candidates.length ? candidates : CANDIDATES.custom).map((r) => r.replace('--ds-c-', '')),
      `template variable ${f.name}: ${v?.why ?? 'role unclear'}`
    )
  }
  const found = f.kind === 'text' || f.kind === 'glyph' ? ctx.pairOf(f) : null
  // `~why`: a parent element's ground could not be read; the text is then judged as if alone
  const ancestorNote = found?.startsWith('~') ? found.slice(1) : null
  const ground = ancestorNote ? null : found
  if (ground?.startsWith('?'))
    return flag(
      null,
      ['on-ink', 'accent-on', 'on-accent-band'],
      `text on a ground whose role is unclear (${ground.slice(1)})`
    )
  const pair = ground
  const plain = /^#(f{6}|0{6})$/.test(f.hex)
  const matches = plain || pair ? [] : (ctx.exact.get(f.hex) ?? []).filter((m) => fits(m.role, f.kind))
  // the same colour as a variable OF THE SAME SIDE: a dark side's heading white is not the light page's
  const exact = matches.find((m) => m.scheme === f.scheme)
  const generic = genericRole({ ...f, pair }, ctx.grounds)
  let role = roleOrNull(exact?.role ?? generic)
  // a text role of the page (fg, muted, heading…) only for a text that reads on the page: white text
  // with no ground found is on a band or a picture the scan cannot see
  const page = f.scheme === 'dark' ? ctx.grounds.dark : ctx.grounds.light
  if (role && !pair && PAGE_TEXT.test(role) && (contrast(f.hex, page) ?? 1) < 2.5) role = null
  if (f.source === 'svg')
    return flag(
      role,
      role ? [role] : CANDIDATES.glyph,
      'colour in an SVG attribute: decorative or a glyph role?'
    )
  // a border drawn in the colour of the same rule's own ground is the box's edge: the ground's role
  if (f.kind === 'line' && f.rule && ctx.siblings) {
    const fill = ctx
      .siblings(f.rule)
      .find(
        (d) =>
          /^(background|background-color)$/.test(d.prop) &&
          d.value.toLowerCase().includes(f.text.toLowerCase())
      )
    const fillRole = fill ? roleOrNull(genericRole({ ...f, kind: 'fill', pair: null }, ctx.grounds)) : null
    if (fillRole && fillRole !== role)
      return auto(
        f,
        fillRole,
        `border in the colour of its own ground (${fillRole.replace('--ds-c-', '')})`,
        ctx
      )
  }
  // a line on the ink band: the page's border roles are tuned for the page, not for the ink
  if (f.kind === 'line' && ctx.pairOf(f) === '--ds-c-ink')
    return flag(null, ['on-ink'], 'a line on the ink band: no page border role reads there')
  // both arms of a light-dark(): one role must fit both schemes
  if (role && f.darkHex) {
    const dark = roleOrNull(genericRole({ ...f, hex: f.darkHex, scheme: 'dark', pair }, ctx.grounds))
    if (dark !== role)
      return flag(role, [role, dark].filter(Boolean), 'light-dark() whose arms read different roles')
  }
  if (!role) {
    if (pair)
      return flag(
        null,
        ['on-ink', 'accent-on'],
        `text on a ${pair.replace('--ds-c-', '')} ground: no role names it`
      )
    const lightText = f.kind === 'text'
    return flag(
      null,
      lightText ? ['on-ink', 'accent-on', 'on-accent-band'] : (CANDIDATES[f.kind] ?? []),
      lightText
        ? ancestorNote
          ? `light text: the ground under it is ${ancestorNote}`
          : 'light text: no ground found on it or on the elements around it'
        : `one-off ${f.kind} colour`
    )
  }
  return auto(
    f,
    role,
    exact
      ? `same colour as a template variable in the role ${role}`
      : pair
        ? `text on a ${pair.replace('--ds-c-', '')} ground${f.source === 'tailwind' && !/\bbg-/.test(f.classString ?? '') ? ' (set on a parent element)' : ''}`
        : `palette: ${f.kind} ${f.hex}`,
    ctx
  )
}

const round = (n) => Math.round(n * 100) / 100

/** A value shaped like a shadow: two or more lengths beside a colour, or `inset`. */
const isShadowValue = (v) =>
  /\binset\b/.test(v ?? '') ||
  /(^|[\s,(])-?\d*\.?\d+(px|rem|em)?\s+-?\d*\.?\d+(px|rem|em)?(\s+-?\d*\.?\d+(px|rem|em)?)?\s*(#|rgba?\(|hsla?\(|[a-z]+\s*(,|$)|var\()/i.test(
    v ?? ''
  )
