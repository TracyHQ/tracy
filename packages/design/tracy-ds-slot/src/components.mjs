/**
 * What an OpenDesign system says its components look like, read off its own reference page
 * (`components.html`, the fixture every system of the library ships): its display line (h1), section
 * heading (h2), card title (h3), body, eyebrow, primary button, card and field — size, weight, case,
 * letter spacing, line height, radius, padding, shadow.
 *
 * `tokens.css` carries 56 tokens and no weight, case or button shape, so until 12/10/2026 a worn
 * OpenDesign system changed a site's colours and font names and left every one of these the
 * template's: BMW's 60px light upper-case display, its square 14×24 buttons and its 12px
 * spaced-out eyebrows never reached a page (the ask: "really apply every design in
 * the design system"). The fixture states them, in 151 of the 152 systems the same way (`h1`,
 * `h2`, `h3`, `.btn`, `.btn-primary`, `.eyebrow`, `body`; `.card` in 60, `input` in 85).
 *
 * PURE: the page's text and the system's tokens in, plain values out. Only rules at the top level
 * are read (a phone `@media` override is not the component); `var(--x)` resolves through the tokens;
 * a value that is not a plain length, weight or keyword stays out — never guessed.
 */

/** The page's CSS: every <style>, comments out, `@media`/`@supports` blocks (and their rules) out. */
export function topLevelCss(html) {
  const css = [...String(html ?? '').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  let out = ''
  let i = 0
  while (i < css.length) {
    if (css[i] === '@') {
      const open = css.indexOf('{', i)
      const semi = css.indexOf(';', i)
      if (semi !== -1 && (open === -1 || semi < open)) {
        i = semi + 1
        continue
      }
      if (open === -1) break
      let depth = 1
      let j = open + 1
      for (; j < css.length && depth > 0; j++) {
        if (css[j] === '{') depth++
        else if (css[j] === '}') depth--
      }
      i = j
      continue
    }
    out += css[i]
    i++
  }
  return out
}

/** [selector list, declarations] of every top-level rule, in order. */
export function rulesOf(css) {
  const out = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1]
      .split(',')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
    const decls = {}
    for (const d of m[2].split(';')) {
      const at = d.indexOf(':')
      if (at === -1) continue
      const k = d.slice(0, at).trim().toLowerCase()
      const v = d.slice(at + 1).trim()
      if (k && v) decls[k] = v
    }
    out.push([selectors, decls])
  }
  return out
}

/** `var(--x, fallback)` resolved through the tokens, nested up to four levels. */
export function resolve(value, tokens) {
  let v = String(value ?? '')
  for (let n = 0; n < 4 && /var\(/.test(v); n++)
    v = v.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)/g, (_, name, fb) =>
      tokens[name] !== undefined ? String(tokens[name]) : (fb ?? '')
    )
  return v.replace(/\s*!important\s*$/i, '').trim()
}

/** A length in px: `14px`, `0.875rem` (16px root), `0`. Null for anything else. */
export function lengthPx(v, em = 16) {
  const s = String(v ?? '').trim()
  if (s === '0') return 0
  const m = /^(-?\d*\.?\d+)(px|rem|em)$/i.exec(s)
  if (!m) return null
  const n = Number(m[1])
  return (
    Math.round((m[2].toLowerCase() === 'px' ? n : n * (m[2].toLowerCase() === 'rem' ? 16 : em)) * 100) / 100
  )
}

const WEIGHTS = { normal: 400, bold: 700, lighter: 300, bolder: 700 }
const weightOf = (v) => {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  // a variable face's weight is any number of 1–1000 (Linear: 510, 590)
  if (/^\d{1,4}$/.test(s) && Number(s) >= 1 && Number(s) <= 1000) return Number(s)
  return WEIGHTS[s] ?? null
}
const caseOf = (v) => {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  return ['uppercase', 'lowercase', 'capitalize', 'none'].includes(s) ? s : null
}
/** Letter spacing as written when it is a plain length (`0.12em`, `-0.5px`, `0`); `normal` is 0. */
const trackingOf = (v) => {
  const s = String(v ?? '')
    .trim()
    .toLowerCase()
  if (s === 'normal' || s === '0') return '0'
  return /^-?\d*\.?\d+(em|px|rem)$/.test(s) ? s : null
}
/** Line height as a ratio of `size`: unitless, `%`, or a length. */
const leadingOf = (v, size) => {
  const s = String(v ?? '').trim()
  if (/^\d*\.?\d+$/.test(s)) return Number(s)
  if (/^\d*\.?\d+%$/.test(s)) return Number(s.slice(0, -1)) / 100
  const p = lengthPx(s, size ?? 16)
  return p !== null && size ? Math.round((p / size) * 100) / 100 : null
}
/** Padding as {y, x} px, from a one-, two-, three- or four-value shorthand. */
const paddingOf = (v, em) => {
  const parts = String(v ?? '')
    .trim()
    .split(/\s+/)
    .map((x) => lengthPx(x, em))
  if (!parts.length || parts.some((x) => x === null)) return null
  const [t, r = t, b = t] = parts
  return { y: Math.round((t + b) / 2), x: r }
}
/** A shadow that is drawn (not `none`) and is plain CSS (no url, no braces). */
const shadowOf = (v) => {
  const s = String(v ?? '').trim()
  if (!s || s === 'none' || /url\(|[{};<>\\]/.test(s)) return s === 'none' ? 'none' : null
  return s.replace(/\s+/g, ' ')
}
/** Which of the system's two faces a rule names: `display`, `body`, or null for anything else. */
const faceOf = (raw) => {
  const s = String(raw ?? '')
  if (/var\(\s*--font-display/.test(s)) return 'display'
  if (/var\(\s*--font-body/.test(s)) return 'body'
  return null
}

/**
 * The components of one system.
 * @param {string} html  its components.html
 * @param {Record<string, string>} tokens  its tokens (tokensOf(tokens.css))
 */
export function componentsOf(html, tokens) {
  const rules = rulesOf(topLevelCss(html))
  /** Every declaration for `sel`, later rules over earlier, raw (var() kept) and resolved. */
  const of = (sel) => {
    const raw = {}
    for (const [list, decls] of rules) if (list.includes(sel)) Object.assign(raw, decls)
    const out = {}
    for (const [k, v] of Object.entries(raw)) out[k] = resolve(v, tokens)
    return { raw, v: out }
  }
  const base = lengthPx(resolve(tokens['--text-base'] ?? '16px', tokens)) ?? 16
  const text = (sel, inherit = {}) => {
    const { raw, v } = of(sel)
    if (!Object.keys(v).length) return null
    const size = lengthPx(v['font-size'], base) ?? inherit.size ?? null
    return {
      size,
      weight: weightOf(v['font-weight']),
      transform: caseOf(v['text-transform']),
      tracking: trackingOf(v['letter-spacing']),
      leading: leadingOf(v['line-height'] ?? inherit.lineHeight, size),
      face: faceOf(raw['font-family']) ?? inherit.face ?? null
    }
  }
  // h1, h2 and h3 share a rule in most fixtures (`h1, h2, h3 { font-family; line-height }`): the shared
  // face and line height are each heading's unless its own rule says otherwise
  const shared = of('h2')
  const inherit = {
    face: faceOf(shared.raw['font-family']),
    lineHeight: shared.v['line-height']
  }
  const btn = of('.btn')
  const primary = of('.btn-primary')
  const bodyRule = of('body')
  const button = (() => {
    const v = { ...btn.v, ...primary.v }
    if (!Object.keys(v).length) return null
    const size = lengthPx(v['font-size'], base) ?? base
    return {
      size: lengthPx(v['font-size'], base),
      weight: weightOf(v['font-weight']),
      transform: caseOf(v['text-transform']),
      tracking: trackingOf(v['letter-spacing']),
      radius: lengthPx(v['border-radius'], size),
      pad: paddingOf(v.padding, size),
      // the label's line height, the button's own or the body's it inherits on the reference page:
      // with the padding it makes the button's height (JA Mood's 30px line under BMW's 14px padding
      // made a 60px button that broke its phone header, 13/10/2026)
      leading: leadingOf(v['line-height'] ?? bodyRule.v['line-height'], size)
    }
  })()
  const card = (() => {
    const { v } = of('.card')
    if (!Object.keys(v).length) return null
    return {
      radius: lengthPx(v['border-radius']),
      pad: paddingOf(v.padding),
      shadow: shadowOf(v['box-shadow'])
    }
  })()
  const field = (() => {
    const { v } = rules
      .filter(([list]) => list.some((s) => /^input(\b|$)|^\.input$|^\.field$/.test(s)))
      .reduce(
        (acc, [, d]) => ({
          v: { ...acc.v, ...Object.fromEntries(Object.entries(d).map(([k, x]) => [k, resolve(x, tokens)])) }
        }),
        { v: {} }
      )
    if (!Object.keys(v).length) return null
    return { radius: lengthPx(v['border-radius']) }
  })()
  const eyebrow = text('.eyebrow')
  const body = (() => {
    const { v } = of('body')
    if (!Object.keys(v).length) return null
    const size = lengthPx(v['font-size'], 16)
    return { size, weight: weightOf(v['font-weight']), leading: leadingOf(v['line-height'], size) }
  })()
  return {
    display: text('h1', inherit),
    heading: text('h2', inherit),
    subheading: text('h3', inherit),
    body,
    eyebrow,
    button,
    card,
    field
  }
}
