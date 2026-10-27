/**
 * The class lists of a markup or script file (`collect.mjs`): Tailwind colour, radius and font
 * classes as findings (each with the class list and opening tag it sits in, for pairing a text with
 * its element's ground), the template's theme colours they use, and SVG/style-attribute literals.
 * PURE (text in, records out).
 */
import { svgAndStyleFindings } from './markup-literals.mjs'
import { tailwindFindings } from './tailwind.mjs'

const UTIL =
  'bg|text|border(?:-[xytrblse])?|ring|outline|fill|stroke|decoration|divide|placeholder|caret|accent|from|via|to'
const THEME_USE = new RegExp(
  String.raw`(?<=^|[\s"'\x60{:!])(${UTIL})-([a-z][a-z0-9-]*)(?:\/\d+)?(?=$|[\s"'\x60}])`,
  'g'
)
const utilKind = (u) =>
  /^(text|placeholder|caret)$/.test(u)
    ? 'text'
    : /^(bg|accent|from|via|to)$/.test(u)
      ? 'fill'
      : /^(fill|stroke)$/.test(u)
        ? 'glyph'
        : 'line'

/**
 * @param {{ rel: string, kind: string }} file @param {string} text @param {(at: number) => number} line
 * @param {{ css: boolean, classes: boolean, twConfig: object | null }} opts
 *   css: a stylesheet (only its `@apply` is read); classes: a markup or script file
 * @returns {{ raw: object[], themeUses: object[] }}
 */
export function classFindings(file, text, line, { css, classes, twConfig }) {
  const raw = []
  if (classes || (css && /@apply/.test(text)))
    for (const f of tailwindFindings(text, { cssApplyOnly: css, config: twConfig })) {
      raw.push({
        ...f,
        file: file.rel,
        line: line(f.start),
        rule: null,
        scheme: /(^|:)dark:/.test(f.tw.variants) ? 'dark' : 'light',
        classString: classStringAt(text, f.start, f.end),
        tag: file.kind === 'css' ? '' : openingTagAt(text, f.start)
      })
    }
  const themeUses = []
  if (classes)
    for (const m of text.matchAll(THEME_USE)) {
      const cls = classStringAt(text, m.index, m.index + m[0].length)
      themeUses.push({
        name: `--color-${m[2]}`,
        kind: utilKind(m[1]),
        selector: m[0],
        scheme: 'light',
        classString: cls
      })
    }
  if (classes) raw.push(...svgAndStyleFindings(file, text, line))
  return { raw, themeUses }
}

/** The class list (quoted string) a class sits in, for pairing text with the ground of its element. */
export function classStringAt(text, start, end) {
  let s = start
  while (s > 0 && !/["'\x60\n]/.test(text[s - 1])) s--
  let e = end
  while (e < text.length && !/["'\x60\n]/.test(text[e])) e++
  return text.slice(s, e)
}

/** The opening tag of the element a class sits in (JSX braces and quotes skipped), or ''. */
export function openingTagAt(text, at) {
  const lt = text.lastIndexOf('<', at)
  if (lt === -1 || !/[A-Za-z]/.test(text[lt + 1] ?? '')) return ''
  let depth = 0
  let quote = ''
  for (let i = lt + 1; i < text.length && i < lt + 4000; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'" || ch === '`') quote = ch
    else if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === '>' && depth <= 0) return text.slice(lt, i + 1)
  }
  return ''
}
