#!/usr/bin/env node
// prepass.mjs — what the measured design contract already says, written into the theme overlay
// ONCE, before round 0 of the visual loop, without a model and without a visual run.
//
//   node scripts/visual/prepass.mjs --contract <design-contract.json> --overlay <overlays/<slug>>
//        --fallback <vendor tokens.css> --map <prepass.map.json> [--variant desktop-light]
//        [--report <file.json>] [--dry-run] [--adopt-root-tokens] [--replace-tokens]
//
// WHY. JA Vega M4c (26/09) spent ~50 min of agent fixes between visual rounds, and a good part of
// the first rounds' findings were values the contract had measured before the loop began: the
// type scale, the body leading, the container and the section rhythm. A round measures them again
// one element at a time (~140 findings from one CSS rule, listed one by one). The pre-pass applies
// them in one step, and round 0 then measures what is left.
//
// WRITE SET — exactly three files of the overlay, declared before anything is written and listed
// in the report with their hash before and after:
//   tokens.css           the 56 tokens (theme-tokens.mjs: tokensFromContract + renderTokensCss);
//                        the file `rootTokens` names. A tokens.css this tool (or theme-tokens.mjs)
//                        did not write is refused unless --replace-tokens: it may be hand-tuned.
//   theme.config.json    `rootTokens` set, so the generator actually reads the file; a config that
//                        wears a `rootVariation` is refused unless --adopt-root-tokens (the two are
//                        mutually exclusive in build.mjs, and swapping the look is a decision).
//   theme.overlay.json   `styles.css`, only between the markers `/* tracy-prepass:begin` and
//                        `/* tracy-prepass:end */`; everything outside them is kept. `styles.css`
//                        is the overlay key the generator merges into theme.json (THEME_OVERLAY_KEYS).
// Nothing else: not the generated theme.json, not the vendor, not the contract, not a stand.
//
// THE CSS. For each contract rule the map names a WordPress selector for, one rule per selector:
// the primary variant's measured values, then the phone/tablet values that differ under the map's
// media query. A value equal to a MEASURED token is written as that token's WordPress variable
// (colour → palette preset, family → font preset, size → font-size preset, section/container/space/
// radius/leading → the generator's variable, WP_VAR below); a colour or family with no preset is not
// written (no hex outside the palette). The dark variants are checked, not written: a colour whose
// dark value is the SAME preset's dark measurement follows the overlay's dark restate; any other
// dark difference is reported unsupported. The map never comes from the Joomla selectors: which
// WordPress element carries `.item-page h1` is a decision, written down in the map, and a rule the
// map does not name is reported, not guessed.
//
// IDEMPOTENT. The output is a function of the inputs (paths are written by basename); a file whose
// bytes would not change is not rewritten, so a second run changes nothing and says so.
//
// Exit 0: applied (or, with --dry-run, computed). Exit 1: refused — a token with neither a
// measurement nor a fallback, a write path that is not a plain file of the overlay, a tokens.css
// not written by the tools, a rootVariation without --adopt-root-tokens, two rules asking one
// selector for different values; nothing is written. Exit 2: bad arguments or unreadable input.
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateDesign } from '../design-contract.mjs'
import { colorValue, parseTokensCss, renderTokensCss, TOKEN_NAMES, tokensFromContract } from '../theme-tokens.mjs'

export const REGION_BEGIN = '/* tracy-prepass:begin'
export const REGION_END = '/* tracy-prepass:end */'
/** The first line renderTokensCss writes: a tokens.css with it is the tools' own. */
const TOKENS_HEADER = '/* tokens.css — written by scripts/theme-tokens.mjs'

const COLOR_TOKENS = ['--bg', '--surface', '--surface-warm', '--fg', '--fg-2', '--muted', '--meta', '--border', '--border-soft', '--accent', '--accent-on', '--accent-hover', '--accent-active', '--success', '--warn', '--danger']
const SIZE_SLUG = { '--text-xs': 'xs', '--text-sm': 'sm', '--text-base': 'base', '--text-lg': 'lg', '--text-xl': 'xl', '--text-2xl': 'xxl', '--text-3xl': 'xxxl', '--text-4xl': 'xxxxl' }
const CUSTOM = {
  '--leading-body': ['leading', 'body'],
  '--leading-tight': ['leading', 'tight'],
  '--tracking-display': ['tracking', 'display'],
  '--section-y-desktop': ['sectionY', 'desktop'],
  '--section-y-tablet': ['sectionY', 'tablet'],
  '--section-y-phone': ['sectionY', 'phone'],
  '--radius-sm': ['radius', 'sm'],
  '--radius-md': ['radius', 'md'],
  '--radius-lg': ['radius', 'lg'],
  '--radius-pill': ['radius', 'pill'],
  '--container-max': ['container', 'max'],
  '--container-gutter-desktop': ['container', 'gutterDesktop'],
  '--container-gutter-tablet': ['container', 'gutterTablet'],
  '--container-gutter-phone': ['container', 'gutterPhone']
}
const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
/**
 * Token → the WordPress variable that carries it: a copy of the part of WP_VAR in
 * packages/cms/tracy-wordpress-theme/scripts/build.mjs this tool writes (read 27/09/2026). Keep the
 * two in step, as theme-tokens.mjs keeps TOKEN_NAMES.
 */
export const WP_VAR = Object.freeze({
  ...Object.fromEntries(COLOR_TOKENS.map((n) => [n, `--wp--preset--color--${n.slice(2)}`])),
  '--font-display': '--wp--preset--font-family--display',
  '--font-body': '--wp--preset--font-family--body',
  '--font-mono': '--wp--preset--font-family--mono',
  ...Object.fromEntries(Object.entries(SIZE_SLUG).map(([n, s]) => [n, `--wp--preset--font-size--${s}`])),
  ...Object.fromEntries(['1', '2', '3', '4', '5', '6', '8', '12'].map((s) => [`--space-${s}`, `--wp--preset--spacing--${s}`])),
  ...Object.fromEntries(Object.entries(CUSTOM).map(([n, p]) => [n, `--wp--custom--${p.map(kebab).join('--')}`]))
})

// ---- values: a computed style → the CSS written, and the tokens it may be written as ----

const px = (v) => {
  const m = typeof v === 'string' && v.trim().match(/^(-?\d*\.?\d+)px$/)
  return m ? Number(m[1]) : null
}
const num = (n, digits = 3) => String(Number(n.toFixed(digits)))
const firstFamily = (v) => String(v ?? '').split(',')[0].replace(/["']/g, '').trim().toLowerCase()
const spaces = (vc) => [`--section-y-${vc}`, `--container-gutter-${vc}`, '--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8', '--space-12']

/**
 * The CSS properties the pre-pass writes, each with how a computed value becomes CSS and which
 * tokens (in preference order) it may be written as. `vc` is the width class (desktop/tablet/phone).
 */
const PROPS = {
  fontFamily: { css: 'font-family', kind: 'family', tokens: () => ['--font-display', '--font-body', '--font-mono'] },
  fontSize: { css: 'font-size', kind: 'length', tokens: () => Object.keys(SIZE_SLUG) },
  fontWeight: { css: 'font-weight', kind: 'weight', tokens: () => [] },
  lineHeight: { css: 'line-height', kind: 'leading', tokens: () => ['--leading-body', '--leading-tight'] },
  letterSpacing: { css: 'letter-spacing', kind: 'tracking', tokens: () => ['--tracking-display'] },
  color: { css: 'color', kind: 'color', tokens: () => COLOR_TOKENS },
  backgroundColor: { css: 'background-color', kind: 'color', tokens: () => COLOR_TOKENS },
  borderRadius: { css: 'border-radius', kind: 'length', tokens: () => ['--radius-sm', '--radius-md', '--radius-lg', '--radius-pill'] },
  paddingTop: { css: 'padding-top', kind: 'length', tokens: spaces },
  paddingBottom: { css: 'padding-bottom', kind: 'length', tokens: spaces },
  paddingLeft: { css: 'padding-left', kind: 'length', tokens: spaces },
  paddingRight: { css: 'padding-right', kind: 'length', tokens: spaces },
  maxWidth: { css: 'max-width', kind: 'length', tokens: () => ['--container-max'] }
}

/** A computed value in the shape it is compared and written: null when it cannot be written. */
function normalise(kind, value, styles) {
  if (typeof value !== 'string' || value.trim() === '') return null
  const v = value.trim()
  if (kind === 'color') return colorValue(v)
  if (kind === 'family') return v
  if (kind === 'weight') return /^(\d{3}|normal|bold)$/.test(v) ? v : null
  if (kind === 'leading') {
    if (/^\d*\.?\d+$/.test(v)) return num(Number(v), 3)
    const lh = px(v)
    const fs = px(styles.fontSize)
    return lh !== null && fs ? num(lh / fs, 3) : null
  }
  if (kind === 'tracking') {
    if (v === 'normal' || v === '0px' || v === '0') return '0'
    if (/^-?\d*\.?\d+em$/.test(v)) return v
    const ls = px(v)
    const fs = px(styles.fontSize)
    return ls !== null && fs ? `${num(ls / fs, 3)}em` : null
  }
  if (kind === 'length') {
    if (v === 'none' || v === 'auto') return v
    const n = px(v)
    if (n === null) return null
    return n === 0 ? '0' : `${num(n, 2)}px`
  }
  return null
}

/** Whether a normalised value equals a token's value (a leading token of `1.50` equals `1.5`). */
function sameValue(kind, a, b) {
  if (a === null || b === null || b === undefined) return false
  if (kind === 'color') return colorValue(b) === a
  if (kind === 'family') return firstFamily(a) === firstFamily(b)
  if (kind === 'leading') return Number(a) === Number(b)
  if (kind === 'tracking') return (a === '0' ? '0em' : a) === (b === '0' ? '0em' : String(b))
  return String(a) === String(b)
}

/**
 * The token a value may be written as: among the MEASURED tokens of the property, the one whose
 * provenance names this rule first (theme-tokens read it from here), else the first in order. A
 * fallback token is never used — its value is a guess, and a var() would pin the guess.
 */
function tokenFor(kind, value, candidates, measured, ruleId) {
  const hits = candidates.filter((n) => measured.has(n) && sameValue(kind, value, measured.get(n).value))
  if (!hits.length) return null
  return hits.find((n) => measured.get(n).detail.includes(`rule ${ruleId} `)) ?? hits[0]
}

// ---- the map: contract rule → WordPress selector, and the width classes' media queries ----

const unsafeCss = (s) => /[{};<@\\\n\r]|\/\*|\*\//.test(s)

/**
 * A prepass map, checked whole: `{ rules: { <rule id>: <selector> | null }, media: { phone?, tablet? } }`.
 * Returns the errors (empty when valid). A rule id the contract does not have is an error, so is a
 * selector or media query that could break out of its rule.
 */
export function validateMap(map, contract) {
  const errors = []
  if (!map || typeof map !== 'object' || Array.isArray(map)) return ['the map is not a JSON object']
  for (const k of Object.keys(map)) if (!['rules', 'media', 'note'].includes(k)) errors.push(`unknown key ${k} (rules, media, note)`)
  if (!map.rules || typeof map.rules !== 'object' || Array.isArray(map.rules)) errors.push('rules must be an object of <rule id>: <selector> | null')
  const ids = new Set(contract.rules.map((r) => r.id))
  for (const [id, sel] of Object.entries(map.rules ?? {})) {
    if (!ids.has(id)) errors.push(`rules.${id}: the contract has no rule ${id}`)
    if (sel === null) continue
    if (typeof sel !== 'string' || sel.trim() === '') errors.push(`rules.${id}: a selector must be a non-empty string or null`)
    else if (unsafeCss(sel)) errors.push(`rules.${id}: selector ${JSON.stringify(sel)} carries a character that could end the rule`)
  }
  if (map.media !== undefined) {
    if (!map.media || typeof map.media !== 'object' || Array.isArray(map.media)) errors.push('media must be an object')
    for (const [k, q] of Object.entries(map.media ?? {})) {
      if (!['phone', 'tablet'].includes(k)) errors.push(`media.${k}: only phone and tablet`)
      else if (typeof q !== 'string' || !/^\(.*\)$/.test(q.trim()) || unsafeCss(q)) errors.push(`media.${k}: ${JSON.stringify(q)} is not a media condition like "(max-width: 781px)"`)
    }
  }
  return errors
}

const widthClass = (v) => (v.width <= 430 ? 'phone' : v.width < 1280 ? 'tablet' : 'desktop')

/**
 * The managed CSS: every mapped rule's declarations per width class, plus what could not be written.
 * Pure. Throws on a contradiction (two rules asking one selector for different values).
 * @returns {{ css: string, rules: Array<{ rule: string, selector: string, declarations: Array<{ width: string, property: string, value: string, from: string }> }>, unsupported: Array<{ rule: string, variant?: string, property?: string, reason: string }> }}
 */
export function contractCss(contract, map, { variant = 'desktop-light', measured }) {
  const primary = contract.variants.find((v) => v.id === variant)
  if (!primary) throw new Error(`variant ${variant} is not in the contract`)
  const sameMode = contract.variants.filter((v) => v.mode === primary.mode && v.id !== primary.id)
  const otherMode = contract.variants.filter((v) => v.mode !== primary.mode)
  const byVariant = new Map()
  const measuredIn = (id) => {
    if (!byVariant.has(id)) byVariant.set(id, measuredOf(contract, id))
    return byVariant.get(id)
  }
  const unsupported = []
  const out = []
  // selector → width → property → { value, rule }
  const bySelector = new Map()
  for (const rule of contract.rules) {
    if (!(rule.id in (map.rules ?? {}))) {
      unsupported.push({ rule: rule.id, reason: `not in the map: which WordPress element carries ${rule.selector} is not written down` })
      continue
    }
    const selector = map.rules[rule.id]
    if (selector === null) {
      unsupported.push({ rule: rule.id, reason: 'the map skips it (null)' })
      continue
    }
    const base = rule.styles[primary.id]
    if (!base) {
      unsupported.push({ rule: rule.id, variant: primary.id, reason: 'no measurement at the primary variant' })
      continue
    }
    const decls = []
    const write = (width, prop, value, from) => {
      const sel = selector.trim()
      const w = bySelector.get(sel) ?? new Map()
      bySelector.set(sel, w)
      const props = w.get(width) ?? new Map()
      w.set(width, props)
      const had = props.get(prop)
      if (had && had.value !== value) throw new Error(`contradiction: ${sel} ${width} ${prop} is ${had.value} from rule ${had.rule} and ${value} from rule ${rule.id} — map one of them elsewhere or skip it`)
      props.set(prop, { value, rule: rule.id })
      decls.push({ width, property: prop, value, from })
    }
    // A colour is written as a preset only when that preset's measurement in the other mode is
    // the rule's own value there too: white hero text is `--bg` in light by value, and would turn
    // dark with the page in dark mode. The other mode's twin is the variant of the same width.
    const cssOf = (prop, raw, styles, vc, at) => {
      const spec = PROPS[prop]
      const value = normalise(spec.kind, raw, styles)
      if (value === null) return { error: `${JSON.stringify(raw)} cannot be written` }
      if (spec.kind === 'color') {
        const twin = otherMode.find((x) => x.width === at.width)
        const other = twin ? rule.styles[twin.id] : null
        const want = other && typeof other[prop] === 'string' ? normalise('color', other[prop], other) : undefined
        let hits = COLOR_TOKENS.filter((n) => measured.has(n) && sameValue('color', value, measured.get(n).value))
        if (!hits.length) return { error: `${value} is no measured palette preset (no hex outside the palette)` }
        if (want !== undefined) {
          const dm = measuredIn(twin.id)
          const agree = hits.filter((n) => dm.has(n) && sameValue('color', want, dm.get(n).value))
          if (!agree.length) return { error: `${value} is preset ${hits.join('/')} in ${at.mode}, but ${String(want)} in ${twin.mode} is not ${hits.length > 1 ? 'any of their' : 'its'} own ${twin.mode} measurement (${hits.map((n) => `${n} ${dm.get(n)?.value ?? 'not measured'}`).join(', ')})` }
          hits = agree
        }
        const token = hits.find((n) => measured.get(n).detail.includes(`rule ${rule.id} `)) ?? hits[0]
        return { css: `var(${WP_VAR[token]})`, token, value }
      }
      // no tracking is `normal`, not the display tracking that happens to be 0 today
      if (spec.kind === 'tracking' && value === '0') return { css: 'normal', token: null, value }
      const token = tokenFor(spec.kind, value, spec.tokens(vc), measured, rule.id)
      if (token) return { css: `var(${WP_VAR[token]})`, token, value }
      if (spec.kind === 'family') return { error: `${value} is no measured font preset` }
      return { css: value, token: null, value }
    }
    for (const [prop, raw] of Object.entries(base)) {
      if (!PROPS[prop]) {
        unsupported.push({ rule: rule.id, variant: primary.id, property: prop, reason: 'not a property the pre-pass writes' })
        continue
      }
      const r = cssOf(prop, raw, base, 'desktop', primary)
      if (r.error) unsupported.push({ rule: rule.id, variant: primary.id, property: prop, reason: r.error })
      else write('desktop', PROPS[prop].css, r.css, `${primary.id}${r.token ? ` = ${r.token}` : ''}`)
    }
    // the same mode at other widths: what differs from the primary goes under the width's query
    for (const v of sameMode) {
      const styles = rule.styles[v.id]
      if (!styles) continue
      const vc = widthClass(v)
      for (const [prop, raw] of Object.entries(styles)) {
        if (!PROPS[prop]) continue
        const kind = PROPS[prop].kind
        if (sameValue(kind, normalise(kind, raw, styles), normalise(kind, base[prop], base) ?? undefined)) continue
        if (!map.media?.[vc]) {
          unsupported.push({ rule: rule.id, variant: v.id, property: prop, reason: `differs at ${vc} and the map declares no media.${vc}` })
          continue
        }
        const r = cssOf(prop, raw, styles, vc, v)
        if (r.error) unsupported.push({ rule: rule.id, variant: v.id, property: prop, reason: r.error })
        else write(vc, PROPS[prop].css, r.css, `${v.id}${r.token ? ` = ${r.token}` : ''}`)
      }
    }
    // the other mode is never written: colours were checked above; any other difference is reported
    for (const v of otherMode) {
      const styles = rule.styles[v.id]
      const twin = [primary, ...sameMode].find((x) => x.width === v.width)
      const light = twin ? rule.styles[twin.id] : null
      if (!styles || !light) continue
      for (const [prop, raw] of Object.entries(styles)) {
        if (!PROPS[prop] || PROPS[prop].kind === 'color') continue
        const kind = PROPS[prop].kind
        const a = normalise(kind, raw, styles)
        const b = normalise(kind, light[prop], light)
        if (!sameValue(kind, a, b ?? undefined)) unsupported.push({ rule: rule.id, variant: v.id, property: prop, reason: `${String(b)} → ${String(a)} in ${v.mode}: a ${v.mode}-only difference the pre-pass does not write` })
      }
    }
    if (decls.length) out.push({ rule: rule.id, selector: selector.trim(), declarations: decls })
  }
  // one CSS rule per selector and width, in first-seen order; widths desktop → tablet → phone
  const lines = []
  const block = (sel, props, indent) => {
    lines.push(`${indent}${sel} {`)
    for (const [prop, { value, rule }] of props) lines.push(`${indent}  ${prop}: ${value}; /* ${rule} */`)
    lines.push(`${indent}}`)
  }
  for (const [sel, widths] of bySelector) if (widths.get('desktop')) block(sel, widths.get('desktop'), '')
  for (const vc of ['tablet', 'phone']) {
    const inside = [...bySelector].filter(([, w]) => w.get(vc)?.size)
    if (!inside.length) continue
    lines.push(`@media ${map.media[vc].trim()} {`)
    for (const [sel, widths] of inside) block(sel, widths.get(vc), '  ')
    lines.push('}')
  }
  return { css: lines.join('\n'), rules: out, unsupported }
}

/** name → { value, detail } of the tokens a variant MEASURES (no fallback). */
function measuredOf(contract, variant) {
  const r = tokensFromContract(contract, { variant, fallback: null })
  return new Map(r.provenance.filter((p) => p.source === 'measured').map((p) => [p.name, { value: p.value, detail: p.detail }]))
}

/** The managed region's text, markers included. */
function regionText(css, meta) {
  return [
    `${REGION_BEGIN} — scripts/visual/prepass.mjs from ${meta.contract} (id ${meta.id}, revision ${String(meta.revision)}), map ${meta.map}. Edits between the markers are replaced on the next run. */`,
    css,
    REGION_END
  ].join('\n')
}

/** `styles.css` with the managed region replaced or appended; throws on broken markers. */
export function withRegion(css, region) {
  const text = typeof css === 'string' ? css : ''
  const count = (s) => text.split(s).length - 1
  const b = count(REGION_BEGIN)
  const e = count(REGION_END)
  if (b > 1 || e > 1 || b !== e) throw new Error(`styles.css carries ${b} begin and ${e} end marker(s) of the managed region; expected one of each or none`)
  if (b === 0) return text.trim() === '' ? region : `${text.replace(/\s+$/, '')}\n\n${region}`
  const start = text.indexOf(REGION_BEGIN)
  const end = text.indexOf(REGION_END)
  if (end < start) throw new Error('styles.css: the end marker of the managed region comes before its begin marker')
  return text.slice(0, start) + region + text.slice(end + REGION_END.length)
}

const sha = (buf) => (buf === null ? null : `sha256:${createHash('sha256').update(buf).digest('hex')}`)

/** A file of the overlay the tool may write: a plain file (or absent) directly inside it. */
function target(overlayReal, name) {
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') throw new Error(`${name}: not a file name inside the overlay`)
  const file = path.join(overlayReal, name)
  if (path.dirname(file) !== overlayReal) throw new Error(`${name}: outside the overlay`)
  if (existsSync(file) || isLink(file)) {
    const st = lstatSync(file)
    if (st.isSymbolicLink()) throw new Error(`${file}: a symlink — the pre-pass writes only plain files of the overlay`)
    if (!st.isFile()) throw new Error(`${file}: not a file`)
  }
  return file
}
const isLink = (f) => {
  try {
    return lstatSync(f).isSymbolicLink()
  } catch {
    return false
  }
}

// The tokens file being replaced may be hand-written (`:root { --accent: #f00; }` on one line), which
// parseTokensCss — line-anchored for the files the tools write — would read as empty; the report
// must still name the value it replaces.
function previousTokens(css) {
  const tokens = {}
  for (const match of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g)) {
    if (!(match[1] in tokens)) tokens[match[1]] = match[2].trim()
  }
  return tokens
}

/**
 * Plan the pre-pass: every output in memory, every refusal raised, nothing written.
 * @returns {{ writes: Array<{ path: string, name: string, before: Buffer|null, after: Buffer, changed: boolean }>, report: object }}
 */
function plan({ contract, contractName, overlay, fallback, fallbackName, map, mapName, variant = 'desktop-light', adoptRootTokens = false, replaceTokens = false }) {
  const overlayReal = realpathSync(overlay)
  const configFile = target(overlayReal, 'theme.config.json')
  if (!existsSync(configFile)) throw new Error(`${overlay}: no theme.config.json — not a generator overlay`)
  const configText = readFileSync(configFile, 'utf8')
  const config = JSON.parse(configText)
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('theme.config.json is not an object')
  let tokensName = config.rootTokens ?? null
  let configNext = config
  if (tokensName !== null && typeof tokensName !== 'string') throw new Error('theme.config.json rootTokens must name a file of the overlay')
  if (tokensName === null) {
    if (config.rootVariation != null && !adoptRootTokens)
      throw new Error(`theme.config.json wears rootVariation ${JSON.stringify(config.rootVariation)}; the measured tokens need rootTokens instead — pass --adopt-root-tokens to make that switch`)
    tokensName = 'tokens.css'
    // rootTokens takes rootVariation's place in the key order; otherwise it goes last
    configNext = {}
    for (const [k, v] of Object.entries(config)) {
      if (k === 'rootVariation') configNext.rootTokens = tokensName
      else configNext[k] = v
    }
    configNext.rootTokens = tokensName
  }
  const tokensFile = target(overlayReal, tokensName)
  const overlayFile = target(overlayReal, 'theme.overlay.json')

  // tokens
  const result = tokensFromContract(contract, { variant, fallback, fallbackLabel: fallbackName })
  if (result.missing.length) throw new Error(`${String(result.missing.length)} tokens have neither a measurement nor a fallback: ${result.missing.join(', ')}`)
  const tokensCss = renderTokensCss(result, { contractId: contract.id, revision: contract.revision, variant, contractPath: contractName, fallbackPath: fallbackName })
  const back = parseTokensCss(tokensCss)
  const lost = TOKEN_NAMES.filter((n) => back[n] !== result.tokens[n])
  if (lost.length) throw new Error(`internal: the tokens file would not read back ${lost.join(', ')}`)
  const tokensBefore = existsSync(tokensFile) ? readFileSync(tokensFile) : null
  if (tokensBefore && !tokensBefore.toString('utf8').startsWith(TOKENS_HEADER) && !replaceTokens)
    throw new Error(`${tokensFile} was not written by theme-tokens.mjs/prepass.mjs (no "${TOKENS_HEADER}" header) — it may be hand-tuned; pass --replace-tokens to overwrite it`)
  const old = tokensBefore ? previousTokens(tokensBefore.toString('utf8')) : {}
  const tokenChanges = TOKEN_NAMES.filter((n) => old[n] !== result.tokens[n]).map((n) => ({ name: n, from: old[n] ?? null, to: result.tokens[n], source: result.provenance.find((p) => p.name === n).source }))

  // css
  const measured = new Map(result.provenance.filter((p) => p.source === 'measured').map((p) => [p.name, { value: p.value, detail: p.detail }]))
  const synth = contractCss(contract, map, { variant, measured })
  const region = regionText(synth.css, { contract: contractName, id: contract.id, revision: contract.revision, map: mapName })
  const overlayBefore = existsSync(overlayFile) ? readFileSync(overlayFile) : null
  const overlayJson = overlayBefore ? JSON.parse(overlayBefore.toString('utf8')) : {}
  if (!overlayJson || typeof overlayJson !== 'object' || Array.isArray(overlayJson)) throw new Error('theme.overlay.json is not an object')
  if (overlayJson.styles !== undefined && (typeof overlayJson.styles !== 'object' || overlayJson.styles === null || Array.isArray(overlayJson.styles))) throw new Error('theme.overlay.json styles is not an object')
  if (overlayJson.styles?.css !== undefined && typeof overlayJson.styles.css !== 'string') throw new Error('theme.overlay.json styles.css is not a string')
  const cssBefore = overlayJson.styles?.css ?? ''
  const cssAfter = withRegion(cssBefore, region)
  const overlayNext = { ...overlayJson, styles: { ...(overlayJson.styles ?? {}), css: cssAfter } }

  const json = (o) => Buffer.from(`${JSON.stringify(o, null, 2)}\n`)
  const entry = (file, before, after) => ({ path: file, name: path.basename(file), before, after, changed: before === null || !before.equals(after) })
  const configAfter = JSON.stringify(configNext) === JSON.stringify(config) ? Buffer.from(configText) : json(configNext)
  const overlayAfter = overlayBefore && cssAfter === cssBefore ? overlayBefore : json(overlayNext)
  const writes = [entry(tokensFile, tokensBefore, Buffer.from(tokensCss)), entry(configFile, Buffer.from(configText), configAfter), entry(overlayFile, overlayBefore, overlayAfter)]
  const report = {
    tool: 'prepass.mjs',
    contract: { file: contractName, id: contract.id, revision: contract.revision, variant },
    map: mapName,
    fallback: fallbackName,
    writeSet: writes.map((w) => w.path),
    files: writes.map((w) => ({ path: w.path, before: sha(w.before), after: sha(w.after), changed: w.changed })),
    tokens: {
      measured: result.provenance.filter((p) => p.source === 'measured').map((p) => ({ name: p.name, value: p.value, detail: p.detail })),
      fallback: result.provenance.filter((p) => p.source === 'fallback').map((p) => ({ name: p.name, value: p.value })),
      changed: tokenChanges
    },
    config: { rootTokens: tokensName, adoptedFrom: config.rootTokens == null && config.rootVariation != null ? config.rootVariation : null },
    css: { rules: synth.rules, unsupported: synth.unsupported, regionChanged: cssAfter !== cssBefore }
  }
  return { writes, report }
}

/** Write the planned files: each through a temporary file and a rename; on any failure, put back what was written. */
export function apply(writes) {
  const done = []
  try {
    for (const w of writes) {
      if (!w.changed) continue
      const tmp = path.join(path.dirname(w.path), `.${w.name}.prepass-${process.pid}.tmp`)
      writeFileSync(tmp, w.after)
      renameSync(tmp, w.path)
      done.push(w)
    }
  } catch (e) {
    revert(done)
    for (const w of writes) {
      const tmp = path.join(path.dirname(w.path), `.${w.name}.prepass-${process.pid}.tmp`)
      if (existsSync(tmp)) unlinkSync(tmp)
    }
    throw e
  }
  return done.map((w) => w.path)
}

/** Put back what `apply` wrote, last first. Best effort: the caller names the failure that led here. */
export function revert(writes) {
  for (const w of [...writes].reverse()) {
    if (!w.changed) continue
    try {
      if (w.before === null) unlinkSync(w.path)
      else writeFileSync(w.path, w.before)
    } catch {
      // the caller's error names the failure; nothing more can be done here
    }
  }
}

/**
 * Where --report may go, checked before anything is written: an existing directory outside the
 * overlay, and a path that is not a symlink (a link would carry the report into a file the pre-pass
 * never declared). Returns the reason it may not, or null.
 */
function reportRefusal(report, overlay) {
  const overlayReal = realpathSync(overlay)
  const dir = path.dirname(path.resolve(report))
  if (!existsSync(dir) || !lstatSync(realpathSync(dir)).isDirectory()) return `--report ${report}: its directory does not exist`
  // the overlay is compared by its real path, so the report's directory must be too (/var → /private/var)
  const abs = path.join(realpathSync(dir), path.basename(report))
  if (abs === overlayReal || abs.startsWith(overlayReal + path.sep)) return '--report must be outside the overlay (the pre-pass writes only its declared files there)'
  if (existsSync(abs) || lstatExists(abs)) {
    const st = lstatSync(abs)
    if (st.isSymbolicLink()) return `--report ${report} is a symlink; the report is written only to a plain file`
    if (!st.isFile()) return `--report ${report} is not a file`
  }
  return null
}

const lstatExists = (p) => {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
}

function formatSummary(report, { dryRun = false } = {}) {
  const t = report.tokens
  const lines = [
    `prepass${dryRun ? ' (dry run — nothing written)' : ''}: contract ${report.contract.id} r${String(report.contract.revision)} ${report.contract.variant}, map ${report.map}`,
    `tokens: ${String(t.measured.length)} measured, ${String(t.fallback.length)} fallback, ${String(t.changed.length)} changed${t.changed.length ? ` (${t.changed.map((c) => `${c.name} ${c.from ?? '∅'} → ${c.to}`).slice(0, 12).join('; ')}${t.changed.length > 12 ? '; …' : ''})` : ''}`,
    `css: ${String(report.css.rules.length)} rules, ${String(report.css.rules.reduce((n, r) => n + r.declarations.length, 0))} declarations, ${String(report.css.unsupported.length)} unsupported`
  ]
  for (const u of report.css.unsupported) lines.push(`  unsupported ${u.rule}${u.variant ? ` @${u.variant}` : ''}${u.property ? ` ${u.property}` : ''}: ${u.reason}`)
  for (const f of report.files) lines.push(`${f.changed ? (dryRun ? 'would change' : 'changed') : 'unchanged'} ${f.path}`)
  return lines.join('\n')
}

function main(argv) {
  const args = {}
  const flags = new Set(['--dry-run', '--adopt-root-tokens', '--replace-tokens'])
  const valued = new Set(['--contract', '--overlay', '--fallback', '--map', '--variant', '--report'])
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (flags.has(a)) args[a.slice(2)] = true
    else if (valued.has(a)) {
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('--')) {
        console.error(`prepass: ${a} needs a value`)
        return 2
      }
      args[a.slice(2)] = v
      i += 1
    } else {
      console.error(`prepass: unknown argument ${a}`)
      return 2
    }
  }
  if (!args.contract || !args.overlay || !args.fallback || !args.map) {
    console.error('usage: prepass.mjs --contract <design-contract.json> --overlay <overlay dir> --fallback <vendor tokens.css> --map <prepass.map.json> [--variant desktop-light] [--report file.json] [--dry-run] [--adopt-root-tokens] [--replace-tokens]')
    return 2
  }
  const read = (file, what) => {
    try {
      return readFileSync(file, 'utf8')
    } catch (e) {
      throw new Error(`${what} ${file}: ${e.message}`)
    }
  }
  let contract
  let map
  let fallback
  try {
    contract = JSON.parse(read(args.contract, '--contract'))
    validateDesign(contract)
    map = JSON.parse(read(args.map, '--map'))
    fallback = parseTokensCss(read(args.fallback, '--fallback'))
    if (!existsSync(args.overlay) || !lstatSync(realpathSync(args.overlay)).isDirectory()) throw new Error(`--overlay ${args.overlay}: no such directory`)
  } catch (e) {
    console.error(`prepass: ${e.message}`)
    return 2
  }
  const holes = TOKEN_NAMES.filter((n) => typeof fallback[n] !== 'string')
  if (holes.length) {
    console.error(`prepass: --fallback ${args.fallback}: not a complete token file, missing ${holes.join(', ')}`)
    return 2
  }
  const mapErrors = validateMap(map, contract)
  if (mapErrors.length) {
    console.error(`prepass: --map ${args.map}:\n  ${mapErrors.join('\n  ')}`)
    return 2
  }
  if (args.report) {
    const why = reportRefusal(args.report, args.overlay)
    if (why) {
      console.error(`prepass: ${why}`)
      return 2
    }
  }
  let planned
  try {
    planned = plan({
      contract,
      contractName: path.basename(args.contract),
      overlay: args.overlay,
      fallback,
      fallbackName: `${path.basename(path.dirname(path.resolve(args.fallback)))}/${path.basename(args.fallback)}`,
      map,
      mapName: path.basename(args.map),
      variant: args.variant ?? 'desktop-light',
      adoptRootTokens: Boolean(args['adopt-root-tokens']),
      replaceTokens: Boolean(args['replace-tokens'])
    })
  } catch (e) {
    console.error(`prepass: refused — ${e.message}`)
    return 1
  }
  const { writes, report } = planned
  report.dryRun = Boolean(args['dry-run'])
  report.written = args['dry-run'] ? [] : writes.filter((w) => w.changed).map((w) => w.path)
  // the report is written beside its target first, so a report that cannot be written stops the
  // run before the overlay changes; it takes its place (rename, never through a link) after
  const reportTmp = args.report ? path.join(path.dirname(path.resolve(args.report)), `.${path.basename(args.report)}.prepass-${process.pid}.tmp`) : null
  if (reportTmp) {
    try {
      writeFileSync(reportTmp, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
    } catch (e) {
      console.error(`prepass: --report ${args.report}: cannot be written, nothing applied — ${e.message}`)
      return 1
    }
  }
  const dropTmp = () => {
    if (reportTmp && lstatExists(reportTmp)) unlinkSync(reportTmp)
  }
  if (!args['dry-run']) {
    try {
      apply(writes)
    } catch (e) {
      dropTmp()
      console.error(`prepass: write failed, earlier writes put back — ${e.message}`)
      return 1
    }
  }
  if (reportTmp) {
    try {
      renameSync(reportTmp, path.resolve(args.report))
    } catch (e) {
      if (!args['dry-run']) revert(writes)
      dropTmp()
      console.error(`prepass: --report ${args.report}: cannot be written, the overlay writes put back — ${e.message}`)
      return 1
    }
  }
  console.log(formatSummary(report, { dryRun: Boolean(args['dry-run']) }))
  return 0
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)))
}
