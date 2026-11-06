// The overlay a template's own CSS paints over a picture's container (ADR 0043 section 3e): a `::before` or `::after`
// of the container that covers it (absolute, inset 0 or top/left 0 at full size) with a colour or a gradient as its
// background, or a `filter: brightness()` on the container or its img. Only rules that hold whatever the page is: a
// selector whose subject is the container (its classes, no state like :hover) and whose other parts are the
// container's ancestors inside the module, outside @media or in a min-width query a 1440 wide page meets. A rule that
// needs anything else (a body class, a theme attribute, a wrapper the module does not print) is left out, never
// assumed. Strength: the overlay's alpha (times its opacity); a gradient counts its clearest stop, so a fade that
// leaves part of the picture bare never counts as a dark cover. Pure: CSS text in, plain objects out.
import { generate, parse, walk } from 'css-tree'

const PAGE_WIDTH = 1440
const PSEUDO = /::?(before|after)$/i

const round = (n) => Math.round(n * 1000) / 1000

/** Every style rule of a stylesheet that applies at 1440: { selectors, decls: Map, order }. */
export function rulesOf(cssText) {
  const out = []
  let ast
  try {
    ast = parse(String(cssText ?? ''), { parseValue: false, parseCustomProperty: false })
  } catch {
    return out
  }
  walk(ast, {
    visit: 'Rule',
    enter(node) {
      if (this.atrule && !appliesAtPage(this.atrule)) return
      const selectors = node.prelude?.children?.toArray?.().map((s) => generate(s).trim()) ?? []
      const decls = new Map()
      for (const d of node.block?.children?.toArray?.() ?? [])
        if (d.type === 'Declaration') decls.set(d.property.toLowerCase(), generate(d.value).trim())
      out.push({ selectors, decls, order: out.length })
    }
  })
  return out
}

function appliesAtPage(atrule) {
  if (atrule.name?.toLowerCase() !== 'media') return false
  const q = generate(atrule.prelude ?? '').toLowerCase()
  const parts = q
    .split(/\band\b/)
    .map((p) => p.trim())
    .filter((p) => p && p !== 'screen' && p !== 'all')
  return parts.every((p) => {
    const m = /^\(min-width:\s*([\d.]+)px\)$/.exec(p)
    return m && Number(m[1]) <= PAGE_WIDTH
  })
}

// "div.acm-cta.style-1" -> { tag, classes, other }: `other` holds anything that is not a tag or a class.
function compound(text) {
  const tag = /^([a-z][a-z0-9]*)/i.exec(text)?.[1]?.toLowerCase() ?? null
  const classes = [...text.matchAll(/\.([\w-]+)/g)].map((m) => m[1])
  const rest = text.replace(/^([a-z][a-z0-9]*|\*)/i, '').replace(/\.[\w-]+/g, '')
  return { tag, classes, other: rest.trim() }
}

const matches = (c, el) =>
  !c.other &&
  (!c.tag || c.tag === el.tag) &&
  c.classes.every((k) => el.classes.includes(k)) &&
  (c.tag || c.classes.length)

/**
 * Whether a selector targets `el` (optionally its ::before or ::after), with every other part one of its ancestors in
 * order. Returns the pseudo-element ('before', 'after', '') or null.
 */
export function selectorTargets(selector, el, ancestors) {
  if (/[+~]/.test(selector)) return null
  const parts = selector
    .replace(/\s*>\s*/g, ' ')
    .trim()
    .split(/\s+/)
  let subject = parts.pop() ?? ''
  const pseudo = PSEUDO.exec(subject)?.[1]?.toLowerCase() ?? ''
  subject = subject.replace(PSEUDO, '')
  if (!matches(compound(subject), el)) return null
  let at = ancestors.length - 1
  for (let i = parts.length - 1; i >= 0; i--) {
    const c = compound(parts[i])
    while (at >= 0 && !matches(c, ancestors[at])) at--
    if (at < 0) return null
    at--
  }
  return pseudo
}

/** A CSS colour as { colour: "rgba(r,g,b,a)", alpha } or null; var() is read by its fallback. */
export function colourOf(value) {
  let v = String(value ?? '')
    .trim()
    .toLowerCase()
  const fallback = /^var\(\s*--[\w-]+\s*,\s*(.+)\)$/.exec(v)
  if (fallback) v = fallback[1].trim()
  if (v === 'transparent') return { colour: 'rgba(0,0,0,0)', alpha: 0 }
  if (v === 'black') return { colour: 'rgba(0,0,0,1)', alpha: 1 }
  if (v === 'white') return { colour: 'rgba(255,255,255,1)', alpha: 1 }
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1]
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
    const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16))
    const a = full.length === 8 ? round(Number.parseInt(full.slice(6, 8), 16) / 255) : 1
    return { colour: `rgba(${r},${g},${b},${a})`, alpha: a }
  }
  const fn = /^rgba?\(([^)]*)\)$/.exec(v)?.[1]
  if (!fn) return null
  const nums = fn.split(/[\s,/]+/).filter(Boolean)
  if (nums.length < 3) return null
  const [r, g, b] = nums.slice(0, 3).map((n) => Math.round(Number.parseFloat(n)))
  const raw = nums[3]
  const a = raw == null ? 1 : raw.endsWith('%') ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw)
  if (![r, g, b, a].every(Number.isFinite)) return null
  return { colour: `rgba(${r},${g},${b},${round(a)})`, alpha: round(a) }
}

// The paint of a background value: a colour, or a linear-gradient counted by its clearest stop.
function paintOf(value) {
  const v = String(value ?? '').trim()
  const grad = /^(?:-webkit-)?linear-gradient\((.*)\)$/i.exec(v)?.[1]
  if (grad) {
    const stops = [...grad.matchAll(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|transparent|black)/gi)].map((m) =>
      colourOf(m[1])
    )
    if (!stops.length || stops.some((s) => !s)) return null
    const clearest = stops.reduce((a, b) => (b.alpha < a.alpha ? b : a))
    return { colour: `linear-gradient(${grad})`, alpha: clearest.alpha }
  }
  // "rgba(0,0,0,.8) none repeat" or a bare colour
  const first = /^(rgba?\([^)]*\)|#[0-9a-f]{3,8}\b|var\([^)]*\)\)?|[a-z]+)/i.exec(v)?.[1]
  return first ? colourOf(first) : null
}

const isZero = (v) => /^0(px|%)?$/.test(String(v ?? '').trim())
const isFull = (v) => String(v ?? '').trim() === '100%'

function covers(d) {
  if (!/^(absolute|fixed)$/.test(d.get('position') ?? '')) return false
  if (d.has('inset')) return String(d.get('inset')).split(/\s+/).every(isZero)
  const horizontal = isZero(d.get('left')) && (isFull(d.get('width')) || isZero(d.get('right')))
  const vertical = isZero(d.get('top')) && (isFull(d.get('height')) || isZero(d.get('bottom')))
  return horizontal && vertical
}

/**
 * The overlay the template paints over a picture's container, or null when its CSS paints none.
 * @param {ReturnType<typeof rulesOf>} rules
 * @param {{ container: object, ancestors: object[], img: object | null }} el pictureElementIn's answer
 * @returns {null | { colour: string, strength: number, from: string }}
 */
export function overlayOver(rules, { container, ancestors, img }) {
  const found = []
  for (const pseudo of ['before', 'after']) {
    const d = new Map()
    const from = []
    for (const r of rules)
      for (const s of r.selectors)
        if (selectorTargets(s, container, ancestors) === pseudo) {
          for (const [k, v] of r.decls) d.set(k, v)
          from.push(s)
        }
    if (!from.length) continue
    const content = d.get('content')
    if (content == null || content === 'none' || !covers(d)) continue
    const paint = paintOf(d.get('background-color') ?? d.get('background') ?? d.get('background-image'))
    if (!paint) continue
    const opacity = d.has('opacity') ? Number.parseFloat(d.get('opacity')) : 1
    const strength = round(paint.alpha * (Number.isFinite(opacity) ? opacity : 1))
    if (strength > 0) found.push({ colour: paint.colour, strength, from: from.join(', ') })
  }
  // A brightness filter on the container or its img darkens the picture itself.
  for (const [el, anc] of [[container, ancestors], ...(img ? [[img, [...ancestors, container]]] : [])]) {
    let filter = null
    let from = null
    for (const r of rules)
      for (const s of r.selectors)
        if (selectorTargets(s, el, anc) === '' && r.decls.has('filter')) {
          filter = r.decls.get('filter')
          from = s
        }
    const b = /brightness\(\s*([\d.]+)(%?)\s*\)/i.exec(filter ?? '')
    if (b) {
      const level = b[2] ? Number(b[1]) / 100 : Number(b[1])
      if (level < 1) found.push({ colour: 'rgba(0,0,0,1)', strength: round(1 - level), from })
    }
  }
  if (!found.length) return null
  return found.reduce((a, b) => (b.strength > a.strength ? b : a))
}
