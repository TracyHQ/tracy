/**
 * The missing side of light of a one-mode design system (research
 * `tasks/nghien-cuu-design-system-readiness-sinh-che-do-sang-toi.md` §3, Akemi 12/10/2026: a template
 * with a light/dark switch keeps both under a system). PURE. Keeps the system's accent, type, shape
 * and spacing; rebuilds the neutrals from the system's own near-black and near-white; moves the
 * accent only as far as contrast needs. Every derived colour says so (`s: 'derived'`).
 */
import { contrast, distance, luminance, mix, parseHex, readableOn } from './colour.mjs'

const L = (/** @type {string} */ h) => luminance(parseHex(h) ?? { r: 128, g: 128, b: 128 })
const sat = (/** @type {string} */ h) => {
  const c = parseHex(h)
  if (!c) return 0
  const m = Math.max(c.r, c.g, c.b)
  return m === 0 ? 0 : (m - Math.min(c.r, c.g, c.b)) / 255
}
const val = (f) => (f && f.s !== 'empty' && typeof f.v === 'string' && parseHex(f.v) ? f.v : null)

/** The side of light a profile is on, from its page colour. */
export const modeOf = (profile) => (L(val(profile.colors?.bg) ?? '#ffffff') < 0.3 ? 'dark' : 'light')

/** Every strict hex the system itself names. */
const ownColours = (profile) => [
  ...new Set(
    Object.values(profile.colors ?? {})
      .map(val)
      .filter(Boolean)
      .map((h) => h.toLowerCase())
  )
]

/** Move `c` toward `toward` in 2% steps until it reaches `min`:1 on `ground`. */
function nudge(c, ground, toward, min) {
  if ((contrast(c, ground) ?? 0) >= min) return { v: c, t: 0 }
  for (let t = 0.02; t <= 1.0001; t += 0.02) {
    const x = mix(c, toward, t)
    if ((contrast(x, ground) ?? 0) >= min) return { v: x, t }
  }
  return { v: toward, t: 1 }
}

/** Pull a colour to a target luminance by mixing toward black or white, keeping its hue. */
function toLum(c, target) {
  const toward = L(c) > target ? '#000000' : '#ffffff'
  let best = c
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const x = mix(c, toward, t)
    best = x
    if (toward === '#000000' ? L(x) <= target : L(x) >= target) break
  }
  return best
}

/** The alpha of a CSS colour token (rgb/rgba/hsl/hsla/hex); 1 when it states none. */
function alphaOf(token) {
  const fn = /^(?:rgba?|hsla?)\(([^)]*)\)$/i.exec(token)
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 4) return 1
    const a = parts[3]
    return a.endsWith('%') ? Number.parseFloat(a) / 100 : Number.parseFloat(a)
  }
  const hex = /^#([0-9a-f]{4}|[0-9a-f]{8})$/i.exec(token)
  if (hex) {
    const h = hex[1]
    return Number.parseInt(h.length === 4 ? h[3] + h[3] : h.slice(6), 16) / 255
  }
  return 1
}

const COLOUR_TOKEN = /(?:rgba?|hsla?)\([^)]*\)|#[0-9a-f]{3,8}\b/gi

/**
 * A card shadow the system states for its own side, rewritten for the derived side. Copied as it is,
 * a light system's dark-ink shadow (Mailchimp's rgba(35,30,21,.15)) vanished on the derived dark page
 * and, since the slot's card rule replaces the template's own box-shadow, took away the template's
 * 0 0 0 1px border ring with it: Tracy Base WP's pricing cards blended into the page (15/10/2026).
 * So the derived side's shadow is led by a 1 px ring in the derived side's border colour (at least
 * 1.3:1 on its page), and on a dark side the shadow's colours become black at the stated alpha or
 * more, so the depth still reads. The shape (offsets, blur, spread) is the system's.
 */
function shadowFor(shadow, target, bg, fg, border) {
  if (typeof shadow !== 'string' || !shadow.trim()) return shadow
  const ring = nudge(border, bg, fg, 1.3).v
  const body =
    target === 'dark'
      ? shadow.replace(COLOUR_TOKEN, (tok) => {
          const a = Math.min(1, Math.max(0.4, alphaOf(tok) || 0))
          return `rgba(0,0,0,${Math.round(a * 100) / 100})`
        })
      : shadow
  return `0 0 0 1px ${ring}, ${body}`
}

/**
 * The profile of the other side.
 * @param {any} profile a `tracy-ds-profile/v1` in its own (source) mode
 * @param {'light' | 'dark'} target
 * @returns {{ profile: any, notes: string[] }}
 */
export function derive(profile, target) {
  const c = profile.colors
  const own = ownColours(profile)
  const bg0 = val(c.bg) ?? '#ffffff'
  const fg0 = val(c.fg) ?? '#111111'
  const acc0 = val(c.accent) ?? fg0
  /** @type {string[]} */
  const notes = []
  let bg
  let fg
  if (target === 'dark') {
    // ground: the system's own darkest neutral (its ink), lifted off pure black so it is not a void,
    // tinted with the hue of the light page's paper
    const darks = own.filter((h) => L(h) < 0.03 && sat(h) < 0.35).sort((a, b) => L(a) - L(b))
    const ink = L(fg0) < 0.03 ? fg0 : (darks[darks.length - 1] ?? '#121212')
    bg = L(ink) < 0.0065 ? toLum(mix(ink, bg0, 0.06), 0.0065) : ink
    notes.push(
      `dark ground = ${ink === fg0 ? "the system's text colour" : 'darkest own colour'} ${ink}${bg !== ink ? ` lifted to ${bg}` : ''}`
    )
    // text: the light page's paper (cream stays cream), softened when it is pure white
    fg = bg0.toLowerCase() === '#ffffff' ? mix('#ffffff', bg, 0.07) : bg0
    if (L(fg) < 0.75) fg = own.filter((h) => L(h) > 0.8).sort((a, b) => L(b) - L(a))[0] ?? '#f2f2f2'
    notes.push(`text = old ground ${bg0}${fg !== bg0 ? ` -> ${fg}` : ''}`)
  } else {
    // ground: the dark system's text colour when it is near-white, else its lightest own colour
    const lights = own.filter((h) => L(h) > 0.82).sort((a, b) => L(b) - L(a))
    const paper = L(fg0) > 0.82 ? fg0 : (lights[0] ?? '#fafafa')
    bg = paper
    notes.push(
      `light ground = ${paper === fg0 ? "the system's text colour" : 'lightest own colour'} ${paper}`
    )
    // text: the dark page itself (a deep purple stays purple), if it reads 7:1
    fg = bg0
    if ((contrast(fg, bg) ?? 0) < 7) fg = toLum(bg0, 0.012)
    notes.push(`text = old ground ${bg0}${fg !== bg0 ? ` -> ${fg}` : ''}`)
  }
  const surface = mix(bg, fg, target === 'dark' ? 0.06 : 0.04)
  const border = mix(bg, fg, target === 'dark' ? 0.18 : 0.14)
  const muted = mix(fg, bg, 0.38)
  // accent: a neutral accent near the old text or paper is the "ink" role: it follows the new text
  let accent = acc0
  let accentOn
  const inkAccent = sat(acc0) < 0.12 && distance(acc0, fg0) < 48
  const paperAccent = sat(acc0) < 0.12 && distance(acc0, bg0) < 48
  if (inkAccent || paperAccent) {
    accent = fg
    accentOn = bg
    notes.push(`neutral accent ${acc0} follows the text role -> ${accent}`)
  } else {
    // a fill must stand out 3:1 on the new ground (WCAG non-text); move toward the new text colour
    const n = nudge(acc0, bg, fg, 3)
    accent = n.v
    if (n.t)
      notes.push(`accent ${acc0} shifted ${Math.round(n.t * 100)}% -> ${accent} (3:1 on the new ground)`)
    else notes.push(`accent kept ${acc0}`)
    const on0 = val(c.accentOn)
    accentOn = on0 && (contrast(on0, accent) ?? 0) >= 4.5 ? on0 : readableOn(accent)
  }
  const d = (v, f) => ({ v, s: 'derived', f: `derive:${target}:${f}` })
  const out = structuredClone(profile)
  out.colors = {
    bg: d(bg, 'bg'),
    fg: d(fg, 'fg'),
    accent: d(accent, 'accent'),
    accentOn: d(accentOn, 'accentOn'),
    surface: d(surface, 'surface'),
    border: d(border, 'border'),
    muted: d(muted, 'muted')
  }
  // the side-bound extras (second text, meta text, soft line, pressed accent: emit.mjs palette) were
  // read off the system's own side; kept, the derived side painted its meta text in the light side's
  // grey (JA Kinetic's footer under BMW's derived dark side, 4.28:1, 14/10/2026). The palette
  // rebuilds each from the derived colours
  delete out.extraColours
  if (out.type?.card?.shadow) {
    out.type.card.shadow = shadowFor(out.type.card.shadow, target, bg, fg, border)
    notes.push(`card shadow -> ${out.type.card.shadow}`)
  }
  out.mode = { v: target, s: 'derived', f: `derive:${target}` }
  out.derivedFrom = modeOf(profile)
  return { profile: out, notes }
}

/**
 * The contrast gate of a profile as a template paints it (the research's `check`): body and muted
 * text on the ground and the surface, accent text on the ground, the accent fill 3:1, its text 4.5:1.
 * @param {any} profile
 * @param {{ palette: (p: any) => any, readableText: (p: any) => { colours: Record<string, string> } }} emit the emitter's palette and readableText
 */
export function checkDerived(profile, emit) {
  const p = emit.palette(profile)
  const t = emit.readableText(p).colours
  const fin = {
    bg: p.bg,
    fg: p.fg,
    surface: t['--color-surface'] ?? p.surface,
    muted: t['--color-fg-muted'] ?? p.muted,
    accent: p.accent,
    accentOn: p.accentOn,
    accentText: t['--ds-accent-text'] ?? p.accent
  }
  const r = (a, b) => Math.round((contrast(a, b) ?? 0) * 100) / 100
  const tests = [
    ['body text / ground', r(fin.fg, fin.bg), 4.5],
    ['body text / surface', r(fin.fg, fin.surface), 4.5],
    ['muted text / ground', r(fin.muted, fin.bg), 4.5],
    ['accent text / ground', r(fin.accentText, fin.bg), 4.5],
    ['accent fill / ground', r(fin.accent, fin.bg), 3],
    ['text on accent', r(fin.accentOn, fin.accent), 4.5]
  ].map(([k, v, min]) => ({ k, v, min, ok: v >= min }))
  return { fin, tests, ok: tests.every((x) => x.ok) }
}
