/**
 * Colour literals a markup or component file writes outside any stylesheet: SVG presentation
 * attributes (`fill="#c8102e"`, flags and icons drawn inline) and JSX style objects (`color: '#fff'`).
 * PURE.
 */
import { kindOf, parseColour } from './literals.mjs'

/** Colour literals in SVG attributes (`fill="#c8102e"`) and JSX style objects (`color: '#fff'`). */
export function svgAndStyleFindings(file, text, line) {
  const out = []
  for (const m of text.matchAll(
    /\b(fill|stroke|stop-color|stopColor|color)\s*=\s*\{?\s*["'](#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\([^)"']*\)|white|black)["']/g
  )) {
    const c = parseColour(m[2])
    if (!c) continue
    const at = m.index + m[0].lastIndexOf(m[2])
    out.push({
      file: file.rel,
      source: 'svg',
      valueType: 'colour',
      kind: 'glyph',
      prop: m[1],
      start: at,
      end: at + m[2].length,
      text: m[2],
      hex: c.hex,
      alpha: c.alpha,
      selector: '',
      scheme: 'light',
      line: line(at),
      lineText: lineOf(text, at)
    })
  }
  for (const m of text.matchAll(
    /\b(color|background|backgroundColor|borderColor|fill|stroke)\s*:\s*["'](#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?)\([^)"']*\))["']/g
  )) {
    const c = parseColour(m[2])
    if (!c) continue
    const at = m.index + m[0].lastIndexOf(m[2])
    const prop = m[1].replace(/[A-Z]/g, (x) => `-${x.toLowerCase()}`)
    out.push({
      file: file.rel,
      source: 'jsx-style',
      valueType: 'colour',
      kind: kindOf(prop) ?? 'glyph',
      prop,
      start: at,
      end: at + m[2].length,
      text: m[2],
      hex: c.hex,
      alpha: c.alpha,
      selector: '',
      scheme: 'light',
      line: line(at),
      lineText: lineOf(text, at)
    })
  }
  return out
}

const lineOf = (text, at) =>
  text.slice(text.lastIndexOf('\n', at - 1) + 1, (text.indexOf('\n', at) + 1 || text.length + 1) - 1)
