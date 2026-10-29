// The CSS that repaints a template's brand colours with the logo's palette (spec TracyHQ/tracy#189, ADR 0023 amended
// 29/10/2026), from the stylesheets and pages a site serves. The brand colour is measured (`brand-colour-measure.mjs`);
// here every declaration that resolves to it, or to a shade of it on a role that wears it (a hover a LESS compile
// darkened), is declared again under the same selector and media, reading a Tracy variable for its role:
//
//   --tracy-brand-<n>-text   words and links (4.5:1 on the page ground)
//   --tracy-brand-<n>-fill   buttons, blocks, borders, overlays (3:1 on the page ground, its words 4.5:1 on it)
//   --tracy-brand-<n>-on     the words on a fill whose template words would not read on it
//   --tracy-brand-<n>-line   a drawing in the template's markup (an inline SVG's fill or stroke)
//
// `n` is 0 for the primary brand colour and 1 for a secondary. The variables are set once for the page as it opens
// (`:root`) and again under each side the template can switch to (`.light-active`, `[data-bs-theme=dark]`, the dark
// colour-scheme media), each with the tones that read on THAT side's ground; a variable the template itself declares
// with its brand colour (T4 `--color-primary`) is set the same way. Status colours and every grey stay the template's.
import { contrastOf, hexOf, hslOf, hueGapOf, rgbOf, rgbOfHsl, toneOf } from './brand-colour-maths.mjs'
import { colourRoles } from './brand-colours.mjs'
import { cssRules } from './brand-colour-css-rules.mjs'
import { onPicture, pictureGround, pictureScopesOf } from './brand-colour-pictures.mjs'
import {
  coloursIn,
  itemsOf,
  resolveVars,
  same,
  sideOfRule,
  STATUS,
  strong,
  templateBrandColours
} from './brand-colour-measure.mjs'

export { cssRules, resolveVars, templateBrandColours }

const TEXT_PROPS = new Set([
  'color',
  '-webkit-text-fill-color',
  'text-decoration-color',
  'caret-color',
  'text-emphasis-color'
])
const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\([^()]*\)/gi
/**
 * Declarations never re-declared: an icon font's glyph (`content`, `font-*`), a picture or mask (`mask-*`, `list-style-*`,
 * `border-image-*`, `cursor`). Re-declaring them in the head block would change what they draw or where their `url()`
 * resolves; an icon drawn that way takes the brand colour through its `color` or `background-color`, never through them.
 */
const NEVER =
  /^(?:content|quotes|src|cursor|font(?:-.*)?|(?:-webkit-)?mask(?:-.*)?|list-style(?:-.*)?|border-image(?:-.*)?)$/
const URL = /url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\)/gi
const TRIPLET = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/

/** A selector item without its states, so `a:hover` and `.nav .active>a` share the role of `a` and `.nav a`. */
const roleKey = (item) =>
  item
    .replace(
      /:(?:hover|focus|focus-visible|focus-within|active|visited)\b|\.(?:active|current|show|open)\b/g,
      ''
    )
    .trim()

/**
 * The CSS, or '' when there is no palette or the stylesheets show no brand colour. `pages` (their HTML) add the inline
 * SVG the template's markup draws in the brand colour (`fill`, `stroke`, `stop-color` attributes, which any rule outranks).
 * @param {{styles: Array<{css: string}>, palette: {primary: string, secondary?: string} | null | undefined,
 *   pages?: Array<{html: string}>}} input
 * @returns {string}
 */
export function brandColourCss({ styles, palette, pages = [] }) {
  if (!palette?.primary) return ''
  const found = templateBrandColours(styles ?? [])
  if (!found.primary) return ''
  const { rules, sides, status } = found
  const targets = [{ t: /** @type {any} */ (rgbOf(found.primary)), p: palette.primary }]
  if (found.secondary && palette.secondary)
    targets.push({ t: /** @type {any} */ (rgbOf(found.secondary)), p: palette.secondary })
  const base = /** @type {any} */ (sides.get('base'))
  // Words in the brand colour on a picture (a hero photograph under an overlay) take the `picture` tone, the same on every
  // side, judged against the picture rather than the page ground.
  const { scopes, overlays } = pictureScopesOf(rules, pages)
  const onPhoto = pictureGround(overlays)
  const memo = new Map()
  const rolesOf = (n, side) => {
    const key = `${n}:${side}`
    if (!memo.has(key)) {
      const at = sides.get(side) ?? base
      const own = [...at.grounds, ...at.panels]
      const others = [...new Set([...sides.values()].flatMap((x) => x.grounds))].filter(
        (g) => !own.includes(g)
      )
      memo.set(
        key,
        colourRoles(targets[n].p, {
          grounds: own,
          on: found.on,
          alsoOn: found.ons.slice(1),
          others,
          picture: onPhoto
        })
      )
    }
    return memo.get(key)
  }
  /** The tone of variable `name` on `side`. */
  const vars = new Map()
  const toneOn = (name, side) => {
    const { n, kind, shade } = vars.get(name)
    const tone = rolesOf(n, side)[kind]
    if (!shade) return tone
    // A shade keeps its step from the brand colour; a step that would leave the hue (into black or white) goes the other
    // way, so a very dark or very light palette still shows its hover.
    const { h, s, l } = hslOf(/** @type {any} */ (rgbOf(tone)))
    const step = hslOf(shade).l - hslOf(targets[n].t).l
    const at = l + step >= 0.1 && l + step <= 0.9 ? l + step : Math.min(0.9, Math.max(0.1, l - step))
    const here = sides.get(side) ?? base
    const G = kind === 'picture' ? [rgbOf(onPhoto)] : [...here.grounds, ...here.panels].map(rgbOf)
    const bar = kind === 'picture' ? 7 : kind === 'text' ? 4.5 : 3
    return hexOf(
      toneOf(
        rgbOfHsl(h, s, at),
        (x) => G.every((g) => contrastOf(x, g) >= bar),
        () => 0
      )
    )
  }
  const shades = new Map()
  /** The variable standing in for `c` in a `kind` role, or null when `c` is no brand colour here. */
  const varFor = (c, kind, shaded) => {
    const n = targets.findIndex(
      (x) =>
        same(c, x.t) ||
        (shaded &&
          strong(c) &&
          !status.has(hexOf(c)) &&
          hueGapOf(c, x.t) <= 8 &&
          Math.abs(hslOf(c).s - hslOf(x.t).s) <= 0.3)
    )
    if (n < 0) return null
    const shade = same(c, targets[n].t) ? null : c
    if (shade && !shades.has(hexOf(shade))) shades.set(hexOf(shade), shades.size + 1)
    const name = `--tracy-brand-${n}-${kind}${shade ? `-shade-${shades.get(hexOf(shade))}` : ''}`
    vars.set(name, { n, kind, shade })
    const alpha = c.a ?? 1
    return alpha >= 1
      ? `var(${name})`
      : `color-mix(in srgb,var(${name}) ${Math.round(alpha * 1000) / 10}%,transparent)`
  }
  // A variable read only by text properties is a text tone; one read by anything else is a fill.
  const textUse = new Set()
  const fillUse = new Set()
  for (const r of rules)
    for (const d of r.decls)
      for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g))
        if (TEXT_PROPS.has(d.prop)) textUse.add(m[1])
        else if (!d.prop.startsWith('--')) fillUse.add(m[1])
  const kindOf = (prop) =>
    prop.startsWith('--')
      ? textUse.has(prop) && !fillUse.has(prop)
        ? 'text'
        : 'fill'
      : TEXT_PROPS.has(prop)
        ? 'text'
        : 'fill'
  // The roles that wear a brand colour exactly: a shade is repainted only on one of them.
  const worn = new Set()
  for (const r of rules) {
    const v = sides.get(sideOfRule(r))?.vars ?? base.vars
    if (
      r.decls.some((d) => coloursIn(resolveVars(d.value, v)).some((c) => targets.some((x) => same(c, x.t))))
    )
      for (const s of itemsOf(r.selector)) worn.add(roleKey(s))
  }
  const out = []
  // Template variables holding the brand colour: set again on every side with that side's tone.
  const ownVars = new Map()
  let readsDs = false
  const filledItems = new Set()
  for (const r of rules) {
    const side = sideOfRule(r)
    const v = sides.get(side)?.vars ?? base.vars
    const shaded = itemsOf(r.selector).every((s) => worn.has(roleKey(s)))
    const pictured = itemsOf(r.selector).every((s) => onPicture(s, scopes))
    if (itemsOf(r.selector).every((s) => STATUS.test(s))) continue
    const decls = []
    let filled = false
    r.decls.forEach((d, n) => {
      if (STATUS.test(d.prop)) return
      const resolved = resolveVars(d.value, v)
      if (d.prop.startsWith('--')) {
        const triplet = TRIPLET.exec(resolved)
        const c = triplet ? { r: +triplet[1], g: +triplet[2], b: +triplet[3] } : rgbOf(resolved)
        const name = c && targets.some((x) => same(c, x.t)) ? varFor(c, kindOf(d.prop), false) : null
        if (!name || !c) return
        ownVars.set(d.prop, { name: name.slice(4, -1), triplet: Boolean(triplet) })
        const tone = toneOn(name.slice(4, -1), side)
        decls.push({ ...d, n, value: triplet ? channels(tone) : tone })
        return
      }
      if (NEVER.test(d.prop)) return
      const kind = pictured && kindOf(d.prop) === 'text' ? 'picture' : kindOf(d.prop)
      // A value holding a picture (`url()`) is never declared again: its address would resolve against the page instead of
      // the stylesheet, and the colours inside a data URI are part of the picture. A `background` shorthand gives up only
      // its colour, re-declared alone as `background-color`.
      if (/url\(/i.test(resolved)) {
        if (d.prop !== 'background') return
        const bare = resolved.replace(URL, ' ').replace(/[\w-]*gradient\((?:[^()]|\([^()]*\))*\)/gi, ' ')
        const c = coloursIn(bare)[0]
        const name = c && varFor(c, 'fill', shaded)
        if (!name) return
        filled = true
        decls.push({ ...d, n, prop: 'background-color', value: name })
        return
      }
      let hit = false
      const value = resolved.replace(COLOUR, (m) => {
        const c = rgbOf(m)
        const name = c && varFor(c, kind, shaded)
        if (!name) return m
        hit = true
        if (d.prop.startsWith('background')) filled = true
        return name
      })
      if (!hit) return
      if (d.value.includes('var(--ds-c-accent')) readsDs = true
      decls.push({ ...d, n, value })
    })
    // Words the template wrote on its brand colour that would not read on the new fill take the fill's own words.
    const at = filled ? r.decls.findIndex((d) => d.prop === 'color') : -1
    if (at >= 0 && !decls.some((d) => d.prop === 'color')) {
      const c = coloursIn(resolveVars(r.decls[at].value, v))[0]
      if (c && contrastOf(c, rolesOf(0, side).fill) < 4.5) {
        vars.set('--tracy-brand-0-on', { n: 0, kind: 'on', shade: null })
        decls.push({ ...r.decls[at], n: at, value: 'var(--tracy-brand-0-on)' })
      }
    }
    if (filled) for (const s of itemsOf(r.selector)) filledItems.add(s)
    if (decls.length) {
      decls.sort((a, b) => a.n - b.n)
      out.push(wrap(r.at, `${r.selector}{${decls.map(declText).join(';')}}`))
    }
  }
  // The same words written by ANOTHER rule of a part now filled with the brand colour (`.btn.btn-primary{color:...}` beside
  // its own background rule) take the fill's words too when they would not read on it.
  for (const r of rules) {
    const items = itemsOf(r.selector).filter((s) => filledItems.has(s))
    const at = items.length ? r.decls.findLastIndex((d) => d.prop === 'color') : -1
    if (at < 0) continue
    const side = sideOfRule(r)
    const c = coloursIn(resolveVars(r.decls[at].value, sides.get(side)?.vars ?? base.vars))[0]
    if (!c || targets.some((x) => same(c, x.t)) || contrastOf(c, rolesOf(0, side).fill) >= 4.5) continue
    vars.set('--tracy-brand-0-on', { n: 0, kind: 'on', shade: null })
    out.push(
      wrap(r.at, `${items.join(',')}{${declText({ ...r.decls[at], value: 'var(--tracy-brand-0-on)' })}}`)
    )
  }
  // SVG drawn in the template's markup with the brand colour as a presentation attribute.
  const marks = new Map()
  for (const page of pages ?? [])
    for (const m of String(page?.html ?? '').matchAll(
      /\s(fill|stroke|stop-color)\s*=\s*["'](#[0-9a-f]{3,8}|rgba?\([^)"']*\))["']/gi
    )) {
      const c = rgbOf(m[2])
      const n = c ? targets.findIndex((x) => same(c, x.t)) : -1
      if (n < 0) continue
      vars.set(`--tracy-brand-${n}-line`, { n, kind: 'line', shade: null })
      marks.set(`[${m[1].toLowerCase()}="${m[2]}" i]`, `${m[1].toLowerCase()}:var(--tracy-brand-${n}-line)`)
    }
  for (const [selector, decl] of marks) out.push(`${selector}{${decl}}`)
  if (!out.length) return ''
  // The values, for the page as it opens and for each side it can switch to.
  const block = (side) => {
    const values = [...vars.keys()].map((name) => `${name}:${toneOn(name, side)}`)
    for (const [prop, own] of ownVars)
      values.push(`${prop}:${own.triplet ? channels(toneOn(own.name, side)) : toneOn(own.name, side)}`)
    if (readsDs) {
      const r = rolesOf(0, side)
      values.push(
        `--ds-c-accent:${r.fill}`,
        `--ds-c-accent-hover:${r.hover}`,
        `--ds-c-accent-active:${r.active}`,
        `--ds-c-accent-on:${r.on}`,
        `--ds-c-accent-text:${r.text}`,
        `--ds-c-accent-text-hover:${r.textHover}`
      )
    }
    return values.join(';')
  }
  out.push(`:root{${block('base')}}`)
  for (const side of sides.keys()) {
    if (side === 'base') continue
    const body = block(side)
    out.push(side.startsWith('@media') ? `${side}{:root{${body}}}` : `${side}{${body}}`)
  }
  return out.join('\n').replace(/</g, '')
}

const channels = (hex) => {
  const c = /** @type {any} */ (rgbOf(hex))
  return `${c.r},${c.g},${c.b}`
}
const declText = (d) => `${d.prop}:${d.value}${d.important ? ' !important' : ''}`
const wrap = (at, inner) => at.reduceRight((body, prelude) => `${prelude}{${body}}`, inner)
