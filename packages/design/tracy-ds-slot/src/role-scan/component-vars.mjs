/**
 * The role of ONE definition of a component's colour variable (`hints.mjs` `isComponentVar`): JA
 * Kinetic's T4 sets `--t4-btn-bg: #0d6efd` on `.btn-primary` and `#f8f9fa` on `.btn-light`, so the
 * name alone (`…-bg`) says only WHAT it paints, never which role (the dry run of 15/10/2026 sent the
 * primary button to the page ground). PURE.
 *
 * The role comes from the rule that sets it: what the last word paints (a fill, a text, a line), the
 * state words (`hover`, `active`, `disabled`), the family the selector names (`.btn-primary`, a status
 * class), and for a text the fill the same rule sets beside it (`--t4-btn-color` beside `--t4-btn-bg`).
 */
import { chromaOf, SATURATED } from '../auto-palette.mjs'
import { parseColour } from './literals.mjs'
import { genericRole, lumOf } from './palette.mjs'
import { statusOf } from './hints.mjs'

const c = (r) => `--ds-c-${r}`
const words = (s) =>
  String(s ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
const FAMILY = /^(primary|brand|accent|cta)$/

/** What the variable paints, from its words. */
export function paintOf(name) {
  const w = words(name)
  if (w.includes('border') || w.includes('outline')) return 'line'
  const last = w[w.length - 1]
  if (/^(bg|background|fill)$/.test(last)) return 'fill'
  if (/^(color|colour|text|fg)$/.test(last)) return 'text'
  return null
}

/**
 * @param {{ name: string, hex: string, selector?: string, scheme?: string, rule?: string }} f
 * @param {{ grounds: object, siblings?: (rule: string) => { prop: string, value: string }[] }} ctx
 * @returns {string | null}
 */
export function componentVarRole(f, ctx, depth = 0) {
  const kind = paintOf(f.name)
  if (!kind || !f.hex) return null
  const w = words(f.name)
  const hover = w.some((x) => /^(hover|focus)$/.test(x))
  const active = w.some((x) => /^(active|pressed|checked)$/.test(x))
  if (w.includes('disabled'))
    return kind === 'fill' ? c('disabled-bg') : kind === 'text' ? c('disabled-fg') : null
  const sel = `${f.selector ?? ''}${hover ? ':hover' : active ? ':active' : ''}`
  const lum = lumOf(f.hex)
  const sat = chromaOf(f.hex) >= SATURATED
  const status = statusOf(f.selector)
  const pair = kind === 'text' && depth === 0 ? siblingGround(f, ctx) : null
  // a status component: its solid fill is the state colour (`.btn-success`), a pale one its ground
  // (`.alert-success`); a text on the solid state fill has no role
  if (status) {
    if (kind === 'fill') return sat ? c(status) : lum > 0.7 ? c(`${status}-bg`) : null
    if (kind === 'line') return c(status)
    return pair === c(status) ? null : c(`${status}-text`)
  }
  const family = [...words(f.selector), ...w].some((x) => FAMILY.test(x))
  if (family) {
    if (kind === 'fill' && sat) return hover ? c('accent-hover') : active ? c('accent-active') : c('accent')
    if (kind === 'line' && sat) return c('accent')
    if (kind === 'text') {
      if (pair && /^--ds-c-accent(-hover|-active)?$/.test(pair)) return c('accent-on')
      if (sat) return hover ? c('accent-text-hover') : c('accent-text')
      return null
    }
  }
  return genericRole({ hex: f.hex, kind, selector: sel, scheme: f.scheme, pair }, ctx.grounds)
}

/** The role of the fill the same rule sets for the same state (`--t4-btn-hover-bg` for `--t4-btn-hover-color`). */
function siblingGround(f, ctx) {
  if (!f.rule || !ctx.siblings) return null
  const stem = f.name.replace(/-(color|colour|text|fg)$/i, '')
  const d = ctx.siblings(f.rule).find((x) => x.prop === `${stem}-bg` || x.prop === `${stem}-background`)
  const lit = d && parseColour(d.value.replace(/^var\(\s*--ds-[\w-]+\s*,\s*(.+)\)$/s, '$1'))
  if (!lit || lit.alpha < 0.9) return null
  return componentVarRole({ ...f, name: d.prop, hex: lit.hex }, ctx, 1)
}
