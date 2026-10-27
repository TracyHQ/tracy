#!/usr/bin/env node
// synth-css.mjs — propose theme CSS from a visual-qa run's parity data.
//
//   node scripts/visual/synth-css.mjs <run dir> <theme.json> [--min 2] [--scope .tracy]
//
// For every element class signature (`p.tracy-lead.mb-0`) whose parity findings all agree on the
// source value of a property, on EVERY component that carries the signature (a signature that
// passes somewhere is left alone), emit one declaration. Colours map to palette presets and
// families to font presets; a value with no preset is skipped for colour/family (a raw hex in a
// theme is a second palette). A bare signature (`a`, `p`, `h3`) is skipped: it needs context.
//
// WHY THE :not(). A class selector matches any element that carries AT LEAST those classes. On
// Tracy Base (25/09) a rule written for `p.tracy-lead.mb-0.has-text-align-center` also recoloured
// the final call to action's `p.tracy-lead.mb-0.has-text-align-center.text-inherit` — one of the
// two regressions of that round. Every other signature measured in the run that is a SUPERSET of
// the emitted one, and does not ask for the same value, is excluded by one of its extra classes.
//
// LIMIT: the report names an element by its tag and at most its first classes, so a superset the
// descriptor cut off is invisible here (the same round's other regression: a lead whose descriptor
// read `p.tracy-lead.text-inherit.opacity-90` also carried the emitted rule's classes). The
// targeted round after the change is what catches those.
//
// The output is a proposal to read, not a patch to apply blind: it goes into the overlay CSS,
// then a targeted round (round.mjs) measures what it closed and what it opened.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SKIP = /^(a|p|h[1-6]|li|span|div|p\.wp-block-paragraph|h[1-6]\.wp-block-heading)$/
const esc = (cls) => cls.replace(/([[\]/:.()%#!])/g, '\\$1')
const hex = (rgb) => {
  const m = String(rgb).match(/^rgb\((\d+), (\d+), (\d+)\)$/)
  return m ? `#${m.slice(1).map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : null
}
const parse = (s) => {
  const [tag, ...cls] = s.split('.')
  return { tag, cls }
}

/** Signature → { n, pages, props: prop → Map(expected → count), fontSize } over every measured component. */
function signatures(report) {
  const sig = new Map()
  for (const p of report.pages ?? [])
    for (const a of p.axes ?? [])
      for (const c of a.components ?? []) {
        const s = String(c.element ?? '').split(' "')[0]
        if (!s) continue
        const e = sig.get(s) ?? { n: 0, pages: new Set(), props: new Map(), fontSize: new Map() }
        e.n++
        e.pages.add(p.id)
        for (const d of c.deltas ?? []) {
          const m = e.props.get(d.property) ?? new Map()
          m.set(d.expected, (m.get(d.expected) ?? 0) + 1)
          e.props.set(d.property, m)
          if (d.property === 'font-size') e.fontSize.set(d.expected, true)
        }
        sig.set(s, e)
      }
  return sig
}

/** The declarations a signature agrees on everywhere it appears: prop → [css value, source value]. */
function agreed(e, { min, palette, families }) {
  const decl = new Map()
  for (const [prop, vals] of e.props) {
    if (vals.size !== 1) continue
    const [value, count] = [...vals][0]
    if (count !== e.n || count < Math.min(min, e.n)) continue
    let css = value
    if (prop.includes('color')) {
      const h = hex(value)
      if (h && palette.has(h)) css = `var(--wp--preset--color--${palette.get(h)})`
      else continue
    }
    if (prop === 'font-family') {
      const first = value.split(',')[0].replace(/["']/g, '').trim()
      const f = families.find(([, name]) => name === first)
      if (!f) continue
      css = `var(--wp--preset--font-family--${f[0]})`
    }
    if (prop === 'line-height') {
      const fs = [...e.fontSize.keys()][0]
      if (!fs) continue
      css = String(Math.round((Number.parseFloat(value) / Number.parseFloat(fs)) * 1000) / 1000)
    }
    decl.set(prop, [css, value])
  }
  return decl
}

/** Proposed rules: [{ signature, selector, declarations, count, pages, excluded }]. Pure. */
export function synthCss(report, theme, { min = 2, scope = '.tracy' } = {}) {
  const palette = new Map((theme?.settings?.color?.palette ?? []).map((p) => [String(p.color).toLowerCase(), p.slug]))
  const families = (theme?.settings?.typography?.fontFamilies ?? []).map((f) => [f.slug, String(f.fontFamily).split(',')[0].replace(/["']/g, '').trim()])
  const sig = signatures(report)
  const rules = []
  for (const [s, e] of [...sig].sort(([a], [b]) => a.localeCompare(b))) {
    if (SKIP.test(s)) continue
    const decl = agreed(e, { min, palette, families })
    if (!decl.size) continue
    const { tag, cls } = parse(s)
    const excluded = []
    for (const [t, other] of sig) {
      if (t === s) continue
      const o = parse(t)
      if (o.tag !== tag || !cls.every((c) => o.cls.includes(c))) continue
      const theirs = agreed(other, { min: 1, palette, families })
      const same = [...decl].every(([prop, [, value]]) => theirs.get(prop)?.[1] === value)
      if (same) continue
      const extra = o.cls.find((c) => !cls.includes(c))
      if (extra && !excluded.includes(extra)) excluded.push(extra)
    }
    const selector = `${scope} ${tag}${cls.map((c) => `.${esc(c)}`).join('')}${excluded.map((c) => `:not(.${esc(c)})`).join('')}`
    rules.push({ signature: s, selector, declarations: [...decl].map(([prop, [css]]) => [prop, css]), count: e.n, pages: [...e.pages], excluded })
  }
  return rules
}

export function formatRules(rules) {
  return rules
    .map(
      (r) =>
        `/* ${r.signature} — ${r.count} on ${r.pages.map((x) => x.replace(/^en-/, '')).join(', ')}${r.excluded.length ? ` · not ${r.excluded.join(', ')}` : ''} */\n${r.selector} {\n${r.declarations.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}`
    )
    .join('\n\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [run, themeJson] = process.argv.slice(2)
  if (!run || !themeJson) {
    console.error('usage: synth-css.mjs <run dir> <theme.json> [--min 2] [--scope .tracy]')
    process.exit(2)
  }
  const opt = (name, d) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : d)
  const report = JSON.parse(readFileSync(`${run}/visual.json`, 'utf8'))
  const theme = JSON.parse(readFileSync(themeJson, 'utf8'))
  console.log(formatRules(synthCss(report, theme, { min: Number(opt('--min', 2)), scope: opt('--scope', '.tracy') })))
}
