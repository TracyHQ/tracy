/**
 * A WordPress block theme's `theme.json` (and its style variations, `styles/*.json`) as the same
 * declarations a stylesheet gives (`css-lexer.mjs`), so its palette, fonts, corners and element/block
 * styles are classified and rewritten like CSS: each value's offsets point inside its JSON string, and
 * a rewrite (`var(--ds-c-bg, #ffffff)`) is still a valid JSON string that WordPress prints as CSS.
 * PURE.
 *
 *   settings.color.palette[]          → `--wp--preset--color--<slug>` (the colour role of the preset)
 *   settings.typography.fontFamilies[] → `--wp--preset--font-family--<slug>`, read as a body or display
 *                                        face from where `styles` uses it
 *   settings.custom.*                 → `--wp--custom--<path>` (radius and colour tokens)
 *   styles (root, elements, blocks, variations, :hover…) → color.text/background, border.color/radius,
 *                                        typography.fontFamily, outline.color, shadow, and `css`
 * Gradients, duotone, spacing and layout are not roles and are not read.
 */
import { declarationsOf } from './css-lexer.mjs'

const ELEMENT = {
  link: 'a',
  button: '.wp-element-button button',
  heading: 'h1, h2, h3, h4, h5, h6',
  caption: 'figcaption caption',
  cite: 'cite'
}
const kebab = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()

/** @param {string} text @returns {import('./css-lexer.mjs').Declaration[]} */
export function themeJsonDeclarations(text) {
  let doc
  try {
    doc = parse(text, skip(text, 0)).node
  } catch {
    return []
  }
  if (doc?.type !== 'object' || !(get(doc, 'settings') || get(doc, 'styles'))) return []
  const out = []
  let rule = 0
  const decl = (prop, node, selector, r) => {
    if (node?.type !== 'string' || !node.raw.trim()) return
    out.push({
      prop,
      value: node.raw,
      start: node.start,
      end: node.end,
      selector,
      atRules: [],
      scheme: 'light',
      rule: r
    })
  }
  const settings = get(doc, 'settings')
  for (const p of items(get(get(settings, 'color'), 'palette')))
    decl(`--wp--preset--color--${str(get(p, 'slug'))}`, get(p, 'color'), ':root', ++rule)
  const fonts = items(get(get(settings, 'typography'), 'fontFamilies'))
  const custom = (node, path) => {
    if (node?.type === 'object') for (const e of node.entries) custom(e.value, [...path, kebab(e.key)])
    else decl(`--wp--custom--${path.join('--')}`, node, ':root', ++rule)
  }
  custom(get(settings, 'custom'), [])
  const styleDecls = []
  const style = (node, selector) => {
    if (node?.type !== 'object') return
    const r = ++rule
    const push = (prop, v) => {
      const before = out.length
      decl(prop, v, selector, r)
      if (out.length > before) styleDecls.push(out[out.length - 1])
    }
    const color = get(node, 'color')
    push('background-color', get(color, 'background'))
    push('color', get(color, 'text'))
    const border = get(node, 'border')
    push('border-color', get(border, 'color'))
    const radius = get(border, 'radius')
    if (radius?.type === 'object')
      for (const e of radius.entries) push(`border-${kebab(e.key)}-radius`, e.value)
    else push('border-radius', radius)
    for (const side of ['top', 'right', 'bottom', 'left'])
      push(`border-${side}-color`, get(get(border, side), 'color'))
    push('outline-color', get(get(node, 'outline'), 'color'))
    push('font-family', get(get(node, 'typography'), 'fontFamily'))
    push('box-shadow', get(node, 'shadow'))
    const css = get(node, 'css')
    if (css?.type === 'string') out.push(...cssStringDeclarations(css, selector))
    for (const e of get(node, 'elements')?.entries ?? []) {
      const el = ELEMENT[e.key] ?? e.key
      style(e.value, selector === 'body' ? el : `${selector} ${el}`)
    }
    for (const e of get(node, 'blocks')?.entries ?? [])
      style(e.value, `.wp-block-${e.key.replace(/^core\//, '').replace('/', '-')}`)
    for (const e of get(node, 'variations')?.entries ?? []) style(e.value, `${selector}.is-style-${e.key}`)
    for (const e of node.entries) if (e.key.startsWith(':')) style(e.value, `${selector}${e.key}`)
  }
  style(get(doc, 'styles'), 'body')
  // a font preset is the body face when the root style reads it, a display face when only headings do
  for (const f of fonts) {
    const slug = str(get(f, 'slug'))
    const readers = styleDecls.filter(
      (d) => d.prop === 'font-family' && new RegExp(`font-family(\\||--)${slug}\\b`).test(d.value)
    )
    const selector = readers.some((d) => d.selector === 'body')
      ? 'body'
      : readers.length && readers.every((d) => /^h[1-6]\b|heading/.test(d.selector))
        ? 'h1'
        : ':root'
    decl(`--wp--preset--font-family--${slug}`, get(f, 'fontFamily'), selector, ++rule)
  }
  return out
}

/**
 * The declarations of a `css` string: lexed on the DECODED string (`\n`, `\"` are a newline and a
 * quote to CSS; on the raw JSON text every rule after the first escape was lost), each mapped back to
 * its raw offsets, with the raw value, so a rewrite stays a valid JSON string.
 */
function cssStringDeclarations(css, selector) {
  let decoded = ''
  const at = []
  for (let i = 0; i < css.raw.length; i++) {
    at.push(i)
    if (css.raw[i] !== '\\') {
      decoded += css.raw[i]
      continue
    }
    const e = css.raw[i + 1]
    if (e === 'u') {
      decoded += String.fromCharCode(Number.parseInt(css.raw.slice(i + 2, i + 6), 16))
      i += 5
    } else {
      decoded += { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }[e] ?? e
      i += 1
    }
  }
  at.push(css.raw.length)
  return declarationsOf(decoded).map((d) => {
    const start = css.start + at[d.start]
    const end = css.start + at[d.end]
    return {
      ...d,
      start,
      end,
      value: css.raw.slice(start - css.start, end - css.start),
      selector: d.selector ? d.selector.replace(/&/g, selector) : selector
    }
  })
}

const get = (node, key) =>
  node?.type === 'object' ? node.entries.find((e) => e.key === key)?.value : undefined
const items = (node) => (node?.type === 'array' ? node.items : [])
const str = (node) => (node?.type === 'string' ? JSON.parse(`"${node.raw}"`) : '')

/** A JSON value at `i` with the offsets of every string's content (between its quotes). */
function parse(s, i) {
  const ch = s[i]
  if (ch === '{') {
    const entries = []
    i = skip(s, i + 1)
    while (s[i] !== '}') {
      const k = parse(s, i)
      i = skip(s, k.end)
      if (s[i] !== ':') throw new Error(`expected : at ${i}`)
      const v = parse(s, skip(s, i + 1))
      entries.push({ key: JSON.parse(`"${k.node.raw}"`), value: v.node })
      i = skip(s, v.end)
      if (s[i] === ',') i = skip(s, i + 1)
      else if (s[i] !== '}') throw new Error(`expected , or } at ${i}`)
    }
    return { node: { type: 'object', entries }, end: i + 1 }
  }
  if (ch === '[') {
    const list = []
    i = skip(s, i + 1)
    while (s[i] !== ']') {
      const v = parse(s, i)
      list.push(v.node)
      i = skip(s, v.end)
      if (s[i] === ',') i = skip(s, i + 1)
      else if (s[i] !== ']') throw new Error(`expected , or ] at ${i}`)
    }
    return { node: { type: 'array', items: list }, end: i + 1 }
  }
  if (ch === '"') {
    let j = i + 1
    while (j < s.length && s[j] !== '"') j += s[j] === '\\' ? 2 : 1
    if (j >= s.length) throw new Error('unterminated string')
    return { node: { type: 'string', raw: s.slice(i + 1, j), start: i + 1, end: j }, end: j + 1 }
  }
  const lit = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(s.slice(i, i + 40))
  if (!lit) throw new Error(`unexpected ${ch} at ${i}`)
  return { node: { type: 'literal' }, end: i + lit[0].length }
}

function skip(s, i) {
  while (i < s.length && /\s/.test(s[i])) i++
  return i
}
