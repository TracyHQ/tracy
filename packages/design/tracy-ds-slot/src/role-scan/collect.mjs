/**
 * One file → its raw findings (every colour, radius and font literal with where it sits) and what
 * the palette analysis needs from it: the template's colour variables, their uses, the variables that
 * rename others, and the role variables already read. PURE (text in, records out).
 */
import { declarationsOf, lineIndex, markupDeclarations } from './css-lexer.mjs'
import {
  coloursIn,
  isFontLiteral,
  isFontProp,
  isRadiusLiteral,
  isRadiusProp,
  kindOf,
  parseColour
} from './literals.mjs'
import { classFindings } from './collect-classes.mjs'
import { inPreprocessorFunction } from './sass.mjs'
import { themeJsonDeclarations } from './theme-json.mjs'

/**
 * @param {{ rel: string, kind: string }} file @param {string} text
 * @param {{ twConfig?: { colours: Map<string, string>, radius: Map<string, string> } | null }} [opts]
 *   twConfig: the Tailwind 3 theme read from the template's config (`tailwind-config.mjs`)
 * @returns {{ raw: object[], defs: object[], uses: object[], aliases: [string, string][], declared: string[], decls: object[], themeUses: object[], wrapped: object[] }}
 *   wrapped: values already behind a role read, for the palette only (never findings)
 */
export function collectFile(file, text, opts = {}) {
  const line = lineIndex(text)
  const css = ['css', 'scss', 'less'].includes(file.kind)
  const pre = file.kind === 'scss' || file.kind === 'less'
  const classes = file.kind === 'markup' || file.kind === 'script'
  const decls = css
    ? declarationsOf(text, { lineComments: file.kind !== 'css' })
    : file.kind === 'markup'
      ? markupDeclarations(text)
      : file.kind === 'theme-json'
        ? themeJsonDeclarations(text)
        : []
  const raw = []
  const defs = []
  const uses = []
  const aliases = []
  const declared = [...text.matchAll(/var\(\s*(--ds-[\w-]+)/g)].map((m) => m[1])
  // the template's own value behind a role read it already has (`background: var(--ds-c-bg, #fff)`,
  // `font-family: var(--ds-font-body, "Inter")`): read as the literal it was, so a page already
  // converted by --write gives the palette and the faces it gave before
  const wrapped = []
  for (const d of decls) {
    // an @font-face block names and loads a face: its family name is the face's own name, and
    // var() there drops the face (WordPress conversion, 15/10/2026)
    if (d.atRules.some((a) => /^@font-face/i.test(a))) continue
    const ruleId = `${file.rel}#${d.rule}`
    const kind = kindOf(d.prop)
    const base = {
      file: file.rel,
      prop: d.prop,
      selector: d.selector,
      scheme: d.scheme,
      rule: ruleId,
      source: 'css',
      lang: file.kind,
      value: d.value,
      ...(kind === 'custom' ? { name: d.prop } : {})
    }
    // theme.json reads a preset as `var:preset|color|base` (= var(--wp--preset--color--base))
    const refs = [
      ...d.value.matchAll(
        /var\(\s*(--(?!ds-)[\w-]+)|(?<![\w-])(\$[\w-]+)|(?<![\w-])@([\w-]+)|var:(preset|custom)\|([\w|-]+)/g
      )
    ]
      .map(
        (m) =>
          m[1] ?? m[2] ?? (m[3] ? `@${m[3]}` : m[4] ? `--wp--${m[4]}--${m[5].split('|').join('--')}` : null)
      )
      .filter(Boolean)
    for (const name of refs)
      uses.push({ name, kind, selector: d.selector, scheme: d.scheme, rule: ruleId, prop: d.prop })
    if (
      kind === 'custom' &&
      /^(var\(\s*--[\w-]+\s*\)|\$[\w-]+|@[\w-]+|var:(preset|custom)\|[\w|-]+)$/.test(d.value.trim()) &&
      refs.length === 1
    )
      aliases.push([d.prop, refs[0]])
    // a variable already converted (`--color-paper: var(--ds-c-bg, #f5f3ee)`) keeps telling the palette
    // its colour and role, so a second scan reads the same page as the first
    const conv =
      kind === 'custom' &&
      /^var\(\s*(--ds-c-[\w-]+)\s*,\s*([^()]+|(?:rgba?|hsla?)\([^()]*\))\s*\)$/.exec(d.value.trim())
    const convColour = conv && parseColour(conv[2])
    if (convColour)
      defs.push({
        name: d.prop,
        hex: convColour.hex,
        alpha: convColour.alpha,
        scheme: d.scheme,
        dsRole: conv[1]
      })
    if (isRadiusProp(d.prop) && isRadiusLiteral(d.value)) {
      raw.push({
        ...base,
        valueType: 'radius',
        kind: 'radius',
        start: d.start,
        end: d.end,
        text: d.value,
        line: line(d.start)
      })
      continue
    }
    const wrappedFont =
      isFontProp(d.prop) && /^var\(\s*--ds-font-[\w-]+\s*,\s*(.+)\)(\s*!important)?$/s.exec(d.value)
    if (wrappedFont) wrapped.push({ ...base, valueType: 'font', kind: 'font', text: wrappedFont[1] })
    if (isFontProp(d.prop) && isFontLiteral(d.prop, d.value)) {
      raw.push({
        ...base,
        valueType: 'font',
        kind: 'font',
        start: d.start,
        end: d.end,
        text: d.value,
        line: line(d.start)
      })
      continue
    }
    if (!kind) continue
    const { colours, wrapped: inReads } = coloursIn(d.value, kind)
    if (kind !== 'custom')
      for (const w of inReads)
        wrapped.push({ ...base, valueType: 'colour', kind, hex: w.hex, alpha: w.alpha })
    for (const col of mergeLightDark(d.value, colours)) {
      const at = d.start + col.index
      const scheme = col.arm ?? d.scheme
      const r = {
        ...base,
        valueType: 'colour',
        kind,
        start: at,
        end: at + col.text.length,
        text: col.text,
        hex: col.hex,
        alpha: col.alpha,
        inUrl: col.inUrl,
        scheme,
        ...(col.darkHex ? { darkHex: col.darkHex, darkAlpha: col.darkAlpha } : {}),
        ...(fallbackOf(d.value, col.index) ? { fallbackOf: fallbackOf(d.value, col.index) } : {}),
        line: line(at),
        ...(pre && inPreprocessorFunction(d.value, col.index) ? { preFn: true } : {})
      }
      if (kind === 'custom') {
        r.name = d.prop
        if (!col.inUrl && !r.preFn && colours.length === 1)
          defs.push({
            name: d.prop,
            hex: col.hex,
            alpha: col.alpha,
            scheme,
            wholeValue: d.value.trim() === col.text
          })
      }
      raw.push(r)
    }
  }
  const markup = classFindings(file, text, line, { css, classes, twConfig: opts.twConfig ?? null })
  raw.push(...markup.raw)
  return { raw, defs, uses, aliases, declared, decls, themeUses: markup.themeUses, wrapped }
}

/**
 * The two arms of one `light-dark(a, b)`, both literal, as ONE finding over the whole call: wrapped
 * whole (`var(--ds-c-fg, light-dark(#111, #eee))`) a system reads one role for both schemes; each arm
 * wrapped alone read the role twice and left the call's shape to the reader.
 */
function mergeLightDark(value, colours) {
  const out = []
  for (let i = 0; i < colours.length; i++) {
    const a = colours[i]
    const b = colours[i + 1]
    const open = a.arm === 'light' ? value.lastIndexOf('light-dark(', a.index) : -1
    if (open !== -1 && b?.arm === 'dark' && value.lastIndexOf('light-dark(', b.index) === open) {
      let depth = 0
      let close = -1
      for (let j = open + 'light-dark('.length; j < value.length; j++) {
        if (value[j] === '(') depth++
        else if (value[j] === ')' && depth-- === 0) {
          close = j
          break
        }
      }
      const text = close === -1 ? null : value.slice(open, close + 1)
      // only a call that holds nothing but the two literals
      if (text && text.replace(a.text, '').replace(b.text, '').replace(/[\s,]/g, '') === 'light-dark()') {
        out.push({ ...a, index: open, text, arm: 'light', darkHex: b.hex, darkAlpha: b.alpha })
        i++
        continue
      }
    }
    out.push(a)
  }
  return out
}

/** The template variable a literal is the fallback of (`var(--wp--preset--color--border, #ddd)`), or null. */
function fallbackOf(value, at) {
  let depth = 0
  for (let i = at - 1; i >= 0; i--) {
    if (value[i] === ')') depth++
    else if (value[i] === '(') {
      if (depth) {
        depth--
        continue
      }
      const m = /var\(\s*(--(?!ds-)[\w-]+)\s*,[^()]*$/.exec(value.slice(Math.max(0, i - 80), at))
      return m && value.slice(i - 3, i + 1) === 'var(' ? m[1] : null
    }
  }
  return null
}
