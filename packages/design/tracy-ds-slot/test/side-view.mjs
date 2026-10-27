// What one state of a two-mode switch sees of a sheet (side-merge.test.mjs, wordpress-worn-sheet.test.mjs):
// the rules that apply there, in order, so two sheets that should be the same page can be compared.
import { rulesOf } from '../src/side-merge.mjs'

/** Split at top-level commas. */
export function splitList(s) {
  const out = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(' || s[i] === '[') depth++
    else if (s[i] === ')' || s[i] === ']') depth--
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(start, i))
      start = i + 1
    }
  }
  out.push(s.slice(start))
  return out.map((x) => x.trim())
}

/**
 * What one state of the switch sees of a two-mode sheet: every rule that applies there, in order, as
 * `media|selectors{declarations}`, each side's condition met (and taken out) or not (the selector dropped),
 * the --dsv- variables read for that side, and their own blocks left out.
 * @param {string} css
 * @param {{ light: string, dark: string, auto: string | null }} sides
 * @param {{ light: boolean, dark: boolean, auto: boolean, osDark: boolean }} state
 */
export function sideView(css, sides, state) {
  const conds = [
    [sides.light, state.light],
    [sides.dark, state.dark],
    ...(sides.auto ? [[sides.auto, state.auto]] : [])
  ].sort((a, b) => b[0].length - a[0].length)
  const flat = []
  for (const rule of rulesOf(css)) {
    if (rule.startsWith('/*')) continue
    const open = rule.indexOf('{')
    const prelude = rule.slice(0, open).trim()
    if (prelude.startsWith('@media')) {
      if (/prefers-color-scheme:\s*dark/.test(prelude) && !state.osDark) continue
      const media = /prefers-color-scheme/.test(prelude) ? '' : prelude
      for (const inner of rulesOf(rule.slice(open + 1, -1))) flat.push([media, inner])
    } else flat.push(['', rule])
  }
  const vars = new Map()
  const out = []
  for (const [media, rule] of flat) {
    const open = rule.indexOf('{')
    const body = rule.slice(open + 1, -1)
    const selectors = splitList(rule.slice(0, open)).flatMap((sel) => {
      let s = sel
      for (const [c, met] of conds)
        if (s.includes(c)) {
          if (!met) return []
          s = s.split(c).join('')
        }
      return [s]
    })
    if (!selectors.length) continue
    if (body.startsWith('--dsv-')) {
      for (const d of body.split(';')) vars.set(d.slice(0, d.indexOf(':')), d.slice(d.indexOf(':') + 1))
      continue
    }
    out.push([media, selectors, body])
  }
  return out.map(
    ([media, selectors, body]) =>
      `${media}|${selectors.join(',')}{${body.replace(/var\((--dsv-[0-9a-z]+)\)/g, (_, v) => vars.get(v))}}`
  )
}

/** The states a template's switch can be in: its light side, its dark side, and "auto" under each OS. */
export function statesOf(sides) {
  const out = [
    { light: true, dark: false, auto: false, osDark: false },
    { light: true, dark: false, auto: false, osDark: true },
    { light: false, dark: true, auto: false, osDark: false },
    { light: false, dark: true, auto: false, osDark: true }
  ]
  if (sides.auto)
    out.push(
      { light: true, dark: false, auto: true, osDark: false },
      { light: true, dark: false, auto: true, osDark: true }
    )
  return out
}
